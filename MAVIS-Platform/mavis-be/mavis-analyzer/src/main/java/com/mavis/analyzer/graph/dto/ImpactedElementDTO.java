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
public class ImpactedElementDTO {
    private UUID elementId;
    private String name;
    private String elementType;
    private String languageStack;
    private String impactLevel; // "DIRECTLY_IMPACTED" (hop == 1) or "INDIRECTLY_IMPACTED" (hop >= 2)
    private int hopDistance;

    @Builder.Default
    private List<String> dependencyPathNames = new ArrayList<>();

    @Builder.Default
    private List<EvidenceSummaryDTO> supportingEvidences = new ArrayList<>();
}
