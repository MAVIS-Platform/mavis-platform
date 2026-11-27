import type { AuditModuleNumber, ModuleAuditLens } from "./module-audit-lens";

export const CSHARP_AUDIT_LENSES: Record<AuditModuleNumber, ModuleAuditLens> = {
  1: {
    moduleIndex: 1,
    track: "CSHARP",
    stepTitleEn: "Audit C1–C3 Decomposition, DDD & Solution Structure",
    stepTitleVi: "Kiểm toán Phân rã C1–C3, DDD & Solution Structure",
    stepDescriptionEn:
      "Inspect C1 System Context actors, C2 .NET 8 service boundaries, and clean C3 controller/service/DbContext layering.",
    stepDescriptionVi:
      "Kiểm tra 3 tác nhân C1 System Context, ranh giới 4 service .NET 8 và phân tầng C3 sạch trong Solution.",
    summaryEn:
      "Module 1 Focus: Verify 3 Actors, central system boundary, and clean bounded-context decomposition across 4 .NET 8 services.",
    summaryVi:
      "Tiêu điểm Module 1: Đối chiếu 3 tác nhân (Admin, Staff, Customer), ranh giới hệ thống và phân rã 4 Microservices .NET 8.",
    defaultView: "CONTEXT",
    dimOthersByDefault: true,
    focusNodeNames: [
      "Admin",
      "Staff",
      "Customer",
      "Observability Platform (OpenTelemetry)",
      "ApiGateway",
      "FruitCatalog.API",
      "FruitBasket.API",
      "FruitOrdering.API",
    ],
    quickChips: [
      {
        id: "csharp-m1-c2",
        labelEn: "C2: 4 .NET 8 Services",
        labelVi: "C2: Soi 4 Services .NET 8",
        targetView: "CONTAINER",
      },
      {
        id: "csharp-m1-c3-catalog",
        labelEn: "C3: FruitCatalog.API",
        labelVi: "C3: Soi FruitCatalog.API",
        targetView: "COMPONENT",
        targetServiceName: "FruitCatalog.API",
        targetNodeName: "CatalogItemsController",
      },
    ],
  },
  2: {
    moduleIndex: 2,
    track: "CSHARP",
    stepTitleEn: "Dependency & Reverse BFS Impact Analysis · YARP & Typed HttpClient",
    stepTitleVi: "Phân tích Phụ thuộc & Tác động Reverse BFS · YARP & Typed HttpClient",
    stepDescriptionEn:
      "Trace YARP gateway routes and synchronous Typed HttpClient calls across .NET 8 services using Reverse BFS.",
    stepDescriptionVi:
      "Truy vết định tuyến YARP Gateway và lời gọi đồng bộ Typed HttpClient để tính vùng ảnh hưởng Reverse BFS.",
    summaryEn:
      "Module 2 Focus: Inspect YARP routing and synchronous HTTP/HttpClient coupling, with FruitCatalog.API selected for Reverse BFS.",
    summaryVi:
      "Tiêu điểm Module 2: Soi YARP Gateway, Typed HttpClient và chọn FruitCatalog.API để tính ảnh hưởng ngược Reverse BFS tới FruitOrdering.API.",
    defaultView: "GRAPH",
    defaultSelectedNodeName: "FruitCatalog.API",
    dimOthersByDefault: true,
    defaultGraphHiddenCategories: ["database", "messaging", "component", "external", "unknown"],
    focusNodeNames: ["ApiGateway", "FruitOrdering.API", "FruitCatalog.API", "FruitBasket.API"],
    focusEdgeProtocols: ["GATEWAY_ROUTE", "SERVICE_HTTP_CALL"],
    quickChips: [
      {
        id: "csharp-m2-graph-catalog",
        labelEn: "Reverse BFS: FruitCatalog.API",
        labelVi: "Reverse BFS: FruitCatalog.API",
        targetView: "GRAPH",
        targetNodeName: "FruitCatalog.API",
        graphHiddenCategories: ["database", "messaging", "component", "external", "unknown"],
      },
      {
        id: "csharp-m2-c2-yarp",
        labelEn: "C2: ApiGateway (YARP)",
        labelVi: "C2: Soi ApiGateway (YARP)",
        targetView: "CONTAINER",
        targetNodeName: "ApiGateway",
      },
      {
        id: "csharp-m2-c3-httpclient",
        labelEn: "C3: CatalogApiClient",
        labelVi: "C3: Soi CatalogApiClient",
        targetView: "COMPONENT",
        targetServiceName: "FruitOrdering.API",
        targetNodeName: "CatalogApiClient",
      },
    ],
  },
  3: {
    moduleIndex: 3,
    track: "CSHARP",
    stepTitleEn: "Audit Database-per-Service (EF Core/Redis), RabbitMQ & Saga",
    stepTitleVi: "Kiểm toán Database-per-Service (EF Core/Redis), RabbitMQ & Saga",
    stepDescriptionEn:
      "Verify isolated PostgreSQL/Redis ownership, MassTransit RabbitMQ events, and Transactional Outbox + Saga.",
    stepDescriptionVi:
      "Kiểm tra cô lập PostgreSQL/Redis theo service, MassTransit RabbitMQ bất đồng bộ và Saga Outbox .NET 8.",
    summaryEn:
      "Module 3 Focus: Verify isolated EF Core PostgreSQL / Redis stores, RabbitMQ integration events, and Outbox Relay.",
    summaryVi:
      "Tiêu điểm Module 3: Soi Database-per-Service (catalog-db, ordering-db, Redis), kênh RabbitMQ bất đồng bộ và Outbox Relay.",
    defaultView: "CONTAINER",
    dimOthersByDefault: true,
    defaultGraphHiddenCategories: ["component", "external", "unknown"],
    focusNodeNames: [
      "catalog-db",
      "ordering-db",
      "redis",
      "rabbitmq",
      "FruitCatalog.API",
      "FruitBasket.API",
      "FruitOrdering.API",
      "OutboxRelayBackgroundService",
      "OrderSagaService",
      "OrderCreatedConsumer",
    ],
    focusEdgeProtocols: ["DATABASE_ACCESS", "MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE"],
    quickChips: [
      {
        id: "csharp-m3-c3-outbox",
        labelEn: "C3: Outbox & Saga (FruitOrdering.API)",
        labelVi: "C3: Outbox & Saga (FruitOrdering.API)",
        targetView: "COMPONENT",
        targetServiceName: "FruitOrdering.API",
        targetNodeName: "OutboxRelayBackgroundService",
      },
      {
        id: "csharp-m3-graph-db-mq",
        labelEn: "Graph: DB + Messaging",
        labelVi: "Đồ thị: Bật DB & RabbitMQ",
        targetView: "GRAPH",
        targetNodeName: "rabbitmq",
        graphHiddenCategories: ["component", "external", "unknown"],
      },
      {
        id: "csharp-m3-c3-basket",
        labelEn: "C3: OrderCreatedConsumer",
        labelVi: "C3: Soi OrderCreatedConsumer",
        targetView: "COMPONENT",
        targetServiceName: "FruitBasket.API",
        targetNodeName: "OrderCreatedConsumer",
      },
    ],
  },
  4: {
    moduleIndex: 4,
    track: "CSHARP",
    stepTitleEn: "Inspect Polly v8 Fault Tolerance & OpenTelemetry Trace",
    stepTitleVi: "Soi điểm Chịu lỗi Polly v8 & Tuyến OpenTelemetry Trace",
    stepDescriptionEn:
      "Inspect Polly v8 AddStandardResilienceHandler Typed HttpClients in FruitOrdering.API and OTLP trace propagation.",
    stepDescriptionVi:
      "Soi Polly v8 StandardResilienceHandler trên Typed HttpClient của FruitOrdering.API và tuyến OpenTelemetry Trace.",
    summaryEn:
      "Module 4 Focus: Inspect Polly v8 resilience handlers (CatalogApiClient, BasketApiClient) and OpenTelemetry trace routing.",
    summaryVi:
      "Tiêu điểm Module 4: Soi Polly v8 (CatalogApiClient, BasketApiClient), OrderSagaService và tuyến OpenTelemetry Trace.",
    defaultView: "COMPONENT",
    defaultC3ServiceName: "FruitOrdering.API",
    defaultSelectedNodeName: "CatalogApiClient",
    dimOthersByDefault: true,
    focusNodeNames: [
      "CatalogApiClient",
      "BasketApiClient",
      "OrderSagaService",
      "Observability Platform (OpenTelemetry)",
      "GlobalExceptionHandler",
      "YarpReverseProxyPipeline",
      "ApiGateway",
      "FruitOrdering.API",
    ],
    focusEdgeProtocols: ["TRACING_EXPORT", "SERVICE_HTTP_CALL"],
    quickChips: [
      {
        id: "csharp-m4-c3-polly",
        labelEn: "C3: CatalogApiClient (Polly v8)",
        labelVi: "C3: Soi Polly v8 (CatalogApiClient)",
        targetView: "COMPONENT",
        targetServiceName: "FruitOrdering.API",
        targetNodeName: "CatalogApiClient",
      },
      {
        id: "csharp-m4-c3-gateway",
        labelEn: "C3: ApiGateway ProblemDetails",
        labelVi: "C3: Soi ApiGateway Error & OTel",
        targetView: "COMPONENT",
        targetServiceName: "ApiGateway",
        targetNodeName: "GlobalExceptionHandler",
      },
      {
        id: "csharp-m4-c2-otel",
        labelEn: "C2: OpenTelemetry Trace",
        labelVi: "C2: Tuyến OTLP Trace",
        targetView: "CONTAINER",
        targetNodeName: "Observability Platform (OpenTelemetry)",
      },
    ],
  },
  5: {
    moduleIndex: 5,
    track: "CSHARP",
    stepTitleEn: "Overall Architecture & Production-Readiness Audit",
    stepTitleVi: "Kiểm toán Tổng thể Kiến trúc & Production-Readiness",
    stepDescriptionEn:
      "Review all 4 .NET 8 services, isolated DB/Redis stores, RabbitMQ Outbox, Polly v8, and OpenTelemetry readiness.",
    stepDescriptionVi:
      "Rà soát toàn cảnh 4 service .NET 8, cô lập DB/Redis, RabbitMQ Outbox, Polly v8 và OpenTelemetry cho Production-Readiness.",
    summaryEn:
      "Module 5 Focus: Full .NET 8 overview across 4 production pillars — DB Isolation, Stateless Scaling, Async & Polly v8, OpenTelemetry.",
    summaryVi:
      "Tiêu điểm Module 5: Rà soát tổng thể 100% kiến trúc .NET 8 theo 4 trụ cột Production-Readiness.",
    defaultView: "CONTAINER",
    dimOthersByDefault: false,
    defaultGraphHiddenCategories: [],
    focusNodeNames: [],
    readinessPillars: [
      { id: "db-isolation", labelEn: "DB & Redis Isolation", labelVi: "Cô lập DB" },
      { id: "stateless-scaling", labelEn: "Stateless Scaling", labelVi: "Stateless Scaling" },
      {
        id: "async-polly",
        labelEn: "RabbitMQ + Polly v8",
        labelVi: "Async & Circuit Breaker",
      },
      { id: "otel", labelEn: "OpenTelemetry .NET", labelVi: "Observability" },
    ],
    quickChips: [
      {
        id: "csharp-m5-c2",
        labelEn: "C2: Full System Overview",
        labelVi: "C2: Toàn cảnh Hệ thống",
        targetView: "CONTAINER",
      },
      {
        id: "csharp-m5-c3-ordering",
        labelEn: "C3: FruitOrdering.API",
        labelVi: "C3: FruitOrdering.API",
        targetView: "COMPONENT",
        targetServiceName: "FruitOrdering.API",
      },
      {
        id: "csharp-m5-graph-all",
        labelEn: "Graph: All Nodes",
        labelVi: "Đồ thị: Toàn bộ thành phần",
        targetView: "GRAPH",
        graphHiddenCategories: [],
      },
    ],
  },
};
