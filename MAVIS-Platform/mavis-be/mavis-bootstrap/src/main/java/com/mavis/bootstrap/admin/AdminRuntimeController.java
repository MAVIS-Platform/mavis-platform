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
 @org.springframework.beans.factory.annotation.Autowired(required = false)
 private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
 public AdminRuntimeController(AccessPolicyService policy,PlatformRuntimeSettings settings,AuditLogService audit,ApiKeyProvider keys,JobRepository jobs,RuntimeSessionRepository sessions,RuntimeSessionService runtime){this.policy=policy;this.settings=settings;this.audit=audit;this.keys=keys;this.jobs=jobs;this.sessions=sessions;this.runtime=runtime;}
 void setJdbcTemplate(org.springframework.jdbc.core.JdbcTemplate jdbcTemplate){this.jdbcTemplate=jdbcTemplate;}
 public record Toggle(@NotNull Boolean enabled,@Min(1) int expectedRevision){}
 public record ProfileUpdate(@NotNull Boolean enabled,@Min(1) int expectedRevision,@Min(64) @Max(2048) Integer memoryMiB,@DecimalMin("0.01") @DecimalMax("4") Double cpus,@Min(1) @Max(300) Integer timeoutSeconds){}
 private Map<String,Object> integration(PlatformRuntimeSettings.Integration i){return Map.of("id",i.id(),"name",i.name(),"enabled",i.enabled(),"revision",i.revision(),"status",i.id().equals("github")?"PUBLIC_ONLY":i.id().equals("gemini-ai")?(keys.hasValidKey()?"CONFIGURED":"NOT_CONFIGURED"):"UNVERIFIED","persistence","PROCESS_LOCAL_RESETS_ON_RESTART","connectionVerified",false);}
 @GetMapping("/integrations") public ApiResponse<?> integrations(){policy.requireSystemAdmin();return ApiResponse.success(settings.integrations().stream().map(this::integration).toList());}
 @PatchMapping("/integrations/{id}") public ApiResponse<?> integration(@PathVariable String id,@Valid @RequestBody Toggle r){policy.requireSystemAdmin();return ApiResponse.success(integration(settings.updateIntegration(id,r.enabled(),r.expectedRevision(),n->record("CONFIGURE_INTEGRATION","INTEGRATION",id,Map.of("enabled",n.enabled(),"revision",n.revision())))));}
 @PostMapping("/integrations/{id}/test")
 public ApiResponse<?> testIntegration(@PathVariable String id) {
  policy.requireSystemAdmin();
  var target = settings.integrations().stream()
          .filter(i -> i.id().equals(id))
          .findFirst()
          .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Integration not found"));
  long started = System.nanoTime();
  boolean reachable;
  String status;
  String message;
  if ("github".equals(id)) {
   try {
    var client = java.net.http.HttpClient.newBuilder()
            .connectTimeout(java.time.Duration.ofSeconds(3))
            .build();
    var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create("https://api.github.com"))
            .timeout(java.time.Duration.ofSeconds(3))
            .method("HEAD", java.net.http.HttpRequest.BodyPublishers.noBody())
            .header("User-Agent", "MAVIS-Admin-Probe")
            .build();
    int code = client.send(req, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode();
    reachable = code >= 200 && code < 500;
    status = reachable ? "REACHABLE" : "DEGRADED";
    message = "GitHub API responded HTTP " + code;
   } catch (Exception ex) {
    reachable = false;
    status = "UNREACHABLE";
    message = "GitHub API probe failed: " + ex.getClass().getSimpleName();
   }
  } else if ("gemini-ai".equals(id)) {
   reachable = keys.hasValidKey();
   status = reachable ? "CONFIGURED" : "NOT_CONFIGURED";
   message = reachable
           ? "Gemini API credentials configured and ready."
           : "Gemini API key is not configured on this server.";
  } else if ("otel-collector".equals(id)) {
   if (queueCoordinator != null) {
    var health = queueCoordinator.getRuntimeHealth();
    reachable = !"UNAVAILABLE".equalsIgnoreCase(health.surveyReadiness());
    status = health.surveyReadiness();
    message = "Runner " + health.runnerMode() + " (" + health.effectiveOciRuntime()
            + ") · slots " + health.activeSessions() + "/" + health.maxActiveSessions()
            + " · queue " + health.queuedSessions() + "/" + health.maxQueuedSessions();
   } else {
    reachable = false;
    status = "UNAVAILABLE";
    message = "RuntimeQueueCoordinator unavailable on this node.";
   }
  } else {
   reachable = false;
   status = "UNVERIFIED";
   message = "No live probe configured for integration " + id;
  }
  long latencyMs = Math.max(1L, (System.nanoTime() - started) / 1_000_000L);
  record("TEST_INTEGRATION", "INTEGRATION", id, Map.of("reachable", reachable, "status", status, "latencyMs", latencyMs));
  return ApiResponse.success(Map.of(
          "id", target.id(),
          "name", target.name(),
          "enabled", target.enabled(),
          "reachable", reachable,
          "status", status,
          "latencyMs", latencyMs,
          "message", message,
          "checkedAt", OffsetDateTime.now().toString()));
 }
 @GetMapping({"/profiles","/runner-profiles"}) public ApiResponse<?> profiles(){policy.requireSystemAdmin();return ApiResponse.success(settings.profiles());}
 @PatchMapping({"/profiles/{id}","/runner-profiles/{id}"}) public ApiResponse<?> profile(@PathVariable String id,@Valid @RequestBody ProfileUpdate r){policy.requireSystemAdmin();return ApiResponse.success(settings.updateProfile(id,r.enabled(),r.expectedRevision(),r.memoryMiB(),r.cpus(),r.timeoutSeconds(),n->record("CONFIGURE_RUNNER_PROFILE","RUNNER_PROFILE",id,Map.of("enabled",n.enabled(),"revision",n.revision(),"memoryMiB",n.memoryMiB(),"cpus",n.cpus(),"timeoutSeconds",n.timeoutSeconds()))));}
 private void record(String action,String type,String id,Map<String,Object> values){var details=new HashMap<>(values);details.put("configurationId",id);details.put("persistence","PROCESS_LOCAL");audit.recordAuditLog(action,type,UUID.nameUUIDFromBytes((type+":"+id).getBytes(StandardCharsets.UTF_8)),details);}
 @GetMapping("/runtime-sessions") @Transactional(readOnly=true)
 public ApiResponse<?> sessions() {
  policy.requireSystemAdmin();
  // Skip loading multi-MB studio_control TOAST blobs (snapshots/3D videos) when listing 50 admin summary rows.
  if (jdbcTemplate == null) {
   return ApiResponse.success(sessions.findTop50ByOrderByCreatedAtDesc().stream().map(RuntimeSessionResponseDTO::fromEntity).toList());
  }
  List<RuntimeSessionResponseDTO> rows = jdbcTemplate.query("""
          SELECT s.id, s.project_id, s.source_snapshot_id, s.model_version_id, s.enriched_model_version_id,
                 s.assignment_id, a.title AS lab_title, s.triggered_by, u.full_name AS triggered_by_name,
                 s.profile_name, s.scenario_name, s.execution_status, s.scenario_status,
                 s.evidence_status, s.cleanup_status, s.trace_quality, s.mapping_status,
                 s.publication_gate_status, s.trace_status, s.sandbox_enforcement_confirmed,
                 s.resource_project, s.cancel_requested_at, s.started_at, s.completed_at, s.created_at,
                 (s.receipt_digest IS NOT NULL AND s.receipt_digest <> '') AS studio_verified,
                 CASE WHEN jsonb_typeof(s.runner_receipt_json->'outcome'->'trace'->'spans') = 'array'
                      THEN jsonb_array_length(s.runner_receipt_json->'outcome'->'trace'->'spans')
                      ELSE NULL END AS captured_span_count,
                 COALESCE(s.recovery_result_json->>'reason', s.recovery_result_json->>'message') AS recovery_reason,
                 s.recovery_result_json->>'code' AS recovery_code
          FROM runtime_sessions s
          LEFT JOIN assignments a ON a.id = s.assignment_id
          LEFT JOIN users u ON u.id = s.triggered_by
          ORDER BY s.created_at DESC
          LIMIT 50
          """, (rs, rowNum) -> {
   String exec = Objects.toString(rs.getString("execution_status"), "");
   String scen = Objects.toString(rs.getString("scenario_status"), "");
   String recReason = rs.getString("recovery_reason");
   String recCode = rs.getString("recovery_code");
   List<String> diags = new ArrayList<>();
   if (recCode != null && !recCode.isBlank()) diags.add(com.mavis.analyzer.runtime.util.SecretRedactor.redactString(recCode.trim()));
   String failureReason = (recReason != null && !recReason.isBlank()) ? com.mavis.analyzer.runtime.util.SecretRedactor.redactString(recReason.trim()) : null;
   if (failureReason == null) {
    if ("CANCELLED".equalsIgnoreCase(exec) || "CANCELLED".equalsIgnoreCase(scen)) {
     failureReason = "Runtime session was cancelled before completion.";
    } else if ("TIMED_OUT".equalsIgnoreCase(exec) || "TIMEOUT".equalsIgnoreCase(exec) || "TIMEOUT".equalsIgnoreCase(scen)) {
     failureReason = "Runtime session exceeded the execution deadline.";
    } else if ("FAILED".equalsIgnoreCase(exec) || "FAILED".equalsIgnoreCase(scen)) {
     failureReason = "Runtime execution failed before scenario verification completed.";
    }
   }
   Number spanNum = (Number) rs.getObject("captured_span_count");
   return RuntimeSessionResponseDTO.builder()
           .id(rs.getObject("id", UUID.class))
           .projectId(rs.getObject("project_id", UUID.class))
           .sourceSnapshotId(rs.getObject("source_snapshot_id", UUID.class))
           .modelVersionId(rs.getObject("model_version_id", UUID.class))
           .enrichedModelVersionId(rs.getObject("enriched_model_version_id", UUID.class))
           .assignmentId(rs.getObject("assignment_id", UUID.class))
           .labTitle(rs.getString("lab_title"))
           .triggeredById(rs.getObject("triggered_by", UUID.class))
           .triggeredByName(rs.getString("triggered_by_name"))
           .profileName(rs.getString("profile_name"))
           .scenarioName(rs.getString("scenario_name"))
           .executionStatus(rs.getString("execution_status"))
           .scenarioStatus(rs.getString("scenario_status"))
           .evidenceStatus(rs.getString("evidence_status"))
           .cleanupStatus(rs.getString("cleanup_status"))
           .traceQuality(rs.getString("trace_quality"))
           .mappingStatus(rs.getString("mapping_status"))
           .publicationGateStatus(rs.getString("publication_gate_status"))
           .traceStatus(rs.getString("trace_status"))
           .sandboxEnforcementConfirmed(rs.getObject("sandbox_enforcement_confirmed", Boolean.class))
           .resourceProject(rs.getString("resource_project"))
           .studioVerified(rs.getBoolean("studio_verified"))
           .capturedSpanCount(spanNum != null ? spanNum.intValue() : null)
           .failureReason(failureReason)
           .diagnostics(diags)
           .stepResults(List.of())
           .cancelRequestedAt(rs.getObject("cancel_requested_at", OffsetDateTime.class))
           .startedAt(rs.getObject("started_at", OffsetDateTime.class))
           .completedAt(rs.getObject("completed_at", OffsetDateTime.class))
           .createdAt(rs.getObject("created_at", OffsetDateTime.class))
           .build();
  });
  return ApiResponse.success(rows);
 }
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
 @GetMapping("/jobs") @Transactional(readOnly=true) public ApiResponse<?> jobs(){policy.requireSystemAdmin();return ApiResponse.success(jobs.findRecentWithContext(PageRequest.of(0,50)).stream().map(j->{
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
