package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OtelSpanDTO {

    private String traceId;
    private String spanId;
    private String parentSpanId;
    private String serviceName;
    private String operationName;
    private String httpMethod;
    private String httpUrl;
    private Integer httpStatusCode;
    private Long durationMs;

    @Builder.Default
    private Map<String, String> attributes = new HashMap<>();
}
