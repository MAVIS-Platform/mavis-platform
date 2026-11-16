package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class CourseQuizService {
    private final AssignmentRepository assignments;
    private final AccessPolicyService access;
    private final CourseLabPolicy labs;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record Question(String prompt, List<String> options, Integer correctOption) {}
    public record PublicQuestion(String prompt, List<String> options) {}
    public record Publish(String lesson, Integer passPercent, List<Question> questions) {}
    public record Quiz(int version, String lesson, int passPercent, List<PublicQuestion> questions,
                       boolean passed, String latestStatus, boolean runtimeUnlocked) {}
    public record Submit(UUID attemptId, int version, List<Integer> answers) {}
    public record Result(UUID attemptId, int version, int correctCount, int totalQuestions, String status) {}
    private record Definition(int version, String lesson, int threshold, List<Question> questions) {}
    private record Attempt(int version, String answers, int correct, boolean passed) {}

    public Quiz publish(UUID workspaceId, UUID assignmentId, Publish request) {
        return publish(workspaceId, assignmentId, request, false);
    }

    public Quiz publishCurriculum(UUID workspaceId, UUID assignmentId, Publish request) {
        return publish(workspaceId, assignmentId, request, true);
    }

    private Quiz publish(UUID workspaceId, UUID assignmentId, Publish request, boolean reuseMatchingVersion) {
        access.requireWorkspaceLecturer(workspaceId);
        var lab = lab(workspaceId, assignmentId, true);
        int threshold = request.passPercent() == null ? 70 : request.passPercent();
        validateDefinition(request, threshold);
        String lesson = request.lesson().trim();
        String questions = encode(request.questions());
        if (reuseMatchingVersion) {
            var published = jdbc.queryForList("""
                    SELECT version FROM course_quizzes
                    WHERE assignment_id = ? AND reference_model_id = ? AND lesson = ? AND pass_percent = ?
                      AND questions = CAST(? AS jsonb)
                      AND version = (SELECT max(version) FROM course_quizzes WHERE assignment_id = ?)
                    """, Integer.class, assignmentId, lab.getReferenceModel().getId(), lesson, threshold,
                    questions, assignmentId);
            if (!published.isEmpty()) {
                return view(new Definition(published.getFirst(), lesson, threshold, request.questions()), null);
            }
        }
        int next = jdbc.queryForObject("""
                SELECT coalesce(max(version), 0) + 1 FROM course_quizzes WHERE assignment_id = ?
                """, Integer.class, assignmentId);
        jdbc.update("""
                INSERT INTO course_quizzes(assignment_id, version, reference_model_id, lesson, pass_percent, questions)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb))
                """, assignmentId, next, lab.getReferenceModel().getId(), lesson, threshold, questions);
        return view(new Definition(next, lesson, threshold, request.questions()), null);
    }

    @Transactional(readOnly = true)
    public Quiz get(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceMember(workspaceId);
        var user = access.requireCurrentActiveUser();
        var lab = lab(workspaceId, assignmentId, false);
        if (CourseLabPolicy.isStudent(user)) labs.requireOpen(lab, user);
        var quiz = current(lab);
        String latestStatus = null;
        if (CourseLabPolicy.isStudent(user)) {
            latestStatus = labs.hasPassedQuizVersion(lab.getId(), user.getId(), quiz.version())
                    ? "PASSED"
                    : latestStatus(lab.getId(), user.getId(), quiz.version());
        }
        return view(quiz, latestStatus);
    }

    public Result submit(UUID workspaceId, UUID assignmentId, Submit request) {
        access.requireWorkspaceMember(workspaceId);
        User student = access.requireCurrentActiveUser();
        if (!CourseLabPolicy.isStudent(student)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "QUIZ_REQUIRES_STUDENT", "Only students can submit a course Quiz");
        }
        var lab = lab(workspaceId, assignmentId, true);
        labs.requireOpen(lab, student);
        if (request.attemptId() == null || request.version() < 1
                || request.answers() == null || request.answers().size() > 50) throw invalid();
        var previous = jdbc.query("""
                SELECT quiz_version, answers::text, correct_count, passed FROM course_quiz_attempts
                WHERE assignment_id = ? AND student_id = ? AND attempt_id = ?
                """, (rs, row) -> new Attempt(rs.getInt(1), rs.getString(2), rs.getInt(3), rs.getBoolean(4)),
                assignmentId, student.getId(), request.attemptId()).stream().findFirst();
        if (previous.isPresent()) {
            var attempt = previous.get();
            if (attempt.version() != request.version() || !request.answers().equals(decode(attempt.answers(), new TypeReference<List<Integer>>() {}))) {
                throw new BusinessException(ErrorCode.CONFLICT, "QUIZ_ATTEMPT_CONFLICT", "Attempt already submitted with different answers or version");
            }
            return result(request, attempt.correct(), request.answers().size(), attempt.passed());
        }
        var quiz = current(lab);
        if (request.version() != quiz.version()) {
            throw new BusinessException(ErrorCode.CONFLICT, "QUIZ_STALE_VERSION", "Quiz version changed. Reload before submitting.");
        }
        int correct = score(quiz.questions(), request.answers());
        boolean passed = passes(correct, quiz.questions().size(), quiz.threshold());
        jdbc.update("""
                INSERT INTO course_quiz_attempts(assignment_id, quiz_version, student_id, attempt_id, answers, correct_count, passed)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
                """, assignmentId, quiz.version(), student.getId(), request.attemptId(), encode(request.answers()), correct, passed);
        jdbc.update("""
                INSERT INTO audit_logs(actor_id, action, target_type, target_id, details)
                VALUES (?, 'COURSE_QUIZ_SUBMITTED', 'ASSIGNMENT', ?,
                        jsonb_build_object('attemptId', ?, 'quizVersion', ?, 'correctCount', ?,
                                           'questionCount', ?, 'status', ?))
                """, student.getId(), assignmentId, request.attemptId(), quiz.version(), correct,
                quiz.questions().size(), passed ? "PASSED" : "NEEDS_RETRY");
        return result(request, correct, quiz.questions().size(), passed);
    }

    private Assignment lab(UUID workspaceId, UUID assignmentId, boolean lock) {
        return (lock ? assignments.findLockedById(assignmentId) : assignments.findById(assignmentId))
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .filter(value -> value.getLabOrder() != null && value.getReferenceModel() != null
                        && "ACTIVE".equals(value.getWorkspace().getStatus()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Active published Lab not found"));
    }

    private Definition current(Assignment lab) {
        return jdbc.query("""
                SELECT version, lesson, pass_percent, questions::text FROM course_quizzes
                WHERE assignment_id = ? AND reference_model_id = ? ORDER BY version DESC LIMIT 1
                """, (rs, row) -> new Definition(rs.getInt(1), rs.getString(2), rs.getInt(3),
                        decode(rs.getString(4), new TypeReference<List<Question>>() {})),
                lab.getId(), lab.getReferenceModel().getId()).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "QUIZ_NOT_PUBLISHED", "Quiz has not been published"));
    }

    private String latestStatus(UUID assignmentId, UUID studentId, int version) {
        return jdbc.query("""
                SELECT CASE WHEN passed THEN 'PASSED' ELSE 'NEEDS_RETRY' END
                FROM course_quiz_attempts
                WHERE assignment_id = ? AND student_id = ? AND quiz_version = ?
                ORDER BY submitted_at DESC, attempt_id DESC LIMIT 1
                """, (rs, row) -> rs.getString(1), assignmentId, studentId, version)
                .stream().findFirst().orElse("NOT_ATTEMPTED");
    }

    private static void validateDefinition(Publish request, int threshold) {
        if (threshold < 1 || threshold > 100 || !bounded(request.lesson(), 20_000)
                || request.questions() == null || request.questions().isEmpty() || request.questions().size() > 50) throw invalid();
        for (var question : request.questions()) {
            if (question == null || !bounded(question.prompt(), 1_000)
                    || question.options() == null || question.options().size() < 2 || question.options().size() > 8
                    || question.options().stream().anyMatch(option -> !bounded(option, 500))
                    || question.correctOption() == null || question.correctOption() < 0
                    || question.correctOption() >= question.options().size()) throw invalid();
        }
    }

    static int score(List<Question> questions, List<Integer> answers) {
        if (answers.size() != questions.size()) throw invalid();
        int correct = 0;
        for (int index = 0; index < questions.size(); index++) {
            var question = questions.get(index);
            Integer answer = answers.get(index);
            if (answer == null || answer < 0 || answer >= question.options().size()) throw invalid();
            if (answer.equals(question.correctOption())) correct++;
        }
        return correct;
    }

    static boolean passes(int correct, int total, int threshold) {
        return correct * 100 >= threshold * total;
    }

    private static boolean bounded(String value, int max) {
        return value != null && !value.isBlank() && value.length() <= max;
    }

    private static Quiz view(Definition quiz, String latestStatus) {
        boolean passed = "PASSED".equals(latestStatus);
        return new Quiz(quiz.version(), quiz.lesson(), quiz.threshold(), quiz.questions().stream()
                .map(question -> new PublicQuestion(question.prompt(), question.options())).toList(),
                passed, latestStatus, passed);
    }

    private static Result result(Submit request, int correct, int total, boolean passed) {
        return new Result(request.attemptId(), request.version(), correct, total, passed ? "PASSED" : "NEEDS_RETRY");
    }

    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize course Quiz", exception);
        }
    }

    private <T> T decode(String value, TypeReference<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not read course Quiz", exception);
        }
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.BAD_REQUEST, "QUIZ_INVALID", "Invalid course Quiz or answers");
    }
}
