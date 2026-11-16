package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.Workspace;
import com.mavis.common.repository.AssignmentRepository;
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
