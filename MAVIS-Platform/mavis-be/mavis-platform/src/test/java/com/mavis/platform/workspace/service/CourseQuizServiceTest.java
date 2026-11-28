package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.SubmissionSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
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
        assertEquals("PASSED", quiz.latestStatus());
        assertTrue(quiz.runtimeUnlocked());
        verify(policy, never()).hasPassedCurrentQuiz(any(), any());
    }

    @Test void draftReadsAssignmentWithoutTakingAWriteLock() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, new ObjectMapper());
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        var row = mock(java.sql.ResultSet.class);
        when(row.getString(1)).thenReturn("Lesson");
        when(row.getInt(2)).thenReturn(80);
        when(row.getString(3)).thenReturn("[{\"prompt\":\"Q\",\"options\":[\"A\",\"B\"],\"correctOption\":0}]");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(labId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(row, 0)));

        var draft = service.draft(workspaceId, labId);

        assertEquals(80, draft.passPercent());
        assertEquals(1, draft.questions().size());
        verify(assignments).findById(labId);
        verify(assignments, never()).findLockedById(any());
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

    @Test void curriculumManifestCoversAll54ChaptersAnd216ValidatedQuestions() throws Exception {
        var curriculum = new CourseCurriculum(new ObjectMapper());
        var previews = curriculum.previews();
        assertEquals(54, previews.size());
        assertEquals(30, previews.stream().filter(p -> "Java".equals(p.track())).count());
        assertEquals(24, previews.stream().filter(p -> "C#".equals(p.track())).count());

        int totalQuestions = 0;
        for (var preview : previews) {
            assertNotNull(preview.sources());
            assertFalse(preview.sources().isEmpty(), "Missing sources for " + preview.id());
            assertTrue(preview.sources().stream().allMatch(s -> s.url() != null && s.url().startsWith("https://")));
            var publish = curriculum.quizFor(preview.id());
            assertEquals(4, publish.questions().size(), "Expected 4 questions for " + preview.id());
            totalQuestions += publish.questions().size();
            for (var q : publish.questions()) {
                assertFalse(q.prompt().isBlank());
                assertTrue(q.options().size() >= 2 && q.options().size() <= 8);
                assertNotNull(q.correctOption());
                assertTrue(q.correctOption() >= 0 && q.correctOption() < q.options().size());
                assertTrue(publish.lesson().contains(preview.sources().getFirst().url()));
            }
        }
        assertEquals(216, totalQuestions);
    }

    @Test void publishCurriculumReusesMatchingVersionAndBumpsWhenChanged() {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();

        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, new ObjectMapper());
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));

        var request = new CourseQuizService.Publish(
                "Clean boundary lesson",
                null,
                List.of(new CourseQuizService.Question("Shared DB?", List.of("Allow", "Avoid"), 1))
        );

        // 1. Idempotent curriculum republish reuses v1 when content matches latest
        when(jdbc.queryForList(contains("SELECT version FROM course_quizzes"), eq(Integer.class),
                eq(labId), eq(modelId), eq("Clean boundary lesson"), eq(70), anyString(), eq(labId)))
                .thenReturn(List.of(1));

        var reused = service.publishCurriculum(workspaceId, labId, request);
        assertEquals(1, reused.version());
        assertEquals(70, reused.passPercent());
        verify(jdbc, never()).update(contains("INSERT INTO course_quizzes"), any(), any(), any(), any(), any(), any());

        // 2. Modified publish inserts version 2 (max + 1)
        when(jdbc.queryForList(contains("SELECT version FROM course_quizzes"), eq(Integer.class),
                any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(jdbc.queryForObject(contains("coalesce(max(version), 0) + 1"), eq(Integer.class), eq(labId)))
                .thenReturn(2);

        var modified = new CourseQuizService.Publish(
                "Updated boundary lesson",
                80,
                List.of(new CourseQuizService.Question("API contract?", List.of("Versioned", "Direct DB"), 0))
        );
        var bumped = service.publishCurriculum(workspaceId, labId, modified);
        assertEquals(2, bumped.version());
        assertEquals(80, bumped.passPercent());
        verify(jdbc).update(contains("INSERT INTO course_quizzes"), eq(labId), eq(2), eq(modelId),
                eq("Updated boundary lesson"), eq(80), anyString());
    }

    @Test void submitHandlesNeedsRetryIdempotentReplayAndStaleVersionConflict() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        var attemptId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        var student = User.builder().id(studentId).role(Role.builder().code("STUDENT").build()).build();

        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, new ObjectMapper());
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(student);

        // 1. Failing attempt -> NEEDS_RETRY
        when(jdbc.query(contains("FROM course_quiz_attempts"), any(RowMapper.class),
                eq(labId), eq(studentId), eq(attemptId))).thenReturn(List.of());
        var row = mock(java.sql.ResultSet.class);
        when(row.getInt(1)).thenReturn(2);
        when(row.getString(2)).thenReturn("Lesson v2");
        when(row.getInt(3)).thenReturn(70);
        when(row.getString(4)).thenReturn("""
                [
                  {"prompt":"Q1","options":["A","B"],"correctOption":0},
                  {"prompt":"Q2","options":["A","B"],"correctOption":1}
                ]""");
        when(jdbc.query(contains("FROM course_quizzes"), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(row, 0)));

        var failedResult = service.submit(workspaceId, labId, new CourseQuizService.Submit(attemptId, 2, List.of(1, 0)));
        assertEquals("NEEDS_RETRY", failedResult.status());
        assertEquals(0, failedResult.correctCount());
        assertEquals(2, failedResult.totalQuestions());
        verify(jdbc).update(contains("INSERT INTO course_quiz_attempts"), eq(labId), eq(2), eq(studentId),
                eq(attemptId), eq("[1,0]"), eq(0), eq(false));
        verify(jdbc).update(contains("INSERT INTO audit_logs"), eq(studentId), eq(labId), eq(attemptId),
                eq(2), eq(0), eq(2), eq("NEEDS_RETRY"));

        // 2. Stale quiz version -> CONFLICT
        var conflict = assertThrows(BusinessException.class, () ->
                service.submit(workspaceId, labId, new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1))));
        assertEquals(ErrorCode.CONFLICT, conflict.getErrorCode());

        // 3. Idempotent retry with identical attemptId, version, and answers returns stored Result
        var prevRow = mock(java.sql.ResultSet.class);
        when(prevRow.getInt(1)).thenReturn(2);
        when(prevRow.getString(2)).thenReturn("[0,1]");
        when(prevRow.getInt(3)).thenReturn(2);
        when(prevRow.getBoolean(4)).thenReturn(true);
        String submittedQuestions = row.getString(4);
        when(prevRow.getString(5)).thenReturn(submittedQuestions);
        when(row.getInt(1)).thenReturn(3);
        when(row.getString(4)).thenReturn("""
                [{"prompt":"Unattempted question","options":["A","B"],"correctOption":1}]
                """);
        var replayAttemptId = UUID.randomUUID();
        when(jdbc.query(contains("FROM course_quiz_attempts"), any(RowMapper.class),
                eq(labId), eq(studentId), eq(replayAttemptId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(prevRow, 0)));

        var replayed = service.submit(workspaceId, labId, new CourseQuizService.Submit(replayAttemptId, 2, List.of(0, 1)));
        assertEquals("PASSED", replayed.status());
        assertEquals(2, replayed.correctCount());
        assertEquals(2, replayed.totalQuestions());
        assertEquals(2, replayed.questionResults().size());

        // 4. Conflicting replay with different answers for same attemptId -> CONFLICT
        var mismatch = assertThrows(BusinessException.class, () ->
                service.submit(workspaceId, labId, new CourseQuizService.Submit(replayAttemptId, 2, List.of(1, 0))));
        assertEquals(ErrorCode.CONFLICT, mismatch.getErrorCode());
    }

    @Test void republishingQuizVersionRelocksCurrentLabWhilePriorSubmissionEvidenceStaysFrozen() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        var json = new ObjectMapper();
        var frozenEvidence = json.createObjectNode().put("status", "PASSED").put("quizVersion", 1);
        var snapshot = SubmissionSnapshot.builder().id(UUID.randomUUID()).courseQuizEvidence(frozenEvidence).build();

        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        var student = User.builder().id(studentId).role(Role.builder().code("STUDENT").build()).build();

        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, json);
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(student);

        // Version 2 becomes active; student only passed Version 1 -> current v2 read reports passed = false
        var rowV2 = mock(java.sql.ResultSet.class);
        when(rowV2.getInt(1)).thenReturn(2);
        when(rowV2.getString(2)).thenReturn("Updated v2");
        when(rowV2.getInt(3)).thenReturn(70);
        when(rowV2.getString(4)).thenReturn("[]");
        when(jdbc.query(contains("FROM course_quizzes"), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(rowV2, 0)));
        when(policy.hasPassedQuizVersion(labId, studentId, 1)).thenReturn(true);
        when(policy.hasPassedQuizVersion(labId, studentId, 2)).thenReturn(false);

        var quizV2 = service.get(workspaceId, labId);
        assertEquals(2, quizV2.version());
        assertFalse(quizV2.passed(), "Student who only passed v1 must re-pass v2 before Runtime opens");
        assertEquals("NOT_ATTEMPTED", quizV2.latestStatus());
        assertFalse(quizV2.runtimeUnlocked());
        assertEquals(1, snapshot.getCourseQuizEvidence().path("quizVersion").asInt());
        assertEquals("PASSED", snapshot.getCourseQuizEvidence().path("status").asText());
    }

    @Test
    void scoresMultipleChoiceAndTrueFalseAndNormalizesLegacyQuestions() {
        var questions = List.of(
                new CourseQuizService.Question("q1", "Pick both", "MULTI_CHOICE",
                        List.of("A", "B", "C"), null, List.of(0, 2), "Both A and C", 2),
                new CourseQuizService.Question("q2", "True?", "TRUE_FALSE",
                        List.of("True", "False"), 0, null, "", 1),
                new CourseQuizService.Question("Legacy?", List.of("Yes", "No"), 1)
        );

        assertEquals(3, CourseQuizService.scoreSelections(questions,
                List.of(List.of(0, 2), List.of(0), List.of(1))));
        assertEquals(2, CourseQuizService.scoreSelections(questions,
                List.of(List.of(0), List.of(0), List.of(1))));
        var normalized = CourseQuizService.normalizeQuestion(questions.get(2), 0);
        assertEquals("SINGLE_CHOICE", normalized.type());
        assertEquals("q1", normalized.id());
        assertThrows(BusinessException.class, () -> CourseQuizService.normalizeQuestion(
                new CourseQuizService.Question("q3", "Pick one", "MULTI_CHOICE",
                        List.of("A", "B"), null, List.of(0, 0), "", 1), 0));
    }

    @Test
    void publishDraftEnablesQuizWhenAssignmentPreviouslySkippedQuiz() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var json = new ObjectMapper();
        var policyNode = json.createObjectNode().put("skipQuiz", true).put("labTier", "THEORY_ONLY");
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1)
                .requireRuntimeTrace(false).aiPolicy(policyNode).build();

        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, json);
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));

        var draftRow = mock(java.sql.ResultSet.class);
        when(draftRow.getString(1)).thenReturn("Published Lesson");
        when(draftRow.getInt(2)).thenReturn(70);
        when(draftRow.getString(3)).thenReturn("[{\"prompt\":\"Q?\",\"options\":[\"A\",\"B\"],\"correctOption\":0}]");
        when(jdbc.query(contains("FROM course_quiz_drafts"), any(RowMapper.class), eq(labId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(draftRow, 0)));
        when(jdbc.queryForObject(contains("coalesce(max(version), 0) + 1"), eq(Integer.class), eq(labId)))
                .thenReturn(1);

        var published = service.publishDraft(workspaceId, labId);

        assertEquals(1, published.version());
        verify(assignments).save(argThat(saved ->
                saved.getAiPolicy() != null
                        && !saved.getAiPolicy().path("skipQuiz").asBoolean(true)
                        && "THEORY_QUIZ".equals(saved.getAiPolicy().path("labTier").asText())));
    }

    @Test
    void publishDraftThrowsNotFoundWhenNoDraftExists() {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).labOrder(1).build();

        var assignments = mock(AssignmentRepository.class);
        var access = mock(AccessPolicyService.class);
        var policy = mock(CourseLabPolicy.class);
        var jdbc = mock(JdbcTemplate.class);
        var service = new CourseQuizService(assignments, access, policy, jdbc, new ObjectMapper());
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));
        when(jdbc.query(contains("FROM course_quiz_drafts"), any(RowMapper.class), eq(labId)))
                .thenReturn(List.of());

        var ex = assertThrows(BusinessException.class, () -> service.publishDraft(workspaceId, labId));
        assertEquals(ErrorCode.NOT_FOUND, ex.getErrorCode());
        assertEquals("QUIZ_DRAFT_NOT_FOUND", ex.getStableCode());
    }

    @Test
    void scoreSelectionsAwardsZeroForUnansweredQuestionsWithoutRejectingAttempt() {
        var questions = List.of(
                new CourseQuizService.Question("q1", "First?", "SINGLE_CHOICE",
                        List.of("A", "B"), 1, null, "B is right", 1),
                new CourseQuizService.Question("q2", "Second?", "MULTI_CHOICE",
                        List.of("X", "Y", "Z"), null, List.of(0, 2), "X and Z", 1),
                new CourseQuizService.Question("q3", "Third?", "TRUE_FALSE",
                        List.of("True", "False"), 0, null, "True", 1)
        );

        assertEquals(1, CourseQuizService.scoreSelections(questions,
                List.of(List.of(1), List.of(), List.of())));
        assertEquals(0, CourseQuizService.scoreSelections(questions,
                List.of(List.of(), List.of(), List.of())));
        assertThrows(BusinessException.class, () -> CourseQuizService.scoreSelections(
                questions, List.of(List.of(1))));
        assertThrows(BusinessException.class, () -> CourseQuizService.scoreSelections(
                questions, List.of(List.of(9), List.of(), List.of())));
    }

    @Test
    void prefersBestPassingAttemptScoreWhenStudentHasLaterFailedRetake() throws Exception {
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
        var service = new CourseQuizService(assignments, access, policy, jdbc, new ObjectMapper());
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(student);

        var quizRow = mock(java.sql.ResultSet.class);
        when(quizRow.getInt(1)).thenReturn(1);
        when(quizRow.getString(2)).thenReturn("Module 1");
        when(quizRow.getInt(3)).thenReturn(70);
        when(quizRow.getString(4)).thenReturn("[]");
        when(jdbc.query(contains("FROM course_quizzes"), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(quizRow, 0)));

        var retakeTime = java.time.OffsetDateTime.parse("2026-11-25T11:00:00Z");
        var latestRow = mock(java.sql.ResultSet.class);
        when(latestRow.getString(1)).thenReturn("NEEDS_RETRY");
        when(latestRow.getInt(2)).thenReturn(1);
        when(latestRow.getObject(3, java.time.OffsetDateTime.class)).thenReturn(retakeTime);
        when(jdbc.query(contains("CASE WHEN passed THEN 'PASSED' ELSE 'NEEDS_RETRY' END"), any(RowMapper.class), eq(labId), eq(studentId), eq(1)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(latestRow, 0)));

        var bestRow = mock(java.sql.ResultSet.class);
        when(bestRow.getString(1)).thenReturn("PASSED");
        when(bestRow.getInt(2)).thenReturn(11);
        when(bestRow.getObject(3, java.time.OffsetDateTime.class)).thenReturn(retakeTime.minusDays(1));
        when(jdbc.query(contains("AND passed = true"), any(RowMapper.class), eq(labId), eq(studentId), eq(1)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(bestRow, 0)));
        when(policy.hasPassedQuizVersion(labId, studentId, 1)).thenReturn(true);

        var quiz = service.get(workspaceId, labId);
        assertTrue(quiz.passed());
        assertTrue(quiz.runtimeUnlocked());
        assertEquals("NEEDS_RETRY", quiz.latestStatus());
        assertEquals(1, quiz.latestCorrectCount());
        assertEquals(retakeTime, quiz.latestSubmittedAt());
        assertEquals(11, quiz.bestPassedCorrectCount());
    }

    @Test
    void retakeScoringReflectsExactLatestAttempt1Of12WithoutOverwritingWithOldPass() throws Exception {
        var workspaceId = UUID.randomUUID();
        var labId = UUID.randomUUID();
        var modelId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        var attemptId = UUID.randomUUID();
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
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(student);

        List<CourseQuizService.Question> questions = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) {
            questions.add(new CourseQuizService.Question("q" + (i + 1), "Question " + (i + 1),
                    "SINGLE_CHOICE", List.of("A", "B", "C", "D"), 1, null, "Exp " + (i + 1), 1));
        }
        var quizRow = mock(java.sql.ResultSet.class);
        when(quizRow.getInt(1)).thenReturn(1);
        when(quizRow.getString(2)).thenReturn("Module 1 Quiz");
        when(quizRow.getInt(3)).thenReturn(70);
        when(quizRow.getString(4)).thenReturn(json.writeValueAsString(questions));
        when(jdbc.query(contains("FROM course_quizzes"), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(quizRow, 0)));

        // Question 1 correct (1), Question 2 wrong (0), Questions 3..12 unanswered ([])
        List<List<Integer>> selections = new java.util.ArrayList<>();
        selections.add(List.of(1));
        selections.add(List.of(0));
        for (int i = 2; i < 12; i++) {
            selections.add(List.of());
        }

        var result = service.submit(workspaceId, labId,
                new CourseQuizService.Submit(attemptId, 1, null, selections));

        assertEquals(1, result.correctCount());
        assertEquals(12, result.totalQuestions());
        assertEquals("NEEDS_RETRY", result.status());
        assertEquals(12, result.questionResults().size());
        assertTrue(result.questionResults().get(0).correct());
        assertEquals(11, result.questionResults().stream().filter(r -> !r.correct()).count());
    }

}
