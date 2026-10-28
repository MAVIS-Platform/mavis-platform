package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerCorrelatedSpanDTO {
    private String traceId;
    private String spanId;
    private String parentSpanId;
    private String runtimeService;
    private String modelServiceId;
    private String kind;
    private String scenarioStepId;
    private String startTimeUnixNano;
    private String durationNanoseconds;
    private String spanStatus;
    private Integer httpStatusCode;
    private String httpMethod;
    private String route;
}
