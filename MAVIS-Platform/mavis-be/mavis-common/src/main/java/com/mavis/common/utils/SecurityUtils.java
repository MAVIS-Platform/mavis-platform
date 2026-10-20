package com.mavis.common.utils;

import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Optional;
import java.util.UUID;

@Component
@Slf4j
public class SecurityUtils {

    private static UserRepository staticUserRepository;

    public SecurityUtils(UserRepository userRepository) {
        SecurityUtils.staticUserRepository = userRepository;
    }

    public static UUID getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // 1. Nếu có JWT Bearer Token hợp lệ
        if (authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getPrincipal())) {
            try {
                return UUID.fromString(authentication.getName());
            } catch (Exception e) {
                try {
                    return UUID.fromString((String) authentication.getPrincipal());
                } catch (Exception ex) {
                    throw new BusinessException(ErrorCode.UNAUTHORIZED, "Token không hợp lệ");
                }
            }
        }

        // 2. Chế độ test chỉ định qua Header X-Test-User-Email
        HttpServletRequest request = getCurrentHttpRequest();
        if (request != null && staticUserRepository != null) {
            String testEmail = request.getHeader("X-Test-User-Email");
            if (testEmail != null && !testEmail.isBlank()) {
                Optional<User> userOpt = staticUserRepository.findByEmail(testEmail.trim());
                if (userOpt.isPresent()) {
                    log.debug("Dev User Fallback qua X-Test-User-Email: {}", testEmail);
                    return userOpt.get().getId();
                }
            }
        }

        // 3. Fallback mặc định khi không có Token & Header
        if (staticUserRepository != null) {
            // Ưu tiên 1: Tài khoản Seed Student
            Optional<User> studentOpt = staticUserRepository.findByEmail("trietlmse181979@fpt.edu.vn");
            if (studentOpt.isPresent()) {
                return studentOpt.get().getId();
            }

            // Ưu tiên 2: Tài khoản Seed Lecturer
            Optional<User> lecturerOpt = staticUserRepository.findByEmail("hoangnt@fpt.edu.vn");
            if (lecturerOpt.isPresent()) {
                return lecturerOpt.get().getId();
            }

            // Ưu tiên 3: User đầu tiên bất kỳ
            Optional<User> firstUserOpt = staticUserRepository.findAll().stream().findFirst();
            if (firstUserOpt.isPresent()) {
                return firstUserOpt.get().getId();
            }
        }

        throw new BusinessException(ErrorCode.UNAUTHORIZED, "Không tìm thấy thông tin đăng nhập và không có Dev User fallback khả dụng");
    }

    private static HttpServletRequest getCurrentHttpRequest() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            return attributes != null ? attributes.getRequest() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
