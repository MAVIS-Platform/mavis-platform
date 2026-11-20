package com.mavis.bootstrap.admin;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.platform.admin.service.AuditLogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.nio.charset.StandardCharsets;
@RestController @RequestMapping("/api/v1/admin")
public class AdminRuntimeController {
 private final AccessPolicyService policy;private final PlatformRuntimeSettings settings;private final AuditLogService audit;private final ApiKeyProvider keys;
 private final JobRepository jobs;private final RuntimeSessionRepository sessions;
 private final RuntimeSessionService runtime;
 @org.springframework.beans.factory.annotation.Autowired(required = false)
 private com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator queueCoordinator;
 public AdminRuntimeController(AccessPolicyService policy,PlatformRuntimeSettings settings,AuditLogService audit,ApiKeyProvider keys,JobRepository jobs,RuntimeSessionRepository sessions,RuntimeSessionService runtime){this.policy=policy;this.settings=settings;this.audit=audit;this.keys=keys;this.jobs=jobs;this.sessions=sessions;this.runtime=runtime;}
 public record Toggle(@NotNull Boolean enabled,@Min(1) int expectedRevision){}
 public record ProfileUpdate(@NotNull Boolean enabled,@Min(1) int expectedRevision,@Min(64) @Max(2048) Integer memoryMiB,@DecimalMin("0.01") @DecimalMax("4") Double cpus,@Min(1) @Max(300) Integer timeoutSeconds){}
 private Map<String,Object> integration(PlatformRuntimeSettings.Integration i){return Map.of("id",i.id(),"name",i.name(),"enabled",i.enabled(),"revision",i.revision(),"status",i.id().equals("github")?"PUBLIC_ONLY":i.id().equals("gemini-ai")?(keys.hasValidKey()?"CONFIGURED":"NOT_CONFIGURED"):"UNVERIFIED","persistence","PROCESS_LOCAL_RESETS_ON_RESTART","connectionVerified",false);}
 @GetMapping("/integrations") public ApiResponse<?> integrations(){policy.requireSystemAdmin();return ApiResponse.success(settings.integrations().stream().map(this::integration).toList());}
 @PatchMapping("/integrations/{id}") public ApiResponse<?> integration(@PathVariable String id,@Valid @RequestBody Toggle r){policy.requireSystemAdmin();return ApiResponse.success(integration(settings.updateIntegration(id,r.enabled(),r.expectedRevision(),n->record("CONFIGURE_INTEGRATION","INTEGRATION",id,Map.of("enabled",n.enabled(),"revision",n.revision())))));}
 @GetMapping({"/profiles","/runner-profiles"}) public ApiResponse<?> profiles(){policy.requireSystemAdmin();return ApiResponse.success(settings.profiles());}
 @PatchMapping({"/profiles/{id}","/runner-profiles/{id}"}) public ApiResponse<?> profile(@PathVariable String id,@Valid @RequestBody ProfileUpdate r){policy.requireSystemAdmin();return ApiResponse.success(settings.updateProfile(id,r.enabled(),r.expectedRevision(),r.memoryMiB(),r.cpus(),r.timeoutSeconds(),n->record("CONFIGURE_RUNNER_PROFILE","RUNNER_PROFILE",id,Map.of("enabled",n.enabled(),"revision",n.revision(),"memoryMiB",n.memoryMiB(),"cpus",n.cpus(),"timeoutSeconds",n.timeoutSeconds()))));}
 private void record(String action,String type,String id,Map<String,Object> values){var details=new HashMap<>(values);details.put("configurationId",id);details.put("persistence","PROCESS_LOCAL");audit.recordAuditLog(action,type,UUID.nameUUIDFromBytes((type+":"+id).getBytes(StandardCharsets.UTF_8)),details);}
 @GetMapping("/runtime-sessions") @Transactional(readOnly=true) public ApiResponse<?> sessions(){policy.requireSystemAdmin();return ApiResponse.success(sessions.findAll(PageRequest.of(0,50,Sort.by(Sort.Direction.DESC,"createdAt"))).stream().map(RuntimeSessionResponseDTO::fromEntity).toList());}
 @PostMapping("/runtime-sessions/{sessionId}/force-stop") @Transactional
 public ApiResponse<?> forceStopSession(@PathVariable UUID sessionId) {
  policy.requireSystemAdmin();
  RuntimeSession session = sessions.findById(sessionId)
          .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Runtime session not found"));
  String previousStatus = session.getExecutionStatus();
  RuntimeSessionResponseDTO stopped = runtime.stopSession(sessionId);
  audit.recordAuditLog("ADMIN_FORCE_STOP_RUNTIME_SESSION", "RUNTIME_SESSION", sessionId,
          Map.of("previousStatus", Objects.toString(previousStatus, "UNKNOWN"),
                  "newStatus", Objects.toString(stopped.getExecutionStatus(), "UNKNOWN")));
  return ApiResponse.success("Đã gửi yêu cầu dừng phiên Runtime", stopped);
 }
 @GetMapping("/runtime-health")
 public ApiResponse<?> runtimeHealth() {
  policy.requireSystemAdmin();
  if (queueCoordinator == null) {
   throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "RuntimeQueueCoordinator unavailable");
  }
  return ApiResponse.success("Runtime infrastructure health snapshot", queueCoordinator.getRuntimeHealth());
 }
 @PostMapping("/runtime-health/sweep-orphans")
 public ApiResponse<?> sweepOrphans() {
  policy.requireSystemAdmin();
  if (queueCoordinator == null) {
   throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "RuntimeQueueCoordinator unavailable");
  }
  int removed = queueCoordinator.sweepOrphanDockerResources(java.time.Instant.now());
  boolean diskPruned = queueCoordinator.checkAndProtectDiskSpace();
  return ApiResponse.success("Orphan runtime sweep completed",
          Map.of("orphansRemoved", removed, "diskPruned", diskPruned, "health", queueCoordinator.getRuntimeHealth()));
 }
 @GetMapping("/jobs") @Transactional(readOnly=true) public ApiResponse<?> jobs(){policy.requireSystemAdmin();return ApiResponse.success(jobs.findAll(PageRequest.of(0,50,Sort.by(Sort.Direction.DESC,"startedAt"))).stream().map(j->{
  var project = j.getProject();
  var workspace = project != null ? project.getWorkspace() : null;
  Map<String,Object> row = new LinkedHashMap<>();
  row.put("jobId", j.getId());
  row.put("projectId", project != null ? project.getId() : null);
  row.put("projectName", project != null ? project.getName() : null);
  row.put("workspaceName", workspace != null ? workspace.getName() : null);
  row.put("sourceSnapshotId", j.getSourceSnapshot() != null ? j.getSourceSnapshot().getId() : null);
  row.put("jobType", j.getJobType());
  row.put("status", j.getStatus());
  row.put("resultManifest", j.getResultManifest());
  row.put("errorDiagnostics", j.getErrorDiagnostics());
  row.put("startedAt", j.getStartedAt());
  row.put("completedAt", j.getCompletedAt());
  return row;
 }).toList());}
}
