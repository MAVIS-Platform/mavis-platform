package com.mavis.analyzer.graph.dto;

import com.mavis.common.entity.Evidence;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceSummaryDTO {
    private UUID evidenceId;
    private UUID relationshipId;
    private String sourceType;
    private String locator;
    private String excerpt;
    private String adapterVersion;

    public static EvidenceSummaryDTO fromEntity(Evidence evidence) {
        if (evidence == null) {
            return null;
        }
        return EvidenceSummaryDTO.builder()
                .evidenceId(evidence.getId())
                .relationshipId(evidence.getRelationship() != null ? evidence.getRelationship().getId() : null)
                .sourceType(evidence.getSourceType())
                .locator(evidence.getLocator())
                .excerpt(evidence.getExcerpt())
                .adapterVersion(evidence.getAdapterVersion())
                .build();
    }
}
