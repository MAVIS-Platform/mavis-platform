package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerCausalEdgeDTO {
    private String traceId;
    private String parentSpanId;
    private String childSpanId;
}
