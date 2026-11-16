package com.mavis.platform.admin.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Yêu cầu thay đổi vai trò (Role) người dùng")
public class UserRoleUpdateRequest {

    @NotBlank(message = "Mã vai trò không được để trống")
    @Schema(description = "Mã vai trò mới: STUDENT, LECTURER, ADMIN", example = "LECTURER")
    private String newRoleCode;
}
