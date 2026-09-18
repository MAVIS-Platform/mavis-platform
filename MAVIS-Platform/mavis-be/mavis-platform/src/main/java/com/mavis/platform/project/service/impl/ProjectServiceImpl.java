package com.mavis.platform.project.service.impl;

import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.UserRepository;
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

        User defaultUser = userRepository.findAll().stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.INTERNAL_SERVER_ERROR,
                        "Hệ thống chưa có user nào để gán làm owner mặc định"
                ));

        project.setOwner(defaultUser);
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
        return projectRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + id));
    }

    @Override
    public List<Project> getAllProjects() {
        log.info("Fetching all projects");
        return projectRepository.findAll();
    }

    @Override
    public void deleteProject(UUID id) {
        log.info("Deleting project with ID: {}", id);
        Project project = getProjectById(id);
        project.setStatus("DELETED");
        projectRepository.save(project);
        log.info("Project with ID: {} has been marked as DELETED", id);
    }
}
