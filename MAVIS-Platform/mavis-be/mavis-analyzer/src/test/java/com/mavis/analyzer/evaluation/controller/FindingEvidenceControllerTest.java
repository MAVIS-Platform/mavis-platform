package com.mavis.analyzer.evaluation.controller;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class FindingEvidenceControllerTest {
 final EvaluationFindingRepository findings=mock(EvaluationFindingRepository.class);final EvidenceRepository evidence=mock(EvidenceRepository.class);final AccessPolicyService access=mock(AccessPolicyService.class);
 final FindingEvidenceController controller=new FindingEvidenceController(findings,evidence,access);
 @Test void readsOnlyFindingReferencesWithinItsModelAndChecksAccess(){var project=Project.builder().id(UUID.randomUUID()).build();var model=ModelVersion.builder().id(UUID.randomUUID()).project(project).build();var run=EvaluationRun.builder().id(UUID.randomUUID()).modelVersion(model).build();var e=Evidence.builder().id(UUID.randomUUID()).sourceType("CONFIG_FILE").excerpt("datasource").build();var unrelated=Evidence.builder().id(UUID.randomUUID()).excerpt("other").build();var d=new ObjectMapper().createObjectNode();d.putArray("supportingEvidenceIds").add(e.getId().toString());var f=EvaluationFinding.builder().id(UUID.randomUUID()).evaluationRun(run).details(d).build();when(findings.findById(f.getId())).thenReturn(Optional.of(f));when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(e,unrelated));var response=controller.evidence(run.getId(),f.getId());assertThat(response.getData()).hasSize(1);assertThat(response.getData().get(0).getId()).isEqualTo(e.getId());verify(access).requireProjectReadAccess(project);assertThatThrownBy(()->controller.evidence(UUID.randomUUID(),f.getId())).isInstanceOf(BusinessException.class);doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(access).requireProjectReadAccess(project);assertThatThrownBy(()->controller.evidence(run.getId(),f.getId())).isInstanceOf(BusinessException.class);verify(evidence,times(1)).findByModelVersionId(model.getId());}
}
