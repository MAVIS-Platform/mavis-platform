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
      if (id === "lucide-react" || id.endsWith("button") || id.endsWith("input")) return {};
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
