package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.orchestrator.service.impl.*;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import static org.junit.jupiter.api.Assertions.*;

class JobLifecycleIntegrationTest {
    @Configuration @Import(WorkerPublicationIntegrationTest.Config.class)
    static class Config {
        @Bean JobControlService controls(JobRepository j,AnalysisAttemptRepository a,AnalysisExecutionRegistry x,ApplicationEventPublisher e,ObjectMapper json){return new JobControlService(j,a,x,e,json);}
    }
    private AnnotationConfigApplicationContext spring;private JdbcTemplate db;private UUID owner,project,snapshot;
    @BeforeEach void start(){Assumptions.assumeTrue(System.getenv("MAVIS_TEST_JDBC_URL")!=null,"Run database harness");spring=new AnnotationConfigApplicationContext(Config.class);db=new JdbcTemplate(spring.getBean(DriverManagerDataSource.class));owner=db.queryForObject("select id from users limit 1",UUID.class);project=UUID.randomUUID();snapshot=UUID.randomUUID();
        db.update("insert into projects(id,owner_id,name,project_type) values(?,?,?,?)",project,owner,"lifecycle","PERSONAL");db.update("insert into source_snapshots(id,project_id,source_type,artifact_hash,storage_path) values(?,?,?,?,?)",snapshot,project,"ZIP_UPLOAD","a".repeat(64),"/snapshot.zip");auth(owner);}
    private void auth(UUID id){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id.toString(),"test",List.of()));}
    private UUID job(){UUID id=UUID.randomUUID();db.update("insert into jobs(id,project_id,source_snapshot_id,job_type) values(?,?,?,?)",id,project,snapshot,"STATIC_ANALYSIS");return id;}
    @AfterEach void close(){SecurityContextHolder.clearContext();if(spring!=null)spring.close();}
    @Test void pendingCancelIsIdempotentAndNeverStartsAttempt(){var id=job();var controls=spring.getBean(JobControlService.class);assertEquals("CANCELLED",controls.cancel(id).status());assertEquals("CANCELLED",controls.cancel(id).status());assertFalse(spring.getBean(WorkerModelPublisher.class).begin(id,UUID.randomUUID(),Instant.now().plusSeconds(30)));assertTrue(controls.history(id).isEmpty());}
    @Test void runningCancellationWaitsForExecutionAcknowledgement()throws Exception{
        UUID id=job(),attempt=UUID.randomUUID();var publisher=spring.getBean(WorkerModelPublisher.class);assertTrue(publisher.begin(id,attempt,Instant.now().plusSeconds(30)));
        var registry=spring.getBean(AnalysisExecutionRegistry.class);var started=new CountDownLatch(1);
        var thread=new Thread(()->{registry.register(id);started.countDown();try{Thread.sleep(30000);}catch(InterruptedException expected){}finally{registry.unregister(id);publisher.acknowledgeCancellation(id,attempt);}});thread.start();assertTrue(started.await(3,java.util.concurrent.TimeUnit.SECONDS));
        assertEquals("CANCELLING",spring.getBean(JobControlService.class).cancel(id).status());thread.join(3000);assertFalse(thread.isAlive());
        assertEquals("CANCELLED",db.queryForObject("select status from jobs where id=?",String.class,id));assertEquals("CANCELLED",spring.getBean(JobControlService.class).history(id).get(0).status());
    }
    @Test void abandonedDeadlineCannotPublishAndPendingDispatchIsRecoverable(){
        UUID id=job(),attempt=UUID.randomUUID();Instant deadline=Instant.now().plusSeconds(30);var publisher=spring.getBean(WorkerModelPublisher.class);assertTrue(publisher.begin(id,attempt,deadline));
        db.update("update analysis_attempts set deadline_utc=now()-interval '1 second' where id=?",attempt);spring.getBean(JobControlService.class).reconcile(id);
        assertEquals("FAILED",db.queryForObject("select status from jobs where id=?",String.class,id));assertEquals("ATTEMPT_DEADLINE_EXPIRED",spring.getBean(JobControlService.class).history(id).get(0).diagnosticCode());
        assertThrows(IllegalStateException.class,()->publisher.publish(id,attempt,deadline,"/source",List.of(),List.of(),false,null));
        var received=new ArrayList<AnalyzeRequestEvent>();spring.addApplicationListener(event->{if(event instanceof PayloadApplicationEvent<?> payload&&payload.getPayload() instanceof AnalyzeRequestEvent request)received.add(request);});
        UUID pending=job();db.update("update jobs set started_at=now()-interval '40 seconds' where id=?",pending);
        spring.getBean(JobControlService.class).reconcile(pending);spring.getBean(JobControlService.class).reconcile(pending);assertEquals(1,received.size());assertEquals(pending,received.get(0).jobId());
    }
    @Test void terminalResultsAndOwnerPolicyArePreserved(){UUID id=job();db.update("update jobs set status='COMPLETED',result_manifest='{\"modelVersionId\":\"existing\"}'::jsonb where id=?",id);var controls=spring.getBean(JobControlService.class);assertEquals("COMPLETED",controls.cancel(id).status());
        auth(UUID.randomUUID());assertThrows(com.mavis.common.exception.BusinessException.class,()->controls.cancel(id));assertThrows(com.mavis.common.exception.BusinessException.class,()->controls.history(id));
        assertEquals("existing",db.queryForObject("select result_manifest->>'modelVersionId' from jobs where id=?",String.class,id));}
}
