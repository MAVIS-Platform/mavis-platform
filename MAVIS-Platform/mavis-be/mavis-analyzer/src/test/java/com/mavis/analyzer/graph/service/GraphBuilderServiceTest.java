package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.detector.config.dto.ConfigTargetUrlDTO;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import com.mavis.analyzer.detector.config.service.SpringConfigDetectorService;
import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.dto.DockerDependencyDTO;
import com.mavis.analyzer.detector.docker.service.DockerDetectorService;
import com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO;
import com.mavis.analyzer.workerclient.dto.DotnetElementDTO;
import com.mavis.analyzer.workerclient.dto.DotnetEvidenceDTO;
import com.mavis.analyzer.workerclient.dto.DotnetRelationDTO;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GraphBuilderServiceTest {

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private DockerDetectorService dockerDetectorService;

    @Mock
    private SpringConfigDetectorService springConfigDetectorService;

    @Mock
    private DotnetWorkerClientService dotnetWorkerClientService;

    @InjectMocks
    private GraphBuilderServiceImpl graphBuilderService;

    private Project sampleProject;
    private SourceSnapshot sampleSnapshot;
    private ModelVersion sampleModelVersion;

    @BeforeEach
    void setUp() {
        sampleProject = Project.builder()
                .id(UUID.randomUUID())
                .name("fruit-market-app")
                .status("ACTIVE")
                .build();

        sampleSnapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .storagePath("/storage/projects/fruit-market-app.zip")
                .artifactHash("abc123hash")
                .build();

        sampleModelVersion = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .sourceSnapshot(sampleSnapshot)
                .revision(1)
                .isLatestValid(true)
                .build();
    }

    @Test
    @DisplayName("Should create and persist a fallback ModelElement when detectedServices is empty")
    void shouldCreateFallbackNodeWhenServicesEmpty() {
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ModelElement> result = graphBuilderService.buildAndSaveElements(sampleModelVersion, Collections.emptyList());

        assertThat(result).hasSize(1);
        ModelElement fallbackElement = result.get(0);
        assertThat(fallbackElement.getModelVersion()).isEqualTo(sampleModelVersion);
        assertThat(fallbackElement.getName()).isEqualTo("fruit-market-app");
        assertThat(fallbackElement.getElementType()).isEqualTo("SERVICE_CONTAINER");
        assertThat(fallbackElement.getLanguageStack()).isEqualTo("JAVA_SPRING");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> captor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getName()).isEqualTo("fruit-market-app");
    }

    @Test
    @DisplayName("Should create and persist a fallback ModelElement when detectedServices is null")
    void shouldCreateFallbackNodeWhenServicesNull() {
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ModelElement> result = graphBuilderService.buildAndSaveElements(sampleModelVersion, null);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getName()).isEqualTo("fruit-market-app");
        assertThat(result.get(0).getElementType()).isEqualTo("SERVICE_CONTAINER");
    }

    @Test
    @DisplayName("Should create and persist ModelElements for each detected service name")
    void shouldCreateNodesForDetectedServices() {
        List<String> services = List.of("catalog-service", "order-service", "payment-service");
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ModelElement> result = graphBuilderService.buildAndSaveElements(sampleModelVersion, services);

        assertThat(result).hasSize(3);
        assertThat(result).extracting(ModelElement::getName)
                .containsExactly("catalog-service", "order-service", "payment-service");
        assertThat(result).allMatch(node -> "SERVICE_CONTAINER".equals(node.getElementType()));
        assertThat(result).allMatch(node -> sampleModelVersion.equals(node.getModelVersion()));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> captor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
    }

    @Test
    @DisplayName("Should support custom sourcePath via overloaded buildAndSaveElements")
    void shouldSupportCustomSourcePath() {
        List<String> services = List.of("gateway-service");
        String customExtractedPath = "/custom/extracted/root";
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ModelElement> result = graphBuilderService.buildAndSaveElements(sampleModelVersion, services, customExtractedPath);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getName()).isEqualTo("gateway-service");
        assertThat(result.get(0).getScope()).isEqualTo(customExtractedPath);
    }

    @Test
    @DisplayName("Should batch save REST_API evidence linked to owning element with relationship as null")
    void shouldSaveRestApiEvidenceLinkedToOwningNode() {
        ModelElement element = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        CodeEvidenceDTO restApiEvidence = CodeEvidenceDTO.builder()
                .elementType("REST_API")
                .identifier("/api/v1/orders")
                .filePath("/app/order-service/src/OrderController.java")
                .lineNumber(25)
                .codeSnippet("@GetMapping(\"/api/v1/orders\")")
                .build();

        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion, List.of(element), List.of(restApiEvidence));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> captor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository).saveAll(captor.capture());

        List<Evidence> savedList = captor.getValue();
        assertThat(savedList).hasSize(1);
        Evidence saved = savedList.get(0);
        assertThat(saved.getElement()).isEqualTo(element);
        assertThat(saved.getRelationship()).isNull();
        assertThat(saved.getSourceType()).isEqualTo("STATIC_CODE");
        assertThat(saved.getLocator()).contains("/app/order-service/src/OrderController.java:25");
        assertThat(saved.getExcerpt()).isEqualTo("@GetMapping(\"/api/v1/orders\")");
    }

    @Test
    @DisplayName("Should match FeignClient, create ModelRelationship in batch and linked Evidence in batch")
    void shouldMatchFeignClientAndCreateDependencyEdgeAndEvidence() {
        ModelElement orderElement = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement paymentElement = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("payment-service")
                .scope("/app/payment-service")
                .modelVersion(sampleModelVersion)
                .build();

        CodeEvidenceDTO feignEvidence = CodeEvidenceDTO.builder()
                .elementType("FEIGN_CLIENT")
                .identifier("payment-service")
                .filePath("/app/order-service/src/PaymentClient.java")
                .lineNumber(12)
                .codeSnippet("@FeignClient(\"payment-service\")")
                .build();

        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> {
            List<ModelRelationship> rels = invocation.getArgument(0);
            for (ModelRelationship r : rels) {
                r.setId(UUID.randomUUID());
            }
            return rels;
        });
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(orderElement, paymentElement), List.of(feignEvidence));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());

        List<ModelRelationship> savedRels = relCaptor.getValue();
        assertThat(savedRels).hasSize(1);
        ModelRelationship savedRel = savedRels.get(0);
        assertThat(savedRel.getModelVersion()).isEqualTo(sampleModelVersion);
        assertThat(savedRel.getSourceElement()).isEqualTo(orderElement);
        assertThat(savedRel.getTargetElement()).isEqualTo(paymentElement);
        assertThat(savedRel.getRelationType()).isEqualTo("SERVICE_HTTP_CALL");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> evidenceCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository).saveAll(evidenceCaptor.capture());

        List<Evidence> savedEvidences = evidenceCaptor.getValue();
        assertThat(savedEvidences).hasSize(1);
        Evidence savedEvidence = savedEvidences.get(0);
        assertThat(savedEvidence.getRelationship()).isNotNull();
        assertThat(savedEvidence.getElement()).isNull();
        assertThat(savedEvidence.getSourceType()).isEqualTo("STATIC_CODE");
        assertThat(savedEvidence.getLocator()).contains("/app/order-service/src/PaymentClient.java:12");
    }

    @Test
    @DisplayName("Should create C4 COMPONENT elements with parentElement linking and batch saveAll")
    void shouldCreateC4ComponentLevelHierarchyAndBatchSave() {
        ModelElement serviceContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        List<CodeEvidenceDTO> evidences = List.of(
                CodeEvidenceDTO.builder()
                        .elementType("CONTROLLER_COMPONENT")
                        .identifier("OrderController")
                        .filePath("/app/order-service/OrderController.java")
                        .build(),
                CodeEvidenceDTO.builder()
                        .elementType("SERVICE_COMPONENT")
                        .identifier("OrderService")
                        .filePath("/app/order-service/OrderService.java")
                        .build(),
                CodeEvidenceDTO.builder()
                        .elementType("DATABASE_REPOSITORY")
                        .identifier("OrderRepository")
                        .filePath("/app/order-service/OrderRepository.java")
                        .build()
        );

        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(serviceContainer), evidences);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> compCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(compCaptor.capture());

        List<ModelElement> savedComponents = compCaptor.getValue();
        assertThat(savedComponents).hasSize(3);
        assertThat(savedComponents).extracting(ModelElement::getName)
                .containsExactlyInAnyOrder("OrderController", "OrderService", "OrderRepository");
        assertThat(savedComponents).allMatch(c -> "COMPONENT".equals(c.getElementType()));
        assertThat(savedComponents).allMatch(c -> serviceContainer.equals(c.getParentElement()));
    }

    @Test
    @DisplayName("Should create CODE_DEPENDENCY relationship between components in the same microservice")
    void shouldCreateCodeDependencyRelationshipBetweenComponents() {
        ModelElement serviceContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        List<CodeEvidenceDTO> evidences = List.of(
                CodeEvidenceDTO.builder()
                        .elementType("SERVICE_COMPONENT")
                        .identifier("OrderService")
                        .filePath("/app/order-service/OrderService.java")
                        .build(),
                CodeEvidenceDTO.builder()
                        .elementType("DATABASE_REPOSITORY")
                        .identifier("OrderRepository")
                        .filePath("/app/order-service/OrderRepository.java")
                        .build(),
                CodeEvidenceDTO.builder()
                        .elementType("CODE_DEPENDENCY")
                        .identifier("OrderService -> OrderRepository")
                        .sourceComponent("OrderService")
                        .targetComponent("OrderRepository")
                        .filePath("/app/order-service/OrderService.java")
                        .lineNumber(15)
                        .codeSnippet("private final OrderRepository orderRepository;")
                        .build()
        );

        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(serviceContainer), evidences);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());

        List<ModelRelationship> rels = relCaptor.getValue();
        assertThat(rels).hasSize(1);
        ModelRelationship rel = rels.get(0);
        assertThat(rel.getRelationType()).isEqualTo("CODE_DEPENDENCY");
        assertThat(rel.getOriginLayer()).isEqualTo("STATIC");
        assertThat(rel.getSourceElement().getName()).isEqualTo("OrderService");
        assertThat(rel.getTargetElement().getName()).isEqualTo("OrderRepository");
    }

    @Test
    @DisplayName("Should create DATABASE_ACCESS relationship between repository and database container")
    void shouldCreateDatabaseAccessRelationship() {
        ModelElement serviceContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement dbContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-db")
                .elementType("DATABASE")
                .scope("/app/order-db")
                .modelVersion(sampleModelVersion)
                .build();

        List<CodeEvidenceDTO> evidences = List.of(
                CodeEvidenceDTO.builder()
                        .elementType("DATABASE_REPOSITORY")
                        .identifier("OrderRepository")
                        .sourceComponent("OrderRepository")
                        .targetComponent("Order")
                        .filePath("/app/order-service/OrderRepository.java")
                        .lineNumber(10)
                        .codeSnippet("public interface OrderRepository extends JpaRepository<Order, UUID>")
                        .build()
        );

        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(serviceContainer, dbContainer), evidences);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());

        List<ModelRelationship> rels = relCaptor.getValue();
        assertThat(rels).hasSize(1);
        ModelRelationship rel = rels.get(0);
        assertThat(rel.getRelationType()).isEqualTo("DATABASE_ACCESS");
        assertThat(rel.getOriginLayer()).isEqualTo("STATIC");
        assertThat(rel.getSourceElement().getName()).isEqualTo("OrderRepository");
        assertThat(rel.getTargetElement().getName()).isEqualTo("order-db");
    }

    @Test
    @DisplayName("Should create DECLARED_COMPOSE relationship from docker-compose depends_on")
    void shouldCreateDeclaredComposeFromDockerDependsOn() {
        ModelElement appService = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .scope("/app")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement dbService = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("order-db")
                .elementType("DATABASE")
                .scope("/app")
                .modelVersion(sampleModelVersion)
                .build();

        DetectedContainerDTO containerDto = DetectedContainerDTO.builder()
                .serviceName("order-service")
                .elementType("SERVICE_CONTAINER")
                .composeFilePath("/app/docker-compose.yml")
                .dependsOn(List.of(new DockerDependencyDTO("order-db", 18)))
                .build();

        when(dockerDetectorService.detectContainers(anyString())).thenReturn(List.of(containerDto));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(appService, dbService), Collections.emptyList());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());

        List<ModelRelationship> rels = relCaptor.getValue();
        assertThat(rels).hasSize(1);
        ModelRelationship rel = rels.get(0);
        assertThat(rel.getRelationType()).isEqualTo("DECLARED_COMPOSE");
        assertThat(rel.getOriginLayer()).isEqualTo("DEPLOYMENT");
        assertThat(rel.getSourceElement()).isEqualTo(appService);
        assertThat(rel.getTargetElement()).isEqualTo(dbService);
    }

    @Test
    @DisplayName("Should merge C# .NET elements and connect cross-language HTTP calls in O(1) with Roslyn evidence")
    void shouldMergeCsharpElementsAndCrossLanguageCalls() {
        // Container Level 2
        ModelElement javaGateway = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA_SPRING")
                .scope("/app/api-gateway")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement csharpOrderContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("csharp-order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("CSHARP_DOTNET")
                .scope("/app/csharp-order-service")
                .modelVersion(sampleModelVersion)
                .build();

        // Java Evidences
        List<CodeEvidenceDTO> javaEvidences = List.of(
                CodeEvidenceDTO.builder()
                        .elementType("CONTROLLER_COMPONENT")
                        .identifier("GatewayController")
                        .filePath("/app/api-gateway/GatewayController.java")
                        .build(),
                CodeEvidenceDTO.builder()
                        .elementType("REST_TEMPLATE_CALL")
                        .identifier("csharp-order-service") // Java calling C#
                        .sourceComponent("GatewayController")
                        .filePath("/app/api-gateway/GatewayController.java")
                        .lineNumber(30)
                        .codeSnippet("restTemplate.getForObject(\"http://csharp-order-service/orders\", String.class)")
                        .build()
        );

        // C# Worker Analysis response
        DotnetAnalyzeResponseDTO csharpResponse = DotnetAnalyzeResponseDTO.builder()
                .elements(List.of(
                        DotnetElementDTO.builder()
                                .name("OrderController")
                                .elementType("COMPONENT")
                                .languageStack("CSHARP_DOTNET")
                                .parentElementName("csharp-order-service")
                                .scope("Controllers/OrderController.cs")
                                .build()
                ))
                .relationships(List.of(
                        DotnetRelationDTO.builder()
                                .sourceElementName("OrderController")
                                .targetElementName("api-gateway") // C# calling Java
                                .relationType("SERVICE_HTTP_CALL")
                                .originLayer("STATIC")
                                .direction("DIRECTED")
                                .build()
                ))
                .evidences(List.of(
                        DotnetEvidenceDTO.builder()
                                .sourceElementName("OrderController")
                                .targetElementName("api-gateway")
                                .relationType("SERVICE_HTTP_CALL")
                                .locator("Controllers/OrderController.cs:55")
                                .adapterVersion("ROSLYN_4.8")
                                .sourceType("STATIC_CODE")
                                .excerpt("await _client.GetAsync(\"http://api-gateway/auth/verify\");")
                                .build()
                ))
                .build();

        when(dotnetWorkerClientService.analyzeDotnetIfPresent(any(), any(), anyString()))
                .thenReturn(csharpResponse);
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                List.of(javaGateway, csharpOrderContainer), javaEvidences);

        // 1. Kiểm tra batch save components (Java + C#)
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> compCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(compCaptor.capture());

        List<ModelElement> savedComponents = compCaptor.getValue();
        assertThat(savedComponents).hasSize(2); // GatewayController + OrderController
        assertThat(savedComponents).anyMatch(c -> "OrderController".equals(c.getName())
                && "CSHARP_DOTNET".equals(c.getLanguageStack())
                && csharpOrderContainer.equals(c.getParentElement()));

        // 2. Kiểm tra batch save relationships (2 cạnh HTTP liên ngôn ngữ: Java -> C# và C# -> Java)
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());

        List<ModelRelationship> savedRels = relCaptor.getValue();
        assertThat(savedRels).hasSize(2);
        assertThat(savedRels).allMatch(r -> "SERVICE_HTTP_CALL".equals(r.getRelationType()));

        // Java calling C#
        assertThat(savedRels).anyMatch(r -> "GatewayController".equals(r.getSourceElement().getName())
                && "csharp-order-service".equals(r.getTargetElement().getName()));

        // C# calling Java
        assertThat(savedRels).anyMatch(r -> "OrderController".equals(r.getSourceElement().getName())
                && "api-gateway".equals(r.getTargetElement().getName()));

        // 3. Kiểm tra bằng chứng Roslyn 4.8 được lưu kèm
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> evCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository).saveAll(evCaptor.capture());

        List<Evidence> savedEvidences = evCaptor.getValue();
        assertThat(savedEvidences).anyMatch(e -> "ROSLYN_4.8".equals(e.getAdapterVersion())
                && e.getLocator().contains("Controllers/OrderController.cs:55"));
    }

    @Test
    @DisplayName("Should do nothing when elements or evidences list is empty")
    void shouldDoNothingWhenListsAreEmpty() {
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                Collections.emptyList(), Collections.emptyList());

        verify(modelRelationshipRepository, never()).saveAll(any());
        verify(evidenceRepository, never()).saveAll(any());
    }
}
