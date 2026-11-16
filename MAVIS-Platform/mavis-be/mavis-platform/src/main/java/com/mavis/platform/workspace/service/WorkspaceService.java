package com.mavis.platform.workspace.service;

import com.mavis.platform.workspace.dto.*;

import java.util.List;
import java.util.UUID;

public interface WorkspaceService {
    WorkspaceResponseDTO createWorkspace(WorkspaceCreateRequest request);
    List<WorkspaceResponseDTO> getMyWorkspaces();
    WorkspaceResponseDTO getWorkspaceById(UUID workspaceId);
    WorkspaceResponseDTO updateWorkspace(UUID workspaceId, WorkspaceUpdateRequest request);
    WorkspaceResponseDTO archiveWorkspace(UUID workspaceId);

    WorkspaceMemberResponseDTO addMemberByEmail(UUID workspaceId, AddWorkspaceMemberRequest request);
    BatchAddMembersResponseDTO batchAddStudents(UUID workspaceId, BatchAddMembersRequest request);
    List<WorkspaceMemberResponseDTO> getWorkspaceMembers(UUID workspaceId);
    void removeMember(UUID workspaceId, UUID userId);
}

