package com.mavis.analyzer.evaluation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.dto.EvaluationRunResponseDTO;
import com.mavis.analyzer.evaluation.service.ArchitectureEvaluationService;
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

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class EvaluationControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ArchitectureEvaluationService evaluationService;

    @InjectMocks
    private EvaluationController evaluationController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(evaluationController).build();
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/models/{modelVersionId}/evaluate: Đánh giá thành công")
    void testEvaluateModel() throws Exception {
        UUID mvId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();

        ObjectNode metrics = objectMapper.createObjectNode();
        metrics.put("complianceScore", 95.0);
        metrics.put("passedCount", 4);
        metrics.put("violationCount", 0);
        metrics.put("needsReviewCount", 1);

        EvaluationRunResponseDTO responseDTO = EvaluationRunResponseDTO.builder()
                .id(runId)
                .modelVersionId(mvId)
                .ruleSetVersion("1.0")
                .complianceScore(95.0)
                .summaryMetrics(metrics)
                .createdAt(OffsetDateTime.now())
                .findings(List.of(
                        EvaluationFindingResponseDTO.builder()
                                .id(UUID.randomUUID())
                                .evaluationRunId(runId)
                                .ruleId("RULE-01")
                                .severity("INFO")
                                .status("PASS")
                                .message("Không phát hiện chu trình phụ thuộc vòng lặp.")
                                .build()
                ))
                .build();

        when(evaluationService.evaluateModel(eq(mvId), eq("1.0"))).thenReturn(responseDTO);

        mockMvc.perform(post("/api/v1/analyzer/models/{modelVersionId}/evaluate", mvId)
                        .param("ruleSetVersion", "1.0")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(runId.toString()))
                .andExpect(jsonPath("$.data.complianceScore").value(95.0))
                .andExpect(jsonPath("$.data.findings[0].ruleId").value("RULE-01"))
                .andExpect(jsonPath("$.data.findings[0].status").value("PASS"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/models/{modelVersionId}/evaluations: Lấy lịch sử đánh giá")
    void testGetEvaluationsByModelVersion() throws Exception {
        UUID mvId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();

        EvaluationRunResponseDTO runDTO = EvaluationRunResponseDTO.builder()
                .id(runId)
                .modelVersionId(mvId)
                .ruleSetVersion("1.0")
                .complianceScore(100.0)
                .createdAt(OffsetDateTime.now())
                .build();

        when(evaluationService.getEvaluationsByModelVersion(mvId)).thenReturn(List.of(runDTO));

        mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}/evaluations", mvId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].id").value(runId.toString()))
                .andExpect(jsonPath("$.data[0].complianceScore").value(100.0));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/evaluations/{evaluationRunId}/findings: Lấy danh sách phát hiện")
    void testGetFindingsByEvaluationRun() throws Exception {
        UUID runId = UUID.randomUUID();
        UUID findingId = UUID.randomUUID();

        EvaluationFindingResponseDTO findingDTO = EvaluationFindingResponseDTO.builder()
                .id(findingId)
                .evaluationRunId(runId)
                .ruleId("RULE-02")
                .severity("WARNING")
                .status("VIOLATION")
                .message("Shared Database Anti-Pattern")
                .build();

        when(evaluationService.getFindingsByEvaluationRunId(runId)).thenReturn(List.of(findingDTO));

        mockMvc.perform(get("/api/v1/analyzer/evaluations/{evaluationRunId}/findings", runId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].id").value(findingId.toString()))
                .andExpect(jsonPath("$.data[0].ruleId").value("RULE-02"))
                .andExpect(jsonPath("$.data[0].status").value("VIOLATION"));
    }
}
