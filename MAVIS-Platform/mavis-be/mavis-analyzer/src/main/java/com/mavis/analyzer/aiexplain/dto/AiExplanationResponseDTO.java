package com.mavis.analyzer.aiexplain.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Kết quả giải thích kiến trúc bằng AI có trích dẫn bằng chứng (Ticket D2, T14, V13)")
public class AiExplanationResponseDTO {

    private UUID id;
    private UUID modelVersionId;
    private String explanationScope;
    private UUID elementId;
    private String elementName;
    private UUID relationshipId;
    private UUID runtimeSessionId;
    private String userQuestion;
    private String explanationText;
    private String contractVersion;
    private UUID findingId;
    private UUID evaluationRunId;
    private String ruleSetVersion;
    private com.fasterxml.jackson.databind.JsonNode structuredContent;
    private com.fasterxml.jackson.databind.JsonNode groundingContext;

    @Builder.Default
    private List<UUID> citedEvidenceIds = new ArrayList<>();

    @Builder.Default
    private List<EvidenceSummaryDTO> citedEvidences = new ArrayList<>();

    private Boolean secretRedacted;
    private String aiModelName;
    private Boolean cached;
    private String providerMode; // LIVE_LLM_PROVIDER hoặc DETERMINISTIC_EVIDENCE_SYNTHESIS

    @Builder.Default
    private String epistemicBadge = "AI-Assisted Explanation (Grounded in Saved Model Evidence)";

    private OffsetDateTime createdAt;
}
