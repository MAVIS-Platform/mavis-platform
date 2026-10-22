package com.mavis.analyzer.evaluation.service;

import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.dto.EvaluationRunResponseDTO;

import java.util.List;
import java.util.UUID;

public interface ArchitectureEvaluationService {

    /**
     * Chấm 5 quy tắc kiến trúc tự động cho một modelVersionId.
     * Nạp toàn bộ Elements, Relationships, Evidences lên RAM trong 3 câu query đầu tiên,
     * kiểm tra 5 quy tắc trên RAM và lưu findings bằng một lệnh saveAll() duy nhất.
     *
     * @param modelVersionId ID của phiên bản mô hình cần đánh giá
     * @param ruleSetVersion Phiên bản bộ quy tắc (mặc định "1.0")
     * @return EvaluationRunResponseDTO chứa điểm số, summaryMetrics và danh sách findings
     */
    EvaluationRunResponseDTO evaluateModel(UUID modelVersionId, String ruleSetVersion);

    default EvaluationRunResponseDTO evaluateModel(UUID modelVersionId) {
        return evaluateModel(modelVersionId, "1.0");
    }

    /**
     * Lấy danh sách các lượt đánh giá của một modelVersionId sắp xếp theo createdAt DESC.
     *
     * @param modelVersionId ID của phiên bản mô hình
     * @return Danh sách EvaluationRunResponseDTO
     */
    List<EvaluationRunResponseDTO> getEvaluationsByModelVersion(UUID modelVersionId);

    /**
     * Lấy danh sách chi tiết các phát hiện của một lượt đánh giá.
     *
     * @param evaluationRunId ID của lượt đánh giá
     * @return Danh sách EvaluationFindingResponseDTO
     */
    List<EvaluationFindingResponseDTO> getFindingsByEvaluationRunId(UUID evaluationRunId);

    /**
     * Lấy chi tiết một lượt đánh giá theo ID.
     *
     * @param evaluationRunId ID của lượt đánh giá
     * @return EvaluationRunResponseDTO
     */
    EvaluationRunResponseDTO getEvaluationRunById(UUID evaluationRunId);
}
