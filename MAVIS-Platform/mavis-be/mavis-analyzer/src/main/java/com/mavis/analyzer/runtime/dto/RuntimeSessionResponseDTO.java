package com.mavis.analyzer.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.common.entity.RuntimeSession;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeSessionResponseDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ScenarioStepResultDTO {
        private String id;
        private String service;
        private String method;
        private String path;
        private Integer expectedStatus;
        private Integer statusCode;
        private String status;
        private Long durationMs;
        private String failureReason;
        private String traceId;
        private String parentSpanId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BeforeAfterComparisonDTO {
        private String action;
        private String service;
        private Integer replicasBefore;
        private Integer replicasAfter;
        private Integer requestCountBefore;
        private Integer requestCountAfter;
        private Double p95LatencyMsBefore;
        private Double p95LatencyMsAfter;
        private Double errorRateBefore;
        private Double errorRateAfter;
        private Integer capturedSpanCount;
        private String cleanupStatus;
        private String measurementStatus;
        private String measurementNote;
    }

    private UUID id;
    private UUID projectId;
    private UUID sourceSnapshotId;
    private UUID triggeredById;
    private String triggeredByName;
    private String profileName;
    private String scenarioName;
    private JsonNode scenarioConfig;
    private String scenarioStatus;
    private String traceStatus;
    private String traceStoragePath;
    private String overrideComposeYaml;
    private UUID modelVersionId;
    private UUID enrichedModelVersionId;
    private String profileVersionId;
    private String runConfigurationVersionId;
    private String scenarioVersionId;
    private java.util.Map<String, String> confirmedServiceMappings;
    private String resourceProject;
    private String executionStatus;
    private String evidenceStatus;
    private String cleanupStatus;
    private String traceQuality;
    private String mappingStatus;
    private String publicationGateStatus;
    private String failureReason;
    private List<String> diagnostics;
    private Integer capturedSpanCount;
    private boolean studioVerified;
    private JsonNode infrastructureActions;
    private List<BeforeAfterComparisonDTO> beforeAfterComparison;
    private List<ScenarioStepResultDTO> stepResults;
    private Boolean sandboxEnforcementConfirmed;
    private OffsetDateTime cancelRequestedAt;
    private OffsetDateTime startedAt;
    private OffsetDateTime completedAt;
    private OffsetDateTime createdAt;

    public static RuntimeSessionResponseDTO fromEntity(RuntimeSession entity) {
        return fromEntity(entity, null, null);
    }

    public static RuntimeSessionResponseDTO fromEntity(RuntimeSession entity, String overrideComposeYaml) {
        return fromEntity(entity, overrideComposeYaml, null);
    }

    public static RuntimeSessionResponseDTO fromEntity(RuntimeSession entity, String overrideComposeYaml, UUID enrichedModelVersionId) {
        if (entity == null) {
            return null;
        }
        UUID resolvedEnrichedId = enrichedModelVersionId != null ? enrichedModelVersionId : entity.getEnrichedModelVersionId();
        List<String> diagnostics = new ArrayList<>();
        String failureReason = null;
        Integer capturedSpanCount = null;
        List<ScenarioStepResultDTO> stepResults = new ArrayList<>();

        JsonNode recovery = entity.getRecoveryResultJson();
        if (recovery != null && recovery.isObject()) {
            String code = textField(recovery, "code");
            String reason = firstNonBlank(textField(recovery, "reason"), textField(recovery, "message"));
            if (reason != null) {
                failureReason = SecretRedactor.redactString(reason);
            }
            if (code != null) {
                addUniqueDiagnostic(diagnostics, code);
            }
            JsonNode recDiags = recovery.path("diagnostics");
            if (recDiags.isArray()) {
                for (JsonNode d : recDiags) {
                    addUniqueDiagnostic(diagnostics, d.asText(""));
                }
            }
        }

        JsonNode receipt = entity.getRunnerReceiptJson();
        JsonNode outcomeNode = (receipt != null && receipt.isObject()) ? receipt.path("outcome") : null;
        if (outcomeNode != null && outcomeNode.isObject()) {
            JsonNode spansNode = outcomeNode.path("trace").path("spans");
            if (spansNode.isArray()) {
                capturedSpanCount = spansNode.size();
            }
            JsonNode outDiags = outcomeNode.path("diagnostics");
            if (outDiags.isArray()) {
                for (JsonNode d : outDiags) {
                    addUniqueDiagnostic(diagnostics, d.asText(""));
                }
            }
            JsonNode warningsNode = outcomeNode.path("trace").path("warnings");
            boolean traceComplete = "COMPLETE".equalsIgnoreCase(entity.getTraceStatus());
            if (warningsNode.isArray()) {
                for (JsonNode w : warningsNode) {
                    String warn = w.asText("").trim();
                    if (warn.isEmpty() || "ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION".equalsIgnoreCase(warn)) {
                        continue;
                    }
                    if (traceComplete && ("MISSING_PARENT_SPAN".equalsIgnoreCase(warn) || "UNMAPPED_SERVICE".equalsIgnoreCase(warn))) {
                        continue;
                    }
                    addUniqueDiagnostic(diagnostics, warn);
                }
            }
        }

        Map<String, JsonNode> pinnedSteps = extractPinnedSteps(entity.getScenarioConfig());
        Map<String, JsonNode> outcomeSteps = extractOutcomeSteps(outcomeNode);
        Set<String> orderedIds = new LinkedHashSet<>(pinnedSteps.keySet());
        orderedIds.addAll(outcomeSteps.keySet());
        boolean terminal = isTerminalSession(entity);

        for (String stepId : orderedIds) {
            JsonNode def = pinnedSteps.get(stepId);
            JsonNode out = outcomeSteps.get(stepId);
            String service = def != null ? textField(def, "service") : null;
            String method = def != null ? firstNonBlank(textField(def, "method"), "GET") : null;
            String rawPath = def != null ? textField(def, "path") : null;
            String path = rawPath != null ? SecretRedactor.redactString(rawPath) : null;
            Integer expectedStatus = (def != null && def.path("expectedStatus").isInt()) ? def.get("expectedStatus").asInt() : null;
            boolean allowClientError = def != null && def.path("allowClientError").asBoolean(false);
            Integer statusCode = (out != null && out.hasNonNull("statusCode") && out.get("statusCode").isInt()) ? out.get("statusCode").asInt() : null;
            Long durationMs = (out != null && out.hasNonNull("elapsedMilliseconds") && out.get("elapsedMilliseconds").isNumber())
                    ? out.get("elapsedMilliseconds").asLong()
                    : null;
            String rawStatus = out != null ? textField(out, "status") : null;
            String stepStatus = rawStatus != null
                    ? normalizeStepStatus(rawStatus)
                    : (terminal ? "NOT_RUN" : "PENDING");
            String stepFailure = null;
            if ("FAILED".equals(stepStatus)) {
                if (statusCode != null) {
                    stepFailure = allowClientError
                            ? ("HTTP " + statusCode + " (expected 2xx-4xx)")
                            : ("HTTP " + statusCode + (expectedStatus != null ? " (expected " + expectedStatus + ")" : ""));
                } else {
                    stepFailure = "Request failed before receiving an HTTP response";
                }
            } else if ("TIMED_OUT".equals(stepStatus)) {
                stepFailure = "HTTP step timed out before response completed";
            }
            stepResults.add(ScenarioStepResultDTO.builder()
                    .id(stepId)
                    .service(service)
                    .method(method)
                    .path(path)
                    .expectedStatus(expectedStatus)
                    .statusCode(statusCode)
                    .status(stepStatus)
                    .durationMs(durationMs)
                    .failureReason(stepFailure)
                    .traceId(out != null ? textField(out, "traceId") : null)
                    .parentSpanId(out != null ? textField(out, "parentSpanId") : null)
                    .build());
            if (failureReason == null && stepFailure != null) {
                String label = (method != null ? method + " " : "") + (path != null ? path : (service != null ? service : stepId));
                failureReason = "Step " + stepId + " (" + label + "): " + stepFailure;
            }
        }

        if (failureReason == null) {
            String exec = entity.getExecutionStatus() != null ? entity.getExecutionStatus().toUpperCase(Locale.ROOT) : "";
            String scen = entity.getScenarioStatus() != null ? entity.getScenarioStatus().toUpperCase(Locale.ROOT) : "";
            if ("CANCELLED".equals(exec) || "CANCELLED".equals(scen)) {
                failureReason = "Runtime session was cancelled before completion.";
            } else if ("TIMED_OUT".equals(exec) || "TIMEOUT".equals(exec) || "TIMEOUT".equals(scen)) {
                failureReason = !diagnostics.isEmpty()
                        ? "Runtime session timed out (" + diagnostics.get(0) + ")."
                        : "Runtime session exceeded the execution deadline.";
            } else if ("FAILED".equals(exec) || "FAILED".equals(scen)) {
                failureReason = !diagnostics.isEmpty()
                        ? humanizeDiagnostic(diagnostics.get(0))
                        : "Runtime execution failed before scenario verification completed.";
            }
        }

        boolean studioVerified = entity.hasVerifiedStudioEvidence();

        return RuntimeSessionResponseDTO.builder()
                .id(entity.getId())
                .projectId(entity.getProject() != null ? entity.getProject().getId() : null)
                .sourceSnapshotId(entity.getSourceSnapshot() != null ? entity.getSourceSnapshot().getId() : null)
                .modelVersionId(entity.getModelVersion() != null ? entity.getModelVersion().getId() : null)
                .enrichedModelVersionId(resolvedEnrichedId)
                .triggeredById(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getId() : null)
                .triggeredByName(entity.getTriggeredBy() != null ? entity.getTriggeredBy().getFullName() : null)
                .profileName(entity.getProfileName())
                .profileVersionId(entity.getProfileVersionId())
                .runConfigurationVersionId(entity.getRunConfigurationVersionId())
                .scenarioVersionId(entity.getScenarioVersionId())
                .confirmedServiceMappings(entity.getConfirmedServiceMappings())
                .resourceProject(entity.getResourceProject())
                .scenarioName(entity.getScenarioName())
                .scenarioConfig(entity.getScenarioConfig())
                .scenarioStatus(entity.getScenarioStatus())
                .executionStatus(entity.getExecutionStatus())
                .evidenceStatus(entity.getEvidenceStatus())
                .cleanupStatus(entity.getCleanupStatus())
                .traceQuality(entity.getTraceQuality())
                .mappingStatus(entity.getMappingStatus())
                .publicationGateStatus(entity.getPublicationGateStatus())
                .failureReason(failureReason)
                .diagnostics(diagnostics)
                .capturedSpanCount(capturedSpanCount)
                .studioVerified(studioVerified)
                .infrastructureActions(studioVerified ? receipt.path("infrastructureActions") : null)
                .beforeAfterComparison(studioVerified ? buildBeforeAfterComparison(receipt.path("infrastructureActions"), capturedSpanCount, entity.getCleanupStatus()) : null)
                .stepResults(stepResults)
                .sandboxEnforcementConfirmed(entity.getSandboxEnforcementConfirmed())
                .traceStatus(entity.getTraceStatus())
                .traceStoragePath(entity.getTraceStoragePath())
                .overrideComposeYaml(overrideComposeYaml)
                .cancelRequestedAt(entity.getCancelRequestedAt())
                .startedAt(entity.getStartedAt())
                .completedAt(entity.getCompletedAt())
                .createdAt(entity.getCreatedAt())
                .build();
    }

    private static Map<String, JsonNode> extractPinnedSteps(JsonNode scenarioConfig) {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        if (scenarioConfig == null || !scenarioConfig.isObject()) {
            return result;
        }
        JsonNode stepsNode = scenarioConfig.path("scenario").path("steps");
        if (!stepsNode.isArray()) {
            stepsNode = scenarioConfig.path("steps");
        }
        if (!stepsNode.isArray()) {
            return result;
        }
        int idx = 1;
        for (JsonNode item : stepsNode) {
            if (item != null && item.isObject()) {
                String id = firstNonBlank(textField(item, "id"), "step-" + idx);
                result.put(id, item);
            }
            idx++;
        }
        return result;
    }

    private static Map<String, JsonNode> extractOutcomeSteps(JsonNode outcomeNode) {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        if (outcomeNode == null || !outcomeNode.isObject()) {
            return result;
        }
        JsonNode stepsNode = outcomeNode.path("scenario").path("steps");
        if (!stepsNode.isArray()) {
            return result;
        }
        int idx = 1;
        for (JsonNode item : stepsNode) {
            if (item != null && item.isObject()) {
                String id = firstNonBlank(textField(item, "stepId"), textField(item, "id"));
                if (id == null) {
                    id = "step-" + idx;
                }
                result.put(id, item);
            }
            idx++;
        }
        return result;
    }

    private static boolean isTerminalSession(RuntimeSession entity) {
        if (entity.getCompletedAt() != null || entity.getRunnerReceiptJson() != null) {
            return true;
        }
        String exec = entity.getExecutionStatus() != null ? entity.getExecutionStatus().toUpperCase(Locale.ROOT) : "";
        return Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEOUT").contains(exec);
    }

    private static String normalizeStepStatus(String raw) {
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if ("TIMEDOUT".equals(upper) || "TIMEOUT".equals(upper)) {
            return "TIMED_OUT";
        }
        return upper;
    }

    private static String humanizeDiagnostic(String code) {
        if (code == null || code.isBlank()) {
            return "Runtime execution failed.";
        }
        String upper = code.toUpperCase(Locale.ROOT);
        if (upper.contains("WAITUNTILREADY") || upper.contains("READINESS")) {
            return "Container readiness probe did not become healthy before timeout (" + code + ").";
        }
        if (upper.contains("PREPAREANDSTART") || upper.contains("COMPOSE")) {
            return "Sandbox container startup failed (" + code + ").";
        }
        if (upper.contains("RUNNER_UNAVAILABLE")) {
            return "Runtime runner is unavailable on the host (" + code + ").";
        }
        return code;
    }

    private static void addUniqueDiagnostic(List<String> diagnostics, String raw) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        String redacted = SecretRedactor.redactString(raw.trim());
        if (redacted != null && !redacted.isBlank() && !diagnostics.contains(redacted)) {
            diagnostics.add(redacted);
        }
    }

    private static String textField(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) {
            return null;
        }
        String val = node.get(field).asText();
        return (val == null || val.isBlank()) ? null : val.trim();
    }

    private static String firstNonBlank(String a, String b) {
        return (a != null && !a.isBlank()) ? a : ((b != null && !b.isBlank()) ? b : null);
    }

    private static List<BeforeAfterComparisonDTO> buildBeforeAfterComparison(
            JsonNode actionsNode, Integer capturedSpanCount, String cleanupStatus) {
        if (actionsNode == null || !actionsNode.isArray() || actionsNode.isEmpty()) {
            return null;
        }
        List<BeforeAfterComparisonDTO> comparisons = new ArrayList<>();
        for (JsonNode action : actionsNode) {
            if (action == null || !action.path("confirmed").asBoolean(false)) {
                continue;
            }
            JsonNode before = action.path("metricsBefore");
            JsonNode after = action.path("metricsAfter");
            Integer reqBefore = intMetric(before, "requestCount");
            Integer reqAfter = intMetric(after, "requestCount");
            Double p95Before = doubleMetric(before, "p95LatencyMs");
            Double p95After = doubleMetric(after, "p95LatencyMs");
            Double errBefore = doubleMetric(before, "errorRatePercent");
            Double errAfter = doubleMetric(after, "errorRatePercent");
            String type = action.path("action").asText("").trim().toUpperCase(Locale.ROOT);
            Integer repBefore = intMetric(action, "replicasBefore");
            Integer repAfter = intMetric(action, "replicasAfter");

            boolean hasSamples = reqBefore != null && reqBefore > 0 && reqAfter != null && reqAfter > 0
                    && p95Before != null && p95After != null;
            String measurementStatus = hasSamples ? "MEASURED" : "INSUFFICIENT_TELEMETRY_SAMPLES";
            String measurementNote;
            if (!hasSamples) {
                measurementNote = "Insufficient telemetry samples";
            } else if ("STOP".equals(type) && repAfter != null && repAfter == 0) {
                measurementNote = (errAfter != null && errBefore != null && errAfter > errBefore)
                        ? "Service stopped; circuit fallback or error span path active"
                        : "Service stopped cleanly";
            } else if ("SCALE".equals(type) && repBefore != null && repAfter != null) {
                measurementNote = "Scaled " + action.path("service").asText("") + " from " + repBefore + " to " + repAfter + " replica(s)";
            } else {
                measurementNote = "Measured before/after workload comparison captured";
            }

            comparisons.add(BeforeAfterComparisonDTO.builder()
                    .action(type)
                    .service(action.path("service").asText(""))
                    .replicasBefore(repBefore)
                    .replicasAfter(repAfter)
                    .requestCountBefore(reqBefore)
                    .requestCountAfter(reqAfter)
                    .p95LatencyMsBefore(p95Before)
                    .p95LatencyMsAfter(p95After)
                    .errorRateBefore(errBefore)
                    .errorRateAfter(errAfter)
                    .capturedSpanCount(capturedSpanCount)
                    .cleanupStatus(cleanupStatus)
                    .measurementStatus(measurementStatus)
                    .measurementNote(measurementNote)
                    .build());
        }
        return comparisons.isEmpty() ? null : comparisons;
    }

    private static Integer intMetric(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || !node.get(field).isNumber()) {
            return null;
        }
        return node.get(field).asInt();
    }

    private static Double doubleMetric(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || !node.get(field).isNumber()) {
            return null;
        }
        return node.get(field).asDouble();
    }
}
