package com.mavis.common.security.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.common.security.AuthorizationRequestCache;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.UUID;

import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AccessPolicyServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private WorkspaceMemberRepository workspaceMemberRepository;

    @InjectMocks
    private AccessPolicyServiceImpl accessPolicyService;

    private UUID currentUserId;
    private User currentUser;
    private Role studentRole;
    private Role lecturerRole;
    private Role adminRole;

    @BeforeEach
    void setUp() {
        currentUserId = UUID.randomUUID();

        studentRole = Role.builder().id(UUID.randomUUID()).code("STUDENT").name("Student").build();
        lecturerRole = Role.builder().id(UUID.randomUUID()).code("LECTURER").name("Lecturer").build();
        adminRole = Role.builder().id(UUID.randomUUID()).code("SYSTEM_ADMIN").name("System Administrator").build();

        currentUser = User.builder()
                .id(currentUserId)
                .email("current_user@mavis.edu.vn")
                .fullName("Current User")
                .status("ACTIVE")
                .role(studentRole)
                .build();

        // Cài đặt SecurityContext mock
        Authentication authentication = mock(Authentication.class);
        when(authentication.isAuthenticated()).thenReturn(true);
        when(authentication.getName()).thenReturn(currentUserId.toString());
        when(authentication.getPrincipal()).thenReturn(currentUserId.toString());

        SecurityContext securityContext = mock(SecurityContext.class);
        when(securityContext.getAuthentication()).thenReturn(authentication);
        SecurityContextHolder.setContext(securityContext);

        SecurityUtils.setDevBypassEnabled(true);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();
        SecurityUtils.setDevBypassEnabled(true);
    }

    @Test
    @DisplayName("Kịch bản 1: User bị LOCKED hoặc INACTIVE bị chặn 403 Forbidden")
    void testRequireCurrentActiveUser_LockedUser_ThrowsForbidden() {
        currentUser.setStatus("LOCKED");
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        assertThatThrownBy(() -> accessPolicyService.requireCurrentActiveUser())
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Tài khoản đã bị khóa hoặc ngừng hoạt động");
                });
    }

    @Test
    @DisplayName("Kịch bản 2: Sinh viên cố tình gọi API Admin bị chặn 403 Forbidden")
    void testRequireSystemAdmin_StudentRole_ThrowsForbidden() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        assertThatThrownBy(() -> accessPolicyService.requireSystemAdmin())
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Yêu cầu quyền Quản trị viên hệ thống (SYSTEM_ADMIN)");
                });
    }

    @Test
    @DisplayName("Kịch bản 3: Quản trị viên SYSTEM_ADMIN gọi requireSystemAdmin thành công")
    void testRequireSystemAdmin_AdminRole_Success() {
        currentUser.setRole(adminRole);
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        accessPolicyService.requireSystemAdmin();
    }

    @Test
    @DisplayName("Kịch bản 4: Người dùng không thuộc Workspace bị chặn 403 Forbidden")
    void testRequireWorkspaceMember_NonMember_ThrowsForbidden() {
        UUID workspaceId = UUID.randomUUID();
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User creator = User.builder().id(UUID.randomUUID()).build();
        Workspace workspace = Workspace.builder().id(workspaceId).createdBy(creator).build();
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, currentUserId)).thenReturn(false);

        assertThatThrownBy(() -> accessPolicyService.requireWorkspaceMember(workspaceId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Bạn không phải là thành viên của không gian làm việc này");
                });
    }

    @Test
    @DisplayName("Kịch bản 5: Sinh viên cố tình gọi API của Giảng viên bị chặn 403 Forbidden")
    void testRequireWorkspaceLecturer_StudentRole_ThrowsForbidden() {
        UUID workspaceId = UUID.randomUUID();
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User creator = User.builder().id(UUID.randomUUID()).role(lecturerRole).build();
        Workspace workspace = Workspace.builder().id(workspaceId).createdBy(creator).build();
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));

        WorkspaceMember studentMember = WorkspaceMember.builder()
                .workspace(workspace)
                .user(currentUser)
                .memberRole("STUDENT")
                .build();
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, currentUserId))
                .thenReturn(Optional.of(studentMember));

        assertThatThrownBy(() -> accessPolicyService.requireWorkspaceLecturer(workspaceId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Chỉ Giảng viên của lớp học mới có quyền thực hiện thao tác này");
                });
    }

    @Test
    @DisplayName("Kịch bản 6: Giảng viên của Workspace gọi requireWorkspaceLecturer thành công")
    void testRequireWorkspaceLecturer_LecturerRole_Success() {
        UUID workspaceId = UUID.randomUUID();
        currentUser.setRole(lecturerRole);
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User creator = User.builder().id(UUID.randomUUID()).build();
        Workspace workspace = Workspace.builder().id(workspaceId).createdBy(creator).build();
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));

        WorkspaceMember lecturerMember = WorkspaceMember.builder()
                .workspace(workspace)
                .user(currentUser)
                .memberRole("LECTURER")
                .build();
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, currentUserId))
                .thenReturn(Optional.of(lecturerMember));

        accessPolicyService.requireWorkspaceLecturer(workspaceId);
    }

    @Test
    @DisplayName("Kịch bản 7: Sinh viên A cố tình truy cập xem Project của Sinh viên B qua UUID bị chặn 403 Forbidden")
    void testRequireProjectReadAccess_DifferentStudent_ThrowsForbidden() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User studentB = User.builder().id(UUID.randomUUID()).fullName("Student B").build();
        Workspace workspace = Workspace.builder().id(UUID.randomUUID()).build();

        Project projectB = Project.builder()
                .id(UUID.randomUUID())
                .name("Private Project of B")
                .owner(studentB)
                .workspace(workspace)
                .isReferenceTemplate(false)
                .build();

        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), currentUserId))
                .thenReturn(Optional.of(WorkspaceMember.builder().memberRole("STUDENT").build()));

        assertThatThrownBy(() -> accessPolicyService.requireProjectReadAccess(projectB))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Bạn không có quyền truy cập đồ án này");
                });
    }

    @Test
    @DisplayName("Kịch bản 8: Sinh viên A được phép xem Project mẫu (isReferenceTemplate=true) của Workspace")
    void testRequireProjectReadAccess_ReferenceTemplate_Allowed() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User teacher = User.builder().id(UUID.randomUUID()).fullName("Teacher").build();
        Workspace workspace = Workspace.builder().id(UUID.randomUUID()).build();

        Project templateProject = Project.builder()
                .id(UUID.randomUUID())
                .name("Reference Template Microservices")
                .owner(teacher)
                .workspace(workspace)
                .isReferenceTemplate(true)
                .build();

        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), currentUserId))
                .thenReturn(Optional.of(WorkspaceMember.builder().memberRole("STUDENT").build()));

        accessPolicyService.requireProjectReadAccess(templateProject);
    }

    @Test
    @DisplayName("Kịch bản 9: Sinh viên khác cố tình sửa/xóa Project của chủ sở hữu bị chặn 403 Forbidden")
    void testRequireProjectWriteAccess_NonOwner_ThrowsForbidden() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        User otherOwner = User.builder().id(UUID.randomUUID()).fullName("Other Owner").build();
        Project otherProject = Project.builder()
                .id(UUID.randomUUID())
                .owner(otherOwner)
                .build();

        assertThatThrownBy(() -> accessPolicyService.requireProjectWriteAccess(otherProject))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
                    assertThat(be.getMessage()).contains("Bạn không có quyền chỉnh sửa đồ án này");
                });
    }

    @Test
    @DisplayName("Kịch bản 10: Chủ sở hữu có toàn quyền sửa/xóa Project của chính mình")
    void testRequireProjectWriteAccess_Owner_Success() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));

        Project ownProject = Project.builder()
                .id(UUID.randomUUID())
                .owner(currentUser)
                .build();

        accessPolicyService.requireProjectWriteAccess(ownProject);
    }

    @Test
    @DisplayName("Kịch bản 11: Khi devBypassEnabled = false, request không có JWT Bearer bị chặn 401 Unauthorized")
    void testDevBypassDisabled_NoJwt_ThrowsUnauthorized() {
        try {
            SecurityContextHolder.clearContext();
            SecurityUtils.setDevBypassEnabled(false);

            assertThatThrownBy(SecurityUtils::getCurrentUserId)
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
                        assertThat(be.getMessage()).contains("Yêu cầu đăng nhập hợp lệ");
                    });
        } finally {
            SecurityUtils.setDevBypassEnabled(true);
        }
    }

    private void newRequest() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
    }

    @Test
    void userAndRoleAreLoadedOncePerRequestButReloadedForTheNextRequest() {
        newRequest();
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));
        accessPolicyService.requireCurrentActiveUser();
        accessPolicyService.requireCurrentActiveUser();
        verify(userRepository).findWithRoleById(currentUserId);
        verify(userRepository, never()).findById(any());
        newRequest();
        currentUser.setStatus("LOCKED");
        assertThatThrownBy(accessPolicyService::requireCurrentActiveUser).isInstanceOf(BusinessException.class);
        verify(userRepository, times(2)).findWithRoleById(currentUserId);
    }

    @Test
    void outsideHttpRequestsAuthorizationDoesNotReuseCachedEntities() {
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));
        accessPolicyService.requireCurrentActiveUser();
        accessPolicyService.requireCurrentActiveUser();
        verify(userRepository, times(2)).findWithRoleById(currentUserId);
    }

    @Test
    void membershipCacheIncludesMissesAndEvictionRestoresFreshPermissionChecks() {
        newRequest();
        UUID workspaceId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).build();
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, currentUserId))
                .thenReturn(Optional.empty(), Optional.of(WorkspaceMember.builder().memberRole("LECTURER").build()));
        assertThatThrownBy(() -> accessPolicyService.requireWorkspaceMember(workspaceId)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> accessPolicyService.requireWorkspaceLecturer(workspaceId)).isInstanceOf(BusinessException.class);
        verify(workspaceMemberRepository).findByWorkspaceIdAndUserId(workspaceId, currentUserId);
        AuthorizationRequestCache.evictMembership(workspaceId, currentUserId);
        accessPolicyService.requireWorkspaceLecturer(workspaceId);
        verify(workspaceMemberRepository, times(2)).findByWorkspaceIdAndUserId(workspaceId, currentUserId);
        verify(userRepository).findWithRoleById(currentUserId);
    }

    @Test
    void evictingUserReloadsRolesAndBlockedStatusWithinTheSameRequest() {
        newRequest();
        var locked = User.builder().id(currentUserId).role(adminRole).status("LOCKED").build();
        when(userRepository.findWithRoleById(currentUserId)).thenReturn(Optional.of(currentUser), Optional.of(locked));
        accessPolicyService.requireCurrentActiveUser();
        AuthorizationRequestCache.evictUser(currentUserId);
        assertThatThrownBy(accessPolicyService::requireCurrentActiveUser).isInstanceOf(BusinessException.class);
        verify(userRepository, times(2)).findWithRoleById(currentUserId);
    }
}
