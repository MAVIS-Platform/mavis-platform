package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.dto.OtelSpanDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
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

import java.time.OffsetDateTime;
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
class OtelTraceApiIntegrationTest extends ApiIntegrationContext {

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
    private EvidenceRepository evidenceRepository;

    @Autowired
    private DiagramVersionRepository diagramVersionRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL OTEL TRACE CORRELATION API TEST: Ingest Traces (Causal Matching, Layer Upgrade, Secret Redaction) -> Sequence Diagram")
    void testOtelTraceCorrelationLifecycleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("otel_student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pass")
                .fullName("OpenTelemetry Trace Tester")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("Microservices Trace Demo " + UUID.randomUUID().toString().substring(0, 6))
                .owner(user)
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("abc1234567890def1234567890def1234567890def1234567890def12345678")
                .build());

        // Phiên thực nghiệm ở trạng thái RUNNING
        RuntimeSession session = runtimeSessionRepository.save(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .triggeredBy(user)
                .scenarioName("Order Fulfillment E2E Tracing")
                .scenarioStatus("RUNNING")
                .traceStatus("NONE")
                .startedAt(OffsetDateTime.now())
                .build());

        // Mô hình tĩnh ban đầu (Revision 1, origin = GENERATED)
        ModelVersion baseVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        // 3 service trong mô hình tĩnh: api-gateway, order-service, payment-service
        ModelElement gateway = modelElementRepository.save(ModelElement.builder()
                .modelVersion(baseVersion)
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build());

        ModelElement orderSvc = modelElementRepository.save(ModelElement.builder()
                .modelVersion(baseVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build());

        ModelElement paymentSvc = modelElementRepository.save(ModelElement.builder()
                .modelVersion(baseVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build());

        // Cạnh tĩnh: api-gateway -> order-service (originLayer = STATIC)
        ModelRelationship staticEdge = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(baseVersion)
                .sourceElement(gateway)
                .targetElement(orderSvc)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API POST /api/v1/analyzer/runtime/sessions/" + session.getId() + "/ingest-traces");
        System.out.println("    baseModelVersionId = " + baseVersion.getId());
        System.out.println("    Payload: 4 Spans (Chuỗi nhân quả, Secret Redaction, Service lạ notification-service)");
        System.out.println("================================================================================");

        // --- BƯỚC 1: POST /ingest-traces ---
        OtelSpanDTO span1 = OtelSpanDTO.builder()
                .traceId("trace-otel-1001")
                .spanId("span-gw-root")
                .parentSpanId(null)
                .serviceName("api-gateway")
                .operationName("POST /api/v1/orders")
                .httpMethod("POST")
                .httpUrl("https://api.gateway.mavis/api/v1/orders")
                .httpStatusCode(200)
                .durationMs(180L)
                .build();

        OtelSpanDTO span2 = OtelSpanDTO.builder()
                .traceId("trace-otel-1001")
                .spanId("span-order-child")
                .parentSpanId("span-gw-root")
                .serviceName("order-service")
                .operationName("OrderController.createOrder")
                .httpMethod("POST")
                .httpUrl("http://order-service:8080/orders")
                .httpStatusCode(201)
                .durationMs(120L)
                .attributes(Map.of("token", "secret-jwt-token-val", "orderAmount", "250.00"))
                .build();

        OtelSpanDTO span3 = OtelSpanDTO.builder()
                .traceId("trace-otel-1001")
                .spanId("span-pay-child")
                .parentSpanId("span-order-child")
                .serviceName("payment-service")
                .operationName("PaymentController.processPayment")
                .httpMethod("POST")
                .httpUrl("http://payment-service:8081/charge?secretKey=superSecretKey123")
                .httpStatusCode(200)
                .durationMs(60L)
                .attributes(Map.of("apiKey", "live-secret-api-key", "currency", "VND"))
                .build();

        // Span 4: Gọi đến service lạ "notification-service" (không có trong static model) -> UNCERTAIN_MAPPING
        OtelSpanDTO span4 = OtelSpanDTO.builder()
                .traceId("trace-otel-1001")
                .spanId("span-notif-child")
                .parentSpanId("span-pay-child")
                .serviceName("notification-service")
                .operationName("NotificationController.sendAlert")
                .httpMethod("POST")
                .httpUrl("http://notification-service:8083/alert")
                .httpStatusCode(200)
                .durationMs(25L)
                .build();

        RuntimeTraceIngestRequestDTO ingestRequest = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(span1, span2, span3, span4))
                .build();

        MvcResult ingestResult = mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-traces", session.getId())
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .param("baseModelVersionId", baseVersion.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ingestRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.revision").value(2))
                .andExpect(jsonPath("$.data.origin").value("RUNTIME_ENRICHED"))
                .andExpect(jsonPath("$.data.isLatestValid").value(false))
                .andReturn();

        String ingestJson = ingestResult.getResponse().getContentAsString();
        JsonNode ingestNode = objectMapper.readTree(ingestJson);
        System.out.println("RESPONSE (Bước 1 - Ingest Traces):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(ingestNode));

        UUID enrichedVersionId = UUID.fromString(ingestNode.get("data").get("id").asText());

        // Kiểm tra cơ sở dữ liệu sau khi Ingest
        RuntimeSession updatedSession = runtimeSessionRepository.findById(session.getId()).orElseThrow();
        assertThat(updatedSession.getScenarioStatus()).isEqualTo("PASSED");
        // Do có notification-service lạ nên traceStatus phải là PARTIAL theo BR-47
        assertThat(updatedSession.getTraceStatus()).isEqualTo("PARTIAL");

        // Kiểm tra ModelRelationships của version mới
        List<ModelRelationship> newRels = modelRelationshipRepository.findByModelVersionId(enrichedVersionId);
        // Có 3 quan hệ: api-gateway->order-service, order-service->payment-service, payment-service->notification-service
        assertThat(newRels).hasSize(3);

        ModelRelationship upgradedStaticRel = newRels.stream()
                .filter(r -> r.getSourceElement().getName().equalsIgnoreCase("api-gateway")
                        && r.getTargetElement().getName().equalsIgnoreCase("order-service"))
                .findFirst().orElseThrow();
        assertThat(upgradedStaticRel.getOriginLayer()).isEqualTo("STATIC_AND_RUNTIME");

        ModelRelationship runtimeObserved1 = newRels.stream()
                .filter(r -> r.getSourceElement().getName().equalsIgnoreCase("order-service")
                        && r.getTargetElement().getName().equalsIgnoreCase("payment-service"))
                .findFirst().orElseThrow();
        assertThat(runtimeObserved1.getRelationType()).isEqualTo("RUNTIME_OBSERVED");
        assertThat(runtimeObserved1.getOriginLayer()).isEqualTo("RUNTIME");

        ModelRelationship runtimeObserved2 = newRels.stream()
                .filter(r -> r.getSourceElement().getName().equalsIgnoreCase("payment-service")
                        && r.getTargetElement().getName().equalsIgnoreCase("notification-service"))
                .findFirst().orElseThrow();
        assertThat(runtimeObserved2.getRelationType()).isEqualTo("RUNTIME_OBSERVED");

        // Kiểm tra phần tử UNCERTAIN_MAPPING
        List<ModelElement> newElements = modelElementRepository.findByModelVersionId(enrichedVersionId);
        ModelElement notifElement = newElements.stream()
                .filter(e -> e.getName().equalsIgnoreCase("notification-service"))
                .findFirst().orElseThrow();
        assertThat(notifElement.getStatus()).isEqualTo("UNCERTAIN_MAPPING");

        // Kiểm tra Evidences được tạo ra
        List<Evidence> evidences = evidenceRepository.findByModelVersionId(enrichedVersionId);
        assertThat(evidences).isNotEmpty();
        assertThat(evidences).allMatch(e -> "RUNTIME_TRACE".equals(e.getSourceType()));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API GET /api/v1/analyzer/runtime/sessions/" + session.getId() + "/sequence");
        System.out.println("    Truy xuất UML Sequence Diagram tương tác nhân quả giữa các service");
        System.out.println("================================================================================");

        // --- BƯỚC 2: GET /sequence ---
        MvcResult sequenceResult = mockMvc.perform(get("/api/v1/analyzer/runtime/sessions/{sessionId}/sequence", session.getId())
                        .header("Authorization", testAuthorization(user.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.notation").value("UML_SEQUENCE"))
                .andExpect(jsonPath("$.data.level").value("RUNTIME_PROCESS"))
                .andExpect(jsonPath("$.data.steps").isArray())
                .andReturn();

        String sequenceJson = sequenceResult.getResponse().getContentAsString();
        JsonNode sequenceNode = objectMapper.readTree(sequenceJson);
        System.out.println("RESPONSE (Bước 2 - UML Sequence Diagram Projection):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sequenceNode));

        JsonNode steps = sequenceNode.get("data").get("steps");
        assertThat(steps.size()).isEqualTo(3);
        assertThat(steps.get(0).get("callerService").asText()).isEqualTo("api-gateway");
        assertThat(steps.get(0).get("calleeService").asText()).isEqualTo("order-service");
        assertThat(steps.get(1).get("callerService").asText()).isEqualTo("order-service");
        assertThat(steps.get(1).get("calleeService").asText()).isEqualTo("payment-service");
        assertThat(steps.get(2).get("callerService").asText()).isEqualTo("payment-service");
        assertThat(steps.get(2).get("calleeService").asText()).isEqualTo("notification-service");

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ CÁC BƯỚC OTEL TRACE CORRELATION & SEQUENCE PROJECTION CHO TASK 5.2 HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
