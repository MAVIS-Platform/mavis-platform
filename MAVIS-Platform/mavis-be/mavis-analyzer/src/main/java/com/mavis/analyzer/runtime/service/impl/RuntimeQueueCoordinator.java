package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.repository.RuntimeSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Coordinates FIFO runtime session queueing, remote worker claims, and abandoned/stale session reaping.
 * Works identically on a single VPS (AUTO / MANAGED_CLI) and with external horizontal Worker VPSs (REMOTE_WORKER).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeQueueCoordinator {

    static final Set<String> IN_FLIGHT_STATUSES = Set.of("READY_FOR_DISPATCH", "ALLOCATED", "RUNNING");

    private final RuntimeSessionRepository runtimeSessionRepository;
    @Lazy
    private final RuntimeRunnerDispatcher runtimeRunnerDispatcher;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private TransactionTemplate transactionTemplate;

    @Value("${mavis.runtime.max-active-studio-sessions:2}")
    private int maxActiveStudioSessions = 2;

    @Value("${mavis.runtime.max-queued-studio-sessions:30}")
    private int maxQueuedStudioSessions = 30;

    @Value("${mavis.runtime.studio-abandoned-seconds:90}")
    private long abandonedIdleSeconds = 90;

    @Value("${mavis.runtime.dispatch-stale-seconds:180}")
    private long dispatchStaleSeconds = 180;

    @Value("${mavis.runner.mode:AUTO}")
    private String runnerMode = "AUTO";

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot = "";

    private final ConcurrentHashMap<UUID, Instant> uiHeartbeats = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Instant> dispatchTimestamps = new ConcurrentHashMap<>();

    public record WorkerClaimResult(boolean claimed, UUID sessionId, String resourceProject) {
        public static WorkerClaimResult empty() {
            return new WorkerClaimResult(false, null, null);
        }

        public static WorkerClaimResult claimed(UUID sessionId, String resourceProject) {
            return new WorkerClaimResult(true, sessionId, resourceProject);
        }
    }

    public boolean isRemoteWorkerMode() {
        return "REMOTE_WORKER".equalsIgnoreCase(runnerMode != null ? runnerMode.trim() : "");
    }

    public int getMaxActiveStudioSessions() {
        return Math.max(1, maxActiveStudioSessions);
    }

    public int getMaxQueuedStudioSessions() {
        return Math.max(1, maxQueuedStudioSessions);
    }

    public long countActiveSessions() {
        return runtimeSessionRepository.countByExecutionStatusIn(IN_FLIGHT_STATUSES);
    }

    public long countQueuedSessions() {
        return runtimeSessionRepository.countByExecutionStatusIn(List.of("QUEUED"));
    }

    public boolean hasLocalDispatchCapacity() {
        if (isRemoteWorkerMode()) {
            return false;
        }
        return countActiveSessions() < getMaxActiveStudioSessions();
    }

    public Integer queuePosition(RuntimeSession session) {
        if (session == null || !"QUEUED".equalsIgnoreCase(session.getExecutionStatus())) {
            return null;
        }
        if (session.getCreatedAt() == null) {
            return 1;
        }
        long ahead = runtimeSessionRepository.countByExecutionStatusAndCreatedAtBefore("QUEUED", session.getCreatedAt());
        return (int) ahead + 1;
    }

    public void recordUiHeartbeat(UUID sessionId) {
        if (sessionId != null) {
            uiHeartbeats.put(sessionId, Instant.now());
        }
    }

    public void clearSessionTracking(UUID sessionId) {
        if (sessionId != null) {
            uiHeartbeats.remove(sessionId);
            dispatchTimestamps.remove(sessionId);
        }
    }

    public void recordDispatched(UUID sessionId) {
        if (sessionId != null) {
            dispatchTimestamps.put(sessionId, Instant.now());
        }
    }

    /** Atomically claims the oldest QUEUED session for a remote Worker VPS (or local drain). */
    public WorkerClaimResult claimNextQueuedForRemoteWorker(String workerId, String isolationRuntime) {
        String safeWorker = (workerId == null || workerId.isBlank()) ? "remote-worker" : workerId.trim();
        String safeRuntime = (isolationRuntime == null || isolationRuntime.isBlank()) ? "runc" : isolationRuntime.trim();
        WorkerClaimResult result = runInTransaction(() -> {
            List<RuntimeSession> queued = runtimeSessionRepository
                    .findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED");
            for (RuntimeSession candidate : queued) {
                RuntimeSession locked = runtimeSessionRepository.findLockedById(candidate.getId()).orElse(null);
                if (locked == null || !"QUEUED".equalsIgnoreCase(locked.getExecutionStatus())
                        || locked.getCancelRequestedAt() != null) {
                    continue;
                }
                locked.setExecutionStatus("READY_FOR_DISPATCH");
                runtimeSessionRepository.save(locked);
                dispatchTimestamps.put(locked.getId(), Instant.now());
                log.info("Worker {} ({}) claimed queued runtime session {}", safeWorker, safeRuntime, locked.getId());
                return WorkerClaimResult.claimed(locked.getId(), locked.getResourceProject());
            }
            return WorkerClaimResult.empty();
        });
        return result != null ? result : WorkerClaimResult.empty();
    }

    /** Promotes oldest QUEUED sessions to local managed CLI dispatch whenever local slots open up. */
    public int drainQueueIfCapacityAvailable() {
        if (isRemoteWorkerMode() || runtimeRunnerDispatcher == null || !runtimeRunnerDispatcher.isAutoDispatchEnabled()) {
            return 0;
        }
        int dispatched = 0;
        int limit = getMaxActiveStudioSessions();
        while (dispatched < limit && countActiveSessions() < limit) {
            WorkerClaimResult claimed = claimNextQueuedForRemoteWorker("local-dispatcher", "auto");
            if (!claimed.claimed() || claimed.sessionId() == null) {
                break;
            }
            runtimeRunnerDispatcher.dispatchSessionAsync(claimed.sessionId());
            dispatched++;
        }
        return dispatched;
    }

    @Scheduled(fixedDelayString = "${mavis.runtime.queue-poll-ms:3000}",
            initialDelayString = "${mavis.runtime.queue-initial-delay-ms:15000}")
    public void sweepQueueAndReapAbandoned() {
        Instant now = Instant.now();
        try {
            reapStaleDispatches(now);
            reapAbandonedStudioSessions(now);
            drainQueueIfCapacityAvailable();
        } catch (Exception e) {
            log.warn("Runtime queue sweep encountered an error: {}", e.getMessage());
        }
    }

    int reapStaleDispatches(Instant now) {
        List<RuntimeSession> pendingDispatch = runtimeSessionRepository.findByExecutionStatusOrderByCreatedAtAsc("READY_FOR_DISPATCH");
        Set<UUID> activeDispatchIds = new HashSet<>();
        int reaped = 0;
        for (RuntimeSession candidate : pendingDispatch) {
            UUID id = candidate.getId();
            if (id == null) {
                continue;
            }
            activeDispatchIds.add(id);
            Instant dispatchedAt = dispatchTimestamps.computeIfAbsent(id, k -> now);
            if (Duration.between(dispatchedAt, now).getSeconds() < Math.max(30, dispatchStaleSeconds)) {
                continue;
            }
            Boolean marked = runInTransaction(() -> {
                RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                if (locked == null || !"READY_FOR_DISPATCH".equalsIgnoreCase(locked.getExecutionStatus())
                        || locked.getAllocatedAt() != null || locked.getCompletedAt() != null) {
                    return false;
                }
                locked.setExecutionStatus("FAILED");
                locked.setScenarioStatus("NOT_RUN");
                locked.setCleanupStatus("NOT_APPLICABLE");
                locked.setCompletedAt(OffsetDateTime.now());
                ObjectNode recovery = objectMapper.createObjectNode();
                recovery.put("code", "RUNNER_DISPATCH_TIMEOUT");
                recovery.put("reason", "No Runner picked up the dispatched session before the dispatch deadline.");
                recovery.put("message", "No Runner picked up the dispatched session before the dispatch deadline.");
                locked.setRecoveryResultJson(recovery);
                runtimeSessionRepository.save(locked);
                return true;
            });
            if (Boolean.TRUE.equals(marked)) {
                dispatchTimestamps.remove(id);
                reaped++;
                log.warn("Reaped stale READY_FOR_DISPATCH session {} after {}s", id, dispatchStaleSeconds);
            }
        }
        dispatchTimestamps.keySet().retainAll(activeDispatchIds);
        return reaped;
    }

    int reapAbandonedStudioSessions(Instant now) {
        List<RuntimeSession> running = runtimeSessionRepository
                .findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("RUNNING");
        Set<UUID> activeRunningIds = new HashSet<>();
        boolean hasWaiters = countQueuedSessions() > 0;
        long baseIdle = Math.max(30, abandonedIdleSeconds);
        long idleThresholdSeconds = hasWaiters ? baseIdle : baseIdle * 2L;
        long minWarmupSeconds = Math.min(60L, baseIdle);
        int reaped = 0;

        for (RuntimeSession candidate : running) {
            UUID id = candidate.getId();
            if (id == null) {
                continue;
            }
            activeRunningIds.add(id);
            boolean interactiveStudio = candidate.getScenarioConfig() != null
                    && candidate.getScenarioConfig().path("interactiveStudio").asBoolean(false);
            if (!interactiveStudio || candidate.getStartedAt() == null) {
                continue;
            }
            Instant started = candidate.getStartedAt().toInstant();
            if (Duration.between(started, now).getSeconds() < minWarmupSeconds) {
                continue;
            }
            Instant lastSeen = uiHeartbeats.getOrDefault(id, started);
            if (Duration.between(lastSeen, now).getSeconds() < idleThresholdSeconds) {
                continue;
            }
            Boolean cancelled = runInTransaction(() -> {
                RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                if (locked == null || !"RUNNING".equalsIgnoreCase(locked.getExecutionStatus())
                        || locked.getCancelRequestedAt() != null || locked.getCompletedAt() != null) {
                    return false;
                }
                locked.setCancelRequestedAt(OffsetDateTime.now());
                locked.setExecutionStatus("CANCELLING");
                locked.setCleanupStatus("STOP_REQUESTED");
                runtimeSessionRepository.save(locked);
                writeCancelMarkerBestEffort(locked);
                return true;
            });
            if (Boolean.TRUE.equals(cancelled)) {
                uiHeartbeats.remove(id);
                reaped++;
                log.info("Auto-reaped abandoned Studio session {} after {}s idle (waiters={})",
                        id, Duration.between(lastSeen, now).getSeconds(), hasWaiters);
            }
        }
        uiHeartbeats.keySet().retainAll(activeRunningIds);
        return reaped;
    }

    private void writeCancelMarkerBestEffort(RuntimeSession session) {
        if (runnerStateRoot == null || runnerStateRoot.isBlank()
                || session.getResourceProject() == null || session.getResourceProject().isBlank()) {
            return;
        }
        try {
            Path sessionDir = Path.of(runnerStateRoot, session.getResourceProject()).toAbsolutePath().normalize();
            Files.createDirectories(sessionDir);
            Files.writeString(sessionDir.resolve("cancel.request"), OffsetDateTime.now().toString(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // Remote workers still receive cancelRequested=true via /studio/commands polling.
            log.debug("Could not write local cancel.request for {}: {}", session.getId(), e.getMessage());
        }
    }

    private <T> T runInTransaction(Supplier<T> action) {
        if (transactionTemplate == null) {
            return action.get();
        }
        return transactionTemplate.execute(status -> action.get());
    }
}
