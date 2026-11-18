package com.mavis.platform.workspace.service;

import com.mavis.common.entity.CourseDefinition;
import com.mavis.common.entity.CourseItem;
import com.mavis.common.entity.CourseModule;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.CourseItemRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.platform.workspace.dto.CourseEssayDtos.EssaySubmissionView;
import com.mavis.platform.workspace.dto.CourseEssayDtos.GradeEssayRequest;
import com.mavis.platform.workspace.dto.CourseEssayDtos.SubmitEssayRequest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseEssayServiceTest {
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final CourseItemRepository courseItems = mock(CourseItemRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final CourseEssayService service = new CourseEssayService(access, workspaces, courseItems, jdbc);

    @Test
    @SuppressWarnings("unchecked")
    void submitsEssayForValidCourseEssayItem() {
        UUID workspaceId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID studentId = UUID.randomUUID();

        Workspace ws = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        CourseDefinition course = CourseDefinition.builder().id(UUID.randomUUID()).workspace(ws).build();
        CourseModule module = CourseModule.builder().id(UUID.randomUUID()).course(course).build();
        CourseItem essayItem = CourseItem.builder()
                .id(itemId).module(module).itemType("ESSAY").title("Essay 1").build();

        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(studentId).fullName("Triet").email("sv@mavis.edu.vn").build());
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(ws));
        when(courseItems.findById(itemId)).thenReturn(Optional.of(essayItem));

        EssaySubmissionView savedView = new EssaySubmissionView(
                UUID.randomUUID(), workspaceId, itemId, "Essay 1",
                studentId, "Triet", "sv@mavis.edu.vn", "My essay answer",
                "SUBMITTED", null, null, null, OffsetDateTime.now(), null);
        when(jdbc.query(contains("FROM course_item_submissions s"), any(RowMapper.class),
                eq(workspaceId), eq(itemId), eq(studentId))).thenReturn(List.of(savedView));

        var result = service.submitEssay(workspaceId, itemId, new SubmitEssayRequest("My essay answer"));
        assertEquals("SUBMITTED", result.status());
        assertEquals("My essay answer", result.answerMarkdown());
        verify(jdbc).update(contains("INSERT INTO course_item_submissions"), any(), eq(workspaceId),
                eq(itemId), eq(studentId), eq("My essay answer"), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void gradesEssaySubmissionWithScoreAndFeedback() {
        UUID workspaceId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();
        UUID lecturerId = UUID.randomUUID();

        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(lecturerId).build());
        when(jdbc.update(contains("UPDATE course_item_submissions"), any(), any(), eq("GRADED"),
                eq(lecturerId), any(), eq(submissionId), eq(workspaceId))).thenReturn(1);

        EssaySubmissionView gradedView = new EssaySubmissionView(
                submissionId, workspaceId, UUID.randomUUID(), "Essay 1",
                UUID.randomUUID(), "Triet", "sv@mavis.edu.vn", "My essay answer",
                "GRADED", new BigDecimal("92.5"), "Well structured", lecturerId,
                OffsetDateTime.now(), OffsetDateTime.now());
        when(jdbc.query(contains("FROM course_item_submissions s"), any(RowMapper.class),
                eq(submissionId), eq(workspaceId))).thenReturn(List.of(gradedView));

        var result = service.gradeEssay(workspaceId, submissionId,
                new GradeEssayRequest(new BigDecimal("92.5"), "Well structured", "GRADED"));
        assertEquals("GRADED", result.status());
        assertEquals(new BigDecimal("92.5"), result.score());
        verify(jdbc).update(contains("INSERT INTO audit_logs"), eq(lecturerId), eq("COURSE_ESSAY_GRADED"),
                eq("COURSE_ITEM_SUBMISSION"), eq(submissionId));
    }

    @Test
    void rejectsSubmissionForNonEssayItem() {
        UUID workspaceId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        Workspace ws = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        CourseDefinition course = CourseDefinition.builder().id(UUID.randomUUID()).workspace(ws).build();
        CourseModule module = CourseModule.builder().id(UUID.randomUUID()).course(course).build();
        CourseItem theoryItem = CourseItem.builder()
                .id(itemId).module(module).itemType("THEORY").title("Lesson 1").build();

        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(ws));
        when(courseItems.findById(itemId)).thenReturn(Optional.of(theoryItem));

        assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                () -> service.submitEssay(workspaceId, itemId, new SubmitEssayRequest("text"))).getErrorCode());
    }
}
