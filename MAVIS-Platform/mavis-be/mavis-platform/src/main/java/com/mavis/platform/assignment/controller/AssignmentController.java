package com.mavis.platform.assignment.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.assignment.dto.AssignmentCreateRequest;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.dto.AssignmentUpdateRequest;
import com.mavis.platform.assignment.service.AssignmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Assignment Management", description = "APIs for managing architectural assignments in MAVIS")
public class AssignmentController {

    private final AssignmentService assignmentService;

    @PostMapping("/api/v1/workspaces/{workspaceId}/assignments")
    @Operation(summary = "Tạo đề bài tập mới trong lớp học", description = "Giảng viên tạo bài tập kiến trúc mới trong workspace")
    public ApiResponse<AssignmentResponseDTO> createAssignment(
            @PathVariable UUID workspaceId,
            @Valid @RequestBody AssignmentCreateRequest request) {
        return ApiResponse.success(assignmentService.createAssignment(workspaceId, request));
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/assignments")
    @Operation(summary = "Lấy danh sách đề bài tập trong lớp học", description = "Trả về tất cả đề bài tập thuộc về một workspace")
    public ApiResponse<List<AssignmentResponseDTO>> getAssignmentsByWorkspace(@PathVariable UUID workspaceId) {
        return ApiResponse.success(assignmentService.getAssignmentsByWorkspace(workspaceId));
    }

    @GetMapping("/api/v1/assignments/{assignmentId}")
    @Operation(summary = "Lấy chi tiết đề bài tập", description = "Xem thông tin chi tiết của một đề bài tập theo ID")
    public ApiResponse<AssignmentResponseDTO> getAssignmentById(@PathVariable UUID assignmentId) {
        return ApiResponse.success(assignmentService.getAssignmentById(assignmentId));
    }

    @PutMapping("/api/v1/assignments/{assignmentId}")
    @Operation(summary = "Cập nhật đề bài tập", description = "Chỉnh sửa thông tin đề bài tập")
    public ApiResponse<AssignmentResponseDTO> updateAssignment(
            @PathVariable UUID assignmentId,
            @Valid @RequestBody AssignmentUpdateRequest request) {
        return ApiResponse.success(assignmentService.updateAssignment(assignmentId, request));
    }

    @DeleteMapping("/api/v1/assignments/{assignmentId}")
    @Operation(summary = "Xóa đề bài tập", description = "Xóa đề bài tập (chặn nếu đã có sinh viên nộp bài theo BR-14)")
    public ApiResponse<Void> deleteAssignment(@PathVariable UUID assignmentId) {
        assignmentService.deleteAssignment(assignmentId);
        return ApiResponse.success("Xóa đề bài tập thành công", null);
    }
}
