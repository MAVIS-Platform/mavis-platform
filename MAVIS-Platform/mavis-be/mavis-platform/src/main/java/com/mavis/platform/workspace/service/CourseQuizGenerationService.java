package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Builds a Quiz draft from the theory that belongs to a Lab.
 *
 * <p>The lecturer's theory stays the source of truth: the generator only proposes questions,
 * and the lecturer reviews or edits them in the Quiz builder before saving the draft.</p>
 */
@Service
@RequiredArgsConstructor
public class CourseQuizGenerationService {

    private static final int DEFAULT_COUNT = 10;
    private static final int MAX_COUNT = 20;
    private static final int MAX_THEORY_CHARS = 24_000;

    private final AssignmentRepository assignments;
    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;
    private final QuizQuestionGenerator generator;

    public record Request(Integer count, String locale) {}

    public record Generated(String providerMode, int sourceTheoryItems, List<CourseQuizService.Question> questions) {}

    public Generated generate(UUID workspaceId, UUID assignmentId, Request request) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = assignments.findById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "LAB_NOT_FOUND", "Lab not found in this workspace"));

        int count = request == null || request.count() == null ? DEFAULT_COUNT : request.count();
        if (count < 1 || count > MAX_COUNT) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "AI_QUIZ_COUNT_INVALID",
                    "Ask for between 1 and " + MAX_COUNT + " questions");
        }
        boolean vietnamese = request != null && "vi".equalsIgnoreCase(request.locale());

        Theory theory = theoryFor(workspaceId, lab.getId());
        if (theory.text().isBlank()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "THEORY_REQUIRED",
                    "Add theory content for this Lab before generating Quiz questions");
        }

        List<CourseQuizService.Question> questions =
                generator.generate(theory.text(), count, vietnamese);
        return new Generated(generator.providerMode(), theory.items(), List.copyOf(questions));
    }

    private Theory theoryFor(UUID workspaceId, UUID assignmentId) {
        record Row(String body, int items) {}
        Row row = jdbc.queryForObject("""
                SELECT coalesce(string_agg(
                           ci.title || E'\\n\\n' || coalesce(ci.content->>'body', ''),
                           E'\\n\\n---\\n\\n' ORDER BY cm.position, ci.position), '') AS body,
                       count(*) AS items
                FROM course_items ci
                JOIN course_modules cm ON cm.id = ci.module_id
                JOIN course_definitions cd ON cd.id = cm.course_id
                WHERE cd.workspace_id = ?
                  AND ci.item_type = 'THEORY'
                  AND cm.id IN (SELECT linked.module_id FROM course_items linked
                                WHERE linked.assignment_id = ?)
                """, (rs, ignored) -> new Row(rs.getString("body"), rs.getInt("items")),
                workspaceId, assignmentId);
        if (row == null) return new Theory("", 0);
        String text = row.body() == null ? "" : row.body();
        if (text.length() > MAX_THEORY_CHARS) text = text.substring(0, MAX_THEORY_CHARS);
        return new Theory(text, row.items());
    }

    private record Theory(String text, int items) {}
}
