package com.mavis.platform.project.service;

import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectResponseDTO;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.dto.SourceSnapshotResponseDTO;

import java.util.List;
import java.util.UUID;

public interface ProjectService {

    ProjectResponseDTO createProject(ProjectCreateRequest request);

    ProjectResponseDTO updateProject(UUID id, ProjectUpdateRequest request);

    ProjectResponseDTO getProjectById(UUID id);

    List<ProjectResponseDTO> getAllProjects();

    void deleteProject(UUID id);

    SourceSnapshotResponseDTO publishSnapshot(UUID projectId, UUID snapshotId);

    List<ProjectResponseDTO> getProjectsByWorkspace(UUID workspaceId);

    List<SourceSnapshotResponseDTO> getPublishedSnapshotsByWorkspace(UUID workspaceId);
}
