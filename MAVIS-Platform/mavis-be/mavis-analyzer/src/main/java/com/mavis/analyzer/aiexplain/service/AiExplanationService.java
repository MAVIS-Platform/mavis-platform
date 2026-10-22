package com.mavis.analyzer.aiexplain.service;

import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.dto.AiExplanationResponseDTO;

import java.util.List;
import java.util.UUID;

/**
 * Dịch vụ giải thích kiến trúc bằng AI có kiểm soát & trích dẫn bằng chứng (Ticket D2, T14, V13).
 */
public interface AiExplanationService {

    /**
     * Sinh hoặc lấy lời giải thích AI có kiểm soát (grounded in saved model evidence).
     *
     * @param request Yêu cầu giải thích
     * @return AiExplanationResponseDTO
     */
    AiExplanationResponseDTO generateOrGetExplanation(AiExplainRequestDTO request);

    /**
     * Lấy danh sách lịch sử các lời giải thích AI của một ModelVersion.
     *
     * @param modelVersionId ID phiên bản mô hình
     * @return Danh sách AiExplanationResponseDTO
     */
    List<AiExplanationResponseDTO> getExplanationsByModelVersion(UUID modelVersionId);

    /**
     * Xem chi tiết một bản ghi giải thích AI theo ID kèm danh sách bằng chứng được trích dẫn.
     *
     * @param explanationId ID bản ghi giải thích
     * @return AiExplanationResponseDTO
     */
    AiExplanationResponseDTO getExplanationById(UUID explanationId);
}
