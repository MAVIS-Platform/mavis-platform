package com.mavis.bootstrap.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;

class GeminiMonitoringClientTest {
    @Test void preservesProviderLabelsAndMeasurementTimeWithoutInventingQuota() throws Exception {
        String json = """
          {"timeSeries":[{"metric":{"labels":{"model":"gemini-2.5-flash","limit_name":"requests-per-minute"}},"points":[{"interval":{"startTime":"2026-01-01T00:00:00Z","endTime":"2026-01-01T00:01:00Z"},"value":{"int64Value":"17"}}]}]}
          """;
        var samples = GeminiMonitoringClient.parseSamples(new ObjectMapper().readTree(json), "generate_content_free_tier_requests/usage");
        assertThat(samples).hasSize(1);
        assertThat(samples.get(0)).containsEntry("model","gemini-2.5-flash").containsEntry("limitName","requests-per-minute").containsEntry("kind","usage").containsEntry("value",17L).containsEntry("measuredAt","2026-01-01T00:01:00Z");
        assertThat(GeminiMonitoringClient.parseSamples(new ObjectMapper().readTree("{}"),"x/limit")).isEmpty();
    }
    @Test void missingConfigurationReturnsUnavailableWithoutFakeZero() {
        var client = new GeminiMonitoringClient(new ObjectMapper());
        Map<String,Object> data = client.snapshot();
        assertThat(data).doesNotContainKey("geminiQuota");
        assertThat(data.get("providerDataMessage")).asString().contains("requires");
    }
}
