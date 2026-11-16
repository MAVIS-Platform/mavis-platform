package com.mavis.analyzer.graph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EdgeDTO {
    private UUID id;
    private UUID sourceNodeId;
    private UUID targetNodeId;
    private String kind;
    private String description;
    private String originLayer;
    private String direction;
    private String resolutionStatus;
    private Long evidenceCount;
    private List<UUID> evidenceIds;
    private com.fasterxml.jackson.databind.JsonNode properties;
}
