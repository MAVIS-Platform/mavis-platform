package com.mavis.platform.project.service;

import com.mavis.common.entity.Project;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface ProjectService {

    Project createProject(ProjectCreateRequest request);

    Project updateProject(UUID id, ProjectUpdateRequest request);

    Project getProjectById(UUID id);

    List<Project> getAllProjects();

    void deleteProject(UUID id);
}
