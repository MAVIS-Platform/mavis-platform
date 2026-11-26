package com.mavis.platform.submission.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SubmissionServiceImplTest {
    @Test void theoryOnlyV2SubmitsWithoutDiagramOrStudentProject() {
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setReferenceModel(modelVersion);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(submissionSnapshotRepository.save(any())).thenAnswer(call -> {
            SubmissionSnapshot value = call.getArgument(0);
            value.setId(UUID.randomUUID());
            return value;
        });
        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .submissionNotes("The route controller isolates the payment dependency.")
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO(
                        "THEORY", "Theory explanation", "The sample repository calls payment through a prepared route.")))
                .build();

        var response = submissionService.submitAssignment(request);

        assertThat(response.getDiagramVersionId()).isNull();
        assertThat(response.getTheoryEvidence().path("answers").get(0).path("answer").asText())
                .contains("prepared route");
        assertThat(response.getStudentSnapshots().size()).isEqualTo(1);
        assertThat(response.getStudentSnapshots().get(0).path("snapshotId").asText())
                .isEqualTo("THEORY_THEORY");
        assertThat(response.getEvidencePackageDigest()).matches("sha256:[a-f0-9]{64}");
        verify(projectRepository, never()).findById(any());
        verify(diagramVersionRepository, never()).findById(any());
    }

    @Test void studioV2RejectsTeacherOrForeignWorkspaceSessions() {
        assignment.setLabMode("THEORY_QUIZ_STUDIO");
        assignment.setLabOrder(2);
        assignment.setReferenceModel(modelVersion);
        var labWorkspace = Workspace.builder().id(UUID.randomUUID()).status("ACTIVE").build();
        assignment.setWorkspace(labWorkspace);
        project.setWorkspace(labWorkspace);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .runtimeSessionId(runtimeSessionId)
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO("THEORY", "Theory", "Answer")))
                .build();

        var teacher = User.builder().id(UUID.randomUUID()).build();
        var teacherSession = RuntimeSession.builder().id(runtimeSessionId).assignment(assignment)
                .project(project).sourceSnapshot(snapshot).modelVersion(modelVersion)
                .triggeredBy(teacher).build();
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(teacherSession));
        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Use your own Studio session");

        var wrongAssignment = Assignment.builder().id(UUID.randomUUID()).workspace(labWorkspace).build();
        var wrongLabSession = RuntimeSession.builder().id(runtimeSessionId).assignment(wrongAssignment)
                .project(project).sourceSnapshot(snapshot).modelVersion(modelVersion)
                .triggeredBy(student).build();
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(wrongLabSession));
        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("does not belong to this Lab");

        var otherWorkspace = Workspace.builder().id(UUID.randomUUID()).status("ACTIVE").build();
        var foreignProject = Project.builder().id(UUID.randomUUID()).workspace(otherWorkspace).owner(student).build();
        var foreignSession = RuntimeSession.builder().id(runtimeSessionId).assignment(assignment)
                .project(foreignProject).sourceSnapshot(snapshot).modelVersion(modelVersion)
                .triggeredBy(student).build();
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(foreignSession));
        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("different workspace");
    }

    @Test void theoryOnlyV2RejectsMissingExplanation() {
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setReferenceModel(modelVersion);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));

        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO("THEORY", "Theory", "  ")))
                .build();

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("THEORY_ANSWER_REQUIRED");
        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test void publishedLabEditDoesNotChangeFrozenV2SubmissionDigestOrExport() {
        var labWorkspace = Workspace.builder().id(UUID.randomUUID()).courseMode(false).status("ACTIVE").build();
        assignment.setWorkspace(labWorkspace);
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setReferenceModel(modelVersion);
        snapshot.setArtifactHash("sha256:" + "d".repeat(64));
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));

        var savedHolder = new java.util.concurrent.atomic.AtomicReference<SubmissionSnapshot>();
        when(submissionSnapshotRepository.save(any())).thenAnswer(call -> {
            SubmissionSnapshot value = call.getArgument(0);
            value.setId(UUID.randomUUID());
            value.setSubmittedAt(OffsetDateTime.now());
            savedHolder.set(value);
            return value;
        });

        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .submissionNotes("Initial theory submission")
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO(
                        "THEORY", "Architecture boundaries", "Orders routes synchronously through route controller.")))
                .build();
        var submitted = submissionService.submitAssignment(request);

        assignment.setTitle("Mutated Lab Title After Submission");
        when(submissionSnapshotRepository.findWithDetailsById(submitted.getId())).thenReturn(Optional.of(savedHolder.get()));
        when(feedbackCommentRepository.findBySubmissionIdOrderByCreatedAtAsc(submitted.getId())).thenReturn(List.of());

        var detail = submissionService.getSubmissionById(submitted.getId());
        assertThat(detail.getEvidencePackageDigest()).isEqualTo(submitted.getEvidencePackageDigest());

        var bundle = submissionService.exportSubmissionBundle(submitted.getId());
        assertThat(bundle.getEvidencePackageDigest()).isEqualTo(submitted.getEvidencePackageDigest());
        assertThat(bundle.getTheoryEvidence()).isEqualTo(submitted.getTheoryEvidence());
        assertThat(bundle.getStudentSnapshots()).isEqualTo(submitted.getStudentSnapshots());

        User otherStudent = User.builder().id(UUID.randomUUID()).build();
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(otherStudent);
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN, "Only lecturer"))
                .when(accessPolicyService).requireWorkspaceLecturer(labWorkspace.getId());
        assertThatThrownBy(() -> submissionService.getSubmissionById(submitted.getId()))
                .isInstanceOf(BusinessException.class);
    }

    @Test void foreignWorkspaceStudentCannotSubmitV2Lab() {
        var labWorkspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        assignment.setWorkspace(labWorkspace);
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setReferenceModel(modelVersion);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN, "Not a workspace member"))
                .when(accessPolicyService).requireWorkspaceMember(labWorkspace.getId());

        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO("THEORY", "Theory", "Answer")))
                .build();

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Not a workspace member");
        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test void c4ContainerDoesNotSatisfyAComponentRequirement() {
        assignment.setRequiredDiagramTypes(objectMapper.createArrayNode().add("C4_COMPONENT"));
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        diagramVersion.setNotation("C4");diagramVersion.setLevel("CONTAINER");
        var request=SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId).modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).build();
        assertThatThrownBy(()->submissionService.submitAssignment(request)).isInstanceOf(BusinessException.class).hasMessageContaining("C4_COMPONENT");
        diagramVersion.setNotation("BUNDLE");diagramVersion.setLevel("COURSEWORK_ARTIFACTS");
        var layout=objectMapper.createObjectNode();var artifact=layout.putArray("artifacts").addObject().put("notation","C4").put("level","COMPONENT");artifact.putObject("layoutJson").put("viewId","component:service");diagramVersion.setLayoutJson(layout);
        when(submissionSnapshotRepository.save(any())).thenAnswer(call->{SubmissionSnapshot value=call.getArgument(0);value.setId(UUID.randomUUID());return value;});
        assertThat(submissionService.submitAssignment(request).getDiagramVersionId()).isEqualTo(diagramVersionId);
    }
    @Test void submissionResponseIncludesCreationTimeOnlyAvailableAfterDatabaseFlush() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        var saved=new java.util.concurrent.atomic.AtomicReference<SubmissionSnapshot>();
        when(submissionSnapshotRepository.save(any())).thenAnswer(call->{SubmissionSnapshot value=call.getArgument(0);value.setId(UUID.randomUUID());saved.set(value);return value;});
        doAnswer(call->{saved.get().setSubmittedAt(OffsetDateTime.now());return null;}).when(submissionSnapshotRepository).flush();
        var result=submissionService.submitAssignment(SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId).modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).build());
        assertThat(result.getSubmittedAt()).isNotNull();
        verify(submissionSnapshotRepository).flush();
    }
    @Test void rejectsMissingRequiredDiagramAndAcceptsCompleteFrozenBundle() {
        assignment.setRequiredDiagramTypes(objectMapper.createArrayNode().add("UML_CLASS").add("UML_PACKAGE"));
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        var request=SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId).modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).build();
        assertThatThrownBy(()->submissionService.submitAssignment(request)).isInstanceOf(BusinessException.class).hasMessageContaining("Missing required diagram");
        verify(submissionSnapshotRepository,never()).save(any());
        diagramVersion.setNotation("BUNDLE");var layout=objectMapper.createObjectNode();layout.putArray("artifacts").addObject().put("notation","UML_CLASS");layout.withArray("artifacts").addObject().put("notation","UML_PACKAGE");diagramVersion.setLayoutJson(layout);
        when(submissionSnapshotRepository.save(any())).thenAnswer(call->{SubmissionSnapshot value=call.getArgument(0);value.setId(UUID.randomUUID());return value;});
        assertThat(submissionService.submitAssignment(request).getDiagramVersionId()).isEqualTo(diagramVersionId);
    }

    @Mock
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Mock
    private AssignmentRepository assignmentRepository;

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

    @Mock
    private EvaluationRunRepository evaluationRunRepository;

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private FeedbackCommentRepository feedbackCommentRepository;

    @Mock
    private JobRepository jobRepository;
    @Mock private SubmissionReviewRepository submissionReviewRepository;
    @Mock private com.mavis.common.security.CourseLabPolicy courseLabs;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @InjectMocks
    private SubmissionServiceImpl submissionService;

    private UUID userId;
    private UUID assignmentId;
    private UUID projectId;
    private UUID snapshotId;
    private UUID modelVersionId;
    private UUID diagramVersionId;
    private UUID evaluationRunId;
    private UUID runtimeSessionId;

    private User student;
    private Assignment assignment;
    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion modelVersion;
    private DiagramVersion diagramVersion;
    private EvaluationRun evaluationRun;
    private RuntimeSession runtimeSession;

    @org.mockito.Spy
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        assignmentId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();
        modelVersionId = UUID.randomUUID();
        diagramVersionId = UUID.randomUUID();
        evaluationRunId = UUID.randomUUID();
        runtimeSessionId = UUID.randomUUID();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId.toString(), "credentials", List.of())
        );

        student = User.builder()
                .id(userId)
                .email("student@mavis.edu.vn")
                .fullName("Nguyen Van Sinh Vien")
                .build();

        assignment = Assignment.builder()
                .id(assignmentId)
                .title("Kiến trúc Microservices E-Commerce")
                .dueAt(OffsetDateTime.now().plusDays(7))
                .requireRuntimeTrace(false)
                .build();

        project = Project.builder()
                .id(projectId)
                .name("Fruit Shop Architecture")
                .owner(student)
                .build();

        snapshot = SourceSnapshot.builder()
                .id(snapshotId)
                .project(project)
                .build();

        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .build();

        diagramVersion = DiagramVersion.builder()
                .id(diagramVersionId)
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .build();

        ObjectNode metrics = objectMapper.createObjectNode();
        metrics.put("complianceScore", 95.5);
        evaluationRun = EvaluationRun.builder()
                .id(evaluationRunId)
                .modelVersion(modelVersion)
                .summaryMetrics(metrics)
                .build();

        runtimeSession = RuntimeSession.builder()
                .id(runtimeSessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .scenarioStatus("PASSED").executionStatus("COMPLETED").evidenceStatus("AVAILABLE").cleanupStatus("CONFIRMED").runnerReceiptJson(objectMapper.createObjectNode())
                .traceStatus("COMPLETE")
                .build();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void guidedLabRequiringRuntimeChecksStudioEvidence(boolean studio) {
        var workspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).build();
        assignment.setWorkspace(workspace);
        assignment.setRequireRuntimeTrace(true);
        project.setWorkspace(workspace);
        project.setAssignment(assignment);
        runtimeSession.setModelVersion(modelVersion);
        snapshot.setArtifactHash("sha256:" + "a".repeat(64));

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));

        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(evaluationRunRepository.findById(evaluationRunId)).thenReturn(Optional.of(evaluationRun));
        var request = SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId)
                .modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).evaluationRunId(evaluationRunId)
                .runtimeSessionId(runtimeSessionId).build();
        if (!studio) {
            assertThatThrownBy(() -> submissionService.submitAssignment(request))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("STEP_4_SIGNED_RUNTIME_RECEIPT");
            verify(submissionSnapshotRepository, never()).save(any());
            return;
        }

        runtimeSession.setSandboxEnforcementConfirmed(true);
        runtimeSession.setReceiptDigest("sha256:" + "a".repeat(64));
        var plan = objectMapper.createObjectNode();
        plan.putArray("infrastructureActions").addObject().put("action", "SCALE")
                .put("service", "orders").put("replicas", 4);
        runtimeSession.setScenarioConfig(plan);
        var receipt = objectMapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject();
        var action = receipt.putArray("infrastructureActions").addObject().put("action", "SCALE")
                .put("service", "orders").put("replicasBefore", 1).put("replicasAfter", 4).put("confirmed", true);
        action.putObject("metricsBefore");
        action.putObject("metricsAfter");
        runtimeSession.setRunnerReceiptJson(receipt);
        when(submissionSnapshotRepository.save(any(SubmissionSnapshot.class))).thenAnswer(inv -> {
            SubmissionSnapshot saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setSubmittedAt(OffsetDateTime.now());
            return saved;
        });

        assertThat(submissionService.submitAssignment(request).getRuntimeSessionId()).isEqualTo(runtimeSessionId);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test void submittedStudioEvidenceIsFrozenIndependentlyOfLiveSession() {
        runtimeSession.setScenarioConfig(objectMapper.createObjectNode().put("interactiveStudio",true));
        runtimeSession.setReceiptDigest("sha256:fixture");
        runtimeSession.setSandboxEnforcementConfirmed(true);
        var control=objectMapper.createObjectNode().put("receiptSignature","hmac-sha256:fixture");
        control.putArray("actions").addObject().put("action", "STOP").put("service", "orders");
        var receipt = objectMapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("spanId", "fixture");
        var action = receipt.putArray("infrastructureActions").addObject()
                .put("action", "STOP").put("service", "orders").put("replicasBefore", 1).put("replicasAfter", 0)
                .put("confirmed", true);
        action.putObject("metricsBefore");
        action.putObject("metricsAfter");
        runtimeSession.setRunnerReceiptJson(receipt);
        control.putArray("snapshots").addObject().put("id","captured").put("explanation","Observed fallback").put("imageData","png-fixture");
        runtimeSession.setStudioControl(control);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));
        when(submissionSnapshotRepository.save(any())).thenAnswer(call->{
            SubmissionSnapshot saved=call.getArgument(0);saved.setId(UUID.randomUUID());return saved;
        });
        var request=SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId)
            .modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).runtimeSessionId(runtimeSessionId).build();
        var response=submissionService.submitAssignment(request);
        var saved=org.mockito.ArgumentCaptor.forClass(SubmissionSnapshot.class);
        verify(submissionSnapshotRepository).save(saved.capture());
        control.withArray("snapshots").removeAll();
        assertThat(saved.getValue().getStudioEvidence().path("snapshots").size()).isEqualTo(1);
        assertThat(saved.getValue().getStudioEvidence().path("snapshots").get(0).path("imageData").asText()).isEqualTo("png-fixture");
        assertThat(response.getStudioEvidence().path("snapshots").get(0).has("imageData")).isFalse();
    }

    @Test
    @DisplayName("Nộp bài tập thành công đầy đủ các thành phần (Snapshot, Model, Diagram, Evaluation, RuntimeSession)")
    void testSubmitAssignment_Success() {
        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .evaluationRunId(evaluationRunId)
                .runtimeSessionId(runtimeSessionId)
                .submissionNotes("Bài tập hoàn thành đúng hạn")
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(evaluationRunRepository.findById(evaluationRunId)).thenReturn(Optional.of(evaluationRun));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));
        when(submissionSnapshotRepository.save(any(SubmissionSnapshot.class))).thenAnswer(inv -> {
            SubmissionSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            s.setSubmittedAt(OffsetDateTime.now());
            return s;
        });

        SubmissionResponseDTO response = submissionService.submitAssignment(request);

        assertThat(response).isNotNull();
        assertThat(response.getAssignmentTitle()).isEqualTo("Kiến trúc Microservices E-Commerce");
        assertThat(response.getProjectName()).isEqualTo("Fruit Shop Architecture");
        assertThat(response.getSubmittedByName()).isEqualTo("Nguyen Van Sinh Vien");
        assertThat(response.getModelRevision()).isEqualTo(1);
        assertThat(response.getDiagramNotation()).isEqualTo("C4");
        assertThat(response.getComplianceScore()).isEqualTo(95.5);
        assertThat(response.getScenarioStatus()).isEqualTo("PASSED");
        assertThat(response.getSubmissionNotes()).isEqualTo("Bài tập hoàn thành đúng hạn");
        assertThat(response.getEvidencePackageDigest()).matches("sha256:[a-f0-9]{64}");

        verify(submissionSnapshotRepository).save(any(SubmissionSnapshot.class));
    }

    @Test
    void courseSubmissionRequiresImmutableStaticEvidence() {
        var workspace=Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        when(workspaceRepository.findLockedById(workspace.getId())).thenReturn(Optional.of(workspace));
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setWorkspace(workspace);assignment.setLabOrder(1);assignment.setRequireRuntimeTrace(false);
        assignment.setReferenceModel(modelVersion);project.setWorkspace(workspace);project.setAssignment(assignment);
        snapshot.setArtifactHash(null);project.setReferenceSnapshotId(snapshot.getId());
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignmentRepository.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(courseLabs.currentQuizPass(assignment,userId)).thenReturn(Optional.of(new com.mavis.common.security.CourseLabPolicy.QuizPass(
                UUID.randomUUID(),1,8,10,70,OffsetDateTime.now())));
        var request=SubmissionCreateRequest.builder().assignmentId(assignmentId).projectId(projectId)
                .modelVersionId(modelVersionId).diagramVersionId(diagramVersionId).build();
        assertThatThrownBy(()->submissionService.submitAssignment(request)).isInstanceOf(BusinessException.class)
                .hasMessage("STEP_1_STATIC_ANALYZED");
        verify(submissionSnapshotRepository,never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi đã quá hạn (dueAt < now)")
    void testSubmitAssignment_Overdue_ThrowsBadRequest() {
        assignment.setDueAt(OffsetDateTime.now().minusHours(2));

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Đã quá hạn nộp bài");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi đề bài bắt buộc Runtime Trace nhưng sinh viên không đính kèm")
    void testSubmitAssignment_RequireRuntimeTraceMissing_ThrowsBadRequest() {
        assignment.setRequireRuntimeTrace(true);

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .runtimeSessionId(null) // Thiếu runtime session
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi ModelVersion không thuộc Project")
    void testSubmitAssignment_ModelProjectMismatch_ThrowsBadRequest() {
        Project anotherProject = Project.builder().id(UUID.randomUUID()).build();
        modelVersion.setProject(anotherProject);

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Phiên bản mô hình không thuộc về dự án đã chọn");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Lấy chi tiết bài nộp qua findWithDetailsById kèm số lượng nhận xét (feedbackCount)")
    void testGetSubmissionById_Success() {
        UUID subId = UUID.randomUUID();
        SubmissionSnapshot snapshotEntity = SubmissionSnapshot.builder()
                .id(subId)
                .assignment(assignment)
                .project(project)
                .submittedBy(student)
                .modelVersion(modelVersion)
                .diagramVersion(diagramVersion)
                .submittedAt(OffsetDateTime.now())
                .build();

        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(snapshotEntity));
        when(feedbackCommentRepository.countBySubmissionId(subId)).thenReturn(3L);

        SubmissionResponseDTO dto = submissionService.getSubmissionById(subId);

        assertThat(dto).isNotNull();
        assertThat(dto.getId()).isEqualTo(subId);
        assertThat(dto.getFeedbackCount()).isEqualTo(3L);
        assertThat(dto.getAssignmentTitle()).isEqualTo("Kiến trúc Microservices E-Commerce");
    }

    @Test
    @DisplayName("Chặn nộp bài khi người nộp không phải chủ sở hữu dự án (403 FORBIDDEN)")
    void testSubmitAssignment_NonOwner_ThrowsForbidden() {
        User anotherOwner = User.builder().id(UUID.randomUUID()).build();
        project.setOwner(anotherOwner);

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Chỉ chủ sở hữu của dự án mới có quyền nộp bài");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi ModelVersion thiếu SourceSnapshot bất biến")
    void testSubmitAssignment_MissingSourceSnapshot_ThrowsBadRequest() {
        modelVersion.setSourceSnapshot(null);

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ModelVersion không gắn với SourceSnapshot bất biến hợp lệ");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi ModelVersion là bản nháp PARTIAL chưa được xác nhận")
    void testSubmitAssignment_PartialDraftJob_ThrowsBadRequest() {
        modelVersion.setOrigin("ANALYZER");

        ObjectNode manifest = objectMapper.createObjectNode();
        manifest.put("modelVersionId", modelVersionId.toString());
        manifest.put("completeness", "PARTIAL");

        Job draftJob = Job.builder()
                .id(UUID.randomUUID())
                .status("COMPLETED")
                .sourceSnapshot(snapshot)
                .resultManifest(manifest)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(jobRepository.findBySourceSnapshotId(snapshotId)).thenReturn(List.of(draftJob));

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .build();

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không thể nộp phiên bản mô hình chưa hoàn thiện (PARTIAL)");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi RuntimeSession không chạy trên cùng SourceSnapshot với ModelVersion")
    void testSubmitAssignment_RuntimeSessionSnapshotMismatch_ThrowsBadRequest() {
        SourceSnapshot anotherSnapshot = SourceSnapshot.builder().id(UUID.randomUUID()).build();
        runtimeSession.setSourceSnapshot(anotherSnapshot);

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .runtimeSessionId(runtimeSessionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Phiên thực nghiệm không chạy trên cùng SourceSnapshot với ModelVersion");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi requireRuntimeTrace = true nhưng kịch bản bị FAILED")
    void testSubmitAssignment_RequireRuntimeTrace_ScenarioFailed_ThrowsBadRequest() {
        assignment.setRequireRuntimeTrace(true);
        runtimeSession.setScenarioStatus("FAILED");

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .runtimeSessionId(runtimeSessionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Đề bài yêu cầu Runtime Trace hợp lệ đã hoàn tất (PASSED)");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn nộp bài khi requireRuntimeTrace = true nhưng traceStatus là NONE")
    void testSubmitAssignment_RequireRuntimeTrace_TraceStatusNone_ThrowsBadRequest() {
        assignment.setRequireRuntimeTrace(true);
        runtimeSession.setScenarioStatus("PASSED");
        runtimeSession.setTraceStatus("NONE");

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .runtimeSessionId(runtimeSessionId)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Đề bài yêu cầu Runtime Trace hợp lệ đã hoàn tất (PASSED)");

        verify(submissionSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Ticket V11/T15: exportSubmissionBundle thành công trả về đầy đủ gói bài nộp bất biến")
    void testExportSubmissionBundle_Success() {
        UUID subId = UUID.randomUUID();
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode layout = mapper.createObjectNode();
        layout.putArray("nodes").addObject().put("id", UUID.randomUUID().toString()).put("name", "order-service").put("kind", "SERVICE_CONTAINER");
        diagramVersion.setLayoutJson(layout);

        ObjectNode metrics = mapper.createObjectNode().put("complianceScore", 95.5);
        EvaluationRun evalRun = EvaluationRun.builder()
                .id(UUID.randomUUID())
                .modelVersion(modelVersion)
                .summaryMetrics(metrics)
                .build();

        SubmissionSnapshot subSnapshot = SubmissionSnapshot.builder()
                .id(subId)
                .assignment(assignment)
                .project(project)
                .submittedBy(student)
                .sourceSnapshot(this.snapshot)
                .modelVersion(modelVersion)
                .diagramVersion(diagramVersion)
                .evaluationRun(evalRun)
                .runtimeSession(runtimeSession)
                .submissionNotes("Bài tập hoàn chỉnh")
                .submittedAt(OffsetDateTime.now())
                .build();

        FeedbackComment feedback = FeedbackComment.builder()
                .id(UUID.randomUUID())
                .submission(subSnapshot)
                .lecturer(student)
                .commentText("Thiết kế rất tốt")
                .createdAt(OffsetDateTime.now())
                .build();

        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(subSnapshot));
        when(feedbackCommentRepository.findBySubmissionIdOrderByCreatedAtAsc(subId)).thenReturn(List.of(feedback));

        com.mavis.platform.submission.dto.SubmissionExportBundleDTO bundle = submissionService.exportSubmissionBundle(subId);

        assertThat(bundle).isNotNull();
        assertThat(bundle.getSubmissionId()).isEqualTo(subId);
        assertThat(bundle.getProjectName()).isEqualTo(project.getName());
        assertThat(bundle.getAssignmentTitle()).isEqualTo(assignment.getTitle());
        assertThat(bundle.getComplianceScore()).isEqualTo(95.5);
        assertThat(bundle.getMermaidDsl()).contains("order-service");
        assertThat(bundle.getLecturerFeedbacks()).hasSize(1);
        assertThat(bundle.getMarkdownSummaryReport()).contains("BÁO CÁO TỔNG HỢP GÓI BÀI NỘP BẤT BIẾN");
        assertThat(bundle.getMarkdownSummaryReport()).contains("95.5");
        var review=new SubmissionReview();review.setStatus("DRAFT");review.setScore(new java.math.BigDecimal("88.5"));review.setSummary("Private grading notes");review.setLecturer(student);review.setUpdatedAt(OffsetDateTime.now());
        when(submissionReviewRepository.findBySubmissionId(subId)).thenReturn(Optional.of(review));
        var privateExport=submissionService.exportSubmissionBundle(subId);
        assertThat(privateExport.getReviewSummary()).isEmpty();assertThat(privateExport.getLecturerScore()).isNull();
        review.setStatus("GRADED");review.setSummary("Published marking summary");
        var publicExport=submissionService.exportSubmissionBundle(subId);
        assertThat(publicExport.getLecturerScore()).isEqualByComparingTo("88.5");assertThat(publicExport.getReviewStatus()).isEqualTo("GRADED");
        assertThat(publicExport.getMarkdownSummaryReport()).contains("Published marking summary").doesNotContain("Private grading notes");
    }

    @Test
    @DisplayName("Security: exportSubmissionBundle và getSubmissionById ẩn exerciseEvaluation với STUDENT nhưng giữ nguyên với LECTURER")
    void testStudioEvidenceRedactsAutoCheckForStudentButPreservesForLecturer() {
        UUID subId = UUID.randomUUID();
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode studioEv = mapper.createObjectNode();
        studioEv.put("receiptDigest", "sha256:abc123");
        ObjectNode snapObj = studioEv.putArray("snapshots").addObject().put("id", "snap-1");
        snapObj.putObject("exerciseEvaluation").put("autoScorePercent", 100).put("passed", true);
        studioEv.putObject("exerciseEvaluation").put("f1Score", 1.0).put("passed", true);
        ObjectNode receiptObj = studioEv.putObject("receipt");
        receiptObj.putObject("exerciseEvaluation").put("passed", true);
        receiptObj.putArray("snapshots").addObject().put("id", "snap-1")
                .putObject("exerciseEvaluation").put("passed", true);

        SubmissionSnapshot subSnapshot = SubmissionSnapshot.builder()
                .id(subId)
                .assignment(assignment)
                .project(project)
                .submittedBy(student)
                .sourceSnapshot(this.snapshot)
                .modelVersion(modelVersion)
                .studioEvidence(studioEv)
                .submittedAt(OffsetDateTime.now())
                .build();

        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(subSnapshot));
        when(feedbackCommentRepository.findBySubmissionIdOrderByCreatedAtAsc(subId)).thenReturn(List.of());
        when(submissionReviewRepository.findBySubmissionId(subId)).thenReturn(Optional.empty());

        com.mavis.common.entity.Role studentRole = new com.mavis.common.entity.Role();
        studentRole.setCode("STUDENT");
        student.setRole(studentRole);
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(student);

        var studentExport = submissionService.exportSubmissionBundle(subId);
        assertThat(studentExport.getStudioEvidence().path("receiptDigest").asText()).isEqualTo("sha256:abc123");
        assertThat(studentExport.getStudioEvidence().toString()).doesNotContain("exerciseEvaluation");
        assertThat(studentExport.getStudioEvidence().path("snapshots").get(0).path("id").asText()).isEqualTo("snap-1");

        var studentRead = submissionService.getSubmissionById(subId);
        assertThat(studentRead.getStudioEvidence().toString()).doesNotContain("exerciseEvaluation");

        com.mavis.common.entity.Role lecturerRole = new com.mavis.common.entity.Role();
        lecturerRole.setCode("LECTURER");
        User lecturerUser = User.builder().id(UUID.randomUUID()).email("lec@mavis.edu.vn").role(lecturerRole).build();
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(lecturerUser);

        var lecturerExport = submissionService.exportSubmissionBundle(subId);
        assertThat(lecturerExport.getStudioEvidence().path("exerciseEvaluation").path("passed").asBoolean()).isTrue();
        assertThat(lecturerExport.getStudioEvidence().path("snapshots").get(0).path("exerciseEvaluation").path("autoScorePercent").asInt()).isEqualTo(100);

        var lecturerRead = submissionService.getSubmissionById(subId);
        assertThat(lecturerRead.getStudioEvidence().path("exerciseEvaluation").path("f1Score").asDouble()).isEqualTo(1.0);
        assertThat(lecturerRead.getStudioEvidence().path("snapshots").get(0).path("exerciseEvaluation").path("passed").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("Ticket V11/T15: exportSubmissionBundle ném NOT_FOUND khi submissionId không tồn tại")
    void testExportSubmissionBundle_NotFound() {
        UUID nonExistent = UUID.randomUUID();
        when(submissionSnapshotRepository.findWithDetailsById(nonExistent)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> submissionService.exportSubmissionBundle(nonExistent))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không tìm thấy bài nộp với ID");
    }

    @Test
    @DisplayName("Ticket V11/T15: exportSubmissionBundle ném FORBIDDEN khi người dùng lạ không có quyền đọc")
    void testExportSubmissionBundle_Forbidden() {
        UUID subId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        User otherOwner = User.builder().id(otherUserId).build();
        Project otherProject = Project.builder().id(UUID.randomUUID()).owner(otherOwner).build();

        SubmissionSnapshot subSnapshot = SubmissionSnapshot.builder()
                .id(subId)
                .assignment(assignment)
                .project(otherProject)
                .submittedBy(otherOwner)
                .build();

        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(subSnapshot));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập gói bài nộp này")).when(accessPolicyService).requireProjectReadAccess(otherProject);

        assertThatThrownBy(() -> submissionService.exportSubmissionBundle(subId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Bạn không có quyền truy cập gói bài nộp này");
    }

    @Test
    void submissionDetailRejectsUnrelatedUserBeforeReadingFeedback() {
        UUID id = UUID.randomUUID();
        SubmissionSnapshot entry = SubmissionSnapshot.builder().id(id).project(project).build();
        when(submissionSnapshotRepository.findWithDetailsById(id)).thenReturn(Optional.of(entry));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN))
                .when(accessPolicyService).requireProjectReadAccess(project);
        assertThatThrownBy(() -> submissionService.getSubmissionById(id)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(feedbackCommentRepository);
    }

    @Test
    void projectSubmissionListRejectsUnrelatedUserBeforeQuery() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN))
                .when(accessPolicyService).requireProjectReadAccess(project);
        assertThatThrownBy(() -> submissionService.getSubmissionsByProject(projectId)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(submissionSnapshotRepository);
    }

    @Test
    void submissionExportRejectsUnrelatedUserBeforeLoadingArtifacts() {
        UUID id = UUID.randomUUID();
        SubmissionSnapshot entry = SubmissionSnapshot.builder().id(id).project(project).build();
        when(submissionSnapshotRepository.findWithDetailsById(id)).thenReturn(Optional.of(entry));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN))
                .when(accessPolicyService).requireProjectReadAccess(project);
        assertThatThrownBy(() -> submissionService.exportSubmissionBundle(id)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(modelVersionRepository, diagramVersionRepository, feedbackCommentRepository);
    }
    @Test void personalListingUsesActiveIdentityAndAdminFlag(){
        student.setRole(Role.builder().code("STUDENT").build());when(accessPolicyService.requireCurrentActiveUser()).thenReturn(student);
        when(submissionSnapshotRepository.findVisibleTo(userId,false)).thenReturn(List.of());assertThat(submissionService.getMySubmissions()).isEmpty();
        student.setRole(Role.builder().code("SYSTEM_ADMIN").build());when(submissionSnapshotRepository.findVisibleTo(userId,true)).thenReturn(List.of());assertThat(submissionService.getMySubmissions()).isEmpty();
        verify(submissionSnapshotRepository).findVisibleTo(userId,false);verify(submissionSnapshotRepository).findVisibleTo(userId,true);
    }

    @Test
    void personalListingIncludesWorkspaceAndLabMetadataAndFiltersByWorkspace() {
        student.setRole(Role.builder().code("STUDENT").build());
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(student);

        UUID wsAId = UUID.randomUUID();
        UUID wsBId = UUID.randomUUID();
        Workspace wsA = Workspace.builder().id(wsAId).name("SWP490-A").build();
        Workspace wsB = Workspace.builder().id(wsBId).name("SWP490-B").build();
        Assignment labA = Assignment.builder().id(UUID.randomUUID()).workspace(wsA)
                .title("Lab 01 Static").labOrder(1).labMode("THEORY_QUIZ").build();
        Assignment labB = Assignment.builder().id(UUID.randomUUID()).workspace(wsB)
                .title("Lab 02 Studio").labOrder(2).labMode("THEORY_QUIZ_STUDIO").build();

        SubmissionSnapshot subA = SubmissionSnapshot.builder()
                .id(UUID.randomUUID()).assignment(labA).project(project).submittedBy(student)
                .sourceSnapshot(snapshot).modelVersion(modelVersion).evidencePackageDigest("sha256:" + "a".repeat(64)).build();
        SubmissionSnapshot subB = SubmissionSnapshot.builder()
                .id(UUID.randomUUID()).assignment(labB).project(project).submittedBy(student)
                .sourceSnapshot(snapshot).modelVersion(modelVersion).evidencePackageDigest("sha256:" + "b".repeat(64)).build();

        when(submissionSnapshotRepository.findVisibleTo(userId, false)).thenReturn(List.of(subA, subB));
        when(feedbackCommentRepository.countFeedbacksBySubmissionIds(anyList())).thenReturn(List.of());

        List<SubmissionResponseDTO> filtered = submissionService.getMySubmissions(wsAId);
        assertThat(filtered).hasSize(1);
        assertThat(filtered.get(0).getWorkspaceId()).isEqualTo(wsAId);
        assertThat(filtered.get(0).getWorkspaceName()).isEqualTo("SWP490-A");
        assertThat(filtered.get(0).getAssignmentTitle()).isEqualTo("Lab 01 Static");
        assertThat(filtered.get(0).getLabOrder()).isEqualTo(1);
        assertThat(filtered.get(0).getLabMode()).isEqualTo("THEORY_QUIZ");
    }

    @Test
    void rejectsResubmissionAfterGuidedLabPasses() {
        var workspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setWorkspace(workspace);
        assignment.setLabOrder(1);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(workspaceRepository.findLockedById(workspace.getId())).thenReturn(Optional.of(workspace));
        when(courseLabs.passedAssignments(workspace.getId(), userId)).thenReturn(java.util.Set.of(assignmentId));

        assertThatThrownBy(() -> submissionService.submitAssignment(
                SubmissionCreateRequest.builder().assignmentId(assignmentId).build()))
                .isInstanceOf(BusinessException.class).hasMessage("LAB_SUBMISSION_ALREADY_PASSED");
        verifyNoInteractions(projectRepository, submissionSnapshotRepository);
    }

    @Test
    @DisplayName("WF-04 F11-002: Course Lab submission requires written explanation and freezes studentSnapshots in SHA-256 package digest")
    void courseSubmissionRequiresExplanationAndPersistsStudentSnapshots() {
        var workspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        when(workspaceRepository.findLockedById(workspace.getId())).thenReturn(Optional.of(workspace));
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setWorkspace(workspace);
        assignment.setLabOrder(1);
        assignment.setReferenceModel(modelVersion);
        project.setWorkspace(workspace);
        project.setAssignment(assignment);
        snapshot.setArtifactHash("sha256:" + "a".repeat(64));
        project.setReferenceSnapshotId(snapshot.getId());
        runtimeSession.setReceiptDigest("sha256:" + "b".repeat(64));
        runtimeSession.setSandboxEnforcementConfirmed(true);
        runtimeSession.setModelVersion(modelVersion);
        var plan = objectMapper.createObjectNode();
        plan.putArray("infrastructureActions").addObject().put("action", "SCALE")
                .put("service", "orders").put("replicas", 4);
        runtimeSession.setScenarioConfig(plan);
        var receipt = objectMapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject();
        var action = receipt.putArray("infrastructureActions").addObject().put("action", "SCALE")
                .put("service", "orders").put("replicasBefore", 1).put("replicasAfter", 4).put("confirmed", true);
        action.putObject("metricsBefore");
        action.putObject("metricsAfter");
        runtimeSession.setRunnerReceiptJson(receipt);

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(assignmentRepository.findLockedById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersionId)).thenReturn(Optional.of(diagramVersion));
        when(evaluationRunRepository.findById(evaluationRunId)).thenReturn(Optional.of(evaluationRun));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));
        when(courseLabs.currentQuizPass(assignment, userId)).thenReturn(Optional.of(
                new com.mavis.common.security.CourseLabPolicy.QuizPass(UUID.randomUUID(), 1, 8, 10, 80, OffsetDateTime.now())));

        var missingNotesReq = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId).projectId(projectId)
                .modelVersionId(modelVersionId).diagramVersionId(diagramVersionId)
                .evaluationRunId(evaluationRunId).runtimeSessionId(runtimeSessionId)
                .submissionNotes("   ")
                .build();

        assertThatThrownBy(() -> submissionService.submitAssignment(missingNotesReq))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");

        var snapshotItems = List.of(
                SubmissionCreateRequest.StudentSnapshotItemDTO.builder()
                        .snapshotId("STEP_1_STATIC")
                        .step("STEP_1_STATIC")
                        .title("Order -> Payment boundary")
                        .targetViewOrService("order-service")
                        .writtenExplanation("Gateway routes synchronously to order-service over REST before async payment event.")
                        .build()
        );
        var completeReq = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId).projectId(projectId)
                .modelVersionId(modelVersionId).diagramVersionId(diagramVersionId)
                .evaluationRunId(evaluationRunId).runtimeSessionId(runtimeSessionId)
                .studentSnapshots(snapshotItems)
                .build();

        when(submissionSnapshotRepository.save(any())).thenAnswer(call -> {
            SubmissionSnapshot saved = call.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        SubmissionResponseDTO dto = submissionService.submitAssignment(completeReq);
        assertThat(dto.getStudentSnapshots()).isNotNull();
        assertThat(dto.getStudentSnapshots().isArray()).isTrue();
        assertThat(dto.getStudentSnapshots().get(0).path("snapshotId").asText()).isEqualTo("STEP_1_STATIC");
        assertThat(dto.getEvidencePackageDigest()).matches("^sha256:[a-f0-9]{64}$");
    }

    @Test
    @DisplayName("LEC-BE-01: Batch-enriches reviewStatus/reviewScore/labOutcome and filters by status/outcome")
    void getSubmissionsByAssignmentBatchEnrichesAndFiltersReviews() {
        var workspace = Workspace.builder().id(UUID.randomUUID()).name("SE1819").status("ACTIVE").build();
        assignment.setWorkspace(workspace);
        var gradedId = UUID.randomUUID();
        var returnedId = UUID.randomUUID();

        var gradedSub = SubmissionSnapshot.builder()
                .id(gradedId).assignment(assignment).submittedBy(student)
                .submittedAt(OffsetDateTime.now()).build();
        var returnedSub = SubmissionSnapshot.builder()
                .id(returnedId).assignment(assignment).submittedBy(student)
                .submittedAt(OffsetDateTime.now().minusMinutes(5)).build();

        var lecturer = User.builder().id(UUID.randomUUID()).fullName("Dr. Triet").build();
        var gradedReview = new SubmissionReview();
        gradedReview.setSubmission(gradedSub);
        gradedReview.setLecturer(lecturer);
        gradedReview.setStatus("GRADED");
        gradedReview.setScore(java.math.BigDecimal.valueOf(92.5));
        gradedReview.setLabOutcome("PASSED");
        gradedReview.setSummary("Clean separation of concerns");
        gradedReview.setUpdatedAt(OffsetDateTime.now());

        var returnedReview = new SubmissionReview();
        returnedReview.setSubmission(returnedSub);
        returnedReview.setLecturer(lecturer);
        returnedReview.setStatus("RETURNED");
        returnedReview.setScore(java.math.BigDecimal.valueOf(40.0));
        returnedReview.setLabOutcome("NEEDS_REVISION");
        returnedReview.setSummary("Fix Reverse BFS explanation");
        returnedReview.setUpdatedAt(OffsetDateTime.now());

        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(submissionSnapshotRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId))
                .thenReturn(List.of(gradedSub, returnedSub));
        when(feedbackCommentRepository.countFeedbacksBySubmissionIds(anyList())).thenReturn(List.of());
        when(submissionReviewRepository.findBySubmissionIdIn(anyList()))
                .thenReturn(List.of(gradedReview, returnedReview));

        List<SubmissionResponseDTO> all = submissionService.getSubmissionsByAssignment(assignmentId, null, null);
        assertThat(all).hasSize(2);
        assertThat(all.get(0).getReviewStatus()).isEqualTo("GRADED");
        assertThat(all.get(0).getReviewScore()).isEqualTo(92.5);
        assertThat(all.get(0).getLabOutcome()).isEqualTo("PASSED");
        assertThat(all.get(0).getGradedByName()).isEqualTo("Dr. Triet");

        List<SubmissionResponseDTO> returnedOnly = submissionService.getSubmissionsByAssignment(assignmentId, "RETURNED", "NEEDS_REVISION");
        assertThat(returnedOnly).hasSize(1);
        assertThat(returnedOnly.get(0).getId()).isEqualTo(returnedId);
        verify(submissionReviewRepository, times(2)).findBySubmissionIdIn(anyList());
    }

    @Test
    @DisplayName("Studio submission needs a verified receipt and explained captures")
    void studioV2RequiresExplainedSnapshotsInAdditionToVerifiedReceipt() {
        var labWorkspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setLabMode("THEORY_QUIZ_STUDIO");
        assignment.setLabOrder(1);
        assignment.setWorkspace(labWorkspace);
        assignment.setReferenceModel(modelVersion);
        project.setWorkspace(labWorkspace);

        runtimeSession.setAssignment(assignment);
        runtimeSession.setTriggeredBy(student);
        runtimeSession.setModelVersion(modelVersion);
        var scenarioPlan = objectMapper.createObjectNode().put("interactiveStudio", true);
        scenarioPlan.putArray("infrastructureActions").addObject()
                .put("action", "SCALE").put("service", "orders").put("replicas", 2);
        runtimeSession.setScenarioConfig(scenarioPlan);
        runtimeSession.setSandboxEnforcementConfirmed(true);
        runtimeSession.setReceiptDigest("sha256:" + "b".repeat(64));

        var control = objectMapper.createObjectNode().put("receiptSignature", "hmac-sha256:verified");
        control.putArray("actions").addObject()
                .put("action", "SCALE").put("service", "orders").put("replicas", 2);
        var captures = control.putArray("snapshots");
        runtimeSession.setStudioControl(control);

        var receipt = objectMapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("spanId", "s1");
        var action = receipt.putArray("infrastructureActions").addObject()
                .put("action", "SCALE").put("service", "orders")
                .put("replicasBefore", 1).put("replicasAfter", 2).put("confirmed", true);
        action.putObject("metricsBefore");
        action.putObject("metricsAfter");
        runtimeSession.setRunnerReceiptJson(receipt);

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(workspaceRepository.findLockedById(labWorkspace.getId())).thenReturn(Optional.of(labWorkspace));
        when(courseLabs.currentQuizPass(assignment, userId)).thenReturn(Optional.of(
                new com.mavis.common.security.CourseLabPolicy.QuizPass(UUID.randomUUID(), 1, 5, 5, 100, OffsetDateTime.now())));
        when(runtimeSessionRepository.findById(runtimeSessionId)).thenReturn(Optional.of(runtimeSession));
        when(submissionSnapshotRepository.save(any())).thenAnswer(call -> {
            SubmissionSnapshot saved = call.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setSubmittedAt(OffsetDateTime.now());
            return saved;
        });

        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .runtimeSessionId(runtimeSessionId)
                .submissionNotes("Scaled orders to 2 replicas after starting payment.")
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO(
                        "THEORY", "Theory explanation", "Service boundaries verified in Studio Live.")))
                .build();

        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOfSatisfying(BusinessException.class, failure -> {
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                    assertThat(failure.getMessage()).contains("STUDIO_SNAPSHOT_REQUIRED");
                });
        var capture = captures.addObject().put("id", "capture-1").put("title", "Scale observation");
        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOfSatisfying(BusinessException.class, failure -> {
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                    assertThat(failure.getMessage()).contains("STUDIO_SNAPSHOT_EVIDENCE_INVALID");
                });
        capture.put("explanation", "Orders scaled from one replica to two.");
        captures.add(capture.deepCopy());
        assertThatThrownBy(() -> submissionService.submitAssignment(request))
                .isInstanceOfSatisfying(BusinessException.class, failure -> {
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.BAD_REQUEST);
                    assertThat(failure.getMessage()).contains("STUDIO_SNAPSHOT_EVIDENCE_INVALID");
                });
        verify(submissionSnapshotRepository, never()).save(any());
        captures.remove(1);

        SubmissionResponseDTO response = submissionService.submitAssignment(request);
        assertThat(response.getRuntimeSessionId()).isEqualTo(runtimeSessionId);
        assertThat(response.getStudioEvidence().path("receiptSignature").asText()).isEqualTo("hmac-sha256:verified");
        assertThat(response.getStudioEvidence().path("snapshots").isArray()).isTrue();
        assertThat(response.getStudioEvidence().path("snapshots").size()).isEqualTo(1);
        assertThat(response.getStudentSnapshots().path(1).path("snapshotId").asText())
                .isEqualTo("STUDIO_capture-1");

        // Studio Lab without a per-Lab quiz must record labTier=THEORY_QUIZ_STUDIO (never THEORY_ONLY).
        when(courseLabs.isQuizNotRequired(assignment)).thenReturn(true);
        SubmissionResponseDTO noQuizStudio = submissionService.submitAssignment(request);
        assertThat(noQuizStudio.getCourseQuizEvidence().path("status").asText()).isEqualTo("NOT_REQUIRED");
        assertThat(noQuizStudio.getCourseQuizEvidence().path("labTier").asText()).isEqualTo("THEORY_QUIZ_STUDIO");
    }

    @Test
    @DisplayName("submitTheoryV2 accepts THEORY_QUIZ submission without a reference model")
    void theoryQuizV2SubmitsWithoutReferenceModel() {
        var labWorkspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setLabMode("THEORY_QUIZ");
        assignment.setLabOrder(2);
        assignment.setWorkspace(labWorkspace);
        assignment.setReferenceModel(null);

        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(workspaceRepository.findLockedById(labWorkspace.getId())).thenReturn(Optional.of(labWorkspace));
        when(courseLabs.currentQuizPass(assignment, userId)).thenReturn(Optional.of(
                new com.mavis.common.security.CourseLabPolicy.QuizPass(UUID.randomUUID(), 1, 2, 2, 100, OffsetDateTime.now())));
        when(submissionSnapshotRepository.save(any())).thenAnswer(call -> {
            SubmissionSnapshot saved = call.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setSubmittedAt(OffsetDateTime.now());
            return saved;
        });

        var request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .submissionNotes("Clean Architecture enforces inward dependency rule.")
                .theoryAnswers(List.of(new SubmissionCreateRequest.TheoryAnswerDTO(
                        "THEORY", "Theory explanation", "Clean Architecture keeps domain entities independent of frameworks.")))
                .build();

        SubmissionResponseDTO response = submissionService.submitAssignment(request);
        assertThat(response.getProjectId()).isNull();
        assertThat(response.getModelVersionId()).isNull();
        assertThat(response.getSourceSnapshotId()).isNull();
        assertThat(response.getCourseQuizEvidence().path("status").asText()).isEqualTo("PASSED");
        assertThat(response.getEvidencePackageDigest()).matches("sha256:[a-f0-9]{64}");
    }

    @Test
    @DisplayName("Class-wide submissions excludes detached V1 labs, puts PENDING first, and populates 0-10 score")
    void getSubmissionsByWorkspaceAggregatesActiveLabsOnlyAndSortsPendingFirst() {
        var courseWs = Workspace.builder().id(UUID.randomUUID()).name("JAVA-MS-2026").courseMode(true).status("ACTIVE").build();
        var activeLab = Assignment.builder().id(UUID.randomUUID()).workspace(courseWs).title("Active Lab 1").labOrder(1).build();
        var detachedV1 = Assignment.builder().id(UUID.randomUUID()).workspace(courseWs).title("Obsolete V1 Lab").labOrder(null)
                .aiPolicy(objectMapper.createObjectNode().put("archivedV1", true)).build();

        var gradedOld = SubmissionSnapshot.builder().id(UUID.randomUUID()).assignment(activeLab).submittedBy(student)
                .submittedAt(OffsetDateTime.now().minusMinutes(1)).build();
        var pendingOlder = SubmissionSnapshot.builder().id(UUID.randomUUID()).assignment(activeLab).submittedBy(student)
                .submittedAt(OffsetDateTime.now().minusMinutes(10)).build();
        var obsoleteSub = SubmissionSnapshot.builder().id(UUID.randomUUID()).assignment(detachedV1).submittedBy(student)
                .submittedAt(OffsetDateTime.now()).build();

        var rev = new SubmissionReview();
        rev.setSubmission(gradedOld);
        rev.setStatus("GRADED");
        rev.setScore(java.math.BigDecimal.valueOf(85.0));
        rev.setLabOutcome("PASSED");

        when(workspaceRepository.findById(courseWs.getId())).thenReturn(Optional.of(courseWs));
        when(assignmentRepository.findByWorkspaceIdOrderByCreatedAtDesc(courseWs.getId()))
                .thenReturn(List.of(activeLab, detachedV1));
        when(submissionSnapshotRepository.findByAssignmentIdInOrderBySubmittedAtDesc(List.of(activeLab.getId())))
                .thenReturn(List.of(gradedOld, pendingOlder));
        when(feedbackCommentRepository.countFeedbacksBySubmissionIds(anyList())).thenReturn(List.of());
        when(submissionReviewRepository.findBySubmissionIdIn(anyList())).thenReturn(List.of(rev));

        List<SubmissionResponseDTO> classSubs = submissionService.getSubmissionsByWorkspace(courseWs.getId(), null, null);
        assertThat(classSubs).extracting(SubmissionResponseDTO::getId)
                .containsExactly(pendingOlder.getId(), gradedOld.getId());
        assertThat(classSubs.get(1).getReviewScore()).isEqualTo(85.0);
        assertThat(classSubs.get(1).getReviewScoreTenScale()).isEqualTo(8.5);

        User lecturerUser = User.builder().id(UUID.randomUUID()).role(Role.builder().code("LECTURER").build()).build();
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(lecturerUser);
        when(submissionSnapshotRepository.findVisibleTo(lecturerUser.getId(), false))
                .thenReturn(List.of(obsoleteSub, gradedOld, pendingOlder));

        List<SubmissionResponseDTO> dashboardSubs = submissionService.getMySubmissions(courseWs.getId());
        assertThat(dashboardSubs).extracting(SubmissionResponseDTO::getId)
                .containsExactlyInAnyOrder(gradedOld.getId(), pendingOlder.getId())
                .doesNotContain(obsoleteSub.getId());
    }

    @Test
    void lightweightSubmissionListSqlStripsHeavyBlobsAndAvoidsBareQuestionMarkOperator() {
        String sql = SubmissionServiceImpl.lightweightSelectSql();
        assertThat(sql)
                .doesNotContain(" ? ")
                .doesNotContain("runner_receipt_json")
                .doesNotContain("studio_control")
                .doesNotContain("layout_json")
                .contains("snap - 'telemetry' - 'actions' - 'imageData'");

        String exportSql = SubmissionServiceImpl.lightweightExportSql();
        assertThat(exportSql)
                .doesNotContain(" ? ")
                .doesNotContain("runner_receipt_json")
                .doesNotContain("studio_control")
                .doesNotContain("studio_topology_snapshot")
                .contains("s.studio_evidence::text");

        var jdbcMock = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        org.springframework.test.util.ReflectionTestUtils.setField(submissionService, "jdbc", jdbcMock);
        try {
            student.setRole(Role.builder().code("STUDENT").build());
            when(accessPolicyService.requireCurrentActiveUser()).thenReturn(student);
            UUID targetWsId = UUID.randomUUID();
            when(jdbcMock.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class)))
                    .thenReturn(List.of());

            List<SubmissionResponseDTO> rows = submissionService.getMySubmissions(targetWsId);
            assertThat(rows).isEmpty();
            var sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
            verify(jdbcMock).query(sqlCaptor.capture(), any(org.springframework.jdbc.core.RowMapper.class),
                    eq(userId), eq(userId), eq(targetWsId));
            assertThat(sqlCaptor.getValue()).contains("AND a.workspace_id = ?");
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(submissionService, "jdbc", null);
        }
    }
}
