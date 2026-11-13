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

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
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
    void courseSubmissionReportsEveryMissingFourStageEvidenceItem() {
        var workspace=Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
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
                .hasMessageContaining("INCOMPLETE_4STAGE_EVIDENCE")
                .hasMessageContaining("STEP_1_STATIC_ANALYZED")
                .hasMessageContaining("STEP_2_C4_GROUND_TRUTH_70")
                .hasMessageContaining("STEP_3_RUNTIME_OTEL_VIEW")
                .hasMessageContaining("STEP_4_SIGNED_RUNTIME_RECEIPT");
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
    @DisplayName("WF-04 F11-002: Course Lab submission requires written explanation and freezes studentSnapshots in SHA-256 package digest")
    void courseSubmissionRequiresExplanationAndPersistsStudentSnapshots() {
        var workspace = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        student.setRole(Role.builder().code("STUDENT").build());
        assignment.setWorkspace(workspace);
        assignment.setLabOrder(1);
        assignment.setReferenceModel(modelVersion);
        project.setWorkspace(workspace);
        project.setAssignment(assignment);
        snapshot.setArtifactHash("sha256:" + "a".repeat(64));
        project.setReferenceSnapshotId(snapshot.getId());
        runtimeSession.setReceiptDigest("sha256:" + "b".repeat(64));

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
                .hasMessageContaining("Written theoretical explanation is required");

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
}
