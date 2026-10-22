package com.mavis.platform.auth.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CurrentUserController {
    private final AccessPolicyService accessPolicy;
    public record CurrentUser(UUID id, String email, String fullName, String role) {}
    @GetMapping("/api/v1/auth/me")
    public ApiResponse<CurrentUser> me() {
        var user = accessPolicy.requireCurrentActiveUser();
        return ApiResponse.success(new CurrentUser(user.getId(), user.getEmail(), user.getFullName(), user.getRole().getCode()));
    }
}
