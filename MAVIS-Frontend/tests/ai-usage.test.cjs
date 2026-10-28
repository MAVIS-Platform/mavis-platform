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
  call=undefined; await reportAiUsage("gemini","test-model",undefined,4); assert.equal(call,undefined);
  global.fetch=async ()=>{throw new Error("offline");};
  await assert.doesNotReject(reportAiUsage("gemini","test-model",3,4));
 } finally {
  global.fetch=oldFetch;
  if(oldKey===undefined) delete process.env.MAVIS_AI_USAGE_INGEST_KEY; else process.env.MAVIS_AI_USAGE_INGEST_KEY=oldKey;
  if(oldUrl===undefined) delete process.env.MAVIS_JAVA_URL; else process.env.MAVIS_JAVA_URL=oldUrl;
 }
});
