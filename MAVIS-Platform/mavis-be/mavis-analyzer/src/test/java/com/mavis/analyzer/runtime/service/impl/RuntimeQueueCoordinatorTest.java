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
        when(repository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED"))
                .thenReturn(List.of(queued));
        when(repository.findLockedById(oldestId)).thenReturn(Optional.of(queued));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        var claimed = coordinator.claimNextQueuedForRemoteWorker("worker-eu-1", "runsc");

        assertThat(claimed.claimed()).isTrue();
        assertThat(claimed.sessionId()).isEqualTo(oldestId);
        assertThat(queued.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        verify(repository).save(queued);
    }

    @Test
    void drainQueuePromotesQueuedSessionsWhenSlotsOpenAndSkipsInRemoteWorkerMode() {
        UUID firstId = UUID.randomUUID();
        RuntimeSession queued = RuntimeSession.builder().id(firstId).executionStatus("QUEUED").resourceProject("mavisrun-" + "b".repeat(32)).build();
        when(dispatcher.isAutoDispatchEnabled()).thenReturn(true);
        when(repository.countByExecutionStatusIn(RuntimeQueueCoordinator.IN_FLIGHT_STATUSES)).thenReturn(1L, 2L);
        when(repository.findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED"))
                .thenReturn(List.of(queued));
        when(repository.findLockedById(firstId)).thenReturn(Optional.of(queued));
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
}
