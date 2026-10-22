package com.mavis.platform.project.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectResponseDTO;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.dto.SourceSnapshotResponseDTO;
import com.mavis.platform.project.service.ProjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Project Management", description = "APIs for managing projects and reference snapshots in MAVIS")
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping("/api/v1/projects")
    @Operation(summary = "Lấy danh sách tất cả các dự án", description = "Trả về toàn bộ danh sách các dự án của người dùng hiện tại")
    public ApiResponse<List<ProjectResponseDTO>> getAllProjects() {
        return ApiResponse.success(projectService.getAllProjects());
    }

    @GetMapping("/api/v1/projects/{id}")
    @Operation(summary = "Lấy thông tin chi tiết dự án", description = "Tìm kiếm và trả về thông tin chi tiết dự án theo ID")
    public ApiResponse<ProjectResponseDTO> getProjectById(@PathVariable UUID id) {
        return ApiResponse.success(projectService.getProjectById(id));
    }

    @PostMapping("/api/v1/projects")
    @Operation(summary = "Tạo mới dự án", description = "Tạo một dự án mới (PERSONAL, TEACHER_REFERENCE, hoặc STUDENT_WORKING)")
    public ApiResponse<ProjectResponseDTO> createProject(@Valid @RequestBody ProjectCreateRequest request) {
        return ApiResponse.success(projectService.createProject(request));
    }

    @PutMapping("/api/v1/projects/{id}")
    @Operation(summary = "Cập nhật dự án", description = "Cập nhật thông tin dự án theo ID")
    public ApiResponse<ProjectResponseDTO> updateProject(@PathVariable UUID id, @Valid @RequestBody ProjectUpdateRequest request) {
        return ApiResponse.success(projectService.updateProject(id, request));
    }

    @DeleteMapping("/api/v1/projects/{id}")
    @Operation(summary = "Xóa dự án", description = "Kiểm tra và xóa dự án khỏi hệ thống theo ID")
    public ApiResponse<Void> deleteProject(@PathVariable UUID id) {
        projectService.deleteProject(id);
        return ApiResponse.success("Xóa dự án thành công", null);
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/projects")
    @Operation(summary = "Lấy danh sách dự án trong lớp học", description = "Trả về danh sách tất cả các dự án trong workspace")
    public ApiResponse<List<ProjectResponseDTO>> getProjectsByWorkspace(@PathVariable UUID workspaceId) {
        return ApiResponse.success(projectService.getProjectsByWorkspace(workspaceId));
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/reference-snapshots")
    @Operation(summary = "Lấy danh sách bản chụp mẫu đã công bố", description = "Trả về danh sách bản chụp mã nguồn mẫu đã được Giảng viên công bố trong workspace")
    public ApiResponse<List<SourceSnapshotResponseDTO>> getPublishedSnapshotsByWorkspace(@PathVariable UUID workspaceId) {
        return ApiResponse.success(projectService.getPublishedSnapshotsByWorkspace(workspaceId));
    }

    @PatchMapping("/api/v1/projects/{projectId}/snapshots/{snapshotId}/publish")
    @Operation(summary = "Công bố bản chụp mã nguồn mẫu", description = "Giảng viên công bố bản chụp mã nguồn mẫu cho sinh viên kế thừa (BR-12)")
    public ApiResponse<SourceSnapshotResponseDTO> publishSnapshot(
            @PathVariable UUID projectId,
            @PathVariable UUID snapshotId) {
        return ApiResponse.success("Công bố bản chụp mã nguồn mẫu thành công", projectService.publishSnapshot(projectId, snapshotId));
    }
}
