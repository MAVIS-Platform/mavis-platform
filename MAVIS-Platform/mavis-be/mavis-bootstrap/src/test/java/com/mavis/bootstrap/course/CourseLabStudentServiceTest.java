package com.mavis.bootstrap.course;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
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
import com.mavis.common.entity.Role;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
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
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.service.AssignmentService;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import com.mavis.platform.submission.service.SubmissionService;
import com.mavis.platform.submission.service.impl.SubmissionReviewService;
import com.mavis.platform.workspace.service.CourseQuizService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CourseLabStudentServiceTest {
    private AccessPolicyService access;
    private CourseLabPolicy courseLabs;
    private AssignmentRepository assignments;
    private ProjectRepository projects;
    private SourceSnapshotRepository snapshots;
    private ModelVersionRepository models;
    private ModelElementRepository elements;
    private ModelRelationshipRepository relationships;
    private DiagramVersionRepository diagrams;
    private EvidenceRepository evidences;
    private EvaluationRunRepository evaluations;
    private EvaluationFindingRepository evaluationFindings;
    private RuntimeConfigurationRepository runtimeConfigurations;
    private RuntimeSessionRepository runtimeSessions;
    private RuntimeSessionService runtimeSessionService;
    private RuntimePlanningService runtimePlanningService;
    private RuntimeStudioService runtimeStudioService;
    private AssignmentService assignmentService;
    private CourseQuizService courseQuizService;
    private SubmissionService submissionService;
    private SubmissionReviewService submissionReviewService;
    private com.mavis.common.repository.LabStudioExerciseRepository labStudioExercises;
    private final ObjectMapper json = new ObjectMapper();
    private CourseLabStudentService service;

    private UUID workspaceId;
    private UUID labId;
    private User student;
    private Workspace workspace;
    private Project refProject;
    private SourceSnapshot refSnapshot;
    private ModelVersion refModel;
    private Assignment lab;

    @BeforeEach
    void setup() {
        access = mock(AccessPolicyService.class);
        courseLabs = mock(CourseLabPolicy.class);
        assignments = mock(AssignmentRepository.class);
        projects = mock(ProjectRepository.class);
        snapshots = mock(SourceSnapshotRepository.class);
        models = mock(ModelVersionRepository.class);
        elements = mock(ModelElementRepository.class);
        relationships = mock(ModelRelationshipRepository.class);
        diagrams = mock(DiagramVersionRepository.class);
        evidences = mock(EvidenceRepository.class);
        evaluations = mock(EvaluationRunRepository.class);
        evaluationFindings = mock(EvaluationFindingRepository.class);
        runtimeConfigurations = mock(RuntimeConfigurationRepository.class);
        runtimeSessions = mock(RuntimeSessionRepository.class);
        runtimeSessionService = mock(RuntimeSessionService.class);
        runtimePlanningService = mock(RuntimePlanningService.class);
        runtimeStudioService = mock(RuntimeStudioService.class);
        assignmentService = mock(AssignmentService.class);
        courseQuizService = mock(CourseQuizService.class);
        submissionService = mock(SubmissionService.class);
        submissionReviewService = mock(SubmissionReviewService.class);

        labStudioExercises = mock(com.mavis.common.repository.LabStudioExerciseRepository.class);
        service = new CourseLabStudentService(
                access, courseLabs, assignments, projects, snapshots, models, elements,
                relationships, diagrams, evidences, evaluations, evaluationFindings,
                runtimeConfigurations, runtimeSessions, runtimeSessionService, runtimePlanningService,
                runtimeStudioService,
                assignmentService, courseQuizService, submissionService, submissionReviewService,
                labStudioExercises, json);

        workspaceId = UUID.randomUUID();
        labId = UUID.randomUUID();
        student = User.builder().id(UUID.randomUUID()).fullName("Student A")
                .role(Role.builder().code("STUDENT").build()).build();
        workspace = Workspace.builder().id(workspaceId).name("SWP490").courseMode(true).status("ACTIVE").build();
        refProject = Project.builder().id(UUID.randomUUID()).workspace(workspace)
                .name("Curated Ref").projectType("TEACHER_REFERENCE").isReferenceTemplate(true).defaultBranch("main").build();
        refSnapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(refProject)
                .sourceType("ZIP_UPLOAD").artifactHash("a".repeat(64)).storagePath("/tmp/ref.zip").isPublished(true).build();
        refModel = ModelVersion.builder().id(UUID.randomUUID()).project(refProject)
                .sourceSnapshot(refSnapshot).revision(1).schemaVersion("1.0").origin("GENERATED").isLatestValid(true).build();

        ObjectNode frozenTopology = json.createObjectNode().put("version", 1);
        frozenTopology.putArray("blocks").addObject()
                .put("service", "payment-service").put("label", "Payment").put("canScale", true).put("initiallyStopped", false);
        frozenTopology.putArray("connections");

        lab = Assignment.builder()
                .id(labId)
                .workspace(workspace)
                .title("Lab 02 · Studio Resilience")
                .labMode("THEORY_QUIZ_STUDIO")
                .labOrder(2)
                .requireRuntimeTrace(true)
                .referenceModel(refModel)
                .studioTopologySnapshot(frozenTopology)
                .build();

        when(access.requireCurrentActiveUser()).thenReturn(student);
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
    }

    @Test
    void studentContextBundlesReferenceArchitectureQuizSessionsAndSubmission() {
        var orderEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("order-service").status("CONFIRMED").build();
        var payEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("payment-service").status("CONFIRMED").build();
        var rel = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(orderEl).targetElement(payEl)
                .relationType("FEIGN_CALL").originLayer("STATIC").build();
        var diagLayout = json.createObjectNode();
        diagLayout.putArray("nodes").addObject().put("id", orderEl.getId().toString()).put("name", "order-service").put("kind", "SERVICE_CONTAINER");
        diagLayout.putArray("edges");
        var diag = DiagramVersion.builder().id(UUID.randomUUID()).notation("C4").level("CONTAINER").layoutJson(diagLayout).build();
        var legacyDiag = DiagramVersion.builder().id(UUID.randomUUID()).notation("VIEW_4_PLUS_1").level("DEPLOYMENT").layoutJson(json.createObjectNode()).build();
        var ev = Evidence.builder().id(UUID.randomUUID()).relationship(rel).locator("PaymentClient.java:6").sourceType("CALL_SITE").excerpt("@FeignClient").build();
        var evalRun = EvaluationRun.builder().id(UUID.randomUUID()).ruleSetVersion("3e-3").summaryMetrics(json.createObjectNode().put("complianceScore", 88.0)).build();
        var finding = EvaluationFinding.builder().id(UUID.randomUUID()).ruleId("RULE-04").severity("WARNING").status("WARN").message("Sync Feign call").build();

        when(assignmentService.getAssignmentById(labId)).thenReturn(AssignmentResponseDTO.builder().id(labId).labMode("THEORY_QUIZ_STUDIO").build());
        when(diagrams.findByModelVersionIdOrderByCreatedAtAsc(refModel.getId())).thenReturn(List.of(diag, legacyDiag));
        when(elements.findByModelVersionId(refModel.getId())).thenReturn(List.of(orderEl, payEl));
        when(relationships.findByModelVersionId(refModel.getId())).thenReturn(List.of(rel));
        when(evidences.findByModelVersionId(refModel.getId())).thenReturn(List.of(ev));
        when(evaluations.findByModelVersionIdOrderByCreatedAtDesc(refModel.getId())).thenReturn(List.of(evalRun));
        when(evaluationFindings.findByEvaluationRunId(evalRun.getId())).thenReturn(List.of(finding));
        when(courseQuizService.getIfPublished(workspaceId, labId)).thenReturn(new CourseQuizService.Quiz(1, "Lesson", 80, List.of(), true, "PASSED", true));
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId())).thenReturn(List.of());
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId())).thenReturn(List.of());
        UUID subId = UUID.randomUUID();
        when(submissionService.getMySubmissions(workspaceId)).thenReturn(List.of(SubmissionResponseDTO.builder().id(subId).assignmentId(labId).build()));
        when(submissionReviewService.get(subId)).thenReturn(new SubmissionReviewService.View(subId, 1, "GRADED", null, "Good", null, "Lecturer", null, List.of(), "PASSED"));

        var ctx = service.studentContext(workspaceId, labId);

        assertThat(ctx.referenceArchitecture().diagrams()).hasSize(1);
        assertThat(ctx.referenceArchitecture().diagrams().get(0).mermaidDsl()).isNotBlank();
        assertThat(ctx.referenceArchitecture().evidences()).hasSize(1);
        assertThat(ctx.referenceArchitecture().evaluation().findings()).hasSize(1);
        assertThat(ctx.quiz().passed()).isTrue();
        assertThat(ctx.latestSubmission().getId()).isEqualTo(subId);
        assertThat(ctx.latestReview().labOutcome()).isEqualTo("PASSED");
    }

    @Test
    void frozenExerciseDoesNotFallBackToEditedDraftRuntimeModel() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        var draft = new com.mavis.common.entity.LabStudioExercise();
        draft.setRuntimeModelId(UUID.randomUUID());
        when(labStudioExercises.findByAssignmentId(labId)).thenReturn(Optional.of(draft));
        lab.setStudioExerciseSnapshot(json.createObjectNode().put("instructions", "Published exercise"));
        var existing = RuntimeSession.builder().id(UUID.randomUUID()).assignment(lab)
                .executionStatus("RUNNING").triggeredBy(student).build();
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId()))
                .thenReturn(List.of(existing));

        assertThat(service.startLabStudioSession(workspaceId, labId).getId()).isEqualTo(existing.getId());
        verify(models, never()).findById(draft.getRuntimeModelId());
        verify(runtimeSessionService, never()).createRuntimeSession(any());
    }

    @Test
    void runtimeSourceFromAnotherClassIsRejectedBeforeProvisioning() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        var foreignProject = Project.builder().id(UUID.randomUUID())
                .workspace(Workspace.builder().id(UUID.randomUUID()).build()).build();
        var foreignModel = ModelVersion.builder().id(UUID.randomUUID()).project(foreignProject)
                .sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).project(foreignProject).build()).build();
        lab.setStudioExerciseSnapshot(json.createObjectNode().put("runtimeModelId", foreignModel.getId().toString()));
        when(models.findById(foreignModel.getId())).thenReturn(Optional.of(foreignModel));

        assertThatThrownBy(() -> service.startLabStudioSession(workspaceId, labId))
                .isInstanceOfSatisfying(BusinessException.class,
                        failure -> assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN));
        verify(projects, never()).saveAndFlush(any());
        verify(runtimeSessionService, never()).createRuntimeSession(any());
    }

    @Test
    void startLabStudioSessionRequiresPassedQuizAndProvisionsIdempotently() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(false);
        assertThatThrownBy(() -> service.startLabStudioSession(workspaceId, labId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Quiz");

        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        RuntimeSession existing = RuntimeSession.builder().id(UUID.randomUUID()).assignment(lab)
                .executionStatus("RUNNING").triggeredBy(student).build();
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId()))
                .thenReturn(List.of(existing));
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId()))
                .thenReturn(List.of());
        assertThat(service.startLabStudioSession(workspaceId, labId).getId()).isEqualTo(existing.getId());
        verify(runtimeSessionService, never()).createRuntimeSession(any());

        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId())).thenReturn(List.of());
        when(projects.findByOwnerIdOrderByCreatedAtDesc(student.getId())).thenReturn(List.of());
        when(projects.saveAndFlush(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });
        when(snapshots.saveAndFlush(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });
        ModelElement payEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("payment-service").status("CONFIRMED").build();
        when(elements.findByModelVersionId(any())).thenReturn(List.of(payEl));
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement el = inv.getArgument(0);
            el.setId(payEl.getId());
            return el;
        });
        String compose = "services:\n  payment-service:\n    image: sha256:" + "d".repeat(64);
        var referenceConfiguration = new RuntimeConfiguration();
        referenceConfiguration.setSourceSnapshotId(refSnapshot.getId());
        ObjectNode refProfile = json.createObjectNode().put("sandboxCompose", compose);
        refProfile.putObject("allowedEnvKeys").putArray("payment-service").add("FEATURE_FLAG");
        refProfile.putObject("alternateImages").putArray("payment-service").add("payment@sha256:" + "e".repeat(64));
        referenceConfiguration.setProfile(refProfile);
        when(runtimeConfigurations.findById(refProject.getId())).thenReturn(Optional.of(referenceConfiguration));

        ObjectNode envBindings = json.createObjectNode();
        envBindings.putArray("sandbox-postgres").addObject()
                .put("name", "POSTGRES_PASSWORD").put("reference", "POSTGRES_PASSWORD");
        when(runtimePlanningService.prepareStudioExecutionEnvironment(any(), any(), any(), any(), any(), any()))
                .thenReturn(new RuntimePlanningService.PreparedExecutionEnvironment(
                        java.util.Map.of("POSTGRES_PASSWORD", "sandbox-db-secret"), envBindings));

        UUID createdId = UUID.randomUUID();
        when(runtimeSessionService.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(createdId).build());
        when(runtimeSessionService.approveAndStartSession(createdId)).thenReturn(
                RuntimeSessionResponseDTO.builder().id(createdId).executionStatus("READY_FOR_DISPATCH").assignmentId(labId).build());

        var started = service.startLabStudioSession(workspaceId, labId);
        assertThat(started.getId()).isEqualTo(createdId);
        ArgumentCaptor<RuntimeSessionCreateRequest> reqCaptor = ArgumentCaptor.forClass(RuntimeSessionCreateRequest.class);
        verify(runtimeSessionService).createRuntimeSession(reqCaptor.capture());
        assertThat(reqCaptor.getValue().getAssignmentId()).isEqualTo(labId);
        assertThat(reqCaptor.getValue().getScenarioConfig().path("interactiveStudio").asBoolean()).isTrue();
        assertThat(reqCaptor.getValue().getScenarioConfig().path("profile").path("sandboxCompose").asText())
                .isEqualTo(compose);
        assertThat(reqCaptor.getValue().getScenarioConfig().path("profile").path("allowedEnvKeys")
                .path("payment-service").get(0).asText()).isEqualTo("FEATURE_FLAG");
        assertThat(reqCaptor.getValue().getScenarioConfig().path("profile").path("alternateImages")
                .path("payment-service").get(0).asText()).isEqualTo("payment@sha256:" + "e".repeat(64));
        assertThat(reqCaptor.getValue().getScenarioConfig().path("profile").path("environmentBindings")
                .path("sandbox-postgres").get(0).path("name").asText()).isEqualTo("POSTGRES_PASSWORD");
        assertThat(reqCaptor.getValue().getConfirmedServiceMappings()).containsKey("payment-service");
        verify(runtimePlanningService).storeSessionEnvironment(createdId, java.util.Map.of("POSTGRES_PASSWORD", "sandbox-db-secret"));
    }

    @Test
    void bootstrapSimulatedStudioBlocksOtherStudentAndActivatesSandbox() {
        UUID sessionId = UUID.randomUUID();
        User otherStudent = User.builder().id(UUID.randomUUID()).role(Role.builder().code("STUDENT").build()).build();
        RuntimeSession session = RuntimeSession.builder().id(sessionId).assignment(lab).triggeredBy(otherStudent).executionStatus("READY_FOR_DISPATCH").build();
        when(runtimeSessions.findById(sessionId)).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> service.bootstrapSimulatedStudio(workspaceId, labId, sessionId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN));

        session.setTriggeredBy(student);
        when(runtimeStudioService.bootstrapSimulatedSandbox(sessionId))
                .thenReturn(json.createObjectNode().put("executionStatus", "RUNNING"));
        var res = service.bootstrapSimulatedStudio(workspaceId, labId, sessionId);
        assertThat(res.studio().path("executionStatus").asText()).isEqualTo("RUNNING");
    }

    @Test
    void startLabStudioSessionReusesBaseModelAfterPriorRuntimeEnrichedSession() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId()))
                .thenReturn(List.of());
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId()))
                .thenReturn(List.of());

        Project workingProject = Project.builder().id(UUID.randomUUID()).workspace(workspace).owner(student)
                .assignment(lab).referenceSnapshotId(refSnapshot.getId()).projectType("STUDENT_WORKING").status("ACTIVE").build();
        SourceSnapshot workingSnapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(workingProject)
                .artifactHash(refSnapshot.getArtifactHash()).build();
        when(projects.findByOwnerIdOrderByCreatedAtDesc(student.getId())).thenReturn(List.of(workingProject));
        when(snapshots.findByProjectId(workingProject.getId())).thenReturn(List.of(workingSnapshot));
        when(runtimeConfigurations.findById(refProject.getId())).thenReturn(Optional.of(new RuntimeConfiguration()));

        ModelVersion rev1Base = ModelVersion.builder().id(UUID.randomUUID()).project(workingProject)
                .sourceSnapshot(workingSnapshot).revision(1).origin("USER_CONFIRMED").isLatestValid(false).build();
        ModelVersion rev2Enriched = ModelVersion.builder().id(UUID.randomUUID()).project(workingProject)
                .sourceSnapshot(workingSnapshot).revision(2).origin("RUNTIME_ENRICHED").isLatestValid(true).build();
        when(models.findByProjectIdOrderByRevisionDesc(workingProject.getId())).thenReturn(List.of(rev2Enriched, rev1Base));
        ModelElement payEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER")
                .name("payment-service").status("CONFIRMED").build();
        when(elements.findByModelVersionId(rev1Base.getId())).thenReturn(List.of(payEl));

        UUID secondSessionId = UUID.randomUUID();
        when(runtimeSessionService.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(secondSessionId).build());
        when(runtimeSessionService.approveAndStartSession(secondSessionId)).thenReturn(
                RuntimeSessionResponseDTO.builder().id(secondSessionId).executionStatus("READY_FOR_DISPATCH").build());

        var started = service.startLabStudioSession(workspaceId, labId);
        assertThat(started.getId()).isEqualTo(secondSessionId);
        verify(models, never()).saveAndFlush(any());
        ArgumentCaptor<RuntimeSessionCreateRequest> reqCaptor = ArgumentCaptor.forClass(RuntimeSessionCreateRequest.class);
        verify(runtimeSessionService).createRuntimeSession(reqCaptor.capture());
        assertThat(reqCaptor.getValue().getModelVersionId()).isEqualTo(rev1Base.getId());

        // When only a RUNTIME_ENRICHED revision exists (no base USER_CONFIRMED revision), bump from maxRevision instead of colliding on revision 1.
        when(models.findByProjectIdOrderByRevisionDesc(workingProject.getId())).thenReturn(List.of(rev2Enriched));
        when(models.findMaxRevisionByProjectId(workingProject.getId())).thenReturn(2);
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(workingProject.getId())).thenReturn(Optional.of(rev2Enriched));
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });
        when(elements.findByModelVersionId(refModel.getId())).thenReturn(List.of(payEl));
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement el = inv.getArgument(0);
            el.setId(payEl.getId());
            return el;
        });

        service.startLabStudioSession(workspaceId, labId);
        ArgumentCaptor<ModelVersion> savedModelCaptor = ArgumentCaptor.forClass(ModelVersion.class);
        verify(models).saveAndFlush(savedModelCaptor.capture());
        assertThat(savedModelCaptor.getValue().getRevision()).isEqualTo(3);
        assertThat(savedModelCaptor.getValue().getIsLatestValid()).isFalse();
    }

    @Test
    void startLabStudioSessionClonesRelationshipsAndTargetsGatewayForBaselineProbe() {
        lab.setStudioTopologySnapshot(null);
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId()))
                .thenReturn(List.of());
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId()))
                .thenReturn(List.of());
        when(projects.findByOwnerIdOrderByCreatedAtDesc(student.getId())).thenReturn(List.of());
        when(projects.saveAndFlush(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });
        when(snapshots.saveAndFlush(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        ModelElement catalogEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("catalog-service").status("CONFIRMED").build();
        ModelElement gatewayEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("api-gateway").status("CONFIRMED").build();
        ModelElement orderEl = ModelElement.builder().id(UUID.randomUUID()).elementType("SERVICE_CONTAINER").name("order-service").status("CONFIRMED").build();
        ModelRelationship gwToOrder = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(refModel)
                .sourceElement(gatewayEl)
                .targetElement(orderEl)
                .relationType("CALLS")
                .originLayer("STATIC")
                .build();
        when(elements.findByModelVersionId(any())).thenReturn(List.of(catalogEl, gatewayEl, orderEl));
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement el = inv.getArgument(0);
            el.setId(UUID.randomUUID());
            return el;
        });
        when(relationships.findByModelVersionId(refModel.getId())).thenReturn(List.of(gwToOrder));
        when(runtimeConfigurations.findById(refProject.getId())).thenReturn(Optional.of(new RuntimeConfiguration()));

        UUID createdId = UUID.randomUUID();
        when(runtimeSessionService.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(createdId).build());
        when(runtimeSessionService.approveAndStartSession(createdId)).thenReturn(
                RuntimeSessionResponseDTO.builder().id(createdId).executionStatus("READY_FOR_DISPATCH").assignmentId(labId).build());

        service.startLabStudioSession(workspaceId, labId);

        verify(relationships).save(any(ModelRelationship.class));
        ArgumentCaptor<RuntimeSessionCreateRequest> reqCaptor = ArgumentCaptor.forClass(RuntimeSessionCreateRequest.class);
        verify(runtimeSessionService).createRuntimeSession(reqCaptor.capture());
        var firstStep = reqCaptor.getValue().getScenarioConfig().path("scenario").path("steps").get(0);
        assertThat(firstStep.path("service").asText()).isEqualTo("api-gateway");
        assertThat(firstStep.path("path").asText()).isEqualTo("/api/gateway/orders");
    }

    @Test
    void startLabStudioSessionReusesOwnQueuedSessionAndRejectsOnlyWhenQueueIsFull() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        RuntimeSession queued = RuntimeSession.builder().id(UUID.randomUUID()).assignment(lab)
                .executionStatus("QUEUED").triggeredBy(student).build();
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId()))
                .thenReturn(List.of(queued));
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId()))
                .thenReturn(List.of());

        assertThat(service.startLabStudioSession(workspaceId, labId).getId()).isEqualTo(queued.getId());
        verify(runtimeSessionService, never()).createRuntimeSession(any());

        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId())).thenReturn(List.of());
        when(runtimeSessions.countByExecutionStatusIn(java.util.Set.of("QUEUED"))).thenReturn(30L);

        assertThatThrownBy(() -> service.startLabStudioSession(workspaceId, labId))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getStableCode()).isEqualTo("STUDIO_QUEUE_FULL"));
    }

    @Test
    void startLabStudioSessionEnforcesGlobalPerUserActiveQuotaAndStartCooldown() {
        when(courseLabs.hasPassedCurrentQuiz(lab, student.getId())).thenReturn(true);
        when(runtimeSessions.findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(labId, student.getId())).thenReturn(List.of());
        when(runtimeSessions.findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(workspaceId, student.getId())).thenReturn(List.of());

        // Active session in another Lab blocks starting a second one
        when(runtimeSessions.countActiveNonSimulatedByUser(any(), any())).thenReturn(1L);
        assertThatThrownBy(() -> service.startLabStudioSession(workspaceId, labId))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getStableCode()).isEqualTo("USER_ACTIVE_SESSION_LIMIT"));

        // Even with 0 active sessions, rapid restart within cooldown is rejected
        when(runtimeSessions.countActiveNonSimulatedByUser(any(), any())).thenReturn(0L);
        when(runtimeSessions.findLatestNonSimulatedCreatedEpochSecondsByUser(student.getId()))
                .thenReturn(java.time.Instant.now().getEpochSecond() - 3);
        assertThatThrownBy(() -> service.startLabStudioSession(workspaceId, labId))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getStableCode()).isEqualTo("RUN_COOLDOWN_ACTIVE"));
    }

    @Test
    void redactStudioExerciseForStudentStripsOutageRecoveryStoppedServiceSpoilersFromInstructions() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var raw = mapper.readTree("""
                {
                  "exerciseType": "CIRCUIT_BREAKER",
                  "instructions": "Bước 1: Chạy Docker, xác định service đang tắt sẵn (inventory-service). Bước 2: START lại inventory-service.",
                  "initialState": { "stoppedServices": ["inventory-service"], "stoppedControllers": [] },
                  "successCriteria": {
                    "exerciseType": "CIRCUIT_BREAKER",
                    "targetChangeAction": { "action": "START", "service": "inventory-service" },
                    "rules": [{ "metric": "errorRate" }]
                  }
                }
                """);
        var redacted = CourseLabStudentService.redactStudioExerciseForStudent(raw);
        assertThat(redacted.path("initialState").path("stoppedServices")).isEmpty();
        assertThat(redacted.path("successCriteria").has("targetChangeAction")).isFalse();
        assertThat(redacted.path("instructions").asText())
                .doesNotContainIgnoringCase("inventory-service")
                .contains("Bước 1:");
    }
}
