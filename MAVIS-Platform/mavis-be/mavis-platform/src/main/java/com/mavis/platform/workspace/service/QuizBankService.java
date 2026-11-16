package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class QuizBankService {
    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record QuestionBody(UUID moduleId, String id, String prompt, String type, List<String> options,
                               Integer correctOption, List<Integer> correctOptions, String explanation,
                               Integer points) {}
    public record View(UUID id, UUID moduleId, JsonNode question, OffsetDateTime createdAt,
                       OffsetDateTime updatedAt) {}

    public List<View> list(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        return jdbc.query("""
                SELECT id, module_id, question::text, created_at, updated_at
                FROM quiz_question_bank WHERE workspace_id = ? ORDER BY created_at DESC
                """, (rs, row) -> new View(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                parse(rs.getString(3)), rs.getObject(4, OffsetDateTime.class),
                rs.getObject(5, OffsetDateTime.class)), workspaceId);
    }

    public View save(UUID workspaceId, QuestionBody body) {
        access.requireWorkspaceLecturer(workspaceId);
        validateModule(workspaceId, body.moduleId());
        String question = encode(normalize(body));
        return jdbc.queryForObject("""
                INSERT INTO quiz_question_bank(workspace_id, module_id, question)
                VALUES (?, ?, CAST(? AS jsonb))
                RETURNING id, module_id, question::text, created_at, updated_at
                """, (rs, row) -> new View(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                parse(rs.getString(3)), rs.getObject(4, OffsetDateTime.class),
                rs.getObject(5, OffsetDateTime.class)),
                workspaceId, body.moduleId(), question);
    }

    public View update(UUID workspaceId, UUID questionId, QuestionBody body) {
        access.requireWorkspaceLecturer(workspaceId);
        validateModule(workspaceId, body.moduleId());
        String question = encode(normalize(body));
        return jdbc.query("""
                UPDATE quiz_question_bank SET module_id = ?, question = CAST(? AS jsonb), updated_at = now()
                WHERE id = ? AND workspace_id = ?
                RETURNING id, module_id, question::text, created_at, updated_at
                """, (rs, row) -> new View(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                parse(rs.getString(3)), rs.getObject(4, OffsetDateTime.class),
                rs.getObject(5, OffsetDateTime.class)),
                body.moduleId(), question, questionId, workspaceId).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Quiz bank question not found"));
    }

    public void delete(UUID workspaceId, UUID questionId) {
        access.requireWorkspaceLecturer(workspaceId);
        int deleted = jdbc.update("DELETE FROM quiz_question_bank WHERE id = ? AND workspace_id = ?",
                questionId, workspaceId);
        if (deleted == 0) throw new BusinessException(ErrorCode.NOT_FOUND, "Quiz bank question not found");
    }

    private CourseQuizService.Question normalize(QuestionBody body) {
        if (body == null) throw invalid();
        return CourseQuizService.normalizeQuestion(new CourseQuizService.Question(
                body.id(), body.prompt(), body.type(), body.options(), body.correctOption(),
                body.correctOptions(), body.explanation(), body.points()), 0);
    }

    private void validateModule(UUID workspaceId, UUID moduleId) {
        if (moduleId == null) return;
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM course_modules m
                JOIN course_definitions c ON c.id = m.course_id
                WHERE m.id = ? AND c.workspace_id = ?
                """, Integer.class, moduleId, workspaceId);
        if (count == null || count < 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Bank module must belong to this Course");
        }
    }

    private JsonNode parse(String value) {
        try {
            return json.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not read Quiz bank question", exception);
        }
    }

    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize Quiz bank question", exception);
        }
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.BAD_REQUEST, "QUIZ_INVALID", "Invalid Quiz bank question");
    }
}
