package com.mavis.bootstrap.notifications;
import com.mavis.common.entity.User;
import com.mavis.common.security.AccessPolicyService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.sql.*;
import java.time.Instant;
import java.nio.file.Path;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="MAVIS_MIGRATION_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class NotificationReadPostgresTest {
 @Test void readAllPersistsRealTimestampsAndPreservesNewAndForeignNotifications()throws Exception{
  String adminUrl=System.getenv("MAVIS_MIGRATION_TEST_JDBC_URL"),user=System.getenv("MAVIS_MIGRATION_TEST_JDBC_USER"),password=System.getenv("MAVIS_MIGRATION_TEST_JDBC_PASSWORD"),db="mavis_noti_read_"+UUID.randomUUID().toString().replace("-","");
  try(var admin=DriverManager.getConnection(adminUrl,user,password);var command=admin.createStatement()){
   command.execute("CREATE DATABASE "+db);String url=adminUrl.substring(0,adminUrl.lastIndexOf('/')+1)+db;
   try{
    Flyway.configure().dataSource(url,user,password).locations("filesystem:"+Path.of("src/main/resources/db/migration").toAbsolutePath()).configuration(Map.of("flyway.postgresql.transactional.lock","false")).load().migrate();
    var data=new DriverManagerDataSource(url,user,password);var sql=new JdbcTemplate(data);var tx=new TransactionTemplate(new DataSourceTransactionManager(data));
    UUID a=UUID.randomUUID(),b=UUID.randomUUID(),newId=UUID.randomUUID(),foreignId=UUID.randomUUID();
    for(var id:List.of(a,b))sql.update("INSERT INTO users(id,role_id,email,password_hash,full_name) SELECT ?,id,?,'fixture','Read fixture' FROM roles WHERE code='STUDENT'",id,id+"@example.invalid");
    Instant cutoff=Instant.now().minusSeconds(10).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    String insert="INSERT INTO user_notifications(id,recipient_id,event_key,category,title,body,target_path,created_at) VALUES (?,?,?,'SYSTEM','Read fixture','Fixture only','/profile',?)";
    for(int i=0;i<7;i++)sql.update(insert,UUID.randomUUID(),a,"old-"+i,Timestamp.from(cutoff.minusSeconds(1)));
    sql.update(insert,newId,a,"new",Timestamp.from(cutoff.plusNanos(1000)));sql.update(insert,foreignId,b,"foreign",Timestamp.from(cutoff.minusSeconds(1)));
    var policy=mock(AccessPolicyService.class);when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(a).build());var controller=new NotificationController(policy,sql);
    var ack=(Map<?,?>)tx.execute(status->controller.readAll(new NotificationController.ReadAll(cutoff))).getData();
    assertEquals(a.toString(),ack.get("recipientId"));assertEquals(1L,ack.get("unreadCount"));
    assertEquals(7,sql.queryForObject("SELECT count(*) FROM user_notifications WHERE recipient_id=? AND read_at IS NOT NULL",Integer.class,a));
    var stored=sql.queryForObject("SELECT read_at FROM user_notifications WHERE recipient_id=? AND event_key='old-0'",Timestamp.class,a);assertEquals(Instant.parse((String)ack.get("readAt")),stored.toInstant());
    assertNull(sql.queryForObject("SELECT read_at FROM user_notifications WHERE id=?",Timestamp.class,newId));assertNull(sql.queryForObject("SELECT read_at FROM user_notifications WHERE id=?",Timestamp.class,foreignId));
    var single=(Map<?,?>)tx.execute(status->controller.read(newId)).getData();assertEquals(0L,single.get("unreadCount"));
    var repeat=(Map<?,?>)tx.execute(status->controller.read(newId)).getData();assertEquals(single.get("readAt"),repeat.get("readAt"));
    assertThrows(ResponseStatusException.class,()->tx.execute(status->controller.read(foreignId)));assertNull(sql.queryForObject("SELECT read_at FROM user_notifications WHERE id=?",Timestamp.class,foreignId));
    UUID future=UUID.randomUUID();sql.update(insert,future,a,"future",Timestamp.from(Instant.now().plusSeconds(3600)));
    var futureAck=(Map<?,?>)tx.execute(status->controller.readAll(new NotificationController.ReadAll(Instant.now().plusSeconds(7200)))).getData();
    assertFalse(Instant.parse((String)futureAck.get("before")).isAfter(Instant.parse((String)futureAck.get("asOf"))));assertNull(sql.queryForObject("SELECT read_at FROM user_notifications WHERE id=?",Timestamp.class,future));
   }finally{command.execute("DROP DATABASE "+db+" WITH (FORCE)");}
  }
 }
}
