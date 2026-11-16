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
    @Test void acceptsTheNineCurrentDiagramViewsAndGraphAsSeparateRequirements() {
        var types=List.of("C4_CONTEXT","C4_CONTAINER","C4_COMPONENT","UML_CLASS","UML_SEQUENCE","UML_PACKAGE","UML_DEPLOYMENT","UML_ACTIVITY","UML_STATE","DEPENDENCY_GRAPH");
        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));
        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(call->{Assignment a=call.getArgument(0);a.setId(UUID.randomUUID());return a;});
        var result=assignmentService.createAssignment(workspaceId,AssignmentCreateRequest.builder().title("Exact diagram catalog").requiredDiagramTypes(types).build());
        assertThat(result.getRequiredDiagramTypes()).containsExactlyElementsOf(types);
    }

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

    @Mock private com.mavis.common.repository.ModelVersionRepository modelVersionRepository;
    @Mock private com.mavis.common.repository.SourceSnapshotRepository sourceSnapshotRepository;

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

        when(assignmentRepository.findLockedById(aId)).thenReturn(Optional.of(a));
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

        when(assignmentRepository.findLockedById(aId)).thenReturn(Optional.of(a));
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

        when(assignmentRepository.findLockedById(aId)).thenReturn(Optional.of(a));
        when(submissionSnapshotRepository.existsByAssignmentId(aId)).thenReturn(true);

        assertThatThrownBy(() -> assignmentService.deleteAssignment(aId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không thể xóa đề bài tập đã có sinh viên nộp bài (BR-14)")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(assignmentRepository, never()).delete(any());
    }

    @Test void pinsExactSourceVersionAndPublishesItWithTheAssignment() {
        var project = com.mavis.common.entity.Project.builder().id(UUID.randomUUID()).name("Teaching source")
                .workspace(workspace).isReferenceTemplate(true).build();
        var snapshot = com.mavis.common.entity.SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .sourceType("ZIP_UPLOAD").artifactHash("archive-digest").build();
        var model = com.mavis.common.entity.ModelVersion.builder().id(UUID.randomUUID()).project(project)
                .sourceSnapshot(snapshot).revision(7).isLatestValid(false).build();
        when(modelVersionRepository.findById(model.getId())).thenReturn(Optional.of(model));
        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));
        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(call -> call.getArgument(0));
        var result = assignmentService.createAssignment(workspaceId, AssignmentCreateRequest.builder()
                .title("Versioned assignment").referenceModelId(model.getId()).build());
        assertThat(result.getReferenceSource()).containsEntry("modelId", model.getId())
                .containsEntry("snapshotId", snapshot.getId()).containsEntry("revision", 7);
        assertThat(snapshot.getIsPublished()).isTrue();
        verify(sourceSnapshotRepository).save(snapshot);
    }

    @Test void rejectsReferenceFromAnotherWorkspace() {
        var assignment = Assignment.builder().id(UUID.randomUUID()).workspace(workspace).title("Task").build();
        var project = com.mavis.common.entity.Project.builder().id(UUID.randomUUID()).name("Other source")
                .workspace(Workspace.builder().id(UUID.randomUUID()).build()).isReferenceTemplate(true).build();
        var model = com.mavis.common.entity.ModelVersion.builder().id(UUID.randomUUID()).project(project)
                .sourceSnapshot(com.mavis.common.entity.SourceSnapshot.builder().project(project).build()).build();
        when(assignmentRepository.findLockedById(assignment.getId())).thenReturn(Optional.of(assignment));
        when(modelVersionRepository.findById(model.getId())).thenReturn(Optional.of(model));
        assertThatThrownBy(() -> assignmentService.updateAssignment(assignment.getId(), AssignmentUpdateRequest.builder()
                .title("Task").referenceModelId(model.getId()).build())).isInstanceOf(BusinessException.class);
        verify(assignmentRepository, never()).save(any());
        verify(sourceSnapshotRepository, never()).save(any());
    }

    @Test void clearingReferenceIsExplicitAndOldClientsPreserveThePinnedVersion() {
        var model = com.mavis.common.entity.ModelVersion.builder().id(UUID.randomUUID()).build();
        var assignment = Assignment.builder().id(UUID.randomUUID()).workspace(workspace).title("Task").referenceModel(model).build();
        when(assignmentRepository.findLockedById(assignment.getId())).thenReturn(Optional.of(assignment));
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(call -> call.getArgument(0));
        assignmentService.updateAssignment(assignment.getId(), AssignmentUpdateRequest.builder().title("Task").clearReferenceSource(true).build());
        assertThat(assignment.getReferenceModel()).isNull();
        verifyNoInteractions(modelVersionRepository);
    }

    @Test
    @DisplayName("SR-08: Supports string or JSON aiPolicy, ruleSetVersion, and labOrder on create/update")
    void supportsStringOrJsonAiPolicyRuleSetVersionAndLabOrder() {
        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));
        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });

        AssignmentResponseDTO created = assignmentService.createAssignment(workspaceId, AssignmentCreateRequest.builder()
                .title("SR-08 Guided Assignment")
                .ruleSetVersion("3e-2")
                .aiPolicy("{\"allowExplanation\":true,\"maxHints\":3}")
                .labOrder(2)
                .build());

        assertThat(created.getRuleSetVersion()).isEqualTo("3e-2");
        assertThat(created.getAiPolicy().path("allowExplanation").asBoolean()).isTrue();
        assertThat(created.getAiPolicy().path("maxHints").asInt()).isEqualTo(3);
        assertThat(created.getLabOrder()).isEqualTo(2);

        Assignment existing = Assignment.builder()
                .id(created.getId())
                .workspace(workspace)
                .createdBy(currentUser)
                .title("SR-08 Guided Assignment")
                .ruleSetVersion("SWD_DEFAULT_V1")
                .build();
        when(assignmentRepository.findLockedById(created.getId())).thenReturn(Optional.of(existing));

        AssignmentResponseDTO updated = assignmentService.updateAssignment(created.getId(), AssignmentUpdateRequest.builder()
                .title("SR-08 Updated")
                .ruleSetVersion("3e-3")
                .aiPolicy("HINT_ONLY")
                .labOrder(3)
                .build());

        assertThat(updated.getRuleSetVersion()).isEqualTo("3e-3");
        assertThat(updated.getAiPolicy().asText()).isEqualTo("HINT_ONLY");
        assertThat(updated.getLabOrder()).isEqualTo(3);
    }

    @Test
    @DisplayName("SR-08: Rejects malformed JSON string in aiPolicy with BAD_REQUEST")
    void rejectsMalformedJsonAiPolicy() {
        when(workspaceRepository.findWithCreatorById(workspaceId)).thenReturn(Optional.of(workspace));
        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));

        assertThatThrownBy(() -> assignmentService.createAssignment(workspaceId, AssignmentCreateRequest.builder()
                .title("Broken policy")
                .aiPolicy("{invalid-json")
                .build()))
                .isInstanceOf(BusinessException.class)
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);
    }
}
