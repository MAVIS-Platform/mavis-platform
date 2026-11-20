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

    private final ConcurrentHashMap<UUID, Instant> uiHeartbeats = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Instant> dispatchTimestamps = new ConcurrentHashMap<>();
    private final AtomicLong orphansReapedTotal = new AtomicLong();
    private final AtomicLong abandonedReapedTotal = new AtomicLong();
    private final AtomicLong staleDispatchesReapedTotal = new AtomicLong();
    private volatile long lastRuntimeProbeMillis = 0L;
    private volatile boolean cachedDockerReachable = false;
    private volatile boolean cachedGvisorAvailable = false;

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
            List<String> warnings) {}

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
        // In-memory dispatch threads died with the previous process; give those sessions back to the queue.
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
                // Simulated sandboxes have no runner to send a receipt; resolve their cancellation immediately.
                long limit = simulated && "CANCELLING".equals(status) ? 0 : stuckAfter;
                if (Duration.between(since.toInstant(), now).getSeconds() < limit) {
                    continue;
                }
                if (simulated && "RUNNING".equals(status)) {
                    continue; // Simulated RUNNING ends through the abandoned-tab reaper or Stop.
                }
                Boolean marked = runInTransaction(() -> {
                    RuntimeSession locked = runtimeSessionRepository.findLockedById(id).orElse(null);
                    if (locked == null || !status.equalsIgnoreCase(locked.getExecutionStatus())
                            || locked.getRunnerReceiptJson() != null || locked.getCompletedAt() != null) {
                        return false;
                    }
                    boolean cancelling = "CANCELLING".equals(status);
                    locked.setExecutionStatus(cancelling ? "CANCELLED" : "FAILED");
                    locked.setCleanupStatus(simulated ? "NOT_APPLICABLE" : "UNCONFIRMED");
                    locked.setCompletedAt(OffsetDateTime.now());
                    if (!simulated) {
                        ObjectNode recovery = objectMapper.createObjectNode();
                        recovery.put("code", "RUNNER_LOST_RECOVERY_REQUIRED");
                        String reason = "No Runner receipt arrived for a " + status + " session after " + stuckAfter
                                + "s; containers are swept by the host watchdog.";
                        recovery.put("reason", reason);
                        recovery.put("message", reason);
                        locked.setRecoveryResultJson(recovery);
                        writeCancelMarkerBestEffort(locked);
                    }
                    runtimeSessionRepository.save(locked);
                    return true;
                });
                if (Boolean.TRUE.equals(marked)) {
                    reaped++;
                    log.warn("Reaped stuck {} runtime session {} (simulated={})", status, id, simulated);
                }
            }
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
                reaped++;
                abandonedReapedTotal.incrementAndGet();
                log.info("Auto-reaped abandoned Studio session {} after {}s idle (waiters={})",
                        id, Duration.between(lastSeen, now).getSeconds(), hasWaiters);
            }
        }
        uiHeartbeats.keySet().retainAll(activeRunningIds);
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
        if (isRemoteWorkerMode() && (sandboxRegistry == null || sandboxRegistry.isBlank())) {
            if ("READY".equals(readiness)) readiness = "DEGRADED";
            warnings.add("REMOTE_WORKER mode without MAVIS_RUNNER_SANDBOX_REGISTRY: Dockerfile-built Labs need a shared registry so remote Worker VPSs can pull images.");
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
                warnings);
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
        return transactionTemplate.execute(status -> action.get());
    }
}
