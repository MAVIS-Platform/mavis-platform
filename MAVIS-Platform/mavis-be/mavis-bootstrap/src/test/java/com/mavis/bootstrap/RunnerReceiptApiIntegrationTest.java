package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RunnerReceiptApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Autowired
    private ModelVersionRepository modelVersionRepository;

    @Autowired
    private ModelElementRepository modelElementRepository;

    @Autowired
    private ModelRelationshipRepository modelRelationshipRepository;

    @Autowired
    private RuntimeSessionRepository runtimeSessionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private com.mavis.analyzer.runtime.service.RunnerReceiptIngestService runnerReceiptIngestService;

    @TempDir
    Path tempStateRoot;

    @Test
    @DisplayName("CHẶNG 11 & 12 E2E: /run-definition -> /lifecycle-ack -> /ingest-receipt-ack -> Idempotent Replay 200 -> Conflict 409")
    void testRunnerReceiptEndToEndWorkflow() throws Exception {
        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempStateRoot.toString());

        // Chuẩn bị User & Role
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("runner_student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_secret")
                .fullName("Runner Integration Tester")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("Fruit Market Runner Integration " + UUID.randomUUID().toString().substring(0, 6))
                .owner(user)
                .build());

        // Chuẩn bị composeYaml trên đĩa
        String composeYaml = """
                services:
                  order-service:
                    image: order-service@sha256:1111222233334444555566667777888899990000111122223333444455556666
                  payment-service:
                    image: payment-service@sha256:2222333344445555666677778888999900001111222233334444555566667777
                """;
        Path composeFile = tempStateRoot.resolve("docker-compose.yml");
        Files.writeString(composeFile, composeYaml);

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .storagePath(composeFile.toString())
                .build());

        ModelVersion baseVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        ModelElement elA = modelElementRepository.save(ModelElement.builder()
                .modelVersion(baseVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .build());

        ModelElement elB = modelElementRepository.save(ModelElement.builder()
                .modelVersion(baseVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .build());

        modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(baseVersion)
                .sourceElement(elA)
                .targetElement(elB)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";

        // Chuẩn bị scenarioConfig hợp lệ
        ObjectNode scenarioConfig = objectMapper.createObjectNode();
        ObjectNode profile = scenarioConfig.putObject("profile");
        profile.put("collectorImage", "otel/collector@sha256:1111222233334444555566667777888899990000111122223333444455556666");
        profile.put("instrumentationVolume", "mavis-agents-v1");
        ObjectNode apps = profile.putObject("applications");
        apps.putObject("order-service").put("runtime", "dotnet8").put("containerPort", 8080);
        apps.putObject("payment-service").put("runtime", "java").put("containerPort", 8080);

        ObjectNode scenario = scenarioConfig.putObject("scenario");
        ArrayNode steps = scenario.putArray("steps");
        ObjectNode step = steps.addObject();
        step.put("id", "step1");
        step.put("service", "order-service");
        step.put("method", "GET");
        step.put("path", "/orders");

        RuntimeSession session = runtimeSessionRepository.save(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(baseVersion)
                .triggeredBy(user)
                .resourceProject(resourceProject)
                .profileVersionId("local-poc-profile/1.0")
                .runConfigurationVersionId("run-config/1.0")
                .scenarioVersionId("scenario/1.0")
                .scenarioConfig(scenarioConfig)
                .confirmedServiceMappings(Map.of("order-service", elA.getId().toString(), "payment-service", elB.getId().toString()))
                .scenarioStatus("APPROVED")
                .executionStatus("READY_FOR_DISPATCH")
                .build());

        UUID sessionId = session.getId();

        // =========================================================================
        // BƯỚC 1: GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition
        // =========================================================================
        mockMvc.perform(get("/api/v1/analyzer/runtime/sessions/{sessionId}/run-definition", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.sessionId").value(sessionId.toString()))
                .andExpect(jsonPath("$.data.modelVersionId").value(baseVersion.getId().toString()))
                .andExpect(jsonPath("$.data.sourceSnapshotId").value(snapshot.getId().toString()))
                .andExpect(jsonPath("$.data.profileVersionId").value("local-poc-profile/1.0"))
                .andExpect(jsonPath("$.data.resourceProject").value(resourceProject))
                .andExpect(jsonPath("$.data.confirmedServiceMappings").isMap());

        // =========================================================================
        // BƯỚC 2: POST /api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack (ALLOCATED -> RUNNING)
        // =========================================================================
        RuntimeSessionLifecycleAckRequestDTO allocReq = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(sessionId)
                .resourceProject(resourceProject)
                .stage("ALLOCATED")
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(allocReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.executionStatus").value("ALLOCATED"));

        RuntimeSessionLifecycleAckRequestDTO runReq = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(sessionId)
                .resourceProject(resourceProject)
                .stage("RUNNING")
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(runReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.executionStatus").value("RUNNING"))
                .andExpect(jsonPath("$.data.scenarioStatus").value("RUNNING"));

        // =========================================================================
        // BƯỚC 3: POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack
        // =========================================================================
        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("order-service")
                .modelServiceId(elA.getId().toString())
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b7a")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("payment-service")
                .modelServiceId(elB.getId().toString())
                .durationNanoseconds("82500000") // 82ms
                .httpStatusCode(200)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(baseVersion.getId().toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(new RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b7a")))
                .warnings(List.of())
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshot.getId().toString())
                .modelVersionId(baseVersion.getId().toString())
                .profileVersionId("local-poc-profile/1.0")
                .runConfigurationVersionId("run-config/1.0")
                .scenarioVersionId("scenario/1.0")
                .resourceProject(resourceProject)
                .sandboxEnforcementConfirmed(true)
                .outcome(outcome)
                .build();

        MvcResult ackResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.persistenceStatus").value("COMMITTED"))
                .andExpect(jsonPath("$.data.publicationGateStatus").value("PROMOTED"))
                .andExpect(jsonPath("$.data.promotedLatest").value(true))
                .andExpect(jsonPath("$.data.receiptDigest").isNotEmpty())
                .andReturn();

        JsonNode ackNode = objectMapper.readTree(ackResult.getResponse().getContentAsString());
        String receiptDigest = ackNode.get("data").get("receiptDigest").asText();

        // Kiểm tra session cập nhật
        RuntimeSession updatedSession = runtimeSessionRepository.findById(sessionId).orElseThrow();
        assertThat(updatedSession.getScenarioStatus()).isEqualTo("PASSED");
        assertThat(updatedSession.getExecutionStatus()).isEqualTo("COMPLETED");
        assertThat(updatedSession.getReceiptDigest()).isEqualTo(receiptDigest);

        // =========================================================================
        // BƯỚC 4: IDEMPOTENCY TEST: Replay cùng digest trả ALREADY_COMMITTED
        // =========================================================================
        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.persistenceStatus").value("ALREADY_COMMITTED"))
                .andExpect(jsonPath("$.data.receiptDigest").value(receiptDigest));

        // =========================================================================
        // BƯỚC 5: CONFLICT TEST: Replay khác digest ném 409 CONFLICT
        // =========================================================================
        RunnerReceiptIngestRequestDTO conflictingReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshot.getId().toString())
                .modelVersionId(baseVersion.getId().toString())
                .profileVersionId("local-poc-profile/1.0")
                .runConfigurationVersionId("run-config/1.0")
                .scenarioVersionId("scenario/1.0")
                .resourceProject(resourceProject)
                .sandboxEnforcementConfirmed(true)
                .outcome(RunnerOutcomeDTO.builder().executionStatus("Failed").scenarioStatus("Failed").build())
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(conflictingReceipt)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Conflicting RunnerReceipt digest")));

        // =========================================================================
        // BƯỚC 6: SCOPE MISMATCH TEST: Lệch version ID trả 400 BAD_REQUEST
        // =========================================================================
        RunnerReceiptIngestRequestDTO badProfileReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshot.getId().toString())
                .modelVersionId(baseVersion.getId().toString())
                .profileVersionId("wrong-profile-version")
                .runConfigurationVersionId("run-config/1.0")
                .scenarioVersionId("scenario/1.0")
                .resourceProject(resourceProject)
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", sessionId)
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badProfileReceipt)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("profileVersionId không khớp")));
    }

    @Test
    @DisplayName("CHẶNG 12: Authorization & X-Mavis-Runner-Key - User khác bị 403, Runner có key hợp lệ gọi thành công")
    void testAuthorizationAndRunnerServiceKey() throws Exception {
        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempStateRoot.toString());

        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User owner = userRepository.save(User.builder()
                .email("owner_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed")
                .fullName("Project Owner")
                .role(studentRole)
                .build());

        User otherUser = userRepository.save(User.builder()
                .email("other_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed")
                .fullName("Other Student")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("Secure Project " + UUID.randomUUID().toString().substring(0, 6))
                .owner(owner)
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .build());

        ModelVersion baseVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .build());

        String resourceProject = "mavisrun-" + UUID.randomUUID().toString().replace("-", "").toLowerCase();
        RuntimeSession session = runtimeSessionRepository.save(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(baseVersion)
                .scenarioName("secure-test")
                .resourceProject(resourceProject)
                .executionStatus("READY_FOR_DISPATCH")
                .scenarioStatus("APPROVED")
                .profileVersionId("sha256:1111111111111111111111111111111111111111111111111111111111111111")
                .runConfigurationVersionId("sha256:2222222222222222222222222222222222222222222222222222222222222222")
                .scenarioVersionId("sha256:3333333333333333333333333333333333333333333333333333333333333333")
                .build());

        RuntimeSessionLifecycleAckRequestDTO ackReq = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(session.getId())
                .resourceProject(resourceProject)
                .stage("ALLOCATED")
                .build();

        // 1. User khác (otherUser) gọi /lifecycle-ack không có Runner-Key -> 403 FORBIDDEN
        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", session.getId())
                        .header("Authorization", testAuthorization(otherUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ackReq)))
                .andExpect(status().isForbidden());

        // 2. Gọi với header X-Mavis-Runner-Key hợp lệ (không cần user auth) -> 200 OK
        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack", session.getId())
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ackReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.executionStatus").value("ALLOCATED"));

        // 3. User khác (otherUser) gọi /ingest-receipt-ack không có Runner-Key -> 403 FORBIDDEN
        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(session.getId().toString())
                .sourceSnapshotId(snapshot.getId().toString())
                .modelVersionId(baseVersion.getId().toString())
                .profileVersionId(session.getProfileVersionId())
                .runConfigurationVersionId(session.getRunConfigurationVersionId())
                .scenarioVersionId(session.getScenarioVersionId())
                .resourceProject(resourceProject)
                .sandboxEnforcementConfirmed(false)
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Failed")
                        .scenarioStatus("NotRun")
                        .evidenceStatus("Unavailable")
                        .cleanupStatus("Confirmed")
                        .traceQuality("Unavailable")
                        .mappingStatus("Unavailable")
                        .trace(RunnerTraceCorrelationDTO.builder().spans(List.of()).build())
                        .build())
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", session.getId())
                        .header("Authorization", testAuthorization(otherUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isForbidden());

        // 4. Runner gọi /ingest-receipt-ack với X-Mavis-Runner-Key hợp lệ -> 200 OK
        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack", session.getId())
                        .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publicationGateStatus").value("SKIPPED_NO_EVIDENCE"));
    }
}
