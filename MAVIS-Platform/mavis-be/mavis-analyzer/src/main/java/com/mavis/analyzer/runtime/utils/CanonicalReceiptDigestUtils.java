package com.mavis.analyzer.runtime.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;

/**
 * Tiện ích chuẩn hóa Canonical JSON và tính SHA-256 Receipt Digest theo Hợp đồng Chặng 11.
 * - Đệ quy duyệt JsonNode:
 *   + Với ObjectNode: Bỏ các field có giá trị isNull(), sắp xếp key theo thứ tự String::compareTo (Ordinal/Unicode).
 *   + Với ArrayNode: Giữ nguyên thứ tự phần tử, đệ quy chuẩn hóa từng phần tử.
 *   + Serialize compact UTF-8 không khoảng trắng.
 * - Tính SHA-256 (64 hex lowercase) và trả về định dạng "sha256:" + hex64Lower.
 */
public final class CanonicalReceiptDigestUtils {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static final String GOLDEN_FIXTURE_DIGEST = "sha256:0346fac15f576ef8e56a99d6efcd5f013e29bada18fbbe24887743a2d51fa4e7";

    private CanonicalReceiptDigestUtils() {
    }

    public static String computeDigest(JsonNode receiptNode) {
        if (receiptNode == null || receiptNode.isNull()) {
            throw new IllegalArgumentException("Receipt JSON node không được rỗng");
        }

        JsonNode canonicalNode = canonicalize(receiptNode);
        try {
            byte[] compactUtf8Bytes = OBJECT_MAPPER.writeValueAsBytes(canonicalNode);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(compactUtf8Bytes);
            StringBuilder sb = new StringBuilder("sha256:");
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            throw new IllegalStateException("Không thể tính toán Canonical Receipt Digest", e);
        }
    }

    public static JsonNode canonicalize(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }

        if (node.isObject()) {
            ObjectNode objectNode = (ObjectNode) node;
            TreeMap<String, JsonNode> sortedMap = new TreeMap<>();
            Iterator<Map.Entry<String, JsonNode>> fields = objectNode.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode value = entry.getValue();
                if (value != null && !value.isNull()) {
                    JsonNode canonicalValue = canonicalize(value);
                    if (canonicalValue != null) {
                        sortedMap.put(entry.getKey(), canonicalValue);
                    }
                }
            }

            ObjectNode canonicalObject = OBJECT_MAPPER.createObjectNode();
            sortedMap.forEach(canonicalObject::set);
            return canonicalObject;
        } else if (node.isArray()) {
            ArrayNode arrayNode = (ArrayNode) node;
            ArrayNode canonicalArray = OBJECT_MAPPER.createArrayNode();
            for (JsonNode element : arrayNode) {
                JsonNode canonicalElement = canonicalize(element);
                canonicalArray.add(canonicalElement != null ? canonicalElement : OBJECT_MAPPER.nullNode());
            }
            return canonicalArray;
        } else {
            return node.deepCopy();
        }
    }
}
