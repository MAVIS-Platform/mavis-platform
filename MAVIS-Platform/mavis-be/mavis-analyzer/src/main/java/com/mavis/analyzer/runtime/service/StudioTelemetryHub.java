package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory ring buffer and SSE fan-out hub for live Studio telemetry.
 * Decouples 1-3s live telemetry frames from Postgres JSONB writes (snapshot every 10s or on capture/finish)
 * while pushing frames to open browser tabs in real time.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StudioTelemetryHub {

    static final int MAX_HISTORY_FRAMES = 300;
    static final int MAX_RECENT_OBSERVED_AT = 12;
    static final int MAX_SUBSCRIBERS_PER_SESSION = 8;
    static final long DB_SNAPSHOT_INTERVAL_MS = 10_000L;
    private static final long SSE_TIMEOUT_MS = 300_000L;
    private static final long IDLE_EVICT_MS = 15 * 60_000L;

    private final ObjectMapper mapper;
    private final ConcurrentHashMap<UUID, SessionStream> streams = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    @org.springframework.context.annotation.Lazy
    private com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator queueCoordinator;

    public record SessionSnapshot(
            JsonNode latestTelemetry,
            String receivedAt,
            List<String> recentObservedAt,
            List<JsonNode> history) {}

    private static final class SessionStream {
        JsonNode latestTelemetry;
        String receivedAt;
        long lastPersistedAtMs = 0L;
        long lastTouchedAtMs = System.currentTimeMillis();
        final Deque<String> recentObservedAt = new ArrayDeque<>();
        final Deque<JsonNode> history = new ArrayDeque<>();
        final CopyOnWriteArrayList<SseEmitter> subscribers = new CopyOnWriteArrayList<>();
    }

    /**
     * Records a redacted telemetry frame in RAM, fans it out over SSE, and returns whether the caller
     * should persist a durable DB snapshot (first frame, forced, or >= 10s since the last DB snapshot).
     */
    public boolean publish(UUID sessionId, JsonNode redactedTelemetry, String receivedAt, boolean forcePersist) {
        return publish(sessionId, redactedTelemetry, receivedAt, forcePersist, null, System.currentTimeMillis());
    }

    public boolean publish(UUID sessionId, JsonNode redactedTelemetry, String receivedAt, boolean forcePersist, String executionStatus) {
        return publish(sessionId, redactedTelemetry, receivedAt, forcePersist, executionStatus, System.currentTimeMillis());
    }

    boolean publish(UUID sessionId, JsonNode redactedTelemetry, String receivedAt, boolean forcePersist, long nowMs) {
        return publish(sessionId, redactedTelemetry, receivedAt, forcePersist, null, nowMs);
    }

    boolean publish(UUID sessionId, JsonNode redactedTelemetry, String receivedAt, boolean forcePersist, String executionStatus, long nowMs) {
        SessionStream stream = streams.computeIfAbsent(sessionId, ignored -> new SessionStream());
        ObjectNode compactFrame = buildCompactFrame(redactedTelemetry);
        boolean shouldPersist;
        synchronized (stream) {
            String prevObserved = stream.latestTelemetry != null
                    ? stream.latestTelemetry.path("observedAt").asText("")
                    : "";
            if (!prevObserved.isBlank()) {
                stream.recentObservedAt.addLast(prevObserved);
                while (stream.recentObservedAt.size() > MAX_RECENT_OBSERVED_AT) {
                    stream.recentObservedAt.removeFirst();
                }
            }
            stream.latestTelemetry = redactedTelemetry;
            stream.receivedAt = receivedAt;
            stream.lastTouchedAtMs = nowMs;
            stream.history.addLast(compactFrame);
            while (stream.history.size() > MAX_HISTORY_FRAMES) {
                stream.history.removeFirst();
            }
            shouldPersist = forcePersist
                    || stream.lastPersistedAtMs == 0L
                    || (nowMs - stream.lastPersistedAtMs) >= DB_SNAPSHOT_INTERVAL_MS;
            if (shouldPersist) {
                stream.lastPersistedAtMs = nowMs;
            }
        }
        if (!stream.subscribers.isEmpty()) {
            ObjectNode payload = mapper.createObjectNode();
            payload.set("telemetry", redactedTelemetry);
            payload.put("telemetryReceivedAt", receivedAt);
            payload.set("frame", compactFrame);
            if (executionStatus != null && !executionStatus.isBlank()) {
                payload.put("executionStatus", executionStatus);
            }
            broadcast(stream, "telemetry", payload);
        }
        return shouldPersist;
    }

    /** Pushes a state transition (action submitted/acked, finish requested, terminal status) over SSE. */
    public void notifyState(UUID sessionId, JsonNode stateView) {
        SessionStream stream = streams.get(sessionId);
        if (stream == null || stream.subscribers.isEmpty()) {
            return;
        }
        stream.lastTouchedAtMs = System.currentTimeMillis();
        broadcast(stream, "state", stateView);
    }

    public Optional<SessionSnapshot> latest(UUID sessionId) {
        SessionStream stream = streams.get(sessionId);
        if (stream == null) {
            return Optional.empty();
        }
        synchronized (stream) {
            if (stream.latestTelemetry == null) {
                return Optional.empty();
            }
            return Optional.of(new SessionSnapshot(
                    stream.latestTelemetry.deepCopy(),
                    stream.receivedAt,
                    new ArrayList<>(stream.recentObservedAt),
                    new ArrayList<>(stream.history)));
        }
    }

    public SseEmitter subscribe(UUID sessionId, JsonNode initialState) {
        SessionStream stream = streams.computeIfAbsent(sessionId, ignored -> new SessionStream());
        stream.lastTouchedAtMs = System.currentTimeMillis();
        while (stream.subscribers.size() >= MAX_SUBSCRIBERS_PER_SESSION) {
            SseEmitter oldest = stream.subscribers.remove(0);
            try { oldest.complete(); } catch (Exception ignored) {}
        }
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        Runnable detach = () -> stream.subscribers.remove(emitter);
        emitter.onCompletion(detach);
        emitter.onTimeout(detach);
        emitter.onError(ex -> detach.run());
        stream.subscribers.add(emitter);
        try {
            emitter.send(SseEmitter.event().name("state").data(initialState));
        } catch (Exception ex) {
            stream.subscribers.remove(emitter);
            emitter.completeWithError(ex);
        }
        return emitter;
    }

    public void clear(UUID sessionId) {
        SessionStream removed = streams.remove(sessionId);
        if (removed == null) {
            return;
        }
        for (SseEmitter emitter : removed.subscribers) {
            try { emitter.complete(); } catch (Exception ignored) {}
        }
        removed.subscribers.clear();
    }

    @Scheduled(fixedDelay = 20_000L)
    public void sendHeartbeats() {
        for (var entry : streams.entrySet()) {
            SessionStream stream = entry.getValue();
            if (stream.subscribers.isEmpty()) continue;
            boolean anyAlive = false;
            for (SseEmitter emitter : stream.subscribers) {
                try {
                    emitter.send(SseEmitter.event().comment("keepalive"));
                    anyAlive = true;
                } catch (Exception ex) {
                    stream.subscribers.remove(emitter);
                }
            }
            if (anyAlive && queueCoordinator != null) {
                queueCoordinator.recordUiHeartbeat(entry.getKey());
            }
        }
    }

    @Scheduled(fixedDelay = 60_000L)
    public void evictIdleStreams() {
        long cutoff = Instant.now().toEpochMilli() - IDLE_EVICT_MS;
        for (var entry : streams.entrySet()) {
            SessionStream stream = entry.getValue();
            if (stream.subscribers.isEmpty() && stream.lastTouchedAtMs < cutoff) {
                streams.remove(entry.getKey(), stream);
            }
        }
    }

    private void broadcast(SessionStream stream, String eventName, JsonNode payload) {
        for (SseEmitter emitter : stream.subscribers) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(payload));
            } catch (Exception ex) {
                stream.subscribers.remove(emitter);
            }
        }
    }

    /** Strips heavy logs and raw span lists from ring-buffer history frames to keep memory bounded. */
    private ObjectNode buildCompactFrame(JsonNode telemetry) {
        ObjectNode frame = mapper.createObjectNode();
        frame.put("observedAt", telemetry.path("observedAt").asText(""));
        ArrayNode services = frame.putArray("services");
        if (telemetry.path("services").isArray()) {
            for (JsonNode svc : telemetry.path("services")) {
                ObjectNode s = services.addObject();
                s.put("service", svc.path("service").asText(""));
                s.put("replicas", svc.path("replicas").asInt(0));
                s.put("runningReplicas", svc.path("runningReplicas").asInt(0));
                if (svc.has("stats") && svc.get("stats").isArray()) {
                    s.set("stats", svc.get("stats").deepCopy());
                }
            }
        }
        int spanCount = 0;
        int errorSpanCount = 0;
        if (telemetry.path("spans").isArray()) {
            for (JsonNode span : telemetry.path("spans")) {
                spanCount++;
                String st = span.path("spanStatus").asText("");
                int httpCode = span.path("httpStatusCode").asInt(0);
                if ("ERROR".equalsIgnoreCase(st) || httpCode >= 500 || span.path("circuitOpen").asBoolean(false)) {
                    errorSpanCount++;
                }
            }
        }
        frame.put("spanCount", spanCount);
        frame.put("errorSpanCount", errorSpanCount);
        if (telemetry.hasNonNull("probe")) {
            frame.set("probe", telemetry.get("probe").deepCopy());
        }
        if (telemetry.hasNonNull("serviceGraph")) {
            frame.set("serviceGraph", telemetry.get("serviceGraph").deepCopy());
        }
        return frame;
    }
}
