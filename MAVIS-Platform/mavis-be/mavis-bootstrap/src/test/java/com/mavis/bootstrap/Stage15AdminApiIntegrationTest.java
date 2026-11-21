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
import org.springframework.test.annotation.DirtiesContext;
import java.util.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties="mavis.security.dev-bypass-enabled=false") @AutoConfigureMockMvc @Transactional @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class Stage15AdminApiIntegrationTest extends ApiIntegrationContext {
 @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired UserRepository users;@Autowired RoleRepository roles;@Autowired JwtUtil jwt;@Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
 User user(String role){return users.saveAndFlush(User.builder().email(UUID.randomUUID()+"@example.invalid").fullName(role).status("ACTIVE").passwordHash(encoder.encode("irrelevant")).role(roles.findByCode(role).orElseThrow()).build());}
 String auth(User u){return "Bearer "+jwt.generateToken(u.getEmail(),u.getId(),u.getRole().getCode());}
 String body(Map<String,?> values)throws Exception{return json.writeValueAsString(values);}
 @Test void adminConfigurationUsesRevisionsAndRejectsNonAdmins()throws Exception{
  var admin=user("SYSTEM_ADMIN");var student=user("STUDENT");
  for(String path:List.of("integrations","profiles","jobs","runtime-sessions","dashboard-stats")){
   mvc.perform(get("/api/v1/admin/"+path).header("Authorization",auth(student))).andExpect(status().isForbidden());
   mvc.perform(get("/api/v1/admin/"+path).header("Authorization",auth(admin))).andExpect(status().isOk());
  }
  mvc.perform(patch("/api/v1/admin/integrations/github").header("Authorization",auth(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("enabled",false,"expectedRevision",1)))).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(2)).andExpect(jsonPath("$.data.connectionVerified").value(false));
  mvc.perform(patch("/api/v1/admin/integrations/github").header("Authorization",auth(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("enabled",true,"expectedRevision",1)))).andExpect(status().isConflict());
  mvc.perform(post("/api/v1/admin/integrations/gemini-ai/test").header("Authorization",auth(student))).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/integrations/gemini-ai/test").header("Authorization",auth(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value("gemini-ai")).andExpect(jsonPath("$.data.checkedAt").isNotEmpty());
  mvc.perform(post("/api/v1/admin/integrations/unknown/test").header("Authorization",auth(admin))).andExpect(status().isNotFound());
  mvc.perform(patch("/api/v1/admin/profiles/JAVA_SPRING_OTEL_V1").header("Authorization",auth(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("enabled",true,"expectedRevision",1,"memoryMiB",512,"cpus",0.5,"timeoutSeconds",60)))).andExpect(status().isOk()).andExpect(jsonPath("$.data.memoryMiB").value(512)).andExpect(jsonPath("$.data.revision").value(2));
  mvc.perform(patch("/api/v1/admin/profiles/JAVA_SPRING_OTEL_V1").header("Authorization",auth(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("enabled",true,"expectedRevision",2,"memoryMiB",4096)))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/admin/dashboard-stats").header("Authorization",auth(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.data.healthStatus").value("unknown"));
  mvc.perform(get("/api/v1/admin/audit-logs").header("Authorization",auth(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.data[?(@.action == 'CONFIGURE_INTEGRATION')]").isNotEmpty());
  mvc.perform(patch("/api/v1/admin/users/"+student.getId()+"/status").header("Authorization",auth(admin)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("newStatus","LOCKED")))).andExpect(status().isOk());
  mvc.perform(get("/api/v1/auth/me").header("Authorization",auth(student))).andExpect(status().isForbidden());
  student.setStatus("INACTIVE");users.saveAndFlush(student);
  mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("email",student.getEmail(),"password","irrelevant")))).andExpect(status().isForbidden());
 }
}
