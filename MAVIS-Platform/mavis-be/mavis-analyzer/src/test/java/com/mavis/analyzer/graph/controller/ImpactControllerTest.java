package com.mavis.analyzer.graph.controller;

import com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO;
import com.mavis.analyzer.graph.dto.ImpactedElementDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.analyzer.graph.service.GraphService;
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

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ImpactControllerTest {

    private MockMvc mockMvc;

    @Mock
    private GraphService graphService;

    @InjectMocks
    private ImpactController impactController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(impactController).build();
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/impact should return detailed impact analysis response")
    void shouldReturnDetailedImpactAnalysis() throws Exception {
        UUID sessionId = UUID.randomUUID();
        UUID nodeId = UUID.randomUUID();

        ImpactAnalysisResponseDTO responseDTO = ImpactAnalysisResponseDTO.builder()
                .modelVersionId(sessionId)
                .targetElementId(nodeId)
                .targetElementName("payment-service")
                .totalImpactedCount(2)
                .directlyImpactedCount(1)
                .indirectlyImpactedCount(1)
                .cyclicDependencyDetected(false)
                .impactedElements(List.of(
                        ImpactedElementDTO.builder()
                                .elementId(UUID.randomUUID())
                                .name("order-service")
                                .impactLevel("DIRECTLY_IMPACTED")
                                .hopDistance(1)
                                .dependencyPathNames(List.of("order-service", "payment-service"))
                                .build(),
                        ImpactedElementDTO.builder()
                                .elementId(UUID.randomUUID())
                                .name("api-gateway")
                                .impactLevel("INDIRECTLY_IMPACTED")
                                .hopDistance(2)
                                .dependencyPathNames(List.of("api-gateway", "order-service", "payment-service"))
                                .build()
                ))
                .build();

        when(graphService.analyzeDetailedImpact(sessionId, nodeId)).thenReturn(responseDTO);

        mockMvc.perform(get("/api/v1/analyzer/impact")
                        .param("sessionId", sessionId.toString())
                        .param("nodeId", nodeId.toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.targetElementName").value("payment-service"))
                .andExpect(jsonPath("$.data.totalImpactedCount").value(2))
                .andExpect(jsonPath("$.data.directlyImpactedCount").value(1))
                .andExpect(jsonPath("$.data.indirectlyImpactedCount").value(1))
                .andExpect(jsonPath("$.data.impactedElements[0].name").value("order-service"))
                .andExpect(jsonPath("$.data.impactedElements[0].impactLevel").value("DIRECTLY_IMPACTED"))
                .andExpect(jsonPath("$.data.impactedElements[0].hopDistance").value(1))
                .andExpect(jsonPath("$.data.impactedElements[1].name").value("api-gateway"))
                .andExpect(jsonPath("$.data.impactedElements[1].impactLevel").value("INDIRECTLY_IMPACTED"))
                .andExpect(jsonPath("$.data.impactedElements[1].hopDistance").value(2));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/impact/simple should return simple node list")
    void shouldReturnSimpleImpactNodeList() throws Exception {
        UUID sessionId = UUID.randomUUID();
        UUID nodeId = UUID.randomUUID();

        when(graphService.analyzeImpact(sessionId, nodeId)).thenReturn(List.of(
                NodeDTO.builder()
                        .id(UUID.randomUUID())
                        .name("order-service")
                        .type("SERVICE_CONTAINER")
                        .build()
        ));

        mockMvc.perform(get("/api/v1/analyzer/impact/simple")
                        .param("sessionId", sessionId.toString())
                        .param("nodeId", nodeId.toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].name").value("order-service"));
    }
}
