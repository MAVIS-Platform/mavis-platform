package com.mavis.platform.security.jwt;

import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class SessionLogoutController {
    private final JwtUtil jwt;
    private final RefreshSessionService refreshSessions;

    @PostMapping("/logout")
    public ApiResponse<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestHeader(value = "X-Refresh-Token", required = false) String refreshToken) {
        if (authorization != null && authorization.startsWith("Bearer ")) {
            jwt.revoke(authorization.substring(7));
        }
        refreshSessions.revoke(refreshToken);
        return ApiResponse.success(null);
    }
}
