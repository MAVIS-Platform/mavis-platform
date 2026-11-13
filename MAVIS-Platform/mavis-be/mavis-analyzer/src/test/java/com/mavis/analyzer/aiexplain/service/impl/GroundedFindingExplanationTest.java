package com.mavis.analyzer.aiexplain.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.AiExplanationRepository;
import com.mavis.common.repository.EvaluationFindingRepository;
import com.mavis.common.repository.EvidenceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroundedFindingExplanationTest {

    @Mock private EvaluationFindingRepository findings;
    @Mock private AiExplanationRepository explanations;
    @Mock private EvidenceRepository evidences;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void rule04MetadataOnlyFindingStaysUnverifiedMetadataOnlyEvenWithContractEvidence() {
        UUID modelId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID findingId = UUID.randomUUID();
        UUID evidenceId = UUID.randomUUID();
        Project project = Project.builder().id(UUID.randomUUID()).name("course-app").build();
        ModelVersion model = ModelVersion.builder().id(modelId).project(project).revision(1).build();
        ModelElement src = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model).name("order-service").elementType("SERVICE_CONTAINER").build();
        ModelElement tgt = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model).name("payment-service").elementType("SERVICE_CONTAINER").build();
        ModelRelationship rel = ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(model).sourceElement(src).targetElement(tgt).relationType("SERVICE_HTTP_CALL").build();

        EvaluationRun run = EvaluationRun.builder().id(runId).modelVersion(model).ruleSetVersion("3e-3").build();
        var details = mapper.createObjectNode().put("evidenceSufficiency", "UNVERIFIED_METADATA_ONLY");
        details.putArray("supportingEvidenceIds").add(evidenceId.toString());
        EvaluationFinding finding = EvaluationFinding.builder()
                .id(findingId)
                .evaluationRun(run)
                .ruleId("RULE-04")
                .status("NEEDS_REVIEW")
                .severity("WARNING")
                .element(src)
                .relationship(rel)
                .details(details)
                .message("Quan hệ SERVICE_HTTP_CALL chỉ có metadata khai báo client (Unverified metadata-only)")
                .build();

        Evidence contract = Evidence.builder()
                .id(evidenceId)
                .modelVersion(model)
                .relationship(rel)
                .sourceType("STATIC_CODE")
                .locator("PaymentClient.java:14")
                .excerpt("@PostMapping(\"/pay\") PayResponse pay();")
                .provenance(mapper.createObjectNode().put("communicationRole", "CLIENT_CONTRACT"))
                .build();

        when(findings.findById(findingId)).thenReturn(Optional.of(finding));
        when(evidences.findByModelVersionId(modelId)).thenReturn(List.of(contract));
        when(explanations.findFirstByModelVersionIdAndContextKeyOrderByCreatedAtDesc(any(), any())).thenReturn(Optional.empty());
        when(explanations.save(any())).thenAnswer(inv -> {
            AiExplanation saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        var service = new GroundedFindingExplanation(findings, explanations, evidences, mapper);
        var response = service.explain(AiExplainRequestDTO.builder()
                .modelVersionId(modelId)
                .findingId(findingId)
                .evaluationRunId(runId)
                .relationshipId(rel.getId())
                .build(), model, null, rel);

        assertThat(response.getStructuredContent().path("evidenceSufficiency").asText())
                .isEqualTo("UNVERIFIED_METADATA_ONLY");
        assertThat(response.getStructuredContent().path("unknowns").toString())
                .contains("Unverified metadata-only");
        assertThat(response.getStructuredContent().path("whyItMatters").asText())
                .contains("CALL_SITE");
    }
}
