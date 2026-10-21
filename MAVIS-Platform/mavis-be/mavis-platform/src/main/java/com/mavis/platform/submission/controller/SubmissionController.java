package com.mavis.platform.submission.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import com.mavis.platform.submission.service.SubmissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Submission Management", description = "APIs for submitting assignments, viewing immutable submission snapshots, and teacher evaluation")
public class SubmissionController {

    private final SubmissionService submissionService;

    @PostMapping("/api/v1/submissions")
    @Operation(summary = "Nộp bài tập kiến trúc bất biến (Submission Snapshot)",
            description = "Đóng gói toàn bộ SourceSnapshot, ModelVersion, DiagramVersion, EvaluationRun và RuntimeSession thành bản ghi nộp bài")
    public ApiResponse<SubmissionResponseDTO> submitAssignment(@Valid @RequestBody SubmissionCreateRequest request) {
        SubmissionResponseDTO response = submissionService.submitAssignment(request);
        return ApiResponse.success("Nộp bài tập thành công", response);
    }

    @GetMapping("/api/v1/assignments/{assignmentId}/submissions")
    @Operation(summary = "Lấy danh sách bài nộp của một đề bài (Giảng viên chấm bài)",
            description = "Tối ưu hóa 8-way EntityGraph để nạp toàn bộ danh sách bài nộp của lớp học chỉ với 1 câu query duy nhất")
    public ApiResponse<List<SubmissionResponseDTO>> getSubmissionsByAssignment(@PathVariable UUID assignmentId) {
        List<SubmissionResponseDTO> submissions = submissionService.getSubmissionsByAssignment(assignmentId);
        return ApiResponse.success("Lấy danh sách bài nộp thành công", submissions);
    }

    @GetMapping("/api/v1/projects/{projectId}/submissions")
    @Operation(summary = "Lấy lịch sử các lần nộp bài của một đồ án",
            description = "Xem lịch sử nộp bài tập kiến trúc theo đồ án sinh viên")
    public ApiResponse<List<SubmissionResponseDTO>> getSubmissionsByProject(@PathVariable UUID projectId) {
        List<SubmissionResponseDTO> submissions = submissionService.getSubmissionsByProject(projectId);
        return ApiResponse.success("Lấy lịch sử nộp bài của dự án thành công", submissions);
    }

    @GetMapping("/api/v1/submissions/{submissionId}")
    @Operation(summary = "Lấy chi tiết một bài nộp bất biến",
            description = "Xem chi tiết gói bài nộp bao gồm điểm tuân thủ kiến trúc và trạng thái kịch bản runtime")
    public ApiResponse<SubmissionResponseDTO> getSubmissionById(@PathVariable UUID submissionId) {
        SubmissionResponseDTO submission = submissionService.getSubmissionById(submissionId);
        return ApiResponse.success("Lấy chi tiết bài nộp thành công", submission);
    }
}
