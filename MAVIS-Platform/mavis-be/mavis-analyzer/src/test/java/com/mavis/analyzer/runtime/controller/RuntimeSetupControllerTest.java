package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.service.RunnerHealthProbe;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RuntimeSetupControllerTest {
    @Test
    void runnerReadyRequiresConfigurationAndDockerHealth() {
        UUID projectId = UUID.randomUUID();
        var planning = mock(RuntimePlanningService.class);
        var probe = mock(RunnerHealthProbe.class);
        when(probe.probe()).thenReturn(new RunnerHealthProbe.Health(true, List.of()));
        var profile = new ObjectMapper().createObjectNode();
        profile.putObject("applications").putObject("orders").put("runtime", "dotnet8-linux-x64-glibc");
        profile.putArray("runnerIssues");
        var topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject().put("service", "orders");
        topology.putArray("connections");
        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                profile, 4, true, true, true, List.of(), List.of(), true));

        var readiness = new RuntimeSetupController(planning, probe).readiness(projectId).getData();

        assertTrue(readiness.runnerReady());
        verify(planning).configuration(projectId);
        verify(probe).probe();
        verifyNoMoreInteractions(planning);
    }

    @Test
    void configurationReadyButDockerDownIsNotRunnerReady() {
        UUID projectId = UUID.randomUUID();
        var planning = mock(RuntimePlanningService.class);
        var probe = mock(RunnerHealthProbe.class);
        when(probe.probe()).thenReturn(new RunnerHealthProbe.Health(false,
                List.of("Docker Engine is not reachable from the backend")));
        var profile = new ObjectMapper().createObjectNode();
        profile.putObject("applications").putObject("orders").put("runtime", "dotnet8-linux-x64-glibc");
        profile.putArray("runnerIssues");
        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                profile, 4, true, true, true, List.of(), List.of(), true));

        var readiness = new RuntimeSetupController(planning, probe).readiness(projectId).getData();

        assertTrue(readiness.configured());
        assertFalse(readiness.runnerReady());
        assertTrue(readiness.runnerIssues().contains("Docker Engine is not reachable from the backend"));
    }

    @Test
    void exposesProfileFactsWithoutMistakingConfiguredForRunnerReady() {
        UUID projectId = UUID.randomUUID();
        var planning = mock(RuntimePlanningService.class);
        var probe = mock(RunnerHealthProbe.class);
        when(probe.probe()).thenReturn(new RunnerHealthProbe.Health(true, List.of()));
        var profile = new ObjectMapper().createObjectNode();
        profile.putObject("applications").putObject("orders").put("runtime", "dotnet8-linux-x64-glibc");
        profile.putObject("serviceMappings").put("orders", UUID.randomUUID().toString());
        profile.putArray("detectedServices").add("orders");
        profile.putArray("runnerIssues").add("COLLECTOR_IMAGE_NOT_PINNED");
        var topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject().put("service", "orders");
        topology.putArray("connections");
        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                profile, 4, true, true, false,
                List.of("Runner images are not configured"), List.of("Runner images are not configured"), true));

        var readiness = new RuntimeSetupController(planning, probe).readiness(projectId).getData();

        assertTrue(readiness.configured());
        assertTrue(readiness.preflightCompatible());
        assertFalse(readiness.runnerReady());
        assertEquals(4, readiness.revision());
        assertEquals(List.of("orders"), readiness.applications());
        assertEquals(1, readiness.mappings().size());
        assertEquals(List.of("orders"), readiness.detectedServices());
        assertEquals(List.of("COLLECTOR_IMAGE_NOT_PINNED"), readiness.runnerIssues());
        assertEquals(1, readiness.topology().path("blocks").size());
        assertEquals(List.of("Runner images are not configured"), readiness.prerequisites());
        assertEquals("NEEDS_FIX", readiness.readinessGrade());
    }

    @Test
    void computesReadinessGradeTraceCoverageAndDeterministicContractYaml() {
        UUID projectId = UUID.randomUUID();
        UUID verifiedId = UUID.randomUUID();
        var mapper = new ObjectMapper();
        var planning = mock(RuntimePlanningService.class);
        var probe = mock(RunnerHealthProbe.class);
        var sessions = mock(com.mavis.common.repository.RuntimeSessionRepository.class);
        when(probe.probe()).thenReturn(new RunnerHealthProbe.Health(true, List.of()));

        var profile = mapper.createObjectNode();
        var apps = profile.putObject("applications");
        apps.putObject("orders").put("runtime", "java").put("containerPort", 8080).put("readinessPath", "/actuator/health");
        apps.putObject("payment").put("runtime", "dotnet8-linux-x64-glibc").put("containerPort", 8081).put("readinessPath", "/health");
        profile.putObject("serviceMappings").put("orders", UUID.randomUUID().toString()).put("payment", UUID.randomUUID().toString());
        profile.putArray("detectedServices").add("orders").add("payment").add("postgres");
        profile.putArray("runnerIssues");

        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                profile, 2, true, true, true, List.of(), List.of(), true));

        var receipt = mapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("runtimeService", "orders");
        var verified = com.mavis.common.entity.RuntimeSession.builder()
                .id(verifiedId).executionStatus("COMPLETED").receiptDigest("sha256:abc").runnerReceiptJson(receipt).build();
        when(sessions.findByProjectIdOrderByCreatedAtDesc(projectId)).thenReturn(List.of(verified));

        var controller = new RuntimeSetupController(planning, probe);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "runtimeSessions", sessions);
        var readiness = controller.readiness(projectId).getData();

        assertEquals("READY", readiness.readinessGrade());
        assertEquals(50, readiness.traceCoveragePercent());
        assertEquals(verifiedId.toString(), readiness.verifiedSessionId());
        assertTrue(readiness.remediationSteps().stream().anyMatch(s -> s.contains("50%")));
        assertNotNull(readiness.suggestedContractYaml());
        assertTrue(readiness.suggestedContractYaml().contains("orders:\n    runtime: java\n    port: 8080\n    readinessPath: \"/actuator/health\""));
        assertTrue(readiness.suggestedContractYaml().contains("postgres:\n    role: infra"));
    }

    @Test
    void effectiveRunnerIssuesBlocksFalseGreenReadinessAndClearsOnceSandboxComposeIsValid() {
        UUID projectId = UUID.randomUUID();
        var mapper = new ObjectMapper();
        var planning = mock(RuntimePlanningService.class);
        var probe = mock(RunnerHealthProbe.class);
        when(probe.probe()).thenReturn(new RunnerHealthProbe.Health(true, List.of()));

        var unresolvedProfile = mapper.createObjectNode();
        unresolvedProfile.putObject("applications").putObject("fruit-catalog-api").put("runtime", "dotnet8-linux-x64-musl");
        unresolvedProfile.putObject("serviceMappings").put("fruit-catalog-api", UUID.randomUUID().toString());
        unresolvedProfile.putArray("runnerIssues").add("Service 'fruit-catalog-api' uses build:");
        unresolvedProfile.putArray("effectiveRunnerIssues").add("Service 'fruit-catalog-api' uses build:");
        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                unresolvedProfile, 1, true, true, false, List.of(), List.of(), true));

        var blocked = new RuntimeSetupController(planning, probe).readiness(projectId).getData();
        assertFalse(blocked.runnerReady());
        assertEquals("NEEDS_FIX", blocked.readinessGrade());
        assertEquals(List.of("Service 'fruit-catalog-api' uses build:"), blocked.runnerIssues());

        var resolvedProfile = mapper.createObjectNode();
        resolvedProfile.putObject("applications").putObject("fruit-catalog-api").put("runtime", "dotnet8-linux-x64-musl");
        resolvedProfile.putObject("serviceMappings").put("fruit-catalog-api", UUID.randomUUID().toString());
        // Raw source compose issues stay in runnerIssues, but effectiveRunnerIssues is empty once sandboxCompose is pinned.
        resolvedProfile.putArray("runnerIssues").add("Service 'fruit-catalog-api' uses build:");
        resolvedProfile.putArray("effectiveRunnerIssues");
        when(planning.configuration(projectId)).thenReturn(new RuntimePlanningService.ConfigurationView(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "SPRING_BOOT_DOTNET_COMPOSE_V1",
                resolvedProfile, 2, true, true, true, List.of(), List.of(), true));

        var ready = new RuntimeSetupController(planning, probe).readiness(projectId).getData();
        assertTrue(ready.runnerReady());
        assertEquals("READY", ready.readinessGrade());
        assertTrue(ready.runnerIssues().isEmpty());
    }
}
