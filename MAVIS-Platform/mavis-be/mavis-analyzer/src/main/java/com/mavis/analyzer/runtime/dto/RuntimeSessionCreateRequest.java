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
}
