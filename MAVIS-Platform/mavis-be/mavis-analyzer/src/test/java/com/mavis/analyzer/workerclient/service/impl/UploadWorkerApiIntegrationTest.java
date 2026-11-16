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
    private UUID owner,project,outsider;
    private String previousAnalysisKey;
    private final ObjectMapper json=new ObjectMapper();

    @Configuration @EnableWebMvc @EnableAsync
    @Import({WorkerPublicationIntegrationTest.Config.class,UploadController.class,JobController.class,GlobalExceptionHandler.class,com.mavis.analyzer.diagram.controller.DiagramController.class,com.mavis.analyzer.model.controller.ModelVersionController.class,com.mavis.analyzer.impact.VersionedImpactController.class,com.mavis.analyzer.graph.controller.ImpactController.class,com.mavis.analyzer.orchestrator.controller.AnalysisRequestController.class,com.mavis.analyzer.orchestrator.controller.JobControlController.class})
    static class WebConfig {
        @Bean com.mavis.analyzer.diagram.service.DiagramExportService exportService(){return org.mockito.Mockito.mock(com.mavis.analyzer.diagram.service.DiagramExportService.class);}
        @Bean StorageService storage(org.springframework.core.env.Environment env) {
            var storage=new LocalDiskStorageServiceImpl();ReflectionTestUtils.setField(storage,"uploadDir",env.getRequiredProperty("it.upload-root"));return storage;
        }
        @Bean SourceIngestionServiceImpl ingestion(StorageService s,ApplicationEventPublisher e,ProjectRepository p,SourceSnapshotRepository snapshots,JobRepository jobs,com.mavis.common.security.AccessPolicyService access){return new SourceIngestionServiceImpl(new com.mavis.common.config.PlatformRuntimeSettings(),s,e,p,snapshots,jobs,access);}
        @Bean DotnetWorkerClientService worker(org.springframework.core.env.Environment env){return new DotnetWorkerClientServiceImpl(true,System.getenv("MAVIS_WORKER_TEST_URL"),env.getRequiredProperty("it.service-key"),"test","fixture-only-not-for-production-32-byte-key",env.getRequiredProperty("it.upload-root"),System.getenv("MAVIS_WORKER_TEST_ARTIFACT_ROOT"),Clock.systemUTC());}
        @Bean AnalyzerOrchestratorServiceImpl orchestrator(ProjectRepository p,SourceSnapshotRepository s,JobRepository j,DotnetWorkerClientService w,WorkerModelPublisher publisher,AnalysisExecutionRegistry x){return new AnalyzerOrchestratorServiceImpl(p,s,j,new DockerDetector(new DockerDetectorServiceImpl()),new JavaSourceParser(),w,publisher,x);}
        @Bean com.mavis.analyzer.impact.ImpactGraphLoader impactGraphs(ModelVersionRepository m,ModelElementRepository e,ModelRelationshipRepository r,EvidenceRepository v,JobRepository j,ObjectMapper json,com.mavis.common.security.AccessPolicyService policy){return new com.mavis.analyzer.impact.ImpactGraphLoader(m,e,r,v,j,json,policy);}
        @Bean com.mavis.analyzer.impact.WorkerImpactService impact(com.mavis.analyzer.impact.ImpactGraphLoader g){return new com.mavis.analyzer.impact.WorkerImpactService(g,System.getenv("MAVIS_WORKER_TEST_URL"),"test-service-key");}
        @Bean com.mavis.analyzer.graph.service.GraphService graphRead(ModelElementRepository e,ModelRelationshipRepository r,ModelVersionRepository m,EvidenceRepository v,com.mavis.analyzer.impact.WorkerImpactService impact,com.mavis.common.security.AccessPolicyService policy){return new com.mavis.analyzer.graph.service.impl.GraphServiceImpl(e,r,m,v,impact,policy);}
        @Bean(name="mavisAnalysisExecutor") public org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor executor(){return new AnalysisLifecycleConfiguration().analysisExecutor();}
        @Bean JobControlService controls(JobRepository j,AnalysisAttemptRepository a,AnalysisExecutionRegistry x,ApplicationEventPublisher e,ObjectMapper json){return new JobControlService(j,a,x,e,json);}
        @Bean JobServiceImpl jobs(JobRepository j,ProjectRepository p,com.mavis.common.security.AccessPolicyService policy){return new JobServiceImpl(j,p,policy);}
        @Bean AnalysisRequestService analysisRequests(SourceSnapshotRepository s,ProjectRepository p,JobRepository j,com.mavis.common.security.AccessPolicyService policy,ApplicationEventPublisher e){return new AnalysisRequestService(s,p,j,policy,e);}
    }
    private void start(boolean validKey)throws Exception {
        Assumptions.assumeTrue(System.getenv("MAVIS_TEST_JDBC_URL")!=null && System.getenv("MAVIS_WORKER_TEST_URL")!=null,"Run live API integration harness");
        Path uploads=Files.createDirectory(root.resolve("uploads"));
        spring=new AnnotationConfigWebApplicationContext();spring.setServletContext(new MockServletContext());
        spring.getEnvironment().getPropertySources().addFirst(new MapPropertySource("integration",Map.of("it.upload-root",uploads.toString(),"mavis.storage.upload-dir",uploads.toString(),"it.service-key",validKey?"test-service-key":"wrong-key")));
        spring.register(WebConfig.class);spring.refresh();mvc=MockMvcBuilders.webAppContextSetup(spring).build();
        db=new JdbcTemplate(spring.getBean(DriverManagerDataSource.class));owner=db.queryForObject("select id from users limit 1",UUID.class);project=UUID.randomUUID();outsider=UUID.randomUUID();
        db.update("insert into users(id,email,password_hash,full_name,role_id,status) values (?,?,?,?,(select id from roles where code='STUDENT'),'ACTIVE')",outsider,outsider+"@example.invalid","fixture-only","Other student");
        db.update("insert into projects(id,owner_id,name,project_type) values(?,?,?,?)",project,owner,"public API integration","PERSONAL");authenticate(owner);
    }
    private void authenticate(UUID user){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.toString(),"test",List.of()));}
    private byte[] zip(Map<String,String> files)throws Exception {
        var bytes=new java.io.ByteArrayOutputStream();try(var archive=new java.util.zip.ZipOutputStream(bytes)){for(var file:files.entrySet()){archive.putNextEntry(new java.util.zip.ZipEntry(file.getKey()));archive.write(file.getValue().getBytes(java.nio.charset.StandardCharsets.UTF_8));archive.closeEntry();}}return bytes.toByteArray();
    }
    private JsonNode upload(Map<String,String> files)throws Exception {
        var response=mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.zip","application/zip",zip(files))).param("projectId",project.toString())).andExpect(status().isOk()).andReturn();
        var imported=json.readTree(response.getResponse().getContentAsString()).required("data");
        assertTrue(imported.required("analysisRequired").asBoolean());assertTrue(imported.path("jobId").isNull()||imported.path("jobId").isMissingNode());
        String snapshot=imported.required("snapshotId").asText();
        assertEquals(0,db.queryForObject("select count(*) from jobs where source_snapshot_id=?",Integer.class,UUID.fromString(snapshot)));
        mvc.perform(post("/api/v1/analyzer/snapshots/"+snapshot+"/analyze")).andExpect(status().isBadRequest());
        authenticate(outsider);mvc.perform(post("/api/v1/analyzer/snapshots/"+snapshot+"/analyze").header("Idempotency-Key","foreign")).andExpect(status().isForbidden());authenticate(owner);
        if(previousAnalysisKey!=null)mvc.perform(post("/api/v1/analyzer/snapshots/"+snapshot+"/analyze").header("Idempotency-Key",previousAnalysisKey)).andExpect(status().isConflict());
        String key=UUID.randomUUID().toString();
        previousAnalysisKey=key;
        var accepted=mvc.perform(post("/api/v1/analyzer/snapshots/"+snapshot+"/analyze").header("Idempotency-Key",key)).andExpect(status().isAccepted()).andReturn();
        var analysis=json.readTree(accepted.getResponse().getContentAsString()).required("data");
        var repeated=mvc.perform(post("/api/v1/analyzer/snapshots/"+snapshot+"/analyze").header("Idempotency-Key",key)).andExpect(status().isAccepted()).andReturn();
        assertEquals(analysis.required("jobId").asText(),json.readTree(repeated.getResponse().getContentAsString()).required("data").required("jobId").asText());
        ((com.fasterxml.jackson.databind.node.ObjectNode)imported).put("jobId",analysis.required("jobId").asText());return imported;
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
        var attemptHistory=mvc.perform(get("/api/v1/analyzer/jobs/"+accepted.required("jobId").asText()+"/attempts")).andExpect(status().isOk()).andReturn();
        var attempts=json.readTree(attemptHistory.getResponse().getContentAsString()).required("data");assertEquals(1,attempts.size());assertEquals("COMPLETED",attempts.get(0).required("status").asText());
        mvc.perform(post("/api/v1/analyzer/jobs/"+accepted.required("jobId").asText()+"/cancel")).andExpect(status().isOk());
        assertEquals("COMPLETED_WITH_REVIEW",result.required("analysisState").asText());assertEquals("COMPLETED",result.required("dotnetStatus").asText());assertTrue(result.required("promotedLatest").asBoolean());
        assertEquals(accepted.required("snapshotId").asText(),result.required("sourceSnapshotId").asText());
        String model=result.required("modelVersionId").asText();
        assertTrue(db.queryForObject("select count(*) from evidences where model_version_id=? and provenance->>'sourceSnapshotId'=?",Integer.class,UUID.fromString(model),accepted.required("snapshotId").asText())>0);
        var history=mvc.perform(get("/api/v1/analyzer/projects/"+project+"/jobs")).andExpect(status().isOk()).andReturn();
        assertEquals("COMPLETED_WITH_REVIEW",json.readTree(history.getResponse().getContentAsString()).required("data").get(0).required("analysisState").asText());
        var diagramResponse=mvc.perform(get("/api/v1/analyzer/models/"+model+"/diagrams")).andExpect(status().isOk()).andReturn();
        var diagrams=json.readTree(diagramResponse.getResponse().getContentAsString()).required("data");assertEquals(3,diagrams.size());
        JsonNode component=null;for(var d:diagrams)if(d.path("level").asText().equals("COMPONENT"))component=d;
        assertNotNull(component);String diagramId=component.required("id").asText();String nodeId=component.required("layoutJson").required("nodes").get(0).required("id").asText();
        long elementsBefore=db.queryForObject("select count(*) from model_elements where model_version_id=?",Long.class,UUID.fromString(model));
        long relationshipsBefore=db.queryForObject("select count(*) from model_relationships where model_version_id=?",Long.class,UUID.fromString(model));
        String evidenceBefore=db.queryForObject("select md5(string_agg(locator || coalesce(provenance::text,''),',' order by id)) from evidences where model_version_id=?",String.class,UUID.fromString(model));
        var positions=json.createObjectNode();positions.putArray("nodes").addObject().put("id",nodeId).put("x",123).put("y",456);
        mvc.perform(put("/api/v1/analyzer/diagrams/"+diagramId+"/layout").contentType("application/json").content(positions.toString())).andExpect(status().isOk());
        assertEquals(elementsBefore,db.queryForObject("select count(*) from model_elements where model_version_id=?",Long.class,UUID.fromString(model)));
        assertEquals(relationshipsBefore,db.queryForObject("select count(*) from model_relationships where model_version_id=?",Long.class,UUID.fromString(model)));
        assertEquals(evidenceBefore,db.queryForObject("select md5(string_agg(locator || coalesce(provenance::text,''),',' order by id)) from evidences where model_version_id=?",String.class,UUID.fromString(model)));
        UUID element=db.queryForObject("select element_id from evidences where model_version_id=? and element_id is not null limit 1",UUID.class,UUID.fromString(model));
        var drawer=mvc.perform(get("/api/v1/analyzer/evidences/element/"+element)).andExpect(status().isOk()).andReturn();
        var evidence=json.readTree(drawer.getResponse().getContentAsString()).required("data");assertTrue(evidence.size()>0);
        assertEquals(accepted.required("snapshotId").asText(),evidence.get(0).required("sourceSnapshotId").asText());assertTrue(evidence.get(0).required("provenance").hasNonNull("fileHash"));
        positions.withArray("nodes").removeAll().addObject().put("id",UUID.randomUUID().toString()).put("x",1).put("y",2);
        mvc.perform(put("/api/v1/analyzer/diagrams/"+diagramId+"/layout").contentType("application/json").content(positions.toString())).andExpect(status().isBadRequest());
        authenticate(outsider);mvc.perform(get("/api/v1/analyzer/diagrams/"+diagramId)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/analyzer/evidences/element/"+element)).andExpect(status().isForbidden());authenticate(owner);
        // Revision creation must preserve source evidence and identity while changing only the new model.
        String type=db.queryForObject("select id from model_elements where model_version_id=? and name='App' and element_type='CLASS_INTERFACE'",UUID.class,UUID.fromString(model)).toString();
        var edit=json.createObjectNode();edit.putArray("elements").addObject().put("ref",type).put("operation","UPDATE").put("name","RenamedApp").put("status","STUDENT_CONFIRMED");edit.putArray("relationships");
        var revisedResponse=mvc.perform(post("/api/v1/analyzer/models/"+model+"/revisions").contentType("application/json").content(edit.toString())).andExpect(status().isOk()).andReturn();
        String revised=json.readTree(revisedResponse.getResponse().getContentAsString()).required("data").required("id").asText();
        assertEquals("App",db.queryForObject("select name from model_elements where id=?",String.class,UUID.fromString(type)));
        assertEquals(1,db.queryForObject("select count(*) from model_elements where model_version_id=? and name='RenamedApp'",Integer.class,UUID.fromString(revised)));
        assertEquals(3,db.queryForObject("select count(*) from diagram_versions where model_version_id=?",Integer.class,UUID.fromString(revised)));
        assertTrue(db.queryForObject("select count(*) from evidences where model_version_id=? and provenance->>'copiedFromEvidenceId' is not null",Integer.class,UUID.fromString(revised))>0);
        var compared=mvc.perform(get("/api/v1/analyzer/models/compare").param("baseVersionId",model).param("targetVersionId",revised)).andExpect(status().isOk()).andReturn();
        var diff=json.readTree(compared.getResponse().getContentAsString()).required("data").required("elements");
        assertEquals(1,diff.required("modified").size());assertEquals(0,diff.required("added").size());assertEquals(0,diff.required("removed").size());
        mvc.perform(post("/api/v1/analyzer/models/"+model+"/revisions").contentType("application/json").content(edit.toString())).andExpect(status().isConflict());
        var add=json.createObjectNode();var additions=add.putArray("addedElements");
        additions.addObject().put("name","Gateway").put("elementType","SERVICE_CONTAINER").put("languageStack","JAVA");
        additions.addObject().put("name","Orders").put("elementType","SERVICE_CONTAINER").put("languageStack","CSHARP_DOTNET");
        add.putArray("addedRelationships").addObject().put("sourceElementName","Gateway").put("targetElementName","Orders").put("relationType","SERVICE_HTTP_CALL");
        var addedResponse=mvc.perform(post("/api/v1/analyzer/models/"+revised+"/revisions").contentType("application/json").content(add.toString())).andExpect(status().isOk()).andReturn();
        String added=json.readTree(addedResponse.getResponse().getContentAsString()).required("data").required("id").asText();
        var addDiff=mvc.perform(get("/api/v1/analyzer/models/compare").param("baseVersionId",revised).param("targetVersionId",added)).andExpect(status().isOk()).andReturn();
        var addedData=json.readTree(addDiff.getResponse().getContentAsString()).required("data");assertEquals(2,addedData.required("elements").required("added").size());assertEquals(1,addedData.required("relationships").required("added").size());
        String orders=db.queryForObject("select id from model_elements where model_version_id=? and name='Orders'",UUID.class,UUID.fromString(added)).toString();
        var impactResponse=mvc.perform(get("/api/v1/analyzer/models/"+added+"/impact").param("targetServiceId",orders)).andExpect(status().isOk()).andReturn();
        var impactData=json.readTree(impactResponse.getResponse().getContentAsString()).required("data");var impact=impactData.required("impact");
        assertEquals(added,impact.required("modelVersionId").asText());assertEquals(1,impact.required("affectedServices").size());
        var path=impact.required("affectedServices").get(0);assertEquals(1,path.required("distance").asInt());assertEquals("Direct",path.required("classification").asText());assertTrue(path.required("evidenceIds").size()>0);
        assertEquals("Gateway",impactData.required("serviceNames").required(path.required("serviceId").asText()).asText());
        mvc.perform(get("/api/v1/analyzer/models/"+added+"/impact").param("targetServiceId",orders).param("graphRevisionId","wrong")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/analyzer/models/"+model+"/impact").param("targetServiceId",orders)).andExpect(status().isBadRequest());
        var legacyImpact=mvc.perform(get("/api/v1/analyzer/impact").param("sessionId",added).param("nodeId",orders)).andExpect(status().isOk()).andReturn();
        assertEquals(1,json.readTree(legacyImpact.getResponse().getContentAsString()).required("data").required("impactedElements").size());
        mvc.perform(get("/api/v1/analyzer/impact").param("sessionId",project.toString()).param("nodeId",orders)).andExpect(status().isNotFound());
        int versionsBefore=db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project);
        var invalid=json.createObjectNode();invalid.putArray("elements").addObject().put("ref","loop").put("operation","ADD").put("kind","COMPONENT").put("name","Loop").put("parentRef","loop");invalid.putArray("relationships");
        mvc.perform(post("/api/v1/analyzer/models/"+added+"/revisions").contentType("application/json").content(invalid.toString())).andExpect(status().isBadRequest());
        assertEquals(versionsBefore,db.queryForObject("select count(*) from model_versions where project_id=?",Integer.class,project));
        String gateway=db.queryForObject("select id from model_elements where model_version_id=? and name='Gateway'",UUID.class,UUID.fromString(added)).toString();
        var remove=json.createObjectNode();remove.putArray("elements").addObject().put("ref",gateway).put("operation","REMOVE");remove.putArray("relationships");
        var removedResponse=mvc.perform(post("/api/v1/analyzer/models/"+added+"/revisions").contentType("application/json").content(remove.toString())).andExpect(status().isOk()).andReturn();
        String removed=json.readTree(removedResponse.getResponse().getContentAsString()).required("data").required("id").asText();
        var removeDiff=mvc.perform(get("/api/v1/analyzer/models/compare").param("baseVersionId",added).param("targetVersionId",removed)).andExpect(status().isOk()).andReturn();
        var removedData=json.readTree(removeDiff.getResponse().getContentAsString()).required("data");assertEquals(1,removedData.required("elements").required("removed").size());assertEquals(1,removedData.required("relationships").required("removed").size());
        authenticate(outsider);mvc.perform(get("/api/v1/analyzer/models/compare").param("baseVersionId",model).param("targetVersionId",revised)).andExpect(status().isForbidden());authenticate(owner);
        authenticate(outsider);mvc.perform(get("/api/v1/analyzer/jobs/"+accepted.required("jobId").asText()+"/attempts")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/analyzer/jobs/"+accepted.required("jobId").asText())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/analyzer/projects/"+project+"/jobs")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/analyzer/jobs/"+accepted.required("jobId").asText()+"/cancel")).andExpect(status().isForbidden());authenticate(owner);
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
        start(true);authenticate(outsider);
        mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.zip","application/zip",zip(Map.of("App.csproj","<Project />")))).param("projectId",project.toString())).andExpect(status().isForbidden());
        authenticate(owner);
        mvc.perform(multipart("/api/v1/analyzer/upload").file(new MockMultipartFile("file","source.txt","text/plain","bad".getBytes())).param("projectId",project.toString())).andExpect(status().isBadRequest());
        assertEquals(0,db.queryForObject("select count(*) from jobs where project_id=?",Integer.class,project));
    }
    @AfterEach void close(){SecurityContextHolder.clearContext();if(spring!=null)spring.close();}
}
