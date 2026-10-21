package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
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
public class SequenceDiagramResponseDTO {

    private UUID diagramId;
    private UUID modelVersionId;
    private UUID runtimeSessionId;
    private String notation;
    private String level;
    private JsonNode layoutJson;

    @Builder.Default
    private List<SequenceStepDTO> steps = new ArrayList<>();
}
