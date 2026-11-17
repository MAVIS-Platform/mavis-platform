package com.mavis.platform.submission.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.submission.service.impl.WorkspaceGradebookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Workspace Gradebook", description = "Aggregated class gradebook matrix for lecturers")
public class WorkspaceGradebookController {

    private final WorkspaceGradebookService gradebookService;

    public WorkspaceGradebookController(WorkspaceGradebookService gradebookService) {
        this.gradebookService = gradebookService;
    }

    @GetMapping("/workspaces/{workspaceId}/gradebook")
    @Operation(summary = "Lấy ma trận bảng điểm tổng hợp toàn lớp học")
    public ApiResponse<WorkspaceGradebookService.WorkspaceGradebookDTO> getWorkspaceGradebook(
            @PathVariable UUID workspaceId) {
        return ApiResponse.success("Lấy bảng điểm lớp học thành công", gradebookService.gradebook(workspaceId));
    }
}
