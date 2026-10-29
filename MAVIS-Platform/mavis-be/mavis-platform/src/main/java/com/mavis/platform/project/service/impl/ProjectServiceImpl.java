package com.mavis.platform.project.service.impl;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectResponseDTO;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.dto.SourceSnapshotResponseDTO;
import com.mavis.platform.project.service.ProjectService;
import com.mavis.common.utils.GitHubRepositoryUrls;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectServiceImpl implements ProjectService {

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final WorkspaceRepository workspaceRepository;
    private final AssignmentRepository assignmentRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;
    private final com.mavis.platform.project.service.ProjectResourceDeletionService resourceDeletion;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectResponseDTO createProject(ProjectCreateRequest request) {
        log.info("Creating new project with name: {}", request.getName());

        User currentUser = accessPolicyService.requireCurrentActiveUser();

        Workspace workspace = null;
        if (request.getWorkspaceId() != null) {
            accessPolicyService.requireWorkspaceMember(request.getWorkspaceId());
            workspace = workspaceRepository.findById(request.getWorkspaceId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "Không tìm thấy Workspace với ID: " + request.getWorkspaceId()));
        }

        Assignment assignment = null;
        if (request.getAssignmentId() != null) {
            assignment = assignmentRepository.findById(request.getAssignmentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "Không tìm thấy Assignment với ID: " + request.getAssignmentId()));
        }

        String projectType = request.getProjectType();
        if (projectType == null || projectType.isBlank()) {
            projectType = (workspace == null) ? "PERSONAL" : "STUDENT_WORKING";
        } else {
            projectType = projectType.trim().toUpperCase();
            if (!List.of("PERSONAL", "TEACHER_REFERENCE", "STUDENT_WORKING").contains(projectType)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Loại dự án không hợp lệ: " + projectType + ". Cho phép: PERSONAL, TEACHER_REFERENCE, STUDENT_WORKING");
            }
        }

        boolean isReferenceTemplate = Boolean.TRUE.equals(request.getIsReferenceTemplate())
                || "TEACHER_REFERENCE".equalsIgnoreCase(projectType);

        SourceSnapshot refSnapshot = null;
        if (request.getReferenceSnapshotId() != null) {
            refSnapshot = sourceSnapshotRepository.findById(request.getReferenceSnapshotId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "Không tìm thấy bản chụp mã nguồn mẫu với ID: " + request.getReferenceSnapshotId()));

            if (!Boolean.TRUE.equals(refSnapshot.getIsPublished())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Bản chụp mã nguồn mẫu chưa được Giảng viên công bố (BR-11)");
            }
        }

        OffsetDateTime now = OffsetDateTime.now();
        Project project = Project.builder()
                .name(request.getName().trim())
                .description(request.getDescription())
                .repositoryUrl(GitHubRepositoryUrls.normalize(request.getRepositoryUrl()))
                .defaultBranch(request.getDefaultBranch() != null && !request.getDefaultBranch().isBlank()
                        ? request.getDefaultBranch().trim() : "main")
                .workspace(workspace)
                .assignment(assignment)
                .owner(currentUser)
                .projectType(projectType)
                .isReferenceTemplate(isReferenceTemplate)
                .referenceSnapshotId(request.getReferenceSnapshotId())
                .status("ACTIVE")
                .createdAt(now)
                .updatedAt(now)
                .build();

        Project savedProject = projectRepository.save(project);

        if (refSnapshot != null) {
            SourceSnapshot studentSnapshot = SourceSnapshot.builder()
                    .project(savedProject)
                    .sourceType(refSnapshot.getSourceType())
                    .branchName(refSnapshot.getBranchName() != null ? refSnapshot.getBranchName() : savedProject.getDefaultBranch())
                    .commitSha(refSnapshot.getCommitSha())
                    .artifactHash(refSnapshot.getArtifactHash())
                    .storagePath(refSnapshot.getStoragePath())
                    .isPublished(false)
                    .createdBy(currentUser)
                    .createdAt(now)
                    .build();
            sourceSnapshotRepository.save(studentSnapshot);
            log.info("Cloned reference snapshot {} into new student snapshot for project {}",
                    refSnapshot.getId(), savedProject.getId());
        }

        log.info("Project created: id={}, name={}, projectType={}",
                savedProject.getId(), savedProject.getName(), savedProject.getProjectType());
        return toDTO(savedProject);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SourceSnapshotResponseDTO publishSnapshot(UUID projectId, UUID snapshotId) {
        log.info("Publishing snapshot {} for project {}", snapshotId, projectId);
        UUID currentUserId = SecurityUtils.getCurrentUserId();

        Project project = projectRepository.findLockedById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));

        if("DELETED".equalsIgnoreCase(project.getStatus()))throw new BusinessException(ErrorCode.NOT_FOUND,"Project not found");
        validateProjectOwnershipOrLecturer(project, currentUserId);
        if(project.getWorkspace()==null) throw new BusinessException(ErrorCode.FORBIDDEN,"A teaching workspace is required to publish references");
        accessPolicyService.requireWorkspaceLecturer(project.getWorkspace().getId());

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "Không tìm thấy bản chụp mã nguồn với ID: " + snapshotId));

        if (snapshot.getProject() == null || !snapshot.getProject().getId().equals(projectId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Bản chụp mã nguồn không thuộc về dự án được chỉ định");
        }

        snapshot.setIsPublished(true);
        SourceSnapshot savedSnapshot = sourceSnapshotRepository.save(snapshot);

        project.setIsReferenceTemplate(true);
        project.setUpdatedAt(OffsetDateTime.now());
        projectRepository.save(project);

        log.info("Snapshot {} published and project {} marked as reference template (BR-12)", snapshotId, projectId);
        return toSnapshotDTO(savedSnapshot);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProjectResponseDTO> getProjectsByWorkspace(UUID workspaceId) {
        accessPolicyService.requireWorkspaceMember(workspaceId);
        log.info("Fetching projects for workspace {}", workspaceId);
        workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Workspace với ID: " + workspaceId));

        List<Project> projects = projectRepository.findByWorkspaceIdAndStatusNotOrderByCreatedAtDesc(workspaceId, "DELETED");
        return projects.stream()
                .filter(accessPolicyService::canReadProject)
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SourceSnapshotResponseDTO> getPublishedSnapshotsByWorkspace(UUID workspaceId) {
        accessPolicyService.requireWorkspaceMember(workspaceId);
        log.info("Fetching published reference snapshots for workspace {}", workspaceId);
        workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Workspace với ID: " + workspaceId));

        List<SourceSnapshot> snapshots = sourceSnapshotRepository.findPublishedByWorkspaceId(workspaceId);
        return snapshots.stream()
                .map(this::toSnapshotDTO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectResponseDTO updateProject(UUID id, ProjectUpdateRequest request) {
        log.info("Updating project with ID: {}", id);
        Project project = projectRepository.findLockedById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));

        accessPolicyService.requireProjectWriteAccess(project);

        if (request.getName() != null && !request.getName().isBlank()) {
            project.setName(request.getName().trim());
        }
        if (request.getDescription() != null) {
            project.setDescription(request.getDescription());
        }
        if (request.getRepositoryUrl() != null) {
            project.setRepositoryUrl(GitHubRepositoryUrls.requireSame(project.getRepositoryUrl(), request.getRepositoryUrl()));
        }
        if (request.getDefaultBranch() != null) {
            project.setDefaultBranch(request.getDefaultBranch().trim());
        }
        if (request.getStatus() != null && !request.getStatus().isBlank()) {
            project.setStatus(request.getStatus().trim());
        }
        project.setUpdatedAt(OffsetDateTime.now());

        Project saved = projectRepository.save(project);
        return toDTO(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectResponseDTO getProjectById(UUID id) {
        log.info("Fetching project with ID: {}", id);
        Project project = projectRepository.findWithDetailsById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));

        accessPolicyService.requireProjectReadAccess(project);

        return toDTO(project);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProjectResponseDTO> getAllProjects() {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        log.info("Fetching all projects for user: {}", currentUserId);

        List<Project> projects = projectRepository.findByOwnerIdOrderByCreatedAtDesc(currentUserId);
        return projects.stream()
                .filter(p -> p.getStatus() == null || !"DELETED".equalsIgnoreCase(p.getStatus()))
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteProject(UUID id) {
        resourceDeletion.deleteProject(id);
    }

    private void validateProjectOwnershipOrLecturer(Project project, UUID currentUserId) {
        boolean isOwner = project.getOwner() != null && currentUserId.equals(project.getOwner().getId());
        if (isOwner) {
            return;
        }

        if (project.getWorkspace() != null) {
            Workspace workspace = project.getWorkspace();
            boolean isCreator = workspace.getCreatedBy() != null && currentUserId.equals(workspace.getCreatedBy().getId());
            if (isCreator) {
                return;
            }

            boolean isLecturer = workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), currentUserId)
                    .map(wm -> "LECTURER".equalsIgnoreCase(wm.getMemberRole()))
                    .orElse(false);
            if (isLecturer) {
                return;
            }
        }

        throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền công bố bản chụp mã nguồn của dự án này");
    }

    private ProjectResponseDTO toDTO(Project project) {
        if (project == null) {
            return null;
        }
        OffsetDateTime updatedAt = project.getUpdatedAt() != null ? project.getUpdatedAt() : OffsetDateTime.now();
        OffsetDateTime createdAt = project.getCreatedAt() != null ? project.getCreatedAt() : updatedAt;

        return ProjectResponseDTO.builder()
                .id(project.getId())
                .workspaceId(project.getWorkspace() != null ? project.getWorkspace().getId() : null)
                .workspaceName(project.getWorkspace() != null ? project.getWorkspace().getName() : null)
                .assignmentId(project.getAssignment() != null ? project.getAssignment().getId() : null)
                .assignmentTitle(project.getAssignment() != null ? project.getAssignment().getTitle() : null)
                .ownerId(project.getOwner() != null ? project.getOwner().getId() : null)
                .ownerName(project.getOwner() != null ? project.getOwner().getFullName() : null)
                .ownerEmail(project.getOwner() != null ? project.getOwner().getEmail() : null)
                .name(project.getName())
                .description(project.getDescription())
                .repositoryUrl(project.getRepositoryUrl())
                .defaultBranch(project.getDefaultBranch())
                .projectType(project.getProjectType())
                .isReferenceTemplate(project.getIsReferenceTemplate())
                .referenceSnapshotId(project.getReferenceSnapshotId())
                .status(project.getStatus())
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }

    private SourceSnapshotResponseDTO toSnapshotDTO(SourceSnapshot snapshot) {
        if (snapshot == null) {
            return null;
        }
        return SourceSnapshotResponseDTO.builder()
                .id(snapshot.getId())
                .projectId(snapshot.getProject() != null ? snapshot.getProject().getId() : null)
                .projectName(snapshot.getProject() != null ? snapshot.getProject().getName() : null)
                .sourceType(snapshot.getSourceType())
                .branchName(snapshot.getBranchName())
                .commitSha(snapshot.getCommitSha())
                .artifactHash(snapshot.getArtifactHash())
                .storagePath(snapshot.getStoragePath())
                .isPublished(snapshot.getIsPublished())
                .createdByName(snapshot.getCreatedBy() != null ? snapshot.getCreatedBy().getFullName() : null)
                .createdAt(snapshot.getCreatedAt() != null ? snapshot.getCreatedAt() : OffsetDateTime.now())
                .build();
    }
}
