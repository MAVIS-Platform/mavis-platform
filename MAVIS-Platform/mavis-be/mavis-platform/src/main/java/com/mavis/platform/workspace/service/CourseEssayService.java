package com.mavis.platform.workspace.service;

import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.CourseItemRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.platform.workspace.dto.CourseEssayDtos.EssaySubmissionView;
import com.mavis.platform.workspace.dto.CourseEssayDtos.GradeEssayRequest;
import com.mavis.platform.workspace.dto.CourseEssayDtos.SubmitEssayRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Manages Coursera-style chapter ESSAY written assignments:
 * student Markdown submission upserts, listing, and lecturer rubric grading.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CourseEssayService {
    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final CourseItemRepository courseItems;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<EssaySubmissionView> listForWorkspace(UUID workspaceId) {
        access.requireWorkspaceMember(workspaceId);
        User actor = access.requireCurrentActiveUser();
        boolean studentOnly = CourseLabPolicy.isStudent(actor);

        if (studentOnly) {
            return jdbc.query("""
                    SELECT s.id, s.workspace_id, s.course_item_id, ci.title AS item_title,
                           s.student_id, u.full_name AS student_name, u.email AS student_email,
                           s.answer_markdown, s.status, s.score, s.feedback, s.graded_by,
                           s.submitted_at, s.graded_at
                    FROM course_item_submissions s
                    JOIN course_items ci ON ci.id = s.course_item_id
                    JOIN users u ON u.id = s.student_id
                    WHERE s.workspace_id = ? AND s.student_id = ?
                    ORDER BY s.submitted_at DESC
                    """, this::mapRow, workspaceId, actor.getId());
        }

        return jdbc.query("""
                SELECT s.id, s.workspace_id, s.course_item_id, ci.title AS item_title,
                       s.student_id, u.full_name AS student_name, u.email AS student_email,
                       s.answer_markdown, s.status, s.score, s.feedback, s.graded_by,
                       s.submitted_at, s.graded_at
                FROM course_item_submissions s
                JOIN course_items ci ON ci.id = s.course_item_id
                JOIN users u ON u.id = s.student_id
                WHERE s.workspace_id = ?
                ORDER BY s.submitted_at DESC
                """, this::mapRow, workspaceId);
    }

    public EssaySubmissionView submitEssay(UUID workspaceId, UUID itemId, SubmitEssayRequest req) {
        access.requireWorkspaceMember(workspaceId);
        User actor = access.requireCurrentActiveUser();
        var workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if ("ARCHIVED".equalsIgnoreCase(workspace.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "Workspace is archived; essay submissions are closed");
        }

        var item = courseItems.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course essay item not found"));
        if (item.getModule() == null
                || item.getModule().getCourse() == null
                || item.getModule().getCourse().getWorkspace() == null
                || !workspaceId.equals(item.getModule().getCourse().getWorkspace().getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Course item does not belong to this workspace");
        }
        if (!"ESSAY".equals(item.getItemType())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Course item is not an ESSAY assignment");
        }
        String markdown = req == null || req.answerMarkdown() == null ? "" : req.answerMarkdown().trim();
        if (markdown.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Essay answer cannot be blank");
        }

        OffsetDateTime now = OffsetDateTime.now();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO course_item_submissions (
                    id, workspace_id, course_item_id, student_id, answer_markdown,
                    status, score, feedback, graded_by, submitted_at, graded_at
                )
                VALUES (?, ?, ?, ?, ?, 'SUBMITTED', NULL, NULL, NULL, ?, NULL)
                ON CONFLICT (course_item_id, student_id) DO UPDATE
                SET answer_markdown = EXCLUDED.answer_markdown,
                    status = 'SUBMITTED',
                    score = NULL,
                    feedback = NULL,
                    graded_by = NULL,
                    graded_at = NULL,
                    submitted_at = EXCLUDED.submitted_at
                """, id, workspaceId, itemId, actor.getId(), markdown, now);

        return jdbc.query("""
                SELECT s.id, s.workspace_id, s.course_item_id, ci.title AS item_title,
                       s.student_id, u.full_name AS student_name, u.email AS student_email,
                       s.answer_markdown, s.status, s.score, s.feedback, s.graded_by,
                       s.submitted_at, s.graded_at
                FROM course_item_submissions s
                JOIN course_items ci ON ci.id = s.course_item_id
                JOIN users u ON u.id = s.student_id
                WHERE s.workspace_id = ? AND s.course_item_id = ? AND s.student_id = ?
                """, this::mapRow, workspaceId, itemId, actor.getId())
                .stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to load saved essay submission"));
    }

    public EssaySubmissionView gradeEssay(UUID workspaceId, UUID submissionId, GradeEssayRequest req) {
        access.requireWorkspaceLecturer(workspaceId);
        User lecturer = access.requireCurrentActiveUser();
        if (req == null || req.score() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Score is required");
        }
        String nextStatus = (req.status() != null && ("RETURNED".equalsIgnoreCase(req.status().trim()) || "GRADED".equalsIgnoreCase(req.status().trim())))
                ? req.status().trim().toUpperCase(java.util.Locale.ROOT)
                : "GRADED";
        OffsetDateTime now = OffsetDateTime.now();
        int updated = jdbc.update("""
                UPDATE course_item_submissions
                SET score = ?, feedback = ?, status = ?, graded_by = ?, graded_at = ?
                WHERE id = ? AND workspace_id = ?
                """, req.score(), req.feedback(), nextStatus, lecturer.getId(), now, submissionId, workspaceId);
        if (updated == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Essay submission not found");
        }
        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                lecturer.getId(), "COURSE_ESSAY_GRADED", "COURSE_ITEM_SUBMISSION", submissionId);

        return jdbc.query("""
                SELECT s.id, s.workspace_id, s.course_item_id, ci.title AS item_title,
                       s.student_id, u.full_name AS student_name, u.email AS student_email,
                       s.answer_markdown, s.status, s.score, s.feedback, s.graded_by,
                       s.submitted_at, s.graded_at
                FROM course_item_submissions s
                JOIN course_items ci ON ci.id = s.course_item_id
                JOIN users u ON u.id = s.student_id
                WHERE s.id = ? AND s.workspace_id = ?
                """, this::mapRow, submissionId, workspaceId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Essay submission not found"));
    }

    private boolean isWorkspaceLecturer(UUID workspaceId, UUID userId) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM workspace_members
                WHERE workspace_id = ? AND user_id = ? AND member_role = 'LECTURER'
                """, Integer.class, workspaceId, userId);
        return count != null && count > 0;
    }

    private EssaySubmissionView mapRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new EssaySubmissionView(
                rs.getObject("id", UUID.class),
                rs.getObject("workspace_id", UUID.class),
                rs.getObject("course_item_id", UUID.class),
                rs.getString("item_title"),
                rs.getObject("student_id", UUID.class),
                rs.getString("student_name"),
                rs.getString("student_email"),
                rs.getString("answer_markdown"),
                rs.getString("status"),
                rs.getBigDecimal("score"),
                rs.getString("feedback"),
                rs.getObject("graded_by", UUID.class),
                rs.getObject("submitted_at", OffsetDateTime.class),
                rs.getObject("graded_at", OffsetDateTime.class));
    }
}
