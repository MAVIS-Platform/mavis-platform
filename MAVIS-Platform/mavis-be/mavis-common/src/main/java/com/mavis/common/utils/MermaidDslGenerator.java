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

        if ("C4".equalsIgnoreCase(notation)) {
            return generateC4Diagram(layoutJson, "COMPONENT".equalsIgnoreCase(level));
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

    private static MermaidResult generateC4Diagram(JsonNode layoutJson, boolean componentView) {
        StringBuilder sb = new StringBuilder(componentView ? "C4Component\n" : "C4Container\n");
        Map<String, UUID> clickMap = new LinkedHashMap<>();
        Map<String, JsonNode> nodes = new LinkedHashMap<>();
        Map<String, List<JsonNode>> children = new LinkedHashMap<>();
        layoutJson.path("nodes").forEach(node -> nodes.put(node.path("id").asText(), node));
        if (componentView) {
            for (JsonNode node : nodes.values()) {
                String parent = node.path("parentId").asText("");
                if (nodes.containsKey(parent)) children.computeIfAbsent(parent, key -> new ArrayList<>()).add(node);
            }
        }
        for (JsonNode node : nodes.values()) {
            String parent = node.path("parentId").asText("");
            if (componentView && nodes.containsKey(parent)) continue;
            appendC4Node(sb, node, clickMap);
        }
        for (Map.Entry<String, List<JsonNode>> group : children.entrySet()) {
            JsonNode parent = nodes.get(group.getKey());
            sb.append("    Container_Boundary(b_").append(toSafeAlias(group.getKey()))
                    .append(", \"").append(escapeLabel(parent.path("name").asText())).append(" components\") {\n");
            for (JsonNode node : group.getValue()) appendC4Node(sb, node, clickMap);
            sb.append("    }\n");
        }
        for (JsonNode edge : layoutJson.path("edges")) {
            String from = edge.path("from").asText(edge.path("source").asText(""));
            String to = edge.path("to").asText(edge.path("target").asText(""));
            if (!nodes.containsKey(from) || !nodes.containsKey(to)) continue;
            sb.append("    Rel(").append(toSafeAlias(from)).append(", ").append(toSafeAlias(to))
                    .append(", \"").append(escapeLabel(edge.path("relationType").asText(edge.path("type").asText("Uses"))))
                    .append("\")\n");
        }
        sb.append("    UpdateLayoutConfig(\"3\", \"2\")\n");
        return MermaidResult.builder().dsl(sb.toString().trim()).nodeClickMap(clickMap).build();
    }

    private static void appendC4Node(StringBuilder sb, JsonNode node, Map<String, UUID> clickMap) {
        String id = node.path("id").asText();
        String kind = node.path("kind").asText(node.path("type").asText(""));
        String macro = switch (kind.toUpperCase(Locale.ROOT)) {
            case "SERVICE_CONTAINER" -> "Container";
            case "DATABASE" -> "ContainerDb";
            case "QUEUE_BROKER" -> "ContainerQueue";
            case "EXTERNAL_SYSTEM" -> "System_Ext";
            default -> "Component";
        };
        sb.append("    ").append(macro).append("(").append(toSafeAlias(id)).append(", \"")
                .append(escapeLabel(node.path("name").asText("Element"))).append("\"");
        if (!"System_Ext".equals(macro)) sb.append(", \"").append(escapeLabel(node.path("languageStack").asText(""))).append("\"");
        sb.append(")\n");
        registerClick(clickMap, toSafeAlias(id), id);
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
