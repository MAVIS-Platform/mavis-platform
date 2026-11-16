package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.dto.*;
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

    @GetMapping("/{workspaceId}/members")
    @Operation(summary = "Lấy danh sách thành viên của lớp học", description = "Trả về danh sách tất cả thành viên trong workspace")
    public ApiResponse<List<WorkspaceMemberResponseDTO>> getWorkspaceMembers(@PathVariable UUID workspaceId) {
        return ApiResponse.success(workspaceService.getWorkspaceMembers(workspaceId));
    }

    @PostMapping("/{workspaceId}/members")
    @Operation(summary = "Thêm thành viên vào lớp học bằng email", description = "Thêm một thành viên mới (LECTURER hoặc STUDENT) vào workspace")
    public ApiResponse<WorkspaceMemberResponseDTO> addMember(@PathVariable UUID workspaceId, @Valid @RequestBody AddWorkspaceMemberRequest request) {
        return ApiResponse.success(workspaceService.addMemberByEmail(workspaceId, request));
    }

    @PostMapping("/{workspaceId}/members/batch")
    @Operation(summary = "Thêm sinh viên hàng loạt bằng danh sách email", description = "Thêm danh sách sinh viên vào lớp học tối ưu batch không N+1")
    public ApiResponse<BatchAddMembersResponseDTO> batchAddStudents(@PathVariable UUID workspaceId, @Valid @RequestBody BatchAddMembersRequest request) {
        return ApiResponse.success(workspaceService.batchAddStudents(workspaceId, request));
    }

    @DeleteMapping("/{workspaceId}/members/{userId}")
    @Operation(summary = "Xóa thành viên khỏi lớp học", description = "Xóa một thành viên khỏi workspace (không thể xóa người tạo lớp)")
    public ApiResponse<Void> removeMember(@PathVariable UUID workspaceId, @PathVariable UUID userId) {
        workspaceService.removeMember(workspaceId, userId);
        return ApiResponse.success("Xóa thành viên khỏi lớp học thành công", null);
    }
}
