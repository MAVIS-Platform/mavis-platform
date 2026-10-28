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
class ImpactApiIntegrationTest extends ApiIntegrationContext {

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

    @org.springframework.boot.test.mock.mockito.MockBean
    private com.mavis.analyzer.impact.WorkerImpactService workerImpactService;

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
                .origin("USER_CONFIRMED")
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

        com.mavis.workerclient.ImpactWorkerClient.Result workerResult = new com.mavis.workerclient.ImpactWorkerClient.Result(
                modelVersion.getId().toString(),
                "rev-1",
                paymentNode.getId().toString(),
                java.util.List.of(
                        new com.mavis.workerclient.ImpactWorkerClient.Path(
                                orderNode.getId().toString(),
                                "Direct",
                                1,
                                java.util.List.of(orderNode.getId().toString(), paymentNode.getId().toString()),
                                java.util.List.of("rel1"),
                                java.util.List.of(evOrderPayment.getId().toString())
                        ),
                        new com.mavis.workerclient.ImpactWorkerClient.Path(
                                gatewayNode.getId().toString(),
                                "Indirect",
                                2,
                                java.util.List.of(gatewayNode.getId().toString(), orderNode.getId().toString(), paymentNode.getId().toString()),
                                java.util.List.of("rel2", "rel1"),
                                java.util.List.of(evGatewayOrder.getId().toString(), evOrderPayment.getId().toString())
                        )
                ),
                false,
                java.util.List.of(),
                java.util.List.of()
        );

        java.util.Map<String, String> serviceNames = java.util.Map.of(
                paymentNode.getId().toString(), "payment-service",
                orderNode.getId().toString(), "order-service",
                gatewayNode.getId().toString(), "api-gateway"
        );

        java.util.Map<String, com.mavis.analyzer.impact.ImpactGraphLoader.EvidenceView> evidenceMap = java.util.Map.of(
                evOrderPayment.getId().toString(), new com.mavis.analyzer.impact.ImpactGraphLoader.EvidenceView(
                        evOrderPayment.getId().toString(),
                        snapshot.getId(),
                        evOrderPayment.getLocator(),
                        evOrderPayment.getAdapterVersion(),
                        evOrderPayment.getSourceType(),
                        null
                ),
                evGatewayOrder.getId().toString(), new com.mavis.analyzer.impact.ImpactGraphLoader.EvidenceView(
                        evGatewayOrder.getId().toString(),
                        snapshot.getId(),
                        evGatewayOrder.getLocator(),
                        evGatewayOrder.getAdapterVersion(),
                        evGatewayOrder.getSourceType(),
                        null
                )
        );

        org.mockito.Mockito.when(workerImpactService.analyze(
                org.mockito.ArgumentMatchers.eq(modelVersion.getId()),
                org.mockito.ArgumentMatchers.eq(paymentNode.getId()),
                org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()
        )).thenReturn(new com.mavis.analyzer.impact.WorkerImpactService.View(
                workerResult,
                serviceNames,
                evidenceMap,
                java.util.List.of()
        ));

        // --- 2. THỰC THI API CALL ---
        MvcResult result = mockMvc.perform(get("/api/v1/analyzer/impact")
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .param("sessionId", modelVersion.getId().toString())
                        .param("nodeId", paymentNode.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andReturn();

        System.out.println("DEBUG IMPACT STATUS: " + result.getResponse().getStatus());
        System.out.println("DEBUG IMPACT CONTENT: " + result.getResponse().getContentAsString());
        assertThat(result.getResponse().getStatus()).isEqualTo(200);

        String responseJson = result.getResponse().getContentAsString();
        JsonNode jsonNode = objectMapper.readTree(responseJson);
        assertThat(jsonNode.get("data").get("targetElementName").asText()).isEqualTo("payment-service");
        assertThat(jsonNode.get("data").get("totalImpactedCount").asInt()).isEqualTo(2);
        assertThat(jsonNode.get("data").get("directlyImpactedCount").asInt()).isEqualTo(1);
        assertThat(jsonNode.get("data").get("indirectlyImpactedCount").asInt()).isEqualTo(1);
        assertThat(jsonNode.get("data").get("cyclicDependencyDetected").asBoolean()).isFalse();
        assertThat(jsonNode.get("data").get("impactedElements").get(0).get("name").asText()).isEqualTo("order-service");
        assertThat(jsonNode.get("data").get("impactedElements").get(0).get("impactLevel").asText()).isEqualTo("DIRECTLY_IMPACTED");
        assertThat(jsonNode.get("data").get("impactedElements").get(0).get("hopDistance").asInt()).isEqualTo(1);
        assertThat(jsonNode.get("data").get("impactedElements").get(1).get("name").asText()).isEqualTo("api-gateway");
        assertThat(jsonNode.get("data").get("impactedElements").get(1).get("impactLevel").asText()).isEqualTo("INDIRECTLY_IMPACTED");
        assertThat(jsonNode.get("data").get("impactedElements").get(1).get("hopDistance").asInt()).isEqualTo(2);
        JsonNode responseNode = objectMapper.readTree(responseJson);

        System.out.println("RESPONSE BODY:");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(responseNode));
        System.out.println("================================================================================");
    }
}
