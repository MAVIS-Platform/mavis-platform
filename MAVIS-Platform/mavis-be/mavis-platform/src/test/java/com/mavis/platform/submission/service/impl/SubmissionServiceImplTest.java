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
                .scenarioStatus("PASSED")
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

        verify(submissionSnapshotRepository).save(any(SubmissionSnapshot.class));
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
}
