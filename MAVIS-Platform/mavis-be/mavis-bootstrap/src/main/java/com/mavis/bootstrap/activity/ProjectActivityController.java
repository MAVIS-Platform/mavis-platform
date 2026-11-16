package com.mavis.bootstrap.activity;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.*;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.security.AccessPolicyService;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/activity")
public class ProjectActivityController {
 private final AccessPolicyService policy;private final JobRepository jobs;
 public ProjectActivityController(AccessPolicyService policy,JobRepository jobs){this.policy=policy;this.jobs=jobs;}
 public record Item(JobResponseDTO job,String projectName){}
 @GetMapping("/analysis") @Transactional(readOnly=true)
 public ApiResponse<?> analysis(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){
  var user=policy.requireCurrentActiveUser();
  if(page<0||page>10000||size<1||size>50)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid activity page");
  var result=jobs.findActivityForOwner(user.getId(),PageRequest.of(page,size));
  var rows=result.getContent().stream().map(j->new Item(JobResponseDTO.builder().jobId(j.getId()).projectId(j.getProject().getId()).sourceSnapshotId(j.getSourceSnapshot().getId()).jobType(j.getJobType()).status(j.getStatus()).resultManifest(j.getResultManifest()).errorDiagnostics(j.getErrorDiagnostics()).startedAt(j.getStartedAt()).completedAt(j.getCompletedAt()).build(),j.getProject().getName())).toList();
  return ApiResponse.success(Map.of("items",rows,"total",result.getTotalElements(),"page",page,"size",size));
 }
}
