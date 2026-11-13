package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseQuizServiceTest {
    @Test void readsPassStatusForTheVersionReturnedToTheStudent() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        var student = User.builder().id(studentId).role(Role.builder().code("STUDENT").build()).build();
        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var json = new ObjectMapper();
        var service = new CourseQuizService(assignments, access, policy, jdbc, json);
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(student);
        var row = mock(java.sql.ResultSet.class);
        when(row.getInt(1)).thenReturn(1);
        when(row.getString(2)).thenReturn("Lesson");
        when(row.getInt(3)).thenReturn(70);
        when(row.getString(4)).thenReturn("[]");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(row, 0)));
        when(policy.hasPassedQuizVersion(labId, studentId, 1)).thenReturn(true);

        var quiz = service.get(workspaceId, labId);
        assertEquals(1, quiz.version());
        assertTrue(quiz.passed());
        verify(policy, never()).hasPassedCurrentQuiz(any(), any());
    }

    @Test void gradesAtTheExactThresholdWithoutRoundingUp() {
        assertTrue(CourseQuizService.passes(7, 10, 70));
        assertFalse(CourseQuizService.passes(16, 23, 70));
        assertTrue(CourseQuizService.passes(17, 23, 70));
    }

    @Test void gradesOnlyCompleteAndValidSelections() {
        var questions = List.of(new CourseQuizService.Question("Boundary?", List.of("API", "Database"), 1));
        assertEquals(1, CourseQuizService.score(questions, List.of(1)));
        assertEquals(0, CourseQuizService.score(questions, List.of(0)));
        assertThrows(BusinessException.class, () -> CourseQuizService.score(questions, List.of()));
        assertThrows(BusinessException.class, () -> CourseQuizService.score(questions, List.of(2)));
    }
}
