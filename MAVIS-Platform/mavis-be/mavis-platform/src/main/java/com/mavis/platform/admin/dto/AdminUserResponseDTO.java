package com.mavis.platform.admin.dto;

import com.mavis.common.entity.User;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Thông tin người dùng hiển thị trên Cổng Quản trị Admin")
public class AdminUserResponseDTO {

    private UUID id;
    private String email;
    private String fullName;
    private String roleCode;
    private String roleName;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static AdminUserResponseDTO fromEntity(User user) {
        if (user == null) return null;
        return AdminUserResponseDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .roleCode(user.getRole() != null ? user.getRole().getCode() : null)
                .roleName(user.getRole() != null ? user.getRole().getName() : null)
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }
}
