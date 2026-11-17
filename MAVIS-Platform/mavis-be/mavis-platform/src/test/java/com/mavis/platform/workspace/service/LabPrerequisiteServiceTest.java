package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LabPrerequisiteServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID labA = UUID.randomUUID();
    private final UUID labB = UUID.randomUUID();
    private final Workspace workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
    private final Assignment a = Assignment.builder().id(labA).workspace(workspace).title("Lab A").labOrder(1).build();
    private final Assignment b = Assignment.builder().id(labB).workspace(workspace).title("Lab B").labOrder(2).build();

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final LabPrerequisiteService service = new LabPrerequisiteService(jdbc, assignments, access);

    @Test
    void rejectsSelfPrerequisites() {
        when(assignments.findById(labA)).thenReturn(Optional.of(a));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.replace(workspaceId, labA, List.of(labA)));

        assertEquals(ErrorCode.BAD_REQUEST, error.getErrorCode());
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsPrerequisiteCycles() {
        when(assignments.findById(labA)).thenReturn(Optional.of(a));
        when(assignments.findById(labB)).thenReturn(Optional.of(b));
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq(workspaceId)))
                .thenReturn(List.of(labA, labB));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(workspaceId))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("FROM lab_prerequisites")) return List.<Object[]>of(new Object[]{labA, labB});
            return List.of();
        });

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.replace(workspaceId, labB, List.of(labA)));

        assertEquals("LAB_PREREQUISITE_CYCLE", error.getStableCode());
        verify(access).requireWorkspaceLecturer(workspaceId);
    }

    @Test
    void replacesConfiguredPrerequisites() {
        when(assignments.findById(labA)).thenReturn(Optional.of(a));
        when(assignments.findById(labB)).thenReturn(Optional.of(b));
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq(workspaceId)))
                .thenReturn(List.of(labA, labB));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(workspaceId))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("FROM lab_prerequisites")) return List.of();
            return List.of();
        });

        var result = service.replace(workspaceId, labB, List.of(labA, labA));

        assertEquals(List.of(labA), result.prerequisiteAssignmentIds());
        verify(jdbc).update("DELETE FROM lab_prerequisites WHERE assignment_id = ?", labB);
        verify(jdbc).update(contains("INSERT INTO lab_prerequisites"), eq(labB), eq(labA));
    }

    @Test
    void listsLabsWithTheirPrerequisites() {
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq(workspaceId)))
                .thenReturn(List.of(labA, labB));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(workspaceId))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("FROM lab_prerequisites")) return List.<Object[]>of(new Object[]{labB, labA});
            return List.of();
        });

        Map<UUID, List<UUID>> byId = service.list(workspaceId).stream()
                .collect(java.util.stream.Collectors.toMap(
                        LabPrerequisiteService.LabPrerequisite::assignmentId,
                        LabPrerequisiteService.LabPrerequisite::prerequisiteAssignmentIds));

        assertEquals(List.of(labA), byId.get(labB));
        assertEquals(List.of(), byId.get(labA));
    }
}
