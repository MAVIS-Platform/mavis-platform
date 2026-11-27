import type { AuditModuleNumber, ModuleAuditLens } from "./module-audit-lens";

export const JAVA_AUDIT_LENSES: Record<AuditModuleNumber, ModuleAuditLens> = {
  1: {
    moduleIndex: 1,
    track: "JAVA",
    stepTitleEn: "Audit C1–C3 Decomposition & Bounded Context",
    stepTitleVi: "Kiểm toán Phân rã C1–C3 & Bounded Context",
    stepDescriptionEn:
      "Inspect C1 System Context actors, C2 Bounded Contexts, and clean 3-tier C3 boundaries.",
    stepDescriptionVi:
      "Kiểm tra 3 tác nhân C1 System Context, 6 Bounded Contexts C2 và phân tầng C3 sạch.",
    summaryEn:
      "Module 1 Focus: Verify the 3 Actors, central system boundary, and clean domain decomposition across 6 Java services.",
    summaryVi:
      "Tiêu điểm Module 1: Đối chiếu 3 tác nhân (Admin, Staff, Customer), ranh giới hệ thống và phân rã 6 Bounded Contexts.",
    defaultView: "CONTEXT",
    dimOthersByDefault: true,
    focusNodeNames: [
      "Admin",
      "Staff",
      "Customer",
      "Observability Platform (OpenTelemetry)",
      "service-discovery",
      "api-gateway",
      "identity-service",
      "catalog-service",
      "order-service",
      "notification-service",
    ],
    quickChips: [
      {
        id: "java-m1-c2",
        labelEn: "C2: 6 Bounded Contexts",
        labelVi: "C2: Soi 6 Bounded Contexts",
        targetView: "CONTAINER",
      },
      {
        id: "java-m1-c3-identity",
        labelEn: "C3: identity-service",
        labelVi: "C3: Soi identity-service",
        targetView: "COMPONENT",
        targetServiceName: "identity-service",
        targetNodeName: "AuthController",
      },
    ],
  },
  2: {
    moduleIndex: 2,
    track: "JAVA",
    stepTitleEn: "Dependency & Reverse BFS Impact Analysis · Gateway & OpenFeign",
    stepTitleVi: "Phân tích Phụ thuộc & Tác động Reverse BFS · Gateway & OpenFeign",
    stepDescriptionEn:
      "Trace synchronous Gateway routing, Eureka registration, and OpenFeign upstream impact via Reverse BFS.",
    stepDescriptionVi:
      "Truy vết luồng gọi đồng bộ Spring Cloud Gateway, Eureka và vùng ảnh hưởng Reverse BFS qua OpenFeign.",
    summaryEn:
      "Module 2 Focus: Inspect synchronous Gateway routing, Eureka discovery, and Reverse BFS impact from catalog-service.",
    summaryVi:
      "Tiêu điểm Module 2: Soi định tuyến Gateway, Eureka và chọn catalog-service để tính ảnh hưởng ngược Reverse BFS tới order-service.",
    defaultView: "GRAPH",
    defaultSelectedNodeName: "catalog-service",
    dimOthersByDefault: true,
    defaultGraphHiddenCategories: ["database", "messaging", "component", "external", "unknown"],
    focusNodeNames: ["api-gateway", "service-discovery", "order-service", "catalog-service"],
    focusEdgeProtocols: ["GATEWAY_ROUTE", "SERVICE_DISCOVERY", "SERVICE_HTTP_CALL"],
    quickChips: [
      {
        id: "java-m2-graph-catalog",
        labelEn: "Reverse BFS: catalog-service",
        labelVi: "Reverse BFS: catalog-service",
        targetView: "GRAPH",
        targetNodeName: "catalog-service",
        graphHiddenCategories: ["database", "messaging", "component", "external", "unknown"],
      },
      {
        id: "java-m2-c2-gateway",
        labelEn: "C2: api-gateway & Eureka",
        labelVi: "C2: Soi api-gateway & Eureka",
        targetView: "CONTAINER",
        targetNodeName: "api-gateway",
      },
      {
        id: "java-m2-c3-feign",
        labelEn: "C3: CatalogFeignClient",
        labelVi: "C3: Soi CatalogFeignClient",
        targetView: "COMPONENT",
        targetServiceName: "order-service",
        targetNodeName: "CatalogFeignClient",
      },
    ],
  },
  3: {
    moduleIndex: 3,
    track: "JAVA",
    stepTitleEn: "Audit Database-per-Service, Kafka Outbox & Saga",
    stepTitleVi: "Kiểm toán Database-per-Service, Kafka Outbox & Saga",
    stepDescriptionEn:
      "Verify isolated PostgreSQL/Redis ownership per service, Kafka event channels, and Saga Outbox persistence.",
    stepDescriptionVi:
      "Kiểm tra cô lập PostgreSQL/Redis theo từng service, kênh sự kiện Kafka và Transactional Outbox + Saga.",
    summaryEn:
      "Module 3 Focus: Verify Database-per-Service isolation, Kafka async event channels, and Transactional Outbox.",
    summaryVi:
      "Tiêu điểm Module 3: Soi cô lập Database riêng từng service, kênh Kafka bất đồng bộ và Saga Outbox.",
    defaultView: "CONTAINER",
    dimOthersByDefault: true,
    defaultGraphHiddenCategories: ["component", "external", "unknown"],
    focusNodeNames: [
      "identity-db",
      "catalog-db",
      "order-db",
      "notification-db",
      "redis",
      "kafka",
      "identity-service",
      "catalog-service",
      "order-service",
      "notification-service",
      "OutboxEventPublisher",
      "OrderSagaOrchestrator",
      "OrderEventConsumer",
    ],
    focusEdgeProtocols: ["DATABASE_ACCESS", "MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE"],
    quickChips: [
      {
        id: "java-m3-c3-order",
        labelEn: "C3: Outbox & Saga (order-service)",
        labelVi: "C3: Outbox & Saga (order-service)",
        targetView: "COMPONENT",
        targetServiceName: "order-service",
        targetNodeName: "OutboxEventPublisher",
      },
      {
        id: "java-m3-graph-db-mq",
        labelEn: "Graph: DB + Messaging",
        labelVi: "Đồ thị: Bật DB & Kafka",
        targetView: "GRAPH",
        targetNodeName: "kafka",
        graphHiddenCategories: ["component", "external", "unknown"],
      },
      {
        id: "java-m3-c3-notification",
        labelEn: "C3: OrderEventConsumer",
        labelVi: "C3: Soi OrderEventConsumer",
        targetView: "COMPONENT",
        targetServiceName: "notification-service",
        targetNodeName: "OrderEventConsumer",
      },
    ],
  },
  4: {
    moduleIndex: 4,
    track: "JAVA",
    stepTitleEn: "Inspect Resilience4j Fault Tolerance & OpenTelemetry Trace",
    stepTitleVi: "Soi điểm Chịu lỗi Resilience4j & Tuyến OpenTelemetry Trace",
    stepDescriptionEn:
      "Inspect @CircuitBreaker/@Retry/@Bulkhead guards in order-service and OTLP trace export to Observability.",
    stepDescriptionVi:
      "Soi cơ chế @CircuitBreaker/@Retry/@Bulkhead trong order-service và tuyến xuất OTLP trace ra Observability.",
    summaryEn:
      "Module 4 Focus: Inspect Resilience4j fault isolation in order-service and OpenTelemetry OTLP trace export.",
    summaryVi:
      "Tiêu điểm Module 4: Soi lớp bảo vệ Resilience4j (CatalogIntegrationService) và tuyến xuất OTLP traces.",
    defaultView: "COMPONENT",
    defaultC3ServiceName: "order-service",
    defaultSelectedNodeName: "CatalogIntegrationService",
    dimOthersByDefault: true,
    focusNodeNames: [
      "CatalogIntegrationService",
      "CatalogFeignClient",
      "OrderSagaOrchestrator",
      "Observability Platform (OpenTelemetry)",
      "api-gateway",
      "order-service",
      "CorrelationIdGatewayFilter",
    ],
    focusEdgeProtocols: ["TRACING_EXPORT", "SERVICE_HTTP_CALL"],
    quickChips: [
      {
        id: "java-m4-c3-resilience",
        labelEn: "C3: CatalogIntegrationService",
        labelVi: "C3: Soi Resilience4j",
        targetView: "COMPONENT",
        targetServiceName: "order-service",
        targetNodeName: "CatalogIntegrationService",
      },
      {
        id: "java-m4-c2-otel",
        labelEn: "C2: OpenTelemetry Trace",
        labelVi: "C2: Tuyến OTLP Trace",
        targetView: "CONTAINER",
        targetNodeName: "Observability Platform (OpenTelemetry)",
      },
      {
        id: "java-m4-c3-gateway",
        labelEn: "C3: CorrelationId Filter",
        labelVi: "C3: Filter CorrelationId",
        targetView: "COMPONENT",
        targetServiceName: "api-gateway",
        targetNodeName: "CorrelationIdGatewayFilter",
      },
    ],
  },
  5: {
    moduleIndex: 5,
    track: "JAVA",
    stepTitleEn: "Overall Architecture & Production-Readiness Audit",
    stepTitleVi: "Kiểm toán Tổng thể Kiến trúc & Production-Readiness",
    stepDescriptionEn:
      "Review all 6 services, isolated DBs, Resilience4j, Kafka Outbox, and OpenTelemetry for production readiness.",
    stepDescriptionVi:
      "Rà soát toàn cảnh 6 service, cô lập DB, Resilience4j, Kafka Outbox và OpenTelemetry cho Production-Readiness.",
    summaryEn:
      "Module 5 Focus: Full-system overview across 4 production pillars — DB Isolation, Stateless Scaling, Async & Circuit Breaker, Observability.",
    summaryVi:
      "Tiêu điểm Module 5: Rà soát tổng thể 100% kiến trúc theo 4 trụ cột Production-Readiness.",
    defaultView: "CONTAINER",
    dimOthersByDefault: false,
    defaultGraphHiddenCategories: [],
    focusNodeNames: [],
    readinessPillars: [
      { id: "db-isolation", labelEn: "DB Isolation", labelVi: "Cô lập DB" },
      { id: "stateless-scaling", labelEn: "Stateless Scaling", labelVi: "Stateless Scaling" },
      {
        id: "async-cb",
        labelEn: "Kafka + Resilience4j",
        labelVi: "Async & Circuit Breaker",
      },
      { id: "otel", labelEn: "OpenTelemetry", labelVi: "Observability" },
    ],
    quickChips: [
      {
        id: "java-m5-c2",
        labelEn: "C2: Full System Overview",
        labelVi: "C2: Toàn cảnh Hệ thống",
        targetView: "CONTAINER",
      },
      {
        id: "java-m5-c3-order",
        labelEn: "C3: order-service",
        labelVi: "C3: order-service",
        targetView: "COMPONENT",
        targetServiceName: "order-service",
      },
      {
        id: "java-m5-graph-all",
        labelEn: "Graph: All Nodes",
        labelVi: "Đồ thị: Toàn bộ thành phần",
        targetView: "GRAPH",
        graphHiddenCategories: [],
      },
    ],
  },
};
