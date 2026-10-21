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
    public List<NodeDTO> analyzeImpact(UUID sessionId, UUID sourceNodeId) {
        log.info("Analyzing impact for session / modelVersion ID: {} and source element ID: {}", sessionId, sourceNodeId);

        UUID targetModelVersionId = sessionId;
        if (!modelElementRepository.existsByIdAndModelVersionId(sourceNodeId, targetModelVersionId)) {
            // Check if sessionId was actually a projectId
            Optional<ModelVersion> latest = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(sessionId);
            if (latest.isPresent() && modelElementRepository.existsByIdAndModelVersionId(sourceNodeId, latest.get().getId())) {
                targetModelVersionId = latest.get().getId();
            } else {
                throw new BusinessException(ErrorCode.NOT_FOUND, "Node không tồn tại trong phiên kiến trúc");
            }
        }

        List<ModelRelationship> edges = modelRelationshipRepository.findByModelVersionId(targetModelVersionId);

        // Reverse graph: key = targetElementId, value = list of sourceElementIds (dependents)
        Map<UUID, List<UUID>> graph = new HashMap<>();
        for (ModelRelationship edge : edges) {
            UUID targetId = edge.getTargetElement().getId();
            UUID sourceId = edge.getSourceElement().getId();
            graph.computeIfAbsent(targetId, k -> new ArrayList<>()).add(sourceId);
        }

        Set<UUID> visited = new HashSet<>();
        Queue<UUID> queue = new LinkedList<>();

        queue.add(sourceNodeId);
        visited.add(sourceNodeId);

        List<UUID> impactedNodeIds = new ArrayList<>();

        while (!queue.isEmpty()) {
            UUID current = queue.poll();

            if (!current.equals(sourceNodeId)) {
                impactedNodeIds.add(current);
            }

            List<UUID> dependents = graph.getOrDefault(current, new ArrayList<>());
            for (UUID dependent : dependents) {
                if (!visited.contains(dependent)) {
                    visited.add(dependent);
                    queue.add(dependent);
                }
            }
        }

        List<ModelElement> impactedNodes = modelElementRepository.findAllById(impactedNodeIds);

        return impactedNodes.stream()
                .map(node -> NodeDTO.builder()
                        .id(node.getId())
                        .name(node.getName())
                        .type(node.getElementType())
                        .sourcePath(extractSourcePath(node))
                        .build())
                .collect(Collectors.toList());
    }
}
