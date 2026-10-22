package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunnerObservedInteractionDTO {

    private String traceId;
    private String fromService;
    private String toService;
    private String fromModelServiceId;
    private String toModelServiceId;
    private String parentSpanId;
    private String childSpanId;
}
