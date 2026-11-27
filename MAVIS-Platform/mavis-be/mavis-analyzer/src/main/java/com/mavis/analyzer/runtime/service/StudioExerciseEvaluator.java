package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Pure deterministic evaluator for Studio Live exercises:
 * - C2 Change Impact auto-grading (ground-truth observed affected services vs student locked prediction -> Precision / Recall / F1)
 * - C3 Declarative pass criteria (ERROR_RATE, EDGE_ERROR_RATE, P95_MS, P95_DELTA_PCT, REPLICAS, TRACE_EDGE, IMPACT_F1)
 */
public final class StudioExerciseEvaluator {

    private static final double ERROR_DELTA_THRESHOLD_PCT = 5.0;
    private static final double P95_RELATIVE_JUMP = 0.40;
    private static final double P95_ABSOLUTE_JUMP_MS = 20.0;
    private static final double DEFAULT_MIN_IMPACT_F1 = 0.70;

    private StudioExerciseEvaluator() {}

    public static ObjectNode evaluate(
            ObjectMapper mapper,
            JsonNode criteria,
            JsonNode control,
            JsonNode latestTelemetry,
            List<JsonNode> historyFrames) {
        ObjectNode out = mapper.createObjectNode();
        String exerciseType = criteria != null && criteria.path("exerciseType").isTextual()
                ? criteria.path("exerciseType").asText("CUSTOM").trim().toUpperCase(Locale.ROOT)
                : "CUSTOM";
        boolean predictionRequired = criteria != null && criteria.path("predictionRequired").asBoolean(false);
        out.put("exerciseType", exerciseType);
        out.put("predictionRequired", predictionRequired);

        JsonNode prediction = control != null && control.path("prediction").isObject()
                ? control.path("prediction")
                : null;
        boolean predictionLocked = prediction != null && prediction.path("predictedServices").isArray()
                && !prediction.path("predictedServices").isEmpty();
        out.put("predictionLocked", predictionLocked);

        Set<String> predicted = new TreeSet<>();
        if (predictionLocked) {
            for (JsonNode s : prediction.path("predictedServices")) {
                String svc = s.asText("").trim();
                if (!svc.isBlank()) predicted.add(svc);
            }
        }
        ArrayNode predictedArr = out.putArray("predictedServices");
        predicted.forEach(predictedArr::add);

        List<JsonNode> confirmedActions = collectConfirmedActions(control);
        JsonNode primaryChange = selectPrimaryChangeAction(criteria, confirmedActions);
        boolean hasTelemetry = latestTelemetry != null && latestTelemetry.isObject();
        boolean hasChange = primaryChange != null;

        List<JsonNode> frames = historyFrames != null ? historyFrames : List.of();
        Map<String, String> canonicalServices = buildCanonicalServiceIndex(confirmedActions, predicted, frames, latestTelemetry);
        WindowSplit split = splitBeforeAfter(frames, primaryChange, confirmedActions, latestTelemetry);

        Map<String, ServiceImpact> observedMap = detectObservedAffectedServices(
                confirmedActions, primaryChange, split.before(), split.after(), latestTelemetry, canonicalServices);

        ArrayNode observedArr = out.putArray("observedAffectedServices");
        ArrayNode detailsArr = out.putArray("impactDetails");
        for (ServiceImpact impact : observedMap.values()) {
            observedArr.add(impact.service);
            ObjectNode d = detailsArr.addObject().put("service", impact.service);
            ArrayNode reasons = d.putArray("reasons");
            impact.reasons.forEach(reasons::add);
            if (impact.errorDeltaPct != null) d.put("errorDeltaPct", round2(impact.errorDeltaPct));
            if (impact.p95DeltaMs != null) d.put("p95DeltaMs", round2(impact.p95DeltaMs));
            if (impact.replicasBefore != null) d.put("replicasBefore", impact.replicasBefore);
            if (impact.replicasAfter != null) d.put("replicasAfter", impact.replicasAfter);
        }

        Double f1Score = null;
        if (predictionLocked && (hasChange || !observedMap.isEmpty())) {
            String primaryTarget = primaryChange != null ? primaryChange.path("service").asText("").trim() : "";
            Set<String> observed = observedMap.keySet();
            // Step 1 asks students to predict propagated callers; do not penalize omitting the fault target itself when callers exist.
            Set<String> effectiveObserved = (!primaryTarget.isBlank()
                    && predicted.stream().noneMatch(s -> s.equalsIgnoreCase(primaryTarget))
                    && observed.stream().anyMatch(s -> !s.equalsIgnoreCase(primaryTarget)))
                    ? observed.stream()
                            .filter(s -> !s.equalsIgnoreCase(primaryTarget))
                            .collect(java.util.stream.Collectors.toCollection(TreeSet::new))
                    : observed;
            List<String> tp = predicted.stream().filter(effectiveObserved::contains).sorted().toList();
            List<String> fp = predicted.stream().filter(s -> !effectiveObserved.contains(s)).sorted().toList();
            List<String> fn = effectiveObserved.stream().filter(s -> !predicted.contains(s)).sorted().toList();
            double precision = predicted.isEmpty() ? (effectiveObserved.isEmpty() ? 1.0 : 0.0) : (double) tp.size() / predicted.size();
            double recall = effectiveObserved.isEmpty() ? (predicted.isEmpty() ? 1.0 : 0.0) : (double) tp.size() / effectiveObserved.size();
            double f1 = (precision + recall) <= 0.0 ? 0.0 : (2.0 * precision * recall) / (precision + recall);
            f1Score = round4(f1);

            ObjectNode impactNode = out.putObject("impact");
            ArrayNode tpArr = impactNode.putArray("truePositives");
            tp.forEach(tpArr::add);
            ArrayNode fpArr = impactNode.putArray("falsePositives");
            fp.forEach(fpArr::add);
            ArrayNode fnArr = impactNode.putArray("falseNegatives");
            fn.forEach(fnArr::add);
            impactNode.put("precision", round4(precision));
            impactNode.put("recall", round4(recall));
            impactNode.put("f1Score", f1Score);
        }

        // Build unified rule list (legacy fields + C3 declarative rules)
        List<RuleSpec> specs = extractRuleSpecs(criteria, predictionRequired);
        ArrayNode rulesArr = out.putArray("rules");
        int passedCount = 0;
        for (int i = 0; i < specs.size(); i++) {
            RuleSpec spec = specs.get(i);
            RuleOutcome outcome = evaluateRule(spec, split, latestTelemetry, confirmedActions, f1Score, predictionLocked, hasChange, canonicalServices);
            if (outcome.passed) passedCount++;
            ObjectNode r = rulesArr.addObject()
                    .put("id", "rule-" + (i + 1))
                    .put("label", spec.label)
                    .put("metric", spec.metric)
                    .put("target", spec.target)
                    .put("operator", spec.operator)
                    .put("threshold", spec.threshold)
                    .put("passed", outcome.passed)
                    .put("reason", outcome.reason);
            if (outcome.observedValue != null) {
                r.put("observedValue", round2(outcome.observedValue));
            } else {
                r.putNull("observedValue");
            }
        }

        int totalRules = specs.size();
        boolean evaluated = hasTelemetry && (!predictionRequired || (predictionLocked && hasChange));
        int autoScorePercent;
        boolean passed;
        if (totalRules == 0) {
            if (predictionRequired && f1Score != null) {
                autoScorePercent = (int) Math.round(f1Score * 100.0);
                passed = evaluated && f1Score >= DEFAULT_MIN_IMPACT_F1;
            } else {
                autoScorePercent = hasTelemetry && hasChange ? 100 : 0;
                passed = false;
            }
        } else {
            autoScorePercent = (int) Math.round(100.0 * passedCount / totalRules);
            passed = evaluated && passedCount == totalRules;
        }

        out.put("passedRules", passedCount);
        out.put("totalRules", totalRules);
        out.put("evaluated", evaluated);
        out.put("autoScorePercent", autoScorePercent);
        out.put("passed", passed);
        return out;
    }

    private record WindowSplit(List<JsonNode> before, List<JsonNode> after) {}

    private static final class ServiceImpact {
        final String service;
        final Set<String> reasons = new LinkedHashSet<>();
        Double errorDeltaPct;
        Double p95DeltaMs;
        Integer replicasBefore;
        Integer replicasAfter;

        ServiceImpact(String service) {
            this.service = service;
        }
    }

    private record RuleSpec(String label, String metric, String target, String operator, double threshold) {}

    private record RuleOutcome(Double observedValue, boolean passed, String reason) {}

    private static List<JsonNode> collectConfirmedActions(JsonNode control) {
        if (control == null || !control.path("actions").isArray()) return List.of();
        List<JsonNode> confirmed = new ArrayList<>();
        for (JsonNode a : control.path("actions")) {
            if ("CONFIRMED".equals(a.path("status").asText())) {
                confirmed.add(a);
            }
        }
        return confirmed;
    }

    private static JsonNode selectPrimaryChangeAction(JsonNode criteria, List<JsonNode> confirmedActions) {
        if (confirmedActions.isEmpty()) return null;
        JsonNode target = criteria != null ? criteria.path("targetChangeAction") : null;
        if (target != null && target.isObject()) {
            String wantedAction = target.path("action").asText("").trim().toUpperCase(Locale.ROOT);
            String wantedService = target.path("service").asText("").trim();
            for (JsonNode a : confirmedActions) {
                boolean actionMatch = wantedAction.isBlank() || wantedAction.equalsIgnoreCase(a.path("action").asText(""));
                boolean svcMatch = wantedService.isBlank() || wantedService.equals(a.path("service").asText(""));
                if (actionMatch && svcMatch) return a;
            }
        }
        return confirmedActions.get(0);
    }

    private static WindowSplit splitBeforeAfter(
            List<JsonNode> history,
            JsonNode changeAction,
            List<JsonNode> confirmedActions,
            JsonNode latestTelemetry) {
        List<JsonNode> all = new ArrayList<>(history);
        if (all.isEmpty() && latestTelemetry != null && latestTelemetry.isObject()) {
            return new WindowSplit(List.of(), List.of(latestTelemetry));
        }
        if (changeAction == null) {
            return new WindowSplit(all.isEmpty() ? List.of() : List.of(all.get(0)), all);
        }
        Instant changeStart = parseInstant(changeAction.path("requestedAt").asText(""));
        Instant changeEnd = parseInstant(changeAction.path("completedAt").asText(""));
        if (changeEnd == null) changeEnd = changeStart;
        if (changeStart == null) {
            int mid = Math.max(1, all.size() / 2);
            return new WindowSplit(all.subList(0, mid), all.subList(mid, all.size()));
        }
        List<JsonNode> before = new ArrayList<>();
        List<JsonNode> after = new ArrayList<>();
        Instant beforeFloor = changeStart.minusSeconds(30);
        Instant afterCeiling = changeEnd.plusSeconds(30);
        // Stop the post-fault window before a subsequent RESUME/START recovery on the same service dilutes the observed impact.
        String primaryAction = changeAction.path("action").asText("").trim().toUpperCase(Locale.ROOT);
        String primaryService = changeAction.path("service").asText("").trim();
        if (("PAUSE".equals(primaryAction) || "STOP".equals(primaryAction)) && confirmedActions != null) {
            for (JsonNode candidate : confirmedActions) {
                if (candidate == changeAction) continue;
                String act = candidate.path("action").asText("").trim().toUpperCase(Locale.ROOT);
                String svc = candidate.path("service").asText("").trim();
                if (!primaryService.equals(svc) || !("RESUME".equals(act) || "START".equals(act))) continue;
                Instant recoveryStart = parseInstant(candidate.path("requestedAt").asText(""));
                if (recoveryStart != null && recoveryStart.isAfter(changeEnd) && recoveryStart.isBefore(afterCeiling)) {
                    afterCeiling = recoveryStart;
                }
            }
        }
        for (JsonNode frame : all) {
            Instant ts = parseInstant(frame.path("observedAt").asText(""));
            if (ts == null) continue;
            if (!ts.isAfter(changeStart) && !ts.isBefore(beforeFloor)) {
                before.add(frame);
            } else if (!ts.isBefore(changeEnd) && !ts.isAfter(afterCeiling)) {
                after.add(frame);
            }
        }
        if (after.isEmpty() && latestTelemetry != null && latestTelemetry.isObject()) {
            after.add(latestTelemetry);
        }
        return new WindowSplit(before, after);
    }

    private static Map<String, ServiceImpact> detectObservedAffectedServices(
            List<JsonNode> confirmedActions,
            JsonNode primaryChange,
            List<JsonNode> beforeFrames,
            List<JsonNode> afterFrames,
            JsonNode latestTelemetry,
            Map<String, String> canonicalServices) {
        Map<String, ServiceImpact> map = new TreeMap<>();

        // 1. Direct container / replica / CPU faults from confirmed actions
        for (JsonNode action : confirmedActions) {
            String type = action.path("action").asText("").toUpperCase(Locale.ROOT);
            String svc = action.path("service").asText("").trim();
            if (svc.isBlank()) continue;
            JsonNode res = action.path("result");
            int repBefore = res.path("replicasBefore").asInt(-1);
            int repAfter = res.path("replicasAfter").asInt(-1);
            if (("STOP".equals(type) || "PAUSE".equals(type)) && repBefore > 0 && repAfter < repBefore) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add(type.equals("PAUSE") ? "CONTAINER_PAUSED" : "CONTAINER_STOPPED");
                imp.replicasBefore = repBefore;
                imp.replicasAfter = repAfter;
            } else if ("THROTTLE_CPU".equals(type) && res.path("metricsAfter").path("cpuPercent").asInt(100) < 100) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("CPU_THROTTLED_" + res.path("metricsAfter").path("cpuPercent").asInt() + "PCT");
            }
            // Action-level workload error/latency delta
            double errBefore = res.path("metricsBefore").path("errorRatePercent").asDouble(Double.NaN);
            double errAfter = res.path("metricsAfter").path("errorRatePercent").asDouble(Double.NaN);
            if (Double.isFinite(errBefore) && Double.isFinite(errAfter) && (errAfter - errBefore) >= ERROR_DELTA_THRESHOLD_PCT) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("WORKLOAD_ERROR_SPIKE");
                imp.errorDeltaPct = maxAbs(imp.errorDeltaPct, errAfter - errBefore);
            }
            double p95Before = res.path("metricsBefore").path("p95LatencyMs").asDouble(Double.NaN);
            double p95After = res.path("metricsAfter").path("p95LatencyMs").asDouble(Double.NaN);
            if (isLatencyRegression(p95Before, p95After)) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("WORKLOAD_LATENCY_SPIKE");
                imp.p95DeltaMs = maxAbs(imp.p95DeltaMs, p95After - p95Before);
            }
        }

        // 2. Service replica drops comparing before baseline vs latest telemetry
        Map<String, Integer> baselineReplicas = readReplicas(beforeFrames.isEmpty() ? null : beforeFrames.get(0));
        Map<String, Integer> latestReplicas = readReplicas(latestTelemetry);
        for (var entry : latestReplicas.entrySet()) {
            String svc = entry.getKey();
            int now = entry.getValue();
            Integer prev = baselineReplicas.get(svc);
            if (prev != null && now < prev) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("REPLICAS_DROPPED");
                imp.replicasBefore = prev;
                imp.replicasAfter = now;
            }
        }

        // 3. Before vs After serviceGraph edge deltas (propagated caller + callee impact)
        Map<String, EdgeAgg> beforeEdges = aggregateEdges(beforeFrames, canonicalServices);
        Map<String, EdgeAgg> afterEdges = aggregateEdges(afterFrames, canonicalServices);
        for (var entry : afterEdges.entrySet()) {
            EdgeAgg after = entry.getValue();
            EdgeAgg before = beforeEdges.get(entry.getKey());
            double prevErr = before != null ? before.avgErrorPct() : 0.0;
            double curErr = after.avgErrorPct();
            double errDelta = curErr - prevErr;
            if (errDelta >= ERROR_DELTA_THRESHOLD_PCT) {
                for (String endpoint : List.of(after.client, after.server)) {
                    if (isIgnoredServiceEndpoint(endpoint)) continue;
                    ServiceImpact imp = map.computeIfAbsent(endpoint, ServiceImpact::new);
                    imp.reasons.add("EDGE_ERROR_PROPAGATION:" + after.client + "->" + after.server);
                    imp.errorDeltaPct = maxAbs(imp.errorDeltaPct, errDelta);
                }
            }
            Double prevP95 = before != null ? before.avgP95() : null;
            Double curP95 = after.avgP95();
            if (prevP95 != null && curP95 != null && isLatencyRegression(prevP95, curP95)) {
                double delta = curP95 - prevP95;
                for (String endpoint : List.of(after.client, after.server)) {
                    if (isIgnoredServiceEndpoint(endpoint)) continue;
                    ServiceImpact imp = map.computeIfAbsent(endpoint, ServiceImpact::new);
                    imp.reasons.add("EDGE_LATENCY_DEGRADATION:" + after.client + "->" + after.server);
                    imp.p95DeltaMs = maxAbs(imp.p95DeltaMs, delta);
                }
            }
        }

        // 4. Before vs After probe per-route deltas
        Map<String, RouteAgg> beforeRoutes = aggregateProbeRoutes(beforeFrames);
        Map<String, RouteAgg> afterRoutes = aggregateProbeRoutes(afterFrames);
        for (var entry : afterRoutes.entrySet()) {
            String svc = entry.getKey();
            if (isIgnoredServiceEndpoint(svc)) continue;
            RouteAgg after = entry.getValue();
            RouteAgg before = beforeRoutes.get(svc);
            double prevErr = before != null ? before.avgErrorPct() : 0.0;
            double errDelta = after.avgErrorPct() - prevErr;
            if (errDelta >= ERROR_DELTA_THRESHOLD_PCT) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("PROBE_ERROR_SPIKE");
                imp.errorDeltaPct = maxAbs(imp.errorDeltaPct, errDelta);
            }
            Double prevP95 = before != null ? before.avgP95() : null;
            Double curP95 = after.avgP95();
            if (prevP95 != null && curP95 != null && isLatencyRegression(prevP95, curP95)) {
                ServiceImpact imp = map.computeIfAbsent(svc, ServiceImpact::new);
                imp.reasons.add("PROBE_LATENCY_SPIKE");
                imp.p95DeltaMs = maxAbs(imp.p95DeltaMs, curP95 - prevP95);
            }
        }

        // 5. Latest telemetry error spans (catches upstream caller returning 5xx when downstream stops/pauses)
        if (latestTelemetry != null && latestTelemetry.path("spans").isArray()) {
            Map<String, int[]> spanCounts = new LinkedHashMap<>();
            for (JsonNode span : latestTelemetry.path("spans")) {
                String svc = normalizeServiceName(span.path("runtimeService").asText(""), canonicalServices);
                if (isIgnoredServiceEndpoint(svc)) continue;
                int[] counts = spanCounts.computeIfAbsent(svc, k -> new int[2]);
                counts[0]++;
                boolean isErr = "ERROR".equalsIgnoreCase(span.path("spanStatus").asText(""))
                        || span.path("circuitOpen").asBoolean(false)
                        || span.path("httpStatusCode").asInt(0) >= 500;
                if (isErr) counts[1]++;
            }
            for (var entry : spanCounts.entrySet()) {
                int total = entry.getValue()[0];
                int errs = entry.getValue()[1];
                double pct = total > 0 ? (100.0 * errs / total) : 0.0;
                if (pct >= ERROR_DELTA_THRESHOLD_PCT) {
                    ServiceImpact imp = map.computeIfAbsent(entry.getKey(), ServiceImpact::new);
                    imp.reasons.add("ERROR_SPANS_OBSERVED");
                    imp.errorDeltaPct = maxAbs(imp.errorDeltaPct, pct);
                }
            }
        }

        return map;
    }

    private static List<RuleSpec> extractRuleSpecs(JsonNode criteria, boolean predictionRequired) {
        List<RuleSpec> specs = new ArrayList<>();
        if (criteria == null || !criteria.isObject()) return specs;

        if (criteria.hasNonNull("maxErrorRatePercent")) {
            double v = criteria.path("maxErrorRatePercent").asDouble();
            specs.add(new RuleSpec("Global error rate <= " + formatNum(v) + "%", "ERROR_RATE", "ALL", "LTE", v));
        }
        if (criteria.hasNonNull("maxP95Ms")) {
            double v = criteria.path("maxP95Ms").asDouble();
            specs.add(new RuleSpec("Global p95 latency <= " + formatNum(v) + " ms", "P95_MS", "ALL", "LTE", v));
        }
        if (criteria.path("requiredTraceEdge").isObject()) {
            String from = criteria.path("requiredTraceEdge").path("from").asText("").trim();
            String to = criteria.path("requiredTraceEdge").path("to").asText("").trim();
            if (!from.isBlank() && !to.isBlank()) {
                specs.add(new RuleSpec("Observed trace " + from + " -> " + to, "TRACE_EDGE", from + "->" + to, "GTE", 1.0));
            }
        }
        if (criteria.path("minReplicas").isArray()) {
            for (JsonNode rep : criteria.path("minReplicas")) {
                String svc = rep.path("service").asText("").trim();
                int count = rep.path("count").asInt(0);
                if (!svc.isBlank() && count > 0) {
                    specs.add(new RuleSpec("Replicas(" + svc + ") >= " + count, "REPLICAS", svc, "GTE", count));
                }
            }
        }
        boolean hasExplicitF1Rule = false;
        if (criteria.path("rules").isArray()) {
            for (JsonNode r : criteria.path("rules")) {
                if (!r.isObject()) continue;
                String metric = r.path("metric").asText("").trim().toUpperCase(Locale.ROOT);
                String target = r.path("target").asText("ALL").trim();
                String op = r.path("operator").asText("LTE").trim().toUpperCase(Locale.ROOT);
                if (metric.isBlank() || !r.path("threshold").isNumber()) continue;
                double threshold = r.path("threshold").asDouble();
                String label = r.path("label").asText("").trim();
                if (label.isBlank()) {
                    label = metric + "(" + target + ") " + opSymbol(op) + " " + formatNum(threshold);
                }
                if ("IMPACT_F1".equals(metric)) hasExplicitF1Rule = true;
                specs.add(new RuleSpec(label, metric, target, op, threshold));
            }
        }
        if ((predictionRequired || criteria.hasNonNull("minImpactF1")) && !hasExplicitF1Rule) {
            double minF1 = criteria.hasNonNull("minImpactF1")
                    ? criteria.path("minImpactF1").asDouble(DEFAULT_MIN_IMPACT_F1)
                    : DEFAULT_MIN_IMPACT_F1;
            specs.add(new RuleSpec("Change Impact F1 >= " + formatNum(minF1), "IMPACT_F1", "PREDICTION", "GTE", minF1));
        }
        return specs;
    }

    private static RuleOutcome evaluateRule(
            RuleSpec spec,
            WindowSplit split,
            JsonNode latestTelemetry,
            List<JsonNode> confirmedActions,
            Double f1Score,
            boolean predictionLocked,
            boolean hasChange,
            Map<String, String> canonicalServices) {
        Double observed = switch (spec.metric) {
            case "IMPACT_F1" -> f1Score;
            case "REPLICAS" -> resolveReplicas(spec.target, latestTelemetry, confirmedActions);
            case "TRACE_EDGE" -> resolveTraceEdgeObserved(spec.target, latestTelemetry, split.after(), canonicalServices);
            case "ERROR_RATE" -> resolveErrorRate(spec.target, latestTelemetry, split.after(), confirmedActions, canonicalServices);
            case "EDGE_ERROR_RATE" -> resolveEdgeErrorRate(spec.target, latestTelemetry, split.after(), canonicalServices);
            case "P95_MS" -> resolveP95Ms(spec.target, latestTelemetry, split.after(), confirmedActions, canonicalServices);
            case "P95_DELTA_PCT" -> resolveP95DeltaPct(spec.target, split, confirmedActions);
            default -> null;
        };

        if ("IMPACT_F1".equals(spec.metric) && observed == null) {
            String msg = !predictionLocked
                    ? "Lock your Change Impact prediction before running the change"
                    : (!hasChange ? "Apply the change action to measure real impact" : "Waiting for impact telemetry");
            return new RuleOutcome(null, false, msg);
        }
        if (observed == null || !Double.isFinite(observed)) {
            return new RuleOutcome(null, false, "No observed samples yet for " + spec.target);
        }
        boolean passed = compare(observed, spec.operator, spec.threshold);
        String reason = "Observed " + formatNum(observed) + " (expected " + opSymbol(spec.operator) + " " + formatNum(spec.threshold) + ")";
        return new RuleOutcome(observed, passed, reason);
    }

    private static Double resolveReplicas(String service, JsonNode latestTelemetry, List<JsonNode> confirmedActions) {
        if (latestTelemetry != null && latestTelemetry.path("services").isArray()) {
            for (JsonNode s : latestTelemetry.path("services")) {
                if (service.equals(s.path("service").asText())) {
                    return s.path("runningReplicas").asDouble();
                }
            }
        }
        for (int i = confirmedActions.size() - 1; i >= 0; i--) {
            JsonNode a = confirmedActions.get(i);
            if (service.equals(a.path("service").asText())) {
                return a.path("result").path("replicasAfter").asDouble();
            }
        }
        return null;
    }

    private static Double resolveTraceEdgeObserved(String edgeTarget, JsonNode latestTelemetry, List<JsonNode> afterFrames, Map<String, String> canonicalServices) {
        String[] parts = edgeTarget.split("->");
        if (parts.length != 2) return 0.0;
        String from = normalizeServiceName(parts[0], canonicalServices);
        String to = normalizeServiceName(parts[1], canonicalServices);
        if (latestTelemetry != null) {
            for (JsonNode edge : latestTelemetry.path("interactions")) {
                if (from.equals(normalizeServiceName(edge.path("fromService").asText(), canonicalServices))
                        && to.equals(normalizeServiceName(edge.path("toService").asText(), canonicalServices))) {
                    return 1.0;
                }
            }
            for (JsonNode sg : latestTelemetry.path("serviceGraph")) {
                if (from.equals(normalizeServiceName(sg.path("client").asText(), canonicalServices))
                        && to.equals(normalizeServiceName(sg.path("server").asText(), canonicalServices))
                        && sg.path("rps").asDouble(0) > 0) {
                    return 1.0;
                }
            }
        }
        for (JsonNode frame : afterFrames) {
            for (JsonNode sg : frame.path("serviceGraph")) {
                if (from.equals(normalizeServiceName(sg.path("client").asText(), canonicalServices))
                        && to.equals(normalizeServiceName(sg.path("server").asText(), canonicalServices))
                        && sg.path("rps").asDouble(0) > 0) {
                    return 1.0;
                }
            }
        }
        return 0.0;
    }

    private static Double resolveErrorRate(String target, JsonNode latestTelemetry, List<JsonNode> afterFrames, List<JsonNode> confirmedActions, Map<String, String> canonicalServices) {
        if (target.contains("->")) {
            return resolveEdgeErrorRate(target, latestTelemetry, afterFrames, canonicalServices);
        }
        if ("ALL".equalsIgnoreCase(target)) {
            if (latestTelemetry != null && latestTelemetry.path("probe").isObject()
                    && latestTelemetry.path("probe").path("requests").asInt(0) > 0) {
                return latestTelemetry.path("probe").path("errorRatePercent").asDouble();
            }
            if (!confirmedActions.isEmpty()) {
                JsonNode lastAfter = confirmedActions.get(confirmedActions.size() - 1).path("result").path("metricsAfter");
                if (lastAfter.path("errorRatePercent").isNumber()) {
                    return lastAfter.path("errorRatePercent").asDouble();
                }
            }
            return spanErrorRate(null, latestTelemetry, canonicalServices);
        }
        if (latestTelemetry != null && latestTelemetry.path("probe").path("routes").isArray()) {
            double reqs = 0, errs = 0;
            for (JsonNode r : latestTelemetry.path("probe").path("routes")) {
                if (target.equals(r.path("service").asText())) {
                    reqs += r.path("requests").asDouble(0);
                    errs += r.path("errors").asDouble(0);
                }
            }
            if (reqs > 0) return (100.0 * errs) / reqs;
        }
        return spanErrorRate(target, latestTelemetry, canonicalServices);
    }

    private static Double resolveEdgeErrorRate(String edgeTarget, JsonNode latestTelemetry, List<JsonNode> afterFrames, Map<String, String> canonicalServices) {
        String[] parts = edgeTarget.split("->");
        if (parts.length != 2) return null;
        String key = normalizeServiceName(parts[0], canonicalServices) + "->" + normalizeServiceName(parts[1], canonicalServices);
        Map<String, EdgeAgg> agg = aggregateEdges(afterFrames, canonicalServices);
        if (agg.containsKey(key)) return agg.get(key).avgErrorPct();
        if (latestTelemetry != null && latestTelemetry.path("serviceGraph").isArray()) {
            for (JsonNode sg : latestTelemetry.path("serviceGraph")) {
                String sgKey = normalizeServiceName(sg.path("client").asText(""), canonicalServices) + "->"
                        + normalizeServiceName(sg.path("server").asText(""), canonicalServices);
                if (key.equals(sgKey) && sg.path("errorRatePercent").isNumber()) {
                    return sg.path("errorRatePercent").asDouble();
                }
            }
        }
        return null;
    }

    private static Double resolveP95Ms(String target, JsonNode latestTelemetry, List<JsonNode> afterFrames, List<JsonNode> confirmedActions, Map<String, String> canonicalServices) {
        if (target.contains("->")) {
            String[] parts = target.split("->");
            if (parts.length != 2) return null;
            String key = normalizeServiceName(parts[0], canonicalServices) + "->" + normalizeServiceName(parts[1], canonicalServices);
            Map<String, EdgeAgg> agg = aggregateEdges(afterFrames, canonicalServices);
            if (agg.containsKey(key) && agg.get(key).avgP95() != null) return agg.get(key).avgP95();
            if (latestTelemetry != null && latestTelemetry.path("serviceGraph").isArray()) {
                for (JsonNode sg : latestTelemetry.path("serviceGraph")) {
                    String sgKey = normalizeServiceName(sg.path("client").asText(""), canonicalServices) + "->"
                            + normalizeServiceName(sg.path("server").asText(""), canonicalServices);
                    if (key.equals(sgKey) && sg.path("p95Ms").isNumber()) return sg.path("p95Ms").asDouble();
                }
            }
            return null;
        }
        if ("ALL".equalsIgnoreCase(target)) {
            if (latestTelemetry != null && latestTelemetry.path("probe").isObject()
                    && latestTelemetry.path("probe").path("p95Ms").isNumber()) {
                return latestTelemetry.path("probe").path("p95Ms").asDouble();
            }
            if (!confirmedActions.isEmpty()) {
                JsonNode lastAfter = confirmedActions.get(confirmedActions.size() - 1).path("result").path("metricsAfter");
                if (lastAfter.path("p95LatencyMs").isNumber()) {
                    return lastAfter.path("p95LatencyMs").asDouble();
                }
            }
            return spanP95Ms(null, latestTelemetry, canonicalServices);
        }
        if (latestTelemetry != null && latestTelemetry.path("probe").path("routes").isArray()) {
            double maxP95 = -1;
            for (JsonNode r : latestTelemetry.path("probe").path("routes")) {
                if (target.equals(r.path("service").asText()) && r.path("p95Ms").isNumber()) {
                    maxP95 = Math.max(maxP95, r.path("p95Ms").asDouble());
                }
            }
            if (maxP95 >= 0) return maxP95;
        }
        return spanP95Ms(target, latestTelemetry, canonicalServices);
    }

    private static Double resolveP95DeltaPct(String target, WindowSplit split, List<JsonNode> confirmedActions) {
        Double beforeP95 = avgWindowP95(target, split.before());
        Double afterP95 = avgWindowP95(target, split.after());
        if ((beforeP95 == null || afterP95 == null) && !confirmedActions.isEmpty()) {
            JsonNode last = confirmedActions.get(confirmedActions.size() - 1).path("result");
            if (beforeP95 == null && last.path("metricsBefore").path("p95LatencyMs").isNumber()) {
                beforeP95 = last.path("metricsBefore").path("p95LatencyMs").asDouble();
            }
            if (afterP95 == null && last.path("metricsAfter").path("p95LatencyMs").isNumber()) {
                afterP95 = last.path("metricsAfter").path("p95LatencyMs").asDouble();
            }
        }
        if (beforeP95 == null || afterP95 == null || beforeP95 <= 0.0) return null;
        return ((afterP95 - beforeP95) / beforeP95) * 100.0;
    }

    private static Double avgWindowP95(String target, List<JsonNode> frames) {
        if (frames.isEmpty()) return null;
        double sum = 0;
        int count = 0;
        for (JsonNode f : frames) {
            if ("ALL".equalsIgnoreCase(target)) {
                if (f.path("probe").path("p95Ms").isNumber()) {
                    sum += f.path("probe").path("p95Ms").asDouble();
                    count++;
                }
            } else if (f.path("probe").path("routes").isArray()) {
                for (JsonNode r : f.path("probe").path("routes")) {
                    if (target.equals(r.path("service").asText()) && r.path("p95Ms").isNumber()) {
                        sum += r.path("p95Ms").asDouble();
                        count++;
                    }
                }
            }
        }
        return count > 0 ? sum / count : null;
    }

    private static Double spanErrorRate(String service, JsonNode telemetry, Map<String, String> canonicalServices) {
        if (telemetry == null || !telemetry.path("spans").isArray()) return null;
        String expected = service != null ? normalizeServiceName(service, canonicalServices) : null;
        int total = 0, errs = 0;
        for (JsonNode span : telemetry.path("spans")) {
            if (expected != null && !expected.equals(normalizeServiceName(span.path("runtimeService").asText(""), canonicalServices))) continue;
            total++;
            boolean isErr = "ERROR".equalsIgnoreCase(span.path("spanStatus").asText(""))
                    || span.path("circuitOpen").asBoolean(false)
                    || span.path("httpStatusCode").asInt(0) >= 500;
            if (isErr) errs++;
        }
        return total > 0 ? (100.0 * errs / total) : null;
    }

    private static Double spanP95Ms(String service, JsonNode telemetry, Map<String, String> canonicalServices) {
        if (telemetry == null || !telemetry.path("spans").isArray()) return null;
        String expected = service != null ? normalizeServiceName(service, canonicalServices) : null;
        List<Double> ms = new ArrayList<>();
        for (JsonNode span : telemetry.path("spans")) {
            if (expected != null && !expected.equals(normalizeServiceName(span.path("runtimeService").asText(""), canonicalServices))) continue;
            String raw = span.path("durationNanoseconds").asText("");
            if (raw.isBlank()) continue;
            try {
                long ns = Long.parseLong(raw);
                if (ns >= 0) ms.add(ns / 1_000_000.0);
            } catch (NumberFormatException ignored) {}
        }
        if (ms.isEmpty()) return null;
        Collections.sort(ms);
        int idx = Math.max(0, Math.min(ms.size() - 1, (int) Math.ceil(ms.size() * 0.95) - 1));
        return ms.get(idx);
    }

    private static Map<String, Integer> readReplicas(JsonNode telemetry) {
        Map<String, Integer> map = new LinkedHashMap<>();
        if (telemetry == null || !telemetry.path("services").isArray()) return map;
        for (JsonNode s : telemetry.path("services")) {
            String name = s.path("service").asText("").trim();
            if (!name.isBlank()) map.put(name, s.path("runningReplicas").asInt(0));
        }
        return map;
    }

    private static final class EdgeAgg {
        final String client;
        final String server;
        double errSum;
        int errCount;
        double p95Sum;
        int p95Count;

        EdgeAgg(String client, String server) {
            this.client = client;
            this.server = server;
        }

        double avgErrorPct() { return errCount > 0 ? errSum / errCount : 0.0; }
        Double avgP95() { return p95Count > 0 ? p95Sum / p95Count : null; }
    }

    private static Map<String, EdgeAgg> aggregateEdges(List<JsonNode> frames, Map<String, String> canonicalServices) {
        Map<String, EdgeAgg> map = new LinkedHashMap<>();
        for (JsonNode frame : frames) {
            if (!frame.path("serviceGraph").isArray()) continue;
            for (JsonNode sg : frame.path("serviceGraph")) {
                String c = normalizeServiceName(sg.path("client").asText(""), canonicalServices);
                String s = normalizeServiceName(sg.path("server").asText(""), canonicalServices);
                if (c.isBlank() || s.isBlank()) continue;
                EdgeAgg agg = map.computeIfAbsent(c + "->" + s, k -> new EdgeAgg(c, s));
                if (sg.path("errorRatePercent").isNumber()) {
                    agg.errSum += sg.path("errorRatePercent").asDouble();
                    agg.errCount++;
                }
                if (sg.path("p95Ms").isNumber()) {
                    agg.p95Sum += sg.path("p95Ms").asDouble();
                    agg.p95Count++;
                }
            }
        }
        return map;
    }

    private static Map<String, String> buildCanonicalServiceIndex(
            List<JsonNode> confirmedActions,
            Set<String> predicted,
            List<JsonNode> frames,
            JsonNode latestTelemetry) {
        Set<String> canonical = new LinkedHashSet<>();
        if (predicted != null) canonical.addAll(predicted);
        for (JsonNode a : confirmedActions) {
            String svc = a.path("service").asText("").trim();
            if (!svc.isBlank()) canonical.add(svc);
        }
        collectServicesFromFrame(latestTelemetry, canonical);
        for (JsonNode frame : frames) collectServicesFromFrame(frame, canonical);
        Map<String, String> index = new HashMap<>();
        Set<String> ambiguous = new HashSet<>();
        for (String svc : canonical) {
            String norm = alnumLower(svc);
            if (norm.isEmpty()) continue;
            String existing = index.putIfAbsent(norm, svc);
            if (existing != null && !existing.equals(svc)) ambiguous.add(norm);
        }
        ambiguous.forEach(index::remove);
        return index;
    }

    private static void collectServicesFromFrame(JsonNode frame, Set<String> out) {
        if (frame == null || !frame.path("services").isArray()) return;
        for (JsonNode s : frame.path("services")) {
            String name = s.path("service").asText("").trim();
            if (!name.isBlank()) out.add(name);
        }
    }

    private static String normalizeServiceName(String raw, Map<String, String> canonicalIndex) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        if (trimmed.isBlank()) return "";
        if (canonicalIndex == null || canonicalIndex.isEmpty()) return trimmed;
        String resolved = canonicalIndex.get(alnumLower(trimmed));
        return resolved != null ? resolved : trimmed;
    }

    private static boolean isIgnoredServiceEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) return true;
        String lower = endpoint.trim().toLowerCase(Locale.ROOT);
        // Exclude telemetry collector, unknown spans, and external synthetic actors not selectable in the service picker.
        return "mavis-collector".equals(lower)
                || "unknown".equals(lower)
                || "unknown_service".equals(lower)
                || lower.startsWith("unknown_service:")
                || "user".equals(lower)
                || "client".equals(lower)
                || "browser".equals(lower)
                || "internet".equals(lower)
                || "external".equals(lower)
                || "loadgen".equals(lower)
                || "load-generator".equals(lower)
                || "probe".equals(lower)
                || "mavis-probe".equals(lower)
                || "mavis-scenario".equals(lower);
    }

    private static String alnumLower(String value) {
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isLetterOrDigit(c)) sb.append(Character.toLowerCase(c));
        }
        return sb.toString();
    }

    private static final class RouteAgg {
        double errSum;
        int errCount;
        double p95Sum;
        int p95Count;

        double avgErrorPct() { return errCount > 0 ? errSum / errCount : 0.0; }
        Double avgP95() { return p95Count > 0 ? p95Sum / p95Count : null; }
    }

    private static Map<String, RouteAgg> aggregateProbeRoutes(List<JsonNode> frames) {
        Map<String, RouteAgg> map = new LinkedHashMap<>();
        for (JsonNode frame : frames) {
            JsonNode routes = frame.path("probe").path("routes");
            if (!routes.isArray()) continue;
            for (JsonNode r : routes) {
                String svc = r.path("service").asText("").trim();
                if (svc.isBlank()) continue;
                RouteAgg agg = map.computeIfAbsent(svc, k -> new RouteAgg());
                if (r.path("errorRatePercent").isNumber()) {
                    agg.errSum += r.path("errorRatePercent").asDouble();
                    agg.errCount++;
                }
                if (r.path("p95Ms").isNumber()) {
                    agg.p95Sum += r.path("p95Ms").asDouble();
                    agg.p95Count++;
                }
            }
        }
        return map;
    }

    private static boolean isLatencyRegression(double beforeMs, double afterMs) {
        if (!Double.isFinite(beforeMs) || !Double.isFinite(afterMs) || beforeMs <= 0.0) return false;
        return (afterMs - beforeMs) >= P95_ABSOLUTE_JUMP_MS
                && ((afterMs - beforeMs) / beforeMs) >= P95_RELATIVE_JUMP;
    }

    private static boolean compare(double observed, String operator, double threshold) {
        return switch (operator) {
            case "LT" -> observed < threshold;
            case "LTE" -> observed <= threshold;
            case "GT" -> observed > threshold;
            case "GTE" -> observed >= threshold;
            case "EQ" -> Math.abs(observed - threshold) < 1e-6;
            default -> false;
        };
    }

    private static String opSymbol(String op) {
        return switch (op) {
            case "LT" -> "<";
            case "LTE" -> "<=";
            case "GT" -> ">";
            case "GTE" -> ">=";
            case "EQ" -> "=";
            default -> op;
        };
    }

    private static Instant parseInstant(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (Exception ignored) {
            try {
                return Instant.parse(value);
            } catch (Exception ignored2) {
                return null;
            }
        }
    }

    private static double maxAbs(Double existing, double candidate) {
        return existing == null || Math.abs(candidate) > Math.abs(existing) ? candidate : existing;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10_000.0) / 10_000.0;
    }

    private static String formatNum(double v) {
        if (Math.abs(v - Math.rint(v)) < 1e-6) return String.valueOf((long) Math.rint(v));
        return String.format(Locale.ROOT, "%.2f", v);
    }
}
