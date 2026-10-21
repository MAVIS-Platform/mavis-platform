package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.RuntimeSession;
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
public class RuntimeSessionResponseDTO {

    private UUID id;
    private UUID projectId;
    private UUID sourceSnapshotId;
    private UUID triggeredById;
    private String triggeredByName;
    private String profileName;
    private String scenarioName;
    private JsonNode scenarioConfig;
    private String scenarioStatus;
    private String traceStatus;
    private String traceStoragePath;
    private String overrideComposeYaml;
    private OffsetDateTime startedAt;
    private OffsetDateTime completedAt;
    private OffsetDateTime createdAt;

    public static RuntimeSessionResponseDTO fromEntity(RuntimeSession entity) {
        return fromEntity(entity, null);
    }

    public static RuntimeSessionResponseDTO fromEntity(RuntimeSession entity, String overrideComposeYaml) {
        if (entity == null) {
            return null;
        }
        return RuntimeSessionResponseDTO.builder()
                .id(entity.getId())
                .projectId(entity.getProject() != null ? entity.getProject().getId() : null)
                .sourceSnapshotId(entity.getSourceSnapshot() != null ? entity.getSourceSnapshot().getId() : null)
                .triggeredById(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getId() : null)
                .triggeredByName(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getFullName() : null)
                .profileName(entity.getProfileName())
                .scenarioName(entity.getScenarioName())
                .scenarioConfig(entity.getScenarioConfig())
                .scenarioStatus(entity.getScenarioStatus())
                .traceStatus(entity.getTraceStatus())
                .traceStoragePath(entity.getTraceStoragePath())
                .overrideComposeYaml(overrideComposeYaml)
                .startedAt(entity.getStartedAt())
                .completedAt(entity.getCompletedAt())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
