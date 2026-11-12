package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
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
    private final CourseAccessService courses = new CourseAccessService(
            access, workspaces, assignments, mock(CourseLabPolicy.class), jdbc);

    @Test
    void publishesPinnedAssignmentOnceAndEnablesGuidedCourse() {
        UUID teacherId = UUID.randomUUID();
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(teacherId).build());
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        var project = Project.builder().workspace(workspace).status("ACTIVE").build();
        var source = SourceSnapshot.builder().project(project).isPublished(true)
                .sourceType("GITHUB_COMMIT").commitSha("1".repeat(40))
                .artifactHash("a".repeat(64)).storagePath("reference.zip").build();
        assignment.setReferenceModel(ModelVersion.builder().sourceSnapshot(source).build());

        var published = courses.publish(workspaceId, assignmentId);

        assertTrue(workspace.isCourseMode());
        assertEquals(1, published.position());
        assertEquals(published, courses.publish(workspaceId, assignmentId));
        verify(jdbc).update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                teacherId, "COURSE_LAB_PUBLISHED", "ASSIGNMENT", assignmentId);
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
}
