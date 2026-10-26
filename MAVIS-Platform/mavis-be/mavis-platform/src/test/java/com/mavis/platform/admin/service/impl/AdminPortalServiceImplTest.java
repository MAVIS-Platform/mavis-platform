package com.mavis.platform.admin.service.impl;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import com.mavis.platform.admin.dto.AdminDashboardStatsDTO;
import com.mavis.platform.admin.dto.AdminUserResponseDTO;
import com.mavis.platform.admin.dto.AuditLogResponseDTO;
import com.mavis.platform.admin.service.AuditLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminPortalServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private JobRepository jobRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Mock
    private AuditLogService auditLogService;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @InjectMocks
    private AdminPortalServiceImpl adminPortalService;

    private UUID userId;
    private User user;
    private Role studentRole;
    private Role lecturerRole;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();

        studentRole = Role.builder()
                .id(UUID.randomUUID())
                .code("STUDENT")
                .name("Sinh viên")
                .build();

        lecturerRole = Role.builder()
                .id(UUID.randomUUID())
                .code("LECTURER")
                .name("Giảng viên")
                .build();

        user = User.builder()
                .id(userId)
                .email("student@mavis.edu.vn")
                .fullName("Nguyen Van A")
                .role(studentRole)
                .status("ACTIVE")
                .createdAt(OffsetDateTime.now())
                .build();
    }

    @Test
    @DisplayName("Khóa tài khoản người dùng thành công và tự động ghi AuditLog")
    void testChangeUserStatus_Success() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponseDTO result = adminPortalService.changeUserStatus(userId, "LOCKED");

        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo("LOCKED");

        // Xác minh ghi AuditLog
        verify(auditLogService).recordAuditLog(
                eq("CHANGE_USER_STATUS"),
                eq("USER"),
                eq(userId),
                any(Map.class)
        );
        verify(userRepository).save(user);
    }

    @Test
    @DisplayName("Chặn thay đổi trạng thái không hợp lệ (BAD_REQUEST)")
    void testChangeUserStatus_InvalidStatus_ThrowsBadRequest() {
        assertThatThrownBy(() -> adminPortalService.changeUserStatus(userId, "INVALID_STATUS_XXX"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Trạng thái không hợp lệ");

        verify(userRepository, never()).save(any());
        verify(auditLogService, never()).recordAuditLog(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Thay đổi vai trò (Role) người dùng thành công và tự động ghi AuditLog")
    void testChangeUserRole_Success() {
        when(roleRepository.findByCode("LECTURER")).thenReturn(Optional.of(lecturerRole));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponseDTO result = adminPortalService.changeUserRole(userId, "LECTURER");

        assertThat(result).isNotNull();
        assertThat(result.getRoleCode()).isEqualTo("LECTURER");

        // Xác minh ghi AuditLog
        verify(auditLogService).recordAuditLog(
                eq("CHANGE_USER_ROLE"),
                eq("USER"),
                eq(userId),
                any(Map.class)
        );
        verify(userRepository).save(user);
    }

    @Test
    @DisplayName("Lấy số liệu thống kê Dashboard tổng hợp từ 8 bảng")
    void testGetDashboardStats_Success() {
        when(userRepository.count()).thenReturn(100L);
        when(workspaceRepository.count()).thenReturn(10L);
        when(projectRepository.count()).thenReturn(45L);
        when(sourceSnapshotRepository.count()).thenReturn(60L);
        when(jobRepository.count()).thenReturn(80L);
        when(modelVersionRepository.count()).thenReturn(75L);
        when(runtimeSessionRepository.count()).thenReturn(30L);
        when(submissionSnapshotRepository.count()).thenReturn(25L);

        AdminDashboardStatsDTO stats = adminPortalService.getDashboardStats();

        assertThat(stats).isNotNull();
        assertThat(stats.getTotalUsers()).isEqualTo(100L);
        assertThat(stats.getTotalWorkspaces()).isEqualTo(10L);
        assertThat(stats.getTotalProjects()).isEqualTo(45L);
        assertThat(stats.getTotalSnapshots()).isEqualTo(60L);
        assertThat(stats.getTotalJobs()).isEqualTo(80L);
        assertThat(stats.getTotalModelVersions()).isEqualTo(75L);
        assertThat(stats.getTotalRuntimeSessions()).isEqualTo(30L);
        assertThat(stats.getTotalSubmissions()).isEqualTo(25L);
    }

    @Test
    @DisplayName("Lấy toàn bộ người dùng hệ thống")
    void testGetAllUsers_Success() {
        when(userRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(user));

        List<AdminUserResponseDTO> users = adminPortalService.getAllUsers();

        assertThat(users).hasSize(1);
        assertThat(users.get(0).getEmail()).isEqualTo("student@mavis.edu.vn");
        assertThat(users.get(0).getRoleCode()).isEqualTo("STUDENT");
    }

    @Test
    @DisplayName("Lấy danh sách nhật ký kiểm toán gần đây")
    void testGetRecentAuditLogs_Success() {
        AuditLogResponseDTO logDTO = AuditLogResponseDTO.builder()
                .id(UUID.randomUUID())
                .action("CHANGE_USER_STATUS")
                .targetType("USER")
                .targetId(userId)
                .build();

        when(auditLogService.getRecentAuditLogs()).thenReturn(List.of(logDTO));

        List<AuditLogResponseDTO> logs = adminPortalService.getRecentAuditLogs();

        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getAction()).isEqualTo("CHANGE_USER_STATUS");
    }

    @Test
    void lockingOrChangingRoleEvictsTheRequestAuthorizationEntry() {
        var request = new org.springframework.web.context.request.ServletRequestAttributes(new org.springframework.mock.web.MockHttpServletRequest());
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(request);
        try {
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(roleRepository.findByCode("LECTURER")).thenReturn(Optional.of(lecturerRole));
            var stale = User.builder().id(userId).status("ACTIVE").role(studentRole).build();
            com.mavis.common.security.AuthorizationRequestCache.user(userId, () -> Optional.of(stale));
            adminPortalService.changeUserStatus(userId, "LOCKED");
            assertThat(com.mavis.common.security.AuthorizationRequestCache.user(userId, () -> Optional.of(user))).containsSame(user);
            com.mavis.common.security.AuthorizationRequestCache.evictUser(userId);
            com.mavis.common.security.AuthorizationRequestCache.user(userId, () -> Optional.of(stale));
            adminPortalService.changeUserRole(userId, "LECTURER");
            assertThat(com.mavis.common.security.AuthorizationRequestCache.user(userId, () -> Optional.of(user))).containsSame(user);
        } finally {
            request.requestCompleted();
            org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
        }
    }
}
