package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import com.mavis.platform.workspace.curriculum.CsharpCourseraCatalog;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final CoursePasskeyFailureRecorder passkeyFailures;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.mavis.common.repository.RuntimeSessionRepository runtimeSessions;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.mavis.common.repository.LabStudioExerciseRepository labStudioExercises;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.mavis.common.repository.SourceSnapshotRepository sourceSnapshots;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.mavis.common.repository.ModelVersionRepository modelVersions;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.mavis.common.repository.LabTheoryAssetRepository labTheoryAssets;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    @org.springframework.context.annotation.Lazy
    private CourseLabSeederService seeder;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.springframework.context.ApplicationEventPublisher events;

    public record Lab(UUID assignmentId, int position, String title, String state, String reason) {}
    public record Roadmap(boolean guided, String enrollmentStatus, List<Lab> labs) {}
    public record Passkey(String code, OffsetDateTime expiresAt) {}
    public record KeyStatus(OffsetDateTime expiresAt, boolean active, Integer maxStudents, int enrolledStudents, String code) {
        public KeyStatus(OffsetDateTime expiresAt, boolean active, Integer maxStudents, int enrolledStudents) {
            this(expiresAt, active, maxStudents, enrolledStudents, null);
        }
    }
    public record PasskeyItem(
            UUID id,
            UUID workspaceId,
            String code,
            String label,
            OffsetDateTime expiresAt,
            OffsetDateTime revokedAt,
            boolean active,
            Integer maxUses,
            int usedCount,
            OffsetDateTime createdAt
    ) {}
    public record CreatePasskeyRequest(
            String customCode,
            String label,
            Integer validHours,
            Integer maxUses
    ) {}
    public record UpdatePasskeyRequest(
            String customCode,
            String label,
            Integer validHours,
            Integer maxUses,
            Boolean active
    ) {}
    public record Enrollment(UUID workspaceId) {}

    public Lab publish(UUID workspaceId, UUID assignmentId) {
        Workspace workspace = manage(workspaceId);
        Assignment assignment = assignments.findLockedById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
        if (assignment.getLabOrder() != null) {
            if (assignment.getStudioTopologySnapshot() == null && copyTopologySnapshot(assignment)) {
                assignments.save(assignment);
            }
            return new Lab(assignmentId, assignment.getLabOrder(), assignment.getTitle(), "UNLOCKED", null);
        }
        var model = assignment.getReferenceModel();
        if (model == null) {
            boolean hasTheoryAsset = labTheoryAssets != null
                    && !labTheoryAssets.findByAssignmentIdOrderByPositionAsc(assignmentId).isEmpty();
            if ((assignment.getDescription() == null || assignment.getDescription().isBlank()) && !hasTheoryAsset) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Add a Lab description, attach a Theory lesson, or pin a published Reference Source before publishing the Lab");
            }
            assignment.setRequireRuntimeTrace(false);
        } else {
            var snapshot = model.getSourceSnapshot();
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
        }
        String explicitTier = assignment.getAiPolicy() == null ? "" : assignment.getAiPolicy().path("labTier").asText("");
        boolean explicitNonStudio = ("THEORY_ONLY".equalsIgnoreCase(explicitTier) || "THEORY_QUIZ".equalsIgnoreCase(explicitTier))
                && !Boolean.TRUE.equals(assignment.getRequireRuntimeTrace())
                && (labStudioExercises == null || labStudioExercises.findByAssignmentId(assignmentId).isEmpty());
        if (!explicitNonStudio) {
            copyTopologySnapshot(assignment);
            copyExerciseSnapshot(assignment);
        }
        if (assignment.getStudioExerciseSnapshot() != null && assignment.getStudioTopologySnapshot() == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "STUDIO_READINESS_BLOCKED",
                    "Studio Live exercise is configured, but Docker runtime topology is not ready yet. Run Sync Docker in Step 5 before publishing.");
        }
        int next = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)
                .stream().mapToInt(Assignment::getLabOrder).max().orElse(0) + 1;
        assignment.setLabOrder(next);
        syncDerivedLabComposition(assignment);
        workspace.setCourseMode(true);
        audit("COURSE_LAB_PUBLISHED", "ASSIGNMENT", assignmentId);
        if (events != null) {
            var runtimeModel = resolveStudioRuntimeModel(assignment);
            if (runtimeModel != null && runtimeModel.getSourceSnapshot() != null
                    && runtimeModel.getSourceSnapshot().getProject() != null) {
                events.publishEvent(new com.mavis.common.event.LabPublishedEvent(
                        assignmentId,
                        runtimeModel.getSourceSnapshot().getProject().getId(),
                        runtimeModel.getSourceSnapshot().getId()));
            }
        }
        return new Lab(assignmentId, next, assignment.getTitle(), "UNLOCKED", null);
    }

    private void syncDerivedLabComposition(Assignment assignment) {
        if ("LEGACY".equalsIgnoreCase(assignment.getLabMode())) {
            return;
        }
        boolean hasReference = assignment.getReferenceModel() != null;
        boolean hasStudio = hasReference
                && (assignment.getStudioTopologySnapshot() != null || Boolean.TRUE.equals(assignment.getRequireRuntimeTrace()));
        boolean hasQuiz = hasPublishedQuiz(assignment.getId());
        assignment.setRequireRuntimeTrace(hasStudio);
        assignment.setLabMode(hasStudio ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ");
        ObjectNode policy = assignment.getAiPolicy() instanceof ObjectNode existing
                ? existing.deepCopy()
                : JsonNodeFactory.instance.objectNode();
        if (hasStudio) {
            policy.put("labTier", "THEORY_QUIZ_STUDIO");
            policy.put("skipQuiz", false);
        } else if (hasQuiz) {
            policy.put("labTier", "THEORY_QUIZ");
            policy.put("skipQuiz", false);
        } else {
            policy.put("labTier", "THEORY_ONLY");
            policy.put("skipQuiz", true);
        }
        assignment.setAiPolicy(policy);
    }

    private boolean hasPublishedQuiz(UUID assignmentId) {
        if (jdbc == null || assignmentId == null) return false;
        Integer version = jdbc.queryForObject(
                "SELECT coalesce(max(version), 0) FROM course_quizzes WHERE assignment_id = ?",
                Integer.class,
                assignmentId);
        return version != null && version > 0;
    }

    /**
     * Copies the prepared topology from the reference runtime profile into the
     * published Lab. A later edit of the reference profile cannot change this Lab.
     */
    public Lab freezeTopology(UUID workspaceId, UUID assignmentId) {
        return freezeTopology(workspaceId, assignmentId, null);
    }

    public Lab freezeTopology(UUID workspaceId, UUID assignmentId, UUID sessionId) {
        manage(workspaceId);
        Assignment assignment = assignments.findLockedById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
        if (assignment.getLabOrder() == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "Publish the Lab before freezing its Studio topology");
        }
        if (Boolean.TRUE.equals(assignment.getRequireRuntimeTrace())
                && assignment.getStudioExerciseSnapshot() != null
                && sessionId == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "STUDIO_VALIDATION_REQUIRED",
                    "Run a verified Studio validation session before freezing this Lab's exercise");
        }
        if (sessionId != null) {
            if (runtimeSessions == null) {
                throw new BusinessException(ErrorCode.CONFLICT, "Studio session verification is unavailable");
            }
            var session = runtimeSessions.findById(sessionId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Studio session not found"));
            if (session.getAssignment() == null || !session.getAssignment().getId().equals(assignmentId)) {
                throw new BusinessException(ErrorCode.CONFLICT, "Studio session does not belong to this Lab");
            }
            var exercise = labStudioExercises == null ? null
                    : labStudioExercises.findByAssignmentId(assignmentId).orElse(null);
            if (exercise != null && exercise.getRuntimeSnapshotId() != null) {
                // Guided sessions run on a cloned STUDENT_WORKING model/snapshot, so compare the
                // artifact identity of the exercise runtime snapshot instead of object ids.
                var runtimeSnapshot = sourceSnapshots == null ? null
                        : sourceSnapshots.findById(exercise.getRuntimeSnapshotId()).orElse(null);
                if (session.getModelVersion() == null
                        || runtimeSnapshot == null
                        || session.getSourceSnapshot() == null
                        || !java.util.Objects.equals(runtimeSnapshot.getArtifactHash(),
                                session.getSourceSnapshot().getArtifactHash())) {
                    throw new BusinessException(ErrorCode.CONFLICT, "Studio session source does not match this Lab");
                }
            } else {
                var referenceModel = assignment.getReferenceModel();
                var referenceSnapshot = referenceModel == null ? null : referenceModel.getSourceSnapshot();
                boolean clonedWorkingMatch = referenceSnapshot != null
                        && session.getSourceSnapshot() != null
                        && referenceSnapshot.getArtifactHash() != null
                        && java.util.Objects.equals(referenceSnapshot.getArtifactHash(),
                                session.getSourceSnapshot().getArtifactHash())
                        && ((session.getProject() != null
                                && java.util.Objects.equals(referenceSnapshot.getId(),
                                        session.getProject().getReferenceSnapshotId()))
                                || (session.getSourceSnapshot().getProject() != null
                                        && java.util.Objects.equals(referenceSnapshot.getId(),
                                                session.getSourceSnapshot().getProject().getReferenceSnapshotId())));
                if (referenceModel == null || session.getModelVersion() == null
                        || (!referenceModel.getId().equals(session.getModelVersion().getId()) && !clonedWorkingMatch)) {
                    throw new BusinessException(ErrorCode.CONFLICT, "Studio session model does not match this Lab");
                }
                if (referenceSnapshot != null && (session.getSourceSnapshot() == null
                        || (!referenceSnapshot.getId().equals(session.getSourceSnapshot().getId()) && !clonedWorkingMatch))) {
                    throw new BusinessException(ErrorCode.CONFLICT, "Studio session source does not match this Lab");
                }
            }
            if (!session.hasVerifiedStudioEvidence()) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "Studio session has no verified Stop/Start/Scale evidence");
            }
        }
        if (!copyTopologySnapshot(assignment)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "The reference runtime profile has no prepared Studio topology for this source/model");
        }
        copyExerciseSnapshot(assignment);
        assignments.save(assignment);
        audit("COURSE_LAB_TOPOLOGY_FROZEN", "ASSIGNMENT", assignmentId);
        return new Lab(assignmentId, assignment.getLabOrder(), assignment.getTitle(), "UNLOCKED", null);
    }

    private void copyExerciseSnapshot(Assignment assignment) {
        if (labStudioExercises == null) return;
        labStudioExercises.findByAssignmentId(assignment.getId()).ifPresent(exercise -> {
            ObjectNode snapshot = JsonNodeFactory.instance.objectNode();
            snapshot.put("runtimeProjectId",
                    exercise.getRuntimeProjectId() == null ? null : exercise.getRuntimeProjectId().toString());
            snapshot.put("runtimeModelId",
                    exercise.getRuntimeModelId() == null ? null : exercise.getRuntimeModelId().toString());
            snapshot.put("runtimeSnapshotId",
                    exercise.getRuntimeSnapshotId() == null ? null : exercise.getRuntimeSnapshotId().toString());
            snapshot.set("baselineRequests", exercise.getBaselineRequests());
            snapshot.set("initialState", exercise.getInitialState());
            snapshot.set("allowedActions", exercise.getAllowedActions());
            snapshot.set("successCriteria", exercise.getSuccessCriteria());
            snapshot.put("instructions", exercise.getInstructions());
            snapshot.put("revision", exercise.getRevision());
            assignment.setStudioExerciseSnapshot(snapshot);
            assignment.setStudioExerciseRevision(exercise.getRevision());
        });
    }

    private boolean copyTopologySnapshot(Assignment assignment) {
        var model = resolveStudioRuntimeModel(assignment);
        var snapshot = model == null ? null : model.getSourceSnapshot();
        if (model == null || snapshot == null || snapshot.getProject() == null) return false;
        RuntimeConfiguration configuration = configurations.findById(snapshot.getProject().getId()).orElse(null);
        if (configuration == null
                || !snapshot.getId().equals(configuration.getSourceSnapshotId())
                || !model.getId().equals(configuration.getModelVersionId())
                || configuration.getProfile() == null) return false;
        JsonNode topology = configuration.getProfile().get("studioTopology");
        if (topology == null || !topology.isObject()) return false;
        assignment.setStudioTopologySnapshot(topology.deepCopy());
        assignment.setStudioTopologyRevision(configuration.getRevision());
        return true;
    }

    private com.mavis.common.entity.ModelVersion resolveStudioRuntimeModel(Assignment assignment) {
        if (labStudioExercises != null && modelVersions != null && assignment.getId() != null) {
            var exercise = labStudioExercises.findByAssignmentId(assignment.getId()).orElse(null);
            if (exercise != null && exercise.getRuntimeModelId() != null) {
                var runtimeModel = modelVersions.findById(exercise.getRuntimeModelId()).orElse(null);
                if (runtimeModel != null && runtimeModel.getSourceSnapshot() != null
                        && runtimeModel.getSourceSnapshot().getProject() != null) {
                    return runtimeModel;
                }
            }
        }
        return assignment.getReferenceModel();
    }

    @Transactional(readOnly = true)
    public List<PasskeyItem> listPasskeys(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        return jdbc.query("""
                SELECT id, workspace_id, code, label, expires_at, revoked_at, is_active, max_uses, used_count, created_at
                FROM course_passkeys
                WHERE workspace_id = ?
                ORDER BY created_at DESC, expires_at DESC
                """, (rs, rowNum) -> {
            OffsetDateTime expiresAt = rs.getObject("expires_at", OffsetDateTime.class);
            OffsetDateTime revokedAt = rs.getObject("revoked_at", OffsetDateTime.class);
            boolean isActiveFlag = rs.getBoolean("is_active");
            Integer maxUses = rs.getObject("max_uses", Integer.class);
            int usedCount = rs.getInt("used_count");
            boolean withinQuota = maxUses == null || usedCount < maxUses;
            boolean active = isActiveFlag
                    && revokedAt == null
                    && expiresAt != null
                    && expiresAt.isAfter(OffsetDateTime.now())
                    && withinQuota;
            return new PasskeyItem(
                    rs.getObject("id", UUID.class),
                    rs.getObject("workspace_id", UUID.class),
                    rs.getString("code"),
                    rs.getString("label"),
                    expiresAt,
                    revokedAt,
                    active,
                    maxUses,
                    usedCount,
                    rs.getObject("created_at", OffsetDateTime.class));
        }, workspaceId);
    }

    public PasskeyItem createPasskey(UUID workspaceId, CreatePasskeyRequest req) {
        Workspace workspace = manage(workspaceId);
        workspace.setCourseMode(true);
        workspaces.save(workspace);

        int validHours = (req != null && req.validHours() != null && req.validHours() > 0)
                ? req.validHours()
                : 720;
        String label = (req != null && req.label() != null && !req.label().isBlank())
                ? req.label().trim()
                : "Mã ghi danh lớp học";
        Integer maxUses = req != null ? req.maxUses() : null;
        if (maxUses != null && maxUses < 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Max uses must be at least 1");
        }

        String code;
        if (req != null && req.customCode() != null && !req.customCode().isBlank()) {
            code = req.customCode().trim();
            if (!code.matches("[A-Za-z0-9_-]{4,32}")) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_PASSKEY_FORMAT",
                        "Passkey code must be 4-32 alphanumeric characters, hyphens, or underscores");
            }
        } else {
            code = "MAVIS-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        }

        String keyDigest = digest(code);
        List<UUID> conflict = jdbc.queryForList(
                "SELECT id FROM course_passkeys WHERE digest = ?",
                UUID.class, keyDigest);
        if (!conflict.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT, "PASSKEY_ALREADY_EXISTS",
                    "This passkey code is already in use");
        }

        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime expires = now.plusHours(validHours);
        jdbc.update("""
                INSERT INTO course_passkeys (id, workspace_id, code, label, digest, expires_at, max_uses, used_count, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, TRUE, ?)
                """, id, workspaceId, code, label, keyDigest, expires, maxUses, now);
        audit("COURSE_PASSKEY_CREATED", "WORKSPACE", workspaceId);
        return new PasskeyItem(id, workspaceId, code, label, expires, null, true, maxUses, 0, now);
    }

    public PasskeyItem updatePasskey(UUID workspaceId, UUID passkeyId, UpdatePasskeyRequest req) {
        manage(workspaceId);
        PasskeyItem existing = jdbc.query("""
                SELECT id, workspace_id, code, label, expires_at, revoked_at, is_active, max_uses, used_count, created_at
                FROM course_passkeys
                WHERE id = ? AND workspace_id = ?
                """, (rs, rowNum) -> {
            OffsetDateTime exp = rs.getObject("expires_at", OffsetDateTime.class);
            OffsetDateTime rev = rs.getObject("revoked_at", OffsetDateTime.class);
            boolean activeFlag = rs.getBoolean("is_active");
            Integer maxU = rs.getObject("max_uses", Integer.class);
            int used = rs.getInt("used_count");
            return new PasskeyItem(
                    rs.getObject("id", UUID.class),
                    rs.getObject("workspace_id", UUID.class),
                    rs.getString("code"),
                    rs.getString("label"),
                    exp,
                    rev,
                    activeFlag && rev == null && exp != null && exp.isAfter(OffsetDateTime.now()),
                    maxU,
                    used,
                    rs.getObject("created_at", OffsetDateTime.class));
        }, passkeyId, workspaceId).stream().findFirst().orElseThrow(
                () -> new BusinessException(ErrorCode.NOT_FOUND, "Passkey not found"));

        String nextCode = existing.code();
        String nextDigest = null;
        if (req != null && req.customCode() != null && !req.customCode().isBlank()) {
            String trimmed = req.customCode().trim();
            if (!trimmed.matches("[A-Za-z0-9_-]{4,32}")) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_PASSKEY_FORMAT",
                        "Passkey code must be 4-32 alphanumeric characters, hyphens, or underscores");
            }
            String candidateDigest = digest(trimmed);
            List<UUID> other = jdbc.queryForList(
                    "SELECT id FROM course_passkeys WHERE digest = ? AND id <> ?",
                    UUID.class, candidateDigest, passkeyId);
            if (!other.isEmpty()) {
                throw new BusinessException(ErrorCode.CONFLICT, "PASSKEY_ALREADY_EXISTS",
                        "This passkey code is already in use");
            }
            nextCode = trimmed;
            nextDigest = candidateDigest;
        }

        String nextLabel = (req != null && req.label() != null && !req.label().isBlank())
                ? req.label().trim()
                : existing.label();
        OffsetDateTime nextExpires = (req != null && req.validHours() != null && req.validHours() > 0)
                ? OffsetDateTime.now().plusHours(req.validHours())
                : existing.expiresAt();
        Integer nextMaxUses = (req != null && req.maxUses() != null)
                ? req.maxUses()
                : existing.maxUses();
        boolean nextActiveFlag = (req != null && req.active() != null)
                ? req.active()
                : existing.active();
        OffsetDateTime nextRevoked = nextActiveFlag ? null : OffsetDateTime.now();

        if (nextDigest != null) {
            jdbc.update("""
                    UPDATE course_passkeys
                    SET code = ?, digest = ?, label = ?, expires_at = ?, max_uses = ?, is_active = ?, revoked_at = ?
                    WHERE id = ? AND workspace_id = ?
                    """, nextCode, nextDigest, nextLabel, nextExpires, nextMaxUses, nextActiveFlag, nextRevoked,
                    passkeyId, workspaceId);
        } else {
            jdbc.update("""
                    UPDATE course_passkeys
                    SET label = ?, expires_at = ?, max_uses = ?, is_active = ?, revoked_at = ?
                    WHERE id = ? AND workspace_id = ?
                    """, nextLabel, nextExpires, nextMaxUses, nextActiveFlag, nextRevoked,
                    passkeyId, workspaceId);
        }

        audit("COURSE_PASSKEY_UPDATED", "WORKSPACE", workspaceId);
        boolean computedActive = nextActiveFlag
                && nextRevoked == null
                && nextExpires != null
                && nextExpires.isAfter(OffsetDateTime.now())
                && (nextMaxUses == null || existing.usedCount() < nextMaxUses);
        return new PasskeyItem(passkeyId, workspaceId, nextCode, nextLabel, nextExpires,
                nextRevoked, computedActive, nextMaxUses, existing.usedCount(), existing.createdAt());
    }

    public void deletePasskey(UUID workspaceId, UUID passkeyId) {
        manage(workspaceId);
        int deleted = jdbc.update(
                "DELETE FROM course_passkeys WHERE id = ? AND workspace_id = ?",
                passkeyId, workspaceId);
        if (deleted == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Passkey not found");
        }
        audit("COURSE_PASSKEY_DELETED", "WORKSPACE", workspaceId);
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
                UPDATE course_passkeys SET revoked_at = now(), is_active = FALSE
                WHERE workspace_id = ? AND revoked_at IS NULL
                """, workspaceId);
        jdbc.update("""
                INSERT INTO course_passkeys (workspace_id, digest, expires_at, id, code, label, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 'Mã tự động', TRUE, now())
                """, workspaceId, digest(code), expires, UUID.randomUUID(), code);
        audit("COURSE_PASSKEY_ISSUED", "WORKSPACE", workspaceId);
        return new Passkey(code, expires);
    }

    @Transactional(readOnly = true)
    public KeyStatus keyStatus(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        int enrolled = jdbc.queryForObject("SELECT count(*) FROM workspace_members WHERE workspace_id=? AND member_role='STUDENT'", Integer.class, workspaceId);
        return jdbc.query("""
                SELECT k.code, k.expires_at, k.is_active AND k.revoked_at IS NULL AND k.expires_at > now()
                       AND w.status = 'ACTIVE' AS active
                FROM course_passkeys k JOIN workspaces w ON w.id = k.workspace_id
                WHERE k.workspace_id = ?
                ORDER BY k.created_at DESC, k.expires_at DESC
                """, (rs, row) -> new KeyStatus(rs.getObject("expires_at", OffsetDateTime.class),
                rs.getBoolean("active"), workspaces.findById(workspaceId).map(Workspace::getMaxStudents).orElse(null), enrolled,
                rs.getString("code")), workspaceId)
                .stream().findFirst().orElse(new KeyStatus(null, false,
                        workspaces.findById(workspaceId).map(Workspace::getMaxStudents).orElse(null), enrolled, null));
    }

    public void revoke(UUID workspaceId) {
        manage(workspaceId);
        int changed = jdbc.update("""
                UPDATE course_passkeys SET revoked_at = now(), is_active = FALSE WHERE workspace_id = ? AND revoked_at IS NULL
                """, workspaceId);
        if (changed > 0) audit("COURSE_PASSKEY_REVOKED", "WORKSPACE", workspaceId);
    }

    public Enrollment redeem(String code, UUID requestId) {
        User actor = access.requireCurrentActiveUser();
        if (!CourseLabPolicy.isStudent(actor)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Only students can redeem a course Passkey");
        }
        passkeyRateCheck(actor.getId());
        String normalizedCode = code == null ? "" : code.trim();
        if (!normalizedCode.matches("[A-Za-z0-9_-]{4,32}")) {
            passkeyFailures.record(digest(actor.getId().toString()));
            throw invalidKey();
        }
        String keyDigest = digest(normalizedCode);
        UUID prior = replay(actor.getId(), requestId, keyDigest);
        if (prior != null) {
            return new Enrollment(prior);
        }
        List<UUID> foundWorkspaces = jdbc.queryForList("SELECT workspace_id FROM course_passkeys WHERE digest = ?",
                UUID.class, keyDigest);
        if (foundWorkspaces.isEmpty() && !normalizedCode.toUpperCase(java.util.Locale.ROOT).equals(normalizedCode)) {
            String upperDigest = digest(normalizedCode.toUpperCase(java.util.Locale.ROOT));
            UUID upperReplay = replay(actor.getId(), requestId, upperDigest);
            if (upperReplay != null) {
                return new Enrollment(upperReplay);
            }
            foundWorkspaces = jdbc.queryForList("SELECT workspace_id FROM course_passkeys WHERE digest = ?",
                    UUID.class, upperDigest);
            if (!foundWorkspaces.isEmpty()) {
                keyDigest = upperDigest;
            }
        }
        UUID workspaceId = foundWorkspaces.stream().findFirst().orElseThrow(() -> { passkeyFailures.record(digest(actor.getId().toString())); return invalidKey(); });
        Workspace workspace = lock(workspaceId);
        prior = replay(actor.getId(), requestId, keyDigest);
        if (prior != null) {
            return new Enrollment(prior);
        }
        boolean valid = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM course_passkeys WHERE workspace_id = ? AND digest = ?
                AND is_active = TRUE AND revoked_at IS NULL AND expires_at > statement_timestamp()
                AND (max_uses IS NULL OR used_count < max_uses))
                """, Boolean.class, workspaceId, keyDigest));
        if (!valid || !workspace.isCourseMode() || !"ACTIVE".equals(workspace.getStatus())) {
            passkeyFailures.record(digest(actor.getId().toString()));
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
        jdbc.update("UPDATE course_passkeys SET used_count = used_count + 1 WHERE workspace_id = ? AND digest = ?",
                workspaceId, keyDigest);
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
        if (seeder != null
                && !CourseLabSeederService.isSeeding(workspaceId)
                && "ACTIVE".equals(workspace.getStatus())) {
            if (JavaCourseraCatalog.COURSE_CODE.equalsIgnoreCase(workspace.getCode())
                    && !CourseLabSeederService.isCourseraLabsAligned(assignmentsInOrder, JavaCourseraCatalog.modules())) {
                seeder.ensureJavaCourseraPopulated(workspaceId);
                assignmentsInOrder = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
            } else if (CsharpCourseraCatalog.COURSE_CODE.equalsIgnoreCase(workspace.getCode())
                    && !CourseLabSeederService.isCourseraLabsAligned(assignmentsInOrder, CsharpCourseraCatalog.modules())) {
                seeder.ensureCsharpCourseraPopulated(workspaceId);
                assignmentsInOrder = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
            }
        }
        Map<UUID, List<UUID>> explicitPrerequisites = new HashMap<>();
        jdbc.query("""
                SELECT lp.assignment_id, lp.prerequisite_assignment_id
                FROM lab_prerequisites lp
                JOIN assignments a ON a.id = lp.assignment_id
                WHERE a.workspace_id = ?
                """, (rs, row) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)},
                workspaceId)
                .forEach(row -> explicitPrerequisites
                        .computeIfAbsent((UUID) row[0], key -> new ArrayList<>())
                        .add((UUID) row[1]));
        List<Lab> result = new ArrayList<>();
        for (int index = 0; index < assignmentsInOrder.size(); index++) {
            var assignment = assignmentsInOrder.get(index);
            boolean completed = passed.contains(assignment.getId());
            List<UUID> required = explicitPrerequisites.get(assignment.getId());
            boolean unlocked = required != null && !required.isEmpty()
                    ? required.stream().allMatch(passed::contains)
                    : index == 0 || passed.contains(assignmentsInOrder.get(index - 1).getId());
            String state = !student ? "UNLOCKED" : completed ? "PASSED"
                    : ("ACTIVE".equals(workspace.getStatus()) && unlocked) ? "UNLOCKED" : "LOCKED";
            String reason = "LOCKED".equals(state)
                    ? "ACTIVE".equals(workspace.getStatus()) ? "PREREQUISITE" : "COURSE_ARCHIVED" : null;
            result.add(new Lab(assignment.getId(), assignment.getLabOrder(), assignment.getTitle(), state, reason));
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
        if ("ARCHIVED".equals(workspace.getStatus())) {
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
}
