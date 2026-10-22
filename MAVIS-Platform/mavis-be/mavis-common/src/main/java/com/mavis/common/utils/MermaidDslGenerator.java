package com.mavis.common.utils;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Builder;
import lombok.Getter;

import java.util.*;

/**
 * Bộ sinh cú pháp Mermaid DSL tương tác (Ticket B3, T09, T15).
 * Hỗ trợ UML_SEQUENCE, C4 COMPONENT (subgraph), C4 CONTAINER, DEPENDENCY_GRAPH và VIEW_4_PLUS_1.
 */
public final class MermaidDslGenerator {

    private MermaidDslGenerator() {}

    @Getter
    @Builder
    public static class MermaidResult {
        private final String dsl;
        private final Map<String, UUID> nodeClickMap;
    }

    /**
     * Sinh cú pháp Mermaid từ layoutJson của DiagramVersion.
     */
    public static MermaidResult generateFromLayoutJson(String notation, String level, JsonNode layoutJson) {
        if (layoutJson == null || layoutJson.isNull()) {
            return MermaidResult.builder()
                    .dsl("flowchart LR\n    emptyNode[\"Trống - Chưa có bố cục\"]")
                    .nodeClickMap(Collections.emptyMap())
                    .build();
        }

        if ("UML_SEQUENCE".equalsIgnoreCase(notation)) {
            return generateSequenceDiagram(layoutJson);
        }

        if ("C4".equalsIgnoreCase(notation) && "COMPONENT".equalsIgnoreCase(level)) {
            return generateC4ComponentDiagram(layoutJson);
        }

        return generateGraphDiagram(layoutJson);
    }

    private static MermaidResult generateSequenceDiagram(JsonNode layoutJson) {
        StringBuilder sb = new StringBuilder();
        sb.append("sequenceDiagram\n");
        sb.append("    autonumber\n");

        JsonNode stepsNode = layoutJson.path("steps");
        Set<String> participants = new LinkedHashSet<>();
        Map<String, UUID> clickMap = new LinkedHashMap<>();

        if (stepsNode.isArray()) {
            for (JsonNode step : stepsNode) {
                String caller = step.path("callerService").asText("");
                String callee = step.path("calleeService").asText("");
                if (!caller.isBlank()) participants.add(caller);
                if (!callee.isBlank()) participants.add(callee);
            }

            for (String participant : participants) {
                String safeName = sanitizeParticipant(participant);
                sb.append("    participant ").append(safeName).append(" as ").append(participant).append("\n");
            }

            for (JsonNode step : stepsNode) {
                int order = step.path("stepOrder").asInt(1);
                String caller = sanitizeParticipant(step.path("callerService").asText("Client"));
                String callee = sanitizeParticipant(step.path("calleeService").asText("Service"));
                String operation = step.path("operation").asText("Execute");
                int statusCode = step.path("httpStatusCode").asInt(200);
                long durationMs = step.path("durationMs").asLong(0L);

                sb.append("    ").append(caller).append("->>+").append(callee)
                        .append(": [").append(order).append("] ")
                        .append(operation)
                        .append(" (").append(statusCode).append(" - ").append(durationMs).append("ms)\n");
            }
        } else {
            sb.append("    participant System as System\n");
            sb.append("    System->>+System: Không có bước runtime nào được ghi nhận\n");
        }

        return MermaidResult.builder()
                .dsl(sb.toString().trim())
                .nodeClickMap(clickMap)
                .build();
    }

    private static MermaidResult generateC4ComponentDiagram(JsonNode layoutJson) {
        StringBuilder sb = new StringBuilder();
        sb.append("flowchart TB\n");

        Map<String, UUID> clickMap = new LinkedHashMap<>();
        JsonNode nodes = layoutJson.path("nodes");
        JsonNode edges = layoutJson.path("edges");

        // Gom nhóm theo parentId
        Map<String, List<JsonNode>> componentsByParent = new LinkedHashMap<>();
        List<JsonNode> standaloneNodes = new ArrayList<>();
        Map<String, JsonNode> nodeById = new HashMap<>();

        if (nodes.isArray()) {
            for (JsonNode n : nodes) {
                String id = n.path("id").asText();
                nodeById.put(id, n);
                String parentId = n.path("parentId").asText(null);
                if (parentId != null && !parentId.isBlank()) {
                    componentsByParent.computeIfAbsent(parentId, k -> new ArrayList<>()).add(n);
                } else if ("SERVICE_CONTAINER".equalsIgnoreCase(n.path("kind").asText())
                        || "SERVICE_CONTAINER".equalsIgnoreCase(n.path("type").asText())) {
                    // Sẽ được vẽ kèm các component con
                    componentsByParent.computeIfAbsent(id, k -> new ArrayList<>());
                } else {
                    standaloneNodes.add(n);
                }
            }
        }

        // Vẽ subgraphs
        for (Map.Entry<String, List<JsonNode>> entry : componentsByParent.entrySet()) {
            String parentId = entry.getKey();
            JsonNode parentNode = nodeById.get(parentId);
            String parentName = parentNode != null ? parentNode.path("name").asText("Container") : "Container";
            String parentAlias = toSafeAlias(parentId);

            sb.append("    subgraph sub_").append(parentAlias).append(" [\"").append(escapeLabel(parentName)).append("\"]\n");
            for (JsonNode comp : entry.getValue()) {
                String compId = comp.path("id").asText();
                String compName = comp.path("name").asText("Component");
                String compAlias = toSafeAlias(compId);
                sb.append("        ").append(compAlias).append("[\"").append(escapeLabel(compName)).append("\"]\n");
                registerClick(clickMap, compAlias, compId);
            }
            sb.append("    end\n");
        }

        // Vẽ standalone nodes
        for (JsonNode n : standaloneNodes) {
            String id = n.path("id").asText();
            String name = n.path("name").asText("Node");
            String kind = n.path("kind").asText(n.path("type").asText(""));
            String alias = toSafeAlias(id);
            sb.append("    ").append(formatNodeShape(alias, name, kind, n.path("languageStack").asText(null))).append("\n");
            registerClick(clickMap, alias, id);
        }

        // Vẽ edges
        appendEdges(sb, edges);

        // Click handlers
        appendClickHandlers(sb, clickMap);

        return MermaidResult.builder()
                .dsl(sb.toString().trim())
                .nodeClickMap(clickMap)
                .build();
    }

    private static MermaidResult generateGraphDiagram(JsonNode layoutJson) {
        StringBuilder sb = new StringBuilder();
        sb.append("flowchart LR\n");

        Map<String, UUID> clickMap = new LinkedHashMap<>();
        JsonNode nodes = layoutJson.path("nodes");
        JsonNode edges = layoutJson.path("edges");

        if (nodes.isArray()) {
            for (JsonNode n : nodes) {
                String id = n.path("id").asText();
                String name = n.path("name").asText("Node");
                String kind = n.path("kind").asText(n.path("type").asText(""));
                String lang = n.path("languageStack").asText(null);
                String alias = toSafeAlias(id);

                sb.append("    ").append(formatNodeShape(alias, name, kind, lang)).append("\n");
                registerClick(clickMap, alias, id);
            }
        }

        appendEdges(sb, edges);
        appendClickHandlers(sb, clickMap);

        return MermaidResult.builder()
                .dsl(sb.toString().trim())
                .nodeClickMap(clickMap)
                .build();
    }

    private static void appendEdges(StringBuilder sb, JsonNode edges) {
        if (!edges.isArray()) return;
        for (JsonNode e : edges) {
            String srcId = e.path("from").asText(e.path("source").asText(""));
            String tgtId = e.path("to").asText(e.path("target").asText(""));
            if (srcId.isBlank() || tgtId.isBlank()) continue;

            String srcAlias = toSafeAlias(srcId);
            String tgtAlias = toSafeAlias(tgtId);
            String relationType = e.path("relationType").asText(e.path("type").asText(""));
            String originLayer = e.path("originLayer").asText("STATIC");

            String arrow;
            if ("RUNTIME".equalsIgnoreCase(originLayer) || "STATIC_AND_RUNTIME".equalsIgnoreCase(originLayer)) {
                arrow = relationType.isBlank() ? "==>" : "== \"" + escapeLabel(relationType) + "\" ==>";
            } else if ("DECLARED_COMPOSE".equalsIgnoreCase(originLayer)) {
                arrow = relationType.isBlank() ? "-.->" : "-. \"" + escapeLabel(relationType) + "\" .->";
            } else {
                arrow = relationType.isBlank() ? "-->" : "-- \"" + escapeLabel(relationType) + "\" -->";
            }

            sb.append("    ").append(srcAlias).append(" ").append(arrow).append(" ").append(tgtAlias).append("\n");
        }
    }

    private static void appendClickHandlers(StringBuilder sb, Map<String, UUID> clickMap) {
        for (Map.Entry<String, UUID> entry : clickMap.entrySet()) {
            sb.append("    click ").append(entry.getKey())
                    .append(" call onMavisElementClick(\"").append(entry.getValue()).append("\")")
                    .append(" \"Xem bằng chứng mã nguồn\"\n");
        }
    }

    private static String formatNodeShape(String alias, String name, String kind, String languageStack) {
        String escapedName = escapeLabel(name);
        if ("DATABASE".equalsIgnoreCase(kind)) {
            return alias + "[(\"" + escapedName + "\")]";
        }
        if ("QUEUE_BROKER".equalsIgnoreCase(kind)) {
            return alias + "[[\"" + escapedName + "\"]]";
        }
        if ("SERVICE_CONTAINER".equalsIgnoreCase(kind)) {
            if (languageStack != null && !languageStack.isBlank()) {
                return alias + "[\"" + escapedName + "<br/>[" + escapeLabel(languageStack) + "]\"]";
            }
            return alias + "[\"" + escapedName + "\"]";
        }
        return alias + "[\"" + escapedName + "\"]";
    }

    public static String toSafeAlias(String id) {
        if (id == null) return "node_null";
        return "n_" + id.replace("-", "");
    }

    private static String sanitizeParticipant(String name) {
        if (name == null || name.isBlank()) return "Unknown";
        return name.replaceAll("[^a-zA-Z0-9_]", "_");
    }

    private static String escapeLabel(String label) {
        if (label == null) return "";
        return label.replace("\"", "'").replace("\n", " ");
    }

    private static void registerClick(Map<String, UUID> map, String alias, String id) {
        try {
            map.put(alias, UUID.fromString(id));
        } catch (Exception ignored) {}
    }
}
