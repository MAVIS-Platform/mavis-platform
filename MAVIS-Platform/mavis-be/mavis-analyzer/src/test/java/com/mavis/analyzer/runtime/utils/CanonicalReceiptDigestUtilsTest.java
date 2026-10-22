package com.mavis.analyzer.runtime.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CanonicalReceiptDigestUtilsTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Pattern DIGEST_PATTERN = Pattern.compile("^sha256:[0-9a-f]{64}$");

    @Test
    @DisplayName("Chuẩn hóa Canonical JSON: bỏ null, sort key theo thứ tự Ordinal đệ quy và giữ nguyên mảng")
    void testCanonicalize_KeySortingAndNullDropping() throws Exception {
        String inputJson = """
                {
                    "zField": "valueZ",
                    "aField": "valueA",
                    "nullField": null,
                    "nested": {
                        "beta": 2,
                        "alpha": 1,
                        "subNull": null
                    },
                    "array": [
                        {"y": 10, "x": 20, "empty": null},
                        {"b": 2, "a": 1}
                    ]
                }
                """;

        JsonNode inputNode = OBJECT_MAPPER.readTree(inputJson);
        JsonNode canonicalNode = CanonicalReceiptDigestUtils.canonicalize(inputNode);

        assertThat(canonicalNode).isNotNull();
        // Kiểm tra field null đã bị loại bỏ
        assertThat(canonicalNode.has("nullField")).isFalse();
        assertThat(canonicalNode.path("nested").has("subNull")).isFalse();
        assertThat(canonicalNode.path("array").get(0).has("empty")).isFalse();

        // Kiểm tra thứ tự key được sort tăng dần: aField trước zField
        var fieldNames = canonicalNode.fieldNames();
        assertThat(fieldNames.next()).isEqualTo("aField");

        // Kiểm tra nested key được sort: alpha trước beta
        var nestedFields = canonicalNode.path("nested").fieldNames();
        assertThat(nestedFields.next()).isEqualTo("alpha");
        assertThat(nestedFields.next()).isEqualTo("beta");

        // Kiểm tra thứ tự phần tử mảng được giữ nguyên
        assertThat(canonicalNode.path("array")).hasSize(2);
        assertThat(canonicalNode.path("array").get(0).path("x").asInt()).isEqualTo(20);
        assertThat(canonicalNode.path("array").get(1).path("a").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("Tính SHA-256 compact UTF-8: hai object khác thứ tự key và null cho ra cùng một digest")
    void testComputeDigest_IdempotentOnKeyOrdering() throws Exception {
        String json1 = "{\"name\": \"orders\", \"status\": \"PASSED\", \"extra\": null}";
        String json2 = "{\"status\": \"PASSED\", \"name\": \"orders\"}";

        String digest1 = CanonicalReceiptDigestUtils.computeDigest(OBJECT_MAPPER.readTree(json1));
        String digest2 = CanonicalReceiptDigestUtils.computeDigest(OBJECT_MAPPER.readTree(json2));

        assertThat(digest1).matches(DIGEST_PATTERN);
        assertThat(digest2).matches(DIGEST_PATTERN);
        assertThat(digest1).isEqualTo(digest2);
    }

    @Test
    @DisplayName("Test Golden Fixture RunnerReceipt: phải ra chính xác digest sha256:0346fac15f576ef8e56a99d6efcd5f013e29bada18fbbe24887743a2d51fa4e7")
    void testComputeDigest_GoldenFixture_MatchesExpectedSha256() throws Exception {
        ObjectNode goldenNode = OBJECT_MAPPER.createObjectNode();
        goldenNode.put("__golden_fixture__", true);
        goldenNode.put("sessionId", "golden-fixture-session");
        goldenNode.put("resourceProject", "mavisrun-golden0346fac15f576ef8e56a99d6");

        String digest = CanonicalReceiptDigestUtils.computeDigest(goldenNode);

        assertThat(digest).isEqualTo("sha256:0346fac15f576ef8e56a99d6efcd5f013e29bada18fbbe24887743a2d51fa4e7");
    }

    @Test
    @DisplayName("Ném IllegalArgumentException nếu JsonNode là null hoặc NullNode")
    void testComputeDigest_NullInput_ThrowsException() {
        assertThatThrownBy(() -> CanonicalReceiptDigestUtils.computeDigest(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CanonicalReceiptDigestUtils.computeDigest(OBJECT_MAPPER.nullNode()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
