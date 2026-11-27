const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

if (!require.extensions[".ts"]) {
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
}

const {
  JAVA_AUDIT_LENSES,
} = require("../src/features/architecture/java-audit-lenses.ts");
const {
  CSHARP_AUDIT_LENSES,
} = require("../src/features/architecture/csharp-audit-lenses.ts");
const {
  adaptAuditLensToModel,
  computeActiveLensFocus,
  detectAuditTrack,
  resolveModelElementByName,
  resolveModuleAuditLens,
  resolveModuleIndex,
} = require("../src/features/architecture/module-audit-lens.ts");
const {
  isSvgNodeFocused,
  isSvgEdgeFocused,
} = require("../src/features/architecture/architecture-svg-viewer.tsx");
const {
  expandModuleFlowItems,
  resolveModuleFlowKind,
  resolveStaticAuditStepTitle,
} = require("../src/features/courses/module-steps.ts");

function buildJavaSampleModel() {
  return {
    id: "model-java-1",
    projectId: "proj-java",
    revision: 1,
    origin: "REFERENCE",
    elements: [
      { id: "sys:java", name: "Mộc Hương Shop Platform", elementType: "SOFTWARE_SYSTEM", layer: "platform" },
      { id: "actor-admin", name: "Admin", elementType: "PERSON", layer: "edge" },
      { id: "actor-staff", name: "Staff", elementType: "PERSON", layer: "edge" },
      { id: "actor-customer", name: "Customer", elementType: "PERSON", layer: "edge" },
      { id: "ext-otel", name: "Observability Platform (OpenTelemetry)", elementType: "EXTERNAL_SYSTEM", layer: "platform" },
      { id: "svc-gw", name: "api-gateway", elementType: "SERVICE_CONTAINER", layer: "edge" },
      { id: "svc-eureka", name: "service-discovery", elementType: "SERVICE_CONTAINER", layer: "platform" },
      { id: "svc-id", name: "identity-service", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "svc-cat", name: "catalog-service", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "svc-ord", name: "order-service", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "svc-noti", name: "notification-service", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "db-ord", name: "order-db", elementType: "DATABASE", layer: "data" },
      { id: "mq-kafka", name: "kafka", elementType: "QUEUE_BROKER", layer: "platform" },
      { id: "cmp-auth", name: "AuthController", elementType: "COMPONENT", parentId: "svc-id", layer: "domain" },
      { id: "cmp-gw-corr", name: "CorrelationIdGatewayFilter", elementType: "COMPONENT", parentId: "svc-gw", layer: "edge" },
      { id: "cmp-feign", name: "CatalogFeignClient", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-cb", name: "CatalogIntegrationService", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-outbox", name: "OutboxEventPublisher", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-saga", name: "OrderSagaOrchestrator", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-cons", name: "OrderEventConsumer", elementType: "COMPONENT", parentId: "svc-noti", layer: "domain" },
    ],
    edges: [
      { id: "e-gw-ord", from: "svc-gw", to: "svc-ord", protocol: "GATEWAY_ROUTE" },
      { id: "e-ord-eur", from: "svc-ord", to: "svc-eureka", protocol: "SERVICE_DISCOVERY" },
      { id: "e-ord-cat", from: "svc-ord", to: "svc-cat", protocol: "SERVICE_HTTP_CALL" },
      { id: "e-ord-db", from: "svc-ord", to: "db-ord", protocol: "DATABASE_ACCESS" },
      { id: "e-ord-kafka", from: "svc-ord", to: "mq-kafka", protocol: "MESSAGE_PUBLISH" },
      { id: "e-noti-kafka", from: "svc-noti", to: "mq-kafka", protocol: "MESSAGE_SUBSCRIBE" },
      { id: "e-ord-otel", from: "svc-ord", to: "ext-otel", protocol: "TRACING_EXPORT" },
    ],
  };
}

function buildCsharpSampleModel() {
  return {
    id: "model-cs-1",
    projectId: "proj-cs",
    revision: 1,
    origin: "REFERENCE",
    elements: [
      { id: "sys:cs", name: "Project Trái Cây Platform", elementType: "SOFTWARE_SYSTEM", layer: "platform" },
      { id: "actor-admin", name: "Admin", elementType: "PERSON", layer: "edge" },
      { id: "actor-staff", name: "Staff", elementType: "PERSON", layer: "edge" },
      { id: "actor-customer", name: "Customer", elementType: "PERSON", layer: "edge" },
      { id: "ext-otel", name: "Observability Platform (OpenTelemetry)", elementType: "EXTERNAL_SYSTEM", layer: "platform" },
      { id: "svc-gw", name: "ApiGateway", elementType: "SERVICE_CONTAINER", layer: "edge" },
      { id: "svc-cat", name: "FruitCatalog.API", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "svc-bsk", name: "FruitBasket.API", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "svc-ord", name: "FruitOrdering.API", elementType: "SERVICE_CONTAINER", layer: "domain" },
      { id: "db-ord", name: "ordering-db", elementType: "DATABASE", layer: "data" },
      { id: "mq-rmq", name: "rabbitmq", elementType: "QUEUE_BROKER", layer: "platform" },
      { id: "cmp-cat-ctrl", name: "CatalogItemsController", elementType: "COMPONENT", parentId: "svc-cat", layer: "domain" },
      { id: "cmp-gw-err", name: "GlobalExceptionHandler", elementType: "COMPONENT", parentId: "svc-gw", layer: "edge" },
      { id: "cmp-gw-yarp", name: "YarpReverseProxyPipeline", elementType: "COMPONENT", parentId: "svc-gw", layer: "edge" },
      { id: "cmp-polly-cat", name: "CatalogApiClient", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-polly-bsk", name: "BasketApiClient", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-outbox", name: "OutboxRelayBackgroundService", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-saga", name: "OrderSagaService", elementType: "COMPONENT", parentId: "svc-ord", layer: "domain" },
      { id: "cmp-cons", name: "OrderCreatedConsumer", elementType: "COMPONENT", parentId: "svc-bsk", layer: "domain" },
    ],
    edges: [
      { id: "e-gw-ord", from: "svc-gw", to: "svc-ord", protocol: "GATEWAY_ROUTE" },
      { id: "e-ord-cat", from: "svc-ord", to: "svc-cat", protocol: "SERVICE_HTTP_CALL" },
      { id: "e-ord-db", from: "svc-ord", to: "db-ord", protocol: "DATABASE_ACCESS" },
      { id: "e-ord-rmq", from: "svc-ord", to: "mq-rmq", protocol: "MESSAGE_PUBLISH" },
      { id: "e-bsk-rmq", from: "svc-bsk", to: "mq-rmq", protocol: "MESSAGE_SUBSCRIBE" },
      { id: "e-ord-otel", from: "svc-ord", to: "ext-otel", protocol: "TRACING_EXPORT" },
    ],
  };
}

test("WF-02: Java & C# Modules 1..5 define distinct Audit Lenses, default tabs, filters, and zero repetitive labels", () => {
  const expectedViews = {
    1: "CONTEXT",
    2: "GRAPH",
    3: "CONTAINER",
    4: "COMPONENT",
    5: "CONTAINER",
  };

  for (const track of ["JAVA", "CSHARP"]) {
    const viTitles = new Set();
    const enTitles = new Set();
    for (const mod of [1, 2, 3, 4, 5]) {
      const lens = resolveModuleAuditLens(track, mod);
      assert.equal(lens.track, track);
      assert.equal(lens.moduleIndex, mod);
      assert.equal(lens.defaultView, expectedViews[mod]);
      assert.doesNotMatch(lens.stepTitleVi, /Khám phá Sơ đồ Tĩnh/i);
      assert.doesNotMatch(lens.stepTitleEn, /Explore Static Diagrams/i);
      assert.ok(lens.quickChips.length >= 2, `${track} M${mod} must expose quick-jump chips`);
      viTitles.add(lens.stepTitleVi);
      enTitles.add(lens.stepTitleEn);
    }
    assert.equal(viTitles.size, 5, `${track} VI titles must be distinct across 5 modules`);
    assert.equal(enTitles.size, 5, `${track} EN titles must be distinct across 5 modules`);
  }

  // Module 2: Service-only dependency graph & catalog service pre-selected for Reverse BFS
  const javaM2 = resolveModuleAuditLens("JAVA", 2);
  const csM2 = resolveModuleAuditLens("CSHARP", 2);
  assert.equal(javaM2.defaultSelectedNodeName, "catalog-service");
  assert.equal(csM2.defaultSelectedNodeName, "FruitCatalog.API");
  assert.ok(javaM2.defaultGraphHiddenCategories.includes("database"));
  assert.ok(javaM2.defaultGraphHiddenCategories.includes("messaging"));

  // Module 3: Database and Messaging filters auto-enabled (excluded from hiddenCategories)
  for (const m3 of [resolveModuleAuditLens("JAVA", 3), resolveModuleAuditLens("CSHARP", 3)]) {
    assert.equal(m3.defaultGraphHiddenCategories.includes("database"), false);
    assert.equal(m3.defaultGraphHiddenCategories.includes("messaging"), false);
  }

  // Module 4: Component lens opens order-service (Java) / FruitOrdering.API (C#)
  const javaM4 = resolveModuleAuditLens("JAVA", 4);
  const csM4 = resolveModuleAuditLens("CSHARP", 4);
  assert.equal(javaM4.defaultC3ServiceName, "order-service");
  assert.equal(javaM4.defaultSelectedNodeName, "CatalogIntegrationService");
  assert.equal(csM4.defaultC3ServiceName, "FruitOrdering.API");
  assert.equal(csM4.defaultSelectedNodeName, "CatalogApiClient");

  // Module 5: Full architecture overview with 4 Production-Readiness pillars and no dimming
  for (const m5 of [resolveModuleAuditLens("JAVA", 5), resolveModuleAuditLens("CSHARP", 5)]) {
    assert.equal(m5.dimOthersByDefault, false);
    assert.equal(m5.readinessPillars?.length, 4);
    assert.deepEqual(m5.defaultGraphHiddenCategories, []);
  }
});

test("WF-02: C# Audit Lenses contain zero Java/Spring/Feign/Eureka leakage", () => {
  const serialized = JSON.stringify(CSHARP_AUDIT_LENSES);
  assert.doesNotMatch(serialized, /\b(java|spring|openfeign|feign|eureka|resilience4j)\b/i);
  assert.equal(detectAuditTrack({ workspaceCode: "CSHARP-MS-2026" }), "CSHARP");
  assert.equal(detectAuditTrack({ projectName: "Project Trái Cây Platform" }), "CSHARP");
  assert.equal(detectAuditTrack({ workspaceCode: "JAVA-MS-2026" }), "JAVA");
  assert.equal(resolveModuleIndex({ modulePosition: 4 }), 4);
  assert.equal(resolveModuleIndex({ labTitle: "Studio Lab 03 · Outbox" }), 3);
});

test("WF-02: computeActiveLensFocus and SVG viewer highlight/dim rules resolve target sets cleanly", () => {
  const javaModel = buildJavaSampleModel();
  const csharpModel = buildCsharpSampleModel();

  const javaM2Focus = computeActiveLensFocus(JAVA_AUDIT_LENSES[2], javaModel);
  assert.ok(javaM2Focus.focusNodeIds.has("svc-gw"));
  assert.ok(javaM2Focus.focusNodeIds.has("svc-eureka"));
  assert.ok(javaM2Focus.focusNodeIds.has("svc-cat"));
  assert.ok(javaM2Focus.focusNodeIds.has("svc-ord"));
  assert.equal(javaM2Focus.focusNodeIds.has("db-ord"), false);
  assert.ok(javaM2Focus.focusEdgeIds.has("e-gw-ord"));
  assert.ok(javaM2Focus.focusEdgeIds.has("e-ord-cat"));
  assert.equal(javaM2Focus.focusEdgeIds.has("e-ord-db"), false);

  const csharpM4Focus = computeActiveLensFocus(CSHARP_AUDIT_LENSES[4], csharpModel);
  assert.ok(csharpM4Focus.focusNodeIds.has("cmp-polly-cat"));
  assert.ok(csharpM4Focus.focusNodeIds.has("cmp-gw-err"));
  assert.ok(csharpM4Focus.focusNodeIds.has("ext-otel"));
  assert.ok(csharpM4Focus.focusEdgeIds.has("e-ord-otel"));
  assert.ok(resolveModelElementByName(csharpModel, "FruitOrdering.API"));

  // SVG focus filter predicate: boundary stays visible, focused nodes stay lit, unfocused dim
  const svgFilter = {
    active: true,
    focusNodeIds: csharpM4Focus.focusNodeIds,
    focusEdgeIds: csharpM4Focus.focusEdgeIds,
  };
  assert.equal(
    isSvgNodeFocused({ id: "b1", mavisId: "b1", shape: "boundary" }, svgFilter),
    true,
  );
  assert.equal(
    isSvgNodeFocused({ id: "cmp-polly-cat", mavisId: "cmp-polly-cat", shape: "card" }, svgFilter),
    true,
  );
  assert.equal(
    isSvgNodeFocused({ id: "mq-rmq", mavisId: "mq-rmq", shape: "channel" }, svgFilter),
    false,
  );
  assert.equal(
    isSvgEdgeFocused(
      { id: "e-ord-otel", mavisId: "projection:e-ord-otel", source: "svc-ord", target: "ext-otel" },
      svgFilter,
    ),
    true,
  );
  assert.equal(
    isSvgEdgeFocused(
      { id: "e-ord-db", mavisId: "e-ord-db", source: "svc-ord", target: "db-ord" },
      svgFilter,
    ),
    false,
  );
  assert.equal(
    isSvgNodeFocused(
      { id: "mq-rmq", mavisId: "mq-rmq", shape: "channel" },
      { ...svgFilter, active: false },
    ),
    true,
  );
});

test("WF-02: expandModuleFlowItems and resolveStaticAuditStepTitle produce distinct step titles while preserving static-view IDs", () => {
  const javaTitles = [];
  const csharpTitles = [];

  for (const mod of [1, 2, 3, 4, 5]) {
    const jExpanded = expandModuleFlowItems(
      [
        { id: `th-j-${mod}`, type: "THEORY", title: `Lesson ${mod}`, position: 1 },
        { id: `q-j-${mod}`, type: "QUIZ", title: `Quiz ${mod}`, position: 2, assignmentId: `java-lab-${mod}` },
        { id: `l-j-${mod}`, type: "RUNTIME_LAB", title: `Lab 0${mod}`, position: 3, assignmentId: `java-lab-${mod}` },
      ],
      [
        {
          id: `java-lab-${mod}`,
          title: `Lab 0${mod}`,
          labMode: mod >= 2 ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ",
          requireRuntimeTrace: mod >= 2,
          referenceSource: { modelId: "m-j", snapshotId: "s-j" },
        },
      ],
      "vi",
      { courseCode: "JAVA-MS-2026", modulePosition: mod },
    );
    const jStatic = jExpanded.find((i) => resolveModuleFlowKind(i) === "STATIC_DIAGRAM");
    assert.ok(jStatic);
    assert.equal(jStatic.id, `static-view:java-lab-${mod}`);
    assert.doesNotMatch(jStatic.title, /Khám phá Sơ đồ Tĩnh/i);
    javaTitles.push(jStatic.title);

    const cExpanded = expandModuleFlowItems(
      [
        { id: `th-c-${mod}`, type: "THEORY", title: `Bai ${mod}`, position: 1 },
        { id: `l-c-${mod}`, type: "RUNTIME_LAB", title: `Lab 0${mod}`, position: 2, assignmentId: `cs-lab-${mod}` },
      ],
      [
        {
          id: `cs-lab-${mod}`,
          title: `Lab 0${mod} (.NET 8)`,
          labMode: "THEORY_QUIZ_STUDIO",
          requireRuntimeTrace: true,
          referenceSource: { modelId: "m-c", snapshotId: "s-c" },
        },
      ],
      "vi",
      { courseCode: "CSHARP-MS-2026", modulePosition: mod },
    );
    const cStatic = cExpanded.find((i) => resolveModuleFlowKind(i) === "STATIC_DIAGRAM");
    assert.ok(cStatic);
    assert.equal(cStatic.id, `static-view:cs-lab-${mod}`);
    assert.doesNotMatch(cStatic.title, /Khám phá Sơ đồ Tĩnh/i);
    csharpTitles.push(cStatic.title);
  }

  assert.equal(new Set(javaTitles).size, 5);
  assert.equal(new Set(csharpTitles).size, 5);

  // Idempotent legacy static step title mapping
  const legacyMapped = resolveStaticAuditStepTitle("Khám phá Sơ đồ Tĩnh · Lab 04", {
    courseCode: "CSHARP-MS-2026",
    modulePosition: 4,
    locale: "vi",
    isStaticStep: true,
  });
  const mappedTwice = resolveStaticAuditStepTitle(legacyMapped, {
    courseCode: "CSHARP-MS-2026",
    modulePosition: 4,
    locale: "vi",
    isStaticStep: true,
  });
  assert.equal(mappedTwice, legacyMapped);
  assert.match(legacyMapped, /Polly v8/i);
});

test("WF-02: Static Studio workspace and Course Syllabus wire ModuleAuditLensBar and track-aware lenses", () => {
  const screens = read("src/features/courses/screens.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const outline = read("src/features/courses/course-outline.tsx");

  assert.match(screens, /ModuleAuditLensBar/);
  assert.match(screens, /focusFilter=\{diagramFocusFilter\}/);
  assert.match(screens, /hiddenCategories=\{graphHiddenCategories\}/);
  assert.match(screens, /lensFocusActive=\{lensFocusEnabled && activeLens\.dimOthersByDefault\}/);
  assert.match(syllabus, /courseCode:\s*workspace\.code/);
  assert.match(outline, /resolveStaticAuditStepTitle/);
});

test("WF-02 parity: DependencyNetwork uses useLocale, C# lenses stay repo-agnostic, and adaptAuditLensToModel maps .NET aliases safely", () => {
  const depNet = read("src/features/architecture/dependency-network.tsx");
  assert.match(depNet, /useLocale/);
  assert.doesNotMatch(depNet, /documentElement\??\.lang/);

  assert.equal(detectAuditTrack({ projectName: "eshop-bookstore-dotnet-microservices" }), "CSHARP");
  assert.equal(
    detectAuditTrack({
      model: {
        id: "m-bs",
        projectId: "p-bs",
        revision: 1,
        label: "Bookstore",
        elements: [
          { id: "s1", name: "Catalog.API", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", parentId: null, properties: {}, evidence: [] },
        ],
        edges: [],
      },
    }),
    "CSHARP",
  );

  for (const mod of [1, 2, 3, 4, 5]) {
    assert.doesNotMatch(CSHARP_AUDIT_LENSES[mod].stepTitleVi, /Project Trái Cây/i);
    assert.doesNotMatch(CSHARP_AUDIT_LENSES[mod].stepTitleEn, /Project Trai Cay/i);
  }

  const csM4 = resolveModuleAuditLens("CSHARP", 4);
  const bookstoreModel = {
    id: "m-bk",
    projectId: "p-bk",
    revision: 1,
    label: "Bookstore .NET",
    elements: [
      { id: "b1", name: "Catalog.API", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", parentId: null, properties: {}, evidence: [] },
      { id: "b2", name: "Ordering.API", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", parentId: null, properties: {}, evidence: [] },
    ],
    edges: [],
  };
  const adaptedM4 = adaptAuditLensToModel(csM4, bookstoreModel);
  assert.equal(adaptedM4.defaultC3ServiceName, "Ordering.API");
  const c3Chip = adaptedM4.quickChips.find((c) => c.targetView === "COMPONENT");
  assert.ok(c3Chip);
  assert.equal(c3Chip.targetServiceName, "Ordering.API");
  assert.equal(c3Chip.targetNodeName, undefined);
  const otelChip = adaptedM4.quickChips.find((c) => c.targetView === "CONTAINER");
  assert.ok(otelChip);
  assert.equal(otelChip.targetNodeName, undefined);
});
