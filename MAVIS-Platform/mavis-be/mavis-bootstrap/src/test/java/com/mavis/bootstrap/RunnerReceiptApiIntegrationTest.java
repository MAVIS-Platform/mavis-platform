package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
class RunnerReceiptApiIntegrationTest {

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
    private RuntimeSessionRepository runtimeSessionRepository;

    @Autowired
    private ModelVersionRepository modelVersionRepository;

    @Autowired
    private ModelElementRepository modelElementRepository;

    @Autowired
    private ModelRelationshipRepository modelRelationshipRepository;

    @Autowired
    private com.mavis.analyzer.runtime.service.RunnerReceiptIngestService runnerReceiptIngestService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL STAGE 8 API TEST: RunDefinition -> IngestReceipt (Scope, Nanosecond duration, Idempotency) -> SyncOutbox -> Error Handling")
    void testRunnerContractAndReceiptLifecycleApi(@TempDir Path tempStateRoot) throws Exception {
        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempStateRoot.toString());

        // 1. SETUP DỮ LIỆU BAN ĐẦU
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

        RuntimeSession session = runtimeSessionRepository.save(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(baseVersion)
                .triggeredBy(user)
                .resourceProject(resourceProject)
                .profileVersionId("local-poc-profile/1.0")
                .runConfigurationVersionId("run-config/1.0")
                .scenarioVersionId("scenario/1.0")
                .confirmedServiceMappings(Map.of("order-service", elA.getId().toString(), "payment-service", elB.getId().toString()))
                .scenarioStatus("RUNNING")
                .executionStatus("RUNNING")
                .build());

        UUID sessionId = session.getId();

        // =========================================================================
        // BƯỚC 1: GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition
        // =========================================================================
        MvcResult runDefResult = mockMvc.perform(get("/api/v1/analyzer/runtime/sessions/{sessionId}/run-definition", sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.sessionId").value(sessionId.toString()))
                .andExpect(jsonPath("$.data.modelVersionId").value(baseVersion.getId().toString()))
                .andExpect(jsonPath("$.data.sourceSnapshotId").value(snapshot.getId().toString()))
                .andExpect(jsonPath("$.data.profileVersionId").value("local-poc-profile/1.0"))
                .andExpect(jsonPath("$.data.confirmedServiceMappings").isMap())
                .andReturn();

        JsonNode runDefNode = objectMapper.readTree(runDefResult.getResponse().getContentAsString());
        assertThat(runDefNode.get("data").get("confirmedServiceMappings").has("order-service")).isTrue();

        // =========================================================================
        // BƯỚC 2: POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt
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

        RunnerCausalEdgeDTO edge = RunnerCausalEdgeDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .parentSpanId("00f067aa0ba902b7")
                .childSpanId("5fb397be34d23b7a")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(baseVersion.getId().toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(edge))
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
                .resourceProject(resourceProject)
                .sandboxEnforcementConfirmed(true)
                .outcome(outcome)
                .build();

        MvcResult ingestResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.origin").value("RUNTIME_ENRICHED"))
                .andExpect(jsonPath("$.data.revision").value(2))
                .andReturn();

        JsonNode enrichedModelNode = objectMapper.readTree(ingestResult.getResponse().getContentAsString());
        UUID enrichedModelId = UUID.fromString(enrichedModelNode.get("data").get("id").asText());

        // Kiểm tra session được cập nhật chính xác
        RuntimeSession updatedSession = runtimeSessionRepository.findById(sessionId).orElseThrow();
        assertThat(updatedSession.getScenarioStatus()).isEqualTo("PASSED");
        assertThat(updatedSession.getExecutionStatus()).isEqualTo("COMPLETED");
        assertThat(updatedSession.getCleanupStatus()).isEqualTo("CONFIRMED");
        assertThat(updatedSession.getTraceStatus()).isEqualTo("COMPLETE");
        assertThat(updatedSession.getRunnerReceiptJson()).isNotNull();

        // =========================================================================
        // BƯỚC 3: IDEMPOTENCY TEST: Gửi lại cùng receipt lần 2 -> Không tạo duplicate
        // =========================================================================
        MvcResult replayResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receipt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(enrichedModelId.toString()))
                .andReturn();

        long modelCount = modelVersionRepository.findByProjectId(project.getId()).size();
        assertThat(modelCount).isEqualTo(2); // 1 baseVersion + 1 enrichedVersion, không có bản thứ 3

        // =========================================================================
        // BƯỚC 4: POST /api/v1/analyzer/runtime/sessions/{sessionId}/sync-outbox
        // =========================================================================
        Path receiptsDir = Files.createDirectories(tempStateRoot.resolve("receipts"));
        String secondResourceProject = "mavisrun-abcdef0123456789abcdef0123456789";
        Path outboxReceiptFile = receiptsDir.resolve(secondResourceProject + ".json");

        receipt.setResourceProject(secondResourceProject);
        Files.writeString(outboxReceiptFile, objectMapper.writeValueAsString(receipt));

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/sync-outbox", sessionId)
                        .param("resourceProject", secondResourceProject))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.resourceProject").value(secondResourceProject));

        // =========================================================================
        // BƯỚC 5: KIỂM THỬ ÂM TÍNH (Scope mismatch -> 400 Bad Request)
        // =========================================================================
        RunnerReceiptIngestRequestDTO badReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(UUID.randomUUID().toString()) // Mismatched session ID
                .sourceSnapshotId(snapshot.getId().toString())
                .build();

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badReceipt)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Runner receipt scope mismatch")));
    }
}
