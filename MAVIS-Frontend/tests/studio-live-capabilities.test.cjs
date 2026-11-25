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
  assert.match(src, /All services[\s\S]{0,40}\{serviceList\.length\}/);
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
    /return \{\s*\.\.\.cur,[\s\S]*successCriteria:\s*\{\s*\.\.\.cur\?\.successCriteria,/,
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

test("Studio Live mounts comprehensive bilingual Guided Tour (?) with confirmation dialog for Student (10 steps) and Author (11 steps)", () => {
  const { resolveScreenTour } = require("../src/lib/guided-tours/catalog.ts");
  const studentTour = resolveScreenTour("studio-live");
  assert.ok(studentTour, "Missing studio-live guided tour catalog entry");
  assert.equal(studentTour.cards.length, 2);
  assert.equal(studentTour.steps.length, 10);
  for (const step of studentTour.steps) {
    assert.ok(step.title.en && step.title.vi, `Missing bilingual title on ${step.id}`);
    assert.ok(step.description.en && step.description.vi, `Missing bilingual description on ${step.id}`);
    assert.ok(step.selectors.length >= 1, `Missing selectors on ${step.id}`);
  }

  const authorTour = resolveScreenTour("studio-live-author");
  assert.ok(authorTour, "Missing studio-live-author guided tour catalog entry");
  assert.equal(authorTour.cards.length, 2);
  assert.equal(authorTour.steps.length, 11);
  for (const step of authorTour.steps) {
    assert.ok(step.title.en && step.title.vi, `Missing bilingual title on author step ${step.id}`);
    assert.ok(step.description.en && step.description.vi, `Missing bilingual description on author step ${step.id}`);
    assert.ok(step.selectors.length >= 1, `Missing selectors on author step ${step.id}`);
  }

  const tourSrc = fs.readFileSync(
    path.join(__dirname, "../src/components/shared/screen-guided-tour.tsx"),
    "utf8",
  );
  assert.ok(tourSrc.includes("data-tour-confirm-dialog={tour.id}"));
  assert.ok(tourSrc.includes('data-testid="confirm-start-guided-tour"'));
  assert.ok(tourSrc.includes('t("Later", "Để sau")'));
  assert.ok(tourSrc.includes('t("Start guided tour", "Bắt đầu hướng dẫn")'));
  assert.ok(tourSrc.includes("onStepChange?:"));

  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const triggerPos = workbenchSrc.indexOf('screenId={authoring ? "studio-live-author" : "studio-live"}');
  const hudPos = workbenchSrc.indexOf('data-tour="studio-telemetry-hud"');
  assert.ok(triggerPos > 0 && hudPos > triggerPos, "Tour (?) trigger must sit directly before the Telemetry HUD pill");
  assert.ok(workbenchSrc.includes('surfaceTheme={isLight ? "light" : "dark"}'));
  assert.ok(workbenchSrc.includes("onStepChange={(stepId) => {"));
  for (const anchor of [
    'data-tour="studio-top-nav"',
    'data-tour="studio-locale-toggle"',
    'data-tour="studio-mission"',
    'data-tour="studio-canvas"',
    'data-tour="studio-command-dock"',
    'data-tour="studio-tool-rail"',
    'data-tour="studio-telemetry-hud"',
    'data-tour="studio-top-right-tools"',
    'data-tour="studio-style-picker"',
    'data-tour="studio-settings-btn"',
    'data-tour="studio-author-actions"',
    'data-tour="studio-service-inspector"',
  ]) {
    assert.ok(workbenchSrc.includes(anchor), `Missing tour anchor in live-studio-workbench.tsx: ${anchor}`);
  }
  assert.ok(obsSrc.includes('data-tour="studio-3d-controls-group"'));
  assert.ok(obsSrc.includes('data-tour="studio-viewport-pill"'));
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
  const popPayment = resolveStudioNodePalette("pop", "notification-worker", "SERVICE", healthy);
  const popCatalog = resolveStudioNodePalette("pop", "postgres-db", "DATABASE", healthy);
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
  assert.match(src, /entry\.service !== "mavis-runner" && activeServiceFilter === "ALL"/);
  assert.doesNotMatch(src, />\s*mavis-runner\s*</);
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

test("BFF allows workspace quiz-assets CRUD, references reuse the Lab source picker, and Submit to Assignment is student-only", () => {
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const ws = "bff7ac3d-9d2e-41fa-8287-f1bbdde8ae2a";
  const qid = "11111111-2222-3333-4444-555555555555";
  assert.equal(allowedBackendPath(`workspaces/${ws}/quiz-assets`), true);
  assert.equal(allowedBackendPath(`workspaces/${ws}/quiz-assets/${qid}`), true);

  const refManage = fs.readFileSync(
    path.join(__dirname, "../src/features/workspaces/reference-manage.tsx"),
    "utf8",
  );
  assert.match(refManage, /<AssignmentSourcePicker/);
  assert.match(refManage, /usageContext="repository"/);
  assert.doesNotMatch(refManage, /Save Repository Content|Create reference project/);

  const archRoute = fs.readFileSync(
    path.join(__dirname, "../src/routes/architecture.tsx"),
    "utf8",
  );
  assert.match(archRoute, /isStudent && project\.data\?\.workspaceId/);
});

test("Inline module quiz normalizes questions/IDs, Active class Settings shows Passkey, and Lab runtime unlocks when no per-Lab quiz exists", () => {
  const originalLoad = Module._load;
  let parseInlineQuizQuestions;
  try {
    Module._load = function (id, ...args) {
      if (id === "lucide-react" || id.endsWith("button") || id.endsWith("locale")) return {};
      return originalLoad.call(this, id, ...args);
    };
    ({ parseInlineQuizQuestions } = require("../src/features/courses/chapter-quiz-runner.tsx"));
  } finally {
    Module._load = originalLoad;
  }

  const parsed = parseInlineQuizQuestions({
    questions: [
      { prompt: "Q1?", options: ["A", "B"], correctOption: 1, explanation: "Because B" },
      { id: "custom-2", prompt: "Q2?", options: ["X", "Y"], correctOption: 0 },
      { prompt: "", options: ["A", "B"], correctOption: 0 },
      { prompt: "Bad index", options: ["A", "B"], correctOption: 5 },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, "inline-q-1");
  assert.equal(parsed[1].id, "custom-2");
  assert.equal(parsed[0].explanation, "Because B");

  const outlineSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/course-outline.tsx"),
    "utf8",
  );
  assert.match(outlineSrc, /item\.type === "QUIZ" && item\.assignmentId/);

  const wsScreensSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/workspaces/screens.tsx"),
    "utf8",
  );
  const settingsBlock = wsScreensSrc.slice(
    wsScreensSrc.indexOf('activeTab === "settings" && canManage'),
    wsScreensSrc.indexOf('activeTab === "settings" && canManage') + 900,
  );
  assert.ok(settingsBlock.includes("<CoursePasskey workspaceId={workspace.id} />"));
  assert.ok(settingsBlock.includes("<WorkspaceControls"));
  assert.ok(!settingsBlock.includes("{canEdit &&"), "Active class Settings tab must stay visible without canEdit guard");

  const courseScreensSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/screens.tsx"),
    "utf8",
  );
  assert.match(courseScreensSrc, /quizNotPublished\s*\|\|\s*\(studentContext\.isSuccess && studentContext\.data\?\.quiz == null\)/);
  assert.match(courseScreensSrc, /runtimePrerequisiteMissing\s*=\s*\n?\s*step === 2 && requiresRuntime && !runtimeReady && !preview && !studentContextLoading/);
  assert.match(courseScreensSrc, /!liveStudioVerified &&\s*!preview &&\s*!studentContextLoading &&\s*!studioStateQuery\.isLoading/);

  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  assert.match(workbenchSrc, /border-slate-300 bg-white text-slate-900[\s\S]*Stay on Canvas/);

  const accessSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/workspaces/course-access.tsx"),
    "utf8",
  );
  assert.match(accessSrc, /await cache\.refetchQueries\(\{ queryKey: \["api", "workspaces"\] \}\)/);
});

test("Studio Live exposes extended interactive session lease, auto-finish diagnostic, and formatted lease label", () => {
  const { validateResponse } = require("../src/lib/api/validate-response.ts");
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";
  const parsed = validateResponse("studioState", { sessionId }, {
    sessionId,
    interactive: true,
    services: ["orders"],
    finishRequested: false,
    executionStatus: "RUNNING",
    cleanupStatus: "PENDING",
    actions: [],
    limits: {
      memoryMiB: 512,
      cpus: 0.5,
      timeoutSeconds: 300,
      sessionTimeoutSeconds: 3600,
      idleTimeoutSeconds: 180,
    },
  });
  assert.equal(parsed.limits.sessionTimeoutSeconds, 3600);
  assert.equal(parsed.limits.idleTimeoutSeconds, 180);

  const terminalSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-terminal-console.tsx"),
    "utf8",
  );
  assert.match(terminalSrc, /STUDIO_MAX_DURATION_AUTO_FINISHED/);
  assert.doesNotMatch(terminalSrc, /300-second safety time limit/);

  const paritySrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-sandbox-parity.tsx"),
    "utf8",
  );
  assert.match(paritySrc, /limits\?\.sessionTimeoutSeconds \?\? limits\?\.timeoutSeconds/);
});

test("Studio 3D WYSIWYG authoring: Reverse BFS blast radius (incl. cycles), repo endpoint extraction, Author-by-Doing derivation, and single-door UI", () => {
  const {
    AUTHOR_GOALS,
    AUTHOR_DRAG_CHIPS,
    computeStaticBlastRadius,
    resolveModelServiceEdges,
    extractRepoEndpointOptions,
    deriveExerciseFromLiveActions,
  } = require("../src/features/runtime/studio-authoring-helpers.ts");

  assert.equal(AUTHOR_GOALS.length, 4);
  assert.equal(AUTHOR_DRAG_CHIPS.length, 4);

  // Reverse BFS on cyclic dependency graph must terminate and return all upstream callers + edges
  const blast = computeStaticBlastRadius("payment-service", [
    { from: "api-gateway", to: "order-service" },
    { from: "order-service", to: "payment-service" },
    { from: "payment-service", to: "postgres-db" },
    { from: "payment-service", to: "api-gateway" }, // cycle back to gateway
  ]);
  assert.deepEqual(blast.upstreamImpacted.sort(), ["api-gateway", "order-service"]);
  assert.ok(blast.impactedEdgeKeys.has("order-service->payment-service"));
  assert.ok(blast.impactedEdgeKeys.has("api-gateway->order-service"));
  assert.ok(!blast.impactedEdgeKeys.has("payment-service->postgres-db"));

  // Model element -> Compose service edge resolution
  const resolvedEdges = resolveModelServiceEdges(
    {
      elements: [
        { id: "e-gw", name: "api-gateway" },
        { id: "e-ord", name: "order-service" },
        { id: "e-pay", name: "payment-service" },
        { id: "e-ctrl", name: "OrderController", parentId: "e-ord" },
      ],
      edges: [
        { from: "e-gw", to: "e-ord" },
        { from: "e-ctrl", to: "e-pay" },
      ],
    },
    { "api-gateway": "e-gw", "order-service": "e-ord" },
    ["api-gateway", "order-service", "payment-service"],
  );
  assert.deepEqual(resolvedEdges, [
    { from: "api-gateway", to: "order-service" },
    { from: "order-service", to: "payment-service" },
  ]);

  // Repo endpoint extraction ranks real storefront/gateway endpoints above `/` and `/health`
  const endpoints = extractRepoEndpointOptions(
    {
      scenario: {
        steps: [
          { method: "GET", service: "api-gateway", path: "/api/v1/storefront/live-flow" },
          { method: "POST", service: "order-service", path: "/api/v1/orders" },
        ],
      },
      detectedEndpoints: [
        { method: "GET", service: "order-service", path: "/api/v1/orders/{id}" },
        { method: "GET", service: "catalog-service", path: "/api/v1/catalog/items" },
        { method: "GET", service: "api-gateway", path: "/" },
      ],
    },
    "/",
  );
  assert.equal(endpoints[0].path, "/api/v1/storefront/live-flow");
  assert.ok(endpoints.some((e) => e.path === "/api/v1/catalog/items"));
  assert.ok(!endpoints.some((e) => e.path.includes("{id}")));

  // Author-by-Doing derives Scale-Out, CPU Degradation, Change Impact, and Outage Recovery
  const scaleDemo = deriveExerciseFromLiveActions(
    [
      { action: "SET_LOAD", service: "api-gateway", targetRps: 30, status: "CONFIRMED" },
      { action: "SCALE", service: "order-service", replicas: 2, status: "CONFIRMED" },
    ],
    [],
  );
  assert.equal(scaleDemo.exerciseType, "SCALE_UNDER_LOAD");
  assert.deepEqual(scaleDemo.minReplicas, [{ service: "order-service", count: 2 }]);
  assert.ok(scaleDemo.instructions.includes("30 RPS"));

  const impactDemo = deriveExerciseFromLiveActions(
    [{ action: "PAUSE", service: "payment-service", status: "CONFIRMED" }],
    [],
  );
  assert.equal(impactDemo.exerciseType, "CHANGE_IMPACT");
  assert.equal(impactDemo.predictionRequired, true);
  assert.equal(impactDemo.targetChangeAction.service, "payment-service");

  const cpuDemo = deriveExerciseFromLiveActions(
    [{ action: "THROTTLE_CPU", service: "catalog-service", cpuPercent: 25, status: "CONFIRMED" }],
    [],
  );
  assert.equal(cpuDemo.exerciseType, "CONFIG_REGRESSION");
  assert.equal(cpuDemo.targetChangeAction.cpuPercent, 25);

  const recoveryDemo = deriveExerciseFromLiveActions([], ["payment-service"]);
  assert.equal(recoveryDemo.exerciseType, "CIRCUIT_BREAKER");
  assert.deepEqual(recoveryDemo.stoppedServices, ["payment-service"]);

  // Single-door LabStudioSection + icon-free WYSIWYG workbench guards
  const labStudioSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/assignments/lab-studio-section.tsx"),
    "utf8",
  );
  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const threeSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );

  assert.match(labStudioSrc, /Open Visual Studio Builder/);
  assert.doesNotMatch(labStudioSrc, /StudioExerciseEditor|PreparedTopologyEditor/);
  assert.doesNotMatch(standaloneSrc, /StudioExerciseEditor|PreparedTopologyEditor/);
  assert.match(workbenchSrc, /Visual Studio Builder/);
  assert.match(workbenchSrc, /Static Reverse BFS Preview/);
  assert.match(workbenchSrc, /Use live actions as exercise/);
  assert.match(workbenchSrc, /Advanced settings/);
  assert.match(workbenchSrc, /Baseline Endpoint \(auto-detected\)/);
  assert.match(workbenchSrc, /relative z-40 flex h-12 shrink-0/);
  assert.match(threeSrc, /raycastEdgeAt/);
  assert.match(threeSrc, /onSelectEdge/);
  const helpersSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-authoring-helpers.ts"),
    "utf8",
  );
  assert.doesNotMatch(helpersSrc, /[\u26A1\u{1F3AF}\u{1F525}\u{1F680}\u2705\u274C\u{1F527}]/u);
  assert.doesNotMatch(labStudioSrc, /[\u26A1\u{1F3AF}\u{1F525}\u{1F680}\u2705\u274C\u{1F527}]/u);
});

test("Studio Settings toggles 3D node & edge tags, Stats shows rich Service Health & Lab Scope overview, and SE EN/VI switcher sits next to ?", () => {
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const threeSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const chartsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-red-charts.tsx"),
    "utf8",
  );
  const exerciseSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-exercise-panel.tsx"),
    "utf8",
  );

  // Task 1: 3D tag toggles in Settings + Three.js instant visibility + raycast skip
  assert.match(workbenchSrc, /data-testid="toggle-3d-node-tags"/);
  assert.match(workbenchSrc, /data-testid="toggle-3d-edge-tags"/);
  assert.match(workbenchSrc, /mavis\.studio\.show-node-tags/);
  assert.match(workbenchSrc, /mavis\.studio\.show-edge-tags/);
  assert.match(threeSrc, /showNodeTags\s*=\s*true/);
  assert.match(threeSrc, /showEdgeTags\s*=\s*true/);
  assert.match(threeSrc, /if \(!hit\.object\.visible\) continue;/);
  assert.match(threeSrc, /data-show-node-tags=\{String\(showNodeTags\)\}/);
  assert.match(obsSrc, /showEdgeTags && wireLabel/);

  // Task 2: Cluster Overview (Stats tab) keeps KPIs + Resource Capacity + RED charts cleanly without duplicating Telemetry table
  assert.doesNotMatch(workbenchSrc, /Service Health & Topology/);
  assert.doesNotMatch(workbenchSrc, /Lab Scope & Dependency Paths/);
  assert.match(workbenchSrc, /Throughput/);

  // Task 3: EN/VI toggle right beside ? (ScreenHelpTrigger) + natural SE Vietnamese without translating service identifiers
  assert.match(workbenchSrc, /<ScreenHelpTrigger[\s\S]{0,2000}data-testid="studio-locale-toggle"/);
  assert.match(chartsSrc, /useLocale/);
  assert.match(exerciseSrc, /useLocale/);

  const { deriveExerciseFromLiveActions } = require("../src/features/runtime/studio-authoring-helpers.ts");
  const viImpact = deriveExerciseFromLiveActions(
    [{ action: "PAUSE", service: "payment-service", status: "CONFIRMED" }],
    [],
    "vi",
  );
  assert.ok(viImpact.instructions.includes("payment-service"), "VI draft must preserve service identifiers");
  assert.ok(viImpact.instructions.includes("PAUSE"), "VI draft must preserve SE action keyword");
  assert.ok(viImpact.summary.includes("Change Impact"), "VI summary must keep natural SE terminology");
});


test("Studio Live Task 4 UX polish: no bottom-drawer occlusion, author mission hidden by default, unified block controls, light/VI sidebar, crisp log badges", () => {
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const paritySrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-sandbox-parity.tsx"),
    "utf8",
  );
  const consoleSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-terminal-console.tsx"),
    "utf8",
  );

  // 1. Right floating panel reserves bottomHeight when bottom drawer is open so Expand/Close/Filters stay clickable
  assert.match(workbenchSrc, /const rightBottomReserve = !bottomCollapsed\s*\?\s*bottomHeight \+ 24/);
  assert.match(workbenchSrc, /maxHeight:\s*`calc\(100% - \$\{rightTopPx \+ rightBottomReserve\}px\)`/);

  // 2. Mission card defaults hidden in Author Mode so 3D canvas opens unobstructed (open by default for students)
  assert.match(workbenchSrc, /const \[missionHidden, setMissionHidden\] = useState\(\(\) => Boolean\(authoring\)\);/);

  // 3. Goal-specific Section 2 replaces duplicate 4+4 buttons; duplicate emerald banner removed
  assert.match(workbenchSrc, /data-testid="goal-specific-setup"/);
  assert.doesNotMatch(workbenchSrc, /Set Starts Down/);
  assert.equal(
    (workbenchSrc.match(/Use live actions as exercise/g) || []).length,
    1,
    "Use live actions as exercise CTA should appear once in top bar (no duplicate right-panel banner)",
  );

  // 4. Service List Sidebar supports light theme & Vietnamese SE localization with wrapped badges
  assert.match(paritySrc, /useLocale/);
  assert.match(paritySrc, /const isLight = studioStyle !== "control";/);
  assert.match(paritySrc, /hasAuthorBadges/);

  // 5. Log level badge (INFO/WARN/ERR/ACT) is protected from auto-translation and wrapping
  assert.match(consoleSrc, /data-no-translate[\s\S]{0,120}whitespace-nowrap/);
});


test("Studio Live Author UX & Performance: goal-specific rules, scalable service dropdown, click-to-deselect, 60fps drag/resize & optimistic goal switching", () => {
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  const threeSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );

  // 1. Section 2 is strictly scoped to each Exercise Goal (no cross-goal clutter)
  assert.match(workbenchSrc, /2\. Change Impact Setup/);
  assert.match(workbenchSrc, /2\. Scale-Out Setup/);
  assert.match(workbenchSrc, /2\. Outage Recovery Setup/);
  assert.match(workbenchSrc, /2\. CPU Degradation Setup/);
  assert.match(workbenchSrc, /activeGoalId === "change-impact"/);
  assert.match(workbenchSrc, /activeGoalId === "scale"/);
  assert.match(workbenchSrc, /activeGoalId === "recovery"/);
  assert.match(workbenchSrc, /activeGoalId === "cpu"/);

  // 2. Service selector sits at top above Exercise Goal (separate from Goal #2 details) using house Radix Select
  assert.match(
    workbenchSrc,
    /<SelectTrigger[\s\S]{0,240}data-testid="studio-stage-service-select"[\s\S]*1\. Exercise Goal[\s\S]*data-testid="goal-specific-setup"/,
  );

  // 3. Clicking an already-selected service toggles deselection
  assert.match(workbenchSrc, /const nextSvc = svc && svc === canvasSelected \? "" : svc;/);

  // 4. Panel drag/resize use RAF + direct DOM style/transform without per-pixel React setState; WebGL skips unchanged rebuilds & pauses raycast/blur during drag
  assert.match(workbenchSrc, /card\.style\.transform = `translate3d\(/);
  assert.match(workbenchSrc, /card\.style\.backdropFilter = "none"/);
  assert.match(workbenchSrc, /graphRef\.current\.style\.pointerEvents = "none"/);
  assert.match(workbenchSrc, /const nodeNames = useMemo\(/);
  assert.match(threeSrc, /if \(sceneSignature === lastSceneSigRef\.current\) return;/);
  assert.match(threeSrc, /hoveredServiceRef/);

  // 5. Optimistic Exercise Goal save prevents 1-2s UI lock & 5-query refetch storm
  assert.match(standaloneSrc, /visualMutationSeqRef/);
  assert.match(standaloneSrc, /lastSavedTopologyJsonRef/);
  assert.match(standaloneSrc, /const optimisticExercise = buildNextExercisePayload/);
  assert.match(standaloneSrc, /busy:\s*autoStudio\.isPending/);
});


test("Studio Live serializes visual saves (zero 409), supports text/plain 3D DnD, scales cleanly to 24+ services, and ships updated homepage previews", () => {
  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  const threeSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const homepageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/homepage/public-homepage.tsx"),
    "utf8",
  );

  // 1. Serialized save queue + fresh React Query cache revision lookup prevents rapid-toggle HTTP 409 Conflict
  assert.match(standaloneSrc, /visualSaveChainRef = useRef<Promise<unknown>>\(Promise\.resolve\(\)\)/);
  assert.match(standaloneSrc, /cache\.getQueryData<Response<"runtimeConfiguration">>\(\[\s*"api",\s*"runtimeConfiguration"/);
  assert.match(standaloneSrc, /const run = visualSaveChainRef\.current\.then\(execute, execute\);/);

  // 2. 3D Stage onDrop reads text/plain fallback for cross-browser / real-mouse HTML5 chip drag-and-drop
  assert.match(threeSrc, /event\.dataTransfer\.getData\("text\/plain"\)/);

  // 3. 24-service topology scalability: Reverse BFS (with cycle), 3D zone bounds, and 3D edge anchors
  const { computeStaticBlastRadius } = require("../src/features/runtime/studio-authoring-helpers.ts");
  const { computeLiveZoneRects, compute3DEdgeAnchors } = require("../src/features/runtime/studio-three-stage.tsx");

  const edgeNodes = ["api-gateway", "web-bff", "mobile-bff"];
  const coreNodes = Array.from({ length: 17 }, (_, i) => `svc-${String(i + 1).padStart(2, "0")}`);
  const dataNodes = ["db-orders", "db-payments", "redis-cache", "kafka-broker"];
  const all24 = [...edgeNodes, ...coreNodes, ...dataNodes];
  assert.equal(all24.length, 24);

  const edges24 = [
    { from: "api-gateway", to: "svc-01" },
    { from: "web-bff", to: "svc-01" },
    { from: "mobile-bff", to: "svc-02" },
    ...coreNodes.slice(0, -1).map((svc, idx) => ({ from: svc, to: coreNodes[idx + 1] })),
    { from: "svc-06", to: "svc-05" }, // deliberate cycle
    { from: "svc-17", to: "db-payments" },
    { from: "svc-12", to: "db-orders" },
    { from: "svc-08", to: "redis-cache" },
    { from: "svc-15", to: "kafka-broker" },
  ];

  const t0 = Date.now();
  const blast = computeStaticBlastRadius("db-payments", edges24);
  assert.equal(blast.target, "db-payments");
  assert.ok(blast.upstreamImpacted.includes("svc-17"));
  assert.ok(blast.upstreamImpacted.includes("svc-01"));
  assert.ok(blast.upstreamImpacted.includes("api-gateway"));
  assert.ok(blast.upstreamImpacted.includes("web-bff"));
  assert.ok(blast.upstreamImpacted.includes("mobile-bff"));
  assert.equal(blast.upstreamImpacted.length, 20, "All 17 core + 3 edge callers upstream of db-payments");
  assert.ok(blast.impactedEdgeKeys.has("svc-17->db-payments"));

  const posById = new Map();
  const positionedNodes = [];
  edgeNodes.forEach((id, i) => {
    const pos = { wx: -420, wz: (i - 1) * 140 };
    posById.set(id, pos);
    positionedNodes.push({ id, ...pos });
  });
  coreNodes.forEach((id, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const pos = { wx: -120 + col * 150, wz: (row - 1.5) * 140 };
    posById.set(id, pos);
    positionedNodes.push({ id, ...pos });
  });
  dataNodes.forEach((id, i) => {
    const pos = { wx: 680, wz: (i - 1.5) * 140 };
    posById.set(id, pos);
    positionedNodes.push({ id, ...pos });
  });

  const zones = computeLiveZoneRects(
    [
      { key: "EDGE", memberIds: edgeNodes },
      { key: "CORE", memberIds: coreNodes },
      { key: "DATA", memberIds: dataNodes },
    ],
    posById,
    -12,
    14,
    -8,
    8,
  );
  assert.equal(zones.length, 3);
  for (const z of zones) {
    assert.ok(Number.isFinite(z.cx) && Number.isFinite(z.cz));
    assert.ok(z.width >= 1.75 && z.depth >= 1.65);
  }
  const edgeZ = zones.find((z) => z.key === "EDGE");
  const coreZ = zones.find((z) => z.key === "CORE");
  assert.ok(edgeZ.cx + edgeZ.width / 2 <= coreZ.cx - coreZ.width / 2 + 0.01, "EDGE & CORE zones stay separated");

  for (const e of edges24) {
    const a = posById.get(e.from);
    const b = posById.get(e.to);
    const anchors = compute3DEdgeAnchors(
      a.wx * 0.0115,
      a.wz * 0.0115,
      b.wx * 0.0115,
      b.wz * 0.0115,
      positionedNodes,
      e.from,
      e.to,
      false,
    );
    for (const val of Object.values(anchors)) {
      if (typeof val === "number") {
        assert.ok(Number.isFinite(val), `Non-finite 3D anchor on ${e.from}->${e.to}`);
      }
    }
  }
  assert.ok(Date.now() - t0 < 500, "24-service Blast Radius + 3D layout calculation must stay sub-500ms");

  // 4. Homepage preview assets & Scale (1–3) copy parity
  assert.ok(homepageSrc.includes("Scale (1–3)"));
  assert.ok(!homepageSrc.includes("Scale (1–8)"));
  for (const file of [
    "architecture.webp",
    "architecture-dark.webp",
    "studio.webp",
    "studio-dark.webp",
    "course.webp",
    "course-dark.webp",
    "share.jpg",
  ]) {
    const p = path.join(__dirname, "../public/homepage", file);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 5000, `Missing or empty homepage asset: ${file}`);
  }
});

test("Studio Live UI panels, rail, drawer, terminal, and 3D controls synchronize cohesively across all 4 Studio themes", () => {
  const { STUDIO_STYLES, STUDIO_STYLE_LIST } = require("../src/features/runtime/studio-styles.ts");
  assert.equal(STUDIO_STYLE_LIST.length, 4);

  const requiredTokens = [
    "panelHeaderClass",
    "subSurfaceClass",
    "tabTrackClass",
    "tabActiveClass",
    "tabIdleClass",
    "controlActiveClass",
    "controlActiveMutedClass",
    "controlIdleClass",
    "inputClass",
    "topControlClass",
    "railActiveClass",
    "railIdleClass",
    "railBadgeClass",
    "drawerTabBarClass",
    "subtleTextClass",
    "dividerClass",
    "controlRadiusClass",
    "checkboxAccentClass",
  ];
  for (const styleId of STUDIO_STYLE_LIST) {
    const cfg = STUDIO_STYLES[styleId];
    for (const token of requiredTokens) {
      assert.ok(typeof cfg[token] === "string" && cfg[token].trim().length > 0, `Missing ${token} on ${styleId}`);
    }
  }
  // All 4 themes produce distinct inner control signatures (no stuck monochrome clone across themes)
  assert.equal(new Set(STUDIO_STYLE_LIST.map((id) => STUDIO_STYLES[id].controlActiveClass)).size, 4);
  assert.equal(new Set(STUDIO_STYLE_LIST.map((id) => STUDIO_STYLES[id].railActiveClass)).size, 4);
  assert.equal(new Set(STUDIO_STYLE_LIST.map((id) => STUDIO_STYLES[id].drawerTabBarClass)).size, 4);
  assert.equal(STUDIO_STYLES.blueprint.controlRadiusClass, "rounded-sm");
  assert.ok(STUDIO_STYLES.pop.controlActiveClass.includes("border-slate-900"));
  assert.ok(STUDIO_STYLES.pop.controlActiveClass.includes("shadow-[2px_2px_0_#0F172A]"));

  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const terminalSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-terminal-console.tsx"),
    "utf8",
  );
  const obsSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );

  assert.ok(workbenchSrc.includes("styleCfg.panelHeaderClass"));
  assert.ok(workbenchSrc.includes("styleCfg.subSurfaceClass"));
  assert.ok(workbenchSrc.includes("styleCfg.controlActiveClass"));
  assert.ok(workbenchSrc.includes("styleCfg.railActiveClass"));
  assert.ok(workbenchSrc.includes("styleCfg.drawerTabBarClass"));
  assert.ok(workbenchSrc.includes("studioStyle={studioStyle}"));
  assert.ok(terminalSrc.includes("STUDIO_STYLES[resolvedStyle]"));
  assert.ok(obsSrc.includes("styleCfg.controlActiveClass"));
});

test("Studio Live 3D Diorama uses studio PBR RoomEnvironment IBL, 5 distinct sculpted glass-chamber archetypes, and telemetry-driven 60fps animations", () => {
  const { resolveVisualArchetype } = require("../src/features/runtime/studio-three-stage.tsx");
  assert.equal(resolveVisualArchetype({ id: "api-gateway", archetype: "GATEWAY" }), "GATEWAY");
  assert.equal(resolveVisualArchetype({ id: "order-service", archetype: "SERVICE" }), "SERVICE");
  assert.equal(resolveVisualArchetype({ id: "notification-worker", archetype: "SERVICE" }), "WORKER");
  assert.equal(resolveVisualArchetype({ id: "email-dispatcher", archetype: "SERVICE" }), "WORKER");
  assert.equal(resolveVisualArchetype({ id: "postgres-db", archetype: "DATABASE" }), "DATABASE");
  assert.equal(resolveVisualArchetype({ id: "kafka-broker", archetype: "QUEUE" }), "QUEUE");

  const stageSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  // Studio IBL PBR lighting + clearcoat frosted crystal glass + grounded contact shadow & glow textures
  assert.ok(stageSrc.includes("RoomEnvironment"));
  assert.ok(stageSrc.includes("PMREMGenerator"));
  assert.ok(stageSrc.includes("MeshPhysicalMaterial"));
  assert.ok(stageSrc.includes("createContactShadowTexture"));
  assert.ok(stageSrc.includes("createSoftGlowTexture"));
  assert.ok(stageSrc.includes("buildTurbineRotor"));
  // Living 60fps animations & reactive fault FX (stasis dome on pause, rising smoke/embers on stop, sliding queue capsules)
  assert.ok(stageSrc.includes("rig.rotors"));
  assert.ok(stageSrc.includes("rig.hoverCores"));
  assert.ok(stageSrc.includes("rig.pulseMaterials"));
  assert.ok(stageSrc.includes("rig.streamCapsules"));
  assert.ok(stageSrc.includes("rig.smokeParticles"));
  assert.ok(stageSrc.includes("rig.stasisRing"));
  // Clean shared-texture protection & unmount disposal
  assert.ok(stageSrc.includes('!spriteMat.map.userData?.["__shared"]'));
  assert.ok(stageSrc.includes("envTargetRef.current?.dispose()"));
});

test("LabStudioSection Launchpad renders theme-synced Exercise Spec, 3-step checklist, Sync Docker tooltip, and scalable Mini Topology SVG", () => {
  const { computeMiniTopologyLayout } = require("../src/features/runtime/studio-authoring-helpers.ts");

  // 1. Standard 5-service DAG layers gateway -> core -> downstream cleanly left-to-right
  const dag = computeMiniTopologyLayout(
    ["api-gateway", "order-service", "payment-service", "catalog-service", "notification-worker"],
    [
      { from: "api-gateway", to: "order-service" },
      { from: "order-service", to: "payment-service" },
      { from: "order-service", to: "catalog-service" },
      { from: "order-service", to: "notification-worker" },
    ],
  );
  assert.equal(dag.nodes.length, 5);
  assert.equal(dag.edges.length, 4);
  assert.equal(dag.hiddenCount, 0);
  const byName = new Map(dag.nodes.map((n) => [n.service, n]));
  assert.equal(byName.get("api-gateway").col, 0);
  assert.equal(byName.get("order-service").col, 1);
  assert.equal(byName.get("payment-service").col, 2);
  assert.ok(dag.edges.every((e) => e.path.startsWith("M ")));

  // 2. Cyclic graph never infinite-loops and preserves all edges
  const cyclic = computeMiniTopologyLayout(
    ["svc-a", "svc-b", "svc-c"],
    [
      { from: "svc-a", to: "svc-b" },
      { from: "svc-b", to: "svc-c" },
      { from: "svc-c", to: "svc-a" },
    ],
  );
  assert.equal(cyclic.nodes.length, 3);
  assert.equal(cyclic.edges.length, 3);

  // 3. Large 20-service repo caps SVG to 12 nodes while always retaining priority targets
  const largeServices = Array.from({ length: 20 }, (_, i) => `svc-${i + 1}`);
  const capped = computeMiniTopologyLayout(largeServices, [], {
    priorityServices: ["svc-19", "svc-20"],
    maxNodes: 12,
  });
  assert.equal(capped.nodes.length, 12);
  assert.equal(capped.hiddenCount, 8);
  assert.ok(capped.nodes.some((n) => n.service === "svc-19"));
  assert.ok(capped.nodes.some((n) => n.service === "svc-20"));

  // 4. LabStudioSection uses theme-synced Launchpad surface (no hardcoded #070b12 slab), checklist, tooltip & Mini Topology
  const labStudioSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/assignments/lab-studio-section.tsx"),
    "utf8",
  );
  assert.ok(labStudioSrc.includes('data-testid="lab-studio-launchpad"'));
  assert.ok(labStudioSrc.includes('data-testid="lab-studio-mini-topology"'));
  assert.ok(labStudioSrc.includes("computeMiniTopologyLayout"));
  assert.ok(labStudioSrc.includes("TooltipContent"));
  assert.ok(!labStudioSrc.includes("bg-[#070b12]"));
});

test("Smart endpoint auto-picker, structured 3-step student instructions, and goal-specific Advanced Settings work across all 4 exercise types", () => {
  const {
    extractRepoEndpointOptions,
    smartPickBaselineEndpoint,
    buildStudentExerciseInstructions,
  } = require("../src/features/runtime/studio-authoring-helpers.ts");

  // 1. Live-flow REST gateway route ranks strictly above GraphQL storefront & /version
  const omniProfile = {
    detectedEndpoints: [
      { method: "GET", service: "api-gateway", path: "/api/v1/graphql/storefront" },
      { method: "GET", service: "api-gateway", path: "/api/v1/storefront/live-flow" },
      { method: "GET", service: "api-gateway", path: "/api/v1/orders" },
      { method: "GET", service: "order-service", path: "/api/orders/live-flow" },
      { method: "GET", service: "api-gateway", path: "/version" },
    ],
  };
  const opts = extractRepoEndpointOptions(omniProfile, "/api/gateway/orders");
  assert.equal(opts[0].path, "/api/v1/storefront/live-flow");
  assert.equal(opts[0].verified, true);

  // 2. Smart picker uses Reverse BFS to auto-upgrade stale /api/gateway/orders -> /api/v1/storefront/live-flow
  const edges = [
    { from: "api-gateway", to: "order-service" },
    { from: "order-service", to: "payment-service" },
    { from: "order-service", to: "catalog-service" },
  ];
  const upgraded = smartPickBaselineEndpoint({
    endpointOptions: opts,
    currentPath: "/api/gateway/orders",
    targetService: "payment-service",
    edges,
  });
  assert.equal(upgraded.path, "/api/v1/storefront/live-flow");
  assert.equal(upgraded.autoUpgraded, true);
  assert.equal(upgraded.isCurrentStale, true);
  assert.ok(upgraded.reasonVi.includes("api-gateway"));

  // Preserves intentional verified route when already selected
  const kept = smartPickBaselineEndpoint({
    endpointOptions: opts,
    currentPath: "/api/v1/orders",
    targetService: "payment-service",
    edges,
  });
  assert.equal(kept.path, "/api/v1/orders");
  assert.equal(kept.autoUpgraded, false);
  assert.equal(kept.isCurrentStale, false);

  // 3. Structured 3-step instructions cover all 4 types in VI & EN without leaking prediction answers
  const ciVi = buildStudentExerciseInstructions({
    exerciseType: "CHANGE_IMPACT",
    targetAction: { action: "PAUSE", service: "payment-service" },
    predictionRequired: true,
    minImpactF1: 0.7,
    locale: "vi",
  });
  assert.ok(ciVi.includes("1.") && ciVi.includes("2.") && ciVi.includes("3."));
  assert.ok(ciVi.includes("payment-service") && ciVi.includes("PAUSE") && ciVi.includes("70%"));
  assert.ok(!ciVi.includes("api-gateway") && !ciVi.includes("order-service"), "Must not spoil prediction answers");

  const scaleEn = buildStudentExerciseInstructions({
    exerciseType: "SCALE_UNDER_LOAD",
    targetAction: { action: "SCALE", service: "order-service", replicas: 3 },
    minReplicas: [{ service: "order-service", count: 3 }],
    maxErrorRatePercent: 5,
    maxP95Ms: 500,
    locale: "en",
  });
  assert.ok(scaleEn.includes("1.") && scaleEn.includes("3x") && scaleEn.includes("500 ms"));

  const recVi = buildStudentExerciseInstructions({
    exerciseType: "CIRCUIT_BREAKER",
    stoppedServices: ["payment-service"],
    maxErrorRatePercent: 0,
    locale: "vi",
  });
  assert.ok(recVi.includes("1.") && recVi.includes("START") && recVi.includes("payment-service"));

  const cpuVi = buildStudentExerciseInstructions({
    exerciseType: "CONFIG_REGRESSION",
    targetAction: { action: "THROTTLE_CPU", service: "catalog-service", cpuPercent: 15 },
    locale: "vi",
  });
  assert.ok(cpuVi.includes("1.") && cpuVi.includes("15%") && cpuVi.includes("catalog-service"));

  // 4. Workbench mounts goal-specific Advanced Settings & themed Radix endpoint Select + regenerate
  const workbenchSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const standaloneSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  assert.ok(workbenchSrc.includes('data-testid="goal-specific-advanced"'));
  assert.ok(workbenchSrc.includes('data-testid="advanced-change-impact"'));
  assert.ok(workbenchSrc.includes('data-testid="advanced-scale"'));
  assert.ok(workbenchSrc.includes('data-testid="advanced-recovery"'));
  assert.ok(workbenchSrc.includes('data-testid="advanced-cpu"'));
  assert.ok(workbenchSrc.includes('data-testid="studio-baseline-endpoint-select"'));
  assert.ok(workbenchSrc.includes('data-testid="apply-smart-endpoint-btn"'));
  assert.ok(workbenchSrc.includes('data-testid="regenerate-instructions-btn"'));
  assert.ok(standaloneSrc.includes("smartPickBaselineEndpoint"));
  assert.ok(standaloneSrc.includes("buildStudentExerciseInstructions"));
});

test("HyperMesh Audit P0-1..P1-9: multi-lab auto-link, receipt sealing & cache sync, SSE/LIVE shutdown, Author SET_LOAD, Launchpad checklist, WebGL recovery, CourseBuilder drawer, always-visible Finish, and 404 guards", () => {
  const standalone = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  const labStudio = fs.readFileSync(
    path.join(__dirname, "../src/features/assignments/lab-studio-section.tsx"),
    "utf8",
  );
  const sessionHook = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/use-studio-session.ts"),
    "utf8",
  );
  const courseAccess = fs.readFileSync(
    path.join(__dirname, "../src/features/workspaces/course-access.tsx"),
    "utf8",
  );
  const courseScreens = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/screens.tsx"),
    "utf8",
  );
  const workbench = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/live-studio-workbench.tsx"),
    "utf8",
  );
  const threeStage = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obs = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const builder = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/course-builder.tsx"),
    "utf8",
  );

  // P0-1: courseReference fallback + auto-link + fixed Step 1 Repository link (no dead ?tab=source)
  assert.ok(standalone.includes("courseReference?.projectId"));
  assert.ok(standalone.includes("autoLinkedLabRef"));
  assert.ok(!standalone.includes("&tab=source"));
  assert.ok(standalone.includes("/references?workspace="));
  assert.ok(labStudio.includes("autoLinkedRef"));

  // P0-2: fresh refetchOnMount, sealing wait in modal, and isFetching guard + auto-dismiss on /lab?step=3
  assert.ok(courseAccess.includes('refetchOnMount: "always"'));
  assert.ok(courseScreens.includes("studentContext.isFetching"));
  assert.ok(courseScreens.includes("studentStudioSessions.isFetching"));
  assert.ok(workbench.includes("isReceiptSealed"));
  assert.ok(workbench.includes('t("Studio Snapshots", "Ảnh chụp Studio")'));
  assert.ok(workbench.includes('t("Waiting for receipt…", "Đang chờ niêm phong…")'));

  // P0-3: close SSE & stop polling on finish/terminal, show FINISHING pill, suppress post-terminal error banner
  assert.ok(sessionHook.includes("!finish.isPending"));
  assert.ok(sessionHook.includes("!data?.finishRequested"));
  assert.ok(sessionHook.includes("!isTerminalCached"));
  assert.ok(workbench.includes('? "FINISHING"'));
  assert.ok(workbench.includes("!isTerminalExecution && !data.finishRequested"));

  // P1-4: Author mode live test exposes SET_LOAD [5, 15, 30, 50] RPS controls
  const loadMatches = workbench.match(/\[5, 15, 30, 50\]\.map/g) || [];
  assert.ok(loadMatches.length >= 3, "Light, Dark, and Author modes must all expose SET_LOAD [5, 15, 30, 50]");

  // P1-5: Launchpad Step 2 ignores default seeded revision-1 placeholder instructions; Step 3 polls in-flight sessions
  assert.ok(!labStudio.includes("exercise.data?.instructions?.trim(),"));
  assert.ok(labStudio.includes("(exercise.data?.revision ?? 0) > 1"));
  assert.ok(courseAccess.includes("hasInFlight ? 2500 : false"));

  // P1-6: WebGL context loss/restore recovery + single GPU readback in captureStudioImage + no height transition thrash
  assert.ok(threeStage.includes("webglcontextlost"));
  assert.ok(threeStage.includes("webglcontextrestored"));
  assert.ok(obs.includes("sourceCanvas"));
  assert.ok(!workbench.includes("transition-[height] duration-150"));

  // P1-7: CourseBuilder closes drawer cleanly after addModule/saveModule/addItem, supports Escape, never renders empty overlay
  assert.ok(builder.includes("isDrawerVisible"));
  assert.ok(builder.includes('event.key === "Escape"'));
  assert.ok(builder.includes("onSuccess: () => closeDrawer()"));

  // P1-8: Finish Studio button remains accessible in the expanded bottom drawer header bar
  assert.ok(workbench.includes('data-testid="drawer-finish-studio-btn"'));

  // P1-9: Noisy 404 guards on course/versions & unpublished quiz + initial load ErrorState on /studio-live
  assert.ok(courseAccess.includes("Boolean(query.data?.id) &&"));
  assert.ok(courseScreens.includes("studentContext.data?.quiz != null"));
  assert.ok(standalone.includes("initialLoadError"));
});

test("Follow-up polish: submission BFF timeout/fast-submit, multi-lab step-3 prev link scoping, and Active New Lab guard", () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, "../src/lib/api/backend-adapter.ts"),
    "utf8",
  );
  const javaOps = fs.readFileSync(
    path.join(__dirname, "../src/lib/api/java-operations.ts"),
    "utf8",
  );
  const screens = fs.readFileSync(
    path.join(__dirname, "../src/features/courses/screens.tsx"),
    "utf8",
  );
  const labAuthoring = fs.readFileSync(
    path.join(__dirname, "../src/features/assignments/lab-authoring.tsx"),
    "utf8",
  );

  for (const op of ['"submit"', '"submissions"', '"workspaceSubmissions"', '"assignmentSubmissions"', '"submission"']) {
    assert.ok(adapter.includes(op), `BackendAdapter must grant 60s timeout tier to ${op}`);
  }
  assert.match(
    javaOps,
    /if \(Array\.isArray\(input\["theoryAnswers"\]\)\)[\s\S]*?,\s*false,\s*false,\s*\);/,
  );
  assert.ok(screens.includes("(!item.assignmentId || item.assignmentId === assignmentId)"));
  assert.ok(screens.includes("const isSameAssignment = targetAssignmentId === assignmentId;"));
  assert.ok(screens.includes("const isSameLabItem = !item.assignmentId || item.assignmentId === assignmentId;"));
  assert.match(
    labAuthoring,
    /\{assignment && courseAccess\.canCreateLabs && \(\s*<Button[\s\S]{0,900}t\("New Lab", "Tạo Lab mới"\)/,
  );
});

test("Submission detail UX cleanup: hides raw SHA-256 digests, deduplicates notes/snapshots, and clearly labels student snapshot captions", () => {
  const studioEv = fs.readFileSync(
    path.join(__dirname, "../src/features/submissions/studio-evidence.tsx"),
    "utf8",
  );
  const frozen = fs.readFileSync(
    path.join(__dirname, "../src/features/submissions/frozen-artifacts.tsx"),
    "utf8",
  );
  const components = fs.readFileSync(
    path.join(__dirname, "../src/features/submissions/components.tsx"),
    "utf8",
  );

  assert.doesNotMatch(studioEv, /evidence\.data\.studioEvidence\.receiptDigest/);
  assert.doesNotMatch(studioEv, /\{snapshot\.digest\}/);
  assert.ok(studioEv.includes('t("Student note when capturing", "Ghi chú của sinh viên lúc chụp")'));
  assert.ok(studioEv.includes("localizeRuleLabel"));

  assert.doesNotMatch(frozen, /Evidence package SHA-256|Technical details & export|Frozen Lab v2|\(\{snap\.step\}\)/);
  assert.ok(frozen.includes("visibleStudentSnapshots"));
  assert.ok(frozen.includes('quizEv.status !== "NOT_REQUIRED"'));

  assert.doesNotMatch(components, /Technical verification IDs & digests/);
  assert.ok(components.includes("isNotesDuplicated"));
});

test("3D SE block polish + authoring & reliability fixes: distance-compensated labels with pin, CORE-DATA zone separation, front zone badge, worker stereotype, Course Builder done link, and socket-reset retry", () => {
  const { computeLiveZoneRects } = require("../src/features/runtime/studio-three-stage.tsx");
  const posById = new Map([
    ["api-gateway", { wx: -300, wz: 0 }],
    ["order-service", { wx: 0, wz: 0 }],
    ["postgres-db", { wx: 150, wz: 0 }],
  ]);
  const zones = computeLiveZoneRects(
    [
      { key: "EDGE", memberIds: ["api-gateway"] },
      { key: "CORE", memberIds: ["order-service"] },
      { key: "DATA", memberIds: ["postgres-db"] },
    ],
    posById,
    -6,
    6,
    -4,
    4,
  );
  const core = zones.find((z) => z.key === "CORE");
  const data = zones.find((z) => z.key === "DATA");
  assert.ok(core && data, "Both CORE and DATA zones must be computed");
  assert.ok(
    core.cx + core.width / 2 <= data.cx - data.width / 2 + 0.01,
    "CORE and DATA trust zones must separate horizontally without overlapping borders",
  );

  const stage = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-three-stage.tsx"),
    "utf8",
  );
  const obs = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-observability.tsx"),
    "utf8",
  );
  const styles = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/studio-styles.ts"),
    "utf8",
  );
  const standalone = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/standalone-studio-live.tsx"),
    "utf8",
  );
  const labStudio = fs.readFileSync(
    path.join(__dirname, "../src/features/assignments/lab-studio-section.tsx"),
    "utf8",
  );
  const grading = fs.readFileSync(
    path.join(__dirname, "../src/features/submissions/grading.tsx"),
    "utf8",
  );
  const proxyRoute = fs.readFileSync(
    path.join(__dirname, "../app/api/backend/[...path]/route.ts"),
    "utf8",
  );

  assert.ok(stage.includes("labelPin"));
  assert.ok(stage.includes("depthComp"));
  assert.ok(stage.includes("badgeMesh.position.set(0, 0.018, hd)"));
  assert.ok(stage.includes("staticCurve"));
  assert.ok(obs.includes('visualRole === "WORKER"'));
  assert.ok(obs.includes("«worker»"));
  assert.ok(styles.includes('worker: { accent: "#6366f1"'));
  assert.doesNotMatch(styles, /"order"\s*\|\s*"payment"\s*\|\s*"catalog"/);
  assert.ok(standalone.includes("/course-builder?workspace="));
  assert.ok(standalone.includes("stateless.find((s) => /payment|billing/i.test(s))"));
  assert.ok(labStudio.includes('baselineRequest.path !== "/api/gateway/orders"'));
  assert.ok(grading.includes("formatGradeRowTitle"));
  assert.ok(grading.includes("line-clamp-2"));
  assert.ok(proxyRoute.includes("canRetrySocketReset"));
});
