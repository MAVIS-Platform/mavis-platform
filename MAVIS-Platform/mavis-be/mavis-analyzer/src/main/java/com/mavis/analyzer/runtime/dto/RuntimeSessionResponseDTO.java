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
    private UUID modelVersionId;
    private String profileVersionId;
    private String runConfigurationVersionId;
    private String scenarioVersionId;
    private java.util.Map<String, String> confirmedServiceMappings;
    private String resourceProject;
    private String executionStatus;
    private String evidenceStatus;
    private String cleanupStatus;
    private String traceQuality;
    private String mappingStatus;
    private Boolean sandboxEnforcementConfirmed;
    private OffsetDateTime cancelRequestedAt;
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
                .modelVersionId(entity.getModelVersion() != null ? entity.getModelVersion().getId() : null)
                .triggeredById(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getId() : null)
                .triggeredByName(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getFullName() : null)
                .profileName(entity.getProfileName())
                .profileVersionId(entity.getProfileVersionId())
                .runConfigurationVersionId(entity.getRunConfigurationVersionId())
                .scenarioVersionId(entity.getScenarioVersionId())
                .confirmedServiceMappings(entity.getConfirmedServiceMappings())
                .resourceProject(entity.getResourceProject())
                .scenarioName(entity.getScenarioName())
                .scenarioConfig(entity.getScenarioConfig())
                .scenarioStatus(entity.getScenarioStatus())
                .executionStatus(entity.getExecutionStatus())
                .evidenceStatus(entity.getEvidenceStatus())
                .cleanupStatus(entity.getCleanupStatus())
                .traceQuality(entity.getTraceQuality())
                .mappingStatus(entity.getMappingStatus())
                .sandboxEnforcementConfirmed(entity.getSandboxEnforcementConfirmed())
                .traceStatus(entity.getTraceStatus())
                .traceStoragePath(entity.getTraceStoragePath())
                .overrideComposeYaml(overrideComposeYaml)
                .cancelRequestedAt(entity.getCancelRequestedAt())
                .startedAt(entity.getStartedAt())
                .completedAt(entity.getCompletedAt())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
