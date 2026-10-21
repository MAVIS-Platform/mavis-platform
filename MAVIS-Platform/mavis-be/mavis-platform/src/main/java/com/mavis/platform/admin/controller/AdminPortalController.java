package com.mavis.platform.admin.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.admin.dto.*;
import com.mavis.platform.admin.service.AdminPortalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin Portal & Audit Log", description = "APIs for platform administration, user management, audit logging, and dashboard analytics (FE-12, BR-65)")
public class AdminPortalController {

    private final AdminPortalService adminPortalService;

    @GetMapping("/users")
    @Operation(summary = "Lấy danh sách toàn bộ người dùng hệ thống",
            description = "Tối ưu @EntityGraph(attributePaths = {\"role\"}) nạp thông tin người dùng và vai trò")
    public ApiResponse<List<AdminUserResponseDTO>> getAllUsers() {
        List<AdminUserResponseDTO> users = adminPortalService.getAllUsers();
        return ApiResponse.success("Lấy danh sách người dùng thành công", users);
    }

    @PatchMapping("/users/{userId}/status")
    @Operation(summary = "Cập nhật trạng thái tài khoản (ACTIVE, LOCKED, INACTIVE)",
            description = "Khóa hoặc mở khóa tài khoản người dùng và tự động ghi AuditLog theo BR-65")
    public ApiResponse<AdminUserResponseDTO> changeUserStatus(
            @PathVariable UUID userId,
            @Valid @RequestBody UserStatusUpdateRequest request) {
        AdminUserResponseDTO updated = adminPortalService.changeUserStatus(userId, request.getNewStatus());
        return ApiResponse.success("Cập nhật trạng thái người dùng thành công", updated);
    }

    @PatchMapping("/users/{userId}/role")
    @Operation(summary = "Thay đổi vai trò người dùng (STUDENT, LECTURER, ADMIN)",
            description = "Phân quyền người dùng và tự động ghi AuditLog theo BR-65")
    public ApiResponse<AdminUserResponseDTO> changeUserRole(
            @PathVariable UUID userId,
            @Valid @RequestBody UserRoleUpdateRequest request) {
        AdminUserResponseDTO updated = adminPortalService.changeUserRole(userId, request.getNewRoleCode());
        return ApiResponse.success("Cập nhật vai trò người dùng thành công", updated);
    }

    @GetMapping("/dashboard-stats")
    @Operation(summary = "Lấy số liệu thống kê tổng quan hệ thống",
            description = "Thống kê tổng số Users, Workspaces, Projects, Snapshots, Jobs, ModelVersions, Sessions, Submissions")
    public ApiResponse<AdminDashboardStatsDTO> getDashboardStats() {
        AdminDashboardStatsDTO stats = adminPortalService.getDashboardStats();
        return ApiResponse.success("Lấy số liệu thống kê Dashboard thành công", stats);
    }

    @GetMapping("/audit-logs")
    @Operation(summary = "Lấy 100 nhật ký kiểm toán mới nhất",
            description = "Tối ưu @EntityGraph(attributePaths = {\"actor\"}) theo dõi mọi biến động quản trị hệ thống")
    public ApiResponse<List<AuditLogResponseDTO>> getRecentAuditLogs() {
        List<AuditLogResponseDTO> logs = adminPortalService.getRecentAuditLogs();
        return ApiResponse.success("Lấy danh sách nhật ký kiểm toán thành công", logs);
    }
}
