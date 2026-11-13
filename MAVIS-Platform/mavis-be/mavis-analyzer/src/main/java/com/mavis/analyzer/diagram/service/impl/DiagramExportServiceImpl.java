package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.dto.DiagramExportResponseDTO;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.service.DiagramExportService;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.MermaidDslGenerator;
import com.mavis.common.utils.CourseworkDiagramTypes;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DiagramExportServiceImpl implements DiagramExportService {

    private final DiagramVersionRepository diagramVersionRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private AccessPolicyService accessPolicyService;

    @Override
    @Transactional(readOnly = true)
    public DiagramExportResponseDTO exportDiagramById(UUID diagramId, String format) {
        log.info("Xuất sơ đồ kiến trúc: diagramId={}, format={}", diagramId, format);

        DiagramVersion diagram = diagramVersionRepository.findById(diagramId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy sơ đồ với ID: " + diagramId));

        ModelVersion modelVersion = diagram.getModelVersion();
        checkProjectReadAccess(modelVersion.getProject());
        if (accessPolicyService != null && CourseLabPolicy.isGuidedStaticStudent(modelVersion, accessPolicyService)
                && !CourseworkDiagramTypes.GUIDED_STATIC.contains(CourseworkDiagramTypes.fromArtifact(
                        diagram.getNotation(), diagram.getLevel(), diagram.getLayoutJson()))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Unsupported static diagram for a guided Lab");
        }

        String targetFormat = (format != null && !format.isBlank()) ? format.toUpperCase() : "MERMAID";
        String content;
        Map<String, UUID> nodeClickMap = new LinkedHashMap<>();

        switch (targetFormat) {
            case "MERMAID": {
                MermaidDslGenerator.MermaidResult result = MermaidDslGenerator.generateFromLayoutJson(
                        diagram.getNotation(),
                        diagram.getLevel(),
                        diagram.getLayoutJson()
                );
                content = result.getDsl();
                nodeClickMap = result.getNodeClickMap();
                break;
            }
            case "PLANTUML": {
                content = generatePlantUml(diagram);
                populateNodeClickMap(diagram.getLayoutJson(), nodeClickMap);
                break;
            }
            case "DRAWIO_XML": {
                content = generateDrawioXml(diagram);
                populateNodeClickMap(diagram.getLayoutJson(), nodeClickMap);
                break;
            }
            case "JSON": {
                content = generateJson(diagram);
                populateNodeClickMap(diagram.getLayoutJson(), nodeClickMap);
                break;
            }
            default:
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Định dạng xuất không được hỗ trợ: " + format + ". Hỗ trợ: MERMAID, PLANTUML, DRAWIO_XML, JSON");
        }

        UUID snapshotId = modelVersion.getSourceSnapshot() != null ? modelVersion.getSourceSnapshot().getId() : null;

        return DiagramExportResponseDTO.builder()
                .diagramId(diagram.getId())
                .modelVersionId(modelVersion.getId())
                .sourceSnapshotId(snapshotId)
                .modelRevision(modelVersion.getRevision())
                .notation(diagram.getNotation())
                .level(diagram.getLevel())
                .format(targetFormat)
                .content(content)
                .nodeClickMap(nodeClickMap)
                .exportedAt(OffsetDateTime.now())
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DiagramResponseDTO generateOrGet4Plus1DeploymentDiagram(UUID modelVersionId) {
        log.info("Tạo hoặc lấy bản vẽ 4+1 Deployment cho modelVersionId={}", modelVersionId);

        ModelVersion modelVersion = modelVersionRepository.findById(modelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + modelVersionId));

        checkProjectReadAccess(modelVersion.getProject());

        if (accessPolicyService != null && CourseLabPolicy.isGuidedStaticStudent(modelVersion, accessPolicyService)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Unsupported static diagram for a guided Lab");
        }
        // Kiểm tra xem đã có sơ đồ VIEW_4_PLUS_1 / DEPLOYMENT chưa
        List<DiagramVersion> existingDiagrams = diagramVersionRepository.findByModelVersionId(modelVersionId);
        Optional<DiagramVersion> existingDeployment = existingDiagrams.stream()
                .filter(d -> "VIEW_4_PLUS_1".equalsIgnoreCase(d.getNotation()) && "DEPLOYMENT".equalsIgnoreCase(d.getLevel()))
                .findFirst();

        if (existingDeployment.isPresent()) {
            return DiagramResponseDTO.fromEntity(existingDeployment.get());
        }

        // Tạo mới bản vẽ 4+1 DEPLOYMENT
        List<ModelElement> allElements = modelElementRepository.findByModelVersionId(modelVersionId);
        List<ModelRelationship> allRelationships = modelRelationshipRepository.findRawByModelVersionId(modelVersionId);
        if (allRelationships == null || allRelationships.isEmpty()) {
            allRelationships = modelRelationshipRepository.findByModelVersionId(modelVersionId);
        }

        Set<String> deploymentKinds = Set.of("SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER", "EXTERNAL_SYSTEM");
        List<ModelElement> deploymentNodes = allElements.stream()
                .filter(e -> deploymentKinds.contains(e.getElementType()))
                .sorted(Comparator.comparing(e -> e.getId().toString()))
                .toList();

        if (deploymentNodes.isEmpty()) {
            deploymentNodes = allElements.stream()
                    .sorted(Comparator.comparing(e -> e.getId().toString()))
                    .toList();
        }

        ObjectNode layout = objectMapper.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", modelVersion.getId().toString())
                .put("viewType", "4+1_DEPLOYMENT");

        ArrayNode positions = layout.putArray("nodes");
        Set<UUID> nodeIds = new HashSet<>();

        for (int i = 0; i < deploymentNodes.size(); i++) {
            ModelElement node = deploymentNodes.get(i);
            nodeIds.add(node.getId());
            double x = (i % 6) * 300.0;
            double y = (i / 6) * 200.0;

            ObjectNode point = positions.addObject()
                    .put("id", node.getId().toString())
                    .put("name", node.getName())
                    .put("kind", node.getElementType())
                    .put("type", node.getElementType())
                    .put("status", node.getStatus())
                    .put("languageStack", node.getLanguageStack())
                    .put("x", x)
                    .put("y", y);

            point.putObject("position").put("x", x).put("y", y);
            point.putObject("data")
                    .put("label", node.getName())
                    .put("status", node.getStatus())
                    .put("technology", node.getLanguageStack());
        }

        ArrayNode connections = layout.putArray("edges");
        allRelationships.stream()
                .filter(e -> nodeIds.contains(e.getSourceElement().getId()) && nodeIds.contains(e.getTargetElement().getId()))
                .sorted(Comparator.comparing(e -> e.getId().toString()))
                .forEach(e -> connections.addObject()
                        .put("id", e.getId().toString())
                        .put("from", e.getSourceElement().getId().toString())
                        .put("to", e.getTargetElement().getId().toString())
                        .put("type", e.getRelationType())
                        .put("source", e.getSourceElement().getId().toString())
                        .put("target", e.getTargetElement().getId().toString())
                        .put("relationType", e.getRelationType())
                        .put("originLayer", e.getOriginLayer())
                        .put("direction", e.getDirection()));

        DiagramVersion deploymentDiagram = DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("VIEW_4_PLUS_1")
                .level("DEPLOYMENT")
                .layoutJson(layout)
                .build();

        deploymentDiagram = diagramVersionRepository.save(deploymentDiagram);
        log.info("Đã tạo mới thành công bản vẽ VIEW_4_PLUS_1 DEPLOYMENT ID: {}", deploymentDiagram.getId());

        return DiagramResponseDTO.fromEntity(deploymentDiagram);
    }

    private String generatePlantUml(DiagramVersion diagram) {
        if ("C4".equalsIgnoreCase(diagram.getNotation())) return generateC4PlantUml(diagram);
        StringBuilder sb = new StringBuilder();
        sb.append("@startuml\n");
        sb.append("skinparam componentStyle uml2\n");
        sb.append("skinparam monochrome false\n\n");

        JsonNode layout = diagram.getLayoutJson();
        if (layout != null && "UML_SEQUENCE".equalsIgnoreCase(diagram.getNotation())) {
            sb.append("autonumber\n");
            JsonNode steps = layout.path("steps");
            if (steps.isArray()) {
                for (JsonNode step : steps) {
                    String caller = sanitizePlantUmlId(step.path("callerService").asText("Client"));
                    String callee = sanitizePlantUmlId(step.path("calleeService").asText("Service"));
                    String op = step.path("operation").asText("Execute");
                    int code = step.path("httpStatusCode").asInt(200);
                    long ms = step.path("durationMs").asLong(0L);
                    sb.append(caller).append(" -> ").append(callee).append(" : [")
                            .append(step.path("stepOrder").asInt(1)).append("] ")
                            .append(op).append(" (").append(code).append(" - ").append(ms).append("ms)\n");
                }
            }
            sb.append("@enduml\n");
            return sb.toString();
        }

        if (layout != null) {
            JsonNode nodes = layout.path("nodes");
            if (nodes.isArray()) {
                for (JsonNode n : nodes) {
                    String id = n.path("id").asText();
                    String name = n.path("name").asText("Node");
                    String kind = n.path("kind").asText(n.path("type").asText(""));
                    String alias = MermaidDslGenerator.toSafeAlias(id);

                    if ("DATABASE".equalsIgnoreCase(kind)) {
                        sb.append("database \"").append(escapePlantUml(name)).append("\" as ").append(alias).append("\n");
                    } else if ("QUEUE_BROKER".equalsIgnoreCase(kind)) {
                        sb.append("queue \"").append(escapePlantUml(name)).append("\" as ").append(alias).append("\n");
                    } else {
                        sb.append("component \"").append(escapePlantUml(name)).append("\" as ").append(alias).append("\n");
                    }
                }
            }

            sb.append("\n");
            JsonNode edges = layout.path("edges");
            if (edges.isArray()) {
                for (JsonNode e : edges) {
                    String srcId = e.path("from").asText(e.path("source").asText(""));
                    String tgtId = e.path("to").asText(e.path("target").asText(""));
                    if (srcId.isBlank() || tgtId.isBlank()) continue;

                    String srcAlias = MermaidDslGenerator.toSafeAlias(srcId);
                    String tgtAlias = MermaidDslGenerator.toSafeAlias(tgtId);
                    String type = e.path("relationType").asText(e.path("type").asText(""));
                    String origin = e.path("originLayer").asText("STATIC");

                    sb.append(srcAlias).append(" --> ").append(tgtAlias)
                            .append(" : ").append(escapePlantUml(type))
                            .append(" [").append(origin).append("]\n");
                }
            }
        }

        sb.append("@enduml\n");
        return sb.toString();
    }

    private String generateC4PlantUml(DiagramVersion diagram) {
        StringBuilder sb = new StringBuilder("@startuml\nleft to right direction\nskinparam shadowing false\nskinparam roundcorner 8\nskinparam rectangle {\n BackgroundColor #1168BD\n FontColor white\n BorderColor #0B4884\n}\n");
        Map<String, JsonNode> nodes = new LinkedHashMap<>();
        Map<String, List<JsonNode>> groups = new LinkedHashMap<>();
        JsonNode layout = diagram.getLayoutJson();
        if (layout != null) layout.path("nodes").forEach(node -> nodes.put(node.path("id").asText(), node));
        boolean componentView = "COMPONENT".equalsIgnoreCase(diagram.getLevel());
        if (componentView) {
            for (JsonNode node : nodes.values()) {
                String parent = node.path("parentId").asText("");
                if (nodes.containsKey(parent)) groups.computeIfAbsent(parent, key -> new ArrayList<>()).add(node);
            }
        }
        for (JsonNode node : nodes.values()) {
            if (componentView && nodes.containsKey(node.path("parentId").asText(""))) continue;
            appendC4PlantNode(sb, node);
        }
        for (Map.Entry<String, List<JsonNode>> group : groups.entrySet()) {
            sb.append("package \"").append(escapePlantUml(nodes.get(group.getKey()).path("name").asText()))
                    .append(" components\" as b_").append(MermaidDslGenerator.toSafeAlias(group.getKey())).append(" {\n");
            for (JsonNode node : group.getValue()) appendC4PlantNode(sb, node);
            sb.append("}\n");
        }
        if (layout != null) for (JsonNode edge : layout.path("edges")) {
            String from = edge.path("from").asText(edge.path("source").asText(""));
            String to = edge.path("to").asText(edge.path("target").asText(""));
            if (!nodes.containsKey(from) || !nodes.containsKey(to)) continue;
            sb.append(MermaidDslGenerator.toSafeAlias(from)).append(" --> ")
                    .append(MermaidDslGenerator.toSafeAlias(to)).append(" : ")
                    .append(escapePlantUml(edge.path("relationType").asText(edge.path("type").asText("Uses")))).append("\n");
        }
        return sb.append("@enduml\n").toString();
    }

    private void appendC4PlantNode(StringBuilder sb, JsonNode node) {
        String kind = node.path("kind").asText(node.path("type").asText(""));
        String stereotype = switch (kind.toUpperCase(Locale.ROOT)) {
            case "SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER" -> "Container";
            case "EXTERNAL_SYSTEM" -> "Software System";
            default -> "Component";
        };
        String shape = switch (kind.toUpperCase(Locale.ROOT)) {
            case "DATABASE" -> "database";
            case "QUEUE_BROKER" -> "queue";
            default -> "rectangle";
        };
        sb.append(shape).append(" \"").append(escapePlantUml(node.path("name").asText("Element")))
                .append("\\n[").append(stereotype);
        String technology = node.path("languageStack").asText("");
        if (!technology.isBlank()) sb.append(": ").append(escapePlantUml(technology));
        sb.append("]\" as ").append(MermaidDslGenerator.toSafeAlias(node.path("id").asText()))
                .append(" <<").append(stereotype).append(">>\n");
    }
    private String generateDrawioXml(DiagramVersion diagram) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<mxfile host=\"app.diagrams.net\" modified=\"").append(OffsetDateTime.now())
                .append("\" agent=\"MAVIS-Platform\" version=\"21.0.0\" type=\"device\">\n");
        sb.append("  <diagram id=\"").append(diagram.getId()).append("\" name=\"").append(escapeXml(diagram.getNotation()))
                .append(" - ").append(escapeXml(diagram.getLevel())).append("\">\n");
        sb.append("    <mxGraphModel dx=\"1422\" dy=\"794\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"1169\" pageHeight=\"827\" math=\"0\" shadow=\"0\">\n");
        sb.append("      <root>\n");
        sb.append("        <mxCell id=\"0\"/>\n");
        sb.append("        <mxCell id=\"1\" parent=\"0\"/>\n");

        JsonNode layout = diagram.getLayoutJson();
        if (layout != null) {
            JsonNode nodes = layout.path("nodes");
            if (nodes.isArray()) {
                for (JsonNode n : nodes) {
                    String id = n.path("id").asText();
                    String name = n.path("name").asText("Node");
                    String kind = n.path("kind").asText(n.path("type").asText(""));
                    double x = n.path("x").asDouble(100.0);
                    double y = n.path("y").asDouble(100.0);
                    String alias = MermaidDslGenerator.toSafeAlias(id);

                    String style;
                    double width = 160.0;
                    double height = 80.0;

                    if ("DATABASE".equalsIgnoreCase(kind)) {
                        style = "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#dae8fc;strokeColor=#6c8ebf;";
                        width = 120.0;
                        height = 90.0;
                    } else if ("QUEUE_BROKER".equalsIgnoreCase(kind)) {
                        style = "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#d5e8d4;strokeColor=#82b366;";
                        width = 140.0;
                        height = 70.0;
                    } else if ("SERVICE_CONTAINER".equalsIgnoreCase(kind)) {
                        style = "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontStyle=1;";
                    } else {
                        style = "rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;fontColor=#333333;strokeColor=#666666;";
                    }

                    sb.append("        <mxCell id=\"").append(alias).append("\" value=\"").append(escapeXml(name))
                            .append("\" style=\"").append(style).append("\" vertex=\"1\" parent=\"1\">\n");
                    sb.append("          <mxGeometry x=\"").append(x).append("\" y=\"").append(y)
                            .append("\" width=\"").append(width).append("\" height=\"").append(height).append("\" as=\"geometry\"/>\n");
                    sb.append("        </mxCell>\n");
                }
            }

            JsonNode edges = layout.path("edges");
            if (edges.isArray()) {
                for (JsonNode e : edges) {
                    String edgeId = e.path("id").asText(UUID.randomUUID().toString());
                    String srcId = e.path("from").asText(e.path("source").asText(""));
                    String tgtId = e.path("to").asText(e.path("target").asText(""));
                    if (srcId.isBlank() || tgtId.isBlank()) continue;

                    String srcAlias = MermaidDslGenerator.toSafeAlias(srcId);
                    String tgtAlias = MermaidDslGenerator.toSafeAlias(tgtId);
                    String label = e.path("relationType").asText(e.path("type").asText(""));

                    sb.append("        <mxCell id=\"edge_").append(MermaidDslGenerator.toSafeAlias(edgeId))
                            .append("\" value=\"").append(escapeXml(label))
                            .append("\" style=\"endArrow=classic;html=1;rounded=0;\" edge=\"1\" parent=\"1\" source=\"")
                            .append(srcAlias).append("\" target=\"").append(tgtAlias).append("\">\n");
                    sb.append("          <mxGeometry relative=\"1\" as=\"geometry\"/>\n");
                    sb.append("        </mxCell>\n");
                }
            }
        }

        sb.append("      </root>\n");
        sb.append("    </mxGraphModel>\n");
        sb.append("  </diagram>\n");
        sb.append("</mxfile>\n");

        return sb.toString();
    }

    private String generateJson(DiagramVersion diagram) {
        try {
            ModelVersion mv = diagram.getModelVersion();
            UUID snapshotId = mv.getSourceSnapshot() != null ? mv.getSourceSnapshot().getId() : null;

            Map<String, Object> exportMap = new LinkedHashMap<>();
            exportMap.put("diagramId", diagram.getId());
            exportMap.put("modelVersionId", mv.getId());
            exportMap.put("sourceSnapshotId", snapshotId);
            exportMap.put("modelRevision", mv.getRevision());
            exportMap.put("notation", diagram.getNotation());
            exportMap.put("level", diagram.getLevel());
            exportMap.put("createdAt", diagram.getCreatedAt());
            exportMap.put("layoutJson", diagram.getLayoutJson());

            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(exportMap);
        } catch (Exception e) {
            log.error("Lỗi khi serialize JSON sơ đồ", e);
            return "{}";
        }
    }

    private void populateNodeClickMap(JsonNode layoutJson, Map<String, UUID> clickMap) {
        if (layoutJson == null) return;
        JsonNode nodes = layoutJson.path("nodes");
        if (nodes.isArray()) {
            for (JsonNode n : nodes) {
                String id = n.path("id").asText();
                if (!id.isBlank()) {
                    try {
                        String alias = MermaidDslGenerator.toSafeAlias(id);
                        clickMap.put(alias, UUID.fromString(id));
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    private void checkProjectReadAccess(Project project) {
        if (accessPolicyService != null) {
            accessPolicyService.requireProjectReadAccess(project);
        } else {
            UUID currentUserId = SecurityUtils.getCurrentUserId();
            if (project.getOwner() != null && !project.getOwner().getId().equals(currentUserId)) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập sơ đồ của dự án này");
            }
        }
    }

    private static String sanitizePlantUmlId(String val) {
        if (val == null || val.isBlank()) return "Node";
        return val.replaceAll("[^a-zA-Z0-9_]", "_");
    }

    private static String escapePlantUml(String val) {
        if (val == null) return "";
        return val.replace("\"", "'").replace("\n", " ");
    }

    private static String escapeXml(String val) {
        if (val == null) return "";
        return val.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}
