package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RuntimeStudioServiceTest {
    private final RuntimeSessionRepository sessions = mock(RuntimeSessionRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final CourseLabPolicy labs = mock(CourseLabPolicy.class);
    private final RunnerServiceAuthGuard runner = mock(RunnerServiceAuthGuard.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final RuntimeStudioService service = new RuntimeStudioService(sessions, access, labs, runner, mapper);
    private final UUID id = UUID.randomUUID();
    private RuntimeSession session;

    @BeforeEach void setup() {
        session = RuntimeSession.builder().id(id).project(new Project()).executionStatus("RUNNING")
            .scenarioConfig(mapper.createObjectNode().put("interactiveStudio", true))
            .resourceProject("mavisrun-0123456789abcdef0123456789abcdef")
            .confirmedServiceMappings(Map.of("orders", UUID.randomUUID().toString())).build();
        when(sessions.findLockedById(id)).thenReturn(Optional.of(session));
    }

    @Test void actionRetryIsIdempotentAndDifferentPayloadIsRejected() {
        UUID actionId = UUID.randomUUID();
        var request = new RuntimeStudioService.ActionRequest(actionId, "SCALE", "orders", 4);
        assertEquals(1, service.submit(id, request).path("actions").size());
        assertEquals(1, service.submit(id, request).path("actions").size());
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(actionId, "SCALE", "orders", 2)));
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "orders", null)));
    }

    @Test void pollAndAcknowledgementKeepSameCommandAcrossRetries() {
        UUID actionId = UUID.randomUUID();
        service.submit(id, new RuntimeStudioService.ActionRequest(actionId, "STOP", "orders", null));
        var first = service.poll(id, session.getResourceProject());
        var again = service.poll(id, session.getResourceProject());
        assertEquals(first.path("command").path("actionId"), again.path("command").path("actionId"));
        ObjectNode result = mapper.createObjectNode().put("confirmed", true).put("action", "STOP").put("service", "orders")
            .put("replicasBefore",1).put("replicasAfter",0);
        var ack = new RuntimeStudioService.AckRequest(actionId, id, session.getResourceProject(), "CONFIRMED", result);
        assertEquals(service.acknowledge(id, ack), service.acknowledge(id, ack));
        assertFalse(service.poll(id, session.getResourceProject()).has("command"));
        verify(runner, atLeastOnce()).requireRunnerService();
    }

    @Test void rejectsUnknownServiceAndTerminalSessions() {
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "other", null)));
        session.setExecutionStatus("COMPLETED");
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "orders", null)));
    }

    @Test void legacySessionWithoutLifecycleValuesStillHasReadableState() {
        when(sessions.findById(id)).thenReturn(Optional.of(session));
        session.setExecutionStatus(null);
        session.setCleanupStatus(null);
        var state = service.state(id);
        assertEquals("UNKNOWN", state.path("executionStatus").asText());
        assertEquals("UNKNOWN", state.path("cleanupStatus").asText());
    }

    @Test void telemetryIsRedactedAndCapturedEvidenceDoesNotChangeWithNewSamples() {
        session.setSourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build());
        var telemetry = mapper.createObjectNode().put("observedAt","sample-before");
        telemetry.put("logs","password=supersecret");
        service.telemetry(id,new RuntimeStudioService.TelemetryRequest(id,session.getResourceProject(),telemetry));
        var evidence=service.capture(id,new RuntimeStudioService.CaptureRequest("Observed failure propagation"));
        assertFalse(evidence.toString().contains("supersecret"));
        assertTrue(evidence.path("digest").asText().matches("sha256:[a-f0-9]{64}"));
        telemetry.put("observedAt","sample-after");
        service.telemetry(id,new RuntimeStudioService.TelemetryRequest(id,session.getResourceProject(),telemetry));
        assertEquals("sample-before",session.getStudioControl().path("snapshots").get(0).path("telemetry").path("observedAt").asText());
        assertThrows(BusinessException.class,()->service.telemetry(id,
            new RuntimeStudioService.TelemetryRequest(id,"other-allocation",telemetry)));
    }

    @Test void failedAcknowledgementWithoutMetricsCanBeRetried() {
        UUID actionId = UUID.randomUUID();
        service.submit(id, new RuntimeStudioService.ActionRequest(actionId, "STOP", "orders", null));
        service.poll(id, session.getResourceProject());
        var failed = new RuntimeStudioService.AckRequest(actionId, id, session.getResourceProject(), "FAILED", null);
        assertEquals(service.acknowledge(id, failed), service.acknowledge(id, failed));
    }

    @Test void finishRequiresConfirmedActionAndThenCloses() {
        UUID actionId = UUID.randomUUID();
        service.submit(id, new RuntimeStudioService.ActionRequest(actionId, "START", "orders", null));
        assertThrows(BusinessException.class, () -> service.finish(id));
        var polled = service.poll(id, session.getResourceProject());
        assertFalse(polled.path("finishRequested").asBoolean());
        assertTrue(polled.has("command"));
        service.acknowledge(id, new RuntimeStudioService.AckRequest(actionId, id, session.getResourceProject(), "CONFIRMED",
            mapper.createObjectNode().put("confirmed", true).put("action", "START").put("service", "orders")
                .put("replicasBefore",0).put("replicasAfter",1)));
        service.finish(id);
        assertTrue(service.poll(id, session.getResourceProject()).path("finishRequested").asBoolean());
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "orders", null)));
    }
}
