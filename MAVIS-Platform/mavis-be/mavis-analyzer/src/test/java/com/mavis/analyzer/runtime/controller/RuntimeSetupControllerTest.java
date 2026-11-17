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
    }
}
