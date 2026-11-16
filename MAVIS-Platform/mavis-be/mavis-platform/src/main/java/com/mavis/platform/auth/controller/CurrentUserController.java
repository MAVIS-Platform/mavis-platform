package com.mavis.platform.auth.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CurrentUserController {
    private final AccessPolicyService accessPolicy;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    public record CurrentUser(UUID id, String email, String fullName, String role, String avatarUrl, String preferredLocale) {}
    public record UpdateProfileRequest(@NotBlank @Size(max=255) String fullName,
                                       @Size(max=100) String currentPassword,
                                       @Size(min=6,max=100) String newPassword,
                                       @Size(max=1000) String avatarUrl,
                                       @jakarta.validation.constraints.Pattern(regexp="en|vi") String preferredLocale) {
        public UpdateProfileRequest(String fullName,String currentPassword,String newPassword){this(fullName,currentPassword,newPassword,null,null);}
    }
    @GetMapping("/api/v1/auth/me")
    public ApiResponse<CurrentUser> me() {
        var user = accessPolicy.requireCurrentActiveUser();
        return ApiResponse.success(view(user));
    }
    @RequestMapping(value="/api/v1/auth/me",method={RequestMethod.PATCH,RequestMethod.PUT})
    @Transactional
    public ApiResponse<CurrentUser> update(@Valid @RequestBody UpdateProfileRequest request) {
        var user=accessPolicy.requireCurrentActiveUser();
        // Verify before mutating the managed entity, so a rejected password changes nothing.
        if(request.newPassword()!=null) {
            if(request.currentPassword()==null || !passwords.matches(request.currentPassword(),user.getPasswordHash()))
                throw new BusinessException(ErrorCode.BAD_REQUEST,"Current password is incorrect");
            user.setPasswordHash(passwords.encode(request.newPassword()));
        }
        user.setFullName(request.fullName().trim());
        if(request.avatarUrl()!=null) user.setAvatarUrl(request.avatarUrl().isBlank()?null:request.avatarUrl().trim());
        if(request.preferredLocale()!=null) user.setPreferredLocale(request.preferredLocale());
        users.save(user);
        return ApiResponse.success(view(user));
    }
    private CurrentUser view(com.mavis.common.entity.User user){return new CurrentUser(user.getId(),user.getEmail(),user.getFullName(),user.getRole().getCode(),user.getAvatarUrl(),user.getPreferredLocale());}
}
