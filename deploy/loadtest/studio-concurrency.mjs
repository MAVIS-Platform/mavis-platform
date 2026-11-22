#!/usr/bin/env node
// Studio Live concurrency load test (Go/No-Go gate for scaling active slots to 10).
// Node 20+, zero dependencies (uses built-in fetch).
//
// Required env:
//   MAVIS_BASE_URL       e.g. https://maviss.site (Cookie) or http://127.0.0.1:8080 (Bearer)
//   MAVIS_LOADTEST_AUTH  newline-separated auth lines (one per enrolled student):
//                        "Cookie: mavis_session=..." / "mavis_session=..." OR "Bearer <jwt>"
//                        (or set MAVIS_LOADTEST_AUTH_FILE=/path/to/auth.txt)
//   WORKSPACE_ID         course workspace UUID
//   ASSIGNMENT_ID        lab assignment UUID
// Optional env:
//   CONCURRENCY=10  ROUNDS=3  TARGET_SERVICE=<service-name>
//   BOOT_TIMEOUT_MS=180000  ACTION_TIMEOUT_MS=60000  FINISH_TIMEOUT_MS=90000  POLL_INTERVAL_MS=2000

import { readFileSync } from "node:fs";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT"]);

function parseAuthEntries() {
  const raw =
    process.env.MAVIS_LOADTEST_AUTH ||
    (process.env.MAVIS_LOADTEST_AUTH_FILE
      ? readFileSync(process.env.MAVIS_LOADTEST_AUTH_FILE, "utf8")
      : "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      if (/^(Authorization:\s*)?Bearer\s+/i.test(line)) {
        const token = line.replace(/^(Authorization:\s*)?Bearer\s+/i, "").trim();
        return { mode: "bearer", headerName: "Authorization", headerValue: `Bearer ${token}` };
      }
      const cookie = line.replace(/^Cookie:\s*/i, "").trim();
      return { mode: "cookie", headerName: "Cookie", headerValue: cookie };
    });
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LoadTestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createClient(baseUrl, auth, controlLatencies) {
  const origin = new URL(baseUrl).origin;
  const cleanBase = baseUrl.replace(/\/+$/, "");

  async function request(method, path, body) {
    const headers = { [auth.headerName]: auth.headerValue };
    if (auth.mode === "cookie" && method !== "GET") {
      headers.Origin = origin;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const started = performance.now();
    let res;
    try {
      res = await fetch(`${cleanBase}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new LoadTestError("NETWORK_ERROR", String(err));
    }
    controlLatencies.push(performance.now() - started);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const code =
        (typeof json?.errorCode === "string" && json.errorCode) ||
        (typeof json?.code === "string" && json.code) ||
        `HTTP_${res.status}`;
      throw new LoadTestError(code, json?.message || json?.error || `HTTP ${res.status} on ${path}`);
    }
    return json && typeof json === "object" && "data" in json ? json.data : json;
  }

  if (auth.mode === "cookie") {
    return {
      startSession: (workspaceId, assignmentId) =>
        request("POST", `/api/backend/workspaces/${workspaceId}/course-labs/${assignmentId}/studio-sessions`, {}),
      getState: (sessionId) =>
        request("GET", `/api/mavis/studioState?input=${encodeURIComponent(JSON.stringify({ sessionId }))}`),
      submitAction: (sessionId, action, service) =>
        request("POST", "/api/mavis/studioAction", { sessionId, action, service }),
      captureSnapshot: (sessionId, explanation) =>
        request("POST", "/api/mavis/studioCapture", { sessionId, explanation }),
      finishSession: (sessionId) => request("POST", "/api/mavis/studioFinish", { sessionId }),
    };
  }

  return {
    startSession: (workspaceId, assignmentId) =>
      request("POST", `/api/v1/workspaces/${workspaceId}/course-labs/${assignmentId}/studio-sessions`, {}),
    getState: (sessionId) => request("GET", `/api/v1/analyzer/runtime/sessions/${sessionId}/studio`),
    submitAction: (sessionId, action, service) =>
      request("POST", `/api/v1/analyzer/runtime/sessions/${sessionId}/studio/actions`, { action, service }),
    captureSnapshot: (sessionId, explanation) =>
      request("POST", `/api/v1/analyzer/runtime/sessions/${sessionId}/studio/snapshots`, { explanation }),
    finishSession: (sessionId) =>
      request("POST", `/api/v1/analyzer/runtime/sessions/${sessionId}/studio/finish`, {}),
  };
}

function pickTargetService(state, preferred) {
  if (preferred) return preferred;
  const fromTelemetry = state?.telemetry?.services?.[0]?.service;
  if (typeof fromTelemetry === "string" && fromTelemetry) return fromTelemetry;
  const fromList = Array.isArray(state?.services) ? state.services[0] : null;
  if (typeof fromList === "string" && fromList) return fromList;
  if (fromList && typeof fromList.name === "string") return fromList.name;
  throw new LoadTestError("NO_TARGET_SERVICE", "Could not detect target service from studioState; set TARGET_SERVICE.");
}

async function waitForActionConfirmed(client, sessionId, actionName, service, prevCount, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await client.getState(sessionId);
    const actions = Array.isArray(state?.actions) ? state.actions : [];
    const matching = actions.slice(prevCount).find((a) => a.action === actionName && a.service === service);
    if (matching) {
      const status = String(matching.status || "").toUpperCase();
      if (status === "CONFIRMED") return actions.length;
      if (status === "FAILED" || status === "REJECTED") {
        throw new LoadTestError(`ACTION_${actionName}_${status}`, `Action ${actionName} on ${service} ended as ${status}`);
      }
    }
    const exec = String(state?.executionStatus || "").toUpperCase();
    if (TERMINAL.has(exec)) {
      throw new LoadTestError(`SESSION_ENDED_${exec}`, `Session ended (${exec}) while waiting for ${actionName}`);
    }
    await sleep(pollMs);
  }
  throw new LoadTestError(`ACTION_${actionName}_TIMEOUT`, `Timed out waiting for ${actionName} confirmation`);
}

async function runVirtualStudent(cfg, auth, studentIdx, roundIdx, controlLatencies) {
  const client = createClient(cfg.baseUrl, auth, controlLatencies);
  const startWall = performance.now();
  const started = await client.startSession(cfg.workspaceId, cfg.assignmentId);
  const sessionId = started?.id || started?.sessionId;
  if (!sessionId) throw new LoadTestError("MISSING_SESSION_ID", "Studio launch returned no session id");

  // 1. Poll until RUNNING
  let state = null;
  const bootDeadline = Date.now() + cfg.bootTimeoutMs;
  while (Date.now() < bootDeadline) {
    state = await client.getState(sessionId);
    const exec = String(state?.executionStatus || "").toUpperCase();
    if (exec === "RUNNING") break;
    if (TERMINAL.has(exec)) {
      throw new LoadTestError(`BOOT_${exec}`, `Session terminated before RUNNING (${exec})`);
    }
    await sleep(cfg.pollIntervalMs);
  }
  if (String(state?.executionStatus || "").toUpperCase() !== "RUNNING") {
    throw new LoadTestError("BOOT_TIMEOUT", `Session ${sessionId} did not reach RUNNING within ${cfg.bootTimeoutMs}ms`);
  }
  const bootMs = performance.now() - startWall;

  // 2. STOP then START target service, waiting for CONFIRMED each time
  const service = pickTargetService(state, cfg.targetService);
  let actionCount = Array.isArray(state?.actions) ? state.actions.length : 0;
  await client.submitAction(sessionId, "STOP", service);
  actionCount = await waitForActionConfirmed(
    client, sessionId, "STOP", service, actionCount, cfg.actionTimeoutMs, cfg.pollIntervalMs,
  );
  await client.submitAction(sessionId, "START", service);
  await waitForActionConfirmed(
    client, sessionId, "START", service, actionCount, cfg.actionTimeoutMs, cfg.pollIntervalMs,
  );

  // 3. Capture 1 explanation-only snapshot (no image)
  await client.captureSnapshot(
    sessionId,
    `Load test round ${roundIdx + 1} student ${studentIdx + 1}: verified STOP/START recovery on ${service}.`,
  );

  // 4. Finish and wait for terminal status
  await client.finishSession(sessionId);
  const finishDeadline = Date.now() + cfg.finishTimeoutMs;
  while (Date.now() < finishDeadline) {
    const finalState = await client.getState(sessionId);
    const exec = String(finalState?.executionStatus || "").toUpperCase();
    if (TERMINAL.has(exec)) {
      return { ok: true, sessionId, bootMs, finalStatus: exec };
    }
    await sleep(cfg.pollIntervalMs);
  }
  throw new LoadTestError("FINISH_TIMEOUT", `Session ${sessionId} did not terminate within ${cfg.finishTimeoutMs}ms`);
}

async function main() {
  const baseUrl = process.env.MAVIS_BASE_URL?.trim();
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  const assignmentId = process.env.ASSIGNMENT_ID?.trim();
  const authEntries = parseAuthEntries();

  if (!baseUrl || !workspaceId || !assignmentId || authEntries.length === 0) {
    console.error(
      "Usage: MAVIS_BASE_URL=<url> WORKSPACE_ID=<uuid> ASSIGNMENT_ID=<uuid> " +
        "MAVIS_LOADTEST_AUTH=<lines> [CONCURRENCY=10 ROUNDS=3 TARGET_SERVICE=<svc>] node deploy/loadtest/studio-concurrency.mjs",
    );
    process.exit(2);
  }

  const cfg = {
    baseUrl,
    workspaceId,
    assignmentId,
    targetService: process.env.TARGET_SERVICE?.trim() || "",
    concurrency: Math.max(1, Number.parseInt(process.env.CONCURRENCY || "10", 10)),
    rounds: Math.max(1, Number.parseInt(process.env.ROUNDS || "3", 10)),
    bootTimeoutMs: Math.max(5000, Number.parseInt(process.env.BOOT_TIMEOUT_MS || "180000", 10)),
    actionTimeoutMs: Math.max(5000, Number.parseInt(process.env.ACTION_TIMEOUT_MS || "60000", 10)),
    finishTimeoutMs: Math.max(5000, Number.parseInt(process.env.FINISH_TIMEOUT_MS || "90000", 10)),
    pollIntervalMs: Math.max(50, Number.parseInt(process.env.POLL_INTERVAL_MS || "2000", 10)),
  };

  const bootTimes = [];
  const controlLatencies = [];
  const errorsByCode = {};
  let passedSessions = 0;
  let failedSessions = 0;

  for (let round = 0; round < cfg.rounds; round++) {
    const tasks = Array.from({ length: cfg.concurrency }, (_, idx) => {
      const auth = authEntries[idx % authEntries.length];
      return runVirtualStudent(cfg, auth, idx, round, controlLatencies)
        .then((res) => {
          passedSessions++;
          bootTimes.push(res.bootMs);
        })
        .catch((err) => {
          failedSessions++;
          const code = err instanceof LoadTestError ? err.code : "UNEXPECTED_ERROR";
          errorsByCode[code] = (errorsByCode[code] || 0) + 1;
        });
    });
    await Promise.all(tasks);
  }

  const totalSessions = passedSessions + failedSessions;
  const failPercent = totalSessions > 0 ? Number(((failedSessions * 100) / totalSessions).toFixed(2)) : 100;
  const bootP50 = percentile(bootTimes, 50);
  const bootP95 = percentile(bootTimes, 95);
  const controlP50 = percentile(controlLatencies, 50);
  const controlP95 = percentile(controlLatencies, 95);

  const failUnder5Pct = failPercent < 5;
  const bootP95Under60s = bootTimes.length > 0 && bootP95 < 60_000;
  const controlApiP95Under3s = controlLatencies.length > 0 && controlP95 < 3_000;
  const passed = failUnder5Pct && bootP95Under60s && controlApiP95Under3s;

  const summary = {
    totalSessions,
    passedSessions,
    failedSessions,
    failPercent,
    bootMs: { p50: bootP50, p95: bootP95, max: Math.round(Math.max(0, ...bootTimes)) },
    controlApiMs: { p50: controlP50, p95: controlP95, max: Math.round(Math.max(0, ...controlLatencies)) },
    errorsByCode,
    goNoGo: {
      failUnder5Pct,
      bootP95Under60s,
      controlApiP95Under3s,
      passed,
      note: "Also confirm 0 orphaned mavisrun-* stacks on the Runner VM 10 minutes after completion.",
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(passed ? 0 : 1);
}

main();
