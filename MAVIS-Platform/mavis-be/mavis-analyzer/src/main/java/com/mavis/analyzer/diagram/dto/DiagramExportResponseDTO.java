package com.mavis.analyzer.diagram.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiagramExportResponseDTO {

    private UUID diagramId;
    private UUID modelVersionId;
    private UUID sourceSnapshotId;
    private Integer modelRevision;
    private String notation;
    private String level;
    private String format;
    private String content;

    @Builder.Default
    private Map<String, UUID> nodeClickMap = new LinkedHashMap<>();

    private OffsetDateTime exportedAt;
}
