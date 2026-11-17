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

test("element details show saved relationship evidence when direct element evidence is empty", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { ApiContext } = require("../src/providers/app-context.ts");
  const { ElementDetailsPanel } = require("../src/features/architecture/components.tsx");
  const model = {
    id: "evidence-model",
    projectId: "project",
    snapshotId: "snapshot",
    revision: 4,
    label: "Saved model",
    elements: [
      { id: "handler", name: "CommandHandler", evidence: [] },
      { id: "channel", name: "Commands", evidence: [] },
    ],
    edges: [
      {
        id: "subscription",
        from: "channel",
        to: "handler",
        protocol: "MESSAGE_SUBSCRIBE",
        evidence: [],
        uncertain: false,
      },
    ],
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(
    ["api", "elementEvidenceContext", { modelId: model.id, elementId: "handler" }],
    {
      modelId: model.id,
      elementId: "handler",
      directEvidence: [],
      relationshipEvidence: [
        {
          relationshipId: "subscription",
          evidence: {
            id: "proof",
            kind: "source",
            sourceType: "STATIC_CODE",
            location: "Handler.java:12",
            snippet: "subscribe(commands)",
            complete: true,
          },
        },
      ],
    },
  );
  const api = {
    mode: "backend",
    execute: () => {
      throw Error("Unexpected request during seeded render");
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        ApiContext.Provider,
        { value: api },
        React.createElement(ElementDetailsPanel, { model, selectedId: "handler" }),
      ),
    ),
  );
  assert.match(html, /Evidence for related relationships/);
  assert.match(html, /Commands → CommandHandler/);
  assert.match(html, /subscribe\(commands\)/);
  assert.match(html, /No evidence is attached directly/);
  assert.doesNotMatch(html, /No evidence attached/);
  client.clear();
});

test("3E labels metadata reconstructions as previews and keeps saved evidence distinct", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const {
    collectConcreteThreeEEvidences,
  } = require("../src/features/architecture/three-e-content.ts");
  const { ThreeEEvidence } = require("../src/features/architecture/three-e-evidence.tsx");
  const node = {
    id: "parcel",
    name: "Parcel",
    elementType: "CLASS_INTERFACE",
    evidence: [],
    properties: {
      sourcePath: "Parcel.java",
      umlClassifier: { name: "Parcel", typeKind: "CLASS", members: [] },
    },
  };
  const model = { id: "preview-model", elements: [node], edges: [] },
    ctx = { subject: { node, edge: null } };
  const preview = collectConcreteThreeEEvidences(model, ctx, [], []);
  assert.ok(preview.length > 0);
  assert.ok(
    preview.every(
      (e) =>
        e.origin === "preview" && e.complete === false && e.sourceType === "MODEL_METADATA_PREVIEW",
    ),
  );
  const html = renderToStaticMarkup(React.createElement(ThreeEEvidence, { evidence: preview }));
  assert.match(html, /Metadata preview/);
  assert.match(html, /not a verbatim source snippet or a saved Evidence record/);
  const saved = {
    id: "saved",
    origin: "persisted",
    kind: "source",
    sourceType: "STATIC_CODE",
    location: "Parcel.java:4",
    snippet: "class Parcel {}",
    complete: null,
  };
  const concrete = collectConcreteThreeEEvidences(model, ctx, [saved], []);
  assert.deepEqual(concrete, [saved]);
});

test("mock evidence context follows the same element/model contract", async () => {
  const api = new MockAdapter();
  const projects = await api.execute("projects", {});
  const versions = await api.execute("modelVersions", { projectId: projects[0].id });
  const model = await api.execute("model", { modelId: versions[0].id });
  const context = await api.execute("elementEvidenceContext", {
    modelId: model.id,
    elementId: model.elements[0].id,
  });
  assert.equal(context.modelId, model.id);
  assert.equal(context.elementId, model.elements[0].id);
  assert.ok(Array.isArray(context.directEvidence) && Array.isArray(context.relationshipEvidence));
});
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
  assert.ok((await api.execute("projects", {})).length > 0);
  await assert.rejects(
    api.execute("startAnalysis", {
      projectId,
      snapshotId: "source-1",
      idempotencyKey: "lecturer-cannot-write",
    }),
    kind("forbidden"),
  );
  await api.execute("signOut", {});
  await assert.rejects(api.execute("submissions", {}), kind("unauthorized"));
});

test("teaching lifecycle enforces lecturer controls and exposes member assignments and frozen submission review", async () => {
  const api = new MockAdapter("normal", 0);
  await assert.rejects(
    api.execute("createWorkspace", { code: "SA1", name: "Architecture class" }),
    kind("forbidden"),
  );
  await assert.rejects(
    api.execute("assignmentSubmissions", {
      workspaceId: "workspace-1",
      assignmentId: "assignment-1",
    }),
    kind("forbidden"),
  );
  await api.execute("mockLogin", { role: "lecturer" });
  const room = await api.execute("createWorkspace", { code: "SA1", name: "Architecture class" });
  assert.equal(room.myRole, "LECTURER");
  const joined = await api.execute("addWorkspaceMember", {
    workspaceId: room.id,
    email: "student@example.com",
    memberRole: "STUDENT",
  });
  assert.ok(joined.members.some((m) => m.id === "sample-student"));
  const assignment = await api.execute("createAssignment", {
    workspaceId: room.id,
    title: "Review service boundaries",
    description: "Submit a saved model",
    dueAt: null,
    requiredDiagramTypes: [],
    requireRuntimeTrace: false,
  });
  assert.equal(assignment.workspaceId, room.id);
  await api.execute("mockLogin", { role: "student" });
  assert.ok((await api.execute("workspaces", {})).some((w) => w.id === room.id));
  assert.ok(
    (await api.execute("assignments", { workspaceId: room.id })).some(
      (a) => a.id === assignment.id,
    ),
  );
  const coursework = await api.execute("createProject", {
    name: "Coursework",
    workspaceId: room.id,
    assignmentId: assignment.id,
  });
  assert.equal(coursework.workspaceId, room.id);
  assert.equal(coursework.assignmentId, assignment.id);
  await assert.rejects(
    api.execute("createAssignment", {
      workspaceId: room.id,
      title: "unauthorized",
      dueAt: null,
      requiredDiagramTypes: [],
      requireRuntimeTrace: false,
    }),
    kind("forbidden"),
  );
  await api.execute("mockLogin", { role: "lecturer" });
  const rows = await api.execute("assignmentSubmissions", {
    workspaceId: "workspace-1",
    assignmentId: "assignment-1",
  });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((s) => s.assignmentId === "assignment-1"));
  const submission = rows[0],
    snapshot = JSON.stringify(submission.model);
  const reviewed = await api.execute("feedback", {
    submissionId: submission.id,
    modelId: submission.model.id,
    text: "Check the shared database dependency",
  });
  assert.equal(reviewed.feedback.at(-1).text, "Check the shared database dependency");
  assert.equal(
    JSON.stringify(reviewed.model),
    snapshot,
    "Feedback must preserve the submitted model",
  );
  await assert.rejects(
    api.execute("assignmentSubmissions", { workspaceId: room.id, assignmentId: "assignment-1" }),
    kind("not-found"),
  );
  await api.execute("mockLogin", { role: "admin" });
  const promoted = await api.execute("setAccountRole", {
    accountId: "sample-student",
    role: "lecturer",
  });
  assert.equal(promoted.role, "lecturer");
});

test("student submission readiness checks requirements and grade drafts remain private until publication", async () => {
  const {
    missingDiagramRequirements,
    isDeadlinePassed,
  } = require("../src/features/submissions/submission-readiness.ts");
  assert.deepEqual(
    missingDiagramRequirements(
      ["UML_CLASS", "UML_PACKAGE"],
      { documents: [{ viewId: "uml-class:all", revision: 2 }], diagramVersionIds: [] },
      [],
    ),
    ["UML_PACKAGE"],
  );
  assert.ok(isDeadlinePassed("2020-01-01T00:00:00Z"));
  assert.ok(!isDeadlinePassed("No deadline"));
  const api = new MockAdapter("normal", 0);
  await api.execute("mockLogin", { role: "lecturer" });
  const rows = await api.execute("assignmentSubmissions", {
      workspaceId: "workspace-1",
      assignmentId: "assignment-1",
    }),
    id = rows[0].id;
  const draft = await api.execute("gradeSubmission", {
    submissionId: id,
    expectedRevision: 0,
    status: "DRAFT",
    score: 81.5,
    summary: "Private rubric notes",
  });
  assert.equal(draft.revision, 1);
  await api.execute("mockLogin", { role: "student" });
  const pending = await api.execute("submissionReview", { submissionId: id });
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.summary, "");
  await assert.rejects(
    api.execute("gradeSubmission", {
      submissionId: id,
      expectedRevision: 1,
      status: "GRADED",
      score: 100,
      summary: "Self grade",
    }),
    kind("forbidden"),
  );
  await api.execute("mockLogin", { role: "lecturer" });
  await api.execute("gradeSubmission", {
    submissionId: id,
    expectedRevision: 1,
    status: "RETURNED",
    score: null,
    summary: "Please revise the service boundary",
  });
  await assert.rejects(
    api.execute("gradeSubmission", {
      submissionId: id,
      expectedRevision: 1,
      status: "GRADED",
      score: 90,
      summary: "Stale review",
    }),
    kind("conflict"),
  );
  await api.execute("gradeSubmission", {
    submissionId: id,
    expectedRevision: 2,
    status: "GRADED",
    score: 91.5,
    summary: "Revisions accepted",
  });
  await api.execute("mockLogin", { role: "student" });
  const published = await api.execute("submissionReview", { submissionId: id });
  assert.equal(published.score, 91.5);
  assert.equal(published.status, "GRADED");
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
  env(t, { MAVIS_API_MODE: "backend", MAVIS_JAVA_URL: "https://backend.invalid" });
  const context = (operation) => ({ params: Promise.resolve({ operation }) });
  const read = (operation) =>
    new NextRequest(`http://localhost:3092/api/mavis/${operation}?input=%7B%7D`);
  assert.equal((await route.GET(read("projects"), context("projects"))).status, 401);
  assert.equal(
    (
      await route.POST(
        new NextRequest("http://localhost:3092/api/mavis/signOut", {
          method: "POST",
          headers: { host: "localhost:3092", origin: "https://other.invalid" },
          body: "{}",
        }),
        context("signOut"),
      )
    ).status,
    403,
  );
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://backend.invalid/api/v1/auth/me");
    assert.equal(options.headers.get("Authorization"), "Bearer opaque");
    assert.equal(options.headers.has("Cookie"), false);
    return Response.json({
      code: 200,
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        fullName: "User",
        role: "STUDENT",
        passwordHash: "must-be-stripped",
        token: "must-be-stripped",
      },
    });
  });
  const response = await route.GET(
    new NextRequest("http://localhost:3092/api/mavis/session", {
      headers: { cookie: "mavis_session=opaque; unrelated=private" },
    }),
    context("session"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: { id: "11111111-1111-4111-8111-111111111111", name: "User", role: "student" },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("theme bootstraps before paint with validated preferences and denied-storage fallback", () => {
  const layout = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const script = layout.match(/const appearanceBootstrap = `([^`]+)`/)[1];
  for (const [stored, systemDark, expected] of [
    ["light", true, false],
    ["dark", false, true],
    ["system", true, false],
    ["invalid", false, false],
    [null, true, false],
    ["denied", true, false],
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
    assert.equal(element.dataset.appearance, expected ? "dark" : "light");
  }
});

// Supply Next's routing context while rendering the real components on the
// server. No browser, upstream service, or sample session is needed here.
function loadRoutedComponent(relative, overrides = {}, browserGlobals = {}) {
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
    ...browserGlobals,
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

test("project navigation preserves every destination and keeps role menus intact", () => {
  const {
    projectNavigation,
    globalNavigation,
    contextualNavigation,
  } = require("../src/lib/navigation.ts");
  const expected = {
    "project-overview": "/project-overview",
    snapshots: "/snapshots",
    "analysis-history": "/analysis-history",
    graph: "/architecture",
    diagrams: "/diagrams",
    model: "/model",
    compare: "/compare",
    impact: "/impact",
    "runtime-config": "/runtime-config",
    scenarios: "/scenarios",
    sessions: "/sessions",
    explanations: "/explain",
  };
  const entries = projectNavigation.flatMap((g) => g.items);
  assert.equal(entries.length, 12);
  assert.deepEqual(Object.fromEntries(entries.map((i) => [i.id, i.href])), expected);
  assert.deepEqual(
    projectNavigation.map((g) => g.label),
    ["Project", "Architecture", "Analysis", "Runtime", "Insights"],
  );
  assert.equal(
    globalNavigation.student.flatMap((g) => g.items).find((i) => i.id === "courses").href,
    "/courses",
  );
  assert.equal(
    globalNavigation.student.flatMap((g) => g.items).find((i) => i.id === "join-course").href,
    "/courses#course-passkey",
  );
  assert.deepEqual(
    globalNavigation.admin
      .flatMap((g) => g.items)
      .map((i) => ({ id: i.id, href: i.href })),
    [
      { id: "health", href: "/administration/health" },
      { id: "users", href: "/administration/users" },
      { id: "profiles", href: "/administration/profiles" },
      { id: "audit", href: "/administration/audit" },
    ],
  );
  assert.equal(contextualNavigation("admin", "project").length, 0);
  assert.equal(
    globalNavigation.admin.flatMap((g) => g.items).some((i) => i.href === "/administration/studio"),
    false,
  );
  for (const role of ["student", "lecturer"])
    assert.ok(
      globalNavigation[role]
        .flatMap((g) => g.items)
        .some((i) => i.id === "studio" && i.href === "/studio"),
    );
});

test("lecturer workspace navigation exposes unified class command destinations without adding them to student navigation", () => {
  const {
    lecturerWorkspaceNavigation,
    globalNavigation,
    contextualNavigation,
  } = require("../src/lib/navigation.ts");
  const destinations = lecturerWorkspaceNavigation.flatMap((group) => group.items);
  assert.deepEqual(Object.fromEntries(destinations.map((item) => [item.id, item.href])), {
    "workspace-overview": "/workspace-overview",
    "course-authoring": "/workspace-overview?view=course-authoring",
    assignments: "/assignments",
    "lab-authoring": "/lab-authoring",
    "assignment-submissions": "/submissions",
    members: "/members",
  });
  assert.deepEqual(contextualNavigation("lecturer", "project"), lecturerWorkspaceNavigation);
  assert.ok(
    globalNavigation.lecturer
      .flatMap((group) => group.items)
      .some((item) => item.id === "workspaces" && item.href === "/workspaces"),
  );
  assert.ok(
    globalNavigation.lecturer
      .flatMap((group) => group.items)
      .some((item) => item.id === "studio" && item.href === "/studio"),
  );
  assert.equal(
    globalNavigation.student
      .flatMap((group) => group.items)
      .some((item) =>
        ["members", "assignments", "lab-authoring", "course-setup"].includes(item.id),
      ),
    false,
  );
});

test("student contextual navigation never exposes legacy 12-item projectNavigation", () => {
  const { contextualNavigation, studentWorkspaceNavigation } = require("../src/lib/navigation.ts");
  for (const scope of ["project", "workspace"]) {
    const groups = contextualNavigation("student", scope);
    assert.deepEqual(groups, studentWorkspaceNavigation);
    const items = groups.flatMap((g) => g.items);
    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((i) => i.href),
      ["/courses", "/roadmap", "/submissions"],
    );
    assert.equal(
      items.some((i) =>
        ["diagrams", "model", "impact", "runtime-config", "sessions", "scenarios"].includes(i.id),
      ),
      false,
    );
  }
});

test("status presentation uses sentence case while retaining data, styling and localized wording", () => {
  const { formatStatusLabel, translatedStatusLabel } = require("../src/lib/status-label.ts");
  for (const [raw, expected] of [
    ["ready", "Ready"],
    ["NOT CHECKED", "Not checked"],
    ["Not Checked", "Not checked"],
    ["not checked", "Not checked"],
    ["COMPLETED", "Completed"],
    ["Sẵn sàng", "Sẵn sàng"],
    ["hoàn tất", "Hoàn tất"],
    ["READY_FOR_DISPATCH", "Ready_for_dispatch"],
    ["ResolvedSymbol", "ResolvedSymbol"],
    ["  running! ", "  Running! "],
    ["200", "200"],
    ["", ""],
  ])
    assert.equal(formatStatusLabel(raw), expected);
  const { translateText } = require("../src/lib/i18n/locale-context.tsx");
  assert.equal(
    translatedStatusLabel("COMPLETED", (v) => translateText(v, "vi")),
    "Hoàn tất",
  );
  assert.equal(
    translatedStatusLabel("ready", (v) => translateText(v, "vi")),
    "Sẵn sàng",
  );
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { StatusBadge } = require("../src/components/shared/data.tsx");
  const html = renderToStaticMarkup(
    React.createElement(StatusBadge, { status: "completed", variant: "success" }),
  );
  assert.ok(html.includes("Completed"));
  assert.ok(html.includes("bg-success-subtle"));
  assert.ok(
    renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "SWP391", preserveCase: true }),
    ).includes("SWP391"),
  );
  const rows = [{ status: "ready" }, { status: "failed" }];
  rows.forEach((r) => formatStatusLabel(r.status));
  assert.deepEqual(
    rows.filter((r) => r.status === "ready"),
    [{ status: "ready" }],
  );
});

test("project groups persist independently, restore active routes and tolerate denied storage", () => {
  const React = require("react"),
    stored = new Map();
  let state,
    cursor = 0,
    effects = [],
    active = "graph",
    activeGroup = "Architecture",
    role = "student",
    blocked = false;
  const react = {
    ...React,
    useState: (initial) => {
      state ??= initial;
      return [
        state,
        (next) => {
          state = typeof next === "function" ? next(state) : next;
        },
      ];
    },
    useEffect: (fn) => effects.push(fn),
  };
  const { useProjectNavigation } = loadRoutedComponent(
    "src/hooks/use-project-navigation.ts",
    { react },
    {
      localStorage: {
        getItem: (key) => {
          if (blocked) throw Error("denied");
          return stored.get(key) ?? null;
        },
        setItem: (key, value) => {
          if (blocked) throw Error("denied");
          stored.set(key, value);
        },
      },
    },
  );
  const render = () => {
    effects = [];
    return useProjectNavigation(role, active, activeGroup, true);
  };
  let nav = render();
  assert.equal(nav.groups.Architecture, true);
  nav.toggle("Runtime", true);
  nav = render();
  assert.equal(nav.groups.Runtime, true);
  assert.equal(nav.groups.Architecture, true);
  nav.toggle("Runtime", false);
  nav = render();
  assert.equal(nav.groups.Runtime, false);
  assert.equal(nav.groups.Architecture, true);
  stored.set(
    "mavis.project-sidebar.groups.student",
    JSON.stringify({ Analysis: false, Runtime: true }),
  );
  active = "compare";
  activeGroup = "Analysis";
  nav = render();
  assert.equal(nav.groups.Analysis, true);
  effects.forEach((fn) => fn());
  nav = render();
  assert.equal(nav.groups.Runtime, true);
  assert.equal(nav.groups.Analysis, true);
  role = "lecturer";
  nav = render();
  assert.equal(nav.groups.Runtime, undefined);
  effects.forEach((fn) => fn());
  nav = render();
  assert.equal(nav.groups.Analysis, true);
  blocked = true;
  effects = [];
  render();
  effects.forEach((fn) => fn());
  assert.doesNotThrow(() => render().toggle("Runtime", true));
});

test("lecturer sidebar expands the selected class and marks its class destination current", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const workspace = {
    id: "class-1",
    code: "SE180711",
    name: "FA",
    status: "ACTIVE",
    myRole: "LECTURER",
    members: [],
  };
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiQuery: (op) => ({
      data: op === "workspaces" ? [workspace] : [],
      isSuccess: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch() {},
    }),
    useSession: () => ({ data: { user: { id: "teacher-1", name: "Lecturer", role: "lecturer" } } }),
    useSelection: () => ({ projectId: "", workspaceId: "class-1" }),
    useApiMutation: () => ({ isPending: false }),
  };
  const { AppShell } = loadRoutedComponent("src/components/app-shell.tsx", {
    "@/hooks/use-api": hooks,
    "next/navigation": {
      usePathname: () => "/assignments",
      useSearchParams: () => new URLSearchParams("workspace=class-1"),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
    },
    "@/features/auth/access": { RequireSession: ({ children }) => children },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
  });
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { role: "lecturer", scope: "workspace", activeId: "assignments" },
        "Assignments content",
      ),
    ),
  );
  assert.ok(html.includes('aria-label="Collapse SE180711 · FA menu"'));
  assert.ok(html.includes('href="/assignments?workspace=class-1"'));
  assert.ok(html.includes('aria-current="page"'));
  assert.match(
    html,
    /class="[^"]*bg-muted[^\"]*" aria-current="location" aria-label="SE180711 · FA" href="\/workspaces\?workspace=class-1"/,
  );
  assert.match(
    html,
    /class="[^"]*bg-sidebar-accent[^\"]*" aria-current="location" aria-label="Lab Library" href="\/assignments\?workspace=class-1"/,
  );
});

test("student sidebar omits lecturer-only class destinations", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const workspace = {
    id: "class-1",
    code: "SE180711",
    name: "FA",
    status: "ACTIVE",
    myRole: "STUDENT",
    members: [],
  };
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiQuery: (op) => ({
      data: op === "workspaces" ? [workspace] : [],
      isSuccess: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch() {},
    }),
    useSession: () => ({ data: { user: { id: "student-1", name: "Learner", role: "student" } } }),
    useSelection: () => ({ projectId: "", workspaceId: "class-1" }),
    useApiMutation: () => ({ isPending: false }),
  };
  const { AppShell } = loadRoutedComponent("src/components/app-shell.tsx", {
    "@/hooks/use-api": hooks,
    "next/navigation": {
      usePathname: () => "/workspaces",
      useSearchParams: () => new URLSearchParams("workspace=class-1"),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
    },
    "@/features/auth/access": { RequireSession: ({ children }) => children },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
  });
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { role: "student", scope: "workspace", activeId: "workspaces" },
        "Class list",
      ),
    ),
  );
  assert.ok(!html.includes("Workspace Members"));
  assert.ok(!html.includes("Lab Creation"));
});

test("collapsed class sidebar keeps child destinations available as labeled links", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const workspace = {
    id: "class-1",
    code: "SE180711",
    name: "FA",
    status: "ACTIVE",
    myRole: "LECTURER",
    members: [],
  };
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiQuery: (op) => ({
      data: op === "workspaces" ? [workspace] : [],
      isSuccess: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch() {},
    }),
    useSession: () => ({ data: { user: { id: "teacher-1", name: "Lecturer", role: "lecturer" } } }),
    useSelection: () => ({ projectId: "", workspaceId: "class-1" }),
    useApiMutation: () => ({ isPending: false }),
  };
  const { AppShell } = loadRoutedComponent("src/components/app-shell.tsx", {
    "@/hooks/use-api": hooks,
    "next/navigation": {
      usePathname: () => "/assignments",
      useSearchParams: () => new URLSearchParams("workspace=class-1"),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
    },
    "@/features/auth/access": { RequireSession: ({ children }) => children },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
  });
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { role: "lecturer", scope: "workspace", activeId: "assignments" },
        "Assignments content",
      ),
    ),
  );
  assert.ok(html.includes('href="/lab-authoring?workspace=class-1"'));
  assert.ok(html.includes('aria-label="Lab Creation"'));
});

test("non-live project sidebar never exposes legacy projectNavigation to lecturer or student", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiQuery: () => ({ data: [], isSuccess: true }),
    useSession: () => ({ data: { user: { name: "Lecturer", role: "lecturer" } } }),
    useSelection: () => ({ projectId: "one", workspaceId: "" }),
    useApiMutation: () => ({ isPending: false }),
  };
  const { AppShell } = loadRoutedComponent("src/components/app-shell.tsx", {
    "@/hooks/use-api": hooks,
    "@tanstack/react-query": { useQueryClient: () => ({}) },
  });
  const html = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { role: "lecturer", scope: "project", activeId: "graph", onPreviewNavigate() {} },
        "Project content",
      ),
    ),
  );
  assert.ok(!html.includes("Architecture Diagrams"));
  assert.ok(!html.includes("Change Impact Analysis"));
  assert.ok(!html.includes("Runtime Configuration"));
  assert.ok(html.includes("Workspaces"));
  assert.ok(html.includes("Project content"));
  assert.ok(html.includes("MAVIS home"));
  assert.ok(html.includes("Workspaces"));

  const studentHtml = renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        AppShell,
        { role: "student", scope: "project", activeId: "courses", onPreviewNavigate() {} },
        "Student content",
      ),
    ),
  );
  assert.ok(studentHtml.includes("Lab Roadmap &amp; Course"));
  assert.ok(!studentHtml.includes("Architecture Graph Explorer"));
  assert.ok(!studentHtml.includes("Architecture Model Editor"));
});

test("inspector sections expose accessible controls and preserve hidden content", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { InspectorSection } = require("../src/features/architecture/inspector-section.tsx");
  for (const open of [true, false]) {
    const html = renderToStaticMarkup(
      React.createElement(
        InspectorSection,
        { title: "Source snippets", open, onOpenChange() {} },
        React.createElement("p", null, "Saved source remains mounted"),
      ),
    );
    assert.ok(html.includes(`aria-expanded="${open}"`));
    assert.ok(html.includes("aria-controls="));
    assert.ok(html.includes('type="button"'));
    assert.ok(html.includes("min-h-11"));
    assert.ok(html.includes("Saved source remains mounted"));
    if (!open) assert.ok(html.includes('hidden=""'));
    assert.ok(html.includes("motion-reduce:transition-none"));
  }
});

test("inspector sections retain tab state, reset for selections and preserve evidence drill-down", () => {
  const React = require("react"),
    nodes = (node) =>
      !node || typeof node !== "object"
        ? []
        : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
  let cursor = 0;
  const states = [],
    selected = [];
  const react = {
    ...React,
    useState: (initial) => {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [
        states[i],
        (next) => {
          states[i] = typeof next === "function" ? next(states[i]) : next;
        },
      ];
    },
    useMemo: (fn) => fn(),
    useEffect() {},
  };
  const element = (id, type) => ({
    id,
    name: id,
    elementType: type,
    evidence: [],
    properties: {},
    description: "Recorded element",
  });
  const model = {
    id: "model",
    projectId: "project",
    snapshotId: "snapshot",
    revision: 1,
    label: "Fixture",
    elements: [
      element("orders", "SERVICE_CONTAINER"),
      element("payments", "SERVICE_CONTAINER"),
      element("db", "DATABASE"),
      element("component", "COMPONENT"),
    ],
    edges: [
      {
        id: "call-1",
        from: "orders",
        to: "payments",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        evidence: [],
        uncertain: false,
      },
      {
        id: "call-2",
        from: "orders",
        to: "payments",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        evidence: [],
        uncertain: false,
      },
    ],
  };
  const finding = {
    id: "finding-1",
    elementId: "orders",
    ruleId: "RECORDED_RULE",
    message: "Recorded finding only",
    details: { supportingEvidenceIds: [] },
  };
  const { SelectionThreeE } = loadRoutedComponent(
    "src/features/architecture/selection-three-e.tsx",
    {
      react,
      "@/lib/i18n/locale-context": { useLocale: () => ({ locale: "en", t: (s) => s }) },
      "@tanstack/react-query": {
        useMutation: () => ({ data: undefined, reset() {}, mutate() {} }),
      },
      "@/hooks/use-api": {
        useApi: () => ({ mode: "backend" }),
        useApiQuery: (op) => ({
          data:
            op === "evaluationFindings"
              ? [finding]
              : op === "evaluations"
                ? [{ id: "run", result: { createdAt: "2026-01-01" } }]
                : [],
          isFetching: false,
          error: null,
          refetch() {},
        }),
      },
    },
  );
  let props = { model, selectedId: "orders", onSelect: (id) => selected.push(id), onClose() {} };
  const render = () => {
    cursor = 0;
    return nodes(SelectionThreeE(props));
  };
  const section = (title) => render().find((n) => n.props?.title === title);
  assert.equal(section("Meaning of this service").props.open, true);
  assert.equal(section("Evidence overview").props.open, true);
  assert.equal(section("Assessment summary").props.open, true);
  assert.equal(section("Source snippets").props.open, true);
  section("Meaning of this service").props.onOpenChange(false);
  section("Source snippets").props.onOpenChange(false);
  render()
    .find((n) => n.props?.value === "explain" && n.props.onValueChange)
    .props.onValueChange("evidence");
  assert.equal(section("Source snippets").props.open, false);
  assert.equal(section("Meaning of this service").props.open, false);
  assert.equal(section("Assessment summary").props.open, true);
  assert.ok(section("Findings"));
  assert.ok(section("RECORDED_RULE"));
  for (const [id, title] of [
    ["db", "Meaning of this data store"],
    ["component", "Meaning of this component"],
    ["payments", "Meaning of this service"],
    ["call-1", "Meaning of this relationship"],
  ]) {
    props = { ...props, selectedId: id };
    assert.equal(section(title).props.open, true);
    assert.equal(section("Source snippets").props.open, true);
  }
  let drilled;
  props = {
    ...props,
    selectedId: "aggregate",
    projectedEdge: {
      ...model.edges[0],
      id: "aggregate",
      underlyingEdgeIds: ["call-1", "call-2"],
      evidenceCount: 0,
    },
    onDrilldown: (id) => {
      drilled = id;
    },
  };
  assert.equal(section("Evidence details").props.open, true);
  render()
    .find((n) => n.props?.children === "Details" && typeof n.props.onClick === "function")
    .props.onClick();
  assert.equal(drilled, "call-1");
  const related = section("Related dependencies");
  assert.ok(related);
  assert.equal(related.props.open, false);
});

test("login background is decorative, throttles pointers and releases observers and frames", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const listeners = new Map(),
    frames = new Map(),
    mediaListeners = new Set(),
    properties = new Map();
  let effect,
    serial = 0,
    reduced = false;
  const eventTarget = () => ({
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => {
      if (listeners.get(name) === fn) listeners.delete(name);
    },
  });
  const motion = {
    get matches() {
      return reduced;
    },
    addEventListener: (_, fn) => mediaListeners.add(fn),
    removeEventListener: (_, fn) => mediaListeners.delete(fn),
  };
  const fine = {
    matches: true,
    addEventListener: (_, fn) => mediaListeners.add(fn),
    removeEventListener: (_, fn) => mediaListeners.delete(fn),
  };
  const rootElement = {
    style: { setProperty: (name, value) => properties.set(name, value) },
    dataset: {},
  };
  const document = { hidden: false, ...eventTarget(), documentElement: eventTarget() };
  const window = {
    ...eventTarget(),
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: (q) => (q.includes("reduced") ? motion : fine),
  };
  const react = {
    ...React,
    useRef: () => ({ current: rootElement }),
    useId: () => "login-gradient",
    useEffect: (fn) => {
      effect = fn;
    },
  };
  const { LoginBackground } = loadRoutedComponent(
    "src/features/auth/login-background.tsx",
    { react },
    {
      window,
      document,
      requestAnimationFrame: (fn) => {
        frames.set(++serial, fn);
        return serial;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
    },
  );
  const html = renderToStaticMarkup(React.createElement(LoginBackground));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(html.includes("pointer-events-none"));
  assert.ok(!html.includes("NaN"));
  const cleanup = effect();
  const move = listeners.get("pointermove");
  move({ clientX: 900, clientY: 700 });
  move({ clientX: 800, clientY: 600 });
  assert.equal(frames.size, 1, "at most one pending pointer frame");
  for (const fn of frames.values()) fn();
  frames.clear();
  assert.notEqual(properties.get("--pointer-x"), "0px");
  reduced = true;
  for (const fn of mediaListeners) fn();
  move({ clientX: 500, clientY: 300 });
  assert.equal(frames.size, 0);
  assert.equal(properties.get("--pointer-x"), "0px");
  reduced = false;
  document.hidden = true;
  listeners.get("visibilitychange")();
  assert.equal(rootElement.dataset.paused, "true");
  document.hidden = false;
  move({ clientX: 900, clientY: 700 });
  assert.equal(frames.size, 1);
  cleanup();
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(mediaListeners.size, 0);
});

test("all auth flows reuse one login background while retaining their forms and navigation", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const { LoginBackground } = loadRoutedComponent("src/features/auth/login-background.tsx");
  const { AuthFlow } = loadRoutedComponent("src/features/auth/auth-flow.tsx", {
    "./login-background": { LoginBackground },
    "@/hooks/use-api": { useApiMutation: () => ({ isPending: false, isError: false }) },
  });
  for (const [flow, action] of [
    ["register", "Create account"],
    ["forgot-password", "Send reset code"],
    ["verify", "Send verification code"],
    ["reset-password", "Reset password"],
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(ThemeProvider, null, React.createElement(AuthFlow, { flow })),
    );
    assert.equal((html.match(/mavis-auth-background/g) || []).length, 1, flow);
    assert.ok(html.includes("relative isolate min-h-svh"));
    assert.ok(html.includes("pointer-events-none fixed inset-0"));
    assert.equal(html.includes('type="email"'), flow !== "reset-password");
    assert.ok(html.includes(action));
    assert.ok(html.includes('href="/login"'));
    assert.equal(html.includes("Verification code"), flow === "reset-password");
    assert.equal(html.includes("Resend verification code"), false);
    assert.equal(html.includes('autoComplete="new-password"'), flow === "register");
  }
});

test("session gate redirects only confirmed unauthenticated sessions and retains full route context", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  let effects = [],
    redirects = [],
    state = { isPending: false, isError: false, data: { user: null } };
  const hooks = { useSession: () => state, useApi: () => ({ mode: "backend" }) };
  const { RequireSession } = loadRoutedComponent(
    "src/features/auth/access.tsx",
    {
      react: { ...React, useEffect: (fn) => effects.push(fn) },
      "@/hooks/use-api": hooks,
      "next/navigation": {
        usePathname: () => "/architecture",
        useSearchParams: () => new URLSearchParams("project=one&model=two&origin=STATIC"),
        useRouter: () => ({ replace: (path) => redirects.push(path) }),
      },
    },
    { window: { location: { hash: "#selected" } } },
  );
  function render() {
    effects = [];
    const html = renderToStaticMarkup(
      React.createElement(
        RequireSession,
        null,
        React.createElement("p", null, "protected content"),
      ),
    );
    effects.forEach((fn) => fn());
    return html;
  }
  let html = render();
  assert.ok(!html.includes("Sign in required"));
  assert.ok(!html.includes("protected content"));
  assert.equal(redirects.length, 1);
  assert.equal(
    new URL(redirects[0], "http://localhost").searchParams.get("next"),
    "/architecture?project=one&model=two&origin=STATIC#selected",
  );
  redirects = [];
  state = { isPending: false, isError: true, error: new Error("offline"), refetch() {} };
  render();
  assert.equal(redirects.length, 0);
  state = { isPending: true, isError: false };
  render();
  assert.equal(redirects.length, 0);
  state = { isPending: false, isError: false, data: { user: { role: "student" } } };
  html = render();
  assert.ok(html.includes("protected content"));
  assert.equal(redirects.length, 0);
  const { RequireSession: Blocked } = loadRoutedComponent("src/features/auth/access.tsx", {
    react: { ...React, useEffect: (fn) => effects.push(fn) },
    "@/hooks/use-api": hooks,
  });
  html = renderToStaticMarkup(
    React.createElement(Blocked, { permission: "admin:manage" }, "private"),
  );
  assert.ok(html.includes("Access unavailable"));
  assert.ok(!html.includes("private"));
});

test("OTP presentation reuses six numeric slots and requires explicit submission", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { VerificationCodeInput } = loadRoutedComponent(
    "src/features/auth/verification-code-input.tsx",
  );
  const { isCompleteVerificationCode } = require("../src/lib/auth/verification-code.ts");
  const html = renderToStaticMarkup(
    React.createElement(VerificationCodeInput, { value: "012345", onChange() {}, disabled: false }),
  );
  assert.ok(html.includes('inputMode="numeric"'));
  assert.ok(html.includes('autoComplete="one-time-code"'));
  assert.ok(html.includes('maxLength="6"'));
  assert.ok(html.includes('minLength="6"'));
  assert.ok(html.includes("aria-describedby="));
  assert.equal(isCompleteVerificationCode("012345"), true);
  for (const code of ["12345", "1234567", "12345a"])
    assert.equal(isCompleteVerificationCode(code), false);
});

test("authentication messages preserve Vietnamese translations", () => {
  const { EXACT_VI_DICTIONARY } = require("../src/lib/i18n/locale-context.tsx");
  const { publicErrors } = require("../src/lib/errors/api-error.ts");
  for (const [code, message] of Object.entries(publicErrors).filter(
    ([code]) => code.startsWith("AUTH_") || code.startsWith("LOGIN_"),
  )) {
    assert.ok(EXACT_VI_DICTIONARY[message], code);
    assert.notEqual(EXACT_VI_DICTIONARY[message], message);
  }
});

test("auth forms display approved backend errors accessibly without raw exception text", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ThemeProvider } = require("../src/components/theme-provider.tsx");
  const { ApiError, publicErrors } = require("../src/lib/errors/api-error.ts");
  for (const [flow, op, code] of [
    ["verify", "verifyEmail", "AUTH_CODE_EXPIRED"],
    ["reset-password", "resetPassword", "AUTH_RESET_USED"],
    ["forgot-password", "forgotPassword", "AUTH_SERVER"],
  ]) {
    const { AuthFlow } = loadRoutedComponent("src/features/auth/auth-flow.tsx", {
      "@/hooks/use-api": {
        useApiMutation: (name) => ({
          isPending: false,
          isError: name === op,
          error: name === op ? new ApiError("invalid", 400, code) : null,
        }),
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ThemeProvider, null, React.createElement(AuthFlow, { flow })),
    );
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes(publicErrors[code]));
    assert.ok(!html.includes("stack trace"));
  }
});

test("auth form prevents incomplete OTPs and duplicate submissions while preserving separate purposes", async () => {
  const React = require("react");
  const allNodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...React.Children.toArray(node.props?.children).flatMap(allNodes)];
  function harness(flow, initial = {}, reject) {
    let cursor = 0,
      refCursor = 0;
    const states = [],
      refs = [],
      calls = [],
      routes = [];
    let release;
    Object.assign(states, initial);
    const react = {
      ...React,
      useState: (start) => {
        const i = cursor++;
        if (!(i in states)) states[i] = typeof start === "function" ? start() : start;
        return [
          states[i],
          (v) => {
            states[i] = typeof v === "function" ? v(states[i]) : v;
          },
        ];
      },
      useRef: (start) => {
        const i = refCursor++;
        return (refs[i] ??= { current: start });
      },
      useEffect() {},
    };
    const { AuthFlow } = loadRoutedComponent("src/features/auth/auth-flow.tsx", {
      react,
      "@/lib/i18n/locale-context": { useLocale: () => ({ t: (v) => v }) },
      "next/navigation": {
        useSearchParams: () => new URLSearchParams("email=fixture%40example.org"),
        useRouter: () => ({ push: (r) => routes.push(r), replace: (r) => routes.push(r) }),
      },
      "@/hooks/use-api": {
        useApiMutation: (op) => ({
          isPending: false,
          isError: false,
          mutateAsync: (input) => {
            calls.push([op, input]);
            return new Promise((resolve, rejectFn) => {
              release = () => (reject ? rejectFn(reject) : resolve({ ok: true }));
            });
          },
        }),
      },
    });
    const render = () => {
      cursor = 0;
      refCursor = 0;
      return allNodes(AuthFlow({ flow }));
    };
    const submit = () =>
      render()
        .find((n) => n.type === "form")
        .props.onSubmit({ preventDefault() {} });
    return { states, calls, routes, submit, render, release: () => release() };
  }
  const incomplete = harness("verify", { 4: "12345" });
  incomplete.submit();
  assert.equal(incomplete.calls.length, 0);
  assert.equal(incomplete.states[6], "Enter exactly six digits.");
  const entry = harness("verify", { 8: "" });
  assert.equal(
    entry.render().some((n) => n.props?.onChange && n.props?.autoFocus),
    false,
  );
  entry.submit();
  assert.equal(entry.calls[0][0], "resendOtp");
  assert.equal(entry.calls[0][1].email, "fixture@example.org");
  entry.release();
  await new Promise(setImmediate);
  assert.equal(entry.states[8], "fixture@example.org");
  assert.ok(entry.render().some((n) => n.props?.onChange && n.props?.autoFocus));
  assert.equal(
    entry.render().some((n) => n.props?.type === "email"),
    false,
  );
  assert.equal(entry.states[0], "fixture@example.org");
  const verify = harness("verify", { 4: "012345" });
  verify.submit();
  verify.submit();
  assert.equal(verify.calls.length, 1);
  assert.equal(verify.calls[0][0], "verifyEmail");
  assert.equal(verify.calls[0][1].email, "fixture@example.org");
  assert.equal(verify.calls[0][1].otpCode, "012345");
  verify.release();
  await new Promise(setImmediate);
  assert.deepEqual(verify.routes, ["/login?verified=1"]);
  const resetEntry = harness("reset-password");
  assert.equal(
    resetEntry.render().some((n) => n.props?.type === "email"),
    false,
  );
  assert.equal(resetEntry.render().filter((n) => n.props?.type === "password").length, 0);
  resetEntry
    .render()
    .find((n) => n.props?.onChange && n.props?.autoFocus)
    .props.onChange("12345");
  assert.equal(resetEntry.render().filter((n) => n.props?.type === "password").length, 0);
  resetEntry
    .render()
    .find((n) => n.props?.onChange && n.props?.autoFocus)
    .props.onChange("012345");
  assert.equal(resetEntry.render().filter((n) => n.props?.type === "password").length, 2);
  resetEntry.states[2] = "password";
  resetEntry.states[3] = "password";
  resetEntry
    .render()
    .find((n) => n.props?.onChange && n.props?.autoFocus)
    .props.onChange("01234");
  assert.equal(resetEntry.render().filter((n) => n.props?.type === "password").length, 0);
  assert.equal(resetEntry.states[2], "");
  assert.equal(resetEntry.states[3], "");
  const reset = harness("reset-password", {
    2: "valid-password",
    3: "valid-password",
    4: "012345",
  });
  reset.submit();
  assert.equal(reset.calls[0][0], "resetPassword");
  reset.release();
  await new Promise(setImmediate);
  assert.deepEqual(reset.routes, ["/login?reset=1"]);
  const { ApiError } = require("../src/lib/errors/api-error.ts");
  const expired = harness(
    "reset-password",
    { 2: "valid-password", 3: "valid-password", 4: "012345" },
    new ApiError("invalid", 400, "AUTH_RESET_EXPIRED"),
  );
  expired.submit();
  expired.release();
  await new Promise(setImmediate);
  assert.equal(expired.states[4], "");
  assert.equal(expired.states[2], "valid-password");
  assert.equal(expired.routes.length, 0);
  const forgot = harness("forgot-password");
  forgot.submit();
  forgot.release();
  await new Promise(setImmediate);
  assert.deepEqual(forgot.routes, ["/auth/reset-password?email=fixture%40example.org"]);
  for (const flow of ["verify", "reset-password"]) {
    const h = harness(flow);
    const action = h
      .render()
      .find((n) => n.props?.variant === "link" && typeof n.props.onClick === "function");
    action.props.onClick();
    action.props.onClick();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], flow === "verify" ? "resendOtp" : "forgotPassword");
    h.release();
    await new Promise(setImmediate);
    assert.equal(h.states[7], 30);
    assert.equal(
      h.render().find((n) => n.props?.variant === "link" && typeof n.props.onClick === "function")
        .props.disabled,
      true,
    );
  }
});

test("profile renders real account data, compact statistics and a modal password action", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiMutation: () => ({ isPending: false, error: null }),
    useApiQuery: (op) => ({
      data: op === "projectOverviews" ? [{ services: 2 }, { services: null }] : [{}],
      isPending: false,
      isError: false,
    }),
  };
  const { ProfileDetails } = loadRoutedComponent("src/features/profile/profile.tsx", {
    "@/hooks/use-api": hooks,
  });
  const user = {
    id: "user",
    name: "A long actual name ".repeat(10),
    email: "a.long.actual.email.address@example.org",
    role: "lecturer",
  };
  const html = renderToStaticMarkup(React.createElement(ProfileDetails, { user }));
  for (const text of [user.email, "Lecturer", "Full Name", "Email", "Role", "Change Password"])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes("overflow-wrap:anywhere"));
  assert.equal((html.match(/<form/g) || []).length, 1);
  assert.ok(
    !html.includes('id="current-password"'),
    "password fields remain unmounted until the modal opens",
  );
  assert.equal((html.match(/type="password"/g) || []).length, 0);
  assert.ok(html.includes("2+"));
  assert.ok(html.includes("Account statistics"));
  for (const removed of [
    "Appearance preferences",
    "Role permissions &amp; quick access",
    "Recent projects",
    "Diagram palette",
    "active session",
  ])
    assert.ok(!html.includes(removed), removed);
  assert.equal((html.match(/type="email"/g) || []).length, 0, "email remains read-only");
  assert.ok(
    renderToStaticMarkup(
      React.createElement(ProfileDetails, { user: { ...user, email: null } }),
    ).includes("Email not available"),
  );
});

test("profile statistics distinguish loading, unavailable, partial and real empty data", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  let query = { isPending: false, isError: false, data: [{ services: null }] };
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiMutation: () => ({ isPending: false, error: null }),
    useApiQuery: () => query,
  };
  const { ProfileDetails } = loadRoutedComponent("src/features/profile/profile.tsx", {
    "@/hooks/use-api": hooks,
  });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ProfileDetails, {
        user: { id: "fixture", name: "Real User", role: "student", email: null },
      }),
    );
  const services = (html) => /Services indexed<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(html)?.[1];
  assert.equal(services(render()), "Not available");
  query = { isPending: false, isError: false, data: [] };
  assert.equal(services(render()), "0");
  query = { isPending: true, isError: false, data: undefined };
  assert.equal(services(render()), "Loading…");
  query = { isPending: false, isError: true, data: undefined };
  const failed = render();
  assert.equal(services(failed), "Unavailable");
  assert.ok(failed.includes("Some account statistics could not be loaded."));
  assert.ok(failed.includes("Retry"));
});

test("profile name editing uses the existing payload, prevents duplicates and retains input after errors", async () => {
  const React = require("react");
  let cursor = 0,
    calls = [],
    release,
    fail = false;
  const slots = [];
  const react = {
    ...React,
    useState: (initial) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === "function" ? next(slots[i]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
  };
  const mutation = {
    isPending: false,
    error: null,
    reset() {},
    mutateAsync: (input) => {
      calls.push(input);
      if (fail) return Promise.reject(Error("temporary failure"));
      return new Promise((resolve) => (release = resolve));
    },
  };
  const { ProfileDetails } = loadRoutedComponent("src/features/profile/profile.tsx", {
    react,
    "@/hooks/use-api": { useApi: () => ({ mode: "backend" }), useApiMutation: () => mutation },
    "@/lib/i18n/locale-context": { useLocale: () => ({ t: (s) => s }) },
  });
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
  const render = () => {
    cursor = 0;
    return nodes(
      ProfileDetails({
        user: { id: "user", name: "Saved Name", email: "actual@example.org", role: "student" },
      }),
    );
  };
  const input = () => render().find((n) => n.props?.id === "profile-full-name");
  const submit = () =>
    render()
      .find((n) => n.type === "form")
      .props.onSubmit({ preventDefault() {} });
  input().props.onChange({ target: { value: "  " } });
  await submit();
  assert.equal(calls.length, 0);
  assert.equal(input().props["aria-invalid"], true);
  input().props.onChange({ target: { value: "  Updated Name  " } });
  const pending = submit();
  await submit();
  assert.equal(calls.length, 1);
  assert.equal(
    JSON.stringify(calls[0]),
    JSON.stringify({ fullName: "Updated Name", avatarUrl: null, preferredLocale: "en" }),
  );
  release({ user: { name: "Updated Name" } });
  await pending;
  assert.equal(input().props.value, "Updated Name");
  fail = true;
  input().props.onChange({ target: { value: "Correctable Name" } });
  await submit();
  assert.equal(input().props.value, "Correctable Name");
  render()
    .find((n) => n.props?.children === "Reset")
    .props.onClick();
  assert.equal(input().props.value, "Saved Name");
  const changePassword = render().find(
    (n) =>
      typeof n.props?.onClick === "function" &&
      React.Children.toArray(n.props?.children).includes("Change Password"),
  );
  assert.ok(changePassword);
  changePassword.props.onClick();
  const security = render().find((n) => n.props?.fullName === "Saved Name");
  assert.ok(security, "password payload uses the stored name rather than an unsaved edit");
  security.props.onBusyChange(true);
  input().props.onChange({ target: { value: "Another Name" } });
  const before = calls.length;
  await submit();
  assert.equal(calls.length, before);
});

test("profile route reuses shared shell and profile feature without appearance or permission panels", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiMutation: () => ({ isPending: false, error: null }),
    useApiQuery: () => ({ data: [], isPending: false, isError: false }),
    useSession: () => ({
      data: {
        user: { id: "user", name: "Actual Name", email: "actual@example.org", role: "student" },
      },
      isPending: false,
      error: null,
    }),
  };
  const feature = loadRoutedComponent("src/features/profile/profile.tsx", {
    "@/hooks/use-api": hooks,
  });
  const page = loadRoutedComponent("app/profile/page.tsx", {
    "@/components/app-shell": {
      AppShell: ({ children }) => React.createElement("main", null, children),
    },
    "@/features/profile/profile": feature,
  }).default;
  const html = renderToStaticMarkup(React.createElement(page));
  for (const text of [
    "My Profile",
    "Actual Name",
    "actual@example.org",
    "Personal Information",
    "Change Password",
  ])
    assert.ok(html.includes(text), text);
  for (const text of ["Account Security", "Confirm New Password"])
    assert.ok(!html.includes(text), text);
  for (const text of [
    "Appearance preferences",
    "Role permissions",
    "Recent projects",
    "Diagram palette",
    "project:read",
    "workspace:read",
    "active session",
  ])
    assert.ok(!html.includes(text), text);
  assert.ok(
    html.indexOf('aria-label="Profile summary"') <
      html.indexOf('aria-labelledby="profile-information"'),
  );
  const shell = fs.readFileSync(path.join(root, "src/components/app-shell.tsx"), "utf8");
  assert.ok(shell.includes("<AppearanceSelector"));
  assert.ok(shell.includes("<RequireSession"));
});

test("profile labels and password visibility controls use existing Vietnamese localization", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { translateText } = require("../src/lib/i18n/locale-context.tsx");
  const hooks = {
    useApi: () => ({ mode: "backend" }),
    useApiMutation: () => ({ isPending: false, error: null }),
    useApiQuery: () => ({ data: [], isPending: false, isError: false }),
  };
  const { ProfileDetails } = loadRoutedComponent("src/features/profile/profile.tsx", {
    "@/hooks/use-api": hooks,
    "@/lib/i18n/locale-context": { useLocale: () => ({ t: (s) => translateText(s, "vi") }) },
  });
  const html = renderToStaticMarkup(
    React.createElement(ProfileDetails, {
      user: { id: "user", name: "Nguyễn Văn An", email: "actual@example.org", role: "student" },
    }),
  );
  for (const text of ["Nguyễn Văn An", "actual@example.org", "Thông tin cá nhân", "Đổi mật khẩu"])
    assert.ok(html.includes(text), text);
  for (const text of ["Bảo mật tài khoản", "Mật khẩu hiện tại", "Xác nhận mật khẩu mới"])
    assert.ok(!html.includes(text), text);
  assert.ok(!html.includes("Appearance preferences"));
});

test("password form validates, blocks duplicate submissions, preserves errors, clears on success and cancels without mutation", async () => {
  const React = require("react");
  let cursor = 0,
    calls = 0,
    successes = 0,
    cancelled = 0,
    resolveRequest;
  const slots = [],
    busy = [];
  const mutation = {
    isPending: false,
    error: null,
    reset() {
      this.error = null;
    },
    async mutateAsync(input) {
      calls++;
      mutation.lastInput = input;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  };
  const react = {
    ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === "function" ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initial });
    },
  };
  const { ChangePasswordForm } = loadRoutedComponent("src/features/profile/profile.tsx", {
    react,
    "@/hooks/use-api": { useApiMutation: () => mutation },
    "@/lib/i18n/locale-context": { useLocale: () => ({ t: (s) => s }) },
  });
  const render = () => {
    cursor = 0;
    return ChangePasswordForm({
      fullName: "Real Name",
      onBusyChange: (value) => busy.push(value),
      onCancel: () => cancelled++,
      onSuccess: () => successes++,
    });
  };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== "object") return;
    if (predicate(tree)) return tree;
    for (const child of React.Children.toArray(tree.props?.children)) {
      const result = find(child, predicate);
      if (result) return result;
    }
  };
  const field = (id) => find(render(), (e) => e.props?.id === id);
  const submit = () => render().props.onSubmit({ preventDefault() {} });
  const currentField = field("current-password"),
    nextField = field("new-password");
  cursor = 10;
  let fieldTree = currentField.type(currentField.props);
  assert.equal(find(fieldTree, (e) => e.props?.id === "current-password").props.type, "password");
  find(fieldTree, (e) => e.props?.["aria-label"] === "Show current password").props.onClick();
  cursor = 10;
  fieldTree = currentField.type(currentField.props);
  assert.equal(find(fieldTree, (e) => e.props?.id === "current-password").props.type, "text");
  cursor = 11;
  const otherField = nextField.type(nextField.props);
  assert.equal(find(otherField, (e) => e.props?.id === "new-password").props.type, "password");
  mutation.isPending = true;
  assert.equal(find(render(), (e) => e.type === "fieldset").props.disabled, true);
  mutation.isPending = false;
  await submit();
  assert.equal(calls, 0);
  assert.match(field("current-password").props.error, /required/);
  assert.match(field("new-password").props.error, /required/);
  field("current-password").props.onChange("old-password");
  field("new-password").props.onChange("short");
  await submit();
  assert.equal(calls, 0);
  assert.match(field("new-password").props.error, /6–100/);
  field("new-password").props.onChange("valid-new-password");
  await submit();
  assert.equal(calls, 0);
  assert.match(field("confirm-new-password").props.error, /required/);
  field("confirm-new-password").props.onChange("different-password");
  await submit();
  assert.equal(calls, 0);
  assert.match(field("confirm-new-password").props.error, /do not match/);
  field("confirm-new-password").props.onChange("valid-new-password");
  const request = submit();
  await submit();
  assert.equal(calls, 1, "same-tick double submit is blocked");
  assert.equal(mutation.lastInput.fullName, "Real Name");
  assert.deepEqual(Object.keys(mutation.lastInput).sort(), [
    "currentPassword",
    "fullName",
    "newPassword",
  ]);
  resolveRequest({ user: { name: "Real Name" } });
  await request;
  assert.equal(successes, 1);
  assert.equal(field("current-password").props.value, "");
  assert.equal(field("new-password").props.value, "");
  assert.equal(field("confirm-new-password").props.value, "");
  assert.deepEqual(busy, [true, false]);
  const { ApiError } = require("../src/lib/errors/api-error.ts");
  mutation.mutateAsync = async () => {
    calls++;
    throw new ApiError("invalid", 400, "PROFILE_CURRENT_PASSWORD");
  };
  field("current-password").props.onChange("wrong-password");
  field("new-password").props.onChange("retained-new-password");
  field("confirm-new-password").props.onChange("retained-new-password");
  await submit();
  assert.match(field("current-password").props.error, /incorrect/);
  assert.equal(field("current-password").props.value, "wrong-password");
  assert.equal(field("new-password").props.value, "retained-new-password");
  assert.equal(field("confirm-new-password").props.value, "retained-new-password");
  mutation.mutateAsync = async () => {
    calls++;
    mutation.error = new ApiError("network");
    throw mutation.error;
  };
  await submit();
  assert.equal(field("current-password").props.value, "wrong-password");
  assert.equal(field("new-password").props.value, "retained-new-password");
  assert.equal(field("confirm-new-password").props.value, "retained-new-password");
  assert.ok(find(render(), (e) => e.props?.error === mutation.error));
  const before = calls;
  find(render(), (e) => e.props?.children === "Cancel").props.onClick();
  assert.equal(cancelled, 1);
  assert.equal(calls, before);
  assert.equal(field("current-password").props.value, "");
  assert.equal(field("confirm-new-password").props.value, "");
});

test("password fields render masked inputs, visibility controls and backend length limits", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ChangePasswordForm } = loadRoutedComponent("src/features/profile/profile.tsx", {
    "@/hooks/use-api": { useApiMutation: () => ({ isPending: false, error: null }) },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChangePasswordForm, {
      fullName: "Name",
      onBusyChange() {},
      onCancel() {},
      onSuccess() {},
    }),
  );
  assert.equal((html.match(/type="password"/g) || []).length, 3);
  assert.ok(html.includes("Show confirm new password"));
  assert.ok(html.includes('maxLength="100"'));
  assert.ok(html.includes("Show current password"));
  assert.ok(html.includes("Show new password"));
  assert.ok(html.includes('minLength="6"'));
});

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
      assert.equal(
        html.includes("Architecture analysis"),
        false,
        `${screen}: do not render authenticated content before session resolution`,
      );
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
  const edges = elements.slice(1).map((node, i) => ({
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
  const point = (view) => ({
    x: (anchor.x - origin.x - view.x) / view.zoom,
    y: (anchor.y - origin.y - view.y) / view.zoom,
  });
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
  const {
    DRAWIO_ORIGIN,
    DRAWIO_MAX_XML_LENGTH,
    readDrawioEvent,
  } = require("../src/features/architecture/drawio-protocol.ts");
  const frame = {};
  const message = {
    origin: DRAWIO_ORIGIN,
    source: frame,
    data: JSON.stringify({ event: "save", xml: "<mxfile/>" }),
  };
  assert.deepEqual(readDrawioEvent(message, frame), { event: "save", xml: "<mxfile/>" });
  assert.equal(readDrawioEvent({ ...message, origin: "https://embed.diagrams.net" }, frame), null);
  assert.equal(readDrawioEvent({ ...message, source: {} }, frame), null);
  assert.equal(readDrawioEvent(message, null), null);
  assert.equal(readDrawioEvent({ ...message, data: "not JSON" }, frame), null);
  assert.equal(
    readDrawioEvent({ ...message, data: JSON.stringify({ event: "save", xml: 123 }) }, frame),
    null,
  );
  assert.equal(
    readDrawioEvent(
      {
        ...message,
        data: JSON.stringify({ event: "save", xml: "x".repeat(DRAWIO_MAX_XML_LENGTH + 1) }),
      },
      frame,
    ),
    null,
  );
  assert.equal(
    readDrawioEvent(
      { ...message, data: JSON.stringify({ event: "openLink", href: "https://example.com" }) },
      frame,
    ),
    null,
  );
  assert.deepEqual(
    readDrawioEvent({ ...message, data: JSON.stringify({ event: "init" }) }, frame),
    { event: "init" },
  );
});
test("draw.io fit constrains height as well as width for tall diagrams", () => {
  const { drawioFitRequest } = require("../src/features/architecture/drawio-protocol.ts");
  const fit = drawioFitRequest({
    modelBounds: { width: 1337, height: 1190 },
    containerSize: { width: 1040, height: 610 },
  });
  assert.equal(fit.action, "fit");
  assert.ok(fit.maxScale * 1190 <= 610 - 48 + 1e-9);
  assert.ok(fit.maxScale * 1337 <= 1040 - 48 + 1e-9);
  assert.ok(fit.maxScale < 0.5, "width-only fitting would clip the bottom of this real model");
  assert.equal(drawioFitRequest({}), null);
  assert.equal(
    drawioFitRequest({
      modelBounds: { width: 0, height: Infinity },
      containerSize: { width: 100, height: 200 },
    }),
    null,
  );
});
test("drawio projection and rules preserve scope without fabricating technology", () => {
  const { projectDiagram, nodeText, relationLabel } = require("../src/lib/drawio/rules.ts");
  const raw = JSON.parse(
    fs
      .readFileSync(path.join(root, "tests/fixtures/petclinic-component.json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  const service = raw.layoutJson.nodes.find((node) => node.name === "customers-service");
  const scope = projectDiagram(raw, service.id);
  assert.ok(scope.layoutJson.nodes.some((node) => node.name === "OwnerRepository"));
  assert.ok(!scope.layoutJson.nodes.some((node) => node.name === "VetRepository"));
  assert.ok(scope.omittedNodes > 0);
  assert.throws(() => projectDiagram(raw, "missing"));
  assert.throws(() =>
    projectDiagram({
      ...raw,
      layoutJson: {
        nodes: raw.layoutJson.nodes,
        edges: [{ id: "bad", from: "foreign", to: service.id }],
      },
    }),
  );
  assert.doesNotMatch(
    nodeText({ id: "x", name: "Tên dịch vụ", kind: "SERVICE_CONTAINER" }).join(" "),
    /not extracted|technology unknown/,
  );
  assert.doesNotMatch(relationLabel({ id: "a", type: "DECLARED_COMPOSE" }), /HTTP/);
});

test("canonical drawio routes real Petclinic container and component with zero hard collisions", async () => {
  const { projectDiagram } = require("../src/lib/drawio/rules.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  for (const level of ["container", "component"]) {
    const raw = JSON.parse(
      fs
        .readFileSync(path.join(root, `tests/fixtures/petclinic-${level}.json`), "utf8")
        .replace(/^\uFEFF/, ""),
    );
    const scope = projectDiagram(
      raw,
      level === "component"
        ? raw.layoutJson.nodes.find((node) => node.name === "customers-service").id
        : undefined,
    );
    const before = JSON.stringify(scope),
      xml = await generateDrawio(scope);
    const quality = JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;", '"'));
    assert.equal(quality.needsReview, false, JSON.stringify(quality));
    assert.equal(JSON.stringify(scope), before);
    assert.equal((xml.match(/mavisRole="edge"/g) || []).length, scope.layoutJson.edges.length);
    assert.equal(
      (xml.match(/mavisRole="edge-label"/g) || []).length,
      scope.layoutJson.edges.length,
    );
    assert.match(xml, /mavisRuleVersion="mavis-se-3"/);
    assert.match(xml, /font-size:16px;font-weight:bold/);
    if (level === "component") assert.match(xml, /mavisRole="boundary"/);
    assert.equal(await generateDrawio(scope), xml, "output must be deterministic");
  }
});

test("drawio preserves cycle, reciprocal and disconnected nodes; escapes hostile labels", async () => {
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const { projectDiagram } = require("../src/lib/drawio/rules.ts");
  const document = {
    modelVersionId: "test",
    notation: "DEPENDENCY_GRAPH",
    level: "SERVICE",
    layoutJson: {
      nodes: ["a", "b", "c", "d"].map((id) => ({
        id,
        name: id === "a" ? "Tên dịch vụ <script>alert(1)</script> rất dài có dấu tiếng Việt" : id,
        kind: "SERVICE_CONTAINER",
      })),
      edges: [
        { id: "ab", from: "a", to: "b", type: "CODE_DEPENDENCY" },
        { id: "ba", from: "b", to: "a", type: "CODE_DEPENDENCY" },
        { id: "bc", from: "b", to: "c", type: "CODE_DEPENDENCY" },
        { id: "ca", from: "c", to: "a", type: "CODE_DEPENDENCY" },
      ],
    },
  };
  const xml = await generateDrawio(projectDiagram(document));
  assert.equal((xml.match(/mavisRole="SERVICE_CONTAINER"/g) || []).length, 4);
  assert.equal((xml.match(/mavisRole="edge"/g) || []).length, 4);
  assert.ok(!xml.includes("<script>"));
  assert.match(xml, /mavisId="ba"/);
  const excessive = {
    ...document,
    layoutJson: {
      nodes: Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: String(i) })),
      edges: [],
    },
  };
  await assert.rejects(generateDrawio(projectDiagram(excessive)), /smaller diagram scope/);
});

test("drawio geometry gate catches crossings through unrelated nodes and label collisions", () => {
  const { inspectGeometry } = require("../src/lib/drawio/geometry.ts");
  const nodes = [
    { id: "a", x: 0, y: 0, width: 50, height: 50 },
    { id: "b", x: 100, y: 0, width: 50, height: 50 },
    { id: "obstacle", x: 60, y: 0, width: 20, height: 50 },
  ];
  const result = inspectGeometry(
    nodes,
    [{ id: "label", x: 1, y: 1, width: 20, height: 20 }],
    [
      {
        id: "ab",
        from: "a",
        to: "b",
        points: [
          { x: 50, y: 25 },
          { x: 100, y: 25 },
        ],
      },
    ],
  );
  assert.equal(result.edgeThroughNodes, 1);
  assert.equal(result.labelNodeOverlaps, 1);
  assert.equal(result.needsReview, true);
});
test("drawio relation filters disclose omitted edges instead of inventing traffic", () => {
  const { projectDiagram, selectRelationships } = require("../src/lib/drawio/rules.ts");
  const raw = JSON.parse(
    fs
      .readFileSync(path.join(root, "tests/fixtures/petclinic-container.json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  const doc = projectDiagram(raw),
    source = selectRelationships(doc, "source"),
    declared = selectRelationships(doc, "declared"),
    runtime = selectRelationships(doc, "runtime");
  assert.equal(source.layoutJson.edges.length, 0);
  assert.equal(source.omittedEdges, 13);
  assert.equal(declared.layoutJson.edges.length, 13);
  assert.equal(runtime.layoutJson.edges.length, 0);
  assert.equal(
    runtime.layoutJson.nodes.length,
    11,
    "nodes must not silently disappear when a relation class is hidden",
  );
  assert.equal(selectRelationships(doc, "all"), doc);
});

test("drawio themes preserve semantic distinction and readable base palette", () => {
  const { palette, nodeStyle } = require("../src/lib/drawio/rules.ts");
  const luminance = (hex) => {
    const channels = hex
      .slice(1)
      .match(/../g)
      .map((value) => parseInt(value, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const theme of ["clean", "dark", "blueprint"]) {
    const p = palette(theme);
    for (const fill of [p.background, p.internal, p.data, p.external]) {
      const a = luminance(p.text),
        b = luminance(fill);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
    }
  }
  assert.match(nodeStyle("DATABASE", "clean"), /cylinder/);
  assert.match(nodeStyle("QUEUE_BROKER", "clean"), /shape=process/);
});
test("drawio supports self loops and parallel relations without dropping IDs", async () => {
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const { projectDiagram } = require("../src/lib/drawio/rules.ts");
  const doc = projectDiagram({
    modelVersionId: "test",
    notation: "DEPENDENCY_GRAPH",
    level: "SERVICE",
    layoutJson: {
      nodes: [
        { id: "a.b", name: "A", kind: "SERVICE_CONTAINER" },
        { id: "a_b", name: "B", kind: "SERVICE_CONTAINER" },
      ],
      edges: [
        { id: "self", from: "a.b", to: "a.b", type: "CODE_DEPENDENCY" },
        { id: "one", from: "a.b", to: "a_b", type: "CODE_DEPENDENCY" },
        { id: "two", from: "a.b", to: "a_b", type: "SERVICE_HTTP_CALL" },
      ],
    },
  });
  const xml = await generateDrawio(doc);
  assert.equal((xml.match(/mavisRole="edge"/g) || []).length, 3);
  assert.match(xml, /mavisId="self"/);
  assert.match(xml, /mavisId="a.b"/);
  assert.match(xml, /mavisId="a_b"/);
});
test("planar shared-dependency routing removes Petclinic crossings without deleting edges", async () => {
  const { generateDrawio } = require("../src/lib/drawio/server.ts"),
    { projectDiagram } = require("../src/lib/drawio/rules.ts");
  const raw = JSON.parse(
    fs
      .readFileSync(path.join(root, "tests/fixtures/petclinic-container.json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  const xml = await generateDrawio(projectDiagram(raw));
  const metrics = JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;", '"'));
  assert.equal(metrics.crossings, 0);
  assert.equal(metrics.needsReview, false);
  assert.equal((xml.match(/mavisRole="edge"/g) || []).length, 13);
  assert.equal((xml.match(/mavisRole="SERVICE_CONTAINER"/g) || []).length, 11);
});

test("pinned relayout preserves multiple fixed rectangles and safely rejects conflicting locks", async () => {
  const { generateDrawio } = require("../src/lib/drawio/server.ts"),
    { projectDiagram } = require("../src/lib/drawio/rules.ts");
  const node = (id, x, y) => ({
    id,
    name: id,
    kind: "SERVICE_CONTAINER",
    languageStack: "Java",
    description: "Handles requests",
    pinned: { x, y, width: 280, height: 160 },
  });
  const doc = {
    modelVersionId: "pins",
    notation: "DEPENDENCY_GRAPH",
    level: "SERVICE",
    layoutJson: {
      nodes: [
        node("a", 400, 400),
        node("b", 1000, 700),
        {
          id: "c",
          name: "Free node",
          kind: "SERVICE_CONTAINER",
          languageStack: "Java",
          description: "Processes requests",
        },
      ],
      edges: [
        { id: "ab", from: "a", to: "b", type: "SERVICE_HTTP_CALL" },
        { id: "bc", from: "b", to: "c", type: "CODE_DEPENDENCY" },
      ],
    },
  };
  const xml = await generateDrawio(projectDiagram(doc));
  assert.match(
    xml,
    /mavisId="a"[\s\S]*?movable=0;resizable=0;[\s\S]*?<mxGeometry x="448" y="512" width="280" height="160"/,
  );
  assert.match(xml, /mavisId="b"[\s\S]*?<mxGeometry x="1048" y="812" width="280" height="160"/);
  const quality = JSON.parse(xml.match(/mavisQuality="([^"]*)"/)[1].replaceAll("&quot;", '"'));
  assert.equal(quality.needsReview, false);
  const conflict = structuredClone(doc);
  conflict.layoutJson.nodes[1].pinned = { x: 400, y: 400, width: 280, height: 160 };
  await assert.rejects(generateDrawio(projectDiagram(conflict)), /Locked shapes overlap/);
});
test("FTGO component scope selects populated service and distinguishes infrastructure with no internals", async () => {
  const {
    componentContainers,
    projectDiagram,
    relationLabel,
    nodeText,
  } = require("../src/lib/drawio/rules.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const doc = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/ftgo-component.json"), "utf8"),
  );
  const containers = componentContainers(doc);
  assert.equal(containers[0].name, "ftgo-order-service");
  assert.equal(containers[0].componentCount, 5);
  assert.equal(containers.find((c) => c.name === "cdc-service").componentCount, 0);
  assert.equal(
    containers.reduce((count, c) => count + c.componentCount, 0),
    23,
  );
  const scope = projectDiagram(doc, containers[0].id);
  assert.equal(
    scope.layoutJson.nodes.filter((n) => n.kind === "COMPONENT" && n.parentId === containers[0].id)
      .length,
    5,
  );
  assert.ok(!scope.layoutJson.nodes.some((n) => n.name === "cdc-service"));
  assert.equal(relationLabel({ id: "e", type: "DECLARED_COMPOSE" }), "Compose startup dependency");
  assert.equal(relationLabel({ id: "e", type: "CODE_DEPENDENCY" }), "Code dependency");
  assert.doesNotMatch(
    nodeText({ id: "n", name: "Service", kind: "SERVICE_CONTAINER" }).join(" "),
    /Responsibility not extracted/,
  );
  const xml = await generateDrawio(scope);
  assert.match(xml, /mavisRole="boundary"/);
  assert.doesNotMatch(xml, /Phụ thuộc|Trách nhiệm/);
});
test("architecture pack keeps Compose ordering outside application interactions and retains source IDs", () => {
  const { planArchitectureViews } = require("../src/lib/architecture/view-planner.ts");
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/ftgo-component.json"), "utf8"),
  );
  const before = JSON.stringify(raw);
  const pack = planArchitectureViews(raw);
  const app = pack.views.find((v) => v.id === "containers"),
    deployment = pack.views.find((v) => v.id === "deployment");
  assert.ok(!app.document.layoutJson.edges.some((e) => e.type === "DECLARED_COMPOSE"));
  assert.equal(deployment.document.layoutJson.edges.length, 33);
  assert.equal(pack.views.filter((v) => v.kind === "component").length, 8);
  assert.ok(app.document.layoutJson.edges.every((e) => e.underlyingEdgeIds.length > 0));
  assert.ok(
    app.document.layoutJson.edges.every(
      (e) => raw.layoutJson.nodes.find((n) => n.id === e.from)?.kind !== "COMPONENT",
    ),
  );
  assert.equal(JSON.stringify(raw), before);
  assert.equal(pack.status, "requires-review");
  assert.equal(pack.coverage.relationships, 53);
  assert.equal(pack.coverage.relationshipsWithoutResolutionMetadata, 53);
  assert.ok(!pack.views.some((v) => v.id === "components:3be666c8-af02-46f9-ab2d-64115802d618"));
});
test("grouped overview accounts for every service member without pretending a group is a C4 container", () => {
  const { planArchitectureViews } = require("../src/lib/architecture/view-planner.ts");
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/ftgo-component.json"), "utf8"),
  );
  const pack = planArchitectureViews(raw);
  const view = pack.views.find((v) => v.id === "overview");
  assert.equal(view.document.notation, "ARCHITECTURE_OVERVIEW");
  const group = view.document.layoutJson.nodes.find((n) => n.kind === "SERVICE_GROUP");
  assert.equal(group.underlyingNodeIds.length, 8);
  assert.match(group.description, /ftgo-order-service/);
  for (const member of group.underlyingNodeIds)
    assert.ok(view.document.projection.includedNodeIds.includes(member));
  assert.ok(pack.views.some((v) => v.id === "containers"));
});
test("readability checks the effective font after fitting and A3 export, not XML font size alone", () => {
  const { assessReadability } = require("../src/lib/architecture/readability.ts");
  const dense = assessReadability({
    width: 1728,
    height: 1540,
    minimumFontPx: 12,
    viewportWidth: 1000,
    viewportHeight: 620,
  });
  assert.equal(dense.screenReadable, false);
  assert.ok(dense.minimumScreenFontPx < 5);
  const readable = assessReadability({
    width: 800,
    height: 450,
    minimumFontPx: 14,
    viewportWidth: 1000,
    viewportHeight: 620,
  });
  assert.equal(readable.screenReadable, true);
  assert.equal(readable.printReadable, true);
  assert.throws(() =>
    assessReadability({
      width: 0,
      height: 1,
      minimumFontPx: 12,
      viewportWidth: 1,
      viewportHeight: 1,
    }),
  );
});
test("graph collapse preserves every underlying relationship and separates deployment filters", () => {
  const { projectGraphModel } = require("../src/features/architecture/graph-projection.ts");
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Model",
    elements: [
      {
        id: "a",
        name: "A",
        elementType: "SERVICE_CONTAINER",
        layer: "unclassified",
        description: "",
        evidence: [],
      },
      {
        id: "c",
        name: "C",
        parentId: "a",
        elementType: "COMPONENT",
        layer: "unclassified",
        description: "",
        evidence: [],
      },
      { id: "b", name: "B", layer: "unclassified", description: "", evidence: [] },
    ],
    edges: [
      {
        id: "one",
        from: "c",
        to: "b",
        protocol: "HTTP",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "two",
        from: "a",
        to: "b",
        protocol: "HTTP",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "boot",
        from: "a",
        to: "b",
        protocol: "DECLARED_COMPOSE",
        originLayer: "DEPLOYMENT",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const source = projectGraphModel(model, false, "source");
  assert.equal(source.model.elements.length, 2);
  assert.equal(source.model.edges.length, 1);
  assert.deepEqual(source.model.edges[0].underlyingEdgeIds, ["one", "two"]);
  assert.equal(source.filteredRelationships, 1);
  const expanded = projectGraphModel(model, true, "all");
  assert.equal(expanded.model.elements.length, 3);
  assert.equal(expanded.model.edges.length, 3);
  assert.equal(model.edges[0].from, "c");
});
test("compact overview routes explicit service/channel/data groups without collisions", () => {
  const { compactOverview } = require("../src/lib/drawio/compact-overview.ts");
  const result = compactOverview(
    [
      { id: "app", kind: "SERVICE_GROUP", width: 280, height: 232 },
      { id: "channel", kind: "CHANNEL_GROUP", width: 280, height: 132 },
      { id: "data", kind: "DATASTORE_GROUP", width: 280, height: 192 },
    ],
    [
      { id: "pub", from: "app", to: "channel", type: "MESSAGE_PUBLISH" },
      { id: "sub", from: "channel", to: "app", type: "MESSAGE_SUBSCRIBE" },
      { id: "db", from: "app", to: "data", type: "DATABASE_ACCESS" },
    ],
  );
  assert.ok(result);
  assert.equal(result.quality.needsReview, false);
  assert.equal(result.quality.crossings, 0);
  assert.equal(result.routes.length, 3);
  assert.ok(Math.max(...result.rects.map((rect) => rect.y + rect.height)) < 450);
  assert.ok(result.graph.height > 350, "Layout bounds must keep the legend below the drawing");
});
test("simplified C4/4+1 catalog preserves element IDs and never relabels static edges as processes", () => {
  const { modelView } = require("../src/lib/api/java-wire.ts");
  const {
    selectDiagram,
    diagramKinds,
    diagramMembers,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/ftgo-component.json"), "utf8"),
  );
  const model = {
    id: raw.modelVersionId,
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Model",
    elements: raw.layoutJson.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      elementType: n.kind,
      parentId: n.parentId,
      technology: n.languageStack,
      properties: n.properties,
      description: n.description ?? "",
      layer: "unclassified",
      evidence: [],
    })),
    edges: raw.layoutJson.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      protocol: e.type,
      originLayer: e.originLayer,
      uncertain: true,
      evidence: [],
    })),
  };
  assert.deepEqual(
    diagramKinds.C4.map((d) => d.value),
    ["CONTAINER", "COMPONENT"],
  );
  assert.equal(diagramKinds["4+1"].length, 5);
  const container = selectDiagram(model, "CONTAINER");
  assert.equal(container.document.notation, "C4");
  assert.equal(container.document.level, "CONTAINER");
  const containerNodes = container.document.layoutJson.nodes;
  const boundary = containerNodes.find((n) => n.id === "system:boundary");
  assert.ok(boundary);
  assert.equal(boundary.kind, "SYSTEM_BOUNDARY");
  assert.equal(boundary.name, "Analyzed system");
  assert.ok(
    containerNodes
      .filter((n) => n.kind === "SERVICE_CONTAINER")
      .every((n) => n.parentId === "system:boundary"),
  );
  assert.ok(
    containerNodes
      .filter((n) => ["DATABASE", "QUEUE_BROKER"].includes(n.kind))
      .every((n) => !n.parentId),
  );
  assert.match(String(container.document.scopeWarning ?? ""), /Ownership unresolved/);
  assert.ok(
    containerNodes.every(
      (n) => n.id === "system:boundary" || model.elements.some((e) => e.id === n.id),
    ),
  );
  const service = model.elements.find((n) => n.name === "ftgo-order-service");
  const component = selectDiagram(model, "COMPONENT", service.id);
  assert.ok(component.document.layoutJson.nodes.some((n) => n.parentId === service.id));
  const process = selectDiagram(model, "PROCESS");
  assert.equal(process.document.level, "PROCESS");
  assert.ok(!process.document.layoutJson.edges.some((e) => e.type === "DECLARED_COMPOSE"));
  assert.equal(selectDiagram(model, "LOGICAL").document.level, "LOGICAL");
  assert.equal(selectDiagram(model, "CONTEXT").document.level, "CONTEXT");
  const deployment = selectDiagram(model, "DEPLOYMENT");
  assert.equal(deployment.document.notation, "VIEW_4_PLUS_1");
  assert.ok(deployment.document.layoutJson.edges.every((e) => e.type === "DECLARED_COMPOSE"));
  const aggregate = container.document.layoutJson.edges.find((e) => e.underlyingEdgeIds?.length);
  if (aggregate) assert.ok(diagramMembers(container.document, aggregate.id, model).length > 0);
});

test("Development diagram groups only qualified source packages with explicit ownership", () => {
  const {
    selectDiagram,
    diagramMembers,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, name, parentId, qualifiedName) => ({
    id,
    name,
    parentId,
    elementType: parentId ? "COMPONENT" : "SERVICE_CONTAINER",
    properties: { qualifiedName },
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("service", "Orders", null, null),
      node("c", "Controller", "service", "orders.web.Controller"),
      node("r", "Repository", "service", "orders.data.Repository"),
    ],
    edges: [
      { id: "e", from: "c", to: "r", protocol: "CODE_DEPENDENCY", uncertain: false, evidence: [] },
    ],
  };
  const result = selectDiagram(model, "DEVELOPMENT");
  assert.equal(result.document.layoutJson.nodes.length, 2);
  assert.equal(result.document.layoutJson.edges.length, 1);
  const group = result.document.layoutJson.nodes.find((n) => n.name === "orders.web");
  assert.deepEqual(diagramMembers(result.document, group.id, model), ["c"]);
  assert.equal(model.elements[1].id, "c");
});
test("System Context groups internal elements and excludes Compose startup arrows", () => {
  const {
    selectDiagram,
    diagramMembers,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, name, type) => ({
    id,
    name,
    elementType: type,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("service", "Orders", "SERVICE_CONTAINER"),
      node("external", "Payment provider", "EXTERNAL_SYSTEM"),
    ],
    edges: [
      {
        id: "api",
        from: "service",
        to: "external",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "boot",
        from: "service",
        to: "external",
        protocol: "DECLARED_COMPOSE",
        originLayer: "DEPLOYMENT",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const result = selectDiagram(model, "CONTEXT");
  assert.equal(result.document.notation, "C4");
  assert.equal(result.document.level, "CONTEXT");
  assert.equal(result.document.layoutJson.edges.length, 1);
  assert.equal(result.document.layoutJson.edges[0].to, "external");
  assert.deepEqual(diagramMembers(result.document, "system:p", model), ["service"]);
});
test("context remains visible without actors and never promotes internal infrastructure to external systems", () => {
  const {
    selectDiagram,
    diagramMembers,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, type, parentId, properties = {}) => ({
    id,
    name: id,
    elementType: type,
    parentId,
    properties,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("app", "SERVICE_CONTAINER"),
      node("db", "DATABASE"),
      node("queue", "QUEUE_BROKER"),
    ],
    edges: [],
  };
  const bare = selectDiagram(model, "CONTEXT");
  assert.equal(bare.document.layoutJson.nodes.length, 1);
  assert.equal(bare.document.layoutJson.nodes[0].kind, "SYSTEM");
  assert.equal(bare.document.layoutJson.edges.length, 0);
  model.elements.push(
    node("controller", "COMPONENT", "app", { responsibility: "Exposes HTTP endpoints" }),
  );
  // M1 review: entrypoints chứng minh inbound interface — không tự sinh external caller.
  const inferred = selectDiagram(model, "CONTEXT");
  assert.equal(inferred.document.layoutJson.nodes.length, 1);
  assert.equal(inferred.document.layoutJson.nodes[0].kind, "SYSTEM");
  assert.equal(inferred.document.layoutJson.edges.length, 0);
  assert.match(inferred.notice, /HTTP entrypoint component\(s\)/);
  assert.match(inferred.notice, /callers require review/);
  assert.ok(!inferred.document.layoutJson.nodes.some((n) => n.kind === "EXTERNAL_SYSTEM"));
  // tên system nhận từ systemName truyền vào (C2/C1 dùng chung tên project)
  const named = selectDiagram(model, "CONTEXT", undefined, { systemName: "Test1" });
  assert.equal(named.document.layoutJson.nodes[0].name, "Test1");
});
test("Logical keeps explicitly owned abstractions separate from deployment and other services", () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, type, parentId) => ({
    id,
    name: id,
    elementType: type,
    parentId,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const edge = (id, from, to, protocol, originLayer = "STATIC") => ({
    id,
    from,
    to,
    protocol,
    originLayer,
    uncertain: false,
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("a", "SERVICE_CONTAINER"),
      node("b", "SERVICE_CONTAINER"),
      node("controller", "COMPONENT", "a"),
      node("service", "COMPONENT", "a"),
      node("other", "COMPONENT", "b"),
      node("db", "DATABASE"),
    ],
    edges: [
      edge("usage", "controller", "service", "CODE_DEPENDENCY"),
      edge("wrong-scope", "controller", "other", "CODE_DEPENDENCY"),
      edge("startup", "a", "b", "DECLARED_COMPOSE", "DEPLOYMENT"),
      edge("data", "service", "db", "DATABASE_ACCESS"),
    ],
  };
  const result = selectDiagram(model, "LOGICAL", "a");
  assert.equal(result.key, "logical:a");
  assert.deepEqual(
    result.document.layoutJson.nodes.map((n) => n.id),
    ["controller", "service"],
  );
  assert.deepEqual(
    result.document.layoutJson.edges.map((e) => e.id),
    ["usage"],
  );
  assert.equal(selectDiagram(model, "LOGICAL", "b").key, "logical:b");
  assert.ok(!result.document.layoutJson.nodes.some((n) => n.kind === "SERVICE_CONTAINER"));
});
test("Process aggregates communications through component ownership without inventing IPC from code or startup dependencies", () => {
  const {
    selectDiagram,
    diagramMembers,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, type, parentId) => ({
    id,
    name: id,
    elementType: type,
    parentId,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const edge = (id, from, to, protocol, originLayer = "STATIC") => ({
    id,
    from,
    to,
    protocol,
    originLayer,
    uncertain: false,
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("a", "SERVICE_CONTAINER"),
      node("b", "SERVICE_CONTAINER"),
      node("x", "COMPONENT", "a"),
      node("y", "COMPONENT", "b"),
      node("queue", "MESSAGE_CHANNEL"),
    ],
    edges: [
      edge("http", "x", "y", "SERVICE_HTTP_CALL"),
      edge("http2", "a", "b", "SERVICE_HTTP_CALL"),
      edge("pub", "x", "queue", "MESSAGE_PUBLISH"),
      edge("code", "x", "y", "CODE_DEPENDENCY"),
      edge("boot", "a", "b", "DECLARED_COMPOSE", "DEPLOYMENT"),
    ],
  };
  const result = selectDiagram(model, "PROCESS");
  assert.equal(result.document.level, "PROCESS");
  assert.equal(result.document.layoutJson.nodes.find((n) => n.id === "a").kind, "PROCESS_UNIT");
  assert.equal(result.document.layoutJson.edges.length, 2);
  assert.ok(!result.document.layoutJson.nodes.some((n) => n.kind === "COMPONENT"));
  const http = result.document.layoutJson.edges.find((e) => e.type === "SERVICE_HTTP_CALL");
  assert.deepEqual(diagramMembers(result.document, http.id, model), ["http", "http2"]);
  assert.match(result.notice, /Thread scheduling/);
});
test("Designed scenarios preserve explicit order, repeats and canonical IDs across XML export and reload", () => {
  const {
    scenarioXml,
    readScenarioDesign,
    scenarioInteractions,
  } = require("../src/features/architecture/scenario-design.ts");
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: ["a", "b"].map((id) => ({
      id,
      name: id === "a" ? "Orders <script>" : "Payments",
      elementType: "SERVICE_CONTAINER",
      description: "",
      layer: "unclassified",
      evidence: [],
    })),
    edges: [
      {
        id: "ab",
        from: "a",
        to: "b",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "boot",
        from: "a",
        to: "b",
        protocol: "DECLARED_COMPOSE",
        originLayer: "DEPLOYMENT",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const design = { modelId: "m", name: "Place order & pay", edgeIds: ["ab", "ab"] };
  const xml = scenarioXml(model, design);
  assert.deepEqual(readScenarioDesign(xml, model), design);
  assert.equal((xml.match(/mavisRole="participant"/g) || []).length, 2);
  assert.equal((xml.match(/mavisRole="edge"/g) || []).length, 2);
  assert.match(xml, /1\. \[\? sort=UNKNOWN\] HTTP call/);
  assert.match(xml, /2\. \[\? sort=UNKNOWN\] HTTP call/);
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /not observed execution/);
  assert.equal(scenarioInteractions(model).length, 1);
  assert.equal(readScenarioDesign(xml, { ...model, id: "other" }), null);
  assert.equal(readScenarioDesign(xml, { ...model, edges: [] }), null);
  assert.equal(readScenarioDesign("<invalid>", model), null);
  assert.throws(() => scenarioXml(model, { ...design, edgeIds: ["boot"] }), /not present/);
  assert.throws(() => scenarioXml(model, { ...design, modelId: "wrong" }), /another model/);
});

test("Sequence headers and message ports leave room for long wrapped participant names", () => {
  const { scenarioXml } = require("../src/features/architecture/scenario-design.ts");
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: ["a", "b"].map((id) => ({
      id,
      name:
        id === "a"
          ? "AccountingServiceCommandHandlerWithAnExtremelyLongQualifiedComponentName"
          : "Eventuate command channel",
      elementType: "COMPONENT",
      description: "",
      layer: "unclassified",
      evidence: [],
    })),
    edges: [
      {
        id: "call",
        from: "a",
        to: "b",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const xml = scenarioXml(model, {
    modelId: "m",
    name: "Long participant names",
    edgeIds: ["call"],
  });
  const header = Number(/size=(\d+);html=0/.exec(xml)[1]);
  assert.ok(header >= 86, "3+ lines need more than the former 64px header");
  const height = Number(
    /height="([\d.]+)" as="geometry"\/><\/mxCell><mxCell id="participant-1"/.exec(xml)[1],
  );
  const anchor = Number(/exitY=([\d.]+);exitPerimeter/.exec(xml)[1]);
  assert.ok(anchor * height > header + 20, "message must start below the header");
  assert.match(xml, /&#xa;/, "wrapped label lines must survive XML attribute parsing");
});
test("3E preserves configuration provenance and hides machine-local paths without inventing line numbers", () => {
  const { sourceLabel, shortLocator } = require("../src/features/architecture/three-e-content.ts");
  assert.equal(sourceLabel({ kind: "source", sourceType: "CONFIG_FILE" }), "From configuration");
  assert.equal(sourceLabel({ kind: "source", sourceType: "SOURCE_CODE" }), "From source code");
  assert.equal(
    sourceLabel({ kind: "runtime", sourceType: "RUNTIME_TRACE" }),
    "Observed at runtime",
  );
  assert.equal(sourceLabel({ kind: "source" }), "Unclassified source");
  assert.equal(
    shortLocator(
      "C:\\Users\\machine\\uploads\\snapshot_source_extracted\\project-sha\\orders\\src\\Repo.java:5",
    ),
    "orders/src/Repo.java:5",
  );
  assert.ok(!shortLocator("C:\\Users\\name\\src\\Repo.java").includes("C:"));
  assert.equal(shortLocator("src/Repo.java"), "src/Repo.java");
});
test("3E treats Compose as startup declaration and physical database identity as unresolved", () => {
  const {
    selectionSummary,
    findingRelated,
  } = require("../src/features/architecture/three-e-content.ts");
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      {
        id: "a",
        name: "orders",
        elementType: "SERVICE_CONTAINER",
        description: "",
        layer: "unclassified",
        evidence: [],
      },
      {
        id: "db",
        name: "mysql",
        elementType: "DATABASE",
        description: "",
        layer: "data",
        evidence: [],
      },
    ],
    edges: [
      {
        id: "boot",
        from: "a",
        to: "db",
        protocol: "DECLARED_COMPOSE",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  assert.match(selectionSummary(model, "boot").summary, /does not prove/);
  assert.match(selectionSummary(model, "db").type, /Scope Requires Verification/i);
  assert.equal(
    findingRelated({ elementId: "db", details: { relatedElementIds: ["a"] } }, "a"),
    true,
  );
  assert.equal(findingRelated({ elementId: "other", message: "a" }, "a"), false);
});
test("C4 Container draws a named system boundary around owned containers and keeps external and unresolved outside", async () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const node = (id, name, type, props) => ({
    id,
    name,
    elementType: type,
    properties: props,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("svc-a", 'Payments & Billing <draft> "v2"', "SERVICE_CONTAINER"),
      node("svc-b", "orders-api", "SERVICE_CONTAINER"),
      node("db", "orders-db", "DATABASE", { resourceRole: "LOGICAL_DATASTORE" }),
      node("ext", "Payment provider", "EXTERNAL_SYSTEM"),
      node("broker", "kafka", "QUEUE_BROKER"),
    ],
    edges: [
      {
        id: "e1",
        from: "svc-a",
        to: "svc-b",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e2",
        from: "svc-b",
        to: "db",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e3",
        from: "svc-a",
        to: "ext",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e4",
        from: "svc-b",
        to: "broker",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: true,
        evidence: [],
      },
    ],
  };
  const result = selectDiagram(model, "CONTAINER", undefined, { systemName: "OrderHub <test>" });
  const doc = result.document,
    nodes = doc.layoutJson.nodes;
  const boundary = nodes.find((n) => n.id === "system:boundary");
  assert.ok(boundary);
  assert.equal(boundary.kind, "SYSTEM_BOUNDARY");
  assert.equal(boundary.name, "OrderHub <test>");
  assert.deepEqual(
    nodes
      .filter((n) => n.parentId === "system:boundary")
      .map((n) => n.id)
      .sort(),
    ["db", "svc-a", "svc-b"],
  );
  assert.ok(!nodes.find((n) => n.id === "ext").parentId);
  assert.ok(!nodes.find((n) => n.id === "broker").parentId);
  assert.match(String(doc.scopeWarning), /Ownership unresolved for 1 element/);
  assert.ok(
    nodes.every((n) => n.id === "system:boundary" || model.elements.some((e) => e.id === n.id)),
  );
  assert.equal(doc.layoutJson.edges.length, 4);
  const xml = await generateDrawio(doc);
  assert.ok(xml.includes("OrderHub &lt;test&gt; · Software system · analyzed source scope"));
  assert.ok(!xml.includes('value="OrderHub <test>'));
  const idOf = (mavisId) => {
    const m = xml.match(new RegExp('<mxCell id="([^"]+)"[^>]*mavisId="' + mavisId + '"'));
    assert.ok(m, mavisId);
    return m[1];
  };
  const parentOf = (mavisId) => {
    const m = xml.match(
      new RegExp('<mxCell id="[^"]+"[^>]*mavisId="' + mavisId + '"[^>]*parent="([^"]*)"'),
    );
    assert.ok(m, mavisId);
    return m[1];
  };
  const boundaryCell = idOf("system:boundary");
  assert.equal(parentOf("svc-a"), boundaryCell);
  assert.equal(parentOf("svc-b"), boundaryCell);
  assert.equal(parentOf("db"), boundaryCell);
  assert.equal(parentOf("ext"), "1");
  assert.equal(parentOf("broker"), "1");
  const e3 = xml.match(new RegExp('<mxCell [^>]*mavisId="view:e3".*'));
  assert.ok(e3);
  assert.ok(e3[0].includes('source="' + idOf("svc-a") + '"'));
  assert.ok(e3[0].includes('target="' + idOf("ext") + '"'));
});
test("C4 Container projection keeps includedNodeIds as source-only IDs and traces boundary metadata", () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, name, type, props) => ({
    id,
    name,
    elementType: type,
    properties: props,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("svc-a", 'Payments & Billing <draft> "v2"', "SERVICE_CONTAINER"),
      node("svc-b", "orders-api", "SERVICE_CONTAINER"),
      node("db", "orders-db", "DATABASE", { resourceRole: "LOGICAL_DATASTORE" }),
      node("ext", "Payment provider", "EXTERNAL_SYSTEM"),
      node("broker", "kafka", "QUEUE_BROKER"),
    ],
    edges: [
      {
        id: "e1",
        from: "svc-a",
        to: "svc-b",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e2",
        from: "svc-b",
        to: "db",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e3",
        from: "svc-a",
        to: "ext",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e4",
        from: "svc-b",
        to: "broker",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: true,
        evidence: [],
      },
    ],
  };
  const doc = selectDiagram(model, "CONTAINER", undefined, {
    systemName: "OrderHub <test>",
  }).document;
  const sourceIds = new Set(model.elements.map((e) => e.id));
  assert.ok(
    doc.projection.includedNodeIds.every((id) => sourceIds.has(id)),
    "includedNodeIds must be source element IDs only",
  );
  assert.ok(
    !doc.projection.includedNodeIds.includes("system:boundary"),
    "synthetic boundary must not be a source node",
  );
  assert.deepEqual(doc.syntheticNodeIds, ["system:boundary"]);
  assert.equal(
    doc.projection.includedNodeIds.length,
    5,
    "boundary must not inflate source-node counts",
  );
  assert.deepEqual([...doc.systemBoundary.memberIds].sort(), ["db", "svc-a", "svc-b"]);
  assert.deepEqual(doc.systemBoundary.unresolvedIds, ["broker"]);
  assert.equal(doc.systemBoundary.name, "OrderHub <test>");
});
test("boundary header and legend scale with long names and many unresolved elements", async () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const { wrapText } = require("../src/lib/drawio/rules.ts");
  const longName = 'Hệ thống quản lý đơn hàng & thanh toán <bản nháp> "OrderHub Pro" — dịch vụ dài';
  const elements = [
    {
      id: "svc-a",
      name: longName,
      elementType: "SERVICE_CONTAINER",
      description: "",
      layer: "unclassified",
      evidence: [],
    },
    {
      id: "svc-b",
      name: "orders-api",
      elementType: "SERVICE_CONTAINER",
      description: "",
      layer: "unclassified",
      evidence: [],
    },
  ];
  const unresolvedNames = [
    "Khách hàng chưa rõ A — vai trò cần xác minh",
    "Nhà cung cấp B — ownership chưa chốt",
    "Kênh C — chưa phân giải",
    "D — chưa phân giải",
    "E — chưa phân giải",
    "F — chưa phân giải",
    "G — chưa phân giải",
    "H — chưa phân giải",
  ];
  unresolvedNames.forEach((name, i) =>
    elements.push({
      id: "u" + i,
      name,
      elementType: "QUEUE_BROKER",
      description: "",
      layer: "unclassified",
      evidence: [],
    }),
  );
  const edges = [
    {
      id: "e0",
      from: "svc-a",
      to: "svc-b",
      protocol: "CODE_DEPENDENCY",
      originLayer: "STATIC",
      uncertain: false,
      evidence: [],
    },
    ...[0, 1, 2, 3].map((i) => ({
      id: "x" + i,
      from: "svc-b",
      to: "u" + i,
      protocol: "SERVICE_HTTP_CALL",
      originLayer: "STATIC",
      uncertain: true,
      evidence: [],
    })),
  ];
  const doc = selectDiagram(
    { id: "m", projectId: "p", snapshotId: "s", revision: 1, label: "R", elements, edges },
    "CONTAINER",
    undefined,
    { systemName: longName },
  ).document;
  assert.equal(
    doc.systemBoundary.unresolvedIds.length,
    8,
    "full unresolved list stays in traceable metadata",
  );
  assert.ok(
    doc.scopeWarning.includes("(+5 more; full list in view metadata)"),
    "legend warning is summarized, not silently truncated",
  );
  const modelIds = new Set(elements.map((e) => e.id));
  assert.ok(doc.projection.includedNodeIds.every((id) => modelIds.has(id)));
  assert.ok(!doc.projection.includedNodeIds.includes("system:boundary"));
  assert.equal(doc.projection.includedNodeIds.length, 10);
  const xml = await generateDrawio(doc);
  const legendCell = xml.match(/<mxCell id="mavis_legend" value="([^"]*)"/);
  assert.ok(legendCell);
  const legendGeom = xml.match(/<mxCell id="mavis_legend"[^>]*><mxGeometry[^>]*height="([0-9]+)"/);
  assert.ok(legendGeom);
  const legendLinesCount = legendCell[1].split("&#xa;").length;
  assert.equal(
    Number(legendGeom[1]),
    legendLinesCount * 17 + 24,
    "legend height must fit its wrapped content",
  );
  const boundaryCell = xml.match(
    /<mxCell id="[^"]+"[^>]*mavisId="system:boundary"[^>]*startSize=([0-9]+)/,
  );
  assert.ok(boundaryCell);
  const startSize = Number(boundaryCell[1]);
  assert.ok(startSize > 44, "long boundary name must grow the header instead of being covered");
  const child = xml.match(
    new RegExp('<mxCell id="[^"]+"[^>]*mavisId="svc-a"[^>]*><mxGeometry[^>]*y="([0-9.]+)"'),
  );
  assert.ok(child);
  assert.ok(Number(child[1]) >= startSize, "nodes must start below the boundary header");
});
test("C4 Container without classifiable containers warns and draws no boundary", () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const node = (id, name, type) => ({
    id,
    name,
    elementType: type,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [node("ext", "Payment provider", "EXTERNAL_SYSTEM")],
    edges: [],
  };
  const result = selectDiagram(model, "CONTAINER");
  assert.ok(!result.document.layoutJson.nodes.some((n) => n.id === "system:boundary"));
  assert.match(String(result.document.scopeWarning ?? ""), /no system boundary is drawn/);
});
test("C4 Container messaging labels append channel protocol only from channel properties", async () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const node = (id, name, type, props, technology) => ({
    id,
    name,
    elementType: type,
    properties: props,
    technology,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("producer", "orders-api", "SERVICE_CONTAINER"),
      node("consumer", "billing-api", "SERVICE_CONTAINER"),
      node("ch-ok", "order-events", "MESSAGE_CHANNEL", { protocol: "kafka" }),
      node("ch-xml", "billing-events", "MESSAGE_CHANNEL", { protocol: "Kafka & co <v3>" }),
      node("ch-missing", "missing-channel", "MESSAGE_CHANNEL"),
      node("ch-blank", "blank-channel", "MESSAGE_CHANNEL", { protocol: "   " }),
      node(
        "ch-nameonly",
        "kafka-topic",
        "MESSAGE_CHANNEL",
        { transportAuthority: "kafka" },
        "Kafka",
      ),
    ],
    edges: [
      {
        id: "pub-ok",
        from: "producer",
        to: "ch-ok",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "sub-ok",
        from: "ch-ok",
        to: "consumer",
        protocol: "MESSAGE_SUBSCRIBE",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "pub-xml",
        from: "consumer",
        to: "ch-xml",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "pub-missing",
        from: "producer",
        to: "ch-missing",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "pub-blank",
        from: "producer",
        to: "ch-blank",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "pub-nameonly",
        from: "producer",
        to: "ch-nameonly",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const doc = selectDiagram(model, "CONTAINER", undefined, {
    systemName: "OrderHub <test>",
  }).document;
  const xml = await generateDrawio(doc);
  assert.ok(
    xml.includes('value="Declares publishing to&#xa;[kafka]"'),
    "publish label with source-backed protocol",
  );
  assert.ok(
    xml.includes('value="Delivers messages to&#xa;[kafka]"'),
    "subscribe label with source-backed protocol",
  );
  assert.ok(
    xml.includes("[Kafka &amp; co &lt;v3&gt;]") && !xml.includes("[Kafka & co <v3>]"),
    "protocol with XML special chars must be escaped",
  );
  assert.equal(
    xml.match(/\[kafka\]/g).length,
    2,
    "exactly the two valid-protocol edges carry [kafka]",
  );
  assert.ok(!xml.includes("[Kafka]"), "no bare [Kafka] from any default or inference");
  const nameOnly = xml.match(
    /<mxCell id="[^"]+"[^>]*mavisId="view:pub-nameonly"[\s\S]*?<mxCell id="label_[^"]*" value="([^"]*)"/,
  );
  assert.ok(nameOnly);
  assert.equal(
    nameOnly[1],
    "Declares publishing to",
    "name/languageStack/transportAuthority must not fabricate protocol",
  );
  const missing = xml.match(
    /<mxCell id="[^"]+"[^>]*mavisId="view:pub-missing"[\s\S]*?<mxCell id="label_[^"]*" value="([^"]*)"/,
  );
  assert.equal(missing[1], "Declares publishing to", "missing protocol must not append anything");
  const blank = xml.match(
    /<mxCell id="[^"]+"[^>]*mavisId="view:pub-blank"[\s\S]*?<mxCell id="label_[^"]*" value="([^"]*)"/,
  );
  assert.equal(blank[1], "Declares publishing to", "blank protocol must not append anything");
  const edge = xml.match(/<mxCell [^>]*mavisId="view:pub-ok".*/);
  assert.ok(edge);
  assert.ok(edge[0].includes('mavisOriginLayer="STATIC"'));
  assert.ok(edge[0].includes('mavisRelationType="MESSAGE_PUBLISH"'));
});
test("messaging protocol labels are gated to the C4 Container view", async () => {
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const node = (id, name, type, props) => ({
    id,
    name,
    elementType: type,
    properties: props,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const nodes = [
    node("producer", "orders-api", "SERVICE_CONTAINER"),
    node("ch", "order-events", "MESSAGE_CHANNEL", { protocol: "kafka" }),
  ];
  const edges = [
    {
      id: "pub",
      from: "producer",
      to: "ch",
      type: "MESSAGE_PUBLISH",
      protocol: "MESSAGE_PUBLISH",
      originLayer: "STATIC",
      uncertain: false,
      evidence: [],
    },
  ];
  for (const [notation, level] of [
    ["DEPENDENCY_GRAPH", "SERVICE"],
    ["C4", "COMPONENT"],
  ]) {
    const xml = await generateDrawio({
      modelVersionId: "m",
      notation,
      level,
      viewId: "gate",
      layoutJson: { nodes, edges },
    });
    assert.ok(!xml.includes("[kafka]"), `${notation}/${level} must keep plain labels`);
    assert.ok(
      xml.includes("Declares publishing to"),
      `${notation}/${level} keeps the action label`,
    );
  }
});
test("containerMessagingLabel ignores null, number, object and array protocol values (S2e coverage)", () => {
  const { containerMessagingLabel } = require("../src/lib/drawio/rules.ts");
  const publish = "Declares publishing to";
  const edge = {
    id: "e",
    from: "p",
    to: "ch",
    type: "MESSAGE_PUBLISH",
    relationType: "MESSAGE_PUBLISH",
  };
  const subEdge = {
    id: "s",
    from: "ch",
    to: "p",
    type: "MESSAGE_SUBSCRIBE",
    relationType: "MESSAGE_SUBSCRIBE",
  };
  const channels = (props) =>
    new Map([["ch", { id: "ch", name: "events", kind: "MESSAGE_CHANNEL", properties: props }]]);
  // Hợp đồng helper: giá trị không hợp lệ trả null (caller fallback về nhãn hành động), không bao giờ trả nhãn giả.
  assert.equal(containerMessagingLabel(edge, channels({ protocol: null })), null);
  assert.equal(containerMessagingLabel(edge, channels({ protocol: 42 })), null);
  assert.equal(containerMessagingLabel(edge, channels({ protocol: { k: "v" } })), null);
  assert.equal(containerMessagingLabel(edge, channels({ protocol: ["a"] })), null);
  assert.equal(containerMessagingLabel(edge, channels()), null);
  assert.equal(containerMessagingLabel(edge, channels({ protocol: "   " })), null);
  assert.equal(
    containerMessagingLabel(edge, channels({ protocol: "kafka" })),
    publish + " [kafka]",
  );
  assert.equal(
    containerMessagingLabel(subEdge, channels({ protocol: "kafka" })),
    "Delivers messages to [kafka]",
  );
});
const { DOMParser } = require("./helpers/xml-dom-shim.cjs");
globalThis.DOMParser = DOMParser;
test("editor round-trip preserves C4 Container boundary, membership and metadata through extract and regroup", async () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const { extractDraftDocument } = require("../src/features/architecture/drawio-document.ts");
  const node = (id, name, type, props, parentId) => ({
    id,
    name,
    elementType: type,
    properties: props || {},
    parentId: parentId || null,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("svc-a", "orders-api", "SERVICE_CONTAINER"),
      node("svc-b", "billing-api", "SERVICE_CONTAINER"),
      node("db", "orders-db", "DATABASE", { resourceRole: "LOGICAL_DATASTORE" }),
      node("ch", "order-events", "MESSAGE_CHANNEL", {
        protocol: "kafka",
        transportAuthority: "kafka",
      }),
      node("ext", "Payment provider", "EXTERNAL_SYSTEM"),
      node("broker", "kafka", "QUEUE_BROKER"),
    ],
    edges: [
      {
        id: "e1",
        from: "svc-a",
        to: "svc-b",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e2",
        from: "svc-b",
        to: "db",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e3",
        from: "svc-a",
        to: "ext",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e4",
        from: "svc-b",
        to: "ch",
        protocol: "MESSAGE_SUBSCRIBE",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const doc = selectDiagram(model, "CONTAINER", undefined, { systemName: "Test1" }).document;
  const xml1 = await generateDrawio(doc);
  // extractDraftDocument với notation/level CHUẨN từ document (không parse từ title)
  const draft = extractDraftDocument(xml1, "m", "container", doc.notation, doc.level, "container");
  assert.equal(draft.notation, "C4");
  assert.equal(draft.level, "CONTAINER");
  const boundary = draft.layoutJson.nodes.find((n) => n.id === "system:boundary");
  assert.ok(boundary);
  assert.equal(boundary.kind, "SYSTEM_BOUNDARY");
  assert.equal(boundary.name, "Test1");
  const inside = draft.layoutJson.nodes
    .filter((n) => n.parentId === "system:boundary")
    .map((n) => n.id)
    .sort();
  assert.deepEqual(inside, ["ch", "db", "svc-a", "svc-b"]);
  assert.ok(
    draft.layoutJson.nodes.find((n) => n.id === "ext"),
    "ext must be in the draft",
  );
  assert.ok(draft.layoutJson.nodes.find((n) => n.id === "ext").parentId !== "system:boundary");
  assert.ok(
    draft.layoutJson.nodes.some((n) => n.id === "broker"),
    "recognized unconnected broker remains visible outside unresolved ownership boundary",
  );
  assert.deepEqual(
    draft.layoutJson.nodes.find((n) => n.id === "ch").properties,
    { protocol: "kafka", transportAuthority: "kafka" },
    "properties must survive the round-trip",
  );
  const edges1 = draft.layoutJson.edges;
  assert.equal(edges1.length, 4);
  assert.ok(edges1.every((e) => e.relationType && e.originLayer));
  // regroup + generate lại từ draft
  const xml2 = await generateDrawio(draft);
  const doc2 = new DOMParser().parseFromString(xml2, "text/xml");
  const boundaryCell = Array.from(doc2.querySelectorAll("mxCell")).find(
    (c) => c.getAttribute("mavisId") === "system:boundary",
  );
  assert.ok(boundaryCell);
  assert.equal(boundaryCell.getAttribute("mavisRole"), "boundary");
  const members = Array.from(doc2.querySelectorAll("mxCell")).filter(
    (c) => c.getAttribute("parent") === boundaryCell.getAttribute("id"),
  );
  assert.equal(members.length, 4);
  const allCells = Array.from(doc2.querySelectorAll("mxCell"));
  const cellIds = new Set(allCells.map((c) => c.getAttribute("id")));
  const orphans = allCells.filter((c) => {
    const p = c.getAttribute("parent");
    return p && p !== "1" && p !== boundaryCell.getAttribute("id") && !cellIds.has(p);
  });
  assert.deepEqual(
    orphans.map((c) => ({ id: c.getAttribute("id"), parent: c.getAttribute("parent") })),
    [],
    "no orphan parents",
  );
  // không phát sinh business node từ boundary
  assert.equal(
    Array.from(doc2.querySelectorAll("mxCell")).filter(
      (c) =>
        c.getAttribute("mavisId") === "system:boundary" &&
        c.getAttribute("mavisRole") !== "boundary",
    ).length,
    0,
  );
  const draft2 = extractDraftDocument(xml2, "m", "container", undefined, undefined, "container");
  assert.equal(
    draft2.level,
    "CONTAINER",
    "stored canonical metadata supports callers without display-title parsing",
  );
  assert.equal(draft2.layoutJson.nodes.find((n) => n.id === "system:boundary").viewLocal, true);
  assert.deepEqual(
    draft2.projection,
    doc.projection,
    "source membership/provenance survives repeated relayout",
  );
  assert.deepEqual(draft2.systemBoundary, doc.systemBoundary);
  assert.deepEqual(
    draft2.layoutJson.edges.map((e) => [
      e.id,
      e.from,
      e.to,
      e.relationType,
      e.originLayer,
      e.underlyingEdgeIds,
    ]),
    draft.layoutJson.edges.map((e) => [
      e.id,
      e.from,
      e.to,
      e.relationType,
      e.originLayer,
      e.underlyingEdgeIds,
    ]),
  );
  assert.deepEqual(draft2.layoutJson.nodes.find((n) => n.id === "ch").properties, {
    protocol: "kafka",
    transportAuthority: "kafka",
  });
  const editorEncoded = xml2.replace(/(<mxGraphModel)\s+mavisDocument="[^"]*"/, "$1");
  const editorDraft = extractDraftDocument(
    editorEncoded,
    "m",
    "container",
    undefined,
    undefined,
    "container",
  );
  assert.deepEqual(
    editorDraft.systemBoundary,
    doc.systemBoundary,
    "cell metadata survives editor removal of custom mxGraphModel attributes",
  );
  const broken = xml1.replace('mavisRole="boundary"', 'mavisRole="SERVICE_CONTAINER"');
  assert.throws(
    () => extractDraftDocument(broken, "m", "container", "C4", "CONTAINER", "container"),
    /lost its boundary metadata/,
  );
  const corrupt = xml1.replace('mavisProperties="{', 'mavisProperties="broken{');
  assert.throws(
    () => extractDraftDocument(corrupt, "m", "container", "C4", "CONTAINER", "container"),
    /metadata is invalid/,
  );
});
test("editor round-trip preserves C4 Component container boundary as a business node", async () => {
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const { extractDraftDocument } = require("../src/features/architecture/drawio-document.ts");
  const node = (id, name, type, props, parentId) => ({
    id,
    name,
    elementType: type,
    properties: props || {},
    parentId: parentId || null,
    description: "",
    layer: "unclassified",
    evidence: [],
  });
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Revision",
    elements: [
      node("svc", "ftgo-order-service", "SERVICE_CONTAINER"),
      node("ctrl", "OrderController", "COMPONENT", {}, "svc"),
      node("svc2", "KitchenServiceProxy", "COMPONENT", {}, "svc"),
    ],
    edges: [
      {
        id: "r1",
        from: "ctrl",
        to: "svc2",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const doc = selectDiagram(model, "COMPONENT", "svc").document;
  const xml1 = await generateDrawio(doc);
  const draft = extractDraftDocument(xml1, "m", "components:svc", doc.notation, doc.level, "svc");
  const containerNode = draft.layoutJson.nodes.find((n) => n.id === "svc");
  assert.equal(
    containerNode.kind,
    "SERVICE_CONTAINER",
    "container boundary is a real model element, not SYSTEM_BOUNDARY",
  );
  assert.equal(draft.scopeContainerId, "svc");
  assert.deepEqual(
    draft.layoutJson.nodes
      .filter((n) => n.parentId === "svc")
      .map((n) => n.id)
      .sort(),
    ["ctrl", "svc2"],
  );
  const xml2 = await generateDrawio(draft);
  const doc2 = new DOMParser().parseFromString(xml2, "text/xml");
  const boundaryCell = Array.from(doc2.querySelectorAll("mxCell")).find(
    (c) => c.getAttribute("mavisId") === "svc",
  );
  assert.equal(boundaryCell.getAttribute("mavisRole"), "boundary");
  const edges = Array.from(doc2.querySelectorAll("mxCell")).filter(
    (c) => c.getAttribute("edge") === "1",
  );
  assert.ok(
    edges.every((e) => e.getAttribute("parent") === "1"),
    "draw.io edges stay on the top layer by convention",
  );
  const boundaryMembers = Array.from(doc2.querySelectorAll("mxCell")).filter(
    (c) => c.getAttribute("parent") === boundaryCell.getAttribute("id"),
  );
  assert.equal(boundaryMembers.length, 2, "container boundary keeps its two components");
});

test("Cytoscape preserves source identity, parallel edges, loops and isolated nodes", () => {
  const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
  const cytoscape = require("cytoscape");
  const node = (id) => ({ id, name: id, elementType: "SERVICE_CONTAINER" });
  const edge = (id, from, to, extra = {}) => ({ id, from, to, protocol: "HTTP", ...extra });
  const model = {
    elements: [node("shared"), node("b"), node("isolated")],
    edges: [
      edge("shared", "shared", "b"),
      edge("parallel", "shared", "b", { uncertain: true }),
      edge("loop", "b", "b", { originLayer: "DEPLOYMENT" }),
    ],
  };
  const original = JSON.stringify(model);
  const cy = cytoscape({
    headless: true,
    elements: networkElements(model),
    layout: { name: "grid" },
  });
  try {
    assert.equal(cy.nodes().length, 3);
    assert.equal(cy.edges().length, 3);
    assert.equal(cy.getElementById("node:shared").data("sourceId"), "shared");
    assert.equal(cy.getElementById("node:shared").data("label"), "[SVC] shared");
    assert.equal(cy.getElementById("node:shared").data("name"), "shared");
    assert.equal(cy.getElementById("edge:shared").source().id(), "node:shared");
    assert.equal(cy.getElementById("edge:loop").isLoop(), true);
    assert.equal(cy.getElementById("edge:parallel").data("lineStyle"), "dotted");
    assert.equal(cy.getElementById("edge:loop").data("lineStyle"), "dashed");
    assert.equal(cy.getElementById("node:isolated").degree(), 0);
    assert.equal(JSON.stringify(model), original, "rendering must not mutate the API model");
  } finally {
    cy.destroy();
  }
});

test("Network node badges match the legend and preset positions preserve label spacing", () => {
  const {
    networkElements,
    networkBadge,
  } = require("../src/features/architecture/cytoscape-network.ts");
  for (const [type, badge] of Object.entries({
    SERVICE_CONTAINER: "[SVC]",
    DATABASE: "[DB]",
    COMPONENT: "[COMP]",
    MESSAGE_CHANNEL: "[QUEUE]",
    QUEUE_BROKER: "[QUEUE]",
    EXTERNAL_SYSTEM: "[EXT]",
  }))
    assert.equal(networkBadge(type), badge);
  assert.equal(networkBadge(), "[UNKNOWN]");
  const model = {
    elements: Array.from({ length: 17 }, (_, i) => ({
      id: `n${i}`,
      name: `long-service-name-${i}`,
      elementType: "SERVICE_CONTAINER",
    })),
    edges: Array.from({ length: 16 }, (_, i) => ({
      id: `e${i}`,
      from: "n0",
      to: `n${i + 1}`,
      protocol: "HTTP",
    })),
  };
  const nodes = networkElements(model).filter((n) => n.group === "nodes");
  assert.deepEqual(
    nodes,
    networkElements(model).filter((n) => n.group === "nodes"),
  );
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position,
        b = nodes[j].position;
      assert.ok(
        Math.abs(a.x - b.x) >= 195 || Math.abs(a.y - b.y) >= 89,
        "node and label footprints must remain separated",
      );
    }
  }
});

test("Network layout reduces geometric obstruction, uses viewport width, and distinguishes unknown types", () => {
  const {
    networkPositions,
    networkLayoutCost,
  } = require("../src/features/architecture/network-layout.ts");
  const {
    layoutGraph,
    NODE_WIDTH,
    NODE_HEIGHT,
  } = require("../src/features/architecture/graph-layout.ts");
  const { networkColor } = require("../src/features/architecture/cytoscape-network.ts");
  assert.notEqual(networkColor(undefined), networkColor("SERVICE_CONTAINER"));
  assert.equal(networkColor("UNRECOGNIZED_TYPE"), networkColor(undefined));
  const model = {
    elements: Array.from({ length: 17 }, (_, i) => ({
      id: `n${i}`,
      name: `service-${i}`,
      elementType: "SERVICE_CONTAINER",
    })),
    edges: Array.from({ length: 29 }, (_, i) => ({
      id: `e${i}`,
      from: `n${i % 17}`,
      to: `n${(i * 7 + 3) % 17}`,
      protocol: "HTTP",
    })),
  };
  const original = JSON.stringify(model);
  const base = layoutGraph(model);
  const width = Math.max(...base.map((n) => n.x)) - Math.min(...base.map((n) => n.x)) + NODE_WIDTH;
  const height =
    Math.max(...base.map((n) => n.y)) - Math.min(...base.map((n) => n.y)) + NODE_HEIGHT;
  const initial = new Map(
    base.map((n) => [
      n.id,
      {
        x: (n.x + NODE_WIDTH / 2) * Math.max(1, (2.5 * height) / width),
        y: (n.y + NODE_HEIGHT / 2) * Math.max(1, width / (2.5 * height)),
      },
    ]),
  );
  const optimized = networkPositions(model, 2.5);
  assert.ok(
    networkLayoutCost(model, optimized) < networkLayoutCost(model, initial),
    "reduce crossings and unrelated-node obstructions relative to force layout",
  );
  assert.deepEqual(optimized, networkPositions(model, 2.5));
  const xs = [...optimized.values()].map((p) => p.x),
    ys = [...optimized.values()].map((p) => p.y);
  const ratio =
    (Math.max(...xs) - Math.min(...xs) + NODE_WIDTH) /
    (Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT);
  assert.ok(
    ratio > 2 && ratio < 3,
    "spread into the wide viewport without compressing node spacing",
  );
  assert.equal(JSON.stringify(model), original);
});

test("Explore presentation preserves graph identity, camera, manual positions and source selection", () => {
  const cytoscape = require("cytoscape");
  const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
  const {
    applyNetworkMode,
    exploreStyles,
  } = require("../src/features/architecture/network-presentation.ts");
  const model = {
    elements: ["hub", "a", "b", "isolated"].map((id) => ({
      id,
      name: id,
      elementType: "SERVICE_CONTAINER",
    })),
    edges: [
      { id: "e1", from: "hub", to: "a", protocol: "HTTP" },
      { id: "e2", from: "hub", to: "b", protocol: "HTTP" },
    ],
  };
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: networkElements(model),
    layout: { name: "preset" },
    style: [
      {
        selector: "node",
        style: { width: "data(size)", height: "data(size)", label: "data(label)" },
      },
      ...exploreStyles,
    ],
  });
  try {
    const hub = cy.getElementById("node:hub"),
      isolated = cy.getElementById("node:isolated");
    hub.position({ x: 123, y: 234 }).addClass("focused");
    cy.zoom(0.8);
    cy.pan({ x: 12, y: 34 });
    const camera = { zoom: cy.zoom(), pan: { ...cy.pan() } };
    const sourceIds = cy.elements().map((e) => e.data("sourceId"));
    applyNetworkMode(cy, "explore");
    assert.ok(hub.hasClass("explore") && hub.hasClass("hub") && hub.hasClass("focused"));
    assert.ok(hub.width() > isolated.width(), "connection count controls visual size");
    assert.equal(isolated.style("text-opacity"), "0");
    assert.equal(hub.style("text-opacity"), "1");
    assert.ok(Number(cy.edges()[0].style("opacity")) < 0.5);
    cy.zoom(1.2);
    applyNetworkMode(cy, "explore");
    assert.equal(isolated.style("text-opacity"), "1", "zoom reveals detail labels");
    cy.zoom(camera.zoom);
    applyNetworkMode(cy, "analysis");
    assert.ok(!hub.hasClass("explore") && hub.hasClass("focused"));
    assert.equal(hub.width(), hub.data("size"));
    assert.deepEqual(hub.position(), { x: 123, y: 234 });
    assert.deepEqual({ zoom: cy.zoom(), pan: { ...cy.pan() } }, camera);
    assert.deepEqual(
      cy.elements().map((e) => e.data("sourceId")),
      sourceIds,
    );
  } finally {
    cy.destroy();
  }
});

test("Explore clusters use real connections and parent ownership and restore each presentation independently", () => {
  const cytoscape = require("cytoscape");
  const {
    exploreClusters,
    explorePositions,
    exploreAppearance,
  } = require("../src/features/architecture/explore-layout.ts");
  const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
  const {
    createNetworkPresentation,
  } = require("../src/features/architecture/network-presentation.ts");
  const model = {
    elements: [
      { id: "a", name: "Orders", elementType: "SERVICE_CONTAINER" },
      { id: "b", name: "Payments", elementType: "SERVICE_CONTAINER" },
      { id: "db", name: "Orders DB", elementType: "DATABASE", parentId: "a" },
      { id: "unknown", name: "Framework", elementType: "UNKNOWN" },
      { id: "isolated", name: "Isolated", elementType: "COMPONENT" },
    ],
    edges: [
      { id: "e1", from: "b", to: "db", protocol: "HTTP" },
      { id: "e2", from: "a", to: "b", protocol: "HTTP" },
      { id: "e3", from: "a", to: "unknown", protocol: "HTTP" },
    ],
  };
  const original = JSON.stringify(model);
  assert.equal(
    exploreClusters(model).owners.get("db"),
    "a",
    "explicit parent overrides nearest connected service",
  );
  const p = explorePositions(model),
    appearance = exploreAppearance(model);
  assert.equal(p.size, model.elements.length);
  assert.deepEqual(p, explorePositions(model));
  assert.notEqual(appearance.get("a").color, appearance.get("b").color);
  assert.equal(appearance.get("a").color, appearance.get("db").color);
  assert.equal(appearance.get("unknown").color, "#94a3b8");
  assert.ok(appearance.get("a").image.startsWith("data:image/svg+xml;utf8,"));
  const cy = cytoscape({
    headless: true,
    elements: networkElements(model),
    layout: { name: "preset" },
  });
  try {
    const present = createNetworkPresentation(cy, model),
      node = cy.getElementById("node:a");
    node.position({ x: 101, y: 202 });
    cy.zoom(0.8);
    cy.pan({ x: 12, y: 34 });
    present("explore");
    assert.notDeepEqual(node.position(), { x: 101, y: 202 });
    node.position({ x: 303, y: 404 });
    cy.zoom(1.4);
    cy.pan({ x: 45, y: 67 });
    present("analysis");
    assert.deepEqual(node.position(), { x: 101, y: 202 });
    assert.equal(cy.zoom(), 0.8);
    assert.deepEqual(cy.pan(), { x: 12, y: 34 });
    present("explore");
    assert.deepEqual(node.position(), { x: 303, y: 404 });
    assert.equal(cy.zoom(), 1.4);
    assert.deepEqual(cy.pan(), { x: 45, y: 67 });
    assert.equal(cy.nodes().length, 5);
    assert.equal(cy.edges().length, 3);
    assert.equal(JSON.stringify(model), original);
  } finally {
    cy.destroy();
  }
});

test("Explore electricity follows curved paths and cancels frames for cleanup and reduced motion", () => {
  const {
    pulsePoint,
    startNetworkPulse,
  } = require("../src/features/architecture/network-pulse.ts");
  assert.deepEqual(pulsePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 100 }], 0.5), {
    x: 50,
    y: 50,
  });
  assert.deepEqual(pulsePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, [], 1), { x: 100, y: 0 });
  const previous = {
    window: global.window,
    raf: global.requestAnimationFrame,
    caf: global.cancelAnimationFrame,
  };
  let reduced = false,
    serial = 0,
    strokes = 0;
  const frames = new Map(),
    listeners = new Set();
  const ctx = {
    clearRect() {},
    setTransform() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    stroke() {
      strokes++;
    },
    fill() {},
    moveTo() {},
    lineTo() {},
  };
  const canvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => ctx,
  };
  const edge = {
    renderedSourceEndpoint: () => ({ x: 0, y: 0 }),
    renderedTargetEndpoint: () => ({ x: 100, y: 0 }),
    controlPoints: () => [{ x: 50, y: 100 }],
    data: () => "#a78bfa",
  };
  const node = {
    empty: () => false,
    connectedEdges: () => [edge],
    renderedPosition: () => ({ x: 0, y: 0 }),
    data: () => "#a78bfa",
  };
  const cy = {
    nodes: () => ({ filter: () => ({ first: () => node }) }),
    destroyed: () => false,
    zoom: () => 1,
    pan: () => ({ x: 0, y: 0 }),
  };
  global.window = {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: reduced,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    }),
  };
  global.requestAnimationFrame = (fn) => {
    frames.set(++serial, fn);
    return serial;
  };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  const tick = (time) => {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((fn) => fn(time));
  };
  try {
    const stop = startNetworkPulse(cy, "node", canvas);
    tick(0);
    tick(500);
    assert.ok(strokes > 10, "draw the pulse trail along the rendered edge");
    assert.equal(frames.size, 1);
    stop();
    assert.equal(frames.size, 0);
    assert.equal(listeners.size, 0);
    startNetworkPulse(cy, "node", canvas);
    tick(0);
    tick(1600);
    assert.equal(frames.size, 0, "animation terminates without a perpetual frame loop");
    reduced = true;
    startNetworkPulse(cy, "node", canvas);
    assert.equal(frames.size, 0);
    assert.equal(listeners.size, 0);
  } finally {
    for (const [key, value] of [
      ["window", previous.window],
      ["requestAnimationFrame", previous.raf],
      ["cancelAnimationFrame", previous.caf],
    ]) {
      if (value === undefined) delete global[key];
      else global[key] = value;
    }
  }
});

test("Pulse handles straight edges without calling Cytoscape's unsafe renderedControlPoints", () => {
  const { pulseControls, pulsePoint } = require("../src/features/architecture/network-pulse.ts");
  const straight = {
    controlPoints: () => undefined,
    renderedControlPoints: () => {
      throw new TypeError("Cannot read properties of undefined (reading 'map')");
    },
  };
  assert.deepEqual(pulseControls(straight, 2, { x: 10, y: 20 }), []);
  assert.deepEqual(
    pulsePoint(
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      pulseControls(straight, 2, { x: 10, y: 20 }),
      0.5,
    ),
    { x: 60, y: 20 },
  );
  assert.deepEqual(pulseControls({ controlPoints: () => [{ x: 5, y: 7 }] }, 2, { x: 10, y: 20 }), [
    { x: 20, y: 34 },
  ]);
});

test("Cytoscape focus follows grouped source edges and collapsed component evidence", () => {
  const { networkFocus } = require("../src/features/architecture/cytoscape-network.ts");
  const source = {
    elements: [{ id: "service" }, { id: "component", parentId: "service" }, { id: "db" }],
    edges: [],
  };
  const view = {
    elements: [{ id: "service" }, { id: "db" }],
    edges: [
      { id: "group", from: "service", to: "db", underlyingEdgeIds: ["original-1", "original-2"] },
    ],
  };
  const selected = networkFocus(source, view, "original-2", []);
  assert.deepEqual([...selected.edges], ["group"]);
  assert.deepEqual([...selected.nodes].sort(), ["db", "service"]);
  const highlight = networkFocus(source, view, "original-2", ["component"]);
  assert.deepEqual([...highlight.nodes], ["service"]);
  assert.equal(highlight.edges.size, 0, "explicit highlights override selection focus");
  assert.equal(networkFocus(source, view, null, []).active, false);
});

test("themeDrawioXml applies all 5 themes across C4 Context, UML Sequence, and UML Class/Package/Deployment/Activity/State and restores clean palette", () => {
  const { themeDrawioXml } = require("../src/features/architecture/drawio-document.ts");
  const {
    buildContextDiagramDrawioXml,
  } = require("../src/features/architecture/diagram-projections.ts");
  const {
    interactionToDrawioXml,
    buildAutoSequenceInteraction,
    detectSequenceFlows,
  } = require("../src/features/architecture/scenario-design.ts");
  const {
    projectUmlClassDiagram,
    buildUmlDrawioXml,
  } = require("../src/features/architecture/uml-diagrams.ts");
  const model = {
    id: "m1",
    projectId: "p1",
    snapshotId: "s1",
    revision: 1,
    label: "Rev 1",
    elements: [
      {
        id: "svc1",
        name: "OrderService",
        elementType: "SERVICE_CONTAINER",
        properties: {},
        parentId: null,
        description: "",
        layer: "unclassified",
        evidence: [],
      },
      {
        id: "c1",
        name: "OrderController",
        elementType: "COMPONENT",
        properties: { fqn: "com.acme.OrderController", methods: ["createOrder(OrderDto): Order"] },
        parentId: "svc1",
        description: "",
        layer: "controller",
        evidence: [],
      },
      {
        id: "c2",
        name: "OrderRepository",
        elementType: "COMPONENT",
        properties: { fqn: "com.acme.OrderRepository", methods: ["save(Order): Order"] },
        parentId: "svc1",
        description: "",
        layer: "repository",
        evidence: [],
      },
    ],
    edges: [
      {
        id: "e1",
        from: "c1",
        to: "c2",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const ctxXml = buildContextDiagramDrawioXml(model, "OrderSystem");
  const flows = detectSequenceFlows(model, "MICRO");
  const seqXml = interactionToDrawioXml(buildAutoSequenceInteraction(model, flows[0]));
  const umlXml = buildUmlDrawioXml(projectUmlClassDiagram(model, "ALL"));
  for (const baseXml of [ctxXml, seqXml, umlXml]) {
    const darkXml = themeDrawioXml(baseXml, "dark");
    assert.ok(darkXml.includes('background="#161B22"'), "dark theme sets #161B22 background");
    assert.ok(darkXml.includes('mavisTheme="dark"'), "dark theme stamps mavisTheme=dark");
    const blueprintXml = themeDrawioXml(baseXml, "blueprint");
    assert.ok(
      blueprintXml.includes('background="#082032"'),
      "blueprint theme sets #082032 background",
    );
    const vibrantXml = themeDrawioXml(baseXml, "vibrant");
    assert.ok(
      vibrantXml.includes('mavisTheme="vibrant"'),
      "vibrant theme stamps mavisTheme=vibrant",
    );
    const monoXml = themeDrawioXml(baseXml, "monochrome");
    assert.ok(monoXml.includes('background="#FFFFFF"'), "monochrome theme sets #FFFFFF background");
    const restoredClean = themeDrawioXml(darkXml, "clean", baseXml);
    assert.ok(
      !restoredClean.includes('background="#161B22"'),
      "clean theme restores light background from cleanXml baseline",
    );
    assert.ok(
      restoredClean.includes('background="#FFFFFF"'),
      "clean theme sets #FFFFFF background",
    );
  }
});

test("3E simplified AI explanation and concrete code evidence collector always provide plain-English 3E pillars and real code snippets", () => {
  const {
    buildThreeESubjectContext,
    collectConcreteThreeEEvidences,
    buildDeterministicThreeESimplified,
    buildThreeEAiContext,
    explainEvidenceSnippetSimply,
  } = require("../src/features/architecture/three-e-content.ts");
  const model = {
    id: "m1",
    projectId: "p1",
    snapshotId: "s1",
    revision: 1,
    label: "Rev 1",
    elements: [
      {
        id: "svc1",
        name: "ftgo-order-service",
        elementType: "SERVICE_CONTAINER",
        properties: {},
        parentId: null,
        description: "",
        layer: "unclassified",
        evidence: [],
      },
      {
        id: "c1",
        name: "OrderController",
        elementType: "COMPONENT",
        properties: {
          fqn: "net.chrisrichardson.ftgo.orderservice.web.OrderController",
          methods: ["create(CreateOrderRequest): CreateOrderResponse"],
        },
        parentId: "svc1",
        description: "",
        layer: "controller",
        evidence: [
          {
            id: "ev1",
            kind: "source",
            sourceType: "SOURCE_CODE",
            location: "OrderController.java:28",
            snippet:
              '@RestController\npublic class OrderController {\n  @PostMapping("/orders")\n  public CreateOrderResponse create(@RequestBody CreateOrderRequest req) { ... }\n}',
            complete: true,
          },
        ],
      },
      {
        id: "db1",
        name: "ftgo-order-db",
        elementType: "DATABASE",
        properties: { resourceRole: "LOGICAL_DATASTORE" },
        parentId: null,
        description: "",
        layer: "data",
        evidence: [],
      },
    ],
    edges: [
      {
        id: "e1",
        from: "svc1",
        to: "db1",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };
  const svcCtx = buildThreeESubjectContext({ model, selectedId: "svc1" });
  const svcEvidences = collectConcreteThreeEEvidences(model, svcCtx, [], []);
  assert.ok(
    svcEvidences.length >= 1,
    "parent service collects concrete code snippets from child components",
  );
  assert.match(
    svcEvidences[0].snippet,
    /@RestController/,
    "concrete code snippet includes actual source code",
  );
  const simplified = buildDeterministicThreeESimplified(model, svcCtx, svcEvidences, [
    { id: "f1", ruleId: "RULE-02", message: "Chia sẻ bảng dữ liệu" },
  ]);
  assert.match(simplified.explainSimple, /ftgo-order-service/);
  assert.match(simplified.exploreSimple, /OrderController\.java:28/);
  assert.match(simplified.evaluateSimple, /Chia sẻ bảng dữ liệu/);
  assert.match(explainEvidenceSnippetSimply(svcEvidences[0], "ftgo-order-service"), /API/);
  const aiCtx = buildThreeEAiContext(model, svcCtx, svcEvidences, []);
  assert.ok(aiCtx.contextHash.startsWith("3e:m1:"));
  assert.equal(aiCtx.codeSnippets.length, 1);
  const edgeCtx = buildThreeESubjectContext({ model, selectedId: "e1" });
  const edgeEvidences = collectConcreteThreeEEvidences(model, edgeCtx, [], []);
  assert.ok(
    edgeEvidences.length >= 1,
    "edge without raw evidence exposes metadata without inventing implementation",
  );
  assert.equal(edgeEvidences[0].origin, "preview");
  assert.doesNotMatch(edgeEvidences[0].snippet, /JpaRepository|jdbc:mysql|restTemplate/);
});

test("computeArchitectureImpact computes upstream blast radius and downstream dependencies across all, source, and components scopes", () => {
  const { computeArchitectureImpact } = loadRoutedComponent("src/routes/impact.tsx");
  const { impactWarning } = require("../src/lib/mainflow-api.ts");
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/ftgo-component.json"), "utf8"),
  );
  const model = {
    id: raw.modelVersionId,
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "FTGO",
    elements: raw.layoutJson.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      elementType: n.kind,
      parentId: n.parentId,
      technology: n.languageStack,
      properties: n.properties,
      description: n.description ?? "",
      layer: "unclassified",
      evidence: [],
    })),
    edges: raw.layoutJson.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      protocol: e.type,
      originLayer: e.originLayer,
      uncertain: false,
      evidence: [],
    })),
  };
  const zipkin = model.elements.find((e) => e.name === "zipkin");
  const zipkinImpact = computeArchitectureImpact(model, zipkin.id, "all");
  assert.equal(
    zipkinImpact.directImpactCount,
    2,
    "ftgo-delivery-service and ftgo-order-service directly depend on zipkin",
  );
  assert.equal(
    zipkinImpact.indirectImpactCount,
    2,
    "ftgo-api-gateway (2 hops) and ftgo-kitchen-service (3 hops) are indirectly impacted",
  );
  assert.equal(zipkinImpact.upstreamImpacted.length, 4);

  const delivery = model.elements.find((e) => e.name === "ftgo-delivery-service");
  const deliverySourceImpact = computeArchitectureImpact(model, delivery.id, "source");
  assert.ok(
    deliverySourceImpact.upstreamImpacted.some((h) => h.name === "ftgo-api-gateway"),
    "ftgo-api-gateway depends on ftgo-delivery-service via rolled-up component CODE_DEPENDENCY",
  );

  const order = model.elements.find((e) => e.name === "ftgo-order-service");
  const orderAllImpact = computeArchitectureImpact(model, order.id, "all");
  assert.ok(
    orderAllImpact.downstreamDependencies.length >= 5,
    "ftgo-order-service has downstream database and infrastructure dependencies",
  );

  const orderCtrl = model.elements.find(
    (e) => e.name === "OrderController" && e.parentId === order.id,
  );
  const compImpact = computeArchitectureImpact(model, orderCtrl.id, "components");
  assert.ok(
    compImpact.downstreamDependencies.some((h) => h.name === "OrderRepository"),
    "OrderController depends on OrderRepository in components scope",
  );
  assert.ok(
    compImpact.downstreamDependencies.some((h) => h.name === "localhost" && h.distance === 2),
    "OrderController transitively depends on localhost database at 2 hops",
  );

  assert.match(impactWarning("ONE_SHORTEST_PATH_PER_SERVICE"), /shortest dependency path/);
  assert.match(
    impactWarning("EMPTY_RESULT_DOES_NOT_PROVE_ABSENCE_OUTSIDE_COVERAGE"),
    /policy scope/,
  );
});

test("reconcileModelDiff pairs identical elements across revisions with new UUIDs and computes field-by-field side-by-side diffs", () => {
  const { reconcileModelDiff } = loadRoutedComponent("src/features/architecture/model-editor.tsx");
  const falsePositiveRaw = {
    baseRevision: 3,
    targetRevision: 4,
    removedElements: [
      {
        id: "u1",
        name: "zookeeper",
        elementType: "SERVICE_CONTAINER",
        languageStack: "JAVA_SPRING",
        properties: {},
      },
      {
        id: "u2",
        name: "OrderService",
        elementType: "COMPONENT",
        parentElementName: "ftgo-order-service",
        languageStack: "JAVA_SPRING",
        properties: { layer: "service", description: "Old description" },
      },
      {
        id: "u3",
        name: "LegacyQueue",
        elementType: "QUEUE_BROKER",
        languageStack: "RabbitMQ",
        properties: {},
      },
    ],
    addedElements: [
      {
        id: "v1",
        name: "zookeeper",
        elementType: "SERVICE_CONTAINER",
        languageStack: "JAVA_SPRING",
        properties: {},
      },
      {
        id: "v2",
        name: "OrderService",
        elementType: "COMPONENT",
        parentElementName: "ftgo-order-service",
        languageStack: "JAVA_SPRING",
        properties: { layer: "domain", description: "Updated domain service" },
      },
      {
        id: "v3",
        name: "RedisCache",
        elementType: "DATABASE",
        languageStack: "Redis",
        properties: {},
      },
    ],
    removedRelationships: [
      {
        id: "r1",
        sourceElementName: "ftgo-order-service",
        targetElementName: "zookeeper",
        relationType: "DECLARED_COMPOSE",
        originLayer: "DEPLOYMENT",
        direction: "DIRECTED",
      },
    ],
    addedRelationships: [
      {
        id: "r2",
        sourceElementName: "ftgo-order-service",
        targetElementName: "zookeeper",
        relationType: "DECLARED_COMPOSE",
        originLayer: "DEPLOYMENT",
        direction: "DIRECTED",
      },
      {
        id: "r3",
        sourceElementName: "ftgo-order-service",
        targetElementName: "RedisCache",
        relationType: "DATABASE_ACCESS",
        originLayer: "STATIC",
        direction: "DIRECTED",
      },
    ],
  };
  const diff = reconcileModelDiff(falsePositiveRaw);
  assert.equal(
    diff.unchangedElementsCount,
    1,
    "zookeeper is matched as unchanged despite new UUID",
  );
  assert.equal(
    diff.modifiedElementsCount,
    1,
    "OrderService is matched as modified instead of 1 removed + 1 added",
  );
  assert.equal(diff.addedElementsCount, 1, "RedisCache is added");
  assert.equal(diff.removedElementsCount, 1, "LegacyQueue is removed");
  assert.equal(
    diff.unchangedRelationshipsCount,
    1,
    "zookeeper relationship is matched as unchanged",
  );
  assert.equal(diff.addedRelationshipsCount, 1, "RedisCache relationship is added");
  const modRow = diff.rows.find((r) => r.status === "modified");
  assert.equal(modRow.title, "OrderService");
  assert.equal(modRow.fieldDiffs.map((f) => f.field).join(","), "layer,description");
  assert.equal(modRow.fieldDiffs[0].before, "service");
  assert.equal(modRow.fieldDiffs[0].after, "domain");
});

test("My Workspaces is a compact LMS class list with tabs and a module outline", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { ApiContext, SelectionContext } = require("../src/providers/app-context.ts");
  const {
    Workspaces,
    WorkspaceOverview,
    WorkspaceMembers,
  } = require("../src/features/workspaces/screens.tsx");
  const classes = [
    {
      id: "ws-swd",
      code: "SWD392",
      name: "Lớp SWD392",
      myRole: "LECTURER",
      status: "ACTIVE",
      members: [
        { id: "u1", name: "Lecturer", role: "LECTURER" },
        { id: "u2", name: "Student A", role: "STUDENT" },
      ],
    },
    {
      id: "ws-prm",
      code: "PRM392",
      name: "Mobile Programming",
      myRole: "LECTURER",
      status: "ACTIVE",
      members: [],
    },
  ];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["api", "session", {}], {
    user: { id: "u1", name: "Lecturer", email: "lec@example.com", role: "lecturer" },
  });
  client.setQueryData(["api", "workspaces", {}], classes);
  const api = {
    mode: "backend",
    execute: () => {
      throw Error("Unexpected request");
    },
  };
  const renderComp = (Comp, workspaceId, search = "") => {
    const RoutedComp =
      Comp === WorkspaceOverview
        ? loadRoutedComponent("src/features/workspaces/screens.tsx", {
            "next/navigation": { useSearchParams: () => new URLSearchParams(search) },
          }).WorkspaceOverview
        : Comp;
    return renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          ApiContext.Provider,
          { value: api },
          React.createElement(
            SelectionContext.Provider,
            { value: { projectId: "", workspaceId, setProjectId() {}, setWorkspaceId() {} } },
            React.createElement(RoutedComp),
          ),
        ),
      ),
    );
  };
  const assignments = [
    {
      id: "a1",
      workspaceId: "ws-swd",
      title: "Lab 1 Architecture",
      instructions: "Analyze C4",
      dueAt: "No deadline",
      requiredDiagramTypes: [],
    },
    {
      id: "a2",
      workspaceId: "ws-swd",
      title: "Lab 2 Sequence",
      instructions: "Trace flow",
      dueAt: "No deadline",
      requiredDiagramTypes: [],
    },
  ];
  client.setQueryData(["api", "assignments", { workspaceId: "ws-swd" }], assignments);
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
          title: "Lab 1 Architecture",
          description: "",
          position: 3,
          assignmentId: "a1",
          content: {},
          required: true,
        },
      ],
    },
  ];
  client.setQueryData(["api", "course-authoring", "ws-swd"], {
    id: "course-1",
    workspaceId: "ws-swd",
    title: "Software Architecture",
    description: "",
    status: "DRAFT",
    draftRevision: 4,
    publishedVersion: 1,
    modules,
  });
  client.setQueryData(
    ["api", "course-versions", "ws-swd"],
    [
      {
        version: 1,
        draftRevision: 3,
        snapshotDigest: "sha256:" + "a".repeat(64),
        publishedAt: "2026-11-16T00:00:00Z",
      },
    ],
  );
  client.setQueryData(["api", "course-published", "ws-swd"], {
    courseId: "course-1",
    version: 1,
    draftRevision: 3,
    snapshotDigest: "sha256:" + "a".repeat(64),
    publishedAt: "2026-11-16T00:00:00Z",
    snapshot: { title: "Software Architecture", description: "", modules },
  });
  client.setQueryData(["api", "course-roadmap", "ws-swd"], {
    guided: true,
    enrollmentStatus: "IN_PROGRESS",
    labs: [
      {
        assignmentId: "a1",
        position: 1,
        title: "Lab 1 Architecture",
        state: "UNLOCKED",
        reason: null,
      },
      {
        assignmentId: "a2",
        position: 2,
        title: "Lab 2 Sequence",
        state: "LOCKED",
        reason: "PREREQUISITE",
      },
    ],
  });
  const rootHtml = renderComp(Workspaces, "");
  assert.match(rootHtml, /Create class/);
  assert.match(rootHtml, /Lớp SWD392/);
  assert.match(rootHtml, /Mobile Programming/);
  assert.match(rootHtml, /Open class/);
  assert.doesNotMatch(
    rootHtml,
    /Create a place for learning to take shape/,
    "Class list must not use the marketing hero",
  );
  assert.doesNotMatch(rootHtml, /Workspace code/, "Create class form stays closed until requested");
  const overviewHtml = renderComp(WorkspaceOverview, "ws-swd");
  assert.match(overviewHtml, /aria-label="Class sections"/);
  assert.match(overviewHtml, /Overview &amp; Setup/);
  assert.match(overviewHtml, /Curriculum &amp; Materials/);
  assert.match(overviewHtml, /Labs &amp; Quiz Studio/);
  assert.match(overviewHtml, /Grading &amp; Gradebook/);
  assert.match(overviewHtml, /Students &amp; Access/);
  assert.match(overviewHtml, /Enrolled Students/);
  assert.match(overviewHtml, /Class Passkey/);
  assert.match(overviewHtml, /Foundations/);
  assert.match(overviewHtml, /Service boundaries/);
  assert.match(overviewHtml, /Lab 1 Architecture/);
  const authoringHtml = renderComp(WorkspaceOverview, "ws-swd", "view=course-authoring");
  assert.match(authoringHtml, /Delete module/);
  assert.match(authoringHtml, /aria-label="Curriculum Inspector"/);
  assert.doesNotMatch(authoringHtml, /id="course-outline-title"/);
  const setupHtml = renderComp(WorkspaceOverview, "ws-swd", "view=course-setup");
  assert.match(setupHtml, /Loading course setup/);
  assert.doesNotMatch(setupHtml, /id="course-outline-title"/);
  const unknownViewHtml = renderComp(WorkspaceOverview, "ws-swd", "view=unknown");
  assert.match(unknownViewHtml, /Foundations/);
  assert.doesNotMatch(
    overviewHtml,
    /Add students in bulk/,
    "Overview must not include member management",
  );
  const membersHtml = renderComp(WorkspaceMembers, "ws-swd");
  assert.match(
    membersHtml,
    /Class sections/,
    "lecturer class view shows unified 5-tab navigation",
  );
  assert.match(membersHtml, /Students &amp; Access/);
  client.setQueryData(["api", "session", {}], {
    user: { id: "u2", name: "Student A", email: "student@example.com", role: "student" },
  });
  const studentMembersHtml = renderComp(WorkspaceMembers, "ws-swd");
  assert.match(
    studentMembersHtml,
    /aria-label="Class sections"/,
    "members view keeps class tabs available across roles",
  );
  client.setQueryData(["api", "session", {}], {
    user: { id: "u1", name: "Lecturer", email: "lec@example.com", role: "lecturer" },
  });
  assert.match(membersHtml, /Add students in bulk/);
  assert.match(membersHtml, /Student A/);
  assert.match(
    membersHtml,
    /Class settings/,
    "Class rename/archive lives in a separate settings area",
  );
  assert.match(membersHtml, /Rename/);
  assert.match(membersHtml, /Archive workspace/);
  const { WorkspaceSelector } = require("../src/features/workspaces/components.tsx");
  assert.equal(
    renderComp(WorkspaceSelector, "ws-swd"),
    "",
    "WorkspaceSelector hides when class is already selected",
  );
  const { Assignments } = require("../src/features/assignments/screens.tsx");
  const assignmentsHtml = renderComp(Assignments, "ws-swd");
  assert.match(assignmentsHtml, /Lab 1 Architecture/);
  assert.match(assignmentsHtml, /Lab 2 Sequence/);
  assert.match(assignmentsHtml, /Create a Lab/);
  assert.doesNotMatch(
    assignmentsHtml,
    /Assignment title/,
    "Lab authoring form stays closed until button is clicked",
  );
  client.clear();
});

test("archify + diagram-design geometry upgrades: snap4, port rhythm, sliding label candidates, arc tracks, and verification gate", () => {
  const {
    snap4,
    estimateLabelBox,
    wrapEdgeLabelLines,
    segmentRidesRectBorder,
    applyPortRhythmBridge,
    spreadSidePorts,
    slidingLabelCandidates,
    assignArcTrackLevels,
    inspectGeometry,
  } = require("../src/lib/drawio/geometry.ts");

  assert.equal(snap4(13), 12);
  assert.equal(snap4(14), 16);

  const boxEst = estimateLabelBox("HTTPS · JSON payload", 11);
  assert.equal(boxEst.width % 4, 0);
  assert.equal(boxEst.height % 4, 0);

  const wrapped = wrapEdgeLabelLines("1..* long_association_role_label_for_edge", 18);
  assert.ok(wrapped.length >= 2);
  assert.ok(wrapped.length <= 3);

  assert.equal(
    segmentRidesRectBorder(
      { x: 100, y: 94 },
      { x: 220, y: 94 },
      { id: "r", x: 80, y: 100, width: 200, height: 80 },
      12,
    ),
    true,
  );

  const bridged = applyPortRhythmBridge(
    [
      { x: 100, y: 180 },
      { x: 100, y: 200 },
      { x: 260, y: 200 },
      { x: 260, y: 300 },
    ],
    "bottom",
    "top",
    20,
  );
  assert.ok(bridged[1].y >= 200);

  const ports = spreadSidePorts(
    [
      { id: "e1", refCoord: 100 },
      { id: "e2", refCoord: 200 },
      { id: "e3", refCoord: 300 },
    ],
    180,
  );
  assert.equal(ports.size, 3);
  assert.ok(ports.get("e1") >= 0.14 && ports.get("e3") <= 0.86);

  const cands = slidingLabelCandidates({ x: 100, y: 100 }, { x: 340, y: 100 }, 64, 20);
  assert.ok(cands.length >= 10);

  const tracks = assignArcTrackLevels([
    { id: "a", start: 100, end: 300 },
    { id: "b", start: 150, end: 250 },
    { id: "c", start: 340, end: 460 },
  ]);
  assert.notEqual(tracks.get("a"), tracks.get("b"), "Overlapping spans get separate tracks");
  assert.equal(tracks.get("c"), 0, "Non-overlapping span reuses track 0");

  const report = inspectGeometry(
    [
      { id: "n1", x: 100, y: 100, width: 160, height: 80 },
      { id: "n2", x: 400, y: 100, width: 160, height: 80 },
      { id: "n3", x: 220, y: 220, width: 160, height: 80 },
    ],
    [],
    [
      {
        id: "r1",
        from: "n1",
        to: "n2",
        points: [
          { x: 260, y: 104 },
          { x: 320, y: 104 },
          { x: 320, y: 220 },
          { x: 400, y: 220 },
          { x: 400, y: 140 },
        ],
      },
    ],
  );
  assert.equal(typeof report.borderRides, "number");
  assert.equal(typeof report.sharedRuns, "number");
  assert.equal(typeof report.nearCornerPorts, "number");
  assert.ok(report.nearCornerPorts >= 1);
  assert.ok(report.borderRides >= 1);
});

test("Feign communication inspector shows HTTP contract, missing-proof limitations and saved evidence roles", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { CommunicationPanel } = require("../src/features/architecture/communication-panel.tsx");
  const { ThreeEEvidence } = require("../src/features/architecture/three-e-evidence.tsx");
  const model = {
    elements: [
      { id: "order", name: "order-service", elementType: "SERVICE_CONTAINER" },
      { id: "client", name: "CatalogFeignClient", parentId: "order", elementType: "COMPONENT" },
      { id: "catalog", name: "catalog-service", elementType: "SERVICE_CONTAINER" },
    ],
    edges: [
      {
        id: "http",
        from: "client",
        to: "catalog",
        protocol: "SERVICE_HTTP_CALL",
        properties: {
          clientFramework: "OPENFEIGN",
          clientInterface: "shop.order.CatalogFeignClient",
          clientMethod: "deductInventory",
          httpMethod: "POST",
          httpPath: "/api/catalog/inventory/deduct",
          callSiteCount: 1,
          serverMatch: "MATCHED_METHOD_PATH",
          targetSelector: "SERVICE_NAME",
          invocationResolution: "TYPED_SOURCE_CALL",
        },
      },
    ],
  };
  const node = renderToStaticMarkup(
    React.createElement(CommunicationPanel, { model, selectedId: "order", onSelect() {} }),
  );
  assert.ok(node.includes("CatalogFeignClient"));
  assert.ok(node.includes("POST /api/catalog/inventory/deduct"));
  assert.ok(node.includes("Inspect relationship evidence"));
  const edge = renderToStaticMarkup(
    React.createElement(CommunicationPanel, { model, selectedId: "http", onSelect() {} }),
  );
  assert.ok(edge.includes("Matching method + path"));
  assert.ok(edge.includes("1 typed call site"));
  assert.ok(edge.includes("does not prove"));
  model.edges[0].properties.callSiteCount = 0;
  model.edges[0].properties.serverMatch = "AMBIGUOUS_ENDPOINT";
  const uncertain = renderToStaticMarkup(
    React.createElement(CommunicationPanel, { model, selectedId: "http", onSelect() {} }),
  );
  assert.ok(uncertain.includes("no unique receiver"));
  assert.ok(uncertain.includes("No unique call site"));
  const proof = (role) => ({
    id: role,
    origin: "persisted",
    kind: "source",
    sourceType: "STATIC_CODE",
    communicationRole: role,
    location:
      role === "SERVER_ENDPOINT"
        ? "catalog/CatalogController.java:20"
        : "order/CatalogFeignClient.java:14",
    snippet: "<script>not executable source</script>",
    complete: null,
  });
  const html = renderToStaticMarkup(
    React.createElement(ThreeEEvidence, {
      evidence: [proof("CLIENT_CONTRACT"), proof("CALL_SITE"), proof("SERVER_ENDPOINT")],
    }),
  );
  assert.ok(html.includes("Caller · HTTP method contract"));
  assert.ok(html.includes("Caller · invocation in source"));
  assert.ok(html.includes("Receiver · matching HTTP endpoint"));
  assert.ok(html.includes("CatalogController.java:20"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("Metadata preview"));
});

test("communications include descendants and messaging channels without inventing direct HTTP or runtime delivery", () => {
  const {
    nodeCommunications,
    communicationDescription,
    communicationTitle,
  } = require("../src/features/architecture/communication-evidence.ts");
  const elements = [
    { id: "a", name: "A", parentId: "child" },
    { id: "child", name: "Publisher", parentId: "a" },
    { id: "topic", name: "order.created" },
    { id: "b", name: "B" },
    { id: "db", name: "DB" },
  ];
  const edges = [
    { id: "pub", from: "child", to: "topic", protocol: "MESSAGE_PUBLISH" },
    { id: "sub", from: "topic", to: "b", protocol: "MESSAGE_SUBSCRIBE" },
    { id: "docker", from: "a", to: "db", protocol: "DECLARED_COMPOSE" },
  ];
  assert.deepEqual(
    nodeCommunications({ elements, edges }, "a").map((e) => e.id),
    ["pub", "docker"],
  );
  assert.deepEqual(
    nodeCommunications({ elements, edges }, "topic").map((e) => e.id),
    ["pub", "sub"],
  );
  assert.ok(communicationDescription(edges[0]).includes("does not prove runtime"));
  assert.ok(communicationDescription(edges[2]).includes("does not prove HTTP"));
  assert.ok(communicationTitle(edges[0]).includes("Messaging"));
  assert.ok(
    !nodeCommunications({ elements, edges }, "a").some((e) => e.from === "a" && e.to === "b"),
  );
});

test("3E evidence empty state explains next action and source snippets start collapsed when requested", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ThreeEEvidence } = require("../src/features/architecture/three-e-evidence.tsx");
  const empty = renderToStaticMarkup(React.createElement(ThreeEEvidence, { evidence: [] }));
  assert.match(empty, /No evidence snippets are attached/);
  assert.match(empty, /re-run analysis/);
  const snippet = {
    id: "caller-proof",
    origin: "persisted",
    kind: "source",
    sourceType: "STATIC_CODE",
    communicationRole: "CALL_SITE",
    location: "order/OrderService.java:42",
    snippet: "catalog.deduct(request);",
    complete: true,
  };
  const html = renderToStaticMarkup(
    React.createElement(ThreeEEvidence, { evidence: [snippet], defaultOpen: false }),
  );
  assert.match(html, /Caller · invocation in source/);
  assert.match(html, /order\/OrderService.java:42/);
  assert.match(html, /Copy source snippet 1/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /tabindex="0"/);
});

test("graph camera cache survives filtering, restores hidden dragged nodes and keeps mode cameras separate", () => {
  const cytoscape = require("cytoscape");
  const { networkElements } = require("../src/features/architecture/cytoscape-network.ts");
  const {
    createNetworkPresentation,
    captureNetworkSnapshot,
  } = require("../src/features/architecture/network-presentation.ts");
  const model = {
    elements: [
      { id: "a", name: "Service", elementType: "SERVICE_CONTAINER" },
      { id: "db", name: "DB", elementType: "DATABASE" },
    ],
    edges: [{ id: "e", from: "a", to: "db", protocol: "HTTP" }],
  };
  const snapshots = new Map();
  let cy = cytoscape({
    headless: true,
    elements: networkElements(model),
    layout: { name: "preset" },
  });
  try {
    const present = createNetworkPresentation(cy, model, snapshots);
    cy.getElementById("node:a").position({ x: 101, y: 202 });
    cy.getElementById("node:db").position({ x: 505, y: 606 });
    cy.zoom(0.8);
    cy.pan({ x: 12, y: 34 });
    present("explore");
    cy.getElementById("node:a").position({ x: 303, y: 404 });
    cy.zoom(1.4);
    cy.pan({ x: 45, y: 67 });
    snapshots.set("explore", captureNetworkSnapshot(cy, snapshots.get("explore")));
  } finally {
    cy.destroy();
  }
  const filtered = { ...model, elements: [model.elements[0]], edges: [] };
  cy = cytoscape({
    headless: true,
    elements: networkElements(filtered),
    layout: { name: "preset" },
  });
  try {
    const saved = snapshots.get("explore");
    cy.nodes().positions((n) => saved.positions.get(n.id()));
    cy.zoom(saved.zoom);
    cy.pan(saved.pan);
    const present = createNetworkPresentation(cy, filtered, snapshots, "explore");
    present("explore");
    assert.deepEqual(cy.getElementById("node:a").position(), { x: 303, y: 404 });
    assert.equal(cy.zoom(), 1.4);
    assert.deepEqual(cy.pan(), { x: 45, y: 67 });
    present("analysis");
    assert.deepEqual(cy.getElementById("node:a").position(), { x: 101, y: 202 });
    assert.equal(cy.zoom(), 0.8);
    assert.deepEqual(cy.pan(), { x: 12, y: 34 });
    assert.deepEqual(snapshots.get("analysis").positions.get("node:db"), { x: 505, y: 606 });
    cy.remove(cy.nodes());
    const empty = captureNetworkSnapshot(cy, snapshots.get("analysis"));
    assert.deepEqual(empty.positions.get("node:db"), { x: 505, y: 606 });
  } finally {
    cy.destroy();
  }
});

test("Bilateral evidence assigns saved source roles independently of array order and selected side", () => {
  const {
    buildPeerConnectionGroups,
  } = require("../src/features/architecture/communication-evidence.ts");
  const proof = (id, role, location) => ({
    id,
    communicationRole: role,
    location,
    snippet: id + " source",
    kind: "source",
    origin: "persisted",
    complete: true,
  });
  const source = {
    elements: [
      { id: "a", name: "A", elementType: "SERVICE_CONTAINER" },
      {
        id: "client",
        name: "Client",
        parentId: "a",
        elementType: "COMPONENT",
        properties: { sourceFile: "a/ClientDeclaration.java" },
      },
      { id: "b", name: "B", elementType: "SERVICE_CONTAINER" },
      {
        id: "server",
        name: "Controller",
        parentId: "b",
        elementType: "COMPONENT",
        properties: { sourceFile: "b/ControllerDefinition.java" },
      },
    ],
    edges: [
      {
        id: "http",
        from: "client",
        to: "server",
        protocol: "SERVICE_HTTP_CALL",
        properties: {
          clientFramework: "OPENFEIGN",
          callerFile: "a/OldDeclaration.java",
          callerLine: 99,
          calleeFile: "b/OldDeclaration.java",
          calleeLine: 88,
        },
        evidence: [
          proof("server-proof", "SERVER_ENDPOINT", "b/Controller.java:20"),
          proof("caller-proof", "CALL_SITE", "a/Service.java:10"),
        ],
      },
    ],
  };
  const before = JSON.stringify(source);
  const outbound = buildPeerConnectionGroups(source, "a")[0],
    inbound = buildPeerConnectionGroups(source, "b")[0];
  assert.equal(outbound.subjectCodeItems[0].file, "a/Service.java:10");
  assert.equal(outbound.peerCodeItems[0].file, "b/Controller.java:20");
  assert.equal(outbound.subjectCodeItems[0].snippet, "caller-proof source");
  assert.equal(inbound.subjectCodeItems[0].snippet, "server-proof source");
  assert.equal(inbound.peerCodeItems[0].file, "a/Service.java:10");
  assert.equal(outbound.subjectCodeItems[0].line, undefined);
  assert.equal(JSON.stringify(source), before);
  source.edges[0].properties.callerSnippet = "explicit metadata source";
  source.edges[0].properties.callerFile = "a/Explicit.java";
  source.edges[0].properties.callerLine = 7;
  const explicit = buildPeerConnectionGroups(source, "a")[0].subjectCodeItems[0];
  assert.equal(explicit.file, "a/Explicit.java");
  assert.equal(explicit.line, 7);
  assert.equal(explicit.snippet, "explicit metadata source");
});

test("Unscoped relationship snippets are not guessed into caller or receiver code columns", () => {
  const {
    buildPeerConnectionGroups,
  } = require("../src/features/architecture/communication-evidence.ts");
  const source = {
    elements: [
      { id: "a", name: "A", elementType: "SERVICE_CONTAINER" },
      { id: "b", name: "B", elementType: "SERVICE_CONTAINER" },
    ],
    edges: [
      {
        id: "http",
        from: "a",
        to: "b",
        protocol: "SERVICE_HTTP_CALL",
        properties: { clientFramework: "OPENFEIGN" },
        evidence: [
          {
            id: "unassigned",
            kind: "source",
            origin: "persisted",
            location: "unknown/Source.java",
            snippet: "unscoped source",
            complete: true,
          },
        ],
      },
    ],
  };
  const group = buildPeerConnectionGroups(source, "a")[0];
  assert.equal(group.subjectCodeItems[0].snippet, undefined);
  assert.equal(group.peerCodeItems[0].snippet, undefined);
  assert.ok(group.subjectCodeItems[0].componentName.includes("not identified"));
  assert.ok(group.peerCodeItems[0].componentName.includes("not identified"));
  assert.equal(source.edges[0].evidence[0].snippet, "unscoped source");
});

test("Communication tree never promotes metadata previews into caller or server source proof", () => {
  const {
    buildPeerConnectionGroups,
  } = require("../src/features/architecture/communication-evidence.ts");
  const source = {
    elements: [
      { id: "a", name: "A", elementType: "SERVICE_CONTAINER" },
      { id: "b", name: "B", elementType: "SERVICE_CONTAINER" },
    ],
    edges: [
      {
        id: "http",
        from: "a",
        to: "b",
        protocol: "SERVICE_HTTP_CALL",
        properties: {},
        evidence: [
          {
            id: "preview",
            origin: "preview",
            kind: "source",
            communicationRole: "CALL_SITE",
            sourceType: "MODEL_METADATA_PREVIEW",
            location: "model metadata",
            snippet: "illustrative source",
            complete: false,
          },
        ],
      },
    ],
  };
  const group = buildPeerConnectionGroups(source, "a")[0];
  assert.equal(group.subjectCodeItems[0].snippet, undefined);
  assert.equal(group.peerCodeItems[0].snippet, undefined);
});

test("English UI labels remain English across 3E, Runtime and Change Impact", () => {
  const files = [
    "src/features/architecture/communication-panel.tsx",
    "src/features/architecture/communication-evidence.ts",
    "src/features/architecture/selection-three-e.tsx",
    "src/features/architecture/three-e-content.ts",
    "src/features/runtime/screens.tsx",
    "src/features/runtime/backend.tsx",
    "src/features/ai-explanations/components.tsx",
    "src/routes/impact.tsx",
  ];
  const vietnamese =
    /[\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01A0-\u01A1\u01AF-\u01B0\u1EA0-\u1EF9]/;
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(root, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      )
        assert.equal(vietnamese.test(node.text), false, `${file}: ${node.text}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
test("Vietnamese input keeps scope guardrails but returns an English refusal", () => {
  const { checkThreeEScopeGuardrail } = require("../src/features/architecture/three-e-content.ts");
  const context = {
    title: "order-service",
    type: "Service",
    inboundPeers: [],
    outboundPeers: [],
    childComponents: [],
    codeSnippets: [],
    otherElementNames: ["billing-engine", "notification-service"],
  };
  const result = checkThreeEScopeGuardrail("ăn gì hôm nay", context);
  assert.equal(result.allowed, false);
  assert.match(result.refusalMessage, /I only answer/);
  const wrong = checkThreeEScopeGuardrail("billing-engine có chức năng gì", context);
  assert.equal(wrong.allowed, false);
  assert.match(wrong.refusalMessage, /You currently have/);
  const wrongSiblingSvc = checkThreeEScopeGuardrail(
    "Explain the internal implementation of notification-service only",
    context,
  );
  assert.equal(wrongSiblingSvc.allowed, false);
  assert.equal(wrongSiblingSvc.reason, "wrong-service");
});

test("context review metadata never creates actors until confirmed and AI cannot rewrite confirmed claims", () => {
  const {
    deriveC4ContextModel,
    buildContextDiagramDrawioXml,
  } = require("../src/features/architecture/diagram-projections.ts");
  const internal = {
    id: "svc",
    name: "API",
    elementType: "SERVICE_CONTAINER",
    properties: {
      contextReview: {
        entries: [{ id: "draft", name: "Imagined Customer", state: "PROPOSED", kind: "PERSON" }],
      },
    },
  };
  const base = {
    id: "context-revision",
    projectId: "project",
    revision: 1,
    elements: [internal],
    edges: [],
  };
  assert.equal(deriveC4ContextModel(base).persons.length, 0);
  const actor = {
    id: "person",
    name: "Confirmed Operator",
    elementType: "PERSON",
    description: "User-confirmed operator role",
    properties: { contextReviewState: "CONFIRMED", contextFactOrigin: "USER_CONFIRMED" },
  };
  const confirmed = {
    ...base,
    elements: [internal, actor],
    edges: [
      {
        id: "interaction",
        from: "person",
        to: "svc",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        properties: { origin: "USER_CONFIRMED" },
      },
    ],
  };
  assert.equal(deriveC4ContextModel(confirmed).persons.length, 1);
  const xml = buildContextDiagramDrawioXml(confirmed, "Test System", "clean", {
    systemDescription: "Invented description",
    persons: {
      person: {
        name: "Fake Customer",
        description: "Invented business role",
        actionLabel: "Invented payment",
      },
    },
  });
  assert.ok(xml.includes("Confirmed Operator"));
  assert.ok(!xml.includes("Fake Customer"));
  assert.ok(!xml.includes("Invented business role"));
  assert.ok(!xml.includes("Invented description"));
  assert.equal(
    deriveC4ContextModel({
      ...confirmed,
      elements: [internal, { ...actor, properties: { contextReviewState: "REJECTED" } }],
    }).persons.length,
    0,
  );
});
test("unresolved external dependencies require a boundary decision before C4 context includes them", () => {
  const { deriveC4ContextModel } = require("../src/features/architecture/diagram-projections.ts");
  const svc = { id: "svc", name: "API", elementType: "SERVICE_CONTAINER" },
    ext = {
      id: "ext",
      name: "Unresolved client",
      elementType: "EXTERNAL_SYSTEM",
      properties: { resolutionIssue: "UNRESOLVED_FEIGN_TARGET" },
    };
  const model = {
    id: "m",
    projectId: "p",
    revision: 1,
    elements: [svc, ext],
    edges: [
      { id: "e", from: "svc", to: "ext", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC" },
    ],
  };
  assert.equal(deriveC4ContextModel(model).externals.length, 0);
  assert.equal(
    deriveC4ContextModel({
      ...model,
      elements: [
        svc,
        {
          ...ext,
          properties: {
            ...ext.properties,
            contextReviewState: "CONFIRMED",
            contextFactOrigin: "USER_CONFIRMED",
          },
        },
      ],
    }).externals.length,
    1,
  );
});

test("notification read-all patches a seven-unread count even when only five rows are cached", () => {
  const { applyNotificationRead } = require("../src/features/notifications/read-cache.ts");
  const recipientId = "11111111-1111-4111-8111-111111111111",
    before = "2026-10-29T10:00:00.000001Z",
    readAt = "2026-10-29T10:00:01Z";
  const data = {
    recipientId,
    items: Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      createdAt: "2026-10-29T09:00:00Z",
      readAt: null,
    })),
    total: 7,
    unreadCount: 7,
    page: 0,
    size: 5,
    asOf: before,
  };
  const ack = { ok: true, recipientId, before, readAt, asOf: readAt, unreadCount: 0 };
  const all = applyNotificationRead(
    data,
    { page: 0, size: 5, unreadOnly: false },
    "readAllNotifications",
    { before },
    ack,
  );
  assert.equal(all.unreadCount, 0);
  assert.ok(all.items.every((n) => n.readAt === readAt));
  assert.equal(all.total, 7);
  const unread = applyNotificationRead(
    data,
    { page: 0, size: 5, unreadOnly: true },
    "readAllNotifications",
    { before },
    ack,
  );
  assert.equal(unread.items.length, 0);
  assert.equal(unread.total, 0);
  assert.equal(data.unreadCount, 7);
  assert.ok(data.items.every((n) => n.readAt === null));
});
test("notification cutoff preserves new messages within the same millisecond and newer snapshots", () => {
  const { applyNotificationRead } = require("../src/features/notifications/read-cache.ts");
  const recipientId = "11111111-1111-4111-8111-111111111111",
    before = "2026-10-29T10:00:00.000001Z",
    asOf = "2026-10-29T10:00:01Z";
  const data = {
    recipientId,
    items: [
      { id: "old", createdAt: before, readAt: null },
      { id: "new", createdAt: "2026-10-29T10:00:00.000002Z", readAt: null },
    ],
    total: 2,
    unreadCount: 2,
    page: 0,
    size: 5,
    asOf,
  };
  const ack = { ok: true, recipientId, before, asOf, readAt: asOf, unreadCount: 1 };
  const next = applyNotificationRead(
    data,
    { page: 0, size: 5, unreadOnly: true },
    "readAllNotifications",
    { before },
    ack,
  );
  assert.equal(next.unreadCount, 1);
  assert.deepEqual(
    next.items.map((n) => n.id),
    ["new"],
  );
  assert.equal(next.items[0].readAt, null);
  const newer = { ...data, asOf: "2026-10-29T10:00:02Z", unreadCount: 3 };
  assert.equal(
    applyNotificationRead(
      newer,
      { page: 0, size: 5, unreadOnly: false },
      "readAllNotifications",
      { before },
      ack,
    ),
    newer,
  );
  assert.equal(
    applyNotificationRead(
      data,
      { page: 0, size: 5, unreadOnly: false },
      "readAllNotifications",
      { before },
      { ...ack, recipientId: "other" },
    ),
    data,
  );
  assert.equal(
    applyNotificationRead(
      data,
      { page: 0, size: 5, unreadOnly: false },
      "readAllNotifications",
      { before },
      { ok: true },
    ),
    data,
  );
});

test("direct project URLs populate selection and the project dropdown without click initialization", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { SelectionContext } = require("../src/providers/app-context.ts");
  let selected;
  let params = new URLSearchParams("project=project-b");
  const { AppProvider } = loadRoutedComponent("src/providers/app-provider.tsx", {
    "next/navigation": {
      usePathname: () => "/project-overview",
      useSearchParams: () => params,
      useRouter: () => ({ replace() {} }),
    },
    "@/components/ui/sonner": { Toaster: () => null },
  });
  function Probe() {
    selected = React.useContext(SelectionContext);
    return null;
  }
  renderToStaticMarkup(
    React.createElement(AppProvider, { mode: "backend" }, React.createElement(Probe)),
  );
  assert.equal(selected.projectId, "project-b");
  const { ProjectSelector } = loadRoutedComponent("src/features/projects/components.tsx", {
    "@/hooks/use-api": {
      useApiQuery: () => ({
        data: [
          { id: "project-a", name: "Project A" },
          { id: "project-b", name: "Project B" },
        ],
        isPending: false,
        isError: false,
      }),
      useSelection: () => selected,
    },
    "@tanstack/react-query": { useIsMutating: () => 0 },
  });
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(ProjectSelector),
    ),
  );
  assert.match(html, /<option value="project-b" selected="">Project B<\/option>/);
  params = new URLSearchParams("project=project-a");
  renderToStaticMarkup(
    React.createElement(AppProvider, { mode: "backend" }, React.createElement(Probe)),
  );
  assert.equal(selected.projectId, "project-a");
});

test("state workspace does not present ErrorCode enum constants as a behavioral machine", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { UmlDiagramWorkspace } = loadRoutedComponent(
    "src/features/architecture/uml-diagram-workspace.tsx",
    {
      "@/hooks/use-api": {
        useApi: () => ({ mode: "mock" }),
        useApiQuery: () => ({ data: undefined, error: null, isPending: false }),
      },
      "@/lib/i18n/locale-context": { useLocale: () => ({ locale: "en" }) },
      "./drawio-editor": {
        DrawioEditor: () => React.createElement("div", { "data-testid": "state-editor" }),
      },
    },
  );
  const lifecycle = {
    stateMachineKind: "ENUM_DECLARATION",
    enumOnlyNoTransitions: true,
    states: ["EMPLOYEE_NOT_FOUND", "INVALID_INPUT", "INTERNAL_ERROR"],
    transitions: [],
  };
  const model = {
    id: "model",
    projectId: "project",
    snapshotId: "snapshot",
    revision: 1,
    label: "Test",
    elements: [
      {
        id: "error-code",
        name: "ErrorCode",
        elementType: "CLASS_INTERFACE",
        properties: { umlClassifier: { name: "ErrorCode", stateLifecycle: lifecycle } },
        evidence: [],
      },
    ],
    edges: [],
  };
  const render = () =>
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        React.createElement(UmlDiagramWorkspace, {
          model,
          kind: "UML_STATE",
          selectedId: null,
          onSelect() {},
        }),
      ),
    );
  const empty = render();
  assert.match(empty, /No state machine behavior available/);
  assert.match(empty, /ErrorCode \(enum declaration only\)/);
  assert.ok(!empty.includes('data-testid="state-editor"'));
  assert.ok(!empty.includes('data-testid="uml-item-EMPLOYEE_NOT_FOUND"'));
  model.elements[0].properties.umlClassifier.stateLifecycle = {
    stateMachineKind: "STATEFUL_CLASS",
    enumOnlyNoTransitions: false,
    states: ["NEW", "DONE"],
    transitions: [{ fromState: "NEW", toState: "DONE", trigger: "complete()" }],
  };
  const valid = render();
  assert.ok(valid.includes('data-testid="state-editor"'));
  assert.ok(!valid.includes('data-testid="uml-state-unavailable"'));
});

test("diagram and graph selections use the same docked 3E inspector", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ArchitecturePresentation } = loadRoutedComponent(
    "src/features/architecture/architecture-presentation.tsx",
    {
      "./dependency-network": { DependencyNetwork: () => null },
      "./architecture-diagrams": {
        ArchitectureDiagrams: () => React.createElement("div", null, "Diagram workspace"),
      },
      "./inspector-sidebar": {
        InspectorSidebar: ({ children }) =>
          React.createElement("section", { "data-shared-dock": true }, children),
      },
      "./selection-three-e": {
        SelectionThreeE: ({ docked, selectedId, sequenceContext }) =>
          React.createElement("div", {
            "data-docked": String(docked),
            "data-selected": selectedId,
            "data-sequence": sequenceContext?.messageId ?? "",
          }),
      },
    },
  );
  const model = {
    id: "m",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Test",
    elements: [
      {
        id: "service",
        name: "department-service",
        elementType: "SERVICE_CONTAINER",
        layer: "domain",
        description: "",
        evidence: [],
      },
      {
        id: "repository",
        name: "DepartmentRepository",
        elementType: "COMPONENT",
        parentId: "service",
        layer: "domain",
        description: "",
        evidence: [],
      },
    ],
    edges: [],
  };
  for (const mode of ["graph", "diagram"]) {
    const html = renderToStaticMarkup(
      React.createElement(ArchitecturePresentation, {
        model,
        selectedId: "repository",
        onSelect() {},
        mode,
      }),
    );
    assert.match(html, /data-shared-dock="true"/);
    assert.match(html, /data-docked="true"/);
    assert.match(html, /data-selected="repository"/);
  }
  const idle = renderToStaticMarkup(
    React.createElement(ArchitecturePresentation, {
      model,
      selectedId: null,
      onSelect() {},
      mode: "diagram",
    }),
  );
  assert.ok(!idle.includes("data-shared-dock"));
});

test("admin model deep links retain an authorized selected project even when own project list is empty", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectSelector } = loadRoutedComponent("src/features/projects/components.tsx", {
    "@/hooks/use-api": {
      useApiQuery: () => ({ data: [], isPending: false, isError: false, isFetching: false }),
      useSelection: () => ({ projectId: "foreign-project", setProjectId() {} }),
    },
    "@tanstack/react-query": { useIsMutating: () => 0 },
  });
  const html = renderToStaticMarkup(
    React.createElement(ProjectSelector, {
      selectedProject: { id: "foreign-project", name: "QA Spring Demo" },
    }),
  );
  assert.match(html, /<option value="foreign-project" selected="">QA Spring Demo<\/option>/);
  assert.ok(!html.includes("No results yet"));
  const wrong = renderToStaticMarkup(
    React.createElement(ProjectSelector, {
      selectedProject: { id: "other-project", name: "Wrong project" },
    }),
  );
  assert.ok(!wrong.includes("Wrong project"));
});

test("architecture view tabs preserve project/model and deep link every diagram kind", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const kinds = [
    "CONTAINER",
    "COMPONENT",
    "UML_SEQUENCE",
    "UML_CLASS",
    "UML_PACKAGE",
    "UML_DEPLOYMENT",
    "UML_ACTIVITY",
    "UML_STATE",
  ];
  let role = "admin";
  let params = new URLSearchParams("project=foreign-project&model=pinned-model&kind=UML_CLASS");
  const query = { isPending: false, isError: false, isFetching: false, refetch() {} };
  const { ArchitectureWorkspace } = loadRoutedComponent("src/routes/architecture.tsx", {
    "next/navigation": { useSearchParams: () => params },
    "@/lib/i18n/locale-context": { useLocale: () => ({ t: (s) => s }) },
    "@/features/architecture/use-model": {
      useModel: () => ({
        projectId: "foreign-project",
        model: { id: "pinned-model", projectId: "foreign-project", elements: [], edges: [] },
        models: [{ id: "pinned-model", revision: 1 }],
        query,
        selectModel() {},
      }),
    },
    "@/hooks/use-api": {
      useSession: () => ({ data: { user: { role } } }),
      useApiQuery: () => ({ ...query, data: { id: "foreign-project", name: "QA Spring Demo" } }),
    },
    "@/features/projects/components": {
      ProjectSelector: ({ selectedProject }) =>
        React.createElement("span", null, selectedProject?.name),
    },
    "@/features/architecture/components": { ModelVersionSelector: () => null },
    "@/features/workspaces/course-access": { useCourseRoadmap: () => ({ data: undefined }) },
    "@/features/architecture/architecture-presentation": {
      ArchitecturePresentation: ({ mode }) =>
        React.createElement("div", { "data-view-mode": mode }),
    },
  });
  for (const kind of kinds) {
    params = new URLSearchParams({ project: "foreign-project", model: "pinned-model", kind });
    const html = renderToStaticMarkup(
      React.createElement(ArchitectureWorkspace, { mode: "diagram" }),
    );
    const nav = /<nav aria-label="Architecture views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
    assert.ok(nav);
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map(
      (m) => new URL(m[1].replaceAll("&amp;", "&"), "https://mavis.invalid"),
    );
    assert.equal(hrefs.length, 9);
    for (const url of hrefs) {
      assert.equal(url.searchParams.get("project"), "foreign-project");
      assert.equal(url.searchParams.get("model"), "pinned-model");
    }
    assert.deepEqual(
      hrefs.filter((u) => u.pathname === "/diagrams").map((u) => u.searchParams.get("kind")),
      kinds,
    );
    const activeTag = [...nav.matchAll(/<a\b[^>]*>/g)].find((m) =>
      m[0].includes('aria-current="page"'),
    )?.[0];
    const active = /href="([^"]+)"/.exec(activeTag)?.[1];
    assert.equal(
      new URL(active.replaceAll("&amp;", "&"), "https://mavis.invalid").searchParams.get("kind"),
      kind,
    );
    assert.match(html, /data-view-mode="diagram"/);
  }
  const graph = renderToStaticMarkup(React.createElement(ArchitectureWorkspace, { mode: "graph" }));
  const graphTag = [...graph.matchAll(/<a\b[^>]*>/g)].find((m) =>
    m[0].includes('aria-current="page"'),
  )?.[0];
  assert.match(graphTag, /href="\/architecture\?/);
  assert.match(graph, /data-view-mode="graph"/);
  assert.ok(graph.includes("Back to analysis jobs"));
  role = "admin";
  const returnTo = "/administration/jobs?job=job-12&search=spring&status=completed&page=2";
  params = new URLSearchParams({ project: "foreign-project", model: "pinned-model", returnTo });
  const admin = renderToStaticMarkup(React.createElement(ArchitectureWorkspace, { mode: "graph" }));
  assert.ok(admin.includes("Back to analysis jobs"));
  const adminNav = /<nav aria-label="Architecture views"[^>]*>([\s\S]*?)<\/nav>/.exec(admin)[1];
  for (const match of adminNav.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), "https://mavis.invalid");
    assert.equal(url.searchParams.get("returnTo"), returnTo);
  }
  assert.ok(
    admin.includes(
      "/administration/jobs?job=job-12&amp;search=spring&amp;status=completed&amp;page=2",
    ),
  );
  for (const userRole of ["student", "lecturer"]) {
    role = userRole;
    for (const mode of ["graph", "diagram"]) {
      const user = renderToStaticMarkup(React.createElement(ArchitectureWorkspace, { mode }));
      assert.ok(
        !user.includes('aria-label="Architecture views"'),
        `${role} ${mode} must not show admin tabs`,
      );
      assert.ok(!user.includes("Back to analysis jobs"));
      assert.ok(user.includes(`data-view-mode="${mode}"`));
    }
  }
});

test("Eight active diagram kinds retire Context links to Container", () => {
  const {
    canonicalDiagramCatalog,
    diagramKinds,
    resolveDiagramKind,
  } = require("../src/features/architecture/diagram-catalog.ts");
  const kinds = [
    "CONTAINER",
    "COMPONENT",
    "UML_SEQUENCE",
    "UML_CLASS",
    "UML_PACKAGE",
    "UML_DEPLOYMENT",
    "UML_ACTIVITY",
    "UML_STATE",
  ];
  assert.deepEqual(
    canonicalDiagramCatalog.map((item) => item.kind),
    kinds,
  );
  assert.deepEqual(
    [...diagramKinds.C4, ...diagramKinds.UML].map((item) => item.value),
    kinds,
  );
  for (const value of [null, "CONTEXT", "invalid"])
    assert.equal(resolveDiagramKind(value), "CONTAINER");
  assert.equal(resolveDiagramKind("SCENARIOS"), "UML_SEQUENCE");
  for (const value of kinds) assert.equal(resolveDiagramKind(value), value);
});

test("runtime workflow without observed trace is planned only and never invents latency, status or trace ids", () => {
  const { deriveWorkflowSteps } = require("../src/features/runtime/backend.tsx");
  const model = {
    elements: [
      { id: "g", name: "api-gateway" },
      { id: "o", name: "order-service" },
      { id: "p", name: "payment-service" },
    ],
    edges: [
      { from: "g", to: "o" },
      { from: "g", to: "p" },
    ],
  };
  const planned = deriveWorkflowSteps(
    undefined,
    [{ service: "api-gateway", method: "GET", path: "/api/gateway/orders/1" }],
    model,
  );
  assert.equal(planned.mode, "PLANNED");
  assert.deepEqual(
    planned.steps.map((s) => s.calleeService),
    ["api-gateway", "order-service"],
  );
  assert.ok(
    planned.steps.every(
      (s) =>
        s.durationMs == null &&
        s.httpStatusCode == null &&
        s.traceId == null &&
        s.provenanceType === "PLANNED",
    ),
  );
  const real = [
    {
      callerService: "api-gateway",
      calleeService: "order-service",
      durationMs: 12,
      httpStatusCode: 200,
      traceId: "t",
    },
  ];
  assert.deepEqual(deriveWorkflowSteps(real, [], model), { steps: real, mode: "OBSERVED" });

  const mappedModel = {
    elements: [
      { id: "gw-container", name: "ApiGateway", elementType: "SERVICE_CONTAINER", parentId: null },
      {
        id: "gw-ctrl",
        name: "GatewayController",
        elementType: "COMPONENT",
        parentId: "gw-container",
      },
      {
        id: "ord-container",
        name: "OrderService",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
      },
      {
        id: "ord-svc",
        name: "OrderAppService",
        elementType: "COMPONENT",
        parentId: "ord-container",
      },
    ],
    edges: [{ from: "gw-ctrl", to: "ord-svc" }],
  };
  const mappedPlanned = deriveWorkflowSteps(
    undefined,
    [{ service: "gateway", method: "POST", path: "/api/orders" }],
    mappedModel,
    { gateway: "gw-container", orders: "ord-container" },
  );
  assert.equal(mappedPlanned.mode, "PLANNED");
  assert.deepEqual(
    mappedPlanned.steps.map((s) => [s.callerService, s.calleeService]),
    [
      ["mavis-runner", "gateway"],
      ["gateway", "orders"],
    ],
  );
  assert.ok(
    mappedPlanned.steps.every(
      (s) => s.durationMs == null && s.httpStatusCode == null && s.traceId == null,
    ),
  );
});

test("runtime Step 1-2-3 source guards: Quick Run matches ComposePreflightValidator build issues and avoids stale revision override", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const backendSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/backend.tsx"),
    "utf8",
  );
  const screensSrc = fs.readFileSync(
    path.join(__dirname, "../src/features/runtime/screens.tsx"),
    "utf8",
  );

  assert.ok(
    !backendSrc.includes("LOCAL_BUILD_ONLY"),
    "Step 3 Quick Run must not use obsolete LOCAL_BUILD_ONLY prefix",
  );
  assert.ok(
    backendSrc.includes("Service '([^']+)' (?:uses build:|image |has no image)"),
    "Step 3 Quick Run must match ComposePreflightValidator issue messages",
  );
  assert.ok(
    backendSrc.includes('rawProfile["composeServices"]'),
    "Step 3 Quick Run must prefer composeServices over model-enriched detectedServices",
  );
  assert.ok(
    !backendSrc.includes("config.data?.revision ?? activeConfigRevision"),
    "Step 3 Quick Run must not shadow activeConfigRevision with stale closure revision 0",
  );
  assert.ok(
    !screensSrc.includes("config.data?.revision ?? activeConfigRevision"),
    "Step 2 Run must not shadow activeConfigRevision with stale closure revision 0",
  );
  assert.ok(
    screensSrc.includes("(?<!\\{)\\{([^{}/]+)\\}(?!\\})"),
    "Step 2 Run must normalize single-brace path params while preserving {{VAR}}",
  );
  assert.ok(
    backendSrc.includes("(?<!\\{)\\{([^{}/]+)\\}(?!\\})"),
    "Step 3 Quick Run must normalize single-brace path params while preserving {{VAR}}",
  );
  const adapterSrc = fs.readFileSync(
    path.join(__dirname, "../src/lib/api/backend-adapter.ts"),
    "utf8",
  );
  const javaClientSrc = fs.readFileSync(
    path.join(__dirname, "../src/lib/api/java-client.ts"),
    "utf8",
  );
  assert.ok(
    adapterSrc.includes('operation === "buildRuntimeSandboxImages"') &&
      adapterSrc.includes("600000"),
    "BackendAdapter must allow 600s for local Docker image builds",
  );
  assert.ok(
    adapterSrc.includes('"generateRuntimeScenario"') &&
      adapterSrc.includes('"runtimePreflight"') &&
      adapterSrc.includes('"startRuntime"'),
    "BackendAdapter must allow 120s for heavy runtime operations",
  );
  assert.ok(
    javaClientSrc.includes('path.endsWith("/runtime-plan/build-images") ? 600000 : 120000'),
    "javaRequest must allow 600s for build-images BFF proxy",
  );
  assert.ok(
    backendSrc.includes("models.refetch()") && backendSrc.includes("fallbackSavedScenario"),
    "Step 3 Quick Run must await pending queries and reuse saved scenarios after cold reload",
  );
  assert.ok(
    screensSrc.includes('meta.resolution === "USER_REQUIRED"'),
    "Step 1 must ask only for secrets the backend marks USER_REQUIRED",
  );
});

test("Screen Guided Tour catalog covers all 28 screens with bilingual EN/VI steps and renders trigger in SectionHeader & ArchitectureWorkspace", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { SCREEN_TOUR_CATALOG, resolveScreenTour } = require("../src/lib/guided-tours/catalog.ts");
  const expectedScreens = [
    "overview",
    "import",
    "project-overview",
    "snapshots",
    "analysis-history",
    "architecture",
    "diagrams",
    "model",
    "compare",
    "impact",
    "explain",
    "runtime-config",
    "scenarios",
    "sessions",
    "workspaces",
    "workspace-overview",
    "assignments",
    "members",
    "references",
    "submissions",
    "submission-review",
    "health",
    "jobs",
    "usage",
    "users",
    "integrations",
    "audit",
    "runtime-summary",
    "profiles",
    "admin-sessions",
    "profile",
    "notifications",
  ];
  for (const id of expectedScreens) {
    const tour = resolveScreenTour(id);
    assert.ok(tour, `Missing screen tour for ${id}`);
    assert.ok(tour.title.en && tour.title.vi, `Missing bilingual title for ${id}`);
    assert.ok(tour.subtitle.en && tour.subtitle.vi, `Missing bilingual subtitle for ${id}`);
    assert.equal(tour.cards.length, 2, `Expected 2 summary cards for ${id}`);
    assert.ok(tour.steps.length >= 1, `Expected at least 1 step for ${id}`);
    for (const step of tour.steps) {
      assert.ok(step.title.en && step.title.vi, `Missing bilingual step title in ${id}:${step.id}`);
      assert.ok(
        step.description.en && step.description.vi,
        `Missing bilingual step description in ${id}:${step.id}`,
      );
      assert.ok(step.selectors.length >= 1, `Missing step selectors in ${id}:${step.id}`);
    }
  }
  const { SectionHeader } = require("../src/components/layout/page.tsx");
  const headerHtml = renderToStaticMarkup(
    React.createElement(SectionHeader, { title: "Runtime Configuration" }),
  );
  assert.ok(
    headerHtml.includes('data-tour-trigger="runtime-config"'),
    "SectionHeader must render ScreenHelpTrigger matching title",
  );
  const { findBestTargetElement } = require("../src/components/shared/screen-guided-tour.tsx");
  const origDoc = global.document;
  try {
    const triggerBtn = {
      tagName: "BUTTON",
      hasAttribute: (k) => k === "data-tour-trigger",
      closest: () => null,
      getBoundingClientRect: () => ({ width: 36, height: 36 }),
    };
    const overlayCard = {
      tagName: "DIV",
      hasAttribute: () => false,
      closest: (sel) => (sel === "[data-screen-tour-active]" ? {} : null),
      getBoundingClientRect: () => ({ width: 360, height: 210 }),
    };
    const tinyIconSvg = {
      tagName: "svg",
      hasAttribute: () => false,
      closest: () => null,
      getBoundingClientRect: () => ({ width: 20, height: 20 }),
    };
    const realBtn = {
      tagName: "BUTTON",
      hasAttribute: () => false,
      closest: () => null,
      getBoundingClientRect: () => ({ width: 140, height: 36 }),
    };
    const realDiagramSvg = {
      tagName: "svg",
      hasAttribute: () => false,
      closest: () => null,
      getBoundingClientRect: () => ({ width: 640, height: 420 }),
    };
    global.document = {
      querySelectorAll: (sel) =>
        sel === "main button"
          ? [triggerBtn, overlayCard, realBtn]
          : sel === "main svg"
            ? [tinyIconSvg, realDiagramSvg]
            : [],
    };
    assert.equal(
      findBestTargetElement(["main button"]),
      realBtn,
      "findBestTargetElement must skip [data-tour-trigger] and [data-screen-tour-active] elements",
    );
    assert.equal(
      findBestTargetElement(["main svg"]),
      realDiagramSvg,
      "findBestTargetElement must skip small icon SVGs (<120x80) and select diagram SVGs",
    );
  } finally {
    global.document = origDoc;
  }
  const tourFiles = [
    "src/routes/index.tsx",
    "src/routes/architecture.tsx",
    "src/routes/impact.tsx",
    "src/routes/explain.tsx",
    "src/features/projects/components.tsx",
    "src/features/projects/screens.tsx",
    "src/features/architecture/components.tsx",
    "src/features/architecture/dependency-network.tsx",
    "src/features/architecture/architecture-diagrams.tsx",
    "src/features/runtime/screens.tsx",
    "src/features/runtime/backend.tsx",
    "src/components/shared/screen-guided-tour.tsx",
  ]
    .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
    .join("\n");
  assert.ok(
    tourFiles.includes('hasAttribute("data-tour-trigger")'),
    "findBestTargetElement must skip [data-tour-trigger] buttons",
  );
  assert.ok(
    !fs
      .readFileSync(path.join(root, "src/features/runtime/backend.tsx"), "utf8")
      .includes("Split View"),
    "Runtime sessions must only offer Topology and Sequence tabs without Split View",
  );
  assert.ok(
    tourFiles.includes('data-tour-tab="sess-topology"') &&
      tourFiles.includes('data-tour-tab="sess-sequence"'),
    "Runtime sessions must expose data-tour-tab on Topology and Sequence buttons",
  );
  for (const id of expectedScreens) {
    const tour = resolveScreenTour(id);
    for (const step of tour.steps) {
      const firstSel = step.selectors[0];
      const m = /^\[data-tour="([^"]+)"\]$/.exec(firstSel);
      if (m) {
        assert.ok(
          tourFiles.includes(`"${m[1]}"`),
          `Missing data-tour="${m[1]}" in frontend source for ${id}:${step.id}`,
        );
      }
    }
  }
});

test("Teaching submissions use the class shell, Lab filter and LMS review table", () => {
  const submissions = fs.readFileSync(
    path.join(root, "src/features/submissions/screens.tsx"),
    "utf8",
  );

  assert.match(submissions, /CourseWorkspaceShell/);
  assert.match(submissions, /Assignment to review/);
  assert.match(submissions, /Outcome/);
  assert.match(submissions, /Open review/);
  assert.match(submissions, /Back to class submissions|Quay lại bài nộp của lớp/);
});
