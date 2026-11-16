package com.mavis.analyzer.model.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.model.dto.ModelDiffResponseDTO;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.model.service.ModelVersionService;
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
class ModelVersionControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ModelVersionService modelVersionService;

    @InjectMocks
    private ModelVersionController modelVersionController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(modelVersionController).build();
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/projects/{projectId}/models should return list of models")
    void shouldGetModelVersionsByProject() throws Exception {
        UUID projectId = UUID.randomUUID();
        ModelVersionResponseDTO dto1 = ModelVersionResponseDTO.builder()
                .id(UUID.randomUUID())
                .projectId(projectId)
                .revision(2)
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .createdAt(OffsetDateTime.now())
                .build();

        ModelVersionResponseDTO dto2 = ModelVersionResponseDTO.builder()
                .id(UUID.randomUUID())
                .projectId(projectId)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(false)
                .createdAt(OffsetDateTime.now())
                .build();

        when(modelVersionService.getModelVersionsByProject(projectId)).thenReturn(List.of(dto1, dto2));

        mockMvc.perform(get("/api/v1/analyzer/projects/{projectId}/models", projectId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].revision").value(2))
                .andExpect(jsonPath("$.data[0].origin").value("USER_CONFIRMED"))
                .andExpect(jsonPath("$.data[1].revision").value(1));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/models/{modelVersionId} should return model details")
    void shouldGetModelVersionById() throws Exception {
        UUID modelId = UUID.randomUUID();
        ModelVersionResponseDTO dto = ModelVersionResponseDTO.builder()
                .id(modelId)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .build();

        when(modelVersionService.getModelVersionById(modelId)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/analyzer/models/{modelVersionId}", modelId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(modelId.toString()))
                .andExpect(jsonPath("$.data.revision").value(1));
    }

    @Test
    @DisplayName("POST /api/v1/analyzer/models/{baseModelVersionId}/revisions should create new revision")
    void shouldCreateControlledRevision() throws Exception {
        UUID baseId = UUID.randomUUID();
        ModelRevisionRequestDTO request = ModelRevisionRequestDTO.builder()
                .addedElements(List.of(
                        ModelRevisionRequestDTO.ElementCreateDTO.builder()
                                .name("notification-service")
                                .elementType("SERVICE_CONTAINER")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .build();

        ModelVersionResponseDTO responseDTO = ModelVersionResponseDTO.builder()
                .id(UUID.randomUUID())
                .revision(2)
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .build();

        when(modelVersionService.createControlledRevision(eq(baseId), any(ModelRevisionRequestDTO.class)))
                .thenReturn(responseDTO);

        mockMvc.perform(post("/api/v1/analyzer/models/{baseModelVersionId}/revisions", baseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.revision").value(2))
                .andExpect(jsonPath("$.data.origin").value("USER_CONFIRMED"))
                .andExpect(jsonPath("$.data.isLatestValid").value(true));
    }

    @Test
    @DisplayName("GET /api/v1/analyzer/models/compare should return diff between 2 versions")
    void shouldCompareModelVersions() throws Exception {
        UUID baseVersionId = UUID.randomUUID();
        UUID targetVersionId = UUID.randomUUID();

        ModelDiffResponseDTO diffResponse = ModelDiffResponseDTO.builder()
                .baseVersionId(baseVersionId)
                .baseRevision(1)
                .targetVersionId(targetVersionId)
                .targetRevision(2)
                .summary(ModelDiffResponseDTO.DiffSummaryDTO.builder()
                        .totalAdded(1)
                        .totalRemoved(0)
                        .totalModified(0)
                        .totalUnchanged(2)
                        .build())
                .addedElements(List.of(
                        ModelDiffResponseDTO.ModelElementDiffDTO.builder()
                                .name("notification-service")
                                .elementType("SERVICE_CONTAINER")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .build();

        when(modelVersionService.compareModelVersions(baseVersionId, targetVersionId)).thenReturn(diffResponse);

        mockMvc.perform(get("/api/v1/analyzer/models/compare")
                        .param("baseVersionId", baseVersionId.toString())
                        .param("targetVersionId", targetVersionId.toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.baseRevision").value(1))
                .andExpect(jsonPath("$.data.targetRevision").value(2))
                .andExpect(jsonPath("$.data.summary.totalAdded").value(1))
                .andExpect(jsonPath("$.data.addedElements[0].name").value("notification-service"));
    }
}
