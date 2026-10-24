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
}
