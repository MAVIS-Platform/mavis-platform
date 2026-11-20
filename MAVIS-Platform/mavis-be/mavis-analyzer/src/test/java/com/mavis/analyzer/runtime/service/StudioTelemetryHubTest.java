package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class StudioTelemetryHubTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final StudioTelemetryHub hub = new StudioTelemetryHub(mapper);

    private ObjectNode frame(String observedAt, String logText) {
        ObjectNode root = mapper.createObjectNode().put("observedAt", observedAt);
        root.putArray("services").addObject()
                .put("service", "orders")
                .put("replicas", 1)
                .put("runningReplicas", 1)
                .put("logs", logText);
        root.putArray("spans").addObject()
                .put("traceId", "a".repeat(32))
                .put("spanId", "1".repeat(16))
                .put("spanStatus", "Error")
                .put("httpStatusCode", 503);
        root.putObject("probe").put("rps", 5.0).put("p95Ms", 42.5);
        return root;
    }

    @Test
    void throttlesDbPersistenceToTenSecondWindowUnlessForced() {
        UUID id = UUID.randomUUID();
        long t0 = 1_000_000L;

        assertTrue(hub.publish(id, frame("t0", "boot"), "r0", false, t0));
        assertFalse(hub.publish(id, frame("t1", "ok"), "r1", false, t0 + 1_000L));
        assertFalse(hub.publish(id, frame("t2", "ok"), "r2", false, t0 + 9_999L));
        assertTrue(hub.publish(id, frame("t3", "ok"), "r3", false, t0 + 10_000L));
        assertTrue(hub.publish(id, frame("t4", "crash"), "r4", true, t0 + 10_500L));

        var latest = hub.latest(id).orElseThrow();
        assertEquals("t4", latest.latestTelemetry().path("observedAt").asText());
        assertEquals(5, latest.history().size());
        assertEquals(4, latest.recentObservedAt().size());

        // History frames keep probe + error counts but omit bulky logs.
        var lastCompact = latest.history().get(4);
        assertEquals(5.0, lastCompact.path("probe").path("rps").asDouble());
        assertEquals(1, lastCompact.path("spanCount").asInt());
        assertEquals(1, lastCompact.path("errorSpanCount").asInt());
        assertFalse(lastCompact.path("services").get(0).has("logs"));
    }

    @Test
    void ringBufferBoundsHistoryToMaxFrames() {
        UUID id = UUID.randomUUID();
        for (int i = 0; i < StudioTelemetryHub.MAX_HISTORY_FRAMES + 25; i++) {
            hub.publish(id, frame("f-" + i, "log"), "r-" + i, false, i * 1_000L);
        }
        var latest = hub.latest(id).orElseThrow();
        assertEquals(StudioTelemetryHub.MAX_HISTORY_FRAMES, latest.history().size());
        assertEquals("f-25", latest.history().get(0).path("observedAt").asText());
        assertEquals("f-" + (StudioTelemetryHub.MAX_HISTORY_FRAMES + 24),
                latest.history().get(StudioTelemetryHub.MAX_HISTORY_FRAMES - 1).path("observedAt").asText());
    }
}
