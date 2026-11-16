package com.mavis.bootstrap.admin;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.platform.admin.service.AuditLogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
@RestController @RequestMapping("/api/v1/admin")
public class AdminRuntimeController {
 private final AccessPolicyService policy;private final PlatformRuntimeSettings settings;private final AuditLogService audit;private final ApiKeyProvider keys;
 private final JobRepository jobs;private final RuntimeSessionRepository sessions;
 public AdminRuntimeController(AccessPolicyService policy,PlatformRuntimeSettings settings,AuditLogService audit,ApiKeyProvider keys,JobRepository jobs,RuntimeSessionRepository sessions){this.policy=policy;this.settings=settings;this.audit=audit;this.keys=keys;this.jobs=jobs;this.sessions=sessions;}
 public record Toggle(@NotNull Boolean enabled,@Min(1) int expectedRevision){}
 public record ProfileUpdate(@NotNull Boolean enabled,@Min(1) int expectedRevision,@Min(64) @Max(2048) Integer memoryMiB,@DecimalMin("0.01") @DecimalMax("4") Double cpus,@Min(1) @Max(300) Integer timeoutSeconds){}
 private Map<String,Object> integration(PlatformRuntimeSettings.Integration i){return Map.of("id",i.id(),"name",i.name(),"enabled",i.enabled(),"revision",i.revision(),"status",i.id().equals("github")?"PUBLIC_ONLY":i.id().equals("gemini-ai")?(keys.hasValidKey()?"CONFIGURED":"NOT_CONFIGURED"):"UNVERIFIED","persistence","PROCESS_LOCAL_RESETS_ON_RESTART","connectionVerified",false);}
 @GetMapping("/integrations") public ApiResponse<?> integrations(){policy.requireSystemAdmin();return ApiResponse.success(settings.integrations().stream().map(this::integration).toList());}
 @PatchMapping("/integrations/{id}") public ApiResponse<?> integration(@PathVariable String id,@Valid @RequestBody Toggle r){policy.requireSystemAdmin();return ApiResponse.success(integration(settings.updateIntegration(id,r.enabled(),r.expectedRevision(),n->record("CONFIGURE_INTEGRATION","INTEGRATION",id,Map.of("enabled",n.enabled(),"revision",n.revision())))));}
 @GetMapping({"/profiles","/runner-profiles"}) public ApiResponse<?> profiles(){policy.requireSystemAdmin();return ApiResponse.success(settings.profiles());}
 @PatchMapping({"/profiles/{id}","/runner-profiles/{id}"}) public ApiResponse<?> profile(@PathVariable String id,@Valid @RequestBody ProfileUpdate r){policy.requireSystemAdmin();return ApiResponse.success(settings.updateProfile(id,r.enabled(),r.expectedRevision(),r.memoryMiB(),r.cpus(),r.timeoutSeconds(),n->record("CONFIGURE_RUNNER_PROFILE","RUNNER_PROFILE",id,Map.of("enabled",n.enabled(),"revision",n.revision(),"memoryMiB",n.memoryMiB(),"cpus",n.cpus(),"timeoutSeconds",n.timeoutSeconds()))));}
 private void record(String action,String type,String id,Map<String,Object> values){var details=new HashMap<>(values);details.put("configurationId",id);details.put("persistence","PROCESS_LOCAL");audit.recordAuditLog(action,type,UUID.nameUUIDFromBytes((type+":"+id).getBytes(StandardCharsets.UTF_8)),details);}
 @GetMapping("/runtime-sessions") @Transactional(readOnly=true) public ApiResponse<?> sessions(){policy.requireSystemAdmin();return ApiResponse.success(sessions.findAll(PageRequest.of(0,50,Sort.by(Sort.Direction.DESC,"createdAt"))).stream().map(RuntimeSessionResponseDTO::fromEntity).toList());}
 @GetMapping("/jobs") @Transactional(readOnly=true) public ApiResponse<?> jobs(){policy.requireSystemAdmin();return ApiResponse.success(jobs.findAll(PageRequest.of(0,50,Sort.by(Sort.Direction.DESC,"startedAt"))).stream().map(j->JobResponseDTO.builder().jobId(j.getId()).projectId(j.getProject().getId()).sourceSnapshotId(j.getSourceSnapshot().getId()).jobType(j.getJobType()).status(j.getStatus()).resultManifest(j.getResultManifest()).errorDiagnostics(j.getErrorDiagnostics()).startedAt(j.getStartedAt()).completedAt(j.getCompletedAt()).build()).toList());}
}
