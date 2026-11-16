package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeProjectConfigDTO {

    private UUID projectId;
    private UUID latestSnapshotId;
    private UUID latestModelVersionId;
    private boolean supported;
    private boolean ready;

    @Builder.Default
    private String profileId = "SPRING_BOOT_DOTNET_COMPOSE_V1";

    private int revision;

    @Builder.Default
    private List<String> prerequisites = new ArrayList<>();

    @Builder.Default
    private List<String> detectedServices = new ArrayList<>();

    @Builder.Default
    private Map<String, String> confirmedServiceMappings = new HashMap<>();

    @Builder.Default
    private Map<String, String> environmentVariables = new HashMap<>();

    @Builder.Default
    private List<String> secretReferences = new ArrayList<>();

    @Builder.Default
    private List<String> configuredSecretKeys = new ArrayList<>();

    @Builder.Default
    private List<PreflightCheckResponseDTO.DetectedEndpointDTO> detectedEndpoints = new ArrayList<>();

    @Builder.Default
    private List<PreflightCheckResponseDTO.DatabaseCheckDTO> databaseChecks = new ArrayList<>();

    @Builder.Default
    private List<PreflightCheckResponseDTO.RequiredEnvVarDTO> requiredEnvVars = new ArrayList<>();
}
