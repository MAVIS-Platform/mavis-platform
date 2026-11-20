package com.mavis.bootstrap.course;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.service.RuntimeStudioService;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationFinding;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationFindingRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.MermaidDslGenerator;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.service.AssignmentService;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import com.mavis.platform.submission.service.SubmissionService;
import com.mavis.platform.submission.service.impl.SubmissionReviewService;
import com.mavis.platform.workspace.service.CourseQuizService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class CourseLabStudentService {
    private static final Set<String> ACTIVE_SESSION_STATUSES = Set.of("ALLOCATED", "RUNNING", "READY_FOR_DISPATCH");

    private final AccessPolicyService access;
    private final CourseLabPolicy courseLabs;
    private final AssignmentRepository assignments;
    private final ProjectRepository projects;
    private final SourceSnapshotRepository snapshots;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final DiagramVersionRepository diagrams;
    private final EvidenceRepository evidences;
    private final EvaluationRunRepository evaluations;
    private final EvaluationFindingRepository evaluationFindings;
    private final RuntimeConfigurationRepository runtimeConfigurations;
    private final RuntimeSessionRepository runtimeSessions;
    private final RuntimeSessionService runtimeSessionService;
    private final RuntimeStudioService runtimeStudioService;
    private final AssignmentService assignmentService;
    private final CourseQuizService courseQuizService;
    private final SubmissionService submissionService;
    private final SubmissionReviewService submissionReviewService;
    private final com.mavis.common.repository.LabStudioExerciseRepository labStudioExercises;
    private final ObjectMapper json;

    @org.springframework.beans.factory.annotation.Value("${mavis.runtime.max-active-studio-sessions:2}")
    private int maxActiveStudioSessions;

    public CourseLabStudentService(
            AccessPolicyService access,
            CourseLabPolicy courseLabs,
            AssignmentRepository assignments,
            ProjectRepository projects,
            SourceSnapshotRepository snapshots,
            ModelVersionRepository models,
            ModelElementRepository elements,
            ModelRelationshipRepository relationships,
            DiagramVersionRepository diagrams,
            EvidenceRepository evidences,
            EvaluationRunRepository evaluations,
            EvaluationFindingRepository evaluationFindings,
            RuntimeConfigurationRepository runtimeConfigurations,
            RuntimeSessionRepository runtimeSessions,
            RuntimeSessionService runtimeSessionService,
            RuntimeStudioService runtimeStudioService,
            AssignmentService assignmentService,
            CourseQuizService courseQuizService,
            SubmissionService submissionService,
            SubmissionReviewService submissionReviewService,
            com.mavis.common.repository.LabStudioExerciseRepository labStudioExercises,
            ObjectMapper json) {
        this.access = access;
        this.courseLabs = courseLabs;
        this.assignments = assignments;
        this.projects = projects;
        this.snapshots = snapshots;
        this.models = models;
        this.elements = elements;
        this.relationships = relationships;
        this.diagrams = diagrams;
        this.evidences = evidences;
        this.evaluations = evaluations;
        this.evaluationFindings = evaluationFindings;
        this.runtimeConfigurations = runtimeConfigurations;
        this.runtimeSessions = runtimeSessions;
        this.runtimeSessionService = runtimeSessionService;
        this.runtimeStudioService = runtimeStudioService;
        this.assignmentService = assignmentService;
        this.courseQuizService = courseQuizService;
        this.submissionService = submissionService;
        this.submissionReviewService = submissionReviewService;
        this.labStudioExercises = labStudioExercises;
        this.json = json;
    }

    public record ReferenceDiagramView(
            UUID id,
            String notation,
            String level,
            JsonNode layoutJson,
            String mermaidDsl) {}

    public record ReferenceElementView(
            UUID id,
            String elementType,
            String name,
            String scope,
            String languageStack,
            UUID parentElementId,
            String status) {}

    public record ReferenceRelationshipView(
            UUID id,
            UUID sourceElementId,
            String sourceName,
            UUID targetElementId,
            String targetName,
            String relationType,
            String originLayer) {}

    public record ReferenceEvidenceView(
            UUID id,
            UUID relationshipId,
            String locator,
            String sourceType,
            String excerpt,
            String adapterVersion) {}

    public record ReferenceFindingView(
            UUID id,
            String ruleId,
            String severity,
            String status,
            String message) {}

    public record ReferenceEvaluationView(
            UUID id,
            String ruleSetVersion,
            JsonNode summaryMetrics,
            List<ReferenceFindingView> findings) {}

    public record ReferenceArchitectureView(
            UUID projectId,
            UUID snapshotId,
            UUID modelVersionId,
            Integer revision,
            List<ReferenceDiagramView> diagrams,
            List<ReferenceElementView> elements,
            List<ReferenceRelationshipView> relationships,
            List<ReferenceEvidenceView> evidences,
            ReferenceEvaluationView evaluation) {}

    public record BootstrapStudioView(RuntimeSessionResponseDTO session, JsonNode studio) {}

    public record StudentLabContextView(
            AssignmentResponseDTO assignment,
            ReferenceArchitectureView referenceArchitecture,
            CourseQuizService.Quiz quiz,
            List<RuntimeSessionResponseDTO> studioSessions,
            SubmissionResponseDTO latestSubmission,
            SubmissionReviewService.View latestReview,
            JsonNode studioExercise) {}

    @Transactional(readOnly = true)
    public StudentLabContextView studentContext(UUID workspaceId, UUID assignmentId) {
        User actor = access.requireCurrentActiveUser();
        access.requireWorkspaceMember(workspaceId);
        Assignment lab = requireLab(workspaceId, assignmentId);
        if (CourseLabPolicy.isStudent(actor)) {
            courseLabs.requireOpen(lab, actor);
        }

        AssignmentResponseDTO assignmentView = assignmentService.getAssignmentById(assignmentId);
        ReferenceArchitectureView referenceArchitecture = buildReferenceArchitecture(lab.getReferenceModel());

        CourseQuizService.Quiz quiz = null;
        if (lab.getLabOrder() != null) {
            quiz = courseQuizService.getIfPublished(workspaceId, assignmentId);
        }

        List<RuntimeSessionResponseDTO> studioSessions = listStudioSessions(workspaceId, assignmentId);
        SubmissionResponseDTO latestSubmission = submissionService.getMySubmissions().stream()
                .filter(s -> assignmentId.equals(s.getAssignmentId()))
                .findFirst()
                .orElse(null);
        SubmissionReviewService.View latestReview = latestSubmission == null
                ? null
                : submissionReviewService.get(latestSubmission.getId());

        return new StudentLabContextView(
                assignmentView,
                referenceArchitecture,
                quiz,
                studioSessions,
                latestSubmission,
                latestReview,
                lab.getStudioExerciseSnapshot());
    }

    @Transactional(readOnly = true)
    public List<RuntimeSessionResponseDTO> listStudioSessions(UUID workspaceId, UUID assignmentId) {
        User actor = access.requireCurrentActiveUser();
        access.requireWorkspaceMember(workspaceId);
        Assignment lab = requireLab(workspaceId, assignmentId);
        if (CourseLabPolicy.isStudent(actor)) {
            courseLabs.requireOpen(lab, actor);
        }

        Map<UUID, RuntimeSession> merged = new LinkedHashMap<>();
        for (RuntimeSession s : runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(assignmentId, actor.getId())) {
            merged.put(s.getId(), s);
        }
        for (RuntimeSession s : runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, actor.getId())) {
            UUID directLab = s.getAssignment() == null ? null : s.getAssignment().getId();
            UUID projectLab = s.getProject() != null && s.getProject().getAssignment() != null
                    ? s.getProject().getAssignment().getId() : null;
            if (assignmentId.equals(directLab) || assignmentId.equals(projectLab)) {
                merged.putIfAbsent(s.getId(), s);
            }
        }
        return merged.values().stream()
                .sorted(Comparator.comparing(RuntimeSession::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(RuntimeSessionResponseDTO::fromEntity)
                .toList();
    }

    public RuntimeSessionResponseDTO startLabStudioSession(UUID workspaceId, UUID assignmentId) {
        User actor = access.requireCurrentActiveUser();
        access.requireWorkspaceMember(workspaceId);
        Assignment lab = requireLab(workspaceId, assignmentId);
        if (CourseLabPolicy.isStudent(actor)) {
            courseLabs.requireOpen(lab, actor);
            if (!courseLabs.hasPassedCurrentQuiz(lab, actor.getId())) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "RUNTIME_QUIZ_REQUIRED",
                        "Vui lòng vượt qua bài Quiz của Lab trước khi mở phòng thí nghiệm MAVIS Studio Live");
            }
        }
        ModelVersion refModel = lab.getReferenceModel();
        var exercise = labStudioExercises.findByAssignmentId(lab.getId()).orElse(null);
        JsonNode frozenExercise = lab.getStudioExerciseSnapshot();
        boolean isStudentActor = CourseLabPolicy.isStudent(actor);
        JsonNode activeExercise = isStudentActor
                ? (frozenExercise != null ? frozenExercise : exerciseToNode(exercise))
                : (exercise != null ? exerciseToNode(exercise) : frozenExercise);
        UUID runtimeModelId = activeExercise != null && activeExercise.hasNonNull("runtimeModelId")
                ? UUID.fromString(activeExercise.path("runtimeModelId").asText())
                : exercise == null ? null : exercise.getRuntimeModelId();
        if (runtimeModelId == null
                && (refModel == null || refModel.getSourceSnapshot() == null || refModel.getProject() == null)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Lab chưa được gắn kiến trúc tham chiếu hợp lệ");
        }
        ModelVersion runtimeModel = refModel;
        if (runtimeModelId != null) {
            runtimeModel = models.findById(runtimeModelId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST,
                            "Studio runtime model not found for this Lab"));
            if (runtimeModel.getProject() == null || runtimeModel.getSourceSnapshot() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Studio runtime source has no project or snapshot");
            }
        }

        for (RuntimeSessionResponseDTO existing : listStudioSessions(workspaceId, assignmentId)) {
            String exec = existing.getExecutionStatus() == null ? "" : existing.getExecutionStatus().toUpperCase(Locale.ROOT);
            if (ACTIVE_SESSION_STATUSES.contains(exec) && existing.getCancelRequestedAt() == null) {
                return existing;
            }
        }
        long activeSessions = runtimeSessions.countByExecutionStatusIn(ACTIVE_SESSION_STATUSES);
        if (activeSessions >= Math.max(1, maxActiveStudioSessions)) {
            throw new BusinessException(ErrorCode.CONFLICT, "STUDIO_CAPACITY_FULL",
                    "The shared Runner is running " + activeSessions
                            + " Live sessions. Finish or cancel one before starting another.");
        }

        StudentWorkspaceBundle working = ensureStudentWorkingProject(lab, actor, runtimeModel);
        JsonNode resolvedTopology = applyExerciseInitialState(activeExercise,
                resolveStudioTopology(lab, runtimeModel, !isStudentActor));
        ObjectNode appsNode = resolveApplicationsNode(runtimeModel, resolvedTopology);
        Map<String, String> serviceMappings = buildServiceMappings(working.model(), appsNode);

        ObjectNode scenarioConfig = json.createObjectNode();
        scenarioConfig.put("interactiveStudio", true);
        ObjectNode profileNode = scenarioConfig.putObject("profile");
        profileNode.set("applications", appsNode);
        runtimeConfigurations.findById(runtimeModel.getProject().getId())
                .filter(configuration -> runtimeModel.getSourceSnapshot().getId().equals(configuration.getSourceSnapshotId()))
                .map(RuntimeConfiguration::getProfile)
                .map(profile -> profile.path("sandboxCompose").asText(""))
                .filter(prepared -> !prepared.isBlank())
                .ifPresent(prepared -> profileNode.put("sandboxCompose", prepared));
        if (resolvedTopology != null && resolvedTopology.isObject()) {
            profileNode.set("studioTopology", resolvedTopology.deepCopy());
        }
        ObjectNode scenarioNode = scenarioConfig.putObject("scenario");
        ArrayNode stepsNode = scenarioNode.putArray("steps");
        String primaryService = selectPrimaryService(resolvedTopology, appsNode);
        JsonNode configuredBaseline = activeExercise != null
                ? activeExercise.get("baselineRequests")
                : exercise == null ? null : exercise.getBaselineRequests();
        if (configuredBaseline != null && configuredBaseline.isArray() && !configuredBaseline.isEmpty()) {
            int index = 0;
            for (JsonNode request : configuredBaseline) {
                if (!request.isObject()) continue;
                stepsNode.addObject()
                        .put("id", "studio-baseline-" + index)
                        .put("service", primaryService)
                        .put("method", request.path("method").asText("GET"))
                        .put("path", request.path("path").asText("/health"))
                        .put("expectedStatus", request.path("expectedStatus").asInt(200));
                index++;
            }
        }
        if (stepsNode.isEmpty()) {
            String defaultPath = primaryService.toLowerCase(Locale.ROOT).contains("gateway")
                    && appsNode != null && appsNode.has("order-service")
                    ? "/api/gateway/orders"
                    : "/health";
            stepsNode.addObject()
                    .put("id", "studio-smoke")
                    .put("service", primaryService)
                    .put("method", "GET")
                    .put("path", defaultPath)
                    .put("expectedStatus", 200);
        }
        scenarioNode.put("timeoutSeconds", 300);
        scenarioConfig.putArray("infrastructureActions");

        RuntimeSessionCreateRequest createRequest = RuntimeSessionCreateRequest.builder()
                .projectId(working.project().getId())
                .sourceSnapshotId(working.snapshot().getId())
                .modelVersionId(working.model().getId())
                .assignmentId(lab.getId())
                .scenarioName(lab.getTitle() + " · Studio Live")
                .scenarioConfig(scenarioConfig)
                .confirmedServiceMappings(serviceMappings)
                .build();

        RuntimeSessionResponseDTO created = runtimeSessionService.createRuntimeSession(createRequest);
        return runtimeSessionService.approveAndStartSession(created.getId());
    }

    public BootstrapStudioView bootstrapSimulatedStudio(UUID workspaceId, UUID assignmentId, UUID sessionId) {
        User actor = access.requireCurrentActiveUser();
        access.requireWorkspaceMember(workspaceId);
        Assignment lab = requireLab(workspaceId, assignmentId);
        if (CourseLabPolicy.isStudent(actor)) {
            courseLabs.requireOpen(lab, actor);
        }
        RuntimeSession session = runtimeSessions.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Runtime session not found"));
        UUID sessionLabId = session.getAssignment() != null
                ? session.getAssignment().getId()
                : (session.getProject() != null && session.getProject().getAssignment() != null
                ? session.getProject().getAssignment().getId() : null);
        if (!assignmentId.equals(sessionLabId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Studio session does not belong to this Lab");
        }
        if (CourseLabPolicy.isStudent(actor) && (session.getTriggeredBy() == null
                || !actor.getId().equals(session.getTriggeredBy().getId()))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Cannot control another student's Studio session");
        }

        JsonNode studioState = runtimeStudioService.bootstrapSimulatedSandbox(sessionId);
        RuntimeSession refreshed = runtimeSessions.findById(sessionId).orElse(session);
        return new BootstrapStudioView(RuntimeSessionResponseDTO.fromEntity(refreshed), studioState);
    }

    private Assignment requireLab(UUID workspaceId, UUID assignmentId) {
        return assignments.findById(assignmentId)
                .filter(a -> a.getWorkspace() != null && workspaceId.equals(a.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
    }

    private ReferenceArchitectureView buildReferenceArchitecture(ModelVersion refModel) {
        if (refModel == null || refModel.getProject() == null || refModel.getSourceSnapshot() == null) {
            return null;
        }
        UUID modelId = refModel.getId();
        List<ReferenceDiagramView> diagramViews = diagrams.findByModelVersionIdOrderByCreatedAtAsc(modelId).stream()
                .filter(d -> d.getNotation() != null && !"VIEW_4_PLUS_1".equalsIgnoreCase(d.getNotation()))
                .map(d -> {
                    String dsl = d.getLayoutJson() == null ? null
                            : MermaidDslGenerator.generateFromLayoutJson(d.getNotation(), d.getLevel(), d.getLayoutJson()).getDsl();
                    return new ReferenceDiagramView(d.getId(), d.getNotation(), d.getLevel(), d.getLayoutJson(), dsl);
                })
                .toList();

        List<ReferenceElementView> elementViews = elements.findByModelVersionId(modelId).stream()
                .map(e -> new ReferenceElementView(
                        e.getId(),
                        e.getElementType(),
                        e.getName(),
                        e.getScope(),
                        e.getLanguageStack(),
                        e.getParentElement() != null ? e.getParentElement().getId() : null,
                        e.getStatus()))
                .toList();

        List<ReferenceRelationshipView> relationshipViews = relationships.findByModelVersionId(modelId).stream()
                .map(r -> new ReferenceRelationshipView(
                        r.getId(),
                        r.getSourceElement() != null ? r.getSourceElement().getId() : null,
                        r.getSourceElement() != null ? r.getSourceElement().getName() : null,
                        r.getTargetElement() != null ? r.getTargetElement().getId() : null,
                        r.getTargetElement() != null ? r.getTargetElement().getName() : null,
                        r.getRelationType(),
                        r.getOriginLayer()))
                .toList();

        if (!elementViews.isEmpty() && (diagramViews.isEmpty()
                || (diagramViews.size() >= 2 && diagramViews.stream().noneMatch(d -> "CONTEXT".equalsIgnoreCase(d.level()))))) {
            List<ReferenceDiagramView> enriched = new ArrayList<>(diagramViews);
            ObjectNode contextLayout = json.createObjectNode().put("schemaVersion", "1.0").put("modelVersionId", modelId.toString());
            ArrayNode ctxNodes = contextLayout.putArray("nodes");
            contextLayout.putArray("edges");
            ctxNodes.addObject()
                    .put("id", "system:" + refModel.getProject().getId())
                    .put("kind", "SYSTEM")
                    .put("name", refModel.getProject().getName() != null ? refModel.getProject().getName() : "Reference System")
                    .put("x", 280)
                    .put("y", 0);
            String ctxDsl = MermaidDslGenerator.generateFromLayoutJson("C4", "CONTEXT", contextLayout).getDsl();
            enriched.add(new ReferenceDiagramView(UUID.randomUUID(), "C4", "CONTEXT", contextLayout, ctxDsl));
            diagramViews = List.copyOf(enriched);
        }

        List<ReferenceEvidenceView> evidenceViews = evidences.findByModelVersionId(modelId).stream()
                .map(ev -> new ReferenceEvidenceView(
                        ev.getId(),
                        ev.getRelationship() != null ? ev.getRelationship().getId() : null,
                        ev.getLocator(),
                        ev.getSourceType(),
                        ev.getExcerpt(),
                        ev.getAdapterVersion()))
                .toList();

        EvaluationRun latestRun = evaluations.findByModelVersionIdOrderByCreatedAtDesc(modelId).stream()
                .findFirst().orElse(null);
        ReferenceEvaluationView evalView = null;
        if (latestRun != null) {
            List<ReferenceFindingView> findingViews = evaluationFindings.findByEvaluationRunId(latestRun.getId()).stream()
                    .map(f -> new ReferenceFindingView(f.getId(), f.getRuleId(), f.getSeverity(), f.getStatus(), f.getMessage()))
                    .toList();
            evalView = new ReferenceEvaluationView(latestRun.getId(), latestRun.getRuleSetVersion(), latestRun.getSummaryMetrics(), findingViews);
        }

        return new ReferenceArchitectureView(
                refModel.getProject().getId(),
                refModel.getSourceSnapshot().getId(),
                modelId,
                refModel.getRevision(),
                diagramViews,
                elementViews,
                relationshipViews,
                evidenceViews,
                evalView);
    }

    private record StudentWorkspaceBundle(Project project, SourceSnapshot snapshot, ModelVersion model) {}

    private JsonNode applyExerciseInitialState(JsonNode exercise, JsonNode topology) {
        if (exercise == null || topology == null || !topology.isObject()) return topology;
        JsonNode initial = exercise.get("initialState");
        if (initial == null || !initial.isObject()) return topology;
        Set<String> stoppedServices = textValues(initial.get("stoppedServices"));
        Set<String> stoppedControllers = textValues(initial.get("stoppedControllers"));
        ObjectNode copy = topology.deepCopy();
        for (JsonNode block : copy.withArray("blocks")) {
            if (block.isObject() && stoppedServices.contains(block.path("service").asText())) {
                ((ObjectNode) block).put("initiallyStopped", true);
            }
        }
        for (JsonNode connection : copy.withArray("connections")) {
            if (connection.isObject() && stoppedControllers.contains(connection.path("controllerService").asText())) {
                ((ObjectNode) connection).put("initiallyStopped", true);
            }
        }
        return copy;
    }

    private static Set<String> textValues(JsonNode node) {
        Set<String> values = new java.util.HashSet<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                if (item.isTextual() && !item.asText().isBlank()) values.add(item.asText().trim());
            });
        }
        return values;
    }

    private StudentWorkspaceBundle ensureStudentWorkingProject(Assignment lab, User actor, ModelVersion refModel) {
        SourceSnapshot refSnapshot = refModel.getSourceSnapshot();
        UUID workspaceId = lab.getWorkspace().getId();

        Project project = projects.findByOwnerIdOrderByCreatedAtDesc(actor.getId()).stream()
                .filter(p -> !"DELETED".equalsIgnoreCase(p.getStatus()))
                .filter(p -> "STUDENT_WORKING".equalsIgnoreCase(p.getProjectType()))
                .filter(p -> p.getWorkspace() != null && workspaceId.equals(p.getWorkspace().getId()))
                .filter(p -> p.getAssignment() != null && lab.getId().equals(p.getAssignment().getId()))
                .filter(p -> Objects.equals(refSnapshot.getId(), p.getReferenceSnapshotId()))
                .findFirst()
                .orElse(null);

        if (project == null) {
            project = projects.saveAndFlush(Project.builder()
                    .workspace(lab.getWorkspace())
                    .owner(actor)
                    .assignment(lab)
                    .referenceSnapshotId(refSnapshot.getId())
                    .name(lab.getTitle() + " · Student Sandbox")
                    .description("Auto-provisioned student sandbox for MAVIS Studio Live")
                    .defaultBranch(refModel.getProject().getDefaultBranch() != null ? refModel.getProject().getDefaultBranch() : "main")
                    .repositoryUrl(refModel.getProject().getRepositoryUrl())
                    .projectType("STUDENT_WORKING")
                    .isReferenceTemplate(false)
                    .status("ACTIVE")
                    .build());
        }

        final Project resolvedProject = project;
        SourceSnapshot snapshot = snapshots.findByProjectId(resolvedProject.getId()).stream()
                .filter(s -> Objects.equals(refSnapshot.getArtifactHash(), s.getArtifactHash()))
                .findFirst()
                .orElse(null);
        if (snapshot == null) {
            snapshot = snapshots.saveAndFlush(SourceSnapshot.builder()
                    .project(resolvedProject)
                    .sourceType(refSnapshot.getSourceType())
                    .branchName(refSnapshot.getBranchName())
                    .commitSha(refSnapshot.getCommitSha())
                    .artifactHash(refSnapshot.getArtifactHash())
                    .storagePath(refSnapshot.getStoragePath())
                    .isPublished(false)
                    .createdBy(actor)
                    .build());
        }

        final SourceSnapshot resolvedSnapshot = snapshot;
        ModelVersion model = models.findByProjectIdOrderByRevisionDesc(resolvedProject.getId()).stream()
                .filter(m -> !"RUNTIME_ENRICHED".equalsIgnoreCase(m.getOrigin()))
                .filter(m -> m.getSourceSnapshot() != null && resolvedSnapshot.getId().equals(m.getSourceSnapshot().getId()))
                .findFirst()
                .orElse(null);
        if (model == null) {
            Integer maxRevision = models.findMaxRevisionByProjectId(resolvedProject.getId());
            int nextRevision = (maxRevision == null ? 0 : maxRevision) + 1;
            boolean hasValid = models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(resolvedProject.getId()).isPresent();
            model = models.saveAndFlush(ModelVersion.builder()
                    .project(resolvedProject)
                    .sourceSnapshot(resolvedSnapshot)
                    .revision(nextRevision)
                    .schemaVersion(refModel.getSchemaVersion() != null ? refModel.getSchemaVersion() : "1.0")
                    .origin("USER_CONFIRMED")
                    .isLatestValid(!hasValid)
                    .createdBy(actor)
                    .build());
            cloneModelElements(refModel, model);
        } else {
            List<ModelElement> existingElements = elements.findByModelVersionId(model.getId());
            if (existingElements.isEmpty()) {
                cloneModelElements(refModel, model);
            } else if (relationships.findByModelVersionId(model.getId()).isEmpty()) {
                backfillModelRelationships(refModel, model, existingElements);
            }
        }

        return new StudentWorkspaceBundle(resolvedProject, resolvedSnapshot, model);
    }

    private void cloneModelElements(ModelVersion sourceModel, ModelVersion targetModel) {
        List<ModelElement> sourceElements = elements.findByModelVersionId(sourceModel.getId());
        if (sourceElements == null || sourceElements.isEmpty()) {
            return;
        }
        Map<UUID, ModelElement> copied = new HashMap<>();
        for (ModelElement src : sourceElements) {
            if (src.getParentElement() == null) {
                ModelElement saved = elements.save(ModelElement.builder()
                        .modelVersion(targetModel)
                        .elementType(src.getElementType())
                        .languageStack(src.getLanguageStack())
                        .name(src.getName())
                        .scope(src.getScope())
                        .properties(src.getProperties())
                        .status(src.getStatus())
                        .build());
                copied.put(src.getId(), saved);
            }
        }
        for (ModelElement src : sourceElements) {
            if (src.getParentElement() != null) {
                ModelElement parentCopy = copied.get(src.getParentElement().getId());
                ModelElement saved = elements.save(ModelElement.builder()
                        .modelVersion(targetModel)
                        .parentElement(parentCopy)
                        .elementType(src.getElementType())
                        .languageStack(src.getLanguageStack())
                        .name(src.getName())
                        .scope(src.getScope())
                        .properties(src.getProperties())
                        .status(src.getStatus())
                        .build());
                copied.put(src.getId(), saved);
            }
        }
        cloneModelRelationships(sourceModel, targetModel, copied);
    }

    private void backfillModelRelationships(
            ModelVersion sourceModel, ModelVersion targetModel, List<ModelElement> targetElements) {
        List<ModelElement> sourceElements = elements.findByModelVersionId(sourceModel.getId());
        if (sourceElements == null || sourceElements.isEmpty()) return;
        Map<String, ModelElement> targetByKey = new HashMap<>();
        for (ModelElement el : targetElements) {
            if (el.getName() != null) {
                targetByKey.putIfAbsent(
                        (el.getElementType() + ":" + el.getName()).toLowerCase(Locale.ROOT), el);
            }
        }
        Map<UUID, ModelElement> mapped = new HashMap<>();
        for (ModelElement src : sourceElements) {
            if (src.getId() == null || src.getName() == null) continue;
            ModelElement match = targetByKey.get(
                    (src.getElementType() + ":" + src.getName()).toLowerCase(Locale.ROOT));
            if (match != null) mapped.put(src.getId(), match);
        }
        cloneModelRelationships(sourceModel, targetModel, mapped);
    }

    private void cloneModelRelationships(
            ModelVersion sourceModel, ModelVersion targetModel, Map<UUID, ModelElement> copiedBySourceId) {
        List<ModelRelationship> sourceRels = relationships.findByModelVersionId(sourceModel.getId());
        if (sourceRels == null || sourceRels.isEmpty()) return;
        for (ModelRelationship rel : sourceRels) {
            if (rel.getSourceElement() == null || rel.getTargetElement() == null) continue;
            ModelElement srcCopy = copiedBySourceId.get(rel.getSourceElement().getId());
            ModelElement dstCopy = copiedBySourceId.get(rel.getTargetElement().getId());
            if (srcCopy == null || dstCopy == null || Objects.equals(srcCopy.getId(), dstCopy.getId())) continue;
            relationships.save(ModelRelationship.builder()
                    .modelVersion(targetModel)
                    .sourceElement(srcCopy)
                    .targetElement(dstCopy)
                    .relationType(rel.getRelationType() != null ? rel.getRelationType() : "CALLS")
                    .originLayer(rel.getOriginLayer() != null ? rel.getOriginLayer() : "STATIC")
                    .direction(rel.getDirection() != null ? rel.getDirection() : "DIRECTED")
                    .properties(rel.getProperties())
                    .build());
        }
    }

    private ObjectNode exerciseToNode(com.mavis.common.entity.LabStudioExercise exercise) {
        if (exercise == null) return null;
        ObjectNode node = json.createObjectNode();
        if (exercise.getRuntimeProjectId() != null) node.put("runtimeProjectId", exercise.getRuntimeProjectId().toString());
        if (exercise.getRuntimeModelId() != null) node.put("runtimeModelId", exercise.getRuntimeModelId().toString());
        if (exercise.getRuntimeSnapshotId() != null) node.put("runtimeSnapshotId", exercise.getRuntimeSnapshotId().toString());
        if (exercise.getBaselineRequests() != null) node.set("baselineRequests", exercise.getBaselineRequests());
        if (exercise.getInitialState() != null) node.set("initialState", exercise.getInitialState());
        if (exercise.getAllowedActions() != null) node.set("allowedActions", exercise.getAllowedActions());
        if (exercise.getSuccessCriteria() != null) node.set("successCriteria", exercise.getSuccessCriteria());
        if (exercise.getInstructions() != null) node.put("instructions", exercise.getInstructions());
        return node;
    }

    private static String selectPrimaryService(JsonNode topology, ObjectNode appsNode) {
        List<String> allBlocks = new ArrayList<>();
        List<String> activeBlocks = new ArrayList<>();
        Set<String> outbound = new LinkedHashSet<>();
        Set<String> inbound = new LinkedHashSet<>();
        if (topology != null && topology.isObject()) {
            for (JsonNode block : topology.path("blocks")) {
                String svc = block.path("service").asText("").trim();
                if (svc.isEmpty()) continue;
                allBlocks.add(svc);
                if (!block.path("initiallyStopped").asBoolean(false)) {
                    activeBlocks.add(svc);
                }
            }
            for (JsonNode conn : topology.path("connections")) {
                String from = conn.path("from").asText("").trim();
                String to = conn.path("to").asText("").trim();
                if (!from.isEmpty()) outbound.add(from);
                if (!to.isEmpty()) inbound.add(to);
            }
        }
        for (String svc : activeBlocks) {
            if (outbound.contains(svc) && !inbound.contains(svc)) return svc;
        }
        for (String svc : activeBlocks) {
            String lower = svc.toLowerCase(Locale.ROOT);
            if (lower.contains("gateway") || lower.contains("edge") || lower.contains("ingress") || lower.equals("bff")) {
                return svc;
            }
        }
        for (String svc : activeBlocks) {
            if (outbound.contains(svc)) return svc;
        }
        if (!activeBlocks.isEmpty()) return activeBlocks.get(0);
        if (!allBlocks.isEmpty()) return allBlocks.get(0);
        return appsNode != null && appsNode.fieldNames().hasNext() ? appsNode.fieldNames().next() : "order-service";
    }

    private JsonNode resolveStudioTopology(Assignment lab, ModelVersion refModel, boolean preferLiveConfiguration) {
        if (preferLiveConfiguration && refModel != null && refModel.getProject() != null) {
            RuntimeConfiguration config = runtimeConfigurations.findById(refModel.getProject().getId()).orElse(null);
            if (config != null && config.getProfile() != null && config.getProfile().path("studioTopology").isObject()) {
                return config.getProfile().path("studioTopology");
            }
        }
        if (lab.getStudioTopologySnapshot() != null && lab.getStudioTopologySnapshot().isObject()) {
            return lab.getStudioTopologySnapshot();
        }
        RuntimeConfiguration config = runtimeConfigurations.findById(refModel.getProject().getId()).orElse(null);
        if (config != null && config.getProfile() != null && config.getProfile().path("studioTopology").isObject()) {
            return config.getProfile().path("studioTopology");
        }
        ObjectNode fallback = json.createObjectNode().put("version", 1);
        ArrayNode blocks = fallback.putArray("blocks");
        List<ModelElement> containers = elements.findByModelVersionId(refModel.getId()).stream()
                .filter(el -> "SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getName() != null)
                .toList();
        if (containers.isEmpty()) {
            for (String svc : List.of("api-gateway", "order-service", "payment-service", "inventory-service")) {
                blocks.addObject().put("service", svc).put("label", svc).put("canScale", true).put("initiallyStopped", false);
            }
        } else {
            for (ModelElement container : containers) {
                blocks.addObject()
                        .put("service", container.getName())
                        .put("label", container.getName())
                        .put("canScale", true)
                        .put("initiallyStopped", false);
            }
        }
        fallback.putArray("connections");
        return fallback;
    }

    private ObjectNode resolveApplicationsNode(ModelVersion refModel, JsonNode topology) {
        RuntimeConfiguration config = runtimeConfigurations.findById(refModel.getProject().getId()).orElse(null);
        if (config != null && config.getProfile() != null && config.getProfile().path("applications").isObject()
                && !config.getProfile().path("applications").isEmpty()) {
            return (ObjectNode) config.getProfile().path("applications").deepCopy();
        }
        ObjectNode apps = json.createObjectNode();
        Set<String> serviceNames = new LinkedHashSet<>();
        if (topology != null && topology.path("blocks").isArray()) {
            for (JsonNode block : topology.path("blocks")) {
                String svc = block.path("service").asText("");
                if (!svc.isBlank()) serviceNames.add(svc);
            }
        }
        if (serviceNames.isEmpty()) {
            elements.findByModelVersionId(refModel.getId()).stream()
                    .filter(el -> "SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getName() != null)
                    .map(ModelElement::getName)
                    .forEach(serviceNames::add);
        }
        int port = 8080;
        for (String svc : serviceNames) {
            apps.putObject(svc).put("runtime", "java").put("containerPort", port++);
        }
        return apps;
    }

    private Map<String, String> buildServiceMappings(ModelVersion studentModel, ObjectNode appsNode) {
        List<ModelElement> containers = elements.findByModelVersionId(studentModel.getId()).stream()
                .filter(el -> "SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getId() != null && el.getName() != null)
                .toList();
        Map<String, String> mappings = new LinkedHashMap<>();
        appsNode.fieldNames().forEachRemaining(serviceName -> {
            containers.stream()
                    .filter(el -> serviceName.equalsIgnoreCase(el.getName()))
                    .findFirst()
                    .ifPresent(el -> mappings.put(serviceName, el.getId().toString()));
        });
        for (ModelElement container : containers) {
            mappings.putIfAbsent(container.getName(), container.getId().toString());
        }
        return mappings;
    }
}
