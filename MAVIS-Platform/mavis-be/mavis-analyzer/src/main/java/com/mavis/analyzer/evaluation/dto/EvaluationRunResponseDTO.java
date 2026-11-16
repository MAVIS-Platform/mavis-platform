package com.mavis.analyzer.evaluation.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.EvaluationFinding;
import com.mavis.common.entity.EvaluationRun;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvaluationRunResponseDTO {
    private UUID id;
    private UUID modelVersionId;
    private UUID runtimeSessionId;
    private String ruleSetVersion;
    private Double complianceScore;
    private JsonNode summaryMetrics;
    private OffsetDateTime createdAt;
    private List<EvaluationFindingResponseDTO> findings;

    public static EvaluationRunResponseDTO fromEntity(EvaluationRun entity) {
        return fromEntity(entity, Collections.emptyList());
    }

    public static EvaluationRunResponseDTO fromEntity(EvaluationRun entity, List<EvaluationFinding> findings) {
        if (entity == null) {
            return null;
        }
        Double score = null;
        if (entity.getSummaryMetrics() != null && entity.getSummaryMetrics().has("complianceScore")) {
            score = entity.getSummaryMetrics().get("complianceScore").asDouble();
        }
        List<EvaluationFindingResponseDTO> findingDTOs = (findings == null || findings.isEmpty())
                ? Collections.emptyList()
                : findings.stream().map(EvaluationFindingResponseDTO::fromEntity).collect(Collectors.toList());

        return EvaluationRunResponseDTO.builder()
                .id(entity.getId())
                .modelVersionId(entity.getModelVersion() != null ? entity.getModelVersion().getId() : null)
                .runtimeSessionId(entity.getRuntimeSession() != null ? entity.getRuntimeSession().getId() : null)
                .ruleSetVersion(entity.getRuleSetVersion())
                .complianceScore(score)
                .summaryMetrics(entity.getSummaryMetrics())
                .createdAt(entity.getCreatedAt())
                .findings(findingDTOs)
                .build();
    }
}
