package com.mavis.platform.project.service;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class ProjectResourceDeletionServiceTest {
 final ProjectRepository projects=mock(ProjectRepository.class);final SourceSnapshotRepository snapshots=mock(SourceSnapshotRepository.class);final AccessPolicyService access=mock(AccessPolicyService.class);final JdbcTemplate sql=mock(JdbcTemplate.class);
 final ProjectResourceDeletionService service=new ProjectResourceDeletionService(projects,snapshots,access,sql);
 final UUID pid=UUID.randomUUID(),sid=UUID.randomUUID();final Project project=Project.builder().id(pid).status("ACTIVE").build();final SourceSnapshot snapshot=SourceSnapshot.builder().id(sid).project(project).build();
 @BeforeEach void setup(){when(sql.update(startsWith("INSERT INTO audit_logs"),any(UUID.class),anyString(),anyString(),any(UUID.class),anyString())).thenReturn(1);org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of()));when(projects.findLockedById(pid)).thenReturn(Optional.of(project));when(snapshots.findById(sid)).thenReturn(Optional.of(snapshot));when(sql.update("DELETE FROM source_snapshots WHERE id=? AND project_id=?",sid,pid)).thenReturn(1);}
 @Test void projectDeletionRetainsSnapshotAndHistory(){service.deleteProject(pid);assertThat(project.getStatus()).isEqualTo("DELETED");verify(projects).save(project);verify(sql,never()).update(startsWith("DELETE"),any(Object[].class));verify(sql).update(startsWith("INSERT INTO audit_logs"),any(UUID.class),eq("PROJECT_DELETED"),eq("PROJECT"),eq(pid),contains("SOFT_DELETE"));verifyNoInteractions(snapshots);}
 @Test void activeAnalysisBlocksDeletion(){when(sql.queryForObject(contains("FROM jobs"),eq(Boolean.class),eq(pid))).thenReturn(true);assertThatThrownBy(()->service.deleteProject(pid)).isInstanceOf(BusinessException.class);verify(projects,never()).save(any());}
 @Test void publishedProjectCannotBeRemoved(){when(sql.queryForObject(contains("is_published=true"),eq(Boolean.class),eq(pid))).thenReturn(true);assertThatThrownBy(()->service.deleteProject(pid)).isInstanceOf(BusinessException.class);verify(projects,never()).save(any());}
 @Test void deletesOnlySnapshotsOwnRevisions(){service.deleteSnapshot(pid,sid);verify(sql).update("DELETE FROM model_versions WHERE source_snapshot_id=? AND project_id=?",sid,pid);verify(sql).update("DELETE FROM source_snapshots WHERE id=? AND project_id=?",sid,pid);verify(projects).save(project);verify(sql,never()).update(contains("is_latest_valid=true"),any(Object[].class));}
 @Test void snapshotFromAnotherProjectRejected(){snapshot.setProject(Project.builder().id(UUID.randomUUID()).build());assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(BusinessException.class);verifyNoInteractions(sql);}
 @Test void publishedSnapshotRejected(){snapshot.setIsPublished(true);assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(BusinessException.class);verify(sql,never()).update(anyString(),any(Object[].class));}
 @Test void runtimeHistoryProtectsSnapshot(){when(sql.queryForObject(contains("runtime_sessions WHERE source_snapshot_id"),eq(Boolean.class),eq(sid))).thenReturn(true);assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(BusinessException.class);verify(sql,never()).update(anyString(),any(Object[].class));}
 @Test void foreignKeyFailureBecomesConflict(){doThrow(new DataIntegrityViolationException("protected FK")).when(sql).update("DELETE FROM model_versions WHERE source_snapshot_id=? AND project_id=?",sid,pid);assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(BusinessException.class).hasMessageContaining("dependent revisions");verify(projects,never()).save(any());}
 @Test void permissionDeniedBeforeDeletion(){doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN,"Denied")).when(access).requireProjectWriteAccess(project);assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(BusinessException.class);verifyNoInteractions(sql,snapshots);}
 @Test void deletingLatestRestoresOnlyExplicitlyPromotedCandidate(){UUID replacement=UUID.randomUUID();when(sql.queryForObject(contains("is_latest_valid=true"),eq(Boolean.class),eq(sid),eq(pid))).thenReturn(true);when(sql.queryForList(contains("SELECT m.id"),eq(UUID.class),eq(pid))).thenReturn(List.of(replacement));service.deleteSnapshot(pid,sid);verify(sql).update("UPDATE model_versions SET is_latest_valid=true WHERE id=?",replacement);}
 @Test void missingPromotedCandidateDoesNotInventLatest(){when(sql.queryForObject(contains("is_latest_valid=true"),eq(Boolean.class),eq(sid),eq(pid))).thenReturn(true);service.deleteSnapshot(pid,sid);verify(sql,never()).update(contains("UPDATE model_versions"),any(Object[].class));}
 @AfterEach void clear(){org.springframework.security.core.context.SecurityContextHolder.clearContext();}
 @Test void snapshotDeletionRecordsIndependentAuditWithTargetIdentity(){service.deleteSnapshot(pid,sid);verify(sql).update(startsWith("INSERT INTO audit_logs"),any(UUID.class),eq("SNAPSHOT_DELETED"),eq("SOURCE_SNAPSHOT"),eq(sid),contains("HARD_DELETE"));}
 @Test void missingAuditInsertCannotReportDeletionSuccess(){when(sql.update(startsWith("INSERT INTO audit_logs"),any(UUID.class),anyString(),anyString(),any(UUID.class),anyString())).thenReturn(0);assertThatThrownBy(()->service.deleteSnapshot(pid,sid)).isInstanceOf(IllegalStateException.class).hasMessageContaining("audit was not persisted");}
}
