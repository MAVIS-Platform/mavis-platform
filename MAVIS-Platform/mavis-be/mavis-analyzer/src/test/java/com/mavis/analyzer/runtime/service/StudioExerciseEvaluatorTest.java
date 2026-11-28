package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StudioExerciseEvaluatorTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void changeImpactComputesExactPrecisionRecallAndF1FromObservedEdgeAndReplicaDeltas() {
        ObjectNode criteria = mapper.createObjectNode();
        criteria.put("exerciseType", "CHANGE_IMPACT");
        criteria.put("predictionRequired", true);
        criteria.put("minImpactF1", 0.7);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "payment");

        ObjectNode control = mapper.createObjectNode();
        ObjectNode pred = control.putObject("prediction");
        pred.putArray("predictedServices").add("payment").add("orders").add("catalog");
        pred.put("rationale", "Orders calls payment synchronously");
        pred.put("lockedAt", "2026-11-21T10:00:00Z");

        ArrayNode actions = control.putArray("actions");
        ObjectNode pause = actions.addObject()
                .put("actionId", "a1")
                .put("action", "PAUSE")
                .put("service", "payment")
                .put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z")
                .put("completedAt", "2026-11-21T10:00:12Z");
        pause.putObject("result")
                .put("action", "PAUSE")
                .put("service", "payment")
                .put("replicasBefore", 1)
                .put("replicasAfter", 0)
                .put("confirmed", true);

        ObjectNode beforeFrame = frame("2026-11-21T10:00:05Z", 1, 1, 0.0, 25.0, 0.0, 18.0);
        ObjectNode afterFrame = frame("2026-11-21T10:00:20Z", 1, 0, 80.0, 420.0, 75.0, 390.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertTrue(eval.path("predictionLocked").asBoolean());
        assertTrue(eval.path("evaluated").asBoolean());
        // Observed: orders + payment (catalog unaffected -> 1 FP, 2 TP, 0 FN)
        assertEquals(2, eval.path("impact").path("truePositives").size());
        assertEquals(1, eval.path("impact").path("falsePositives").size());
        assertEquals("catalog", eval.path("impact").path("falsePositives").get(0).asText());
        assertEquals(0, eval.path("impact").path("falseNegatives").size());
        // precision = 2/3 = 0.6667, recall = 2/2 = 1.0, f1 = 4/5 = 0.8
        assertEquals(0.6667, eval.path("impact").path("precision").asDouble(), 0.001);
        assertEquals(1.0, eval.path("impact").path("recall").asDouble(), 0.001);
        assertEquals(0.8, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertTrue(eval.path("passed").asBoolean());
        assertEquals(100, eval.path("autoScorePercent").asInt());
    }

    @Test
    void declarativeRulesEvaluateScaleOutLatencyDropReplicasAndEdgeErrors() {
        ObjectNode criteria = mapper.createObjectNode();
        criteria.put("exerciseType", "SCALE_UNDER_LOAD");
        criteria.put("maxErrorRatePercent", 5);
        criteria.putArray("minReplicas").addObject().put("service", "orders").put("count", 2);
        ArrayNode rules = criteria.putArray("rules");
        rules.addObject().put("metric", "P95_DELTA_PCT").put("target", "ALL").put("operator", "LTE").put("threshold", -20.0);
        rules.addObject().put("metric", "P95_MS").put("target", "orders").put("operator", "LT").put("threshold", 150.0);
        rules.addObject().put("metric", "EDGE_ERROR_RATE").put("target", "orders->payment").put("operator", "LTE").put("threshold", 1.0);

        ObjectNode control = mapper.createObjectNode();
        ObjectNode scale = control.putArray("actions").addObject()
                .put("action", "SCALE").put("service", "orders").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z").put("completedAt", "2026-11-21T10:00:15Z");
        scale.putObject("result").put("replicasBefore", 1).put("replicasAfter", 2).put("confirmed", true);

        ObjectNode beforeFrame = frame("2026-11-21T10:00:05Z", 1, 1, 0.0, 200.0, 0.0, 40.0);
        ObjectNode afterFrame = frame("2026-11-21T10:00:25Z", 2, 1, 0.0, 110.0, 0.0, 35.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertTrue(eval.path("evaluated").asBoolean());
        assertTrue(eval.path("passed").asBoolean());
        assertEquals(5, eval.path("totalRules").asInt());
        assertEquals(5, eval.path("passedRules").asInt());
        assertEquals(100, eval.path("autoScorePercent").asInt());
        JsonNode deltaRule = findRule(eval, "P95_DELTA_PCT");
        assertNotNull(deltaRule);
        assertEquals(-45.0, deltaRule.path("observedValue").asDouble(), 0.1);
        assertTrue(deltaRule.path("passed").asBoolean());
    }

    @Test
    void predictionRequiredFailsGracefullyUntilLockedAndChangeApplied() {
        ObjectNode criteria = mapper.createObjectNode();
        criteria.put("exerciseType", "CHANGE_IMPACT");
        criteria.put("predictionRequired", true);
        ObjectNode control = mapper.createObjectNode();
        control.putArray("actions");
        ObjectNode telemetry = frame("2026-11-21T10:00:05Z", 1, 1, 0.0, 25.0, 0.0, 15.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(mapper, criteria, control, telemetry, List.of(telemetry));

        assertFalse(eval.path("predictionLocked").asBoolean());
        assertFalse(eval.path("evaluated").asBoolean());
        assertFalse(eval.path("passed").asBoolean());
        assertEquals(0, eval.path("passedRules").asInt());
        assertEquals(1, eval.path("totalRules").asInt());
        assertTrue(eval.path("rules").get(0).path("reason").asText().contains("Lock your Change Impact prediction"));
    }

    @Test
    void resumeRecoveryDoesNotDilutePauseChangeImpactF1() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.70);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "payment");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices").add("orders").add("payment");
        ArrayNode actions = control.putArray("actions");
        ObjectNode pause = actions.addObject()
                .put("action", "PAUSE").put("service", "payment").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z").put("completedAt", "2026-11-21T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);
        ObjectNode resume = actions.addObject()
                .put("action", "RESUME").put("service", "payment").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:20Z").put("completedAt", "2026-11-21T10:00:21Z");
        resume.putObject("result").put("replicasBefore", 0).put("replicasAfter", 1);

        ObjectNode beforeFrame = frame("2026-11-21T10:00:05Z", 1, 1, 0.0, 20.0, 0.0, 12.0);
        ObjectNode faultFrame = frame("2026-11-21T10:00:15Z", 1, 0, 100.0, 3000.0, 100.0, 3000.0);
        ObjectNode recovered1 = frame("2026-11-21T10:00:23Z", 1, 1, 0.0, 18.0, 0.0, 10.0);
        ObjectNode recovered2 = frame("2026-11-21T10:00:26Z", 1, 1, 0.0, 18.0, 0.0, 10.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, recovered2, List.of(beforeFrame, faultFrame, recovered1, recovered2));

        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void changeImpactNormalizesOtelServiceNamesAndIgnoresUnknownEndpoints() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.70);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "fruit-catalog-api");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices").add("api-gateway").add("fruit-catalog-api");
        ArrayNode actions = control.putArray("actions");
        ObjectNode pause = actions.addObject()
                .put("action", "PAUSE").put("service", "fruit-catalog-api").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z").put("completedAt", "2026-11-21T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);

        ObjectNode beforeFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:05Z");
        ArrayNode beforeSvcs = beforeFrame.putArray("services");
        beforeSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "fruit-catalog-api").put("replicas", 1).put("runningReplicas", 1);
        beforeFrame.putArray("serviceGraph").addObject()
                .put("client", "ApiGateway").put("server", "FruitCatalog.API")
                .put("rps", 1.0).put("errorRatePercent", 0.0).put("p95Ms", 15.0);

        ObjectNode afterFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:18Z");
        ArrayNode afterSvcs = afterFrame.putArray("services");
        afterSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "fruit-catalog-api").put("replicas", 1).put("runningReplicas", 0);
        afterFrame.putArray("serviceGraph").addObject()
                .put("client", "ApiGateway").put("server", "unknown")
                .put("rps", 1.0).put("errorRatePercent", 100.0).put("p95Ms", 3000.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertEquals(0, eval.path("impact").path("falsePositives").size());
        assertEquals(0, eval.path("impact").path("falseNegatives").size());
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void changeImpactIgnoresExternalUserAndClientActorsInServiceGraph() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.70);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "payment-service");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices")
                .add("api-gateway").add("order-service").add("payment-service");
        ArrayNode actions = control.putArray("actions");
        ObjectNode pause = actions.addObject()
                .put("action", "PAUSE").put("service", "payment-service").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z").put("completedAt", "2026-11-21T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);

        ObjectNode beforeFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:05Z");
        ArrayNode beforeSvcs = beforeFrame.putArray("services");
        beforeSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 1);
        beforeFrame.putArray("serviceGraph")
                .addObject().put("client", "user").put("server", "api-gateway").put("rps", 5.0).put("errorRatePercent", 0.0).put("p95Ms", 15.0);
        ((ArrayNode) beforeFrame.get("serviceGraph"))
                .addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 5.0).put("errorRatePercent", 0.0).put("p95Ms", 10.0);

        ObjectNode afterFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:18Z");
        ArrayNode afterSvcs = afterFrame.putArray("services");
        afterSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 0);
        ArrayNode afterGraph = afterFrame.putArray("serviceGraph");
        afterGraph.addObject().put("client", "user").put("server", "api-gateway").put("rps", 5.0).put("errorRatePercent", 100.0).put("p95Ms", 3000.0);
        afterGraph.addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 5.0).put("errorRatePercent", 100.0).put("p95Ms", 3000.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertEquals(0, eval.path("impact").path("falseNegatives").size());
        assertEquals(0, eval.path("impact").path("falsePositives").size());
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void changeImpactAwardsFullF1WhenStudentPredictsUpstreamCallersWithoutTargetService() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.85);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "payment-service");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices")
                .add("api-gateway").add("order-service");
        ObjectNode pause = control.putArray("actions").addObject()
                .put("action", "PAUSE").put("service", "payment-service").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-21T10:00:10Z").put("completedAt", "2026-11-21T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);

        ObjectNode beforeFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:05Z");
        ArrayNode beforeSvcs = beforeFrame.putArray("services");
        beforeSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 1);
        beforeFrame.putArray("serviceGraph")
                .addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 5.0).put("errorRatePercent", 0.0).put("p95Ms", 10.0);

        ObjectNode afterFrame = mapper.createObjectNode().put("observedAt", "2026-11-21T10:00:18Z");
        ArrayNode afterSvcs = afterFrame.putArray("services");
        afterSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 0);
        afterFrame.putArray("serviceGraph")
                .addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 5.0).put("errorRatePercent", 100.0).put("p95Ms", 2400.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertEquals(0, eval.path("impact").path("falseNegatives").size());
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void pauseTargetStillSatisfiesRequiredTraceEdgeFromBaselineAndIgnoresHealthySiblingJitter() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.70);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "payment-service");
        criteria.putObject("requiredTraceEdge").put("from", "order-service").put("to", "payment-service");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices").add("api-gateway").add("order-service");
        ObjectNode pause = control.putArray("actions").addObject()
                .put("action", "PAUSE").put("service", "payment-service").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-27T10:00:10Z").put("completedAt", "2026-11-27T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);

        ObjectNode beforeFrame = mapper.createObjectNode().put("observedAt", "2026-11-27T10:00:05Z");
        ArrayNode beforeSvcs = beforeFrame.putArray("services");
        beforeSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "cart-service").put("replicas", 1).put("runningReplicas", 1);
        ArrayNode beforeSg = beforeFrame.putArray("serviceGraph");
        beforeSg.addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 1.0).put("errorRatePercent", 0.0).put("p95Ms", 15.0);
        beforeSg.addObject().put("client", "order-service").put("server", "payment-service").put("rps", 1.0).put("errorRatePercent", 0.0).put("p95Ms", 12.0);
        beforeSg.addObject().put("client", "order-service").put("server", "cart-service").put("rps", 1.0).put("errorRatePercent", 0.0).put("p95Ms", 14.0);

        ObjectNode afterFrame = mapper.createObjectNode().put("observedAt", "2026-11-27T10:00:18Z");
        ArrayNode afterSvcs = afterFrame.putArray("services");
        afterSvcs.addObject().put("service", "api-gateway").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "order-service").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "payment-service").put("replicas", 1).put("runningReplicas", 0);
        afterSvcs.addObject().put("service", "cart-service").put("replicas", 1).put("runningReplicas", 1);
        ArrayNode afterSg = afterFrame.putArray("serviceGraph");
        afterSg.addObject().put("client", "api-gateway").put("server", "order-service").put("rps", 1.0).put("errorRatePercent", 100.0).put("p95Ms", 2300.0);
        afterSg.addObject().put("client", "order-service").put("server", "unknown").put("rps", 1.0).put("errorRatePercent", 100.0).put("p95Ms", 2200.0);
        // Healthy sibling experiences mild +120ms client-side contention jitter without error
        afterSg.addObject().put("client", "order-service").put("server", "cart-service").put("rps", 1.0).put("errorRatePercent", 0.0).put("p95Ms", 134.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));

        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertEquals(0, eval.path("impact").path("falseNegatives").size());
        JsonNode traceRule = findRule(eval, "TRACE_EDGE");
        assertNotNull(traceRule);
        assertTrue(traceRule.path("passed").asBoolean());
        assertEquals(1.0, traceRule.path("observedValue").asDouble(), 0.001);
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void canonicalizesCaseVariantPredictedServiceNamesAgainstTelemetryBeforeF1() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CHANGE_IMPACT")
                .put("predictionRequired", true)
                .put("minImpactF1", 0.70);
        criteria.putObject("targetChangeAction").put("action", "PAUSE").put("service", "FruitCatalog.API");

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices")
                .add("apigateway")
                .add("fruitordering.api");
        ObjectNode pause = control.putArray("actions").addObject()
                .put("action", "PAUSE").put("service", "FruitCatalog.API").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-27T10:00:10Z").put("completedAt", "2026-11-27T10:00:12Z");
        pause.putObject("result").put("replicasBefore", 1).put("replicasAfter", 0);

        ObjectNode beforeFrame = mapper.createObjectNode().put("observedAt", "2026-11-27T10:00:05Z");
        ArrayNode beforeSvcs = beforeFrame.putArray("services");
        beforeSvcs.addObject().put("service", "ApiGateway").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "FruitOrdering.API").put("replicas", 1).put("runningReplicas", 1);
        beforeSvcs.addObject().put("service", "FruitCatalog.API").put("replicas", 1).put("runningReplicas", 1);
        beforeFrame.putArray("serviceGraph")
                .addObject().put("client", "ApiGateway").put("server", "FruitOrdering.API").put("rps", 2.0).put("errorRatePercent", 0.0).put("p95Ms", 20.0);

        ObjectNode afterFrame = mapper.createObjectNode().put("observedAt", "2026-11-27T10:00:18Z");
        ArrayNode afterSvcs = afterFrame.putArray("services");
        afterSvcs.addObject().put("service", "ApiGateway").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "FruitOrdering.API").put("replicas", 1).put("runningReplicas", 1);
        afterSvcs.addObject().put("service", "FruitCatalog.API").put("replicas", 1).put("runningReplicas", 0);
        afterFrame.putArray("serviceGraph")
                .addObject().put("client", "ApiGateway").put("server", "FruitOrdering.API").put("rps", 2.0).put("errorRatePercent", 100.0).put("p95Ms", 1800.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(mapper, criteria, control, afterFrame, List.of(beforeFrame, afterFrame));
        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        assertEquals("ApiGateway", eval.path("predictedServices").get(0).asText());
        assertEquals("FruitOrdering.API", eval.path("predictedServices").get(1).asText());
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void rootCauseDiagnosisScoresPreSeededStoppedAndCpuThrottledCulpritsAndDropsColdStartOutlier() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CUSTOM")
                .put("blindMode", true)
                .put("predictionRequired", true)
                .put("predictionMode", "ROOT_CAUSE")
                .put("minImpactF1", 0.70)
                .put("maxErrorRatePercent", 0)
                .put("maxP95Ms", 500);
        ObjectNode initialState = mapper.createObjectNode();
        initialState.putArray("stoppedServices").add("fraud-service");
        initialState.putObject("cpuLimits").put("pricing-service", 25);

        ObjectNode control = mapper.createObjectNode();
        control.putObject("prediction").putArray("predictedServices")
                .add("fraud-service")
                .add("pricing-service");
        control.putArray("actions").addObject()
                .put("action", "START").put("service", "fraud-service").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-28T01:00:10Z").put("completedAt", "2026-11-28T01:00:12Z");

        // Frame 0 has a boot-time cold-start p95 spike (4460ms) followed by warm steady-state frames (~80ms)
        ObjectNode coldSpike = frame("2026-11-28T01:00:02Z", 1, 1, 0.0, 4460.0, 0.0, 20.0);
        ObjectNode warm1 = frame("2026-11-28T01:00:15Z", 1, 1, 0.0, 82.0, 0.0, 15.0);
        ObjectNode warm2 = frame("2026-11-28T01:00:18Z", 1, 1, 0.0, 78.0, 0.0, 14.0);
        ObjectNode warm3 = frame("2026-11-28T01:00:21Z", 1, 1, 0.0, 80.0, 0.0, 16.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, warm3, List.of(coldSpike, warm1, warm2, warm3), initialState);

        assertEquals("ROOT_CAUSE", eval.path("predictionMode").asText());
        assertEquals(1.0, eval.path("impact").path("f1Score").asDouble(), 0.001);
        JsonNode impactRule = findRule(eval, "IMPACT_F1");
        assertNotNull(impactRule);
        assertTrue(impactRule.path("label").asText().contains("Root Cause"));
        JsonNode p95Rule = findRule(eval, "P95_MS");
        assertNotNull(p95Rule);
        assertTrue(p95Rule.path("passed").asBoolean());
        assertTrue(p95Rule.path("observedValue").asDouble() < 150.0, "Cold-start frame0 spike must not pollute steady-state p95");
        assertTrue(eval.path("passed").asBoolean());
    }

    @Test
    void gatewayTargetAliasesGlobalProbeAndMeasuresMultiActionP95DeltaAcrossAllSteps() {
        ObjectNode criteria = mapper.createObjectNode()
                .put("exerciseType", "CUSTOM")
                .put("maxErrorRatePercent", 0)
                .put("maxP95Ms", 1500);
        ArrayNode rules = criteria.putArray("rules");
        rules.addObject().put("metric", "ERROR_RATE").put("target", "gateway").put("operator", "LTE").put("threshold", 0);
        rules.addObject().put("metric", "P95_DELTA_PCT").put("target", "gateway").put("operator", "LTE").put("threshold", -20);
        rules.addObject().put("metric", "P95_MS").put("target", "gateway").put("operator", "LTE").put("threshold", 200);

        ObjectNode control = mapper.createObjectNode();
        ArrayNode actions = control.putArray("actions");
        actions.addObject().put("action", "START").put("service", "payment").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-28T01:00:10Z").put("completedAt", "2026-11-28T01:00:15Z");
        actions.addObject().put("action", "THROTTLE_CPU").put("service", "orders").put("status", "CONFIRMED")
                .put("requestedAt", "2026-11-28T01:00:55Z").put("completedAt", "2026-11-28T01:01:00Z");

        ObjectNode before1 = frame("2026-11-28T01:00:05Z", 1, 0, 50.0, 500.0, 50.0, 500.0);
        ObjectNode mid1 = frame("2026-11-28T01:00:25Z", 1, 1, 0.0, 480.0, 0.0, 480.0);
        ObjectNode afterLast = frame("2026-11-28T01:01:05Z", 1, 1, 0.0, 100.0, 0.0, 100.0);

        ObjectNode eval = StudioExerciseEvaluator.evaluate(
                mapper, criteria, control, afterLast, List.of(before1, mid1, afterLast));

        JsonNode deltaRule = findRule(eval, "P95_DELTA_PCT");
        assertNotNull(deltaRule);
        assertTrue(deltaRule.path("passed").asBoolean(), "Multi-step delta should compare before-first (500ms) vs after-last (100ms) = -80%");
        assertEquals(-80.0, deltaRule.path("observedValue").asDouble(), 0.5);
        for (JsonNode r : eval.path("rules")) {
            assertTrue(r.path("passed").asBoolean(), "Expected rule to pass: " + r);
        }
        assertTrue(eval.path("passed").asBoolean());
    }

    private ObjectNode frame(String observedAt, int ordersRep, int paymentRep,
                             double probeErr, double probeP95, double edgeErr, double edgeP95) {
        ObjectNode f = mapper.createObjectNode().put("observedAt", observedAt);
        ArrayNode svcs = f.putArray("services");
        svcs.addObject().put("service", "orders").put("replicas", Math.max(1, ordersRep)).put("runningReplicas", ordersRep);
        svcs.addObject().put("service", "payment").put("replicas", Math.max(1, paymentRep)).put("runningReplicas", paymentRep);
        ObjectNode probe = f.putObject("probe")
                .put("targetRps", 10)
                .put("rps", 10.0)
                .put("requests", 10)
                .put("errors", (int) Math.round(probeErr / 10.0))
                .put("errorRatePercent", probeErr)
                .put("p50Ms", probeP95 * 0.6)
                .put("p95Ms", probeP95)
                .put("p99Ms", probeP95 * 1.2);
        probe.putArray("routes").addObject()
                .put("stepId", "s1").put("service", "orders").put("method", "GET").put("path", "/orders")
                .put("requests", 10).put("errors", (int) Math.round(probeErr / 10.0))
                .put("errorRatePercent", probeErr).put("p95Ms", probeP95);
        f.putArray("serviceGraph").addObject()
                .put("client", "orders").put("server", "payment")
                .put("rps", 10.0).put("errorsPerSec", edgeErr / 10.0)
                .put("errorRatePercent", edgeErr).put("p95Ms", edgeP95);
        return f;
    }

    private static JsonNode findRule(ObjectNode eval, String metric) {
        for (JsonNode r : eval.path("rules")) {
            if (metric.equals(r.path("metric").asText())) return r;
        }
        return null;
    }
}
