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
import com.mavis.common.exception.AuthException;
import com.mavis.common.exception.AuthErrorCode;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserOtpRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.platform.auth.dto.AuthResponse;
import com.mavis.platform.auth.dto.GithubLoginRequest;
import com.mavis.platform.auth.dto.GoogleLoginRequest;
import com.mavis.platform.auth.dto.LoginRequest;
import com.mavis.platform.auth.dto.RegisterRequest;
import com.mavis.platform.auth.dto.RegisterResponse;
import com.mavis.platform.auth.dto.VerifyEmailRequest;
import com.mavis.platform.auth.service.AuthService;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.auth.service.GithubOAuthClient;
import com.mavis.platform.security.jwt.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.Locale;
import java.util.Optional;
import java.security.SecureRandom;
import java.util.UUID;

@Service
@RequiredArgsConstructor(onConstructor_ = @Autowired)
@Slf4j
public class AuthServiceImpl implements AuthService {
    private static final SecureRandom OTP_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserOtpRepository userOtpRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;
    private final com.mavis.platform.security.jwt.RefreshSessionService refreshSessions;
    private final com.mavis.platform.auth.service.AuthAbuseGuard abuseGuard;
    private final GithubOAuthClient githubOAuthClient;

    public AuthServiceImpl(UserRepository users, RoleRepository roles, UserOtpRepository otps,
                           PasswordEncoder passwords, JwtUtil jwt, EmailService email) {
        this(users, roles, otps, passwords, jwt, email, null, null, null);
    }

    public AuthServiceImpl(UserRepository users, RoleRepository roles, UserOtpRepository otps,
                           PasswordEncoder passwords, JwtUtil jwt, EmailService email,
                           com.mavis.platform.security.jwt.RefreshSessionService refreshSessions,
                           com.mavis.platform.auth.service.AuthAbuseGuard abuseGuard) {
        this(users, roles, otps, passwords, jwt, email, refreshSessions, abuseGuard, null);
    }

    public AuthServiceImpl(UserRepository users, RoleRepository roles, UserOtpRepository otps,
                           PasswordEncoder passwords, JwtUtil jwt, EmailService email,
                           GithubOAuthClient githubOAuthClient) {
        this(users, roles, otps, passwords, jwt, email, null, null, githubOAuthClient);
    }

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
        String otpCode = String.format("%06d", OTP_RANDOM.nextInt(1_000_000));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("EMAIL_VERIFICATION")
                .expiryTime(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5)) // Hết hạn sau 5 phút
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Confirm SMTP acceptance before returning a successful registration.
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
        if (abuseGuard != null) abuseGuard.check("OTP_VERIFY", request.getEmail());
        User user = userRepository.findForUpdateByEmail(request.getEmail())
                .orElseThrow(() -> {
                    if (abuseGuard != null) abuseGuard.failure("OTP_VERIFY", request.getEmail());
                    return new AuthException(AuthErrorCode.AUTH_CODE_INVALID);
                });

        if (!"PENDING_VERIFICATION".equals(user.getStatus()) && !"ACTIVE".equals(user.getStatus()))
            throw new AuthException(AuthErrorCode.AUTH_VERIFICATION_UNAVAILABLE);

        UserOtp userOtp;
        try {
            userOtp = requireOtp(user, request.getOtpCode(), "EMAIL_VERIFICATION");
        } catch (AuthException ex) {
            if (abuseGuard != null) abuseGuard.failure("OTP_VERIFY", request.getEmail());
            throw ex;
        }
        if (!"PENDING_VERIFICATION".equals(user.getStatus()))
            throw new AuthException(AuthErrorCode.AUTH_VERIFICATION_UNAVAILABLE);

        // Cập nhật trạng thái
        userOtp.setUsed(true);
        userOtpRepository.save(userOtp);

        user.setStatus("ACTIVE");
        userRepository.save(user);
        if (abuseGuard != null) abuseGuard.success("OTP_VERIFY", request.getEmail(), user.getId());
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        if(abuseGuard!=null) abuseGuard.check("LOGIN",request.getEmail());
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {if(abuseGuard!=null)abuseGuard.failure("LOGIN",request.getEmail());return new AuthException(AuthErrorCode.LOGIN_CREDENTIALS);});

        // Verify credentials before disclosing verified/locked account state.
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            if(abuseGuard!=null)abuseGuard.failure("LOGIN",request.getEmail());
            throw new AuthException(AuthErrorCode.LOGIN_CREDENTIALS);
        }

        if ("PENDING_VERIFICATION".equals(user.getStatus())) {
            throw new AuthException(AuthErrorCode.LOGIN_VERIFICATION);
        }

        if ("LOCKED".equals(user.getStatus()) || "INACTIVE".equals(user.getStatus())) {
            throw new AuthException(AuthErrorCode.LOGIN_LOCKED);
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole().getCode());

        if(abuseGuard!=null)abuseGuard.success("LOGIN",request.getEmail(),user.getId());
        return session(user, token);
    }

    @Override
    @Transactional
    public AuthResponse googleLogin(GoogleLoginRequest request) {
        if (googleClientId == null || googleClientId.isBlank()) {
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_UNCONFIGURED);
        }

        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId.trim()))
                    .build();

            GoogleIdToken idToken = verifier.verify(request.getIdToken());
            if (idToken == null) {
                throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
            }

            GoogleIdToken.Payload payload = idToken.getPayload();
            String email = payload.getEmail();
            if (email == null || email.isBlank() || !Boolean.TRUE.equals(payload.getEmailVerified())) {
                throw new AuthException(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
            }
            String name = payload.get("name") instanceof String s ? s : null;
            String picture = payload.get("picture") instanceof String s ? s : null;

            return authenticateOAuthUser(email, name, picture);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Google login failed ({})", e.getClass().getSimpleName());
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
        }
    }

    @Override
    @Transactional
    public AuthResponse githubLogin(GithubLoginRequest request) {
        if (githubOAuthClient == null) {
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_UNCONFIGURED);
        }
        GithubOAuthClient.GithubUserProfile profile = githubOAuthClient.exchangeCodeForProfile(
                request.getCode(), request.getRedirectUri());
        String displayName = (profile.name() != null && !profile.name().isBlank())
                ? profile.name()
                : profile.login();
        return authenticateOAuthUser(profile.email(), displayName, profile.avatarUrl());
    }

    // shortcut: links OAuth accounts by verified email; upgrade to an oauth_accounts table if users need independent provider email changes.
    private AuthResponse authenticateOAuthUser(String rawEmail, String rawName, String avatarUrl) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
        if (email.isEmpty()) {
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
        }

        Optional<User> optionalUser = userRepository.findByEmail(email)
                .or(() -> userRepository.findByEmailIgnoreCase(email));
        User user;

        if (optionalUser.isPresent()) {
            user = optionalUser.get();
            if ("LOCKED".equals(user.getStatus()) || "INACTIVE".equals(user.getStatus())) {
                throw new AuthException(AuthErrorCode.LOGIN_LOCKED);
            }
            boolean dirty = false;
            if ("PENDING_VERIFICATION".equals(user.getStatus())) {
                user.setStatus("ACTIVE");
                dirty = true;
            }
            if ((user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())
                    && avatarUrl != null && !avatarUrl.isBlank()) {
                user.setAvatarUrl(avatarUrl.trim());
                dirty = true;
            }
            if (dirty) {
                userRepository.save(user);
            }
        } else {
            Role studentRole = roleRepository.findByCode("STUDENT")
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Role STUDENT not found"));

            String fullName = (rawName != null && !rawName.isBlank())
                    ? rawName.trim()
                    : email.substring(0, Math.max(1, email.indexOf('@')));

            user = User.builder()
                    .email(email)
                    .fullName(fullName)
                    .avatarUrl(avatarUrl != null && !avatarUrl.isBlank() ? avatarUrl.trim() : null)
                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .role(studentRole)
                    .status("ACTIVE")
                    .build();
            userRepository.save(user);
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole().getCode());
        return session(user, token);
    }

    @Override
    @Transactional
    public void forgotPassword(com.mavis.platform.auth.dto.ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElse(null);

        // One public response for missing, unverified, blocked and active users.
        if (user == null || !"ACTIVE".equals(user.getStatus())) return;

        // Generate OTP
        String otpCode = String.format("%06d", OTP_RANDOM.nextInt(1_000_000));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("PASSWORD_RESET")
                .expiryTime(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Send email
        emailService.requestOtpEmail(user.getEmail(), otpCode, "PASSWORD_RESET");
    }

    @Override
    @Transactional
    public void resetPassword(com.mavis.platform.auth.dto.ResetPasswordRequest request) {
        if (abuseGuard != null) abuseGuard.check("OTP_RESET", request.getEmail());
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    if (abuseGuard != null) abuseGuard.failure("OTP_RESET", request.getEmail());
                    return new AuthException(AuthErrorCode.AUTH_RESET_INVALID);
                });

        UserOtp userOtp;
        try {
            userOtp = requireOtp(user, request.getOtpCode(), "PASSWORD_RESET");
        } catch (AuthException ex) {
            if (abuseGuard != null) abuseGuard.failure("OTP_RESET", request.getEmail());
            throw ex;
        }

        userOtp.setUsed(true);
        userOtpRepository.save(userOtp);

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        if (abuseGuard != null) abuseGuard.success("OTP_RESET", request.getEmail(), user.getId());
    }

    @Override
    @Transactional
    public void resendOtp(String email) {
        User user = userRepository.findByEmail(email)
                .orElse(null);

        if (user == null || !"PENDING_VERIFICATION".equals(user.getStatus())) return;

        // Tạo OTP mới
        String otpCode = String.format("%06d", OTP_RANDOM.nextInt(1_000_000));
        UserOtp userOtp = UserOtp.builder()
                .user(user)
                .otpCode(otpCode)
                .purpose("EMAIL_VERIFICATION")
                .expiryTime(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5)) // Hết hạn sau 5 phút
                .isUsed(false)
                .build();
        userOtpRepository.save(userOtp);

        // Gửi email
        emailService.requestOtpEmail(user.getEmail(), otpCode, "EMAIL_VERIFICATION");
    }

    private UserOtp requireOtp(User user, String code, String purpose) {
        boolean reset = "PASSWORD_RESET".equals(purpose);
        UserOtp otp = userOtpRepository.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user, code, purpose)
                .orElseThrow(() -> new AuthException(reset ? AuthErrorCode.AUTH_RESET_INVALID : AuthErrorCode.AUTH_CODE_INVALID));
        if (otp.isUsed())
            throw new AuthException(reset ? AuthErrorCode.AUTH_RESET_USED : AuthErrorCode.AUTH_CODE_USED);
        if (!otp.getExpiryTime().isAfter(OffsetDateTime.now(ZoneOffset.UTC)))
            throw new AuthException(reset ? AuthErrorCode.AUTH_RESET_EXPIRED : AuthErrorCode.AUTH_CODE_EXPIRED);
        return otp;
    }

    private AuthResponse session(User user, String token) {
        if (refreshSessions != null) return refreshSessions.response(user, refreshSessions.issue(user.getId()));
        return AuthResponse.builder().token(token).userId(user.getId()).email(user.getEmail())
                .fullName(user.getFullName()).role(user.getRole().getCode()).build();
    }
}
