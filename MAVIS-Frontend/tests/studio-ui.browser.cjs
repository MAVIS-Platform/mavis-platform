const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".artifacts", "studio-browser");
fs.mkdirSync(output, { recursive: true });
const webpack = require("next/dist/compiled/webpack/webpack");
webpack.init();
const loader = path.join(output, "typescript-loader.cjs");
const entry = path.join(output, "fixture.tsx");
fs.writeFileSync(
  loader,
  `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`,
);
fs.writeFileSync(
  entry,
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ApiContext} from '@/providers/app-context';
import {LocaleProvider} from '@/lib/i18n/locale-context';
import {StudioControls} from '@/features/runtime/studio-controls';
import {StudioSubmissionEvidence} from '@/features/submissions/studio-evidence';
import {GradingPanel} from '@/features/submissions/grading';
const state={sessionId:'fixture',interactive:true,services:['orders','payment'],executionStatus:'RUNNING',cleanupStatus:'NOT_APPLICABLE',finishRequested:false,actions:[]};
const model={id:'model-1',projectId:'project-1',snapshotId:'source-1',revision:1,label:'Pinned model',elements:[
 {id:'orders-id',name:'orders',elementType:'SERVICE_CONTAINER',layer:'domain',description:'',evidence:[]},
 {id:'payment-id',name:'payment',elementType:'SERVICE_CONTAINER',layer:'domain',description:'',evidence:[]}],
 edges:[{id:'orders-payment',from:'orders-id',to:'payment-id',protocol:'SERVICE_HTTP_CALL',originLayer:'STATIC',uncertain:false,evidence:[]}]};
state.modelVersionId=model.id;state.projectId=model.projectId;state.serviceMappings={'orders':'orders-id','payment':'payment-id'};
state.telemetry={observedAt:new Date().toISOString(),services:[
 {service:'orders',replicas:1,runningReplicas:1,stats:[{containerId:'orders-1',cpu:'1%',memory:'30MiB / 512MiB',network:'2kB / 1kB'}],logs:'CircuitBreaker fallback observed'},
 {service:'payment',replicas:1,runningReplicas:1,stats:[],logs:'ready'}],
 spans:[{traceId:'trace-observed',spanId:'span-orders',runtimeService:'orders',httpStatusCode:200,spanStatus:'OK'}],
 interactions:[{traceId:'trace-observed',fromService:'orders',toService:'payment',parentSpanId:'span-orders',childSpanId:'span-payment'}]};
state.snapshots=[];
window.studioCalls=[];
let review={submissionId:'submitted-fixture',revision:0,status:'PENDING',score:null,summary:'',snapshotGrades:[],labOutcome:'PENDING'};
const api={mode:'backend',async execute(op,input){
 if(op==='session')return {user:{id:'lecturer',role:'lecturer'}};
 if(op==='submissionReview')return structuredClone(review);
 if(op==='gradeSubmission'){
  review={...review,...input,revision:review.revision+1,snapshotGrades:input.snapshotGrades??[]};
  return structuredClone(review);
 }
 if(op==='model')return model;
 if(op==='impact')return {modelId:model.id,targetId:input.targetId,paths:input.targetId==='payment-id'?[['orders-id','payment-id']]:[],limitations:'Fixture confirmed HTTP path'};
 if(op==='studioAction'){
  window.studioCalls.push(input);
  state.actions.push({...input,status:'PENDING',requestedAt:new Date().toISOString()});
  setTimeout(()=>{const a=state.actions.at(-1);a.status='CONFIRMED';a.result={action:a.action,service:a.service,confirmed:true,replicasBefore:1,replicasAfter:a.replicas??0,metricsBefore:{requestCount:1,p95LatencyMs:20},metricsAfter:{requestCount:1,p95LatencyMs:30}};
    const target=state.telemetry.services.find(service=>service.service===a.service);target.replicas=a.replicas??0;target.runningReplicas=a.replicas??0;state.telemetry.observedAt=new Date().toISOString();},1800);
 }
 if(op==='studioFinish'){state.finishRequested=true;state.executionStatus='COMPLETED';state.cleanupStatus='CONFIRMED'}
 if(op==='studioCapture'){state.snapshots.push({id:'snapshot-'+(state.snapshots.length+1),sessionId:'fixture',sourceSnapshotId:'source-1',modelVersionId:'model-1',
  capturedAt:new Date().toISOString(),explanation:input.explanation,imageData:input.imageData,digest:'sha256:fixture',telemetry:structuredClone(state.telemetry),actions:structuredClone(state.actions)})}
 if(op==='studioSnapshot')return structuredClone(state.snapshots.find(item=>item.id===input.snapshotId));
 if(op==='submissionExport')return {studioEvidence:{receiptDigest:'sha256:receipt-fixture',snapshots:structuredClone(state.snapshots)}};
 if(op==='stopRuntime'){state.executionStatus='CANCELLED';state.cleanupStatus='CONFIRMED'}
 return structuredClone(state);
}};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')).render(<LocaleProvider><ApiContext.Provider value={api}><QueryClientProvider client={client}><div style={{padding:16}}><StudioControls sessionId="fixture"/><StudioSubmissionEvidence submissionId="submitted-fixture" available={true}/><GradingPanel submissionId="submitted-fixture" guidedLab studentSnapshots={[{snapshotId:'static',title:'Static C1–C3'},{snapshotId:'runtime',title:'Studio capture'}]}/></div></QueryClientProvider></ApiContext.Provider></LocaleProvider>);
`,
);

async function main() {
  await new Promise((resolve, reject) =>
    webpack.webpack(
      {
        mode: "development",
        entry,
        output: { path: output, filename: "fixture.js" },
        resolve: {
          extensions: [".tsx", ".ts", ".js"],
          alias: { "@": path.join(root, "src") },
          modules: [path.join(root, "node_modules")],
        },
        resolveLoader: { modules: [path.join(root, "node_modules")] },
        module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
        plugins: [
          new webpack.webpack.DefinePlugin({
            "process.env.NODE_ENV": JSON.stringify("development"),
          }),
        ],
      },
      (error, stats) =>
        error
          ? reject(error)
          : stats.hasErrors()
            ? reject(Error(stats.toString({ all: false, errors: true })))
            : resolve(),
    ),
  );
  const css = await require("postcss")([require("@tailwindcss/postcss")()]).process(
    fs.readFileSync(path.join(root, "src/styles.css"), "utf8"),
    { from: path.join(root, "src/styles.css") },
  );
  fs.writeFileSync(path.join(output, "fixture.css"), css.css);
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.js" || req.url === "/fixture.css") {
      res.setHeader("Content-Type", req.url.endsWith(".js") ? "text/javascript" : "text/css");
      res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await require("playwright").chromium.launch({
      headless: true,
      channel: process.env.MAVIS_TEST_BROWSER_CHANNEL || "chrome",
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("Browser error", error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") console.error(message.text());
    });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.getByRole("button", { name: "payment", exact: true }).click();
    await page
      .getByRole("heading", { name: "Worker verified impact paths", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Circular", exact: true }).click();
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await page.getByRole("button", { name: "Layered", exact: true }).click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.getByRole("button", { name: "Rotate right", exact: true }).click();
    await page.getByRole("button", { name: "Tilt up", exact: true }).click();
    await page.getByRole("button", { name: "Isometric", exact: true }).click();
    await page.screenshot({ path: path.join(output, "studio-3d-isometric.png"), fullPage: false });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByRole("button", { name: "Reset layout", exact: true }).click();
    await page
      .getByRole("heading", { name: "Project Deployment & Scaling Impact Matrix", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "payment", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "orders", exact: true }).click();
    await page.screenshot({ path: path.join(output, "studio-initial.png"), fullPage: true });
    const finish = page.getByRole("button", {
      name: "Finish Studio and save evidence",
      exact: true,
    });
    assert.equal(await finish.isDisabled(), true);
    await page.getByLabel("Explain the observed behavior").fill("Baseline before scaling");
    await page.getByRole("button", { name: "Capture evidence snapshot", exact: true }).click();
    await page.getByRole("button", { name: "Download evidence", exact: true }).waitFor();
    await page.getByLabel("Replicas (1–8)").fill("4");
    await page.getByRole("button", { name: "Scale replicas", exact: true }).click();
    await page.getByText("SCALE orders → 4 · PENDING", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Stop service", exact: true }).isDisabled(),
      true,
    );
    await page.getByText("CONFIRMED", { exact: false }).waitFor();
    await finish.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Finish Studio"),
        ).disabled,
    );
    assert.equal(await page.evaluate(() => window.studioCalls.length), 1);
    assert.equal(await page.evaluate(() => window.studioCalls[0].replicas), 4);
    await page.getByLabel("Explain the observed behavior").fill("Observed scaling and fallback");
    await page.getByRole("button", { name: "Capture evidence snapshot", exact: true }).click();
    await page.getByRole("button", { name: "Download evidence", exact: true }).last().waitFor();
    await page.getByRole("heading", { name: "Compare captured snapshots", exact: true }).waitFor();
    const evidenceDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download evidence", exact: true }).last().click();
    const evidencePath = path.join(output, "studio-evidence.json");
    await (await evidenceDownload).saveAs(evidencePath);
    await page.getByText("Frozen Studio evidence", { exact: true }).click();
    await page.getByRole("img", { name: "Studio snapshot 1", exact: true }).waitFor();
    assert.ok(
      JSON.parse(fs.readFileSync(evidencePath, "utf8")).imageData.startsWith(
        "data:image/png;base64,",
      ),
    );
    const imageDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export snapshot image", exact: true }).click();
    await (await imageDownload).saveAs(path.join(output, "studio-graph.png"));
    await page.screenshot({ path: path.join(output, "studio-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: path.join(output, "studio-mobile.png"), fullPage: true });
    await finish.click();
    await page.getByText("COMPLETED", { exact: false }).waitFor();
    const staticScore = page.getByRole("spinbutton", { name: "Score — Static C1–C3", exact: true });
    const studioScore = page.getByRole("spinbutton", { name: "Score — Studio capture", exact: true });
    await staticScore.fill("5.01");
    await page.getByRole("button", { name: "Save grading draft", exact: true }).click();
    await page.getByText("Draft", { exact: true }).waitFor();
    assert.equal(await staticScore.inputValue(), "5.01");
    assert.equal(await studioScore.inputValue(), "");
    assert.equal(await page.getByRole("button", { name: "Publish grade", exact: true }).isDisabled(), true);
    await page.evaluate(()=>localStorage.setItem("mavis.locale","vi"));
    await page.reload();
    await page.getByRole("button",{name:"Dừng dịch vụ",exact:true}).waitFor();
    await page.getByRole("button",{name:"3D",exact:true}).click();
    await page.screenshot({path:path.join(output,"studio-vi.png"),fullPage:true,animations:"disabled"});
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS Studio UI and partial grading draft on mobile");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
