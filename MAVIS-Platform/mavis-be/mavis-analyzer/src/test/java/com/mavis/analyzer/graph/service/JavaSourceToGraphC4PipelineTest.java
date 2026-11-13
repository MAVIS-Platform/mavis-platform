package com.mavis.analyzer.graph.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl;
import com.mavis.analyzer.detector.docker.service.impl.DockerDetectorServiceImpl;
import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl;
import com.mavis.analyzer.graph.service.impl.GraphServiceImpl;
import com.mavis.analyzer.impact.WorkerImpactService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.workerclient.WorkerContract;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

class JavaSourceToGraphC4PipelineTest {

    @TempDir
    Path tempDir;

    @Test
    @DisplayName("Real source pipeline: Docker compose + Java AST -> GraphBuilder -> GraphService -> JSON output")
    void executePipelineFromSourceToGraphContract() throws Exception {
        // 1. Prepare realistic microservice source fixture in tempDir
        Path dockerCompose = tempDir.resolve("docker-compose.yml");
        Files.writeString(dockerCompose, """
                version: '3.8'
                services:
                  orders-service:
                    build: ./orders
                    ports:
                      - "8081:8081"
                    environment:
                      - SPRING_DATASOURCE_URL=jdbc:mysql://orders-db:3306/orders_db
                    depends_on:
                      - orders-db
                  orders-db:
                    image: mysql:8.0
                    ports:
                      - "3306:3306"
                """);

        Path ordersSrc = tempDir.resolve("orders/src/main/java/com/example/orders");
        Path billingSrc = tempDir.resolve("orders/src/main/java/com/example/billing");
        Files.createDirectories(ordersSrc);
        Files.createDirectories(billingSrc);

        Path repoFile = ordersSrc.resolve("OrderRepository.java");
        Files.writeString(repoFile, """
                package com.example.orders;
                import org.springframework.stereotype.Repository;
                @Repository
                public interface OrderRepository {
                    void findOrderById(String id);
                }
                """);

        Files.writeString(billingSrc.resolve("BillingInvoice.java"), """
                package com.example.billing;
                public class BillingInvoice {
                    private String invoiceId;
                    public String getInvoiceId() { return invoiceId; }
                }
                """);

        Files.writeString(ordersSrc.resolve("Contract.java"), """
                package com.example.orders;
                public interface Contract {
                    boolean validate(String orderId);
                }
                """);

        Files.writeString(ordersSrc.resolve("IHelper.java"), """
                package com.example.orders;
                public class IHelper {
                    String formatId(String raw) { return raw == null ? "" : raw.trim(); }
                }
                """);

        Files.writeString(ordersSrc.resolve("OrderStatus.java"), """
                package com.example.orders;
                public enum OrderStatus {
                    CREATED,
                    VALIDATED,
                    PAID,
                    CANCELLED
                }
                """);

        Files.writeString(ordersSrc.resolve("AbstractOrderProcessor.java"), """
                package com.example.orders;
                public abstract class AbstractOrderProcessor {
                    protected String processorName = "default";
                    public abstract boolean validate(String orderId);
                }
                """);

        Files.writeString(ordersSrc.resolve("OrderProcessor.java"), """
                package com.example.orders;
                import com.example.billing.BillingInvoice;
                import org.springframework.stereotype.Service;
                @Service
                public class OrderProcessor extends AbstractOrderProcessor implements Contract {
                    private final OrderRepository orderRepository;
                    private final IHelper helper;
                    private OrderStatus status;
                    static int maxRetries = 3;

                    public OrderProcessor(OrderRepository orderRepository, IHelper helper) {
                        this.orderRepository = orderRepository;
                        this.helper = helper;
                        this.status = OrderStatus.CREATED;
                    }

                    @Override
                    public boolean validate(String orderId) {
                        if (this.status == OrderStatus.CREATED) {
                            this.status = OrderStatus.VALIDATED;
                            return true;
                        } else {
                            return false;
                        }
                    }

                    public boolean process(String orderId) {
                        boolean settled = false;
                        if (validate(orderId)) {
                            this.orderRepository.findOrderById(orderId);
                            this.status = OrderStatus.PAID;
                            settled = true;
                        }
                        return settled;
                    }

                    public boolean process(String orderId, BillingInvoice invoice) {
                        if (this.status == OrderStatus.VALIDATED) {
                            this.status = OrderStatus.PAID;
                            return true;
                        }
                        if (this.status == OrderStatus.PAID) {
                            this.status = OrderStatus.CANCELLED;
                            return false;
                        }
                        return false;
                    }
                }
                """);

        // 2. Instantiate REAL detector and parser implementations
        var dockerDetector = new DockerDetectorServiceImpl();
        var configDetector = new SpringConfigDetectorServiceImpl();
        var javaParser = new JavaSourceParser();

        Files.createDirectories(tempDir.resolve("orders"));
        Files.writeString(tempDir.resolve("orders/Dockerfile"), "FROM eclipse-temurin:21\nCOPY build/libs/*.jar /app/orders.jar\n");
        Path packageFixture = tempDir.resolve("orders/src/main/java/sample/shipping");
        for (String directory : List.of("ports", "workflows/abort", "workflows/amend", "domain")) Files.createDirectories(packageFixture.resolve(directory));
        Files.writeString(packageFixture.resolve("ports/StockPort.java"), "package sample.shipping.ports; public interface StockPort {}");
        Files.writeString(packageFixture.resolve("ports/LedgerPort.java"), "package sample.shipping.ports; public interface LedgerPort {}");
        Files.writeString(packageFixture.resolve("workflows/abort/AbortDispatch.java"), """
            package sample.shipping.workflows.abort;
            import sample.shipping.ports.*; import java.util.*;
            public class AbortDispatch {
                private Map<String, List<StockPort>> ports;
                @org.springframework.beans.factory.annotation.Autowired private LedgerPort ledger;
            }
            """);
        Files.writeString(packageFixture.resolve("workflows/amend/AmendDispatch.java"), """
            package sample.shipping.workflows.amend;
            import sample.shipping.ports.StockPort; import sample.shipping.ports.LedgerPort;
            public class AmendDispatch {
                public AmendDispatch(StockPort stock, LedgerPort ledger) {}
                @org.springframework.context.annotation.Bean public StockPort stock(LedgerPort ledger) { return null; }
            }
            """);
        Files.writeString(packageFixture.resolve("domain/Parcel.java"), "package sample.shipping.domain; @jakarta.persistence.Entity public class Parcel { @jakarta.persistence.Embedded ShippingLabel label; }");
        Files.writeString(packageFixture.resolve("domain/Depot.java"), "package sample.shipping.domain; @jakarta.persistence.Entity public class Depot {}");
        Files.writeString(packageFixture.resolve("domain/ShippingLabel.java"), "package sample.shipping.domain; @jakarta.persistence.Embeddable public class ShippingLabel { String destination; }");
        Files.writeString(packageFixture.resolve("domain/CatalogStore.java"), "package sample.shipping.domain; public interface CatalogStore extends org.springframework.data.repository.CrudRepository<Parcel, Long> {}");
        Files.writeString(packageFixture.resolve("ports/CommandPort.java"), """
            package sample.shipping.ports;
            public class CommandPort {
                public final CommandEndpoint<DispatchCommand> dispatch = EndpointBuilder.forCommand(DispatchCommand.class).build();
                protected java.util.function.Supplier<String> status = () -> { return "ready"; };
            }
            """);
        Files.createDirectories(packageFixture.resolve("web"));
        Files.writeString(packageFixture.resolve("web/FulfillmentResource.java"), """
            package sample.shipping.web;
            @org.springframework.web.bind.annotation.RestController
            public class FulfillmentResource {
                @org.springframework.web.bind.annotation.GetMapping(path={"/depot", "/depots/{id}"})
                public final reactor.core.publisher.Mono<sample.shipping.domain.Depot> findDepot(String id) { return null; }
            }
            """);
        Files.writeString(packageFixture.resolve("web/PlumbingFilter.java"), "package sample.shipping.web; public class PlumbingFilter implements jakarta.servlet.Filter {}");

        var containers = dockerDetector.detectContainers(tempDir.toString());
        assertThat(containers).isNotEmpty();
        var ordersContainer = containers.stream().filter(c -> "orders-service".equals(c.getServiceName())).findFirst().orElseThrow();
        assertThat(ordersContainer.getDatasourceTechnology()).isEqualTo("mysql");
        assertThat(ordersContainer.getArtifactName()).isEqualTo("orders.jar");

        var codeEvidences = javaParser.parseProject(tempDir.toString());
        assertThat(codeEvidences).isNotEmpty();

        // 3. Set up mock repositories to capture GraphBuilder output
        var modelElementRepo = Mockito.mock(ModelElementRepository.class);
        var modelRelRepo = Mockito.mock(ModelRelationshipRepository.class);
        var evidenceRepo = Mockito.mock(EvidenceRepository.class);
        var modelVersionRepo = Mockito.mock(ModelVersionRepository.class);
        var impactService = Mockito.mock(WorkerImpactService.class);
        var policyService = Mockito.mock(AccessPolicyService.class);

        List<ModelElement> savedElements = new ArrayList<>();
        List<ModelRelationship> savedRelationships = new ArrayList<>();
        List<Evidence> savedEvidences = new ArrayList<>();

        when(modelElementRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelElement> iter = inv.getArgument(0);
            List<ModelElement> list = new ArrayList<>();
            iter.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); list.add(e); });
            savedElements.addAll(list);
            return list;
        });

        when(modelRelRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelRelationship> iter = inv.getArgument(0);
            List<ModelRelationship> list = new ArrayList<>();
            iter.forEach(r -> { if (r.getId() == null) r.setId(UUID.randomUUID()); list.add(r); });
            savedRelationships.addAll(list);
            return list;
        });

        when(evidenceRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<Evidence> iter = inv.getArgument(0);
            List<Evidence> list = new ArrayList<>();
            iter.forEach(ev -> { if (ev.getId() == null) ev.setId(UUID.randomUUID()); list.add(ev); });
            savedEvidences.addAll(list);
            return list;
        });

        Project project = Project.builder().id(UUID.randomUUID()).name("pipeline-demo").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).storagePath(tempDir.toString()).build();
        ModelVersion modelVersion = ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).revision(1).build();

        // 4. Run GraphBuilderServiceImpl to build elements and relationships
        var graphBuilder = new GraphBuilderServiceImpl(modelElementRepo, modelRelRepo, evidenceRepo, dockerDetector, configDetector);
        var elements = graphBuilder.buildAndSaveElements(modelVersion, null, tempDir.toString());
        graphBuilder.buildRelationshipsAndEvidences(snapshot, modelVersion, elements, codeEvidences);

        // Verify logical database node and protocol
        var dbNode = savedElements.stream()
                .filter(e -> "LOGICAL_DATASTORE".equals(e.getProperties().path("resourceRole").asText()))
                .findFirst()
                .orElseThrow();
        assertThat(dbNode.getProperties().path("protocol").asText()).isEqualTo("mysql");

        // Verify M4/M6/M7 Java UML Classifier & Relationship extraction
        var contractNode = savedElements.stream().filter(e -> "Contract".equals(e.getName())).findFirst().orElseThrow();
        assertThat(contractNode.getProperties().path("typeKind").asText()).isEqualTo("INTERFACE");
        var iHelperNode = savedElements.stream().filter(e -> "IHelper".equals(e.getName())).findFirst().orElseThrow();
        assertThat(iHelperNode.getProperties().path("typeKind").asText()).isEqualTo("CLASS");
        var orderProcessorNode = savedElements.stream().filter(e -> "OrderProcessor".equals(e.getName())).findFirst().orElseThrow();
        assertThat(orderProcessorNode.getProperties().path("umlClassifier").path("members").toString())
                .contains("package-private")
                .contains("process(orderId: String)")
                .contains("process(orderId: String, invoice: BillingInvoice)");
        assertThat(orderProcessorNode.getProperties().path("umlClassifier").path("methodsCfg").isArray()).isTrue();
        assertThat(orderProcessorNode.getProperties().path("umlClassifier").path("stateLifecycle").path("transitions").isEmpty()).isFalse();

        // Verify relationships
        assertThat(savedRelationships).anyMatch(r -> "DATABASE_ACCESS".equals(r.getRelationType()));
        assertThat(savedRelationships).anyMatch(r -> "GENERALIZATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "REALIZATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "ASSOCIATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "DEPENDENCY".equals(r.getProperties().path("umlRelationKind").asText()));

        // 5. Run GraphServiceImpl to produce GraphDTO
        when(modelVersionRepo.findById(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(modelElementRepo.findByModelVersionId(modelVersion.getId())).thenReturn(savedElements);
        when(modelRelRepo.findByModelVersionId(modelVersion.getId())).thenReturn(savedRelationships);

        // Map relationship -> evidence IDs from savedEvidences
        List<Object[]> evidenceRows = new ArrayList<>();
        for (var ev : savedEvidences) {
            if (ev.getRelationship() != null && ev.getRelationship().getId() != null) {
                evidenceRows.add(new Object[]{ev.getRelationship().getId(), ev.getId()});
            }
        }
        when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(modelVersion.getId())).thenReturn(evidenceRows);

        var graphService = new GraphServiceImpl(modelElementRepo, modelRelRepo, modelVersionRepo, evidenceRepo, impactService, policyService);
        GraphDataDTO graphDto = graphService.getGraphDataBySessionId(modelVersion.getId());

        // Verify GraphDTO
        assertThat(savedEvidences).anyMatch(e -> e.getElement() != null && "CommandPort".equals(e.getElement().getName()) && e.getRelationship() == null && "STATIC_CODE".equals(e.getSourceType()));
        assertThat(savedEvidences).anyMatch(e -> e.getElement() != null && "orders-service".equals(e.getElement().getName()) && e.getRelationship() == null && "DOCKER_COMPOSE".equals(e.getSourceType()));
        assertThat(savedRelationships).anyMatch(r -> "CatalogStore".equals(r.getSourceElement().getName()) && "Parcel".equals(r.getTargetElement().getName()));
        assertThat(savedRelationships).anyMatch(r -> "FulfillmentResource".equals(r.getSourceElement().getName()) && "Depot".equals(r.getTargetElement().getName()));
        assertThat(savedRelationships).anyMatch(r -> "Parcel".equals(r.getSourceElement().getName()) && "ShippingLabel".equals(r.getTargetElement().getName()) && "COMPOSITION".equals(r.getProperties().path("umlRelationKind").asText()) && "EMBEDDED_VALUE".equals(r.getProperties().path("ownershipEvidence").asText()));
        assertThat(savedElements).anyMatch(e -> "CommandPort".equals(e.getName()) && e.getProperties().path("umlClassifier").path("members").toString().contains("dispatch"));
        assertThat(savedElements).anyMatch(e -> "FulfillmentResource".equals(e.getName()) && e.getProperties().path("umlClassifier").path("members").toString().contains("findDepot"));
        for (String workflow : List.of("AbortDispatch", "AmendDispatch")) {
            for (String port : List.of("StockPort", "LedgerPort")) {
                assertThat(savedRelationships).anyMatch(r -> "CODE_DEPENDENCY".equals(r.getRelationType()) && workflow.equals(r.getSourceElement().getName()) && port.equals(r.getTargetElement().getName()));
            }
        }
        for (String entity : List.of("Parcel", "Depot")) assertThat(savedElements).anyMatch(e -> entity.equals(e.getName()) && e.getProperties().path("umlClassifier").path("annotations").toString().contains("jakarta.persistence.Entity"));
        var configuredDeployment = savedElements.stream().filter(e -> "orders-service".equals(e.getName())).findFirst().orElseThrow().getProperties().path("deploymentMetadata");
        assertThat(configuredDeployment.path("artifactName").asText()).isEqualTo("orders.jar");
        assertThat(configuredDeployment.path("connections").isArray()).isTrue();
        assertThat(configuredDeployment.path("connections").get(0).path("targetService").asText()).isEqualTo("orders-db");
        assertThat(configuredDeployment.path("connections").get(0).path("port").asInt()).isEqualTo(3306);
        assertThat(graphDto.getNodes()).anyMatch(n -> "mysql".equals(n.getProtocol()));
        assertThat(graphDto.getEdges()).anyMatch(e -> "DATABASE_ACCESS".equals(e.getKind()) && e.getEvidenceCount() != null && e.getEvidenceCount() > 0);
        assertThat(graphDto.getEdges()).anyMatch(e -> e.getProperties() != null && "REALIZATION".equals(e.getProperties().path("umlRelationKind").asText()));

        // 6. Serialize output to JSON for frontend pipeline consumption
        ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        Map<String, Object> outputEnvelope = new LinkedHashMap<>();
        outputEnvelope.put("metadata", Map.of(
                "id", modelVersion.getId().toString(),
                "projectId", project.getId().toString(),
                "sourceSnapshotId", snapshot.getId().toString(),
                "revision", 1,
                "label", "pipeline-actual",
                "createdAt", "2026-10-24T16:00:00Z"
        ));
        outputEnvelope.put("graph", graphDto);
        outputEnvelope.put("details", savedElements.stream().map(e -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", e.getId().toString());
            map.put("modelVersionId", modelVersion.getId().toString());
            map.put("name", e.getName());
            map.put("elementType", e.getElementType());
            map.put("parentElementId", e.getParentElement() != null ? e.getParentElement().getId().toString() : null);
            map.put("languageStack", e.getLanguageStack());
            map.put("properties", e.getProperties());
            return map;
        }).toList());

        Path outputPath = Paths.get("../../..", "output", "m2", "source-pipeline-java-actual.json");
        Files.createDirectories(outputPath.getParent());
        Files.writeString(outputPath, mapper.writeValueAsString(outputEnvelope));
        System.out.println("Saved actual Java pipeline output to: " + outputPath.toAbsolutePath());
    }

    @Test
    @DisplayName("Real C# pipeline ingestion: Roslyn output -> WorkerCanonicalImporter -> GraphService -> GraphDataDTO JSON")
    void executePipelineFromCsharpActualToGraphContract() throws Exception {
        Path csharpActualPath = Paths.get("../../..", "output", "m2", "source-pipeline-csharp-actual.json").toAbsolutePath().normalize();
        assertThat(Files.exists(csharpActualPath))
                .as("Live C# pipeline artifact output/m2/source-pipeline-csharp-actual.json must exist from HttpClientProfileTests run")
                .isTrue();

        ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        WorkerContract.Result csharpResult = mapper.readValue(Files.readString(csharpActualPath), WorkerContract.Result.class);
        assertThat(csharpResult.canonical()).isNotNull();
        assertThat(csharpResult.canonical().elements()).isNotEmpty();

        var modelElementRepo = Mockito.mock(ModelElementRepository.class);
        var modelRelRepo = Mockito.mock(ModelRelationshipRepository.class);
        var evidenceRepo = Mockito.mock(EvidenceRepository.class);
        var modelVersionRepo = Mockito.mock(ModelVersionRepository.class);
        var impactService = Mockito.mock(WorkerImpactService.class);
        var policyService = Mockito.mock(AccessPolicyService.class);

        List<ModelElement> savedElements = new ArrayList<>();
        List<ModelRelationship> savedRelationships = new ArrayList<>();
        List<Evidence> savedEvidences = new ArrayList<>();

        when(modelElementRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelElement> iter = inv.getArgument(0);
            List<ModelElement> list = new ArrayList<>();
            iter.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); list.add(e); });
            savedElements.addAll(list);
            return list;
        });

        when(modelRelRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelRelationship> iter = inv.getArgument(0);
            List<ModelRelationship> list = new ArrayList<>();
            iter.forEach(r -> { if (r.getId() == null) r.setId(UUID.randomUUID()); list.add(r); });
            savedRelationships.addAll(list);
            return list;
        });

        when(evidenceRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<Evidence> iter = inv.getArgument(0);
            List<Evidence> list = new ArrayList<>();
            iter.forEach(ev -> { if (ev.getId() == null) ev.setId(UUID.randomUUID()); list.add(ev); });
            savedEvidences.addAll(list);
            return list;
        });

        Project project = Project.builder().id(UUID.randomUUID()).name("csharp-pipeline-demo").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build();
        ModelVersion modelVersion = ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).revision(1).build();

        var importer = new com.mavis.analyzer.workerclient.service.impl.WorkerCanonicalImporter(
                modelElementRepo, modelRelRepo, evidenceRepo, mapper);
        importer.importResult(modelVersion, csharpResult, java.util.Map.of());

        assertThat(savedElements).isNotEmpty();
        assertThat(savedRelationships).isNotEmpty();

        when(modelVersionRepo.findById(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(modelElementRepo.findByModelVersionId(modelVersion.getId())).thenReturn(savedElements);
        when(modelRelRepo.findByModelVersionId(modelVersion.getId())).thenReturn(savedRelationships);

        List<Object[]> evidenceRows = new ArrayList<>();
        for (var ev : savedEvidences) {
            if (ev.getRelationship() != null && ev.getRelationship().getId() != null) {
                evidenceRows.add(new Object[]{ev.getRelationship().getId(), ev.getId()});
            }
        }
        when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(modelVersion.getId())).thenReturn(evidenceRows);

        var graphService = new GraphServiceImpl(modelElementRepo, modelRelRepo, modelVersionRepo, evidenceRepo, impactService, policyService);
        GraphDataDTO graphDto = graphService.getGraphDataBySessionId(modelVersion.getId());

        assertThat(graphDto.getNodes()).anyMatch(n -> "payment-service:5000".equals(n.getName()) || "App".equals(n.getName()) || "OrderClient".equals(n.getName()));
        assertThat(graphDto.getEdges()).anyMatch(e -> "SERVICE_HTTP_CALL".equals(e.getKind()));

        var csContract = savedElements.stream().filter(e -> "Demo.Orders.Contract".equals(e.getName())).findFirst().orElseThrow();
        assertThat(csContract.getProperties().path("typeKind").asText()).isEqualTo("INTERFACE");
        var csIHelper = savedElements.stream().filter(e -> "Demo.Orders.IHelper".equals(e.getName())).findFirst().orElseThrow();
        assertThat(csIHelper.getProperties().path("typeKind").asText()).isEqualTo("CLASS");
        var csOrderProcessor = savedElements.stream().filter(e -> "Demo.Orders.OrderProcessor".equals(e.getName())).findFirst().orElseThrow();
        assertThat(csOrderProcessor.getProperties().path("umlClassifier").path("members").toString())
                .contains("\"internal\"")
                .contains("Process(orderId: string)")
                .contains("Process(orderId: string, invoice: Demo.Billing.BillingInvoice)");
        assertThat(savedRelationships).anyMatch(r -> "GENERALIZATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "REALIZATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "ASSOCIATION".equals(r.getProperties().path("umlRelationKind").asText()));
        assertThat(savedRelationships).anyMatch(r -> "DEPENDENCY".equals(r.getProperties().path("umlRelationKind").asText()));

        Map<String, Object> outputEnvelope = new LinkedHashMap<>();
        outputEnvelope.put("metadata", Map.of(
                "id", modelVersion.getId().toString(),
                "projectId", project.getId().toString(),
                "sourceSnapshotId", snapshot.getId().toString(),
                "revision", 1,
                "label", "csharp-pipeline-actual",
                "createdAt", "2026-10-24T16:00:00Z"
        ));
        outputEnvelope.put("graph", graphDto);
        outputEnvelope.put("details", savedElements.stream().map(e -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", e.getId().toString());
            map.put("modelVersionId", modelVersion.getId().toString());
            map.put("name", e.getName());
            map.put("elementType", e.getElementType());
            map.put("parentElementId", e.getParentElement() != null ? e.getParentElement().getId().toString() : null);
            map.put("languageStack", e.getLanguageStack());
            map.put("properties", e.getProperties());
            return map;
        }).toList());

        Path outputPath = Paths.get("../../..", "output", "m2", "source-pipeline-csharp-graph-actual.json");
        Files.createDirectories(outputPath.getParent());
        Files.writeString(outputPath, mapper.writeValueAsString(outputEnvelope));
        System.out.println("Saved actual C# pipeline graph output to: " + outputPath.toAbsolutePath());
    }

    @Test
    @DisplayName("Q3 real pipeline: Compose service with only ports/environment (no image, no build) -> DockerDetector -> GraphBuilder -> GraphService without fabricated :build artifact")
    void composeServiceWithOnlyPortsAndEnvironmentDoesNotFabricateArtifactInRealPipeline() throws Exception {
        Path composeDir = tempDir.resolve("compose-q3");
        Files.createDirectories(composeDir);
        Files.writeString(composeDir.resolve("docker-compose.yml"), """
                version: '3.8'
                services:
                  edge-proxy:
                    ports:
                      - "8080:8080"
                    environment:
                      - PROXY_MODE=passthrough
                  orders-service:
                    build: ./orders
                    ports:
                      - "8081:8081"
                  orders-db:
                    image: mysql:8.0
                    ports:
                      - "3306:3306"
                """);

        var dockerDetector = new DockerDetectorServiceImpl();
        var configDetector = new SpringConfigDetectorServiceImpl();
        var containers = dockerDetector.detectContainers(composeDir.toString());
        assertThat(containers).extracting("serviceName")
                .contains("edge-proxy", "orders-service", "orders-db");

        var modelElementRepo = Mockito.mock(ModelElementRepository.class);
        var modelRelRepo = Mockito.mock(ModelRelationshipRepository.class);
        var evidenceRepo = Mockito.mock(EvidenceRepository.class);
        var modelVersionRepo = Mockito.mock(ModelVersionRepository.class);
        var impactService = Mockito.mock(WorkerImpactService.class);
        var policyService = Mockito.mock(AccessPolicyService.class);

        List<ModelElement> savedElements = new ArrayList<>();
        when(modelElementRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelElement> iter = inv.getArgument(0);
            List<ModelElement> list = new ArrayList<>();
            iter.forEach(e -> {
                if (e.getId() == null) e.setId(UUID.randomUUID());
                list.add(e);
            });
            savedElements.addAll(list);
            return list;
        });

        Project project = Project.builder().id(UUID.randomUUID()).name("q3-compose-demo").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).storagePath(composeDir.toString()).build();
        ModelVersion modelVersion = ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).revision(1).build();

        var graphBuilder = new GraphBuilderServiceImpl(modelElementRepo, modelRelRepo, evidenceRepo, dockerDetector, configDetector);
        var elements = graphBuilder.buildAndSaveElements(modelVersion, null, composeDir.toString());
        assertThat(elements).hasSize(3);

        when(modelVersionRepo.findById(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(modelElementRepo.findByModelVersionId(modelVersion.getId())).thenReturn(savedElements);
        when(modelRelRepo.findByModelVersionId(modelVersion.getId())).thenReturn(List.of());
        when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(modelVersion.getId())).thenReturn(List.of());

        var graphService = new GraphServiceImpl(modelElementRepo, modelRelRepo, modelVersionRepo, evidenceRepo, impactService, policyService);
        GraphDataDTO graphDto = graphService.getGraphDataBySessionId(modelVersion.getId());
        assertThat(graphDto.getNodes()).extracting("name").contains("edge-proxy", "orders-service", "orders-db");

        var edgeProxyElem = savedElements.stream().filter(e -> "edge-proxy".equals(e.getName())).findFirst().orElseThrow();
        var edgeProxyMeta = edgeProxyElem.getProperties().path("deploymentMetadata");
        assertThat(edgeProxyMeta.has("artifactName")).isFalse();
        assertThat(edgeProxyMeta.has("artifactKind")).isFalse();
        assertThat(edgeProxyMeta.path("artifactResolution").asText()).isEqualTo("NO_ARTIFACT_DECLARED");

        var ordersElem = savedElements.stream().filter(e -> "orders-service".equals(e.getName())).findFirst().orElseThrow();
        var ordersMeta = ordersElem.getProperties().path("deploymentMetadata");
        assertThat(ordersMeta.has("artifactName")).isFalse();
        assertThat(ordersMeta.has("artifactKind")).isFalse();
        assertThat(ordersMeta.path("declaredBuildContext").asText()).isEqualTo("./orders");
        assertThat(ordersMeta.path("artifactResolution").asText()).isEqualTo("BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT");

        var dbElem = savedElements.stream().filter(e -> "orders-db".equals(e.getName())).findFirst().orElseThrow();
        var dbMeta = dbElem.getProperties().path("deploymentMetadata");
        assertThat(dbMeta.path("artifactName").asText()).isEqualTo("mysql:8.0");
        assertThat(dbMeta.path("artifactKind").asText()).isEqualTo("CONTAINER_IMAGE");
        assertThat(dbMeta.path("artifactResolution").asText()).isEqualTo("EXPLICIT_CONTAINER_IMAGE");
    }
}

