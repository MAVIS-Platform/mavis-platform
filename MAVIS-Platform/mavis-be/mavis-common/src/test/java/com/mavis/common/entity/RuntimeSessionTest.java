package com.mavis.common.entity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RuntimeSessionTest {
    private final ObjectMapper mapper = new ObjectMapper();

    private RuntimeSession baseSession(boolean interactive, String executionStatus, String scenarioStatus) {
        ObjectNode cfg = mapper.createObjectNode().put("interactiveStudio", interactive);
        var plannedAction = mapper.createObjectNode().put("action", "PAUSE").put("service", "payment-service");
        ObjectNode control = mapper.createObjectNode();
        if (interactive) {
            control.putArray("actions").add(plannedAction);
        } else {
            cfg.putArray("infrastructureActions").add(plannedAction);
        }
        ObjectNode receipt = mapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("spanId", "abc123");
        var actual = receipt.putArray("infrastructureActions").addObject()
                .put("confirmed", true)
                .put("action", "PAUSE")
                .put("service", "payment-service")
                .put("replicasBefore", 1)
                .put("replicasAfter", 0);
        actual.putObject("metricsBefore").put("runningReplicas", 1);
        actual.putObject("metricsAfter").put("runningReplicas", 0).put("pausedReplicas", 1);

        return RuntimeSession.builder()
                .scenarioConfig(cfg)
                .studioControl(control)
                .runnerReceiptJson(receipt)
                .receiptDigest("sha256:" + "a".repeat(64))
                .executionStatus(executionStatus)
                .scenarioStatus(scenarioStatus)
                .evidenceStatus("AVAILABLE")
                .cleanupStatus("CONFIRMED")
                .sandboxEnforcementConfirmed(true)
                .traceStatus("PARTIAL")
                .build();
    }

    @Test
    void interactiveFaultInjectionSessionWithFailedHttpScenarioStillHasVerifiedStudioEvidence() {
        assertTrue(baseSession(true, "COMPLETED", "FAILED").hasVerifiedStudioEvidence());
        assertTrue(baseSession(true, "COMPLETED", "PASSED").hasVerifiedStudioEvidence());
    }

    @Test
    void interactiveTimedOutOrCancelledAndNonInteractiveFailedSessionsStayRejected() {
        assertFalse(baseSession(true, "TIMED_OUT", "TIMEOUT").hasVerifiedStudioEvidence());
        assertFalse(baseSession(true, "COMPLETED", "CANCELLED").hasVerifiedStudioEvidence());
        assertFalse(baseSession(true, "FAILED", "FAILED").hasVerifiedStudioEvidence());
        assertFalse(baseSession(false, "COMPLETED", "FAILED").hasVerifiedStudioEvidence());
    }
}
