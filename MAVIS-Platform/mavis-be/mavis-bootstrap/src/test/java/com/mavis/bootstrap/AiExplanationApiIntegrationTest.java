package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
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

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AiExplanationApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

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
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL STAGE 10 API TEST: AI Explain (Scope, Grounding, Redaction, Fallback) -> Cache Replay -> History Query")
    void testAiExplanationLifecycleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User student = userRepository.saveAndFlush(User.builder()
                .email("ai_student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("Nguyen Van AI Tester")
                .role(studentRole)
                .build());

        Project project = projectRepository.saveAndFlush(Project.builder()
                .owner(student)
                .name("Inventory Management Microservices")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.saveAndFlush(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("sha256:112233445566778899aabbccddeeff00")
                .build());

        ModelVersion modelVersion = modelVersionRepository.saveAndFlush(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(student)
                .build());

        ModelElement serviceA = modelElementRepository.saveAndFlush(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("Java 21 / Spring Boot")
                .status("VALIDATED")
                .build());

        Evidence evidenceA = evidenceRepository.saveAndFlush(Evidence.builder()
                .modelVersion(modelVersion)
                .sourceSnapshot(snapshot)
                .element(serviceA)
                .sourceType("STATIC_CODE")
                .locator("src/main/java/com/mavis/InventoryController.java:L45")
                .excerpt("@RestController public class InventoryController { String secretToken = \"bearer secret_value_123\"; }")
                .build());

        // --- BƯỚC 1: POST /api/v1/analyzer/ai/explain ---
        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersion.getId())
                .explanationScope("ELEMENT")
                .elementId(serviceA.getId())
                .userQuestion("Cho biết vai trò của inventory-service kèm token=secret_query_param")
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .header("X-Test-User-Email", student.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.explanationScope").value("ELEMENT"))
                .andExpect(jsonPath("$.data.elementName").value("inventory-service"))
                .andExpect(jsonPath("$.data.secretRedacted").value(true))
                .andExpect(jsonPath("$.data.citedEvidenceIds").isArray())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(responseBody).doesNotContain("secret_query_param");
        assertThat(responseBody).contains("[REDACTED]");

        String explanationIdStr = objectMapper.readTree(responseBody).path("data").path("id").asText();
        UUID explanationId = UUID.fromString(explanationIdStr);

        // --- BƯỚC 2: POST /api/v1/analyzer/ai/explain (Cache Hit) ---
        AiExplainRequestDTO cacheReq = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersion.getId())
                .explanationScope("ELEMENT")
                .elementId(serviceA.getId())
                .forceRefresh(false)
                .build();

        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .header("X-Test-User-Email", student.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cacheReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.cached").value(true))
                .andExpect(jsonPath("$.data.id").value(explanationId.toString()));

        // --- BƯỚC 3: GET /api/v1/analyzer/models/{modelVersionId}/ai-explanations ---
        mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}/ai-explanations", modelVersion.getId())
                        .header("X-Test-User-Email", student.getEmail()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value(explanationId.toString()));

        // --- BƯỚC 4: GET /api/v1/analyzer/ai/explanations/{explanationId} ---
        mockMvc.perform(get("/api/v1/analyzer/ai/explanations/{explanationId}", explanationId)
                        .header("X-Test-User-Email", student.getEmail()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(explanationId.toString()))
                .andExpect(jsonPath("$.data.citedEvidences").isArray());

        // --- BƯỚC 5: CHẶN TRUY VẤN CHÉO (Bad Request khi elementId không thuộc modelVersionId) ---
        ModelVersion otherVersion = modelVersionRepository.saveAndFlush(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(2)
                .origin("GENERATED")
                .build());

        AiExplainRequestDTO foreignReq = AiExplainRequestDTO.builder()
                .modelVersionId(otherVersion.getId())
                .explanationScope("ELEMENT")
                .elementId(serviceA.getId()) // serviceA thuộc modelVersion (rev 1), không phải rev 2!
                .build();

        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .header("X-Test-User-Email", student.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(foreignReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("Phần tử kiến trúc không thuộc về ModelVersion này"));
    }
}
