package com.mavis.platform.admin.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Yêu cầu thay đổi trạng thái tài khoản người dùng")
public class UserStatusUpdateRequest {

    @NotBlank(message = "Trạng thái người dùng không được để trống")
    @Schema(description = "Trạng thái mới: ACTIVE, LOCKED, INACTIVE", example = "LOCKED")
    private String newStatus;
}
