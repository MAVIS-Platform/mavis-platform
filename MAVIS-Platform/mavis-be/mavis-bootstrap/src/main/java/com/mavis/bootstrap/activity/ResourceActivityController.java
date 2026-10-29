package com.mavis.bootstrap.activity;
import com.fasterxml.jackson.databind.*;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.*;
import com.mavis.common.security.AccessPolicyService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/activity/projects")
public class ResourceActivityController {
 private final AccessPolicyService policy;private final JdbcTemplate sql;private final ObjectMapper json;
 public record Item(String id,String kind,String projectId,String projectName,String occurredAt,boolean projectDeleted,String targetId,String targetName,String actorId,String actorName,JsonNode job){}
 public ResourceActivityController(AccessPolicyService policy,JdbcTemplate sql,ObjectMapper json){this.policy=policy;this.sql=sql;this.json=json;}
 private static final String FEED="""
 SELECT j.id::text AS id,'ANALYSIS'::text AS kind,p.id::text AS project_id,p.name AS project_name,
 COALESCE(j.completed_at,j.started_at) AS occurred_at,COALESCE(p.status='DELETED',false) AS project_deleted,
 j.source_snapshot_id::text AS target_id,NULL::text AS target_name,NULL::text AS actor_id,NULL::text AS actor_name,
 jsonb_build_object('jobId',j.id,'projectId',j.project_id,'sourceSnapshotId',j.source_snapshot_id,'status',j.status,'modelVersionId',j.result_manifest->>'modelVersionId','errorDiagnostics',j.error_diagnostics,'analysisState',j.result_manifest->>'analysisState','dotnetStatus',j.result_manifest#>>'{dotnetAdapter,status}') AS job
 FROM jobs j JOIN projects p ON p.id=j.project_id WHERE p.owner_id=?
 UNION ALL
 SELECT a.id::text,a.action,a.details->>'projectId',a.details->>'projectName',a.created_at,
 COALESCE(p.status='DELETED',true),a.target_id::text,a.details->>'targetName',a.details->>'actorId',u.full_name,NULL::jsonb
 FROM audit_logs a LEFT JOIN projects p ON p.id::text=a.details->>'projectId' LEFT JOIN users u ON u.id=a.actor_id
 WHERE a.action IN ('PROJECT_DELETED','SNAPSHOT_DELETED') AND a.details->>'schema'='resource-deletion/v1'
 AND (a.actor_id=? OR a.details->>'ownerId'=?)
 """;
 @GetMapping @Transactional(readOnly=true)
 public ApiResponse<?> feed(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){
  var user=policy.requireCurrentActiveUser();if(page<0||page>10000||size<1||size>50)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid activity page");
  var total=sql.queryForObject("SELECT count(*) FROM ("+FEED+") activity",Long.class,user.getId(),user.getId(),user.getId().toString());
  var rows=sql.query("SELECT * FROM ("+FEED+") activity ORDER BY occurred_at DESC,id DESC,kind DESC LIMIT ? OFFSET ?",(rs,index)->{
   JsonNode job=null;String raw=rs.getString("job");if(raw!=null)try{job=json.readTree(raw);}catch(Exception invalid){throw new IllegalStateException("Invalid activity record");}
   return new Item(rs.getString("id"),rs.getString("kind"),rs.getString("project_id"),rs.getString("project_name"),rs.getTimestamp("occurred_at").toInstant().toString(),rs.getBoolean("project_deleted"),rs.getString("target_id"),rs.getString("target_name"),rs.getString("actor_id"),rs.getString("actor_name"),job);
  },user.getId(),user.getId(),user.getId().toString(),size,page*size);
  return ApiResponse.success(Map.of("items",rows,"total",total==null?0:total,"page",page,"size",size));
 }
}
