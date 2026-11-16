package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;

import java.util.List;
import java.util.UUID;

public interface GraphService {
    GraphDataDTO getGraphDataBySessionId(UUID sessionId);
    
    List<NodeDTO> analyzeImpact(UUID sessionId, UUID sourceNodeId);

    ImpactAnalysisResponseDTO analyzeDetailedImpact(UUID sessionOrModelVersionId, UUID targetElementId);
}
