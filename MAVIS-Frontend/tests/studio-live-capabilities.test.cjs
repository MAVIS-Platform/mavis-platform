const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    file,
  );
require.extensions[".tsx"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    file,
  );

const {
  liveCapabilities,
  capabilitySummary,
} = require("../src/features/runtime/studio-live-capabilities.ts");

test("Live parity never presents simulated Sandbox controls as real", () => {
  const capabilities = liveCapabilities({
    hasSession: true,
    hasTopology: true,
    hasTelemetry: true,
    canScale: true,
    hasMeasuredAction: true,
  });
  const state = (id) => capabilities.find((item) => item.id === id).state;

  assert.equal(state("cluster-scenario"), "UNAVAILABLE");
  assert.equal(state("custom-block"), "UNAVAILABLE");
  assert.equal(state("replicas-1-8"), "REAL");
  assert.equal(state("replicas-16-32"), "UNAVAILABLE");
  assert.equal(state("delete-block"), "UNAVAILABLE");
  assert.equal(state("hardware-stress"), "UNAVAILABLE");
  assert.equal(state("resilience-policy"), "OBSERVE");
  assert.equal(state("telemetry"), "OBSERVE");
  assert.equal(state("load-capacity"), "OBSERVE");
  assert.equal(state("prepared-block"), "PREPARED");
  assert.equal(state("service-actions"), "PREPARED");
  assert.ok(capabilities.every((item) => item.reason.trim().length > 0));
});

test("Session facts drive scale, telemetry and block capability states", () => {
  const capabilities = liveCapabilities({
    hasSession: true,
    hasTopology: false,
    hasTelemetry: false,
    canScale: false,
    hasMeasuredAction: false,
  });
  const state = (id) => capabilities.find((item) => item.id === id).state;

  assert.equal(state("replicas-1-8"), "UNAVAILABLE");
  assert.equal(state("telemetry"), "UNAVAILABLE");
  assert.equal(state("load-capacity"), "UNAVAILABLE");
  assert.equal(state("prepared-block"), "REAL");
  assert.equal(state("service-actions"), "REAL");
  assert.equal(state("snapshots"), "REAL");
});

test("No Live session means every surface is unavailable", () => {
  const capabilities = liveCapabilities({
    hasSession: false,
    hasTopology: false,
    hasTelemetry: false,
    canScale: false,
    hasMeasuredAction: false,
  });
  assert.ok(capabilities.every((item) => item.state === "UNAVAILABLE"));
});

test("Capability summary counts every Sandbox surface exactly once", () => {
  const capabilities = liveCapabilities({
    hasSession: true,
    hasTopology: true,
    hasTelemetry: true,
    canScale: true,
    hasMeasuredAction: true,
  });
  const counts = capabilitySummary(capabilities);
  assert.equal(capabilities.length, 13);
  assert.equal(
    counts.REAL + counts.PREPARED + counts.OBSERVE + counts.UNAVAILABLE,
    capabilities.length,
  );
  assert.equal(counts.REAL, 2);
  assert.equal(counts.PREPARED, 2);
  assert.equal(counts.OBSERVE, 3);
  assert.equal(counts.UNAVAILABLE, 6);
});

test("studioState contract preserves simulatedSandbox and derives operationName from Runner httpMethod/route", () => {
  const { validateResponse } = require("../src/lib/api/validate-response.ts");
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";
  const parsed = validateResponse("studioState", { sessionId }, {
    sessionId,
    interactive: true,
    simulatedSandbox: true,
    services: ["orders"],
    finishRequested: false,
    executionStatus: "RUNNING",
    cleanupStatus: "PENDING",
    actions: [],
    telemetry: {
      observedAt: "2026-11-20T19:00:00Z",
      services: [{ service: "orders", replicas: 1, runningReplicas: 1, stats: [], logs: "" }],
      spans: [
        {
          traceId: "a".repeat(32),
          spanId: "1".repeat(16),
          parentSpanId: "0".repeat(16),
          startTimeUnixNano: "1793542700000000000",
          runtimeService: "orders",
          httpMethod: "GET",
          route: "/orders/{id}",
          spanStatus: "Ok",
        },
      ],
      interactions: [],
    },
  });
  assert.equal(parsed.simulatedSandbox, true);
  assert.equal(parsed.telemetry.spans[0].operationName, "GET /orders/{id}");
  assert.equal(parsed.telemetry.spans[0].parentSpanId, "0".repeat(16));
});

test("resolveRunningReplicas reflects post-action container crashes once newer telemetry arrives", () => {
  const originalLoad = Module._load;
  let resolveRunningReplicas;
  try {
    Module._load = function (id, ...args) {
      if (id.endsWith("use-api") || id.endsWith("studio-observability") || id === "@tanstack/react-query") {
        return {};
      }
      return originalLoad.call(this, id, ...args);
    };
    ({ resolveRunningReplicas } = require("../src/features/runtime/use-studio-session.ts"));
  } finally {
    Module._load = originalLoad;
  }

  // Telemetry older than confirmed START -> keep confirmed replica count while waiting for fresh frame
  assert.equal(
    resolveRunningReplicas(
      {
        actions: [{ service: "payment", status: "CONFIRMED", completedAt: "2026-11-20T19:00:10Z", result: { replicasAfter: 1 } }],
        telemetry: { observedAt: "2026-11-20T19:00:05Z", services: [{ service: "payment", runningReplicas: 0 }] },
      },
      "payment",
    ),
    1,
  );

  // Telemetry newer than confirmed START reports 0 running -> container crashed, must show 0 immediately!
  assert.equal(
    resolveRunningReplicas(
      {
        actions: [{ service: "payment", status: "CONFIRMED", completedAt: "2026-11-20T19:00:10Z", result: { replicasAfter: 1 } }],
        telemetry: { observedAt: "2026-11-20T19:00:15Z", services: [{ service: "payment", runningReplicas: 0 }] },
      },
      "payment",
    ),
    0,
  );
});

test("terminal timestamp parser normalizes container UTC logs and comparator is strictly transitive", () => {
  const originalLoad = Module._load;
  let parseTimestampPrefix;
  let compareTerminalEntries;
  try {
    Module._load = function (id, ...args) {
      if (id === "lucide-react" || id.endsWith("button") || id.endsWith("input") || id.endsWith("select")) return {};
      return originalLoad.call(this, id, ...args);
    };
    ({ parseTimestampPrefix, compareTerminalEntries } = require("../src/features/runtime/live-terminal-console.tsx"));
  } finally {
    Module._load = originalLoad;
  }

  const bare = parseTimestampPrefix("2026-11-20 19:22:07.123 INFO Ready");
  const utc = parseTimestampPrefix("2026-11-20T19:22:07.123Z INFO Ready");
  assert.equal(bare.timestampMs, utc.timestampMs);
  assert.equal(bare.body, "INFO Ready");

  const items = [
    { timestampMs: 200, seq: 1 },
    { timestampMs: null, seq: 2 },
    { timestampMs: 100, seq: 3 },
    { timestampMs: null, seq: 0 },
  ];
  for (const a of items) {
    for (const b of items) {
      for (const c of items) {
        if (compareTerminalEntries(a, b) <= 0 && compareTerminalEntries(b, c) <= 0) {
          assert.ok(compareTerminalEntries(a, c) <= 0, "Comparator must satisfy transitivity");
        }
      }
    }
  }
  const sorted = [...items].sort(compareTerminalEntries);
  assert.deepEqual(
    sorted.map((x) => x.seq),
    [3, 1, 0, 2],
  );
});

test("BFF path allowlist opens only GET /studio/stream and blocks runner callback endpoints", () => {
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const sid = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(allowedBackendPath(`analyzer/runtime/sessions/${sid}/studio/stream`), true);
  assert.equal(allowedBackendPath(`analyzer/runtime/sessions/${sid}/studio/ack`), false);
  assert.equal(allowedBackendPath(`analyzer/runtime/sessions/${sid}/studio/telemetry`), false);
  assert.equal(allowedBackendPath(`analyzer/runtime/sessions/${sid}/recovery-result`), false);
});

test("Phase B RED series, 30s before/after window, and trace waterfall compute accurately", () => {
  const {
    buildRedSeries,
    computeBeforeAfterWindow,
    buildTraceWaterfall,
  } = require("../src/features/runtime/studio-red-charts.tsx");

  const t0 = Date.parse("2026-11-20T20:00:00Z");
  const history = [
    { observedAt: new Date(t0).toISOString(), probe: { rps: 5, p50Ms: 10, p95Ms: 20, p99Ms: 30, errorRatePercent: 0 } },
    { observedAt: new Date(t0 + 10_000).toISOString(), probe: { rps: 5, p50Ms: 12, p95Ms: 24, p99Ms: 35, errorRatePercent: 0 } },
    { observedAt: new Date(t0 + 25_000).toISOString(), probe: { rps: 5, p50Ms: 80, p95Ms: 160, p99Ms: 220, errorRatePercent: 100 } },
    { observedAt: new Date(t0 + 35_000).toISOString(), probe: { rps: 5, p50Ms: 90, p95Ms: 180, p99Ms: 240, errorRatePercent: 100 } },
  ];
  const actions = [
    {
      actionId: "11111111-1111-1111-1111-111111111111",
      action: "STOP",
      service: "payment",
      status: "CONFIRMED",
      requestedAt: new Date(t0 + 18_000).toISOString(),
      completedAt: new Date(t0 + 20_000).toISOString(),
    },
  ];

  const { points, markers } = buildRedSeries(history, actions);
  assert.equal(points.length, 4);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, "STOP payment");
  assert.ok(markers[0].xRatio > 0.5 && markers[0].xRatio < 0.65);

  const diff = computeBeforeAfterWindow(history, actions);
  assert.ok(diff);
  assert.equal(diff.beforeSamples, 2);
  assert.equal(diff.afterSamples, 2);
  assert.equal(diff.p95BeforeMs, 22);
  assert.equal(diff.p95AfterMs, 170);
  assert.equal(diff.errorBeforePct, 0);
  assert.equal(diff.errorAfterPct, 100);

  const { rows, totalMs } = buildTraceWaterfall(
    [
      {
        traceId: "t1",
        spanId: "s1",
        parentSpanId: null,
        runtimeService: "gateway",
        operationName: "GET /orders",
        startTimeUnixNano: "1000000000",
        durationNanoseconds: "50000000",
        httpStatusCode: 503,
        spanStatus: "Error",
      },
      {
        traceId: "t1",
        spanId: "s2",
        parentSpanId: "s1",
        runtimeService: "payment",
        operationName: "POST /charge",
        startTimeUnixNano: "1010000000",
        durationNanoseconds: "30000000",
        httpStatusCode: 503,
        spanStatus: "Error",
      },
    ],
    "t1",
  );
  assert.equal(rows.length, 2);
  assert.equal(totalMs, 50);
  assert.equal(rows[0].depth, 0);
  assert.equal(rows[1].depth, 1);
  assert.equal(rows[1].offsetPct, 20);
  assert.equal(rows[1].widthPct, 60);
  assert.equal(rows[1].isError, true);
});

test("Phase C contracts accept SET_LOAD, studioPrediction, and Change Impact exerciseEvaluation", () => {
  const { contracts } = require("../src/lib/api/contracts.ts");
  const { validateResponse } = require("../src/lib/api/validate-response.ts");
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";
  const actionId = "660e8400-e29b-41d4-a716-446655440000";

  assert.equal(
    contracts.studioAction.input.safeParse({
      sessionId,
      actionId,
      action: "SET_LOAD",
      service: "orders",
      targetRps: 30,
    }).success,
    true,
  );
  assert.equal(
    contracts.studioAction.input.safeParse({
      sessionId,
      actionId,
      action: "SET_LOAD",
      service: "orders",
      targetRps: 99,
    }).success,
    false,
  );
  assert.equal(
    contracts.studioPrediction.input.safeParse({
      sessionId,
      predictedServices: ["orders", "payment"],
      rationale: "Orders calls payment synchronously",
    }).success,
    true,
  );

  const parsed = validateResponse("studioState", { sessionId }, {
    sessionId,
    interactive: true,
    services: ["orders", "payment"],
    finishRequested: false,
    executionStatus: "RUNNING",
    cleanupStatus: "PENDING",
    actions: [
      {
        actionId,
        action: "SET_LOAD",
        service: "orders",
        targetRps: 30,
        status: "CONFIRMED",
        requestedAt: "2026-11-21T10:00:00Z",
      },
    ],
    prediction: {
      predictedServices: ["orders", "payment"],
      rationale: "Sync call chain",
      lockedAt: "2026-11-21T09:59:50Z",
    },
    exerciseEvaluation: {
      exerciseType: "CHANGE_IMPACT",
      predictionRequired: true,
      predictionLocked: true,
      predictedServices: ["orders", "payment"],
      observedAffectedServices: ["orders", "payment"],
      impact: {
        truePositives: ["orders", "payment"],
        falsePositives: [],
        falseNegatives: [],
        precision: 1,
        recall: 1,
        f1Score: 1,
      },
      rules: [
        {
          id: "rule-1",
          label: "Change Impact F1 >= 0.7",
          metric: "IMPACT_F1",
          target: "PREDICTION",
          operator: "GTE",
          threshold: 0.7,
          observedValue: 1,
          passed: true,
          reason: "Observed 1 (expected >= 0.7)",
        },
      ],
      passedRules: 1,
      totalRules: 1,
      evaluated: true,
      autoScorePercent: 100,
      passed: true,
    },
  });
  assert.equal(parsed.exerciseEvaluation.impact.f1Score, 1);
  assert.equal(parsed.exerciseEvaluation.passed, true);
});

test("Phase E5 adminRuntimeHealth and adminSweepOrphans contracts enforce admin-only permission", () => {
  const { validateResponse } = require("../src/lib/api/validate-response.ts");
  const { operationPermission } = require("../src/lib/auth/permissions.ts");

  assert.equal(operationPermission("adminRuntimeHealth"), "admin:manage");
  assert.equal(operationPermission("adminSweepOrphans"), "admin:manage");

  const health = validateResponse("adminRuntimeHealth", {}, {
    surveyReadiness: "READY",
    runnerMode: "AUTO",
    configuredOciRuntime: "auto",
    effectiveOciRuntime: "runsc",
    dockerReachable: true,
    gvisorAvailable: true,
    sandboxRegistryConfigured: false,
    activeSessions: 1,
    queuedSessions: 2,
    maxActiveSessions: 2,
    maxQueuedSessions: 30,
    diskFreeMiB: 15000,
    diskTotalMiB: 40960,
    diskLowWarning: false,
    orphansReapedTotal: 3,
    abandonedReapedTotal: 1,
    staleDispatchesReapedTotal: 0,
    oldestQueuedWaitSeconds: 12,
    alertsConfigured: true,
    warnings: [],
  });
  assert.equal(health.effectiveOciRuntime, "runsc");
  assert.equal(health.oldestQueuedWaitSeconds, 12);

  const sweep = validateResponse("adminSweepOrphans", {}, {
    orphansRemoved: 2,
    diskPruned: true,
  });
  assert.equal(sweep.orphansRemoved, 2);
});

test("LiveTerminalConsole renders service filter as a compact dropdown instead of horizontal pill buttons", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-terminal-console.tsx"),
    "utf8",
  );
  assert.match(src, /<Select\s+value=\{activeServiceFilter\}\s+onValueChange=\{setServiceFilter\}>[\s\S]*<SelectTrigger[\s\S]*aria-label="Filter by service"/);
  assert.match(src, /All services \(\{serviceList\.length\}\)/);
  assert.doesNotMatch(src, /\{\/\* Service filter pills \*\/\}/);
});

test("LiveStudioWorkbench exposes draggable resize handles on inspector, mission card, blocks panel, and bottom drawer", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  for (const label of [
    "Resize inspector width",
    "Resize inspector height",
    "Resize inspector panel",
    "Resize mission width",
    "Resize mission height",
    "Resize mission card",
    "Resize blocks panel",
    "Resize telemetry dock",
  ]) {
    assert.ok(src.includes(`aria-label="${label}"`), `Missing resize handle: ${label}`);
  }
});

test("LiveStudioWorkbench left tool rail Snapshots & Logs buttons toggle closed when already active", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  assert.match(
    src,
    /Snapshots & History[\s\S]{0,400}if \(!bottomCollapsed && tab === "snapshots"\)\s*\{\s*setBottomCollapsed\(true\);/,
  );
  assert.match(
    src,
    /Logs & Traces[\s\S]{0,400}if \(!bottomCollapsed && tab !== "snapshots"\)\s*\{\s*setBottomCollapsed\(true\);/,
  );
});

test("LiveStudioWorkbench floating Inspector and Mission cards support header drag-to-move", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  assert.match(src, /function startPanelDrag\(/);
  assert.ok(src.includes('data-drag-handle="inspector"'));
  assert.ok(src.includes('data-drag-handle="mission"'));
});

test("Author Mode visual save preserves Change Impact successCriteria fields", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  assert.match(src, /exerciseType\?:/);
  assert.match(src, /predictionRequired\?:/);
  assert.match(src, /minImpactF1\?:/);
  assert.match(src, /targetChangeAction\?:/);
  assert.match(src, /rules\?:/);
  assert.match(
    src,
    /body:\s*JSON\.stringify\(\{\s*\.\.\.cur,[\s\S]*successCriteria:\s*\{\s*\.\.\.cur\?\.successCriteria,/,
  );
});

test("Batch 2: LiveStudioWorkbench auto-opens prediction, locks Finish on 0 snapshots, and unifies Light/Dark servicePhase controls", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  // Task 2.1: auto-open prediction panel once per session + mission warning
  assert.match(src, /const needsPrediction =/);
  assert.match(src, /autoOpenedPredictionRef/);
  assert.ok(src.includes("Lock your impact prediction before your first action."));
  // Task 2.2: Finish requires >= 1 snapshot
  assert.ok(src.includes("Capture at least one evidence snapshot before finishing."));
  assert.match(src, /!hasConfirmedAction \|\|\s*\(data\.snapshots\?\.length \?\? 0\) === 0/);
  // Task 2.3: shared servicePhase helper + Light/Dark parity for CPU [25, 50, 100], SET_LOAD [5, 15, 30, 50], Pause/Resume
  assert.match(src, /function servicePhase\(/);
  assert.ok(src.includes('selPhase !== "paused"'));
  assert.ok(src.includes('darkPhase !== "paused"'));
  assert.ok(!src.includes("CPU 20%"));
  const cpuMatches = src.match(/\[25, 50, 100\]\.map/g) || [];
  assert.ok(cpuMatches.length >= 2, "Both Light and Dark themes must expose CPU [25, 50, 100] presets");
  const loadMatches = src.match(/\[5, 15, 30, 50\]\.map/g) || [];
  assert.ok(loadMatches.length >= 2, "Both Light and Dark themes must expose SET_LOAD [5, 15, 30, 50] presets");
});

test("Batch 2: lab-submission-v2 removes sample dossiers and fake rubric score preview", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/lab-submission-v2.tsx"),
    "utf8",
  );
  assert.doesNotMatch(src, /Fill Passing|Revision-Needed|baseQuiz|sampleDossier|RubricPreview|ScorePreview/);
});

test("Batch 2: Admin Studio Setup points to /workspaces and grading evidence displays exerciseEvaluation hint", () => {
  const adminSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/administration/screens.tsx"),
    "utf8",
  );
  assert.ok(!adminSrc.includes('href="/administration/studio"'));
  assert.ok(adminSrc.includes("Open Studio Live (choose a lab)"));

  const evidenceSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/submissions/studio-evidence.tsx"),
    "utf8",
  );
  assert.ok(evidenceSrc.includes("Auto-check (grading hint, not a score)"));
  assert.match(evidenceSrc, /exerciseEvaluation:\s*exerciseEvaluationSchema/);
  assert.match(evidenceSrc, /\{\s*enabled:\s*available\s*\}/);
});

test("Batch 3: Scale capped at 1..3, PNG snapshot downscales within 440k chars, visible-tab heartbeat active", () => {
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  assert.ok(obsSrc.includes("[1, 2, 3] as const"));
  assert.ok(obsSrc.includes("SNAPSHOT_MAX_DATA_URL_CHARS = 440_000"));
  assert.ok(obsSrc.includes("[1280, 960, 720]"));
  assert.ok(obsSrc.includes('toDataURL("image/png")'));
  assert.ok(!obsSrc.includes('toDataURL("image/jpeg")'));

  const paritySrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-sandbox-parity.tsx"),
    "utf8",
  );
  assert.ok(paritySrc.includes("Replicas (1–3)"));
  assert.ok(paritySrc.includes("[1, 2, 3].map"));
  assert.ok(!paritySrc.includes("[1, 2, 4, 8].map"));
  assert.ok(paritySrc.includes('id: "palette-scale-2"'));
  assert.ok(paritySrc.includes('id: "palette-scale-3"'));
  assert.ok(!paritySrc.includes('badge: "×4"'));
  assert.ok(!paritySrc.includes('badge: "×8"'));
  assert.ok(!paritySrc.includes("Math.min(8,"));

  // Canvas drop lookup IDs in studio-observability.tsx must stay paired with sidebar Action Toolbox IDs.
  assert.ok(obsSrc.includes('id: "palette-scale-2"'));
  assert.ok(obsSrc.includes('id: "palette-scale-3"'));
  assert.ok(!obsSrc.includes('id: "palette-scale-4"'));
  assert.ok(!obsSrc.includes('id: "palette-scale-8"'));
  assert.ok(!obsSrc.includes("Math.min(8,"));

  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  assert.ok(!standaloneSrc.includes("Math.min(8,"));

  const controlsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-controls.tsx"),
    "utf8",
  );
  assert.ok(controlsSrc.includes("Replicas (1–3)"));
  assert.ok(!controlsSrc.includes("Math.min(8,"));

  const sessionHookSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/use-studio-session.ts"),
    "utf8",
  );
  assert.ok(sessionHookSrc.includes("visibilitychange"));
  assert.ok(sessionHookSrc.includes("cancelledWhileQueued"));

  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  assert.ok(workbenchSrc.includes("Your queued session was cancelled because the tab was inactive. Click Run again."));
});

test("Studio Live defaults to 3D with dynamic camera pitch and interactive 3D camera/layout form", () => {
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );

  assert.match(workbenchSrc, /defaultView="3D"/);
  assert.ok(obsSrc.includes('data-testid="studio-3d-controls"'));
  assert.ok(obsSrc.includes("Math.cos(clampedPitch)"));
  assert.ok(obsSrc.includes("Math.sin(clampedPitch)"));
  assert.ok(obsSrc.includes("const PITCH_MIN = 0.44;"));
  assert.ok(obsSrc.includes("const persp = focal / Math.max(600, focal - depthZ);"));
  assert.ok(obsSrc.includes("project3DPoint((from.wx + to.wx) / 2, -arcLift, (from.wz + to.wz) / 2)"));
  assert.ok(!obsSrc.includes("const sinP = 0.5;"));
  assert.ok(!obsSrc.includes("-380 * 0.33"));
  for (const label of [
    "Isometric",
    "Top-down",
    "Elevation",
    "Rotate left",
    "Rotate right",
    "Tilt up",
    "Tilt down",
    "Layered",
    "Circular",
    "Grid",
  ]) {
    assert.ok(obsSrc.includes(label), `Missing 3D form control: ${label}`);
  }
});

test("Studio Live mounts comprehensive bilingual Guided Tour (?) trigger next to Telemetry HUD", () => {
  const { resolveScreenTour } = require("../src/lib/guided-tours/catalog.ts");
  const tour = resolveScreenTour("studio-live");
  assert.ok(tour, "Missing studio-live guided tour catalog entry");
  assert.equal(tour.cards.length, 2);
  assert.equal(tour.steps.length, 7);
  for (const step of tour.steps) {
    assert.ok(step.title.en && step.title.vi, `Missing bilingual title on ${step.id}`);
    assert.ok(step.description.en && step.description.vi, `Missing bilingual description on ${step.id}`);
    assert.ok(step.selectors.length >= 1, `Missing selectors on ${step.id}`);
  }

  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const triggerPos = workbenchSrc.indexOf('screenId="studio-live"');
  const hudPos = workbenchSrc.indexOf('data-tour="studio-telemetry-hud"');
  assert.ok(triggerPos > 0 && hudPos > triggerPos, "Tour (?) trigger must sit directly before the Telemetry HUD pill");
  assert.ok(workbenchSrc.includes('surfaceTheme={isLight ? "light" : "dark"}'));
  for (const anchor of [
    'data-tour="studio-mission"',
    'data-tour="studio-canvas"',
    'data-tour="studio-command-dock"',
    'data-tour="studio-tool-rail"',
    'data-tour="studio-telemetry-hud"',
    'data-tour="studio-top-right-tools"',
    'data-tour="studio-style-picker"',
    'data-tour="studio-settings-btn"',
  ]) {
    assert.ok(workbenchSrc.includes(anchor), `Missing tour anchor in live-studio-workbench.tsx: ${anchor}`);
  }
  assert.ok(obsSrc.includes('data-tour="studio-3d-controls-group"'));
  assert.ok(obsSrc.includes('"studio-services-graph"'));
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  assert.ok(stageSrc.includes('"studio-services-graph"'));
});

test("Studio 3D/2D service icons and sculptures adapt distinctly to all 4 Studio themes", () => {
  const {
    resolveStudioNodePalette,
    resolveStudioSidebarIconClass,
  } = require("../src/features/runtime/studio-styles.ts");
  const healthy = { isCritical: false, isWarning: false, isSelected: false, isDropTarget: false };

  const daylight = resolveStudioNodePalette("daylight", "order-service", "SERVICE", healthy);
  const blueprint = resolveStudioNodePalette("blueprint", "order-service", "SERVICE", healthy);
  const pop = resolveStudioNodePalette("pop", "order-service", "SERVICE", healthy);
  const control = resolveStudioNodePalette("control", "order-service", "SERVICE", healthy);

  // All 4 themes produce distinct visual signatures for the exact same microservice
  assert.equal(new Set([daylight.cardFill, blueprint.cardFill, pop.cardFill, control.cardFill]).size, 4);
  assert.equal(new Set([daylight.stroke, blueprint.stroke, pop.stroke, control.stroke]).size, 4);
  assert.equal(new Set([daylight.pillChipBg, blueprint.pillChipBg, pop.pillChipBg, control.pillChipBg]).size, 4);

  // Tactile Pop gives each service role a vibrant pastel fill with bold ink outline
  const popOrder = resolveStudioNodePalette("pop", "order-service", "SERVICE", healthy);
  const popPayment = resolveStudioNodePalette("pop", "payment-service", "SERVICE", healthy);
  const popCatalog = resolveStudioNodePalette("pop", "catalog-service", "SERVICE", healthy);
  const popGateway = resolveStudioNodePalette("pop", "api-gateway", "GATEWAY", healthy);
  assert.equal(popOrder.stroke, "#0f172a");
  assert.equal(
    new Set([popOrder.iconBg, popPayment.iconBg, popCatalog.iconBg, popGateway.iconBg]).size,
    4,
  );

  // Critical outage always overrides to unmistakable red across every theme
  for (const styleId of ["daylight", "blueprint", "pop", "control"]) {
    const crit = resolveStudioNodePalette(styleId, "payment-service", "SERVICE", {
      ...healthy,
      isCritical: true,
    });
    assert.match(crit.stroke, /^#(e11d48|dc2626|f43f5e)$/i);
  }

  // Sidebar icon colors also change per theme
  assert.equal(resolveStudioSidebarIconClass("pop", "order-service"), "text-slate-900");
  assert.equal(resolveStudioSidebarIconClass("blueprint", "order-service"), "text-blue-700");
  assert.notEqual(
    resolveStudioSidebarIconClass("daylight", "order-service"),
    resolveStudioSidebarIconClass("control", "order-service"),
  );
});

test("Studio Live 3D mode uses real Three.js WebGL stage with dynamic import, 3D meshes, and WebGL PNG snapshot capture", () => {
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );

  assert.ok(stageSrc.includes('import("three")'), "Three.js must be dynamically imported for 3D mode");
  assert.ok(stageSrc.includes("__mavisRenderNow"), "WebGL must expose synchronous render hook for zero-copy PNG snapshots");
  assert.ok(obsSrc.includes("__mavisRenderNow"), "captureStudioImage must flush WebGL frame before drawImage");
  assert.ok(stageSrc.includes("shadowMap.autoUpdate = false"), "Static shadow maps must be cached so 3D orbit runs at 60fps");
  assert.ok(stageSrc.includes('data-testid="studio-3d-webgl"'));
  assert.ok(stageSrc.includes('data-studio-engine="three-webgl"'));
  assert.ok(stageSrc.includes("TubeGeometry"), "Observed traffic must render true 3D curved tubes");
  assert.ok(stageSrc.includes("Raycaster"), "3D meshes must support click and drag-drop raycasting");
  assert.ok(stageSrc.includes("disposeObjectTree"), "3D resources must dispose cleanly on unmount/rebuild");

  assert.ok(obsSrc.includes("<StudioThreeStage"));
  assert.ok(obsSrc.includes('canvas[data-studio-webgl-canvas]'), "captureStudioImage must capture live WebGL canvas in 3D mode");
});

test("Studio Live terminal parses OTel javaagent timestamps, backfills boot line times, filters JVM noise, and explains errors cleanly", () => {
  const originalLoad = Module._load;
  let parseTimestampPrefix;
  let buildTerminalEntries;
  let isBootNoiseMessage;
  let explainRuntimeDiagnostic;
  try {
    Module._load = function (id, ...args) {
      if (id === "lucide-react" || id.endsWith("button") || id.endsWith("input") || id.endsWith("select")) return {};
      return originalLoad.call(this, id, ...args);
    };
    ({
      parseTimestampPrefix,
      buildTerminalEntries,
      isBootNoiseMessage,
      explainRuntimeDiagnostic,
    } = require("../src/features/runtime/live-terminal-console.tsx"));
  } finally {
    Module._load = originalLoad;
  }

  // OTel javaagent timestamp format with colon milliseconds must parse cleanly
  const otelLine = parseTimestampPrefix(
    "[otel.javaagent 2026-11-23 10:01:21:412 +0000] [main] INFO io.opentelemetry.javaagent.tooling.VersionLogger - opentelemetry-javaagent - version: 2.32.0",
  );
  assert.equal(otelLine.timestampMs, Date.parse("2026-11-23T10:01:21.412Z"));
  assert.match(otelLine.timestampLabel, /^\d{2}:\d{2}:\d{2}$/);
  assert.ok(otelLine.body.startsWith("[otel.javaagent] [main] INFO"));

  // Pre-timestamp JVM lines inherit the container's first parsed timestamp (no missing "—" gaps)
  const entries = buildTerminalEntries({
    sessionId: "s-logs-1",
    interactive: true,
    services: ["api-gateway"],
    finishRequested: false,
    executionStatus: "FAILED",
    cleanupStatus: "CONFIRMED",
    actions: [],
    telemetry: {
      observedAt: "2026-11-23T10:02:24.000Z",
      services: [
        {
          service: "api-gateway",
          replicas: 1,
          runningReplicas: 0,
          stats: [],
          logs: [
            "api-gateway-1 | Picked up JAVA_TOOL_OPTIONS: -javaagent:/mavis-otel/java/opentelemetry-javaagent.jar",
            "api-gateway-1 | OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes",
            "api-gateway-1 | [otel.javaagent 2026-11-23 10:01:21:412 +0000] [main] INFO io.opentelemetry.javaagent.tooling.VersionLogger - opentelemetry-javaagent - version: 2.32.0",
            "api-gateway-1 | 2026-11-23T10:01:25.100Z ERROR Connection refused to payment-service",
          ].join("\n"),
        },
      ],
      spans: [],
      interactions: [],
      warnings: ["ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION"],
    },
  });

  // Every single entry now has a formatted HH:mm:ss timestamp
  assert.ok(entries.every((entry) => /^\d{2}:\d{2}:\d{2}$/.test(entry.timestampLabel)));
  // JVM CDS warning is downgraded from false-alarm WARN to PLAIN noise
  assert.equal(entries[1].level, "PLAIN");
  assert.equal(entries[0].isNoise, true);
  assert.equal(entries[1].isNoise, true);
  assert.equal(entries[2].isNoise, true);
  // Real application ERROR stays clean (isNoise=false) and highlighted
  assert.equal(entries[3].level, "ERROR");
  assert.equal(entries[3].isNoise, false);
  // Cryptic internal warnings are flagged as noise and carry friendly explanations
  assert.equal(isBootNoiseMessage("ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION"), true);
  assert.match(explainRuntimeDiagnostic("BACKEND_RESTART_RECOVERY") ?? "", /restarted/i);

  // Studio Live has zero simulated sandbox fallback button
  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  assert.ok(!standaloneSrc.includes("Activate Simulated Sandbox Telemetry"));
});

test("Service inspector RAM card spans full width on a single non-wrapping line", () => {
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const ramBlockStart = workbenchSrc.indexOf('data-testid="studio-inspector-ram-card"');
  assert.ok(ramBlockStart > 0, "Expected studio-inspector-ram-card testid");
  const ramBlock = workbenchSrc.slice(ramBlockStart, ramBlockStart + 900);
  assert.ok(ramBlock.includes("col-span-2"), "RAM tile must span full width across the 2-column metric grid");
  assert.ok(ramBlock.includes("whitespace-nowrap"), "RAM value must not wrap onto multiple lines");
  assert.ok(workbenchSrc.includes("parseMemoryMiB"), "Workbench should reuse parseMemoryMiB for utilization ratio");
});

test("3D WebGL stage uses right-drag orbit, left-drag block movement, and camera-independent world layout", () => {
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  // Right-click orbits, left-click drags 3D blocks or pans empty floor
  assert.ok(stageSrc.includes("if (event.button === 2)"), "Right-drag must trigger 3D orbit");
  assert.ok(stageSrc.includes('mode: "NODE"'), "Left-drag on a 3D service block must drag the block");
  assert.ok(stageSrc.includes("raycastGroundWorld("), "3D block dragging must project cursor onto floor plane");
  assert.ok(stageSrc.includes("onMoveNode"), "3D stage must persist dragged block offset via onMoveNode");
  // Scene rebuild effect must NOT depend on hoveredService (prevents lag on mouse hover)
  assert.ok(
    stageSrc.includes("[engineReady, nodes, edges, deckBounds, styleId, dropHoverService]"),
    "Three.js scene rebuild must not re-run on hoveredService",
  );
  // Camera-independent worldPoints keeps orbit at 60fps without rebuilding WebGL meshes
  const threeNodesBlock = obsSrc.slice(
    obsSrc.indexOf("const { threeNodes, threeEdges } = useMemo("),
    obsSrc.indexOf("function nodeAt("),
  );
  assert.ok(threeNodesBlock.includes("worldPoints"), "threeNodes must read from camera-independent worldPoints");
  assert.ok(!threeNodesBlock.includes("positions"), "threeNodes must not depend on camera-projected positions");
});

test("Studio wires deduplicate static vs observed 1-to-1, unify 4-state colors, and clear middle 3D blocks", () => {
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  // 1-to-1 deduplication in both 3D (threeEdges) and 2D (SVG staticEdges)
  assert.ok(
    obsSrc.includes("if (observedPairs.has(`${edge.from}->${edge.to}`)) continue;"),
    "3D threeEdges must suppress duplicate static edge when observed traffic exists",
  );
  assert.ok(
    obsSrc.includes("if (hasObservedOverlay) return null;"),
    "2D SVG staticEdges must suppress duplicate static edge when observed traffic exists",
  );
  // Unified healthy live traffic color (no dull slate gray for healthy observed spans)
  assert.ok(obsSrc.includes("#0d9488"), "Healthy span-observed traffic must render in teal/emerald, not slate gray");
  // 3D rim anchoring & obstacle clearance helper
  assert.ok(stageSrc.includes("export function compute3DEdgeAnchors("));
  const { compute3DEdgeAnchors } = require("../src/features/runtime/studio-three-stage.tsx");
  const nodes = [
    { id: "api-gateway", wx: -220, wz: 0 },
    { id: "order-service", wx: 0, wz: 0 },
    { id: "payment-service", wx: 220, wz: 0 },
  ];
  const clear = compute3DEdgeAnchors(-220 / 82, 0, 220 / 82, 0, nodes, "api-gateway", "payment-service", false);
  // Endpoints are anchored at pedestal rims (pulled inward from center by > 0.5)
  assert.ok(clear.sx > -220 / 82 + 0.45 && clear.ex < 220 / 82 - 0.45);
  // Midpoint bows laterally away from intermediate order-service at (0, 0)
  assert.ok(Math.abs(clear.midZ) >= 0.55, `Expected lateral deflection away from middle node, got midZ=${clear.midZ}`);
});

test("3D stage implements SE-standard UML/C4/CodeCity nodes, trust zones, and semantic connectors without business-name toy shapes", () => {
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  // Zero business-name hardcoded toy shapes
  assert.ok(!stageSrc.includes("Stepped Fulfillment Pavilion"));
  assert.ok(!stageSrc.includes("Armored Vault Unit"));
  assert.ok(!stageSrc.includes("Parcel Cube"));
  // Authoritative SE stereotypes, CAD plinths, replica pods, data-driven RAM/CPU gauges, and architectural zones
  assert.ok(stageSrc.includes("createRoundedSlabGeo("));
  assert.ok(stageSrc.includes("createTopPlateTexture("));
  assert.ok(stageSrc.includes("attachFrontTelemetryBar("));
  assert.ok(stageSrc.includes("createZonePlateGroup("));
  assert.ok(stageSrc.includes("EDGE / INGRESS"));
  assert.ok(stageSrc.includes("CORE SERVICES · DOCKER NET"));
  assert.ok(stageSrc.includes("DATA & MESSAGING"));
  assert.ok(stageSrc.includes("«gateway»") && stageSrc.includes("«service»") && stageSrc.includes("«database»") && stageSrc.includes("«broker»"));
  // Port socket collars, RPS thickness encoding, and UML Sync vs Async connector semantics
  assert.ok(stageSrc.includes("startPort") && stageSrc.includes("endPort"));
  assert.ok(stageSrc.includes("Math.log2(rpsVal + 1)"));
  assert.ok(stageSrc.includes("isAsync"));
  // Observability passes real RAM/CPU/pause/throttle/RPS/protocol into threeNodes & threeEdges
  assert.ok(obsSrc.includes("ramPct") && obsSrc.includes("cpuPct") && obsSrc.includes("cpuThrottlePct"));
});

test("3D wheel zoom uses native non-passive listener, delta-proportional scaling, debounced React sync, and zero RAF layout reflow", () => {
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const { computeNextWheelZoom } = require("../src/features/runtime/studio-three-stage.tsx");

  // Fine trackpad scroll scales smoothly instead of jumping 10%
  const fineIn = computeNextWheelZoom(1.0, -8, 0, false);
  assert.ok(fineIn > 1.005 && fineIn < 1.03, `Expected smooth fine zoom-in, got ${fineIn}`);
  // Standard mouse wheel notch scales crisply and reversibly
  const notchIn = computeNextWheelZoom(1.0, -100, 0, false);
  const notchBack = computeNextWheelZoom(notchIn, 100, 0, false);
  assert.ok(notchIn > 1.15 && notchIn < 1.25);
  assert.ok(Math.abs(notchBack - 1.0) < 0.001);
  // Clamps cleanly to [0.45, 2.2]
  assert.equal(computeNextWheelZoom(2.15, -500, 0, true), 2.2);
  assert.equal(computeNextWheelZoom(0.46, 500, 0, true), 0.45);
  // Uses native non-passive wheel listener and avoids per-frame container.clientWidth reads in RAF
  assert.ok(stageSrc.includes('addEventListener("wheel", handleWheel, { passive: false })'));
  assert.ok(!stageSrc.includes("onWheel={(event) =>"));
  assert.ok(stageSrc.includes("const { w, h } = viewportSizeRef.current;"));
  assert.ok(stageSrc.includes("!isWheeling && !isCameraSettling"));
});

test("3D node drag live-tracks architectural trust zones and deck floor at 60fps before pointer release", () => {
  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const {
    computeLiveDeckBounds,
    computeLiveZoneRects,
  } = require("../src/features/runtime/studio-three-stage.tsx");

  const specs = [
    { key: "EDGE", memberIds: ["api-gateway"] },
    { key: "CORE", memberIds: ["order-service", "catalog-service"] },
  ];
  const beforePos = new Map([
    ["api-gateway", { wx: -200, wz: 0 }],
    ["order-service", { wx: 40, wz: 0 }],
    ["catalog-service", { wx: 180, wz: 120 }],
  ]);
  const b0 = computeLiveDeckBounds([...beforePos.values()]);
  const z0 = computeLiveZoneRects(specs, beforePos, b0.minX / 82, b0.maxX / 82, b0.minZ / 82, b0.maxZ / 82);
  const edgeBefore = z0.find((z) => z.key === "EDGE");
  const coreBefore = z0.find((z) => z.key === "CORE");

  // Drag api-gateway downward/left — EDGE zone center must move immediately with it and deck must expand
  const afterPos = new Map(beforePos);
  afterPos.set("api-gateway", { wx: -340, wz: 220 });
  const b1 = computeLiveDeckBounds([...afterPos.values()]);
  assert.ok(b1.minX < b0.minX && b1.maxZ > b0.maxZ, "Deck bounds must expand live as node moves outward");
  const z1 = computeLiveZoneRects(specs, afterPos, b1.minX / 82, b1.maxX / 82, b1.minZ / 82, b1.maxZ / 82);
  const edgeAfter = z1.find((z) => z.key === "EDGE");
  assert.ok(edgeAfter.cx < edgeBefore.cx - 1.2, "EDGE zone X center must follow dragged api-gateway");
  assert.ok(edgeAfter.cz > edgeBefore.cz + 2.0, "EDGE zone Z center must follow dragged api-gateway");

  // Drag catalog-service further right — CORE zone must grow wider live
  afterPos.set("catalog-service", { wx: 360, wz: 120 });
  const b2 = computeLiveDeckBounds([...afterPos.values()]);
  const z2 = computeLiveZoneRects(specs, afterPos, b2.minX / 82, b2.maxX / 82, b2.minZ / 82, b2.maxZ / 82);
  const coreAfter = z2.find((z) => z.key === "CORE");
  assert.ok(coreAfter.width > coreBefore.width + 1.5, "CORE zone must expand smoothly as a member drags outward");

  // Wired directly into updateLiveNodeAndEdges (no React re-render required mid-drag)
  assert.ok(stageSrc.includes("const liveBounds = computeLiveDeckBounds(allLiveNodes);"));
  assert.ok(stageSrc.includes("const liveLayouts = computeLiveZoneRects(zoneRigs, liveNodePosRef.current"));
});

test("Floating 3D Camera card stays ultra-compact with 3 presets and a single 4-icon directional row", () => {
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const start = obsSrc.indexOf('data-testid="studio-3d-controls"');
  const end = obsSrc.indexOf("</section>", start);
  const card = obsSrc.slice(start, end);
  assert.ok(card.includes("w-[216px]"), "3D Camera card should stay compact (216px) with clean preset padding");
  assert.ok(card.includes("grid-cols-4"), "Rotate/tilt controls should share one compact 4-icon row");
  assert.ok(card.includes('aria-label={t("Rotate left"') && card.includes('aria-label={t("Tilt down"'));
  assert.ok(!card.includes("Right-drag to orbit"), "Verbose 2-line mouse hint should stay removed from floating card");
  assert.ok(!card.includes('"CIRCULAR"'), "Redundant Layered/Circular/Grid row should stay removed from floating card");
});

test("LiveTerminalConsole omits fake compose header and red error card, streaming diagnostics inline in logs", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-terminal-console.tsx"),
    "utf8",
  );
  assert.doesNotMatch(src, /docker compose -p \{projectSlug\} logs -f/);
  assert.doesNotMatch(src, /studio-logs-error-banner/);
  assert.doesNotMatch(src, /Run Fresh Session/);
  assert.doesNotMatch(src, /Errors only \(/);
  assert.match(src, /explainRuntimeDiagnostic\(trimmed\)/);
});

test("Stats tab shows only Cluster Overview metrics without 4-step checklist or duplicate status badge", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const start = src.indexOf('aria-labelledby="live-cluster-overview"');
  const end = src.indexOf("<StudioRedCharts", start);
  const statsHeaderAndKpis = src.slice(start, end);
  assert.doesNotMatch(src, /Step 1: Capture baseline snapshot/);
  assert.doesNotMatch(statsHeaderAndKpis, /Timed out/);
  assert.doesNotMatch(statsHeaderAndKpis, /Setup preview/);
  assert.match(statsHeaderAndKpis, /Cluster Overview[\s\S]*Traffic &amp; reliability[\s\S]*Resource capacity/);
});

test("3D service tag shifts smoothly toward the block's back-top rim and shrinks on close zoom so top-deck stats stay unobstructed", () => {
  const { computeNodeLabelPlacement } = require("../src/features/runtime/studio-three-stage.tsx");
  const iso = computeNodeLabelPlacement(0.68, 0.58, 1.0, 0.88);
  const topDown = computeNodeLabelPlacement(0, 1.05, 1.0, 0.88);
  const zoomedIn = computeNodeLabelPlacement(0.68, 0.58, 2.0, 0.88);

  const dist = (p) => Math.hypot(p.x, p.z);
  assert.ok(dist(topDown) > dist(iso) + 0.25, "Top-down pitch must shift tag further off the top-deck stats screen");
  assert.ok(topDown.z < -0.55, "At yaw=0, shift must move along -Z (upward on screen away from camera)");
  assert.ok(dist(zoomedIn) > dist(iso) + 0.25, "Close zoom must push tag toward the upper rim");
  assert.ok(zoomedIn.scale < 0.8 && zoomedIn.scale > 0.65, "Close zoom must smoothly shrink tag without hiding it");
  assert.equal(iso.scale, 1, "Default 1x zoom preserves full label legibility");
});
