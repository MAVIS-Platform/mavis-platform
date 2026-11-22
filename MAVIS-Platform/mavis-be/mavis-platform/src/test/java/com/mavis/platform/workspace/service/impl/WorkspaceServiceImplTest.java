package com.mavis.platform.workspace.service.impl;

import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.entity.Role;
import com.mavis.platform.workspace.dto.*;
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

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceImplTest {

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private WorkspaceMemberRepository workspaceMemberRepository;

    @Mock
    private AssignmentRepository assignmentRepository;

    @Mock
    private UserRepository userRepository;

    @Mock private com.mavis.common.security.AccessPolicyService accessPolicyService;
    @Mock private com.mavis.platform.workspace.service.CourseAccessService courseAccessService;

    @InjectMocks
    private WorkspaceServiceImpl workspaceService;

    private UUID currentUserId;
    private User currentUser;

    @BeforeEach
    void setUp() {
        currentUserId = UUID.randomUUID();
        currentUser = User.builder()
                .id(currentUserId)
                .email("lecturer@fpt.edu.vn").role(Role.builder().code("LECTURER").build())
                .fullName("Lecturer User")
                .status("ACTIVE")
                .build();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(currentUserId.toString(), null, Collections.emptyList())
        );
    }

    @Test void studentCannotCreateTeachingWorkspace() {
        currentUser.setRole(Role.builder().code("STUDENT").build());when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        assertThatThrownBy(()->workspaceService.createWorkspace(WorkspaceCreateRequest.builder().code("X").name("X").build())).isInstanceOf(BusinessException.class);
        verifyNoInteractions(workspaceRepository);
    }
    @Test void outsiderCannotEnumerateMembers() {
        UUID w=UUID.randomUUID();doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicyService).requireWorkspaceMember(w);
        assertThatThrownBy(()->workspaceService.getWorkspaceMembers(w)).isInstanceOf(BusinessException.class);verifyNoInteractions(workspaceRepository,workspaceMemberRepository);
    }
    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Should create workspace successfully and assign creator as LECTURER")
    void shouldCreateWorkspaceSuccessfully() {
        WorkspaceCreateRequest request = WorkspaceCreateRequest.builder()
                .code("SWP391")
                .name("Software Architecture Lab")
                .description("Sample class description")
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.existsByCodeIgnoreCase("SWP391")).thenReturn(false);

        Workspace savedWorkspace = Workspace.builder()
                .id(UUID.randomUUID())
                .code("SWP391")
                .name("Software Architecture Lab")
                .description("Sample class description")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        when(workspaceRepository.save(any(Workspace.class))).thenReturn(savedWorkspace);
        when(workspaceMemberRepository.save(any(WorkspaceMember.class))).thenAnswer(inv -> inv.getArgument(0));

        WorkspaceResponseDTO response = workspaceService.createWorkspace(request);

        assertThat(response).isNotNull();
        assertThat(response.getCode()).isEqualTo("SWP391");
        assertThat(response.getName()).isEqualTo("Software Architecture Lab");
        assertThat(response.getCreatedById()).isEqualTo(currentUserId);
        assertThat(response.getCreatedByName()).isEqualTo("Lecturer User");
        assertThat(response.getStatus()).isEqualTo("ACTIVE");
        assertThat(response.getMemberCount()).isEqualTo(1L);
        assertThat(response.getAssignmentCount()).isEqualTo(0L);
        assertThat(response.getMyRoleInWorkspace()).isEqualTo("LECTURER");
        assertThat(response.getCreatedAt()).isNotNull();
        assertThat(response.getUpdatedAt()).isNotNull();
        verify(courseAccessService).createPasskey(eq(savedWorkspace.getId()), any());

        verify(workspaceRepository).save(any(Workspace.class));
        verify(workspaceMemberRepository).save(any(WorkspaceMember.class));
    }

    @Test
    @DisplayName("Should throw BAD_REQUEST when creating workspace with existing code")
    void shouldThrowBadRequestWhenCodeAlreadyExists() {
        WorkspaceCreateRequest request = WorkspaceCreateRequest.builder()
                .code("SWP391")
                .name("Software Architecture Lab")
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.existsByCodeIgnoreCase("SWP391")).thenReturn(true);

        assertThatThrownBy(() -> workspaceService.createWorkspace(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Mã lớp học đã tồn tại: SWP391")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(workspaceRepository, never()).save(any());
        verify(workspaceMemberRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should get my workspaces batching member and assignment counts without N+1 query")
    void shouldGetMyWorkspacesSuccessfully() {
        UUID ws1Id = UUID.randomUUID();
        UUID ws2Id = UUID.randomUUID();

        Workspace ws1 = Workspace.builder()
                .id(ws1Id)
                .code("SWP391")
                .name("Class 1")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        User otherUser = User.builder().id(UUID.randomUUID()).fullName("Other Creator").build();
        Workspace ws2 = Workspace.builder()
                .id(ws2Id)
                .code("PRN231")
                .name("Class 2")
                .createdBy(otherUser)
                .status("ACTIVE")
                .build();

        when(workspaceRepository.findAllAccessibleByUserId(currentUserId)).thenReturn(List.of(ws1, ws2));

        List<Object[]> memberCounts = List.of(
                new Object[]{ws1Id, 15L},
                new Object[]{ws2Id, 30L}
        );
        when(workspaceMemberRepository.countMembersByWorkspaceIds(anyCollection())).thenReturn(memberCounts);

        List<Object[]> assignmentCounts = List.of(
                new Object[]{ws1Id, 3L},
                new Object[]{ws2Id, 5L}
        );
        when(assignmentRepository.countAssignmentsByWorkspaceIds(anyCollection())).thenReturn(assignmentCounts);

        WorkspaceMember memberWs2 = WorkspaceMember.builder()
                .workspace(ws2)
                .user(currentUser)
                .memberRole("STUDENT")
                .build();
        when(workspaceMemberRepository.findByUserIdAndWorkspaceIdIn(eq(currentUserId), anyCollection()))
                .thenReturn(List.of(memberWs2));

        List<WorkspaceResponseDTO> responses = workspaceService.getMyWorkspaces();

        assertThat(responses).hasSize(2);

        WorkspaceResponseDTO dto1 = responses.stream().filter(r -> r.getId().equals(ws1Id)).findFirst().orElseThrow();
        assertThat(dto1.getCode()).isEqualTo("SWP391");
        assertThat(dto1.getMemberCount()).isEqualTo(15L);
        assertThat(dto1.getAssignmentCount()).isEqualTo(3L);
        assertThat(dto1.getMyRoleInWorkspace()).isEqualTo("LECTURER");

        WorkspaceResponseDTO dto2 = responses.stream().filter(r -> r.getId().equals(ws2Id)).findFirst().orElseThrow();
        assertThat(dto2.getCode()).isEqualTo("PRN231");
        assertThat(dto2.getMemberCount()).isEqualTo(30L);
        assertThat(dto2.getAssignmentCount()).isEqualTo(5L);
        assertThat(dto2.getMyRoleInWorkspace()).isEqualTo("STUDENT");
    }

    @Test
    @DisplayName("Should get workspace by ID successfully")
    void shouldGetWorkspaceByIdSuccessfully() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .name("Class 1")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.countByWorkspaceId(wsId)).thenReturn(10L);
        when(assignmentRepository.countByWorkspaceId(wsId)).thenReturn(4L);
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, currentUserId)).thenReturn(Optional.empty());

        WorkspaceResponseDTO response = workspaceService.getWorkspaceById(wsId);

        assertThat(response).isNotNull();
        assertThat(response.getId()).isEqualTo(wsId);
        assertThat(response.getMemberCount()).isEqualTo(10L);
        assertThat(response.getAssignmentCount()).isEqualTo(4L);
        assertThat(response.getMyRoleInWorkspace()).isEqualTo("LECTURER");
    }

    @Test
    @DisplayName("Should throw NOT_FOUND when workspace does not exist")
    void shouldThrowNotFoundWhenWorkspaceDoesNotExist() {
        UUID nonExistentId = UUID.randomUUID();
        when(workspaceRepository.findWithCreatorById(nonExistentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> workspaceService.getWorkspaceById(nonExistentId))
                .isInstanceOf(BusinessException.class)
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("Should update workspace successfully when caller is Creator")
    void shouldUpdateWorkspaceWhenCallerIsCreator() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .name("Old Name")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        WorkspaceUpdateRequest request = WorkspaceUpdateRequest.builder()
                .name("Updated Name")
                .description("Updated Desc")
                .status("ACTIVE")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceRepository.save(any(Workspace.class))).thenAnswer(inv -> inv.getArgument(0));
        when(workspaceMemberRepository.countByWorkspaceId(wsId)).thenReturn(5L);
        when(assignmentRepository.countByWorkspaceId(wsId)).thenReturn(1L);

        WorkspaceResponseDTO response = workspaceService.updateWorkspace(wsId, request);

        assertThat(response.getName()).isEqualTo("Updated Name");
        assertThat(response.getDescription()).isEqualTo("Updated Desc");
        verify(workspaceRepository).save(ws);
    }

    @Test
    @DisplayName("Should update workspace successfully when caller is LECTURER member")
    void shouldUpdateWorkspaceWhenCallerIsLecturerMember() {
        UUID wsId = UUID.randomUUID();
        User otherOwner = User.builder().id(UUID.randomUUID()).fullName("Other").build();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .name("Old Name")
                .createdBy(otherOwner)
                .status("ACTIVE")
                .build();

        WorkspaceUpdateRequest request = WorkspaceUpdateRequest.builder()
                .name("Updated Name")
                .build();

        WorkspaceMember lecturerMember = WorkspaceMember.builder()
                .workspace(ws)
                .user(currentUser)
                .memberRole("LECTURER")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, currentUserId))
                .thenReturn(Optional.of(lecturerMember));
        when(workspaceRepository.save(any(Workspace.class))).thenAnswer(inv -> inv.getArgument(0));

        WorkspaceResponseDTO response = workspaceService.updateWorkspace(wsId, request);

        assertThat(response.getName()).isEqualTo("Updated Name");
        verify(workspaceRepository).save(ws);
    }

    @Test
    @DisplayName("Should throw FORBIDDEN when caller is STUDENT trying to update workspace")
    void shouldThrowForbiddenWhenCallerIsStudent() {
        UUID wsId = UUID.randomUUID();
        User otherOwner = User.builder().id(UUID.randomUUID()).fullName("Other").build();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .name("Old Name")
                .createdBy(otherOwner)
                .status("ACTIVE")
                .build();

        WorkspaceUpdateRequest request = WorkspaceUpdateRequest.builder()
                .name("Updated Name")
                .build();

        WorkspaceMember studentMember = WorkspaceMember.builder()
                .workspace(ws)
                .user(currentUser)
                .memberRole("STUDENT")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, currentUserId))
                .thenReturn(Optional.of(studentMember));

        assertThatThrownBy(() -> workspaceService.updateWorkspace(wsId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Chỉ Giảng viên của lớp mới có quyền chỉnh sửa Workspace")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.FORBIDDEN);

        verify(workspaceRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should archive workspace successfully when caller is authorized")
    void shouldArchiveWorkspaceSuccessfully() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .name("Class 1")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceRepository.save(any(Workspace.class))).thenAnswer(inv -> inv.getArgument(0));

        WorkspaceResponseDTO response = workspaceService.archiveWorkspace(wsId);

        assertThat(response.getStatus()).isEqualTo("ARCHIVED");
        verify(workspaceRepository).save(ws);
    }

    @Test
    @DisplayName("Should throw FORBIDDEN when non-authorized user archives workspace")
    void shouldThrowForbiddenWhenArchivingWithoutPermission() {
        UUID wsId = UUID.randomUUID();
        User otherOwner = User.builder().id(UUID.randomUUID()).fullName("Other").build();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(otherOwner)
                .status("ACTIVE")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, currentUserId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> workspaceService.archiveWorkspace(wsId))
                .isInstanceOf(BusinessException.class)
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.FORBIDDEN);

        verify(workspaceRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should add member by email successfully")
    void shouldAddMemberByEmailSuccessfully() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        UUID studentId = UUID.randomUUID();
        User student = User.builder()
                .id(studentId)
                .email("student@fpt.edu.vn")
                .fullName("Nguyen Van A")
                .role(Role.builder().code("STUDENT").build())
                .build();

        AddWorkspaceMemberRequest request = AddWorkspaceMemberRequest.builder()
                .email("student@fpt.edu.vn")
                .memberRole("STUDENT")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(userRepository.findByEmail("student@fpt.edu.vn")).thenReturn(Optional.of(student));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(wsId, studentId)).thenReturn(false);

        WorkspaceMember savedMember = WorkspaceMember.builder()
                .id(UUID.randomUUID())
                .workspace(ws)
                .user(student)
                .memberRole("STUDENT")
                .joinedAt(java.time.OffsetDateTime.now())
                .build();
        when(workspaceMemberRepository.save(any(WorkspaceMember.class))).thenReturn(savedMember);

        WorkspaceMemberResponseDTO response = workspaceService.addMemberByEmail(wsId, request);

        assertThat(response).isNotNull();
        assertThat(response.getEmail()).isEqualTo("student@fpt.edu.vn");
        assertThat(response.getFullName()).isEqualTo("Nguyen Van A");
        assertThat(response.getGlobalRole()).isEqualTo("STUDENT");
        assertThat(response.getMemberRole()).isEqualTo("STUDENT");
        verify(workspaceMemberRepository).save(any(WorkspaceMember.class));
    }

    @Test
    @DisplayName("Should throw NOT_FOUND when adding member with non-existent email")
    void shouldThrowNotFoundWhenAddingNonExistentUser() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        AddWorkspaceMemberRequest request = AddWorkspaceMemberRequest.builder()
                .email("unknown@fpt.edu.vn")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(userRepository.findByEmail("unknown@fpt.edu.vn")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> workspaceService.addMemberByEmail(wsId, request))
                .isInstanceOf(BusinessException.class)
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.NOT_FOUND);

        verify(workspaceMemberRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should throw BAD_REQUEST when user is already a member of the workspace")
    void shouldThrowBadRequestWhenUserAlreadyMember() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        UUID studentId = UUID.randomUUID();
        User student = User.builder()
                .id(studentId)
                .email("student@fpt.edu.vn")
                .build();

        AddWorkspaceMemberRequest request = AddWorkspaceMemberRequest.builder()
                .email("student@fpt.edu.vn")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(userRepository.findByEmail("student@fpt.edu.vn")).thenReturn(Optional.of(student));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(wsId, studentId)).thenReturn(true);

        assertThatThrownBy(() -> workspaceService.addMemberByEmail(wsId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Người dùng đã là thành viên của lớp học này")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(workspaceMemberRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should batch add students categorizing into added, alreadyMember, and notFound without loop queries")
    void shouldBatchAddStudentsSuccessfully() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        UUID u1Id = UUID.randomUUID();
        UUID u2Id = UUID.randomUUID();
        User u1 = User.builder().id(u1Id).email("student1@fpt.edu.vn").build();
        User u2 = User.builder().id(u2Id).email("student2@fpt.edu.vn").build();

        BatchAddMembersRequest request = BatchAddMembersRequest.builder()
                .emails(List.of("student1@fpt.edu.vn", "student2@fpt.edu.vn", "unknown@fpt.edu.vn"))
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(userRepository.findByEmailIn(anyCollection())).thenReturn(List.of(u1, u2));
        // student2 is already a member
        when(workspaceMemberRepository.findMemberUserIdsByWorkspaceId(wsId)).thenReturn(Set.of(u2Id));
        when(workspaceMemberRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        BatchAddMembersResponseDTO response = workspaceService.batchAddStudents(wsId, request);

        assertThat(response).isNotNull();
        assertThat(response.getAddedCount()).isEqualTo(1);
        assertThat(response.getAddedEmails()).containsExactly("student1@fpt.edu.vn");
        assertThat(response.getAlreadyMemberEmails()).containsExactly("student2@fpt.edu.vn");
        assertThat(response.getNotFoundEmails()).containsExactly("unknown@fpt.edu.vn");

        verify(workspaceMemberRepository).saveAll(anyList());
    }

    @Test
    @DisplayName("Should get all workspace members in one query")
    void shouldGetWorkspaceMembersSuccessfully() {
        UUID wsId = UUID.randomUUID();
        when(workspaceRepository.existsById(wsId)).thenReturn(true);

        User u = User.builder()
                .id(UUID.randomUUID())
                .email("student@fpt.edu.vn")
                .fullName("Student Name")
                .role(Role.builder().code("STUDENT").build())
                .build();

        WorkspaceMember member = WorkspaceMember.builder()
                .id(UUID.randomUUID())
                .user(u)
                .memberRole("STUDENT")
                .joinedAt(java.time.OffsetDateTime.now())
                .build();

        when(workspaceMemberRepository.findByWorkspaceIdOrderByJoinedAtAsc(wsId)).thenReturn(List.of(member));

        List<WorkspaceMemberResponseDTO> result = workspaceService.getWorkspaceMembers(wsId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getEmail()).isEqualTo("student@fpt.edu.vn");
        assertThat(result.get(0).getMemberRole()).isEqualTo("STUDENT");
        assertThat(result.get(0).getGlobalRole()).isEqualTo("STUDENT");
    }

    @Test
    @DisplayName("Should remove member from workspace successfully")
    void shouldRemoveMemberSuccessfully() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        UUID studentId = UUID.randomUUID();
        WorkspaceMember member = WorkspaceMember.builder()
                .id(UUID.randomUUID())
                .workspace(ws)
                .user(User.builder().id(studentId).build())
                .memberRole("STUDENT")
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, studentId)).thenReturn(Optional.of(member));

        workspaceService.removeMember(wsId, studentId);

        verify(workspaceMemberRepository).delete(member);
    }

    @Test
    @DisplayName("Should throw BAD_REQUEST when trying to remove workspace creator")
    void shouldThrowBadRequestWhenRemovingCreator() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));

        assertThatThrownBy(() -> workspaceService.removeMember(wsId, currentUserId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không thể xóa người tạo khỏi lớp học")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);

        verify(workspaceMemberRepository, never()).delete(any());
    }

    @Test
    @DisplayName("Should throw NOT_FOUND when removing non-existing member")
    void shouldThrowNotFoundWhenRemovingNonExistingMember() {
        UUID wsId = UUID.randomUUID();
        Workspace ws = Workspace.builder()
                .id(wsId)
                .code("SWP391")
                .createdBy(currentUser)
                .build();

        UUID nonMemberId = UUID.randomUUID();
        when(workspaceRepository.findWithCreatorById(wsId)).thenReturn(Optional.of(ws));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, nonMemberId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> workspaceService.removeMember(wsId, nonMemberId))
                .isInstanceOf(BusinessException.class)
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.NOT_FOUND);

        verify(workspaceMemberRepository, never()).delete(any());
    }
}
