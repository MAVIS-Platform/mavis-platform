package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RuntimeStudioApiIntegrationTest extends ApiIntegrationContext {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired ProjectRepository projects;
    @Autowired SourceSnapshotRepository snapshots;
    @Autowired RuntimeSessionRepository sessions;

    @Test void authenticatedOwnerQueuesActionAndRunnerConfirmsBeforeFinishing() throws Exception {
        var role = roles.findByCode("STUDENT").orElseGet(() -> roles.save(Role.builder().code("STUDENT").name("Student").build()));
        var user = users.save(User.builder().email("studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Studio test").role(role).build());
        var project = projects.save(Project.builder().name("Studio API fixture").owner(user).build());
        var snapshot = snapshots.save(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD")
            .artifactHash("a".repeat(64)).storagePath("test-source.zip").build());
        var session = sessions.saveAndFlush(RuntimeSession.builder().project(project).sourceSnapshot(snapshot).triggeredBy(user)
            .executionStatus("RUNNING").resourceProject("mavisrun-" + "a".repeat(32))
            .confirmedServiceMappings(Map.of("orders", UUID.randomUUID().toString()))
            .scenarioConfig(mapper.createObjectNode().put("interactiveStudio",true)).build());
        String url = "/api/v1/analyzer/runtime/sessions/" + session.getId() + "/studio";
        String auth = testAuthorization(user.getEmail());
        var outsider = users.save(User.builder().email("outside-studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Outside student").role(role).build());
        mvc.perform(get(url).header("Authorization",testAuthorization(outsider.getEmail()))).andExpect(status().isForbidden());
        String actionId = UUID.randomUUID().toString();
        String command = mapper.writeValueAsString(Map.of("actionId",actionId,"action","SCALE","service","orders","replicas",4));
        for (int i=0;i<2;i++)
            mvc.perform(post(url+"/actions").header("Authorization",auth).contentType(MediaType.APPLICATION_JSON).content(command))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.actions.length()").value(1));
        mvc.perform(post(url+"/finish").header("Authorization",auth)).andExpect(status().isConflict());
        mvc.perform(get(url+"/commands").param("resourceProject",session.getResourceProject()))
            .andExpect(status().isForbidden());
        mvc.perform(get(url+"/commands").param("resourceProject",session.getResourceProject())
            .header("X-Mavis-Runner-Key","mavis-runner-secret-key-test"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.command.actionId").value(actionId));
        var result = mapper.createObjectNode().put("action","SCALE").put("service","orders").put("confirmed",true)
            .put("replicasBefore",1).put("replicasAfter",4);
        result.putObject("metricsBefore").put("replicas",1);
        result.putObject("metricsAfter").put("replicas",4);
        String ack=mapper.writeValueAsString(Map.of("sessionId",session.getId(),"resourceProject",session.getResourceProject(),
            "actionId",actionId,"status","CONFIRMED","result",result));
        for (int i=0;i<2;i++)
            mvc.perform(post(url+"/ack").header("X-Mavis-Runner-Key","mavis-runner-secret-key-test")
                .contentType(MediaType.APPLICATION_JSON).content(ack)).andExpect(status().isOk());
        var telemetry=mapper.createObjectNode().put("observedAt","2026-11-14T00:00:00Z");
        telemetry.putArray("services");telemetry.putArray("spans");telemetry.putArray("interactions");
        mvc.perform(post(url+"/telemetry").header("X-Mavis-Runner-Key","mavis-runner-secret-key-test")
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of(
                "sessionId",session.getId(),"resourceProject",session.getResourceProject(),"telemetry",telemetry))))
            .andExpect(status().isOk());
        mvc.perform(post(url+"/snapshots").header("Authorization",auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"explanation\":\"Observed order replica scaling\"}")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sourceSnapshotId").value(snapshot.getId().toString()))
            .andExpect(jsonPath("$.data.digest").isString());
        mvc.perform(post(url+"/finish").header("Authorization",auth)).andExpect(status().isOk());
        mvc.perform(get(url).header("Authorization",auth)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.finishRequested").value(true))
            .andExpect(jsonPath("$.data.actions[0].status").value("CONFIRMED"));
    }
}
