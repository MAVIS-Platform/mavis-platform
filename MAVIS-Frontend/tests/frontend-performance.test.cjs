const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const root = path.resolve(__dirname, "..");

function compile(filename) {
  return ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) =>
    module._compile(
      compile(filename).replace(
        /require\(["']@\/([^"']+)["']\)/g,
        (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
      ),
      filename,
    );
}
function load(relative, overrides = {}, globals = {}, expose = "") {
  const filename = path.join(root, relative);
  const exports = {};
  vm.runInNewContext(compile(filename) + expose, {
    exports,
    URLSearchParams,
    AbortController,
    ...globals,
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
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
function hooks() {
  let cursor = 0;
  const slots = [],
    effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    begin() {
      cursor = 0;
      effects.length = 0;
    },
    effects,
    react: {
      ...React,
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
        return [
          slots[i],
          (next) => {
            slots[i] = typeof next === "function" ? next(slots[i]) : next;
          },
        ];
      },
      useRef(initial) {
        const i = cursor++;
        return (slots[i] ??= { current: initial });
      },
      useMemo(factory, deps) {
        const i = cursor++;
        if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
        return slots[i].value;
      },
      useEffect(effect, deps) {
        const i = cursor++;
        if (!slots[i] || !same(slots[i], deps)) effects.push(effect);
        slots[i] = deps;
      },
    },
  };
}
const allNodes = (node) =>
  !node || typeof node !== "object"
    ? []
    : [node, ...React.Children.toArray(node.props?.children).flatMap(allNodes)];
const model = {
  id: "model",
  projectId: "project",
  revision: 1,
  elements: [
    { id: "a", name: "A", elementType: "SERVICE_CONTAINER" },
    { id: "b", name: "B", elementType: "SERVICE_CONTAINER" },
  ],
  edges: [{ id: "ab", from: "a", to: "b", protocol: "HTTP" }],
};

test("performance: deferred graph metadata preserves elements without calculating layout", () => {
  let layouts = 0;
  const { networkElements } = load("src/features/architecture/cytoscape-network.ts", {
    "./network-layout": {
      networkPositions() {
        layouts++;
        return new Map([
          ["a", { x: 1, y: 2 }],
          ["b", { x: 3, y: 4 }],
        ]);
      },
    },
  });
  const preset = networkElements(model);
  assert.equal(layouts, 1);
  const deferred = networkElements(model, null);
  assert.equal(layouts, 1, "metadata preparation adds zero layouts");
  const withoutPositions = (rows) =>
    JSON.parse(JSON.stringify(rows.map(({ position, ...row }) => row)));
  assert.deepEqual(withoutPositions(deferred), withoutPositions(preset));
  assert.ok(deferred.filter((row) => row.group === "nodes").every((row) => !("position" in row)));
});

test("performance: controlled graph avoids fallbacks, lays out once, restores camera and keeps selection visual", (t) => {
  const h = hooks(),
    cytoscape = require("cytoscape");
  const projection = { model, hiddenNodeCount: 0, hiddenEdgeCount: 0 };
  let layouts = 0,
    instances = 0;
  const created = [];
  t.after(() => created.forEach((cy) => cy.destroy()));
  const projectionModule = require("../src/features/architecture/graph-projection.ts");
  const globals = {
    document: { documentElement: {}, createElement: () => ({ getContext: () => null }) },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const { DependencyNetwork } = load(
    "src/features/architecture/dependency-network.tsx",
    {
      react: h.react,
      cytoscape: (options) => {
        instances++;
        const cy = cytoscape({
          ...JSON.parse(JSON.stringify(options)),
          container: undefined,
          headless: true,
          styleEnabled: true,
        });
        created.push(cy);
        return cy;
      },
      "./graph-projection": {
        ...projectionModule,
        projectGraphModel() {
          throw Error("controlled projection must be reused");
        },
      },
      "./network-connections": {
        networkConnections() {
          throw Error("controlled connections must be reused");
        },
      },
      "./network-layout": {
        networkPositions() {
          layouts++;
          return new Map([
            ["a", { x: 10, y: 20 }],
            ["b", { x: 30, y: 40 }],
          ]);
        },
      },
    },
    globals,
  );
  const props = { model, selectedId: null, onSelect() {}, projection, connections: [] };
  const render = (next) => {
    h.begin();
    return allNodes(DependencyNetwork(next));
  };
  const nodes = render(props);
  nodes.find((n) => n.props?.["data-renderer"] === "cytoscape").props.ref.current = {
    clientWidth: 800,
    clientHeight: 600,
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
  };
  const initialize = h.effects.find((effect) => effect.toString().includes("clientWidth"));
  assert.equal(layouts, 0);
  let cleanup = initialize();
  assert.equal(layouts, 1);
  assert.equal(instances, 1);
  render({ ...props, selectedId: "a" });
  assert.ok(!h.effects.some((effect) => effect.toString().includes("clientWidth")));
  assert.equal(layouts, 1);
  assert.equal(instances, 1);
  cleanup();
  cleanup = initialize();
  assert.equal(layouts, 1, "complete saved camera avoids another layout");
  cleanup();
});

test("performance: summary-only model hook disables detail requests and preserves URL selection", () => {
  const h = hooks(),
    calls = [],
    routes = [];
  const data = [
    { id: "old", revision: 1 },
    { id: "latest", revision: 2 },
  ];
  const { useModel } = load("src/features/architecture/use-model.ts", {
    react: h.react,
    "next/navigation": {
      useSearchParams: () => new URLSearchParams("project=project&target=a"),
      useRouter: () => ({ replace: (route) => routes.push(route) }),
    },
    "@/hooks/use-api": {
      useApi: () => ({ mode: "backend" }),
      useSelection: () => ({ projectId: "project" }),
      useApiQuery: (op, input, options) => {
        calls.push({ op, input, options });
        return { data: op === "modelVersions" ? data : model };
      },
    },
  });
  h.begin();
  const summary = useModel({ loadDetail: false });
  assert.equal(calls.filter((c) => c.options.enabled).length, 1);
  assert.equal(calls.find((c) => c.op === "model").options.enabled, false);
  h.effects.forEach((effect) => effect());
  assert.match(routes[0], /model=latest/);
  assert.match(routes[0], /target=a/);
  h.begin();
  const again = useModel({ loadDetail: false });
  assert.equal(summary.models, again.models, "unchanged summaries retain derived ordering");
  assert.equal(data[0].id, "old", "API rows must not be sorted in place");
  calls.length = 0;
  h.begin();
  useModel();
  assert.equal(calls.find((c) => c.op === "model").options.enabled, true);
  const sourceCalls = [];
  const { SourceSnapshots } = load("src/features/projects/screens.tsx", {
    react: { ...h.react, useEffect() {} },
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "@/hooks/use-api": {
      useSelection: () => ({ projectId: "project" }),
      useApi: () => ({ mode: "backend" }),
      useApiQuery: () => ({ data: [] }),
    },
    "@/features/architecture/use-model": {
      useModel: (options) => {
        sourceCalls.push(options);
        return { models: [] };
      },
    },
  });
  h.begin();
  SourceSnapshots();
  assert.equal(sourceCalls[0].loadDetail, false);
});

test("performance: runtime zoom reuses SVG and changed trace regenerates it", () => {
  const h = hooks();
  let computations = 0;
  const { RuntimeSequenceDiagramCanvas } = load(
    "src/features/runtime/backend.tsx",
    {
      react: {
        ...h.react,
        useMemo: (factory, deps) =>
          h.react.useMemo(() => {
            computations++;
            return factory();
          }, deps),
      },
      "./screens": { RuntimeStepperBanner() {} },
      "@/lib/i18n/locale-context": { useLocale: () => ({ t: (v) => v }) },
    },
    {},
    "\nexports.RuntimeSequenceDiagramCanvas = RuntimeSequenceDiagramCanvas;",
  );
  const steps = [
    {
      callerService: "A",
      calleeService: "B",
      operation: "/orders",
      httpMethod: "GET",
      stepOrder: 1,
    },
  ];
  const props = { steps, sessionTitle: "Trace", projectId: "project", sessionId: "session" };
  const render = (next) => {
    h.begin();
    return allNodes(RuntimeSequenceDiagramCanvas(next));
  };
  let tree = render(props);
  const svg = tree.find((n) => n.props?.dangerouslySetInnerHTML)?.props.dangerouslySetInnerHTML
    .__html;
  tree.find((n) => n.props?.onClick && n.props.children === "+").props.onClick();
  tree = render(props);
  assert.equal(computations, 1);
  assert.equal(
    tree.find((n) => n.props?.dangerouslySetInnerHTML)?.props.dangerouslySetInnerHTML.__html,
    svg,
  );
  render({ ...props, steps: [...steps, { ...steps[0], callerService: "C" }] });
  assert.equal(computations, 2);
});

test("performance: obsolete AI enrichment requests abort and ignore late responses", async () => {
  for (const relative of [
    "src/features/architecture/architecture-diagrams.tsx",
    "src/features/architecture/uml-diagram-workspace.tsx",
    "src/features/architecture/selection-three-e.tsx",
    "src/features/ai-explanations/components.tsx",
  ]) {
    const source = ts.createSourceFile(
      relative,
      fs.readFileSync(path.join(root, relative), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let effect;
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "useEffect" &&
        node.arguments[0]?.getText(source).includes('fetch("/api/ai-diagram-semantics"')
      )
        effect = node.arguments[0].getText(source);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(effect, relative);
    let request, release;
    const updates = [];
    const context = { contextHash: "context" };
    const globals = {
      AbortController,
      model,
      locale: "vi",
      kind: "CONTAINER",
      container: { id: "a" },
      systemName: "System",
      isC4EnrichableKind: true,
      buildC4CompactContext: () => context,
      clientC4EnrichmentCache: new Map(),
      clientUmlAiCache: new Map(),
      compactUmlContext: context,
      threeEAiCtx: context,
      deterministic3E: {},
      elementId: "a",
      api: { mode: "backend" },
      setC4AiEnrichment: (value) => updates.push(value),
      setUmlAiEnrichment: (value) => updates.push(value),
      setAi3E: (value) => updates.push(value),
      setAi3ELoading() {},
      fetch: (_url, init) => {
        request = init;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    };
    const js = ts.transpileModule(`const effect = ${effect}; effect();`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const cleanup = vm.runInNewContext(js, globals);
    assert.equal(request.signal.aborted, false, relative);
    const count = updates.length;
    cleanup();
    assert.equal(request.signal.aborted, true, relative);
    release({
      ok: true,
      json: async () => ({ c4Enrichment: {}, umlEnrichment: {}, threeEEnrichment: {} }),
    });
    await new Promise(setImmediate);
    assert.equal(updates.length, count, "late responses must not update another context");
    const currentCleanup = vm.runInNewContext(js, { ...globals });
    const currentCount = updates.length;
    release({
      ok: true,
      json: async () => ({ c4Enrichment: {}, umlEnrichment: {}, threeEEnrichment: {} }),
    });
    await new Promise(setImmediate);
    assert.equal(
      updates.length,
      currentCount + 1,
      "current responses still update the active view",
    );
    currentCleanup();
  }
});

test("performance: DOM translation visits changed subtrees, restores English, and cleans up", () => {
  let body,
    observer,
    visited = 0,
    frameId = 0,
    effect;
  const frames = new Map();
  class Element {
    constructor(tag = "DIV", attrs = {}) {
      this.tagName = tag;
      this.attrs = attrs;
      this.children = [];
      this.nodeType = 1;
    }
    append(node) {
      node.parentNode = this;
      this.children.push(node);
      return node;
    }
    get parentElement() {
      return this.parentNode instanceof Element ? this.parentNode : null;
    }
    get isConnected() {
      return this === body || !!this.parentNode?.isConnected;
    }
    closest() {
      return ["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA"].includes(this.tagName) ||
        "data-no-translate" in this.attrs
        ? this
        : this.parentElement?.closest();
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
    querySelectorAll() {
      return this.children.flatMap((n) =>
        n instanceof Element
          ? [
              ...(["placeholder", "title", "aria-label"].some((k) => k in n.attrs) ? [n] : []),
              ...n.querySelectorAll(),
            ]
          : [],
      );
    }
  }
  class Text {
    constructor(value) {
      this.nodeValue = value;
      this.nodeType = 3;
    }
    get parentElement() {
      return this.parentNode;
    }
    get isConnected() {
      return !!this.parentNode?.isConnected;
    }
  }
  body = new Element("BODY");
  for (let i = 0; i < 1000; i++) body.append(new Element()).append(new Text("Password"));
  const document = {
    body,
    createTreeWalker(root) {
      const texts = (node) =>
        node instanceof Text ? [node] : (node.children ?? []).flatMap(texts);
      const nodes = root instanceof Text ? [] : texts(root);
      let i = 0;
      if (root instanceof Text) visited++;
      return {
        nextNode() {
          if (i >= nodes.length) return null;
          visited++;
          return nodes[i++];
        },
      };
    },
  };
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      observer = this;
      this.records = [];
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
      this.records = [];
    }
    takeRecords() {
      return this.records.splice(0);
    }
  }
  const { AutoDomTranslator, EXACT_VI_DICTIONARY } = load(
    "src/lib/i18n/locale-context.tsx",
    {
      react: {
        ...React,
        useEffect: (callback) => {
          effect = callback;
        },
      },
    },
    {
      document,
      Element,
      Document: class {},
      NodeFilter: { SHOW_TEXT: 4 },
      MutationObserver,
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback);
        return frameId;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
    },
    "\nexports.AutoDomTranslator = AutoDomTranslator;",
  );
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  const notify = (records) => observer.callback(records);
  AutoDomTranslator({ locale: "vi" });
  const cleanup = effect();
  assert.equal(visited, 1000);
  visited = 0;
  const target = body.children[0].children[0];
  target.nodeValue = "Confirm password";
  notify([{ type: "characterData", target }]);
  flush();
  assert.equal(target.nodeValue, EXACT_VI_DICTIONARY["Confirm password"]);
  assert.equal(visited, 1, "one changed text must not revisit the other 999 nodes");
  visited = 0;
  notify([{ type: "characterData", target }]);
  assert.equal(frames.size, 0, "own translated text does not schedule a second pass");
  const added = body.append(new Element("DIV", { title: "Password" }));
  const nested = added.append(new Text("Email"));
  notify([{ type: "childList", addedNodes: [added, nested] }]);
  flush();
  assert.equal(visited, 1, "nested mutation roots are deduplicated");
  assert.equal(added.getAttribute("title"), EXACT_VI_DICTIONARY["Password"]);
  added.setAttribute("title", "Confirm password");
  notify([{ type: "attributes", target: added, attributeName: "title" }]);
  flush();
  assert.equal(added.getAttribute("title"), EXACT_VI_DICTIONARY["Confirm password"]);
  notify([{ type: "attributes", target: added, attributeName: "title" }]);
  assert.equal(frames.size, 0, "own translated attributes do not schedule a second pass");
  const skipped = body.append(new Element("PRE"));
  const code = skipped.append(new Text("Password"));
  notify([{ type: "childList", addedNodes: [skipped] }]);
  flush();
  assert.equal(code.nodeValue, "Password");
  target.nodeValue = "New password";
  notify([{ type: "characterData", target }]);
  cleanup();
  assert.equal(frames.size, 0);
  assert.equal(observer.active, false);
  AutoDomTranslator({ locale: "en" });
  effect();
  assert.equal(target.nodeValue, "New password");
  assert.equal(body.children[1].children[0].nodeValue, "Password");
  assert.equal(added.getAttribute("title"), "Confirm password");
});
