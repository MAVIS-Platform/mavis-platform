package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.service.OtelTraceCorrelationService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class RuntimeSessionControllerTest {

    private MockMvc mockMvc;

    @Mock
    private RuntimeSessionService runtimeSessionService;

    @Mock
    private OtelTraceCorrelationService otelTraceCorrelationService;

    @InjectMocks
    private RuntimeSessionController runtimeSessionController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(runtimeSessionController).build();
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/runtime/preflight: Tiền kiểm tra bảo mật compose")
    void testPreflightCheck() throws Exception {
        UUID snapshotId = UUID.randomUUID();
        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("order-service", "payment-service"))
                .securityWarnings(List.of())
                .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .build();

        when(runtimeSessionService.runComposePreflight(snapshotId)).thenReturn(dto);

        mockMvc.perform(post("/api/v1/analyzer/runtime/preflight")
                        .param("snapshotId", snapshotId.toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.compatible").value(true))
                .andExpect(jsonPath("$.data.detectedServices[0]").value("order-service"));
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/runtime/sessions: Tạo phiên chạy thực nghiệm")
    void testCreateSession() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        RuntimeSessionCreateRequest request = RuntimeSessionCreateRequest.builder()
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .scenarioName("Load Test")
                .build();

        RuntimeSessionResponseDTO responseDTO = RuntimeSessionResponseDTO.builder()
                .id(sessionId)
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .scenarioName("Load Test")
                .scenarioStatus("PENDING")
                .traceStatus("NONE")
                .createdAt(OffsetDateTime.now())
                .build();

        when(runtimeSessionService.createRuntimeSession(any(RuntimeSessionCreateRequest.class))).thenReturn(responseDTO);

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(sessionId.toString()))
                .andExpect(jsonPath("$.data.scenarioStatus").value("PENDING"));
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/runtime/sessions/{sessionId}/approve: Phê duyệt và khởi chạy")
    void testApproveSession() throws Exception {
        UUID sessionId = UUID.randomUUID();
        RuntimeSessionResponseDTO approved = RuntimeSessionResponseDTO.builder()
                .id(sessionId)
                .scenarioStatus("RUNNING")
                .overrideComposeYaml("version: '3.8'...")
                .startedAt(OffsetDateTime.now())
                .build();

        when(runtimeSessionService.approveAndStartSession(sessionId)).thenReturn(approved);

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/approve", sessionId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scenarioStatus").value("RUNNING"))
                .andExpect(jsonPath("$.data.overrideComposeYaml").exists());
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/runtime/sessions/{sessionId}/stop: Dừng phiên chạy")
    void testStopSession() throws Exception {
        UUID sessionId = UUID.randomUUID();
        RuntimeSessionResponseDTO stopped = RuntimeSessionResponseDTO.builder()
                .id(sessionId)
                .scenarioStatus("CANCELLED")
                .completedAt(OffsetDateTime.now())
                .build();

        when(runtimeSessionService.stopSession(sessionId)).thenReturn(stopped);

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/stop", sessionId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scenarioStatus").value("CANCELLED"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/projects/{projectId}/runtime-sessions: Lấy danh sách phiên")
    void testGetSessionsByProject() throws Exception {
        UUID projectId = UUID.randomUUID();
        RuntimeSessionResponseDTO s = RuntimeSessionResponseDTO.builder()
                .id(UUID.randomUUID())
                .projectId(projectId)
                .scenarioStatus("PENDING")
                .build();

        when(runtimeSessionService.getSessionsByProject(projectId)).thenReturn(List.of(s));

        mockMvc.perform(get("/api/v1/analyzer/projects/{projectId}/runtime-sessions", projectId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].id").value(s.getId().toString()));
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-traces: Tiếp nhận và đối chiếu vết")
    void testIngestTraces() throws Exception {
        UUID sessionId = UUID.randomUUID();
        UUID baseModelVersionId = UUID.randomUUID();
        UUID enrichedModelVersionId = UUID.randomUUID();

        RuntimeTraceIngestRequestDTO request = RuntimeTraceIngestRequestDTO.builder()
                .scenarioOutcome("PASSED")
                .spans(List.of(
                        OtelSpanDTO.builder()
                                .traceId("trace-1")
                                .spanId("span-1")
                                .serviceName("order-service")
                                .httpMethod("POST")
                                .httpUrl("http://order-service/orders")
                                .httpStatusCode(200)
                                .build()
                ))
                .build();

        ModelVersionResponseDTO responseDTO = ModelVersionResponseDTO.builder()
                .id(enrichedModelVersionId)
                .revision(2)
                .origin("RUNTIME_ENRICHED")
                .isLatestValid(true)
                .build();

        when(otelTraceCorrelationService.ingestTraces(eq(sessionId), eq(baseModelVersionId), any(RuntimeTraceIngestRequestDTO.class)))
                .thenReturn(responseDTO);

        mockMvc.perform(post("/api/v1/analyzer/runtime/sessions/{sessionId}/ingest-traces", sessionId)
                        .param("baseModelVersionId", baseModelVersionId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(enrichedModelVersionId.toString()))
                .andExpect(jsonPath("$.data.origin").value("RUNTIME_ENRICHED"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/runtime/sessions/{sessionId}/sequence: Lấy biểu đồ tuần tự")
    void testGetSequenceDiagram() throws Exception {
        UUID sessionId = UUID.randomUUID();
        UUID diagramId = UUID.randomUUID();

        SequenceDiagramResponseDTO responseDTO = SequenceDiagramResponseDTO.builder()
                .diagramId(diagramId)
                .runtimeSessionId(sessionId)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .steps(List.of(
                        SequenceStepDTO.builder()
                                .stepOrder(1)
                                .callerService("api-gateway")
                                .calleeService("order-service")
                                .httpMethod("POST")
                                .httpStatusCode(200)
                                .build()
                ))
                .build();

        when(otelTraceCorrelationService.getSequenceDiagramBySession(sessionId)).thenReturn(responseDTO);

        mockMvc.perform(get("/api/v1/analyzer/runtime/sessions/{sessionId}/sequence", sessionId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.diagramId").value(diagramId.toString()))
                .andExpect(jsonPath("$.data.notation").value("UML_SEQUENCE"))
                .andExpect(jsonPath("$.data.steps[0].callerService").value("api-gateway"));
    }
}

