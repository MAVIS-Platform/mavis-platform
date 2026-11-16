package com.mavis.analyzer.aiexplain.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.Evidence;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EvidenceSummaryDTO {

    private UUID id;
    private UUID elementId;
    private UUID relationshipId;
    private String sourceType;
    private String locator;
    private String excerpt;
    private JsonNode provenance;

    public static EvidenceSummaryDTO fromEntity(Evidence e) {
        if (e == null) return null;
        return EvidenceSummaryDTO.builder()
                .id(e.getId())
                .elementId(e.getElement() == null ? null : e.getElement().getId())
                .relationshipId(e.getRelationship() == null ? null : e.getRelationship().getId())
                .sourceType(e.getSourceType())
                .locator(e.getLocator())
                .excerpt(e.getExcerpt())
                .provenance(e.getProvenance())
                .build();
    }
}
