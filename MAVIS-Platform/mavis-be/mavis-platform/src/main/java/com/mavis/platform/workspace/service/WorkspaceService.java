package com.mavis.platform.workspace.service;

import com.mavis.platform.workspace.dto.WorkspaceCreateRequest;
import com.mavis.platform.workspace.dto.WorkspaceResponseDTO;
import com.mavis.platform.workspace.dto.WorkspaceUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface WorkspaceService {
    WorkspaceResponseDTO createWorkspace(WorkspaceCreateRequest request);
    List<WorkspaceResponseDTO> getMyWorkspaces();
    WorkspaceResponseDTO getWorkspaceById(UUID workspaceId);
    WorkspaceResponseDTO updateWorkspace(UUID workspaceId, WorkspaceUpdateRequest request);
    WorkspaceResponseDTO archiveWorkspace(UUID workspaceId);
}
