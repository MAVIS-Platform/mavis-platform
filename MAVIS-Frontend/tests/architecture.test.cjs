const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Run the actual boundary/services with Node's test runner and the project's
// existing TypeScript compiler; no additional test dependency or emitted files.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
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
test("server proxy requires configured operations, checks write origin, and strips untrusted response fields", async (t) => {
  env(t, {
    MAVIS_API_MODE: "backend",
    MAVIS_BACKEND_URL: "https://backend.invalid",
    MAVIS_API_OPERATIONS: "{}",
    MAVIS_SESSION_COOKIES: "session",
  });
  const context = (operation) => ({ params: Promise.resolve({ operation }) });
  const read = (operation) =>
    new NextRequest(`http://localhost:3092/api/mavis/${operation}?input=%7B%7D`);
  assert.equal((await route.GET(read("projects"), context("projects"))).status, 501);
  assert.equal(
    (
      await route.POST(
        new NextRequest("http://localhost:3092/api/mavis/signOut", {
          method: "POST",
          headers: { origin: "https://other.invalid" },
          body: "{}",
        }),
        context("signOut"),
      )
    ).status,
    403,
  );
  process.env.MAVIS_API_OPERATIONS = JSON.stringify({
    session: { path: "/session", method: "GET" },
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://backend.invalid");
    assert.equal(options.headers.Cookie, "session=opaque");
    return Response.json({
      user: { id: "u1", name: "User", role: "student", accessToken: "must-be-stripped" },
      internal: "must-be-stripped",
    });
  });
  const response = await route.GET(
    new NextRequest("http://localhost:3092/api/mavis/session", {
      headers: { cookie: "session=opaque; unrelated=private" },
    }),
    context("session"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: "u1", name: "User", role: "student" } });
  assert.equal(response.headers.get("cache-control"), "no-store");
  process.env.MAVIS_API_OPERATIONS = JSON.stringify({
    session: { path: "//untrusted.invalid", method: "GET" },
  });
  assert.equal((await route.GET(read("session"), context("session"))).status, 501);
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
