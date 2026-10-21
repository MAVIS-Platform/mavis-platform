package com.mavis.analyzer.graph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImpactAnalysisResponseDTO {
    private String graphRevisionId;
    private boolean truncated;
    @Builder.Default
    private List<String> warnings = new ArrayList<>();
    private UUID modelVersionId;
    private UUID targetElementId;
    private String targetElementName;
    private int totalImpactedCount;
    private int directlyImpactedCount;
    private int indirectlyImpactedCount;
    private boolean cyclicDependencyDetected;

    @Builder.Default
    private String disclaimer = "Potential Architectural Impact based on static and observed dependencies";

    @Builder.Default
    private List<ImpactedElementDTO> impactedElements = new ArrayList<>();
}
