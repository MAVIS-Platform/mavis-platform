package com.mavis.common.security.impl;

import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.AuthorizationRequestCache;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class AccessPolicyServiceImpl implements AccessPolicyService {

    private final UserRepository userRepository;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final CourseLabPolicy courseLabs;

    @Override
    public User requireCurrentActiveUser() {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        User user = AuthorizationRequestCache.user(currentUserId, () -> userRepository.findWithRoleById(currentUserId))
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Người dùng không tồn tại"));

        if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            log.warn("Truy cập bị từ chối: Người dùng {} đang ở trạng thái {}", user.getId(), user.getStatus());
            throw new BusinessException(ErrorCode.FORBIDDEN, "Tài khoản đã bị khóa hoặc ngừng hoạt động");
        }

        return user;
    }

    @Override
    public void requireSystemAdmin() {
        User user = requireCurrentActiveUser();
        if (user.getRole() == null || !"SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode())) {
            log.warn("Truy cập bị từ chối: Người dùng {} (role={}) cố gắng thực hiện tác vụ của SYSTEM_ADMIN",
                    user.getId(), user.getRole() != null ? user.getRole().getCode() : "null");
            throw new BusinessException(ErrorCode.FORBIDDEN, "Yêu cầu quyền Quản trị viên hệ thống (SYSTEM_ADMIN)");
        }
    }

    @Override
    public void requireWorkspaceMember(UUID workspaceId) {
        User user = requireCurrentActiveUser();

        // 1. Quản trị viên hệ thống có toàn quyền
        if (user.getRole() != null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode())) {
            return;
        }

        Workspace workspace = workspace(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy không gian làm việc"));

        // 2. Người tạo workspace
        if (workspace.getCreatedBy() != null && workspace.getCreatedBy().getId().equals(user.getId())) {
            return;
        }

        // 3. Thành viên trong workspace_members
        boolean isMember = membership(workspaceId, user.getId()).isPresent();
        if (!isMember) {
            log.warn("Truy cập bị từ chối: Người dùng {} không phải là thành viên của Workspace {}", user.getId(), workspaceId);
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không phải là thành viên của không gian làm việc này");
        }
    }

    @Override
    public void requireWorkspaceLecturer(UUID workspaceId) {
        User user = requireCurrentActiveUser();

        // 1. Quản trị viên hệ thống có toàn quyền
        if (user.getRole() != null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode())) {
            return;
        }

        Workspace workspace = workspace(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy không gian làm việc"));

        // 2. Người tạo workspace nếu có role là LECTURER
        if (workspace.getCreatedBy() != null && workspace.getCreatedBy().getId().equals(user.getId())) {
            if (user.getRole() != null && "LECTURER".equalsIgnoreCase(user.getRole().getCode())) {
                return;
            }
        }

        // A workspace role does not restore lecturer privileges after a global role change.
        Optional<WorkspaceMember> memberOpt = membership(workspaceId, user.getId());
        if (user.getRole() != null && "LECTURER".equalsIgnoreCase(user.getRole().getCode())
                && memberOpt.isPresent() && "LECTURER".equalsIgnoreCase(memberOpt.get().getMemberRole())) {
            return;
        }

        log.warn("Truy cập bị từ chối: Người dùng {} không phải là Giảng viên của Workspace {}", user.getId(), workspaceId);
        throw new BusinessException(ErrorCode.FORBIDDEN, "Chỉ Giảng viên của lớp học mới có quyền thực hiện thao tác này");
    }

    @Override
    public void requireProjectReadAccess(Project project) {
        if (project == null) throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đồ án");
        if (!canReadProject(project)) throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập đồ án này");
    }

    @Override
    public boolean canReadProject(Project project) {
        if (project == null) {
            return false;
        }

        User user = requireCurrentActiveUser();

        // 1. SYSTEM_ADMIN có toàn quyền xem
        if (user.getRole() != null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode())) {
            return true;
        }

        if (!canAccessCourseProject(project, user)) {
            return false;
        }

        // 2. Chủ sở hữu đồ án
        if (project.getOwner() != null && project.getOwner().getId().equals(user.getId())) {
            return true;
        }

        // 3. Nếu đồ án thuộc Workspace
        if (project.getWorkspace() != null) {
            UUID workspaceId = project.getWorkspace().getId();

            Optional<WorkspaceMember> memberOpt = membership(workspaceId, user.getId());
            if (memberOpt.isPresent()) {
                if (user.getRole() != null && "LECTURER".equalsIgnoreCase(user.getRole().getCode())
                        && "LECTURER".equalsIgnoreCase(memberOpt.get().getMemberRole())) {
                    return true;
                }

                // Nếu là Sinh viên thành viên trong Workspace, chỉ được xem nếu đồ án là Reference Template!
                if (Boolean.TRUE.equals(project.getIsReferenceTemplate())) {
                    return true;
                }
            }

            // Nếu user là Giảng viên tạo Workspace -> được xem
            Workspace workspace = project.getWorkspace();
            boolean isCreatorLecturer = workspace.getCreatedBy() != null
                    && workspace.getCreatedBy().getId().equals(user.getId())
                    && user.getRole() != null
                    && "LECTURER".equalsIgnoreCase(user.getRole().getCode());

            if (isCreatorLecturer) {
                return true;
            }
        }

        log.warn("Truy cập bị từ chối: Người dùng {} không có quyền đọc Project {}", user.getId(), project.getId());
        return false;
    }

    private boolean canAccessCourseProject(Project project, User user) {
        if (project.getWorkspace() == null || !project.getWorkspace().isCourseMode()
                || !CourseLabPolicy.isStudent(user)) {
            return true;
        }
        var lab = project.getAssignment();
        if (lab == null || !project.getWorkspace().getId().equals(lab.getWorkspace().getId())
                || lab.getReferenceModel() == null || lab.getReferenceModel().getSourceSnapshot() == null
                || !"STUDENT_WORKING".equals(project.getProjectType())
                || Boolean.TRUE.equals(project.getIsReferenceTemplate())) {
            return false;
        }
        return lab.getReferenceModel().getSourceSnapshot().getId().equals(project.getReferenceSnapshotId())
                && courseLabs.canOpen(lab, user);
    }

    private Optional<Workspace> workspace(UUID workspaceId) {
        return AuthorizationRequestCache.workspace(workspaceId, () -> workspaceRepository.findById(workspaceId));
    }

    private Optional<WorkspaceMember> membership(UUID workspaceId, UUID userId) {
        return AuthorizationRequestCache.membership(workspaceId, userId,
                () -> workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId));
    }

    @Override
    public void requireProjectWriteAccess(Project project) {
        if (project == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đồ án");
        }

        if ("DELETED".equalsIgnoreCase(project.getStatus())) throw new BusinessException(ErrorCode.NOT_FOUND,"Project not found");
        User user = requireCurrentActiveUser();

        // 1. SYSTEM_ADMIN có toàn quyền sửa/xóa
        if (user.getRole() != null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode())) {
            return;
        }

        if (!canAccessCourseProject(project, user)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This course project is locked");
        }

        // 2. Chỉ duy nhất chủ sở hữu mới có quyền ghi
        if (project.getOwner() != null && project.getOwner().getId().equals(user.getId())) {
            return;
        }

        log.warn("Truy cập bị từ chối: Người dùng {} không có quyền ghi Project {}", user.getId(), project.getId());
        throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền chỉnh sửa đồ án này");
    }
}
