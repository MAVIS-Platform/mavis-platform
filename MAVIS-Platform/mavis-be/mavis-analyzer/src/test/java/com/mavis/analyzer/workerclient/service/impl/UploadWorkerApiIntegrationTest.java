package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.detector.docker.service.impl.DockerDetectorServiceImpl;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.analyzer.orchestrator.controller.JobController;
import com.mavis.analyzer.orchestrator.service.impl.*;
import com.mavis.analyzer.storage.service.*;
import com.mavis.analyzer.upload.controller.UploadController;
import com.mavis.analyzer.upload.service.impl.SourceIngestionServiceImpl;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.exception.GlobalExceptionHandler;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.*;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real MVC controllers + transactional ingestion/events/orchestrator + live Worker and PostgreSQL. */
class UploadWorkerApiIntegrationTest {
    @TempDir Path root;
    private AnnotationConfigWebApplicationContext spring;
    private MockMvc mvc;
    private JdbcTemplate db;
    private UUID owner,project;
    private final ObjectMapper json=new ObjectMapper();

    @Configuration @EnableWebMvc @EnableAsync
    @Import({WorkerPublicationIntegrationTest.Config.class,UploadController.class,JobController.class,GlobalExceptionHandler.class})
    static class WebConfig {
        @Bean StorageService storage(org.springframework.core.env.Environment env) {
            var storage=new LocalDiskStorageServiceImpl();ReflectionTestUtils.setField(storage,"uploadDir",env.getRequiredProperty("it.upload-root"));return storage;
        }
        @Bean SourceIngestionServiceImpl ingestion(StorageService s,ApplicationEventPublisher e,ProjectRepository p,SourceSnapshotRepository snapshots,JobRepository jobs){return new SourceIngestionServiceImpl(s,e,p,snapshots,jobs);}
        @Bean DotnetWorkerClientService worker(org.springframework.core.env.Environment env){return new DotnetWorkerClientServiceImpl(true,System.getenv("MAVIS_WORKER_TEST_URL"),env.getRequiredProperty("it.service-key"),"test","fixture-only-not-for-production-32-byte-key",env.getRequiredProperty("it.upload-root"),System.getenv("MAVIS_WORKER_TEST_ARTIFACT_ROOT"),Clock.systemUTC());}
        @Bean AnalyzerOrchestratorServiceImpl orchestrator(ProjectRepository p,SourceSnapshotRepository s,JobRepository j,DotnetWorkerClientService w,WorkerModelPublisher publisher){return new AnalyzerOrchestratorServiceImpl(p,s,j,new DockerDetector(new DockerDetectorServiceImpl()),new JavaSourceParser(),w,publisher);}
        @Bean JobServiceImpl jobs(JobRepository j,ProjectRepository p){return new JobServiceImpl(j,p);}
    }
    private void start(boolean validKey)throws Exception {
        Assumptions.assumeTrue(System.getenv("MAVIS_TEST_JDBC_URL")!=null && System.getenv("MAVIS_WORKER_TEST_URL")!=null,"Run live API integration harness");
        Path uploads=Files.createDirectory(root.resolve("uploads"));
        spring=new AnnotationConfigWebApplicationContext();spring.setServletContext(new MockServletContext());
        spring.getEnvironment().getPropertySources().addFirst(new MapPropertySource("integration",Map.of("it.upload-root",uploads.toString(),"mavis.storage.upload-dir",uploads.toString(),"it.service-key",validKey?"test-service-key":"wrong-key")));
        spring.register(WebConfig.class);spring.refresh();mvc=MockMvcBuilders.webAppContextSetup(spring).build();
        db=new JdbcTemplate(spring.getBean(DriverManagerDataSource.class));owner=db.queryForObject("select id from users limit 1",UUID.class);project=UUID.randomUUID();
        db.update("insert into projects(id,owner_id,name,project_type) values(?,?,?,?)",project,owner,"public API integration","PERSONAL");authenticate(owner);
    }
    private void authenticate(UUID user){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.toString(),"test",List.of()));}
    private byte[] zip(Map<String,String> files)throws Exception {
        var bytes=new java.io.ByteArrayOutputStream();try(var archive=new java.util.zip.ZipOutputStream(bytes)){for(var file:files.entrySet()){archive.putNextEntry(new java.util.zip.ZipEntry(file.getKey()));archive.write(file.getValue().getBytes(java.nio.charset.StandardCharsets.UTF_8));archive.closeEntry();}}return bytes.toByteArray();
    }
    private JsonNode upload(Map<String,String> files)throws Exception {
        var response=mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.zip","application/zip",zip(files))).param("projectId",project.toString())).andExpect(status().isOk()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).required("data");
    }
    private JsonNode terminal(String job)throws Exception {
        Instant timeout=Instant.now().plusSeconds(45);
        while(Instant.now().isBefore(timeout)) {
            var response=mvc.perform(get("/api/v1/analyzer/jobs/"+job)).andExpect(status().isOk()).andReturn();
            var state=json.readTree(response.getResponse().getContentAsString()).required("data");
            if(Set.of("COMPLETED","FAILED","CANCELLED").contains(state.path("status").asText()))return state;
            Thread.sleep(100);
        }
        fail("API analysis did not reach a terminal state");return null;
    }
    @Test void multipartUploadDispatchesAfterCommitAndApiExposesRealWorkerProvenance()throws Exception {
        start(true);
        var accepted=upload(Map.of("App.csproj","<Project />","App.cs","interface IStore {} class App : IStore {}"));
        var result=terminal(accepted.required("jobId").asText());
        assertEquals("COMPLETED_WITH_REVIEW",result.required("analysisState").asText());assertEquals("COMPLETED",result.required("dotnetStatus").asText());assertTrue(result.required("promotedLatest").asBoolean());
        assertEquals(accepted.required("snapshotId").asText(),result.required("sourceSnapshotId").asText());
        String model=result.required("modelVersionId").asText();
        assertTrue(db.queryForObject("select count(*) from evidences where model_version_id=? and provenance->>'sourceSnapshotId'=?",Integer.class,UUID.fromString(model),accepted.required("snapshotId").asText())>0);
        var history=mvc.perform(get("/api/v1/analyzer/projects/"+project+"/jobs")).andExpect(status().isOk()).andReturn();
        assertEquals("COMPLETED_WITH_REVIEW",json.readTree(history.getResponse().getContentAsString()).required("data").get(0).required("analysisState").asText());
    }
    @Test void invalidWorkerAuthMakesCsharpFailAndMixedInputExplicitlyPartial()throws Exception {
        start(false);
        var csharp=upload(Map.of("App.csproj","<Project />","App.cs","class App {}"));
        assertEquals("FAILED",terminal(csharp.required("jobId").asText()).required("analysisState").asText());
        assertEquals(0,db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project));
        var mixed=upload(Map.of("App.csproj","<Project />","App.cs","class App {}","src/App.java","class App {}"));
        var partial=terminal(mixed.required("jobId").asText());assertEquals("PARTIAL",partial.required("analysisState").asText());assertEquals("REJECTED",partial.required("dotnetStatus").asText());assertFalse(partial.required("promotedLatest").asBoolean());
        // Java-only analysis remains available even if the Worker service credentials are invalid.
        var java=upload(Map.of("src/App.java","class App {}"));var complete=terminal(java.required("jobId").asText());
        assertEquals("NOT_APPLICABLE",complete.required("dotnetStatus").asText());assertTrue(complete.required("promotedLatest").asBoolean());
    }
    @Test void uploadOwnershipAndInvalidFileDoNotCreateJobs()throws Exception {
        start(true);authenticate(UUID.randomUUID());
        mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.zip","application/zip",zip(Map.of("App.csproj","<Project />")))).param("projectId",project.toString())).andExpect(status().isForbidden());
        authenticate(owner);
        mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.txt","text/plain","bad".getBytes())).param("projectId",project.toString())).andExpect(status().isBadRequest());
        assertEquals(0,db.queryForObject("select count(*) from jobs where project_id=?",Integer.class,project));
    }
    @AfterEach void close(){SecurityContextHolder.clearContext();if(spring!=null)spring.close();}
}
