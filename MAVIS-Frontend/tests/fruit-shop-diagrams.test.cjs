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

    // C3 Components
    { id: "c3-gw-auth", name: "AuthController", elementType: "COMPONENT", technology: "C# 12 · ASP.NET Core Controller", parentId: "ApiGateway", status: "VALIDATED", properties: { tier: "Controller" } },
    { id: "c3-gw-yarp", name: "YarpReverseProxyPipeline", elementType: "COMPONENT", technology: "C# 12 · YARP 2.2.0 Reverse Proxy", parentId: "ApiGateway", status: "VALIDATED", properties: { tier: "Proxy" } },
    { id: "c3-gw-jwt", name: "JwtOptions", elementType: "COMPONENT", technology: "C# 12 · JWT Bearer & Policy Options", parentId: "ApiGateway", status: "VALIDATED", properties: { tier: "Security" } },
    { id: "c3-gw-err", name: "GlobalExceptionHandler", elementType: "COMPONENT", technology: "C# 12 · IExceptionHandler", parentId: "ApiGateway", status: "VALIDATED", properties: { tier: "Middleware" } },

    { id: "c3-cat-ctrl", name: "CatalogItemsController", elementType: "COMPONENT", technology: "C# 12 · ASP.NET Core Controller", parentId: "FruitCatalog.API", status: "VALIDATED", properties: { tier: "Controller" } },
    { id: "c3-cat-svc", name: "CatalogService", elementType: "COMPONENT", technology: "C# 12 · Application Service", parentId: "FruitCatalog.API", status: "VALIDATED", properties: { tier: "Service" } },
    { id: "c3-cat-dbctx", name: "CatalogDbContext", elementType: "COMPONENT", technology: "C# 12 · EF Core 8 Npgsql DbContext", parentId: "FruitCatalog.API", status: "VALIDATED", properties: { tier: "Repository" } },
    { id: "c3-cat-init", name: "CatalogDbInitializer", elementType: "COMPONENT", technology: "C# 12 · Startup Seeder", parentId: "FruitCatalog.API", status: "VALIDATED", properties: { tier: "Initializer" } },

    { id: "c3-bsk-ctrl", name: "BasketController", elementType: "COMPONENT", technology: "C# 12 · ASP.NET Core Controller", parentId: "FruitBasket.API", status: "VALIDATED", properties: { tier: "Controller" } },
    { id: "c3-bsk-svc", name: "BasketService", elementType: "COMPONENT", technology: "C# 12 · Application Service", parentId: "FruitBasket.API", status: "VALIDATED", properties: { tier: "Service" } },
    { id: "c3-bsk-cons", name: "OrderCreatedConsumer", elementType: "COMPONENT", technology: "C# 12 · MassTransit IConsumer<T>", parentId: "FruitBasket.API", status: "VALIDATED", properties: { tier: "Consumer" } },
    { id: "c3-bsk-repo", name: "RedisBasketRepository", elementType: "COMPONENT", technology: "C# 12 · StackExchangeRedis Repository", parentId: "FruitBasket.API", status: "VALIDATED", properties: { tier: "Repository" } },
    { id: "c3-bsk-proc", name: "RedisProcessedEventStore", elementType: "COMPONENT", technology: "C# 12 · Redis Idempotency Store", parentId: "FruitBasket.API", status: "VALIDATED", properties: { tier: "Repository" } },

    { id: "c3-ord-ctrl", name: "OrdersController", elementType: "COMPONENT", technology: "C# 12 · ASP.NET Core Controller", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "Controller" } },
    { id: "c3-ord-saga", name: "OrderSagaService", elementType: "COMPONENT", technology: "C# 12 · Saga Orchestrator Service", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "Service" } },
    { id: "c3-ord-qry", name: "OrderQueryService", elementType: "COMPONENT", technology: "C# 12 · Read Query Service", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "Service" } },
    { id: "c3-ord-catcli", name: "CatalogApiClient", elementType: "COMPONENT", technology: "C# 12 · Typed HttpClient + Polly v8", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "HttpClient" } },
    { id: "c3-ord-bskcli", name: "BasketApiClient", elementType: "COMPONENT", technology: "C# 12 · Typed HttpClient + Polly v8", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "HttpClient" } },
    { id: "c3-ord-relay", name: "OutboxRelayBackgroundService", elementType: "COMPONENT", technology: "C# 12 · BackgroundService + MassTransit", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "BackgroundWorker" } },
    { id: "c3-ord-dbctx", name: "OrderingDbContext", elementType: "COMPONENT", technology: "C# 12 · EF Core 8 Npgsql DbContext", parentId: "FruitOrdering.API", status: "VALIDATED", properties: { tier: "Repository" } },
  ];

  const c2Relationships = [
    { id: "admin-gw", from: "admin", to: "ApiGateway", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]" },
    { id: "staff-gw", from: "staff", to: "ApiGateway", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]" },
    { id: "cust-gw", from: "customer", to: "ApiGateway", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]" },
    { id: "gw-catalog", from: "ApiGateway", to: "FruitCatalog.API", type: "GATEWAY_ROUTE", originLayer: "CONFIG", label: "YARP -> /api/v1/catalog/{**catch-all}" },
    { id: "gw-basket", from: "ApiGateway", to: "FruitBasket.API", type: "GATEWAY_ROUTE", originLayer: "CONFIG", label: "YARP -> /api/v1/basket/{**catch-all}" },
    { id: "gw-ordering", from: "ApiGateway", to: "FruitOrdering.API", type: "GATEWAY_ROUTE", originLayer: "CONFIG", label: "YARP -> /api/v1/orders/{**catch-all}" },
    { id: "ordering-catalog-http", from: "FruitOrdering.API", to: "FruitCatalog.API", type: "SERVICE_HTTP_CALL", originLayer: "STATIC", label: "CatalogApiClient (Polly StandardResilience)" },
    { id: "ordering-basket-http", from: "FruitOrdering.API", to: "FruitBasket.API", type: "SERVICE_HTTP_CALL", originLayer: "STATIC", label: "BasketApiClient (Polly StandardResilience)" },
    { id: "cat-db", from: "FruitCatalog.API", to: "catalog-db", type: "DATABASE_ACCESS", originLayer: "CONFIG", label: "Npgsql EF Core · schema catalog" },
    { id: "ord-db", from: "FruitOrdering.API", to: "ordering-db", type: "DATABASE_ACCESS", originLayer: "CONFIG", label: "Npgsql EF Core · schema ordering" },
    { id: "basket-redis", from: "FruitBasket.API", to: "redis", type: "DATABASE_ACCESS", originLayer: "CONFIG", label: "StackExchangeRedis · basket:*" },
    { id: "ord-rabbitmq", from: "FruitOrdering.API", to: "rabbitmq", type: "MESSAGE_PUBLISH", originLayer: "STATIC", label: "Publish OrderCreatedIntegrationEvent, OrderCancelledIntegrationEvent" },
    { id: "rabbitmq-basket", from: "rabbitmq", to: "FruitBasket.API", type: "MESSAGE_SUBSCRIBE", originLayer: "STATIC", label: "Consume OrderCreatedIntegrationEvent" },
    { id: "gw-otel", from: "ApiGateway", to: "otel-observability", type: "TRACING_EXPORT", originLayer: "CONFIG", label: "OTLP / .NET OpenTelemetry 1.9" },
  ];

  const c3Edges = [
    { id: "c3-gw-auth-jwt", from: "c3-gw-auth", to: "c3-gw-jwt", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Issues signed JWT for Admin/Staff/Customer" },
    { id: "c3-gw-yarp-err", from: "c3-gw-yarp", to: "c3-gw-err", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Handles downstream proxy faults" },
    { id: "c3-cat-ctrl-svc", from: "c3-cat-ctrl", to: "c3-cat-svc", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Delegates ICatalogService calls" },
    { id: "c3-cat-svc-db", from: "c3-cat-svc", to: "c3-cat-dbctx", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Persists fruit_products updates" },
    { id: "c3-bsk-ctrl-svc", from: "c3-bsk-ctrl", to: "c3-bsk-svc", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Delegates IBasketService operations" },
    { id: "c3-bsk-svc-repo", from: "c3-bsk-svc", to: "c3-bsk-repo", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Reads/writes CustomerBasket" },
    { id: "c3-bsk-cons-proc", from: "c3-bsk-cons", to: "c3-bsk-proc", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Checks HasProcessedAsync" },
    { id: "c3-bsk-cons-svc", from: "c3-bsk-cons", to: "c3-bsk-svc", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Invokes DeleteBasketAsync" },
    { id: "c3-ord-ctrl-saga", from: "c3-ord-ctrl", to: "c3-ord-saga", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Delegates PlaceOrderAsync" },
    { id: "c3-ord-ctrl-qry", from: "c3-ord-ctrl", to: "c3-ord-qry", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Delegates AsNoTracking queries" },
    { id: "c3-ord-saga-catcli", from: "c3-ord-saga", to: "c3-ord-catcli", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Reserves & releases fruit stock" },
    { id: "c3-ord-saga-bskcli", from: "c3-ord-saga", to: "c3-ord-bskcli", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Fetches customer basket snapshot" },
    { id: "c3-ord-saga-db", from: "c3-ord-saga", to: "c3-ord-dbctx", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Commits Order + IntegrationEventLogEntry" },
    { id: "c3-ord-qry-db", from: "c3-ord-qry", to: "c3-ord-dbctx", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "AsNoTracking read projections" },
    { id: "c3-ord-relay-db", from: "c3-ord-relay", to: "c3-ord-dbctx", type: "CODE_DEPENDENCY", originLayer: "STATIC", label: "Polls integration_event_outbox" },
    { id: "c3-ord-catcli-cat", from: "c3-ord-catcli", to: "c3-cat-ctrl", type: "SERVICE_HTTP_CALL", originLayer: "STATIC", label: "CatalogApiClient (Polly)" },
    { id: "c3-ord-bskcli-bsk", from: "c3-ord-bskcli", to: "c3-bsk-ctrl", type: "SERVICE_HTTP_CALL", originLayer: "STATIC", label: "BasketApiClient (Polly)" },
  ];

  const c1Diagram = {
    id: "diag-c1",
    notation: "C4",
    level: "CONTEXT",
    viewId: "context",
    viewTitle: "C4 · System Context (Project Trái Cây)",
    layoutJson: {
      nodes: [
        { id: "admin", kind: "PERSON", name: "Admin", technology: "Admin Portal" },
        { id: "staff", kind: "PERSON", name: "Staff", technology: "Staff Portal" },
        { id: "customer", kind: "PERSON", name: "Customer", technology: "Web / Mobile Client" },
        {
          id: "system:fruit-shop-dotnet",
          kind: "SYSTEM",
          name: "Project Trái Cây Platform",
          technology: "Software system",
          description: "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices",
        },
        { id: "otel-observability", kind: "EXTERNAL_SYSTEM", name: "OpenTelemetry & MAVIS Observability", technology: "OTLP / .NET OpenTelemetry 1.9" },
      ],
      edges: [
        { id: "c1-admin", from: "admin", to: "system:fruit-shop-dotnet", source: "admin", target: "system:fruit-shop-dotnet", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Quản trị danh mục trái cây, tồn kho & đơn hàng [HTTPS]" },
        { id: "c1-staff", from: "staff", to: "system:fruit-shop-dotnet", source: "staff", target: "system:fruit-shop-dotnet", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Xử lý đơn hàng, kiểm tra giỏ hàng & tồn kho [HTTPS]" },
        { id: "c1-cust", from: "customer", to: "system:fruit-shop-dotnet", source: "customer", target: "system:fruit-shop-dotnet", type: "GATEWAY_ROUTE", originLayer: "RUNTIME", label: "Duyệt trái cây, quản lý giỏ hàng & đặt hàng [HTTPS]" },
        { id: "c1-otel", from: "system:fruit-shop-dotnet", to: "otel-observability", source: "system:fruit-shop-dotnet", target: "otel-observability", type: "TRACING_EXPORT", originLayer: "CONFIG", label: "Xuất OTLP traces & metrics [HTTP/OTLP]" },
      ],
    },
  };

  const c2NodeIds = [
    "admin", "staff", "customer",
    "ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API",
    "catalog-db", "ordering-db", "redis", "rabbitmq",
    "otel-observability",
  ];

  const byId = new Map(rawNodes.map((n) => [n.id, n]));
  const c2Nodes = c2NodeIds.map((id) => {
    const n = byId.get(id);
    return { id: n.id, kind: n.elementType, name: n.name, technology: n.technology, description: n.description };
  });

  const c2Diagram = {
    id: "diag-c2",
    notation: "C4",
    level: "CONTAINER",
    viewId: "container",
    viewTitle: "C4 · Container",
    layoutJson: {
      nodes: c2Nodes,
      edges: c2Relationships.map((e) => ({ ...e, source: e.from, target: e.to })),
    },
  };

  const c3NodeIds = [
    "ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API",
    ...rawNodes.filter((n) => n.elementType === "COMPONENT").map((n) => n.id),
  ];

  const c3Diagram = {
    id: "diag-c3",
    notation: "C4",
    level: "COMPONENT",
    viewId: "component",
    viewTitle: "C4 · Component",
    layoutJson: {
      nodes: c3NodeIds.map((id) => {
        const n = byId.get(id);
        return {
          id: n.id,
          kind: n.elementType,
          name: n.name,
          technology: n.technology,
          description: n.description,
          parentId: n.parentId ?? undefined,
        };
      }),
      edges: c3Edges.map((e) => ({ ...e, source: e.from, target: e.to })),
    },
  };

  return {
    projectId: "proj-fruit-shop",
    elements: rawNodes,
    relationships: [...c2Relationships, ...c3Edges].map((r) => ({
      id: r.id,
      sourceElementId: r.from,
      targetElementId: r.to,
      relationType: r.type,
      originLayer: r.originLayer,
      description: r.label,
      properties: { label: r.label },
    })),
    diagrams: [
      c1Diagram,
      c2Diagram,
      c3Diagram,
      {
        id: "diag-dep",
        notation: "DEPENDENCY_GRAPH",
        level: "SERVICE",
        viewId: "dependency",
        viewTitle: "Service Dependency Graph",
        layoutJson: {
          nodes: c2Nodes,
          edges: c2Relationships.map((e) => ({ ...e, source: e.from, target: e.to })),
        },
      },
    ],
  };
}

test("Project Trái Cây C1 Context has 3 confirmed Vietnamese roles, 5 nodes, 4 edges and [Person] badges", async () => {
  const model = buildFruitShopModel();
  const ctx = deriveC4ContextModel(model);

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
  assert.equal(doc.layoutJson.nodes.length, 12);
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
