package com.mavis.analyzer.graph.service.impl;

import com.mavis.analyzer.graph.dto.*;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphServiceImpl implements GraphService {

    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final EvidenceRepository evidenceRepository;

    @Override
    @Transactional(readOnly = true)
    public GraphDataDTO getGraphDataBySessionId(UUID sessionId) {
        log.info("Fetching graph data for session / modelVersion ID: {}", sessionId);

        UUID targetModelVersionId = resolveModelVersionId(sessionId, null);
        List<ModelElement> modelElements = modelElementRepository.findByModelVersionId(targetModelVersionId);

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
    @Transactional(readOnly = true)
    public List<NodeDTO> analyzeImpact(UUID sessionId, UUID sourceNodeId) {
        ImpactAnalysisResponseDTO detailed = analyzeDetailedImpact(sessionId, sourceNodeId);
        return detailed.getImpactedElements().stream()
                .map(e -> NodeDTO.builder()
                        .id(e.getElementId())
                        .name(e.getName())
                        .type(e.getElementType())
                        .sourcePath(null)
                        .build())
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ImpactAnalysisResponseDTO analyzeDetailedImpact(UUID sessionOrModelVersionId, UUID targetElementId) {
        log.info("Phân tích tác động chi tiết (BFS Change Impact): sessionId/modelVersionId={}, targetElementId={}",
                sessionOrModelVersionId, targetElementId);

        // 1. Xác định đúng modelVersionId
        UUID modelVersionId = resolveModelVersionId(sessionOrModelVersionId, targetElementId);

        // QUERY 1: Lấy toàn bộ ModelElement của modelVersionId đưa vào Map trên RAM
        List<ModelElement> allElements = modelElementRepository.findByModelVersionId(modelVersionId);
        Map<UUID, ModelElement> elementMap = allElements.stream()
                .collect(Collectors.toMap(ModelElement::getId, e -> e, (e1, e2) -> e1));

        ModelElement targetElement = elementMap.get(targetElementId);
        if (targetElement == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Target element không tồn tại trong phiên kiến trúc: " + targetElementId);
        }

        // QUERY 2: Lấy toàn bộ ModelRelationship (đã có @EntityGraph nạp sẵn sourceElement, targetElement)
        List<ModelRelationship> allRelationships = modelRelationshipRepository.findByModelVersionId(modelVersionId);

        // Dựng đồ thị đảo chiều (Reverse Adjacency List):
        // Nếu A gọi B (A -> B, tức source=A, target=B), thì khi B đổi, A bị ảnh hưởng.
        // Trên đồ thị đảo chiều: callee B dẫn ngược về caller A.
        Map<UUID, List<ReverseEdge>> reverseGraph = new HashMap<>();
        for (ModelRelationship rel : allRelationships) {
            if (rel.getSourceElement() == null || rel.getTargetElement() == null) {
                continue;
            }
            UUID callerId = rel.getSourceElement().getId();
            UUID calleeId = rel.getTargetElement().getId();
            if (callerId == null || calleeId == null) {
                continue;
            }

            reverseGraph.computeIfAbsent(calleeId, k -> new ArrayList<>())
                    .add(new ReverseEdge(calleeId, callerId, rel));
        }

        // Thuật toán BFS đa tầng với Reverse Graph
        Queue<UUID> queue = new LinkedList<>();
        Set<UUID> visited = new HashSet<>();
        Map<UUID, Integer> distanceMap = new LinkedHashMap<>();
        Map<UUID, UUID> parentElementMap = new HashMap<>();
        Map<UUID, ModelRelationship> parentRelationshipMap = new HashMap<>();
        List<UUID> impactedInBfsOrder = new ArrayList<>();
        Set<UUID> traversedRelationshipIds = new HashSet<>();
        boolean cyclicDependencyDetected = false;

        queue.add(targetElementId);
        visited.add(targetElementId);
        distanceMap.put(targetElementId, 0);

        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            int currentDist = distanceMap.get(current);

            List<ReverseEdge> edges = reverseGraph.getOrDefault(current, Collections.emptyList());
            for (ReverseEdge edge : edges) {
                UUID dependentId = edge.toCallerId;
                if (edge.relationship != null && edge.relationship.getId() != null) {
                    traversedRelationshipIds.add(edge.relationship.getId());
                }

                if (visited.contains(dependentId)) {
                    // Phát hiện chu trình phụ thuộc trong đồ thị khi gặp đỉnh đã được thăm
                    cyclicDependencyDetected = true;
                } else {
                    visited.add(dependentId);
                    int nextDist = currentDist + 1;
                    distanceMap.put(dependentId, nextDist);
                    parentElementMap.put(dependentId, current);
                    parentRelationshipMap.put(dependentId, edge.relationship);
                    impactedInBfsOrder.add(dependentId);
                    queue.add(dependentId);
                }
            }
        }

        // QUERY 3: Lấy toàn bộ Evidence của các cạnh trên đường truyền bằng ĐÚNG 1 LẦN findByRelationshipIdIn
        Map<UUID, List<EvidenceSummaryDTO>> evidenceByRelId = new HashMap<>();
        if (!traversedRelationshipIds.isEmpty()) {
            List<Evidence> evidences = evidenceRepository.findByRelationshipIdIn(traversedRelationshipIds);
            evidenceByRelId = evidences.stream()
                    .filter(e -> e.getRelationship() != null && e.getRelationship().getId() != null)
                    .map(EvidenceSummaryDTO::fromEntity)
                    .collect(Collectors.groupingBy(EvidenceSummaryDTO::getRelationshipId));
        }

        // Tái tạo dependencyPathNames và đính kèm supportingEvidences cho từng phần tử bị ảnh hưởng
        List<ImpactedElementDTO> impactedElements = new ArrayList<>();
        int directlyCount = 0;
        int indirectlyCount = 0;

        for (UUID impactedId : impactedInBfsOrder) {
            ModelElement el = elementMap.get(impactedId);
            if (el == null) {
                continue;
            }

            int hop = distanceMap.getOrDefault(impactedId, 1);
            String impactLevel = (hop == 1) ? "DIRECTLY_IMPACTED" : "INDIRECTLY_IMPACTED";
            if (hop == 1) {
                directlyCount++;
            } else {
                indirectlyCount++;
            }

            // Tái tạo đường truyền phụ thuộc: từ impactedElement -> ... -> targetElement
            List<String> pathNames = new ArrayList<>();
            List<UUID> pathRelIds = new ArrayList<>();
            UUID curr = impactedId;
            while (curr != null) {
                ModelElement nodeEl = elementMap.get(curr);
                if (nodeEl != null) {
                    pathNames.add(nodeEl.getName());
                }
                ModelRelationship rel = parentRelationshipMap.get(curr);
                if (rel != null && rel.getId() != null) {
                    pathRelIds.add(rel.getId());
                }
                curr = parentElementMap.get(curr);
            }

            // Tập hợp bằng chứng từ các cạnh trên đường truyền phụ thuộc
            List<EvidenceSummaryDTO> nodeEvidences = new ArrayList<>();
            for (UUID relId : pathRelIds) {
                List<EvidenceSummaryDTO> evList = evidenceByRelId.get(relId);
                if (evList != null) {
                    nodeEvidences.addAll(evList);
                }
            }

            impactedElements.add(ImpactedElementDTO.builder()
                    .elementId(el.getId())
                    .name(el.getName())
                    .elementType(el.getElementType())
                    .languageStack(el.getLanguageStack())
                    .impactLevel(impactLevel)
                    .hopDistance(hop)
                    .dependencyPathNames(pathNames)
                    .supportingEvidences(nodeEvidences)
                    .build());
        }

        return ImpactAnalysisResponseDTO.builder()
                .modelVersionId(modelVersionId)
                .targetElementId(targetElement.getId())
                .targetElementName(targetElement.getName())
                .totalImpactedCount(impactedElements.size())
                .directlyImpactedCount(directlyCount)
                .indirectlyImpactedCount(indirectlyCount)
                .cyclicDependencyDetected(cyclicDependencyDetected)
                .disclaimer("Potential Architectural Impact based on static and observed dependencies")
                .impactedElements(impactedElements)
                .build();
    }

    private UUID resolveModelVersionId(UUID sessionOrModelVersionId, UUID targetElementId) {
        if (sessionOrModelVersionId == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Session ID hoặc ModelVersion ID không được để trống");
        }

        // Trường hợp 1: sessionOrModelVersionId chính là ModelVersionId
        if (targetElementId == null) {
            List<ModelElement> elements = modelElementRepository.findByModelVersionId(sessionOrModelVersionId);
            if (!elements.isEmpty()) {
                return sessionOrModelVersionId;
            }
        } else if (modelElementRepository.existsByIdAndModelVersionId(targetElementId, sessionOrModelVersionId)) {
            return sessionOrModelVersionId;
        }

        // Trường hợp 2: sessionOrModelVersionId là ProjectId -> tìm latest valid ModelVersion
        Optional<ModelVersion> latest = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(sessionOrModelVersionId);
        if (latest.isPresent()) {
            if (targetElementId == null || modelElementRepository.existsByIdAndModelVersionId(targetElementId, latest.get().getId())) {
                return latest.get().getId();
            }
        }

        // Trường hợp 3: Kiểm tra theo ID của ModelVersion trong repository
        Optional<ModelVersion> byId = modelVersionRepository.findById(sessionOrModelVersionId);
        if (byId.isPresent()) {
            return sessionOrModelVersionId;
        }

        return sessionOrModelVersionId;
    }

    private static class ReverseEdge {
        final UUID fromCalleeId;
        final UUID toCallerId;
        final ModelRelationship relationship;

        ReverseEdge(UUID fromCalleeId, UUID toCallerId, ModelRelationship relationship) {
            this.fromCalleeId = fromCalleeId;
            this.toCallerId = toCallerId;
            this.relationship = relationship;
        }
    }
}
