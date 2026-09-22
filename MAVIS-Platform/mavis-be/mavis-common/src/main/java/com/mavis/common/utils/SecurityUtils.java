package com.mavis.common.utils;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

public class SecurityUtils {

    public static UUID getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Không tìm thấy thông tin đăng nhập");
        }

        try {
            return UUID.fromString((String) authentication.getPrincipal());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Token không hợp lệ");
        }
    }
}
