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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ImpactApiIntegrationTest {

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
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("API Integration Test: GET /api/v1/analyzer/impact - 3-tier chain A -> B -> C with Batch Evidence")
    void testChangeImpactAnalysisApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU KIẾN TRÚC ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("student_impact_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_secret")
                .fullName("Nguyen Van Impact")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("fruit-impact-app-" + UUID.randomUUID().toString().substring(0, 8))
                .owner(user)
                .projectType("STUDENT_WORKING")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .storagePath("/storage/test/fruit_impact.zip")
                .build());

        ModelVersion modelVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        // 3 Nodes: api-gateway (A), order-service (B), payment-service (C)
        ModelElement gatewayNode = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build());

        ModelElement orderNode = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build());

        ModelElement paymentNode = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build());

        // Relationships: gateway -> order, order -> payment
        ModelRelationship relGatewayOrder = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(gatewayNode)
                .targetElement(orderNode)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        ModelRelationship relOrderPayment = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(orderNode)
                .targetElement(paymentNode)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        // Evidences
        Evidence evGatewayOrder = evidenceRepository.save(Evidence.builder()
                .sourceSnapshot(snapshot)
                .modelVersion(modelVersion)
                .relationship(relGatewayOrder)
                .locator("GatewayRoutes.java:45")
                .sourceType("STATIC_CODE")
                .excerpt(".route(\"order-service\", r -> r.path(\"/api/orders/**\"))")
                .build());

        Evidence evOrderPayment = evidenceRepository.save(Evidence.builder()
                .sourceSnapshot(snapshot)
                .modelVersion(modelVersion)
                .relationship(relOrderPayment)
                .locator("OrderService.java:120")
                .sourceType("STATIC_CODE")
                .excerpt("restTemplate.postForObject(\"http://payment-service/pay\", ...)")
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> GỌI API GET /api/v1/analyzer/impact");
        System.out.println("    sessionId=" + modelVersion.getId() + " (ModelVersionId)");
        System.out.println("    nodeId=" + paymentNode.getId() + " (payment-service)");
        System.out.println("================================================================================");

        // --- 2. THỰC THI API CALL ---
        MvcResult result = mockMvc.perform(get("/api/v1/analyzer/impact")
                        .param("sessionId", modelVersion.getId().toString())
                        .param("nodeId", paymentNode.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.targetElementName").value("payment-service"))
                .andExpect(jsonPath("$.data.totalImpactedCount").value(2))
                .andExpect(jsonPath("$.data.directlyImpactedCount").value(1))
                .andExpect(jsonPath("$.data.indirectlyImpactedCount").value(1))
                .andExpect(jsonPath("$.data.cyclicDependencyDetected").value(false))
                .andExpect(jsonPath("$.data.impactedElements[0].name").value("order-service"))
                .andExpect(jsonPath("$.data.impactedElements[0].impactLevel").value("DIRECTLY_IMPACTED"))
                .andExpect(jsonPath("$.data.impactedElements[0].hopDistance").value(1))
                .andExpect(jsonPath("$.data.impactedElements[1].name").value("api-gateway"))
                .andExpect(jsonPath("$.data.impactedElements[1].impactLevel").value("INDIRECTLY_IMPACTED"))
                .andExpect(jsonPath("$.data.impactedElements[1].hopDistance").value(2))
                .andReturn();

        String responseJson = result.getResponse().getContentAsString();
        JsonNode responseNode = objectMapper.readTree(responseJson);

        System.out.println("RESPONSE BODY:");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(responseNode));
        System.out.println("================================================================================");
    }
}
