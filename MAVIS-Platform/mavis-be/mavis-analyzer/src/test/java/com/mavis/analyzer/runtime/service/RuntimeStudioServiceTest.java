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

    @Test void preparedProfileAllowsOnlyDeclaredScaleTargets() throws Exception {
        var profile = mapper.readTree("""
          {"studioTopology":{"version":1,"blocks":[{"service":"orders","label":"Orders","canScale":false}],"connections":[]}}
          """);
        ((ObjectNode) session.getScenarioConfig()).set("profile", profile);
        assertThrows(BusinessException.class, () -> service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "SCALE", "orders", 2)));
        assertEquals("orders", service.submit(id,
            new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "orders", null))
            .path("topology").path("blocks").get(0).path("service").asText());
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

    @Test void stateExposesOnlyPinnedLimitsWithoutEnvironmentValues() throws Exception {
        var config = (ObjectNode) session.getScenarioConfig();
        config.set("profile", mapper.readTree("""
          {"memoryMiB":512,"cpus":1.5,
           "applications":{
             "orders":{"runtime":"java","containerPort":8080,"readinessPath":"/health","environment":{"DB_PASSWORD":"must-not-leak"}},
             "payment":{"runtime":"passthrough","containerPort":9090}},
           "environmentBindings":{"orders":[{"name":"DB_PASSWORD","reference":"DB_PASSWORD"}]},
           "sealedInputs":"sealed-envelope-must-not-leak"}
          """));
        config.putObject("scenario").put("timeoutSeconds",240);
        when(sessions.findById(id)).thenReturn(Optional.of(session));
        var state = service.state(id);
        assertEquals(512, state.path("limits").path("memoryMiB").asInt());
        assertEquals(1.5, state.path("limits").path("cpus").asDouble());
        assertEquals(240, state.path("limits").path("timeoutSeconds").asInt());
        assertEquals("java", state.path("limits").path("services").path("orders").path("runtime").asText());
        assertEquals(8080, state.path("limits").path("services").path("orders").path("containerPort").asInt());
        assertEquals("/health", state.path("limits").path("services").path("orders").path("readinessPath").asText());
        assertFalse(state.toString().contains("DB_PASSWORD"));
        assertFalse(state.toString().contains("sealed-envelope-must-not-leak"));
    }

    @Test void telemetryIsRedactedAndCapturedEvidenceDoesNotChangeWithNewSamples() {
        session.setSourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build());
        var telemetry = mapper.createObjectNode().put("observedAt","sample-before");
        telemetry.put("logs","password=supersecret");
        service.telemetry(id,new RuntimeStudioService.TelemetryRequest(id,session.getResourceProject(),telemetry));
        var evidence=service.capture(id,new RuntimeStudioService.CaptureRequest("Observed failure propagation"));
        assertFalse(evidence.toString().contains("supersecret"));
        assertTrue(evidence.path("digest").asText().matches("sha256:[a-f0-9]{64}"));
        var payload=(ObjectNode)evidence.deepCopy();
        String digest=payload.remove("digest").asText();
        assertEquals(digest,com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(payload));
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
        var incomplete = assertThrows(BusinessException.class, () -> service.finish(id));
        assertEquals(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY, incomplete.getErrorCode());
        assertEquals("INCOMPLETE_SCENARIO", incomplete.getStableCode());
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

    @Test void bootstrapCannotReplaceAllocatedOrStartingRunnerSession() {
        for (String status : java.util.List.of("ALLOCATED", "RUNNING", "CANCELLING")) {
            session.setExecutionStatus(status);
            var failure = assertThrows(BusinessException.class, () -> service.bootstrapSimulatedSandbox(id));
            assertEquals(com.mavis.common.exception.ErrorCode.CONFLICT, failure.getErrorCode());
            assertEquals(status, session.getExecutionStatus());
            assertNull(session.getStudioControl());
        }
        verify(sessions, never()).save(any());
    }

    @Test void bootstrapPreservesObservedRunnerTelemetry() {
        var telemetry = mapper.createObjectNode().put("observedAt", "2026-11-20T10:00:00Z");
        var control = mapper.createObjectNode();
        control.set("telemetry", telemetry);
        session.setStudioControl(control);
        assertEquals(telemetry, service.bootstrapSimulatedSandbox(id).path("telemetry"));
        assertFalse(session.getStudioControl().has("simulatedSandbox"));
        verify(sessions, never()).save(any());
    }

    @Test void simulatedSandboxCompletesWithoutVerifiedRunnerEvidence() {
        session.setExecutionStatus("READY_FOR_DISPATCH");
        session.setSourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build());
        var profile = mapper.createObjectNode();
        var topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject()
                .put("service", "orders").put("label", "Orders").put("canScale", true).put("initiallyStopped", false);
        topology.putArray("connections");
        ((ObjectNode) session.getScenarioConfig()).set("profile", profile);

        var bootstrapped = service.bootstrapSimulatedSandbox(id);
        assertEquals("RUNNING", session.getExecutionStatus());
        assertEquals(1, bootstrapped.path("telemetry").path("services").size());
        assertEquals(1, bootstrapped.path("telemetry").path("services").get(0).path("runningReplicas").asInt());

        var afterStop = service.submit(id, new RuntimeStudioService.ActionRequest(UUID.randomUUID(), "STOP", "orders", null));
        assertEquals("CONFIRMED", afterStop.path("actions").get(0).path("status").asText());
        assertEquals(0, afterStop.path("telemetry").path("services").get(0).path("runningReplicas").asInt());

        var captured = service.capture(id, new RuntimeStudioService.CaptureRequest("Stopped orders caused 503"));
        assertTrue(captured.path("digest").asText().startsWith("sha256:"));

        var finished = service.finish(id);
        assertEquals("COMPLETED", finished.path("executionStatus").asText());
        assertEquals("NOT_APPLICABLE", finished.path("cleanupStatus").asText());
        assertFalse(session.hasVerifiedStudioEvidence());
        assertFalse(session.getStudioControl().has("receiptSignature"));
        assertEquals("NOT_RUN", session.getScenarioStatus());
        assertEquals("UNAVAILABLE", session.getEvidenceStatus());
        // Previously persisted simulation receipts must also fail the shared evidence guard.
        session.setScenarioStatus("PASSED");
        session.setEvidenceStatus("AVAILABLE");
        session.setCleanupStatus("CONFIRMED");
        session.setSandboxEnforcementConfirmed(true);
        session.setTraceQuality("SIMULATED_VERIFIED");
        assertFalse(session.hasVerifiedStudioEvidence());
    }

    @Test void failedSessionWithUnmappedTopologyBlockStillReturnsReadableState() throws Exception {
        session.setExecutionStatus("FAILED");
        session.setCleanupStatus("CONFIRMED");
        session.setConfirmedServiceMappings(Map.of());
        var profile = mapper.readTree("""
          {"studioTopology":{"version":1,"blocks":[{"service":"orders","label":"Orders"}],"connections":[]}}
          """);
        ((ObjectNode) session.getScenarioConfig()).set("profile", profile);
        when(sessions.findById(id)).thenReturn(Optional.of(session));

        var state = service.state(id);

        assertEquals("FAILED", state.path("executionStatus").asText());
        assertEquals("CONFIRMED", state.path("cleanupStatus").asText());
        assertFalse(state.has("topology"));
    }

    @Test void failedSessionWithReceiptOnlyControlStillReturnsValidState() {
        session.setExecutionStatus("FAILED");
        session.setCleanupStatus("CONFIRMED");
        session.setStudioControl(mapper.createObjectNode().put("receiptSignature", "hmac-sha256:abc"));
        when(sessions.findById(id)).thenReturn(Optional.of(session));

        var state = service.state(id);

        assertEquals("FAILED", state.path("executionStatus").asText());
        assertTrue(state.get("finishRequested").isBoolean());
        assertFalse(state.get("finishRequested").asBoolean());
        assertTrue(state.get("actions").isArray());
    }

    @Test void telemetryCapturesRedactedStartupCrashLogsDuringAllocatedState() {
        session.setExecutionStatus("ALLOCATED");
        var telemetry = mapper.createObjectNode().put("observedAt", "2026-11-20T13:00:00Z");
        telemetry.putArray("services").addObject()
            .put("service", "sandbox-postgres")
            .put("replicas", 1)
            .put("runningReplicas", 0)
            .put("logs", "Error: POSTGRES_PASSWORD=my_secret_pw missing");

        service.telemetry(id, new RuntimeStudioService.TelemetryRequest(id, session.getResourceProject(), telemetry));

        String stored = session.getStudioControl().path("telemetry").toString();
        assertTrue(stored.contains("sandbox-postgres"));
        assertFalse(stored.contains("my_secret_pw"));
    }

    @Test void pollSignalsRemoteCancelRequestedWhenCancelTimestampIsSet() {
        session.setCancelRequestedAt(java.time.OffsetDateTime.now());
        var polled = service.poll(id, session.getResourceProject());
        assertTrue(polled.path("cancelRequested").asBoolean());
        assertTrue(polled.path("finishRequested").asBoolean());
    }
}
