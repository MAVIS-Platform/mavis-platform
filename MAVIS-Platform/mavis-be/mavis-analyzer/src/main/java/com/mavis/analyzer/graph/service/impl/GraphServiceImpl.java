package com.mavis.analyzer.graph.service.impl;

import com.mavis.analyzer.graph.dto.EdgeDTO;
import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphServiceImpl implements GraphService {

    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final com.mavis.analyzer.impact.WorkerImpactService workerImpact;

    @Override
    public GraphDataDTO getGraphDataBySessionId(UUID sessionId) {
        log.info("Fetching graph data for session / modelVersion ID: {}", sessionId);

        UUID targetModelVersionId = sessionId;
        List<ModelElement> modelElements = modelElementRepository.findByModelVersionId(targetModelVersionId);

        // Fallback: If sessionId is actually a projectId, find the latest valid ModelVersion
        if (modelElements.isEmpty()) {
            Optional<ModelVersion> latest = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(sessionId);
            if (latest.isPresent()) {
                targetModelVersionId = latest.get().getId();
                modelElements = modelElementRepository.findByModelVersionId(targetModelVersionId);
            }
        }

        if (modelElements.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dữ liệu đồ thị cho ID này");
        }

        List<ModelRelationship> relationships = modelRelationshipRepository.findByModelVersionId(targetModelVersionId);

        List<NodeDTO> nodeDTOs = modelElements.stream()
                .map(el -> NodeDTO.builder()
                        .id(el.getId())
                        .name(el.getName())
                        .type(el.getElementType())
                        .sourcePath(extractSourcePath(el))
                        .build())
                .collect(Collectors.toList());

        List<EdgeDTO> edgeDTOs = relationships.stream()
                .map(rel -> EdgeDTO.builder()
                        .id(rel.getId())
                        .sourceNodeId(rel.getSourceElement().getId())
                        .targetNodeId(rel.getTargetElement().getId())
                        .kind(rel.getRelationType())
                        .description(extractDescription(rel))
                        .build())
                .collect(Collectors.toList());

        return GraphDataDTO.builder()
                .nodes(nodeDTOs)
                .edges(edgeDTOs)
                .build();
    }

    private String extractSourcePath(ModelElement el) {
        if (el.getProperties() != null && el.getProperties().has("sourcePath")) {
            return el.getProperties().get("sourcePath").asText();
        }
        return el.getScope();
    }

    private String extractDescription(ModelRelationship rel) {
        if (rel.getProperties() != null && rel.getProperties().has("description")) {
            return rel.getProperties().get("description").asText();
        }
        return rel.getRelationType();
    }

    @Override
    public List<NodeDTO> analyzeImpact(UUID modelVersionId, UUID sourceNodeId) {
        var result=workerImpact.analyze(modelVersionId,sourceNodeId,null,10,1000);
        return result.impact().affectedServices().stream().map(p->NodeDTO.builder().id(UUID.fromString(p.serviceId()))
                .name(result.serviceNames().get(p.serviceId())).type("SERVICE_CONTAINER").build()).toList();
    }
}