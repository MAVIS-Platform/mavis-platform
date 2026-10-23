const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Run the actual boundary/services with Node's test runner and the project's
// existing TypeScript compiler; no additional test dependency or emitted files.
const compileTypeScript = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(
    compiled.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    filename,
  );
};
require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;
const { MockAdapter } = require("../src/lib/api/mock-adapter.ts");
const { BackendAdapter } = require("../src/lib/api/backend-adapter.ts");
const { fromStatus } = require("../src/lib/errors/api-error.ts");
const { modelSchema, submissionSchema } = require("../src/types/domain.ts");
const { NextRequest } = require("next/server");
const route = require("../app/api/mavis/[operation]/route.ts");
const projectId = "sample-checkout";
const upload = {
  projectId,
  name: "Source",
  fileName: "source.zip",
  size: 4,
  archive: new Blob([new Uint8Array([80, 75, 3, 4])]),
};
const kind = (expected) => (error) => error.kind === expected;
function env(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
}

test("mock permissions, sign-out, and response ownership", async () => {
  const api = new MockAdapter("normal", 0);
  const projects = await api.execute("projects", {});
  projects[0].name = "Changed by UI";
  assert.notEqual((await api.execute("projects", {}))[0].name, "Changed by UI");
  await assert.rejects(api.execute("accounts", {}), kind("forbidden"));
  await api.execute("mockLogin", { role: "lecturer" });
  await assert.rejects(api.execute("projects", {}), kind("forbidden"));
  await api.execute("signOut", {});
  await assert.rejects(api.execute("submissions", {}), kind("unauthorized"));
});
test("model revisions remain immutable; stale saves conflict; review uses frozen submission", async () => {
  const api = new MockAdapter("normal", 0);
  const before = (await api.execute("models", { projectId }))[0];
  const submitted = await api.execute("submit", {
    assignmentId: "assignment-1",
    modelId: before.id,
    snapshotId: before.snapshotId,
    runtimeSessionId: null,
  });
  const request = {
    modelId: before.id,
    expectedRevision: before.revision,
    elementId: before.elements[0].id,
    description: "Reviewed description",
  };
  const revision = await api.execute("saveModel", request);
  assert.notEqual(revision.id, before.id);
  assert.equal(revision.revision, 2);
  assert.equal(
    (await api.execute("model", { modelId: before.id })).elements[0].description,
    before.elements[0].description,
  );
  await assert.rejects(api.execute("saveModel", request), kind("conflict"));
  await assert.rejects(
    api.execute("submit", {
      assignmentId: "assignment-1",
      modelId: revision.id,
      snapshotId: "other-source",
      runtimeSessionId: null,
    }),
    kind("not-found"),
  );
  await api.execute("mockLogin", { role: "lecturer" });
  const frozen = await api.execute("submission", { submissionId: submitted.id });
  assert.equal(
    submissionSchema.safeParse({ ...frozen, snapshot: { ...frozen.snapshot, id: "other-source" } })
      .success,
    false,
  );
  assert.equal(frozen.model.id, before.id);
  assert.deepEqual(frozen.model, before);
  await assert.rejects(
    api.execute("feedback", { submissionId: submitted.id, modelId: revision.id, text: "Feedback" }),
    kind("conflict"),
  );
  const reviewed = await api.execute("feedback", {
    submissionId: submitted.id,
    modelId: before.id,
    text: "Feedback on frozen version",
  });
  assert.equal(reviewed.feedback.length, 1);
  assert.equal(reviewed.model.id, before.id);
});
test("source validation, failed analysis, and incomplete evidence remain distinct", async (t) => {
  for (const scenario of ["unsupported", "invalid-source"]) {
    const api = new MockAdapter(scenario, 0);
    const source = await api.execute("importSource", upload);
    assert.notEqual(source.validation, "valid");
    await assert.rejects(
      api.execute("startAnalysis", { projectId, snapshotId: source.id }),
      kind("validation"),
    );
  }
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  for (const scenario of ["analysis-failed", "incomplete-evidence"]) {
    const api = new MockAdapter(scenario, 0);
    const source = await api.execute("importSource", upload);
    const queued = await api.execute("startAnalysis", { projectId, snapshotId: source.id });
    now += 6000;
    const result = await api.execute("analysisJob", { jobId: queued.id });
    if (scenario === "analysis-failed") {
      assert.equal(result.status, "failed");
      assert.equal(result.modelId, null);
    } else {
      assert.equal(result.status, "completed");
      const model = await api.execute("model", { modelId: result.modelId });
      assert.equal(model.snapshotId, source.id);
      assert.equal(model.elements[0].evidence[0].complete, false);
      const count = (await api.execute("models", { projectId })).length;
      await api.execute("analysisJob", { jobId: queued.id });
      assert.equal((await api.execute("models", { projectId })).length, count);
    }
  }
});
test("runtime approval captures revisions, requires prerequisites, and preserves terminal states", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const api = new MockAdapter("normal", 0);
  const request = {
    projectId,
    snapshotId: "source-1",
    scenarioId: "scenario-1",
    configurationRevision: 1,
    scenarioRevision: 1,
    approved: true,
  };
  await assert.rejects(
    api.execute("startRuntime", { ...request, approved: false }),
    kind("validation"),
  );
  await assert.rejects(
    api.execute("startRuntime", { ...request, snapshotId: "unknown" }),
    kind("not-found"),
  );
  const run = await api.execute("startRuntime", request);
  assert.equal(run.status, "running");
  assert.equal(run.traces.length, 0);
  await api.execute("saveScenario", {
    scenarioId: "scenario-1",
    expectedRevision: 1,
    name: "New scenario",
    steps: ["New step"],
  });
  await assert.rejects(api.execute("startRuntime", request), kind("conflict"));
  await assert.rejects(
    api.execute("stopRuntime", { sessionId: run.id, action: "terminate" }),
    kind("forbidden"),
  );
  now += 7000;
  const completed = await api.execute("runtimeSession", { sessionId: run.id });
  assert.equal(completed.status, "completed");
  assert.equal(completed.scenarioRevision, 1);
  assert.equal(completed.traces[0].uncertain, true);
  await assert.rejects(
    api.execute("stopRuntime", { sessionId: run.id, action: "cancel" }),
    kind("conflict"),
  );
  const next = await api.execute("startRuntime", { ...request, scenarioRevision: 2 });
  await api.execute("mockLogin", { role: "admin" });
  const terminated = await api.execute("stopRuntime", { sessionId: next.id, action: "terminate" });
  assert.equal(terminated.status, "terminated");
  assert.equal((await api.execute("audit", {})).length, 1);
});
test("disabled execution profiles prevent new runs; administrative writes detect stale versions", async () => {
  const api = new MockAdapter("normal", 0);
  await api.execute("mockLogin", { role: "admin" });
  await api.execute("configureProfile", {
    profileId: "profile-1",
    enabled: false,
    expectedRevision: 1,
  });
  await assert.rejects(
    api.execute("configureProfile", { profileId: "profile-1", enabled: true, expectedRevision: 1 }),
    kind("conflict"),
  );
  await api.execute("setAccountLock", { accountId: "sample-student", locked: true });
  await assert.rejects(api.execute("mockLogin", { role: "student" }), kind("forbidden"));
  await api.execute("setAccountLock", { accountId: "sample-student", locked: false });
  await api.execute("mockLogin", { role: "student" });
  await assert.rejects(
    api.execute("startRuntime", {
      projectId,
      snapshotId: "source-1",
      scenarioId: "scenario-1",
      configurationRevision: 1,
      scenarioRevision: 1,
      approved: true,
    }),
    kind("not-found"),
  );
});
test("graph response validation rejects dangling endpoints and duplicate identifiers", async () => {
  const api = new MockAdapter("normal", 0);
  const model = (await api.execute("models", { projectId }))[0];
  assert.equal(
    modelSchema.safeParse({ ...model, edges: [{ ...model.edges[0], to: "missing" }] }).success,
    false,
  );
  assert.equal(
    modelSchema.safeParse({ ...model, elements: [model.elements[0], model.elements[0]] }).success,
    false,
  );
});
test("empty, error, cancellation and failed runtime fixtures are explicit", async (t) => {
  assert.deepEqual(await new MockAdapter("empty", 0).execute("projects", {}), []);
  await assert.rejects(new MockAdapter("error", 0).execute("projects", {}), kind("server"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new MockAdapter("normal", 0).execute("projects", {}, controller.signal),
    kind("cancelled"),
  );
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const api = new MockAdapter("runtime-failed", 0);
  const run = await api.execute("startRuntime", {
    projectId,
    snapshotId: "source-1",
    scenarioId: "scenario-1",
    configurationRevision: 1,
    scenarioRevision: 1,
    approved: true,
  });
  now += 7000;
  const result = await api.execute("runtimeSession", { sessionId: run.id });
  assert.equal(result.outcome, "failed");
  assert.equal(result.traces.length, 0);
});
test("backend never falls back to fixtures, validates responses and normalizes HTTP failures", async (t) => {
  const api = new BackendAdapter();
  assert.equal(api.mode, "backend");
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Private transport detail");
  });
  await assert.rejects(
    api.execute("projects", {}),
    (error) => error.kind === "network" && !error.message.includes("Private"),
  );
  for (const [status, expected] of [
    [400, "invalid"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [422, "validation"],
    [429, "rate-limit"],
    [500, "server"],
    [503, "server"],
    [504, "timeout"],
  ]) {
    fetch.mock.mockImplementation(async () => new Response("", { status }));
    await assert.rejects(api.execute("projects", {}), kind(expected));
    assert.equal(fromStatus(status).kind, expected);
  }
  fetch.mock.mockImplementation(async () => new Response("", { status: 401 }));
  assert.deepEqual(await api.execute("session", {}), { user: null });
  fetch.mock.mockImplementation(async () => Response.json({ unexpected: "wire-format" }));
  await assert.rejects(api.execute("projects", {}), kind("contract"));
  const model = (await new MockAdapter("normal", 0).execute("models", { projectId }))[0];
  fetch.mock.mockImplementation(async () => Response.json(model));
  await assert.rejects(api.execute("model", { modelId: "different-version" }), kind("contract"));
  fetch.mock.mockImplementation(async () => new Response("invalid json"));
  await assert.rejects(api.execute("projects", {}), kind("contract"));
  fetch.mock.mockImplementation(async () => Response.json([]));
  assert.deepEqual(await api.execute("projects", {}), []);
});
test("backend propagates cancellation, timeout, and real multipart archives", async (t) => {
  const api = new BackendAdapter();
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_, options) =>
      new Promise((resolve, reject) => {
        if (options.signal.aborted) reject(new DOMException("Aborted", "AbortError"));
        else
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
      }),
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(api.execute("projects", {}, cancelled.signal), kind("cancelled"));
  const timeout = setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback) => timeout(callback, 1));
  await assert.rejects(api.execute("projects", {}), kind("timeout"));
  fetch.mock.mockImplementation(async (_, options) => {
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get("file").size, 4);
    assert.equal(options.headers, undefined);
    return Response.json({
      id: "source-2",
      projectId,
      name: "Source",
      createdAt: "2026-10-21T00:00:00Z",
      validation: "valid",
      evidenceComplete: false,
    });
  });
  assert.equal((await api.execute("importSource", upload)).id, "source-2");
});
test("server proxy uses Java bearer auth, rejects cross-origin writes and strips session secrets", async (t) => {
  env(t, { MAVIS_API_MODE:"backend", MAVIS_JAVA_URL:"https://backend.invalid" });
  const context=operation=>({params:Promise.resolve({operation})});
  const read=operation=>new NextRequest(`http://localhost:3092/api/mavis/${operation}?input=%7B%7D`);
  assert.equal((await route.GET(read("projects"),context("projects"))).status,401);
  assert.equal((await route.POST(new NextRequest("http://localhost:3092/api/mavis/signOut",{method:"POST",headers:{host:"localhost:3092",origin:"https://other.invalid"},body:"{}"}),context("signOut"))).status,403);
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    assert.equal(url,"https://backend.invalid/api/v1/auth/me");assert.equal(options.headers.get("Authorization"),"Bearer opaque");assert.equal(options.headers.has("Cookie"),false);
    return Response.json({code:200,data:{id:"11111111-1111-4111-8111-111111111111",fullName:"User",role:"STUDENT",passwordHash:"must-be-stripped",token:"must-be-stripped"}});
  });
  const response=await route.GET(new NextRequest("http://localhost:3092/api/mavis/session",{headers:{cookie:"mavis_session=opaque; unrelated=private"}}),context("session"));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{user:{id:"11111111-1111-4111-8111-111111111111",name:"User",role:"student"}});assert.equal(response.headers.get("cache-control"),"no-store");
});

test("theme bootstraps before paint with validated preferences and denied-storage fallback", () => {
  const layout = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const script = layout.match(/const appearanceBootstrap = `([^`]+)`/)[1];
  for (const [stored, systemDark, expected] of [
    ["light", true, false],
    ["dark", false, true],
    ["system", true, true],
    ["invalid", false, false],
    [null, true, true],
    ["denied", true, true],
  ]) {
    let dark;
    const element = {
      classList: {
        toggle: (_, value) => {
          dark = value;
        },
      },
      dataset: {},
      style: {},
    };
    vm.runInNewContext(script, {
      localStorage: {
        getItem: () => {
          if (stored === "denied") throw Error("Denied");
          return stored;
        },
      },
      matchMedia: () => ({ matches: systemDark }),
      document: { documentElement: element },
    });
    assert.equal(dark, expected);
    assert.equal(element.style.colorScheme, expected ? "dark" : "light");
  }
});

// Supply Next's routing context while rendering the real components on the
// server. No browser, upstream service, or sample session is needed here.
function loadRoutedComponent(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    URLSearchParams,
    require: (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "next/navigation")
        return {
          usePathname: () => "/architecture",
          useSearchParams: () => new URLSearchParams("project=project-1&model=model-1"),
          useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
        };
      return require(
        name.startsWith("@/")
          ? path.join(root, "src", name.slice(2))
          : name.startsWith(".")
            ? path.resolve(path.dirname(filename), name)
            : name,
      );
    },
  });
  return exports;
}

test("live shell preserves model context without provisional session or sample UI", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const { AppShell } = loadRoutedComponent("src/components/app-shell.tsx");
  // Intentionally omit AppProvider: live chrome must not invoke its adapter.
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { live: true, navigationQuery: "?project=project-1&model=model-1" },
        "Live model content",
      ),
    ),
  );
  assert.ok(html.includes("Live model content"));
  for (const route of ["/import", "/architecture", "/impact", "/explain"])
    assert.ok(html.includes(`href="${route}?project=project-1&amp;model=model-1"`), route);
  for (const excluded of ["Mock mode", "Design preview", "Profile menu", 'href="/workspaces"'])
    assert.ok(!html.includes(excluded), excluded);
});

test("analysis routes share the authenticated guard in backend mode and mock mode", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const { ApiContext } = require("../src/providers/app-context.ts");
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const shell = loadRoutedComponent("src/components/app-shell.tsx");
  const mainflow = loadRoutedComponent("src/components/mainflow/shell.tsx", {
    "@/components/app-shell": shell,
  });
  for (const screen of ["import", "architecture", "impact", "explain"]) {
    const Page = loadRoutedComponent(`src/routes/${screen}.tsx`, {
      "@/components/app-shell": shell,
      "@/components/mainflow/shell": mainflow,
    }).default;
    for (const mode of ["mock", "backend"]) {
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            ApiContext.Provider,
            { value: mode === "mock" ? new MockAdapter() : new BackendAdapter() },
            React.createElement(QueryClientProvider, { client }, React.createElement(Page)),
          ),
        ),
      );
      client.clear();
      assert.ok(html.includes("Checking session"), `${screen}: ${mode} checks its session`);
      assert.equal(html.includes("Architecture analysis"), false, `${screen}: do not render authenticated content before session resolution`);
    }
  }
});

test("unclassified architecture forms a deterministic 2D network without overlapping nodes", () => {
  const {
    layoutGraph,
    graphEdgePath,
    NODE_WIDTH,
    NODE_HEIGHT,
  } = require("../src/features/architecture/graph-layout.ts");
  const elements = Array.from({ length: 24 }, (_, i) => ({
    id: `node-${i}`,
    name: `Service ${i}`,
    layer: "unclassified",
    description: "",
    evidence: [],
  }));
  const edges = elements
    .slice(1)
    .map((node, i) => ({
      id: `edge-${i}`,
      from: elements[Math.floor(i / 3)].id,
      to: node.id,
      protocol: "HTTP",
      uncertain: false,
      evidence: [],
    }));
  const model = { elements, edges };
  const original = JSON.stringify(model);
  const nodes = layoutGraph(model);
  assert.equal(JSON.stringify(model), original, "layout must not alter analyzed data");
  assert.deepEqual(nodes, layoutGraph(model));
  assert.deepEqual(nodes, layoutGraph({ ...model, elements: [...elements].reverse() }));
  assert.ok(
    new Set(nodes.map((node) => Math.round(node.x))).size > 3,
    "unclassified nodes must not form one column",
  );
  const width = Math.max(...nodes.map((node) => node.x)) + NODE_WIDTH;
  const height = Math.max(...nodes.map((node) => node.y)) + NODE_HEIGHT;
  assert.ok(
    width / height > 0.5 && width / height < 3,
    "network should fit a useful 2D aspect ratio",
  );
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(
        Math.abs(nodes[i].x - nodes[j].x) >= NODE_WIDTH ||
          Math.abs(nodes[i].y - nodes[j].y) >= NODE_HEIGHT,
        "node rectangles overlap",
      );
    }
  assert.deepEqual(layoutGraph({ elements: [], edges: [] }), []);
  assert.equal(layoutGraph({ elements: elements.slice(0, 1), edges: [] }).length, 1);
  for (const [from, to, self] of [
    [nodes[0], nodes[1], false],
    [nodes[0], nodes[0], true],
  ]) {
    const path = graphEdgePath(from, to, self);
    assert.ok(!/NaN|Infinity/.test(path));
    assert.match(path, /^M /);
  }
  const disconnected = layoutGraph({ elements, edges: [] });
  assert.ok(disconnected.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test("diagram zoom preserves the cursor's diagram point and clamps zoom", () => {
  const { zoomDiagramCamera } = require("../src/features/architecture/diagram-camera.ts");
  const camera = { x: 120, y: -70, zoom: 2 };
  const origin = { x: 150, y: 40 };
  const anchor = { x: 530, y: 280 };
  const point = (view) => ({ x: (anchor.x - origin.x - view.x) / view.zoom, y: (anchor.y - origin.y - view.y) / view.zoom });
  for (const factor of [1.2, 0.5, 1000, 0.00001]) {
    const next = zoomDiagramCamera(camera, factor, anchor, origin);
    assert.ok(next.zoom >= 0.15 && next.zoom <= 12);
    assert.ok(Math.abs(point(next).x - point(camera).x) < 1e-9);
    assert.ok(Math.abs(point(next).y - point(camera).y) < 1e-9);
  }
  const zoomed = zoomDiagramCamera(camera, 1.5, anchor, origin);
  const restored = zoomDiagramCamera(zoomed, 1 / 1.5, anchor, origin);
  assert.ok(Math.abs(restored.x - camera.x) < 1e-9);
  assert.ok(Math.abs(restored.y - camera.y) < 1e-9);
  assert.equal(restored.zoom, camera.zoom);
});
test("draw.io bridge accepts only local editor messages from the current iframe", () => {
  const { DRAWIO_ORIGIN, DRAWIO_MAX_XML_LENGTH, readDrawioEvent } = require("../src/features/architecture/drawio-protocol.ts");
  const frame = {};
  const message = { origin: DRAWIO_ORIGIN, source: frame, data: JSON.stringify({ event: "save", xml: "<mxfile/>" }) };
  assert.deepEqual(readDrawioEvent(message, frame), { event: "save", xml: "<mxfile/>" });
  assert.equal(readDrawioEvent({ ...message, origin: "https://embed.diagrams.net" }, frame), null);
  assert.equal(readDrawioEvent({ ...message, source: {} }, frame), null);
  assert.equal(readDrawioEvent(message, null), null);
  assert.equal(readDrawioEvent({ ...message, data: "not JSON" }, frame), null);
  assert.equal(readDrawioEvent({ ...message, data: JSON.stringify({ event: "save", xml: 123 }) }, frame), null);
  assert.equal(readDrawioEvent({ ...message, data: JSON.stringify({ event: "save", xml: "x".repeat(DRAWIO_MAX_XML_LENGTH + 1) }) }, frame), null);
  assert.equal(readDrawioEvent({ ...message, data: JSON.stringify({ event: "openLink", href: "https://example.com" }) }, frame), null);
  assert.deepEqual(readDrawioEvent({ ...message, data: JSON.stringify({ event: "init" }) }, frame), { event: "init" });
});
test("draw.io fit constrains height as well as width for tall diagrams", () => {
  const { drawioFitRequest } = require("../src/features/architecture/drawio-protocol.ts");
  const fit = drawioFitRequest({ modelBounds: { width: 1337, height: 1190 }, containerSize: { width: 1040, height: 610 } });
  assert.equal(fit.action, "fit");
  assert.ok(fit.maxScale * 1190 <= 610 - 48 + 1e-9);
  assert.ok(fit.maxScale * 1337 <= 1040 - 48 + 1e-9);
  assert.ok(fit.maxScale < 0.5, "width-only fitting would clip the bottom of this real model");
  assert.equal(drawioFitRequest({}), null);
  assert.equal(drawioFitRequest({ modelBounds: { width: 0, height: Infinity }, containerSize: { width: 100, height: 200 } }), null);
});
test("drawio projection and rules preserve scope without fabricating technology", () => {
 const {projectDiagram,nodeText,relationLabel}=require("../src/lib/drawio/rules.ts");
 const raw=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/petclinic-component.json"),"utf8").replace(/^\uFEFF/,""));
 const service=raw.layoutJson.nodes.find(node=>node.name==="customers-service");
 const scope=projectDiagram(raw,service.id);
 assert.ok(scope.layoutJson.nodes.some(node=>node.name==="OwnerRepository"));
 assert.ok(!scope.layoutJson.nodes.some(node=>node.name==="VetRepository"));
 assert.ok(scope.omittedNodes>0);
 assert.throws(()=>projectDiagram(raw,"missing"));
 assert.throws(()=>projectDiagram({...raw,layoutJson:{nodes:raw.layoutJson.nodes,edges:[{id:"bad",from:"foreign",to:service.id}]}}));
 assert.doesNotMatch(nodeText({id:"x",name:"Tên dịch vụ",kind:"SERVICE_CONTAINER"}).join(" "),/not extracted|technology unknown/);
 assert.doesNotMatch(relationLabel({id:"a",type:"DECLARED_COMPOSE"}),/HTTP/);
});

test("canonical drawio routes real Petclinic container and component with zero hard collisions", async () => {
 const {projectDiagram}=require("../src/lib/drawio/rules.ts");
 const {generateDrawio}=require("../src/lib/drawio/server.ts");
 for(const level of ["container","component"]){
  const raw=JSON.parse(fs.readFileSync(path.join(root,`tests/fixtures/petclinic-${level}.json`),"utf8").replace(/^\uFEFF/,""));
  const scope=projectDiagram(raw,level==="component"?raw.layoutJson.nodes.find(node=>node.name==="customers-service").id:undefined);
  const before=JSON.stringify(scope),xml=await generateDrawio(scope);
  const quality=JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;",'"'));
  assert.equal(quality.needsReview,false,JSON.stringify(quality));
  assert.equal(JSON.stringify(scope),before);
  assert.equal((xml.match(/mavisRole="edge"/g)||[]).length,scope.layoutJson.edges.length);
  assert.equal((xml.match(/mavisRole="edge-label"/g)||[]).length,scope.layoutJson.edges.length);
  assert.match(xml,/mavisRuleVersion="mavis-se-3"/);
  assert.match(xml,/font-size:16px;font-weight:bold/);
  if(level==="component")assert.match(xml,/mavisRole="boundary"/);
  assert.equal(await generateDrawio(scope),xml,"output must be deterministic");
 }
});

test("drawio preserves cycle, reciprocal and disconnected nodes; escapes hostile labels", async () => {
 const {generateDrawio}=require("../src/lib/drawio/server.ts");
 const {projectDiagram}=require("../src/lib/drawio/rules.ts");
 const document={modelVersionId:"test",notation:"DEPENDENCY_GRAPH",level:"SERVICE",layoutJson:{nodes:["a","b","c","d"].map(id=>({id,name:id==="a"?'Tên dịch vụ <script>alert(1)</script> rất dài có dấu tiếng Việt':id,kind:"SERVICE_CONTAINER"})),edges:[{id:"ab",from:"a",to:"b",type:"CODE_DEPENDENCY"},{id:"ba",from:"b",to:"a",type:"CODE_DEPENDENCY"},{id:"bc",from:"b",to:"c",type:"CODE_DEPENDENCY"},{id:"ca",from:"c",to:"a",type:"CODE_DEPENDENCY"}]}};
 const xml=await generateDrawio(projectDiagram(document));
 assert.equal((xml.match(/mavisRole="SERVICE_CONTAINER"/g)||[]).length,4);
 assert.equal((xml.match(/mavisRole="edge"/g)||[]).length,4);
 assert.ok(!xml.includes("<script>"));
 assert.match(xml,/mavisId="ba"/);
 const excessive={...document,layoutJson:{nodes:Array.from({length:101},(_,i)=>({id:String(i),name:String(i)})),edges:[]}};
 await assert.rejects(generateDrawio(projectDiagram(excessive)),/smaller diagram scope/);
});

test("drawio geometry gate catches crossings through unrelated nodes and label collisions", () => {
 const {inspectGeometry}=require("../src/lib/drawio/geometry.ts");
 const nodes=[{id:"a",x:0,y:0,width:50,height:50},{id:"b",x:100,y:0,width:50,height:50},{id:"obstacle",x:60,y:0,width:20,height:50}];
 const result=inspectGeometry(nodes,[{id:"label",x:1,y:1,width:20,height:20}],[{id:"ab",from:"a",to:"b",points:[{x:50,y:25},{x:100,y:25}]}]);
 assert.equal(result.edgeThroughNodes,1);assert.equal(result.labelNodeOverlaps,1);assert.equal(result.needsReview,true);
});
test("drawio relation filters disclose omitted edges instead of inventing traffic", () => {
 const {projectDiagram,selectRelationships}=require("../src/lib/drawio/rules.ts");
 const raw=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/petclinic-container.json"),"utf8").replace(/^\uFEFF/,""));
 const doc=projectDiagram(raw),source=selectRelationships(doc,"source"),declared=selectRelationships(doc,"declared"),runtime=selectRelationships(doc,"runtime");
 assert.equal(source.layoutJson.edges.length,0);assert.equal(source.omittedEdges,13);
 assert.equal(declared.layoutJson.edges.length,13);assert.equal(runtime.layoutJson.edges.length,0);
 assert.equal(runtime.layoutJson.nodes.length,11,"nodes must not silently disappear when a relation class is hidden");
 assert.equal(selectRelationships(doc,"all"),doc);
});

test("drawio themes preserve semantic distinction and readable base palette", () => {
 const {palette,nodeStyle}=require("../src/lib/drawio/rules.ts");
 const luminance=hex=>{const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;};
 for(const theme of ["clean","dark","blueprint"]){const p=palette(theme);for(const fill of [p.background,p.internal,p.data,p.external]){const a=luminance(p.text),b=luminance(fill);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5);}}
 assert.match(nodeStyle("DATABASE","clean"),/cylinder/);assert.match(nodeStyle("QUEUE_BROKER","clean"),/shape=process/);
});
test("drawio supports self loops and parallel relations without dropping IDs", async () => {
 const {generateDrawio}=require("../src/lib/drawio/server.ts");const {projectDiagram}=require("../src/lib/drawio/rules.ts");
 const doc=projectDiagram({modelVersionId:"test",notation:"DEPENDENCY_GRAPH",level:"SERVICE",layoutJson:{nodes:[{id:"a.b",name:"A",kind:"SERVICE_CONTAINER"},{id:"a_b",name:"B",kind:"SERVICE_CONTAINER"}],edges:[{id:"self",from:"a.b",to:"a.b",type:"CODE_DEPENDENCY"},{id:"one",from:"a.b",to:"a_b",type:"CODE_DEPENDENCY"},{id:"two",from:"a.b",to:"a_b",type:"SERVICE_HTTP_CALL"}]}});
 const xml=await generateDrawio(doc);assert.equal((xml.match(/mavisRole="edge"/g)||[]).length,3);assert.match(xml,/mavisId="self"/);assert.match(xml,/mavisId="a.b"/);assert.match(xml,/mavisId="a_b"/);
});
test("planar shared-dependency routing removes Petclinic crossings without deleting edges", async () => {
 const {generateDrawio}=require("../src/lib/drawio/server.ts"),{projectDiagram}=require("../src/lib/drawio/rules.ts");
 const raw=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/petclinic-container.json"),"utf8").replace(/^\uFEFF/,""));const xml=await generateDrawio(projectDiagram(raw));
 const metrics=JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;",'"'));
 assert.equal(metrics.crossings,0);assert.equal(metrics.needsReview,false);assert.equal((xml.match(/mavisRole="edge"/g)||[]).length,13);assert.equal((xml.match(/mavisRole="SERVICE_CONTAINER"/g)||[]).length,11);
});

test("pinned relayout preserves multiple fixed rectangles and safely rejects conflicting locks", async () => {
 const {generateDrawio}=require("../src/lib/drawio/server.ts"),{projectDiagram}=require("../src/lib/drawio/rules.ts");
 const node=(id,x,y)=>({id,name:id,kind:"SERVICE_CONTAINER",languageStack:"Java",description:"Handles requests",pinned:{x,y,width:280,height:160}});
 const doc={modelVersionId:"pins",notation:"DEPENDENCY_GRAPH",level:"SERVICE",layoutJson:{nodes:[node("a",400,400),node("b",1000,700),{id:"c",name:"Free node",kind:"SERVICE_CONTAINER",languageStack:"Java",description:"Processes requests"}],edges:[{id:"ab",from:"a",to:"b",type:"SERVICE_HTTP_CALL"},{id:"bc",from:"b",to:"c",type:"CODE_DEPENDENCY"}]}};
 const xml=await generateDrawio(projectDiagram(doc));
 assert.match(xml,/mavisId="a"[\s\S]*?movable=0;resizable=0;[\s\S]*?<mxGeometry x="448" y="512" width="280" height="160"/);
 assert.match(xml,/mavisId="b"[\s\S]*?<mxGeometry x="1048" y="812" width="280" height="160"/);
 const quality=JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;",'"'));assert.equal(quality.needsReview,false);
 const conflict=structuredClone(doc);conflict.layoutJson.nodes[1].pinned={x:400,y:400,width:280,height:160};await assert.rejects(generateDrawio(projectDiagram(conflict)),/Locked shapes overlap/);
});
test("FTGO component scope selects populated service and distinguishes infrastructure with no internals", async () => {
 const {componentContainers,projectDiagram,relationLabel,nodeText}=require("../src/lib/drawio/rules.ts");
 const {generateDrawio}=require("../src/lib/drawio/server.ts");
 const doc=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/ftgo-component.json"),"utf8"));
 const containers=componentContainers(doc);
 assert.equal(containers[0].name,"ftgo-order-service");assert.equal(containers[0].componentCount,5);
 assert.equal(containers.find(c=>c.name==="cdc-service").componentCount,0);
 assert.equal(containers.reduce((count,c)=>count+c.componentCount,0),23);
 const scope=projectDiagram(doc,containers[0].id);
 assert.equal(scope.layoutJson.nodes.filter(n=>n.kind==="COMPONENT"&&n.parentId===containers[0].id).length,5);
 assert.ok(!scope.layoutJson.nodes.some(n=>n.name==="cdc-service"));
 assert.equal(relationLabel({id:"e",type:"DECLARED_COMPOSE"}),"Compose dependency");
 assert.equal(relationLabel({id:"e",type:"CODE_DEPENDENCY"}),"Code dependency");
 assert.doesNotMatch(nodeText({id:"n",name:"Service",kind:"SERVICE_CONTAINER"}).join(" "),/Responsibility not extracted/);
 const xml=await generateDrawio(scope);assert.match(xml,/mavisRole="boundary"/);assert.doesNotMatch(xml,/Phụ thuộc|Trách nhiệm/);
});
test("architecture pack keeps Compose ordering outside application interactions and retains source IDs",()=>{
 const {planArchitectureViews}=require("../src/lib/architecture/view-planner.ts");
 const raw=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/ftgo-component.json"),"utf8"));const before=JSON.stringify(raw);const pack=planArchitectureViews(raw);
 const app=pack.views.find(v=>v.id==="containers"),deployment=pack.views.find(v=>v.id==="deployment");
 assert.ok(!app.document.layoutJson.edges.some(e=>e.type==="DECLARED_COMPOSE"));
 assert.equal(deployment.document.layoutJson.edges.length,33);
 assert.equal(pack.views.filter(v=>v.kind==="component").length,8);
 assert.ok(app.document.layoutJson.edges.every(e=>e.underlyingEdgeIds.length>0));
 assert.ok(app.document.layoutJson.edges.every(e=>raw.layoutJson.nodes.find(n=>n.id===e.from)?.kind!=="COMPONENT"));
 assert.equal(JSON.stringify(raw),before);assert.equal(pack.status,"requires-review");
 assert.equal(pack.coverage.relationships,53);assert.equal(pack.coverage.relationshipsWithoutResolutionMetadata,53);
 assert.ok(!pack.views.some(v=>v.id==="components:3be666c8-af02-46f9-ab2d-64115802d618"));
});
test("grouped overview accounts for every service member without pretending a group is a C4 container",()=>{
 const {planArchitectureViews}=require("../src/lib/architecture/view-planner.ts");const raw=JSON.parse(fs.readFileSync(path.join(root,"tests/fixtures/ftgo-component.json"),"utf8"));const pack=planArchitectureViews(raw);const view=pack.views.find(v=>v.id==="overview");
 assert.equal(view.document.notation,"ARCHITECTURE_OVERVIEW");const group=view.document.layoutJson.nodes.find(n=>n.kind==="SERVICE_GROUP");assert.equal(group.underlyingNodeIds.length,8);assert.match(group.description,/ftgo-order-service/);
 for(const member of group.underlyingNodeIds)assert.ok(view.document.projection.includedNodeIds.includes(member));
 assert.ok(pack.views.some(v=>v.id==="containers"));
});
test("readability checks the effective font after fitting and A3 export, not XML font size alone",()=>{
 const {assessReadability}=require("../src/lib/architecture/readability.ts");
 const dense=assessReadability({width:1728,height:1540,minimumFontPx:12,viewportWidth:1000,viewportHeight:620});assert.equal(dense.screenReadable,false);assert.ok(dense.minimumScreenFontPx<5);
 const readable=assessReadability({width:800,height:450,minimumFontPx:14,viewportWidth:1000,viewportHeight:620});assert.equal(readable.screenReadable,true);assert.equal(readable.printReadable,true);
 assert.throws(()=>assessReadability({width:0,height:1,minimumFontPx:12,viewportWidth:1,viewportHeight:1}));
});
test("graph collapse preserves every underlying relationship and separates deployment filters",()=>{
 const {projectGraphModel}=require("../src/features/architecture/graph-projection.ts");
 const model={id:"m",projectId:"p",snapshotId:"s",revision:1,label:"Model",elements:[{id:"a",name:"A",elementType:"SERVICE_CONTAINER",layer:"unclassified",description:"",evidence:[]},{id:"c",name:"C",parentId:"a",elementType:"COMPONENT",layer:"unclassified",description:"",evidence:[]},{id:"b",name:"B",layer:"unclassified",description:"",evidence:[]}],edges:[{id:"one",from:"c",to:"b",protocol:"HTTP",originLayer:"STATIC",uncertain:false,evidence:[]},{id:"two",from:"a",to:"b",protocol:"HTTP",originLayer:"STATIC",uncertain:false,evidence:[]},{id:"boot",from:"a",to:"b",protocol:"DECLARED_COMPOSE",originLayer:"DEPLOYMENT",uncertain:false,evidence:[]}]};
 const source=projectGraphModel(model,false,"source");assert.equal(source.model.elements.length,2);assert.equal(source.model.edges.length,1);assert.deepEqual(source.model.edges[0].underlyingEdgeIds,["one","two"]);assert.equal(source.filteredRelationships,1);
 const expanded=projectGraphModel(model,true,"all");assert.equal(expanded.model.elements.length,3);assert.equal(expanded.model.edges.length,3);assert.equal(model.edges[0].from,"c");
});
test("compact overview routes explicit service/channel/data groups without collisions",()=>{
 const {compactOverview}=require("../src/lib/drawio/compact-overview.ts");
 const result=compactOverview([{id:"app",kind:"SERVICE_GROUP",width:280,height:232},{id:"channel",kind:"CHANNEL_GROUP",width:280,height:132},{id:"data",kind:"DATASTORE_GROUP",width:280,height:192}],[{id:"pub",from:"app",to:"channel",type:"MESSAGE_PUBLISH"},{id:"sub",from:"channel",to:"app",type:"MESSAGE_SUBSCRIBE"},{id:"db",from:"app",to:"data",type:"DATABASE_ACCESS"}]);
 assert.ok(result);assert.equal(result.quality.needsReview,false);assert.equal(result.quality.crossings,0);assert.equal(result.routes.length,3);
 assert.ok(Math.max(...result.rects.map(rect=>rect.y+rect.height))<450);
 assert.ok(result.graph.height>350,"Layout bounds must keep the legend below the drawing");
});