package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.dto.EvidenceResponseDTO;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvidenceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DiagramProjectionServiceImplTest {

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @InjectMocks
    private DiagramProjectionServiceImpl diagramProjectionService;

    private ModelVersion sampleModelVersion;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        Project sampleProject = Project.builder()
                .id(UUID.randomUUID())
                .name("fruit-market-app")
                .build();

        sampleModelVersion = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .revision(1)
                .build();
    }

    @Test
    @DisplayName("Should generate 3 default diagrams (DEPENDENCY_GRAPH, C4 CONTAINER, C4 COMPONENT) and saveAll in batch")
    void shouldGenerateDefault3DiagramsWithSaveAll() {
        ModelElement serviceContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA_SPRING")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement dbContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-db")
                .elementType("DATABASE")
                .languageStack("SQL")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement component = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("OrderController")
                .elementType("COMPONENT")
                .parentElement(serviceContainer)
                .languageStack("JAVA_SPRING")
                .modelVersion(sampleModelVersion)
                .build();

        ModelRelationship relationship = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(sampleModelVersion)
                .sourceElement(serviceContainer)
                .targetElement(dbContainer)
                .relationType("DATABASE_ACCESS")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        when(diagramVersionRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<DiagramVersion> list = inv.getArgument(0);
            for (DiagramVersion d : list) {
                d.setId(UUID.randomUUID());
                d.setCreatedAt(OffsetDateTime.now());
            }
            return list;
        });

        List<DiagramResponseDTO> results = diagramProjectionService.generateDefaultDiagramsForModel(
                sampleModelVersion,
                List.of(serviceContainer, dbContainer, component),
                List.of(relationship)
        );

        // 1. Kiểm tra lưu batch bằng saveAll đúng 3 bản ghi
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<DiagramVersion>> captor = ArgumentCaptor.forClass(List.class);
        verify(diagramVersionRepository).saveAll(captor.capture());

        List<DiagramVersion> saved = captor.getValue();
        assertThat(saved).hasSize(3);

        // 2. Kiểm tra bản vẽ 1: DEPENDENCY_GRAPH / SERVICE
        DiagramVersion d1 = saved.stream().filter(d -> "DEPENDENCY_GRAPH".equals(d.getNotation())).findFirst().orElseThrow();
        assertThat(d1.getLevel()).isEqualTo("SERVICE");
        assertThat(d1.getLayoutJson().has("nodes")).isTrue();
        assertThat(d1.getLayoutJson().has("edges")).isTrue();
        assertThat(d1.getLayoutJson().get("nodes")).hasSize(2); // Chỉ container: order-service và order-db

        // 3. Kiểm tra bản vẽ 2: C4 / CONTAINER
        DiagramVersion d2 = saved.stream().filter(d -> "C4".equals(d.getNotation()) && "CONTAINER".equals(d.getLevel())).findFirst().orElseThrow();
        assertThat(d2.getLayoutJson().has("nodes")).isTrue();
        assertThat(d2.getLayoutJson().get("nodes")).hasSize(2);

        // 4. Kiểm tra bản vẽ 3: C4 / COMPONENT (Nhóm COMPONENT vào SERVICE_CONTAINER cha)
        DiagramVersion d3 = saved.stream().filter(d -> "C4".equals(d.getNotation()) && "COMPONENT".equals(d.getLevel())).findFirst().orElseThrow();
        assertThat(d3.getLayoutJson().has("nodes")).isTrue();
        JsonNode compNodes = d3.getLayoutJson().get("nodes");
        // Gồm 2 Group/Container nodes + 1 Component node = 3 nodes
        assertThat(compNodes).hasSize(3);

        boolean hasChildWithParent = false;
        for (JsonNode n : compNodes) {
            if ("COMPONENT".equals(n.path("type").asText()) && serviceContainer.getId().toString().equals(n.path("parentId").asText())) {
                hasChildWithParent = true;
            }
        }
        assertThat(hasChildWithParent).isTrue();

        assertThat(results).hasSize(3);
    }

    @Test
    @DisplayName("Should query diagrams by modelVersionId ordered by createdAt")
    void shouldGetDiagramsByModelVersion() {
        UUID mvId = sampleModelVersion.getId();
        DiagramVersion d1 = DiagramVersion.builder()
                .id(UUID.randomUUID())
                .modelVersion(sampleModelVersion)
                .notation("DEPENDENCY_GRAPH")
                .level("SERVICE")
                .layoutJson(objectMapper.createObjectNode())
                .createdAt(OffsetDateTime.now())
                .build();

        when(diagramVersionRepository.findByModelVersionIdOrderByCreatedAtAsc(mvId))
                .thenReturn(List.of(d1));

        List<DiagramResponseDTO> responses = diagramProjectionService.getDiagramsByModelVersion(mvId);

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).getNotation()).isEqualTo("DEPENDENCY_GRAPH");
    }

    @Test
    @DisplayName("Should get diagram by id or throw NOT_FOUND exception")
    void shouldGetDiagramByIdOrThrow() {
        UUID diagramId = UUID.randomUUID();
        DiagramVersion d1 = DiagramVersion.builder()
                .id(diagramId)
                .modelVersion(sampleModelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(objectMapper.createObjectNode())
                .createdAt(OffsetDateTime.now())
                .build();

        when(diagramVersionRepository.findById(diagramId)).thenReturn(Optional.of(d1));

        DiagramResponseDTO res = diagramProjectionService.getDiagramById(diagramId);
        assertThat(res.getId()).isEqualTo(diagramId);

        UUID notFoundId = UUID.randomUUID();
        when(diagramVersionRepository.findById(notFoundId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> diagramProjectionService.getDiagramById(notFoundId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không tìm thấy sơ đồ")
                .extracting("errorCode").isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("Should update diagram layout without modifying ModelVersion (BR-33)")
    void shouldUpdateDiagramLayoutWithoutModifyingModelVersion() {
        UUID diagramId = UUID.randomUUID();
        DiagramVersion existing = DiagramVersion.builder()
                .id(diagramId)
                .modelVersion(sampleModelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(objectMapper.createObjectNode())
                .build();

        ObjectNode newLayout = objectMapper.createObjectNode();
        newLayout.put("customZoom", 1.5);

        when(diagramVersionRepository.findById(diagramId)).thenReturn(Optional.of(existing));
        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiagramResponseDTO updated = diagramProjectionService.updateDiagramLayout(diagramId, newLayout);

        assertThat(updated.getLayoutJson().get("customZoom").asDouble()).isEqualTo(1.5);
        assertThat(existing.getModelVersion()).isEqualTo(sampleModelVersion); // BR-33: ModelVersion gốc không bị thay đổi
    }

    @Test
    @DisplayName("Should get evidences by elementId ordered by createdAt")
    void shouldGetEvidencesByElement() {
        UUID elementId = UUID.randomUUID();
        ModelElement element = ModelElement.builder().id(elementId).name("OrderController").build();

        Evidence ev = Evidence.builder()
                .id(UUID.randomUUID())
                .element(element)
                .locator("/app/OrderController.java:20")
                .adapterVersion("JAVAPARSER_3.25")
                .sourceType("STATIC_CODE")
                .excerpt("@GetMapping(\"/orders\")")
                .createdAt(OffsetDateTime.now())
                .build();

        when(evidenceRepository.findByElementIdOrderByCreatedAtAsc(elementId))
                .thenReturn(List.of(ev));

        List<EvidenceResponseDTO> results = diagramProjectionService.getEvidencesByElement(elementId);

        assertThat(results).hasSize(1);
        EvidenceResponseDTO dto = results.get(0);
        assertThat(dto.getElementId()).isEqualTo(elementId);
        assertThat(dto.getLocator()).contains("/app/OrderController.java:20");
        assertThat(dto.getAdapterVersion()).isEqualTo("JAVAPARSER_3.25");
    }

    @Test
    @DisplayName("Should get evidences by relationshipId ordered by createdAt")
    void shouldGetEvidencesByRelationship() {
        UUID relId = UUID.randomUUID();
        ModelRelationship rel = ModelRelationship.builder().id(relId).relationType("SERVICE_HTTP_CALL").build();

        Evidence ev = Evidence.builder()
                .id(UUID.randomUUID())
                .relationship(rel)
                .locator("/app/OrderService.java:35")
                .adapterVersion("JAVAPARSER_3.25")
                .sourceType("STATIC_CODE")
                .excerpt("restTemplate.getForObject(...)")
                .createdAt(OffsetDateTime.now())
                .build();

        when(evidenceRepository.findByRelationshipIdOrderByCreatedAtAsc(relId))
                .thenReturn(List.of(ev));

        List<EvidenceResponseDTO> results = diagramProjectionService.getEvidencesByRelationship(relId);

        assertThat(results).hasSize(1);
        EvidenceResponseDTO dto = results.get(0);
        assertThat(dto.getRelationshipId()).isEqualTo(relId);
        assertThat(dto.getExcerpt()).contains("restTemplate.getForObject");
    }
}
