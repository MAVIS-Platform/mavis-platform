const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

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
  extractRepoEndpointOptions,
  buildStudentExerciseInstructions,
} = require("../src/features/runtime/studio-authoring-helpers.ts");
const {
  buildSmartSnapshotPlan,
} = require("../src/features/runtime/studio-smart-snapshot.ts");
const {
  expandModuleFlowItems,
} = require("../src/features/courses/module-steps.ts");

test("F-17: extractRepoEndpointOptions filters internal non-gateway and -sim routes when gateway routes exist", () => {
  const options = extractRepoEndpointOptions({
    detectedEndpoints: [
      { method: "GET", service: "api-gateway", path: "/api/v1/checkout/live-flow" },
      { method: "GET", service: "api-gateway", path: "/api/v1/storefront/live-flow" },
      { method: "GET", service: "api-gateway", path: "/api/v1/orders/overview" },
      { method: "GET", service: "order-service", path: "/api/v1/orders/checkout-sim" },
      { method: "GET", service: "api-gateway", path: "/api/v1/chaos/fail" },
    ],
  });
  const paths = options.map((ep) => ep.path);
  assert.ok(paths.includes("/api/v1/checkout/live-flow"));
  assert.ok(paths.includes("/api/v1/orders/overview"));
  assert.ok(!paths.includes("/api/v1/orders/checkout-sim"), "must exclude -sim and internal service routes");
  assert.ok(!paths.includes("/api/v1/chaos/fail"), "must exclude chaos/fail routes");
});

test("F-10 & F-19: buildStudentExerciseInstructions includes RESUME recovery step and extra composable rules", () => {
  const impactVi = buildStudentExerciseInstructions({
    exerciseType: "CHANGE_IMPACT",
    targetAction: { action: "PAUSE", service: "payment-service" },
    predictionRequired: true,
    maxErrorRatePercent: 5,
    maxP95Ms: 1500,
    locale: "vi",
  });
  assert.match(impactVi, /PAUSE/);
  assert.match(impactVi, /RESUME/);
  assert.match(impactVi, /1500 ms/);

  const compoundVi = buildStudentExerciseInstructions({
    exerciseType: "CUSTOM",
    stoppedServices: ["fraud-service"],
    initialCpuLimits: { "inventory-service": 25 },
    initialLoadRps: 30,
    predictionRequired: true,
    predictionMode: "ROOT_CAUSE",
    maxActions: 4,
    maxErrorRatePercent: 0,
    maxP95Ms: 1500,
    rules: [
      { metric: "REPLICAS", target: "inventory-service", operator: "GTE", threshold: 2 },
      { metric: "P95_DELTA_PCT", target: "ALL", operator: "LTE", threshold: -20 },
    ],
    locale: "vi",
  });
  assert.match(compoundVi, /inventory-service.*>= 2x/);
  assert.match(compoundVi, /giảm độ trễ p95.*20%/i);
});

test("F-09: buildSmartSnapshotPlan hides liveDownService focus for students before first action on Outage Recovery", () => {
  const plan = buildSmartSnapshotPlan(
    {
      executionStatus: "RUNNING",
      actions: [],
      exerciseCriteria: { exerciseType: "CIRCUIT_BREAKER" },
      topology: {
        version: 1,
        blocks: [{ service: "payment-service", label: "payment", initiallyStopped: true }],
        connections: [],
      },
      telemetry: {
        observedAt: "2026-11-28T01:00:00Z",
        services: [{ service: "payment-service", replicas: 1, runningReplicas: 0, stats: [], logs: "" }],
        spans: [],
        interactions: [],
      },
    },
    { locale: "vi", includeAutoCheck: false },
  );
  assert.equal(plan.primaryService, null);
});

test("F-07 & F-08: expandModuleFlowItems keeps inline Quiz in authored position and distinguishes multi-lab C1-C3 titles", () => {
  const items = [
    { id: "lab-1", type: "RUNTIME_LAB", title: "Lab 01 Easy", position: 1, assignmentId: "a1", required: true },
    { id: "quiz-mid", type: "QUIZ", title: "Quiz Gate Lab 02", position: 2, assignmentId: null, required: true },
    { id: "lab-2", type: "RUNTIME_LAB", title: "Lab 02 Medium", position: 3, assignmentId: "a2", required: true },
  ];
  const assignments = [
    { id: "a1", title: "Lab 01 Easy", labMode: "THEORY_QUIZ_STUDIO", requireRuntimeTrace: true },
    { id: "a2", title: "Lab 02 Medium", labMode: "THEORY_QUIZ_STUDIO", requireRuntimeTrace: true },
  ];
  const expanded = expandModuleFlowItems(items, assignments, "vi", { modulePosition: 1 });
  const ids = expanded.map((item) => item.id);
  const lab1StudioIdx = ids.indexOf("runtime-studio:a1");
  const quizIdx = ids.indexOf("quiz-mid");
  const lab2StudioIdx = ids.indexOf("runtime-studio:a2");
  assert.ok(lab1StudioIdx >= 0 && quizIdx > lab1StudioIdx && lab2StudioIdx > quizIdx, `Unexpected order: ${ids.join(", ")}`);

  const staticTitles = expanded.filter((item) => item.id.startsWith("static-view:")).map((item) => item.title);
  assert.equal(staticTitles.length, 2);
  assert.notEqual(staticTitles[0], staticTitles[1]);
  assert.ok(staticTitles[0].includes("Lab 01 Easy"));
  assert.ok(staticTitles[1].includes("Lab 02 Medium"));
});
