const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
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
