package com.mavis.platform.workspace.service.impl;

import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.security.AuthorizationRequestCache;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.workspace.dto.*;
import com.mavis.platform.workspace.service.CourseAccessService;
import com.mavis.platform.workspace.service.CourseLifecycleService;
import com.mavis.platform.workspace.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(rollbackFor = Exception.class)
public class WorkspaceServiceImpl implements WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final AssignmentRepository assignmentRepository;
    private final UserRepository userRepository;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;
    private final CourseAccessService courseAccessService;
    private final CourseLifecycleService courseLifecycleService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceResponseDTO createWorkspace(WorkspaceCreateRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng hiện tại"));

        accessPolicyService.requireCurrentActiveUser();
        if (currentUser.getRole()==null || !("LECTURER".equals(currentUser.getRole().getCode()) || "SYSTEM_ADMIN".equals(currentUser.getRole().getCode())))
            throw new BusinessException(ErrorCode.FORBIDDEN, "Only lecturers or administrators can create a workspace");
        String code = request.getCode().trim();
        if (workspaceRepository.existsByCodeIgnoreCase(code)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Mã lớp học đã tồn tại: " + request.getCode());
        }

        OffsetDateTime now = OffsetDateTime.now();
        Workspace workspace = Workspace.builder()
                .code(code)
                .name(request.getName().trim())
                .description(request.getDescription())
                .createdBy(currentUser)
                .status("INACTIVE")
                .createdAt(now)
                .updatedAt(now)
                .build();
        workspace = workspaceRepository.save(workspace);

        WorkspaceMember member = WorkspaceMember.builder()
                .workspace(workspace)
                .user(currentUser)
                .memberRole("LECTURER")
                .joinedAt(now)
                .build();
        workspaceMemberRepository.save(member);
        AuthorizationRequestCache.evictMembership(workspace.getId(), currentUserId);
        // Auto-generate one default structured passkey when a new class is created.
        courseAccessService.createPasskey(
                workspace.getId(),
                new CourseAccessService.CreatePasskeyRequest(null, null, 720, null));

        log.info("Workspace created: id={}, code={}, createdBy={}", workspace.getId(), workspace.getCode(), currentUser.getEmail());

        OffsetDateTime createdAt = workspace.getCreatedAt() != null ? workspace.getCreatedAt() : now;
        OffsetDateTime updatedAt = workspace.getUpdatedAt() != null ? workspace.getUpdatedAt() : now;

        return WorkspaceResponseDTO.builder()
                .id(workspace.getId())
                .code(workspace.getCode())
                .name(workspace.getName())
                .description(workspace.getDescription())
                .createdById(currentUser.getId())
                .createdByName(currentUser.getFullName())
                .status(workspace.getStatus())
                .memberCount(1L)
                .assignmentCount(0L)
                .myRoleInWorkspace("LECTURER")
                .members(List.of(toMemberDto(workspace.getId(), member)))
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkspaceResponseDTO> getMyWorkspaces() {
        accessPolicyService.requireCurrentActiveUser();
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        List<Workspace> workspaces = workspaceRepository.findAllAccessibleByUserId(currentUserId);

        if (workspaces.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> workspaceIds = workspaces.stream().map(Workspace::getId).toList();

        Map<UUID, Long> memberCountMap = new HashMap<>();
        List<Object[]> memberCounts = workspaceMemberRepository.countMembersByWorkspaceIds(workspaceIds);
        for (Object[] row : memberCounts) {
            if (row != null && row.length >= 2 && row[0] != null) {
                memberCountMap.put((UUID) row[0], ((Number) row[1]).longValue());
            }
        }

        Map<UUID, Long> assignmentCountMap = new HashMap<>();
        List<Object[]> assignmentCounts = assignmentRepository.countAssignmentsByWorkspaceIds(workspaceIds);
        for (Object[] row : assignmentCounts) {
            if (row != null && row.length >= 2 && row[0] != null) {
                assignmentCountMap.put((UUID) row[0], ((Number) row[1]).longValue());
            }
        }

        Map<UUID, String> roleMap = new HashMap<>();
        List<WorkspaceMember> myMemberships = workspaceMemberRepository.findByUserIdAndWorkspaceIdIn(currentUserId, workspaceIds);
        for (WorkspaceMember wm : myMemberships) {
            if (wm.getWorkspace() != null) {
                roleMap.put(wm.getWorkspace().getId(), wm.getMemberRole());
            }
        }

        Map<UUID, List<WorkspaceMemberResponseDTO>> membersByWorkspace = new HashMap<>();
        for (WorkspaceMember wm : workspaceMemberRepository.findByWorkspaceIdInOrderByJoinedAtAsc(workspaceIds)) {
            if (wm.getWorkspace() != null && wm.getWorkspace().getId() != null) {
                membersByWorkspace
                        .computeIfAbsent(wm.getWorkspace().getId(), k -> new ArrayList<>())
                        .add(toMemberDto(wm.getWorkspace().getId(), wm));
            }
        }

        return workspaces.stream().map(w -> {
            String myRole = roleMap.get(w.getId());
            if (myRole == null && w.getCreatedBy() != null && currentUserId.equals(w.getCreatedBy().getId())) {
                myRole = "LECTURER";
            }
            return WorkspaceResponseDTO.builder()
                    .id(w.getId())
                    .code(w.getCode())
                    .name(w.getName())
                    .description(w.getDescription())
                    .createdById(w.getCreatedBy() != null ? w.getCreatedBy().getId() : null)
                    .createdByName(w.getCreatedBy() != null ? w.getCreatedBy().getFullName() : null)
                    .status(w.getStatus())
                    .memberCount(memberCountMap.getOrDefault(w.getId(), 0L))
                    .assignmentCount(assignmentCountMap.getOrDefault(w.getId(), 0L))
                    .myRoleInWorkspace(myRole)
                    .members(membersByWorkspace.getOrDefault(w.getId(), Collections.emptyList()))
                    .createdAt(w.getCreatedAt())
                    .updatedAt(w.getUpdatedAt())
                    .build();
        }).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public WorkspaceResponseDTO getWorkspaceById(UUID workspaceId) {
        accessPolicyService.requireWorkspaceMember(workspaceId);
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        long memberCount = workspaceMemberRepository.countByWorkspaceId(workspaceId);
        long assignmentCount = assignmentRepository.countByWorkspaceId(workspaceId);

        UUID currentUserId = SecurityUtils.getCurrentUserId();
        String myRole = workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, currentUserId)
                .map(WorkspaceMember::getMemberRole)
                .orElse(null);
        if (myRole == null && workspace.getCreatedBy() != null && currentUserId.equals(workspace.getCreatedBy().getId())) {
            myRole = "LECTURER";
        }

        return WorkspaceResponseDTO.builder()
                .id(workspace.getId())
                .code(workspace.getCode())
                .name(workspace.getName())
                .description(workspace.getDescription())
                .createdById(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getId() : null)
                .createdByName(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getFullName() : null)
                .status(workspace.getStatus())
                .memberCount(memberCount)
                .assignmentCount(assignmentCount)
                .myRoleInWorkspace(myRole)
                .members(loadMemberDtos(workspaceId))
                .createdAt(workspace.getCreatedAt())
                .updatedAt(workspace.getUpdatedAt())
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceResponseDTO updateWorkspace(UUID workspaceId, WorkspaceUpdateRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);

        String previousStatus = workspace.getStatus();
        String requestedStatus = request.getStatus() == null || request.getStatus().isBlank()
                ? previousStatus
                : request.getStatus().trim();

        if (!Objects.equals(previousStatus, requestedStatus)) {
            if ("ACTIVE".equals(requestedStatus)) {
                // Legacy ARCHIVED rows must first become authorable so Lab publication can run.
                if ("ARCHIVED".equals(previousStatus)) {
                    workspace.setStatus("INACTIVE");
                    workspaceRepository.saveAndFlush(workspace);
                }
                courseLifecycleService.activate(workspaceId);
            } else if ("INACTIVE".equals(requestedStatus)) {
                courseLifecycleService.prepareAuthoring(workspaceId);
            }
        }

        workspace.setName(request.getName().trim());
        workspace.setDescription(request.getDescription());
        workspace.setStatus(requestedStatus);
        workspace.setUpdatedAt(OffsetDateTime.now());

        workspace = workspaceRepository.save(workspace);

        long memberCount = workspaceMemberRepository.countByWorkspaceId(workspaceId);
        long assignmentCount = assignmentRepository.countByWorkspaceId(workspaceId);

        OffsetDateTime updatedAt = workspace.getUpdatedAt() != null ? workspace.getUpdatedAt() : OffsetDateTime.now();
        OffsetDateTime createdAt = workspace.getCreatedAt() != null ? workspace.getCreatedAt() : updatedAt;

        return WorkspaceResponseDTO.builder()
                .id(workspace.getId())
                .code(workspace.getCode())
                .name(workspace.getName())
                .description(workspace.getDescription())
                .createdById(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getId() : null)
                .createdByName(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getFullName() : null)
                .status(workspace.getStatus())
                .memberCount(memberCount)
                .assignmentCount(assignmentCount)
                .myRoleInWorkspace("LECTURER")
                .members(loadMemberDtos(workspaceId))
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceResponseDTO archiveWorkspace(UUID workspaceId) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);

        workspace.setStatus("ARCHIVED");
        workspace.setUpdatedAt(OffsetDateTime.now());
        workspace = workspaceRepository.save(workspace);

        long memberCount = workspaceMemberRepository.countByWorkspaceId(workspaceId);
        long assignmentCount = assignmentRepository.countByWorkspaceId(workspaceId);

        OffsetDateTime updatedAt = workspace.getUpdatedAt() != null ? workspace.getUpdatedAt() : OffsetDateTime.now();
        OffsetDateTime createdAt = workspace.getCreatedAt() != null ? workspace.getCreatedAt() : updatedAt;

        return WorkspaceResponseDTO.builder()
                .id(workspace.getId())
                .code(workspace.getCode())
                .name(workspace.getName())
                .description(workspace.getDescription())
                .createdById(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getId() : null)
                .createdByName(workspace.getCreatedBy() != null ? workspace.getCreatedBy().getFullName() : null)
                .status(workspace.getStatus())
                .memberCount(memberCount)
                .assignmentCount(assignmentCount)
                .myRoleInWorkspace("LECTURER")
                .members(loadMemberDtos(workspaceId))
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceMemberResponseDTO addMemberByEmail(UUID workspaceId, AddWorkspaceMemberRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);

        String email = request.getEmail().trim().toLowerCase();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng với email: " + email));

        if (workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, user.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Người dùng đã là thành viên của lớp học này");
        }

        String role = request.getMemberRole() != null && !request.getMemberRole().isBlank()
                ? request.getMemberRole().trim().toUpperCase()
                : "STUDENT";
        if (!"LECTURER".equals(role) && !"STUDENT".equals(role)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Vai trò chỉ có thể là LECTURER hoặc STUDENT");
        }

        OffsetDateTime now = OffsetDateTime.now();
        WorkspaceMember member = WorkspaceMember.builder()
                .workspace(workspace)
                .user(user)
                .memberRole(role)
                .joinedAt(now)
                .build();
        member = workspaceMemberRepository.save(member);
        AuthorizationRequestCache.evictMembership(workspaceId, user.getId());

        log.info("Added member {} ({}) to workspace {}", user.getEmail(), role, workspaceId);

        return WorkspaceMemberResponseDTO.builder()
                .id(member.getId())
                .workspaceId(workspace.getId())
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .avatarUrl(user.getAvatarUrl())
                .globalRole(user.getRole() != null ? user.getRole().getCode() : null)
                .memberRole(member.getMemberRole())
                .joinedAt(member.getJoinedAt() != null ? member.getJoinedAt() : now)
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public BatchAddMembersResponseDTO batchAddStudents(UUID workspaceId, BatchAddMembersRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);

        Set<String> cleanEmails = request.getEmails() == null ? Collections.emptySet() :
                request.getEmails().stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .map(String::toLowerCase)
                        .filter(e -> !e.isBlank())
                        .collect(Collectors.toCollection(LinkedHashSet::new));

        if (cleanEmails.isEmpty()) {
            return BatchAddMembersResponseDTO.builder()
                    .addedCount(0)
                    .addedEmails(Collections.emptyList())
                    .alreadyMemberEmails(Collections.emptyList())
                    .notFoundEmails(Collections.emptyList())
                    .build();
        }

        List<User> foundUsers = userRepository.findByEmailIn(cleanEmails);
        Map<String, User> userByEmail = foundUsers.stream()
                .collect(Collectors.toMap(u -> u.getEmail().toLowerCase(), u -> u, (a, b) -> a));

        Set<UUID> existingMemberUserIds = workspaceMemberRepository.findMemberUserIdsByWorkspaceId(workspaceId);

        List<String> addedEmails = new ArrayList<>();
        List<String> alreadyMemberEmails = new ArrayList<>();
        List<String> notFoundEmails = new ArrayList<>();
        List<WorkspaceMember> newMembers = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now();

        for (String email : cleanEmails) {
            User user = userByEmail.get(email);
            if (user == null) {
                notFoundEmails.add(email);
            } else if (existingMemberUserIds.contains(user.getId())) {
                alreadyMemberEmails.add(email);
            } else {
                addedEmails.add(email);
                newMembers.add(WorkspaceMember.builder()
                        .workspace(workspace)
                        .user(user)
                        .memberRole("STUDENT")
                        .joinedAt(now)
                        .build());
            }
        }

        if (!newMembers.isEmpty()) {
            workspaceMemberRepository.saveAll(newMembers);
            newMembers.forEach(member -> AuthorizationRequestCache.evictMembership(workspaceId, member.getUser().getId()));
        }

        log.info("Batch added {} students to workspace {}", newMembers.size(), workspaceId);

        return BatchAddMembersResponseDTO.builder()
                .addedCount(addedEmails.size())
                .addedEmails(addedEmails)
                .alreadyMemberEmails(alreadyMemberEmails)
                .notFoundEmails(notFoundEmails)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkspaceMemberResponseDTO> getWorkspaceMembers(UUID workspaceId) {
        accessPolicyService.requireWorkspaceMember(workspaceId);
        if (!workspaceRepository.existsById(workspaceId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học");
        }

        return loadMemberDtos(workspaceId);
    }

    private List<WorkspaceMemberResponseDTO> loadMemberDtos(UUID workspaceId) {
        return workspaceMemberRepository.findByWorkspaceIdOrderByJoinedAtAsc(workspaceId).stream()
                .map(m -> toMemberDto(workspaceId, m))
                .toList();
    }

    private WorkspaceMemberResponseDTO toMemberDto(UUID workspaceId, WorkspaceMember m) {
        return WorkspaceMemberResponseDTO.builder()
                .id(m.getId())
                .workspaceId(workspaceId)
                .userId(m.getUser() != null ? m.getUser().getId() : null)
                .email(m.getUser() != null ? m.getUser().getEmail() : null)
                .fullName(m.getUser() != null ? m.getUser().getFullName() : null)
                .avatarUrl(m.getUser() != null ? m.getUser().getAvatarUrl() : null)
                .globalRole(m.getUser() != null && m.getUser().getRole() != null ? m.getUser().getRole().getCode() : null)
                .memberRole(m.getMemberRole())
                .joinedAt(m.getJoinedAt())
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(UUID workspaceId, UUID userId) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);

        if (workspace.getCreatedBy() != null && workspace.getCreatedBy().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Không thể xóa người tạo khỏi lớp học");
        }

        WorkspaceMember member = workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Thành viên không tồn tại trong lớp học"));

        workspaceMemberRepository.delete(member);
        AuthorizationRequestCache.evictMembership(workspaceId, userId);
        log.info("Removed member {} from workspace {}", userId, workspaceId);
    }

    private void validateLecturerOrCreatorPermission(Workspace workspace, UUID currentUserId) {
        User actor = accessPolicyService.requireCurrentActiveUser();
        if (actor != null && actor.getRole()!=null && "SYSTEM_ADMIN".equals(actor.getRole().getCode())) return;
        boolean isCreator = workspace.getCreatedBy() != null && currentUserId.equals(workspace.getCreatedBy().getId());
        if (isCreator) {
            return;
        }

        boolean isLecturer = workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), currentUserId)
                .map(wm -> "LECTURER".equalsIgnoreCase(wm.getMemberRole()))
                .orElse(false);

        if (!isLecturer) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Chỉ Giảng viên của lớp mới có quyền chỉnh sửa Workspace");
        }
    }
}
