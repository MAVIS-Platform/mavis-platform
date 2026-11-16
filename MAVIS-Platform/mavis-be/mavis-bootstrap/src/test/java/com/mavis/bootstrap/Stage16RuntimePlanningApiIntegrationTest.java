package com.mavis.bootstrap;
import com.fasterxml.jackson.databind.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.MediaType;
import jakarta.persistence.EntityManager;
import java.util.*;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties="mavis.security.dev-bypass-enabled=false") @AutoConfigureMockMvc @Transactional
class Stage16RuntimePlanningApiIntegrationTest extends ApiIntegrationContext {
 @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired UserRepository users;@Autowired RoleRepository roles;@Autowired JwtUtil jwt;
 @Autowired ProjectRepository projects;@Autowired SourceSnapshotRepository sources;@Autowired ModelVersionRepository models;@Autowired ModelElementRepository elements;
 @Autowired RuntimeSessionRepository sessions;@Autowired EntityManager em;
 User user(){return users.saveAndFlush(User.builder().email(UUID.randomUUID()+"@example.invalid").fullName("Planner").status("ACTIVE").passwordHash("test-only").role(roles.findByCode("STUDENT").orElseThrow()).build());}
 String auth(User u){return "Bearer "+jwt.generateToken(u.getEmail(),u.getId(),"STUDENT");}
 String body(Object o)throws Exception{return json.writeValueAsString(o);}
 @Test void savedPlanPinsRevisionsAndQueuesWithoutClaimingRunning(@TempDir Path dir)throws Exception{
  var owner=user();var stranger=user();var project=projects.saveAndFlush(Project.builder().name("Runtime fixture").owner(owner).build());
  Path compose=dir.resolve("docker-compose.yml");Files.writeString(compose,"services:\n  orders:\n    image: example/orders@sha256:"+"a".repeat(64)+"\n");
  var source=sources.saveAndFlush(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD").artifactHash("a".repeat(64)).storagePath(compose.toString()).createdBy(owner).build());
  var model=models.saveAndFlush(ModelVersion.builder().project(project).sourceSnapshot(source).revision(1).schemaVersion("1.0").origin("GENERATED").isLatestValid(true).createdBy(owner).build());
  elements.saveAndFlush(ModelElement.builder().modelVersion(model).name("orders").elementType("SERVICE_CONTAINER").status("DRAFT").build());
  String path="/api/v1/analyzer/projects/"+project.getId()+"/runtime-plan";
  mvc.perform(get(path).header("Authorization",auth(stranger))).andExpect(status().isForbidden());
  mvc.perform(get(path).header("Authorization",auth(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(0)).andExpect(jsonPath("$.data.ready").value(false));
  var profile=Map.of("collectorImage","example/collector@sha256:"+"b".repeat(64),"scenarioRunnerImage","sha256:"+"c".repeat(64),"instrumentationVolume","mavis-test-agents","approvedForLocalPoc",true,"applications",Map.of("orders",Map.of("runtime","java","containerPort",8080)));
  var config=new HashMap<String,Object>();config.put("snapshotId",source.getId());config.put("modelId",model.getId());config.put("profileId","SPRING_BOOT_DOTNET_COMPOSE_V1");config.put("profile",profile);config.put("expectedRevision",0);
  mvc.perform(put(path).header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(config))).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(1)).andExpect(jsonPath("$.data.ready").value(true));
  em.flush();em.clear();
  mvc.perform(get(path).header("Authorization",auth(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.data.snapshotId").value(source.getId().toString())).andExpect(jsonPath("$.data.profile.instrumentationVolume").value("mavis-test-agents"));
  mvc.perform(put(path).header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(config))).andExpect(status().isConflict());
  mvc.perform(post(path+"/scenarios").header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("name","Invalid","steps",List.of("GET http://outside.invalid"),"expectedRevision",0)))).andExpect(status().isBadRequest());
  String step=body(Map.of("id","health","service","orders","method","GET","path","/health","expectedStatus",200));
  var sc=mvc.perform(post(path+"/scenarios").header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("name","Health","steps",List.of(step),"expectedRevision",0)))).andExpect(status().isOk()).andReturn();
  String sid=json.readTree(sc.getResponse().getContentAsString()).path("data").path("id").asText();
  var start=new HashMap<String,Object>();start.put("snapshotId",source.getId());start.put("scenarioId",sid);start.put("configurationRevision",1);start.put("scenarioRevision",2);start.put("approved",true);
  mvc.perform(post(path+"/start").header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(start))).andExpect(status().isConflict());
  assertThat(sessions.findByProjectId(project.getId())).isEmpty();start.put("scenarioRevision",1);
  var queued=mvc.perform(post(path+"/start").header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(start))).andExpect(status().isOk()).andExpect(jsonPath("$.data.executionStatus").value("READY_FOR_DISPATCH")).andExpect(jsonPath("$.data.cleanupStatus").value("NOT_APPLICABLE")).andReturn();
  String run=json.readTree(queued.getResponse().getContentAsString()).path("data").path("id").asText();
  em.flush();em.clear();var frozen=sessions.findById(UUID.fromString(run)).orElseThrow();assertThat(frozen.getScenarioConfig().path("planning").path("scenarioRevision").asInt()).isEqualTo(1);assertThat(frozen.getRunnerReceiptJson()).isNull();
  mvc.perform(post("/api/v1/analyzer/runtime/sessions/"+run+"/recovery-result").header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/analyzer/runtime/sessions/"+run+"/stop").header("Authorization",auth(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.data.executionStatus").value("CANCELLED"));
  var next=Map.of("name","Updated health","steps",List.of(step),"expectedRevision",1);
  mvc.perform(put(path+"/scenarios/"+sid).header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(next))).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(2));
  mvc.perform(put(path+"/scenarios/"+sid).header("Authorization",auth(owner)).contentType(MediaType.APPLICATION_JSON).content(body(next))).andExpect(status().isConflict());
  assertThat(sessions.findById(UUID.fromString(run)).orElseThrow().getScenarioConfig().path("planning").path("scenarioRevision").asInt()).isEqualTo(1);
 }
}
