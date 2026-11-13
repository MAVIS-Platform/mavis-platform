package com.mavis.common.security;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.Optional;
import java.time.OffsetDateTime;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CourseLabPolicy {
    private final JdbcTemplate jdbc;

    public boolean hasPassedCurrentQuiz(Assignment lab, UUID studentId) {
        return currentQuizPass(lab, studentId).isPresent();
    }

    public boolean hasPassedQuizVersion(UUID labId, UUID studentId, int version) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT FROM course_quiz_attempts
                    WHERE assignment_id = ? AND student_id = ? AND quiz_version = ? AND passed)
                """, Boolean.class, labId, studentId, version));
    }

    public record QuizPass(UUID attemptId, int quizVersion, int correctCount, int questionCount,
                           int passPercent, OffsetDateTime submittedAt) {}

    public Optional<QuizPass> currentQuizPass(Assignment lab, UUID studentId) {
        if (lab.getReferenceModel() == null) return Optional.empty();
        return jdbc.query("""
                SELECT a.attempt_id, a.quiz_version, a.correct_count, jsonb_array_length(q.questions),
                       q.pass_percent, a.submitted_at
                FROM course_quiz_attempts a
                JOIN course_quizzes q ON q.assignment_id = a.assignment_id AND q.version = a.quiz_version
                WHERE a.assignment_id = ? AND a.student_id = ? AND a.passed
                  AND q.version = (SELECT max(current.version) FROM course_quizzes current
                                   WHERE current.assignment_id = a.assignment_id AND current.reference_model_id = ?)
                ORDER BY a.submitted_at DESC, a.attempt_id DESC LIMIT 1
                """, (rs, row) -> new QuizPass(rs.getObject(1, UUID.class), rs.getInt(2), rs.getInt(3),
                rs.getInt(4), rs.getInt(5), rs.getObject(6, OffsetDateTime.class)),
                lab.getId(), studentId, lab.getReferenceModel().getId()).stream().findFirst();
    }

    public void requireRuntimeReadiness(Project project) {
        if (project.getWorkspace() == null || !project.getWorkspace().isCourseMode()
                || !"STUDENT_WORKING".equals(project.getProjectType())) return;
        var lab = project.getAssignment();
        var owner = project.getOwner();
        if (lab == null || owner == null || !project.getWorkspace().getId().equals(lab.getWorkspace().getId())
                || !canOpen(lab, owner) || !hasPassedCurrentQuiz(lab, owner.getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Pass the current Lab Quiz before starting Runtime");
        }
    }

    public Set<UUID> passedAssignments(UUID workspaceId, UUID studentId) {
        return Set.copyOf(jdbc.queryForList("""
                SELECT r.assignment_id FROM course_lab_results r
                JOIN assignments a ON a.id = r.assignment_id
                WHERE a.workspace_id = ? AND r.student_id = ? AND r.passed
                """, UUID.class, workspaceId, studentId));
    }

    public boolean canOpen(Assignment lab, User student) {
        if (lab.getLabOrder() == null || !"ACTIVE".equals(lab.getWorkspace().getStatus())) {
            return false;
        }
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM workspace_members m
                    WHERE m.workspace_id = ? AND m.user_id = ? AND m.member_role = 'STUDENT'
                ) AND NOT EXISTS (
                    SELECT 1 FROM assignments preceding
                    WHERE preceding.workspace_id = ? AND preceding.lab_order < ?
                    AND NOT EXISTS (
                        SELECT 1 FROM course_lab_results r
                        WHERE r.assignment_id = preceding.id AND r.student_id = ? AND r.passed
                    )
                )
                """, Boolean.class, lab.getWorkspace().getId(), student.getId(),
                lab.getWorkspace().getId(), lab.getLabOrder(), student.getId()));
    }

    public void requireOpen(Assignment lab, User student) {
        if (!canOpen(lab, student)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Complete the preceding Lab to access this Lab");
        }
    }

    public static boolean isStudent(User user) {
        return user.getRole() != null && "STUDENT".equalsIgnoreCase(user.getRole().getCode());
    }

    public static boolean isGuidedStaticStudent(ModelVersion model, AccessPolicyService access) {
        var workspace = model.getProject().getWorkspace();
        return workspace != null && workspace.isCourseMode()
                && !"RUNTIME_ENRICHED".equals(model.getOrigin()) && isStudent(access.requireCurrentActiveUser());
    }
}
