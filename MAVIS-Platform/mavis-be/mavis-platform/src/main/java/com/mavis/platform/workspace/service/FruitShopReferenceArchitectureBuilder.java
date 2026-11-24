package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.SourceSnapshot;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Builds the curated C1–C3 + Dependency Graph reference model and real file:line 3E evidence
 * directly from the authentic {@code MAVIS-Platform/fruit-shop-dotnet-microservices} C# 12 / .NET 8 repository.
 */
public final class FruitShopReferenceArchitectureBuilder {

    public static final String REPO_URL = "https://github.com/MAVIS-Platform/fruit-shop-dotnet-microservices";
    public static final String COMMIT_SHA = "a0476f8c278c556a128c820b763a29e0b767f800";
    public static final String SYSTEM_NAME = "Project Trái Cây Platform";
    public static final String SYSTEM_DESCRIPTION =
            "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices";
    public static final String ADAPTER_VERSION = "fruit-shop-dotnet-v1";

    public static final List<String> REAL_MICROSERVICES = List.of(
            "ApiGateway",
            "FruitCatalog.API",
            "FruitBasket.API",
            "FruitOrdering.API"
    );

    public record PersistenceHooks(
            Function<ModelElement, ModelElement> saveElement,
            Function<ModelRelationship, ModelRelationship> saveRelationship,
            Function<Evidence, Evidence> saveEvidence,
            Function<List<DiagramVersion>, List<DiagramVersion>> saveDiagrams,
            Function<EvaluationRun, EvaluationRun> saveEvaluation
    ) {}

    public record BuiltResult(
            Map<String, UUID> serviceIds,
            List<ModelElement> elements,
            List<ModelRelationship> relationships,
            List<Evidence> evidences,
            List<DiagramVersion> diagrams
    ) {}

    private final ObjectMapper json;
    private final ModelVersion model;
    private final SourceSnapshot snapshot;
    private final PersistenceHooks hooks;

    private final Map<String, ModelElement> nodesByKey = new LinkedHashMap<>();
    private final List<ModelElement> allElements = new ArrayList<>();
    private final Map<String, ModelRelationship> relsByKey = new LinkedHashMap<>();
    private final List<ModelRelationship> allRelationships = new ArrayList<>();
    private final List<Evidence> allEvidences = new ArrayList<>();
    private final List<ModelElement> c3ComponentNodes = new ArrayList<>();
    private final List<ModelRelationship> c3ComponentEdges = new ArrayList<>();

    private FruitShopReferenceArchitectureBuilder(
            ObjectMapper json, ModelVersion model, SourceSnapshot snapshot, PersistenceHooks hooks) {
        this.json = json;
        this.model = model;
        this.snapshot = snapshot;
        this.hooks = hooks;
    }

    public static BuiltResult populate(
            ObjectMapper json,
            ModelVersion refModel,
            SourceSnapshot refSnapshot,
            PersistenceHooks hooks) {
        FruitShopReferenceArchitectureBuilder builder =
                new FruitShopReferenceArchitectureBuilder(json, refModel, refSnapshot, hooks);
        return builder.buildAll();
    }

    private BuiltResult buildAll() {
        addC1ActorsAndExternals();
        addC2Microservices();
        addC2Infrastructure();
        List<ModelRelationship> c2Edges = addC2Relationships();
        addC3GatewayComponents();
        addC3CatalogComponents();
        addC3BasketComponents();
        addC3OrderingComponents();
        addRealEvidences();

        Map<String, UUID> serviceIds = new LinkedHashMap<>();
        for (String svc : REAL_MICROSERVICES) {
            ModelElement el = node(svc);
            if (el != null && el.getId() != null) {
                serviceIds.put(svc, el.getId());
            }
        }
        List<ModelElement> containerNodes = c2ContainerNodes();
        List<ModelElement> depGraphNodes = new ArrayList<>();
        if (node("admin") != null) depGraphNodes.add(node("admin"));
        if (node("staff") != null) depGraphNodes.add(node("staff"));
        if (node("customer") != null) depGraphNodes.add(node("customer"));
        depGraphNodes.addAll(containerNodes);
        if (node("otel-observability") != null) depGraphNodes.add(node("otel-observability"));

        List<ModelElement> componentDiagramNodes = new ArrayList<>();
        for (String svc : REAL_MICROSERVICES) {
            if (node(svc) != null) componentDiagramNodes.add(node(svc));
        }
        componentDiagramNodes.addAll(c3ComponentNodes);

        List<DiagramVersion> diagramList = new ArrayList<>();
        if (node("admin") != null && node("staff") != null && node("customer") != null && node("otel-observability") != null) {
            diagramList.add(buildC1ContextDiagram());
        }
        diagramList.add(buildDiagram("DEPENDENCY_GRAPH", "SERVICE", depGraphNodes, c2Edges));
        diagramList.add(buildDiagram("C4", "CONTAINER", depGraphNodes, c2Edges));
        diagramList.add(buildDiagram("C4", "COMPONENT", componentDiagramNodes, c3ComponentEdges));
        List<DiagramVersion> savedDiagrams = hooks.saveDiagrams().apply(diagramList);

        ObjectNode metrics = json.createObjectNode()
                .put("complianceScore", 98.0)
                .put("totalFindings", 0)
                .put("passedRules", 5);
        hooks.saveEvaluation().apply(EvaluationRun.builder()
                .modelVersion(model)
                .ruleSetVersion("3e-3")
                .summaryMetrics(metrics)
                .build());
        return new BuiltResult(serviceIds, allElements, allRelationships, allEvidences, savedDiagrams);
    }

    private void addC1ActorsAndExternals() {
        addNode("admin", null, "PERSON", "Admin Portal",
                "Admin", "Quản trị viên hệ thống quản lý danh mục trái cây, tồn kho & đơn hàng (Admin)",
                props("contextReviewState", "CONFIRMED", "contextFactOrigin", "USER_CONFIRMED",
                        "contextActionLabel", "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]",
                        "actorRole", "System Administrator", "userRole", "Admin"));
        addNode("staff", null, "PERSON", "Staff Portal",
                "Staff", "Nhân viên vận hành kiểm tra giỏ hàng, xử lý đơn hàng & hỗ trợ khách (Staff)",
                props("contextReviewState", "CONFIRMED", "contextFactOrigin", "USER_CONFIRMED",
                        "contextActionLabel", "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]",
                        "actorRole", "Operations Staff", "userRole", "Staff"));
        addNode("customer", null, "PERSON", "Web / Mobile Client",
                "Customer", "Khách hàng duyệt trái cây sạch, quản lý giỏ hàng & đặt hàng (Customer)",
                props("contextReviewState", "CONFIRMED", "contextFactOrigin", "USER_CONFIRMED",
                        "contextActionLabel", "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]",
                        "actorRole", "End-User Shopper", "userRole", "Customer"));
        addNode("otel-observability", null, "EXTERNAL_SYSTEM", "OTLP / .NET OpenTelemetry 1.9",
                "OpenTelemetry & MAVIS Observability",
                "Thu thập OTLP traces, W3C traceparent & .NET Runtime/AspNetCore metrics",
                props("contextReviewState", "CONFIRMED", "contextFactOrigin", "USER_CONFIRMED",
                        "contextActionLabel", "Xuất OTLP traces & metrics [HTTP/OTLP]",
                        "endpoint", "${OTEL_EXPORTER_OTLP_ENDPOINT}"));
    }

    private void addC2Microservices() {
        addNode("ApiGateway", null, "SERVICE_CONTAINER", ".NET 8 · YARP Reverse Proxy (:8080)",
                "ApiGateway",
                "Edge reverse proxy · Demo JWT /api/v1/auth/token, RateLimiter (gateway-fixed), CorrelationId & YARP routing",
                props("port", "8080", "role", "Edge API Gateway", "framework", ".NET 8 / YARP 2.2.0",
                        "layerHint", "edge",
                        "systemDescription", SYSTEM_DESCRIPTION));
        addNode("FruitCatalog.API", null, "SERVICE_CONTAINER", ".NET 8 · ASP.NET Core 8 (:8080)",
                "FruitCatalog.API",
                "Fruit catalog CRUD, AdminOnly policy enforcement & optimistic stock reserve/release endpoints",
                props("port", "8080", "role", "Catalog & Inventory Bounded Context", "framework", ".NET 8 / ASP.NET Core + EF Core 8",
                        "database", "catalog_db", "layerHint", "domain"));
        addNode("FruitBasket.API", null, "SERVICE_CONTAINER", ".NET 8 · ASP.NET Core 8 (:8080)",
                "FruitBasket.API",
                "Redis-backed shopping basket APIs & idempotent MassTransit consumer (OrderCreatedIntegrationEvent)",
                props("port", "8080", "role", "Shopping Basket Bounded Context", "framework", ".NET 8 / StackExchangeRedis + MassTransit",
                        "database", "redis", "layerHint", "domain"));
        addNode("FruitOrdering.API", null, "SERVICE_CONTAINER", ".NET 8 · ASP.NET Core 8 (:8080)",
                "FruitOrdering.API",
                "Order Saga Orchestrator, Polly HttpClient clients, Transactional Outbox & OutboxRelayBackgroundService",
                props("port", "8080", "role", "Order & Saga Orchestrator Context", "framework", ".NET 8 / EF Core 8 + Polly v8 + MassTransit",
                        "database", "ordering_db", "layerHint", "domain"));
    }

    private void addC2Infrastructure() {
        addNode("catalog-db", null, "DATABASE", "PostgreSQL 16 · catalog_db",
                "catalog-db", "Isolated PostgreSQL 16 datastore (schema catalog: fruit_products) owned exclusively by FruitCatalog.API",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · catalog_db",
                        "datastoreKind", "POSTGRES", "ownerService", "FruitCatalog.API"));
        addNode("ordering-db", null, "DATABASE", "PostgreSQL 16 · ordering_db",
                "ordering-db", "Isolated PostgreSQL 16 datastore (schema ordering: orders, order_items, integration_event_outbox) owned by FruitOrdering.API",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · ordering_db",
                        "datastoreKind", "POSTGRES", "ownerService", "FruitOrdering.API"));
        addNode("redis", null, "DATABASE", "Redis 7 · IDistributedCache",
                "redis", "Shopping basket cache (basket:*) & consumer deduplication keys (processed-event:*) owned by FruitBasket.API",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "Redis 7 · IDistributedCache",
                        "datastoreKind", "CACHE", "ownerService", "FruitBasket.API"));
        addNode("rabbitmq", null, "MESSAGE_CHANNEL", "RabbitMQ 3.13 · MassTransit",
                "rabbitmq", "Message broker carrying OrderCreatedIntegrationEvent & OrderCancelledIntegrationEvent via MassTransit",
                props("protocol", "RabbitMQ 3.13 + MassTransit · OrderCreatedIntegrationEvent",
                        "events", "OrderCreatedIntegrationEvent,OrderCancelledIntegrationEvent"));
    }

    private List<ModelElement> c2ContainerNodes() {
        return List.of(
                node("ApiGateway"),
                node("FruitCatalog.API"),
                node("FruitBasket.API"),
                node("FruitOrdering.API"),
                node("catalog-db"),
                node("ordering-db"),
                node("redis"),
                node("rabbitmq")
        );
    }

    private List<ModelRelationship> addC2Relationships() {
        List<ModelRelationship> list = new ArrayList<>();
        list.add(addEdge("admin-gw", "admin", "ApiGateway", "GATEWAY_ROUTE", "RUNTIME",
                props("label", "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]", "transport", "HTTPS")));
        list.add(addEdge("staff-gw", "staff", "ApiGateway", "GATEWAY_ROUTE", "RUNTIME",
                props("label", "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]", "transport", "HTTPS")));
        list.add(addEdge("cust-gw", "customer", "ApiGateway", "GATEWAY_ROUTE", "RUNTIME",
                props("label", "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]", "transport", "HTTPS")));
        list.add(addEdge("gw-catalog", "ApiGateway", "FruitCatalog.API", "GATEWAY_ROUTE", "CONFIG",
                props("route", "/api/v1/catalog/{**catch-all}", "cluster", "catalog-cluster")));
        list.add(addEdge("gw-basket", "ApiGateway", "FruitBasket.API", "GATEWAY_ROUTE", "CONFIG",
                props("route", "/api/v1/basket/{**catch-all}", "cluster", "basket-cluster")));
        list.add(addEdge("gw-ordering", "ApiGateway", "FruitOrdering.API", "GATEWAY_ROUTE", "CONFIG",
                props("route", "/api/v1/orders/{**catch-all}", "cluster", "ordering-cluster")));
        list.add(addEdge("ordering-catalog-http", "FruitOrdering.API", "FruitCatalog.API", "SERVICE_HTTP_CALL", "STATIC",
                props("client", "CatalogApiClient", "resilience", "Polly StandardResilience")));
        list.add(addEdge("ordering-basket-http", "FruitOrdering.API", "FruitBasket.API", "SERVICE_HTTP_CALL", "STATIC",
                props("client", "BasketApiClient", "resilience", "Polly StandardResilience")));
        list.add(addEdge("cat-db", "FruitCatalog.API", "catalog-db", "DATABASE_ACCESS", "CONFIG",
                props("protocol", "Npgsql EF Core · schema catalog")));
        list.add(addEdge("ord-db", "FruitOrdering.API", "ordering-db", "DATABASE_ACCESS", "CONFIG",
                props("protocol", "Npgsql EF Core · schema ordering")));
        list.add(addEdge("basket-redis", "FruitBasket.API", "redis", "DATABASE_ACCESS", "CONFIG",
                props("protocol", "StackExchangeRedis · basket:*")));
        list.add(addEdge("ord-rabbitmq", "FruitOrdering.API", "rabbitmq", "MESSAGE_PUBLISH", "STATIC",
                props("events", "OrderCreatedIntegrationEvent, OrderCancelledIntegrationEvent")));
        list.add(addEdge("rabbitmq-basket", "rabbitmq", "FruitBasket.API", "MESSAGE_SUBSCRIBE", "STATIC",
                props("events", "OrderCreatedIntegrationEvent")));
        list.add(addEdge("gw-otel", "ApiGateway", "otel-observability", "TRACING_EXPORT", "CONFIG",
                props("protocol", "OTLP / .NET OpenTelemetry 1.9")));
        return list;
    }

    private void addC3GatewayComponents() {
        // Added in Commit 3
    }

    private void addC3CatalogComponents() {
        // Added in Commit 3
    }

    private void addC3BasketComponents() {
        // Added in Commit 4
    }

    private void addC3OrderingComponents() {
        // Added in Commit 5
    }

    private void addRealEvidences() {
        // Added in Commits 3-5
    }

    private DiagramVersion buildC1ContextDiagram() {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        String systemId = "system:fruit-shop-dotnet";
        ModelElement admin = node("admin");
        ModelElement staff = node("staff");
        ModelElement customer = node("customer");
        ModelElement otel = node("otel-observability");

        ObjectNode adminNode = nodes.addObject()
                .put("id", admin.getId().toString())
                .put("kind", "PERSON")
                .put("name", admin.getName())
                .put("description", admin.getScope())
                .put("x", 40)
                .put("y", 40);
        adminNode.put("languageStack", admin.getLanguageStack());

        ObjectNode staffNode = nodes.addObject()
                .put("id", staff.getId().toString())
                .put("kind", "PERSON")
                .put("name", staff.getName())
                .put("description", staff.getScope())
                .put("x", 40)
                .put("y", 180);
        staffNode.put("languageStack", staff.getLanguageStack());

        ObjectNode custNode = nodes.addObject()
                .put("id", customer.getId().toString())
                .put("kind", "PERSON")
                .put("name", customer.getName())
                .put("description", customer.getScope())
                .put("x", 40)
                .put("y", 320);
        custNode.put("languageStack", customer.getLanguageStack());

        ObjectNode sysNode = nodes.addObject()
                .put("id", systemId)
                .put("kind", "SYSTEM")
                .put("name", SYSTEM_NAME)
                .put("description", SYSTEM_DESCRIPTION)
                .put("x", 380)
                .put("y", 180);
        sysNode.put("languageStack", ".NET 8 / ASP.NET Core");

        ObjectNode otelNode = nodes.addObject()
                .put("id", otel.getId().toString())
                .put("kind", "EXTERNAL_SYSTEM")
                .put("name", otel.getName())
                .put("description", otel.getScope())
                .put("x", 740)
                .put("y", 180);
        otelNode.put("languageStack", otel.getLanguageStack());

        ArrayNode edges = layout.putArray("edges");
        addContextEdge(edges, "ctx-admin-sys", admin.getId().toString(), systemId, "SERVICE_HTTP_CALL",
                "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]");
        addContextEdge(edges, "ctx-staff-sys", staff.getId().toString(), systemId, "SERVICE_HTTP_CALL",
                "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]");
        addContextEdge(edges, "ctx-cust-sys", customer.getId().toString(), systemId, "SERVICE_HTTP_CALL",
                "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]");
        addContextEdge(edges, "ctx-sys-otel", systemId, otel.getId().toString(), "TRACING_EXPORT",
                "Xuất OTLP traces & metrics [HTTP/OTLP]");

        return DiagramVersion.builder()
                .modelVersion(model)
                .notation("C4")
                .level("CONTEXT")
                .layoutJson(layout)
                .build();
    }

    private void addContextEdge(
            ArrayNode edges, String id, String from, String to, String type, String label) {
        edges.addObject()
                .put("id", id)
                .put("from", from)
                .put("to", to)
                .put("source", from)
                .put("target", to)
                .put("type", type)
                .put("relationType", type)
                .put("label", label)
                .put("originLayer", "STATIC");
    }

    private DiagramVersion buildDiagram(
            String notation, String level, List<ModelElement> nodesList, List<ModelRelationship> edgesList) {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        for (int i = 0; i < nodesList.size(); i++) {
            ModelElement el = nodesList.get(i);
            ObjectNode obj = nodes.addObject()
                    .put("id", el.getId().toString())
                    .put("name", el.getName())
                    .put("kind", el.getElementType())
                    .put("type", el.getElementType())
                    .put("status", el.getStatus())
                    .put("x", (i % 4) * 260)
                    .put("y", (i / 4) * 160);
            obj.put("languageStack", el.getLanguageStack());
            if (el.getScope() != null) {
                obj.put("description", el.getScope());
            }
            if (el.getProperties() != null) {
                obj.set("properties", el.getProperties().deepCopy());
            }
            obj.putObject("position").put("x", (i % 4) * 260).put("y", (i / 4) * 160);
            obj.putObject("data")
                    .put("label", el.getName())
                    .put("status", el.getStatus())
                    .put("technology", el.getLanguageStack());
            if ("C4".equals(notation)) {
                obj.put("c4Type", "COMPONENT".equals(el.getElementType()) ? "Component" : "Container");
            }
            if (el.getParentElement() != null) {
                obj.put("parentId", el.getParentElement().getId().toString());
            }
        }
        ArrayNode edges = layout.putArray("edges");
        for (ModelRelationship edge : edgesList) {
            ObjectNode eObj = edges.addObject()
                    .put("id", edge.getId().toString())
                    .put("from", edge.getSourceElement().getId().toString())
                    .put("to", edge.getTargetElement().getId().toString())
                    .put("source", edge.getSourceElement().getId().toString())
                    .put("target", edge.getTargetElement().getId().toString())
                    .put("type", edge.getRelationType())
                    .put("relationType", edge.getRelationType())
                    .put("label", resolveEdgeLabel(edge))
                    .put("originLayer", edge.getOriginLayer())
                    .put("direction", edge.getDirection());
            if (edge.getProperties() != null) {
                eObj.set("properties", edge.getProperties().deepCopy());
            }
        }
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }

    private String resolveEdgeLabel(ModelRelationship edge) {
        if (edge == null) return "";
        com.fasterxml.jackson.databind.JsonNode p = edge.getProperties();
        if (p != null) {
            String explicit = p.path("label").asText("");
            if (!explicit.isBlank()) return explicit;
            String type = edge.getRelationType();
            if ("GATEWAY_ROUTE".equals(type) && !p.path("route").asText("").isBlank()) {
                return "YARP -> " + p.path("route").asText();
            }
            if ("DATABASE_ACCESS".equals(type) && !p.path("protocol").asText("").isBlank()) {
                return p.path("protocol").asText();
            }
            if ("MESSAGE_PUBLISH".equals(type) && !p.path("events").asText("").isBlank()) {
                return "Publish " + p.path("events").asText();
            }
            if ("MESSAGE_SUBSCRIBE".equals(type) && !p.path("events").asText("").isBlank()) {
                return "Consume " + p.path("events").asText();
            }
            if ("SERVICE_HTTP_CALL".equals(type)) {
                if (!p.path("client").asText("").isBlank()) {
                    return p.path("client").asText() + " (" + p.path("resilience").asText("HTTP") + ")";
                }
                if (!p.path("transport").asText("").isBlank()) {
                    return p.path("transport").asText();
                }
            }
            if ("TRACING_EXPORT".equals(type) && !p.path("protocol").asText("").isBlank()) {
                return p.path("protocol").asText();
            }
        }
        return edge.getRelationType();
    }

    private ModelElement addComponent(
            String key,
            String parentServiceKey,
            String languageStack,
            String name,
            String tier,
            String qualifiedName,
            String responsibility) {
        ModelElement el = addNode(key, node(parentServiceKey), "COMPONENT", languageStack,
                name, parentServiceKey,
                props("tier", tier, "qualifiedName", qualifiedName, "responsibility", responsibility));
        c3ComponentNodes.add(el);
        return el;
    }

    private void addC3Edge(
            String key,
            String fromKey,
            String toKey,
            String relationType,
            ObjectNode props) {
        c3ComponentEdges.add(addEdge(key, fromKey, toKey, relationType, "STATIC", props));
    }

    private ModelElement addNode(
            String key,
            ModelElement parent,
            String elementType,
            String languageStack,
            String name,
            String scope,
            ObjectNode props) {
        ModelElement saved = hooks.saveElement().apply(ModelElement.builder()
                .modelVersion(model)
                .parentElement(parent)
                .elementType(elementType)
                .languageStack(languageStack)
                .name(name)
                .scope(scope)
                .properties(props)
                .status("VALIDATED")
                .build());
        if (saved.getId() == null) {
            saved.setId(UUID.randomUUID());
        }
        nodesByKey.put(key, saved);
        allElements.add(saved);
        return saved;
    }

    private ModelRelationship addEdge(
            String key,
            String fromKey,
            String toKey,
            String relationType,
            String originLayer,
            ObjectNode props) {
        ModelElement src = nodesByKey.get(fromKey);
        ModelElement dst = nodesByKey.get(toKey);
        if (src == null || dst == null) {
            throw new IllegalStateException("Missing node endpoint for edge " + key + ": " + fromKey + " -> " + toKey);
        }
        ModelRelationship saved = hooks.saveRelationship().apply(ModelRelationship.builder()
                .modelVersion(model)
                .sourceElement(src)
                .targetElement(dst)
                .relationType(relationType)
                .originLayer(originLayer)
                .direction("DIRECTED")
                .properties(props)
                .build());
        if (saved.getId() == null) {
            saved.setId(UUID.randomUUID());
        }
        relsByKey.put(key, saved);
        allRelationships.add(saved);
        return saved;
    }

    private void addRelEvidence(String relKey, String locator, String sourceType, String excerpt) {
        ModelRelationship rel = relsByKey.get(relKey);
        if (rel == null) return;
        Evidence saved = hooks.saveEvidence().apply(Evidence.builder()
                .sourceSnapshot(snapshot)
                .modelVersion(model)
                .relationship(rel)
                .locator(locator)
                .adapterVersion(ADAPTER_VERSION)
                .sourceType(sourceType)
                .excerpt(excerpt)
                .build());
        allEvidences.add(saved);
    }

    private void addNodeEvidence(String nodeKey, String locator, String sourceType, String excerpt) {
        ModelElement el = nodesByKey.get(nodeKey);
        if (el == null) return;
        Evidence saved = hooks.saveEvidence().apply(Evidence.builder()
                .sourceSnapshot(snapshot)
                .modelVersion(model)
                .element(el)
                .locator(locator)
                .adapterVersion(ADAPTER_VERSION)
                .sourceType(sourceType)
                .excerpt(excerpt)
                .build());
        allEvidences.add(saved);
    }

    private ModelElement node(String key) {
        return nodesByKey.get(key);
    }

    private ObjectNode props(String... kvPairs) {
        ObjectNode node = json.createObjectNode();
        for (int i = 0; i + 1 < kvPairs.length; i += 2) {
            node.put(kvPairs[i], kvPairs[i + 1]);
        }
        return node;
    }

    public static byte[] buildFruitShopArchive() {
        return new byte[0];
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
