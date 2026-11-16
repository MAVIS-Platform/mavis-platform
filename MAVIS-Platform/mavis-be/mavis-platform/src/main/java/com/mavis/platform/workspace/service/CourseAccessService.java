package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.AuthorizationRequestCache;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class CourseAccessService {
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final AssignmentRepository assignments;
    private final CourseLabPolicy labs;
    private final JdbcTemplate jdbc;
    private final LabReferenceArchive referenceArchive;
    private final RuntimeConfigurationRepository configurations;

    public record Lab(UUID assignmentId, int position, String title, String state, String reason) {}
    public record Roadmap(boolean guided, String enrollmentStatus, List<Lab> labs) {}
    public record Passkey(String code, OffsetDateTime expiresAt) {}
    public record KeyStatus(OffsetDateTime expiresAt, boolean active, Integer maxStudents, int enrolledStudents) {}
    public record Enrollment(UUID workspaceId) {}

    public Lab publish(UUID workspaceId, UUID assignmentId) {
        Workspace workspace = manage(workspaceId);
        Assignment assignment = assignments.findLockedById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
        if (assignment.getLabOrder() != null) {
            copyTopologySnapshot(assignment);
            assignments.save(assignment);
            return new Lab(assignmentId, assignment.getLabOrder(), assignment.getTitle(), "UNLOCKED", null);
        }
        var model = assignment.getReferenceModel();
        var snapshot = model == null ? null : model.getSourceSnapshot();
        if (snapshot == null || !Boolean.TRUE.equals(snapshot.getIsPublished())
                || snapshot.getProject().getWorkspace() == null
                || !"TEACHER_REFERENCE".equals(snapshot.getProject().getProjectType())
                || !Boolean.TRUE.equals(snapshot.getProject().getIsReferenceTemplate())
                || !workspaceId.equals(snapshot.getProject().getWorkspace().getId())
                || snapshot.getArtifactHash() == null || !snapshot.getArtifactHash().matches("[a-fA-F0-9]{64}")
                || snapshot.getStoragePath() == null || snapshot.getStoragePath().isBlank()
                || "DELETED".equals(snapshot.getProject().getStatus())
                || ("GITHUB_COMMIT".equals(snapshot.getSourceType())
                    && (snapshot.getCommitSha() == null || !snapshot.getCommitSha().matches("[a-fA-F0-9]{40}")))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Attach a published reference model and a pinned source archive before publishing the Lab");
        }
        referenceArchive.resolve(snapshot, true);
        int next = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)
                .stream().mapToInt(Assignment::getLabOrder).max().orElse(0) + 1;
        assignment.setLabOrder(next);
        copyTopologySnapshot(assignment);
        workspace.setCourseMode(true);
        audit("COURSE_LAB_PUBLISHED", "ASSIGNMENT", assignmentId);
        return new Lab(assignmentId, next, assignment.getTitle(), "UNLOCKED", null);
    }

    /**
     * Copies the prepared topology from the reference runtime profile into the
     * published Lab. A later edit of the reference profile cannot change this Lab.
     */
    public Lab freezeTopology(UUID workspaceId, UUID assignmentId) {
        manage(workspaceId);
        Assignment assignment = assignments.findLockedById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
        if (assignment.getLabOrder() == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "Publish the Lab before freezing its Studio topology");
        }
        copyTopologySnapshot(assignment);
        if (assignment.getStudioTopologySnapshot() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "The reference runtime profile has no prepared Studio topology for this source/model");
        }
        assignments.save(assignment);
        audit("COURSE_LAB_TOPOLOGY_FROZEN", "ASSIGNMENT", assignmentId);
        return new Lab(assignmentId, assignment.getLabOrder(), assignment.getTitle(), "UNLOCKED", null);
    }

    private void copyTopologySnapshot(Assignment assignment) {
        var model = assignment.getReferenceModel();
        var snapshot = model == null ? null : model.getSourceSnapshot();
        if (model == null || snapshot == null || snapshot.getProject() == null) return;
        RuntimeConfiguration configuration = configurations.findById(snapshot.getProject().getId()).orElse(null);
        if (configuration == null
                || !snapshot.getId().equals(configuration.getSourceSnapshotId())
                || !model.getId().equals(configuration.getModelVersionId())
                || configuration.getProfile() == null) return;
        JsonNode topology = configuration.getProfile().get("studioTopology");
        if (topology != null && topology.isObject()) {
            assignment.setStudioTopologySnapshot(topology.deepCopy());
            assignment.setStudioTopologyRevision(configuration.getRevision());
        }
    }

    public Passkey issue(UUID workspaceId, int validHours) { return issue(workspaceId, validHours, null); }
    public Passkey issue(UUID workspaceId, int validHours, Integer maxStudents) {
        Workspace workspace = manage(workspaceId);
        if (maxStudents != null) workspace.setMaxStudents(maxStudents);
        if (!workspace.isCourseMode()) {
            throw new BusinessException(ErrorCode.CONFLICT, "Publish the first Lab before issuing a Passkey");
        }
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        OffsetDateTime expires = OffsetDateTime.now().plusHours(validHours);
        jdbc.update("""
                INSERT INTO course_passkeys (workspace_id, digest, expires_at)
                VALUES (?, ?, ?)
                ON CONFLICT (workspace_id) DO UPDATE
                SET digest = EXCLUDED.digest, expires_at = EXCLUDED.expires_at, revoked_at = NULL
                """, workspaceId, digest(code), expires);
        audit("COURSE_PASSKEY_ISSUED", "WORKSPACE", workspaceId);
        return new Passkey(code, expires);
    }

    @Transactional(readOnly = true)
    public KeyStatus keyStatus(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        int enrolled = jdbc.queryForObject("SELECT count(*) FROM workspace_members WHERE workspace_id=? AND member_role='STUDENT'", Integer.class, workspaceId);
        return jdbc.query("""
                SELECT k.expires_at, k.revoked_at IS NULL AND k.expires_at > now()
                       AND w.status = 'ACTIVE' AS active
                FROM course_passkeys k JOIN workspaces w ON w.id = k.workspace_id
                WHERE k.workspace_id = ?
                """, (rs, row) -> new KeyStatus(rs.getObject("expires_at", OffsetDateTime.class),
                rs.getBoolean("active"), workspaces.findById(workspaceId).map(Workspace::getMaxStudents).orElse(null), enrolled), workspaceId)
                .stream().findFirst().orElse(new KeyStatus(null, false,
                        workspaces.findById(workspaceId).map(Workspace::getMaxStudents).orElse(null), enrolled));
    }

    public void revoke(UUID workspaceId) {
        manage(workspaceId);
        int changed = jdbc.update("""
                UPDATE course_passkeys SET revoked_at = now() WHERE workspace_id = ? AND revoked_at IS NULL
                """, workspaceId);
        if (changed > 0) audit("COURSE_PASSKEY_REVOKED", "WORKSPACE", workspaceId);
    }

    public Enrollment redeem(String code, UUID requestId) {
        User actor = access.requireCurrentActiveUser();
        if (!CourseLabPolicy.isStudent(actor)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Only students can redeem a course Passkey");
        }
        passkeyRateCheck(actor.getId());
        String keyDigest = digest(code);
        UUID prior = replay(actor.getId(), requestId, keyDigest);
        if (prior != null) {
            return new Enrollment(prior);
        }
        UUID workspaceId = jdbc.queryForList("SELECT workspace_id FROM course_passkeys WHERE digest = ?",
                        UUID.class, keyDigest)
                .stream().findFirst().orElseThrow(() -> { passkeyFailure(actor.getId()); return invalidKey(); });
        Workspace workspace = lock(workspaceId);
        prior = replay(actor.getId(), requestId, keyDigest);
        if (prior != null) {
            return new Enrollment(prior);
        }
        boolean valid = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM course_passkeys WHERE workspace_id = ? AND digest = ?
                AND revoked_at IS NULL AND expires_at > statement_timestamp())
                """, Boolean.class, workspaceId, keyDigest));
        if (!valid || !workspace.isCourseMode() || !"ACTIVE".equals(workspace.getStatus())) {
            passkeyFailure(actor.getId());
            throw invalidKey();
        }
        Integer capacity = workspace.getMaxStudents();
        if (capacity != null && jdbc.queryForObject("SELECT count(*) FROM workspace_members WHERE workspace_id=? AND member_role='STUDENT'", Integer.class, workspaceId) >= capacity)
            throw new BusinessException(ErrorCode.CONFLICT, "COURSE_CAPACITY_REACHED", "This course has reached its student capacity");
        int added = jdbc.update("""
                INSERT INTO workspace_members (workspace_id, user_id, member_role,
                    enrollment_request_id, enrollment_key_digest)
                VALUES (?, ?, 'STUDENT', ?, ?)
                ON CONFLICT (workspace_id, user_id) DO NOTHING
                """, workspaceId, actor.getId(), requestId, keyDigest);
        if (added == 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "ALREADY_ENROLLED", "Already enrolled in this course");
        }
        AuthorizationRequestCache.evictMembership(workspaceId, actor.getId());
        jdbc.update("DELETE FROM auth_rate_limits WHERE scope='PASSKEY' AND subject_digest=?", digest(actor.getId().toString()));
        audit("COURSE_ENROLLED", "WORKSPACE", workspaceId);
        return new Enrollment(workspaceId);
    }

    @Transactional(readOnly = true)
    public Roadmap roadmap(UUID workspaceId) {
        access.requireWorkspaceMember(workspaceId);
        User actor = access.requireCurrentActiveUser();
        Workspace workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if (!workspace.isCourseMode()) {
            return new Roadmap(false, null, List.of());
        }
        boolean student = CourseLabPolicy.isStudent(actor);
        var passed = student ? labs.passedAssignments(workspaceId, actor.getId()) : Set.<UUID>of();
        var assignmentsInOrder = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
        List<Lab> result = new ArrayList<>();
        boolean nextOpen = "ACTIVE".equals(workspace.getStatus());
        for (var assignment : assignmentsInOrder) {
            boolean completed = passed.contains(assignment.getId());
            String state = !student ? "UNLOCKED" : completed ? "PASSED" : nextOpen ? "UNLOCKED" : "LOCKED";
            String reason = "LOCKED".equals(state)
                    ? "ACTIVE".equals(workspace.getStatus()) ? "PREREQUISITE" : "COURSE_ARCHIVED" : null;
            result.add(new Lab(assignment.getId(), assignment.getLabOrder(), assignment.getTitle(), state, reason));
            nextOpen = nextOpen && completed;
        }
        if (!student) return new Roadmap(true, null, result);
        boolean started = !passed.isEmpty() || Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM projects p JOIN assignments a ON a.id = p.assignment_id
                    WHERE p.workspace_id = ? AND p.owner_id = ? AND p.project_type = 'STUDENT_WORKING'
                    AND p.status <> 'DELETED' AND a.lab_order IS NOT NULL
                )
                """, Boolean.class, workspaceId, actor.getId()));
        String status = !result.isEmpty() && result.stream().allMatch(item -> "PASSED".equals(item.state()))
                ? "COMPLETED" : started ? "IN_PROGRESS" : "ENROLLED";
        return new Roadmap(true, status, result);
    }

    private UUID replay(UUID actor, UUID requestId, String keyDigest) {
        if (requestId == null) {
            return null;
        }
        return jdbc.queryForList("""
                SELECT m.workspace_id FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
                WHERE m.user_id = ? AND m.enrollment_request_id = ? AND m.enrollment_key_digest = ?
                AND w.status = 'ACTIVE'
                """, UUID.class, actor, requestId, keyDigest).stream().findFirst().orElse(null);
    }

    private Workspace manage(UUID workspaceId) {
        access.requireCurrentActiveUser();
        Workspace workspace = lock(workspaceId);
        access.requireWorkspaceLecturer(workspaceId);
        if (!"ACTIVE".equals(workspace.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This workspace is archived");
        }
        return workspace;
    }

    private void audit(String action, String targetType, UUID targetId) {
        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                access.requireCurrentActiveUser().getId(), action, targetType, targetId);
    }

    private Workspace lock(UUID id) {
        return workspaces.findLockedById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    private static String digest(String key) {
        return HashUtils.sha256Hex(key.getBytes(StandardCharsets.UTF_8));
    }

    private static BusinessException invalidKey() {
        return new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_OR_EXPIRED_PASSKEY", "Invalid or expired Passkey");
    }
    private void passkeyRateCheck(UUID actor){Boolean blocked=jdbc.queryForObject("SELECT coalesce((SELECT blocked_until>now() FROM auth_rate_limits WHERE scope='PASSKEY' AND subject_digest=?),false)",Boolean.class,digest(actor.toString()));if(Boolean.TRUE.equals(blocked))throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS,"PASSKEY_RATE_LIMITED","Too many invalid Passkeys. Try again later");}
    private void passkeyFailure(UUID actor){jdbc.update("INSERT INTO auth_rate_limits(scope,subject_digest,attempts) VALUES ('PASSKEY',?,1) ON CONFLICT(scope,subject_digest) DO UPDATE SET attempts=auth_rate_limits.attempts+1,blocked_until=CASE WHEN auth_rate_limits.attempts+1>=5 THEN now()+interval '15 minutes' ELSE auth_rate_limits.blocked_until END",digest(actor.toString()));}
}
