package com.mavis.analyzer.aiexplain.controller;

import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.dto.AiExplanationResponseDTO;
import com.mavis.analyzer.aiexplain.service.AiExplanationService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "AI Architectural Explanation", description = "Phân hệ Giải thích Kiến trúc bằng AI Có Kiểm soát & Trích dẫn Bằng chứng (Ticket D2, T14, V13)")
public class AiExplanationController {

    private final AiExplanationService aiExplanationService;

    @PostMapping("/ai/explain")
    @Operation(summary = "Sinh hoặc lấy lời giải thích kiến trúc bằng AI có kiểm soát (Ticket D2)",
            description = "Tự động phân tích ngữ cảnh, khử bí mật mã nguồn, gọi LLM có kiểm soát hoặc chuyển sang Deterministic Grounded Synthesis và xác thực allowlist bằng chứng")
    public ApiResponse<AiExplanationResponseDTO> explainArchitecture(
            @Valid @RequestBody AiExplainRequestDTO request) {
        AiExplanationResponseDTO response = aiExplanationService.generateOrGetExplanation(request);
        return ApiResponse.success("Tạo lời giải thích kiến trúc AI thành công", response);
    }

    @GetMapping("/models/{modelVersionId}/ai-explanations")
    @Operation(summary = "Lấy lịch sử các lời giải thích kiến trúc của một ModelVersion",
            description = "Truy xuất danh sách lời giải thích đã lưu kèm thông tin người yêu cầu và danh sách bằng chứng")
    public ApiResponse<List<AiExplanationResponseDTO>> getExplanationsByModelVersion(
            @PathVariable UUID modelVersionId) {
        List<AiExplanationResponseDTO> list = aiExplanationService.getExplanationsByModelVersion(modelVersionId);
        return ApiResponse.success("Lấy danh sách lời giải thích AI thành công", list);
    }

    @GetMapping("/ai/explanations/{explanationId}")
    @Operation(summary = "Xem chi tiết một bản ghi giải thích AI kèm bằng chứng",
            description = "Truy xuất chi tiết văn bản giải thích và nội dung trích đoạn của các bằng chứng (Evidence) liên quan")
    public ApiResponse<AiExplanationResponseDTO> getExplanationById(
            @PathVariable UUID explanationId) {
        AiExplanationResponseDTO response = aiExplanationService.getExplanationById(explanationId);
        return ApiResponse.success("Lấy chi tiết lời giải thích AI thành công", response);
    }
}
