package com.mavis.bootstrap.admin;

import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.platform.admin.service.AuditLogService;
import org.junit.jupiter.api.Test;

import java.util.Map;

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
}
