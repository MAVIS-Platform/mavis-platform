package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.runtime.service.RunnerHealthProbe;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.repository.RuntimeSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Readiness of the pinned runtime profile used by a lecturer's Studio Live Lab. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/projects/{projectId}")
public class RuntimeSetupController {
    private final RuntimePlanningService planning;
    private final RunnerHealthProbe runnerHealth;

    @Autowired(required = false)
    private RuntimeSessionRepository runtimeSessions;

    public record Readiness(
            boolean configured,
            boolean preflightCompatible,
            boolean runnerReady,
            int revision,
            List<String> prerequisites,
            List<String> warnings,
            List<String> applications,
            List<String> mappings,
            List<String> detectedServices,
            List<String> runnerIssues,
            JsonNode topology,
            String readinessGrade,
            Integer traceCoveragePercent,
            String verifiedSessionId,
            List<String> remediationSteps,
            String suggestedContractYaml) {}

    @GetMapping("/runtime-setup-readiness")
    public ApiResponse<Readiness> readiness(@PathVariable UUID projectId) {
        var view = planning.configuration(projectId);
        var health = runnerHealth.probe();
        JsonNode profile = view.profile();
        JsonNode topology = profile != null && profile.path("studioTopology").isObject()
                ? profile.path("studioTopology") : null;
        List<String> runnerIssues = new ArrayList<>(textArray(profile == null ? null : profile.get("runnerIssues")));
        runnerIssues.addAll(health.issues());
        List<String> applications = fieldNames(profile == null ? null : profile.get("applications"));
        List<String> mappings = fieldNames(profile == null ? null : profile.get("serviceMappings"));
        List<String> detected = textArray(profile == null ? null : profile.get("detectedServices"));
        boolean effectiveRunnerReady = view.ready() && health.ready();

        Integer traceCoveragePercent = null;
        String verifiedSessionId = null;
        if (runtimeSessions != null && !applications.isEmpty()) {
            for (RuntimeSession s : runtimeSessions.findByProjectIdOrderByCreatedAtDesc(projectId)) {
                if (s.getReceiptDigest() != null && "COMPLETED".equalsIgnoreCase(s.getExecutionStatus())
                        && s.getRunnerReceiptJson() != null) {
                    verifiedSessionId = s.getId() != null ? s.getId().toString() : null;
                    Set<String> observedServices = new LinkedHashSet<>();
                    JsonNode spans = s.getRunnerReceiptJson().path("outcome").path("trace").path("spans");
                    if (spans.isArray()) {
                        for (JsonNode span : spans) {
                            String svc = span.path("runtimeService").asText("").trim();
                            if (!svc.isEmpty()) observedServices.add(svc);
                        }
                    }
                    long covered = applications.stream().filter(observedServices::contains).count();
                    traceCoveragePercent = (int) Math.round(100.0 * covered / applications.size());
                    break;
                }
            }
        }

        List<String> remediation = new ArrayList<>();
        if (!view.configured() || !view.supported()) {
            remediation.add("Ensure docker-compose.yml passes preflight and run Sync Docker to build/pin sandbox images.");
        }
        if (!effectiveRunnerReady) {
            remediation.add("Resolve runner health/image issues before opening Studio Live to students.");
        }
        List<String> unmapped = applications.stream().filter(app -> !mappings.contains(app)).toList();
        if (!unmapped.isEmpty()) {
            remediation.add("Map Compose services to architecture model nodes: " + String.join(", ", unmapped) + ".");
        }
        if (verifiedSessionId == null && effectiveRunnerReady) {
            remediation.add("Run one test Studio Live session to verify end-to-end boot and OpenTelemetry trace coverage.");
        } else if (traceCoveragePercent != null && traceCoveragePercent < 100) {
            remediation.add("Only " + traceCoveragePercent + "% of services emitted OTel spans; verify baseline requests hit all services.");
        }

        String grade = (!view.configured() || !view.supported() || applications.isEmpty())
                ? "BLOCKED"
                : (!effectiveRunnerReady || !runnerIssues.isEmpty() || !unmapped.isEmpty())
                        ? "NEEDS_FIX"
                        : "READY";

        return ApiResponse.success(new Readiness(
                view.configured(), view.supported(), effectiveRunnerReady, view.revision(),
                view.prerequisites() == null ? List.of() : view.prerequisites(),
                view.warnings() == null ? List.of() : view.warnings(),
                applications,
                mappings,
                detected,
                runnerIssues,
                topology,
                grade,
                traceCoveragePercent,
                verifiedSessionId,
                remediation,
                buildContractYaml(profile, detected)));
    }

    /** Generates a deterministic mavis-runtime.yaml matching ComposePreflightValidator's contract parser. */
    static String buildContractYaml(JsonNode profile, List<String> detectedServices) {
        if (profile == null || !profile.path("applications").isObject() || profile.path("applications").isEmpty()) {
            return null;
        }
        StringBuilder yaml = new StringBuilder("# Commit this file as mavis-runtime.yaml at your repository root\nservices:\n");
        Set<String> appNames = new LinkedHashSet<>();
        profile.path("applications").fields().forEachRemaining(entry -> {
            String svc = entry.getKey();
            JsonNode app = entry.getValue();
            if (!app.isObject()) return;
            appNames.add(svc);
            yaml.append("  ").append(svc).append(":\n");
            String runtime = app.path("runtime").asText("passthrough");
            yaml.append("    runtime: ").append(runtime).append("\n");
            int port = app.path("containerPort").asInt(8080);
            if (port >= 1 && port <= 65535) {
                yaml.append("    port: ").append(port).append("\n");
            }
            String readinessPath = app.path("readinessPath").asText("/health");
            yaml.append("    readinessPath: \"").append(readinessPath.replace("\"", "")).append("\"\n");
        });
        for (String svc : detectedServices) {
            if (!appNames.contains(svc) && !"mavis-collector".equals(svc)) {
                yaml.append("  ").append(svc).append(":\n    role: infra\n");
            }
        }
        JsonNode seed = profile.path("seedHook");
        if (seed.isObject() && !seed.path("service").asText("").isBlank() && !seed.path("path").asText("").isBlank()) {
            yaml.append("seed:\n")
                .append("  service: ").append(seed.path("service").asText()).append("\n")
                .append("  method: ").append(seed.path("method").asText("POST")).append("\n")
                .append("  path: \"").append(seed.path("path").asText().replace("\"", "")).append("\"\n")
                .append("  expectedStatus: ").append(seed.path("expectedStatus").asInt(200)).append("\n");
        }
        return yaml.toString();
    }

    private static List<String> fieldNames(JsonNode node) {
        if (node == null || !node.isObject()) return List.of();
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private static List<String> textArray(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual() && !item.asText().isBlank()) values.add(item.asText());
        }
        return values;
    }
}
