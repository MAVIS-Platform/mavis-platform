package com.mavis.analyzer.diagram.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.*;
import java.util.*;

public interface DiagramProjectionService {
    record DiagramView(UUID id,UUID modelVersionId,String notation,String level,JsonNode layoutJson,java.time.OffsetDateTime createdAt) {}
    record EvidenceView(UUID id,UUID modelVersionId,UUID sourceSnapshotId,String sourceType,String locator,String adapterVersion,JsonNode provenance) {}
    List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> generateDefaultDiagramsForModel(ModelVersion model,List<ModelElement> elements,List<ModelRelationship> relationships);
    List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> getDiagramsByModelVersion(UUID model);
    com.mavis.analyzer.diagram.dto.DiagramResponseDTO getDiagramById(UUID diagram);
    com.mavis.analyzer.diagram.dto.DiagramResponseDTO updateDiagramLayout(UUID diagram,JsonNode positions);
    List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByElement(UUID element);
    com.mavis.analyzer.diagram.dto.ElementEvidenceContextDTO getElementEvidenceContext(UUID element);
    List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByRelationship(UUID relationship);
    List<DiagramView> list(UUID model);
    DiagramView get(UUID diagram);
    DiagramView updateLayout(UUID diagram,JsonNode positions);
    List<EvidenceView> elementEvidence(UUID element);
    List<EvidenceView> relationshipEvidence(UUID relationship);
}
