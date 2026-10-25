package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.OtelSpanDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.SequenceDiagramResponseDTO;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OtelTraceCorrelationServiceImplTest {

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private OtelTraceCorrelationServiceImpl otelTraceCorrelationService;

    private UUID projectId;
    private UUID sessionId;
    private UUID baseModelVersionId;
    private Project project;
    private SourceSnapshot snapshot;
    private RuntimeSession session;
    private ModelVersion baseVersion;

    private ModelElement apiGatewayEl;
    private ModelElement orderServiceEl;
    private ModelElement paymentServiceEl;
    private ModelRelationship staticRel;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        sessionId = UUID.randomUUID();
        baseModelVersionId = UUID.randomUUID();

        project = Project.builder()
                .id(projectId)
                .name("E-Commerce System")
                .build();

        snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(project)
                .build();

        session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .scenarioName("Checkout Flow Benchmark")
                .scenarioStatus("RUNNING")
                .traceStatus("NONE")
                .startedAt(OffsetDateTime.now())
                .build();

        baseVersion = ModelVersion.builder()
                .id(baseModelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .build();

        apiGatewayEl = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build();

        orderServiceEl = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build();

        paymentServiceEl = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build();

        // Cạnh tĩnh: api-gateway -> order-service
        staticRel = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .sourceElement(apiGatewayEl)
                .targetElement(orderServiceEl)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();
    }

    @Test
    @DisplayName("Chuỗi 3 Spans: api-gateway -> order-service -> payment-service: nâng cấp cạnh tĩnh và tạo cạnh mới")
    void testIngestTraces_ThreeSpansCausalCorrelation() {
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            assertThat(mv.getBaseModelVersion()).isSameAs(baseVersion);
            assertThat(mv.getIsLatestValid()).isFalse();
            mv.setId(UUID.randomUUID());
            return mv;
        });

        // 3 phần tử tĩnh: api-gateway, order-service, payment-service
        when(modelElementRepository.findByModelVersionId(baseModelVersionId))
                .thenReturn(List.of(apiGatewayEl, orderServiceEl, paymentServiceEl));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        // 1 cạnh tĩnh: api-gateway -> order-service
        when(modelRelationshipRepository.findByModelVersionId(baseModelVersionId))
                .thenReturn(List.of(staticRel));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        // Dựng 3 Spans
        OtelSpanDTO span1 = OtelSpanDTO.builder()
                .traceId("trace-xyz")
                .spanId("span-gateway-1")
                .parentSpanId(null)
                .serviceName("api-gateway")
                .operationName("POST /api/v1/orders")
                .httpMethod("POST")
                .httpUrl("https://api.mavis.local/api/v1/orders")
                .httpStatusCode(201)
                .durationMs(120L)
                .build();

        OtelSpanDTO span2 = OtelSpanDTO.builder()
                .traceId("trace-xyz")
                .spanId("span-order-2")
                .parentSpanId("span-gateway-1")
                .serviceName("order-service")
                .operationName("OrderController.createOrder")
                .httpMethod("POST")
                .httpUrl("http://order-service:8080/orders")
                .httpStatusCode(201)
                .durationMs(80L)
                .build();

        OtelSpanDTO span3 = OtelSpanDTO.builder()
                .traceId("trace-xyz")
                .spanId("span-payment-3")
                .parentSpanId("span-order-2")
                .serviceName("payment-service")
                .operationName("PaymentController.charge")
                .httpMethod("POST")
                .httpUrl("http://payment-service:8081/charge?token=secret123")
                .httpStatusCode(200)
                .durationMs(40L)
                .attributes(Map.of("apiKey", "super-secret-key", "currency", "USD"))
                .build();

        RuntimeTraceIngestRequestDTO request = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(span1, span2, span3))
                .build();

        // Thực thi
        ModelVersionResponseDTO response = otelTraceCorrelationService.ingestTraces(sessionId, baseModelVersionId, request);

        // Kiểm tra kết quả ModelVersion
        assertThat(response).isNotNull();
        assertThat(response.getRevision()).isEqualTo(2);
        assertThat(response.getOrigin()).isEqualTo("RUNTIME_ENRICHED");

        // Kiểm tra Secret Redaction trong URL và attributes
        assertThat(span3.getHttpUrl()).doesNotContain("secret123");
        assertThat(span3.getHttpUrl()).contains("[REDACTED]");
        assertThat(span3.getAttributes().get("apiKey")).isEqualTo("[REDACTED]");
        assertThat(span3.getAttributes().get("currency")).isEqualTo("USD");

        // Kiểm tra các cạnh đã lưu
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());
        List<ModelRelationship> savedRels = relCaptor.getValue();

        // Phải có 2 cạnh:
        // 1. Cạnh kế thừa (api-gateway -> order-service) được nâng cấp lên STATIC_AND_RUNTIME
        // 2. Cạnh mới phát hiện qua trace (order-service -> payment-service) có originLayer = RUNTIME, relationType = RUNTIME_OBSERVED
        assertThat(savedRels).hasSize(2);

        ModelRelationship upgradedRel = savedRels.stream()
                .filter(r -> r.getSourceElement().getName().equalsIgnoreCase("api-gateway")
                        && r.getTargetElement().getName().equalsIgnoreCase("order-service"))
                .findFirst().orElseThrow();
        assertThat(upgradedRel.getOriginLayer()).isEqualTo("STATIC_AND_RUNTIME");

        ModelRelationship runtimeObservedRel = savedRels.stream()
                .filter(r -> r.getSourceElement().getName().equalsIgnoreCase("order-service")
                        && r.getTargetElement().getName().equalsIgnoreCase("payment-service"))
                .findFirst().orElseThrow();
        assertThat(runtimeObservedRel.getRelationType()).isEqualTo("RUNTIME_OBSERVED");
        assertThat(runtimeObservedRel.getOriginLayer()).isEqualTo("RUNTIME");

        // Kiểm tra Evidences được sinh ra
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> evCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository).saveAll(evCaptor.capture());
        List<Evidence> savedEvidences = evCaptor.getValue();
        assertThat(savedEvidences).hasSize(2);
        assertThat(savedEvidences).allMatch(e -> "RUNTIME_TRACE".equals(e.getSourceType()));
        assertThat(savedEvidences).allMatch(e -> "OTEL_COLLECTOR_1.0".equals(e.getAdapterVersion()));

        // Kiểm tra DiagramVersion
        ArgumentCaptor<DiagramVersion> diagramCaptor = ArgumentCaptor.forClass(DiagramVersion.class);
        verify(diagramVersionRepository).save(diagramCaptor.capture());
        DiagramVersion diagram = diagramCaptor.getValue();
        assertThat(diagram.getNotation()).isEqualTo("UML_SEQUENCE");
        assertThat(diagram.getLevel()).isEqualTo("RUNTIME_PROCESS");
        assertThat(diagram.getLayoutJson().get("steps")).hasSize(2);

        // Kiểm tra RuntimeSession status
        assertThat(session.getScenarioStatus()).isEqualTo("PASSED");
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");
        assertThat(session.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("Gắn cờ UNCERTAIN_MAPPING và traceStatus = PARTIAL khi xuất hiện service lạ trong Span")
    void testIngestTraces_WithUncertainMapping() {
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            assertThat(mv.getBaseModelVersion()).isSameAs(baseVersion);
            mv.setId(UUID.randomUUID());
            return mv;
        });

        // Chỉ có api-gateway và order-service trong mô hình tĩnh
        when(modelElementRepository.findByModelVersionId(baseModelVersionId))
                .thenReturn(List.of(apiGatewayEl, orderServiceEl));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(modelRelationshipRepository.findByModelVersionId(baseModelVersionId))
                .thenReturn(List.of(staticRel));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        // Span có third-party-fraud-checker không nằm trong mô hình tĩnh
        OtelSpanDTO span1 = OtelSpanDTO.builder()
                .traceId("trace-fraud")
                .spanId("span-order-1")
                .parentSpanId(null)
                .serviceName("order-service")
                .build();

        OtelSpanDTO span2 = OtelSpanDTO.builder()
                .traceId("trace-fraud")
                .spanId("span-fraud-2")
                .parentSpanId("span-order-1")
                .serviceName("third-party-fraud-checker")
                .httpMethod("POST")
                .httpUrl("https://fraud.api.net/check")
                .httpStatusCode(200)
                .durationMs(95L)
                .build();

        RuntimeTraceIngestRequestDTO request = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(span1, span2))
                .build();

        ModelVersionResponseDTO response = otelTraceCorrelationService.ingestTraces(sessionId, baseModelVersionId, request);

        assertThat(response).isNotNull();

        // Kiểm tra phần tử UNCERTAIN_MAPPING
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> elCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(elCaptor.capture());
        List<ModelElement> savedElements = elCaptor.getValue();

        Optional<ModelElement> uncertainEl = savedElements.stream()
                .filter(e -> "third-party-fraud-checker".equalsIgnoreCase(e.getName()))
                .findFirst();
        assertThat(uncertainEl).isPresent();
        assertThat(uncertainEl.get().getStatus()).isEqualTo("UNCERTAIN_MAPPING");

        // Kiểm tra session.traceStatus = "PARTIAL"
        assertThat(session.getTraceStatus()).isEqualTo("PARTIAL");
    }

    @Test
    @DisplayName("Lấy Sequence Diagram thành công từ phiên chạy đã đối chiếu")
    void testGetSequenceDiagramBySession_Success() {
        UUID mvId = UUID.randomUUID();
        ModelVersion enrichedMv = ModelVersion.builder()
                .id(mvId)
                .project(project)
                .runtimeSession(session)
                .revision(2)
                .origin("RUNTIME_ENRICHED")
                .build();

        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId))
                .thenReturn(Optional.of(enrichedMv));

        ObjectNode layout = objectMapper.createObjectNode();
        layout.put("notation", "UML_SEQUENCE");
        layout.put("level", "RUNTIME_PROCESS");
        var stepsArr = objectMapper.createArrayNode();
        ObjectNode step1 = objectMapper.createObjectNode();
        step1.put("stepOrder", 1);
        step1.put("callerService", "api-gateway");
        step1.put("calleeService", "order-service");
        step1.put("operation", "POST /orders");
        step1.put("httpMethod", "POST");
        step1.put("httpStatusCode", 201);
        step1.put("durationMs", 50L);
        step1.put("traceId", "tr-1");
        step1.put("spanId", "sp-2");
        step1.put("parentSpanId", "sp-1");
        stepsArr.add(step1);
        layout.set("steps", stepsArr);

        DiagramVersion dv = DiagramVersion.builder()
                .id(UUID.randomUUID())
                .modelVersion(enrichedMv)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .layoutJson(layout)
                .build();

        when(diagramVersionRepository.findByModelVersionIdAndNotation(mvId, "UML_SEQUENCE"))
                .thenReturn(List.of(dv));

        SequenceDiagramResponseDTO result = otelTraceCorrelationService.getSequenceDiagramBySession(sessionId);

        assertThat(result).isNotNull();
        assertThat(result.getDiagramId()).isEqualTo(dv.getId());
        assertThat(result.getNotation()).isEqualTo("UML_SEQUENCE");
        assertThat(result.getSteps()).hasSize(1);
        assertThat(result.getSteps().get(0).getCallerService()).isEqualTo("api-gateway");
        assertThat(result.getSteps().get(0).getCalleeService()).isEqualTo("order-service");
    }

    @Test
    @DisplayName("Ném lỗi NOT_FOUND khi phiên chạy chưa có ModelVersion RUNTIME_ENRICHED")
    void testGetSequenceDiagramBySession_NotFound() {
        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> otelTraceCorrelationService.getSequenceDiagramBySession(sessionId))
                .isInstanceOf(BusinessException.class);
    }
    @Test void rejectsModelFromAnotherProjectBeforePublication() {
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        baseVersion.setProject(Project.builder().id(UUID.randomUUID()).build());
        when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
        assertThatThrownBy(()->otelTraceCorrelationService.ingestTraces(sessionId,baseModelVersionId,new RuntimeTraceIngestRequestDTO())).isInstanceOf(BusinessException.class);
        verify(modelVersionRepository,never()).save(any());
    }
    @Test void identicalSpanIdsFromDifferentTracesCannotFormACall() {
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any())).thenAnswer(inv->{ModelVersion m=inv.getArgument(0);m.setId(UUID.randomUUID());return m;});
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv->inv.getArgument(0));
        var a=OtelSpanDTO.builder().traceId("trace-a").spanId("parent").serviceName("a").build();
        var b=OtelSpanDTO.builder().traceId("trace-b").spanId("child").parentSpanId("parent").serviceName("b").build();
        var req=new RuntimeTraceIngestRequestDTO();req.setSpans(List.of(a,b));
        otelTraceCorrelationService.ingestTraces(sessionId,baseModelVersionId,req);
        var saved=ArgumentCaptor.forClass(DiagramVersion.class);verify(diagramVersionRepository).save(saved.capture());
        assertThat(saved.getValue().getLayoutJson().path("totalSteps").asInt()).isZero();
    }

    @Test
    @DisplayName("M3-AC04/AC05: Gộp cặp CLIENT/SERVER span, bảo toàn chuỗi nhân quả qua CLIENT span nội bộ và chịu được clock skew")
    void testM3_ClientServerSpanDeduplication_CausalChain_And_ClockSkew() throws Exception {
        UUID detProjectId = UUID.fromString("11111111-1111-4111-8111-111111111111");
        UUID detSnapshotId = UUID.fromString("22222222-2222-4222-8222-222222222222");
        UUID detSessionId = UUID.fromString("33333333-3333-4333-8333-333333333333");
        UUID detBaseModelId = UUID.fromString("44444444-4444-4444-8444-444444444444");
        UUID detEnrichedModelId = UUID.fromString("55555555-5555-4555-8555-555555555555");
        UUID detDiagramId = UUID.fromString("66666666-6666-4666-8666-666666666666");

        UUID gatewayBaseId = UUID.fromString("aaaa0001-0000-4000-8000-000000000001");
        UUID orderBaseId = UUID.fromString("aaaa0002-0000-4000-8000-000000000002");
        UUID paymentBaseId = UUID.fromString("aaaa0003-0000-4000-8000-000000000003");
        UUID inventoryBaseId = UUID.fromString("aaaa0004-0000-4000-8000-000000000004");
        UUID staticRelGatewayOrderId = UUID.fromString("bbbb0001-0000-4000-8000-000000000001");

        Project detProject = Project.builder().id(detProjectId).name("M3 Sequence System").build();
        SourceSnapshot detSnapshot = SourceSnapshot.builder().id(detSnapshotId).project(detProject).build();
        ModelVersion detBase = ModelVersion.builder()
                .id(detBaseModelId)
                .project(detProject)
                .sourceSnapshot(detSnapshot)
                .revision(4)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .build();
        RuntimeSession detSession = RuntimeSession.builder()
                .id(detSessionId)
                .project(detProject)
                .sourceSnapshot(detSnapshot)
                .modelVersion(detBase)
                .scenarioName("M3 Checkout Causal Trace")
                .scenarioStatus("RUNNING")
                .traceStatus("NONE")
                .mappingStatus("Mapped")
                .startedAt(OffsetDateTime.parse("2026-10-24T12:00:00Z"))
                .build();

        ModelElement gwEl = ModelElement.builder().id(gatewayBaseId).modelVersion(detBase).name("api-gateway").elementType("SERVICE_CONTAINER").status("VALIDATED").build();
        ModelElement ordEl = ModelElement.builder().id(orderBaseId).modelVersion(detBase).name("order-service").elementType("SERVICE_CONTAINER").status("VALIDATED").build();
        ModelElement payEl = ModelElement.builder().id(paymentBaseId).modelVersion(detBase).name("payment-service").elementType("SERVICE_CONTAINER").status("VALIDATED").build();
        ModelElement invEl = ModelElement.builder().id(inventoryBaseId).modelVersion(detBase).name("inventory-service").elementType("SERVICE_CONTAINER").status("VALIDATED").build();

        ModelRelationship relGwOrd = ModelRelationship.builder()
                .id(staticRelGatewayOrderId)
                .modelVersion(detBase)
                .sourceElement(gwEl)
                .targetElement(ordEl)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        when(runtimeSessionRepository.findById(detSessionId)).thenReturn(Optional.of(detSession));
        when(modelVersionRepository.findById(detBaseModelId)).thenReturn(Optional.of(detBase));
        when(modelVersionRepository.findMaxRevisionByProjectId(detProjectId)).thenReturn(4);
        final ModelVersion[] savedEnrichedRef = new ModelVersion[1];
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(detEnrichedModelId);
            savedEnrichedRef[0] = mv;
            return mv;
        });
        when(modelElementRepository.findByModelVersionId(detBaseModelId)).thenReturn(List.of(gwEl, ordEl, payEl, invEl));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelElement> list = inv.getArgument(0);
            int idx = 1;
            for (ModelElement el : list) {
                if (el.getId() == null) {
                    el.setId(UUID.fromString(String.format("cccc000%d-0000-4000-8000-00000000000%d", idx, idx)));
                    idx++;
                }
            }
            return list;
        });
        when(modelRelationshipRepository.findByModelVersionId(detBaseModelId)).thenReturn(List.of(relGwOrd));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelRelationship> list = inv.getArgument(0);
            int idx = 1;
            for (ModelRelationship r : list) {
                if (r.getId() == null) {
                    r.setId(UUID.fromString(String.format("dddd000%d-0000-4000-8000-00000000000%d", idx, idx)));
                    idx++;
                }
            }
            return list;
        });
        when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<Evidence> list = inv.getArgument(0);
            int idx = 1;
            for (Evidence e : list) {
                if (e.getId() == null) {
                    e.setId(UUID.fromString(String.format("eeee000%d-0000-4000-8000-00000000000%d", idx, idx)));
                    idx++;
                }
            }
            return list;
        });
        final DiagramVersion[] savedDiagramRef = new DiagramVersion[1];
        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> {
            DiagramVersion dv = inv.getArgument(0);
            dv.setId(detDiagramId);
            savedDiagramRef[0] = dv;
            return dv;
        });

        // Root server span in api-gateway
        OtelSpanDTO gwRoot = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-gw-root")
                .serviceName("api-gateway")
                .operationName("POST /api/checkout")
                .attributes(Map.of("span.kind", "SERVER", "startTimeUnixNano", "1700000000500000000"))
                .build();
        // CLIENT span in api-gateway calling order-service
        OtelSpanDTO gwClientOrder = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-gw-client-order")
                .parentSpanId("span-gw-root")
                .serviceName("api-gateway")
                .operationName("HTTP POST /orders")
                .httpMethod("POST")
                .httpUrl("http://order-service:8080/orders")
                .attributes(Map.of("span.kind", "CLIENT", "startTimeUnixNano", "1700000000600000000"))
                .build();
        // SERVER span in order-service (with simulated clock skew: earlier timestamp than parent!)
        OtelSpanDTO orderServer = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-order-server")
                .parentSpanId("span-gw-client-order")
                .serviceName("order-service")
                .operationName("OrderController.createOrder")
                .httpMethod("POST")
                .httpUrl("http://order-service:8080/orders")
                .httpStatusCode(201)
                .durationMs(85L)
                .attributes(Map.of("span.kind", "SERVER", "startTimeUnixNano", "1700000000100000000"))
                .build();
        // Duplicate SERVER span for the exact same CLIENT->SERVER hop (must be deduplicated!)
        OtelSpanDTO duplicateOrderServer = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-order-server-dup")
                .parentSpanId("span-gw-client-order")
                .serviceName("order-service")
                .operationName("OrderController.createOrder")
                .httpMethod("POST")
                .httpUrl("http://order-service:8080/orders")
                .httpStatusCode(201)
                .durationMs(85L)
                .attributes(Map.of("span.kind", "SERVER"))
                .build();
        // Internal CLIENT span in order-service calling payment-service (parent is span-order-server)
        OtelSpanDTO orderClientPayment = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-order-client-pay")
                .parentSpanId("span-order-server")
                .serviceName("order-service")
                .operationName("HTTP POST /payments")
                .httpMethod("POST")
                .httpUrl("http://payment-service:8081/payments")
                .attributes(Map.of("span.kind", "CLIENT"))
                .build();
        // SERVER span in payment-service with explicit mavis.message.sort = SYNCH_CALL
        OtelSpanDTO paymentServer = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-pay-server")
                .parentSpanId("span-order-client-pay")
                .serviceName("payment-service")
                .operationName("PaymentController.authorize")
                .httpMethod("POST")
                .httpUrl("http://payment-service:8081/payments")
                .httpStatusCode(200)
                .durationMs(42L)
                .attributes(Map.of("span.kind", "SERVER", "mavis.message.sort", "SYNCH_CALL"))
                .build();
        // Parallel sibling branch from gwRoot -> inventory-service (explicit mavis.message.sort = ASYNCH_SIGNAL, null statusCode/durationMs)
        OtelSpanDTO inventoryConsumer = OtelSpanDTO.builder()
                .traceId("trace-m3-001")
                .spanId("span-inv-consumer")
                .parentSpanId("span-gw-root")
                .serviceName("inventory-service")
                .operationName("InventoryAuditTopic.publish")
                .attributes(Map.of("span.kind", "CONSUMER", "messaging.system", "kafka", "mavis.message.sort", "ASYNCH_SIGNAL"))
                .build();

        RuntimeTraceIngestRequestDTO req = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(gwRoot, gwClientOrder, orderServer, duplicateOrderServer, orderClientPayment, paymentServer, inventoryConsumer))
                .build();

        otelTraceCorrelationService.ingestTraces(detSessionId, detBaseModelId, req);

        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(detSessionId))
                .thenReturn(Optional.of(savedEnrichedRef[0]));
        when(diagramVersionRepository.findByModelVersionIdAndNotation(detEnrichedModelId, "UML_SEQUENCE"))
                .thenReturn(List.of(savedDiagramRef[0]));

        SequenceDiagramResponseDTO dto = otelTraceCorrelationService.getSequenceDiagramBySession(detSessionId);

        assertThat(dto.getBaseModelVersionId()).isEqualTo(detBaseModelId);
        assertThat(dto.getModelVersionId()).isEqualTo(detEnrichedModelId);
        assertThat(dto.getTraceStatus()).isEqualTo("COMPLETE");
        assertThat(dto.getLimitations()).contains(
                "NO_SYNTHETIC_REPLY_FROM_END_TIME",
                "NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE",
                "CLOCK_SKEW_DETECTED_CAUSAL_ORDER_PRESERVED",
                "UNCLASSIFIED_MESSAGE_SORT_WITHOUT_EXPLICIT_SPAN_ATTRIBUTE"
        );
        // 3 deduplicated business steps (duplicateOrderServer was collapsed)
        assertThat(dto.getSteps()).hasSize(3);

        var step1 = dto.getSteps().get(0);
        assertThat(step1.getMessageId()).isEqualTo("msg-obs-1");
        assertThat(step1.getCallerBaseElementId()).isEqualTo(gatewayBaseId);
        assertThat(step1.getCalleeBaseElementId()).isEqualTo(orderBaseId);
        assertThat(step1.getCallerResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(step1.getCalleeResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(step1.getBaseRelationshipId()).isEqualTo(staticRelGatewayOrderId);
        assertThat(step1.getCandidateRelationshipIds()).containsExactly(staticRelGatewayOrderId);
        // R1: HTTP method/status/URL without explicit mavis.message.sort stays UNKNOWN
        assertThat(step1.getMessageSort()).isEqualTo("UNKNOWN");
        assertThat(step1.getCausalParentMessageIds()).isEmpty();

        var step2 = dto.getSteps().get(1);
        assertThat(step2.getMessageId()).isEqualTo("msg-obs-2");
        assertThat(step2.getCallerBaseElementId()).isEqualTo(orderBaseId);
        assertThat(step2.getCalleeBaseElementId()).isEqualTo(paymentBaseId);
        // Causal parent resolved across internal CLIENT span orderClientPayment -> orderServer (msg-obs-1)!
        assertThat(step2.getCausalParentMessageIds()).containsExactly("msg-obs-1");
        assertThat(step2.getMessageSort()).isEqualTo("SYNCH_CALL");

        var step3 = dto.getSteps().get(2);
        assertThat(step3.getMessageId()).isEqualTo("msg-obs-3");
        assertThat(step3.getCallerBaseElementId()).isEqualTo(gatewayBaseId);
        assertThat(step3.getCalleeBaseElementId()).isEqualTo(inventoryBaseId);
        // Parallel branch from gwRoot has empty causalParentMessageIds (sibling of msg-obs-1)
        assertThat(step3.getCausalParentMessageIds()).isEmpty();
        assertThat(step3.getMessageSort()).isEqualTo("ASYNCH_SIGNAL");
        // Missing httpStatusCode and durationMs stay null, never coerced to 0
        assertThat(step3.getHttpStatusCode()).isNull();
        assertThat(step3.getDurationMs()).isNull();

        // Export actual Java serialized DTO for M3 connected pipeline verification
        com.fasterxml.jackson.databind.ObjectMapper exportMapper = new com.fasterxml.jackson.databind.ObjectMapper();
        exportMapper.findAndRegisterModules();
        String json = exportMapper.writerWithDefaultPrettyPrinter().writeValueAsString(dto);
        java.nio.file.Path repoRoot = java.nio.file.Path.of("..", "..", "..").toAbsolutePath().normalize();
        java.nio.file.Path outM3 = repoRoot.resolve("output").resolve("m3").resolve("observed-sequence-java-actual.json");
        java.nio.file.Files.createDirectories(outM3.getParent());
        java.nio.file.Files.writeString(outM3, json, java.nio.charset.StandardCharsets.UTF_8);

        java.nio.file.Path feFixture = repoRoot.resolve("MAVIS-Frontend").resolve("tests").resolve("fixtures").resolve("observed-sequence-java-actual.json");
        if (java.nio.file.Files.exists(feFixture.getParent())) {
            java.nio.file.Files.writeString(feFixture, json, java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    @Test
    @DisplayName("M3-AC01/AC04: Không đoán phần tử đầu tiên khi trùng display name (AMBIGUOUS), ưu tiên mavis.model.elementId")
    void testM3_DuplicateDisplayName_MarksAmbiguous_UnlessExplicitElementIdProvided() {
        ModelElement dupOrderA = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build();
        ModelElement dupOrderB = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        final ModelVersion[] savedMv = new ModelVersion[1];
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(UUID.randomUUID());
            savedMv[0] = mv;
            return mv;
        });
        when(modelElementRepository.findByModelVersionId(baseModelVersionId))
                .thenReturn(List.of(apiGatewayEl, dupOrderA, dupOrderB));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(modelRelationshipRepository.findByModelVersionId(baseModelVersionId)).thenReturn(List.of());
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        final DiagramVersion[] savedDv = new DiagramVersion[1];
        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> {
            DiagramVersion dv = inv.getArgument(0);
            dv.setId(UUID.randomUUID());
            savedDv[0] = dv;
            return dv;
        });

        OtelSpanDTO root = OtelSpanDTO.builder()
                .traceId("trace-amb")
                .spanId("sp-root")
                .serviceName("api-gateway")
                .build();
        // Call 1: no explicit elementId -> must be AMBIGUOUS, not guessed to dupOrderA!
        OtelSpanDTO ambChild = OtelSpanDTO.builder()
                .traceId("trace-amb")
                .spanId("sp-amb")
                .parentSpanId("sp-root")
                .serviceName("order-service")
                .operationName("ambiguousCall")
                .build();
        // Call 2: explicit mavis.model.elementId -> resolves deterministically to dupOrderB!
        OtelSpanDTO explicitChild = OtelSpanDTO.builder()
                .traceId("trace-amb")
                .spanId("sp-exp")
                .parentSpanId("sp-root")
                .serviceName("order-service")
                .operationName("explicitCall")
                .attributes(Map.of("mavis.model.elementId", dupOrderB.getId().toString()))
                .build();

        RuntimeTraceIngestRequestDTO req = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(root, ambChild, explicitChild))
                .build();

        otelTraceCorrelationService.ingestTraces(sessionId, baseModelVersionId, req);

        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId))
                .thenReturn(Optional.of(savedMv[0]));
        when(diagramVersionRepository.findByModelVersionIdAndNotation(savedMv[0].getId(), "UML_SEQUENCE"))
                .thenReturn(List.of(savedDv[0]));

        SequenceDiagramResponseDTO res = otelTraceCorrelationService.getSequenceDiagramBySession(sessionId);
        assertThat(res.getTraceStatus()).isEqualTo("PARTIAL");
        assertThat(res.getSteps()).hasSize(2);

        var stepAmb = res.getSteps().get(0);
        assertThat(stepAmb.getCalleeResolutionStatus()).isEqualTo("AMBIGUOUS");
        assertThat(stepAmb.getCalleeBaseElementId()).isNull();
        assertThat(stepAmb.getCalleeParticipantId()).isEqualTo("part:ambiguous:order-service");

        var stepExp = res.getSteps().get(1);
        assertThat(stepExp.getCalleeResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(stepExp.getCalleeBaseElementId()).isEqualTo(dupOrderB.getId());
        assertThat(stepExp.getCalleeParticipantId()).isEqualTo("part:" + dupOrderB.getId());
    }

    @Test
    @DisplayName("R2: Nhiều cạnh tĩnh cùng endpoints không chọn first-match; giữ toàn bộ candidateRelationshipIds theo thứ tự tất định")
    void testM3_AmbiguousStaticRelationshipsBetweenSameEndpoints_PreservesAllSortedCandidatesRegardlessOfOrder() {
        UUID relFirstId = UUID.fromString("bbbb000a-0000-4000-8000-000000000001");
        UUID relSecondId = UUID.fromString("bbbb000b-0000-4000-8000-000000000002");

        ModelRelationship relFirst = ModelRelationship.builder()
                .id(relFirstId)
                .modelVersion(baseVersion)
                .sourceElement(apiGatewayEl)
                .targetElement(orderServiceEl)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();
        ModelRelationship relSecond = ModelRelationship.builder()
                .id(relSecondId)
                .modelVersion(baseVersion)
                .sourceElement(apiGatewayEl)
                .targetElement(orderServiceEl)
                .relationType("CODE_DEPENDENCY")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        for (List<ModelRelationship> inputOrder : List.of(List.of(relFirst, relSecond), List.of(relSecond, relFirst))) {
            when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
            when(modelVersionRepository.findById(baseModelVersionId)).thenReturn(Optional.of(baseVersion));
            when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
            final ModelVersion[] savedMv = new ModelVersion[1];
            when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
                ModelVersion mv = inv.getArgument(0);
                mv.setId(UUID.randomUUID());
                savedMv[0] = mv;
                return mv;
            });
            when(modelElementRepository.findByModelVersionId(baseModelVersionId))
                    .thenReturn(List.of(apiGatewayEl, orderServiceEl));
            when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
            when(modelRelationshipRepository.findByModelVersionId(baseModelVersionId)).thenReturn(inputOrder);
            when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
            when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
            final DiagramVersion[] savedDv = new DiagramVersion[1];
            when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> {
                DiagramVersion dv = inv.getArgument(0);
                dv.setId(UUID.randomUUID());
                savedDv[0] = dv;
                return dv;
            });

            OtelSpanDTO s1 = OtelSpanDTO.builder().traceId("tr-rel-amb").spanId("sp-1").serviceName("api-gateway").build();
            OtelSpanDTO s2 = OtelSpanDTO.builder().traceId("tr-rel-amb").spanId("sp-2").parentSpanId("sp-1").serviceName("order-service").httpMethod("POST").httpUrl("/orders").build();
            RuntimeTraceIngestRequestDTO req = RuntimeTraceIngestRequestDTO.builder()
                    .scenarioOutcome("PASSED")
                    .spans(List.of(s1, s2))
                    .build();

            otelTraceCorrelationService.ingestTraces(sessionId, baseModelVersionId, req);

            when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId))
                    .thenReturn(Optional.of(savedMv[0]));
            when(diagramVersionRepository.findByModelVersionIdAndNotation(savedMv[0].getId(), "UML_SEQUENCE"))
                    .thenReturn(List.of(savedDv[0]));

            SequenceDiagramResponseDTO res = otelTraceCorrelationService.getSequenceDiagramBySession(sessionId);
            assertThat(res.getLimitations()).contains("AMBIGUOUS_STATIC_RELATIONSHIP_CANDIDATES");
            assertThat(res.getSteps()).hasSize(1);
            var step = res.getSteps().get(0);
            assertThat(step.getBaseRelationshipId()).isNull();
            assertThat(step.getCandidateRelationshipIds()).containsExactly(relFirstId, relSecondId);
        }
    }
}

