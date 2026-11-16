package com.mavis.analyzer.evaluation.controller;

import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.dto.EvaluationRunResponseDTO;
import com.mavis.analyzer.evaluation.service.ArchitectureEvaluationService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Architecture Evaluation", description = "APIs for automated architecture rule evaluation, compliance scoring, and findings retrieval")
public class EvaluationController {

    private final ArchitectureEvaluationService architectureEvaluationService;

    @PostMapping("/models/{modelVersionId}/evaluate")
    @Operation(summary = "Đánh giá 5 quy tắc kiến trúc tự động cho một ModelVersion",
            description = "Nạp dữ liệu lên RAM trong 3 query, kiểm tra 5 quy tắc kiến trúc và lưu toàn bộ findings bằng saveAll() theo lô")
    public ApiResponse<EvaluationRunResponseDTO> evaluateModel(
            @PathVariable UUID modelVersionId,
            @RequestParam(required = false, defaultValue = "1.0") String ruleSetVersion) {
        EvaluationRunResponseDTO result = architectureEvaluationService.evaluateModel(modelVersionId, ruleSetVersion);
        return ApiResponse.success("Đánh giá quy tắc kiến trúc thành công", result);
    }

    @GetMapping("/models/{modelVersionId}/evaluations")
    @Operation(summary = "Lấy lịch sử các lượt đánh giá của một ModelVersion",
            description = "Trả về danh sách EvaluationRunResponseDTO sắp xếp theo thời gian mới nhất (createdAt DESC)")
    public ApiResponse<List<EvaluationRunResponseDTO>> getEvaluationsByModelVersion(
            @PathVariable UUID modelVersionId) {
        List<EvaluationRunResponseDTO> runs = architectureEvaluationService.getEvaluationsByModelVersion(modelVersionId);
        return ApiResponse.success("Lấy lịch sử đánh giá thành công", runs);
    }

    @GetMapping("/evaluations/{evaluationRunId}/findings")
    @Operation(summary = "Lấy chi tiết danh sách phát hiện (findings) của một lượt đánh giá",
            description = "Truy xuất danh sách EvaluationFindingResponseDTO với @EntityGraph tối ưu")
    public ApiResponse<List<EvaluationFindingResponseDTO>> getFindingsByEvaluationRun(
            @PathVariable UUID evaluationRunId) {
        List<EvaluationFindingResponseDTO> findings = architectureEvaluationService.getFindingsByEvaluationRunId(evaluationRunId);
        return ApiResponse.success("Lấy danh sách phát hiện quy tắc thành công", findings);
    }

    @GetMapping("/evaluations/{evaluationRunId}")
    @Operation(summary = "Lấy thông tin chi tiết một lượt đánh giá",
            description = "Bao gồm summaryMetrics, complianceScore và danh sách findings")
    public ApiResponse<EvaluationRunResponseDTO> getEvaluationRunById(
            @PathVariable UUID evaluationRunId) {
        EvaluationRunResponseDTO run = architectureEvaluationService.getEvaluationRunById(evaluationRunId);
        return ApiResponse.success("Lấy chi tiết lượt đánh giá thành công", run);
    }
}
