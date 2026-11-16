import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";

const base = new URL(process.env.MAVIS_WF01_TEST_API ?? "");
const token = process.env.MAVIS_WF01_TEST_TOKEN;
const workspaceId = process.env.MAVIS_WF01_TEST_WORKSPACE;
const duration = Number(process.env.MAVIS_WF01_PILOT_SECONDS ?? 300);
const concurrency = Number(process.env.MAVIS_WF01_PILOT_WORKERS ?? 4);

if (
  !["https:", "http:"].includes(base.protocol) ||
  base.username || base.password ||
  base.hostname === "maviss.site" || base.hostname.endsWith(".maviss.site") ||
  !token || !/^[a-f0-9-]{36}$/i.test(workspaceId ?? "") ||
  !Number.isInteger(duration) || duration < 1 || duration > 900 ||
  !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20
) {
  throw new Error("Use a non-production API, a test session and workspace, and bounded pilot settings.");
}

const url = new URL("workspaces/" + workspaceId + "/course-roadmap", base.href.replace(/\/?$/, "/"));
const latency = [];
let errors = 0;
const deadline = performance.now() + duration * 1000;

async function sample() {
  while (performance.now() < deadline) {
    const start = performance.now();
    try {
      const response = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json();
      if (!response.ok || payload?.data?.guided !== true || !Array.isArray(payload?.data?.labs)) {
        errors++;
      } else {
        latency.push(performance.now() - start);
      }
    } catch {
      errors++;
    }
    const delay = Math.min(deadline - performance.now(), 1000 - (performance.now() - start));
    if (delay > 0) await setTimeout(delay);
  }
}

await Promise.all(Array.from({ length: concurrency }, sample));
latency.sort((a, b) => a - b);
const p95 = latency.length ? Math.round(latency[Math.ceil(latency.length * 0.95) - 1]) : null;
console.log(JSON.stringify({ durationSeconds: duration, workers: concurrency, successes: latency.length, errors, p95Ms: p95 }));
if (errors || p95 === null || p95 > 3000) process.exitCode = 1;
