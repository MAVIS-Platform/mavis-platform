package com.mavis.analyzer.orchestrator.controller;

import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.analyzer.orchestrator.service.JobService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Job Management", description = "APIs for tracking static analysis jobs")
public class JobController {

    private final JobService jobService;

    @GetMapping("/jobs/{jobId}")
    @Operation(summary = "Xem trạng thái tiến trình phân tích", description = "Lấy thông tin trạng thái, resultManifest và errorDiagnostics của một Job")
    public ApiResponse<JobResponseDTO> getJobById(@PathVariable UUID jobId) {
        JobResponseDTO response = jobService.getJobById(jobId);
        return ApiResponse.success("Lấy thông tin tiến trình thành công", response);
    }

    @GetMapping("/projects/{projectId}/jobs")
    @Operation(summary = "Xem lịch sử các tiến trình phân tích của dự án", description = "Lấy danh sách các jobs của dự án sắp xếp theo thời gian bắt đầu mới nhất")
    public ApiResponse<List<JobResponseDTO>> getJobsByProjectId(@PathVariable UUID projectId) {
        List<JobResponseDTO> response = jobService.getJobsByProjectId(projectId);
        return ApiResponse.success("Lấy danh sách tiến trình thành công", response);
    }
}
