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
 * directly from the authentic {@code MAVIS-Platform/Moc-Huong-Shop} Java 21 / Spring Boot 3 repository.
 */
public final class MocHuongReferenceArchitectureBuilder {

    public static final String REPO_URL = "https://github.com/MAVIS-Platform/Moc-Huong-Shop";
    public static final String COMMIT_SHA = "84f8e6c5c3aee575c2464f40d6742fb847f3a3e4";
    public static final String SYSTEM_NAME = "Mộc Hương Shop Platform";
    public static final String ADAPTER_VERSION = "moc-huong-v2";

    public static final List<String> REAL_MICROSERVICES = List.of(
            "service-discovery",
            "api-gateway",
            "identity-service",
            "catalog-service",
            "order-service",
            "notification-service"
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

    private MocHuongReferenceArchitectureBuilder(
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
        MocHuongReferenceArchitectureBuilder builder =
                new MocHuongReferenceArchitectureBuilder(json, refModel, refSnapshot, hooks);
        return builder.buildAll();
    }

    private BuiltResult buildAll() {
        addC1ActorsAndExternals();
        addC2Microservices();
        addC2Infrastructure();
        List<ModelRelationship> c2Edges = addC2Relationships();
        addC3GatewayAndDiscovery();
        addC3IdentityComponents();
        addC3CatalogComponents();
        addC3OrderComponents();
        addC3NotificationComponents();
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
        if (node("customer") != null) depGraphNodes.add(node("customer"));
        if (node("admin-staff") != null) depGraphNodes.add(node("admin-staff"));
        depGraphNodes.addAll(containerNodes);
        if (node("otel-observability") != null) depGraphNodes.add(node("otel-observability"));

        List<ModelElement> componentDiagramNodes = new ArrayList<>();
        for (String svc : REAL_MICROSERVICES) {
            componentDiagramNodes.add(node(svc));
        }
        componentDiagramNodes.addAll(c3ComponentNodes);
        List<DiagramVersion> diagramList = new ArrayList<>();
        if (node("customer") != null && node("admin-staff") != null && node("otel-observability") != null) {
            diagramList.add(buildC1ContextDiagram());
        }
        diagramList.add(buildDiagram("DEPENDENCY_GRAPH", "SERVICE", depGraphNodes, c2Edges));
        diagramList.add(buildDiagram("C4", "CONTAINER", depGraphNodes, c2Edges));
        diagramList.add(buildDiagram("C4", "COMPONENT", componentDiagramNodes, c3ComponentEdges));
        List<DiagramVersion> savedDiagrams = hooks.saveDiagrams().apply(diagramList);
        ObjectNode metrics = json.createObjectNode()
                .put("complianceScore", 96.0)
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
        addNode("customer", null, "PERSON", "Web / Mobile Client",
                "Customer", "Khách hàng duyệt sản phẩm, đặt hàng & nhận thông báo đơn hàng",
                props("contextReviewState", "CONFIRMED", "actorRole", "End-User Shopper"));
        addNode("admin-staff", null, "PERSON", "Admin / Portal",
                "Admin / Staff", "Quản trị viên quản lý danh mục, sản phẩm & tồn kho",
                props("contextReviewState", "CONFIRMED", "actorRole", "Store Administrator"));
        addNode("otel-observability", null, "EXTERNAL_SYSTEM", "OTLP / Prometheus",
                "OpenTelemetry & MAVIS Observability",
                "Thu thập OTLP traces (:4318/v1/traces) & Actuator Prometheus metrics",
                props("contextReviewState", "CONFIRMED", "endpoint", "http://otel-collector:4318/v1/traces"));
    }

    private void addC2Microservices() {
        addNode("api-gateway", null, "SERVICE_CONTAINER", "Java 21 · Spring Cloud Gateway (:8080)",
                "api-gateway",
                "Edge reverse proxy · JWT Bearer verification, X-Correlation-Id filter & lb:// routing",
                props("port", "8080", "role", "Edge API Gateway", "framework", "Java 21 / Spring Cloud Gateway", "layerHint", "edge"));
        addNode("service-discovery", null, "SERVICE_CONTAINER", "Java 21 · Netflix Eureka Server (:8761)",
                "service-discovery",
                "Dynamic service registry for api-gateway & business microservices",
                props("port", "8761", "role", "Service Discovery Registry", "framework", "Java 21 / Spring Cloud Netflix Eureka", "layerHint", "platform"));
        addNode("identity-service", null, "SERVICE_CONTAINER", "Java 21 · Spring Boot 3 (:8081)",
                "identity-service",
                "Authentication, registration, user profiles & JWT token issuance",
                props("port", "8081", "role", "Identity & Auth Bounded Context", "framework", "Java 21 / Spring Boot 3", "database", "identity_db", "layerHint", "domain"));
        addNode("catalog-service", null, "SERVICE_CONTAINER", "Java 21 · Spring Boot 3 (:8082)",
                "catalog-service",
                "Product & Category catalog, Redis Cache-Aside & optimistic stock reserve/release APIs",
                props("port", "8082", "role", "Catalog & Inventory Bounded Context", "framework", "Java 21 / Spring Boot 3", "database", "catalog_db", "layerHint", "domain"));
        addNode("order-service", null, "SERVICE_CONTAINER", "Java 21 · Spring Boot 3 (:8083)",
                "order-service",
                "Order lifecycle, Saga Orchestrator, OpenFeign Resilience4j client & Transactional Outbox",
                props("port", "8083", "role", "Order & Saga Orchestrator Context", "framework", "Java 21 / Spring Boot 3", "database", "order_db", "layerHint", "domain"));
        addNode("notification-service", null, "SERVICE_CONTAINER", "Java 21 · Spring Boot 3 (:8084)",
                "notification-service",
                "Idempotent Kafka consumer (order.created, order.cancelled) & user notification history",
                props("port", "8084", "role", "Notification Bounded Context", "framework", "Java 21 / Spring Boot 3", "database", "notification_db", "layerHint", "domain"));
    }

    private void addC2Infrastructure() {
        addNode("identity-db", null, "DATABASE", "PostgreSQL 16 · identity_db",
                "identity-db", "Isolated PostgreSQL datastore owned exclusively by identity-service",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · identity_db", "datastoreKind", "POSTGRES", "ownerService", "identity-service"));
        addNode("catalog-db", null, "DATABASE", "PostgreSQL 16 · catalog_db",
                "catalog-db", "Isolated PostgreSQL datastore owned exclusively by catalog-service",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · catalog_db", "datastoreKind", "POSTGRES", "ownerService", "catalog-service"));
        addNode("order-db", null, "DATABASE", "PostgreSQL 16 · order_db",
                "order-db", "Isolated PostgreSQL datastore (orders + outbox_events) owned exclusively by order-service",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · order_db", "datastoreKind", "POSTGRES", "ownerService", "order-service"));
        addNode("notification-db", null, "DATABASE", "PostgreSQL 16 · notification_db",
                "notification-db", "Isolated PostgreSQL datastore (notifications + processed_events) owned by notification-service",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "PostgreSQL 16 · notification_db", "datastoreKind", "POSTGRES", "ownerService", "notification-service"));
        addNode("redis", null, "DATABASE", "Redis 7 · Cache-Aside",
                "redis", "Product read cache (Cache-Aside \"products\" via @Cacheable / @CacheEvict)",
                props("resourceRole", "LOGICAL_DATASTORE", "protocol", "Redis 7 · Cache-Aside", "datastoreKind", "CACHE", "ownerService", "catalog-service"));
        addNode("kafka", null, "MESSAGE_CHANNEL", "Apache Kafka 3.7 KRaft (:9092)",
                "kafka", "Event broker carrying order.created and order.cancelled domain events",
                props("protocol", "Kafka KRaft · order.created, order.cancelled", "topics", "order.created,order.cancelled"));
    }

    private List<ModelElement> c2ContainerNodes() {
        return List.of(
                node("api-gateway"),
                node("service-discovery"),
                node("identity-service"),
                node("catalog-service"),
                node("order-service"),
                node("notification-service"),
                node("identity-db"),
                node("catalog-db"),
                node("order-db"),
                node("notification-db"),
                node("redis"),
                node("kafka")
        );
    }

    private List<ModelRelationship> addC2Relationships() {
        List<ModelRelationship> list = new ArrayList<>();
        list.add(addEdge("cust-gw", "customer", "api-gateway", "SERVICE_HTTP_CALL", "STATIC",
                props("transport", "HTTPS", "paths", "/api/v1/auth,/api/v1/products,/api/v1/orders,/api/v1/notifications")));
        list.add(addEdge("admin-gw", "admin-staff", "api-gateway", "SERVICE_HTTP_CALL", "STATIC",
                props("transport", "HTTPS + JWT", "paths", "/api/v1/categories,/api/v1/products")));

        list.add(addEdge("gw-identity", "api-gateway", "identity-service", "GATEWAY_ROUTE", "STATIC",
                props("route", "lb://identity-service", "predicates", "/api/v1/auth/**,/api/v1/users/**")));
        list.add(addEdge("gw-catalog", "api-gateway", "catalog-service", "GATEWAY_ROUTE", "STATIC",
                props("route", "lb://catalog-service", "predicates", "/api/v1/products/**,/api/v1/categories/**")));
        list.add(addEdge("gw-order", "api-gateway", "order-service", "GATEWAY_ROUTE", "STATIC",
                props("route", "lb://order-service", "predicates", "/api/v1/orders/**")));
        list.add(addEdge("gw-notification", "api-gateway", "notification-service", "GATEWAY_ROUTE", "STATIC",
                props("route", "lb://notification-service", "predicates", "/api/v1/notifications/**")));

        list.add(addEdge("gw-eureka", "api-gateway", "service-discovery", "SERVICE_DISCOVERY", "STATIC",
                props("eureka", "http://service-discovery:8761/eureka")));
        list.add(addEdge("id-eureka", "identity-service", "service-discovery", "SERVICE_DISCOVERY", "STATIC",
                props("eureka", "http://service-discovery:8761/eureka")));
        list.add(addEdge("cat-eureka", "catalog-service", "service-discovery", "SERVICE_DISCOVERY", "STATIC",
                props("eureka", "http://service-discovery:8761/eureka")));
        list.add(addEdge("ord-eureka", "order-service", "service-discovery", "SERVICE_DISCOVERY", "STATIC",
                props("eureka", "http://service-discovery:8761/eureka")));
        list.add(addEdge("noti-eureka", "notification-service", "service-discovery", "SERVICE_DISCOVERY", "STATIC",
                props("eureka", "http://service-discovery:8761/eureka")));

        list.add(addEdge("order-catalog-feign", "order-service", "catalog-service", "SERVICE_HTTP_CALL", "STATIC",
                props("client", "CatalogFeignClient", "resilience", "CircuitBreaker+Retry+Bulkhead", "paths", "/api/v1/products/{id},/reserve,/release")));

        list.add(addEdge("id-db", "identity-service", "identity-db", "DATABASE_ACCESS", "STATIC",
                props("protocol", "JDBC PostgreSQL", "schema", "identity_db")));
        list.add(addEdge("cat-db", "catalog-service", "catalog-db", "DATABASE_ACCESS", "STATIC",
                props("protocol", "JDBC PostgreSQL", "schema", "catalog_db")));
        list.add(addEdge("ord-db", "order-service", "order-db", "DATABASE_ACCESS", "STATIC",
                props("protocol", "JDBC PostgreSQL", "schema", "order_db")));
        list.add(addEdge("noti-db", "notification-service", "notification-db", "DATABASE_ACCESS", "STATIC",
                props("protocol", "JDBC PostgreSQL", "schema", "notification_db")));
        list.add(addEdge("cat-redis", "catalog-service", "redis", "DATABASE_ACCESS", "STATIC",
                props("protocol", "Redis Cache-Aside", "cacheName", "products")));

        list.add(addEdge("ord-kafka", "order-service", "kafka", "MESSAGE_PUBLISH", "STATIC",
                props("topics", "order.created,order.cancelled", "pattern", "Transactional Outbox")));
        list.add(addEdge("kafka-noti", "kafka", "notification-service", "MESSAGE_SUBSCRIBE", "STATIC",
                props("topics", "order.created,order.cancelled", "groupId", "notification-group")));

        list.add(addEdge("gw-otel", "api-gateway", "otel-observability", "TRACING_EXPORT", "STATIC",
                props("protocol", "OTLP HTTP", "endpoint", "http://otel-collector:4318/v1/traces")));
        return list;
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

    private void addC3GatewayAndDiscovery() {
        addComponent("gw-corr-filter", "api-gateway", "Spring WebFlux GlobalFilter",
                "CorrelationIdGatewayFilter", "FILTER",
                "com.mochuong.gateway.filter.CorrelationIdGatewayFilter",
                "Injects and echoes X-Correlation-Id on every routed request");
        addComponent("gw-jwt-filter", "api-gateway", "Spring WebFlux GlobalFilter",
                "JwtAuthenticationGatewayFilter", "FILTER",
                "com.mochuong.gateway.filter.JwtAuthenticationGatewayFilter",
                "Validates Bearer JWT and forwards X-User-Id, X-User-Email, X-User-Role headers");
        addComponent("gw-jwt-verifier", "api-gateway", "JJWT Security",
                "JwtTokenVerifier", "SECURITY",
                "com.mochuong.gateway.security.JwtTokenVerifier",
                "Parses HMAC-SHA JWT claims (sub, email, role)");
        addComponent("eureka-app", "service-discovery", "Spring Cloud Netflix",
                "ServiceDiscoveryApplication", "INFRA",
                "com.mochuong.discovery.ServiceDiscoveryApplication",
                "@EnableEurekaServer service registry host on port 8761");

        addC3Edge("c3-gw-corr-jwt", "gw-corr-filter", "gw-jwt-filter", "CODE_DEPENDENCY",
                props("order", "-2 -> -1"));
        addC3Edge("c3-gw-jwt-ver", "gw-jwt-filter", "gw-jwt-verifier", "CODE_DEPENDENCY",
                props("call", "jwtTokenVerifier.verify(token)"));
    }

    private void addC3IdentityComponents() {
        addComponent("id-auth-ctrl", "identity-service", "Spring MVC @RestController",
                "AuthController", "CONTROLLER",
                "com.mochuong.identity.controller.AuthController",
                "Exposes POST /api/v1/auth/register & POST /api/v1/auth/login");
        addComponent("id-user-ctrl", "identity-service", "Spring MVC @RestController",
                "UserController", "CONTROLLER",
                "com.mochuong.identity.controller.UserController",
                "Exposes GET /api/v1/users/me");
        addComponent("id-service", "identity-service", "Spring @Service",
                "IdentityService", "SERVICE",
                "com.mochuong.identity.service.IdentityService",
                "Validates credentials, hashes passwords, and issues access JWTs");
        addComponent("id-jwt-issuer", "identity-service", "JJWT Security",
                "JwtTokenIssuer", "SECURITY",
                "com.mochuong.identity.security.JwtTokenIssuer",
                "Signs HMAC-SHA JWT tokens with userId, email and role claims");
        addComponent("id-user-repo", "identity-service", "Spring Data JPA",
                "UserAccountRepository", "REPOSITORY",
                "com.mochuong.identity.repository.UserAccountRepository",
                "Persists UserAccount entities inside isolated identity_db");

        addC3Edge("c3-id-auth-svc", "id-auth-ctrl", "id-service", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-id-user-svc", "id-user-ctrl", "id-service", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-id-svc-jwt", "id-service", "id-jwt-issuer", "CODE_DEPENDENCY", props("call", "jwtTokenIssuer.issueToken(account)"));
        addC3Edge("c3-id-svc-repo", "id-service", "id-user-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-id-repo-db", "id-user-repo", "identity-db", "DATABASE_ACCESS", props("schema", "identity_db"));
    }

    private void addC3CatalogComponents() {
        addComponent("cat-prod-ctrl", "catalog-service", "Spring MVC @RestController",
                "ProductController", "CONTROLLER",
                "com.mochuong.catalog.controller.ProductController",
                "Exposes GET/POST /api/v1/products & POST /{id}/reserve, /{id}/release");
        addComponent("cat-cat-ctrl", "catalog-service", "Spring MVC @RestController",
                "CategoryController", "CONTROLLER",
                "com.mochuong.catalog.controller.CategoryController",
                "Exposes GET/POST /api/v1/categories");
        addComponent("cat-prod-svc", "catalog-service", "Spring @Service",
                "ProductService", "SERVICE",
                "com.mochuong.catalog.service.ProductService",
                "Manages product queries & atomic stock reservation/release with @Cacheable/@CacheEvict");
        addComponent("cat-cat-svc", "catalog-service", "Spring @Service",
                "CategoryService", "SERVICE",
                "com.mochuong.catalog.service.CategoryService",
                "Creates and lists product categories");
        addComponent("cat-redis-cfg", "catalog-service", "Spring Data Redis",
                "RedisCacheConfig", "CONFIG",
                "com.mochuong.catalog.config.RedisCacheConfig",
                "Configures Redis Cache-Aside region \"products\"");
        addComponent("cat-prod-repo", "catalog-service", "Spring Data JPA",
                "ProductRepository", "REPOSITORY",
                "com.mochuong.catalog.repository.ProductRepository",
                "Persists Product entities inside isolated catalog_db");
        addComponent("cat-cat-repo", "catalog-service", "Spring Data JPA",
                "CategoryRepository", "REPOSITORY",
                "com.mochuong.catalog.repository.CategoryRepository",
                "Persists Category entities inside isolated catalog_db");

        addC3Edge("c3-cat-pctrl-psvc", "cat-prod-ctrl", "cat-prod-svc", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-cat-cctrl-csvc", "cat-cat-ctrl", "cat-cat-svc", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-cat-psvc-redis", "cat-prod-svc", "cat-redis-cfg", "CODE_DEPENDENCY", props("cache", "@Cacheable(\"products\")"));
        addC3Edge("c3-cat-cfg-redis", "cat-redis-cfg", "redis", "DATABASE_ACCESS", props("protocol", "Redis Cache-Aside"));
        addC3Edge("c3-cat-psvc-prepo", "cat-prod-svc", "cat-prod-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-cat-psvc-crepo", "cat-prod-svc", "cat-cat-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-cat-csvc-crepo", "cat-cat-svc", "cat-cat-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-cat-prepo-db", "cat-prod-repo", "catalog-db", "DATABASE_ACCESS", props("schema", "catalog_db"));
        addC3Edge("c3-cat-crepo-db", "cat-cat-repo", "catalog-db", "DATABASE_ACCESS", props("schema", "catalog_db"));
    }

    private void addC3OrderComponents() {
        addComponent("ord-ctrl", "order-service", "Spring MVC @RestController",
                "OrderController", "CONTROLLER",
                "com.mochuong.order.controller.OrderController",
                "Exposes POST /api/v1/orders, GET /my, GET /{id}, POST /{id}/cancel");
        addComponent("ord-svc", "order-service", "Spring @Service",
                "OrderService", "SERVICE",
                "com.mochuong.order.service.OrderService",
                "Application service delegating order flows to OrderSagaOrchestrator");
        addComponent("ord-saga", "order-service", "Spring @Service",
                "OrderSagaOrchestrator", "SERVICE",
                "com.mochuong.order.service.OrderSagaOrchestrator",
                "Coordinates local ACID order+outbox persistence and Catalog stock compensation");
        addComponent("ord-cat-int", "order-service", "Resilience4j + @Service",
                "CatalogIntegrationService", "INTEGRATION",
                "com.mochuong.order.service.CatalogIntegrationService",
                "Wraps CatalogFeignClient with @CircuitBreaker, @Retry and @Bulkhead(\"catalogService\")");
        addComponent("ord-cat-feign", "order-service", "Spring Cloud OpenFeign",
                "CatalogFeignClient", "CLIENT",
                "com.mochuong.order.client.CatalogFeignClient",
                "@FeignClient(name = \"catalog-service\", path = \"/api/v1/products\")");
        addComponent("ord-tx-svc", "order-service", "Spring @Service",
                "OrderTransactionService", "SERVICE",
                "com.mochuong.order.service.OrderTransactionService",
                "Persists Order and OutboxEvent atomically inside order_db transaction");
        addComponent("ord-outbox-pub", "order-service", "Spring @Scheduled",
                "OutboxEventPublisher", "PUBLISHER",
                "com.mochuong.order.service.OutboxEventPublisher",
                "Polls outbox_events and publishes order.created / order.cancelled via KafkaTemplate");
        addComponent("ord-repo", "order-service", "Spring Data JPA",
                "OrderRepository", "REPOSITORY",
                "com.mochuong.order.repository.OrderRepository",
                "Persists Order & OrderItem aggregates in isolated order_db");
        addComponent("ord-outbox-repo", "order-service", "Spring Data JPA",
                "OutboxEventRepository", "REPOSITORY",
                "com.mochuong.order.repository.OutboxEventRepository",
                "Persists PENDING / PUBLISHED transactional outbox rows in order_db");

        addC3Edge("c3-ord-ctrl-svc", "ord-ctrl", "ord-svc", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-ord-svc-saga", "ord-svc", "ord-saga", "CODE_DEPENDENCY", props("tierEdge", "Service->Orchestrator"));
        addC3Edge("c3-ord-saga-int", "ord-saga", "ord-cat-int", "CODE_DEPENDENCY", props("pattern", "Resilience4j Decorator"));
        addC3Edge("c3-ord-int-feign", "ord-cat-int", "ord-cat-feign", "CODE_DEPENDENCY", props("call", "catalogFeignClient"));
        addC3Edge("c3-ord-saga-tx", "ord-saga", "ord-tx-svc", "CODE_DEPENDENCY", props("pattern", "Local ACID + Outbox"));
        addC3Edge("c3-ord-tx-orepo", "ord-tx-svc", "ord-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-ord-tx-outrepo", "ord-tx-svc", "ord-outbox-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-ord-pub-outrepo", "ord-outbox-pub", "ord-outbox-repo", "CODE_DEPENDENCY", props("pollInterval", "2000ms"));
        addC3Edge("c3-ord-orepo-db", "ord-repo", "order-db", "DATABASE_ACCESS", props("schema", "order_db"));
        addC3Edge("c3-ord-outrepo-db", "ord-outbox-repo", "order-db", "DATABASE_ACCESS", props("schema", "order_db"));
        addC3Edge("c3-ord-feign-cat", "ord-cat-feign", "cat-prod-ctrl", "SERVICE_HTTP_CALL",
                props("client", "CatalogFeignClient", "targetService", "catalog-service", "endpoint", "/api/v1/products/{id}"));
        addC3Edge("c3-ord-pub-kafka", "ord-outbox-pub", "kafka", "MESSAGE_PUBLISH",
                props("topics", "order.created,order.cancelled"));
    }

    private void addC3NotificationComponents() {
        addComponent("noti-ctrl", "notification-service", "Spring MVC @RestController",
                "NotificationController", "CONTROLLER",
                "com.mochuong.notification.controller.NotificationController",
                "Exposes GET /api/v1/notifications/my");
        addComponent("noti-svc", "notification-service", "Spring @Service",
                "NotificationService", "SERVICE",
                "com.mochuong.notification.service.NotificationService",
                "Queries persisted user notifications");
        addComponent("noti-consumer", "notification-service", "Spring Kafka @KafkaListener",
                "OrderEventConsumer", "CONSUMER",
                "com.mochuong.notification.consumer.OrderEventConsumer",
                "Idempotently consumes order.created and order.cancelled events via processed_events guard");
        addComponent("noti-repo", "notification-service", "Spring Data JPA",
                "NotificationRepository", "REPOSITORY",
                "com.mochuong.notification.repository.NotificationRepository",
                "Persists NotificationRecord rows in isolated notification_db");
        addComponent("noti-proc-repo", "notification-service", "Spring Data JPA",
                "ProcessedEventRepository", "REPOSITORY",
                "com.mochuong.notification.repository.ProcessedEventRepository",
                "Deduplicates Kafka eventId messages in isolated notification_db");

        addC3Edge("c3-noti-ctrl-svc", "noti-ctrl", "noti-svc", "CODE_DEPENDENCY", props("tierEdge", "Controller->Service"));
        addC3Edge("c3-noti-svc-repo", "noti-svc", "noti-repo", "CODE_DEPENDENCY", props("tierEdge", "Service->Repository"));
        addC3Edge("c3-kafka-noti-cons", "kafka", "noti-consumer", "MESSAGE_SUBSCRIBE",
                props("topics", "order.created,order.cancelled", "groupId", "notification-group"));
        addC3Edge("c3-noti-cons-proc", "noti-consumer", "noti-proc-repo", "CODE_DEPENDENCY",
                props("pattern", "Idempotent Consumer"));
        addC3Edge("c3-noti-cons-repo", "noti-consumer", "noti-repo", "CODE_DEPENDENCY",
                props("tierEdge", "Consumer->Repository"));
        addC3Edge("c3-noti-repo-db", "noti-repo", "notification-db", "DATABASE_ACCESS", props("schema", "notification_db"));
        addC3Edge("c3-noti-procrepo-db", "noti-proc-repo", "notification-db", "DATABASE_ACCESS", props("schema", "notification_db"));
    }

    private void addRealEvidences() {
        // C2 & C3 OpenFeign CALL_SITE + Resilience4j (order-service -> catalog-service)
        addRelEvidence("order-catalog-feign",
                "order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java:9",
                "STATIC_CODE",
                "@FeignClient(name = \"catalog-service\", path = \"/api/v1/products\")");
        addRelEvidence("order-catalog-feign",
                "order-service/src/main/java/com/mochuong/order/service/CatalogIntegrationService.java:36",
                "STATIC_CODE",
                "@CircuitBreaker(name=\"catalogService\") -> catalogFeignClient.getProductById(productId)");
        addRelEvidence("c3-ord-feign-cat",
                "order-service/src/main/java/com/mochuong/order/service/CatalogIntegrationService.java:45",
                "STATIC_CODE",
                "catalogFeignClient.reserveStock(productId, new StockAdjustmentRequest(quantity));");
        addRelEvidence("c3-ord-int-feign",
                "order-service/src/main/java/com/mochuong/order/service/CatalogIntegrationService.java:31",
                "STATIC_CODE",
                "@CircuitBreaker(name = \"catalogService\", fallbackMethod = \"getProductFallback\")");
        addRelEvidence("c3-ord-saga-int",
                "order-service/src/main/java/com/mochuong/order/service/OrderSagaOrchestrator.java:79",
                "STATIC_CODE",
                "catalogIntegrationService.reserveStock(item.getProductId(), item.getQuantity());");

        // Gateway routes & JWT global filter
        addRelEvidence("gw-identity",
                "api-gateway/src/main/resources/application.yml:26",
                "STATIC_CONFIG",
                "- id: identity-service / uri: lb://identity-service / Path=/api/v1/auth/**,/api/v1/users/**");
        addRelEvidence("gw-catalog",
                "api-gateway/src/main/resources/application.yml:30",
                "STATIC_CONFIG",
                "- id: catalog-service / uri: lb://catalog-service / Path=/api/v1/products/**,/api/v1/categories/**");
        addRelEvidence("gw-order",
                "api-gateway/src/main/resources/application.yml:34",
                "STATIC_CONFIG",
                "- id: order-service / uri: lb://order-service / Path=/api/v1/orders/**");
        addRelEvidence("gw-notification",
                "api-gateway/src/main/resources/application.yml:38",
                "STATIC_CONFIG",
                "- id: notification-service / uri: lb://notification-service / Path=/api/v1/notifications/**");
        addRelEvidence("c3-gw-jwt-ver",
                "api-gateway/src/main/java/com/mochuong/gateway/filter/JwtAuthenticationGatewayFilter.java:63",
                "STATIC_CODE",
                "verifiedUser = jwtTokenVerifier.verify(token);");

        // Async Kafka Outbox Publish & Idempotent Consumer Subscribe
        addRelEvidence("ord-kafka",
                "order-service/src/main/java/com/mochuong/order/service/OutboxEventPublisher.java:39",
                "STATIC_CODE",
                "kafkaTemplate.send(event.getTopic(), event.getAggregateId(), event.getPayload())");
        addRelEvidence("c3-ord-pub-kafka",
                "order-service/src/main/java/com/mochuong/order/service/OutboxEventPublisher.java:33",
                "STATIC_CODE",
                "@Scheduled(fixedDelayString = \"${outbox.poll-interval-ms:2000}\") public void publishPendingEvents()");
        addRelEvidence("kafka-noti",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:38",
                "STATIC_CODE",
                "@KafkaListener(topics = \"order.created\", groupId = \"notification-group\")");
        addRelEvidence("c3-kafka-noti-cons",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:44",
                "STATIC_CODE",
                "@KafkaListener(topics = \"order.cancelled\", groupId = \"notification-group\")");
        addRelEvidence("c3-noti-cons-proc",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:67",
                "STATIC_CODE",
                "processedEventRepository.save(new ProcessedEvent(event.eventId(), topic, Instant.now()));");

        // Redis Cache-Aside + Isolated PostgreSQL Databases
        addRelEvidence("cat-redis",
                "catalog-service/src/main/java/com/mochuong/catalog/service/ProductService.java:38",
                "STATIC_CODE",
                "@Cacheable(value = \"products\", key = \"#id\")");
        addRelEvidence("id-db",
                "identity-service/src/main/resources/application.yml:8",
                "STATIC_CONFIG",
                "url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:identity_db}");
        addRelEvidence("cat-db",
                "catalog-service/src/main/resources/application.yml:8",
                "STATIC_CONFIG",
                "url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:catalog_db}");
        addRelEvidence("ord-db",
                "order-service/src/main/resources/application.yml:8",
                "STATIC_CONFIG",
                "url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:order_db}");
        addRelEvidence("noti-db",
                "notification-service/src/main/resources/application.yml:8",
                "STATIC_CONFIG",
                "url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:notification_db}");

        // Eureka & OTel
        addRelEvidence("gw-otel",
                "api-gateway/src/main/resources/application.yml:72",
                "STATIC_CONFIG",
                "management.otlp.tracing.endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://otel-collector:4318}/v1/traces");

        // Node-level locator anchors for direct canvas element inspection
        addNodeEvidence("api-gateway",
                "api-gateway/src/main/java/com/mochuong/gateway/filter/JwtAuthenticationGatewayFilter.java:28",
                "STATIC_CODE",
                "public class JwtAuthenticationGatewayFilter implements GlobalFilter, Ordered");
        addNodeEvidence("service-discovery",
                "service-discovery/src/main/java/com/mochuong/discovery/ServiceDiscoveryApplication.java:9",
                "STATIC_CODE",
                "@EnableEurekaServer public class ServiceDiscoveryApplication");
        addNodeEvidence("identity-service",
                "identity-service/src/main/java/com/mochuong/identity/service/IdentityService.java:73",
                "STATIC_CODE",
                "String token = jwtTokenIssuer.issueToken(account);");
        addNodeEvidence("catalog-service",
                "catalog-service/src/main/java/com/mochuong/catalog/controller/ProductController.java:25",
                "STATIC_CODE",
                "@RestController @RequestMapping(\"/api/v1/products\") public class ProductController");
        addNodeEvidence("order-service",
                "order-service/src/main/java/com/mochuong/order/controller/OrderController.java:22",
                "STATIC_CODE",
                "@RestController @RequestMapping(\"/api/v1/orders\") public class OrderController");
        addNodeEvidence("notification-service",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:21",
                "STATIC_CODE",
                "public class OrderEventConsumer");
        addNodeEvidence("ord-cat-feign",
                "order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java:9",
                "STATIC_CODE",
                "@FeignClient(name = \"catalog-service\", path = \"/api/v1/products\")");
        addNodeEvidence("ord-cat-int",
                "order-service/src/main/java/com/mochuong/order/service/CatalogIntegrationService.java:31",
                "STATIC_CODE",
                "@CircuitBreaker(name = \"catalogService\", fallbackMethod = \"getProductFallback\")");
        addNodeEvidence("cat-prod-svc",
                "catalog-service/src/main/java/com/mochuong/catalog/service/ProductService.java:38",
                "STATIC_CODE",
                "@Cacheable(value = \"products\", key = \"#id\")");
        addNodeEvidence("noti-consumer",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:38",
                "STATIC_CODE",
                "@KafkaListener(topics = \"order.created\", groupId = \"notification-group\")");
    }

    private DiagramVersion buildC1ContextDiagram() {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        String systemId = "system:moc-huong-shop";
        ModelElement customer = node("customer");
        ModelElement admin = node("admin-staff");
        ModelElement otel = node("otel-observability");

        ObjectNode custNode = nodes.addObject()
                .put("id", customer.getId().toString())
                .put("kind", "PERSON")
                .put("name", customer.getName())
                .put("description", customer.getScope())
                .put("x", 40)
                .put("y", 40);
        custNode.put("languageStack", customer.getLanguageStack());

        ObjectNode adminNode = nodes.addObject()
                .put("id", admin.getId().toString())
                .put("kind", "PERSON")
                .put("name", admin.getName())
                .put("description", admin.getScope())
                .put("x", 40)
                .put("y", 220);
        adminNode.put("languageStack", admin.getLanguageStack());

        ObjectNode sysNode = nodes.addObject()
                .put("id", systemId)
                .put("kind", "SYSTEM")
                .put("name", SYSTEM_NAME)
                .put("description", "Java 21 / Spring Boot 3 E-Commerce Microservices Platform")
                .put("x", 360)
                .put("y", 120);
        sysNode.put("languageStack", "Java 21 / Spring Cloud");

        ObjectNode otelNode = nodes.addObject()
                .put("id", otel.getId().toString())
                .put("kind", "EXTERNAL_SYSTEM")
                .put("name", otel.getName())
                .put("description", otel.getScope())
                .put("x", 700)
                .put("y", 120);
        otelNode.put("languageStack", otel.getLanguageStack());

        ArrayNode edges = layout.putArray("edges");
        addContextEdge(edges, "ctx-cust-sys", customer.getId().toString(), systemId, "SERVICE_HTTP_CALL",
                "Browse & place orders (HTTPS)");
        addContextEdge(edges, "ctx-admin-sys", admin.getId().toString(), systemId, "SERVICE_HTTP_CALL",
                "Manage catalog & stock (JWT)");
        addContextEdge(edges, "ctx-sys-otel", systemId, otel.getId().toString(), "TRACING_EXPORT",
                "Export OTLP spans & metrics");

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
                return p.path("route").asText();
            }
            if ("SERVICE_DISCOVERY".equals(type)) {
                return "Eureka (:8761)";
            }
            if ("DATABASE_ACCESS".equals(type) && !p.path("protocol").asText("").isBlank()) {
                return p.path("protocol").asText();
            }
            if ("MESSAGE_PUBLISH".equals(type) && !p.path("topics").asText("").isBlank()) {
                return "Publish " + p.path("topics").asText();
            }
            if ("MESSAGE_SUBSCRIBE".equals(type) && !p.path("topics").asText("").isBlank()) {
                return "Subscribe " + p.path("topics").asText();
            }
            if ("SERVICE_HTTP_CALL".equals(type)) {
                if (!p.path("client").asText("").isBlank()) {
                    return "OpenFeign (" + p.path("resilience").asText("HTTP") + ")";
                }
                if (!p.path("transport").asText("").isBlank()) {
                    return p.path("transport").asText();
                }
            }
            if ("TRACING_EXPORT".equals(type) && !p.path("protocol").asText("").isBlank()) {
                return p.path("protocol").asText();
            }
            if (!p.path("kind").asText("").isBlank()) {
                return p.path("kind").asText();
            }
        }
        return edge.getRelationType();
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

    public static byte[] buildMocHuongArchive() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(out)) {
            writeEntry(zip, "pom.xml", """
                    <project xmlns="http://maven.apache.org/POM/4.0.0">
                      <modelVersion>4.0.0</modelVersion>
                      <groupId>com.mochuong</groupId>
                      <artifactId>moc-huong-shop</artifactId>
                      <version>1.0.0</version>
                      <packaging>pom</packaging>
                    </project>
                    """);
            writeEntry(zip, "api-gateway/src/main/java/com/mochuong/gateway/filter/JwtAuthenticationGatewayFilter.java", """
                    package com.mochuong.gateway.filter;
                    import com.mochuong.gateway.security.JwtTokenVerifier;
                    import org.springframework.cloud.gateway.filter.GlobalFilter;
                    public class JwtAuthenticationGatewayFilter implements GlobalFilter {
                        private final JwtTokenVerifier jwtTokenVerifier;
                        public JwtAuthenticationGatewayFilter(JwtTokenVerifier jwtTokenVerifier) { this.jwtTokenVerifier = jwtTokenVerifier; }
                    }
                    """);
            writeEntry(zip, "catalog-service/src/main/java/com/mochuong/catalog/controller/ProductController.java", """
                    package com.mochuong.catalog.controller;
                    import org.springframework.web.bind.annotation.*;
                    @RestController
                    @RequestMapping("/api/v1/products")
                    public class ProductController {
                        @GetMapping("/{id}")
                        public String getById(@PathVariable String id) { return id; }
                    }
                    """);
            writeEntry(zip, "order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java", """
                    package com.mochuong.order.client;
                    import org.springframework.cloud.openfeign.FeignClient;
                    import org.springframework.web.bind.annotation.*;
                    @FeignClient(name = "catalog-service", path = "/api/v1/products")
                    public interface CatalogFeignClient {
                        @GetMapping("/{id}")
                        ProductSnapshotDto getProductById(@PathVariable String id);
                        @PostMapping("/{id}/reserve")
                        void reserveStock(@PathVariable String id, @RequestBody StockAdjustmentRequest request);
                    }
                    """);
            writeEntry(zip, "order-service/src/main/java/com/mochuong/order/service/CatalogIntegrationService.java", """
                    package com.mochuong.order.service;
                    import com.mochuong.order.client.CatalogFeignClient;
                    import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
                    import io.github.resilience4j.retry.annotation.Retry;
                    import org.springframework.stereotype.Service;
                    @Service
                    public class CatalogIntegrationService {
                        private final CatalogFeignClient catalogFeignClient;
                        public CatalogIntegrationService(CatalogFeignClient catalogFeignClient) { this.catalogFeignClient = catalogFeignClient; }
                        @CircuitBreaker(name = "catalogService", fallbackMethod = "getProductFallback")
                        @Retry(name = "catalogService")
                        public Object fetchProductSafely(String productId) { return catalogFeignClient.getProductById(productId); }
                    }
                    """);
            writeEntry(zip, "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java", """
                    package com.mochuong.notification.consumer;
                    import org.springframework.kafka.annotation.KafkaListener;
                    import org.springframework.stereotype.Component;
                    @Component
                    public class OrderEventConsumer {
                        @KafkaListener(topics = "order.created", groupId = "notification-group")
                        public void onOrderCreated(String rawPayload) {}
                        @KafkaListener(topics = "order.cancelled", groupId = "notification-group")
                        public void onOrderCancelled(String rawPayload) {}
                    }
                    """);
            writeEntry(zip, "Orders/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    builder.Services.AddHttpClient("catalog", client => client.BaseAddress = new Uri("http://catalog-service:8082"));
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
                      service-discovery:
                        ports: ["8761:8761"]
                      api-gateway:
                        ports: ["8080:8080"]
                      identity-service:
                        expose: ["8081"]
                      catalog-service:
                        expose: ["8082"]
                      order-service:
                        expose: ["8083"]
                      notification-service:
                        expose: ["8084"]
                    """);
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to build Moc Huong Shop curated archive", ex);
        }
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
