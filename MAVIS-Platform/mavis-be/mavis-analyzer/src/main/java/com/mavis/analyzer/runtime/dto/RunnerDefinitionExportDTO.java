package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * Maps 100% to MAVIS.Runner's RuntimeRunDefinition record in DockerComposeSession.cs.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerDefinitionExportDTO {

    private String sessionId;
    private String modelVersionId;
    private String sourceSnapshotId;
    private String profileVersionId;
    private String runConfigurationVersionId;
    private String scenarioVersionId;
    private String composeYaml;
    private JsonNode profile;
    private JsonNode scenario;
    private Map<String, String> confirmedServiceMappings;
}
