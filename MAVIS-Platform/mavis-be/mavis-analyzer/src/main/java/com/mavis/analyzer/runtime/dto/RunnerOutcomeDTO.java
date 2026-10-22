package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerOutcomeDTO {
    private String executionStatus;
    private String scenarioStatus;
    private String evidenceStatus;
    private String cleanupStatus;
    private String traceQuality;
    private String mappingStatus;
    private String persistenceStatus;
    private List<String> diagnostics;
    private JsonNode scenario;
    private RunnerTraceCorrelationDTO trace;
}
