package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeSessionCreateRequest {

    @NotNull(message = "projectId không được để trống")
    private UUID projectId;

    @NotNull(message = "sourceSnapshotId không được để trống")
    private UUID sourceSnapshotId;

    private UUID triggeredById;

    @Builder.Default
    private String profileName = "SPRING_BOOT_DOTNET_COMPOSE_V1";

    private String scenarioName;

    private JsonNode scenarioConfig;

    private UUID modelVersionId;

    @Builder.Default
    private String profileVersionId = "local-poc-profile/1.0";

    @Builder.Default
    private String runConfigurationVersionId = "run-config/1.0";

    @Builder.Default
    private String scenarioVersionId = "scenario/1.0";

    private java.util.Map<String, String> confirmedServiceMappings;
}
