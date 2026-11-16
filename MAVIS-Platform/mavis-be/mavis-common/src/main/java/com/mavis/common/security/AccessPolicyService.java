package com.mavis.common.security;

import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;

import java.util.UUID;

/**
 * Ma trận Phân quyền Tài nguyên Hệ thống (Resource RBAC Access Policy - A2 / WJ-05).
 */
public interface AccessPolicyService {

    /**
     * Lấy User hiện tại đang đăng nhập và kiểm tra trạng thái hoạt động (ACTIVE).
     * Nếu bị khóa (LOCKED), ngừng hoạt động (INACTIVE), ném FORBIDDEN.
     */
    User requireCurrentActiveUser();

    /**
     * Bắt buộc người dùng hiện tại phải có vai trò SYSTEM_ADMIN.
     */
    void requireSystemAdmin();

    /**
     * Kiểm tra người dùng hiện tại có phải là thành viên của Workspace không (hoặc là Creator/SYSTEM_ADMIN).
     */
    void requireWorkspaceMember(UUID workspaceId);

    /**
     * Bắt buộc người dùng hiện tại phải là Giảng viên (LECTURER) của Workspace (hoặc Creator nếu là LECTURER, hoặc SYSTEM_ADMIN).
     * Nếu là STUDENT hoặc không thuộc Workspace, ném FORBIDDEN.
     */
    void requireWorkspaceLecturer(UUID workspaceId);

    /**
     * Kiểm tra quyền đọc đồ án (Project):
     * Cho phép:
     * - Chủ sở hữu đồ án (project.getOwner())
     * - Quản trị viên (SYSTEM_ADMIN)
     * - Giảng viên (LECTURER) của Workspace mà đồ án trực thuộc
     * - Sinh viên trong cùng Workspace nếu đồ án được đánh dấu là đồ án mẫu (isReferenceTemplate == true)
     * Ngăn chặn triệt để việc sinh viên A xem đồ án của sinh viên B khác.
     */
    void requireProjectReadAccess(Project project);
    boolean canReadProject(Project project);

    /**
     * Kiểm tra quyền chỉnh sửa/xóa đồ án (Project):
     * Chỉ chủ sở hữu đồ án (project.getOwner()) hoặc SYSTEM_ADMIN mới có quyền.
     */
    void requireProjectWriteAccess(Project project);
}
