package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.workerclient.WorkerContract;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class WorkerPublicationIntegrationTest {
    @TempDir Path temp;
    private AnnotationConfigApplicationContext spring;
    private JdbcTemplate db;
    private WorkerModelPublisher publisher;
    private UUID project,snapshot,job,attempt;
    private Instant deadline;

    @Configuration @EnableTransactionManagement @EnableJpaRepositories(basePackages="com.mavis.common.repository")
    static class Config {
        @Bean DriverManagerDataSource dataSource() {
            var ds=new DriverManagerDataSource(System.getenv("MAVIS_TEST_JDBC_URL"),System.getenv("MAVIS_TEST_JDBC_USER"),System.getenv("MAVIS_TEST_JDBC_PASSWORD"));
            return ds;
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DriverManagerDataSource ds) {
            var populator=new ResourceDatabasePopulator(new ClassPathResource("worker-migrations/V1__Init_Database.sql"),new ClassPathResource("worker-migrations/V2__Create_User_Otp_Table.sql"),new ClassPathResource("worker-migrations/V3__Worker_Evidence_Provenance.sql"));
            populator.execute(ds);
            var factory=new LocalContainerEntityManagerFactoryBean();factory.setDataSource(ds);factory.setPackagesToScan("com.mavis.common.entity");factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto","none"));return factory;
        }
        @Bean PlatformTransactionManager transactionManager(jakarta.persistence.EntityManagerFactory factory){return new JpaTransactionManager(factory);}
        @Bean ObjectMapper objectMapper(){return new ObjectMapper();}
        @Bean GraphBuilderService graph(ModelElementRepository e,ModelRelationshipRepository r,EvidenceRepository v){return new GraphBuilderServiceImpl(e,r,v);}
        @Bean WorkerCanonicalImporter importer(ModelElementRepository e,ModelRelationshipRepository r,EvidenceRepository v,ObjectMapper json){return new WorkerCanonicalImporter(e,r,v,json);}
        @Bean WorkerModelPublisher publisher(JobRepository j,ProjectRepository p,ModelVersionRepository m,ModelElementRepository e,ModelRelationshipRepository r,EvidenceRepository v,GraphBuilderService g,WorkerCanonicalImporter i,ObjectMapper json){return new WorkerModelPublisher(j,p,m,e,r,v,g,i,json);}
    }
    @BeforeEach void start() {
        Assumptions.assumeTrue(System.getenv("MAVIS_TEST_JDBC_URL")!=null && System.getenv("MAVIS_WORKER_TEST_URL")!=null,"Run live database integration harness");
        // The harness provides a new disposable database for this test class.
        spring=new AnnotationConfigApplicationContext(Config.class);db=new JdbcTemplate(spring.getBean(DriverManagerDataSource.class));publisher=spring.getBean(WorkerModelPublisher.class);
        project=UUID.randomUUID();snapshot=UUID.randomUUID();job=UUID.randomUUID();attempt=UUID.randomUUID();deadline=Instant.now().plusSeconds(90);
        UUID owner=db.queryForObject("select id from users limit 1",UUID.class);
        db.update("insert into projects(id,owner_id,name,project_type) values(?,?,?,?)",project,owner,"integration","PERSONAL");
        db.update("insert into source_snapshots(id,project_id,source_type,artifact_hash) values(?,?,?,?)",snapshot,project,"ZIP_UPLOAD","a".repeat(64));
        db.update("insert into jobs(id,project_id,source_snapshot_id,job_type) values(?,?,?,?)",job,project,snapshot,"STATIC_ANALYSIS");
        assertTrue(publisher.begin(job,attempt,deadline));
    }
    @AfterEach void stop(){if(spring!=null)spring.close();}

    @Test void realWorkerResultPublishesAndReloadsProvenanceWhileInvalidAttemptsRollback()throws Exception {
        Path source=Files.createDirectory(temp.resolve("source"));
        Files.writeString(source.resolve("App.csproj"),"<Project />");Files.writeString(source.resolve("App.cs"),"interface IStore {} class App : IStore { public App(IStore store) {} }");
        var client=new DotnetWorkerClientServiceImpl(true,System.getenv("MAVIS_WORKER_TEST_URL"),"test-service-key","test","fixture-only-not-for-production-32-byte-key",temp.toString(),System.getenv("MAVIS_WORKER_TEST_ARTIFACT_ROOT"),Clock.systemUTC());
        var execution=client.analyze(project,snapshot,job,attempt,source.toString(),deadline);
        assertEquals(WorkerContract.Status.COMPLETED,execution.outcome().status(),execution.outcome().code());
        UUID model=publisher.publish(job,attempt,deadline,source.toString(),List.of(),List.of(),false,execution);
        assertEquals("COMPLETED",db.queryForObject("select status from jobs where id=?",String.class,job));
        assertEquals(true,db.queryForObject("select is_latest_valid from model_versions where id=?",Boolean.class,model));
        assertTrue(db.queryForObject("select count(*) from model_elements where model_version_id=? and properties->>'workerLogicalId' is not null",Integer.class,model)>0);
        assertTrue(db.queryForObject("select count(*) from model_relationships where model_version_id=? and relation_type='CODE_DEPENDENCY'",Integer.class,model)>0);
        assertEquals(0,db.queryForObject("select count(*) from evidences where model_version_id=? and (provenance->>'fileHash' is null or provenance->>'sourceSnapshotId' <> ?)",Integer.class,model,snapshot.toString()));
        assertEquals(0,db.queryForObject("select count(*) from model_elements where model_version_id=? and status='VALIDATED'",Integer.class,model));
        assertThrows(IllegalStateException.class,()->publisher.publish(job,attempt,deadline,source.toString(),List.of(),List.of(),false,execution));
        assertEquals(1,db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project));

        UUID second=UUID.randomUUID(),nextAttempt=UUID.randomUUID();db.update("insert into jobs(id,project_id,source_snapshot_id,job_type) values(?,?,?,?)",second,project,snapshot,"STATIC_ANALYSIS");publisher.begin(second,nextAttempt,deadline);
        var wrong=new DotnetWorkerClientService.Execution(execution.context(),execution.outcome());
        assertThrows(IllegalArgumentException.class,()->publisher.publish(second,nextAttempt,deadline,source.toString(),List.of(),List.of(),false,wrong));
        var failed=new DotnetWorkerClientService.Execution(null,WorkerContract.Outcome.failure(WorkerContract.Status.FAILED,"WORKER_UNAVAILABLE"));
        assertThrows(IllegalStateException.class,()->publisher.publish(second,nextAttempt,deadline,source.toString(),List.of(),List.of(),false,failed));
        assertEquals(1,db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project));
        UUID partial=publisher.publish(second,nextAttempt,deadline,source.toString(),List.of("java-service"),List.of(),true,failed);
        assertEquals(false,db.queryForObject("select is_latest_valid from model_versions where id=?",Boolean.class,partial));
        assertEquals(true,db.queryForObject("select is_latest_valid from model_versions where id=?",Boolean.class,model));
        assertEquals("PARTIAL",db.queryForObject("select result_manifest->>'completeness' from jobs where id=?",String.class,second));

        UUID third=UUID.randomUUID(),thirdAttempt=UUID.randomUUID();
        db.update("insert into jobs(id,project_id,source_snapshot_id,job_type) values(?,?,?,?)",third,project,snapshot,"STATIC_ANALYSIS");publisher.begin(third,thirdAttempt,deadline);
        var thirdExecution=client.analyze(project,snapshot,third,thirdAttempt,source.toString(),deadline);
        assertEquals(WorkerContract.Status.COMPLETED,thirdExecution.outcome().status());
        var json=spring.getBean(ObjectMapper.class);
        var corrupted=json.valueToTree(thirdExecution.outcome().result());
        ((com.fasterxml.jackson.databind.node.ObjectNode)corrupted.path("canonical").path("elements").get(0)).put("name","x".repeat(300));
        var malformed=json.treeToValue(corrupted,WorkerContract.Result.class);
        var rollback=new DotnetWorkerClientService.Execution(thirdExecution.context(),new WorkerContract.Outcome(WorkerContract.Status.COMPLETED,"OK",malformed));
        assertThrows(RuntimeException.class,()->publisher.publish(third,thirdAttempt,deadline,source.toString(),List.of(),List.of(),false,rollback));
        assertEquals(2,db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project));
        assertEquals(true,db.queryForObject("select is_latest_valid from model_versions where id=?",Boolean.class,model));
        db.update("update jobs set status='CANCELLED' where id=?",third);
        assertThrows(IllegalStateException.class,()->publisher.publish(third,thirdAttempt,deadline,source.toString(),List.of(),List.of(),false,thirdExecution));
    }
}
