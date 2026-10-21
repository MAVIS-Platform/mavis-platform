package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SequenceStepDTO {

    private int stepOrder;
    private String callerService;
    private String calleeService;
    private String operation;
    private String httpMethod;
    private Integer httpStatusCode;
    private Long durationMs;
    private String traceId;
    private String spanId;
    private String parentSpanId;
}
