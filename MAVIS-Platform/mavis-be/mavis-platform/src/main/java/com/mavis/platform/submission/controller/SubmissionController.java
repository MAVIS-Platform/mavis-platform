package com.mavis.platform.submission.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.submission.dto.*;
import com.mavis.platform.submission.service.FeedbackCommentService;
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
    private final FeedbackCommentService feedbackCommentService;

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

    @GetMapping("/api/v1/submissions/{submissionId}/export")
    @Operation(summary = "Xuất toàn bộ gói bài nộp bất biến (Ticket V11 & T15)",
            description = "Xuất SubmissionExportBundleDTO chứa toàn bộ phiên bản ghim, Mermaid DSL, điểm số và báo cáo tổng hợp Markdown")
    public ApiResponse<com.mavis.platform.submission.dto.SubmissionExportBundleDTO> exportSubmissionBundle(@PathVariable UUID submissionId) {
        com.mavis.platform.submission.dto.SubmissionExportBundleDTO bundle = submissionService.exportSubmissionBundle(submissionId);
        return ApiResponse.success("Xuất gói bài nộp bất biến thành công", bundle);
    }

    @PostMapping("/api/v1/submissions/{submissionId}/feedbacks")
    @Operation(summary = "Giảng viên ghim nhận xét / góp ý chấm bài (BR-63)",
            description = "Ghim nhận xét vào Node (elementId), Edge (relationshipId), hoặc nhận xét chung toàn bài")
    public ApiResponse<FeedbackResponseDTO> addFeedback(
            @PathVariable UUID submissionId,
            @Valid @RequestBody FeedbackCreateRequest request) {
        FeedbackResponseDTO response = feedbackCommentService.addFeedback(submissionId, request);
        return ApiResponse.success("Thêm nhận xét bài nộp thành công", response);
    }

    @GetMapping("/api/v1/submissions/{submissionId}/feedbacks")
    @Operation(summary = "Lấy danh sách nhận xét của bài nộp",
            description = "Tối ưu hóa @EntityGraph nạp toàn bộ nhận xét kèm tên Giảng viên và Node/Edge chỉ trong 1 câu SELECT")
    public ApiResponse<List<FeedbackResponseDTO>> getFeedbacksBySubmission(@PathVariable UUID submissionId) {
        List<FeedbackResponseDTO> feedbacks = feedbackCommentService.getFeedbacksBySubmission(submissionId);
        return ApiResponse.success("Lấy danh sách nhận xét thành công", feedbacks);
    }

    @PutMapping("/api/v1/feedbacks/{feedbackId}")
    @Operation(summary = "Cập nhật nhận xét bài nộp",
            description = "Chỉ cho phép chính Giảng viên đã viết nhận xét thực hiện chỉnh sửa")
    public ApiResponse<FeedbackResponseDTO> updateFeedback(
            @PathVariable UUID feedbackId,
            @Valid @RequestBody FeedbackUpdateRequest request) {
        FeedbackResponseDTO response = feedbackCommentService.updateFeedback(feedbackId, request);
        return ApiResponse.success("Cập nhật nhận xét thành công", response);
    }

    @DeleteMapping("/api/v1/feedbacks/{feedbackId}")
    @Operation(summary = "Xóa nhận xét bài nộp",
            description = "Chỉ cho phép chính Giảng viên đã viết nhận xét thực hiện xóa")
    public ApiResponse<Void> deleteFeedback(@PathVariable UUID feedbackId) {
        feedbackCommentService.deleteFeedback(feedbackId);
        return ApiResponse.success("Xóa nhận xét thành công", null);
    }
}

