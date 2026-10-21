package com.mavis.platform.project.service.impl;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectResponseDTO;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.service.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectResponseDTO createProject(ProjectCreateRequest request) {
        log.info("Creating new project with name: {}", request.getName());

        UUID currentUserId = SecurityUtils.getCurrentUserId();
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.NOT_FOUND,
                        "Không tìm thấy người dùng hiện tại"
                ));

        Workspace workspace = null;
        if (request.getWorkspaceId() != null) {
            workspace = workspaceRepository.findById(request.getWorkspaceId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Workspace với ID: " + request.getWorkspaceId()));
        }

        Assignment assignment = null;
        if (request.getAssignmentId() != null) {
            assignment = assignmentRepository.findById(request.getAssignmentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Assignment với ID: " + request.getAssignmentId()));
        }

        String projectType = request.getProjectType();
        if (workspace == null || projectType == null || projectType.isBlank()) {
            projectType = "PERSONAL";
        }

        Project project = Project.builder()
                .name(request.getName())
                .description(request.getDescription())
                .repositoryUrl(request.getRepositoryUrl())
                .defaultBranch(request.getDefaultBranch() != null ? request.getDefaultBranch() : "main")
                .workspace(workspace)
                .assignment(assignment)
                .owner(currentUser)
                .projectType(projectType)
                .isReferenceTemplate(false)
                .status("ACTIVE")
                .build();

        Project saved = projectRepository.save(project);
        return toDTO(saved);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectResponseDTO updateProject(UUID id, ProjectUpdateRequest request) {
        log.info("Updating project with ID: {}", id);
        Project project = projectRepository.findWithDetailsById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền chỉnh sửa dự án này");
        }

        if (request.getName() != null && !request.getName().isBlank()) {
            project.setName(request.getName());
        }
        if (request.getDescription() != null) {
            project.setDescription(request.getDescription());
        }
        if (request.getRepositoryUrl() != null) {
            project.setRepositoryUrl(request.getRepositoryUrl());
        }
        if (request.getDefaultBranch() != null) {
            project.setDefaultBranch(request.getDefaultBranch());
        }
        if (request.getStatus() != null && !request.getStatus().isBlank()) {
            project.setStatus(request.getStatus());
        }

        Project saved = projectRepository.save(project);
        return toDTO(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectResponseDTO getProjectById(UUID id) {
        log.info("Fetching project with ID: {}", id);
        Project project = projectRepository.findWithDetailsById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập dự án này");
        }

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
        log.info("Deleting project with ID: {}", id);
        Project project = projectRepository.findWithDetailsById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền xóa dự án này");
        }

        project.setStatus("DELETED");
        projectRepository.save(project);
        log.info("Project with ID: {} has been marked as DELETED", id);
    }

    private ProjectResponseDTO toDTO(Project project) {
        if (project == null) {
            return null;
        }
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
                .createdAt(project.getCreatedAt())
                .updatedAt(project.getUpdatedAt())
                .build();
    }
}
