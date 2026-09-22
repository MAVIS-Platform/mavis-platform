package com.mavis.platform.project.service.impl;

import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.service.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectServiceImpl implements ProjectService {

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;

    @Override
    public Project createProject(ProjectCreateRequest request) {
        log.info("Creating new project with name: {}", request.getName());
        Project project = new Project();
        project.setName(request.getName());
        project.setDescription(request.getDescription());
        project.setStatus("ACTIVE");

        UUID currentUserId = SecurityUtils.getCurrentUserId();
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.NOT_FOUND,
                        "Không tìm thấy người dùng hiện tại"
                ));

        project.setOwner(currentUser);
        return projectRepository.save(project);
    }

    @Override
    public Project updateProject(UUID id, ProjectUpdateRequest request) {
        log.info("Updating project with ID: {}", id);
        Project project = getProjectById(id);
        project.setName(request.getName());
        project.setDescription(request.getDescription());
        return projectRepository.save(project);
    }

    @Override
    public Project getProjectById(UUID id) {
        log.info("Fetching project with ID: {}", id);
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));
                
        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập dự án này");
        }
        
        return project;
    }

    @Override
    public List<Project> getAllProjects() {
        log.info("Fetching all projects for current user");
        return projectRepository.findByOwnerId(SecurityUtils.getCurrentUserId());
    }

    @Override
    public void deleteProject(UUID id) {
        log.info("Deleting project with ID: {}", id);
        Project project = getProjectById(id); // getProjectById already has the ownership check
        project.setStatus("DELETED");
        projectRepository.save(project);
        log.info("Project with ID: {} has been marked as DELETED", id);
    }
}
