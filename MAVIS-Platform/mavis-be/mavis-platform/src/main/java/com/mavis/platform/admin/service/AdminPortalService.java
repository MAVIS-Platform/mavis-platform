package com.mavis.platform.admin.service;

import com.mavis.platform.admin.dto.AdminDashboardStatsDTO;
import com.mavis.platform.admin.dto.AdminUserResponseDTO;
import com.mavis.platform.admin.dto.AuditLogResponseDTO;

import java.util.List;
import java.util.UUID;

public interface AdminPortalService {

    /**
     * Lấy danh sách toàn bộ người dùng trong hệ thống (tối ưu @EntityGraph(attributePaths = {"role"})).
     *
     * @return Danh sách AdminUserResponseDTO
     */
    List<AdminUserResponseDTO> getAllUsers();

    /**
     * Thay đổi trạng thái tài khoản người dùng ('ACTIVE', 'LOCKED') và ghi AuditLog (BR-65).
     *
     * @param userId ID người dùng
     * @param newStatus Trạng thái mới
     * @return AdminUserResponseDTO sau khi cập nhật
     */
    AdminUserResponseDTO changeUserStatus(UUID userId, String newStatus);

    /**
     * Thay đổi vai trò (Role) của người dùng và ghi AuditLog (BR-65).
     *
     * @param userId ID người dùng
     * @param newRoleCode Mã vai trò mới ('STUDENT', 'LECTURER', 'ADMIN')
     * @return AdminUserResponseDTO sau khi cập nhật
     */
    AdminUserResponseDTO changeUserRole(UUID userId, String newRoleCode);

    /**
     * Lấy số liệu thống kê tổng quan hệ thống trên Admin Dashboard bằng các hàm .count() siêu nhẹ.
     *
     * @return AdminDashboardStatsDTO
     */
    AdminDashboardStatsDTO getDashboardStats();

    /**
     * Lấy danh sách các nhật ký kiểm toán gần đây.
     *
     * @return Danh sách AuditLogResponseDTO
     */
    List<AuditLogResponseDTO> getRecentAuditLogs();
}
