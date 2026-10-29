package com.mavis.platform.project.service;

import com.mavis.common.entity.Project;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import java.time.OffsetDateTime;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class ProjectResourceDeletionService {
 private final ProjectRepository projects;
 private final SourceSnapshotRepository snapshots;
 private final AccessPolicyService access;
 private final JdbcTemplate sql;
 private void audit(Project project,UUID target,String action,String targetName,String mode){
  var actor=com.mavis.common.utils.SecurityUtils.getCurrentUserId();
  var details=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode().put("schema","resource-deletion/v1").put("projectId",project.getId().toString()).put("projectName",project.getName()).put("targetName",targetName).put("mode",mode).put("actorId",actor.toString());
  if(project.getOwner()!=null)details.put("ownerId",project.getOwner().getId().toString());
  int written=sql.update("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,CAST(? AS jsonb))",actor,action,"PROJECT_DELETED".equals(action)?"PROJECT":"SOURCE_SNAPSHOT",target,details.toString());
  if(written!=1)throw new IllegalStateException("Deletion audit was not persisted; transaction must roll back");
 }
 private Project lock(UUID id){var project=projects.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Project not found"));access.requireProjectWriteAccess(project);return project;}
 private boolean exists(String query,Object... args){return Boolean.TRUE.equals(sql.queryForObject(query,Boolean.class,args));}
 private void conflict(String message){throw new BusinessException(ErrorCode.CONFLICT,message);}
 private void idle(UUID project){
  if(exists("SELECT EXISTS (SELECT 1 FROM jobs WHERE project_id=? AND status IN ('PENDING','RUNNING','CANCELLING'))",project)||exists("SELECT EXISTS (SELECT 1 FROM runtime_sessions WHERE project_id=? AND (execution_status IN ('NOT_STARTED','PENDING','READY_FOR_DISPATCH','APPROVED','ALLOCATED','RUNNING','CANCELLING') OR cleanup_status IN ('UNCONFIRMED','INCOMPLETE','STOP_REQUESTED','RECOVERY_REQUIRED')))",project))conflict("Deletion is blocked while analysis or runtime work is active or cleanup is unresolved.");
 }
 @Transactional(rollbackFor=Exception.class)
 public void deleteProject(UUID id){
  var project=lock(id);if("DELETED".equals(project.getStatus()))return;idle(id);
  if(exists("SELECT EXISTS (SELECT 1 FROM source_snapshots WHERE project_id=? AND (is_published=true OR EXISTS (SELECT 1 FROM projects p WHERE p.reference_snapshot_id=source_snapshots.id)))",id)||exists("SELECT EXISTS (SELECT 1 FROM submission_snapshots s JOIN source_snapshots ss ON ss.id=s.source_snapshot_id WHERE ss.project_id=?)",id))conflict("Deletion is blocked for published reference data or submitted coursework.");
  project.setStatus("DELETED");project.setUpdatedAt(OffsetDateTime.now());projects.save(project);
  audit(project,id,"PROJECT_DELETED",project.getName(),"SOFT_DELETE");
 }
 @Transactional(rollbackFor=Exception.class)
 public void deleteSnapshot(UUID projectId,UUID snapshotId){
  var project=lock(projectId);if("DELETED".equals(project.getStatus()))throw new BusinessException(ErrorCode.NOT_FOUND,"Project not found");
  var snapshot=snapshots.findById(snapshotId).filter(s->s.getProject().getId().equals(projectId)).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Snapshot not found"));
  idle(projectId);
  if(Boolean.TRUE.equals(snapshot.getIsPublished())||exists("SELECT EXISTS (SELECT 1 FROM projects WHERE reference_snapshot_id=?)",snapshotId)||exists("SELECT EXISTS (SELECT 1 FROM submission_snapshots WHERE source_snapshot_id=?)",snapshotId)||exists("SELECT EXISTS (SELECT 1 FROM runtime_sessions WHERE source_snapshot_id=?)",snapshotId))conflict("Deletion is blocked for published, submitted or runtime-linked snapshots.");
  boolean removesLatest=exists("SELECT EXISTS (SELECT 1 FROM model_versions WHERE source_snapshot_id=? AND project_id=? AND is_latest_valid=true)",snapshotId,projectId);
  try{
   // Database constraints protect cross-snapshot lineage and other retained references.
   sql.update("DELETE FROM model_versions WHERE source_snapshot_id=? AND project_id=?",snapshotId,projectId);
   if(sql.update("DELETE FROM source_snapshots WHERE id=? AND project_id=?",snapshotId,projectId)!=1)throw new BusinessException(ErrorCode.CONFLICT,"Snapshot changed; refresh before deleting.");
   if(removesLatest){
    // Restore only a previously promoted result, never an arbitrary partial draft.
    var replacements=sql.queryForList("SELECT m.id FROM model_versions m WHERE m.project_id=? AND (m.origin='USER_CONFIRMED' OR (m.origin='GENERATED' AND EXISTS (SELECT 1 FROM jobs j WHERE j.project_id=m.project_id AND j.result_manifest->>'modelVersionId'=m.id::text AND j.result_manifest->>'promotedLatest'='true'))) ORDER BY m.revision DESC LIMIT 1",UUID.class,projectId);
    if(!replacements.isEmpty())sql.update("UPDATE model_versions SET is_latest_valid=true WHERE id=?",replacements.get(0));
   }
  }catch(DataIntegrityViolationException referenced){throw new BusinessException(ErrorCode.CONFLICT,"This snapshot has dependent revisions or protected records.");}
  project.setUpdatedAt(OffsetDateTime.now());projects.save(project);
  String label="GITHUB_COMMIT".equals(snapshot.getSourceType())?(snapshot.getBranchName()==null?"Unknown branch":snapshot.getBranchName())+" / "+(snapshot.getCommitSha()==null?"Unknown commit":snapshot.getCommitSha().substring(0,Math.min(8,snapshot.getCommitSha().length()))):"ZIP upload";
  audit(project,snapshotId,"SNAPSHOT_DELETED",label,"HARD_DELETE");
  // Immutable artifacts may be shared by other snapshots. Storage retention handles physical files.
 }
}
