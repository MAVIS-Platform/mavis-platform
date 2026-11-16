package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeInfrastructureActionDTO {
    private String action;
    private String service;
    private Integer replicas;
    private Integer replicasBefore;
    private Integer replicasAfter;
    private JsonNode metricsBefore;
    private JsonNode metricsAfter;
    private String performedAt;
    private Boolean confirmed;
}
