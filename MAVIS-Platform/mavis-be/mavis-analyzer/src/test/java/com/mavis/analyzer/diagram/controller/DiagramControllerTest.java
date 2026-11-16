package com.mavis.analyzer.diagram.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.dto.EvidenceResponseDTO;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class DiagramControllerTest {

    private MockMvc mockMvc;

    @Mock
    private DiagramProjectionService diagramProjectionService;

    @InjectMocks
    private DiagramController diagramController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(diagramController).build();
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/models/{modelVersionId}/diagrams should return diagrams list")
    void shouldGetDiagramsByModelVersion() throws Exception {
        UUID mvId = UUID.randomUUID();
        DiagramResponseDTO dto = DiagramResponseDTO.builder()
                .id(UUID.randomUUID())
                .modelVersionId(mvId)
                .notation("C4")
                .level("CONTAINER")
                .createdAt(OffsetDateTime.now())
                .build();

        when(diagramProjectionService.getDiagramsByModelVersion(mvId)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}/diagrams", mvId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].notation").value("C4"))
                .andExpect(jsonPath("$.data[0].level").value("CONTAINER"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/diagrams/{diagramId} should return diagram details")
    void shouldGetDiagramById() throws Exception {
        UUID diagramId = UUID.randomUUID();
        ObjectNode layout = objectMapper.createObjectNode();
        layout.put("zoom", 1.0);

        DiagramResponseDTO dto = DiagramResponseDTO.builder()
                .id(diagramId)
                .notation("DEPENDENCY_GRAPH")
                .level("SERVICE")
                .layoutJson(layout)
                .build();

        when(diagramProjectionService.getDiagramById(diagramId)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/analyzer/diagrams/{diagramId}", diagramId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(diagramId.toString()))
                .andExpect(jsonPath("$.data.notation").value("DEPENDENCY_GRAPH"));
    }

    @Test
    @DisplayName("PUT /api/v1/analyzer/diagrams/{diagramId}/layout should update layout")
    void shouldUpdateDiagramLayout() throws Exception {
        UUID diagramId = UUID.randomUUID();
        ObjectNode newLayout = objectMapper.createObjectNode();
        newLayout.put("panX", 100);

        DiagramResponseDTO dto = DiagramResponseDTO.builder()
                .id(diagramId)
                .layoutJson(newLayout)
                .build();

        when(diagramProjectionService.updateDiagramLayout(eq(diagramId), any())).thenReturn(dto);

        mockMvc.perform(put("/api/v1/analyzer/diagrams/{diagramId}/layout", diagramId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newLayout)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("Cập nhật layout sơ đồ thành công"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/evidences/element/{elementId} should return element evidences")
    void shouldGetEvidencesByElement() throws Exception {
        UUID elementId = UUID.randomUUID();
        EvidenceResponseDTO dto = EvidenceResponseDTO.builder()
                .id(UUID.randomUUID())
                .elementId(elementId)
                .locator("/app/OrderController.java:20")
                .sourceType("STATIC_CODE")
                .adapterVersion("JAVAPARSER_3.25")
                .excerpt("@GetMapping(\"/orders\")")
                .build();

        when(diagramProjectionService.getEvidencesByElement(elementId)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/analyzer/evidences/element/{elementId}", elementId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].elementId").value(elementId.toString()))
                .andExpect(jsonPath("$.data[0].adapterVersion").value("JAVAPARSER_3.25"));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/evidences/relationship/{relationshipId} should return relationship evidences")
    void shouldGetEvidencesByRelationship() throws Exception {
        UUID relId = UUID.randomUUID();
        EvidenceResponseDTO dto = EvidenceResponseDTO.builder()
                .id(UUID.randomUUID())
                .relationshipId(relId)
                .locator("/app/OrderService.java:40")
                .sourceType("STATIC_CODE")
                .adapterVersion("JAVAPARSER_3.25")
                .excerpt("restTemplate.postForObject(...)")
                .build();

        when(diagramProjectionService.getEvidencesByRelationship(relId)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/analyzer/evidences/relationship/{relationshipId}", relId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].relationshipId").value(relId.toString()));
    }
}
