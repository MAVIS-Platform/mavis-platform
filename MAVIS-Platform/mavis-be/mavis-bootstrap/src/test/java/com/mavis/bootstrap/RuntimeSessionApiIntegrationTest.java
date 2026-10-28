package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RuntimeSessionApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ModelVersionRepository modelVersionRepository;

    @Autowired
    private com.mavis.analyzer.runtime.service.RuntimeSessionService runtimeSessionService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL RUNTIME SANDBOX API TEST: Preflight -> Create (Secret Redaction) -> Approve (Override YAML) -> Stop -> Query")
    void testRuntimeSessionLifecycleApi(@TempDir Path tempDir) throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("runtime_student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_secret")
                .fullName("Runtime Sandbox Tester")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("Fruit Ecommerce Sandbox " + UUID.randomUUID().toString().substring(0, 6))
                .owner(user)
                .build());

        // Tạo file docker-compose.yml mẫu trên đĩa
        String composeContent = """
                version: '3.8'
                services:
                  fruit-order-service:
                    image: fruit-order:1.0
                    ports:
                      - "8081:8081"
                  fruit-inventory-service:
                    image: fruit-inventory:1.0
                    ports:
                      - "8082:8082"
                """;
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, composeContent);

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .storagePath(composeFile.toString())
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .build());

        ModelVersion baseVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API POST /api/v1/analyzer/runtime/preflight?snapshotId=" + snapshot.getId());
        System.out.println("================================================================================");

        // --- BƯỚC 1: POST /api/v1/analyzer/runtime/preflight ---
        MvcResult preflightResult = mockMvc.perform(post("/api/v1/analyzer/runtime/preflight")
                        .param("snapshotId", snapshot.getId().toString())
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.compatible").value(true))
                .andExpect(jsonPath("$.data.detectedServices").isArray())
                .andReturn();

        String preflightJson = preflightResult.getResponse().getContentAsString();
        JsonNode preflightNode = objectMapper.readTree(preflightJson);
        System.out.println("RESPONSE (Bước 1 - Preflight Check):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(preflightNode));

        assertThat(preflightNode.get("data").get("compatible").asBoolean()).isTrue();
        assertThat(preflightNode.get("data").get("detectedServices").size()).isEqualTo(2);

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API POST /api/v1/analyzer/runtime/sessions (KÈM SECRET CẦN REDACT)");
        System.out.println("================================================================================");

        // --- BƯỚC 2: POST /api/v1/analyzer/runtime/sessions ---
        ObjectNode sensitiveConfig = objectMapper.createObjectNode();
        sensitiveConfig.put("targetEndpoint", "http://fruit-order-service/orders?token=top_secret_token_123");
        sensitiveConfig.put("password", "DatabaseSuperPassword123!");
        sensitiveConfig.put("authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive");
        sensitiveConfig.put("apiKey", "live_api_key_sandbox_999");
        sensitiveConfig.put("safePublicData", "fruit_orders_scenario_v1");

        RuntimeSessionCreateRequest createRequest = RuntimeSessionCreateRequest.builder()
                .projectId(project.getId())
                .sourceSnapshotId(snapshot.getId())
                .triggeredById(user.getId())
                .profileName("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .scenarioName("Order Processing End-to-End Trace")
                .scenarioConfig(sensitiveConfig)
                .build();

        MvcResult createResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions")
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scenarioStatus").value("PENDING"))
                .andExpect(jsonPath("$.data.traceStatus").value("NONE"))
                .andReturn();

        String createJson = createResult.getResponse().getContentAsString();
        JsonNode createNode = objectMapper.readTree(createJson);
        System.out.println("RESPONSE (Bước 2 - Tạo Session kèm Secret Redaction):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(createNode));

        UUID sessionId = UUID.fromString(createNode.get("data").get("id").asText());
        String resourceProject = createNode.get("data").get("resourceProject").asText();
        assertThat(resourceProject).matches("^mavisrun-[0-9a-f]{32}$");
        assertThat(createNode.get("data").get("modelVersionId").asText()).isEqualTo(baseVersion.getId().toString());

        JsonNode redactedConfig = createNode.get("data").get("scenarioConfig");

        // Xác minh toàn bộ secrets đã được đổi thành [REDACTED]
        assertThat(redactedConfig.get("password").asText()).isEqualTo("[REDACTED]");
        assertThat(redactedConfig.get("authorization").asText()).isEqualTo("[REDACTED]");
        assertThat(redactedConfig.get("apiKey").asText()).isEqualTo("[REDACTED]");
        assertThat(redactedConfig.get("targetEndpoint").asText()).contains("token=[REDACTED]");
        assertThat(redactedConfig.get("safePublicData").asText()).isEqualTo("fruit_orders_scenario_v1");

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: GỌI API POST /api/v1/analyzer/runtime/sessions/" + sessionId + "/approve");
        System.out.println("    Chuyển PENDING -> APPROVED / READY_FOR_DISPATCH và sinh file docker-compose.mavis-override.yml");
        System.out.println("================================================================================");

        // --- BƯỚC 3: POST /api/v1/analyzer/runtime/sessions/{sessionId}/approve ---
        MvcResult approveResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/approve", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scenarioStatus").value("APPROVED"))
                .andExpect(jsonPath("$.data.executionStatus").value("READY_FOR_DISPATCH"))
                .andExpect(jsonPath("$.data.overrideComposeYaml").exists())
                .andReturn();

        String approveJson = approveResult.getResponse().getContentAsString();
        JsonNode approveNode = objectMapper.readTree(approveJson);
        System.out.println("RESPONSE (Bước 3 - Approve Session & Sinh Override YAML):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(approveNode));

        String overrideYaml = approveNode.get("data").get("overrideComposeYaml").asText();
        assertThat(overrideYaml).contains("cpus: '1.0'");
        assertThat(overrideYaml).contains("mem_limit: 1024m");
        assertThat(overrideYaml).contains("pids_limit: 128");
        assertThat(overrideYaml).contains("mavis_sandbox_net");
        assertThat(overrideYaml).contains("OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317");

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3b]: GỌI API POST /lifecycle-ack (ALLOCATED -> RUNNING)");
        System.out.println("================================================================================");

        // Lifecycle-ack: ALLOCATED
        com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO ackAllocated =
                com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO.builder()
                        .sessionId(sessionId)
                        .resourceProject(resourceProject)
                        .stage("ALLOCATED")
                        .observedAt(java.time.OffsetDateTime.now())
                        .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", sessionId)
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ackAllocated)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.executionStatus").value("ALLOCATED"))
                .andExpect(jsonPath("$.data.acknowledgedAt").exists());

        // Lifecycle-ack: RUNNING
        com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO ackRunning =
                com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO.builder()
                        .sessionId(sessionId)
                        .resourceProject(resourceProject)
                        .stage("RUNNING")
                        .observedAt(java.time.OffsetDateTime.now())
                        .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", sessionId)
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ackRunning)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scenarioStatus").value("RUNNING"))
                .andExpect(jsonPath("$.data.executionStatus").value("RUNNING"))
                .andExpect(jsonPath("$.data.acknowledgedAt").exists());

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 4]: GỌI API POST /api/v1/analyzer/runtime/sessions/" + sessionId + "/stop");
        System.out.println("    Dừng phiên chạy khi RUNNING (Branch 2: Ghi cancel.request)");
        System.out.println("================================================================================");

        org.springframework.test.util.ReflectionTestUtils.setField(runtimeSessionService, "runnerStateRoot", tempDir.toString());

        // --- BƯỚC 4: POST /api/v1/analyzer/runtime/sessions/{sessionId}/stop ---
        MvcResult stopResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/stop", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.executionStatus").value("CANCELLING"))
                .andExpect(jsonPath("$.data.cleanupStatus").value("STOP_REQUESTED"))
                .andReturn();

        assertThat(Files.exists(tempDir.resolve(resourceProject).resolve("cancel.request"))).isTrue();

        String stopJson = stopResult.getResponse().getContentAsString();
        JsonNode stopNode = objectMapper.readTree(stopJson);
        System.out.println("RESPONSE (Bước 4 - Stop Session Branch 2):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(stopNode));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 5]: GỌI API GET /api/v1/analyzer/projects/" + project.getId() + "/runtime-sessions");
        System.out.println("================================================================================");

        // --- BƯỚC 5: GET /api/v1/analyzer/projects/{projectId}/runtime-sessions ---
        MvcResult listResult = mockMvc.perform(get("/api/v1/analyzer/projects/{projectId}/runtime-sessions", project.getId())
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value(sessionId.toString()))
                .andExpect(jsonPath("$.data[0].executionStatus").value("CANCELLING"))
                .andReturn();

        String listJson = listResult.getResponse().getContentAsString();
        JsonNode listNode = objectMapper.readTree(listJson);
        System.out.println("RESPONSE (Bước 5 - Danh sách Sessions của Dự án):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(listNode));

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ CÁC BƯỚC RUNTIME SANDBOX & API TEST CHO TASK 5.1 HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
