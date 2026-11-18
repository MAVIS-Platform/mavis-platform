package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.LabStudioExercise;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.LabStudioExerciseRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Teacher-authored Studio Live exercise.
 *
 * <p>The runtime source is a separate deployable repository from the C1-C3 reference source. The
 * exercise pins that source, the baseline workload, the initial stopped services/controllers, the
 * allowed topology actions and the acceptance criteria. Studio Live only supports topology
 * gestures; code editing and synthetic latency are outside this contract.</p>
 */
@Service
@RequiredArgsConstructor
public class LabStudioExerciseService {

    private static final Set<String> ACTIONS = Set.of("START", "STOP", "SCALE", "CONNECT", "DISCONNECT");
    private static final Set<String> METHODS = Set.of("GET", "HEAD");
    private static final int MAX_BASELINE = 10;
    private static final int MAX_INSTRUCTIONS = 10_000;

    private final LabStudioExerciseRepository exercises;
    private final AssignmentRepository assignments;
    private final ProjectRepository projects;
    private final ModelVersionRepository models;
    private final SourceSnapshotRepository snapshots;
    private final AccessPolicyService access;
    private final ObjectMapper json;

    public record BaselineRequest(String method, String path, Integer expectedStatus) {}

    public record InitialState(List<String> stoppedServices, List<String> stoppedControllers) {}

    public record TraceEdge(String from, String to) {}

    public record ReplicaTarget(String service, Integer count) {}

    public record SuccessCriteria(Integer maxErrorRatePercent, Integer maxP95Ms,
                                  TraceEdge requiredTraceEdge, List<ReplicaTarget> minReplicas) {}

    public record ExerciseRequest(UUID runtimeProjectId, UUID runtimeModelId, UUID runtimeSnapshotId,
                                  List<BaselineRequest> baselineRequests, InitialState initialState,
                                  List<String> allowedActions, SuccessCriteria successCriteria,
                                  String instructions) {}

    public record ExerciseView(UUID runtimeProjectId, UUID runtimeModelId, UUID runtimeSnapshotId,
                               List<BaselineRequest> baselineRequests, InitialState initialState,
                               List<String> allowedActions, SuccessCriteria successCriteria,
                               String instructions, int revision, OffsetDateTime updatedAt) {}

    @Transactional(readOnly = true)
    public ExerciseView get(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        lab(workspaceId, assignmentId);
        return exercises.findByAssignmentId(assignmentId).map(this::view).orElse(null);
    }

    @Transactional
    public ExerciseView save(UUID workspaceId, UUID assignmentId, ExerciseRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = lab(workspaceId, assignmentId);
        validateSource(workspaceId, request);
        List<BaselineRequest> baseline = normalizeBaseline(request == null ? null : request.baselineRequests());
        InitialState initialState = normalizeInitialState(request == null ? null : request.initialState());
        List<String> allowed = normalizeActions(request == null ? null : request.allowedActions());
        SuccessCriteria criteria = normalizeCriteria(request == null ? null : request.successCriteria());
        String instructions = request == null || request.instructions() == null ? "" : request.instructions().trim();
        if (instructions.length() > MAX_INSTRUCTIONS) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                    "Instructions exceed " + MAX_INSTRUCTIONS + " characters");
        }
        User actor = access.requireCurrentActiveUser();
        LabStudioExercise exercise = exercises.findByAssignmentId(assignmentId).orElseGet(() ->
                LabStudioExercise.builder().assignment(lab).revision(0).build());
        exercise.setRuntimeProjectId(request == null ? null : request.runtimeProjectId());
        exercise.setRuntimeModelId(request == null ? null : request.runtimeModelId());
        exercise.setRuntimeSnapshotId(request == null ? null : request.runtimeSnapshotId());
        exercise.setBaselineRequests(json.valueToTree(baseline));
        exercise.setInitialState(json.valueToTree(initialState));
        exercise.setAllowedActions(json.valueToTree(allowed));
        exercise.setSuccessCriteria(json.valueToTree(criteria));
        exercise.setInstructions(instructions);
        exercise.setRevision((exercise.getRevision() == null ? 0 : exercise.getRevision()) + 1);
        exercise.setUpdatedBy(actor);
        if (lab.getReferenceModel() == null && request != null && request.runtimeModelId() != null) {
            models.findById(request.runtimeModelId()).ifPresent(model -> {
                lab.setReferenceModel(model);
                assignments.save(lab);
            });
        }
        return view(exercises.save(exercise));
    }

    private void validateSource(UUID workspaceId, ExerciseRequest request) {
        if (request == null) return;
        boolean any = request.runtimeProjectId() != null || request.runtimeModelId() != null
                || request.runtimeSnapshotId() != null;
        boolean all = request.runtimeProjectId() != null && request.runtimeModelId() != null
                && request.runtimeSnapshotId() != null;
        if (any && !all) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                    "Runtime project, model and snapshot must be provided together");
        }
        if (!all) return;
        Project project = projects.findById(request.runtimeProjectId())
                .filter(value -> value.getWorkspace() != null
                        && workspaceId.equals(value.getWorkspace().getId()))
                .filter(value -> !"DELETED".equalsIgnoreCase(value.getStatus()))
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                        "Runtime repository must be an analyzed project in this workspace"));
        ModelVersion model = models.findById(request.runtimeModelId())
                .filter(value -> value.getProject() != null
                        && project.getId().equals(value.getProject().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                        "Runtime model does not belong to the Studio repository"));
        SourceSnapshot snapshot = snapshots.findById(request.runtimeSnapshotId())
                .filter(value -> value.getProject() != null
                        && project.getId().equals(value.getProject().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                        "Runtime snapshot does not belong to the Studio repository"));
        if (model.getSourceSnapshot() == null || !snapshot.getId().equals(model.getSourceSnapshot().getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                    "Runtime model and snapshot must belong to the same source revision");
        }
        if (!Boolean.TRUE.equals(snapshot.getIsPublished())) {
            snapshot.setIsPublished(true);
            snapshots.save(snapshot);
        }
        if (!"TEACHER_REFERENCE".equals(project.getProjectType())
                || !Boolean.TRUE.equals(project.getIsReferenceTemplate())) {
            project.setProjectType("TEACHER_REFERENCE");
            project.setIsReferenceTemplate(true);
            projects.save(project);
        }
    }

    private List<BaselineRequest> normalizeBaseline(List<BaselineRequest> requests) {
        if (requests == null) return List.of();
        if (requests.size() > MAX_BASELINE) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID",
                    "At most " + MAX_BASELINE + " baseline requests are allowed");
        }
        return requests.stream().map(request -> {
            if (request == null) throw invalid("Baseline request cannot be null");
            String method = request.method() == null ? "" : request.method().trim().toUpperCase(Locale.ROOT);
            String path = request.path() == null ? "" : request.path().trim();
            if (!METHODS.contains(method) || !path.startsWith("/") || path.length() > 512) {
                throw invalid("Baseline requests must be GET/HEAD with a relative path");
            }
            Integer status = request.expectedStatus();
            if (status != null && (status < 100 || status > 599)) {
                throw invalid("Expected status must be between 100 and 599");
            }
            return new BaselineRequest(method, path, status);
        }).toList();
    }

    private InitialState normalizeInitialState(InitialState state) {
        if (state == null) return new InitialState(List.of(), List.of());
        return new InitialState(cleanNames(state.stoppedServices()), cleanNames(state.stoppedControllers()));
    }

    private List<String> cleanNames(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(Objects::nonNull).map(String::trim)
                .filter(value -> !value.isBlank() && value.length() <= 128)
                .distinct().toList();
    }

    private List<String> normalizeActions(List<String> actions) {
        if (actions == null || actions.isEmpty()) return List.of("START", "STOP", "SCALE", "CONNECT", "DISCONNECT");
        return actions.stream().filter(Objects::nonNull)
                .map(value -> value.trim().toUpperCase(Locale.ROOT))
                .map(value -> {
                    if (!ACTIONS.contains(value)) throw invalid("Unsupported action: " + value);
                    return value;
                })
                .distinct().toList();
    }

    private SuccessCriteria normalizeCriteria(SuccessCriteria criteria) {
        if (criteria == null) return new SuccessCriteria(0, null, null, List.of());
        Integer errorRate = criteria.maxErrorRatePercent();
        if (errorRate != null && (errorRate < 0 || errorRate > 100)) {
            throw invalid("Max error rate must be 0-100");
        }
        Integer p95 = criteria.maxP95Ms();
        if (p95 != null && (p95 < 0 || p95 > 60_000)) {
            throw invalid("P95 threshold must be 0-60000 ms");
        }
        TraceEdge edge = criteria.requiredTraceEdge();
        if (edge != null && (edge.from() == null || edge.from().isBlank()
                || edge.to() == null || edge.to().isBlank())) {
            throw invalid("Required trace edge needs both endpoints");
        }
        List<ReplicaTarget> replicas = criteria.minReplicas() == null ? List.of()
                : criteria.minReplicas().stream().map(target -> {
                    if (target == null || target.service() == null || target.service().isBlank()
                            || target.count() == null || target.count() < 1 || target.count() > 8) {
                        throw invalid("Replica targets need a service and a count of 1-8");
                    }
                    return new ReplicaTarget(target.service().trim(), target.count());
                }).toList();
        return new SuccessCriteria(errorRate, p95, edge, replicas);
    }

    private Assignment lab(UUID workspaceId, UUID assignmentId) {
        return assignments.findById(assignmentId)
                .filter(value -> value.getWorkspace() != null
                        && workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "LAB_NOT_FOUND",
                        "Lab not found in this workspace"));
    }

    private ExerciseView view(LabStudioExercise exercise) {
        return new ExerciseView(exercise.getRuntimeProjectId(), exercise.getRuntimeModelId(),
                exercise.getRuntimeSnapshotId(),
                json.convertValue(exercise.getBaselineRequests() == null ? json.createArrayNode() : exercise.getBaselineRequests(),
                        json.getTypeFactory().constructCollectionType(List.class, BaselineRequest.class)),
                json.convertValue(exercise.getInitialState() == null ? json.createObjectNode() : exercise.getInitialState(),
                        InitialState.class),
                json.convertValue(exercise.getAllowedActions() == null ? json.createArrayNode() : exercise.getAllowedActions(),
                        json.getTypeFactory().constructCollectionType(List.class, String.class)),
                json.convertValue(exercise.getSuccessCriteria() == null ? json.createObjectNode() : exercise.getSuccessCriteria(),
                        SuccessCriteria.class),
                exercise.getInstructions(), exercise.getRevision(), exercise.getUpdatedAt());
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EXERCISE_INVALID", message);
    }
}
