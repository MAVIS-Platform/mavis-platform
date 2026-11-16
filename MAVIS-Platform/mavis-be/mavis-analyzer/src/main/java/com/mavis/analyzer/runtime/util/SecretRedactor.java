package com.mavis.analyzer.runtime.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public class SecretRedactor {

    public static final String REDACTED_MARKER = "[REDACTED]";

    private static final Set<String> SENSITIVE_KEY_SUBSTRINGS = Set.of(
            "password", "token", "secret", "authorization", "apikey", "api_key",
            "access_token", "client_secret", "private_key", "credential", "cloudinary_url"
    );

    private static final Pattern PEM_PRIVATE_KEY_PATTERN = Pattern.compile("-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)");
    private static final Pattern BEARER_PATTERN = Pattern.compile("(?i)(bearer\\s+)[A-Za-z0-9_\\-\\.]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern QUERY_PARAM_SECRET = Pattern.compile("(?i)(password|token|secret|apikey|api_key)=([^&\\s]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern COLON_SECRET_PATTERN = Pattern.compile("(?i)\\b(password|token|secret|apikey|api_key|api-key)(\\s*:\\s*)(?:\"[^\"\\r\\n]*\"|'[^'\\r\\n]*'|[^\\s,;\"'&}]+)");
    private static final Pattern URI_USERINFO_PATTERN = Pattern.compile("([a-zA-Z][a-zA-Z0-9+.-]*://[^/:@\\s]+:)([^@\\s/]+)(@)");
    private static final Pattern OPENAI_KEY_PATTERN = Pattern.compile("\\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\\b");
    private static final Pattern GEMINI_KEY_PATTERN = Pattern.compile("\\bAIza[0-9A-Za-z_-]{20,}\\b");
    private static final Pattern GITHUB_TOKEN_PATTERN = Pattern.compile("\\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\\b");
    private static final Pattern AWS_KEY_PATTERN = Pattern.compile("\\bAKIA[A-Z0-9]{16}\\b");
    private static final Pattern JWT_TOKEN_PATTERN = Pattern.compile("\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b");

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Khử toàn bộ chuỗi nhạy cảm trong JsonNode (hỗ trợ cả key nhạy cảm và pattern trong value).
     */
    public static JsonNode redactJson(JsonNode input) {
        if (input == null || input.isNull()) {
            return input;
        }

        if (input.isObject()) {
            ObjectNode objectNode = (ObjectNode) input.deepCopy();
            Iterator<Map.Entry<String, JsonNode>> fields = objectNode.fields();
            ObjectNode redactedNode = OBJECT_MAPPER.createObjectNode();

            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String key = entry.getKey();
                JsonNode value = entry.getValue();

                if ("secretHeaders".equalsIgnoreCase(key)) {
                    redactedNode.set(key, value.deepCopy());
                } else if ("extract".equalsIgnoreCase(key) && value.isObject()) {
                    redactedNode.set(key, value.deepCopy());
                } else if ("headers".equalsIgnoreCase(key) && value.isObject()) {
                    ObjectNode hdrCopy = OBJECT_MAPPER.createObjectNode();
                    value.fields().forEachRemaining(he -> {
                        String hv = he.getValue().asText("");
                        if (hv.matches("(?i)(?:Bearer\\s+)?\\{\\{[A-Za-z][A-Za-z0-9_]*}}")) {
                            hdrCopy.put(he.getKey(), hv);
                        } else if (isSensitiveKey(he.getKey())) {
                            hdrCopy.put(he.getKey(), REDACTED_MARKER);
                        } else {
                            hdrCopy.put(he.getKey(), redactString(hv));
                        }
                    });
                    redactedNode.set(key, hdrCopy);
                } else if (value.isObject() || value.isArray()) {
                    redactedNode.set(key, redactJson(value));
                } else if (isSensitiveKey(key)) {
                    redactedNode.put(key, REDACTED_MARKER);
                } else if (value.isTextual()) {
                    redactedNode.put(key, redactString(value.asText()));
                } else {
                    redactedNode.set(key, value);
                }
            }
            return redactedNode;
        } else if (input.isArray()) {
            ArrayNode arrayNode = OBJECT_MAPPER.createArrayNode();
            for (JsonNode item : input) {
                arrayNode.add(redactJson(item));
            }
            return arrayNode;
        } else if (input.isTextual()) {
            return new TextNode(redactString(input.asText()));
        }

        return input;
    }

    /**
     * Khử chuỗi nhạy cảm trong String (dùng cho URLs, Headers, Attributes của OpenTelemetry Span).
     */
    public static String redactString(String input) {
        if (input == null || input.isBlank()) {
            return input;
        }

        String result = PEM_PRIVATE_KEY_PATTERN.matcher(input).replaceAll(REDACTED_MARKER);
        result = BEARER_PATTERN.matcher(result).replaceAll("$1" + REDACTED_MARKER);
        result = QUERY_PARAM_SECRET.matcher(result).replaceAll("$1=" + REDACTED_MARKER);
        result = COLON_SECRET_PATTERN.matcher(result).replaceAll("$1$2" + REDACTED_MARKER);
        result = URI_USERINFO_PATTERN.matcher(result).replaceAll("$1" + REDACTED_MARKER + "$3");
        result = OPENAI_KEY_PATTERN.matcher(result).replaceAll(REDACTED_MARKER);
        result = GEMINI_KEY_PATTERN.matcher(result).replaceAll(REDACTED_MARKER);
        result = GITHUB_TOKEN_PATTERN.matcher(result).replaceAll(REDACTED_MARKER);
        result = AWS_KEY_PATTERN.matcher(result).replaceAll(REDACTED_MARKER);
        result = JWT_TOKEN_PATTERN.matcher(result).replaceAll(REDACTED_MARKER);
        return result;
    }

    /**
     * Kiểm tra xem key có chứa từ khóa nhạy cảm không.
     */
    public static boolean isSensitiveKey(String key) {
        if (key == null) return false;
        String lowerKey = key.toLowerCase();
        return SENSITIVE_KEY_SUBSTRINGS.stream().anyMatch(lowerKey::contains);
    }
}
