package com.mavis.analyzer.model.dto;

import com.mavis.common.entity.ModelVersion;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelVersionResponseDTO {
    private UUID id;
    private UUID projectId;
    private UUID sourceSnapshotId;
    private UUID runtimeSessionId;
    private Integer revision;
    private String schemaVersion;
    private String origin;
    private Boolean isLatestValid;
    private UUID createdById;
    private OffsetDateTime createdAt;

    public static ModelVersionResponseDTO fromEntity(ModelVersion entity) {
        if (entity == null) {
            return null;
        }
        return ModelVersionResponseDTO.builder()
                .id(entity.getId())
                .projectId(entity.getProject() != null ? entity.getProject().getId() : null)
                .sourceSnapshotId(entity.getSourceSnapshot() != null ? entity.getSourceSnapshot().getId() : null)
                .runtimeSessionId(entity.getRuntimeSession() != null ? entity.getRuntimeSession().getId() : null)
                .revision(entity.getRevision())
                .schemaVersion(entity.getSchemaVersion())
                .origin(entity.getOrigin())
                .isLatestValid(entity.getIsLatestValid())
                .createdById(entity.getCreatedBy() != null ? entity.getCreatedBy().getId() : null)
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
