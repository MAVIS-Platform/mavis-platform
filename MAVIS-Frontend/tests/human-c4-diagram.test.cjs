const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadTsModule(relPath) {
  const fullPath = path.join(root, relPath);
  const src = fs.readFileSync(fullPath, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      const candidate = path.join(root, "src", request.slice(2));
      if (fs.existsSync(candidate + ".ts")) return candidate + ".ts";
      if (fs.existsSync(candidate + ".tsx")) return candidate + ".tsx";
      return candidate;
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
  const origLoadTs = require.extensions[".ts"];
  require.extensions[".ts"] = function (m, filename) {
    const code = fs.readFileSync(filename, "utf8");
    const out = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    m._compile(out, filename);
  };
  try {
    mod._compile(outputText, fullPath);
    return mod.exports;
  } finally {
    Module._resolveFilename = origResolve;
    if (origLoadTs) require.extensions[".ts"] = origLoadTs;
    else delete require.extensions[".ts"];
  }
}

const layoutMod = loadTsModule("src/lib/architecture/human-c4-layout.ts");

function makeFruitMicroservicesModel() {
  return {
    id: "model-fruit-1",
    projectId: "proj-fruit",
    revision: 1,
    elements: [
      { id: "svc-order", name: "fruit-order-service", elementType: "SERVICE_CONTAINER", technology: "JAVA_SPRING" },
      { id: "svc-payment", name: "fruit-payment-service", elementType: "SERVICE_CONTAINER", technology: "JAVA_SPRING" },
      { id: "svc-catalog", name: "fruit-catalog-service", elementType: "SERVICE_CONTAINER", technology: "JAVA_SPRING" },
      { id: "svc-delivery", name: "fruit-delivery-service", elementType: "SERVICE_CONTAINER", technology: "JAVA_SPRING" },
      { id: "db-order", name: "fruit-order-db", elementType: "DATABASE", technology: "POSTGRESQL" },
      { id: "db-payment", name: "fruit-payment-db", elementType: "DATABASE", technology: "POSTGRESQL" },
      { id: "db-catalog", name: "fruit-catalog-db", elementType: "DATABASE", technology: "POSTGRESQL" },
      { id: "broker-mq", name: "fruit-rabbitmq", elementType: "MESSAGE_CHANNEL", technology: "RABBITMQ" },
      // Components inside fruit-order-service
      {
        id: "cmp-order-ctrl",
        parentId: "svc-order",
        name: "FruitOrderController",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
        properties: { responsibility: "Exposes HTTP endpoints" },
      },
      {
        id: "cmp-order-svc",
        parentId: "svc-order",
        name: "FruitOrderService",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
      },
      {
        id: "cmp-order-repo",
        parentId: "svc-order",
        name: "FruitOrderRepository",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
      },
      {
        id: "cmp-pay-feign",
        parentId: "svc-order",
        name: "FruitPaymentFeignClient",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
        properties: { clientTarget: "fruit-payment-service", annotations: ["@FeignClient"] },
      },
    ],
    edges: [
      // Duplicate parallel edges between fruit-order-service and fruit-payment-service!
      { id: "e-http-1", from: "svc-order", to: "svc-payment", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
      { id: "e-cfg-1", from: "svc-order", to: "svc-payment", protocol: "CONFIGURED_ENDPOINT", originLayer: "STATIC" },
      { id: "e-http-2", from: "svc-order", to: "svc-catalog", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
      { id: "e-cfg-2", from: "svc-order", to: "svc-catalog", protocol: "CONFIGURED_ENDPOINT", originLayer: "STATIC" },
      { id: "e-http-3", from: "svc-order", to: "svc-delivery", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
      // Duplicate DB access + configured endpoint!
      { id: "e-db-1", from: "svc-order", to: "db-order", protocol: "DATABASE_ACCESS", originLayer: "STATIC" },
      { id: "e-db-cfg-1", from: "svc-order", to: "db-order", protocol: "CONFIGURED_ENDPOINT", originLayer: "STATIC" },
      { id: "e-db-2", from: "svc-payment", to: "db-payment", protocol: "DATABASE_ACCESS", originLayer: "STATIC" },
      { id: "e-db-3", from: "svc-catalog", to: "db-catalog", protocol: "DATABASE_ACCESS", originLayer: "STATIC" },
      { id: "e-mq-1", from: "svc-order", to: "broker-mq", protocol: "MESSAGE_PUBLISH", originLayer: "STATIC" },
      // Deployment noise that must NOT pollute C2
      { id: "e-compose-1", from: "svc-order", to: "db-order", protocol: "DECLARED_COMPOSE", originLayer: "DEPLOYMENT" },
      // Component edges (including duplicate CODE_DEPENDENCY!)
      { id: "ec-1", from: "cmp-order-ctrl", to: "cmp-order-svc", protocol: "CODE_DEPENDENCY", originLayer: "STATIC" },
      { id: "ec-1-dup", from: "cmp-order-ctrl", to: "cmp-order-svc", protocol: "CODE_DEPENDENCY", originLayer: "STATIC" },
      { id: "ec-2", from: "cmp-order-svc", to: "cmp-order-repo", protocol: "CODE_DEPENDENCY", originLayer: "STATIC" },
      { id: "ec-3", from: "cmp-order-svc", to: "cmp-pay-feign", protocol: "CODE_DEPENDENCY", originLayer: "STATIC" },
      { id: "ec-4", from: "cmp-order-repo", to: "db-order", protocol: "DATABASE_ACCESS", originLayer: "STATIC" },
      { id: "ec-5", from: "cmp-pay-feign", to: "svc-payment", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
      { id: "ec-5-dup", from: "cmp-pay-feign", to: "svc-payment", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
    ],
  };
}

test("Human C1 System Context replaces gibberish lab titles with real project domain name and draws grounded actors & backing infra", () => {
  const model = makeFruitMicroservicesModel();
  const scene = layoutMod.buildHumanC4Scene(model, "CONTEXT", {
    systemName: "fvdbgvfb",
    locale: "vi",
  });
  const sysNode = scene.nodes.find((n) => n.shape === "system");
  assert.ok(sysNode, "C1 must contain a Software System node");
  assert.doesNotMatch(sysNode.name, /fvdbgvfb/i, "Random gibberish lab title must be replaced by real project domain name");
  assert.match(sysNode.name, /Fruit/i);
  assert.ok(scene.nodes.some((n) => n.shape === "person"), "C1 must show grounded consumer actor");
  assert.ok(scene.nodes.some((n) => n.shape === "database"), "C1 must show detected database cluster");
  assert.ok(scene.nodes.some((n) => n.shape === "broker"), "C1 must show detected message broker");
  assert.ok(scene.edges.length >= 3, "C1 must connect actor -> system -> databases & broker");
});

test("Human C2 Container consolidates duplicate parallel wires, tiers orchestrator above downstream services, and excludes compose noise", () => {
  const model = makeFruitMicroservicesModel();
  const scene = layoutMod.buildHumanC4Scene(model, "CONTAINER", {
    systemName: "fvdbgvfb",
    locale: "vi",
  });
  // Verify ZERO duplicate edges for any (from, to) pair!
  const pairSet = new Set();
  for (const edge of scene.edges) {
    const key = `${edge.from}->${edge.to}`;
    assert.ok(!pairSet.has(key), `Duplicate parallel edge found in C2: ${key}`);
    pairSet.add(key);
    assert.notEqual(edge.protocol, "DECLARED_COMPOSE", "Compose startup noise must stay out of C2");
  }
  // Verify fruit-order-service -> fruit-payment-service was consolidated with both underlying IDs preserved!
  const orderToPay = scene.edges.find((e) => e.from === "svc-order" && e.to === "svc-payment");
  assert.ok(orderToPay, "Expected consolidated edge from fruit-order-service to fruit-payment-service");
  assert.equal(orderToPay.protocol, "SERVICE_HTTP_CALL");
  assert.ok(orderToPay.underlyingEdgeIds.includes("e-http-1"));
  assert.ok(orderToPay.underlyingEdgeIds.includes("e-cfg-1"));

  // Verify orchestrator tiering: fruit-order-service sits ABOVE downstream services!
  const orderNode = scene.nodes.find((n) => n.id === "svc-order");
  const payNode = scene.nodes.find((n) => n.id === "svc-payment");
  const dbOrderNode = scene.nodes.find((n) => n.id === "db-order");
  assert.ok(orderNode.y < payNode.y, "Orchestrator fruit-order-service should be placed on Tier 1 above downstream services");
  assert.ok(payNode.y < dbOrderNode.y, "Databases should sit cleanly on Tier 3 below services");
  assert.equal(dbOrderNode.shape, "database");
});

test("Human C3 Component lays out Controller -> Service -> Repository/FeignClient -> External left-to-right with zero duplicate wires", () => {
  const model = makeFruitMicroservicesModel();
  const scene = layoutMod.buildHumanC4Scene(model, "COMPONENT", {
    containerId: "svc-order",
    locale: "vi",
  });
  const ctrl = scene.nodes.find((n) => n.id === "cmp-order-ctrl");
  const svc = scene.nodes.find((n) => n.id === "cmp-order-svc");
  const repo = scene.nodes.find((n) => n.id === "cmp-order-repo");
  const feign = scene.nodes.find((n) => n.id === "cmp-pay-feign");
  const extDb = scene.nodes.find((n) => n.id === "db-order");
  const extPay = scene.nodes.find((n) => n.id === "svc-payment");

  assert.ok(ctrl && svc && repo && feign && extDb && extPay, "All C3 layers & external neighbors must be present");
  assert.ok(ctrl.x < svc.x, "Controller (Col 0) must sit left of Service (Col 1)");
  assert.ok(svc.x < repo.x, "Service (Col 1) must sit left of Repository (Col 2)");
  assert.ok(repo.x < extDb.x, "Repository (Col 2) must sit left of External DB (Col 3)");
  assert.ok(feign.x < extPay.x, "FeignClient (Col 2) must sit left of Downstream Service (Col 3)");

  // Verify zero duplicate arrows in C3!
  const pairSet = new Set();
  for (const edge of scene.edges) {
    const key = `${edge.from}->${edge.to}`;
    assert.ok(!pairSet.has(key), `Duplicate arrow found in C3: ${key}`);
    pairSet.add(key);
  }

  // Verify zero overlapping edge label pills!
  for (let i = 0; i < scene.edges.length; i++) {
    for (let j = i + 1; j < scene.edges.length; j++) {
      const a = scene.edges[i];
      const b = scene.edges[j];
      const overlapX = Math.abs(a.labelX - b.labelX) < (a.labelWidth + b.labelWidth) / 2;
      const overlapY = Math.abs(a.labelY - b.labelY) < (a.labelHeight + b.labelHeight) / 2;
      assert.ok(!(overlapX && overlapY), `Overlapping C3 edge labels: ${a.id} vs ${b.id}`);
    }
  }
});

test("ArchitectureDiagrams defaults guidedStatic C1-C3 views to HumanC4Diagram with toggle to Draw.io", () => {
  const archDiagrams = fs.readFileSync(
    path.join(root, "src/features/architecture/architecture-diagrams.tsx"),
    "utf8",
  );
  assert.match(archDiagrams, /import \{ HumanC4Diagram \} from "\.\/human-c4-diagram"/);
  assert.match(archDiagrams, /useState<"human" \| "drawio">\([\s\S]*guidedStatic \? "human" : "drawio"/);
  assert.match(archDiagrams, /<HumanC4Diagram/);
});
