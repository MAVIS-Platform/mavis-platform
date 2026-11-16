const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".artifacts", "lecturer-lms");
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
  'import React from "react";export const useSearchParams=()=>new URLSearchParams(globalThis.location.search);export const usePathname=()=>globalThis.location.pathname;export const useRouter=()=>({push(){},replace(){},prefetch(){}});export default function Link({href,children,...props}){return React.createElement("a",{href:typeof href==="string"?href:"#",...props},children)}',
);

const workspace = {
  id: "ws-lms",
  code: "SWD392",
  name: "Software Architecture",
  description: "Microservices architecture",
  status: "ACTIVE",
  myRole: "LECTURER",
  createdById: "u1",
  members: [
    { id: "u1", name: "Lecturer", role: "LECTURER" },
    { id: "u2", name: "Student A", role: "STUDENT" },
  ],
};
const lab = {
  id: "a1",
  workspaceId: "ws-lms",
  title: "Lab 1 Service resilience",
  instructions: "Analyze the reference architecture and run a resilience experiment.",
  dueAt: "2026-12-01T10:00:00Z",
  requireRuntimeTrace: true,
  requiredDiagramTypes: [],
  referenceSource: {
    projectId: "ref-project",
    projectName: "Seed reference",
    modelId: "ref-model",
    snapshotId: "ref-snapshot",
    revision: 3,
    commitSha: "a".repeat(40),
  },
};
const modules = [
  {
    id: "m1",
    title: "Foundations",
    description: "Core service design",
    position: 1,
    prerequisiteModuleId: null,
    items: [
      {
        id: "i1",
        type: "THEORY",
        title: "Service boundaries",
        description: "Why boundaries matter",
        position: 1,
        assignmentId: null,
        content: { body: "A service owns one reason to change." },
        required: true,
      },
      {
        id: "i2",
        type: "QUIZ",
        title: "Boundary quiz",
        description: "",
        position: 2,
        assignmentId: "a1",
        content: {},
        required: true,
      },
      {
        id: "i3",
        type: "RUNTIME_LAB",
        title: "Lab 1 Service resilience",
        description: "",
        position: 3,
        assignmentId: "a1",
        content: {},
        required: true,
      },
    ],
  },
];
const draft = {
  id: "course-1",
  workspaceId: "ws-lms",
  title: "Software Architecture",
  description: "",
  status: "DRAFT",
  draftRevision: 4,
  publishedVersion: 1,
  modules,
};
const published = {
  courseId: "course-1",
  version: 1,
  draftRevision: 3,
  snapshotDigest: "sha256:" + "a".repeat(64),
  publishedAt: "2026-11-16T00:00:00Z",
  snapshot: { title: "Software Architecture", description: "", modules },
};
const roadmap = {
  guided: true,
  enrollmentStatus: "IN_PROGRESS",
  labs: [
    { assignmentId: "a1", position: 1, title: lab.title, state: "UNLOCKED", reason: null },
  ],
};
const quiz = {
  version: 1,
  lesson: "Read the module theory before attempting the quiz.",
  passPercent: 80,
  passed: false,
  latestStatus: "NOT_ATTEMPTED",
  runtimeUnlocked: true,
  questions: [{ id: "q1", prompt: "Which service owns the order lifecycle?", type: "SINGLE_CHOICE", options: ["orders", "payment"] }],
};
const quizDraft = {
  lesson: "Read the module theory before attempting the quiz.",
  passPercent: 80,
  questions: [
    { id: "q1", prompt: "Which service owns the order lifecycle?", type: "SINGLE_CHOICE", options: ["orders", "payment"], correctOption: 0, explanation: "Orders owns the order lifecycle.", points: 1 },
    { id: "q2", prompt: "Select the resilience controls.", type: "MULTI_CHOICE", options: ["Stop", "Scale", "Delete database"], correctOptions: [0, 1], explanation: "Stop and Scale are supported.", points: 1 },
  ],
};

fs.writeFileSync(
  entry,
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ApiContext,SelectionContext} from '@/providers/app-context';
import {LocaleProvider} from '@/lib/i18n/locale-context';
import {LabWorkspace} from '@/features/courses/screens';
import {WorkspaceOverview} from '@/features/workspaces/screens';
import {Assignments} from '@/features/assignments/screens';
import {LabAuthoring} from '@/features/assignments/lab-authoring';
const workspace=${JSON.stringify(workspace)};
const lab=${JSON.stringify(lab)};
const draft=${JSON.stringify(draft)};
const published=${JSON.stringify(published)};
const roadmap=${JSON.stringify(roadmap)};
const quiz=${JSON.stringify(quiz)};
const quizDraft=${JSON.stringify(quizDraft)};
globalThis.fetch=async(url)=>{
  const path=String(url);
  let payload={};
  if(globalThis.__mavisEmptyCourse && path.includes('/course')) return new Response(JSON.stringify({message:'Course draft not found'}),{status:404,headers:{'content-type':'application/json'}});
  if(path.includes('course-curriculum')) payload=[];
  else if(path.includes('/quiz/draft')) payload=quizDraft;
  else if(path.includes('/quiz/versions')) payload=[];
  else if(path.includes('quiz-bank')) payload=[];
  else if(path.includes('course-roadmap')) payload=roadmap;
  else if(path.includes('/quiz')) payload=quiz;
  else if(path.includes('/course/published')) payload=published;
  else if(path.includes('/course/versions')) payload=[];
  else if(path.includes('/course')) payload=draft;
  return new Response(JSON.stringify({data:payload}),{status:200,headers:{'content-type':'application/json'}});
};
const api={mode:'backend',async execute(operation){
  if(operation==='workspaces') return [workspace];
  if(operation==='session') return {user:{id:'u1',name:'Lecturer',email:'lec@example.com',role:'lecturer'}};
  if(operation==='assignments') return [lab];
  if(operation==='projects') return [];
  if(operation==='model') return {id:'ref-model',projectId:'ref-project',snapshotId:'ref-snapshot',revision:3,label:'Reference model',elements:[{id:'orders',name:'orders',layer:'domain',elementType:'SERVICE_CONTAINER',description:'',evidence:[]},{id:'payment',name:'payment',layer:'domain',elementType:'SERVICE_CONTAINER',description:'',evidence:[]}],edges:[{id:'orders-payment',from:'orders',to:'payment',protocol:'HTTP',evidence:[],uncertain:false}]};
  return [];
}};
const params=new URLSearchParams(window.location.search);
globalThis.__mavisEmptyCourse=params.get('empty')==='1';
const selection={projectId:'',workspaceId:'ws-lms',setProjectId(){},setWorkspaceId(){}};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
const view=params.get('view');
const View=view==='lab'?LabWorkspace:view==='assignments'?Assignments:view==='authoring'?LabAuthoring:WorkspaceOverview;
class Boundary extends React.Component{
  constructor(props){super(props);this.state={error:null,stack:''};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){this.setState({stack:info.componentStack});console.error('BOUNDARY',error.message,info.componentStack);}
  render(){return this.state.error?React.createElement('pre',null,String(this.state.error),'\\n',this.state.stack):this.props.children;}
}
createRoot(document.getElementById('root')).render(<Boundary><LocaleProvider><ApiContext.Provider value={api}><QueryClientProvider client={client}><SelectionContext.Provider value={selection}><View/></SelectionContext.Provider></QueryClientProvider></ApiContext.Provider></LocaleProvider></Boundary>);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") console.error("browser console error:", message.text());
    });
    const base = "http://127.0.0.1:" + server.address().port;

    await page.goto(base + "?view=class", { waitUntil: "networkidle" });
    try {
      await page.getByRole("heading", { name: "Software Architecture", exact: true }).first().waitFor({ timeout: 8000 });
    } catch (error) {
      console.error("Class view errors:", errors);
      console.error("Class view body:", await page.locator("body").innerText());
      throw error;
    }
    await page.getByText("Class content", { exact: true }).waitFor();
    await page.getByText("Foundations", { exact: true }).waitFor();
    await page.getByText("Service boundaries", { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, "class-content.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=lab&workspace=ws-lms&assignment=a1&step=2&preview=1", {
      waitUntil: "networkidle",
    });
    await page.getByText("Lab contents", { exact: true }).waitFor();
    await page.getByText("A service owns one reason to change.", { exact: true }).waitFor();
    await page.getByText("Preview mode is read-only", { exact: false }).waitFor();
    await page.getByText("Foundations", { exact: false }).first().waitFor();
    await page.screenshot({
      path: path.join(output, "lab-coc.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=assignments&workspace=ws-lms", { waitUntil: "networkidle" });
    try {
      await page.getByText("Lab 1 Service resilience", { exact: false }).first().waitFor({ timeout: 8000 });
    } catch (error) {
      console.error("Assignments view errors:", errors);
      console.error("Assignments view body:", await page.locator("body").innerText());
      throw error;
    }
    await page.getByText("Create a Lab", { exact: true }).waitFor();
    await page.getByText("Author", { exact: true }).first().waitFor();
    assert.equal(
      await page.getByText("1-Click Seed Curated Labs", { exact: false }).count(),
      0,
      "Course seeding must stay in the separate Course tools panel",
    );
    await page.screenshot({
      path: path.join(output, "assignments.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=authoring&workspace=ws-lms&assignment=a1&tab=info", {
      waitUntil: "networkidle",
    });
    await page.getByText("Lab information", { exact: false }).first().waitFor();
    await page.getByText("Reference source", { exact: false }).first().waitFor();
    await page.getByText("Save Lab changes", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Required architecture views", { exact: true }).count(),
      0,
      "Lab v2 must not ask the lecturer to select diagrams",
    );
    await page.screenshot({
      path: path.join(output, "lab-authoring.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=authoring&workspace=ws-lms&assignment=a1&tab=theory", {
      waitUntil: "networkidle",
    });
    await page.getByText("How theory works", { exact: true }).waitFor();
    await page.getByText("Sample repository", { exact: true }).waitFor();
    await page.getByText("C1 System Context", { exact: true }).waitFor();
    await page.getByText("Lesson content (Markdown)", { exact: false }).first().waitFor();
    await page.getByText("A service owns one reason to change.", { exact: true }).first().waitFor();
    await page.screenshot({
      path: path.join(output, "lab-theory.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=authoring&workspace=ws-lms&assignment=a1&tab=quiz", {
      waitUntil: "networkidle",
    });
    await page.getByText("Quiz builder", { exact: true }).waitFor();
    await page.getByText("Import / Export", { exact: true }).waitFor();
    await page.getByText("Question bank", { exact: true }).first().waitFor();
    await page.getByText("Publish version", { exact: true }).waitFor();
    await page.getByText("Select the resilience controls.", { exact: false }).first().waitFor();
    await page.screenshot({
      path: path.join(output, "lab-quiz.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=authoring&workspace=ws-lms&assignment=a1&tab=studio", {
      waitUntil: "networkidle",
    });
    await page.getByText("MAVIS Studio Live", { exact: true }).waitFor();
    await page.getByText("Start Live session", { exact: true }).waitFor();
    await page.getByText("Open MAVIS Studio", { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, "lab-studio.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto(base + "?view=class&empty=1", { waitUntil: "networkidle" });
    await page.getByText("No modules yet", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Could not load class content.", { exact: true }).count(),
      0,
      "A missing Course draft must render the empty state, not an error",
    );

    assert.deepEqual(errors, []);
    console.log("PASS lecturer LMS class view and Coursera Lab view render with screenshots");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
