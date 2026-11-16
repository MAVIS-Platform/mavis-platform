package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.HashUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@Transactional
public class CourseLabSeederService {
    private static final String ACTION_SEEDED = "COURSE_LABS_SEEDED_CURATED";
    public static final String PRESET_STANDARD_DEMO = "STANDARD_DEMO";
    public static final String PRESET_FULL_CURRICULUM = "FULL_CURRICULUM";

    private record LabSeedSpec(
            String curriculumCode,
            String title,
            String description,
            List<String> requiredDiagramTypes,
            boolean requireRuntimeTrace) {}

    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final AssignmentRepository assignments;
    private final ProjectRepository projects;
    private final SourceSnapshotRepository snapshots;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final DiagramVersionRepository diagrams;
    private final EvaluationRunRepository evaluations;
    private final EvidenceRepository evidences;
    private final CourseCurriculum curriculum;
    private final CourseQuizService quizzes;
    private final CourseAccessService courses;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Path storageRoot;

    @Autowired
    public CourseLabSeederService(
            AccessPolicyService access,
            WorkspaceRepository workspaces,
            AssignmentRepository assignments,
            ProjectRepository projects,
            SourceSnapshotRepository snapshots,
            ModelVersionRepository models,
            ModelElementRepository elements,
            ModelRelationshipRepository relationships,
            DiagramVersionRepository diagrams,
            EvaluationRunRepository evaluations,
            EvidenceRepository evidences,
            CourseCurriculum curriculum,
            CourseQuizService quizzes,
            CourseAccessService courses,
            JdbcTemplate jdbc,
            ObjectMapper json,
            @Value("${mavis.storage.upload-dir:C:/mavis/uploads/}") String uploadDir) {
        this.access = access;
        this.workspaces = workspaces;
        this.assignments = assignments;
        this.projects = projects;
        this.snapshots = snapshots;
        this.models = models;
        this.elements = elements;
        this.relationships = relationships;
        this.diagrams = diagrams;
        this.evaluations = evaluations;
        this.evidences = evidences;
        this.curriculum = curriculum;
        this.quizzes = quizzes;
        this.courses = courses;
        this.jdbc = jdbc;
        this.json = json;
        this.storageRoot = Path.of(uploadDir);
    }

    public CourseAccessService.Roadmap seedCurated(UUID workspaceId) {
        return seedCurated(workspaceId, PRESET_STANDARD_DEMO);
    }

    public CourseAccessService.Roadmap seedCurated(UUID workspaceId, String preset) {
        User lecturer = access.requireCurrentActiveUser();
        access.requireWorkspaceLecturer(workspaceId);
        Workspace workspace = workspaces.findLockedById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if (!"ACTIVE".equals(workspace.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This workspace is archived");
        }

        boolean fullCurriculum = PRESET_FULL_CURRICULUM.equalsIgnoreCase(preset == null ? "" : preset.trim());
        List<Assignment> existingLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);

        if (!fullCurriculum && !existingLabs.isEmpty()) {
            ensureCourseMode(workspace);
            return courses.roadmap(workspaceId);
        }
        if (fullCurriculum && existingLabs.size() >= 13) {
            ensureCourseMode(workspace);
            return courses.roadmap(workspaceId);
        }

        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseGet(() -> seedReferenceModel(workspaceId, workspace, lecturer));

        ensureCourseMode(workspace);

        Set<String> existingTitles = new LinkedHashSet<>();
        int nextOrder = 0;
        for (Assignment existing : existingLabs) {
            if (existing.getTitle() != null) {
                existingTitles.add(existing.getTitle());
            }
            if (existing.getLabOrder() != null && existing.getLabOrder() > nextOrder) {
                nextOrder = existing.getLabOrder();
            }
        }

        List<LabSeedSpec> specs = buildLabSpecs(fullCurriculum);
        for (LabSeedSpec spec : specs) {
            if (existingTitles.contains(spec.title())) {
                continue;
            }
            Assignment lab = assignments.saveAndFlush(Assignment.builder()
                    .workspace(workspace)
                    .createdBy(lecturer)
                    .title(spec.title())
                    .description(spec.description())
                    .requiredDiagramTypes(json.valueToTree(spec.requiredDiagramTypes()))
                    .ruleSetVersion("SWD_DEFAULT_V1")
                    .requireRuntimeTrace(spec.requireRuntimeTrace())
                    .referenceModel(refModel)
                    .labOrder(++nextOrder)
                    .build());
            quizzes.publishCurriculum(workspaceId, lab.getId(), curriculum.quizFor(spec.curriculumCode()));
        }

        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                lecturer.getId(), ACTION_SEEDED, "WORKSPACE", workspaceId);

        return courses.roadmap(workspaceId);
    }

    private void ensureCourseMode(Workspace workspace) {
        if (!workspace.isCourseMode()) {
            workspace.setCourseMode(true);
            workspaces.saveAndFlush(workspace);
        }
    }

    private ModelVersion seedReferenceModel(UUID workspaceId, Workspace workspace, User lecturer) {
        Project refProject = projects.save(Project.builder()
                .workspace(workspace)
                .owner(lecturer)
                .name("Curated E-Commerce Reference (Spring Boot & .NET Core)")
                .description("Curated multi-service repository (API Gateway, Order Service, Payment Service, Inventory Service, C# Orders/Catalog) for Guided Labs.")
                .defaultBranch("main")
                .projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true)
                .status("ACTIVE")
                .build());

        byte[] zipBytes = buildCuratedArchive();
        Path archivePath = persistArchive(workspaceId, refProject.getId(), zipBytes);
        String sha256 = HashUtils.sha256Hex(zipBytes);

        SourceSnapshot refSnapshot = snapshots.save(SourceSnapshot.builder()
                .project(refProject)
                .sourceType("ZIP_UPLOAD")
                .branchName("main")
                .artifactHash(sha256)
                .storagePath(archivePath.toString())
                .isPublished(true)
                .createdBy(lecturer)
                .build());

        ModelVersion refModel = models.saveAndFlush(ModelVersion.builder()
                .project(refProject)
                .sourceSnapshot(refSnapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(lecturer)
                .build());

        ModelElement customer = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("PERSON").languageStack("Actor")
                .name("Customer").scope("external").status("CONFIRMED").build());
        ModelElement gateway = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Cloud Gateway")
                .name("api-gateway").scope("service").status("CONFIRMED").build());
        ModelElement orderService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("order-service").scope("service").status("CONFIRMED").build());
        ModelElement paymentService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("payment-service").scope("service").status("CONFIRMED").build());
        ModelElement inventoryService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("inventory-service").scope("service").status("CONFIRMED").build());

        ModelElement orderController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(orderService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("OrderController").scope("order-service").status("CONFIRMED").build());
        ModelElement paymentClient = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(orderService).elementType("COMPONENT").languageStack("OpenFeign")
                .name("PaymentClient").scope("order-service").status("CONFIRMED").build());
        ModelElement paymentController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(paymentService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("PaymentController").scope("payment-service").status("CONFIRMED").build());
        ModelElement inventoryController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(inventoryService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("InventoryController").scope("inventory-service").status("CONFIRMED").build());

        ModelRelationship customerToGateway = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(customer).targetElement(gateway)
                .relationType("USES").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship gatewayToOrder = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(gateway).targetElement(orderService)
                .relationType("HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderToPayment = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderService).targetElement(paymentService)
                .relationType("FEIGN_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderToInventory = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderService).targetElement(inventoryService)
                .relationType("HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship clientToPaymentController = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(paymentClient).targetElement(paymentController)
                .relationType("CALL_SITE").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderCtrlToClient = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderController).targetElement(paymentClient)
                .relationType("DEPENDS_ON").originLayer("STATIC").direction("DIRECTED").build());

        evidences.save(Evidence.builder()
                .sourceSnapshot(refSnapshot)
                .modelVersion(refModel)
                .relationship(orderToPayment)
                .locator("order-service/src/main/java/com/curated/order/PaymentClient.java:6")
                .adapterVersion("curated-seed-v1")
                .sourceType("CALL_SITE")
                .excerpt("@FeignClient(name = \"payment-service\", url = \"http://payment-service:8082\")")
                .build());

        List<ModelElement> containers = List.of(gateway, orderService, paymentService, inventoryService);
        List<ModelRelationship> containerEdges = List.of(gatewayToOrder, orderToPayment, orderToInventory);
        List<ModelElement> components = List.of(orderService, paymentService, inventoryService, orderController, paymentClient, paymentController, inventoryController);
        List<ModelRelationship> componentEdges = List.of(orderCtrlToClient, clientToPaymentController, orderToInventory);

        diagrams.saveAll(List.of(
                buildContextDiagram(refModel, refProject.getName(), customer, customerToGateway),
                buildDiagram(refModel, "DEPENDENCY_GRAPH", "SERVICE", containers, containerEdges),
                buildDiagram(refModel, "C4", "CONTAINER", containers, containerEdges),
                buildDiagram(refModel, "C4", "COMPONENT", components, componentEdges)
        ));

        ObjectNode metrics = json.createObjectNode()
                .put("complianceScore", 88.0)
                .put("totalFindings", 0)
                .put("passedRules", 5);
        evaluations.save(EvaluationRun.builder()
                .modelVersion(refModel)
                .ruleSetVersion("3e-3")
                .summaryMetrics(metrics)
                .build());

        return refModel;
    }

    private List<LabSeedSpec> buildLabSpecs(boolean fullCurriculum) {
        if (!fullCurriculum) {
            return List.of(
                    new LabSeedSpec(
                            "java-04",
                            "Lab 01 · Static C1–C3 Architecture & OpenFeign Reverse BFS",
                            "Inspect the curated Spring Boot microservices, identify OpenFeign/REST call sites, review C1–C3 views, pass the theory quiz, and submit your C4 Container & Component diagrams.",
                            List.of("C4_CONTAINER", "C4_COMPONENT"),
                            false),
                    new LabSeedSpec(
                            "java-07",
                            "Lab 02 · Runtime Resilience, Circuit Breaker & Stop/Scale Impact",
                            "Verify live OpenTelemetry runtime traces on the curated architecture, perform a MAVIS Studio Stop/Scale chaos experiment on payment-service, and submit your verified runtime & architecture package.",
                            List.of("C4_CONTAINER", "DEPENDENCY_GRAPH"),
                            true),
                    new LabSeedSpec(
                            "csharp-13",
                            "Lab 03 · ASP.NET Core Microservices with Roslyn & OpenTelemetry",
                            "Analyze C# ASP.NET Core services (Orders/Program.cs, Catalog/Program.cs) alongside Spring Boot services, inspect Roslyn static findings and OTel runtime traces, and verify Studio Stop/Scale impact.",
                            List.of("C4_CONTAINER", "DEPENDENCY_GRAPH"),
                            true)
            );
        }

        List<String> fullOrder = List.of(
                "java-01", "java-02", "java-03", "java-04",
                "java-05", "java-06", "java-07", "java-08",
                "java-09", "java-10", "java-11", "java-12",
                "csharp-13"
        );
        List<LabSeedSpec> specs = new ArrayList<>(fullOrder.size());
        for (int i = 0; i < fullOrder.size(); i++) {
            String code = fullOrder.get(i);
            String label = String.format("Lab %02d", i + 1);
            boolean staticOnly = i < 4;
            List<String> requiredDiagrams = staticOnly
                    ? List.of("C4_CONTAINER", "C4_COMPONENT")
                    : List.of("C4_CONTAINER", "DEPENDENCY_GRAPH");
            CourseCurriculum.Chapter chapter = curriculum.chapter(code);
            String title = label + " · " + chapter.title();
            String description = chapter.objective() + "\n\n" + chapter.exercise();
            specs.add(new LabSeedSpec(code, title, description, requiredDiagrams, !staticOnly));
        }
        return specs;
    }

    private DiagramVersion buildContextDiagram(ModelVersion model, String projectName, ModelElement customer, ModelRelationship rel) {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        String systemId = "system:" + model.getProject().getId();
        nodes.addObject().put("id", systemId).put("kind", "SYSTEM").put("name", projectName).put("x", 280).put("y", 0);
        nodes.addObject().put("id", customer.getId().toString()).put("kind", "PERSON").put("name", customer.getName()).put("x", 640).put("y", 0);
        ArrayNode edges = layout.putArray("edges");
        edges.addObject()
                .put("id", rel.getId().toString())
                .put("from", customer.getId().toString())
                .put("to", systemId)
                .put("source", customer.getId().toString())
                .put("target", systemId)
                .put("type", rel.getRelationType())
                .put("relationType", rel.getRelationType())
                .put("originLayer", "STATIC");
        return DiagramVersion.builder().modelVersion(model).notation("C4").level("CONTEXT").layoutJson(layout).build();
    }

    private DiagramVersion buildDiagram(
            ModelVersion model, String notation, String level, List<ModelElement> nodesList, List<ModelRelationship> edgesList) {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        for (int i = 0; i < nodesList.size(); i++) {
            ModelElement node = nodesList.get(i);
            ObjectNode obj = nodes.addObject()
                    .put("id", node.getId().toString())
                    .put("name", node.getName())
                    .put("kind", node.getElementType())
                    .put("type", node.getElementType())
                    .put("status", node.getStatus())
                    .put("x", (i % 4) * 260)
                    .put("y", (i / 4) * 160);
            obj.put("languageStack", node.getLanguageStack());
            obj.putObject("position").put("x", (i % 4) * 260).put("y", (i / 4) * 160);
            obj.putObject("data").put("label", node.getName()).put("status", node.getStatus()).put("technology", node.getLanguageStack());
            if ("C4".equals(notation)) {
                obj.put("c4Type", "COMPONENT".equals(node.getElementType()) ? "Component" : "Container");
            }
            if (node.getParentElement() != null) {
                obj.put("parentId", node.getParentElement().getId().toString());
            }
        }
        ArrayNode edges = layout.putArray("edges");
        for (ModelRelationship edge : edgesList) {
            edges.addObject()
                    .put("id", edge.getId().toString())
                    .put("from", edge.getSourceElement().getId().toString())
                    .put("to", edge.getTargetElement().getId().toString())
                    .put("source", edge.getSourceElement().getId().toString())
                    .put("target", edge.getTargetElement().getId().toString())
                    .put("type", edge.getRelationType())
                    .put("relationType", edge.getRelationType())
                    .put("label", edge.getRelationType())
                    .put("originLayer", edge.getOriginLayer())
                    .put("direction", edge.getDirection());
        }
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }

    private Path persistArchive(UUID workspaceId, UUID projectId, byte[] zipBytes) {
        try {
            Files.createDirectories(storageRoot);
            Path target = storageRoot.toRealPath().resolve("curated-course-" + workspaceId + "-" + projectId + ".zip");
            Files.write(target, zipBytes);
            return target;
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Unable to store curated reference archive: " + ex.getMessage());
        }
    }

    private static byte[] buildCuratedArchive() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(out)) {
            writeEntry(zip, "pom.xml", """
                    <project xmlns="http://maven.apache.org/POM/4.0.0">
                      <modelVersion>4.0.0</modelVersion>
                      <groupId>com.curated</groupId>
                      <artifactId>curated-ecommerce</artifactId>
                      <version>1.0.0</version>
                      <packaging>pom</packaging>
                    </project>
                    """);
            writeEntry(zip, "order-service/src/main/java/com/curated/order/OrderController.java", """
                    package com.curated.order;
                    import org.springframework.web.bind.annotation.PostMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class OrderController {
                        private final PaymentClient paymentClient;
                        public OrderController(PaymentClient paymentClient) { this.paymentClient = paymentClient; }
                        @PostMapping("/api/orders")
                        public String createOrder() { return paymentClient.authorize(); }
                    }
                    """);
            writeEntry(zip, "order-service/src/main/java/com/curated/order/PaymentClient.java", """
                    package com.curated.order;
                    import org.springframework.cloud.openfeign.FeignClient;
                    import org.springframework.web.bind.annotation.PostMapping;
                    @FeignClient(name = "payment-service", url = "http://payment-service:8082")
                    public interface PaymentClient {
                        @PostMapping("/api/payments/authorize")
                        String authorize();
                    }
                    """);
            writeEntry(zip, "payment-service/src/main/java/com/curated/payment/PaymentController.java", """
                    package com.curated.payment;
                    import org.springframework.web.bind.annotation.PostMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class PaymentController {
                        @PostMapping("/api/payments/authorize")
                        public String authorize() { return "AUTHORIZED"; }
                    }
                    """);
            writeEntry(zip, "inventory-service/src/main/java/com/curated/inventory/InventoryController.java", """
                    package com.curated.inventory;
                    import org.springframework.web.bind.annotation.GetMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class InventoryController {
                        @GetMapping("/api/inventory/health")
                        public String health() { return "IN_STOCK"; }
                    }
                    """);
            writeEntry(zip, "Orders/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    builder.Services.AddHttpClient("catalog", client => client.BaseAddress = new Uri("http://catalog-service:8084"));
                    var app = builder.Build();
                    app.MapGet("/api/orders/health", () => Results.Ok(new { service = "orders-dotnet", status = "UP" }));
                    app.Run();
                    """);
            writeEntry(zip, "Catalog/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    var app = builder.Build();
                    app.MapGet("/api/catalog/items", () => Results.Ok(new[] { "SKU-001", "SKU-002" }));
                    app.Run();
                    """);
            writeEntry(zip, "docker-compose.yml", """
                    services:
                      api-gateway:
                        image: mavis/api-gateway:curated
                        ports: ["8080:8080"]
                      order-service:
                        image: mavis/order-service:curated
                        ports: ["8081:8081"]
                      payment-service:
                        image: mavis/payment-service:curated
                        ports: ["8082:8082"]
                      inventory-service:
                        image: mavis/inventory-service:curated
                        ports: ["8083:8083"]
                    """);
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to build curated archive", ex);
        }
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
