package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.DependencyEdge;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.repository.DependencyEdgeRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ServiceNodeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GraphBuilderServiceTest {

    @Mock
    private ServiceNodeRepository serviceNodeRepository;

    @Mock
    private DependencyEdgeRepository dependencyEdgeRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @InjectMocks
    private GraphBuilderService graphBuilderService;

    private Project sampleProject;
    private AnalysisSession sampleSession;

    @BeforeEach
    void setUp() {
        sampleProject = Project.builder()
                .id(UUID.randomUUID())
                .name("e-commerce-monolith")
                .storagePath("/storage/projects/e-commerce-monolith")
                .status("ACTIVE")
                .build();

        sampleSession = AnalysisSession.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .status("RUNNING")
                .build();
    }

    @Test
    @DisplayName("Should create and persist a fallback ServiceNode when detectedServices is empty")
    void shouldCreateFallbackNodeWhenServicesEmpty() {
        when(serviceNodeRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ServiceNode> result = graphBuilderService.buildAndSaveNodes(sampleSession, Collections.emptyList());

        assertThat(result).hasSize(1);
        ServiceNode fallbackNode = result.get(0);
        assertThat(fallbackNode.getSession()).isEqualTo(sampleSession);
        assertThat(fallbackNode.getName()).isEqualTo("e-commerce-monolith");
        assertThat(fallbackNode.getNodeType()).isEqualTo("JAVA_SPRING");
        assertThat(fallbackNode.getSourcePath()).isEqualTo("/storage/projects/e-commerce-monolith");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ServiceNode>> captor = ArgumentCaptor.forClass(List.class);
        verify(serviceNodeRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getName()).isEqualTo("e-commerce-monolith");
    }

    @Test
    @DisplayName("Should create and persist a fallback ServiceNode when detectedServices is null")
    void shouldCreateFallbackNodeWhenServicesNull() {
        when(serviceNodeRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ServiceNode> result = graphBuilderService.buildAndSaveNodes(sampleSession, null);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getName()).isEqualTo("e-commerce-monolith");
        assertThat(result.get(0).getNodeType()).isEqualTo("JAVA_SPRING");
    }

    @Test
    @DisplayName("Should create and persist ServiceNodes for each detected service name")
    void shouldCreateNodesForDetectedServices() {
        List<String> services = List.of("auth-service", "order-service", "payment-service");
        when(serviceNodeRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ServiceNode> result = graphBuilderService.buildAndSaveNodes(sampleSession, services);

        assertThat(result).hasSize(3);
        assertThat(result).extracting(ServiceNode::getName)
                .containsExactly("auth-service", "order-service", "payment-service");
        assertThat(result).allMatch(node -> "JAVA_SPRING".equals(node.getNodeType()));
        assertThat(result).allMatch(node -> sampleSession.equals(node.getSession()));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ServiceNode>> captor = ArgumentCaptor.forClass(List.class);
        verify(serviceNodeRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
    }

    @Test
    @DisplayName("Should support custom sourcePath via overloaded buildAndSaveNodes")
    void shouldSupportCustomSourcePath() {
        List<String> services = List.of("gateway-service");
        String customExtractedPath = "/custom/extracted/root";
        when(serviceNodeRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ServiceNode> result = graphBuilderService.buildAndSaveNodes(sampleSession, services, customExtractedPath);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getName()).isEqualTo("gateway-service");
        assertThat(result.get(0).getSourcePath()).isEqualTo(customExtractedPath);
    }

    @Test
    @DisplayName("Should save REST_API evidence linked to owning node with edge as null")
    void shouldSaveRestApiEvidenceLinkedToOwningNode() {
        ServiceNode node = ServiceNode.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .sourcePath("/app/order-service")
                .session(sampleSession)
                .build();

        CodeEvidenceDTO restApiEvidence = CodeEvidenceDTO.builder()
                .elementType("REST_API")
                .identifier("/api/v1/orders")
                .filePath("/app/order-service/src/OrderController.java")
                .lineNumber(25)
                .codeSnippet("@GetMapping(\"/api/v1/orders\")")
                .build();

        graphBuilderService.buildEdgesAndEvidences(sampleSession, List.of(node), List.of(restApiEvidence));

        ArgumentCaptor<Evidence> captor = ArgumentCaptor.forClass(Evidence.class);
        verify(evidenceRepository).save(captor.capture());

        Evidence saved = captor.getValue();
        assertThat(saved.getNode()).isEqualTo(node);
        assertThat(saved.getEdge()).isNull();
        assertThat(saved.getEvidenceType()).isEqualTo("REST_API");
        assertThat(saved.getFilePath()).isEqualTo("/app/order-service/src/OrderController.java");
        assertThat(saved.getLineNumber()).isEqualTo(25);
    }

    @Test
    @DisplayName("Should match FeignClient, create DependencyEdge and linked Evidence")
    void shouldMatchFeignClientAndCreateDependencyEdgeAndEvidence() {
        ServiceNode orderNode = ServiceNode.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .sourcePath("/app/order-service")
                .session(sampleSession)
                .build();

        ServiceNode paymentNode = ServiceNode.builder()
                .id(UUID.randomUUID())
                .name("payment-service")
                .sourcePath("/app/payment-service")
                .session(sampleSession)
                .build();

        CodeEvidenceDTO feignEvidence = CodeEvidenceDTO.builder()
                .elementType("FEIGN_CLIENT")
                .identifier("payment-service")
                .filePath("/app/order-service/src/PaymentClient.java")
                .lineNumber(12)
                .codeSnippet("@FeignClient(\"payment-service\")")
                .build();

        when(dependencyEdgeRepository.save(any(DependencyEdge.class))).thenAnswer(invocation -> {
            DependencyEdge edge = invocation.getArgument(0);
            edge.setId(UUID.randomUUID());
            return edge;
        });

        graphBuilderService.buildEdgesAndEvidences(sampleSession, List.of(orderNode, paymentNode), List.of(feignEvidence));

        ArgumentCaptor<DependencyEdge> edgeCaptor = ArgumentCaptor.forClass(DependencyEdge.class);
        verify(dependencyEdgeRepository).save(edgeCaptor.capture());

        DependencyEdge savedEdge = edgeCaptor.getValue();
        assertThat(savedEdge.getSession()).isEqualTo(sampleSession);
        assertThat(savedEdge.getSourceNode()).isEqualTo(orderNode);
        assertThat(savedEdge.getTargetNode()).isEqualTo(paymentNode);
        assertThat(savedEdge.getDependencyKind()).isEqualTo("REST_HTTP");

        ArgumentCaptor<Evidence> evidenceCaptor = ArgumentCaptor.forClass(Evidence.class);
        verify(evidenceRepository).save(evidenceCaptor.capture());

        Evidence savedEvidence = evidenceCaptor.getValue();
        assertThat(savedEvidence.getEdge()).isNotNull();
        assertThat(savedEvidence.getNode()).isNull();
        assertThat(savedEvidence.getEvidenceType()).isEqualTo("FEIGN_CLIENT");
        assertThat(savedEvidence.getFilePath()).isEqualTo("/app/order-service/src/PaymentClient.java");
    }

    @Test
    @DisplayName("Should do nothing when nodes or evidences list is empty")
    void shouldDoNothingWhenListsAreEmpty() {
        graphBuilderService.buildEdgesAndEvidences(sampleSession, Collections.emptyList(), Collections.emptyList());

        verify(dependencyEdgeRepository, never()).save(any());
        verify(evidenceRepository, never()).save(any());
    }
}
