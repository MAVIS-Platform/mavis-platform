const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.env.MAVIS_UI_EVIDENCE_DIR || path.join(root, ".artifacts/three-e-ui-browser"),
);
fs.mkdirSync(output, { recursive: true });
const webpackPackage = require("next/dist/compiled/webpack/webpack");
webpackPackage.init();
const entry = path.join(output, "fixture.tsx");
const loader = path.join(output, "typescript-loader.cjs");
fs.writeFileSync(
  loader,
  `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`,
);
fs.writeFileSync(
  entry,
  `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ApiContext} from '@/providers/app-context';
import {SelectionThreeE} from '@/features/architecture/selection-three-e';
const scenario=new URLSearchParams(location.search).get('scenario');
const source=(id,role,location,snippet)=>({id,origin:'persisted',kind:'source',sourceType:'STATIC_CODE',communicationRole:role,location,snippet,complete:true});
const proofs=[source('contract','CLIENT_CONTRACT','order-service/src/main/java/shop/order/CatalogFeignClient.java:14','@PostMapping("/api/catalog/inventory/deduct")\\nDeductResult deductInventory(DeductRequest request);'),source('call','CALL_SITE','order-service/src/main/java/shop/order/OrderService.java:42','catalog.deductInventory(request);'),source('server','SERVER_ENDPOINT','catalog-service/src/main/java/shop/catalog/InventoryController.java:23','@PostMapping("/api/catalog/inventory/deduct")\\npublic DeductResult deductInventory(DeductRequest request) { return inventory.deduct(request); }')];
const missing=scenario==='missing';
const relationship={id:'http',from:'order',to:'catalog',protocol:'SERVICE_HTTP_CALL',originLayer:'STATIC',resolutionStatus:'RESOLVED',evidenceCount:missing?0:3,uncertain:false,evidence:missing?[]:proofs,properties:missing?{}:{clientFramework:'OPENFEIGN',sourceService:'order-service',targetService:'catalog-service',clientInterface:'shop.order.CatalogFeignClient',clientMethod:'deductInventory',httpMethod:'POST',httpPath:'/api/catalog/inventory/deduct',callSiteCount:1,serverMatch:'MATCHED_METHOD_PATH',targetSelector:'SERVICE_NAME',invocationResolution:'TYPED_SOURCE_CALL'}};
const model={id:'fixture-model',projectId:'fixture-project',snapshotId:'fixture-source',revision:3,label:'Local UI fixture',elements:[{id:'order',name:'order-service',elementType:'SERVICE_CONTAINER',evidence:[]},{id:'catalog',name:'catalog-service',elementType:'SERVICE_CONTAINER',evidence:[]}],edges:[relationship,{...relationship,id:'http2'}]};
const aggregate={...relationship,id:'aggregate',underlyingEdgeIds:['http','http2'],evidenceCount:3};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
const adapter={mode:scenario==='error'?'backend':'mock',async execute(operation){if(operation==='relationshipEvidence'){window.evidenceAttempts=(window.evidenceAttempts||0)+1;throw Error('Synthetic evidence failure');}return [];}};
window.fetch=async()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
function Fixture(){const[selected,setSelected]=useState(scenario==='group'?'aggregate':'http');const[drilled,setDrilled]=useState(null);return <QueryClientProvider client={client}><ApiContext.Provider value={adapter}><main className="p-5"><div className="mb-5 border-b pb-4 text-sm font-semibold text-primary">MAVIS <span className="ml-3 font-normal text-muted-foreground">Architecture workspace · Local synthetic fixture</span></div><div className="fixture-workspace"><section className="rounded-2xl border bg-card p-8"><h1 className="text-xl font-semibold">Architecture Graph Explorer</h1><p className="mt-2 text-sm text-muted-foreground">Select a relationship to trace its source evidence.</p><div className="mt-20 flex items-center justify-center gap-6 text-sm"><span className="rounded-xl border bg-primary/5 p-4">order-service</span><span className="text-primary">HTTP POST →</span><span className="rounded-xl border bg-primary/5 p-4">catalog-service</span></div></section>{selected?<SelectionThreeE key={selected+drilled} model={model} selectedId={selected} projectedEdge={scenario==='group'?aggregate:undefined} drilledSourceEdgeId={drilled} onDrilldown={setDrilled} onSelect={setSelected} onClose={()=>setSelected(null)}/>:<p role="status">Inspector closed</p>}</div></main></ApiContext.Provider></QueryClientProvider>};
createRoot(document.getElementById('root')).render(<Fixture/>);
`,
);
async function build() {
  await new Promise((resolve, reject) =>
    webpackPackage.webpack(
      {
        mode: "development",
        context: root,
        entry,
        output: { path: output, filename: "fixture.js" },
        devtool: false,
        resolve: {
          extensions: [".tsx", ".ts", ".jsx", ".js"],
          modules: [path.join(root, "node_modules"), "node_modules"],
          alias: { "@": path.join(root, "src") },
        },
        resolveLoader: { modules: [path.join(root, "node_modules")] },
        module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
        optimization: { minimize: false },
        plugins: [
          new webpackPackage.webpack.DefinePlugin({
            "process.env.NODE_ENV": JSON.stringify("development"),
          }),
        ],
      },
      (err, stats) =>
        err
          ? reject(err)
          : stats.hasErrors()
            ? reject(Error(stats.toString({ all: false, errors: true })))
            : resolve(),
    ),
  );
  const css = await require("postcss")([require("@tailwindcss/postcss")()]).process(
    fs.readFileSync(path.join(root, "src/styles.css"), "utf8"),
    { from: path.join(root, "src/styles.css"), to: path.join(output, "fixture.css") },
  );
  fs.writeFileSync(
    path.join(output, "fixture.css"),
    css.css +
      "\n.fixture-workspace{display:grid;gap:20px;align-items:start;min-width:0}.fixture-workspace>section{min-width:0}.fixture-workspace>section>div{flex-wrap:wrap}@media(min-width:1280px){.fixture-workspace{grid-template-columns:minmax(0,1fr) 440px;}}",
  );
}
async function main() {
  await build();
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const assets = {
      "/fixture.js": ["fixture.js", "text/javascript; charset=utf-8"],
      "/fixture.css": ["fixture.css", "text/css"],
    };
    if (assets[pathname]) {
      res.setHeader("Content-Type", assets[pathname][1]);
      res.end(fs.readFileSync(path.join(output, assets[pathname][0])));
    } else if (pathname === "/fonts/inter/InterVariable.woff2") {
      res.end(fs.readFileSync(path.join(root, "public", pathname)));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.launch({
      headless: true,
      channel: process.env.MAVIS_TEST_BROWSER_CHANNEL || undefined,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("heading", { name: "Understand this selection" }).waitFor();
    assert.equal(
      await page.getByRole("tab", { name: "Explain", exact: true }).getAttribute("aria-selected"),
      "true",
    );
    await page.screenshot({ animations: "disabled", path: path.join(output, "desktop-explain.png"), fullPage: true });
    await page.getByRole("button", { name: "Inspect source evidence", exact: true }).click();
    await page.getByRole("heading", { name: "Trace it to the source" }).waitFor();
    assert.equal(
      await page.getByText("Receiver · matching HTTP endpoint", { exact: false }).count(),
      1,
    );
    assert.equal(await page.locator("details[open] pre").count(), 0);
    await page.getByText("View source snippet", { exact: true }).first().click();
    await page.getByRole("button", { name: "Copy source snippet 1", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Copied" }).waitFor();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("@PostMapping"));
    await page.screenshot({ animations: "disabled", path: path.join(output, "desktop-evidence.png"), fullPage: true });
    await page.getByRole("tab", { name: /Evidence/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("heading", { name: "Assess what is supported" }).waitFor();
    assert.equal(
      await page.getByRole("tab", { name: "Evaluate", exact: true }).getAttribute("aria-selected"),
      "true",
    );
    await page.screenshot({ animations: "disabled", path: path.join(output, "desktop-evaluate.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ animations: "disabled", path: path.join(output, "desktop-dark.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("tab", { name: /Evidence/ }).click();
      await page.getByRole("heading", { name: "Trace it to the source" }).waitFor();
      await page.screenshot({ animations: "disabled",
        path: path.join(output, "viewport-" + width + ".png"),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "No viewport overflow at " + width,
      );
      const close = await page.getByRole("button", { name: "Close 3E" }).boundingBox();
      assert.ok(close && close.x >= 0 && close.x + close.width <= width);
      const tabs = await page.getByRole("tablist").boundingBox();
      assert.ok(tabs && tabs.x >= 0 && tabs.x + tabs.width <= width);
      if (width === 390)
        await page.screenshot({ animations: "disabled", path: path.join(output, "mobile-evidence.png"), fullPage: true });
    }
    await page.getByRole("button", { name: "Close 3E" }).click();
    await page.getByRole("status", { name: "" }).filter({ hasText: "Inspector closed" }).waitFor();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(base + "?scenario=missing");
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await page.getByText("Model context only", { exact: true }).waitFor();
    await page.getByText(/Metadata preview #1/).waitFor();
    assert.equal(await page.getByText(/Caller · HTTP method contract/).count(), 0);
    await page.screenshot({ animations: "disabled", path: path.join(output, "missing-evidence.png"), fullPage: true });
    await page.goto(base + "?scenario=error");
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await page.getByRole("alert").waitFor();
    const before = await page.evaluate(() => window.evidenceAttempts);
    await page.getByRole("button", { name: "Retry evidence" }).click();
    await page.waitForFunction((previous) => window.evidenceAttempts > previous, before);
    await page.screenshot({ animations: "disabled", path: path.join(output, "error-evidence.png"), fullPage: true });
    await page.goto(base + "?scenario=group");
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await page.getByText("Choose one member relationship", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Details", exact: true }).first().click();
    await page
      .getByText("Choose one member relationship", { exact: true })
      .waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual 3E component — tabs, keyboard, copy, collapsed code, group drilldown, missing/error/retry, close, desktop/390/320 layout; synthetic API only.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
