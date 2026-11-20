package com.mavis.bootstrap.admin;

import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.platform.admin.service.AuditLogService;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminRuntimeControllerTest {
    private final AccessPolicyService policy = mock(AccessPolicyService.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final RuntimeSessionRepository sessions = mock(RuntimeSessionRepository.class);
    private final RuntimeSessionService runtime = mock(RuntimeSessionService.class);
    private final AdminRuntimeController controller = new AdminRuntimeController(policy,
            mock(PlatformRuntimeSettings.class), audit, mock(ApiKeyProvider.class),
            mock(JobRepository.class), sessions, runtime);

    @Test void forceStopUsesRunnerCancellationWithoutClaimingCleanup() {
        UUID id = UUID.randomUUID();
        var session = RuntimeSession.builder().id(id).executionStatus("RUNNING").build();
        when(sessions.findById(id)).thenReturn(Optional.of(session));
        var stopped = RuntimeSessionResponseDTO.builder().id(id).executionStatus("CANCELLING")
                .cleanupStatus("STOP_REQUESTED").build();
        when(runtime.stopSession(id)).thenReturn(stopped);
        assertSame(stopped, controller.forceStopSession(id).getData());
        assertEquals("RUNNING", session.getExecutionStatus());
        assertNull(session.getCompletedAt());
        verify(runtime).stopSession(id);
        verify(sessions, never()).saveAndFlush(any());
    }

    @Test void cancellationFailureCannotProduceSuccessOrAudit() {
        UUID id = UUID.randomUUID();
        when(sessions.findById(id)).thenReturn(Optional.of(RuntimeSession.builder().id(id).build()));
        when(runtime.stopSession(id)).thenThrow(new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR));
        assertThrows(BusinessException.class, () -> controller.forceStopSession(id));
        verifyNoInteractions(audit);
        verify(sessions, never()).saveAndFlush(any());
    }

    @Test void nonAdminCannotRequestCancellation() {
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(policy).requireSystemAdmin();
        assertThrows(BusinessException.class, () -> controller.forceStopSession(UUID.randomUUID()));
        verifyNoInteractions(sessions, runtime, audit);
    }

    @Test void runtimeHealthRequiresSystemAdminAndDelegatesToQueueCoordinator() {
        var coordinator = mock(com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator.class);
        var snapshot = new com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator.RuntimeHealthSnapshot(
                "READY", "AUTO", "auto", "runsc", true, true, true, 1, 0, 2, 30, 12000, 40000, false, 0, 0, 0, java.util.List.of());
        when(coordinator.getRuntimeHealth()).thenReturn(snapshot);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "queueCoordinator", coordinator);

        assertSame(snapshot, controller.runtimeHealth().getData());
        verify(policy).requireSystemAdmin();
    }
}
