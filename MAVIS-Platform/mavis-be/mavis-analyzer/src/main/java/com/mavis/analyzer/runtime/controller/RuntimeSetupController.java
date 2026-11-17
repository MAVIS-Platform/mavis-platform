package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.runtime.service.RunnerHealthProbe;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Readiness of the pinned runtime profile used by a lecturer's Studio Live Lab. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/projects/{projectId}")
public class RuntimeSetupController {
    private final RuntimePlanningService planning;
    private final RunnerHealthProbe runnerHealth;

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
            JsonNode topology) {}

    @GetMapping("/runtime-setup-readiness")
    public ApiResponse<Readiness> readiness(@PathVariable UUID projectId) {
        var view = planning.configuration(projectId);
        var health = runnerHealth.probe();
        JsonNode profile = view.profile();
        JsonNode topology = profile != null && profile.path("studioTopology").isObject()
                ? profile.path("studioTopology") : null;
        List<String> runnerIssues = new ArrayList<>(textArray(profile == null ? null : profile.get("runnerIssues")));
        runnerIssues.addAll(health.issues());
        return ApiResponse.success(new Readiness(
                view.configured(), view.supported(), view.ready() && health.ready(), view.revision(),
                view.prerequisites() == null ? List.of() : view.prerequisites(),
                view.warnings() == null ? List.of() : view.warnings(),
                fieldNames(profile == null ? null : profile.get("applications")),
                fieldNames(profile == null ? null : profile.get("serviceMappings")),
                textArray(profile == null ? null : profile.get("detectedServices")),
                runnerIssues,
                topology));
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
