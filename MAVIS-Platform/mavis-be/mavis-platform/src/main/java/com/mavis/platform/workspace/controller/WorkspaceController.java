package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.dto.WorkspaceCreateRequest;
import com.mavis.platform.workspace.dto.WorkspaceResponseDTO;
import com.mavis.platform.workspace.dto.WorkspaceUpdateRequest;
import com.mavis.platform.workspace.service.WorkspaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces")
@RequiredArgsConstructor
@Tag(name = "Workspace Management", description = "APIs for managing workspaces (classes) in MAVIS")
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    @PostMapping
    @Operation(summary = "Tạo mới lớp học (Workspace)", description = "Tạo một workspace mới và tự động gán người tạo làm LECTURER")
    public ApiResponse<WorkspaceResponseDTO> createWorkspace(@Valid @RequestBody WorkspaceCreateRequest request) {
        return ApiResponse.success(workspaceService.createWorkspace(request));
    }

    @GetMapping
    @Operation(summary = "Lấy danh sách lớp học của tôi", description = "Trả về danh sách các workspace mà người dùng là người tạo hoặc thành viên")
    public ApiResponse<List<WorkspaceResponseDTO>> getMyWorkspaces() {
        return ApiResponse.success(workspaceService.getMyWorkspaces());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Lấy chi tiết lớp học", description = "Trả về thông tin chi tiết của một workspace theo ID")
    public ApiResponse<WorkspaceResponseDTO> getWorkspaceById(@PathVariable UUID id) {
        return ApiResponse.success(workspaceService.getWorkspaceById(id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Cập nhật thông tin lớp học", description = "Chỉ giảng viên hoặc người tạo mới có quyền cập nhật thông tin workspace")
    public ApiResponse<WorkspaceResponseDTO> updateWorkspace(@PathVariable UUID id, @Valid @RequestBody WorkspaceUpdateRequest request) {
        return ApiResponse.success(workspaceService.updateWorkspace(id, request));
    }

    @PatchMapping("/{id}/archive")
    @Operation(summary = "Lưu trữ lớp học", description = "Đổi trạng thái workspace thành ARCHIVED")
    public ApiResponse<WorkspaceResponseDTO> archiveWorkspace(@PathVariable UUID id) {
        return ApiResponse.success(workspaceService.archiveWorkspace(id));
    }
}
