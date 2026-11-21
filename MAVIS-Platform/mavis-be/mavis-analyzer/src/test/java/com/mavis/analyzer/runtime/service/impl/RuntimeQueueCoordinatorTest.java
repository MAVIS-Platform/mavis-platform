package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.repository.RuntimeSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RuntimeQueueCoordinatorTest {

    @Mock
    private RuntimeSessionRepository repository;

    @Mock
    private RuntimeRunnerDispatcher dispatcher;

    private final ObjectMapper mapper = new ObjectMapper();
    private RuntimeQueueCoordinator coordinator;

    @BeforeEach
    void setUp() {
        coordinator = new RuntimeQueueCoordinator(repository, dispatcher, mapper);
        ReflectionTestUtils.setField(coordinator, "maxActiveStudioSessions", 2);
        ReflectionTestUtils.setField(coordinator, "maxQueuedStudioSessions", 30);
        ReflectionTestUtils.setField(coordinator, "abandonedIdleSeconds", 90L);
        ReflectionTestUtils.setField(coordinator, "dispatchStaleSeconds", 180L);
        ReflectionTestUtils.setField(coordinator, "runnerMode", "AUTO");
    }

    @Test
    void queuePositionReturnsOneBasedFifoRankOnlyForQueuedSessions() {
        OffsetDateTime t2 = OffsetDateTime.now(ZoneOffset.UTC);
        RuntimeSession queued = RuntimeSession.builder().id(UUID.randomUUID()).executionStatus("QUEUED").createdAt(t2).build();
        when(repository.countByExecutionStatusAndCreatedAtBefore("QUEUED", t2)).thenReturn(2L);

        assertThat(coordinator.queuePosition(queued)).isEqualTo(3);

        RuntimeSession running = RuntimeSession.builder().id(UUID.randomUUID()).executionStatus("RUNNING").createdAt(t2).build();
        assertThat(coordinator.queuePosition(running)).isNull();
    }

    @Test
    void claimNextQueuedForRemoteWorkerTransitionsOldestQueuedAtomically() {
        UUID oldestId = UUID.randomUUID();
        RuntimeSession queued = RuntimeSession.builder()
                .id(oldestId)
                .executionStatus("QUEUED")
                .resourceProject("mavisrun-" + "a".repeat(32))
                .build();
        when(repository.lockOldestQueued()).thenReturn(Optional.of(queued), Optional.empty());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        var claimed = coordinator.claimNextQueuedForRemoteWorker("worker-eu-1", "runsc");

        assertThat(claimed.claimed()).isTrue();
        assertThat(claimed.sessionId()).isEqualTo(oldestId);
        assertThat(queued.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        verify(repository).save(queued);
        // A second claimer sees the row as locked/claimed (SKIP LOCKED) and gets nothing — no double claim.
        assertThat(coordinator.claimNextQueuedForRemoteWorker("worker-eu-2", "runsc").claimed()).isFalse();
    }

    @Test
    void drainQueuePromotesQueuedSessionsWhenSlotsOpenAndSkipsInRemoteWorkerMode() {
        UUID firstId = UUID.randomUUID();
        RuntimeSession queued = RuntimeSession.builder().id(firstId).executionStatus("QUEUED").resourceProject("mavisrun-" + "b".repeat(32)).build();
        when(dispatcher.isAutoDispatchEnabled()).thenReturn(true);
        when(repository.countActiveNonSimulated(RuntimeQueueCoordinator.IN_FLIGHT_STATUSES)).thenReturn(1L, 2L);
        when(repository.lockOldestQueued()).thenReturn(Optional.of(queued));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int promoted = coordinator.drainQueueIfCapacityAvailable();

        assertThat(promoted).isEqualTo(1);
        assertThat(queued.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        verify(dispatcher).dispatchSessionAsync(firstId);

        // In REMOTE_WORKER mode, local dispatcher must never claim queued work.
        ReflectionTestUtils.setField(coordinator, "runnerMode", "REMOTE_WORKER");
        assertThat(coordinator.hasLocalDispatchCapacity()).isFalse();
        assertThat(coordinator.drainQueueIfCapacityAvailable()).isZero();
    }

    @Test
    void cancellingSessionsKeepHoldingCapacityUntilTeardown() {
        assertThat(RuntimeQueueCoordinator.IN_FLIGHT_STATUSES).contains("CANCELLING");
    }

    @Test
    void stuckReaperFailsLostRunnerSessionsAndResolvesSimulatedCancellationImmediately() {
        Instant now = Instant.now();
        UUID lostId = UUID.randomUUID();
        UUID simulatedId = UUID.randomUUID();
        UUID freshId = UUID.randomUUID();
        RuntimeSession lost = RuntimeSession.builder().id(lostId).executionStatus("RUNNING")
                .startedAt(OffsetDateTime.ofInstant(now.minusSeconds(900), ZoneOffset.UTC)).build();
        RuntimeSession fresh = RuntimeSession.builder().id(freshId).executionStatus("RUNNING")
                .startedAt(OffsetDateTime.ofInstant(now.minusSeconds(60), ZoneOffset.UTC)).build();
        RuntimeSession simulated = RuntimeSession.builder().id(simulatedId).executionStatus("CANCELLING")
                .cancelRequestedAt(OffsetDateTime.ofInstant(now.minusSeconds(2), ZoneOffset.UTC))
                .studioControl(mapper.createObjectNode().put("simulatedSandbox", true)).build();
        when(repository.findByExecutionStatusOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(repository.findByExecutionStatusOrderByCreatedAtAsc("RUNNING")).thenReturn(List.of(lost, fresh));
        when(repository.findByExecutionStatusOrderByCreatedAtAsc("CANCELLING")).thenReturn(List.of(simulated));
        when(repository.findLockedById(lostId)).thenReturn(Optional.of(lost));
        when(repository.findLockedById(simulatedId)).thenReturn(Optional.of(simulated));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int reaped = coordinator.reapStuckSessions(now);

        assertThat(reaped).isEqualTo(2);
        assertThat(lost.getExecutionStatus()).isEqualTo("FAILED");
        assertThat(lost.getRecoveryResultJson().path("code").asText()).isEqualTo("RUNNER_LOST_RECOVERY_REQUIRED");
        assertThat(simulated.getExecutionStatus()).isEqualTo("CANCELLED");
        assertThat(simulated.getCleanupStatus()).isEqualTo("NOT_APPLICABLE");
        assertThat(fresh.getExecutionStatus()).isEqualTo("RUNNING");
    }

    @Test
    void stuckReaperNeverTouchesSessionsTheLocalRunnerIsStillExecuting() {
        Instant now = Instant.now();
        UUID busyId = UUID.randomUUID();
        RuntimeSession busy = RuntimeSession.builder().id(busyId).executionStatus("ALLOCATED")
                .allocatedAt(OffsetDateTime.ofInstant(now.minusSeconds(3600), ZoneOffset.UTC)).build();
        when(repository.findByExecutionStatusOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(repository.findByExecutionStatusOrderByCreatedAtAsc("ALLOCATED")).thenReturn(List.of(busy));
        when(dispatcher.isExecuting(busyId)).thenReturn(true);

        assertThat(coordinator.reapStuckSessions(now)).isZero();
        assertThat(busy.getExecutionStatus()).isEqualTo("ALLOCATED");
    }

    @Test
    void reapAbandonedStudioSessionsCancelsIdleTabWhenWaitersPresentAndSparesActiveTabs() {
        UUID idleId = UUID.randomUUID();
        UUID activeId = UUID.randomUUID();
        Instant now = Instant.now();

        RuntimeSession idleStudio = RuntimeSession.builder()
                .id(idleId)
                .executionStatus("RUNNING")
                .startedAt(OffsetDateTime.ofInstant(now.minusSeconds(200), ZoneOffset.UTC))
                .scenarioConfig(mapper.createObjectNode().put("interactiveStudio", true))
                .resourceProject("mavisrun-" + "c".repeat(32))
                .build();
        RuntimeSession activeStudio = RuntimeSession.builder()
                .id(activeId)
                .executionStatus("RUNNING")
                .startedAt(OffsetDateTime.ofInstant(now.minusSeconds(200), ZoneOffset.UTC))
                .scenarioConfig(mapper.createObjectNode().put("interactiveStudio", true))
                .resourceProject("mavisrun-" + "d".repeat(32))
                .build();
        coordinator.recordUiHeartbeat(activeId);

        when(repository.countByExecutionStatusIn(List.of("QUEUED"))).thenReturn(1L);
        when(repository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("RUNNING"))
                .thenReturn(List.of(idleStudio, activeStudio));
        when(repository.findLockedById(idleId)).thenReturn(Optional.of(idleStudio));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int reaped = coordinator.reapAbandonedStudioSessions(now);

        assertThat(reaped).isEqualTo(1);
        assertThat(idleStudio.getExecutionStatus()).isEqualTo("CANCELLING");
        assertThat(idleStudio.getCancelRequestedAt()).isNotNull();
        assertThat(activeStudio.getExecutionStatus()).isEqualTo("RUNNING");
        assertThat(activeStudio.getCancelRequestedAt()).isNull();
    }

    @Test
    void reapStaleDispatchesMarksUnpickedSessionFailedWithoutKillingFreshPromotion() {
        UUID staleId = UUID.randomUUID();
        UUID freshId = UUID.randomUUID();
        Instant now = Instant.now();

        RuntimeSession stale = RuntimeSession.builder()
                .id(staleId)
                .executionStatus("READY_FOR_DISPATCH")
                .createdAt(OffsetDateTime.ofInstant(now.minusSeconds(600), ZoneOffset.UTC))
                .build();
        RuntimeSession fresh = RuntimeSession.builder()
                .id(freshId)
                .executionStatus("READY_FOR_DISPATCH")
                // Created 10 minutes ago (e.g. waited in QUEUED), but only dispatched 10s ago!
                .createdAt(OffsetDateTime.ofInstant(now.minusSeconds(600), ZoneOffset.UTC))
                .build();

        // First observe stale at t-200s, fresh at t-10s
        when(repository.findByExecutionStatusOrderByCreatedAtAsc("READY_FOR_DISPATCH"))
                .thenReturn(List.of(stale, fresh));
        coordinator.reapStaleDispatches(now.minusSeconds(200));
        coordinator.recordDispatched(freshId);

        when(repository.findLockedById(staleId)).thenReturn(Optional.of(stale));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int reaped = coordinator.reapStaleDispatches(now);

        assertThat(reaped).isEqualTo(1);
        assertThat(stale.getExecutionStatus()).isEqualTo("FAILED");
        assertThat(stale.getRecoveryResultJson().path("code").asText()).isEqualTo("RUNNER_DISPATCH_TIMEOUT");
        assertThat(fresh.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
    }

    @Test
    void persistedLastUiActivitySparesSessionAfterBackendRestart() {
        UUID resumedId = UUID.randomUUID();
        Instant now = Instant.now();
        var control = mapper.createObjectNode().put("lastUiActivityAt",
                OffsetDateTime.ofInstant(now.minusSeconds(20), ZoneOffset.UTC).toString());
        RuntimeSession resumed = RuntimeSession.builder()
                .id(resumedId)
                .executionStatus("RUNNING")
                .startedAt(OffsetDateTime.ofInstant(now.minusSeconds(300), ZoneOffset.UTC))
                .scenarioConfig(mapper.createObjectNode().put("interactiveStudio", true))
                .studioControl(control)
                .resourceProject("mavisrun-" + "e".repeat(32))
                .build();
        when(repository.countByExecutionStatusIn(List.of("QUEUED"))).thenReturn(2L);
        when(repository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("RUNNING"))
                .thenReturn(List.of(resumed));

        assertThat(coordinator.reapAbandonedStudioSessions(now)).isZero();
        assertThat(resumed.getExecutionStatus()).isEqualTo("RUNNING");
    }

    @Test
    void sweepOrphanDockerResourcesOnlyRemovesOldTerminalMavisrunProjects() {
        String orphanProj = "mavisrun-" + "1".repeat(32);
        String activeProj = "mavisrun-" + "2".repeat(32);
        Instant now = Instant.now();

        RuntimeSession terminalOld = RuntimeSession.builder()
                .id(UUID.randomUUID())
                .resourceProject(orphanProj)
                .executionStatus("FAILED")
                .completedAt(OffsetDateTime.ofInstant(now.minusSeconds(300), ZoneOffset.UTC))
                .build();
        RuntimeSession stillRunning = RuntimeSession.builder()
                .id(UUID.randomUUID())
                .resourceProject(activeProj)
                .executionStatus("RUNNING")
                .build();

        java.util.List<List<String>> executed = new java.util.ArrayList<>();
        RuntimeQueueCoordinator stub = new RuntimeQueueCoordinator(repository, dispatcher, mapper) {
            @Override
            protected CommandOutput runHostCommand(List<String> command, long timeoutSeconds) {
                executed.add(command);
                if (command.contains("ps") && command.contains("{{.Label \"com.docker.compose.project\"}}")) {
                    return new CommandOutput(0, orphanProj + "\n" + activeProj + "\nmavis\n");
                }
                if (command.contains("network") && command.contains("ls")) {
                    return new CommandOutput(0, orphanProj + "_default\n" + activeProj + "_default\n");
                }
                if (command.contains("-aq")) {
                    return new CommandOutput(0, "abc123\n");
                }
                if (command.contains("volume") && command.contains("ls")) {
                    return new CommandOutput(0, "vol1\n");
                }
                return new CommandOutput(0, "");
            }
        };
        when(repository.findByResourceProjectIn(any())).thenReturn(List.of(terminalOld, stillRunning));

        int removed = stub.sweepOrphanDockerResources(now);

        assertThat(removed).isEqualTo(1);
        assertThat(executed).anyMatch(cmd -> cmd.contains("rm") && cmd.contains("abc123"));
        assertThat(executed).anyMatch(cmd -> cmd.contains("network") && cmd.contains(orphanProj + "_default"));
        assertThat(executed).noneMatch(cmd -> cmd.contains(activeProj + "_default"));
    }

    @Test
    void runtimeHealthReportsReadinessAndDiskProtectionThresholds() {
        java.util.List<List<String>> pruneCalls = new java.util.ArrayList<>();
        RuntimeQueueCoordinator stub = new RuntimeQueueCoordinator(repository, dispatcher, mapper) {
            @Override
            protected CommandOutput runHostCommand(List<String> command, long timeoutSeconds) {
                pruneCalls.add(command);
                if (command.contains("info")) {
                    return new CommandOutput(0, "{\"runc\":{},\"runsc\":{}}");
                }
                return new CommandOutput(0, "");
            }

            @Override
            protected long usableDiskMiB() {
                return 1024L;
            }

            @Override
            protected long totalDiskMiB() {
                return 40960L;
            }
        };
        ReflectionTestUtils.setField(stub, "lowDiskThresholdMiB", 2048L);
        ReflectionTestUtils.setField(stub, "configuredOciRuntime", "auto");
        ReflectionTestUtils.setField(stub, "runnerMode", "AUTO");

        assertThat(stub.checkAndProtectDiskSpace()).isTrue();
        assertThat(pruneCalls).anyMatch(c -> c.contains("builder") && c.contains("prune"));
        assertThat(pruneCalls).anyMatch(c -> c.contains("image") && c.contains("prune"));

        var health = stub.getRuntimeHealth();
        assertThat(health.gvisorAvailable()).isTrue();
        assertThat(health.effectiveOciRuntime()).isEqualTo("runsc");
        assertThat(health.diskLowWarning()).isTrue();
        assertThat(health.surveyReadiness()).isEqualTo("DEGRADED");
    }

    @Test
    void webhookAlertingFiresForLowDiskQueueWaitAndBootFailureRateWithRateLimiting() {
        Instant now = Instant.now();
        java.util.List<String> sentPayloads = new java.util.ArrayList<>();
        RuntimeQueueCoordinator stub = new RuntimeQueueCoordinator(repository, dispatcher, mapper) {
            @Override
            protected long usableDiskMiB() { return 512L; }
            @Override
            protected boolean sendWebhookPayload(String jsonBody) {
                sentPayloads.add(jsonBody);
                return true;
            }
        };
        ReflectionTestUtils.setField(stub, "alertWebhookUrl", "https://hooks.example.test/mavis");
        ReflectionTestUtils.setField(stub, "lowDiskThresholdMiB", 2048L);
        ReflectionTestUtils.setField(stub, "alertQueueWaitSeconds", 60L);
        ReflectionTestUtils.setField(stub, "alertCooldownSeconds", 600L);

        RuntimeSession oldQueued = RuntimeSession.builder().id(UUID.randomUUID()).executionStatus("QUEUED")
                .createdAt(OffsetDateTime.ofInstant(now.minusSeconds(120), ZoneOffset.UTC)).build();
        when(repository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED"))
                .thenReturn(List.of(oldQueued));
        List<RuntimeSession> recent = List.of(
                RuntimeSession.builder().executionStatus("FAILED").completedAt(OffsetDateTime.ofInstant(now.minusSeconds(30), ZoneOffset.UTC)).build(),
                RuntimeSession.builder().executionStatus("FAILED").completedAt(OffsetDateTime.ofInstant(now.minusSeconds(40), ZoneOffset.UTC)).build(),
                RuntimeSession.builder().executionStatus("COMPLETED").completedAt(OffsetDateTime.ofInstant(now.minusSeconds(50), ZoneOffset.UTC)).build(),
                RuntimeSession.builder().executionStatus("COMPLETED").completedAt(OffsetDateTime.ofInstant(now.minusSeconds(60), ZoneOffset.UTC)).build(),
                RuntimeSession.builder().executionStatus("COMPLETED").completedAt(OffsetDateTime.ofInstant(now.minusSeconds(70), ZoneOffset.UTC)).build()
        );
        when(repository.findTop20ByCompletedAtIsNotNullOrderByCompletedAtDesc()).thenReturn(recent);

        int firstCount = stub.evaluateAndNotifyAlerts(now);
        assertThat(firstCount).isEqualTo(3);
        assertThat(sentPayloads).anyMatch(p -> p.contains("LOW_DISK"));
        assertThat(sentPayloads).anyMatch(p -> p.contains("QUEUE_WAIT"));
        assertThat(sentPayloads).anyMatch(p -> p.contains("HIGH_BOOT_FAILURE_RATE"));

        // Immediate repeat inside cooldown window must send 0 duplicate alerts
        assertThat(stub.evaluateAndNotifyAlerts(now.plusSeconds(30))).isZero();
        // After cooldown elapses, alerts fire again
        assertThat(stub.evaluateAndNotifyAlerts(now.plusSeconds(650))).isEqualTo(3);
    }
}
