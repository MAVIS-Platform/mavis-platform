package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import java.util.HashSet;
import java.util.Set;

/** Public, bounded topology metadata for a pinned, prepared runtime profile. */
public final class PreparedStudioTopology {
    private PreparedStudioTopology() {}

    public static ObjectNode read(JsonNode profile, Set<String> services, ObjectMapper mapper) {
        JsonNode input = profile == null ? null : profile.get("studioTopology");
        if (input == null || input.isNull()) return null;
        if (!input.isObject() || input.path("version").asInt() != 1 ||
            !input.path("blocks").isArray() || input.path("blocks").isEmpty() ||
            input.path("blocks").size() > 10 || !input.path("connections").isArray() ||
            input.path("connections").size() > 20)
            throw invalid();
        var result = mapper.createObjectNode().put("version", 1);
        var blocks = result.putArray("blocks");
        var blockNames = new HashSet<String>();
        for (var item : input.path("blocks")) {
            String service = name(item, "service", services);
            if (!blockNames.add(service)) throw invalid();
            String label = text(item, "label", 64);
            blocks.addObject().put("service", service).put("label", label)
                .put("canScale", item.path("canScale").asBoolean(false))
                .put("initiallyStopped", item.path("initiallyStopped").asBoolean(false));
        }
        var connections = result.putArray("connections");
        var controllers = new HashSet<String>();
        var pairs = new HashSet<String>();
        for (var item : input.path("connections")) {
            String from = name(item, "from", blockNames);
            String to = name(item, "to", blockNames);
            String controller = name(item, "controllerService", services);
            if (from.equals(to) || blockNames.contains(controller) || !controllers.add(controller) ||
                !pairs.add(from + "->" + to)) throw invalid();
            connections.addObject().put("from", from).put("to", to)
                .put("controllerService", controller).put("protocol", text(item, "protocol", 32))
                .put("initiallyStopped", item.path("initiallyStopped").asBoolean(false));
        }
        return result;
    }

    private static String name(JsonNode item, String key, Set<String> allowed) {
        String value = text(item, key, 128);
        if (!allowed.contains(value) || value.equals("mavis-collector")) throw invalid();
        return value;
    }

    private static String text(JsonNode item, String key, int max) {
        JsonNode value = item.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank() ||
            value.asText().length() > max || value.asText().chars().anyMatch(Character::isISOControl))
            throw invalid();
        return value.asText();
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.BAD_REQUEST, "Invalid prepared Studio topology. Use pinned application services and dedicated connection controllers.");
    }
}
