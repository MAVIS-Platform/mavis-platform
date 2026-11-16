const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".artifacts", "course-setup-browser");
fs.mkdirSync(output, { recursive: true });
const webpack = require("next/dist/compiled/webpack/webpack");
webpack.init();
const loader = path.join(output, "typescript-loader.cjs");
const navigation = path.join(output, "navigation.ts");
const entry = path.join(output, "fixture.tsx");
fs.writeFileSync(
  loader,
  `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`,
);
fs.writeFileSync(
  navigation,
  'import React from "react";export const useSearchParams=()=>new URLSearchParams("");export const usePathname=()=>"/roadmap";export const useRouter=()=>({push(){},replace(){},prefetch(){}});export default function Link({href,children,...props}){return React.createElement("a",{href:typeof href==="string"?href:"#",...props},children)}',
);
const setup = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  workspaceName: "Course 101",
  status: "ACTIVE",
  courseMode: true,
  reference: {
    projectId: "22222222-2222-2222-2222-222222222222",
    projectName: "Seed reference",
    modelId: "33333333-3333-3333-3333-333333333333",
    snapshotId: "44444444-4444-4444-4444-444444444444",
    modelRevision: 3,
    referenceReady: true,
    runtimeConfigured: true,
    runtimeMatchesSource: true,
    runtimeRevision: 2,
    applications: ["orders", "payment"],
    blockCount: 2,
    connectionCount: 1,
    topologyConfigured: true,
  },
  labs: [
    {
      assignmentId: "55555555-5555-5555-5555-555555555555",
      position: 1,
      title: "Lab 1: Service Resilience",
      published: true,
      referenceReady: true,
      requiresRuntime: true,
      studioReady: true,
      topologyFrozen: true,
      quizPublished: true,
      quizVersion: 1,
      state: "READY",
    },
  ],
  passkey: {
    active: true,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    maxStudents: 30,
    enrolledStudents: 2,
  },
  steps: [
    { id: "workspace", state: "DONE", detail: "Workspace is active." },
    { id: "reference", state: "DONE", detail: "Reference model revision 3 is pinned." },
    { id: "runtime", state: "DONE", detail: "2 runtime applications are configured." },
    { id: "studio", state: "ACTION", detail: "Add the prepared Studio Live topology." },
    { id: "labs", state: "DONE", detail: "1/1 Labs are published." },
    { id: "quiz", state: "DONE", detail: "1/1 published Labs have a quiz." },
    { id: "passkey", state: "DONE", detail: "Passkey is active." },
    { id: "preview", state: "ACTION", detail: "Finish the previous steps to preview." },
  ],
  nextAction: "configure-studio",
  previewAssignmentId: "55555555-5555-5555-5555-555555555555",
};
const readiness = {
  configured: true,
  preflightCompatible: true,
  runnerReady: true,
  revision: 2,
  prerequisites: [],
  warnings: [],
  applications: ["orders", "payment"],
  mappings: ["orders", "payment"],
  detectedServices: ["orders", "payment"],
  runnerIssues: [],
  topology: { version: 1, blocks: [{}, {}], connections: [{}] },
};
fs.writeFileSync(
  entry,
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ApiContext} from '@/providers/app-context';
import {LocaleProvider} from '@/lib/i18n/locale-context';
import {CourseSetupPanel} from '@/features/courses/course-setup';
const readiness=${JSON.stringify(readiness)};
globalThis.fetch=async(url)=>{const payload=String(url).includes("runtime-setup-readiness")?readiness:${JSON.stringify(setup)};return new Response(JSON.stringify({data:payload}),{status:200,headers:{'content-type':'application/json'}});};
const api={mode:'backend',async execute(){return ${JSON.stringify(setup)}}};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')).render(<LocaleProvider><ApiContext.Provider value={api}><QueryClientProvider client={client}><div style={{padding:24,maxWidth:1200}}><CourseSetupPanel workspaceId="${setup.workspaceId}"/></div></QueryClientProvider></ApiContext.Provider></LocaleProvider>);
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
          alias: {
            "@": path.join(root, "src"),
            "next/navigation$": navigation,
            "next/link$": navigation,
          },
          modules: [path.join(root, "node_modules")],
        },
        resolveLoader: { modules: [path.join(root, "node_modules")] },
        module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
        plugins: [
          new webpack.webpack.DefinePlugin({
            "process.env": JSON.stringify({ NODE_ENV: "development" }),
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
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js" || request.url === "/fixture.css") {
      response.setHeader(
        "Content-Type",
        request.url.endsWith(".js") ? "text/javascript" : "text/css",
      );
      response.end(fs.readFileSync(path.join(output, request.url.slice(1))));
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.getByRole("heading", { name: "Course setup", exact: true }).waitFor();
    await page.getByText("Studio Live topology", { exact: true }).waitFor();
    const studioLink = page
      .getByRole("link", { name: "Configure Studio Live", exact: true })
      .first();
    assert.match(await studioLink.getAttribute("href"), /runtime-config\?project=22222222/);
    await page.getByText("Seed reference", { exact: true }).waitFor();
    await page.getByText("2 apps", { exact: true }).waitFor();
    await page.getByText("Runner / images:", { exact: false }).waitFor();
    await page.getByText("Lab 1: Service Resilience", { exact: false }).waitFor();
    await page.getByText("READY", { exact: true }).waitFor();
    await page.getByText("Next:", { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, "course-setup.png"),
      fullPage: true,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    console.log("PASS Course setup checklist renders steps, reference summary and Studio Live link");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
