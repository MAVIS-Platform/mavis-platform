package com.mavis.bootstrap;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import com.mavis.platform.workspace.service.CourseAccessService;
import com.mavis.platform.workspace.service.CourseProgressionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.DriverManager;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "MAVIS_MIGRATION_TEST_JDBC_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class CourseAccessPostgresTest {
    @Test
    void passkeyLifecycleAndVerifiedResultsKeepProgressScopedToTheStudent() throws Exception {
        withDatabase((jdbc, tx) -> {
            UUID teacherId = user(jdbc, "LECTURER", "teacher@example.invalid");
            UUID studentId = user(jdbc, "STUDENT", "student@example.invalid");
            UUID workspaceId = id(jdbc, """
                    INSERT INTO workspaces(name, created_by, course_mode) VALUES ('Java labs', ?, true) RETURNING id
                    """, teacherId);
            var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").courseMode(true).build();
            var student = User.builder().id(studentId).role(Role.builder().code("STUDENT").build()).build();
            var teacher = User.builder().id(teacherId).role(Role.builder().code("LECTURER").build()).build();
            var access = mock(AccessPolicyService.class);
            var workspaces = mock(WorkspaceRepository.class);
            var assignments = mock(AssignmentRepository.class);
            when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
            when(workspaces.findLockedById(workspaceId)).thenAnswer(call -> {
                jdbc.queryForObject("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", UUID.class, workspaceId);
                return Optional.of(workspace);
            });
            var policy = new CourseLabPolicy(jdbc);
            var courses = new CourseAccessService(access, workspaces, assignments, policy, jdbc,
                    mock(LabReferenceArchive.class));
            var progression = new CourseProgressionService(jdbc, workspaces);
            var first = lab(jdbc, workspace, teacherId, 1);
            var second = lab(jdbc, workspace, teacherId, 2);
            when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                    .thenReturn(List.of(first, second));

            when(access.requireCurrentActiveUser()).thenReturn(teacher);
            var oldKey = tx.execute(status -> courses.issue(workspaceId, 1));
            var key = tx.execute(status -> courses.issue(workspaceId, 2));
            assertNotEquals(oldKey.code(), key.code());
            assertEquals(64, jdbc.queryForObject("SELECT length(digest) FROM course_passkeys", Integer.class));
            assertTrue(courses.keyStatus(workspaceId).active());
            assertEquals(ErrorCode.FORBIDDEN, assertThrows(BusinessException.class,
                    () -> courses.redeem(key.code(), UUID.randomUUID())).getErrorCode());
            when(access.requireCurrentActiveUser()).thenReturn(student);
            assertFalse(policy.canOpen(first, student));
            assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                    () -> courses.redeem(oldKey.code(), UUID.randomUUID())).getErrorCode());
            UUID requestId = UUID.randomUUID();
            try (var pool = Executors.newFixedThreadPool(2)) {
                Callable<UUID> redeem = () -> tx.execute(status -> courses.redeem(key.code(), requestId)).workspaceId();
                var firstAttempt = pool.submit(redeem);
                var retry = pool.submit(redeem);
                assertEquals(workspaceId, firstAttempt.get(10, TimeUnit.SECONDS));
                assertEquals(workspaceId, retry.get(10, TimeUnit.SECONDS));
            }
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workspace_members WHERE user_id = ?",
                    Integer.class, studentId));
            assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                    () -> tx.execute(status -> courses.redeem(key.code(), UUID.randomUUID()))).getErrorCode());
            when(access.requireCurrentActiveUser()).thenReturn(teacher);
            tx.executeWithoutResult(status -> courses.revoke(workspaceId));
            when(access.requireCurrentActiveUser()).thenReturn(student);
            assertFalse(courses.keyStatus(workspaceId).active());
            assertEquals(workspaceId, courses.redeem(key.code(), requestId).workspaceId());
            assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                    () -> tx.execute(status -> courses.redeem(key.code(), UUID.randomUUID()))).getErrorCode());
            when(access.requireCurrentActiveUser()).thenReturn(teacher);
            var expiring = tx.execute(status -> courses.issue(workspaceId, 1));
            when(access.requireCurrentActiveUser()).thenReturn(student);
            jdbc.update("UPDATE course_passkeys SET expires_at = now() - interval '1 minute'");
            assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                    () -> tx.execute(status -> courses.redeem(expiring.code(), UUID.randomUUID()))).getErrorCode());
            assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action LIKE 'COURSE_PASSKEY_%'", Integer.class));
            assertTrue(policy.canOpen(first, student));
            assertFalse(policy.canOpen(second, student));
            assertEquals("ENROLLED", courses.roadmap(workspaceId).enrollmentStatus());
            assertEquals(List.of("UNLOCKED", "LOCKED"), states(courses.roadmap(workspaceId)));

            workspace.setStatus("ARCHIVED");
            assertFalse(policy.canOpen(second, student));
            assertEquals("COURSE_ARCHIVED", courses.roadmap(workspaceId).labs().getLast().reason());
            workspace.setStatus("ACTIVE");
            UUID otherStudentId = user(jdbc, "STUDENT", "other-student@example.invalid");
            var otherStudent = User.builder().id(otherStudentId)
                    .role(Role.builder().code("STUDENT").build()).build();
            jdbc.update("""
                    INSERT INTO workspace_members(workspace_id, user_id, member_role) VALUES (?, ?, 'STUDENT')
                    """, workspaceId, otherStudentId);
            UUID lockedSubmission = submission(jdbc, second, otherStudentId);
            jdbc.update("""
                    INSERT INTO submission_reviews(submission_id, lecturer_id, status, score, summary)
                    VALUES (?, ?, 'GRADED', 100, 'Fixture review for a locked Lab')
                    """, lockedSubmission, teacherId);
            assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                    () -> tx.executeWithoutResult(status -> progression.recordFinalizedResult(lockedSubmission, 1, true)))
                    .getErrorCode());

            UUID submission = submission(jdbc, first, studentId);
            jdbc.update("""
                    INSERT INTO submission_reviews(submission_id, lecturer_id, status, summary)
                    VALUES (?, ?, 'DRAFT', 'Pending checks')
                    """, submission, teacherId);
            assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                    () -> tx.executeWithoutResult(status -> progression.recordFinalizedResult(submission, 1, true)))
                    .getErrorCode());
            jdbc.update("UPDATE submission_reviews SET status = 'GRADED', score = 60 WHERE submission_id = ?", submission);
            tx.executeWithoutResult(status -> progression.recordFinalizedResult(submission, 1, false));
            assertFalse(policy.canOpen(second, student));
            assertEquals("IN_PROGRESS", courses.roadmap(workspaceId).enrollmentStatus());
            jdbc.update("UPDATE submission_reviews SET revision = 2, score = 90 WHERE submission_id = ?", submission);
            tx.executeWithoutResult(status -> progression.recordFinalizedResult(submission, 2, true));
            tx.executeWithoutResult(status -> progression.recordFinalizedResult(submission, 2, true));
            assertTrue(policy.canOpen(second, student));
            assertFalse(policy.canOpen(second, otherStudent));
            assertEquals(List.of("PASSED", "UNLOCKED"), states(courses.roadmap(workspaceId)));
            assertEquals(1, jdbc.queryForObject("""
                    SELECT count(*) FROM user_notifications WHERE recipient_id = ? AND event_key = ?
                    """, Integer.class, studentId, "course-lab-unlocked:" + second.getId()));
            assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                    () -> tx.executeWithoutResult(status -> progression.recordFinalizedResult(submission, 1, false)))
                    .getErrorCode());
            assertEquals(0, jdbc.queryForObject("""
                    SELECT count(*) FROM user_notifications WHERE recipient_id = ? AND event_key = ?
                    """, Integer.class, otherStudentId, "course-lab-unlocked:" + second.getId()));
            UUID finalSubmission = submission(jdbc, second, studentId);
            jdbc.update("""
                    INSERT INTO submission_reviews(submission_id, lecturer_id, status, score, summary)
                    VALUES (?, ?, 'GRADED', 95, 'Final Lab passed')
                    """, finalSubmission, teacherId);
            tx.executeWithoutResult(status -> progression.recordFinalizedResult(finalSubmission, 1, true));
            assertEquals("COMPLETED", courses.roadmap(workspaceId).enrollmentStatus());
            assertEquals(List.of("PASSED", "PASSED"), states(courses.roadmap(workspaceId)));
        });
    }

    private static List<String> states(CourseAccessService.Roadmap roadmap) {
        return roadmap.labs().stream().map(CourseAccessService.Lab::state).toList();
    }

    private static Assignment lab(JdbcTemplate jdbc, Workspace workspace, UUID lecturer, int position) {
        String title = "Lab " + position;
        UUID id = id(jdbc, """
                INSERT INTO assignments(workspace_id, created_by, title, lab_order) VALUES (?, ?, ?, ?) RETURNING id
                """, workspace.getId(), lecturer, title, position);
        return Assignment.builder().id(id).workspace(workspace).title(title).labOrder(position).build();
    }

    private static UUID submission(JdbcTemplate jdbc, Assignment lab, UUID student) {
        UUID project = id(jdbc, """
                INSERT INTO projects(workspace_id, assignment_id, owner_id, name) VALUES (?, ?, ?, 'Coursework') RETURNING id
                """, lab.getWorkspace().getId(), lab.getId(), student);
        UUID source = id(jdbc, """
                INSERT INTO source_snapshots(project_id, source_type, artifact_hash) VALUES (?, 'ZIP_UPLOAD', ?) RETURNING id
                """, project, "a".repeat(64));
        UUID model = id(jdbc, """
                INSERT INTO model_versions(project_id, source_snapshot_id) VALUES (?, ?) RETURNING id
                """, project, source);
        UUID diagram = id(jdbc, """
                INSERT INTO diagram_versions(model_version_id, notation, layout_json)
                VALUES (?, 'DEPENDENCY_GRAPH', '{}'::jsonb) RETURNING id
                """, model);
        return id(jdbc, """
                INSERT INTO submission_snapshots(assignment_id, project_id, submitted_by, source_snapshot_id,
                    model_version_id, diagram_version_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, lab.getId(), project, student, source, model, diagram);
    }

    private static UUID user(JdbcTemplate jdbc, String role, String email) {
        return id(jdbc, """
                INSERT INTO users(role_id, email, password_hash, full_name)
                SELECT id, ?, 'fixture-only', 'Fixture' FROM roles WHERE code = ? RETURNING id
                """, email, role);
    }

    private static UUID id(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.queryForObject(sql, UUID.class, args);
    }

    private void withDatabase(DatabaseTest body) throws Exception {
        var settings = new MigrationUpgradeTest();
        String name = "mavis_wf01_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(settings.adminUrl, settings.user, settings.password);
             var admin = connection.createStatement()) {
            admin.execute("CREATE DATABASE " + name);
            try {
                String url = settings.adminUrl.substring(0, settings.adminUrl.lastIndexOf('/') + 1) + name;
                settings.flyway(url, null).migrate();
                var source = new DriverManagerDataSource(url, settings.user, settings.password);
                body.run(new JdbcTemplate(source), new TransactionTemplate(new DataSourceTransactionManager(source)));
            } finally {
                admin.execute("DROP DATABASE " + name + " WITH (FORCE)");
            }
        }
    }

    @FunctionalInterface
    private interface DatabaseTest {
        void run(JdbcTemplate jdbc, TransactionTemplate tx) throws Exception;
    }
}
