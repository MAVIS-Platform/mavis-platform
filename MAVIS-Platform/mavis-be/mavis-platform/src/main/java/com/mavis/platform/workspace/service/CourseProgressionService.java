package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Entry point for the server-side C04 grading workflow after it has verified all required Snapshot grades. */
@Service
@RequiredArgsConstructor
public class CourseProgressionService {
    private final JdbcTemplate jdbc;
    private final WorkspaceRepository workspaces;

    @Transactional
    public void recordFinalizedResult(UUID submissionId, long reviewRevision, boolean passed) {
        if (submissionId == null || reviewRevision < 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "A submission and finalized review revision are required");
        }
        UUID workspaceId = jdbc.queryForList("""
                SELECT a.workspace_id FROM submission_snapshots s
                JOIN assignments a ON a.id = s.assignment_id
                WHERE s.id = ? AND a.lab_order IS NOT NULL
                """, UUID.class, submissionId).stream().findFirst().orElse(null);
        if (workspaceId == null) {
            if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM submission_snapshots WHERE id = ?)
                    """, Boolean.class, submissionId))) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "Submission not found");
            }
            return; // Existing coursework uses its original grading and access rules.
        }
        workspaces.findLockedById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        int changed = jdbc.update("""
                INSERT INTO course_lab_results (assignment_id, student_id, submission_id, review_revision, passed)
                SELECT s.assignment_id, s.submitted_by, s.id, r.revision, ?
                FROM submission_snapshots s JOIN submission_reviews r ON r.submission_id = s.id
                JOIN assignments a ON a.id = s.assignment_id
                JOIN workspaces w ON w.id = a.workspace_id
                JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = s.submitted_by
                JOIN users u ON u.id = s.submitted_by
                JOIN roles student_role ON student_role.id = u.role_id
                WHERE w.status = 'ACTIVE' AND m.member_role = 'STUDENT'
                AND u.status = 'ACTIVE' AND student_role.code = 'STUDENT'
                AND NOT EXISTS (
                    SELECT 1 FROM assignments prior
                    WHERE prior.workspace_id = w.id AND prior.lab_order < a.lab_order
                    AND NOT EXISTS (
                        SELECT 1 FROM course_lab_results completed
                        WHERE completed.assignment_id = prior.id AND completed.student_id = s.submitted_by
                        AND completed.passed
                    )
                )
                AND s.id = ? AND r.revision = ? AND r.status = 'GRADED' AND btrim(r.summary) <> ''
                AND NOT EXISTS (
                    SELECT 1 FROM submission_snapshots newer
                    WHERE newer.assignment_id = s.assignment_id AND newer.submitted_by = s.submitted_by
                    AND (newer.submitted_at, newer.id) > (s.submitted_at, s.id)
                )
                ON CONFLICT (assignment_id, student_id) DO UPDATE
                SET submission_id = EXCLUDED.submission_id,
                    review_revision = EXCLUDED.review_revision, passed = EXCLUDED.passed
                WHERE NOT course_lab_results.passed AND
                    (course_lab_results.submission_id <> EXCLUDED.submission_id
                        OR course_lab_results.review_revision < EXCLUDED.review_revision)
                """, passed, submissionId, reviewRevision);
        if (changed == 0 && !Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM course_lab_results
                WHERE submission_id = ? AND review_revision = ? AND passed = ?)
                """, Boolean.class, submissionId, reviewRevision, passed))) {
            throw new BusinessException(ErrorCode.CONFLICT, "The finalized Lab result is stale or invalid");
        }
        if (changed > 0 && passed) {
            jdbc.queryForList("""
                    SELECT mavis_notify(s.submitted_by, 'course-lab-unlocked:' || upcoming.id, 'ASSIGNMENT',
                        'Next Lab unlocked', upcoming.title || ' is now available.',
                        '/workspaces?workspace=' || finished.workspace_id)
                    FROM submission_snapshots s JOIN assignments finished ON finished.id = s.assignment_id
                    JOIN assignments upcoming ON upcoming.workspace_id = finished.workspace_id
                        AND upcoming.lab_order = finished.lab_order + 1
                    WHERE s.id = ?
                    """, submissionId);
        }
    }
}
