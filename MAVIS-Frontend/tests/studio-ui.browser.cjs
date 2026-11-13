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
const state={sessionId:'fixture',interactive:true,services:['orders','payment'],executionStatus:'RUNNING',cleanupStatus:'NOT_APPLICABLE',finishRequested:false,actions:[]};
window.studioCalls=[];
const api={mode:'backend',async execute(op,input){
 if(op==='studioAction'){
  window.studioCalls.push(input);
  state.actions.push({...input,status:'PENDING',requestedAt:new Date().toISOString()});
  setTimeout(()=>{const a=state.actions.at(-1);a.status='CONFIRMED';a.result={action:a.action,service:a.service,confirmed:true,replicasBefore:1,replicasAfter:a.replicas??0,metricsBefore:{requestCount:1,p95LatencyMs:20},metricsAfter:{requestCount:1,p95LatencyMs:30}}},1800);
 }
 if(op==='studioFinish'){state.finishRequested=true;state.executionStatus='COMPLETED';state.cleanupStatus='CONFIRMED'}
 if(op==='stopRuntime'){state.executionStatus='CANCELLED';state.cleanupStatus='CONFIRMED'}
 return structuredClone(state);
}};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')).render(<LocaleProvider><ApiContext.Provider value={api}><QueryClientProvider client={client}><div style={{padding:16}}><StudioControls sessionId="fixture"/></div></QueryClientProvider></ApiContext.Provider></LocaleProvider>);
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
    await page.screenshot({ path: path.join(output, "studio-initial.png"), fullPage: true });
    const finish = page.getByRole("button", {
      name: "Finish Studio and save evidence",
      exact: true,
    });
    assert.equal(await finish.isDisabled(), true);
    await page.getByLabel("Replicas (1–8)").fill("4");
    await page.getByRole("button", { name: "Scale replicas", exact: true }).click();
    await page.getByText("PENDING", { exact: false }).waitFor();
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
    await page.screenshot({ path: path.join(output, "studio-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: path.join(output, "studio-mobile.png"), fullPage: true });
    await finish.click();
    await page.getByText("COMPLETED", { exact: false }).waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS Studio UI actions, pending lock, measured results, finish and mobile layout");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
