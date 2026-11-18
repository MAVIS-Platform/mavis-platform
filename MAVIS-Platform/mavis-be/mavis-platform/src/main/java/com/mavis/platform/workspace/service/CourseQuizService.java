package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
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

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(noRollbackFor = BusinessException.class)
public class CourseQuizService {
    private static final Set<String> QUESTION_TYPES = Set.of("SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE");
    private final AssignmentRepository assignments;
    private final AccessPolicyService access;
    private final CourseLabPolicy labs;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record Question(String id, String prompt, String type, List<String> options, Integer correctOption,
                           List<Integer> correctOptions, String explanation, Integer points) {
        public Question(String prompt, List<String> options, Integer correctOption) {
            this(null, prompt, "SINGLE_CHOICE", options, correctOption, null, null, 1);
        }
    }

    public record PublicQuestion(String id, String prompt, String type, List<String> options, Integer points) {}
    public record Publish(String lesson, Integer passPercent, List<Question> questions) {}
    public record Quiz(int version, String lesson, int passPercent, List<PublicQuestion> questions,
                       boolean passed, String latestStatus, boolean runtimeUnlocked) {}
    public record QuestionResult(String id, boolean correct, String explanation) {}
    public record Result(UUID attemptId, int version, int correctCount, int totalQuestions, String status,
                         List<QuestionResult> questionResults) {
        public Result(UUID attemptId, int version, int correctCount, int totalQuestions, String status) {
            this(attemptId, version, correctCount, totalQuestions, status, List.of());
        }
    }
    public record Submit(UUID attemptId, int version, List<Integer> answers, List<List<Integer>> selections) {
        public Submit(UUID attemptId, int version, List<Integer> answers) {
            this(attemptId, version, answers, null);
        }
    }
    public record Draft(String lesson, int passPercent, List<Question> questions) {}
    public record Version(int version, String lesson, int passPercent, OffsetDateTime publishedAt) {}
    private record Definition(int version, String lesson, int threshold, List<Question> questions) {}
    private record Attempt(int version, String answers, int correct, boolean passed) {}
    private record Scored(int correct, List<QuestionResult> results) {}

    public Quiz publish(UUID workspaceId, UUID assignmentId, Publish request) {
        return publish(workspaceId, assignmentId, request, false);
    }

    public Quiz publishCurriculum(UUID workspaceId, UUID assignmentId, Publish request) {
        return publish(workspaceId, assignmentId, request, true);
    }

    private Quiz publish(UUID workspaceId, UUID assignmentId, Publish request, boolean reuseMatchingVersion) {
        access.requireWorkspaceLecturer(workspaceId);
        var lab = labForAuthoring(workspaceId, assignmentId);
        RequestParts parts = validateRequest(request);
        String questions = encode(parts.questions());
        if (reuseMatchingVersion) {
            var published = jdbc.queryForList("""
                    SELECT version FROM course_quizzes
                    WHERE assignment_id = ? AND reference_model_id = ? AND lesson = ? AND pass_percent = ?
                      AND questions = CAST(? AS jsonb)
                      AND version = (SELECT max(version) FROM course_quizzes WHERE assignment_id = ?)
                    """, Integer.class, assignmentId, lab.getReferenceModel().getId(), parts.lesson(),
                    parts.threshold(), questions, assignmentId);
            if (!published.isEmpty()) {
                return view(new Definition(published.getFirst(), parts.lesson(), parts.threshold(),
                        parts.questions()), null);
            }
        }
        int next = nextVersion(assignmentId);
        insertVersion(assignmentId, lab.getReferenceModel().getId(), next, parts, questions);
        return view(new Definition(next, parts.lesson(), parts.threshold(), parts.questions()), null);
    }

    @Transactional(readOnly = true)
    public Draft draft(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        var lab = labForAuthoring(workspaceId, assignmentId, false);
        var draft = jdbc.query("""
                SELECT lesson, pass_percent, questions::text FROM course_quiz_drafts WHERE assignment_id = ?
                """, (rs, row) -> new Definition(0, rs.getString(1), rs.getInt(2),
                        normalizeQuestions(decode(rs.getString(3), new TypeReference<List<Question>>() {}))),
                assignmentId).stream().findFirst();
        if (draft.isPresent()) {
            return new Draft(draft.get().lesson(), draft.get().threshold(), draft.get().questions());
        }
        var current = current(lab);
        return new Draft(current.lesson(), current.threshold(), current.questions());
    }

    public Draft saveDraft(UUID workspaceId, UUID assignmentId, Publish request) {
        access.requireWorkspaceLecturer(workspaceId);
        labForAuthoring(workspaceId, assignmentId);
        RequestParts parts = validateRequest(request);
        User actor = access.requireCurrentActiveUser();
        jdbc.update("""
                INSERT INTO course_quiz_drafts(assignment_id, lesson, pass_percent, questions, updated_by, updated_at)
                VALUES (?, ?, ?, CAST(? AS jsonb), ?, now())
                ON CONFLICT (assignment_id) DO UPDATE SET lesson = excluded.lesson,
                    pass_percent = excluded.pass_percent, questions = excluded.questions,
                    updated_by = excluded.updated_by, updated_at = now()
                """, assignmentId, parts.lesson(), parts.threshold(), encode(parts.questions()), actor.getId());
        return new Draft(parts.lesson(), parts.threshold(), parts.questions());
    }

    public Quiz publishDraft(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        var lab = labForAuthoring(workspaceId, assignmentId);
        var draft = jdbc.query("""
                SELECT lesson, pass_percent, questions::text FROM course_quiz_drafts WHERE assignment_id = ?
                """, (rs, row) -> new RequestParts(rs.getString(1), rs.getInt(2),
                        normalizeQuestions(decode(rs.getString(3), new TypeReference<List<Question>>() {}))),
                assignmentId).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "QUIZ_DRAFT_NOT_FOUND",
                        "Save a Quiz draft before publishing"));
        int next = nextVersion(assignmentId);
        insertVersion(assignmentId, lab.getReferenceModel().getId(), next, draft, encode(draft.questions()));
        jdbc.update("DELETE FROM course_quiz_drafts WHERE assignment_id = ?", assignmentId);
        return view(new Definition(next, draft.lesson(), draft.threshold(), draft.questions()), null);
    }

    @Transactional(readOnly = true)
    public List<Version> versions(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        var lab = labForAuthoring(workspaceId, assignmentId, false);
        return jdbc.query("""
                SELECT version, lesson, pass_percent, published_at FROM course_quizzes
                WHERE assignment_id = ? AND reference_model_id = ? ORDER BY version DESC
                """, (rs, row) -> new Version(rs.getInt(1), rs.getString(2), rs.getInt(3),
                        rs.getObject(4, OffsetDateTime.class)),
                assignmentId, lab.getReferenceModel().getId());
    }

    @Transactional(readOnly = true, noRollbackFor = BusinessException.class)
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
        if (request.attemptId() == null || request.version() < 1) throw invalid();
        List<List<Integer>> selections = requestedSelections(request);
        var previous = jdbc.query("""
                SELECT quiz_version, answers::text, correct_count, passed FROM course_quiz_attempts
                WHERE assignment_id = ? AND student_id = ? AND attempt_id = ?
                """, (rs, row) -> new Attempt(rs.getInt(1), rs.getString(2), rs.getInt(3), rs.getBoolean(4)),
                assignmentId, student.getId(), request.attemptId()).stream().findFirst();
        if (previous.isPresent()) {
            var attempt = previous.get();
            if (attempt.version() != request.version()
                    || !selections.equals(storedSelections(attempt.answers()))) {
                throw new BusinessException(ErrorCode.CONFLICT, "QUIZ_ATTEMPT_CONFLICT",
                        "Attempt already submitted with different answers or version");
            }
            return result(request, attempt.correct(), attempt.passed(), selections, current(lab).questions());
        }
        var quiz = current(lab);
        if (request.version() != quiz.version()) {
            throw new BusinessException(ErrorCode.CONFLICT, "QUIZ_STALE_VERSION",
                    "Quiz version changed. Reload before submitting.");
        }
        List<List<Integer>> normalizedSelections = selectionsFor(selections, quiz.questions());
        Scored scored = scoreInternal(quiz.questions(), normalizedSelections);
        boolean passed = passes(scored.correct(), quiz.questions().size(), quiz.threshold());
        Object storedAnswers = request.selections() == null ? request.answers() : normalizedSelections;
        jdbc.update("""
                INSERT INTO course_quiz_attempts(assignment_id, quiz_version, student_id, attempt_id, answers, correct_count, passed)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
                """, assignmentId, quiz.version(), student.getId(), request.attemptId(),
                encode(storedAnswers), scored.correct(), passed);
        jdbc.update("""
                INSERT INTO audit_logs(actor_id, action, target_type, target_id, details)
                VALUES (?, 'COURSE_QUIZ_SUBMITTED', 'ASSIGNMENT', ?,
                        jsonb_build_object('attemptId', ?, 'quizVersion', ?, 'correctCount', ?,
                                           'questionCount', ?, 'status', ?))
                """, student.getId(), assignmentId, request.attemptId(), quiz.version(), scored.correct(),
                quiz.questions().size(), passed ? "PASSED" : "NEEDS_RETRY");
        return new Result(request.attemptId(), request.version(), scored.correct(), quiz.questions().size(),
                passed ? "PASSED" : "NEEDS_RETRY", scored.results());
    }

    public static Question normalizeQuestion(Question question, int index) {
        if (question == null) throw invalid();
        String type = question.type() == null || question.type().isBlank()
                ? "SINGLE_CHOICE" : question.type().trim().toUpperCase(Locale.ROOT);
        if (!QUESTION_TYPES.contains(type)) throw invalid();
        if (!bounded(question.prompt(), 1_000)) throw invalid();
        List<String> options = question.options();
        if (options == null || options.size() < 2 || options.size() > 8
                || options.stream().anyMatch(option -> !bounded(option, 500))) throw invalid();
        if ("TRUE_FALSE".equals(type) && options.size() != 2) throw invalid();
        int points = question.points() == null ? 1 : question.points();
        if (points < 1 || points > 100) throw invalid();
        String id = question.id() == null || question.id().isBlank()
                ? "q" + (index + 1) : question.id().trim();
        String explanation = question.explanation() == null ? "" : question.explanation().trim();
        if ("MULTI_CHOICE".equals(type)) {
            List<Integer> correct = question.correctOptions();
            if (correct == null || correct.isEmpty() || correct.size() > options.size()) throw invalid();
            Set<Integer> unique = new HashSet<>();
            for (Integer value : correct) {
                if (value == null || value < 0 || value >= options.size() || !unique.add(value)) throw invalid();
            }
            return new Question(id, question.prompt().trim(), type, options, null, List.copyOf(correct),
                    explanation, points);
        }
        Integer correct = question.correctOption();
        if (correct == null || correct < 0 || correct >= options.size()) throw invalid();
        return new Question(id, question.prompt().trim(), type, options, correct, null, explanation, points);
    }

    private static List<Question> normalizeQuestions(List<Question> questions) {
        if (questions == null) return List.of();
        List<Question> normalized = new ArrayList<>(questions.size());
        for (int index = 0; index < questions.size(); index++) {
            normalized.add(normalizeQuestion(questions.get(index), index));
        }
        return List.copyOf(normalized);
    }

    private record RequestParts(String lesson, int threshold, List<Question> questions) {}

    private RequestParts validateRequest(Publish request) {
        int threshold = request == null || request.passPercent() == null ? 80 : request.passPercent();
        if (request == null || threshold < 1 || threshold > 100 || !bounded(request.lesson(), 20_000)
                || request.questions() == null || request.questions().isEmpty() || request.questions().size() > 50) {
            throw invalid();
        }
        return new RequestParts(request.lesson().trim(), threshold, normalizeQuestions(request.questions()));
    }

    private Assignment labForAuthoring(UUID workspaceId, UUID assignmentId) {
        return labForAuthoring(workspaceId, assignmentId, true);
    }

    private Assignment labForAuthoring(UUID workspaceId, UUID assignmentId, boolean lock) {
        return (lock ? assignments.findLockedById(assignmentId) : assignments.findById(assignmentId))
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .filter(value -> value.getReferenceModel() != null
                        && "ACTIVE".equals(value.getWorkspace().getStatus()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "Active Course Lab with a pinned reference model not found"));
    }

    private Assignment lab(UUID workspaceId, UUID assignmentId, boolean lock) {
        return (lock ? assignments.findLockedById(assignmentId) : assignments.findById(assignmentId))
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .filter(value -> value.getLabOrder() != null && value.getReferenceModel() != null
                        && "ACTIVE".equals(value.getWorkspace().getStatus()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Active published Lab not found"));
    }

    private int nextVersion(UUID assignmentId) {
        return jdbc.queryForObject("""
                SELECT coalesce(max(version), 0) + 1 FROM course_quizzes WHERE assignment_id = ?
                """, Integer.class, assignmentId);
    }

    private void insertVersion(UUID assignmentId, UUID modelId, int version, RequestParts parts, String questions) {
        jdbc.update("""
                INSERT INTO course_quizzes(assignment_id, version, reference_model_id, lesson, pass_percent, questions, published_at)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), now())
                """, assignmentId, version, modelId, parts.lesson(), parts.threshold(), questions);
    }

    private Definition current(Assignment lab) {
        return jdbc.query("""
                SELECT version, lesson, pass_percent, questions::text FROM course_quizzes
                WHERE assignment_id = ? AND reference_model_id = ? ORDER BY version DESC LIMIT 1
                """, (rs, row) -> new Definition(rs.getInt(1), rs.getString(2), rs.getInt(3),
                        normalizeQuestions(decode(rs.getString(4), new TypeReference<List<Question>>() {}))),
                lab.getId(), lab.getReferenceModel().getId()).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "QUIZ_NOT_PUBLISHED",
                        "Quiz has not been published"));
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

    static int score(List<Question> questions, List<Integer> answers) {
        return scoreInternal(questions, answers.stream().map(value -> List.of(value)).toList()).correct();
    }

    static int scoreSelections(List<Question> questions, List<List<Integer>> selections) {
        return scoreInternal(questions, selections).correct();
    }

    private static Scored scoreInternal(List<Question> questions, List<List<Integer>> selections) {
        List<Question> normalized = normalizeQuestions(questions);
        if (selections == null || selections.size() != normalized.size()) throw invalid();
        int correct = 0;
        List<QuestionResult> results = new ArrayList<>(normalized.size());
        for (int index = 0; index < normalized.size(); index++) {
            Question question = normalized.get(index);
            List<Integer> selected = selections.get(index);
            if (selected == null || selected.isEmpty()) throw invalid();
            Set<Integer> unique = new HashSet<>();
            for (Integer value : selected) {
                if (value == null || value < 0 || value >= question.options().size() || !unique.add(value)) {
                    throw invalid();
                }
            }
            boolean matched;
            if ("MULTI_CHOICE".equals(question.type())) {
                matched = unique.equals(new HashSet<>(question.correctOptions()));
            } else {
                matched = selected.size() == 1 && selected.getFirst().equals(question.correctOption());
            }
            if (matched) correct++;
            results.add(new QuestionResult(question.id(), matched, question.explanation()));
        }
        return new Scored(correct, List.copyOf(results));
    }

    static boolean passes(int correct, int total, int threshold) {
        return total > 0 && correct * 100 >= threshold * total;
    }

    private static List<List<Integer>> requestedSelections(Submit request) {
        if (request.selections() != null) return request.selections();
        if (request.answers() == null || request.answers().size() > 50) throw invalid();
        return request.answers().stream()
                .map(value -> value == null ? List.<Integer>of() : List.of(value))
                .toList();
    }

    private List<List<Integer>> selectionsFor(List<List<Integer>> selections, List<Question> questions) {
        if (selections.size() != questions.size()) throw invalid();
        return selections;
    }

    private List<List<Integer>> storedSelections(String value) {
        try {
            JsonNode node = json.readTree(value);
            if (node == null || !node.isArray()) throw invalid();
            List<List<Integer>> selections = new ArrayList<>();
            for (JsonNode item : node) {
                if (item.isArray()) {
                    List<Integer> inner = new ArrayList<>();
                    for (JsonNode entry : item) {
                        if (!entry.isInt()) throw invalid();
                        inner.add(entry.asInt());
                    }
                    selections.add(List.copyOf(inner));
                } else if (item.isInt()) {
                    selections.add(List.of(item.asInt()));
                } else {
                    throw invalid();
                }
            }
            return selections;
        } catch (JsonProcessingException exception) {
            throw invalid();
        }
    }

    private static boolean bounded(String value, int max) {
        return value != null && !value.isBlank() && value.length() <= max;
    }

    private static Quiz view(Definition quiz, String latestStatus) {
        boolean passed = "PASSED".equals(latestStatus);
        return new Quiz(quiz.version(), quiz.lesson(), quiz.threshold(), quiz.questions().stream()
                .map(question -> new PublicQuestion(question.id(), question.prompt(), question.type(),
                        question.options(), question.points())).toList(),
                passed, latestStatus, passed);
    }

    private Result result(Submit request, int correct, boolean passed, List<List<Integer>> selections,
                          List<Question> questions) {
        List<QuestionResult> results = List.of();
        try {
            results = scoreInternal(questions, selections).results();
        } catch (BusinessException ignored) {
            // An old attempt can still be replayed after the Quiz definition changed.
        }
        return new Result(request.attemptId(), request.version(), correct, questions.size(),
                passed ? "PASSED" : "NEEDS_RETRY", results);
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
