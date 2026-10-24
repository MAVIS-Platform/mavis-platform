package com.mavis.analyzer.aiexplain.service.impl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.dto.*;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class GroundedFindingExplanationTest {
 final ObjectMapper mapper=new ObjectMapper();final EvaluationFindingRepository findings=mock(EvaluationFindingRepository.class);final AiExplanationRepository saved=mock(AiExplanationRepository.class);final EvidenceRepository evidence=mock(EvidenceRepository.class);
 final GroundedFindingExplanation service=new GroundedFindingExplanation(findings,saved,evidence,mapper);
 final ModelVersion model=ModelVersion.builder().id(UUID.randomUUID()).sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build()).build();
 final ModelElement db=ModelElement.builder().id(UUID.randomUUID()).modelVersion(model).name("data").elementType("DATABASE").build();
 final EvaluationRun run=EvaluationRun.builder().id(UUID.randomUUID()).modelVersion(model).ruleSetVersion("3e-2").build();
 EvaluationFinding finding(){var f=EvaluationFinding.builder().id(UUID.randomUUID()).evaluationRun(run).element(db).ruleId("RULE-02").status("NEEDS_REVIEW").message("Cần đối chiếu datasource").build();when(findings.findById(f.getId())).thenReturn(Optional.of(f));return f;}
 AiExplainRequestDTO request(EvaluationFinding f){var q=new AiExplainRequestDTO();q.setModelVersionId(model.getId());q.setElementId(db.getId());q.setFindingId(f.getId());q.setEvaluationRunId(run.getId());return q;}
 @Test void refusesOtherRunModelAndSubject(){var f=finding();var q=request(f);q.setEvaluationRunId(UUID.randomUUID());assertThatThrownBy(()->service.explain(q,model,db,null)).isInstanceOf(BusinessException.class);q.setEvaluationRunId(run.getId());var other=ModelVersion.builder().id(UUID.randomUUID()).build();assertThatThrownBy(()->service.explain(q,other,db,null)).isInstanceOf(BusinessException.class);var unrelated=ModelElement.builder().id(UUID.randomUUID()).build();assertThatThrownBy(()->service.explain(q,model,unrelated,null)).isInstanceOf(BusinessException.class);}
 @Test void filtersEvidenceAndCachesByFindingAndEvidenceContext(){var f=finding();var q=request(f);var e=Evidence.builder().id(UUID.randomUUID()).modelVersion(model).sourceType("SOURCE_CODE").locator("repo.java:2").excerpt("repository").build();var unrelated=Evidence.builder().id(UUID.randomUUID()).modelVersion(model).sourceType("SOURCE_CODE").excerpt("unrelated").build();var details=mapper.createObjectNode();details.putArray("supportingEvidenceIds").add(e.getId().toString());f.setDetails(details);when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(e,unrelated));List<AiExplanation> rows=new ArrayList<>();when(saved.save(any())).thenAnswer(i->{AiExplanation entity=i.getArgument(0);entity.setId(UUID.randomUUID());rows.add(entity);return entity;});when(saved.findFirstByModelVersionIdAndContextKeyOrderByCreatedAtDesc(eq(model.getId()),anyString())).thenAnswer(i->rows.stream().filter(row->row.getContextKey().equals(i.getArgument(1))).findFirst());
  var first=service.explain(q,model,db,null);assertThat(first.getCitedEvidenceIds()).containsExactly(e.getId());assertThat(first.getCached()).isFalse();assertThat(service.explain(q,model,db,null).getCached()).isTrue();var another=finding();assertThat(service.explain(request(another),model,db,null).getCached()).isFalse();e.setExcerpt("updated source");assertThat(service.explain(q,model,db,null).getCached()).isFalse();verify(saved,times(3)).save(any());
 }
 @Test void legacyFindingIsNotRestatedAsVerified(){var f=finding();run.setRuleSetVersion("1.0");when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of());when(saved.save(any())).thenAnswer(i->i.getArgument(0));var result=service.explain(request(f),model,db,null);assertThat(result.getStructuredContent().path("summary").asText()).contains("phiên bản rule cũ");assertThat(result.getStructuredContent().path("evidenceSufficiency").asText()).isEqualTo("LEGACY_UNVERIFIED");}
}
