package com.mavis.platform.admin.service.impl;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AuthorizationRequestCache;
import com.mavis.platform.admin.dto.AdminDashboardStatsDTO;
import com.mavis.platform.admin.dto.AdminUserResponseDTO;
import com.mavis.platform.admin.dto.AuditLogResponseDTO;
import com.mavis.platform.admin.service.AdminPortalService;
import com.mavis.platform.admin.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminPortalServiceImpl implements AdminPortalService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final WorkspaceRepository workspaceRepository;
    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final JobRepository jobRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final RuntimeSessionRepository runtimeSessionRepository;
    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final AuditLogService auditLogService;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;

    private static final Set<String> ALLOWED_STATUSES = Set.of("ACTIVE", "LOCKED");

    @Override
    @Transactional(readOnly = true)
    public List<AdminUserResponseDTO> getAllUsers() {
        accessPolicyService.requireSystemAdmin();
        log.debug("Lấy toàn bộ danh sách người dùng cho Admin Portal");
        List<User> users = userRepository.findAllByOrderByCreatedAtDesc();
        return users.stream()
                .map(AdminUserResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdminUserResponseDTO changeUserStatus(UUID userId, String newStatus) {
        accessPolicyService.requireSystemAdmin();
        log.info("Admin đổi trạng thái người dùng userId: {}, newStatus: {}", userId, newStatus);

        if (newStatus == null || !ALLOWED_STATUSES.contains(newStatus.trim().toUpperCase())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "Trạng thái không hợp lệ. Chỉ chấp nhận các giá trị: " + ALLOWED_STATUSES);
        }

        String normalizedStatus = newStatus.trim().toUpperCase();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với ID: " + userId));

        String oldStatus = user.getStatus();
        user.setStatus(normalizedStatus);
        user = userRepository.save(user);
        AuthorizationRequestCache.evictUser(userId);

        // Ghi AuditLog theo BR-65
        auditLogService.recordAuditLog(
                "CHANGE_USER_STATUS",
                "USER",
                userId,
                Map.of("oldStatus", oldStatus != null ? oldStatus : "UNKNOWN", "newStatus", normalizedStatus)
        );

        return AdminUserResponseDTO.fromEntity(user);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdminUserResponseDTO changeUserRole(UUID userId, String newRoleCode) {
        accessPolicyService.requireSystemAdmin();
        log.info("Admin đổi vai trò người dùng userId: {}, newRoleCode: {}", userId, newRoleCode);

        if (newRoleCode == null || newRoleCode.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Mã vai trò mới không được để trống");
        }

        String normalizedRoleCode = newRoleCode.trim().toUpperCase();

        Role role = roleRepository.findByCode(normalizedRoleCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy vai trò với mã: " + normalizedRoleCode));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với ID: " + userId));

        String oldRole = user.getRole() != null ? user.getRole().getCode() : "NONE";
        user.setRole(role);
        user = userRepository.save(user);
        AuthorizationRequestCache.evictUser(userId);

        // Ghi AuditLog theo BR-65
        auditLogService.recordAuditLog(
                "CHANGE_USER_ROLE",
                "USER",
                userId,
                Map.of("oldRole", oldRole, "newRole", role.getCode())
        );

        return AdminUserResponseDTO.fromEntity(user);
    }

    @Override
    @Transactional(readOnly = true)
    public AdminDashboardStatsDTO getDashboardStats() {
        accessPolicyService.requireSystemAdmin();
        log.debug("Tổng hợp số liệu thống kê Admin Dashboard bằng .count()");

        long totalUsers = userRepository.count();
        long totalWorkspaces = workspaceRepository.count();
        long totalProjects = projectRepository.count();
        long totalSnapshots = sourceSnapshotRepository.count();
        long totalJobs = jobRepository.count();
        long totalModelVersions = modelVersionRepository.count();
        long totalRuntimeSessions = runtimeSessionRepository.count();
        long totalSubmissions = submissionSnapshotRepository.count();

        return AdminDashboardStatsDTO.builder()
                .runningRuntimeSessions(runtimeSessionRepository.countByExecutionStatusIn(List.of("ALLOCATED","RUNNING","CANCELLING")))
                .healthStatus("unknown")
                .totalUsers(totalUsers)
                .totalWorkspaces(totalWorkspaces)
                .totalProjects(totalProjects)
                .totalSnapshots(totalSnapshots)
                .totalJobs(totalJobs)
                .totalModelVersions(totalModelVersions)
                .totalRuntimeSessions(totalRuntimeSessions)
                .totalSubmissions(totalSubmissions)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AuditLogResponseDTO> getRecentAuditLogs() {
        accessPolicyService.requireSystemAdmin();
        return auditLogService.getRecentAuditLogs();
    }
}
