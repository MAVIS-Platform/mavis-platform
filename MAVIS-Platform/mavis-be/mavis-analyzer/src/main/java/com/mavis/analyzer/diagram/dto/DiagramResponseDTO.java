package com.mavis.analyzer.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.DiagramVersion;
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
public class DiagramResponseDTO {
    private UUID id;
    private UUID modelVersionId;
    private String notation;
    private String level;
    private JsonNode layoutJson;
    private OffsetDateTime createdAt;

    public static DiagramResponseDTO fromEntity(DiagramVersion entity) {
        if (entity == null) {
            return null;
        }
        return DiagramResponseDTO.builder()
                .id(entity.getId())
                .modelVersionId(entity.getModelVersion() != null ? entity.getModelVersion().getId() : null)
                .notation(entity.getNotation())
                .level(entity.getLevel())
                .layoutJson(entity.getLayoutJson())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
