package com.mavis.analyzer.evaluation.controller;
import com.mavis.analyzer.aiexplain.dto.EvidenceSummaryDTO;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/evaluations")
public class FindingEvidenceController {
 private final EvaluationFindingRepository findings;
 private final EvidenceRepository evidences;
 private final AccessPolicyService access;
 @GetMapping("/{evaluationId}/findings/{findingId}/evidence")
 public ApiResponse<List<EvidenceSummaryDTO>> evidence(@PathVariable UUID evaluationId,@PathVariable UUID findingId) {
  var f=findings.findById(findingId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  var run=f.getEvaluationRun();if(run==null||!evaluationId.equals(run.getId()))throw new BusinessException(ErrorCode.NOT_FOUND);
  access.requireProjectReadAccess(run.getModelVersion().getProject());
  Set<String> ids=new HashSet<>();if(f.getDetails()!=null)f.getDetails().path("supportingEvidenceIds").forEach(id->ids.add(id.asText()));
  var result=evidences.findByModelVersionId(run.getModelVersion().getId()).stream().filter(e->ids.contains(e.getId().toString()))
   .sorted(Comparator.comparing(e->e.getId().toString())).map(e->EvidenceSummaryDTO.builder().id(e.getId()).sourceType(e.getSourceType()).locator(SecretRedactor.redactString(e.getLocator())).excerpt(SecretRedactor.redactString(e.getExcerpt())).build()).toList();
  return ApiResponse.success("Căn cứ của nhận xét",result);
 }
}
