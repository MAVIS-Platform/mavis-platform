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
public class CourseQuizAssetService {
    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record Upsert(String title, String description, Integer passPercent, List<CourseQuizService.Question> questions) {}
    public record View(UUID id, String title, String description, int passPercent, JsonNode questions,
                       OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

    @Transactional(readOnly = true)
    public List<View> list(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        return jdbc.query("""
                SELECT id, title, description, pass_percent, questions::text, created_at, updated_at
                FROM course_quiz_assets WHERE workspace_id = ? ORDER BY updated_at DESC
                """, (rs, row) -> view(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                rs.getInt(4), rs.getString(5), rs.getObject(6, OffsetDateTime.class),
                rs.getObject(7, OffsetDateTime.class)), workspaceId);
    }

    public View create(UUID workspaceId, Upsert request) {
        access.requireWorkspaceLecturer(workspaceId);
        requireEditable(workspaceId);
        Validated value = validate(request);
        UUID actorId = access.requireCurrentActiveUser().getId();
        return jdbc.queryForObject("""
                INSERT INTO course_quiz_assets(workspace_id, title, description, pass_percent, questions, created_by)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?)
                RETURNING id, title, description, pass_percent, questions::text, created_at, updated_at
                """, (rs, row) -> view(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                rs.getInt(4), rs.getString(5), rs.getObject(6, OffsetDateTime.class),
                rs.getObject(7, OffsetDateTime.class)), workspaceId, value.title(), value.description(),
                value.passPercent(), encode(value.questions()), actorId);
    }

    public View update(UUID workspaceId, UUID assetId, Upsert request) {
        access.requireWorkspaceLecturer(workspaceId);
        requireEditable(workspaceId);
        Validated value = validate(request);
        return jdbc.query("""
                UPDATE course_quiz_assets
                SET title = ?, description = ?, pass_percent = ?, questions = CAST(? AS jsonb), updated_at = now()
                WHERE id = ? AND workspace_id = ?
                RETURNING id, title, description, pass_percent, questions::text, created_at, updated_at
                """, (rs, row) -> view(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                rs.getInt(4), rs.getString(5), rs.getObject(6, OffsetDateTime.class),
                rs.getObject(7, OffsetDateTime.class)), value.title(), value.description(),
                value.passPercent(), encode(value.questions()), assetId, workspaceId).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "QUIZ_ASSET_NOT_FOUND",
                        "Quiz asset not found in this workspace"));
    }

    public void delete(UUID workspaceId, UUID assetId) {
        access.requireWorkspaceLecturer(workspaceId);
        requireEditable(workspaceId);
        int deleted = jdbc.update("DELETE FROM course_quiz_assets WHERE id = ? AND workspace_id = ?",
                assetId, workspaceId);
        if (deleted == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "QUIZ_ASSET_NOT_FOUND",
                    "Quiz asset not found in this workspace");
        }
    }

    private Validated validate(Upsert request) {
        if (request == null || request.title() == null || request.title().isBlank()
                || request.title().trim().length() > 255 || request.questions() == null
                || request.questions().isEmpty()) {
            throw invalid();
        }
        int passPercent = request.passPercent() == null ? 70 : request.passPercent();
        if (passPercent < 1 || passPercent > 100) throw invalid();
        List<CourseQuizService.Question> questions = java.util.stream.IntStream
                .range(0, request.questions().size())
                .mapToObj(index -> CourseQuizService.normalizeQuestion(request.questions().get(index), index))
                .toList();
        return new Validated(request.title().trim(), blankToNull(request.description()), passPercent, questions);
    }

    private void requireEditable(UUID workspaceId) {
        String status = jdbc.query("SELECT status FROM workspaces WHERE id = ?",
                (rs, row) -> rs.getString(1), workspaceId).stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if ("ACTIVE".equalsIgnoreCase(status)) {
            throw new BusinessException(ErrorCode.CONFLICT, "COURSE_ACTIVE_READ_ONLY",
                    "Deactivate the Course before changing learning content");
        }
    }

    private View view(UUID id, String title, String description, int passPercent, String questions,
                      OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        try {
            return new View(id, title, description, passPercent, json.readTree(questions), createdAt, updatedAt);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not read Quiz asset", exception);
        }
    }

    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize Quiz asset", exception);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.BAD_REQUEST, "QUIZ_ASSET_INVALID",
                "Quiz title, pass percentage, and at least one valid question are required");
    }

    private record Validated(String title, String description, int passPercent,
                             List<CourseQuizService.Question> questions) {}
}
