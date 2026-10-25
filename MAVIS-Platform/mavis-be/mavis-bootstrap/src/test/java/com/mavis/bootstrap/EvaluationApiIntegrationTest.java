package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EvaluationApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

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
    private EvidenceRepository evidenceRepository;

    @Autowired
    private EvaluationRunRepository evaluationRunRepository;

    @Autowired
    private EvaluationFindingRepository evaluationFindingRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("API Integration Test: POST /evaluate -> GET /evaluations -> GET /findings (Chấm 5 quy tắc kiến trúc)")
    void testArchitectureEvaluationLifecycle() throws Exception {
        // --- 1. SETUP DỮ LIỆU KIẾN TRÚC MẪU ĐỂ TEST CẢ 5 QUY TẮC ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("student_eval_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("secret_pass")
                .fullName("Evaluation Tester")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("Eval Test System " + UUID.randomUUID().toString().substring(0, 6))
                .owner(user)
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .storagePath("/storage/eval-project.zip")
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .build());

        ModelVersion modelVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        // Tạo các Elements:
        // Service A & Service B: tạo vòng lặp (RULE-01)
        // Shared DB: cả A và B cùng truy cập (RULE-02)
        // Service C: bị cô lập hoàn toàn bậc 0 (RULE-03)
        // Uncertain Element: trạng thái UNCERTAIN_MAPPING (RULE-05)
        ModelElement serviceA = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("STUDENT_CONFIRMED")
                .build());

        ModelElement serviceB = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .status("STUDENT_CONFIRMED")
                .build());

        ModelElement sharedDb = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("global-ecommerce-db")
                .elementType("DATABASE")
                .languageStack("POSTGRESQL")
                .properties(objectMapper.createObjectNode()
                        .put("resourceRole", "LOGICAL_DATASTORE")
                        .put("physicalHost", "shared-db")
                        .put("port", "5432")
                        .put("database", "global-ecommerce-db")
                        .put("schema", "public"))
                .status("STUDENT_CONFIRMED")
                .build());

        ModelElement serviceIsolated = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("analytics-service")
                .elementType("SERVICE_CONTAINER")
                .status("STUDENT_CONFIRMED")
                .build());

        ModelElement uncertainComponent = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("legacy-adapter")
                .elementType("COMPONENT")
                .status("UNCERTAIN_MAPPING")
                .build());

        // Tạo các Relationships:
        // Cạnh 1: A -> B (có Evidence)
        ModelRelationship relAtoB = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(serviceA)
                .targetElement(serviceB)
                .relationType("SERVICE_HTTP_CALL")
                .build());

        // Cạnh 2: B -> A (Tạo chu trình A <-> B cho RULE-01) - KHÔNG CÓ Evidence (kích hoạt RULE-04)
        ModelRelationship relBtoA = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(serviceB)
                .targetElement(serviceA)
                .relationType("SERVICE_HTTP_CALL")
                .build());

        // Cạnh 3: A -> sharedDb (DATABASE_ACCESS có Evidence)
        ModelRelationship relAtoDb = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(serviceA)
                .targetElement(sharedDb)
                .relationType("DATABASE_ACCESS")
                .build());

        // Cạnh 4: B -> sharedDb (DATABASE_ACCESS có Evidence) -> Kích hoạt RULE-02: Shared Database!
        ModelRelationship relBtoDb = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(serviceB)
                .targetElement(sharedDb)
                .relationType("DATABASE_ACCESS")
                .build());

        // Tạo Evidences:
        evidenceRepository.save(Evidence.builder()
                .modelVersion(modelVersion)
                .sourceSnapshot(snapshot)
                .relationship(relAtoB)
                .sourceType("STATIC_CODE")
                .locator("OrderController.java:45")
                .excerpt("paymentClient.sendOrder(order)")
                .build());

        Evidence dbEvidenceA = evidenceRepository.save(Evidence.builder()
                .modelVersion(modelVersion)
                .sourceSnapshot(snapshot)
                .relationship(relAtoDb)
                .sourceType("CONFIG_FILE")
                .locator("application.yml:12")
                .excerpt("spring.datasource.url=jdbc:postgresql://shared-db:5432/global-ecommerce-db")
                .build());

        Evidence dbEvidenceB = evidenceRepository.save(Evidence.builder()
                .modelVersion(modelVersion)
                .sourceSnapshot(snapshot)
                .relationship(relBtoDb)
                .sourceType("CONFIG_FILE")
                .locator("payment.yml:8")
                .excerpt("spring.datasource.url=jdbc:postgresql://shared-db:5432/global-ecommerce-db")
                .build());
        // relBtoA cố ý KHÔNG có evidence để kích hoạt RULE-04

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API POST /api/v1/analyzer/models/" + modelVersion.getId() + "/evaluate");
        System.out.println("================================================================================");

        // --- BƯỚC 1: POST /api/v1/analyzer/models/{modelVersionId}/evaluate ---
        MvcResult evalResult = mockMvc.perform(post("/api/v1/analyzer/models/{modelVersionId}/evaluate", modelVersion.getId())
                        .header("X-Test-User-Email",user.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.complianceScore").exists())
                .andExpect(jsonPath("$.data.findings").isArray())
                .andReturn();

        String evalJson = evalResult.getResponse().getContentAsString();
        JsonNode evalNode = objectMapper.readTree(evalJson);
        System.out.println("RESPONSE (Bước 1 - Evaluate):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(evalNode));

        UUID evaluationRunId = UUID.fromString(evalNode.get("data").get("id").asText());
        double score = evalNode.get("data").get("complianceScore").asDouble();
        System.out.println(">>> Compliance Score tính toán được: " + score);

        // Kiểm tra kết quả 5 quy tắc:
        // RULE-01 vi phạm (-20)
        // RULE-02 vi phạm (-10)
        // RULE-03 needs review (-5)
        // RULE-04 vi phạm (-10)
        // RULE-05 needs review (-5)
        // Score = 100 - 20 - 10 - 5 - 10 - 5 = 50.0
        assertThat(score).isEqualTo(50.0);
        assertThat(evalNode.get("data").get("summaryMetrics").get("violationCount").asInt()).isEqualTo(3);
        assertThat(evalNode.get("data").get("summaryMetrics").get("needsReviewCount").asInt()).isEqualTo(2);
        assertThat(evalNode.get("data").get("summaryMetrics").get("passedCount").asInt()).isEqualTo(0);
        assertThat(evalNode.path("data").path("ruleSetVersion").asText()).isEqualTo("3e-2");

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API GET /api/v1/analyzer/models/" + modelVersion.getId() + "/evaluations");
        System.out.println("================================================================================");

        // --- BƯỚC 2: GET /api/v1/analyzer/models/{modelVersionId}/evaluations ---
        MvcResult getEvaluationsResult = mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}/evaluations", modelVersion.getId())
                        .header("X-Test-User-Email",user.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].id").value(evaluationRunId.toString()))
                .andReturn();

        String getEvaluationsJson = getEvaluationsResult.getResponse().getContentAsString();
        JsonNode getEvaluationsNode = objectMapper.readTree(getEvaluationsJson);
        System.out.println("RESPONSE (Bước 2 - Lịch sử Evaluation Runs):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(getEvaluationsNode));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: GỌI API GET /api/v1/analyzer/evaluations/" + evaluationRunId + "/findings");
        System.out.println("================================================================================");

        // --- BƯỚC 3: GET /api/v1/analyzer/evaluations/{evaluationRunId}/findings ---
        MvcResult getFindingsResult = mockMvc.perform(get("/api/v1/analyzer/evaluations/{evaluationRunId}/findings", evaluationRunId)
                        .header("X-Test-User-Email",user.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String getFindingsJson = getFindingsResult.getResponse().getContentAsString();
        JsonNode getFindingsNode = objectMapper.readTree(getFindingsJson);
        System.out.println("RESPONSE (Bước 3 - Chi tiết Findings):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(getFindingsNode));

        JsonNode findingsArray = getFindingsNode.get("data");
        assertThat(findingsArray.size()).isEqualTo(5);

        JsonNode sharedFinding = null;
        for (JsonNode finding : findingsArray) {
            if ("RULE-02".equals(finding.path("ruleId").asText())) sharedFinding = finding;
        }
        assertThat(sharedFinding).isNotNull();
        assertThat(sharedFinding.path("status").asText()).isEqualTo("VIOLATION");
        String findingId = sharedFinding.path("id").asText();
        MvcResult evidenceResult = mockMvc.perform(get(
                        "/api/v1/analyzer/evaluations/{run}/findings/{finding}/evidence", evaluationRunId, findingId)
                        .header("X-Test-User-Email", user.getEmail()))
                .andExpect(status().isOk()).andReturn();
        JsonNode evidenceRows = objectMapper.readTree(evidenceResult.getResponse().getContentAsString()).path("data");
        assertThat(evidenceRows.size()).isEqualTo(2);
        assertThat(java.util.stream.StreamSupport.stream(evidenceRows.spliterator(), false)
                .map(row -> row.path("id").asText()).toList())
                .containsExactlyInAnyOrder(dbEvidenceA.getId().toString(), dbEvidenceB.getId().toString());

        var explanation = objectMapper.createObjectNode()
                .put("modelVersionId", modelVersion.getId().toString())
                .put("elementId", sharedDb.getId().toString()).put("explanationScope", "RULE_FINDING")
                .put("evaluationRunId", evaluationRunId.toString()).put("findingId", findingId);
        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .header("X-Test-User-Email", user.getEmail()).contentType(MediaType.APPLICATION_JSON)
                        .content(explanation.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.contractVersion").value("3e/2"))
                .andExpect(jsonPath("$.data.findingId").value(findingId))
                .andExpect(jsonPath("$.data.citedEvidenceIds.length()").value(2));
        explanation.put("elementId", serviceIsolated.getId().toString());
        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .header("X-Test-User-Email", user.getEmail()).contentType(MediaType.APPLICATION_JSON)
                        .content(explanation.toString()))
                .andExpect(status().isBadRequest());

        User outsider = userRepository.save(User.builder().email("outsider_" + UUID.randomUUID() + "@example.invalid")
                .passwordHash("fixture-only").fullName("Unrelated student").role(studentRole).build());
        mockMvc.perform(get("/api/v1/analyzer/evaluations/{run}/findings/{finding}/evidence", evaluationRunId, findingId)
                        .header("X-Test-User-Email", outsider.getEmail()))
                .andExpect(status().isForbidden());

        System.out.println("\n>>> [XÁC MINH CHI TIẾT TỪNG QUY TẮC]:");
        for (JsonNode finding : findingsArray) {
            String ruleId = finding.get("ruleId").asText();
            String status = finding.get("status").asText();
            String severity = finding.get("severity").asText();
            String msg = finding.get("message").asText();
            System.out.printf("  [%s] Status: %s | Severity: %s | Message: %s%n", ruleId, status, severity, msg);
        }

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ 5 QUY TẮC KIẾN TRÚC & CÁC API HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
