package com.mavis.platform.auth.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.UserOtp;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserOtpRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.platform.auth.dto.AuthResponse;
import com.mavis.platform.auth.dto.GoogleLoginRequest;
import com.mavis.platform.auth.dto.LoginRequest;
import com.mavis.platform.auth.dto.RegisterRequest;
import com.mavis.platform.auth.dto.RegisterResponse;
import com.mavis.platform.auth.dto.VerifyEmailRequest;
import com.mavis.platform.auth.service.AuthService;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.security.jwt.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserOtpRepository userOtpRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;

    @Value("${app.google.client-id:}")
    private String googleClientId;

    @Override
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Email is already in use");
        }

        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Role STUDENT not found"));

        User user = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(studentRole)
                .status("PENDING_VERIFICATION") // Yêu cầu xác thực Email
                .build();

        userRepository.save(user);

        // Tạo mã OTP 6 số
        String otpCode = String.format("%06d", new Random().nextInt(999999));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("EMAIL_VERIFICATION")
                .expiryTime(LocalDateTime.now().plusMinutes(5)) // Hết hạn sau 5 phút
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Gửi email bất đồng bộ
        emailService.sendOtpEmail(user.getEmail(), otpCode, "EMAIL_VERIFICATION");

        return RegisterResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .role(user.getRole().getCode())
                .build();
    }

    @Override
    @Transactional
    public void verifyEmail(VerifyEmailRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với email này"));

        if ("ACTIVE".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Tài khoản đã được xác thực trước đó");
        }

        UserOtp userOtp = userOtpRepository.findFirstByUserAndOtpCodeAndIsUsedFalseOrderByCreatedAtDesc(user, request.getOtpCode())
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "Mã OTP không hợp lệ hoặc đã được sử dụng"));

        if (userOtp.getExpiryTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Mã OTP đã hết hạn");
        }

        // Cập nhật trạng thái
        userOtp.setUsed(true);
        userOtpRepository.save(userOtp);

        user.setStatus("ACTIVE");
        userRepository.save(user);
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Sai email hoặc mật khẩu"));

        if ("PENDING_VERIFICATION".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Vui lòng xác thực Email trước khi đăng nhập");
        }

        if ("LOCKED".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Tài khoản của bạn đã bị khóa");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Sai email hoặc mật khẩu");
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole().getCode());

        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .role(user.getRole().getCode())
                .build();
    }

    @Override
    @Transactional
    public AuthResponse googleLogin(GoogleLoginRequest request) {
        if (googleClientId == null || googleClientId.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Hệ thống chưa được cấu hình Google Login");
        }

        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idToken = verifier.verify(request.getIdToken());
            if (idToken == null) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED, "Google ID Token không hợp lệ");
            }

            GoogleIdToken.Payload payload = idToken.getPayload();
            String email = payload.getEmail();
            String name = (String) payload.get("name");

            // Kiểm tra user có tồn tại chưa
            Optional<User> optionalUser = userRepository.findByEmail(email);
            User user;

            if (optionalUser.isPresent()) {
                user = optionalUser.get();
                if ("LOCKED".equals(user.getStatus())) {
                    throw new BusinessException(ErrorCode.FORBIDDEN, "Tài khoản của bạn đã bị khóa");
                }
                // Có thể update status thành ACTIVE nếu trước đó PENDING_VERIFICATION vì Google đã verify mail
                if ("PENDING_VERIFICATION".equals(user.getStatus())) {
                    user.setStatus("ACTIVE");
                    userRepository.save(user);
                }
            } else {
                // Tạo mới tài khoản (Tự động Active)
                Role studentRole = roleRepository.findByCode("STUDENT")
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Role STUDENT not found"));

                user = User.builder()
                        .email(email)
                        .fullName(name)
                        // Bỏ trống hoặc gen pass ngẫu nhiên vì login bằng Google
                        .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                        .role(studentRole)
                        .status("ACTIVE")
                        .build();
                userRepository.save(user);
            }

            String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole().getCode());

            return AuthResponse.builder()
                    .token(token)
                    .userId(user.getId())
                    .email(user.getEmail())
                    .fullName(user.getFullName())
                    .role(user.getRole().getCode())
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google login failed", e);
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Lỗi xác thực với Google");
        }
    }

    @Override
    @Transactional
    public void forgotPassword(com.mavis.platform.auth.dto.ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với email này"));

        if (!"ACTIVE".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Tài khoản chưa được kích hoạt hoặc đã bị khóa");
        }

        // Generate OTP
        String otpCode = String.format("%06d", new Random().nextInt(999999));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("PASSWORD_RESET")
                .expiryTime(LocalDateTime.now().plusMinutes(5))
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Send email
        emailService.sendOtpEmail(user.getEmail(), otpCode, "PASSWORD_RESET");
    }

    @Override
    @Transactional
    public void resetPassword(com.mavis.platform.auth.dto.ResetPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với email này"));

        UserOtp userOtp = userOtpRepository.findFirstByUserAndOtpCodeAndIsUsedFalseOrderByCreatedAtDesc(user, request.getOtpCode())
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "Mã OTP không hợp lệ hoặc đã được sử dụng"));

        if (!"PASSWORD_RESET".equals(userOtp.getPurpose())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Mã OTP không dùng để reset mật khẩu");
        }

        if (userOtp.getExpiryTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Mã OTP đã hết hạn");
        }

        userOtp.setUsed(true);
        userOtpRepository.save(userOtp);

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void resendOtp(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với email này"));

        if ("ACTIVE".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Tài khoản đã được kích hoạt. Bạn có thể đăng nhập bình thường.");
        }

        if ("LOCKED".equals(user.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Tài khoản của bạn đã bị khóa.");
        }

        // Tạo OTP mới
        String otpCode = String.format("%06d", new Random().nextInt(999999));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("EMAIL_VERIFICATION")
                .expiryTime(LocalDateTime.now().plusMinutes(5)) // Hết hạn sau 5 phút
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Gửi email
        emailService.sendOtpEmail(user.getEmail(), otpCode, "EMAIL_VERIFICATION");
    }
}
