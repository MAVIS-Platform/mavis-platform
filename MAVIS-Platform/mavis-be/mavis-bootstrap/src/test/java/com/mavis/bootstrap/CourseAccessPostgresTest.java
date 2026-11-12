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
import com.mavis.platform.workspace.service.CourseAccessService;
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
    void passkeyLifecycleEnrollsOnceAndUnlocksOnlyTheFirstLab() throws Exception {
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
            var courses = new CourseAccessService(access, workspaces, assignments, policy, jdbc);
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
