package com.mavis.platform.project.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.Project;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectUpdateRequest;
import com.mavis.platform.project.service.ProjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
@Tag(name = "Project Management", description = "APIs for managing projects in MAVIS")
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    @Operation(summary = "Lấy danh sách tất cả các dự án", description = "Trả về toàn bộ danh sách các dự án trong hệ thống")
    public ApiResponse<List<Project>> getAllProjects() {
        return ApiResponse.success(projectService.getAllProjects());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Lấy thông tin chi tiết dự án", description = "Tìm kiếm và trả về thông tin chi tiết dự án theo ID")
    public ApiResponse<Project> getProjectById(@PathVariable UUID id) {
        return ApiResponse.success(projectService.getProjectById(id));
    }

    @PostMapping
    @Operation(summary = "Tạo mới dự án", description = "Tạo một dự án mới")
    public ApiResponse<Project> createProject(@RequestBody ProjectCreateRequest request) {
        return ApiResponse.success(projectService.createProject(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Cập nhật dự án", description = "Cập nhật thông tin dự án theo ID")
    public ApiResponse<Project> updateProject(@PathVariable UUID id, @RequestBody ProjectUpdateRequest request) {
        return ApiResponse.success(projectService.updateProject(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Xóa dự án", description = "Kiểm tra và xóa dự án khỏi hệ thống theo ID")
    public ApiResponse<Void> deleteProject(@PathVariable UUID id) {
        projectService.deleteProject(id);
        return ApiResponse.success("Xóa dự án thành công", null);
    }
}
