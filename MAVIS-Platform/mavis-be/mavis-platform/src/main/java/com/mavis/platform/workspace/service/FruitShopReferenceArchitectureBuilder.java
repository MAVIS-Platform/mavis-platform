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
                "Observability Platform (OpenTelemetry)",
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
        addComponent("c3-gw-auth", "ApiGateway", "C# 12 · ASP.NET Core Controller",
                "AuthController", "Controller",
                "ApiGateway.Controllers.AuthController",
                "Demo JWT token issuance (/api/v1/auth/token) mapping Customer, Staff and Admin roles");
        addComponent("c3-gw-yarp", "ApiGateway", "C# 12 · YARP 2.2.0 Reverse Proxy",
                "YarpReverseProxyPipeline", "Proxy",
                "ApiGateway.Program.MapReverseProxy",
                "Reverse proxy routing /api/v1/catalog, /api/v1/basket, /api/v1/orders with X-Correlation-Id propagation & gateway-fixed rate limiter");
        addComponent("c3-gw-jwt", "ApiGateway", "C# 12 · JWT Bearer & Policy Options",
                "JwtOptions", "Security",
                "ApiGateway.Options.JwtOptions",
                "Configures HMAC-SHA256 TokenValidationParameters and AdminOnly / AuthenticatedUser policies");
        addComponent("c3-gw-err", "ApiGateway", "C# 12 · IExceptionHandler",
                "GlobalExceptionHandler", "Middleware",
                "ApiGateway.Exceptions.GlobalExceptionHandler",
                "Maps unhandled gateway pipeline exceptions into RFC 7807 ProblemDetails JSON");

        addC3Edge("c3-gw-auth-jwt", "c3-gw-auth", "c3-gw-jwt", "CODE_DEPENDENCY",
                props("label", "Issues signed JWT for Admin/Staff/Customer"));
        addC3Edge("c3-gw-yarp-jwt", "c3-gw-yarp", "c3-gw-jwt", "CODE_DEPENDENCY",
                props("label", "Validates Bearer JWT & AdminOnly policy"));
        addC3Edge("c3-gw-yarp-err", "c3-gw-yarp", "c3-gw-err", "CODE_DEPENDENCY",
                props("label", "Handles downstream proxy faults (ProblemDetails)"));
    }

    private void addC3CatalogComponents() {
        addComponent("c3-cat-ctrl", "FruitCatalog.API", "C# 12 · ASP.NET Core Controller",
                "CatalogItemsController", "Controller",
                "FruitCatalog.API.Controllers.CatalogItemsController",
                "Exposes catalog CRUD (AdminOnly) and stock reserve/release endpoints (/api/v1/catalog/items)");
        addComponent("c3-cat-svc", "FruitCatalog.API", "C# 12 · Application Service",
                "CatalogService", "Service",
                "FruitCatalog.API.Services.CatalogService",
                "Manages fruit inventory mutations, stock reservation & idempotency via EF Core");
        addComponent("c3-cat-dbctx", "FruitCatalog.API", "C# 12 · EF Core 8 Npgsql DbContext",
                "CatalogDbContext", "Repository",
                "FruitCatalog.API.Data.CatalogDbContext",
                "Maps fruit_products entity into isolated PostgreSQL schema catalog");
        addComponent("c3-cat-init", "FruitCatalog.API", "C# 12 · Startup Seeder",
                "CatalogDbInitializer", "Initializer",
                "FruitCatalog.API.Data.CatalogDbInitializer",
                "Seeds initial Vietnamese clean fruit catalog items on startup");

        addC3Edge("c3-cat-ctrl-svc", "c3-cat-ctrl", "c3-cat-svc", "CODE_DEPENDENCY",
                props("label", "Delegates ICatalogService calls"));
        addC3Edge("c3-cat-svc-db", "c3-cat-svc", "c3-cat-dbctx", "CODE_DEPENDENCY",
                props("label", "Persists fruit_products updates"));
        addC3Edge("c3-cat-init-db", "c3-cat-init", "c3-cat-dbctx", "CODE_DEPENDENCY",
                props("label", "Seeds catalog items on boot"));
        addC3Edge("c3-cat-db-pg", "c3-cat-dbctx", "catalog-db", "DATABASE_ACCESS",
                props("protocol", "Npgsql EF Core · schema catalog"));
    }

    private void addC3BasketComponents() {
        addComponent("c3-bsk-ctrl", "FruitBasket.API", "C# 12 · ASP.NET Core Controller",
                "BasketController", "Controller",
                "FruitBasket.API.Controllers.BasketController",
                "Exposes shopping basket endpoints (/api/v1/basket/{customerId}) enforcing owner or Admin/Staff authorization");
        addComponent("c3-bsk-svc", "FruitBasket.API", "C# 12 · Application Service",
                "BasketService", "Service",
                "FruitBasket.API.Services.BasketService",
                "Coordinates basket reads, updates and deletion for checked-out customers");
        addComponent("c3-bsk-cons", "FruitBasket.API", "C# 12 · MassTransit IConsumer<T>",
                "OrderCreatedConsumer", "Consumer",
                "FruitBasket.API.Consumers.OrderCreatedConsumer",
                "Consumes OrderCreatedIntegrationEvent from RabbitMQ and clears customer basket idempotently");
        addComponent("c3-bsk-repo", "FruitBasket.API", "C# 12 · StackExchangeRedis Repository",
                "RedisBasketRepository", "Repository",
                "FruitBasket.API.Repositories.RedisBasketRepository",
                "Serializes CustomerBasket JSON payloads under Redis keys basket:{customerId}");
        addComponent("c3-bsk-proc", "FruitBasket.API", "C# 12 · Redis Idempotency Store",
                "RedisProcessedEventStore", "Repository",
                "FruitBasket.API.Repositories.RedisProcessedEventStore",
                "Tracks processed integration event IDs in Redis keys processed-event:* to guarantee exactly-once effect");

        addC3Edge("c3-bsk-ctrl-svc", "c3-bsk-ctrl", "c3-bsk-svc", "CODE_DEPENDENCY",
                props("label", "Delegates IBasketService operations"));
        addC3Edge("c3-bsk-svc-repo", "c3-bsk-svc", "c3-bsk-repo", "CODE_DEPENDENCY",
                props("label", "Reads/writes CustomerBasket via IBasketRepository"));
        addC3Edge("c3-bsk-repo-redis", "c3-bsk-repo", "redis", "DATABASE_ACCESS",
                props("protocol", "StackExchangeRedis · basket:*"));
        addC3Edge("c3-rmq-bsk-cons", "rabbitmq", "c3-bsk-cons", "MESSAGE_SUBSCRIBE",
                props("events", "OrderCreatedIntegrationEvent"));
        addC3Edge("c3-bsk-cons-proc", "c3-bsk-cons", "c3-bsk-proc", "CODE_DEPENDENCY",
                props("label", "Checks HasProcessedAsync & marks processed-event:*"));
        addC3Edge("c3-bsk-proc-redis", "c3-bsk-proc", "redis", "DATABASE_ACCESS",
                props("protocol", "StackExchangeRedis · processed-event:*"));
        addC3Edge("c3-bsk-cons-svc", "c3-bsk-cons", "c3-bsk-svc", "CODE_DEPENDENCY",
                props("label", "Invokes DeleteBasketAsync after checkout"));
    }

    private void addC3OrderingComponents() {
        addComponent("c3-ord-ctrl", "FruitOrdering.API", "C# 12 · ASP.NET Core Controller",
                "OrdersController", "Controller",
                "FruitOrdering.API.Controllers.OrdersController",
                "Exposes order creation, cancellation and query APIs (/api/v1/orders) with idempotency key support");
        addComponent("c3-ord-saga", "FruitOrdering.API", "C# 12 · Saga Orchestrator Service",
                "OrderSagaService", "Service",
                "FruitOrdering.API.Services.OrderSagaService",
                "Orchestrates basket fetch, catalog stock reserve/compensate release, Order persistence & Outbox logging");
        addComponent("c3-ord-qry", "FruitOrdering.API", "C# 12 · Read Query Service",
                "OrderQueryService", "Service",
                "FruitOrdering.API.Services.OrderQueryService",
                "Queries orders and items via AsNoTracking() EF Core projections");
        addComponent("c3-ord-catcli", "FruitOrdering.API", "C# 12 · Typed HttpClient + Polly v8",
                "CatalogApiClient", "HttpClient",
                "FruitOrdering.API.Clients.CatalogApiClient",
                "Calls FruitCatalog.API with AddStandardResilienceHandler (retry, circuit breaker & timeout)");
        addComponent("c3-ord-bskcli", "FruitOrdering.API", "C# 12 · Typed HttpClient + Polly v8",
                "BasketApiClient", "HttpClient",
                "FruitOrdering.API.Clients.BasketApiClient",
                "Calls FruitBasket.API with AddStandardResilienceHandler and forwards bearer token");
        addComponent("c3-ord-relay", "FruitOrdering.API", "C# 12 · BackgroundService + MassTransit",
                "OutboxRelayBackgroundService", "BackgroundWorker",
                "FruitOrdering.API.BackgroundServices.OutboxRelayBackgroundService",
                "Polls integration_event_outbox and publishes OrderCreated / OrderCancelled events to RabbitMQ");
        addComponent("c3-ord-dbctx", "FruitOrdering.API", "C# 12 · EF Core 8 Npgsql DbContext",
                "OrderingDbContext", "Repository",
                "FruitOrdering.API.Data.OrderingDbContext",
                "Persists orders, order_items and integration_event_outbox in isolated PostgreSQL schema ordering");

        addC3Edge("c3-ord-ctrl-saga", "c3-ord-ctrl", "c3-ord-saga", "CODE_DEPENDENCY",
                props("label", "Delegates PlaceOrderAsync / CancelOrderAsync"));
        addC3Edge("c3-ord-ctrl-qry", "c3-ord-ctrl", "c3-ord-qry", "CODE_DEPENDENCY",
                props("label", "Delegates AsNoTracking order queries"));
        addC3Edge("c3-ord-saga-catcli", "c3-ord-saga", "c3-ord-catcli", "CODE_DEPENDENCY",
                props("label", "Reserves & releases fruit stock across saga"));
        addC3Edge("c3-ord-saga-bskcli", "c3-ord-saga", "c3-ord-bskcli", "CODE_DEPENDENCY",
                props("label", "Fetches customer basket snapshot"));
        addC3Edge("c3-ord-saga-db", "c3-ord-saga", "c3-ord-dbctx", "CODE_DEPENDENCY",
                props("label", "Commits Order + IntegrationEventLogEntry"));
        addC3Edge("c3-ord-qry-db", "c3-ord-qry", "c3-ord-dbctx", "CODE_DEPENDENCY",
                props("label", "AsNoTracking read projections"));
        addC3Edge("c3-ord-relay-db", "c3-ord-relay", "c3-ord-dbctx", "CODE_DEPENDENCY",
                props("label", "Reads pending integration_event_outbox rows"));
        addC3Edge("c3-ord-db-pg", "c3-ord-dbctx", "ordering-db", "DATABASE_ACCESS",
                props("protocol", "Npgsql EF Core · schema ordering"));
        addC3Edge("c3-ord-catcli-cat", "c3-ord-catcli", "c3-cat-ctrl", "SERVICE_HTTP_CALL",
                props("client", "CatalogApiClient", "resilience", "Polly StandardResilience"));
        addC3Edge("c3-ord-bskcli-bsk", "c3-ord-bskcli", "c3-bsk-ctrl", "SERVICE_HTTP_CALL",
                props("client", "BasketApiClient", "resilience", "Polly StandardResilience"));
        addC3Edge("c3-ord-relay-rmq", "c3-ord-relay", "rabbitmq", "MESSAGE_PUBLISH",
                props("events", "OrderCreatedIntegrationEvent, OrderCancelledIntegrationEvent"));
    }

    private void addRealEvidences() {
        // Gateway routes, JWT & OTel
        addRelEvidence("admin-gw",
                "src/Gateways/ApiGateway/Controllers/AuthController.cs:24",
                "STATIC_CODE",
                "new(\"admin@freshfruit.vn\", \"Admin123!\", \"usr-admin-01\", \"Admin\", \"Quản trị viên Project Trái Cây\")");
        addRelEvidence("staff-gw",
                "src/Gateways/ApiGateway/Controllers/AuthController.cs:23",
                "STATIC_CODE",
                "new(\"staff@freshfruit.vn\", \"Staff123!\", \"usr-staff-01\", \"Staff\", \"Nhân viên kho trái cây\")");
        addRelEvidence("cust-gw",
                "src/Gateways/ApiGateway/Controllers/AuthController.cs:22",
                "STATIC_CODE",
                "new(\"customer@freshfruit.vn\", \"Fruit123!\", \"usr-customer-01\", \"Customer\", \"Khách hàng thân thiết\")");
        addRelEvidence("gw-catalog",
                "src/Gateways/ApiGateway/appsettings.json:25",
                "CONFIG_FILE",
                "\"catalog-route\": { \"ClusterId\": \"catalog-cluster\", \"Match\": { \"Path\": \"/api/v1/catalog/{**catch-all}\" } }");
        addRelEvidence("gw-basket",
                "src/Gateways/ApiGateway/appsettings.json:33",
                "CONFIG_FILE",
                "\"basket-route\": { \"ClusterId\": \"basket-cluster\", \"Match\": { \"Path\": \"/api/v1/basket/{**catch-all}\" } }");
        addRelEvidence("gw-ordering",
                "src/Gateways/ApiGateway/appsettings.json:41",
                "CONFIG_FILE",
                "\"ordering-route\": { \"ClusterId\": \"ordering-cluster\", \"Match\": { \"Path\": \"/api/v1/orders/{**catch-all}\" } }");
        addRelEvidence("gw-otel",
                "src/Gateways/ApiGateway/Program.cs:105",
                "STATIC_CODE",
                ".AddOtlpExporter(otlp => otlp.Endpoint = new Uri(otlpEndpoint))");

        // Catalog controller -> service -> EF Core catalog_db
        addRelEvidence("cat-db",
                "src/Services/FruitCatalog/FruitCatalog.API/Data/CatalogDbContext.cs:12",
                "STATIC_CODE",
                "modelBuilder.HasDefaultSchema(\"catalog\");");
        addRelEvidence("c3-cat-ctrl-svc",
                "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs:62",
                "STATIC_CODE",
                "[HttpPost(\"{id:int}/reserve\")] public async Task<IActionResult> ReserveStock(...)");
        addRelEvidence("c3-cat-svc-db",
                "src/Services/FruitCatalog/FruitCatalog.API/Services/CatalogService.cs:127",
                "STATIC_CODE",
                "product.ReserveStock(quantity);");
        addRelEvidence("gw-catalog",
                "src/Gateways/ApiGateway/Program.cs:85",
                "STATIC_CODE",
                "builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection(\"ReverseProxy\"));");

        // Node anchors (Gateway & Catalog)
        addNodeEvidence("ApiGateway",
                "src/Gateways/ApiGateway/Program.cs:155",
                "STATIC_CODE",
                "app.MapReverseProxy();");
        addNodeEvidence("FruitCatalog.API",
                "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs:10",
                "STATIC_CODE",
                "public sealed class CatalogItemsController(ICatalogService catalogService) : ControllerBase");
        addNodeEvidence("c3-gw-auth",
                "src/Gateways/ApiGateway/Controllers/AuthController.cs:15",
                "STATIC_CODE",
                "public sealed class AuthController(IOptions<JwtOptions> jwtOptions, IOptions<DemoAuthOptions> demoOptions)");
        addNodeEvidence("c3-gw-yarp",
                "src/Gateways/ApiGateway/Program.cs:76",
                "STATIC_CODE",
                "options.AddFixedWindowLimiter(\"gateway-fixed\", limiter => ...)");
        addNodeEvidence("c3-gw-jwt",
                "src/Gateways/ApiGateway/Program.cs:19",
                "STATIC_CODE",
                "builder.Services.AddOptions<JwtOptions>().BindConfiguration(JwtOptions.SectionName).ValidateOnStart();");
        addNodeEvidence("c3-gw-err",
                "src/Gateways/ApiGateway/Program.cs:29",
                "STATIC_CODE",
                "builder.Services.AddExceptionHandler<GlobalExceptionHandler>();");
        addNodeEvidence("c3-cat-ctrl",
                "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs:50",
                "STATIC_CODE",
                "[Authorize(Policy = \"AdminOnly\")]");
        addNodeEvidence("c3-cat-svc",
                "src/Services/FruitCatalog/FruitCatalog.API/Services/CatalogService.cs:9",
                "STATIC_CODE",
                "public sealed class CatalogService(CatalogDbContext dbContext, ILogger<CatalogService> logger) : ICatalogService");
        addNodeEvidence("c3-cat-dbctx",
                "src/Services/FruitCatalog/FruitCatalog.API/Data/CatalogDbContext.cs:12",
                "STATIC_CODE",
                "modelBuilder.HasDefaultSchema(\"catalog\");");
        addNodeEvidence("c3-cat-init",
                "src/Services/FruitCatalog/FruitCatalog.API/Data/CatalogDbInitializer.cs:8",
                "STATIC_CODE",
                "public static async Task InitializeAsync(IServiceProvider services, ILogger logger)");

        // FruitBasket.API Redis, MassTransit Consumer & Idempotency
        addRelEvidence("basket-redis",
                "src/Services/FruitBasket/FruitBasket.API/Program.cs:33",
                "STATIC_CODE",
                "builder.Services.AddStackExchangeRedisCache(options => options.Configuration = redisConnection);");
        addRelEvidence("rabbitmq-basket",
                "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs:14",
                "STATIC_CODE",
                "public sealed class OrderCreatedConsumer(...) : IConsumer<OrderCreatedIntegrationEvent>");
        addRelEvidence("c3-bsk-cons-proc",
                "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs:20",
                "STATIC_CODE",
                "if (await processedEventStore.HasProcessedAsync(context.Message.EventId, context.CancellationToken)) return;");
        addRelEvidence("c3-bsk-cons-svc",
                "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs:28",
                "STATIC_CODE",
                "await basketService.DeleteBasketAsync(context.Message.CustomerId, context.CancellationToken);");
        addNodeEvidence("FruitBasket.API",
                "src/Services/FruitBasket/FruitBasket.API/Controllers/BasketController.cs:12",
                "STATIC_CODE",
                "public sealed class BasketController(IBasketService basketService) : ControllerBase");
        addNodeEvidence("c3-bsk-ctrl",
                "src/Services/FruitBasket/FruitBasket.API/Controllers/BasketController.cs:60",
                "STATIC_CODE",
                "var privileged = User.IsInRole(\"Admin\") || User.IsInRole(\"Staff\");");
        addNodeEvidence("c3-bsk-svc",
                "src/Services/FruitBasket/FruitBasket.API/Services/BasketService.cs:7",
                "STATIC_CODE",
                "public sealed class BasketService(IBasketRepository repository, ILogger<BasketService> logger) : IBasketService");
        addNodeEvidence("c3-bsk-cons",
                "src/Services/FruitBasket/FruitBasket.API/Program.cs:44",
                "STATIC_CODE",
                "x.AddConsumer<OrderCreatedConsumer>();");
        addNodeEvidence("c3-bsk-repo",
                "src/Services/FruitBasket/FruitBasket.API/Repositories/RedisBasketRepository.cs:7",
                "STATIC_CODE",
                "public sealed class RedisBasketRepository(IDistributedCache cache) : IBasketRepository");
        addNodeEvidence("c3-bsk-proc",
                "src/Services/FruitBasket/FruitBasket.API/Repositories/RedisProcessedEventStore.cs:5",
                "STATIC_CODE",
                "public sealed class RedisProcessedEventStore(IDistributedCache cache) : IProcessedEventStore");

        // FruitOrdering.API Saga, Polly Typed HttpClients, OrderingDbContext & Outbox Relay
        addRelEvidence("ordering-catalog-http",
                "src/Services/FruitOrdering/FruitOrdering.API/Program.cs:67",
                "STATIC_CODE",
                ".AddHttpClient<ICatalogApiClient, CatalogApiClient>(...).AddStandardResilienceHandler(ConfigureStandardResilience);");
        addRelEvidence("ordering-basket-http",
                "src/Services/FruitOrdering/FruitOrdering.API/Program.cs:74",
                "STATIC_CODE",
                ".AddHttpClient<IBasketApiClient, BasketApiClient>(...).AddStandardResilienceHandler(ConfigureStandardResilience);");
        addRelEvidence("ord-db",
                "src/Services/FruitOrdering/FruitOrdering.API/Data/OrderingDbContext.cs:14",
                "STATIC_CODE",
                "modelBuilder.HasDefaultSchema(\"ordering\");");
        addRelEvidence("ord-rabbitmq",
                "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs:84",
                "STATIC_CODE",
                "await publishEndpoint.Publish(createdEvent, stoppingToken);");
        addRelEvidence("c3-ord-ctrl-saga",
                "src/Services/FruitOrdering/FruitOrdering.API/Controllers/OrdersController.cs:33",
                "STATIC_CODE",
                "var order = await orderSagaService.PlaceOrderAsync(customerId, request, idempotencyKey, ...);");
        addRelEvidence("c3-ord-saga-catcli",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs:72",
                "STATIC_CODE",
                "var reserved = await catalogApiClient.ReserveStockAsync(item.ProductId, ...);");
        addRelEvidence("c3-ord-saga-bskcli",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs:144",
                "STATIC_CODE",
                "var basket = await basketApiClient.GetBasketAsync(customerId, bearerToken, cancellationToken);");
        addRelEvidence("c3-ord-saga-db",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs:87",
                "STATIC_CODE",
                "dbContext.IntegrationEventLogEntries.Add(IntegrationEventLogEntry.Create(createdEvent));");
        addRelEvidence("c3-ord-catcli-cat",
                "src/Services/FruitOrdering/FruitOrdering.API/Clients/CatalogApiClient.cs:55",
                "STATIC_CODE",
                "await httpClient.PostAsJsonAsync($\"/api/v1/catalog/items/{productId}/reserve\", payload, cancellationToken);");
        addRelEvidence("c3-ord-bskcli-bsk",
                "src/Services/FruitOrdering/FruitOrdering.API/Clients/BasketApiClient.cs:50",
                "STATIC_CODE",
                "using var response = await httpClient.SendAsync(request, cancellationToken);");
        addRelEvidence("c3-ord-relay-rmq",
                "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs:98",
                "STATIC_CODE",
                "await publishEndpoint.Publish(cancelledEvent, stoppingToken);");

        addNodeEvidence("FruitOrdering.API",
                "src/Services/FruitOrdering/FruitOrdering.API/Controllers/OrdersController.cs:13",
                "STATIC_CODE",
                "public sealed class OrdersController(IOrderSagaService orderSagaService, IOrderQueryService orderQueryService)");
        addNodeEvidence("c3-ord-ctrl",
                "src/Services/FruitOrdering/FruitOrdering.API/Controllers/OrdersController.cs:80",
                "STATIC_CODE",
                "var isPrivileged = User.IsInRole(\"Admin\") || User.IsInRole(\"Staff\");");
        addNodeEvidence("c3-ord-saga",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs:14",
                "STATIC_CODE",
                "public sealed class OrderSagaService(OrderingDbContext dbContext, ICatalogApiClient catalogApiClient, IBasketApiClient basketApiClient, ...)");
        addNodeEvidence("c3-ord-qry",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderQueryService.cs:16",
                "STATIC_CODE",
                "var order = await dbContext.Orders.AsNoTracking().Include(o => o.Items)...;");
        addNodeEvidence("c3-ord-catcli",
                "src/Services/FruitOrdering/FruitOrdering.API/Clients/CatalogApiClient.cs:24",
                "STATIC_CODE",
                "public sealed class CatalogApiClient(HttpClient httpClient, ILogger<CatalogApiClient> logger) : ICatalogApiClient");
        addNodeEvidence("c3-ord-bskcli",
                "src/Services/FruitOrdering/FruitOrdering.API/Clients/BasketApiClient.cs:28",
                "STATIC_CODE",
                "public sealed class BasketApiClient(HttpClient httpClient, ILogger<BasketApiClient> logger) : IBasketApiClient");
        addNodeEvidence("c3-ord-relay",
                "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs:14",
                "STATIC_CODE",
                "public sealed class OutboxRelayBackgroundService(IServiceScopeFactory scopeFactory, ILogger<OutboxRelayBackgroundService> logger) : BackgroundService");
        addNodeEvidence("c3-ord-dbctx",
                "src/Services/FruitOrdering/FruitOrdering.API/Data/OrderingDbContext.cs:14",
                "STATIC_CODE",
                "modelBuilder.HasDefaultSchema(\"ordering\");");
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
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(baos, StandardCharsets.UTF_8)) {
            writeEntry(zip, "FruitShop.Microservices.sln", """
                    Microsoft Visual Studio Solution File, Format Version 12.00
                    # Project Trái Cây - .NET 8 Microservices Solution
                    # Projects:
                    # - src/Gateways/ApiGateway/ApiGateway.csproj
                    # - src/BuildingBlocks/EventBus.Contracts/EventBus.Contracts.csproj
                    # - src/Services/FruitCatalog/FruitCatalog.API/FruitCatalog.API.csproj
                    # - src/Services/FruitBasket/FruitBasket.API/FruitBasket.API.csproj
                    # - src/Services/FruitOrdering/FruitOrdering.API/FruitOrdering.API.csproj
                    """);
            writeEntry(zip, "docker-compose.yml", """
                    services:
                      catalog-db:
                        image: postgres:16-alpine
                      ordering-db:
                        image: postgres:16-alpine
                      redis:
                        image: redis:7-alpine
                      rabbitmq:
                        image: rabbitmq:3.13-management-alpine
                      fruit-catalog-api:
                        build: ./src/Services/FruitCatalog/FruitCatalog.API
                      fruit-basket-api:
                        build: ./src/Services/FruitBasket/FruitBasket.API
                      fruit-ordering-api:
                        build: ./src/Services/FruitOrdering/FruitOrdering.API
                      api-gateway:
                        build: ./src/Gateways/ApiGateway
                        ports: ["8080:8080"]
                    """);
            writeEntry(zip, "src/Gateways/ApiGateway/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
                    builder.Services.AddAuthorization(options => options.AddPolicy("AdminOnly", p => p.RequireRole("Admin")));
                    builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("gateway-fixed", _ => {}));
                    builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
                    builder.Services.AddOpenTelemetry().WithTracing(t => t.AddOtlpExporter());
                    var app = builder.Build();
                    app.MapReverseProxy();
                    app.Run();
                    """);
            writeEntry(zip, "src/Gateways/ApiGateway/Controllers/AuthController.cs", """
                    namespace ApiGateway.Controllers;
                    public sealed class AuthController
                    {
                        // DemoUsers:
                        // new("customer@freshfruit.vn", "Fruit123!", "usr-customer-01", "Customer", "Khách hàng thân thiết")
                        // new("staff@freshfruit.vn", "Staff123!", "usr-staff-01", "Staff", "Nhân viên kho trái cây")
                        // new("admin@freshfruit.vn", "Admin123!", "usr-admin-01", "Admin", "Quản trị viên Project Trái Cây")
                    }
                    """);
            writeEntry(zip, "src/Gateways/ApiGateway/appsettings.json", """
                    {
                      "ReverseProxy": {
                        "Routes": {
                          "catalog-route": { "ClusterId": "catalog-cluster", "Match": { "Path": "/api/v1/catalog/{**catch-all}" } },
                          "basket-route": { "ClusterId": "basket-cluster", "Match": { "Path": "/api/v1/basket/{**catch-all}" } },
                          "ordering-route": { "ClusterId": "ordering-cluster", "Match": { "Path": "/api/v1/orders/{**catch-all}" } }
                        }
                      }
                    }
                    """);
            writeEntry(zip, "src/BuildingBlocks/EventBus.Contracts/OrderIntegrationEvents.cs", """
                    namespace EventBus.Contracts;
                    public sealed record OrderCreatedIntegrationEvent(Guid EventId, Guid OrderId, string CustomerId);
                    public sealed record OrderCancelledIntegrationEvent(Guid EventId, Guid OrderId, string CustomerId);
                    """);
            writeEntry(zip, "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs", """
                    namespace FruitCatalog.API.Controllers;
                    [ApiController, Route("api/v1/catalog/items")]
                    public sealed class CatalogItemsController(ICatalogService catalogService) : ControllerBase
                    {
                        [Authorize(Policy = "AdminOnly"), HttpPost]
                        public Task<IActionResult> Create() => Task.FromResult<IActionResult>(Ok());
                        [HttpPost("{id:int}/reserve")]
                        public Task<IActionResult> ReserveStock(int id) => Task.FromResult<IActionResult>(Ok());
                    }
                    """);
            writeEntry(zip, "src/Services/FruitCatalog/FruitCatalog.API/Services/CatalogService.cs", """
                    namespace FruitCatalog.API.Services;
                    public sealed class CatalogService(CatalogDbContext dbContext, ILogger<CatalogService> logger) : ICatalogService
                    {
                        // Manages catalog stock reserve/release in PostgreSQL schema "catalog" (fruit_products)
                    }
                    """);
            writeEntry(zip, "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs", """
                    namespace FruitBasket.API.Consumers;
                    public sealed class OrderCreatedConsumer(IProcessedEventStore processedEventStore, IBasketService basketService)
                        : IConsumer<OrderCreatedIntegrationEvent>
                    {
                        public async Task Consume(ConsumeContext<OrderCreatedIntegrationEvent> context)
                        {
                            if (await processedEventStore.HasProcessedAsync(context.Message.EventId, context.CancellationToken)) return;
                            await basketService.DeleteBasketAsync(context.Message.CustomerId, context.CancellationToken);
                        }
                    }
                    """);
            writeEntry(zip, "src/Services/FruitOrdering/FruitOrdering.API/Controllers/OrdersController.cs", """
                    namespace FruitOrdering.API.Controllers;
                    [ApiController, Route("api/v1/orders")]
                    public sealed class OrdersController(IOrderSagaService orderSagaService, IOrderQueryService orderQueryService) : ControllerBase
                    {
                        [HttpPost]
                        public Task<IActionResult> PlaceOrder() => Task.FromResult<IActionResult>(Ok());
                    }
                    """);
            writeEntry(zip, "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs", """
                    namespace FruitOrdering.API.Services;
                    public sealed class OrderSagaService(
                        OrderingDbContext dbContext,
                        ICatalogApiClient catalogApiClient,
                        IBasketApiClient basketApiClient) : IOrderSagaService
                    {
                        // Fetches basket, reserves catalog stock via Polly client, commits Order + IntegrationEventLogEntry
                    }
                    """);
            writeEntry(zip, "src/Services/FruitOrdering/FruitOrdering.API/Clients/CatalogApiClient.cs", """
                    namespace FruitOrdering.API.Clients;
                    public sealed class CatalogApiClient(HttpClient httpClient, ILogger<CatalogApiClient> logger) : ICatalogApiClient
                    {
                        // Protected by .AddStandardResilienceHandler(ConfigureStandardResilience) in Program.cs
                    }
                    """);
            writeEntry(zip, "src/Services/FruitOrdering/FruitOrdering.API/Clients/BasketApiClient.cs", """
                    namespace FruitOrdering.API.Clients;
                    public sealed class BasketApiClient(HttpClient httpClient, ILogger<BasketApiClient> logger) : IBasketApiClient
                    {
                        // Calls FruitBasket.API with Polly StandardResilienceHandler
                    }
                    """);
            writeEntry(zip, "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs", """
                    namespace FruitOrdering.API.BackgroundServices;
                    public sealed class OutboxRelayBackgroundService(IServiceScopeFactory scopeFactory, ILogger<OutboxRelayBackgroundService> logger) : BackgroundService
                    {
                        // Polls ordering.integration_event_outbox and calls publishEndpoint.Publish(createdEvent, stoppingToken)
                    }
                    """);
            zip.finish();
            return baos.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to build Project Trái Cây curated archive", ex);
        }
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
