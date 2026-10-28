package com.mavis.bootstrap;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties="mavis.security.dev-bypass-enabled=false") @AutoConfigureMockMvc @Transactional
class Stage14EducationApiIntegrationTest extends ApiIntegrationContext {
 @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired JwtUtil jwt;
 @Autowired UserRepository users; @Autowired RoleRepository roles; @Autowired WorkspaceRepository workspaces;
 @Autowired WorkspaceMemberRepository members; @Autowired AssignmentRepository assignments; @Autowired ProjectRepository projects;
 @Autowired SourceSnapshotRepository snapshots; @Autowired ModelVersionRepository models; @Autowired DiagramVersionRepository diagrams;
 @Autowired SubmissionSnapshotRepository submissions;
 @Autowired JobRepository jobs;
 User user(String role){return users.saveAndFlush(User.builder().email(UUID.randomUUID()+"@example.invalid").fullName(role).passwordHash("test-only").status("ACTIVE").role(roles.findByCode(role).orElseThrow()).build());}
 String auth(User u){return "Bearer "+jwt.generateToken(u.getEmail(),u.getId(),u.getRole().getCode());}
 @Test void educationAuthorizationAndImmutableSubmissionRoundTrip() throws Exception {
  mvc.perform(get("/api/v1/submissions/me")).andExpect(status().isUnauthorized());
  var lecturer=user("LECTURER");var student=user("STUDENT");var outsider=user("STUDENT");var admin=user("SYSTEM_ADMIN");
  mvc.perform(post("/api/v1/workspaces").header("Authorization",auth(student)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("code","FORBIDDEN","name","Forbidden class")))).andExpect(status().isForbidden());
  var result=mvc.perform(post("/api/v1/workspaces").header("Authorization",auth(lecturer)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("code","CLASS-"+UUID.randomUUID(),"name","Architecture")))).andExpect(status().isOk()).andReturn();
  UUID w=UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("data").path("id").asText());
  mvc.perform(post("/api/v1/workspaces/"+w+"/members").header("Authorization",auth(lecturer)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("email",student.getEmail(),"memberRole","STUDENT")))).andExpect(status().isOk());
  mvc.perform(get("/api/v1/workspaces/"+w+"/members").header("Authorization",auth(outsider))).andExpect(status().isForbidden());
  mvc.perform(get("/api/v1/workspaces/"+w+"/assignments").header("Authorization",auth(outsider))).andExpect(status().isForbidden());
  var a=mvc.perform(post("/api/v1/workspaces/"+w+"/assignments").header("Authorization",auth(lecturer)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("title","Assignment","requireRuntimeTrace",false)))).andExpect(status().isOk()).andReturn();
  UUID aid=UUID.fromString(json.readTree(a.getResponse().getContentAsString()).path("data").path("id").asText());
  var project=projects.saveAndFlush(Project.builder().workspace(workspaces.findById(w).orElseThrow()).owner(student).name("Student project").build());
  var source=snapshots.saveAndFlush(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD").artifactHash("a".repeat(64)).build());
  var model=models.saveAndFlush(ModelVersion.builder().project(project).sourceSnapshot(source).revision(1).schemaVersion("1.0").origin("GENERATED").isLatestValid(true).createdBy(student).build());
  var diagram=diagrams.saveAndFlush(DiagramVersion.builder().modelVersion(model).notation("C4").level("CONTAINER").layoutJson(json.createObjectNode()).build());
  var peer=user("STUDENT");members.saveAndFlush(WorkspaceMember.builder().workspace(workspaces.findById(w).orElseThrow()).user(peer).memberRole("STUDENT").build());
  var privateProject=projects.saveAndFlush(Project.builder().workspace(workspaces.findById(w).orElseThrow()).owner(peer).name("Private peer project").build());
  var analysisJob=jobs.saveAndFlush(Job.builder().project(project).sourceSnapshot(source).jobType("STATIC_ANALYSIS").status("COMPLETED").build());
  for (var allowed : java.util.List.of(student, lecturer, admin)) {
   mvc.perform(get("/api/v1/analyzer/jobs/"+analysisJob.getId()).header("Authorization",auth(allowed)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.data.jobId").value(analysisJob.getId().toString()));
   mvc.perform(get("/api/v1/analyzer/projects/"+project.getId()+"/jobs").header("Authorization",auth(allowed)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].jobId").value(analysisJob.getId().toString()));
  }
  for (var denied : java.util.List.of(peer, outsider)) {
   mvc.perform(get("/api/v1/analyzer/jobs/"+analysisJob.getId()).header("Authorization",auth(denied))).andExpect(status().isForbidden());
   mvc.perform(get("/api/v1/analyzer/projects/"+project.getId()+"/jobs").header("Authorization",auth(denied))).andExpect(status().isForbidden());
  }
  mvc.perform(get("/api/v1/workspaces/"+w+"/projects").header("Authorization",auth(student))).andExpect(status().isOk()).andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.hasSize(1))).andExpect(jsonPath("$.data[0].id").value(project.getId().toString()));
  String payload=json.writeValueAsString(java.util.Map.of("assignmentId",aid,"projectId",project.getId(),"modelVersionId",model.getId(),"diagramVersionId",diagram.getId()));
  var posted=mvc.perform(post("/api/v1/submissions").header("Authorization",auth(student)).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk()).andExpect(jsonPath("$.data.sourceSnapshotId").value(source.getId().toString())).andReturn();
  String sid=json.readTree(posted.getResponse().getContentAsString()).path("data").path("id").asText();
  for(var actor:java.util.List.of(student,lecturer,admin))for(String path:java.util.List.of("/api/v1/submissions/me","/api/v1/submissions"))mvc.perform(get(path).header("Authorization",auth(actor))).andExpect(status().isOk()).andExpect(jsonPath("$.data[?(@.id == '"+sid+"')].id").value(org.hamcrest.Matchers.hasSize(1)));
  mvc.perform(get("/api/v1/submissions/me").header("Authorization",auth(outsider))).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
  mvc.perform(get("/api/v1/submissions/"+sid).header("Authorization",auth(outsider))).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/submissions/"+sid+"/feedbacks").header("Authorization",auth(student)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("commentText","Not allowed")))).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/submissions/"+sid+"/feedbacks").header("Authorization",auth(lecturer)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("commentText","Reviewed")))).andExpect(status().isOk());
  mvc.perform(get("/api/v1/submissions/"+sid+"/export").header("Authorization",auth(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.data.modelVersionId").value(model.getId().toString()));
  mvc.perform(put("/api/v1/workspaces/"+w).header("Authorization",auth(lecturer)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("name","Renamed class")))).andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("Renamed class"));
  mvc.perform(delete("/api/v1/workspaces/"+w+"/members/"+lecturer.getId()).header("Authorization",auth(lecturer))).andExpect(status().isBadRequest());
  mvc.perform(delete("/api/v1/workspaces/"+w+"/members/"+student.getId()).header("Authorization",auth(lecturer))).andExpect(status().isOk());
  mvc.perform(get("/api/v1/submissions/"+sid+"/feedbacks").header("Authorization",auth(student))).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].commentText").value("Reviewed"));
  mvc.perform(patch("/api/v1/workspaces/"+w+"/archive").header("Authorization",auth(lecturer))).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("ARCHIVED"));
  mvc.perform(post("/api/v1/submissions").header("Authorization",auth(student)).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());
  assertThat(submissions.findBySubmittedById(student.getId())).hasSize(1);
 }
}
