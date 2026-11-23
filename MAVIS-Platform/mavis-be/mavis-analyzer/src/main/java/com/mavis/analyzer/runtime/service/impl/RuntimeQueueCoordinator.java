package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
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

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Coordinates FIFO runtime session queueing, remote worker claims, abandoned/stale session reaping,
 * orphan Docker sandbox cleanup, low-disk protection, and live operator runtime health reporting.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeQueueCoordinator {

    // CANCELLING still owns containers until teardown finishes, so it keeps holding its slot.
    static final Set<String> IN_FLIGHT_STATUSES = Set.of("READY_FOR_DISPATCH", "ALLOCATED", "RUNNING", "CANCELLING");
    private static final Set<String> TERMINAL_STATUSES = Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT");
    private static final Pattern MAVISRUN_PROJECT_PATTERN = Pattern.compile("^mavisrun-[0-9a-f]{32}$");

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

    @Value("${mavis.runtime.stuck-session-seconds:600}")
    private long stuckSessionSeconds = 600;

    @Value("${mavis.runtime.cancelling-stuck-seconds:60}")
    private long cancellingStuckSeconds = 60;

    @Value("${mavis.runtime.low-disk-threshold-mib:2048}")
    private long lowDiskThresholdMiB = 2048;

    @Value("${mavis.runner.mode:AUTO}")
    private String runnerMode = "AUTO";

    @Value("${mavis.runner.oci-runtime:auto}")
    private String configuredOciRuntime = "auto";

    @Value("${mavis.runner.sandbox-registry:}")
    private String sandboxRegistry = "";

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot = "";

    @Value("${mavis.runtime.alert-webhook-url:}")
    private String alertWebhookUrl = "";

    @Value("${mavis.runtime.alert-cooldown-seconds:600}")
    private long alertCooldownSeconds = 600;

    @Value("${mavis.runtime.alert-queue-wait-seconds:60}")
    private long alertQueueWaitSeconds = 60;

    private final ConcurrentHashMap<UUID, Instant> uiHeartbeats = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Instant> dispatchTimestamps = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Instant> lastAlerts = new ConcurrentHashMap<>();
    private final AtomicLong orphansReapedTotal = new AtomicLong();
    private final AtomicLong abandonedReapedTotal = new AtomicLong();
    private final AtomicLong staleDispatchesReapedTotal = new AtomicLong();
    private volatile long lastRuntimeProbeMillis = 0L;
    private volatile boolean cachedDockerReachable = false;
    private volatile boolean cachedGvisorAvailable = false;
    private volatile Instant lastWorkerPollAt = null;

    public record CommandOutput(int exitCode, String stdout) {}

    public record RuntimeHealthSnapshot(
            String surveyReadiness,
            String runnerMode,
            String configuredOciRuntime,
            String effectiveOciRuntime,
            boolean dockerReachable,
            boolean gvisorAvailable,
            boolean sandboxRegistryConfigured,
            long activeSessions,
            long queuedSessions,
            int maxActiveSessions,
            int maxQueuedSessions,
            long diskFreeMiB,
            long diskTotalMiB,
            boolean diskLowWarning,
            long orphansReapedTotal,
            long abandonedReapedTotal,
            long staleDispatchesReapedTotal,
            long oldestQueuedWaitSeconds,
            boolean alertsConfigured,
            List<String> warnings) {
        public RuntimeHealthSnapshot(
                String surveyReadiness, String runnerMode, String configuredOciRuntime, String effectiveOciRuntime,
                boolean dockerReachable, boolean gvisorAvailable, boolean sandboxRegistryConfigured,
                long activeSessions, long queuedSessions, int maxActiveSessions, int maxQueuedSessions,
                long diskFreeMiB, long diskTotalMiB, boolean diskLowWarning,
                long orphansReapedTotal, long abandonedReapedTotal, long staleDispatchesReapedTotal,
                List<String> warnings) {
            this(surveyReadiness, runnerMode, configuredOciRuntime, effectiveOciRuntime,
                    dockerReachable, gvisorAvailable, sandboxRegistryConfigured,
                    activeSessions, queuedSessions, maxActiveSessions, maxQueuedSessions,
                    diskFreeMiB, diskTotalMiB, diskLowWarning,
                    orphansReapedTotal, abandonedReapedTotal, staleDispatchesReapedTotal,
                    0L, false, warnings);
        }
    }

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
        return runtimeSessionRepository.countActiveNonSimulated(IN_FLIGHT_STATUSES);
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

    public void recordWorkerPoll() {
        lastWorkerPollAt = Instant.now();
    }

    public Instant getLastWorkerPollAt() {
        return lastWorkerPollAt;
    }

    /** Atomically claims the oldest QUEUED session for a remote Worker VPS (or local drain). */
    public WorkerClaimResult claimNextQueuedForRemoteWorker(String workerId, String isolationRuntime) {
        String safeWorker = (workerId == null || workerId.isBlank()) ? "remote-worker" : workerId.trim();
        String safeRuntime = (isolationRuntime == null || isolationRuntime.isBlank()) ? "runc" : isolationRuntime.trim();
        if (!"local-dispatcher".equals(safeWorker)) {
            lastWorkerPollAt = Instant.now();
        }
        WorkerClaimResult result = runInTransaction(() -> {
            // FOR UPDATE SKIP LOCKED: two claimers can never receive the same row, and no stale cached entity is reused.
            RuntimeSession locked = runtimeSessionRepository.lockOldestQueued().orElse(null);
            if (locked == null) {
                return WorkerClaimResult.empty();
            }
            locked.setExecutionStatus("READY_FOR_DISPATCH");
            runtimeSessionRepository.save(locked);
            dispatchTimestamps.put(locked.getId(), Instant.now());
            log.info("Worker {} ({}) claimed queued runtime session {}", safeWorker, safeRuntime, locked.getId());
            return WorkerClaimResult.claimed(locked.getId(), locked.getResourceProject());
        });
        return result != null ? result : WorkerClaimResult.empty();
    }

    private final Object drainLock = new Object();

    /** Promotes oldest QUEUED sessions to local managed CLI dispatch whenever local slots open up. */
    public int drainQueueIfCapacityAvailable() {
        if (isRemoteWorkerMode() || runtimeRunnerDispatcher == null || !runtimeRunnerDispatcher.isAutoDispatchEnabled()) {
            return 0;
        }
        // Count-then-claim must be atomic or concurrent drains (scheduler, dispatch finally, stop) overshoot the limit.
        // shortcut: JVM-level lock assumes one backend instance; use pg_advisory_xact_lock before running several.
        synchronized (drainLock) {
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
    }

    /** True when sessions must enter through the queue so only the drain decides who runs. */
    public boolean queueGatesDispatch() {
        return isRemoteWorkerMode() || (runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isAutoDispatchEnabled());
    }

    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void recoverDispatchesAfterRestart() {
        if (isRemoteWorkerMode()) {
            return;
        }
        // In-memory dispatch threads and local child Runner processes died with the previous backend JVM.
        try {
            int requeued = 0;
            for (RuntimeSession candidate : runtimeSessionRepository.findByExecutionStatusOrderByCreatedAtAsc("READY_FOR_DISPATCH")) {
                Boolean moved = runInTransaction(() -> {
                    RuntimeSession locked = runtimeSessionRepository.findLockedById(candidate.getId()).orElse(null);
                    if (locked == null || !"READY_FOR_DISPATCH".equalsIgnoreCase(locked.getExecutionStatus())
                            || locked.getAllocatedAt() != null || locked.getCancelRequestedAt() != null) {
                        return false;
                    }
                    locked.setExecutionStatus("QUEUED");
                    runtimeSessionRepository.save(locked);
                    return true;
                });
                if (Boolean.TRUE.equals(moved)) requeued++;
            }
            if (requeued > 0) log.warn("Re-queued {} READY_FOR_DISPATCH session(s) orphaned by a backend restart", requeued);

            int recoveredOrphans = 0;
            if (runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isAutoDispatchEnabled()) {
                List<String> orphanProjects = new ArrayList<>();
                for (String status : List.of("ALLOCATED", "RUNNING", "CANCELLING")) {
                    for (RuntimeSession candidate : runtimeSessionRepository.findByExecutionStatusOrderByCreatedAtAsc(status)) {
                        UUID id = candidate.getId();
                        if (id == null || runtimeRunnerDispatcher.isExecuting(id)) {
                            continue;
                        }
                        boolean simulated = candidate.getStudioControl() != null
                                && candidate.getStudioControl().path("simulatedSandbox").asBoolean(false);
                        if (simulated && !"CANCELLING".equals(status)) {
                            continue;
                        }
                        String orphanProject = runInTransaction(() -> {
                            RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                            if (locked == null || !status.equalsIgnoreCase(locked.getExecutionStatus())
                                    || locked.getRunnerReceiptJson() != null || locked.getCompletedAt() != null) {
                                return null;
                            }
                            if (!simulated && runtimeRunnerDispatcher.tryAutoImportOutboxReceipt(locked)) {
                                return "";
                            }
                            boolean cancelling = "CANCELLING".equals(status);
                            locked.setExecutionStatus(cancelling ? "CANCELLED" : "FAILED");
                            locked.setCleanupStatus(simulated ? "NOT_APPLICABLE" : "UNCONFIRMED");
                            locked.setCompletedAt(OffsetDateTime.now());
                            if (!simulated) {
                                ObjectNode recovery = objectMapper.createObjectNode();
                                recovery.put("code", "BACKEND_RESTART_RECOVERY");
                                String reason = "Backend restarted while session was " + status
                                        + "; orphaned local runner slot and containers were reclaimed.";
                                recovery.put("reason", reason);
                                recovery.put("message", reason);
                                locked.setRecoveryResultJson(recovery);
                            }
                            runtimeSessionRepository.save(locked);
                            clearSessionTracking(id);
                            String rp = locked.getResourceProject();
                            return (!simulated && rp != null && MAVISRUN_PROJECT_PATTERN.matcher(rp).matches()) ? rp : "";
                        });
                        if (orphanProject != null) {
                            recoveredOrphans++;
                            if (!orphanProject.isEmpty()) {
                                orphanProjects.add(orphanProject);
                            }
                        }
                    }
                }
                for (String project : orphanProjects) {
                    reapSingleOrphanProject(project);
                }
                if (recoveredOrphans > 0) {
                    log.warn("Reclaimed {} orphaned in-flight session(s) ({} Docker stack(s)) after backend restart",
                            recoveredOrphans, orphanProjects.size());
                }
            }
            if (requeued > 0 || recoveredOrphans > 0) {
                drainQueueIfCapacityAvailable();
            }
        } catch (Exception e) {
            log.warn("Startup dispatch recovery failed: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${mavis.runtime.queue-poll-ms:3000}",
            initialDelayString = "${mavis.runtime.queue-initial-delay-ms:15000}")
    public void sweepQueueAndReapAbandoned() {
        Instant now = Instant.now();
        try {
            reapStaleDispatches(now);
            reapAbandonedStudioSessions(now);
            reapStuckSessions(now);
            drainQueueIfCapacityAvailable();
            evaluateAndNotifyAlerts(now);
        } catch (Exception e) {
            log.warn("Runtime queue sweep encountered an error: {}", e.getMessage());
        }
    }

    /**
     * Sessions past every legitimate deadline (300s session + teardown + receipt delivery) with no receipt are failed,
     * so a crashed runner, restarted backend or simulated session can never hold a slot forever.
     */
    int reapStuckSessions(Instant now) {
        int reaped = 0;
        long stuckAfter = Math.max(120, stuckSessionSeconds);
        long cancellingAfter = Math.max(15, cancellingStuckSeconds);
        boolean localManaged = !isRemoteWorkerMode() && runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isAutoDispatchEnabled();
        List<String> orphanProjects = new ArrayList<>();
        for (String status : List.of("ALLOCATED", "RUNNING", "CANCELLING")) {
            for (RuntimeSession candidate : runtimeSessionRepository.findByExecutionStatusOrderByCreatedAtAsc(status)) {
                UUID id = candidate.getId();
                if (id == null || (runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isExecuting(id))) {
                    continue;
                }
                boolean simulated = candidate.getStudioControl() != null
                        && candidate.getStudioControl().path("simulatedSandbox").asBoolean(false);
                OffsetDateTime since = "CANCELLING".equals(status) ? candidate.getCancelRequestedAt()
                        : "RUNNING".equals(status) ? candidate.getStartedAt() : candidate.getAllocatedAt();
                if (since == null) since = candidate.getCreatedAt();
                if (since == null) continue;
                // Simulated sandboxes have no runner; dead CANCELLING sessions use the shorter teardown threshold.
                long limit = "CANCELLING".equals(status) ? (simulated ? 0 : cancellingAfter) : stuckAfter;
                if (Duration.between(since.toInstant(), now).getSeconds() < limit) {
                    continue;
                }
                if (simulated && "RUNNING".equals(status)) {
                    continue; // Simulated RUNNING ends through the abandoned-tab reaper or Stop.
                }
                String reapedProject = runInTransaction(() -> {
                    RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                    if (locked == null || !status.equalsIgnoreCase(locked.getExecutionStatus())
                            || locked.getRunnerReceiptJson() != null || locked.getCompletedAt() != null) {
                        return null;
                    }
                    boolean cancelling = "CANCELLING".equals(status);
                    locked.setExecutionStatus(cancelling ? "CANCELLED" : "FAILED");
                    locked.setCleanupStatus(simulated ? "NOT_APPLICABLE" : "UNCONFIRMED");
                    locked.setCompletedAt(OffsetDateTime.now());
                    if (!simulated) {
                        ObjectNode recovery = objectMapper.createObjectNode();
                        recovery.put("code", "RUNNER_LOST_RECOVERY_REQUIRED");
                        String reason = "No Runner receipt arrived for a " + status + " session after " + limit
                                + "s; containers are swept by the host watchdog.";
                        recovery.put("reason", reason);
                        recovery.put("message", reason);
                        locked.setRecoveryResultJson(recovery);
                        writeCancelMarkerBestEffort(locked);
                    }
                    runtimeSessionRepository.save(locked);
                    clearSessionTracking(id);
                    String rp = locked.getResourceProject();
                    return (!simulated && localManaged && rp != null && MAVISRUN_PROJECT_PATTERN.matcher(rp).matches()) ? rp : "";
                });
                if (reapedProject != null) {
                    reaped++;
                    if (!reapedProject.isEmpty()) {
                        orphanProjects.add(reapedProject);
                    }
                    log.warn("Reaped stuck {} runtime session {} (simulated={})", status, id, simulated);
                }
            }
        }
        for (String project : orphanProjects) {
            reapSingleOrphanProject(project);
        }
        return reaped;
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
            if (runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isExecuting(id)) {
                // Still pulling/building images locally: not stale, keep the clock fresh.
                dispatchTimestamps.put(id, now);
                continue;
            }
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
                staleDispatchesReapedTotal.incrementAndGet();
                log.warn("Reaped stale READY_FOR_DISPATCH session {} after {}s", id, dispatchStaleSeconds);
            }
        }
        dispatchTimestamps.keySet().retainAll(activeDispatchIds);
        return reaped;
    }

    int reapAbandonedStudioSessions(Instant now) {
        List<RuntimeSession> running = runtimeSessionRepository
                .findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("RUNNING");
        List<RuntimeSession> queued = runtimeSessionRepository
                .findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED");
        Set<UUID> activeTrackedIds = new HashSet<>();
        boolean hasWaiters = !queued.isEmpty() || countQueuedSessions() > 0;
        long baseIdle = Math.max(30, abandonedIdleSeconds);
        long idleThresholdSeconds = hasWaiters ? baseIdle : baseIdle * 2L;
        long queuedIdleThresholdSeconds = Math.max(300L, baseIdle * 2L);
        long minWarmupSeconds = Math.min(60L, baseIdle);
        int reaped = 0;

        for (RuntimeSession candidate : running) {
            UUID id = candidate.getId();
            if (id == null) {
                continue;
            }
            activeTrackedIds.add(id);
            boolean interactiveStudio = candidate.getScenarioConfig() != null
                    && candidate.getScenarioConfig().path("interactiveStudio").asBoolean(false);
            if (!interactiveStudio || candidate.getStartedAt() == null) {
                continue;
            }
            Instant started = candidate.getStartedAt().toInstant();
            if (Duration.between(started, now).getSeconds() < minWarmupSeconds) {
                continue;
            }
            Instant lastSeen = latestActivityTimestamp(id, candidate, started);
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
                activeTrackedIds.remove(id);
                reaped++;
                abandonedReapedTotal.incrementAndGet();
                log.info("Auto-reaped abandoned Studio session {} after {}s idle (waiters={})",
                        id, Duration.between(lastSeen, now).getSeconds(), hasWaiters);
            }
        }

        for (RuntimeSession candidate : queued) {
            UUID id = candidate.getId();
            if (id == null) {
                continue;
            }
            boolean interactiveStudio = candidate.getScenarioConfig() != null
                    && candidate.getScenarioConfig().path("interactiveStudio").asBoolean(false);
            if (!interactiveStudio) {
                activeTrackedIds.add(id);
                continue;
            }
            Instant created = candidate.getCreatedAt() != null ? candidate.getCreatedAt().toInstant() : now;
            Instant lastSeen = latestActivityTimestamp(id, candidate, created);
            if (Duration.between(lastSeen, now).getSeconds() < queuedIdleThresholdSeconds) {
                activeTrackedIds.add(id);
                continue;
            }
            Boolean cancelled = runInTransaction(() -> {
                RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                if (locked == null || !"QUEUED".equalsIgnoreCase(locked.getExecutionStatus())
                        || locked.getCancelRequestedAt() != null || locked.getCompletedAt() != null) {
                    return false;
                }
                OffsetDateTime cancelledAt = OffsetDateTime.now();
                locked.setScenarioStatus("CANCELLED");
                locked.setExecutionStatus("CANCELLED");
                locked.setCleanupStatus("NOT_APPLICABLE");
                locked.setCancelRequestedAt(cancelledAt);
                locked.setCompletedAt(cancelledAt);
                runtimeSessionRepository.save(locked);
                return true;
            });
            if (Boolean.TRUE.equals(cancelled)) {
                uiHeartbeats.remove(id);
                reaped++;
                abandonedReapedTotal.incrementAndGet();
                log.info("Auto-reaped abandoned QUEUED Studio session {} after {}s inactive",
                        id, Duration.between(lastSeen, now).getSeconds());
            } else {
                activeTrackedIds.add(id);
            }
        }

        uiHeartbeats.keySet().retainAll(activeTrackedIds);
        return reaped;
    }

    private Instant latestActivityTimestamp(UUID id, RuntimeSession session, Instant fallbackStarted) {
        Instant best = uiHeartbeats.getOrDefault(id, fallbackStarted);
        if (session.getStudioControl() != null && session.getStudioControl().hasNonNull("lastUiActivityAt")) {
            try {
                Instant persisted = OffsetDateTime.parse(session.getStudioControl().path("lastUiActivityAt").asText()).toInstant();
                if (persisted.isAfter(best)) {
                    best = persisted;
                }
            } catch (Exception ignored) {
            }
        }
        return best;
    }

    /** Periodic host hygiene: sweeps orphaned terminal mavisrun-* Docker resources and protects disk space. */
    @Scheduled(fixedDelayString = "${mavis.runtime.watchdog-poll-ms:300000}",
            initialDelayString = "${mavis.runtime.watchdog-initial-delay-ms:60000}")
    public void runHostWatchdog() {
        if (isRemoteWorkerMode()) {
            return;
        }
        try {
            sweepOrphanDockerResources(Instant.now());
            checkAndProtectDiskSpace();
            evaluateAndNotifyAlerts(Instant.now());
        } catch (Exception e) {
            log.warn("Runtime host watchdog error: {}", e.getMessage());
        }
    }

    public int sweepOrphanDockerResources(Instant now) {
        CommandOutput psOut = runHostCommand(List.of("docker", "ps", "-a", "--format", "{{.Label \"com.docker.compose.project\"}}"), 10);
        CommandOutput netOut = runHostCommand(List.of("docker", "network", "ls", "--format", "{{.Name}}"), 10);
        if (psOut.exitCode() != 0 && netOut.exitCode() != 0) {
            return 0;
        }
        Set<String> projects = new HashSet<>();
        if (psOut.exitCode() == 0 && psOut.stdout() != null) {
            for (String line : psOut.stdout().split("\\R")) {
                String p = line.trim();
                if (MAVISRUN_PROJECT_PATTERN.matcher(p).matches()) {
                    projects.add(p);
                }
            }
        }
        if (netOut.exitCode() == 0 && netOut.stdout() != null) {
            for (String line : netOut.stdout().split("\\R")) {
                String name = line.trim();
                if (name.endsWith("_default")) {
                    String candidate = name.substring(0, name.length() - "_default".length());
                    if (MAVISRUN_PROJECT_PATTERN.matcher(candidate).matches()) {
                        projects.add(candidate);
                    }
                }
            }
        }
        if (projects.isEmpty()) {
            return 0;
        }
        Map<String, RuntimeSession> byProject = new HashMap<>();
        for (RuntimeSession s : runtimeSessionRepository.findByResourceProjectIn(projects)) {
            if (s.getResourceProject() != null) {
                byProject.put(s.getResourceProject(), s);
            }
        }
        int reapedProjects = 0;
        for (String project : projects) {
            RuntimeSession session = byProject.get(project);
            if (session == null) {
                continue;
            }
            String exec = session.getExecutionStatus() == null ? "" : session.getExecutionStatus().toUpperCase(Locale.ROOT);
            if (!TERMINAL_STATUSES.contains(exec)) {
                continue;
            }
            if (session.getCompletedAt() != null && Duration.between(session.getCompletedAt().toInstant(), now).getSeconds() < 120) {
                continue;
            }
            reapSingleOrphanProject(project);
            reapedProjects++;
            orphansReapedTotal.incrementAndGet();
            log.warn("Host watchdog removed orphaned Docker resources for terminal session {} ({})", session.getId(), project);
        }
        return reapedProjects;
    }

    private void reapSingleOrphanProject(String project) {
        CommandOutput ids = runHostCommand(List.of("docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project), 10);
        if (ids.exitCode() == 0 && ids.stdout() != null && !ids.stdout().isBlank()) {
            List<String> rmCmd = new ArrayList<>();
            rmCmd.add("docker");
            rmCmd.add("rm");
            rmCmd.add("-f");
            for (String id : ids.stdout().split("\\R")) {
                if (!id.isBlank()) rmCmd.add(id.trim());
            }
            if (rmCmd.size() > 3) {
                runHostCommand(rmCmd, 20);
            }
        }
        runHostCommand(List.of("docker", "network", "rm", project + "_default"), 10);
        CommandOutput vols = runHostCommand(List.of("docker", "volume", "ls", "-q", "--filter", "label=com.docker.compose.project=" + project), 10);
        if (vols.exitCode() == 0 && vols.stdout() != null && !vols.stdout().isBlank()) {
            List<String> volCmd = new ArrayList<>();
            volCmd.add("docker");
            volCmd.add("volume");
            volCmd.add("rm");
            volCmd.add("-f");
            for (String v : vols.stdout().split("\\R")) {
                if (!v.isBlank()) volCmd.add(v.trim());
            }
            if (volCmd.size() > 4) {
                runHostCommand(volCmd, 15);
            }
        }
    }

    public boolean checkAndProtectDiskSpace() {
        long freeMiB = usableDiskMiB();
        if (freeMiB < 0 || freeMiB >= Math.max(256L, lowDiskThresholdMiB)) {
            return false;
        }
        log.warn("Host free disk space ({} MiB) dropped below {} MiB threshold; pruning stale build cache and dangling images",
                freeMiB, lowDiskThresholdMiB);
        runHostCommand(List.of("docker", "builder", "prune", "-f", "--filter", "until=24h"), 30);
        // Prune ONLY dangling (<none>) layers; tagged mavis-sandbox-* Lab images are never removed.
        runHostCommand(List.of("docker", "image", "prune", "-f"), 30);
        return true;
    }

    public RuntimeHealthSnapshot getRuntimeHealth() {
        return getRuntimeHealth(Instant.now());
    }

    RuntimeHealthSnapshot getRuntimeHealth(Instant now) {
        refreshDockerAndRuntimeProbe();
        long active = countActiveSessions();
        long queued = countQueuedSessions();
        long freeMiB = usableDiskMiB();
        long totalMiB = totalDiskMiB();
        boolean diskLow = freeMiB >= 0 && freeMiB < Math.max(256L, lowDiskThresholdMiB);
        String configured = configuredOciRuntime == null || configuredOciRuntime.isBlank() ? "auto" : configuredOciRuntime.trim();
        String effective = "runc";
        if ("auto".equalsIgnoreCase(configured)) {
            effective = cachedGvisorAvailable ? "runsc" : "runc";
        } else {
            effective = configured;
        }

        List<String> warnings = new ArrayList<>();
        String readiness = "READY";
        if (!isRemoteWorkerMode() && !cachedDockerReachable) {
            readiness = "BLOCKED";
            warnings.add("Local Docker daemon is unreachable on the backend host.");
        }
        if ("runsc".equalsIgnoreCase(configured) && !cachedGvisorAvailable && !isRemoteWorkerMode()) {
            readiness = "BLOCKED";
            warnings.add("Explicit gVisor runtime (runsc) is configured but not installed on host. Run: sudo bash /opt/mavis/deploy/install-gvisor.sh");
        } else if ("auto".equalsIgnoreCase(configured) && !cachedGvisorAvailable && !isRemoteWorkerMode()) {
            if ("READY".equals(readiness)) readiness = "DEGRADED";
            warnings.add("gVisor (runsc) not installed on host — running in hardened runc mode. Run sudo bash /opt/mavis/deploy/install-gvisor.sh to enable Stage 3 kernel isolation.");
        }
        if (diskLow) {
            if ("READY".equals(readiness)) readiness = "DEGRADED";
            warnings.add("Host free disk space is low (" + freeMiB + " MiB free; threshold " + lowDiskThresholdMiB + " MiB).");
        }
        if (isRemoteWorkerMode()) {
            if (!cachedDockerReachable) {
                if ("READY".equals(readiness)) readiness = "DEGRADED";
                warnings.add("Control-plane Docker unreachable: lab image builds unavailable.");
            }
            Instant lastPoll = lastWorkerPollAt;
            if (lastPoll == null) {
                if ("READY".equals(readiness)) readiness = "DEGRADED";
                warnings.add("No remote worker poll received yet in REMOTE_WORKER mode.");
            } else {
                long pollAgeSec = Math.max(0L, Duration.between(lastPoll, now).getSeconds());
                if (pollAgeSec >= 30L) {
                    if ("READY".equals(readiness)) readiness = "DEGRADED";
                    warnings.add("Remote worker heartbeat is stale (" + pollAgeSec + "s since last poll; threshold 30s).");
                }
            }
        }
        if (isRemoteWorkerMode() && (sandboxRegistry == null || sandboxRegistry.isBlank())) {
            if ("READY".equals(readiness)) readiness = "DEGRADED";
            warnings.add("REMOTE_WORKER mode without MAVIS_RUNNER_SANDBOX_REGISTRY: Dockerfile-built Labs need a shared registry so remote Worker VPSs can pull images.");
        }

        long oldestWaitSec = computeOldestQueuedWaitSeconds(now);
        if (oldestWaitSec > Math.max(10L, alertQueueWaitSeconds)) {
            if ("READY".equals(readiness)) readiness = "DEGRADED";
            warnings.add("Oldest queued Studio session has waited " + oldestWaitSec + "s (threshold " + alertQueueWaitSeconds + "s).");
        }
        return new RuntimeHealthSnapshot(
                readiness,
                runnerMode,
                configured,
                effective,
                cachedDockerReachable,
                cachedGvisorAvailable,
                sandboxRegistry != null && !sandboxRegistry.isBlank(),
                active,
                queued,
                getMaxActiveStudioSessions(),
                getMaxQueuedStudioSessions(),
                freeMiB,
                totalMiB,
                diskLow,
                orphansReapedTotal.get(),
                abandonedReapedTotal.get(),
                staleDispatchesReapedTotal.get(),
                oldestWaitSec,
                isWebhookConfigured(),
                warnings);
    }

    /** Phase E4: evaluates low disk, queue wait, and boot failure rate; dispatches rate-limited webhook alerts when configured. */
    public int evaluateAndNotifyAlerts(Instant now) {
        if (!isWebhookConfigured()) return 0;
        int sent = 0;
        long freeMiB = usableDiskMiB();
        if (freeMiB >= 0 && freeMiB < Math.max(256L, lowDiskThresholdMiB)) {
            if (dispatchRateLimitedAlert("LOW_DISK", now,
                    "MAVIS Runtime Alert [LOW_DISK]: Free disk dropped to " + freeMiB + " MiB (threshold " + lowDiskThresholdMiB + " MiB).")) {
                sent++;
            }
        }
        long oldestWait = computeOldestQueuedWaitSeconds(now);
        if (oldestWait > Math.max(10L, alertQueueWaitSeconds)) {
            if (dispatchRateLimitedAlert("QUEUE_WAIT", now,
                    "MAVIS Runtime Alert [QUEUE_WAIT]: Oldest queued Studio session has waited " + oldestWait + "s (threshold " + alertQueueWaitSeconds + "s).")) {
                sent++;
            }
        }
        double failRate = computeRecentBootFailureRatePercent(now);
        if (failRate > 15.0) {
            if (dispatchRateLimitedAlert("HIGH_BOOT_FAILURE_RATE", now,
                    String.format(Locale.ROOT, "MAVIS Runtime Alert [HIGH_BOOT_FAILURE_RATE]: Recent boot failure rate is %.1f%% (> 15%%).", failRate))) {
                sent++;
            }
        }
        return sent;
    }

    private boolean isWebhookConfigured() {
        if (alertWebhookUrl == null || alertWebhookUrl.isBlank()) return false;
        String trimmed = alertWebhookUrl.trim();
        return trimmed.startsWith("https://") || trimmed.startsWith("http://");
    }

    private long computeOldestQueuedWaitSeconds(Instant now) {
        List<RuntimeSession> queued = runtimeSessionRepository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED");
        if (queued == null || queued.isEmpty() || queued.get(0).getCreatedAt() == null) return 0L;
        return Math.max(0L, Duration.between(queued.get(0).getCreatedAt().toInstant(), now).getSeconds());
    }

    private double computeRecentBootFailureRatePercent(Instant now) {
        List<RuntimeSession> recent = runtimeSessionRepository.findTop20ByCompletedAtIsNotNullOrderByCompletedAtDesc();
        if (recent == null || recent.isEmpty()) return 0.0;
        Instant cutoff = now.minusSeconds(3600);
        int total = 0;
        int failed = 0;
        for (RuntimeSession s : recent) {
            if (s.getCompletedAt() == null || s.getCompletedAt().toInstant().isBefore(cutoff)) continue;
            if (s.getStudioControl() != null && s.getStudioControl().path("simulatedSandbox").asBoolean(false)) continue;
            String exec = s.getExecutionStatus() == null ? "" : s.getExecutionStatus().toUpperCase(Locale.ROOT);
            if ("CANCELLED".equals(exec)) continue;
            total++;
            if ("FAILED".equals(exec) || "TIMED_OUT".equals(exec) || "TIMEDOUT".equals(exec) || "TIMEOUT".equals(exec)) {
                failed++;
            }
        }
        return total >= 5 ? (100.0 * failed / total) : 0.0;
    }

    private boolean dispatchRateLimitedAlert(String alertKey, Instant now, String message) {
        long cooldown = Math.max(30L, alertCooldownSeconds);
        Instant previous = lastAlerts.get(alertKey);
        if (previous != null && Duration.between(previous, now).getSeconds() < cooldown) {
            return false;
        }
        try {
            ObjectNode payload = objectMapper.createObjectNode()
                    .put("content", message)
                    .put("text", message)
                    .put("alertKey", alertKey)
                    .put("severity", "WARNING")
                    .put("observedAt", now.toString());
            if (sendWebhookPayload(objectMapper.writeValueAsString(payload))) {
                lastAlerts.put(alertKey, now);
                return true;
            }
        } catch (Exception e) {
            log.warn("Failed to send runtime alert {} (webhook delivery failed)", alertKey);
        }
        return false;
    }

    protected boolean sendWebhookPayload(String jsonBody) {
        try {
            var client = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            var request = java.net.http.HttpRequest.newBuilder(java.net.URI.create(alertWebhookUrl.trim()))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();
            var response = client.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            return false;
        }
    }

    private void refreshDockerAndRuntimeProbe() {
        long now = System.currentTimeMillis();
        if (now - lastRuntimeProbeMillis < 60_000L) {
            return;
        }
        CommandOutput out = runHostCommand(List.of("docker", "info", "--format", "{{json .Runtimes}}"), 5);
        boolean reachable = out.exitCode() == 0;
        boolean hasRunsc = false;
        if (reachable && out.stdout() != null && !out.stdout().isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(out.stdout());
                hasRunsc = node.isObject() && node.has("runsc");
            } catch (Exception ignored) {
            }
        }
        cachedDockerReachable = reachable;
        cachedGvisorAvailable = hasRunsc;
        lastRuntimeProbeMillis = now;
    }

    protected long usableDiskMiB() {
        File target = resolveDiskProbeTarget();
        long bytes = target.getUsableSpace();
        return bytes > 0 ? bytes / (1024L * 1024L) : -1L;
    }

    protected long totalDiskMiB() {
        File target = resolveDiskProbeTarget();
        long bytes = target.getTotalSpace();
        return bytes > 0 ? bytes / (1024L * 1024L) : -1L;
    }

    private File resolveDiskProbeTarget() {
        if (runnerStateRoot != null && !runnerStateRoot.isBlank()) {
            File stateDir = new File(runnerStateRoot);
            if (stateDir.exists()) return stateDir;
        }
        return new File(".");
    }

    protected CommandOutput runHostCommand(List<String> command, long timeoutSeconds) {
        try {
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new CommandOutput(-1, "");
            }
            String stdout = new String(process.getInputStream().readNBytes(65_536), StandardCharsets.UTF_8);
            return new CommandOutput(process.exitValue(), stdout);
        } catch (Exception e) {
            return new CommandOutput(-1, "");
        }
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
        // afterCommit() triggers drainQueueIfCapacityAvailable while the outer TX resources are still bound;
        // REQUIRES_NEW guarantees READY_FOR_DISPATCH commits independently before async dispatch starts.
        if (transactionTemplate.getTransactionManager() != null) {
            var requiresNew = new TransactionTemplate(transactionTemplate.getTransactionManager());
            requiresNew.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            return requiresNew.execute(status -> action.get());
        }
        return transactionTemplate.execute(status -> action.get());
    }
}
