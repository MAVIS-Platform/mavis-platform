package com.mavis.common.utils;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** Exact coursework catalog, independent of legacy storage notation families. */
public final class CourseworkDiagramTypes {
    private CourseworkDiagramTypes() { }
    public static final Set<String> CURRENT = Set.of("C4_CONTEXT", "C4_CONTAINER", "C4_COMPONENT",
        "UML_CLASS", "UML_SEQUENCE", "UML_PACKAGE", "UML_DEPLOYMENT", "UML_ACTIVITY", "UML_STATE", "DEPENDENCY_GRAPH");
    public static final Set<String> GUIDED_STATIC = Set.of("C4_CONTEXT", "C4_CONTAINER", "C4_COMPONENT", "DEPENDENCY_GRAPH");
    public static boolean supportedRequirement(String type) {
        return CURRENT.contains(type) || "C4".equals(type) || "VIEW_4_PLUS_1".equals(type);
    }
    public static String fromView(String view) {
        String key = view.toLowerCase(Locale.ROOT).split(":", 2)[0];
        if (Set.of("context", "c4-context", "c4_context").contains(key)) return "C4_CONTEXT";
        if (Set.of("container", "containers", "c4-container", "c4_container").contains(key)) return "C4_CONTAINER";
        if (Set.of("component", "components", "c4-component", "c4_component").contains(key)) return "C4_COMPONENT";
        for (var type : CURRENT) if (key.equals(type.toLowerCase(Locale.ROOT)) || key.equals(type.toLowerCase(Locale.ROOT).replace('_', '-'))) return type;
        if (key.contains("scenario") || key.contains("sequence")) return "UML_SEQUENCE";
        if (Set.of("graph", "overview").contains(key)) return "DEPENDENCY_GRAPH";
        if (Set.of("logical", "development", "process", "deployment").contains(key)) return "VIEW_4_PLUS_1";
        return "UNKNOWN";
    }
    public static String fromArtifact(String notation, String level, JsonNode layout) {
        if (layout != null) {
            String declared = layout.path("diagramType").asText();
            if (CURRENT.contains(declared)) return declared;
            String view = layout.path("viewId").asText();
            if (!view.isBlank() && !"UNKNOWN".equals(fromView(view))) return fromView(view);
        }
        if ("C4".equals(notation) && Set.of("CONTEXT", "CONTAINER", "COMPONENT").contains(level == null ? "" : level)) return "C4_" + level;
        return notation;
    }
    public static Set<String> supplied(String notation, String level, JsonNode layout) {
        var found = new HashSet<String>();collect(found, notation, level, layout, 0);
        if (found.stream().anyMatch(type -> type != null && type.startsWith("C4_"))) found.add("C4");
        return found;
    }
    private static void collect(Set<String> found, String notation, String level, JsonNode layout, int depth) {
        found.add(fromArtifact(notation, level, layout));
        if (layout != null && depth < 4) for (var artifact : layout.path("artifacts")) {
            collect(found, artifact.path("notation").asText(), artifact.path("level").asText(), artifact.path("layoutJson"), depth + 1);
        }
    }
}
