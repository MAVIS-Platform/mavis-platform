package com.mavis.analyzer.evaluation.dto;

import com.mavis.common.entity.EvaluationFinding;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvaluationFindingResponseDTO {
    private UUID id;
    private UUID evaluationRunId;
    private UUID elementId;
    private String elementName;
    private String elementType;
    private UUID relationshipId;
    private String relationshipType;
    private String ruleId;
    private String severity;
    private String status;
    private String message;
    private com.fasterxml.jackson.databind.JsonNode details;

    public static EvaluationFindingResponseDTO fromEntity(EvaluationFinding entity) {
        if (entity == null) {
            return null;
        }
        return EvaluationFindingResponseDTO.builder()
                .id(entity.getId())
                .evaluationRunId(entity.getEvaluationRun() != null ? entity.getEvaluationRun().getId() : null)
                .elementId(entity.getElement() != null ? entity.getElement().getId() : null)
                .elementName(entity.getElement() != null ? entity.getElement().getName() : null)
                .elementType(entity.getElement() != null ? entity.getElement().getElementType() : null)
                .relationshipId(entity.getRelationship() != null ? entity.getRelationship().getId() : null)
                .relationshipType(entity.getRelationship() != null ? entity.getRelationship().getRelationType() : null)
                .ruleId(entity.getRuleId())
                .severity(entity.getSeverity())
                .status(entity.getStatus())
                .message(entity.getMessage())
                .details(entity.getDetails())
                .build();
    }
}
