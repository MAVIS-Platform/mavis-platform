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
    var projects=mock(ProjectRepository.class);var snapshots=mock(SourceSnapshotRepository.class);var project=Project.builder().id(pid).status("READY").build();
    when(projects.findLockedById(pid)).thenReturn(Optional.of(project));when(snapshots.findById(s1)).thenReturn(Optional.of(SourceSnapshot.builder().id(s1).project(project).build()));
    var service=new ProjectResourceDeletionService(projects,snapshots,mock(AccessPolicyService.class),sql);
    tx.executeWithoutResult(status->service.deleteSnapshot(pid,s1));
    assertEquals(0,sql.queryForObject("SELECT count(*) FROM source_snapshots WHERE id=?",Integer.class,s1));assertEquals(0,sql.queryForObject("SELECT count(*) FROM model_versions WHERE source_snapshot_id=?",Integer.class,s1));assertEquals(true,sql.queryForObject("SELECT is_latest_valid FROM model_versions WHERE id=?",Boolean.class,m2));
    // Another snapshot owns a child revision: deleting the base must roll back everything.
    sql.update("INSERT INTO source_snapshots(id,project_id,artifact_hash) VALUES (?,?,'retained-content-hash')",s1,pid);
    sql.update("INSERT INTO model_versions(id,project_id,source_snapshot_id,revision,is_latest_valid) VALUES (?,?,?,4,false)",m1,pid,s1);
    sql.update("UPDATE model_versions SET base_model_version_id=? WHERE id=?",m1,m2);
    assertThrows(BusinessException.class,()->tx.executeWithoutResult(status->service.deleteSnapshot(pid,s1)));
    assertEquals(1,sql.queryForObject("SELECT count(*) FROM source_snapshots WHERE id=?",Integer.class,s1));assertEquals(1,sql.queryForObject("SELECT count(*) FROM model_versions WHERE id=?",Integer.class,m1));assertEquals(true,sql.queryForObject("SELECT is_latest_valid FROM model_versions WHERE id=?",Boolean.class,m2));
   }finally{command.execute("DROP DATABASE "+db+" WITH (FORCE)");}
  }
 }
}
