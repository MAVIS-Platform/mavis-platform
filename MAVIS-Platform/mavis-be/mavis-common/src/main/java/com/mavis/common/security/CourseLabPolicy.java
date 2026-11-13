package com.mavis.common.security;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CourseLabPolicy {
    private final JdbcTemplate jdbc;

    public boolean hasPassedCurrentQuiz(Assignment lab, UUID studentId) {
        if (lab.getReferenceModel() == null) return false;
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM course_quiz_attempts a
                    WHERE a.assignment_id = ? AND a.student_id = ? AND a.passed
                    AND a.quiz_version = (SELECT max(q.version) FROM course_quizzes q
                        WHERE q.assignment_id = a.assignment_id AND q.reference_model_id = ?)
                )
                """, Boolean.class, lab.getId(), studentId, lab.getReferenceModel().getId()));
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
}
