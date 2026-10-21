package com.mavis.analyzer.diagram.dto;

import com.mavis.common.entity.Evidence;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceResponseDTO {
    private UUID id;
    private UUID elementId;
    private UUID relationshipId;
    private String sourceType;
    private String locator;
    private String adapterVersion;
    private String excerpt;
    private OffsetDateTime createdAt;

    public static EvidenceResponseDTO fromEntity(Evidence entity) {
        if (entity == null) {
            return null;
        }
        return EvidenceResponseDTO.builder()
                .id(entity.getId())
                .elementId(entity.getElement() != null ? entity.getElement().getId() : null)
                .relationshipId(entity.getRelationship() != null ? entity.getRelationship().getId() : null)
                .sourceType(entity.getSourceType())
                .locator(entity.getLocator())
                .adapterVersion(entity.getAdapterVersion())
                .excerpt(entity.getExcerpt())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
