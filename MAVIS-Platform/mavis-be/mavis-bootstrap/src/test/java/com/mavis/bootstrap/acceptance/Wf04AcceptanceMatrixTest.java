package com.mavis.bootstrap.acceptance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.bootstrap.notifications.NotificationController;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.SubmissionReview;
import com.mavis.common.entity.SubmissionSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.FeedbackCommentRepository;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.SubmissionReviewRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.platform.admin.service.AuditLogService;
import com.mavis.platform.admin.service.impl.AdminPortalServiceImpl;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionExportBundleDTO;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import com.mavis.platform.submission.service.impl.SubmissionReviewService;
import com.mavis.platform.submission.service.impl.SubmissionServiceImpl;
import com.mavis.platform.workspace.service.CourseAccessService;
import com.mavis.platform.workspace.service.CourseProgressionService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Automated granular acceptance verification matrix covering WF-04 test cases
 * (F04-001..008, F11-001..008, F12-001..008, TC-GR01..06, TC-WF04-E2E, TC-ST04, TC-N06).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class Wf04AcceptanceMatrixTest {

    @Mock private SubmissionSnapshotRepository submissionSnapshotRepository;
    @Mock private AssignmentRepository assignmentRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private UserRepository userRepository;
    @Mock private ModelVersionRepository modelVersionRepository;
    @Mock private DiagramVersionRepository diagramVersionRepository;
    @Mock private EvaluationRunRepository evaluationRunRepository;
    @Mock private RuntimeSessionRepository runtimeSessionRepository;
    @Mock private SourceSnapshotRepository sourceSnapshotRepository;
    @Mock private FeedbackCommentRepository feedbackCommentRepository;
    @Mock private JobRepository jobRepository;
    @Mock private SubmissionReviewRepository submissionReviewRepository;
    @Mock private CourseLabPolicy courseLabs;
    @Mock private AccessPolicyService accessPolicyService;
    @Mock private EntityManager entityManager;
    @Mock private CourseProgressionService courseProgression;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private AuditLogService auditLogService;
    @Mock private JdbcTemplate jdbc;

    @Spy private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks private SubmissionServiceImpl submissionService;
    @InjectMocks private SubmissionReviewService reviewService;
    @InjectMocks private AdminPortalServiceImpl adminPortal;

    private CourseAccessService courseAccess;
    private NotificationController notificationController;

    private User student;
    private User otherStudent;
    private User lecturer;
    private User otherLecturer;
    private User admin;
    private Workspace workspace;
    private Assignment lab01;
    private Assignment lab02;
    private Project studentProject;
    private SourceSnapshot sourceSnapshot;
    private ModelVersion modelVersion;
    private DiagramVersion diagramVersion;
    private EvaluationRun evaluationRun;
    private RuntimeSession verifiedSession;

    private final Set<UUID> passedAssignments = ConcurrentHashMap.newKeySet();

    @BeforeEach
    void setUp() {
        Role studentRole = Role.builder().id(UUID.randomUUID()).code("STUDENT").build();
        Role lecturerRole = Role.builder().id(UUID.randomUUID()).code("LECTURER").build();
        Role adminRole = Role.builder().id(UUID.randomUUID()).code("SYSTEM_ADMIN").build();

        student = User.builder().id(UUID.randomUUID()).email("student@fpt.edu.vn").fullName("Student").role(studentRole).status("ACTIVE").build();
        otherStudent = User.builder().id(UUID.randomUUID()).email("other@fpt.edu.vn").fullName("Other Student").role(studentRole).status("ACTIVE").build();
        lecturer = User.builder().id(UUID.randomUUID()).email("lecturer@fpt.edu.vn").fullName("Lecturer").role(lecturerRole).status("ACTIVE").build();
        otherLecturer = User.builder().id(UUID.randomUUID()).email("other.lecturer@fpt.edu.vn").fullName("Other Lecturer").role(lecturerRole).status("ACTIVE").build();
        admin = User.builder().id(UUID.randomUUID()).email("admin@fpt.edu.vn").fullName("Admin").role(adminRole).status("ACTIVE").build();

        workspace = Workspace.builder().id(UUID.randomUUID()).name("Course 4-Stage").status("ACTIVE").courseMode(true).createdBy(lecturer).build();
        Project refProj = Project.builder().id(UUID.randomUUID()).workspace(workspace).projectType("TEACHER_REFERENCE").isReferenceTemplate(true).status("ACTIVE").build();
        sourceSnapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(refProj).isPublished(true).artifactHash("sha256:" + "a".repeat(64)).commitSha("b".repeat(40)).storagePath("ref.zip").build();
        ModelVersion refModel = ModelVersion.builder().id(UUID.randomUUID()).project(refProj).sourceSnapshot(sourceSnapshot).revision(1).isLatestValid(true).build();

        ObjectNode reqDiagrams = objectMapper.createObjectNode();
        lab01 = Assignment.builder().id(UUID.randomUUID()).workspace(workspace).title("Lab 01").labOrder(1).referenceModel(refModel)
                .requiredDiagramTypes(objectMapper.createArrayNode().add("C4_CONTAINER")).build();
        lab02 = Assignment.builder().id(UUID.randomUUID()).workspace(workspace).title("Lab 02").labOrder(2).referenceModel(refModel)
                .build();

        studentProject = Project.builder().id(UUID.randomUUID()).workspace(workspace).assignment(lab01).owner(student)
                .name("Lab 01 Working").projectType("STUDENT_WORKING").status("ACTIVE").referenceSnapshotId(sourceSnapshot.getId()).build();
        modelVersion = ModelVersion.builder().id(UUID.randomUUID()).project(studentProject).sourceSnapshot(sourceSnapshot)
                .revision(2).isLatestValid(true).build();
        diagramVersion = DiagramVersion.builder().id(UUID.randomUUID()).modelVersion(modelVersion)
                .notation("C4").level("CONTAINER").layoutJson(reqDiagrams).build();
        evaluationRun = EvaluationRun.builder().id(UUID.randomUUID()).modelVersion(modelVersion)
                .ruleSetVersion("v1.0").summaryMetrics(objectMapper.createObjectNode().put("complianceScore", 92.0)).build();
        var plan = objectMapper.createObjectNode();
        plan.putArray("infrastructureActions").addObject().put("action", "SCALE").put("service", "orders").put("replicas", 4);
        var receipt = objectMapper.createObjectNode();
        receipt.putObject("outcome").putObject("trace").putArray("spans").addObject().put("spanId", "00f067aa0ba902b7");
        var action = receipt.putArray("infrastructureActions").addObject().put("action", "SCALE").put("service", "orders")
                .put("replicasBefore", 1).put("replicasAfter", 4).put("confirmed", true);
        action.putObject("metricsBefore").put("runningReplicas", 1);
        action.putObject("metricsAfter").put("runningReplicas", 4);
        verifiedSession = RuntimeSession.builder().id(UUID.randomUUID()).project(studentProject).sourceSnapshot(sourceSnapshot)
                .modelVersion(modelVersion).scenarioStatus("PASSED").executionStatus("COMPLETED")
                .evidenceStatus("AVAILABLE").cleanupStatus("CONFIRMED").traceStatus("COMPLETE")
                 .sandboxEnforcementConfirmed(true).scenarioConfig(plan).runnerReceiptJson(receipt).receiptDigest("sha256:" + "c".repeat(64)).build();

        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(assignmentRepository.findById(lab01.getId())).thenReturn(Optional.of(lab01));
        when(assignmentRepository.findLockedById(lab01.getId())).thenReturn(Optional.of(lab01));
        when(assignmentRepository.findById(lab02.getId())).thenReturn(Optional.of(lab02));
        when(assignmentRepository.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspace.getId()))
                .thenReturn(List.of(lab01, lab02));
        when(workspaceRepository.findById(workspace.getId())).thenReturn(Optional.of(workspace));
        when(projectRepository.findById(studentProject.getId())).thenReturn(Optional.of(studentProject));
        when(modelVersionRepository.findById(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findById(diagramVersion.getId())).thenReturn(Optional.of(diagramVersion));
        when(evaluationRunRepository.findById(evaluationRun.getId())).thenReturn(Optional.of(evaluationRun));
        when(runtimeSessionRepository.findById(verifiedSession.getId())).thenReturn(Optional.of(verifiedSession));
        when(courseLabs.passedAssignments(eq(workspace.getId()), eq(student.getId()))).thenAnswer(inv -> Set.copyOf(passedAssignments));
        when(courseLabs.currentQuizPass(lab01, student.getId())).thenReturn(Optional.of(
                new CourseLabPolicy.QuizPass(UUID.randomUUID(), 1, 4, 4, 70, OffsetDateTime.now())));

        courseAccess = new CourseAccessService(accessPolicyService, workspaceRepository, assignmentRepository, courseLabs, jdbc, mock(LabReferenceArchive.class));
        notificationController = new NotificationController(accessPolicyService, jdbc);
        authenticate(student);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticate(User u) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(u.getId().toString(), null, List.of()));
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(u);
    }

    private List<SubmissionCreateRequest.StudentSnapshotItemDTO> validSnapshots() {
        return List.of(
                SubmissionCreateRequest.StudentSnapshotItemDTO.builder()
                        .snapshotId("STEP_1_STATIC").step("STEP_1_STATIC").title("Service Boundaries")
                        .targetViewOrService("order-service")
                        .writtenExplanation("Gateway routes requests synchronously via Feign to order-service.").build(),
                SubmissionCreateRequest.StudentSnapshotItemDTO.builder()
                        .snapshotId("STEP_4_RUNTIME").step("STEP_4_RUNTIME").title("Scale Before/After")
                        .targetViewOrService("order-service")
                        .writtenExplanation("Observed p95 latency change after scaling order-service 1->4.").build());
    }

    private SubmissionResponseDTO submitValidLab01Package(AtomicReference<SubmissionSnapshot> holder) {
        when(submissionSnapshotRepository.save(any())).thenAnswer(inv -> {
            SubmissionSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            holder.set(s);
            return s;
        });
        doAnswer(inv -> {
            if (holder.get() != null) holder.get().setSubmittedAt(OffsetDateTime.now());
            return null;
        }).when(submissionSnapshotRepository).flush();

        var fullReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .submissionNotes("Complete 4-stage evidence package.")
                .studentSnapshots(validSnapshots()).build();
        SubmissionResponseDTO dto = submissionService.submitAssignment(fullReq);
        when(submissionSnapshotRepository.findWithDetailsById(dto.getId())).thenReturn(Optional.of(holder.get()));
        return dto;
    }

    // ==================== F04: 4-STAGE LAB WORKSPACE & PREREQUISITE GATING ====================

    @Test
    @DisplayName("F04-001: Roadmap displays Lab 01 UNLOCKED and Lab 02 LOCKED (PREREQUISITE)")
    void f04_001_roadmapShowsUnlockedLab01AndLockedLab02() {
        var roadmap = courseAccess.roadmap(workspace.getId());
        assertThat(roadmap.guided()).isTrue();
        assertThat(roadmap.labs()).extracting(CourseAccessService.Lab::state).containsExactly("UNLOCKED", "LOCKED");
        assertThat(roadmap.labs().get(1).reason()).isEqualTo("PREREQUISITE");
    }

    @Test
    @DisplayName("F04-002: Quiz gate missing blocks guided Course Lab submission")
    void f04_002_quizGateMissingBlocksSubmission() {
        when(courseLabs.currentQuizPass(lab01, student.getId())).thenReturn(Optional.empty());
        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-003: Runtime trace required when runtimeSessionId is omitted for Course Lab")
    void f04_003_missingRuntimeSessionBlocksGuidedSubmission() {
        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(null)
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-004: ModelVersion from unrelated project cannot be submitted for Lab 01")
    void f04_004_mismatchedModelProjectRejected() {
        ModelVersion foreignModel = ModelVersion.builder().id(UUID.randomUUID())
                .project(Project.builder().id(UUID.randomUUID()).build()).build();
        when(modelVersionRepository.findById(foreignModel.getId())).thenReturn(Optional.of(foreignModel));

        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(foreignModel.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-005: DiagramVersion belonging to different ModelVersion is rejected")
    void f04_005_diagramFromWrongModelRejected() {
        DiagramVersion foreignDiag = DiagramVersion.builder().id(UUID.randomUUID())
                .modelVersion(ModelVersion.builder().id(UUID.randomUUID()).build())
                .notation("C4").level("CONTAINER").build();
        when(diagramVersionRepository.findById(foreignDiag.getId())).thenReturn(Optional.of(foreignDiag));

        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(foreignDiag.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-006: Runtime session with PENDING cleanupStatus is blocked from guided submission")
    void f04_006_uncleanedRuntimeSessionBlockedFromSubmission() {
        RuntimeSession uncleaned = RuntimeSession.builder().id(UUID.randomUUID()).project(studentProject)
                .sourceSnapshot(sourceSnapshot).modelVersion(modelVersion).executionStatus("RUNNING")
                .evidenceStatus("PENDING").cleanupStatus("PENDING").build();
        when(runtimeSessionRepository.findById(uncleaned.getId())).thenReturn(Optional.of(uncleaned));

        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(uncleaned.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-007: Low complianceScore (< 70.0) on EvaluationRun blocks guided Lab submission")
    void f04_007_lowEvaluationScoreBlocksGuidedSubmission() {
        EvaluationRun lowRun = EvaluationRun.builder().id(UUID.randomUUID()).modelVersion(modelVersion)
                .summaryMetrics(objectMapper.createObjectNode().put("complianceScore", 55.0)).build();
        when(evaluationRunRepository.findById(lowRun.getId())).thenReturn(Optional.of(lowRun));

        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(lowRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F04-008: Course Quiz pass evidence is permanently snapshotted inside SubmissionResponseDTO")
    void f04_008_quizEvidenceCapturedInsideSubmission() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO dto = submitValidLab01Package(saved);
        assertThat(dto.getCourseQuizEvidence()).isNotNull();
        assertThat(dto.getCourseQuizEvidence().path("status").asText()).isEqualTo("PASSED");
    }

    // ==================== F11: FROZEN PACKAGE, PER-SNAPSHOT GRADING & UNLOCK ====================

    @Test
    @DisplayName("F11-001: Complete submission freezes immutable SHA-256 evidencePackageDigest")
    void f11_001_completeSubmissionGeneratesSha256PackageDigest() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO dto = submitValidLab01Package(saved);
        assertThat(dto.getEvidencePackageDigest()).matches("^sha256:[a-f0-9]{64}$");
        assertThat(dto.getStudentSnapshots()).hasSize(2);
    }

    @Test
    @DisplayName("F11-002: Missing written theoretical explanation and empty notes are rejected")
    void f11_002_missingWrittenExplanationRejected() {
        var noNotesReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .submissionNotes("  ").build();
        assertThatThrownBy(() -> submissionService.submitAssignment(noNotesReq))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Written theoretical explanation is required");
    }

    @Test
    @DisplayName("F11-003: Project bound to Lab 02 cannot be submitted against Lab 01")
    void f11_003_wrongAssignmentProjectRejected() {
        Project wrongProj = Project.builder().id(UUID.randomUUID()).workspace(workspace).assignment(lab02).owner(student)
                .projectType("STUDENT_WORKING").status("ACTIVE").build();
        when(projectRepository.findById(wrongProj.getId())).thenReturn(Optional.of(wrongProj));
        var wrongReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(wrongProj.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(wrongReq)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F11-004: Grading all snapshots > 5.0/10 marks labOutcome PASSED and notifies progression service")
    void f11_004_allSnapshotsAboveThresholdSetsPassed() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(1);
            return r;
        });

        var passView = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "All snapshots verified clearly (> 5.0/10).",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("5.10"), "Clears threshold"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("8.00"), "Accurate analysis"))));
        assertThat(passView.labOutcome()).isEqualTo("PASSED");
        verify(courseProgression).recordFinalizedResult(submitted.getId(), 1L, true);
    }

    @Test
    @DisplayName("F11-005: Any snapshot at exact 5.0/10 forces NEEDS_REVISION even when average > 50/100")
    void f11_005_exactFiveZeroSnapshotForcesNeedsRevision() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(1);
            return r;
        });

        var failView = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "Static is 9.0 but runtime snapshot scored exact 5.0 boundary.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("9.00"), "Good"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("5.00"), "Boundary 5.0 fails"))));
        assertThat(failView.labOutcome()).isEqualTo("NEEDS_REVISION");
        assertThat(failView.score()).isEqualByComparingTo("70.00");
        verify(courseProgression).recordFinalizedResult(submitted.getId(), 1L, false);
    }

    @Test
    @DisplayName("F11-006: Empty overall summary on GRADED review fails with APPROVAL_SUMMARY_REQUIRED")
    void f11_006_emptySummaryOnGradedReviewRejected() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> reviewService.save(submitted.getId(),
                new SubmissionReviewService.Save(0, "GRADED", null, "  ",
                        List.of(new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("8.00"), "Ok")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("APPROVAL_SUMMARY_REQUIRED");
    }

    @Test
    @DisplayName("F11-007: Stale expectedRevision during concurrent lecturer review throws 409 CONFLICT")
    void f11_007_staleExpectedRevisionThrowsConflict() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        SubmissionReview existing = new SubmissionReview();
        existing.setSubmission(saved.get());
        existing.setRevision(2L);
        existing.setStatus("DRAFT");
        existing.setSummary("");
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> reviewService.save(submitted.getId(),
                new SubmissionReviewService.Save(0, "GRADED", null, "Stale write",
                        List.of(new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("8.00"), "Ok")))))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("F11-008: Subsequent working model revisions never alter frozen SubmissionSnapshot export digest")
    void f11_008_workingModelChangesNeverMutateFrozenSubmissionExport() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);
        String frozenDigest = submitted.getEvidencePackageDigest();

        modelVersion.setRevision(9);
        SubmissionExportBundleDTO export = submissionService.exportSubmissionBundle(submitted.getId());
        assertThat(export.getEvidencePackageDigest()).isEqualTo(frozenDigest);
    }

    // ==================== TC-GR01..06 GRANULAR GRADING ACCEPTANCE CASES ====================

    @Test
    @DisplayName("TC-GR01: Complete 4-stage submission generates valid frozen digest and snapshots")
    void tcGr01_completeFourStageSubmissionCreatesDigest() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);
        assertThat(submitted.getEvidencePackageDigest()).matches("^sha256:[a-f0-9]{64}$");
    }

    @Test
    @DisplayName("TC-GR02: Exported frozen bundle retains snapshot notes and diagram/evaluation IDs")
    void tcGr02_frozenSubmissionRetainsSnapshotNotesAndIds() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);
        SubmissionExportBundleDTO export = submissionService.exportSubmissionBundle(submitted.getId());
        assertThat(export.getDiagramVersionId()).isEqualTo(diagramVersion.getId());
        assertThat(export.getModelVersionId()).isEqualTo(modelVersion.getId());
        assertThat(export.getStudentSnapshots()).hasSize(2);
    }

    @Test
    @DisplayName("TC-GR03: Stale revision update blocked cleanly without mutating stored review")
    void tcGr03_staleRevisionGradeUpdateThrows409Conflict() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        SubmissionReview existing = new SubmissionReview();
        existing.setSubmission(saved.get());
        existing.setRevision(1L);
        existing.setStatus("RETURNED");
        existing.setSummary("First");
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> reviewService.save(submitted.getId(),
                new SubmissionReviewService.Save(0, "GRADED", BigDecimal.valueOf(85), "Overwrite")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);
        assertThat(existing.getRevision()).isEqualTo(1);
    }

    @Test
    @DisplayName("TC-GR04: Snapshot pair (9.0, 5.0) yields score 70.00 but NEEDS_REVISION and keeps Lab 02 locked")
    void tcGr04_snapshotAtExactFiveZeroSetsNeedsRevisionAndKeepsLabLocked() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(1);
            return r;
        });

        var view = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "One snapshot equals 5.0.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("9.00"), "Great"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("5.00"), "Threshold 5.0"))));
        assertThat(view.score()).isEqualByComparingTo("70.00");
        assertThat(view.labOutcome()).isEqualTo("NEEDS_REVISION");

        authenticate(student);
        assertThat(courseAccess.roadmap(workspace.getId()).labs().get(1).state()).isEqualTo("LOCKED");
    }

    @Test
    @DisplayName("TC-GR05: Snapshot pair (5.1, 8.0) clears strict > 5.0 threshold -> labOutcome PASSED")
    void tcGr05_allSnapshotsAboveFiveZeroSetsPassed() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(1);
            return r;
        });

        var view = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "Both snapshots > 5.0.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("5.10"), "Pass"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("8.00"), "Pass"))));
        assertThat(view.labOutcome()).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("TC-GR06: Finalized PASSED grade updates CourseProgression and unlocks Lab 02")
    void tcGr06_passedGradingTriggersLab02AutoUnlock() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(1);
            return r;
        });
        doAnswer(inv -> {
            if (Boolean.TRUE.equals(inv.getArgument(2))) passedAssignments.add(lab01.getId());
            return null;
        }).when(courseProgression).recordFinalizedResult(submitted.getId(), 1L, true);

        reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "All clear.",
                List.of(new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("7.50"), "Ok"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("5.01"), "Verified"))));

        authenticate(student);
        assertThat(courseAccess.roadmap(workspace.getId()).labs()).extracting(CourseAccessService.Lab::state)
                .containsExactly("PASSED", "UNLOCKED");
    }

    // ==================== F12: ADMIN, RUNNER BOUNDS, NOTIFICATIONS & SECURITY ====================

    @Test
    @DisplayName("F12-001: Student caller denied Admin dashboard metrics with FORBIDDEN")
    void f12_001_studentBlockedFromAdminDashboard() {
        authenticate(student);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireSystemAdmin();
        assertThatThrownBy(() -> adminPortal.getDashboardStats())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F12-002: Student self-grading own submission is rejected with FORBIDDEN")
    void f12_002_studentSelfGradingBlocked() {
        authenticate(student);
        UUID subId = UUID.randomUUID();
        SubmissionSnapshot ownSub = SubmissionSnapshot.builder().id(subId).submittedBy(student)
                .assignment(lab01).project(studentProject).build();
        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(ownSub));

        assertThatThrownBy(() -> reviewService.save(subId, new SubmissionReviewService.Save(0, "GRADED", BigDecimal.TEN, "Self pass")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F12-003: Runner resource bounds enforce memory 64..2048 MiB, CPUs 0.01..4.0, timeout 1..300s")
    void f12_003_runnerResourceLimitsEnforcedStrictly() {
        PlatformRuntimeSettings settings = new PlatformRuntimeSettings();
        assertThatThrownBy(() -> settings.updateProfile("JAVA_SPRING_OTEL_V1", true, 1, 32, 1.0, 60, p -> {}))
                .isInstanceOf(BusinessException.class).extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
        assertThatThrownBy(() -> settings.updateProfile("JAVA_SPRING_OTEL_V1", true, 1, 4096, 1.0, 60, p -> {}))
                .isInstanceOf(BusinessException.class).extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
        assertThatThrownBy(() -> settings.updateProfile("JAVA_SPRING_OTEL_V1", true, 1, 512, 8.0, 60, p -> {}))
                .isInstanceOf(BusinessException.class).extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
        assertThatThrownBy(() -> settings.updateProfile("JAVA_SPRING_OTEL_V1", true, 1, 512, 2.0, 600, p -> {}))
                .isInstanceOf(BusinessException.class).extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);

        var updatedProfile = settings.updateProfile("JAVA_SPRING_OTEL_V1", true, 1, 2048, 4.0, 300, p -> {});
        assertThat(updatedProfile.revision()).isEqualTo(2);
    }

    @Test
    @DisplayName("F12-004: Notification center filters validly by category=SUBMISSION")
    void f12_004_notificationCategorySubmissionFilter() {
        authenticate(student);
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        assertThat(notificationController.list(0, 20, false, "SUBMISSION").getCode()).isEqualTo(200);
        verify(jdbc).queryForObject(anyString(), eq(Long.class), eq(student.getId()), any(Timestamp.class), eq("SUBMISSION"));
    }

    @Test
    @DisplayName("F12-005: Notification center rejects invalid/injected category strings (SR-14)")
    void f12_005_notificationInvalidCategoryRejected() {
        authenticate(student);
        assertThatThrownBy(() -> notificationController.list(0, 20, false, "INVALID_CAT"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("F12-006: External lecturer from another workspace is blocked from grading Class A submission")
    void f12_006_crossClassLecturerGradingBlocked() {
        UUID subId = UUID.randomUUID();
        SubmissionSnapshot sub = SubmissionSnapshot.builder().id(subId).submittedBy(student)
                .assignment(lab01).project(studentProject).build();
        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(sub));

        authenticate(otherLecturer);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireWorkspaceLecturer(workspace.getId());
        assertThatThrownBy(() -> reviewService.save(subId, new SubmissionReviewService.Save(0, "GRADED", BigDecimal.TEN, "Cross-class")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F12-007: Admin can lock/unlock runner execution profile cleanly via PlatformRuntimeSettings")
    void f12_007_runnerProfileDisablePreventsInvalidUpdate() {
        PlatformRuntimeSettings settings = new PlatformRuntimeSettings();
        var disabled = settings.updateProfile("JAVA_SPRING_OTEL_V1", false, 1, 512, 1.0, 120, p -> {});
        assertThat(disabled.enabled()).isFalse();
        assertThat(disabled.revision()).isEqualTo(2);
    }

    @Test
    @DisplayName("F12-008: Student caller cannot read another student's private submission draft/review")
    void f12_008_otherStudentBlockedFromSubmissionRead() {
        UUID subId = UUID.randomUUID();
        SubmissionSnapshot sub = SubmissionSnapshot.builder().id(subId).submittedBy(student)
                .assignment(lab01).project(studentProject).build();
        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(sub));

        authenticate(otherStudent);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireProjectReadAccess(studentProject);
        assertThatThrownBy(() -> submissionService.exportSubmissionBundle(subId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    // ==================== E2E, STATE TRANSITIONS & NFR ====================

    @Test
    @DisplayName("TC-WF04-E2E: Full submit -> freeze -> fail on 5.0 -> resubmit/pass on 5.1 -> unlock Lab 02")
    void tcWf04E2eSubmitGradeAndUnlockFlow() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);
        assertThat(submitted.getEvidencePackageDigest()).startsWith("sha256:");

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        AtomicReference<SubmissionReview> currentReview = new AtomicReference<>();
        AtomicInteger revCounter = new AtomicInteger(0);
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(revCounter.incrementAndGet());
            currentReview.set(r);
            return r;
        });

        var failView = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                0, "GRADED", null, "Runtime trace needs detail.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("9.00"), "Good"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("5.00"), "Retry"))));
        assertThat(failView.labOutcome()).isEqualTo("NEEDS_REVISION");

        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenAnswer(inv -> Optional.of(currentReview.get()));
        doAnswer(inv -> {
            if (Boolean.TRUE.equals(inv.getArgument(2))) passedAssignments.add(lab01.getId());
            return null;
        }).when(courseProgression).recordFinalizedResult(eq(submitted.getId()), eq(2L), eq(true));

        var passView = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                1, "GRADED", null, "Fixed and verified.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("5.10"), "Pass"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("8.00"), "Pass"))));
        assertThat(passView.labOutcome()).isEqualTo("PASSED");

        authenticate(student);
        assertThat(courseAccess.roadmap(workspace.getId()).labs()).extracting(CourseAccessService.Lab::state)
                .containsExactly("PASSED", "UNLOCKED");
    }

    @Test
    @DisplayName("TC-ST04: Review status & labOutcome transition DRAFT -> RETURNED/NEEDS_REVISION -> GRADED/PASSED")
    void tcSt04GradingStateTransitions() {
        AtomicReference<SubmissionSnapshot> saved = new AtomicReference<>();
        SubmissionResponseDTO submitted = submitValidLab01Package(saved);

        authenticate(lecturer);
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenReturn(Optional.empty());
        AtomicReference<SubmissionReview> currentReview = new AtomicReference<>();
        AtomicInteger revCounter = new AtomicInteger(0);
        when(submissionReviewRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SubmissionReview r = inv.getArgument(0);
            r.setRevision(revCounter.incrementAndGet());
            currentReview.set(r);
            return r;
        });

        var draft = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(0, "DRAFT", null, "WIP notes"));
        assertThat(draft.status()).isEqualTo("DRAFT");

        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenAnswer(inv -> Optional.of(currentReview.get()));
        var returned = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                1, "RETURNED", BigDecimal.valueOf(45), "Needs runtime screenshot."));
        assertThat(returned.status()).isEqualTo("RETURNED");
        assertThat(returned.labOutcome()).isEqualTo("NEEDS_REVISION");

        var graded = reviewService.save(submitted.getId(), new SubmissionReviewService.Save(
                2, "GRADED", null, "Approved after fix.",
                List.of(new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("8.00"), "Ok"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("9.00"), "Verified"))));
        assertThat(graded.status()).isEqualTo("GRADED");
        assertThat(graded.labOutcome()).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("TC-N06: Strict security matrix across Admin, Notification SQL allowlist & grading ownership")
    void tcN06AdminNotificationAndOwnershipSecurityMatrix() {
        authenticate(student);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireSystemAdmin();
        assertThatThrownBy(() -> adminPortal.getDashboardStats()).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> notificationController.list(0, 20, false, "DROP_TABLE")).isInstanceOf(ResponseStatusException.class);
    }
}
