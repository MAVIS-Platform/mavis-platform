package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseAccessServiceTest {
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID assignmentId = UUID.randomUUID();
    private final Workspace workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
    private final Assignment assignment = Assignment.builder().id(assignmentId)
            .title("Service dependencies").workspace(workspace).build();
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final LabReferenceArchive referenceArchive = mock(LabReferenceArchive.class);
    private final RuntimeConfigurationRepository configurations = mock(RuntimeConfigurationRepository.class);
    private final CourseAccessService courses = new CourseAccessService(
            access, workspaces, assignments, mock(CourseLabPolicy.class), jdbc, referenceArchive,
            configurations);

    @Test
    void publishesPinnedAssignmentOnceAndEnablesGuidedCourse() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        var project = Project.builder().workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        var source = SourceSnapshot.builder().project(project).isPublished(true)
                .sourceType("GITHUB_COMMIT").commitSha("1".repeat(40))
                .artifactHash("a".repeat(64)).storagePath("reference.zip").build();
        assignment.setReferenceModel(ModelVersion.builder().sourceSnapshot(source).build());

        var published = courses.publish(workspaceId, assignmentId);

        assertTrue(workspace.isCourseMode());
        assertEquals(1, published.position());
        assertEquals(published, courses.publish(workspaceId, assignmentId));
        verify(referenceArchive).resolve(source, true);
        verify(jdbc).update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                teacherId, "COURSE_LAB_PUBLISHED", "ASSIGNMENT", assignmentId);
    }

    @Test
    void publishFreezesPreparedStudioTopology() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        var project = Project.builder().id(UUID.randomUUID()).workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        var source = SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .isPublished(true).sourceType("GITHUB_COMMIT").commitSha("1".repeat(40))
                .artifactHash("a".repeat(64)).storagePath("reference.zip").build();
        var model = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        assignment.setReferenceModel(model);
        var profile = new ObjectMapper().createObjectNode();
        var topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject().put("service", "orders");
        topology.putArray("connections");
        var configuration = new RuntimeConfiguration();
        configuration.setProjectId(project.getId());
        configuration.setSourceSnapshotId(source.getId());
        configuration.setModelVersionId(model.getId());
        configuration.setProfile(profile);
        configuration.setRevision(5);
        when(configurations.findById(project.getId())).thenReturn(Optional.of(configuration));

        courses.publish(workspaceId, assignmentId);

        assertEquals(1, assignment.getStudioTopologySnapshot().path("version").asInt());
        assertEquals(Integer.valueOf(5), assignment.getStudioTopologyRevision());
    }

    @Test
    void republishKeepsTheFrozenTopologySnapshot() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        assignment.setLabOrder(1);
        assignment.setStudioTopologySnapshot(new ObjectMapper().createObjectNode()
                .put("version", 1).put("marker", "frozen-v1"));
        assignment.setStudioTopologyRevision(5);

        var project = Project.builder().id(UUID.randomUUID()).workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        var source = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).isPublished(true).build();
        var model = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        assignment.setReferenceModel(model);
        var profile = new ObjectMapper().createObjectNode();
        profile.putObject("studioTopology").put("version", 1).put("marker", "edited-after-freeze");
        var configuration = new RuntimeConfiguration();
        configuration.setProjectId(project.getId());
        configuration.setSourceSnapshotId(source.getId());
        configuration.setModelVersionId(model.getId());
        configuration.setProfile(profile);
        configuration.setRevision(6);
        when(configurations.findById(project.getId())).thenReturn(Optional.of(configuration));

        courses.publish(workspaceId, assignmentId);

        assertEquals("frozen-v1", assignment.getStudioTopologySnapshot().path("marker").asText());
        assertEquals(Integer.valueOf(5), assignment.getStudioTopologyRevision());
        verify(assignments, never()).save(assignment);
    }

    @Test
    void freezeRejectsMismatchedProfileEvenWhenAnOlderTopologyExists() {
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        assignment.setLabOrder(1);
        var oldTopology = new ObjectMapper().createObjectNode().put("version", 1).put("marker", "frozen");
        assignment.setStudioTopologySnapshot(oldTopology);
        assignment.setStudioTopologyRevision(5);
        var project = Project.builder().id(UUID.randomUUID()).workspace(workspace).build();
        var source = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build();
        var model = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        assignment.setReferenceModel(model);
        var configuration = new RuntimeConfiguration();
        configuration.setSourceSnapshotId(source.getId());
        configuration.setModelVersionId(UUID.randomUUID());
        configuration.setRevision(6);
        configuration.setProfile(new ObjectMapper().createObjectNode()
                .set("studioTopology", new ObjectMapper().createObjectNode().put("version", 1)));
        when(configurations.findById(project.getId())).thenReturn(Optional.of(configuration));

        var failure = assertThrows(BusinessException.class, () -> courses.freezeTopology(workspaceId, assignmentId));

        assertEquals(ErrorCode.BAD_REQUEST, failure.getErrorCode());
        assertEquals(oldTopology, assignment.getStudioTopologySnapshot());
        assertEquals(5, assignment.getStudioTopologyRevision());
        verify(assignments, never()).save(assignment);
        verifyNoInteractions(jdbc);
    }

    @Test
    void publishesTheoryOnlyLabWithoutReferenceModelWhenDescriptionPresent() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        assignment.setDescription("Chapter 1 Java fundamentals theory");
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setRequireRuntimeTrace(true);
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());

        var published = courses.publish(workspaceId, assignmentId);

        assertEquals(1, published.position());
        assertEquals(Boolean.FALSE, assignment.getRequireRuntimeTrace());
        assertEquals("THEORY_ONLY", assignment.getAiPolicy().path("labTier").asText());
        assertTrue(assignment.getAiPolicy().path("skipQuiz").asBoolean());
        assertTrue(workspace.isCourseMode());
        verifyNoInteractions(referenceArchive);
    }

    @Test
    void publishAutoDerivesTheoryQuizWhenPublishedQuizExistsWithoutStudio() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        assignment.setDescription("Architecture theory with Quiz");
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setRequireRuntimeTrace(false);
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        when(jdbc.queryForObject(
                "SELECT coalesce(max(version), 0) FROM course_quizzes WHERE assignment_id = ?",
                Integer.class,
                assignmentId)).thenReturn(1);

        courses.publish(workspaceId, assignmentId);

        assertEquals("THEORY_QUIZ", assignment.getAiPolicy().path("labTier").asText());
        assertFalse(assignment.getAiPolicy().path("skipQuiz").asBoolean());
        assertEquals(Boolean.FALSE, assignment.getRequireRuntimeTrace());
    }

    @Test
    void refusesUnpinnedReferenceAndPasskeyBeforePublishing() {
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));

        assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                () -> courses.publish(workspaceId, assignmentId)).getErrorCode());
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> courses.issue(workspaceId, 24)).getErrorCode());
        assertFalse(workspace.isCourseMode());
        assertNull(assignment.getLabOrder());
        verifyNoInteractions(jdbc);
    }

    @Test
    void forbidsClassChangesBeforeTouchingAssignmentOrPasskey() {
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(access).requireWorkspaceLecturer(workspaceId);

        assertEquals(ErrorCode.FORBIDDEN, assertThrows(BusinessException.class,
                () -> courses.publish(workspaceId, assignmentId)).getErrorCode());
        assertEquals(ErrorCode.FORBIDDEN, assertThrows(BusinessException.class,
                () -> courses.issue(workspaceId, 24)).getErrorCode());
        verifyNoInteractions(assignments, jdbc);
    }

    @Test
    void freezeRejectsSessionThatIsNotLinkedToTheLab() {
        var runtimeSessions = mock(com.mavis.common.repository.RuntimeSessionRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(courses, "runtimeSessions", runtimeSessions);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        assignment.setLabOrder(1);
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        var sessionId = UUID.randomUUID();
        var session = com.mavis.common.entity.RuntimeSession.builder().id(sessionId).build();
        when(runtimeSessions.findById(sessionId)).thenReturn(Optional.of(session));

        assertThrows(BusinessException.class,
                () -> courses.freezeTopology(workspaceId, assignmentId, sessionId));
    }

    @Test
    void freezeRequiresValidationSessionForAStudioExercise() {
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        assignment.setLabOrder(1);
        assignment.setRequireRuntimeTrace(true);
        assignment.setStudioExerciseSnapshot(new ObjectMapper().createObjectNode());
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));

        var error = assertThrows(BusinessException.class,
                () -> courses.freezeTopology(workspaceId, assignmentId));

        assertEquals("STUDIO_VALIDATION_REQUIRED", error.getStableCode());
    }

    @Test
    void republishPreservesFrozenTopologyUntilExplicitFreeze() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        var project = Project.builder().id(UUID.randomUUID()).workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        var source = SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .isPublished(true).sourceType("GITHUB_COMMIT").commitSha("1".repeat(40))
                .artifactHash("a".repeat(64)).storagePath("reference.zip").build();
        var model = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        assignment.setReferenceModel(model);

        var mapper = new ObjectMapper();
        var initialProfile = mapper.createObjectNode();
        var initialTopology = initialProfile.putObject("studioTopology").put("version", 1);
        initialTopology.putArray("blocks").addObject().put("service", "orders");
        initialTopology.putArray("connections");
        var configuration = new RuntimeConfiguration();
        configuration.setProjectId(project.getId());
        configuration.setSourceSnapshotId(source.getId());
        configuration.setModelVersionId(model.getId());
        configuration.setProfile(initialProfile);
        configuration.setRevision(5);
        when(configurations.findById(project.getId())).thenReturn(Optional.of(configuration));

        courses.publish(workspaceId, assignmentId);
        assertEquals(Integer.valueOf(5), assignment.getStudioTopologyRevision());
        assertEquals("orders", assignment.getStudioTopologySnapshot().path("blocks").get(0).path("service").asText());

        var updatedProfile = mapper.createObjectNode();
        var updatedTopology = updatedProfile.putObject("studioTopology").put("version", 1);
        updatedTopology.putArray("blocks").addObject().put("service", "B-orders");
        updatedTopology.putArray("connections");
        configuration.setProfile(updatedProfile);
        configuration.setRevision(9);

        courses.publish(workspaceId, assignmentId);
        assertEquals(Integer.valueOf(5), assignment.getStudioTopologyRevision());
        assertEquals("orders", assignment.getStudioTopologySnapshot().path("blocks").get(0).path("service").asText());

        courses.freezeTopology(workspaceId, assignmentId);
        assertEquals(Integer.valueOf(9), assignment.getStudioTopologyRevision());
        assertEquals("B-orders", assignment.getStudioTopologySnapshot().path("blocks").get(0).path("service").asText());
    }

    @Test
    void freezeRejectsMismatchedModelSourceOrUnverifiedSession() {
        var runtimeSessions = mock(com.mavis.common.repository.RuntimeSessionRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(courses, "runtimeSessions", runtimeSessions);
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        assignment.setLabOrder(1);

        var project = Project.builder().id(UUID.randomUUID()).workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        var source = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build();
        var otherSource = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build();
        var model = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        var otherModel = ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(source).build();
        assignment.setReferenceModel(model);

        var mapper = new ObjectMapper();
        var profile = mapper.createObjectNode();
        var topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject().put("service", "orders");
        topology.putArray("connections");
        var configuration = new RuntimeConfiguration();
        configuration.setProjectId(project.getId());
        configuration.setSourceSnapshotId(source.getId());
        configuration.setModelVersionId(model.getId());
        configuration.setProfile(profile);
        configuration.setRevision(6);
        when(configurations.findById(project.getId())).thenReturn(Optional.of(configuration));

        UUID wrongModelSessionId = UUID.randomUUID();
        when(runtimeSessions.findById(wrongModelSessionId)).thenReturn(Optional.of(
                com.mavis.common.entity.RuntimeSession.builder().id(wrongModelSessionId)
                        .assignment(assignment).modelVersion(otherModel).sourceSnapshot(source).build()));
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> courses.freezeTopology(workspaceId, assignmentId, wrongModelSessionId)).getErrorCode());

        UUID wrongSourceSessionId = UUID.randomUUID();
        when(runtimeSessions.findById(wrongSourceSessionId)).thenReturn(Optional.of(
                com.mavis.common.entity.RuntimeSession.builder().id(wrongSourceSessionId)
                        .assignment(assignment).modelVersion(model).sourceSnapshot(otherSource).build()));
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> courses.freezeTopology(workspaceId, assignmentId, wrongSourceSessionId)).getErrorCode());

        UUID unverifiedSessionId = UUID.randomUUID();
        when(runtimeSessions.findById(unverifiedSessionId)).thenReturn(Optional.of(
                com.mavis.common.entity.RuntimeSession.builder().id(unverifiedSessionId)
                        .assignment(assignment).modelVersion(model).sourceSnapshot(source).build()));
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> courses.freezeTopology(workspaceId, assignmentId, unverifiedSessionId)).getErrorCode());

        UUID verifiedSessionId = UUID.randomUUID();
        var plan = mapper.createObjectNode();
        plan.putArray("infrastructureActions").addObject().put("action", "SCALE").put("service", "orders").put("replicas", 2);
        var receipt = mapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("spanId", "s1");
        var action = receipt.putArray("infrastructureActions").addObject()
                .put("action", "SCALE").put("service", "orders")
                .put("replicasBefore", 1).put("replicasAfter", 2).put("confirmed", true);
        action.putObject("metricsBefore");
        action.putObject("metricsAfter");
        when(runtimeSessions.findById(verifiedSessionId)).thenReturn(Optional.of(
                com.mavis.common.entity.RuntimeSession.builder().id(verifiedSessionId)
                        .assignment(assignment).modelVersion(model).sourceSnapshot(source)
                        .executionStatus("COMPLETED").scenarioStatus("PASSED")
                        .evidenceStatus("AVAILABLE").cleanupStatus("CONFIRMED")
                        .traceStatus("COMPLETE").sandboxEnforcementConfirmed(true)
                        .receiptDigest("sha256:" + "f".repeat(64))
                        .scenarioConfig(plan).runnerReceiptJson(receipt).build()));

        var frozen = courses.freezeTopology(workspaceId, assignmentId, verifiedSessionId);
        assertEquals(Integer.valueOf(6), assignment.getStudioTopologyRevision());
        assertEquals(1, frozen.position());
    }

    @Test
    @SuppressWarnings("unchecked")
    void supportsFullPasskeyCrudAndCaseInsensitiveRedemption() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(jdbc.queryForList(contains("SELECT id FROM course_passkeys WHERE digest = ?"),
                eq(UUID.class), any())).thenReturn(List.of());

        var created = courses.createPasskey(workspaceId,
                new CourseAccessService.CreatePasskeyRequest("JAVA2026", "Java Class", 720, 200));

        assertTrue(workspace.isCourseMode());
        assertEquals("JAVA2026", created.code());
        assertEquals("Java Class", created.label());
        assertTrue(created.active());

        when(jdbc.query(contains("FROM course_passkeys"), any(RowMapper.class),
                eq(created.id()), eq(workspaceId))).thenReturn(List.of(created));
        var updated = courses.updatePasskey(workspaceId, created.id(),
                new CourseAccessService.UpdatePasskeyRequest("JAVA2026-V2", "Updated Label", 48, 150, false));
        assertEquals("JAVA2026-V2", updated.code());
        assertEquals("Updated Label", updated.label());
        assertFalse(updated.active());

        when(jdbc.update(contains("DELETE FROM course_passkeys"), eq(created.id()), eq(workspaceId))).thenReturn(1);
        assertDoesNotThrow(() -> courses.deletePasskey(workspaceId, created.id()));

        UUID studentId = UUID.randomUUID();
        Role studentRole = Role.builder().code("STUDENT").build();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(studentId).role(studentRole).build());
        when(jdbc.queryForObject(contains("FROM auth_rate_limits"), eq(Boolean.class), any())).thenReturn(false);
        when(jdbc.queryForList(contains("SELECT workspace_id FROM course_passkeys WHERE digest = ?"),
                eq(UUID.class), any()))
                .thenReturn(List.of())
                .thenReturn(List.of(workspaceId));
        when(jdbc.queryForObject(contains("SELECT EXISTS (SELECT 1 FROM course_passkeys"),
                eq(Boolean.class), eq(workspaceId), any())).thenReturn(true);
        when(jdbc.update(contains("INSERT INTO workspace_members"), eq(workspaceId), eq(studentId),
                any(), any())).thenReturn(1);

        var enrolled = courses.redeem("java2026", UUID.randomUUID());
        assertEquals(workspaceId, enrolled.workspaceId());
        verify(jdbc).update(contains("UPDATE course_passkeys SET used_count = used_count + 1"),
                eq(workspaceId), any());
    }

}
