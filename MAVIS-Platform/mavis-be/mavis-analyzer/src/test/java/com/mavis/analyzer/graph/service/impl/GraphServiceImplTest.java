package com.mavis.analyzer.graph.service.impl;

import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO;
import com.mavis.analyzer.graph.dto.ImpactedElementDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GraphServiceImplTest {

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @InjectMocks
    private GraphServiceImpl graphService;

    private UUID modelVersionId;
    private ModelVersion modelVersion;

    @BeforeEach
    void setUp() {
        modelVersionId = UUID.randomUUID();
        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .revision(1)
                .build();
    }

    @Test
    @DisplayName("analyzeDetailedImpact - 3-tier dependency chain A -> B -> C: when C changes, B is DIRECT (hop 1) and A is INDIRECT (hop 2)")
    void shouldAnalyzeDetailedImpact_ThreeTierChain() {
        // Elements: A (api-gateway), B (order-service), C (payment-service)
        ModelElement elementA = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .build();

        ModelElement elementB = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .build();

        ModelElement elementC = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .build();

        when(modelElementRepository.existsByIdAndModelVersionId(elementC.getId(), modelVersionId)).thenReturn(true);
        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(elementA, elementB, elementC));

        // Relationships: A -> B, B -> C
        ModelRelationship relAB = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementA)
                .targetElement(elementB)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship relBC = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementB)
                .targetElement(elementC)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(relAB, relBC));

        // Evidences attached to relationships
        Evidence evAB = Evidence.builder()
                .id(UUID.randomUUID())
                .relationship(relAB)
                .sourceType("CODE_AST")
                .locator("GatewayRoutes.java:42")
                .excerpt("http://order-service/orders")
                .build();

        Evidence evBC = Evidence.builder()
                .id(UUID.randomUUID())
                .relationship(relBC)
                .sourceType("CODE_AST")
                .locator("OrderService.java:88")
                .excerpt("restTemplate.postForObject(paymentUrl, ...)")
                .build();

        when(evidenceRepository.findByRelationshipIdIn(anyCollection()))
                .thenReturn(List.of(evAB, evBC));

        // When C changes: analyzeDetailedImpact(modelVersionId, C.getId())
        ImpactAnalysisResponseDTO response = graphService.analyzeDetailedImpact(modelVersionId, elementC.getId());

        assertThat(response).isNotNull();
        assertThat(response.getModelVersionId()).isEqualTo(modelVersionId);
        assertThat(response.getTargetElementId()).isEqualTo(elementC.getId());
        assertThat(response.getTargetElementName()).isEqualTo("payment-service");
        assertThat(response.getTotalImpactedCount()).isEqualTo(2);
        assertThat(response.getDirectlyImpactedCount()).isEqualTo(1);
        assertThat(response.getIndirectlyImpactedCount()).isEqualTo(1);
        assertThat(response.isCyclicDependencyDetected()).isFalse();

        List<ImpactedElementDTO> impacted = response.getImpactedElements();
        assertThat(impacted).hasSize(2);

        // First impacted is B: hop 1, DIRECTLY_IMPACTED
        ImpactedElementDTO bDto = impacted.stream().filter(e -> e.getName().equals("order-service")).findFirst().orElseThrow();
        assertThat(bDto.getHopDistance()).isEqualTo(1);
        assertThat(bDto.getImpactLevel()).isEqualTo("DIRECTLY_IMPACTED");
        assertThat(bDto.getDependencyPathNames()).containsExactly("order-service", "payment-service");
        assertThat(bDto.getSupportingEvidences()).isNotEmpty();
        assertThat(bDto.getSupportingEvidences().get(0).getLocator()).isEqualTo("OrderService.java:88");

        // Second impacted is A: hop 2, INDIRECTLY_IMPACTED
        ImpactedElementDTO aDto = impacted.stream().filter(e -> e.getName().equals("api-gateway")).findFirst().orElseThrow();
        assertThat(aDto.getHopDistance()).isEqualTo(2);
        assertThat(aDto.getImpactLevel()).isEqualTo("INDIRECTLY_IMPACTED");
        assertThat(aDto.getDependencyPathNames()).containsExactly("api-gateway", "order-service", "payment-service");
        assertThat(aDto.getSupportingEvidences()).hasSize(2);

        // Verify batch query rule: evidenceRepository.findByRelationshipIdIn was called exactly once
        verify(evidenceRepository, times(1)).findByRelationshipIdIn(anyCollection());
    }

    @Test
    @DisplayName("analyzeDetailedImpact - Cyclic dependency A <-> B terminates safely without infinite loop and flags cyclicDependencyDetected")
    void shouldHandleCyclicDependency_WithoutHanging() {
        ModelElement elementA = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        ModelElement elementB = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        when(modelElementRepository.existsByIdAndModelVersionId(elementB.getId(), modelVersionId)).thenReturn(true);
        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(elementA, elementB));

        // Cycle: A calls B and B calls A
        ModelRelationship relAB = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementA)
                .targetElement(elementB)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship relBA = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementB)
                .targetElement(elementA)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(relAB, relBA));

        when(evidenceRepository.findByRelationshipIdIn(anyCollection()))
                .thenReturn(Collections.emptyList());

        // When B changes
        ImpactAnalysisResponseDTO response = graphService.analyzeDetailedImpact(modelVersionId, elementB.getId());

        assertThat(response).isNotNull();
        assertThat(response.isCyclicDependencyDetected()).isTrue();
        assertThat(response.getTotalImpactedCount()).isEqualTo(1);
        assertThat(response.getImpactedElements().get(0).getName()).isEqualTo("order-service");
    }

    @Test
    @DisplayName("analyzeDetailedImpact - throws BusinessException when target element not found")
    void shouldThrowException_WhenTargetElementNotFound() {
        UUID nonExistentTargetId = UUID.randomUUID();
        when(modelElementRepository.existsByIdAndModelVersionId(nonExistentTargetId, modelVersionId)).thenReturn(false);
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(modelVersionId))
                .thenReturn(Optional.empty());
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());

        assertThatThrownBy(() -> graphService.analyzeDetailedImpact(modelVersionId, nonExistentTargetId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("analyzeImpact - backward compatible method returns list of NodeDTO")
    void shouldReturnNodeDTOList_ForBackwardCompatibility() {
        ModelElement elementA = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        ModelElement elementB = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        when(modelElementRepository.existsByIdAndModelVersionId(elementB.getId(), modelVersionId)).thenReturn(true);
        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(elementA, elementB));

        ModelRelationship relAB = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementA)
                .targetElement(elementB)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(relAB));
        when(evidenceRepository.findByRelationshipIdIn(anyCollection())).thenReturn(Collections.emptyList());

        List<NodeDTO> nodes = graphService.analyzeImpact(modelVersionId, elementB.getId());

        assertThat(nodes).hasSize(1);
        assertThat(nodes.get(0).getName()).isEqualTo("order-service");
    }

    @Test
    @DisplayName("getGraphDataBySessionId - returns nodes and edges for model version")
    void shouldGetGraphDataBySessionId() {
        ModelElement elementA = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        ModelElement elementB = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(elementA, elementB));

        ModelRelationship relAB = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(elementA)
                .targetElement(elementB)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(relAB));

        GraphDataDTO graphData = graphService.getGraphDataBySessionId(modelVersionId);

        assertThat(graphData).isNotNull();
        assertThat(graphData.getNodes()).hasSize(2);
        assertThat(graphData.getEdges()).hasSize(1);
    }
}
