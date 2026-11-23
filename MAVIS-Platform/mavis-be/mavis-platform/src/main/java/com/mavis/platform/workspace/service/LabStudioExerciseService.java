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

    private static final Set<String> ACTIONS = Set.of(
            "START", "STOP", "SCALE", "CONNECT", "DISCONNECT", "PAUSE", "RESUME", "THROTTLE_CPU", "SET_LOAD", "SET_ENV", "SWAP_VERSION");
    private static final Set<String> CHANGE_ACTIONS = Set.of("STOP", "START", "SCALE", "PAUSE", "RESUME", "THROTTLE_CPU", "SET_LOAD", "SET_ENV", "SWAP_VERSION");
    private static final Set<String> EXERCISE_TYPES = Set.of(
            "CHANGE_IMPACT", "CASCADING_FAILURE", "CIRCUIT_BREAKER", "SCALE_UNDER_LOAD", "CONFIG_REGRESSION", "CUSTOM");
    private static final Set<String> RULE_METRICS = Set.of(
            "ERROR_RATE", "EDGE_ERROR_RATE", "P95_MS", "P95_DELTA_PCT", "REPLICAS", "TRACE_EDGE", "IMPACT_F1");
    private static final Set<String> RULE_OPERATORS = Set.of("LT", "LTE", "GT", "GTE", "EQ");
    private static final Set<String> METHODS = Set.of("GET", "HEAD");
    private static final int MAX_BASELINE = 10;
    private static final int MAX_RULES = 12;
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

    public record ChangeAction(String action, String service, Integer replicas, Integer cpuPercent, Integer targetRps) {}

    public record DeclarativeRule(String metric, String target, String operator, Double threshold, String label) {}

    public record SuccessCriteria(Integer maxErrorRatePercent, Integer maxP95Ms,
                                  TraceEdge requiredTraceEdge, List<ReplicaTarget> minReplicas,
                                  String exerciseType, Boolean predictionRequired, Double minImpactF1,
                                  ChangeAction targetChangeAction, List<DeclarativeRule> rules) {
        public SuccessCriteria(Integer maxErrorRatePercent, Integer maxP95Ms,
                               TraceEdge requiredTraceEdge, List<ReplicaTarget> minReplicas) {
            this(maxErrorRatePercent, maxP95Ms, requiredTraceEdge, minReplicas, null, null, null, null, List.of());
        }
    }

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
                            || target.count() == null || target.count() < 1 || target.count() > 3) {
                        throw invalid("Replica targets need a service and a count of 1-3");
                    }
                    return new ReplicaTarget(target.service().trim(), target.count());
                }).toList();
        String exerciseType = null;
        if (criteria.exerciseType() != null && !criteria.exerciseType().isBlank()) {
            exerciseType = criteria.exerciseType().trim().toUpperCase(Locale.ROOT);
            if (!EXERCISE_TYPES.contains(exerciseType)) {
                throw invalid("Unsupported exerciseType: " + exerciseType);
            }
        }
        Boolean predictionRequired = Boolean.TRUE.equals(criteria.predictionRequired()) ? Boolean.TRUE : null;
        Double minImpactF1 = criteria.minImpactF1();
        if (minImpactF1 != null && (!Double.isFinite(minImpactF1) || minImpactF1 < 0.0 || minImpactF1 > 1.0)) {
            throw invalid("minImpactF1 must be between 0.0 and 1.0");
        }
        ChangeAction changeAction = normalizeChangeAction(criteria.targetChangeAction());
        List<DeclarativeRule> rules = normalizeRules(criteria.rules());
        return new SuccessCriteria(errorRate, p95, edge, replicas,
                exerciseType, predictionRequired, minImpactF1, changeAction, rules);
    }

    private ChangeAction normalizeChangeAction(ChangeAction action) {
        if (action == null) return null;
        String kind = action.action() == null ? "" : action.action().trim().toUpperCase(Locale.ROOT);
        String service = action.service() == null ? "" : action.service().trim();
        if (!CHANGE_ACTIONS.contains(kind) || service.isBlank() || service.length() > 128) {
            throw invalid("Invalid targetChangeAction");
        }
        if ("SCALE".equals(kind) && (action.replicas() == null || action.replicas() < 1 || action.replicas() > 3)) {
            throw invalid("SCALE targetChangeAction requires replicas 1-3");
        }
        if ("THROTTLE_CPU".equals(kind) && (action.cpuPercent() == null || action.cpuPercent() < 10 || action.cpuPercent() > 100)) {
            throw invalid("THROTTLE_CPU targetChangeAction requires cpuPercent 10-100");
        }
        if ("SET_LOAD".equals(kind) && (action.targetRps() == null || action.targetRps() < 1 || action.targetRps() > 50)) {
            throw invalid("SET_LOAD targetChangeAction requires targetRps 1-50");
        }
        return new ChangeAction(kind, service,
                "SCALE".equals(kind) ? action.replicas() : null,
                "THROTTLE_CPU".equals(kind) ? action.cpuPercent() : null,
                "SET_LOAD".equals(kind) ? action.targetRps() : null);
    }

    private List<DeclarativeRule> normalizeRules(List<DeclarativeRule> rules) {
        if (rules == null || rules.isEmpty()) return List.of();
        if (rules.size() > MAX_RULES) {
            throw invalid("At most " + MAX_RULES + " declarative rules are allowed");
        }
        return rules.stream().map(rule -> {
            if (rule == null) throw invalid("Declarative rule cannot be null");
            String metric = rule.metric() == null ? "" : rule.metric().trim().toUpperCase(Locale.ROOT);
            String operator = rule.operator() == null ? "" : rule.operator().trim().toUpperCase(Locale.ROOT);
            String target = rule.target() == null || rule.target().isBlank() ? "ALL" : rule.target().trim();
            if (!RULE_METRICS.contains(metric)) throw invalid("Unsupported rule metric: " + metric);
            if (!RULE_OPERATORS.contains(operator)) throw invalid("Unsupported rule operator: " + operator);
            if (target.length() > 256) throw invalid("Rule target exceeds 256 characters");
            if (rule.threshold() == null || !Double.isFinite(rule.threshold())) {
                throw invalid("Rule threshold must be a finite number");
            }
            String label = rule.label() == null ? "" : rule.label().trim();
            if (label.length() > 200) label = label.substring(0, 200);
            return new DeclarativeRule(metric, target, operator, rule.threshold(), label.isBlank() ? null : label);
        }).toList();
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
