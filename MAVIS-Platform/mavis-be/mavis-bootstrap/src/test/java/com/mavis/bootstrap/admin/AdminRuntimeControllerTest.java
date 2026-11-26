package com.mavis.bootstrap.admin;

import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminRuntimeControllerTest {

    @Test
    void testIntegrationProbesGeminiAuditsAndRejectsUnknown() {
        var policy = mock(AccessPolicyService.class);
        var settings = new PlatformRuntimeSettings();
        var audit = mock(AuditLogService.class);
        var keys = mock(ApiKeyProvider.class);
        when(keys.hasValidKey()).thenReturn(true);

        var controller = new AdminRuntimeController(
                policy,
                settings,
                audit,
                keys,
                mock(JobRepository.class),
                mock(RuntimeSessionRepository.class),
                mock(RuntimeSessionService.class));

        var response = controller.testIntegration("gemini-ai");
        assertEquals(ErrorCode.SUCCESS.getCode(), response.getCode());
        @SuppressWarnings("unchecked")
        var data = (Map<String, Object>) response.getData();
        assertEquals("gemini-ai", data.get("id"));
        assertEquals(Boolean.TRUE, data.get("reachable"));
        assertEquals("CONFIGURED", data.get("status"));
        assertNotNull(data.get("checkedAt"));
        verify(policy).requireSystemAdmin();
        verify(audit).recordAuditLog(eq("TEST_INTEGRATION"), eq("INTEGRATION"), any(), anyMap());

        var notFound = assertThrows(BusinessException.class, () -> controller.testIntegration("unknown"));
        assertEquals(ErrorCode.NOT_FOUND, notFound.getErrorCode());
    }

    @Test
    void sessionsUsesEntityGraphTop50Query() {
        var policy = mock(AccessPolicyService.class);
        var sessionsRepo = mock(RuntimeSessionRepository.class);
        var session = RuntimeSession.builder()
                .id(UUID.randomUUID())
                .executionStatus("FAILED")
                .cleanupStatus("NOT_APPLICABLE")
                .build();
        when(sessionsRepo.findTop50ByOrderByCreatedAtDesc()).thenReturn(List.of(session));

        var controller = new AdminRuntimeController(
                policy,
                new PlatformRuntimeSettings(),
                mock(AuditLogService.class),
                mock(ApiKeyProvider.class),
                mock(JobRepository.class),
                sessionsRepo,
                mock(RuntimeSessionService.class));

        var response = controller.sessions();
        assertEquals(ErrorCode.SUCCESS.getCode(), response.getCode());
        @SuppressWarnings("unchecked")
        var list = (List<RuntimeSessionResponseDTO>) response.getData();
        assertEquals(1, list.size());
        assertEquals("NOT_APPLICABLE", list.getFirst().getCleanupStatus());
        verify(policy).requireSystemAdmin();
        verify(sessionsRepo).findTop50ByOrderByCreatedAtDesc();
        verifyNoMoreInteractions(sessionsRepo);
    }

    @Test
    void sessionsUsesLightweightJdbcProjectionWithoutHydratingToastEntitiesWhenAvailable() {
        var policy = mock(AccessPolicyService.class);
        var sessionsRepo = mock(RuntimeSessionRepository.class);
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var sessionId = UUID.randomUUID();
        var dto = RuntimeSessionResponseDTO.builder()
                .id(sessionId)
                .executionStatus("COMPLETED")
                .cleanupStatus("CONFIRMED")
                .studioVerified(true)
                .build();
        when(jdbc.query(contains("FROM runtime_sessions s"), org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<RuntimeSessionResponseDTO>>any()))
                .thenReturn(List.of(dto));

        var controller = new AdminRuntimeController(
                policy,
                new PlatformRuntimeSettings(),
                mock(AuditLogService.class),
                mock(ApiKeyProvider.class),
                mock(JobRepository.class),
                sessionsRepo,
                mock(RuntimeSessionService.class));
        controller.setJdbcTemplate(jdbc);

        var response = controller.sessions();
        assertEquals(ErrorCode.SUCCESS.getCode(), response.getCode());
        @SuppressWarnings("unchecked")
        var list = (List<RuntimeSessionResponseDTO>) response.getData();
        assertEquals(1, list.size());
        assertEquals(sessionId, list.getFirst().getId());
        assertTrue(list.getFirst().isStudioVerified());
        verify(policy).requireSystemAdmin();
        verifyNoInteractions(sessionsRepo);
    }
}
