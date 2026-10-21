package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.dto.EvidenceResponseDTO;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvidenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DiagramProjectionServiceImpl implements DiagramProjectionService {

    private final DiagramVersionRepository diagramVersionRepository;
    private final EvidenceRepository evidenceRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<DiagramResponseDTO> generateDefaultDiagramsForModel(ModelVersion modelVersion,
                                                                  List<ModelElement> elements,
                                                                  List<ModelRelationship> relationships) {
        log.info("Bắt đầu sinh 3 bản vẽ kiến trúc mặc định cho ModelVersion ID: {}",
                modelVersion != null ? modelVersion.getId() : null);

        List<ModelElement> safeElements = elements != null ? elements : Collections.emptyList();
        List<ModelRelationship> safeRelationships = relationships != null ? relationships : Collections.emptyList();

        // 1. Phân loại Level 2 Containers và Level 3 Components
        List<ModelElement> containers = new ArrayList<>();
        List<ModelElement> components = new ArrayList<>();

        for (ModelElement el : safeElements) {
            if ("COMPONENT".equalsIgnoreCase(el.getElementType()) || el.getParentElement() != null) {
                components.add(el);
            } else {
                containers.add(el);
            }
        }

        // Nếu không có container nào tách biệt, coi toàn bộ elements là containers
        if (containers.isEmpty() && !safeElements.isEmpty()) {
            containers.addAll(safeElements);
        }

        // 2. Tạo layout JSON cho từng bản vẽ
        JsonNode dependencyGraphLayout = buildDependencyGraphLayout(containers, safeRelationships);
        JsonNode c4ContainerLayout = buildC4ContainerLayout(containers, safeRelationships);
        JsonNode c4ComponentLayout = buildC4ComponentLayout(containers, components, safeRelationships);

        // 3. Khởi tạo 3 bản ghi DiagramVersion
        DiagramVersion d1 = DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("DEPENDENCY_GRAPH")
                .level("SERVICE")
                .layoutJson(dependencyGraphLayout)
                .build();

        DiagramVersion d2 = DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(c4ContainerLayout)
                .build();

        DiagramVersion d3 = DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("C4")
                .level("COMPONENT")
                .layoutJson(c4ComponentLayout)
                .build();

        // 4. Batch Persistence: Lưu duy nhất 1 lần qua saveAll
        List<DiagramVersion> savedDiagrams = diagramVersionRepository.saveAll(List.of(d1, d2, d3));
        log.info("Đã lưu thành công 3 bản vẽ mặc định (DEPENDENCY_GRAPH, C4 CONTAINER, C4 COMPONENT) cho ModelVersion ID: {}",
                modelVersion != null ? modelVersion.getId() : null);

        return savedDiagrams.stream()
                .map(DiagramResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<DiagramResponseDTO> getDiagramsByModelVersion(UUID modelVersionId) {
        return diagramVersionRepository.findByModelVersionIdOrderByCreatedAtAsc(modelVersionId).stream()
                .map(DiagramResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public DiagramResponseDTO getDiagramById(UUID diagramId) {
        DiagramVersion diagram = diagramVersionRepository.findById(diagramId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy sơ đồ với ID: " + diagramId));
        return DiagramResponseDTO.fromEntity(diagram);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DiagramResponseDTO updateDiagramLayout(UUID diagramId, JsonNode layoutJson) {
        // Tuân thủ BR-33: Chỉ cập nhật layoutJson của DiagramVersion mà không làm biến đổi ModelVersion gốc
        DiagramVersion diagram = diagramVersionRepository.findById(diagramId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy sơ đồ với ID: " + diagramId));

        diagram.setLayoutJson(layoutJson);
        DiagramVersion updated = diagramVersionRepository.save(diagram);
        log.info("Đã cập nhật layout cho sơ đồ ID: {} thành công (tuân thủ BR-33)", diagramId);
        return DiagramResponseDTO.fromEntity(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvidenceResponseDTO> getEvidencesByElement(UUID elementId) {
        List<Evidence> evidences = evidenceRepository.findByElementIdOrderByCreatedAtAsc(elementId);
        return evidences.stream()
                .map(EvidenceResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvidenceResponseDTO> getEvidencesByRelationship(UUID relationshipId) {
        List<Evidence> evidences = evidenceRepository.findByRelationshipIdOrderByCreatedAtAsc(relationshipId);
        return evidences.stream()
                .map(EvidenceResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    // =========================================================================
    // HELPER LAYOUT BUILDERS VỚI TÍNH TOÁN TỌA ĐỘ LƯỚI (X, Y)
    // =========================================================================

    private JsonNode buildDependencyGraphLayout(List<ModelElement> containers, List<ModelRelationship> relationships) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode nodesArray = root.putArray("nodes");
        ArrayNode edgesArray = root.putArray("edges");

        Set<UUID> containerIdSet = new HashSet<>();
        int cols = 3;
        for (int i = 0; i < containers.size(); i++) {
            ModelElement el = containers.get(i);
            containerIdSet.add(el.getId());

            int col = i % cols;
            int row = i / cols;
            int x = 100 + col * 320;
            int y = 100 + row * 220;

            ObjectNode node = nodesArray.addObject();
            node.put("id", el.getId() != null ? el.getId().toString() : "node-" + i);
            node.put("name", el.getName());
            node.put("type", el.getElementType());
            node.put("languageStack", el.getLanguageStack());

            ObjectNode pos = node.putObject("position");
            pos.put("x", x);
            pos.put("y", y);

            ObjectNode data = node.putObject("data");
            data.put("label", el.getName());
            data.put("status", el.getStatus());
        }

        for (ModelRelationship rel : relationships) {
            UUID srcId = rel.getSourceElement() != null ? rel.getSourceElement().getId() : null;
            UUID tgtId = rel.getTargetElement() != null ? rel.getTargetElement().getId() : null;

            if (srcId != null && tgtId != null && containerIdSet.contains(srcId) && containerIdSet.contains(tgtId)) {
                ObjectNode edge = edgesArray.addObject();
                edge.put("id", rel.getId() != null ? rel.getId().toString() : UUID.randomUUID().toString());
                edge.put("source", srcId.toString());
                edge.put("target", tgtId.toString());
                edge.put("relationType", rel.getRelationType());
                edge.put("originLayer", rel.getOriginLayer());
                edge.put("direction", rel.getDirection());
                edge.put("label", rel.getRelationType());
            }
        }

        return root;
    }

    private JsonNode buildC4ContainerLayout(List<ModelElement> containers, List<ModelRelationship> relationships) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode nodesArray = root.putArray("nodes");
        ArrayNode edgesArray = root.putArray("edges");

        Set<UUID> containerIdSet = new HashSet<>();
        int cols = 3;
        for (int i = 0; i < containers.size(); i++) {
            ModelElement el = containers.get(i);
            containerIdSet.add(el.getId());

            int col = i % cols;
            int row = i / cols;
            int x = 120 + col * 360;
            int y = 120 + row * 250;

            ObjectNode node = nodesArray.addObject();
            node.put("id", el.getId() != null ? el.getId().toString() : "container-" + i);
            node.put("name", el.getName());
            node.put("type", el.getElementType());
            node.put("c4Type", "Container");
            node.put("languageStack", el.getLanguageStack());

            ObjectNode pos = node.putObject("position");
            pos.put("x", x);
            pos.put("y", y);

            ObjectNode data = node.putObject("data");
            data.put("label", el.getName());
            data.put("technology", el.getLanguageStack() != null ? el.getLanguageStack() : "Java/Docker");
            data.put("description", "Container: " + el.getElementType());
        }

        for (ModelRelationship rel : relationships) {
            UUID srcId = rel.getSourceElement() != null ? rel.getSourceElement().getId() : null;
            UUID tgtId = rel.getTargetElement() != null ? rel.getTargetElement().getId() : null;

            if (srcId != null && tgtId != null && containerIdSet.contains(srcId) && containerIdSet.contains(tgtId)) {
                ObjectNode edge = edgesArray.addObject();
                edge.put("id", rel.getId() != null ? rel.getId().toString() : UUID.randomUUID().toString());
                edge.put("source", srcId.toString());
                edge.put("target", tgtId.toString());
                edge.put("relationType", rel.getRelationType());
                edge.put("originLayer", rel.getOriginLayer());
                edge.put("label", rel.getRelationType());
            }
        }

        return root;
    }

    private JsonNode buildC4ComponentLayout(List<ModelElement> containers,
                                           List<ModelElement> components,
                                           List<ModelRelationship> relationships) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode nodesArray = root.putArray("nodes");
        ArrayNode edgesArray = root.putArray("edges");

        // Nhóm các component vào container cha theo parentElement
        Map<UUID, List<ModelElement>> componentsByContainer = new HashMap<>();
        List<ModelElement> orphanComponents = new ArrayList<>();

        for (ModelElement comp : components) {
            if (comp.getParentElement() != null && comp.getParentElement().getId() != null) {
                componentsByContainer.computeIfAbsent(comp.getParentElement().getId(), k -> new ArrayList<>()).add(comp);
            } else {
                orphanComponents.add(comp);
            }
        }

        int groupCols = 2;
        int containerIndex = 0;

        for (ModelElement cont : containers) {
            UUID contId = cont.getId();
            List<ModelElement> childComponents = componentsByContainer.getOrDefault(contId, Collections.emptyList());

            int gCol = containerIndex % groupCols;
            int gRow = containerIndex / groupCols;
            int groupX = 80 + gCol * 650;
            int groupY = 80 + gRow * 480;

            // 1. Group Node đại diện cho Service Container
            ObjectNode groupNode = nodesArray.addObject();
            groupNode.put("id", contId != null ? contId.toString() : "group-" + containerIndex);
            groupNode.put("name", cont.getName());
            groupNode.put("type", "GROUP");
            groupNode.put("c4Type", "ContainerBoundary");

            ObjectNode gPos = groupNode.putObject("position");
            gPos.put("x", groupX);
            gPos.put("y", groupY);

            ObjectNode gData = groupNode.putObject("data");
            gData.put("label", cont.getName() + " (" + cont.getElementType() + ")");

            // 2. Các Component con nằm bên trong Group
            for (int j = 0; j < childComponents.size(); j++) {
                ModelElement comp = childComponents.get(j);
                int cCol = j % 2;
                int cRow = j / 2;
                int compX = groupX + 30 + cCol * 280;
                int compY = groupY + 60 + cRow * 90;

                ObjectNode compNode = nodesArray.addObject();
                compNode.put("id", comp.getId() != null ? comp.getId().toString() : "comp-" + containerIndex + "-" + j);
                compNode.put("name", comp.getName());
                compNode.put("type", "COMPONENT");
                compNode.put("c4Type", "Component");
                compNode.put("parentId", contId != null ? contId.toString() : null);

                ObjectNode cPos = compNode.putObject("position");
                cPos.put("x", compX);
                cPos.put("y", compY);

                ObjectNode cData = compNode.putObject("data");
                cData.put("label", comp.getName());
                cData.put("parentContainer", cont.getName());
                cData.put("languageStack", comp.getLanguageStack());
            }

            containerIndex++;
        }

        // 3. Toàn bộ các cạnh quan hệ (bao gồm CODE_DEPENDENCY giữa components và HTTP call)
        for (ModelRelationship rel : relationships) {
            if (rel.getSourceElement() != null && rel.getTargetElement() != null) {
                UUID sId = rel.getSourceElement().getId();
                UUID tId = rel.getTargetElement().getId();

                if (sId != null && tId != null) {
                    ObjectNode edge = edgesArray.addObject();
                    edge.put("id", rel.getId() != null ? rel.getId().toString() : UUID.randomUUID().toString());
                    edge.put("source", sId.toString());
                    edge.put("target", tId.toString());
                    edge.put("relationType", rel.getRelationType());
                    edge.put("originLayer", rel.getOriginLayer());
                    edge.put("label", rel.getRelationType());
                }
            }
        }

        return root;
    }
}
