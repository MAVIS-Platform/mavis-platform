package com.mavis.common.utils;

import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
    private static boolean staticDevBypassEnabled = false;

    public SecurityUtils(UserRepository userRepository,
                         @Value("${mavis.security.dev-bypass-enabled:false}") boolean devBypassEnabled) {
        SecurityUtils.staticUserRepository = userRepository;
        SecurityUtils.staticDevBypassEnabled = devBypassEnabled;
    }

    public static void setDevBypassEnabled(boolean enabled) {
        SecurityUtils.staticDevBypassEnabled = enabled;
    }

    public static boolean isDevBypassEnabled() {
        return staticDevBypassEnabled;
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

        // Khi devBypassEnabled == false (chế độ Production/Strict Auth):
        // TUYỆT ĐỐI KHÔNG đọc header X-Test-User-Email và KHÔNG fallback về seed user -> Ném UNAUTHORIZED
        if (!staticDevBypassEnabled) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Yêu cầu đăng nhập hợp lệ");
        }

        // 2. Chế độ test chỉ định qua Header X-Test-User-Email
        HttpServletRequest request = getCurrentHttpRequest();
        UserRepository userRepo = getUserRepository(request);
        if (request != null && userRepo != null) {
            String testEmail = request.getHeader("X-Test-User-Email");
            if (testEmail != null && !testEmail.isBlank()) {
                Optional<User> userOpt = userRepo.findByEmail(testEmail.trim());
                if (userOpt.isPresent()) {
                    log.debug("Dev User Fallback qua X-Test-User-Email: {}", testEmail);
                    return userOpt.get().getId();
                }
            }
        }

        // 3. Fallback mặc định khi không có Token & Header
        if (userRepo != null) {
            // Ưu tiên 1: Tài khoản Seed Student
            Optional<User> studentOpt = userRepo.findByEmail("trietlmse181979@fpt.edu.vn");
            if (studentOpt.isPresent()) {
                return studentOpt.get().getId();
            }

            // Ưu tiên 2: Tài khoản Seed Lecturer
            Optional<User> lecturerOpt = userRepo.findByEmail("hoangnt@fpt.edu.vn");
            if (lecturerOpt.isPresent()) {
                return lecturerOpt.get().getId();
            }

            // Ưu tiên 3: User đầu tiên bất kỳ
            Optional<User> firstUserOpt = userRepo.findFirstByOrderByCreatedAtAsc();
            if (firstUserOpt.isPresent()) {
                return firstUserOpt.get().getId();
            }
        }

        throw new BusinessException(ErrorCode.UNAUTHORIZED, "Không tìm thấy thông tin đăng nhập và không có Dev User fallback khả dụng");
    }

    private static UserRepository getUserRepository(HttpServletRequest request) {
        if (request != null) {
            try {
                org.springframework.web.context.WebApplicationContext wac =
                        org.springframework.web.servlet.support.RequestContextUtils.findWebApplicationContext(request);
                if (wac != null && wac.containsBean("userRepository")) {
                    return wac.getBean(UserRepository.class);
                }
            } catch (Exception ignored) {
            }
        }
        return staticUserRepository;
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
