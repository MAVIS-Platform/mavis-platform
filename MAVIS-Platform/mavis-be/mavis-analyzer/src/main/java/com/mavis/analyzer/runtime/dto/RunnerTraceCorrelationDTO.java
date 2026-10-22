package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerTraceCorrelationDTO {
    private String sessionId;
    private String modelVersionId;
    private List<RunnerCorrelatedSpanDTO> spans;
    private List<RunnerCausalEdgeDTO> causalEdges;
    private List<RunnerObservedInteractionDTO> interactions;
    private List<String> warnings;
}
