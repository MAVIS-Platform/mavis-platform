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
        assertThat(fallbackElement.getLanguageStack()).isNull();
        assertThat(fallbackElement.getStatus()).isEqualTo("UNCERTAIN_MAPPING");

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
                .elementType("SERVICE_CONTAINER")
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
                .elementType("SERVICE_CONTAINER")
                .scope("/app/order-service")
                .modelVersion(sampleModelVersion)
                .build();

        ModelElement paymentElement = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
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
        when(springConfigDetectorService.detectConfigs(anyString())).thenReturn(List.of(
                DetectedSpringConfigDTO.builder().serviceName("order-service").applicationName("order-service").datasourceHost("order-db").build()));
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
    @DisplayName("Graph builder must not call the legacy raw-path Worker client or double-import C# findings")
    void shouldDelegateCsharpPublicationToCanonicalImporter() {
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                Collections.emptyList(), Collections.emptyList());
        org.mockito.Mockito.verifyNoInteractions(dotnetWorkerClientService);
        verify(modelRelationshipRepository, never()).saveAll(any());
        verify(evidenceRepository, never()).saveAll(any());
    }
    @Test
    @DisplayName("Should do nothing when elements or evidences list is empty")
    void shouldDoNothingWhenListsAreEmpty() {
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion,
                Collections.emptyList(), Collections.emptyList());

        verify(modelRelationshipRepository, never()).saveAll(any());
        verify(evidenceRepository, never()).saveAll(any());
    }

    @Test
    void logicalDatabasesOnOneHostRemainSeparateAndRepositoryBindingsUseTheirOwnSchema() {
        var orders=DetectedContainerDTO.builder().serviceName("orders").elementType("SERVICE_CONTAINER").datasourceHost("mysql").datasourceDatabase("orders_data").datasourceTechnology("mysql").composeFilePath("/repo/docker-compose.yml").datasourceLineNumber(8).build();
        var kitchen=DetectedContainerDTO.builder().serviceName("kitchen").elementType("SERVICE_CONTAINER").datasourceHost("mysql").datasourceDatabase("kitchen_data").datasourceTechnology("mysql").composeFilePath("/repo/docker-compose.yml").datasourceLineNumber(16).build();
        var mysql=DetectedContainerDTO.builder().serviceName("mysql").elementType("DATABASE").image("mysql:8").build();
        when(dockerDetectorService.detectContainers(anyString())).thenReturn(List.of(orders,kitchen,mysql));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(call->{List<ModelElement> values=call.getArgument(0);values.forEach(e->{if(e.getId()==null)e.setId(UUID.randomUUID());});return values;});
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(call->{List<ModelRelationship> values=call.getArgument(0);values.forEach(e->e.setId(UUID.randomUUID()));return values;});
        var elements=graphBuilderService.buildAndSaveElements(sampleModelVersion,List.of(),"/repo");
        assertThat(elements).extracting(ModelElement::getName).contains("orders_data @ mysql","kitchen_data @ mysql","mysql");
        var ordersDb = elements.stream().filter(e -> "orders_data @ mysql".equals(e.getName())).findFirst().orElseThrow();
        assertThat(ordersDb.getProperties().path("protocol").asText()).isEqualTo("mysql");
        var facts=List.of(CodeEvidenceDTO.builder().elementType("DATABASE_REPOSITORY").identifier("OrderRepository").sourceComponent("OrderRepository").filePath("/repo/orders/OrderRepository.java").lineNumber(1).build(),CodeEvidenceDTO.builder().elementType("DATABASE_REPOSITORY").identifier("KitchenRepository").sourceComponent("KitchenRepository").filePath("/repo/kitchen/KitchenRepository.java").lineNumber(1).build());
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot,sampleModelVersion,elements,facts);
        @SuppressWarnings("unchecked") ArgumentCaptor<List<ModelRelationship>> captured=ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(captured.capture());
        assertThat(captured.getValue()).extracting(r->r.getTargetElement().getName()).containsExactlyInAnyOrder("orders_data @ mysql","kitchen_data @ mysql");
    }
    @Test void equalChannelNamesOnDifferentBrokersDoNotCreateFalseConnections() { checkMessageTransports("broker-a:9092","broker-b:9092",2); }
    @Test void explicitlySharedTransportAllowsPublisherAndHandlerToUseOneChannel() { checkMessageTransports("broker:9092","broker:9092",1); }
    @Test void missingTransportDoesNotJoinChannelsAcrossServices() { checkMessageTransports(null,null,2); }
    private void checkMessageTransports(String first,String second,int expectedChannels) {
        var orders=ModelElement.builder().id(UUID.randomUUID()).name("orders").elementType("SERVICE_CONTAINER").scope("/repo").modelVersion(sampleModelVersion).build();
        var kitchen=ModelElement.builder().id(UUID.randomUUID()).name("kitchen").elementType("SERVICE_CONTAINER").scope("/repo").modelVersion(sampleModelVersion).build();
        when(dockerDetectorService.detectContainers(anyString())).thenReturn(List.of(DetectedContainerDTO.builder().serviceName("orders").messageBrokerAuthority(first).build(),DetectedContainerDTO.builder().serviceName("kitchen").messageBrokerAuthority(second).build()));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(call->{List<ModelElement> values=call.getArgument(0);values.forEach(e->e.setId(UUID.randomUUID()));return values;});
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(call->{List<ModelRelationship> values=call.getArgument(0);values.forEach(e->e.setId(UUID.randomUUID()));return values;});
        var facts=List.of(CodeEvidenceDTO.builder().elementType("MESSAGE_PUBLISH").identifier("commands").endpointAlias("Kafka topic").sourceComponent("Publisher").filePath("/repo/orders/Publisher.java").lineNumber(1).build(),CodeEvidenceDTO.builder().elementType("MESSAGE_SUBSCRIBE").identifier("commands").endpointAlias("Kafka topic").sourceComponent("Handler").filePath("/repo/kitchen/Handler.java").lineNumber(1).build());
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot,sampleModelVersion,List.of(orders,kitchen),facts);
        @SuppressWarnings("unchecked") ArgumentCaptor<List<ModelElement>> nodes=ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository).saveAll(nodes.capture());assertThat(nodes.getValue()).hasSize(expectedChannels);
        @SuppressWarnings("unchecked") ArgumentCaptor<List<ModelRelationship>> relations=ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relations.capture());assertThat(relations.getValue()).hasSize(2);
        var publishing=relations.getValue().stream().filter(r->r.getRelationType().equals("MESSAGE_PUBLISH")).findFirst().orElseThrow();
        var handling=relations.getValue().stream().filter(r->r.getRelationType().equals("MESSAGE_SUBSCRIBE")).findFirst().orElseThrow();
        assertThat(publishing.getTargetElement().getId().equals(handling.getSourceElement().getId())).isEqualTo(expectedChannels==1);
    }

    @Test
    @DisplayName("Q3: Should only emit artifactName when container has explicit image, never fabricating :build fallback")
    void shouldNotFabricateBuildArtifactWhenContainerLacksExplicitImage() {
        var explicitImageContainer = DetectedContainerDTO.builder()
                .serviceName("orders-db")
                .elementType("DATABASE")
                .image("mysql:8.0")
                .ports(List.of("3306:3306"))
                .composeFilePath("/repo/docker-compose.yml")
                .lineNumber(14)
                .build();
        var buildContextOnlyContainer = DetectedContainerDTO.builder()
                .serviceName("orders-service")
                .elementType("SERVICE_CONTAINER")
                .buildContext("./orders")
                .ports(List.of("8081:8081"))
                .composeFilePath("/repo/docker-compose.yml")
                .lineNumber(4)
                .build();
        var portsEnvOnlyContainer = DetectedContainerDTO.builder()
                .serviceName("edge-proxy")
                .elementType("SERVICE_CONTAINER")
                .ports(List.of("8080:8080"))
                .composeFilePath("/repo/docker-compose.yml")
                .lineNumber(20)
                .build();

        when(dockerDetectorService.detectContainers(anyString()))
                .thenReturn(List.of(explicitImageContainer, buildContextOnlyContainer, portsEnvOnlyContainer));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(call -> {
            List<ModelElement> values = call.getArgument(0);
            values.forEach(e -> {
                if (e.getId() == null) e.setId(UUID.randomUUID());
            });
            return values;
        });

        var elements = graphBuilderService.buildAndSaveElements(sampleModelVersion, List.of(), "/repo");

        var dbElem = elements.stream().filter(e -> "orders-db".equals(e.getName())).findFirst().orElseThrow();
        var dbMeta = dbElem.getProperties().path("deploymentMetadata");
        assertThat(dbMeta.path("artifactName").asText()).isEqualTo("mysql:8.0");
        assertThat(dbMeta.path("artifactKind").asText()).isEqualTo("CONTAINER_IMAGE");
        assertThat(dbMeta.path("artifactResolution").asText()).isEqualTo("EXPLICIT_CONTAINER_IMAGE");

        var buildElem = elements.stream().filter(e -> "orders-service".equals(e.getName())).findFirst().orElseThrow();
        var buildMeta = buildElem.getProperties().path("deploymentMetadata");
        assertThat(buildMeta.has("artifactName")).isFalse();
        assertThat(buildMeta.has("artifactKind")).isFalse();
        assertThat(buildMeta.path("declaredBuildContext").asText()).isEqualTo("./orders");
        assertThat(buildMeta.path("artifactResolution").asText()).isEqualTo("BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT");

        var portsOnlyElem = elements.stream().filter(e -> "edge-proxy".equals(e.getName())).findFirst().orElseThrow();
        var portsOnlyMeta = portsOnlyElem.getProperties().path("deploymentMetadata");
        assertThat(portsOnlyMeta.has("artifactName")).isFalse();
        assertThat(portsOnlyMeta.has("artifactKind")).isFalse();
        assertThat(portsOnlyMeta.has("declaredBuildContext")).isFalse();
        assertThat(portsOnlyMeta.path("artifactResolution").asText()).isEqualTo("NO_ARTIFACT_DECLARED");
    }

    @Test void configurationProfilesProduceTypedEvidenceRatherThanBusinessHttpCalls() {
        var source = ModelElement.builder().id(UUID.randomUUID()).name("employee-service").elementType("SERVICE_CONTAINER").modelVersion(sampleModelVersion).build();
        var config = ModelElement.builder().id(UUID.randomUUID()).name("config-service").elementType("SERVICE_CONTAINER").modelVersion(sampleModelVersion).build();
        var tracing = ModelElement.builder().id(UUID.randomUUID()).name("zipkin").elementType("SERVICE_CONTAINER").modelVersion(sampleModelVersion).build();
        when(springConfigDetectorService.detectConfigs(anyString())).thenReturn(List.of(DetectedSpringConfigDTO.builder()
                .serviceName("employee-service").configFilePath("employee-service/src/main/resources/application.yml")
                .targetServiceUrls(List.of(
                        ConfigTargetUrlDTO.builder().configKey("spring.config.import").targetUrl("http://config-service:8888").lineNumber(3).build(),
                        ConfigTargetUrlDTO.builder().configKey("management.zipkin.tracing.endpoint").targetUrl("http://zipkin:9411/api/v2/spans").profile("docker").lineNumber(8).build(),
                        ConfigTargetUrlDTO.builder().configKey("management.zipkin.tracing.endpoint").targetUrl("http://zipkin:9411/api/v2/spans").profile("dev").lineNumber(12).build())).build()));
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion, List.of(source, config, tracing), List.of());
        @SuppressWarnings("unchecked") ArgumentCaptor<List<ModelRelationship>> capture = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(capture.capture());
        assertThat(capture.getValue()).hasSize(3).extracting(ModelRelationship::getRelationType)
                .containsExactlyInAnyOrder("CONFIGURATION_DEPENDENCY", "TRACING_EXPORT", "TRACING_EXPORT");
        assertThat(capture.getValue().stream().filter(rel -> "TRACING_EXPORT".equals(rel.getRelationType())))
                .extracting(rel -> rel.getProperties().path("profile").asText()).containsExactlyInAnyOrder("docker", "dev");
    }

    @Test void composeLinksRemainDeploymentDeclarationsAndNeverBecomeHttpCalls() {
        var source = ModelElement.builder().id(UUID.randomUUID()).name("employee-service").elementType("SERVICE_CONTAINER").modelVersion(sampleModelVersion).build();
        var target = ModelElement.builder().id(UUID.randomUUID()).name("discovery-service").elementType("SERVICE_CONTAINER").modelVersion(sampleModelVersion).build();
        var compose = DetectedContainerDTO.builder().serviceName("employee-service").composeFilePath("docker-compose.yml").lineNumber(3).build();
        compose.getConnections().add(new com.mavis.analyzer.detector.docker.dto.DetectedConnectionDTO("discovery-service", "DECLARED_LINK", 8761, "links", 5));
        when(dockerDetectorService.detectContainers(anyString())).thenReturn(List.of(compose));
        graphBuilderService.buildRelationshipsAndEvidences(sampleSnapshot, sampleModelVersion, List.of(source, target), List.of());
        @SuppressWarnings("unchecked") ArgumentCaptor<List<ModelRelationship>> capture = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(capture.capture());
        assertThat(capture.getValue()).hasSize(1);
        assertThat(capture.getValue().get(0).getRelationType()).isEqualTo("DECLARED_LINK");
        assertThat(capture.getValue().get(0).getOriginLayer()).isEqualTo("DEPLOYMENT");
    }

    @Test
    void doesNotPersistRestEvidenceWithoutResolvedTarget() {
        ModelElement element = ModelElement.builder()
                .id(UUID.randomUUID()).name("other-service").elementType("SERVICE_CONTAINER")
                .scope("/other-service").modelVersion(sampleModelVersion).build();
        CodeEvidenceDTO fact = CodeEvidenceDTO.builder()
                .elementType("REST_API").sourceComponent("MissingController")
                .filePath("/unmapped/ApiGatewayController.java").lineNumber(54).build();
        graphBuilderService.buildRelationshipsAndEvidences(
                sampleSnapshot, sampleModelVersion, List.of(element), List.of(fact));
        verify(evidenceRepository, never()).saveAll(anyList());
    }
}

