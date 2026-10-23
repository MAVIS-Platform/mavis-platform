package com.mavis.analyzer.aiexplain.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Yêu cầu giải thích kiến trúc bằng AI (Ticket D2, T14)")
public class AiExplainRequestDTO {

    @NotNull(message = "modelVersionId không được để trống")
    @Schema(description = "ID của phiên bản mô hình cần giải thích", requiredMode = Schema.RequiredMode.REQUIRED)
    private UUID modelVersionId;

    @NotBlank(message = "explanationScope không được để trống")
    @Schema(description = "Phạm vi giải thích (ELEMENT, RELATIONSHIP, DIAGRAM_VIEW, RUNTIME_TRACE, CHANGE_IMPACT, RULE_FINDING)",
            example = "ELEMENT", requiredMode = Schema.RequiredMode.REQUIRED)
    private String explanationScope;

    @Schema(description = "ID phần tử kiến trúc (nếu phạm vi là ELEMENT hoặc CHANGE_IMPACT)")
    private UUID elementId;

    @Schema(description = "ID quan hệ phụ thuộc (nếu phạm vi là RELATIONSHIP)")
    private UUID relationshipId;

    @Schema(description = "ID phiên thực nghiệm (nếu phạm vi là RUNTIME_TRACE)")
    private UUID runtimeSessionId;

    @Schema(description = "Câu hỏi bổ sung từ người dùng (nếu có)")
    private String userQuestion;
    private UUID findingId;
    private UUID evaluationRunId;

    @Builder.Default
    @Schema(description = "Bắt buộc gọi mới không dùng cache (mặc định false)")
    private Boolean forceRefresh = false;
}
