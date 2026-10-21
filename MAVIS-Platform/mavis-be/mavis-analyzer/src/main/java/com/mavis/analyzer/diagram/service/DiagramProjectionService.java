package com.mavis.analyzer.diagram.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.*;
import java.util.*;

public interface DiagramProjectionService {
    record DiagramView(UUID id,UUID modelVersionId,String notation,String level,JsonNode layoutJson) {}
    record EvidenceView(UUID id,UUID modelVersionId,UUID sourceSnapshotId,String sourceType,String locator,String adapterVersion,JsonNode provenance) {}
    void generateDefaultDiagramsForModel(ModelVersion model,List<ModelElement> elements,List<ModelRelationship> relationships);
    List<DiagramView> list(UUID model);
    DiagramView get(UUID diagram);
    DiagramView updateLayout(UUID diagram,JsonNode positions);
    List<EvidenceView> elementEvidence(UUID element);
    List<EvidenceView> relationshipEvidence(UUID relationship);
}
