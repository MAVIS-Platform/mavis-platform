package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseQuizAssetServiceTest {

    @Test
    void catalogRequiresLecturerRoleAndIncludesCuratedCurriculumQuizzesAndReusableAssets() throws Exception {
        AccessPolicyService access = mock(AccessPolicyService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper mapper = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(mapper);
        CourseQuizAssetService service = new CourseQuizAssetService(access, jdbc, mapper, curriculum);

        UUID workspaceId = UUID.randomUUID();
        UUID lecturerId = UUID.randomUUID();
        User lecturer = User.builder()
                .id(lecturerId)
                .role(Role.builder().code("LECTURER").build())
                .build();
        when(access.requireCurrentActiveUser()).thenReturn(lecturer);

        UUID otherWorkspaceId = UUID.randomUUID();
        UUID quizAssetId = UUID.randomUUID();
        var reusable = new CourseQuizAssetService.ReusableQuiz(
                quizAssetId,
                otherWorkspaceId,
                "SWD392 · K19",
                "Quiz C2 Containers",
                "Quiz from earlier cohort",
                70,
                mapper.readTree("[{\"prompt\":\"Boundary?\",\"type\":\"SINGLE_CHOICE\",\"options\":[\"A\",\"B\"],\"correctOption\":0}]"),
                OffsetDateTime.now());
        when(jdbc.query(contains("FROM course_quiz_assets"), any(RowMapper.class),
                eq(lecturerId), eq(workspaceId), eq(lecturerId), eq(lecturerId)))
                .thenReturn(List.of(reusable));

        CourseQuizAssetService.CatalogView catalog = service.catalog(workspaceId);

        verify(access).requireWorkspaceLecturer(workspaceId);
        assertFalse(catalog.curriculumQuizzes().isEmpty(), "Expected curated curriculum chapters with quizzes");
        assertTrue(catalog.curriculumQuizzes().stream().anyMatch(q -> !q.questions().isEmpty()));
        assertEquals(1, catalog.reusableQuizzes().size());
        assertEquals("SWD392 · K19", catalog.reusableQuizzes().getFirst().sourceWorkspaceName());
    }
}
