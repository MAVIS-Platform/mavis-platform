import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loadtest/studio-concurrency.mjs");

function startStubServer() {
  const sessions = new Map();
  let seq = 0;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    const url = new URL(req.url, `http://${req.headers.host}`);

    const send = (status, payload, extraHeaders = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
      res.end(JSON.stringify(payload));
    };

    const isCookie = Boolean(req.headers.cookie);
    const isBearer = String(req.headers.authorization || "").startsWith("Bearer ");
    if (!isCookie && !isBearer) return send(401, { message: "Unauthorized" });
    if (isCookie && req.method !== "GET" && req.headers.origin !== `http://${req.headers.host}`) {
      return send(403, { message: "Missing Origin header" });
    }

    // Launch Studio session
    if (req.method === "POST" && /\/studio-sessions$/.test(url.pathname)) {
      const id = `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;
      sessions.set(id, { polls: 0, status: "QUEUED", actions: [], snapshots: 0, rotatedSeen: false });
      return send(200, { status: 200, data: { id, executionStatus: "QUEUED" } });
    }

    // Cookie mode (/api/mavis/*)
    if (url.pathname === "/api/mavis/studioState") {
      const { sessionId } = JSON.parse(url.searchParams.get("input") || "{}");
      const s = sessions.get(sessionId);
      if (!s) return send(404, { message: "Not found" });
      s.polls++;
      if (s.polls === 1) {
        // Simulate BFF auto-refresh rotating mavis_session & mavis_refresh
        return send(
          200,
          {
            executionStatus: s.status,
            telemetry: { services: [{ service: "payment-api", runningReplicas: 1 }] },
            actions: s.actions,
          },
          {
            "Set-Cookie": [
              `mavis_session=rotated-${sessionId}; Path=/; HttpOnly`,
              `mavis_refresh=refresh-${sessionId}; Path=/; HttpOnly`,
            ],
          },
        );
      }
      if (String(req.headers.cookie || "").includes(`mavis_session=rotated-${sessionId}`)) {
        s.rotatedSeen = true;
      }
      if (s.status === "QUEUED" && s.polls >= 2) s.status = "RUNNING";
      return send(200, {
        executionStatus: s.status,
        telemetry: { services: [{ service: "payment-api", runningReplicas: 1 }] },
        actions: s.actions,
      });
    }
    if (url.pathname === "/api/mavis/studioAction") {
      const s = sessions.get(body.sessionId);
      assert.match(String(req.headers.cookie || ""), new RegExp(`mavis_session=rotated-${body.sessionId}`));
      assert.match(String(req.headers.cookie || ""), new RegExp(`mavis_refresh=refresh-${body.sessionId}`));
      s.actions.push({ action: body.action, service: body.service, status: "CONFIRMED" });
      return send(200, { ok: true });
    }
    if (url.pathname === "/api/mavis/studioCapture") {
      const s = sessions.get(body.sessionId);
      assert.equal(body.imageDataUrl, undefined);
      s.snapshots++;
      return send(200, { snapshotId: "snap-1" });
    }
    if (url.pathname === "/api/mavis/studioFinish") {
      const s = sessions.get(body.sessionId);
      s.status = "COMPLETED";
      return send(200, { ok: true });
    }

    // Bearer mode (/api/v1/analyzer/runtime/sessions/:id/studio*)
    const match = url.pathname.match(/^\/api\/v1\/analyzer\/runtime\/sessions\/([^/]+)\/studio(\/.*)?$/);
    if (match) {
      const [, sessionId, tail = ""] = match;
      const s = sessions.get(sessionId);
      if (!s) return send(404, { message: "Not found" });
      if (tail === "" && req.method === "GET") {
        s.polls++;
        if (s.status === "QUEUED" && s.polls >= 2) s.status = "RUNNING";
        return send(200, {
          status: 200,
          data: {
            executionStatus: s.status,
            telemetry: { services: [{ service: "payment-api", runningReplicas: 1 }] },
            actions: s.actions,
          },
        });
      }
      if (tail === "/actions") {
        s.actions.push({ action: body.action, service: body.service, status: "CONFIRMED" });
        return send(200, { status: 200, data: { ok: true } });
      }
      if (tail === "/snapshots") {
        s.snapshots++;
        return send(200, { status: 200, data: { snapshotId: "snap-1" } });
      }
      if (tail === "/finish") {
        s.status = "COMPLETED";
        return send(200, { status: 200, data: { ok: true } });
      }
    }

    return send(404, { message: `Unhandled ${req.method} ${url.pathname}` });
  });

  return new Promise((resolveReady) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveReady({ server, baseUrl: `http://127.0.0.1:${port}`, sessions });
    });
  });
}

const { server, baseUrl, sessions } = await startStubServer();
try {
  for (const [label, auth] of [
    ["cookie", "Cookie: mavis_session=s1; mavis_refresh=r1\nmavis_session=s2; mavis_refresh=r2"],
    ["bearer", "Bearer jwt-1\nAuthorization: Bearer jwt-2"],
  ]) {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        MAVIS_BASE_URL: baseUrl,
        MAVIS_LOADTEST_AUTH: auth,
        WORKSPACE_ID: "11111111-1111-1111-1111-111111111111",
        ASSIGNMENT_ID: "22222222-2222-2222-2222-222222222222",
        CONCURRENCY: "2",
        ROUNDS: "1",
        POLL_INTERVAL_MS: "50",
      },
    });
    const report = JSON.parse(stdout);
    assert.equal(report.totalSessions, 2, `${label}: expected 2 sessions`);
    assert.equal(report.failedSessions, 0, `${label}: expected 0 failures`);
    assert.equal(report.goNoGo.passed, true, `${label}: expected Go/No-Go pass`);
  }
  assert.equal(sessions.size, 4);
  let cookieRotatedCount = 0;
  for (const s of sessions.values()) {
    assert.equal(s.status, "COMPLETED");
    assert.equal(s.snapshots, 1);
    if (s.rotatedSeen) cookieRotatedCount++;
    assert.deepEqual(
      s.actions.map((a) => `${a.action}:${a.service}`),
      ["STOP:payment-api", "START:payment-api"],
    );
  }
  assert.equal(cookieRotatedCount, 2, "Expected both Cookie virtual students to pick up rotated Set-Cookie values");

  // Fewer auth accounts than CONCURRENCY must exit 2
  let insufficientExit = 0;
  try {
    await execFileAsync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        MAVIS_BASE_URL: baseUrl,
        MAVIS_LOADTEST_AUTH: "mavis_session=s1; mavis_refresh=r1\nmavis_session=s2; mavis_refresh=r2",
        WORKSPACE_ID: "11111111-1111-1111-1111-111111111111",
        ASSIGNMENT_ID: "22222222-2222-2222-2222-222222222222",
        CONCURRENCY: "3",
        ROUNDS: "1",
      },
    });
  } catch (err) {
    insufficientExit = err.code;
  }
  assert.equal(insufficientExit, 2, "Expected exit code 2 when auth entries < CONCURRENCY");

  console.log("PASS: studio-concurrency.mjs verified for Cookie refresh, Bearer flow, and account-count guard.");
} finally {
  server.close();
}
