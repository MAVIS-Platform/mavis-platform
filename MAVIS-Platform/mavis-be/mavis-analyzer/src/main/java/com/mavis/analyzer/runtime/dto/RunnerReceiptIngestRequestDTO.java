package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerReceiptIngestRequestDTO {

    private String sessionId;
    private String modelVersionId;
    private String sourceSnapshotId;
    private String profileVersionId;
    private String runConfigurationVersionId;
    private String scenarioVersionId;
    private String resourceProject;
    private Map<String, String> actualImageIds;
    private Map<String, String> declaredInstrumentationVersions;
    private Boolean sandboxEnforcementConfirmed;
    private String imageSourceCorrespondence;
    private String profileAcceptance;
    private List<RuntimeInfrastructureActionDTO> infrastructureActions;
    private RunnerOutcomeDTO outcome;
}
