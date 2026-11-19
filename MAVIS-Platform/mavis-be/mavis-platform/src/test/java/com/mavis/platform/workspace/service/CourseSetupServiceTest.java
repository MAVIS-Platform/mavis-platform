package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.Workspace;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseSetupServiceTest {
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID assignmentId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final UUID modelId = UUID.randomUUID();
    private final UUID snapshotId = UUID.randomUUID();
    private final UUID lecturerId = UUID.randomUUID();
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ModelVersionRepository models = mock(ModelVersionRepository.class);
    private final RuntimeConfigurationRepository configurations = mock(RuntimeConfigurationRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final CourseSetupService setup = new CourseSetupService(
            access, workspaces, assignments, projects, models, configurations, jdbc);
    private final ObjectMapper mapper = new ObjectMapper();
    private final Workspace workspace = Workspace.builder().id(workspaceId).name("Course 101")
            .status("ACTIVE").courseMode(true).createdBy(com.mavis.common.entity.User.builder().id(lecturerId).build()).build();
    private final Project project = Project.builder().id(projectId).workspace(workspace)
            .name("Seed reference").projectType("TEACHER_REFERENCE").isReferenceTemplate(true).status("ACTIVE").build();
    private final SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project)
            .isPublished(true).artifactHash("a".repeat(64)).storagePath("reference.zip").build();
    private final ModelVersion model = ModelVersion.builder().id(modelId).project(project)
            .sourceSnapshot(snapshot).revision(3).build();
    private final Assignment lab = Assignment.builder().id(assignmentId).workspace(workspace)
            .title("Lab 1").labOrder(1).requireRuntimeTrace(true).referenceModel(model)
            .createdAt(OffsetDateTime.now()).build();

    @BeforeEach void base() {
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(lab));
        when(configurations.findById(projectId)).thenReturn(Optional.of(configuration(true)));
        when(jdbc.queryForObject(contains("FROM course_quizzes"), eq(Integer.class), eq(assignmentId), eq(modelId)))
                .thenReturn(1);
        when(jdbc.query(contains("FROM course_passkeys"), ArgumentMatchers.<RowMapper<Object[]>>any(), eq(workspaceId)))
                .thenReturn(List.<Object[]>of(new Object[]{ true, OffsetDateTime.now().plusHours(3) }));
        when(jdbc.queryForObject(contains("FROM workspace_members"), eq(Integer.class), eq(workspaceId)))
                .thenReturn(2);
        lab.setStudioTopologySnapshot(mapper.createObjectNode().put("version", 1));
        lab.setStudioTopologyRevision(4);
    }

    @Test void completePreparedCourseIsReadyToPreview() {
        var result = setup.setup(workspaceId);

        assertTrue(result.courseMode());
        assertTrue(result.reference().referenceReady());
        assertTrue(result.reference().runtimeConfigured());
        assertTrue(result.reference().runtimeMatchesSource());
        assertTrue(result.reference().topologyConfigured());
        assertEquals(2, result.reference().applications().size());
        assertEquals(2, result.reference().blockCount());
        assertEquals(1, result.reference().connectionCount());
        assertEquals("READY", result.labs().get(0).state());
        assertEquals(1, result.labs().get(0).quizVersion());
        assertTrue(result.passkey().active());
        assertEquals("open-lab", result.nextAction());
        assertEquals(assignmentId, result.previewAssignmentId());
        assertTrue(result.steps().stream().allMatch(step -> "DONE".equals(step.state())));
    }

    @Test void missingRuntimeAndTopologyPointToTheRightSetupStep() {
        when(configurations.findById(projectId)).thenReturn(Optional.empty());

        var result = setup.setup(workspaceId);

        assertFalse(result.reference().runtimeConfigured());
        assertFalse(result.reference().topologyConfigured());
        assertEquals("NEEDS_STUDIO", result.labs().get(0).state());
        assertEquals("configure-runtime", result.nextAction());
        assertTrue(result.steps().stream()
                .filter(step -> step.id().equals("runtime")).allMatch(step -> "ACTION".equals(step.state())));
        assertTrue(result.steps().stream()
                .filter(step -> step.id().equals("studio")).allMatch(step -> "ACTION".equals(step.state())));
    }

    @Test void publishedLabUsesFrozenTopologyWhenLiveProfileHasNoTopology() {
        when(configurations.findById(projectId)).thenReturn(Optional.of(configuration(false)));

        var result = setup.setup(workspaceId);

        assertFalse(result.reference().topologyConfigured());
        assertTrue(result.labs().getFirst().topologyFrozen());
        assertEquals("READY", result.labs().getFirst().state());
        assertEquals(assignmentId, result.previewAssignmentId());
        assertEquals("open-lab", result.nextAction());
        assertEquals("DONE", result.steps().stream()
                .filter(step -> step.id().equals("studio")).findFirst().orElseThrow().state());
    }

    @Test void multipleReferenceProjectsSurfaceTheReferenceThatStillNeedsConfiguration() {
        UUID secondProjectId = UUID.randomUUID();
        UUID secondSnapshotId = UUID.randomUUID();
        UUID secondModelId = UUID.randomUUID();
        Project secondProject = Project.builder().id(secondProjectId).workspace(workspace)
                .name("Second reference").projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true).status("ACTIVE").build();
        SourceSnapshot secondSnapshot = SourceSnapshot.builder().id(secondSnapshotId).project(secondProject)
                .isPublished(true).artifactHash("b".repeat(64)).storagePath("second-reference.zip").build();
        ModelVersion secondModel = ModelVersion.builder().id(secondModelId).project(secondProject)
                .sourceSnapshot(secondSnapshot).revision(8).build();
        Assignment secondLab = Assignment.builder().id(UUID.randomUUID()).workspace(workspace)
                .title("Lab 2").labOrder(2).requireRuntimeTrace(true).referenceModel(secondModel)
                .createdAt(OffsetDateTime.now().plusSeconds(1)).build();
        secondLab.setStudioTopologySnapshot(mapper.createObjectNode().put("version", 1));
        secondLab.setStudioTopologyRevision(8);
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(secondLab, lab));
        when(jdbc.queryForObject(contains("FROM course_quizzes"), eq(Integer.class), eq(secondLab.getId()), eq(secondModelId)))
                .thenReturn(1);
        when(configurations.findById(secondProjectId)).thenReturn(Optional.empty());

        var result = setup.setup(workspaceId);

        assertEquals(secondProjectId, result.reference().projectId());
        assertEquals("READY", result.labs().get(0).state());
        assertEquals("NEEDS_STUDIO", result.labs().get(1).state());
        assertTrue(result.steps().stream().filter(step -> step.id().equals("studio"))
                .allMatch(step -> "ACTION".equals(step.state())));
        assertEquals("configure-runtime", result.nextAction());
        assertEquals(assignmentId, result.previewAssignmentId());
    }

    @Test void emptyCourseStartsWithSeedingAndReferenceFallback() {
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of());
        when(projects.findByWorkspaceId(workspaceId)).thenReturn(List.of(project));
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.of(model));

        var result = setup.setup(workspaceId);

        assertTrue(result.labs().isEmpty());
        assertEquals(projectId, result.reference().projectId());
        assertEquals(modelId, result.reference().modelId());
        assertEquals("seed-labs", result.nextAction());
        assertTrue(result.steps().stream()
                .filter(step -> step.id().equals("labs")).allMatch(step -> "ACTION".equals(step.state())));
    }

    @Test void multiReferenceCoursePointsToSecondReferenceWhenItsRuntimeOrStudioIsIncomplete() {
        UUID project2Id = UUID.randomUUID();
        UUID snapshot2Id = UUID.randomUUID();
        UUID model2Id = UUID.randomUUID();
        UUID lab2Id = UUID.randomUUID();
        var project2 = Project.builder().id(project2Id).workspace(workspace)
                .name("Second reference").projectType("TEACHER_REFERENCE").isReferenceTemplate(true).status("ACTIVE").build();
        var snapshot2 = SourceSnapshot.builder().id(snapshot2Id).project(project2)
                .isPublished(true).artifactHash("b".repeat(64)).storagePath("ref2.zip").build();
        var model2 = ModelVersion.builder().id(model2Id).project(project2)
                .sourceSnapshot(snapshot2).revision(1).build();
        var lab2 = Assignment.builder().id(lab2Id).workspace(workspace)
                .title("Lab 2").labOrder(2).requireRuntimeTrace(true).referenceModel(model2)
                .createdAt(OffsetDateTime.now().plusMinutes(1)).build();
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(lab2, lab));
        when(configurations.findById(project2Id)).thenReturn(Optional.empty());

        var missingRuntime = setup.setup(workspaceId);

        assertEquals("READY", missingRuntime.labs().get(0).state());
        assertEquals("NEEDS_STUDIO", missingRuntime.labs().get(1).state());
        assertEquals(project2Id, missingRuntime.reference().projectId());
        assertEquals("configure-runtime", missingRuntime.nextAction());
        assertEquals("ACTION", missingRuntime.steps().stream()
                .filter(step -> step.id().equals("runtime")).findFirst().orElseThrow().state());
        assertEquals("ACTION", missingRuntime.steps().stream()
                .filter(step -> step.id().equals("studio")).findFirst().orElseThrow().state());

        ObjectNode appsOnlyProfile = mapper.createObjectNode();
        appsOnlyProfile.putObject("applications").putObject("orders").put("runtime", "dotnet8-linux-x64-glibc");
        var appsOnlyConfig = new RuntimeConfiguration();
        appsOnlyConfig.setProjectId(project2Id);
        appsOnlyConfig.setSourceSnapshotId(snapshot2Id);
        appsOnlyConfig.setModelVersionId(model2Id);
        appsOnlyConfig.setProfile(appsOnlyProfile);
        appsOnlyConfig.setRevision(1);
        when(configurations.findById(project2Id)).thenReturn(Optional.of(appsOnlyConfig));

        var missingTopology = setup.setup(workspaceId);

        assertEquals(project2Id, missingTopology.reference().projectId());
        assertEquals("configure-studio", missingTopology.nextAction());
        assertEquals("DONE", missingTopology.steps().stream()
                .filter(step -> step.id().equals("runtime")).findFirst().orElseThrow().state());
        assertEquals("ACTION", missingTopology.steps().stream()
                .filter(step -> step.id().equals("studio")).findFirst().orElseThrow().state());
    }

    @Test void autoConfigureStudioCreatesConfigurationAndFreezesTopology() {
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(lab));
        when(configurations.findById(projectId)).thenReturn(Optional.empty());
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("runtime_scenarios"), eq(Integer.class), eq(projectId)))
                .thenReturn(0);

        var result = setup.autoConfigureStudio(workspaceId, assignmentId);

        assertTrue(result.studioFrozen());
        assertEquals(3, result.blockCount());
        assertEquals(2, result.connectionCount());
        assertEquals(5, result.topologyRevision());
        assertNotNull(lab.getStudioTopologySnapshot());
        assertTrue(Boolean.TRUE.equals(lab.getRequireRuntimeTrace()));
        verify(assignments).saveAndFlush(lab);
    }

    @Test void autoConfigureCollapsesRoutingServiceIntoAConnectionController() throws Exception {
        var elements = mock(ModelElementRepository.class);
        var relationships = mock(ModelRelationshipRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "elements", elements);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "relationships", relationships);
        ModelElement orders = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("orders").build();
        ModelElement payment = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("payment").build();
        ModelElement route = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("orders-payment-route").build();
        ModelElement ordersCode = ModelElement.builder().modelVersion(model).elementType("CLASS").name("Program")
                .languageStack("CSHARP_DOTNET").scope("orders/Program.cs").build();
        ModelElement paymentCode = ModelElement.builder().modelVersion(model).elementType("CLASS").name("Program")
                .languageStack("CSHARP_DOTNET").scope("payment/Program.cs").build();
        ModelElement routeCode = ModelElement.builder().modelVersion(model).elementType("COMPONENT").name("RouteController")
                .languageStack("CSHARP_DOTNET")
                .properties(mapper.readTree("{\"workerProjectPath\":\"repo/orders-payment-route/RouteController.csproj\"}"))
                .build();
        orders.setProperties(mapper.readTree("{\"ports\":[\"8080\"]}"));
        payment.setProperties(mapper.readTree("{\"ports\":[\"8081:9090\"]}"));
        route.setProperties(mapper.readTree("{\"ports\":[\"8080/tcp\"]}"));
        when(elements.findByModelVersionId(modelId)).thenReturn(List.of(
                orders, payment, route, ordersCode, paymentCode, routeCode));
        when(relationships.findByModelVersionId(modelId)).thenReturn(List.of(
                ModelRelationship.builder().sourceElement(orders).targetElement(route).relationType("HTTP").build(),
                ModelRelationship.builder().sourceElement(route).targetElement(payment).relationType("HTTP").build()));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(lab));
        when(configurations.findById(projectId)).thenReturn(Optional.empty());
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jdbc.queryForObject(contains("runtime_scenarios"), eq(Integer.class), eq(projectId))).thenReturn(0);

        var result = setup.autoConfigureStudio(workspaceId, assignmentId);

        assertEquals(2, result.blockCount());
        assertEquals(1, result.connectionCount());
        var connection = lab.getStudioTopologySnapshot().path("connections").get(0);
        assertEquals("orders", connection.path("from").asText());
        assertEquals("payment", connection.path("to").asText());
        assertEquals("orders-payment-route", connection.path("controllerService").asText());
        verify(jdbc, atLeastOnce()).update(contains("INSERT INTO runtime_configurations"),
                eq(projectId), eq(snapshotId), eq(modelId), argThat(profile ->
                        profile.toString().contains("\"orders\":{\"runtime\":\"dotnet8-linux-x64-glibc\",\"containerPort\":8080")
                                && profile.toString().contains("\"payment\":{\"runtime\":\"dotnet8-linux-x64-glibc\",\"containerPort\":9090")
                                && profile.toString().contains("\"orders-payment-route\":{\"runtime\":\"dotnet8-linux-x64-glibc\",\"containerPort\":8080")));
    }

    @Test void autoConfigureExcludesNonComposeServiceNames() {
        var elements = mock(ModelElementRepository.class);
        var relationships = mock(ModelRelationshipRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "elements", elements);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "relationships", relationships);
        ModelElement orders = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("order-service").build();
        ModelElement syntheticDb = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("DATABASE").name("testseed @ postgres-db").build();
        when(elements.findByModelVersionId(modelId)).thenReturn(List.of(orders, syntheticDb));
        when(relationships.findByModelVersionId(modelId)).thenReturn(List.of());
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(lab));
        when(configurations.findById(projectId)).thenReturn(Optional.empty());
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jdbc.queryForObject(contains("runtime_scenarios"), eq(Integer.class), eq(projectId))).thenReturn(0);

        var result = setup.autoConfigureStudio(workspaceId, assignmentId);

        assertEquals(1, result.blockCount());
        assertFalse(lab.getStudioTopologySnapshot().toString().contains("testseed @ postgres-db"));
        verify(jdbc, atLeastOnce()).update(contains("INSERT INTO runtime_configurations"),
                eq(projectId), eq(snapshotId), eq(modelId), argThat(profile ->
                        profile.toString().contains("order-service") && !profile.toString().contains("testseed @ postgres-db")));
    }

    @Test void draftLabNeverReportsTopologyFrozen() {
        lab.setLabOrder(null);
        lab.setStudioTopologySnapshot(mapper.createObjectNode().put("version", 1));

        var result = setup.setup(workspaceId);

        assertFalse(result.labs().get(0).published());
        assertFalse(result.labs().get(0).topologyFrozen());
        assertEquals("DRAFT", result.labs().get(0).state());
    }

    @Test void autoConfigureStudioDisablesScaleOnStatefulContainersAndSeedsDefaultExercise() {
        var elements = mock(ModelElementRepository.class);
        var relationships = mock(ModelRelationshipRepository.class);
        var exercises = mock(com.mavis.common.repository.LabStudioExerciseRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "elements", elements);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "relationships", relationships);
        org.springframework.test.util.ReflectionTestUtils.setField(setup, "labStudioExercises", exercises);

        ModelElement gw = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("api-gateway").languageStack("Java").build();
        ModelElement db = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("DATABASE").name("sandbox-postgres").build();
        ModelElement broker = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .elementType("SERVICE_CONTAINER").name("sandbox-kafka").build();
        when(elements.findByModelVersionId(modelId)).thenReturn(List.of(gw, db, broker));
        when(relationships.findByModelVersionId(modelId)).thenReturn(List.of());
        when(exercises.findByAssignmentId(assignmentId)).thenReturn(Optional.empty());
        when(exercises.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(lab));
        when(configurations.findById(projectId)).thenReturn(Optional.empty());
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("runtime_scenarios"), eq(Integer.class), eq(projectId)))
                .thenReturn(0);

        setup.autoConfigureStudio(workspaceId, assignmentId);

        var blocks = lab.getStudioTopologySnapshot().path("blocks");
        assertEquals(3, blocks.size());
        assertTrue(blocks.get(0).path("canScale").asBoolean(), "api-gateway should be scalable");
        assertFalse(blocks.get(1).path("canScale").asBoolean(), "sandbox-postgres must not be scalable");
        assertFalse(blocks.get(2).path("canScale").asBoolean(), "sandbox-kafka must not be scalable");
        assertNotNull(lab.getStudioExerciseSnapshot(), "default exercise should be auto-seeded");
        assertEquals("/api/gateway/orders",
                lab.getStudioExerciseSnapshot().path("baselineRequests").get(0).path("path").asText());
    }

    private RuntimeConfiguration configuration(boolean withTopology) {
        ObjectNode profile = mapper.createObjectNode();
        var applications = profile.putObject("applications");
        applications.putObject("orders").put("runtime", "dotnet8-linux-x64-glibc");
        applications.putObject("payment").put("runtime", "dotnet8-linux-x64-glibc");
        if (withTopology) {
            var topology = profile.putObject("studioTopology").put("version", 1);
            var blocks = topology.putArray("blocks");
            blocks.addObject().put("service", "orders");
            blocks.addObject().put("service", "payment");
            var connections = topology.putArray("connections");
            connections.addObject().put("from", "orders").put("to", "payment")
                    .put("controllerService", "orders-payment-route");
        }
        RuntimeConfiguration configuration = new RuntimeConfiguration();
        configuration.setProjectId(projectId);
        configuration.setSourceSnapshotId(snapshotId);
        configuration.setModelVersionId(modelId);
        configuration.setProfile(profile);
        configuration.setRevision(4);
        return configuration;
    }
}
