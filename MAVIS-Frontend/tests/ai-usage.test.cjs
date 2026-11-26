const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");
const source = path.resolve(__dirname, "../src/lib/ai/usage-report.ts");
const mod = new Module(source, module);
mod.filename = source;
mod._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, source);
const {reportAiUsage} = mod.exports;
test("reports real tokens safely, and handles missing data and outages", async () => {
 const oldFetch=global.fetch, oldKey=process.env.MAVIS_AI_USAGE_INGEST_KEY, oldUrl=process.env.MAVIS_JAVA_URL;
 let call;
 try {
  process.env.MAVIS_AI_USAGE_INGEST_KEY="x".repeat(32);
  process.env.MAVIS_JAVA_URL="http://backend:8080";
  global.fetch=async (...args)=>{call=args; return {ok:true};};
  await reportAiUsage("openai","test-model",12,5);
  assert.equal(call[0],"http://backend:8080/api/v1/internal/ai-usage");
  assert.equal(call[1].headers["X-MAVIS-AI-USAGE-KEY"],"x".repeat(32));
  const body=JSON.parse(call[1].body);
  assert.equal(body.inputTokens,12); assert.equal(body.outputTokens,5); assert.equal(body.provider,"openai");
  assert.deepEqual(Object.keys(body).sort(),["inputTokens","model","outputTokens","provider","requestId"].sort());
  await reportAiUsage("openai","test-model",12,5,"a9a756a7-2175-4ded-99e7-053f986bc786");
  assert.equal(JSON.parse(call[1].body).userId,"a9a756a7-2175-4ded-99e7-053f986bc786");
  call=undefined; await reportAiUsage("gemini","test-model",undefined,4); assert.equal(call,undefined);
  global.fetch=async ()=>{throw new Error("offline");};
  await assert.doesNotReject(reportAiUsage("gemini","test-model",3,4));
 } finally {
  global.fetch=oldFetch;
  if(oldKey===undefined) delete process.env.MAVIS_AI_USAGE_INGEST_KEY; else process.env.MAVIS_AI_USAGE_INGEST_KEY=oldKey;
  if(oldUrl===undefined) delete process.env.MAVIS_JAVA_URL; else process.env.MAVIS_JAVA_URL=oldUrl;
 }
});

test("AI diagram rate limiter enforces per-minute and per-day sliding windows with Retry-After", () => {
 const rlSource = path.resolve(__dirname, "../src/lib/ai/rate-limit.ts");
 const rlMod = new Module(rlSource, module);
 rlMod.filename = rlSource;
 rlMod._compile(
  ts.transpileModule(fs.readFileSync(rlSource, "utf8"), {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  rlSource,
 );
 const { createAiRateLimiter, AiRateLimitError } = rlMod.exports;
 const limiter = createAiRateLimiter({ perMinute: 2, perDay: 3 });
 const t0 = 1_700_000_000_000;

 assert.deepEqual(limiter.checkAndConsume("user-a", t0), { allowed: true });
 assert.deepEqual(limiter.checkAndConsume("user-a", t0 + 10_000), { allowed: true });
 const blocked = limiter.checkAndConsume("user-a", t0 + 15_000);
 assert.equal(blocked.allowed, false);
 assert.equal(blocked.retryAfterSeconds, 45);
 assert.throws(() => limiter.assertAllowed("user-a", t0 + 15_000), AiRateLimitError);

 // Independent user still allowed
 assert.deepEqual(limiter.checkAndConsume("user-b", t0 + 15_000), { allowed: true });

 // After minute window slides, 3rd daily call succeeds, 4th hits daily ceiling
 assert.deepEqual(limiter.checkAndConsume("user-a", t0 + 61_000), { allowed: true });
 const dayBlocked = limiter.checkAndConsume("user-a", t0 + 122_000);
 assert.equal(dayBlocked.allowed, false);
 assert.ok(dayBlocked.retryAfterSeconds > 3600);

 // Route wires rate limiter + 429 + 413 payload limit
 const routeText = fs.readFileSync(path.resolve(__dirname, "../app/api/ai-diagram-semantics/route.ts"), "utf8");
 assert.match(routeText, /aiDiagramRateLimiter\.assertAllowed\(userId\)/);
 assert.match(routeText, /status:\s*429/);
 assert.match(routeText, /Retry-After/);
 assert.match(routeText, /status:\s*413/);
});
