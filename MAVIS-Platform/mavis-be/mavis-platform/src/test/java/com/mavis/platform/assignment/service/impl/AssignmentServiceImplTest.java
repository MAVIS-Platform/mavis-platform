package com.mavis.platform.assignment.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.platform.assignment.dto.AssignmentCreateRequest;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.dto.AssignmentUpdateRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AssignmentServiceImplTest {

    @Mock
    private AssignmentRepository assignmentRepository;

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private WorkspaceMemberRepository workspaceMemberRepository;

    @Mock
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private AssignmentServiceImpl assignmentService;

    private UUID currentUserId;
    private User currentUser;
    private UUID workspaceId;
    private Workspace workspace;

    @BeforeEach
    void setUp() {
        currentUserId = UUID.randomUUID();
        currentUser = User.builder()
                .id(currentUserId)
                .email("lecturer@fpt.edu.vn")
                .fullName("Lecturer User")
                .build();

        workspaceId = UUID.randomUUID();
        workspace = Workspace.builder()
                .id(workspaceId)
                .name("Software Architecture")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(currentUserId.toString(), null, Collections.emptyList())
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Should create assignment successfully with JSONB diagram types and AI policy")
    void shouldCreateAssignmentSuccessfully() {
        AssignmentCreateRequest request = AssignmentCreateRequest.builder()
                .title("Microservices Architecture Final Exam")
                .description("Design C4 container and sequence diagrams")
                .requiredDiagramTypes(List.of("C4", "UML_SEQUENCE"))
                .ruleSetVersion("SWD_DEFAULT_V1")
                .requireRuntimeTrace(true)
                .aiPolicy(Map.of("allowExplanation", true, "maxCredits", 10))
                .dueAt(OffsetDateTime.now().plusDays(7))
                .build();

        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));
        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));

        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            a.setId(UUID.randomUUID());
            return a;
        });

        AssignmentResponseDTO response = assignmentService.createAssignment(workspaceId, request);

        assertThat(response).isNotNull();
        assertThat(response.getTitle()).isEqualTo("Microservices Architecture Final Exam");
        assertThat(response.getWorkspaceId()).isEqualTo(workspaceId);
        assertThat(response.getWorkspaceName()).isEqualTo("Software Architecture");
        assertThat(response.getCreatedById()).isEqualTo(currentUserId);
        assertThat(response.getRequiredDiagramTypes()).containsExactly("C4", "UML_SEQUENCE");
        assertThat(response.getRuleSetVersion()).isEqualTo("SWD_DEFAULT_V1");
        assertThat(response.getRequireRuntimeTrace()).isTrue();
        assertThat(response.getAiPolicy()).isNotNull();
        assertThat(response.getSubmissionCount()).isEqualTo(0L);
        assertThat(response.getCreatedAt()).isNotNull();
        assertThat(response.getUpdatedAt()).isNotNull();

        verify(assignmentRepository).save(any(Assignment.class));
    }

    @Test
    @DisplayName("Should throw BAD_REQUEST when requiredDiagramTypes has invalid notation")
    void shouldThrowBadRequestWhenInvalidDiagramNotation() {
        AssignmentCreateRequest request = AssignmentCreateRequest.builder()
                .title("Assignment 1")
                .requiredDiagramTypes(List.of("INVALID_DIAGRAM_NOTATION"))
                .build();

        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));

        assertThatThrownBy(() -> assignmentService.createAssignment(workspaceId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Loại sơ đồ không hợp lệ")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(assignmentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should throw FORBIDDEN when user is not creator or lecturer of workspace")
    void shouldThrowForbiddenWhenUserNotLecturerOrCreator() {
        User otherCreator = User.builder().id(UUID.randomUUID()).build();
        Workspace otherWorkspace = Workspace.builder()
                .id(workspaceId)
                .createdBy(otherCreator)
                .build();

        AssignmentCreateRequest request = AssignmentCreateRequest.builder()
                .title("Assignment 1")
                .build();

        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Chỉ Giảng viên của lớp mới có quyền tạo/chỉnh sửa đề bài tập"))
                .when(accessPolicyService).requireWorkspaceLecturer(workspaceId);

        assertThatThrownBy(() -> assignmentService.createAssignment(workspaceId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Chỉ Giảng viên của lớp")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.FORBIDDEN);

        verify(assignmentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should get assignments by workspace with batch submission counts")
    void shouldGetAssignmentsByWorkspaceSuccessfully() {
        when(workspaceRepository.existsById(workspaceId)).thenReturn(true);

        UUID a1Id = UUID.randomUUID();
        UUID a2Id = UUID.randomUUID();
        Assignment a1 = Assignment.builder()
                .id(a1Id)
                .title("A1")
                .workspace(workspace)
                .createdBy(currentUser)
                .build();
        Assignment a2 = Assignment.builder()
                .id(a2Id)
                .title("A2")
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        when(assignmentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(a1, a2));

        List<Object[]> counts = List.of(
                new Object[]{a1Id, 12L},
                new Object[]{a2Id, 5L}
        );
        when(submissionSnapshotRepository.countSubmissionsByAssignmentIds(anyCollection())).thenReturn(counts);

        List<AssignmentResponseDTO> result = assignmentService.getAssignmentsByWorkspace(workspaceId);

        assertThat(result).hasSize(2);
        AssignmentResponseDTO dto1 = result.stream().filter(r -> r.getId().equals(a1Id)).findFirst().orElseThrow();
        assertThat(dto1.getSubmissionCount()).isEqualTo(12L);
        AssignmentResponseDTO dto2 = result.stream().filter(r -> r.getId().equals(a2Id)).findFirst().orElseThrow();
        assertThat(dto2.getSubmissionCount()).isEqualTo(5L);
    }

    @Test
    @DisplayName("Should get assignment by ID with submission count")
    void shouldGetAssignmentByIdSuccessfully() {
        UUID aId = UUID.randomUUID();
        Assignment a = Assignment.builder()
                .id(aId)
                .title("Midterm Test")
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        when(assignmentRepository.findWithDetailsById(aId)).thenReturn(Optional.of(a));
        when(submissionSnapshotRepository.countByAssignmentId(aId)).thenReturn(8L);

        AssignmentResponseDTO response = assignmentService.getAssignmentById(aId);

        assertThat(response).isNotNull();
        assertThat(response.getId()).isEqualTo(aId);
        assertThat(response.getSubmissionCount()).isEqualTo(8L);
    }

    @Test
    @DisplayName("Should update assignment successfully")
    void shouldUpdateAssignmentSuccessfully() {
        UUID aId = UUID.randomUUID();
        Assignment a = Assignment.builder()
                .id(aId)
                .title("Old Title")
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        AssignmentUpdateRequest request = AssignmentUpdateRequest.builder()
                .title("New Updated Title")
                .description("Updated Desc")
                .requiredDiagramTypes(List.of("DEPENDENCY_GRAPH"))
                .build();

        when(assignmentRepository.findWithDetailsById(aId)).thenReturn(Optional.of(a));
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(inv -> inv.getArgument(0));
        when(submissionSnapshotRepository.countByAssignmentId(aId)).thenReturn(2L);

        AssignmentResponseDTO response = assignmentService.updateAssignment(aId, request);

        assertThat(response.getTitle()).isEqualTo("New Updated Title");
        assertThat(response.getDescription()).isEqualTo("Updated Desc");
        assertThat(response.getRequiredDiagramTypes()).containsExactly("DEPENDENCY_GRAPH");
        verify(assignmentRepository).save(a);
    }

    @Test
    @DisplayName("Should delete assignment successfully when no submissions exist")
    void shouldDeleteAssignmentSuccessfullyWhenNoSubmissions() {
        UUID aId = UUID.randomUUID();
        Assignment a = Assignment.builder()
                .id(aId)
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        when(assignmentRepository.findWithDetailsById(aId)).thenReturn(Optional.of(a));
        when(submissionSnapshotRepository.existsByAssignmentId(aId)).thenReturn(false);

        assignmentService.deleteAssignment(aId);

        verify(assignmentRepository).delete(a);
    }

    @Test
    @DisplayName("Should block deletion (BR-14) and throw BAD_REQUEST when submissions exist")
    void shouldBlockDeletionWhenSubmissionsExist() {
        UUID aId = UUID.randomUUID();
        Assignment a = Assignment.builder()
                .id(aId)
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        when(assignmentRepository.findWithDetailsById(aId)).thenReturn(Optional.of(a));
        when(submissionSnapshotRepository.existsByAssignmentId(aId)).thenReturn(true);

        assertThatThrownBy(() -> assignmentService.deleteAssignment(aId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không thể xóa đề bài tập đã có sinh viên nộp bài (BR-14)")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(assignmentRepository, never()).delete(any());
    }
}
