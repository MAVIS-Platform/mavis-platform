package com.mavis.bootstrap;
import com.mavis.platform.project.service.ProjectResourceDeletionService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.sql.*;
import java.nio.file.Path;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="MAVIS_MIGRATION_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class ResourceDeletionPostgresTest {
 @Test void cascadeLineageLatestAndRollbackUseRealPostgres()throws Exception{
  String adminUrl=System.getenv("MAVIS_MIGRATION_TEST_JDBC_URL"),user=System.getenv("MAVIS_MIGRATION_TEST_JDBC_USER"),password=System.getenv("MAVIS_MIGRATION_TEST_JDBC_PASSWORD"),db="mavis_delete_"+UUID.randomUUID().toString().replace("-","");
  try(var admin=DriverManager.getConnection(adminUrl,user,password);var command=admin.createStatement()){
   command.execute("CREATE DATABASE "+db);String url=adminUrl.substring(0,adminUrl.lastIndexOf('/')+1)+db;
   try{
    Flyway.configure().dataSource(url,user,password).locations("filesystem:"+Path.of("src/main/resources/db/migration").toAbsolutePath()).configuration(Map.of("flyway.postgresql.transactional.lock","false")).load().migrate();
    var data=new DriverManagerDataSource(url,user,password);var sql=new JdbcTemplate(data);var tx=new TransactionTemplate(new DataSourceTransactionManager(data));
    UUID uid=UUID.randomUUID(),pid=UUID.randomUUID(),s1=UUID.randomUUID(),s2=UUID.randomUUID(),m1=UUID.randomUUID(),m2=UUID.randomUUID(),m3=UUID.randomUUID();
    sql.update("INSERT INTO users(id,role_id,email,password_hash,full_name) SELECT ?,id,'delete-test@example.invalid','fixture','Delete test' FROM roles WHERE code='STUDENT'",uid);
    sql.update("INSERT INTO projects(id,owner_id,name,project_type) VALUES (?,?,'Deletion fixture','PERSONAL')",pid,uid);
    for(var sid:List.of(s1,s2))sql.update("INSERT INTO source_snapshots(id,project_id,artifact_hash) VALUES (?,?,'retained-content-hash')",sid,pid);
    sql.update("INSERT INTO model_versions(id,project_id,source_snapshot_id,revision,is_latest_valid) VALUES (?,?,?,1,false)",m1,pid,s1);
    sql.update("INSERT INTO model_versions(id,project_id,source_snapshot_id,revision,origin,is_latest_valid) VALUES (?,?,?,2,'USER_CONFIRMED',false)",m2,pid,s2);
    sql.update("INSERT INTO model_versions(id,project_id,source_snapshot_id,revision,base_model_version_id,is_latest_valid) VALUES (?,?,?,3,?,true)",m3,pid,s1,m1);
    // Exercise the exact native source-decision query against real PostgreSQL.
    String decisions=ModelElementRepository.CONTEXT_SOURCE_DECISIONS_SQL.replace(":projectId","?").replace(":revision","?");
    String addReview="INSERT INTO model_elements(id,model_version_id,element_type,name,properties) VALUES (?,?,'SERVICE_CONTAINER','Source review',?::jsonb)";
    UUID review1=UUID.randomUUID(),review2=UUID.randomUUID(),review3=UUID.randomUUID();
    sql.update(addReview,review1,m1,"{\"contextReview\":{\"entries\":[{\"sourceRoleKey\":\"source-a\",\"state\":\"REJECTED\"}]}}");
    sql.update(addReview,review2,m2,"{\"contextReview\":{\"entries\":[{\"sourceRoleKey\":\"source-a\",\"state\":\"CONFIRMED\"}]}}");
    sql.update(addReview,review3,m3,"{\"contextReview\":{\"entries\":[{\"sourceRoleKey\":\"source-b\",\"state\":\"REJECTED\"}]}}");
    assertEquals("REJECTED",sql.queryForList(decisions,pid,1).get(0).get("state"));
    var latest=sql.queryForList(decisions,pid,3);assertEquals(2,latest.size());assertEquals("CONFIRMED",latest.get(0).get("state"));assertEquals("REJECTED",latest.get(1).get("state"));assertTrue(sql.queryForList(decisions,UUID.randomUUID(),3).isEmpty());
    sql.update("DELETE FROM model_elements WHERE id IN (?,?,?)",review1,review2,review3);
    var projects=mock(ProjectRepository.class);var snapshots=mock(SourceSnapshotRepository.class);var project=Project.builder().id(pid).name("Deletion fixture").owner(User.builder().id(uid).build()).status("ACTIVE").build();
    when(projects.findLockedById(pid)).thenReturn(Optional.of(project));when(snapshots.findById(s1)).thenReturn(Optional.of(SourceSnapshot.builder().id(s1).project(project).build()));
    org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(uid.toString(),null,List.of()));
    when(projects.save(any())).thenAnswer(call->{Project value=call.getArgument(0);sql.update("UPDATE projects SET status=? WHERE id=?",value.getStatus(),value.getId());return value;});
    var service=new ProjectResourceDeletionService(projects,snapshots,mock(AccessPolicyService.class),sql);
    tx.executeWithoutResult(status->service.deleteSnapshot(pid,s1));
    assertEquals(1,sql.queryForObject("SELECT count(*) FROM audit_logs WHERE action='SNAPSHOT_DELETED' AND target_id=?",Integer.class,s1));
    assertEquals(0,sql.queryForObject("SELECT count(*) FROM source_snapshots WHERE id=?",Integer.class,s1));assertEquals(0,sql.queryForObject("SELECT count(*) FROM model_versions WHERE source_snapshot_id=?",Integer.class,s1));assertEquals(true,sql.queryForObject("SELECT is_latest_valid FROM model_versions WHERE id=?",Boolean.class,m2));
    // Another snapshot owns a child revision: deleting the base must roll back everything.
    sql.update("INSERT INTO source_snapshots(id,project_id,artifact_hash) VALUES (?,?,'retained-content-hash')",s1,pid);
    sql.update("INSERT INTO model_versions(id,project_id,source_snapshot_id,revision,is_latest_valid) VALUES (?,?,?,4,false)",m1,pid,s1);
    sql.update("UPDATE model_versions SET base_model_version_id=? WHERE id=?",m1,m2);
    assertThrows(BusinessException.class,()->tx.executeWithoutResult(status->service.deleteSnapshot(pid,s1)));
    assertEquals(1,sql.queryForObject("SELECT count(*) FROM source_snapshots WHERE id=?",Integer.class,s1));assertEquals(1,sql.queryForObject("SELECT count(*) FROM model_versions WHERE id=?",Integer.class,m1));assertEquals(true,sql.queryForObject("SELECT is_latest_valid FROM model_versions WHERE id=?",Boolean.class,m2));

    assertEquals(1,sql.queryForObject("SELECT count(*) FROM audit_logs",Integer.class));
    // If the audit insert cannot commit, deleting the data cannot commit either.
    sql.update("UPDATE model_versions SET base_model_version_id=NULL WHERE id=?",m2);
    sql.execute("CREATE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit rejection' USING ERRCODE='23514'; END $$");
    sql.execute("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit()");
    assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->tx.executeWithoutResult(status->service.deleteSnapshot(pid,s1)));
    assertEquals(1,sql.queryForObject("SELECT count(*) FROM source_snapshots WHERE id=?",Integer.class,s1));assertEquals(1,sql.queryForObject("SELECT count(*) FROM audit_logs",Integer.class));
    sql.execute("DROP TRIGGER reject_audit ON audit_logs");
    sql.update("INSERT INTO jobs(project_id,source_snapshot_id,job_type,status) VALUES (?,?,'STATIC_ANALYSIS','COMPLETED')",pid,s2);
    sql.update("INSERT INTO jobs(project_id,source_snapshot_id,job_type,status) VALUES (?,?,'EVALUATION','COMPLETED')",pid,s2);
    tx.executeWithoutResult(status->service.deleteProject(pid));
    assertEquals(2,sql.queryForObject("SELECT count(*) FROM audit_logs",Integer.class));
    var policy=mock(AccessPolicyService.class);when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(uid).build());
    var activity=new com.mavis.bootstrap.activity.ResourceActivityController(policy,sql,new com.fasterxml.jackson.databind.ObjectMapper());
    var dataPage=(Map<?,?>)activity.feed(0,10).getData();assertEquals(3L,dataPage.get("total"));
    var feed=(List<com.mavis.bootstrap.activity.ResourceActivityController.Item>)dataPage.get("items");assertTrue(feed.stream().allMatch(row->row.projectDeleted()));assertTrue(feed.stream().anyMatch(row->row.kind().equals("PROJECT_DELETED")&&row.projectName().equals("Deletion fixture")));assertTrue(feed.stream().anyMatch(row->row.kind().equals("SNAPSHOT_DELETED")));
    when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());
    assertEquals(0L,((Map<?,?>)activity.feed(0,10).getData()).get("total"));
   }finally{org.springframework.security.core.context.SecurityContextHolder.clearContext();command.execute("DROP DATABASE "+db+" WITH (FORCE)");}
  }
 }
}
