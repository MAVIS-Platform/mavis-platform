package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseLabTransferService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/course-labs")
@RequiredArgsConstructor
public class CourseLabTransferController {

    private final CourseLabTransferService transfer;

    @GetMapping("/{assignmentId}/export")
    public ApiResponse<CourseLabTransferService.Bundle> exportLab(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId) {
        return ApiResponse.success(transfer.exportLab(workspaceId, assignmentId));
    }

    @PostMapping("/import")
    public ApiResponse<CourseLabTransferService.ImportResult> importLab(
            @PathVariable UUID workspaceId,
            @RequestBody CourseLabTransferService.Bundle bundle) {
        return ApiResponse.success(transfer.importLab(workspaceId, bundle));
    }
}
