package com.mavis.common.security;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class CourseLabPolicyTest {

    @Test
    void canOpenReturnsFalseWhenLabUnpublishedOrWorkspaceArchivedWithoutQuerying() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CourseLabPolicy policy = new CourseLabPolicy(jdbc);

        User student = User.builder().id(UUID.randomUUID()).build();
        Workspace active = Workspace.builder().id(UUID.randomUUID()).status("ACTIVE").build();
        Workspace archived = Workspace.builder().id(UUID.randomUUID()).status("ARCHIVED").build();

        Assignment draft = Assignment.builder().id(UUID.randomUUID()).workspace(active).labOrder(null).build();
        Assignment archivedLab = Assignment.builder().id(UUID.randomUUID()).workspace(archived).labOrder(1).build();

        assertFalse(policy.canOpen(draft, student));
        assertFalse(policy.canOpen(archivedLab, student));
        verifyNoInteractions(jdbc);
    }

    @Test
    void canOpenChecksExplicitLabPrerequisitesBeforeFallbackLabOrder() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CourseLabPolicy policy = new CourseLabPolicy(jdbc);

        UUID workspaceId = UUID.randomUUID();
        UUID studentId = UUID.randomUUID();
        UUID assignmentId = UUID.randomUUID();
        Workspace ws = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        Assignment lab = Assignment.builder().id(assignmentId).workspace(ws).labOrder(3).build();
        User student = User.builder().id(studentId).build();

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbc.queryForObject(
                sqlCaptor.capture(),
                eq(Boolean.class),
                eq(workspaceId), eq(studentId),
                eq(assignmentId), eq(assignmentId), eq(studentId),
                eq(workspaceId), eq(3), eq(studentId)))
                .thenReturn(true);

        assertTrue(policy.canOpen(lab, student));
        assertTrue(sqlCaptor.getValue().contains("lab_prerequisites"));
        assertTrue(sqlCaptor.getValue().contains("preceding.lab_order < ?"));
    }
}
