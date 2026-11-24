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
  selectDefaultGuidedC3Service,
} = require("../src/features/architecture/diagram-projections.ts");
const {
  projectGraphModel,
  filterGraphCategories,
} = require("../src/features/architecture/graph-projection.ts");
const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
const { generateDrawio } = require("../src/lib/drawio/server.ts");

function buildFruitShopModel() {
  const rawNodes = [
    {
      id: "admin",
      name: "Admin",
      elementType: "PERSON",
      technology: "Admin Portal",
      description: "Quản trị viên hệ thống quản lý danh mục trái cây, tồn kho & đơn hàng (Admin)",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]",
      },
    },
    {
      id: "staff",
      name: "Staff",
      elementType: "PERSON",
      technology: "Staff Portal",
      description: "Nhân viên vận hành kiểm tra giỏ hàng, xử lý đơn hàng & hỗ trợ khách (Staff)",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]",
      },
    },
    {
      id: "customer",
      name: "Customer",
      elementType: "PERSON",
      technology: "Web / Mobile Client",
      description: "Khách hàng duyệt trái cây sạch, quản lý giỏ hàng & đặt hàng (Customer)",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]",
      },
    },
    {
      id: "otel-observability",
      name: "OpenTelemetry & MAVIS Observability",
      elementType: "EXTERNAL_SYSTEM",
      technology: "OTLP / .NET OpenTelemetry 1.9",
      description: "Thu thập OTLP traces, W3C traceparent & .NET Runtime/AspNetCore metrics",
      parentId: null,
      status: "VALIDATED",
      properties: {
        contextReviewState: "CONFIRMED",
        contextFactOrigin: "USER_CONFIRMED",
        contextActionLabel: "Xuất OTLP traces & metrics [HTTP/OTLP]",
      },
    },
    {
      id: "ApiGateway",
      name: "ApiGateway",
      elementType: "SERVICE_CONTAINER",
      technology: ".NET 8 · YARP Reverse Proxy (:8080)",
      description: "Edge reverse proxy · Demo JWT /api/v1/auth/token, RateLimiter & YARP routing",
      parentId: null,
      status: "VALIDATED",
      properties: {
        port: "8080",
        framework: ".NET 8 / YARP 2.2.0",
        systemDescription:
          "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices",
      },
    },
    {
      id: "FruitCatalog.API",
      name: "FruitCatalog.API",
      elementType: "SERVICE_CONTAINER",
      technology: ".NET 8 · ASP.NET Core 8 (:8080)",
      description: "Fruit catalog CRUD, AdminOnly policy enforcement & stock reserve/release APIs",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8080", framework: ".NET 8 / EF Core 8", database: "catalog_db" },
    },
    {
      id: "FruitBasket.API",
      name: "FruitBasket.API",
      elementType: "SERVICE_CONTAINER",
      technology: ".NET 8 · ASP.NET Core 8 (:8080)",
      description: "Redis-backed shopping basket APIs & idempotent MassTransit consumer",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8080", framework: ".NET 8 / StackExchangeRedis + MassTransit", database: "redis" },
    },
    {
      id: "FruitOrdering.API",
      name: "FruitOrdering.API",
      elementType: "SERVICE_CONTAINER",
      technology: ".NET 8 · ASP.NET Core 8 (:8080)",
      description: "Order Saga Orchestrator, Polly HttpClient clients & Transactional Outbox",
      parentId: null,
      status: "VALIDATED",
      properties: { port: "8080", framework: ".NET 8 / EF Core 8 + Polly v8 + MassTransit", database: "ordering_db" },
    },
    {
      id: "catalog-db",
      name: "catalog-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · catalog_db",
      description: "Isolated PostgreSQL 16 schema catalog owned exclusively by FruitCatalog.API",
      parentId: null,
      status: "VALIDATED",
      properties: { datastoreKind: "POSTGRES", ownerService: "FruitCatalog.API" },
    },
    {
      id: "ordering-db",
      name: "ordering-db",
      elementType: "DATABASE",
      technology: "PostgreSQL 16 · ordering_db",
      description: "Isolated PostgreSQL 16 schema ordering owned by FruitOrdering.API",
      parentId: null,
      status: "VALIDATED",
      properties: { datastoreKind: "POSTGRES", ownerService: "FruitOrdering.API" },
    },
    {
      id: "redis",
      name: "redis",
      elementType: "DATABASE",
      technology: "Redis 7 · IDistributedCache",
      description: "Shopping basket cache & processed-event idempotency store",
      parentId: null,
      status: "VALIDATED",
      properties: { datastoreKind: "CACHE", ownerService: "FruitBasket.API" },
    },
    {
      id: "rabbitmq",
      name: "rabbitmq",
      elementType: "MESSAGE_CHANNEL",
      technology: "RabbitMQ 3.13 · MassTransit",
      description: "OrderCreatedIntegrationEvent & OrderCancelledIntegrationEvent broker",
      parentId: null,
      status: "VALIDATED",
      properties: { protocol: "RabbitMQ 3.13 + MassTransit · OrderCreatedIntegrationEvent" },
    },
  ];

  const comp = (id, parentId, name, technology, tier) =>
    rawNodes.push({
      id,
      name,
      elementType: "COMPONENT",
      technology,
      description: `${name} inside ${parentId}`,
      parentId,
      status: "VALIDATED",
      properties: { tier },
    });

  // ApiGateway (4)
  comp("c3-gw-auth", "ApiGateway", "AuthController", "C# 12 · ASP.NET Core Controller", "Controller");
  comp("c3-gw-yarp", "ApiGateway", "YarpReverseProxyPipeline", "C# 12 · YARP 2.2.0 Reverse Proxy", "Proxy");
  comp("c3-gw-jwt", "ApiGateway", "JwtOptions", "C# 12 · JWT Bearer & Policy Options", "Security");
  comp("c3-gw-err", "ApiGateway", "GlobalExceptionHandler", "C# 12 · IExceptionHandler", "Middleware");

  // FruitCatalog.API (4)
  comp("c3-cat-ctrl", "FruitCatalog.API", "CatalogItemsController", "C# 12 · ASP.NET Core Controller", "Controller");
  comp("c3-cat-svc", "FruitCatalog.API", "CatalogService", "C# 12 · Application Service", "Service");
  comp("c3-cat-dbctx", "FruitCatalog.API", "CatalogDbContext", "C# 12 · EF Core 8 Npgsql DbContext", "Repository");
  comp("c3-cat-init", "FruitCatalog.API", "CatalogDbInitializer", "C# 12 · Startup Seeder", "Initializer");

  // FruitBasket.API (5)
  comp("c3-bsk-ctrl", "FruitBasket.API", "BasketController", "C# 12 · ASP.NET Core Controller", "Controller");
  comp("c3-bsk-svc", "FruitBasket.API", "BasketService", "C# 12 · Application Service", "Service");
  comp("c3-bsk-cons", "FruitBasket.API", "OrderCreatedConsumer", "C# 12 · MassTransit IConsumer<T>", "Consumer");
  comp("c3-bsk-repo", "FruitBasket.API", "RedisBasketRepository", "C# 12 · StackExchangeRedis Repository", "Repository");
  comp("c3-bsk-proc", "FruitBasket.API", "RedisProcessedEventStore", "C# 12 · Redis Idempotency Store", "Repository");

  // FruitOrdering.API (7)
  comp("c3-ord-ctrl", "FruitOrdering.API", "OrdersController", "C# 12 · ASP.NET Core Controller", "Controller");
  comp("c3-ord-saga", "FruitOrdering.API", "OrderSagaService", "C# 12 · Saga Orchestrator Service", "Service");
  comp("c3-ord-qry", "FruitOrdering.API", "OrderQueryService", "C# 12 · Read Query Service", "Service");
  comp("c3-ord-catcli", "FruitOrdering.API", "CatalogApiClient", "C# 12 · Typed HttpClient + Polly v8", "HttpClient");
  comp("c3-ord-bskcli", "FruitOrdering.API", "BasketApiClient", "C# 12 · Typed HttpClient + Polly v8", "HttpClient");
  comp("c3-ord-relay", "FruitOrdering.API", "OutboxRelayBackgroundService", "C# 12 · BackgroundService + MassTransit", "BackgroundWorker");
  comp("c3-ord-dbctx", "FruitOrdering.API", "OrderingDbContext", "C# 12 · EF Core 8 Npgsql DbContext", "Repository");

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

  // C1 & C2 edges (14)
  edge("admin-gw", "admin", "ApiGateway", "GATEWAY_ROUTE", { label: "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]" });
  edge("staff-gw", "staff", "ApiGateway", "GATEWAY_ROUTE", { label: "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]" });
  edge("cust-gw", "customer", "ApiGateway", "GATEWAY_ROUTE", { label: "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]" });
  edge("gw-catalog", "ApiGateway", "FruitCatalog.API", "GATEWAY_ROUTE", { route: "/api/v1/catalog/{**catch-all}" });
  edge("gw-basket", "ApiGateway", "FruitBasket.API", "GATEWAY_ROUTE", { route: "/api/v1/basket/{**catch-all}" });
  edge("gw-ordering", "ApiGateway", "FruitOrdering.API", "GATEWAY_ROUTE", { route: "/api/v1/orders/{**catch-all}" });
  edge("ordering-catalog-http", "FruitOrdering.API", "FruitCatalog.API", "SERVICE_HTTP_CALL", { client: "CatalogApiClient", resilience: "Polly StandardResilience" });
  edge("ordering-basket-http", "FruitOrdering.API", "FruitBasket.API", "SERVICE_HTTP_CALL", { client: "BasketApiClient", resilience: "Polly StandardResilience" });
  edge("cat-db", "FruitCatalog.API", "catalog-db", "DATABASE_ACCESS", { protocol: "Npgsql EF Core · schema catalog" });
  edge("ord-db", "FruitOrdering.API", "ordering-db", "DATABASE_ACCESS", { protocol: "Npgsql EF Core · schema ordering" });
  edge("basket-redis", "FruitBasket.API", "redis", "DATABASE_ACCESS", { protocol: "StackExchangeRedis · basket:*" });
  edge("ord-rabbitmq", "FruitOrdering.API", "rabbitmq", "MESSAGE_PUBLISH", { events: "OrderCreatedIntegrationEvent, OrderCancelledIntegrationEvent" });
  edge("rabbitmq-basket", "rabbitmq", "FruitBasket.API", "MESSAGE_SUBSCRIBE", { events: "OrderCreatedIntegrationEvent" });
  edge("gw-otel", "ApiGateway", "otel-observability", "TRACING_EXPORT", { protocol: "OTLP / .NET OpenTelemetry 1.9" });

  // C3 edges
  edge("c3-gw-auth-jwt", "c3-gw-auth", "c3-gw-jwt", "CODE_DEPENDENCY");
  edge("c3-gw-yarp-err", "c3-gw-yarp", "c3-gw-err", "CODE_DEPENDENCY");
  edge("c3-cat-ctrl-svc", "c3-cat-ctrl", "c3-cat-svc", "CODE_DEPENDENCY");
  edge("c3-cat-svc-db", "c3-cat-svc", "c3-cat-dbctx", "CODE_DEPENDENCY");
  edge("c3-cat-init-db", "c3-cat-init", "c3-cat-dbctx", "CODE_DEPENDENCY");
  edge("c3-cat-db-pg", "c3-cat-dbctx", "catalog-db", "DATABASE_ACCESS");
  edge("c3-bsk-ctrl-svc", "c3-bsk-ctrl", "c3-bsk-svc", "CODE_DEPENDENCY");
  edge("c3-bsk-svc-repo", "c3-bsk-svc", "c3-bsk-repo", "CODE_DEPENDENCY");
  edge("c3-bsk-repo-redis", "c3-bsk-repo", "redis", "DATABASE_ACCESS");
  edge("c3-rmq-bsk-cons", "rabbitmq", "c3-bsk-cons", "MESSAGE_SUBSCRIBE");
  edge("c3-bsk-cons-proc", "c3-bsk-cons", "c3-bsk-proc", "CODE_DEPENDENCY");
  edge("c3-bsk-proc-redis", "c3-bsk-proc", "redis", "DATABASE_ACCESS");
  edge("c3-bsk-cons-svc", "c3-bsk-cons", "c3-bsk-svc", "CODE_DEPENDENCY");
  edge("c3-ord-ctrl-saga", "c3-ord-ctrl", "c3-ord-saga", "CODE_DEPENDENCY");
  edge("c3-ord-ctrl-qry", "c3-ord-ctrl", "c3-ord-qry", "CODE_DEPENDENCY");
  edge("c3-ord-saga-catcli", "c3-ord-saga", "c3-ord-catcli", "CODE_DEPENDENCY");
  edge("c3-ord-saga-bskcli", "c3-ord-saga", "c3-ord-bskcli", "CODE_DEPENDENCY");
  edge("c3-ord-saga-db", "c3-ord-saga", "c3-ord-dbctx", "CODE_DEPENDENCY");
  edge("c3-ord-qry-db", "c3-ord-qry", "c3-ord-dbctx", "CODE_DEPENDENCY");
  edge("c3-ord-relay-db", "c3-ord-relay", "c3-ord-dbctx", "CODE_DEPENDENCY");
  edge("c3-ord-db-pg", "c3-ord-dbctx", "ordering-db", "DATABASE_ACCESS");
  edge("c3-ord-catcli-cat", "c3-ord-catcli", "c3-cat-ctrl", "SERVICE_HTTP_CALL");
  edge("c3-ord-bskcli-bsk", "c3-ord-bskcli", "c3-bsk-ctrl", "SERVICE_HTTP_CALL");
  edge("c3-ord-relay-rmq", "c3-ord-relay", "rabbitmq", "MESSAGE_PUBLISH");

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
    id: "fruit-shop-dotnet-v1",
    projectId: "proj-fruit-shop",
    snapshotId: "snap-fruit-shop-dotnet-v1",
    revision: 2,
    label: "Project Trái Cây Platform · r2",
    elements,
    edges: rawEdges,
    diagrams: [],
    findings: [],
  };
}

test("Project Trái Cây C1 Context has 3 confirmed Vietnamese roles, 5 nodes, 4 edges and [Person] badges", async () => {
  const model = buildFruitShopModel();
  const ctx = deriveC4ContextModel(model, "Project Trái Cây Platform");

  assert.deepEqual(
    ctx.persons.map((p) => [p.name, p.actionLabel]),
    [
      ["Admin", "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]"],
      ["Staff", "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]"],
      ["Customer", "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]"],
    ],
  );
  assert.deepEqual(
    ctx.externals.map((e) => [e.name, e.actionLabel]),
    [["OpenTelemetry & MAVIS Observability", "Xuất OTLP traces & metrics [HTTP/OTLP]"]],
  );

  const selection = selectDiagram(model, "CONTEXT", undefined, {
    systemName: "Project Trái Cây Platform",
  });
  assert.ok(selection.document);
  assert.equal(selection.document.layoutJson.nodes.length, 5);
  assert.equal(selection.document.layoutJson.edges.length, 4);

  const xml = await generateDrawio(selection.document);
  const visibleCellValues = [...xml.matchAll(/<mxCell\b[^>]*\bvalue="([^"]*)"/g)]
    .map((m) => m[1].replace(/&#xa;|&lt;br\s*\/?&gt;|\s+/g, " "))
    .join(" || ");

  assert.ok(visibleCellValues.includes("Project Trái Cây Platform"));
  assert.ok(
    visibleCellValues.includes(
      "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices",
    ),
  );
  assert.ok(visibleCellValues.includes("[Person · Admin Portal]"));
  assert.ok(visibleCellValues.includes("[Person · Staff Portal]"));
  assert.ok(visibleCellValues.includes("[Person · Web / Mobile Client]"));
  assert.ok(visibleCellValues.includes("Quản trị danh mục trái cây, tồn kho &amp; đơn hàng [HTTPS]"));
  assert.ok(visibleCellValues.includes("Xử lý đơn hàng, kiểm tra giỏ hàng &amp; tồn kho [HTTPS]"));
  assert.ok(visibleCellValues.includes("Duyệt trái cây, quản lý giỏ hàng &amp; đặt hàng [HTTPS]"));
  assert.ok(visibleCellValues.includes("Xuất OTLP traces &amp; metrics [HTTP/OTLP]"));
  assert.ok(!visibleCellValues.includes("Unknown element"));
  assert.ok(!visibleCellValues.toLowerCase().includes("spring"));
  assert.ok(!visibleCellValues.toLowerCase().includes("java 21"));

  const contextDrawio = buildContextDiagramDrawioXml(model, "Project Trái Cây Platform").replace(
    /&#xa;|\s+/g,
    " ",
  );
  assert.ok(
    contextDrawio.includes(
      "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices",
    ),
  );
});

test("Project Trái Cây C2 Container renders 4 .NET 8 services, Postgres/Redis/RabbitMQ infra and zero Java/Spring labels", async () => {
  const model = buildFruitShopModel();
  const selection = selectDiagram(model, "CONTAINER", undefined, {
    systemName: "Project Trái Cây Platform",
  });
  assert.ok(selection.document);
  const doc = selection.document;
  assert.equal(doc.layoutJson.nodes.length, 13);
  assert.equal(doc.layoutJson.edges.length, 14);

  const xml = await generateDrawio(doc);
  for (const expected of [
    "ApiGateway",
    "FruitCatalog.API",
    "FruitBasket.API",
    "FruitOrdering.API",
    "catalog-db",
    "ordering-db",
    "redis",
    "rabbitmq",
    "Admin",
    "Staff",
    "Customer",
    "[Person · Admin Portal]",
    "[Person · Staff Portal]",
    "[Person · Web / Mobile Client]",
    "OpenTelemetry &amp; MAVIS Observability",
  ]) {
    assert.ok(xml.includes(expected), `C2 Container DrawIO missing ${expected}`);
  }
  assert.ok(!xml.includes("Unknown element"));
  assert.ok(!xml.toLowerCase().includes("spring"));
  assert.ok(!xml.toLowerCase().includes("openfeign"));
  assert.ok(!xml.includes("payment-service"));
});

test("Project Trái Cây C3 Component selects FruitOrdering.API by default and renders all 4 .NET 8 services", async () => {
  const model = buildFruitShopModel();

  const containers = model.elements
    .filter((node) => node.elementType === "SERVICE_CONTAINER")
    .map((node) => ({
      id: node.id,
      name: node.name,
      count: model.elements.filter((child) => child.parentId === node.id).length,
    }));
  assert.equal(selectDefaultGuidedC3Service(containers), "FruitOrdering.API");

  // Generic fallback when neither order-service nor ordering name exists picks most-populated service
  assert.equal(
    selectDefaultGuidedC3Service([
      { id: "svc-a", name: "ApiGateway", count: 2 },
      { id: "svc-b", name: "FruitBasket.API", count: 6 },
    ]),
    "svc-b",
  );

  const allSel = selectDiagram(model, "COMPONENT", "ALL", {
    systemName: "Project Trái Cây Platform",
  });
  assert.ok(allSel.document);
  const allXml = await generateDrawio(allSel.document);
  for (const expected of [
    "AuthController",
    "YarpReverseProxyPipeline",
    "CatalogItemsController",
    "BasketController",
    "OrderCreatedConsumer",
    "OrdersController",
    "OrderSagaService",
    "CatalogApiClient",
    "OutboxRelayBackgroundService",
  ]) {
    assert.ok(allXml.includes(expected), `C3 ALL missing ${expected}`);
  }

  for (const svc of ["ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API"]) {
    const sel = selectDiagram(model, "COMPONENT", svc, {
      systemName: "Project Trái Cây Platform",
    });
    assert.ok(sel.document, `Missing C3 document for ${svc}`);
    const xml = await generateDrawio(sel.document);
    assert.ok(xml.includes("<mxGraphModel"), `DrawIO generation failed for ${svc}`);
  }
});

test("Project Trái Cây Dependency Graph projects 12 full nodes and filters cleanly to 4 .NET 8 services", () => {
  const model = buildFruitShopModel();
  const projection = projectGraphModel(model, false, "all");

  assert.equal(projection.model.elements.length, 12);
  assert.equal(projection.filteredRelationships, 0);
  assert.equal(projection.unassignedElements, 0);
  assert.equal(projection.unassignedRelationships, 0);

  const elements = networkElements(projection.model, null, undefined);
  const cyEdges = elements.filter((el) => el.group === "edges");
  assert.equal(cyEdges.length, 14);
  for (const edge of cyEdges) {
    assert.ok(edge.classes.includes("directed-static"));
    assert.ok(edge.data.shortLabel);
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
    ["ApiGateway", "FruitBasket.API", "FruitCatalog.API", "FruitOrdering.API"],
  );
  assert.equal(serviceOnlyModel.edges.length, 5);
});
