package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.LabPrerequisiteService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class LabPrerequisiteController {

    private final LabPrerequisiteService prerequisites;

    @GetMapping("/api/v1/workspaces/{workspaceId}/lab-prerequisites")
    public ApiResponse<List<LabPrerequisiteService.LabPrerequisite>> list(@PathVariable UUID workspaceId) {
        return ApiResponse.success(prerequisites.list(workspaceId));
    }

    @PutMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/prerequisites")
    public ApiResponse<LabPrerequisiteService.LabPrerequisite> replace(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestBody LabPrerequisiteService.ReplaceRequest request) {
        return ApiResponse.success(prerequisites.replace(workspaceId, assignmentId,
                request == null ? List.of() : request.prerequisiteAssignmentIds()));
    }
}
