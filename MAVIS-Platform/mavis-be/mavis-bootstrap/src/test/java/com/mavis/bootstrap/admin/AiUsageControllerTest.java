package com.mavis.bootstrap.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.service.AiUsageRecorder;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import java.sql.SQLException;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiUsageControllerTest {
    AccessPolicyService policy = mock(AccessPolicyService.class);
    AiUsageRecorder recorder = mock(AiUsageRecorder.class);
    AiUsageController controller;
    @BeforeEach void init() {
        controller = new AiUsageController(policy, recorder, new ObjectMapper(), new GeminiMonitoringClient(new ObjectMapper()));
        ReflectionTestUtils.setField(controller, "ingestKey", "01234567890123456789012345678901");
    }
    @Test void rejectsNonAdminBeforeReadingTelemetry() throws SQLException {
        doThrow(new AccessDeniedException("forbidden")).when(policy).requireSystemAdmin();
        assertThatThrownBy(() -> controller.usage()).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(recorder);
    }
    @Test void ingestRejectsMissingOrWrongSecretAndDoesNotWrite() {
        var event = new AiUsageController.Ingest("openai", "gpt-5-mini", UUID.randomUUID(), 10L, 4L);
        assertThatThrownBy(() -> controller.ingest(null, event)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("401");
        assertThatThrownBy(() -> controller.ingest("wrong", event)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("401");
        verifyNoInteractions(recorder);
    }
    @Test void ingestReportsUnavailableWhenKeyOrDatabaseMissing() {
        var event = new AiUsageController.Ingest("openai", "gpt-5-mini", UUID.randomUUID(), 10L, 4L);
        ReflectionTestUtils.setField(controller, "ingestKey", "");
        assertThatThrownBy(() -> controller.ingest("", event)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("503");
        ReflectionTestUtils.setField(controller, "ingestKey", "01234567890123456789012345678901");
        assertThatThrownBy(() -> controller.ingest("01234567890123456789012345678901", event)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("503");
    }
    @Test void unavailableDatabaseNeverReportedAsZero() throws SQLException {
        when(recorder.totals()).thenThrow(new SQLException());
        Map<?,?> data = (Map<?,?>) controller.usage().getData();
        assertThat(data.get("status")).isEqualTo("UNAVAILABLE");
        var providers = (List<?>) data.get("providers");
        assertThat(((Map<?,?>) providers.get(0)).get("usage")).isNull();
    }
    @Test void totalsAreGroupedByModelAndSource() throws SQLException {
        when(recorder.totals()).thenReturn(List.of(
            new AiUsageRecorder.Totals("openai","model-a",10,2,1,"java"),
            new AiUsageRecorder.Totals("openai","model-a",3,1,1,"next"),
            new AiUsageRecorder.Totals("openai","model-b",100,5,1,"java")));
        Map<?,?> data = (Map<?,?>) controller.usage().getData();
        List<?> providers = (List<?>) data.get("providers");
        Map<?,?> a = (Map<?,?>) providers.get(0); Map<?,?> b = (Map<?,?>) providers.get(1);
        assertThat(a.get("model")).isEqualTo("model-a");
        assertThat(((Map<?,?>) a.get("usage")).get("inputTokens")).isEqualTo(13L);
        assertThat(((Map<?,?>) a.get("coverage")).get("next")).isEqualTo("OBSERVED");
        assertThat(b.get("model")).isEqualTo("model-b");
        assertThat(((Map<?,?>) b.get("coverage")).get("next")).isEqualTo("UNKNOWN");
    }
}
