package com.mavis.platform.assignment.service;

import com.mavis.platform.assignment.dto.AssignmentCreateRequest;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.dto.AssignmentUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface AssignmentService {
    AssignmentResponseDTO createAssignment(UUID workspaceId, AssignmentCreateRequest request);
    List<AssignmentResponseDTO> getAssignmentsByWorkspace(UUID workspaceId);
    AssignmentResponseDTO getAssignmentById(UUID assignmentId);
    AssignmentResponseDTO updateAssignment(UUID assignmentId, AssignmentUpdateRequest request);
    org.springframework.core.io.Resource downloadReferenceSource(UUID assignmentId);
    void deleteAssignment(UUID assignmentId);
}
