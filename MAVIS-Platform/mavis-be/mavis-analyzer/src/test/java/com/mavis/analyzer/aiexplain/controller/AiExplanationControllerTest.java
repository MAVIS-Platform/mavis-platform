package com.mavis.analyzer.aiexplain.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.dto.AiExplanationResponseDTO;
import com.mavis.analyzer.aiexplain.service.AiExplanationService;
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
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AiExplanationControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AiExplanationService aiExplanationService;

    @InjectMocks
    private AiExplanationController aiExplanationController;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(aiExplanationController).build();
    }

    @Test
    @DisplayName("API POST /api/v1/analyzer/ai/explain thành công trả về 200 OK")
    void testExplainArchitecture_Success() throws Exception {
        UUID mvId = UUID.randomUUID();
        UUID expId = UUID.randomUUID();

        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(mvId)
                .explanationScope("ELEMENT")
                .userQuestion("Phần tử này làm nhiệm vụ gì?")
                .build();

        AiExplanationResponseDTO response = AiExplanationResponseDTO.builder()
                .id(expId)
                .modelVersionId(mvId)
                .explanationScope("ELEMENT")
                .explanationText("cart-service xử lý giỏ hàng của người dùng.")
                .providerMode("DETERMINISTIC_EVIDENCE_SYNTHESIS")
                .secretRedacted(true)
                .createdAt(OffsetDateTime.now())
                .build();

        when(aiExplanationService.generateOrGetExplanation(any(AiExplainRequestDTO.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(expId.toString()))
                .andExpect(jsonPath("$.data.explanationText").value("cart-service xử lý giỏ hàng của người dùng."));
    }

    @Test
    @DisplayName("API GET /api/v1/analyzer/models/{id}/ai-explanations trả về danh sách lịch sử")
    void testGetExplanationsByModelVersion_Success() throws Exception {
        UUID mvId = UUID.randomUUID();
        AiExplanationResponseDTO item = AiExplanationResponseDTO.builder()
                .id(UUID.randomUUID())
                .modelVersionId(mvId)
                .explanationScope("RELATIONSHIP")
                .explanationText("Quan hệ HTTP giữa cart-service và product-service")
                .build();

        when(aiExplanationService.getExplanationsByModelVersion(mvId)).thenReturn(List.of(item));

        mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}/ai-explanations", mvId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].explanationScope").value("RELATIONSHIP"));
    }

    @Test
    @DisplayName("API GET /api/v1/analyzer/ai/explanations/{id} trả về chi tiết lời giải thích")
    void testGetExplanationById_Success() throws Exception {
        UUID expId = UUID.randomUUID();
        AiExplanationResponseDTO response = AiExplanationResponseDTO.builder()
                .id(expId)
                .explanationScope("RUNTIME_TRACE")
                .explanationText("Dấu vết luồng gọi kiểm thử hoàn tất.")
                .build();

        when(aiExplanationService.getExplanationById(expId)).thenReturn(response);

        mockMvc.perform(get("/api/v1/analyzer/ai/explanations/{explanationId}", expId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.explanationScope").value("RUNTIME_TRACE"));
    }

    @Test
    @DisplayName("API POST /api/v1/analyzer/ai/explain trả về 400 khi thiếu modelVersionId")
    void testExplainArchitecture_ValidationError() throws Exception {
        AiExplainRequestDTO invalidReq = AiExplainRequestDTO.builder()
                .modelVersionId(null)
                .explanationScope("ELEMENT")
                .build();

        mockMvc.perform(post("/api/v1/analyzer/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidReq)))
                .andExpect(status().isBadRequest());
    }
}
