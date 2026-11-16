package com.mavis.platform.admin.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.AuditLog;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Thông tin nhật ký kiểm toán hệ thống (Audit Log)")
public class AuditLogResponseDTO {

    private UUID id;
    private UUID actorId;
    private String actorName;
    private String actorEmail;
    private String action;
    private String targetType;
    private UUID targetId;
    private JsonNode details;
    private String ipAddress;
    private OffsetDateTime createdAt;

    public static AuditLogResponseDTO fromEntity(AuditLog log) {
        if (log == null) return null;
        return AuditLogResponseDTO.builder()
                .id(log.getId())
                .actorId(log.getActor() != null ? log.getActor().getId() : null)
                .actorName(log.getActor() != null ? log.getActor().getFullName() : "SYSTEM")
                .actorEmail(log.getActor() != null ? log.getActor().getEmail() : null)
                .action(log.getAction())
                .targetType(log.getTargetType())
                .targetId(log.getTargetId())
                .details(log.getDetails())
                .ipAddress(log.getIpAddress())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
