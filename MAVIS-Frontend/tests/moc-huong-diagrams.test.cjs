const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
process.chdir(root);

const compileTypeScript = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(
    compiled.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    filename,
  );
};
require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
const {
  deriveC4ContextModel,
  buildContextDiagramDrawioXml,
} = require("../src/features/architecture/diagram-projections.ts");
const {
  projectGraphModel,
  filterGraphCategories,
} = require("../src/features/architecture/graph-projection.ts");
const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
const { generateDrawio } = require("../src/lib/drawio/server.ts");

function buildMocHuongModel() {
  const rawNodes = [
    {
      id: "admin",
      name: "Admin",
      elementType: "PERSON",
      technology: "Admin Portal",
      description: "Quản trị viên quản lý tài khoản, phân quyền (ADMIN) & danh mục sản phẩm",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Quản trị tài khoản, phân quyền & danh mục [HTTPS]",
      },
    },
    {
      id: "staff",
      name: "Staff",
      elementType: "PERSON",
      technology: "Staff Portal",
      description: "Nhân viên xử lý đơn hàng & quản lý tồn kho (STAFF)",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Xử lý đơn hàng & quản lý tồn kho [HTTPS]",
      },
    },
    {
      id: "customer",
      name: "Customer",
      elementType: "PERSON",
      technology: "Web / Mobile Client",
      description: "Khách hàng duyệt sản phẩm, đặt hàng & theo dõi đơn (CUSTOMER)",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Duyệt sản phẩm, đặt hàng & theo dõi đơn [HTTPS]",
      },
    },
    {
      id: "otel-observability",
      name: "Observability Platform (OpenTelemetry)",
      elementType: "EXTERNAL_SYSTEM",
      technology: "OTLP / Prometheus",
      description: "Thu thập OTLP traces (:4318/v1/traces) & Actuator Prometheus metrics",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Xuất OTLP traces & metrics [HTTP/OTLP]",
      },
    },
    {
      id: "api-gateway",
      name: "api-gateway",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Spring Cloud Gateway (:8080)",
      description: "Edge reactive HTTP gateway routing, JWT filter & correlation IDs",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8080" },
    },
    {
      id: "service-discovery",
      name: "service-discovery",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Netflix Eureka Server (:8761)",
      description: "Service registry for gateway & OpenFeign load balancing",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8761" },
    },
    {
      id: "identity-service",
      name: "identity-service",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Spring Boot 3 (:8081)",
      description: "User registration, login, BCrypt hashing & HMAC-SHA256 JWT issuance",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8081", db: "identity_db" },
    },
    {
      id: "catalog-service",
      name: "catalog-service",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Spring Boot 3 (:8082)",
      description: "Product & Category CRUD, Redis Cache-Aside & stock reserve/release",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8082", db: "catalog_db", cache: "redis" },
    },
    {
      id: "order-service",
      name: "order-service",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Spring Boot 3 (:8083)",
      description: "Order placement, Saga orchestration, OpenFeign + Resilience4j & Outbox",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8083", db: "order_db" },
    },
    {
      id: "notification-service",
      name: "notification-service",
      elementType: "SERVICE_CONTAINER",
      technology: "Java 21 · Spring Boot 3 (:8084)",
      description: "Kafka consumer (order.created/order.cancelled) & idempotent inbox notifications",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8084", db: "notification_db" },
    },
    {
      id: "identity-db",
      name: "identity-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · identity_db",
      description: "Isolated Identity schema (user_accounts)",
      parentId: null,
      status: "VALIDATED",
      properties: { ownerService: "identity-service", schema: "identity_db" },
    },
    {
      id: "catalog-db",
      name: "catalog-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · catalog_db",
      description: "Isolated Catalog schema (categories, products)",
      parentId: null,
      status: "VALIDATED",
      properties: { ownerService: "catalog-service", schema: "catalog_db" },
    },
    {
      id: "order-db",
      name: "order-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · order_db",
      description: "Isolated Order schema (orders, order_items, outbox_events)",
      parentId: null,
      status: "VALIDATED",
      properties: { ownerService: "order-service", schema: "order_db" },
    },
    {
      id: "notification-db",
      name: "notification-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · notification_db",
      description: "Isolated Notification schema (notifications, processed_events)",
      parentId: null,
      status: "VALIDATED",
      properties: { ownerService: "notification-service", schema: "notification_db" },
    },
    {
      id: "redis",
      name: "redis",
      elementType: "DATABASE",
      technology: "Redis 7 · Cache-Aside",
      description: "Distributed Cache-Aside backing @Cacheable/@CacheEvict for Catalog",
      parentId: null,
      status: "VALIDATED",
      properties: { ownerService: "catalog-service", cacheRegion: "products" },
    },
    {
      id: "kafka",
      name: "kafka",
      elementType: "MESSAGE_CHANNEL",
      technology: "Apache Kafka 3.7 KRaft (:9092)",
      description: "Event backbone carrying topics order.created and order.cancelled",
      parentId: null,
      status: "VALIDATED",
      properties: { topics: "order.created,order.cancelled" },
    },
  ];

  const comp = (id, parentId, name, technology, tier) =>
    rawNodes.push({
      id,
      parentId,
      name,
      elementType: "COMPONENT",
      technology,
      description: `${parentId} · ${name}`,
      layer: "domain",
      status: "VALIDATED",
      evidence: [],
      properties: { tier },
    });

  // api-gateway & service-discovery
  comp("gw-corr-filter", "api-gateway", "CorrelationIdGatewayFilter", "Spring WebFlux GlobalFilter", "FILTER");
  comp("gw-jwt-filter", "api-gateway", "JwtAuthenticationGatewayFilter", "Spring WebFlux GlobalFilter", "FILTER");
  comp("gw-jwt-verifier", "api-gateway", "JwtTokenVerifier", "JJWT Security", "SECURITY");
  comp("eureka-app", "service-discovery", "ServiceDiscoveryApplication", "Spring Cloud Netflix", "INFRA");

  // identity-service
  comp("id-auth-ctrl", "identity-service", "AuthController", "Spring MVC @RestController", "CONTROLLER");
  comp("id-user-ctrl", "identity-service", "UserController", "Spring MVC @RestController", "CONTROLLER");
  comp("id-service", "identity-service", "IdentityService", "Spring @Service", "SERVICE");
  comp("id-jwt-issuer", "identity-service", "JwtTokenIssuer", "JJWT Security", "SECURITY");
  comp("id-pwd-cfg", "identity-service", "PasswordEncoderConfig", "Spring Security", "CONFIG");
  comp("id-seeder", "identity-service", "IdentityDataSeeder", "Spring ApplicationRunner", "CONFIG");
  comp("id-user-repo", "identity-service", "UserAccountRepository", "Spring Data JPA", "REPOSITORY");

  // catalog-service
  comp("cat-prod-ctrl", "catalog-service", "ProductController", "Spring MVC @RestController", "CONTROLLER");
  comp("cat-cat-ctrl", "catalog-service", "CategoryController", "Spring MVC @RestController", "CONTROLLER");
  comp("cat-prod-svc", "catalog-service", "ProductService", "Spring @Service", "SERVICE");
  comp("cat-cat-svc", "catalog-service", "CategoryService", "Spring @Service", "SERVICE");
  comp("cat-redis-cfg", "catalog-service", "RedisCacheConfig", "Spring Data Redis", "CONFIG");
  comp("cat-prod-repo", "catalog-service", "ProductRepository", "Spring Data JPA", "REPOSITORY");
  comp("cat-cat-repo", "catalog-service", "CategoryRepository", "Spring Data JPA", "REPOSITORY");

  // order-service
  comp("ord-ctrl", "order-service", "OrderController", "Spring MVC @RestController", "CONTROLLER");
  comp("ord-svc", "order-service", "OrderService", "Spring @Service", "SERVICE");
  comp("ord-saga", "order-service", "OrderSagaOrchestrator", "Spring @Service", "SERVICE");
  comp("ord-cat-int", "order-service", "CatalogIntegrationService", "Resilience4j + @Service", "INTEGRATION");
  comp("ord-cat-feign", "order-service", "CatalogFeignClient", "Spring Cloud OpenFeign", "CLIENT");
  comp("ord-tx-svc", "order-service", "OrderTransactionService", "Spring @Service", "SERVICE");
  comp("ord-outbox-pub", "order-service", "OutboxEventPublisher", "Spring @Scheduled", "PUBLISHER");
  comp("ord-repo", "order-service", "OrderRepository", "Spring Data JPA", "REPOSITORY");
  comp("ord-outbox-repo", "order-service", "OutboxEventRepository", "Spring Data JPA", "REPOSITORY");

  // notification-service
  comp("noti-ctrl", "notification-service", "NotificationController", "Spring MVC @RestController", "CONTROLLER");
  comp("noti-svc", "notification-service", "NotificationService", "Spring @Service", "SERVICE");
  comp("noti-consumer", "notification-service", "OrderEventConsumer", "Spring Kafka @KafkaListener", "CONSUMER");
  comp("noti-repo", "notification-service", "NotificationRepository", "Spring Data JPA", "REPOSITORY");
  comp("noti-proc-repo", "notification-service", "ProcessedEventRepository", "Spring Data JPA", "REPOSITORY");

  const rawEdges = [];
  const edge = (id, from, to, protocol, properties = {}) =>
    rawEdges.push({
      id,
      from,
      to,
      protocol,
      originLayer: "STATIC",
      direction: "DIRECTED",
      uncertain: false,
      evidence: [],
      properties,
    });

  // C1 & C2 edges
  edge("admin-gw", "admin", "api-gateway", "SERVICE_HTTP_CALL", { label: "HTTPS Admin" });
  edge("staff-gw", "staff", "api-gateway", "SERVICE_HTTP_CALL", { label: "HTTPS Staff" });
  edge("cust-gw", "customer", "api-gateway", "SERVICE_HTTP_CALL", { label: "HTTPS Client" });
  edge("gw-identity", "api-gateway", "identity-service", "GATEWAY_ROUTE", { route: "/api/v1/auth/**,/users/**" });
  edge("gw-catalog", "api-gateway", "catalog-service", "GATEWAY_ROUTE", { route: "/api/v1/products/**,/categories/**" });
  edge("gw-order", "api-gateway", "order-service", "GATEWAY_ROUTE", { route: "/api/v1/orders/**" });
  edge("gw-notification", "api-gateway", "notification-service", "GATEWAY_ROUTE", { route: "/api/v1/notifications/**" });
  edge("gw-eureka", "api-gateway", "service-discovery", "SERVICE_DISCOVERY", { label: "Eureka (:8761)" });
  edge("id-eureka", "identity-service", "service-discovery", "SERVICE_DISCOVERY", { label: "Eureka (:8761)" });
  edge("cat-eureka", "catalog-service", "service-discovery", "SERVICE_DISCOVERY", { label: "Eureka (:8761)" });
  edge("ord-eureka", "order-service", "service-discovery", "SERVICE_DISCOVERY", { label: "Eureka (:8761)" });
  edge("noti-eureka", "notification-service", "service-discovery", "SERVICE_DISCOVERY", { label: "Eureka (:8761)" });
  edge("order-catalog-feign", "order-service", "catalog-service", "SERVICE_HTTP_CALL", { client: "CatalogFeignClient" });
  edge("id-db", "identity-service", "identity-db", "DATABASE_ACCESS", { protocol: "JDBC PostgreSQL" });
  edge("cat-db", "catalog-service", "catalog-db", "DATABASE_ACCESS", { protocol: "JDBC PostgreSQL" });
  edge("ord-db", "order-service", "order-db", "DATABASE_ACCESS", { protocol: "JDBC PostgreSQL" });
  edge("noti-db", "notification-service", "notification-db", "DATABASE_ACCESS", { protocol: "JDBC PostgreSQL" });
  edge("cat-redis", "catalog-service", "redis", "DATABASE_ACCESS", { protocol: "Redis Cache-Aside" });
  edge("ord-kafka", "order-service", "kafka", "MESSAGE_PUBLISH", { topics: "order.created,order.cancelled" });
  edge("kafka-noti", "kafka", "notification-service", "MESSAGE_SUBSCRIBE", { topics: "order.created,order.cancelled" });
  edge("gw-otel", "api-gateway", "otel-observability", "TRACING_EXPORT", { protocol: "OTLP HTTP" });

  // C3 edges
  edge("c3-gw-corr-jwt", "gw-corr-filter", "gw-jwt-filter", "CODE_DEPENDENCY");
  edge("c3-gw-jwt-ver", "gw-jwt-filter", "gw-jwt-verifier", "CODE_DEPENDENCY");

  edge("c3-id-auth-svc", "id-auth-ctrl", "id-service", "CODE_DEPENDENCY");
  edge("c3-id-user-svc", "id-user-ctrl", "id-service", "CODE_DEPENDENCY");
  edge("c3-id-svc-jwt", "id-service", "id-jwt-issuer", "CODE_DEPENDENCY");
  edge("c3-id-svc-pwd", "id-service", "id-pwd-cfg", "CODE_DEPENDENCY");
  edge("c3-id-seeder-repo", "id-seeder", "id-user-repo", "CODE_DEPENDENCY");
  edge("c3-id-seeder-pwd", "id-seeder", "id-pwd-cfg", "CODE_DEPENDENCY");
  edge("c3-id-svc-repo", "id-service", "id-user-repo", "CODE_DEPENDENCY");
  edge("c3-id-repo-db", "id-user-repo", "identity-db", "DATABASE_ACCESS");

  edge("c3-cat-pctrl-psvc", "cat-prod-ctrl", "cat-prod-svc", "CODE_DEPENDENCY");
  edge("c3-cat-cctrl-csvc", "cat-cat-ctrl", "cat-cat-svc", "CODE_DEPENDENCY");
  edge("c3-cat-psvc-redis", "cat-prod-svc", "cat-redis-cfg", "CODE_DEPENDENCY");
  edge("c3-cat-cfg-redis", "cat-redis-cfg", "redis", "DATABASE_ACCESS");
  edge("c3-cat-psvc-prepo", "cat-prod-svc", "cat-prod-repo", "CODE_DEPENDENCY");
  edge("c3-cat-psvc-crepo", "cat-prod-svc", "cat-cat-repo", "CODE_DEPENDENCY");
  edge("c3-cat-csvc-crepo", "cat-cat-svc", "cat-cat-repo", "CODE_DEPENDENCY");
  edge("c3-cat-prepo-db", "cat-prod-repo", "catalog-db", "DATABASE_ACCESS");
  edge("c3-cat-crepo-db", "cat-cat-repo", "catalog-db", "DATABASE_ACCESS");

  edge("c3-ord-ctrl-svc", "ord-ctrl", "ord-svc", "CODE_DEPENDENCY");
  edge("c3-ord-ctrl-saga", "ord-ctrl", "ord-saga", "CODE_DEPENDENCY");
  edge("c3-ord-svc-repo", "ord-svc", "ord-repo", "CODE_DEPENDENCY");
  edge("c3-ord-saga-repo", "ord-saga", "ord-repo", "CODE_DEPENDENCY");
  edge("c3-ord-saga-int", "ord-saga", "ord-cat-int", "CODE_DEPENDENCY");
  edge("c3-ord-int-feign", "ord-cat-int", "ord-cat-feign", "CODE_DEPENDENCY");
  edge("c3-ord-saga-tx", "ord-saga", "ord-tx-svc", "CODE_DEPENDENCY");
  edge("c3-ord-tx-orepo", "ord-tx-svc", "ord-repo", "CODE_DEPENDENCY");
  edge("c3-ord-tx-outrepo", "ord-tx-svc", "ord-outbox-repo", "CODE_DEPENDENCY");
  edge("c3-ord-pub-outrepo", "ord-outbox-pub", "ord-outbox-repo", "CODE_DEPENDENCY");
  edge("c3-ord-orepo-db", "ord-repo", "order-db", "DATABASE_ACCESS");
  edge("c3-ord-outrepo-db", "ord-outbox-repo", "order-db", "DATABASE_ACCESS");
  edge("c3-ord-feign-cat", "ord-cat-feign", "cat-prod-ctrl", "SERVICE_HTTP_CALL");
  edge("c3-ord-pub-kafka", "ord-outbox-pub", "kafka", "MESSAGE_PUBLISH");

  edge("c3-noti-ctrl-svc", "noti-ctrl", "noti-svc", "CODE_DEPENDENCY");
  edge("c3-noti-svc-repo", "noti-svc", "noti-repo", "CODE_DEPENDENCY");
  edge("c3-kafka-noti-cons", "kafka", "noti-consumer", "MESSAGE_SUBSCRIBE");
  edge("c3-noti-cons-proc", "noti-consumer", "noti-proc-repo", "CODE_DEPENDENCY");
  edge("c3-noti-cons-repo", "noti-consumer", "noti-repo", "CODE_DEPENDENCY");
  edge("c3-noti-repo-db", "noti-repo", "notification-db", "DATABASE_ACCESS");
  edge("c3-noti-procrepo-db", "noti-proc-repo", "notification-db", "DATABASE_ACCESS");

  const elements = rawNodes.map((node) => ({
    layer:
      node.elementType === "DATABASE" || node.elementType === "MESSAGE_CHANNEL"
        ? "data"
        : node.elementType === "PERSON" || node.elementType === "EXTERNAL_SYSTEM"
          ? "edge"
          : "domain",
    evidence: [],
    ...node,
  }));

  return {
    id: "moc-huong-v3",
    projectId: "proj-moc-huong",
    snapshotId: "snap-moc-huong-v3",
    revision: 2,
    label: "Mộc Hương Shop Platform · r2",
    elements,
    edges: rawEdges,
    diagrams: [],
    findings: [],
  };
}

test("Moc Huong v4 C1 Context uses 3 confirmed roles and Vietnamese business action labels", async () => {
  const model = buildMocHuongModel();
  const ctx = deriveC4ContextModel(model, "Mộc Hương Shop Platform");

  assert.equal(ctx.persons.length, 3);
  assert.deepEqual(
    ctx.persons.map((p) => [p.name, p.actionLabel]),
    [
      ["Admin", "Quản trị tài khoản, phân quyền & danh mục [HTTPS]"],
      ["Staff", "Xử lý đơn hàng & quản lý tồn kho [HTTPS]"],
      ["Customer", "Duyệt sản phẩm, đặt hàng & theo dõi đơn [HTTPS]"],
    ],
  );
  assert.deepEqual(
    ctx.externals.map((e) => [e.name, e.actionLabel]),
    [["Observability Platform (OpenTelemetry)", "Xuất OTLP traces & metrics [HTTP/OTLP]"]],
  );
  assert.ok(ctx.systemDescription.includes("explicit user-confirmed assertions"));

  const selection = selectDiagram(model, "CONTEXT", undefined, {
    systemName: "Mộc Hương Shop Platform",
  });
  assert.ok(selection.document);
  assert.equal(selection.document.layoutJson.nodes.length, 5);
  assert.equal(selection.document.layoutJson.edges.length, 4);

  const xml = await generateDrawio(selection.document);
  const visibleCellValues = [...xml.matchAll(/<mxCell\b[^>]*\bvalue="([^"]*)"/g)]
    .map((m) => m[1].replace(/&#xa;|&lt;br\s*\/?&gt;|\s+/g, " "))
    .join(" || ");

  assert.ok(visibleCellValues.includes("Mộc Hương Shop Platform"));
  assert.ok(
    visibleCellValues.includes(
      "Nền tảng thương mại điện tử nhang trầm kiến trúc Java 21 / Spring Cloud Microservices",
    ),
  );
  assert.ok(visibleCellValues.includes("[Person · Admin Portal]"));
  assert.ok(visibleCellValues.includes("[Person · Staff Portal]"));
  assert.ok(visibleCellValues.includes("[Person · Web / Mobile Client]"));
  assert.ok(visibleCellValues.includes("Quản trị tài khoản, phân quyền &amp; danh mục [HTTPS]"));
  assert.ok(visibleCellValues.includes("Xử lý đơn hàng &amp; quản lý tồn kho [HTTPS]"));
  assert.ok(visibleCellValues.includes("Duyệt sản phẩm, đặt hàng &amp; theo dõi đơn [HTTPS]"));
  assert.ok(visibleCellValues.includes("Xuất OTLP traces &amp; metrics [HTTP/OTLP]"));
  assert.ok(!visibleCellValues.includes("HTTP call (declared)"));
  assert.ok(!visibleCellValues.includes("Exports traces (configured)"));
  assert.ok(!visibleCellValues.includes("Unknown element"));
  assert.ok(!visibleCellValues.toLowerCase().includes("mavis"));
  assert.ok(!visibleCellValues.toLowerCase().includes("quản trị hệ thống"));

  const contextDrawio = buildContextDiagramDrawioXml(model, "Mộc Hương Shop Platform").replace(
    /&#xa;|\s+/g,
    " ",
  );
  assert.ok(
    contextDrawio.includes(
      "Nền tảng thương mại điện tử nhang trầm kiến trúc Java 21 / Spring Cloud Microservices",
    ),
  );
});

test("Moc Huong v4 C2 Container includes 3 Person roles, 6 microservices & infrastructure with [Person] labels", async () => {
  const model = buildMocHuongModel();
  const selection = selectDiagram(model, "CONTAINER", undefined, {
    systemName: "Mộc Hương Shop Platform",
  });
  assert.ok(selection.document);
  const doc = selection.document;
  assert.equal(doc.layoutJson.nodes.length, 17);
  assert.equal(doc.layoutJson.edges.length, 21);

  const xml = await generateDrawio(doc);
  for (const expected of [
    "service-discovery",
    "api-gateway",
    "identity-service",
    "catalog-service",
    "order-service",
    "notification-service",
    "identity-db",
    "catalog-db",
    "order-db",
    "notification-db",
    "redis",
    "kafka",
    "Admin",
    "Staff",
    "Customer",
    "[Person · Admin Portal]",
    "[Person · Staff Portal]",
    "[Person · Web / Mobile Client]",
    "Observability Platform (OpenTelemetry)",
  ]) {
    assert.ok(xml.includes(expected), `C2 Container SVG/DrawIO missing ${expected}`);
  }
  assert.ok(!xml.includes("Unknown element"));
  assert.ok(!xml.includes("payment-service"));
  assert.ok(!xml.includes("inventory-service"));
  assert.ok(!xml.includes("Curated E-Commerce Reference"));
  assert.ok(!xml.toLowerCase().includes("quản trị hệ thống"));
});

test("Moc Huong v3 C3 Component (ALL and every single service) generates DrawIO with zero collisions and faithful Order edges", async () => {
  const model = buildMocHuongModel();

  const allSel = selectDiagram(model, "COMPONENT", "ALL", {
    systemName: "Mộc Hương Shop Platform",
  });
  assert.ok(allSel.document);
  const allXml = await generateDrawio(allSel.document);
  for (const expected of [
    "ServiceDiscoveryApplication",
    "JwtAuthenticationGatewayFilter",
    "PasswordEncoderConfig",
    "IdentityDataSeeder",
    "ProductService",
    "OrderSagaOrchestrator",
    "CatalogFeignClient",
    "OrderEventConsumer",
  ]) {
    assert.ok(allXml.includes(expected), `C3 ALL missing ${expected}`);
  }

  for (const svc of [
    "service-discovery",
    "api-gateway",
    "identity-service",
    "catalog-service",
    "order-service",
    "notification-service",
  ]) {
    const sel = selectDiagram(model, "COMPONENT", svc, {
      systemName: "Mộc Hương Shop Platform",
    });
    assert.ok(sel.document, `Missing C3 document for ${svc}`);
    const xml = await generateDrawio(sel.document);
    assert.ok(xml.includes("<mxGraphModel"), `DrawIO generation failed for ${svc}`);

    if (svc === "order-service") {
      const edges = sel.document.layoutJson.edges;
      const hasEdge = (fromId, toId) => edges.some((e) => e.from === fromId && e.to === toId);
      assert.equal(hasEdge("ord-ctrl", "ord-svc"), true);
      assert.equal(hasEdge("ord-ctrl", "ord-saga"), true);
      assert.equal(hasEdge("ord-svc", "ord-repo"), true);
      assert.equal(hasEdge("ord-saga", "ord-repo"), true);
      assert.equal(hasEdge("ord-svc", "ord-saga"), false, "OrderService must not call OrderSagaOrchestrator");
    }
  }
});

test("Moc Huong v4 Dependency Graph projects all 16 architecture nodes and directed shortLabel edges", () => {
  const model = buildMocHuongModel();
  const projection = projectGraphModel(model, false, "all");

  assert.equal(projection.model.elements.length, 16);
  assert.equal(projection.filteredRelationships, 0);
  assert.equal(projection.unassignedElements, 0);
  assert.equal(projection.unassignedRelationships, 0);

  const elements = networkElements(projection.model, null, undefined);
  const cyEdges = elements.filter((el) => el.group === "edges");
  assert.ok(cyEdges.length >= 20);
  for (const edge of cyEdges) {
    assert.ok(edge.classes.includes("directed-static"));
    assert.ok(edge.data.shortLabel);
    assert.ok(edge.data.source.startsWith("node:"));
    assert.ok(edge.data.target.startsWith("node:"));
  }
  const labels = new Set(cyEdges.map((e) => e.data.shortLabel));
  for (const expectedLabel of ["Route", "HTTP / Feign", "DB / Cache", "Publish", "Subscribe", "Eureka", "OTLP"]) {
    assert.ok(labels.has(expectedLabel), `Missing shortLabel ${expectedLabel}`);
  }

  const serviceOnlyModel = filterGraphCategories(projection.model, [
    "database",
    "messaging",
    "component",
    "external",
    "unknown",
  ]);
  assert.deepEqual(
    serviceOnlyModel.elements.map((e) => e.name).sort(),
    [
      "api-gateway",
      "catalog-service",
      "identity-service",
      "notification-service",
      "order-service",
      "service-discovery",
    ],
  );
  assert.equal(serviceOnlyModel.edges.length, 10);
});
