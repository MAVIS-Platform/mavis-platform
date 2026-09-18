package com.mavis.analyzer.graph.service;

import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.ServiceNode;
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
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GraphBuilderServiceTest {

    @Mock
    private ServiceNodeRepository serviceNodeRepository;

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
}
