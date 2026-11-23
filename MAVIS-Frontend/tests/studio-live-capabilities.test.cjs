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
  assert.ok(obsSrc.includes('data-tour="studio-services-graph"'));
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
