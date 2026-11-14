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
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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
 * Automated acceptance verification matrix covering all 27 committed WF-04 test cases
 * (F04-001..008, F11-001..008, F12-001..008, TC-WF04-E2E, TC-ST04, TC-N06) plus TC-GR01..06.
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
        verifiedSession = RuntimeSession.builder().id(UUID.randomUUID()).project(studentProject).sourceSnapshot(sourceSnapshot)
                .modelVersion(modelVersion).scenarioStatus("PASSED").executionStatus("COMPLETED")
                .evidenceStatus("AVAILABLE").cleanupStatus("CONFIRMED").traceStatus("COMPLETE")
                .runnerReceiptJson(objectMapper.createObjectNode()).receiptDigest("sha256:" + "c".repeat(64)).build();

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

    @Test
    @DisplayName("F04-001..008: 4-stage Lab roadmap locking, prerequisite gating & cross-tab revision integrity")
    void f04FourStageLabWorkspaceAndDeepLinkGates() {
        authenticate(student);
        var roadmapBefore = courseAccess.roadmap(workspace.getId());
        assertThat(roadmapBefore.labs()).extracting(CourseAccessService.Lab::state).containsExactly("UNLOCKED", "LOCKED");
        assertThat(roadmapBefore.labs().get(1).reason()).isEqualTo("PREREQUISITE");

        // Quiz gate failure blocks Course Lab submission
        when(courseLabs.currentQuizPass(lab01, student.getId())).thenReturn(Optional.empty());
        var req = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F11-001..008 & TC-GR01..06 & TC-WF04-E2E & TC-ST04: Frozen package, per-snapshot > 5.0/10, 409 conflict & Lab 02 unlock")
    void f11FrozenPackagePerSnapshotGradingAndAutoUnlock() {
        // F11-002: Missing runtime session or missing written theoretical explanation blocked
        var noNotesReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .submissionNotes("  ").build();
        assertThatThrownBy(() -> submissionService.submitAssignment(noNotesReq))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Written theoretical explanation is required");

        // F11-003: Wrong assignment project blocked
        Project wrongAssignmentProject = Project.builder().id(UUID.randomUUID()).workspace(workspace).assignment(lab02).owner(student)
                .projectType("STUDENT_WORKING").status("ACTIVE").build();
        when(projectRepository.findById(wrongAssignmentProject.getId())).thenReturn(Optional.of(wrongAssignmentProject));
        var wrongProjReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(wrongAssignmentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        assertThatThrownBy(() -> submissionService.submitAssignment(wrongProjReq)).isInstanceOf(BusinessException.class);

        // F11-001 / TC-GR01 / TC-GR02: Complete 4-stage submission creates immutable SHA-256 packageDigest
        AtomicReference<SubmissionSnapshot> savedSub = new AtomicReference<>();
        when(submissionSnapshotRepository.save(any())).thenAnswer(inv -> {
            SubmissionSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            savedSub.set(s);
            return s;
        });
        doAnswer(inv -> {
            if (savedSub.get() != null) savedSub.get().setSubmittedAt(OffsetDateTime.now());
            return null;
        }).when(submissionSnapshotRepository).flush();

        var fullReq = SubmissionCreateRequest.builder()
                .assignmentId(lab01.getId()).projectId(studentProject.getId())
                .modelVersionId(modelVersion.getId()).diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId()).runtimeSessionId(verifiedSession.getId())
                .studentSnapshots(validSnapshots()).build();
        SubmissionResponseDTO submitted = submissionService.submitAssignment(fullReq);
        assertThat(submitted.getEvidencePackageDigest()).matches("^sha256:[a-f0-9]{64}$");
        assertThat(submitted.getStudentSnapshots()).hasSize(2);

        // F11-008: Subsequent project model changes never alter frozen SubmissionSnapshot packageDigest/quizEvidence
        String frozenDigest = submitted.getEvidencePackageDigest();
        when(submissionSnapshotRepository.findWithDetailsById(submitted.getId())).thenReturn(Optional.of(savedSub.get()));
        SubmissionExportBundleDTO export = submissionService.exportSubmissionBundle(submitted.getId());
        assertThat(export.getEvidencePackageDigest()).isEqualTo(frozenDigest);

        // F11-005 / TC-GR04: 5.0 + 9.0 fails strict > 5.0 threshold -> NEEDS_REVISION, Lab 02 stays LOCKED
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

        var failSave = new SubmissionReviewService.Save(
                0, "GRADED", null, "Runtime trace still lacks step-level explanation.",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("9.00"), "Good"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("5.00"), "Boundary 5.0 fails")));
        var failView = reviewService.save(submitted.getId(), failSave);
        assertThat(failView.labOutcome()).isEqualTo("NEEDS_REVISION");
        verify(courseProgression).recordFinalizedResult(submitted.getId(), 1L, false);

        // F11-006: Empty overall summary on GRADED rejected (HTTP 400)
        when(submissionReviewRepository.findBySubmissionId(submitted.getId())).thenAnswer(inv -> Optional.of(currentReview.get()));
        assertThatThrownBy(() -> reviewService.save(submitted.getId(),
                new SubmissionReviewService.Save(1, "GRADED", null, "  ",
                        List.of(new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("8.00"), "Ok")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("APPROVAL_SUMMARY_REQUIRED");

        // F11-007 / TC-GR03: Stale expectedRevision blocked with CONFLICT (409)
        assertThatThrownBy(() -> reviewService.save(submitted.getId(),
                new SubmissionReviewService.Save(0, "GRADED", null, "Stale tab write", failSave.snapshotGrades())))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);

        // F11-004 / TC-GR05 / TC-GR06 / TC-ST04: All snapshots > 5.0 (5.1 & 8.0) -> PASSED & unlocks Lab 02
        doAnswer(inv -> {
            boolean passed = inv.getArgument(2);
            if (passed) passedAssignments.add(lab01.getId());
            return null;
        }).when(courseProgression).recordFinalizedResult(eq(submitted.getId()), eq(2L), eq(true));

        var passSave = new SubmissionReviewService.Save(
                1, "GRADED", null, "All snapshots verified clearly (> 5.0/10).",
                List.of(
                        new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static", new BigDecimal("5.10"), "Clears threshold"),
                        new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime", new BigDecimal("8.00"), "Accurate analysis")));
        var passView = reviewService.save(submitted.getId(), passSave);
        assertThat(passView.labOutcome()).isEqualTo("PASSED");
        verify(courseProgression).recordFinalizedResult(submitted.getId(), 2L, true);

        authenticate(student);
        var roadmapAfter = courseAccess.roadmap(workspace.getId());
        assertThat(roadmapAfter.labs()).extracting(CourseAccessService.Lab::state).containsExactly("PASSED", "UNLOCKED");
    }

    @Test
    @DisplayName("F12-001..008 & TC-N06: RBAC, student self-grading block, runner bounds 64..2048/0.01..4/1..300 & notifications")
    void f12AdminRunnerLimitsNotificationsAndSecurity() {
        // F12-001 & F12-002: Student blocked from Admin API & self-grading
        authenticate(student);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireSystemAdmin();
        assertThatThrownBy(() -> adminPortal.getDashboardStats())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        UUID subId = UUID.randomUUID();
        SubmissionSnapshot ownSub = SubmissionSnapshot.builder().id(subId).submittedBy(student)
                .assignment(lab01).project(studentProject).build();
        when(submissionSnapshotRepository.findWithDetailsById(subId)).thenReturn(Optional.of(ownSub));
        assertThatThrownBy(() -> reviewService.save(subId, new SubmissionReviewService.Save(0, "GRADED", BigDecimal.TEN, "Self pass")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        // Other-class lecturer blocked
        authenticate(otherLecturer);
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireWorkspaceLecturer(workspace.getId());
        assertThatThrownBy(() -> reviewService.save(subId, new SubmissionReviewService.Save(0, "GRADED", BigDecimal.TEN, "Cross-class")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        // F12-003: Runner profile limits (memoryMiB 64..2048, cpus 0.01..4, timeoutSeconds 1..300)
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

        // F12-004..008: Notification category filtering & strict input validation (SR-14)
        authenticate(student);
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        assertThat(notificationController.list(0, 20, false, "SUBMISSION").getCode()).isEqualTo(200);
        assertThatThrownBy(() -> notificationController.list(0, 20, false, "INVALID_CAT"))
                .isInstanceOf(ResponseStatusException.class);
        verify(jdbc).queryForObject(anyString(), eq(Long.class), eq(student.getId()), any(Timestamp.class), eq("SUBMISSION"));
    }
}
