const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(
    output.replace(/require\(["']@\/([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`),
    filename,
  );
};

test("connected pipeline integration: live Java and C# pipeline output from output/m2/ renders into C4 Container view", async () => {
  const { modelView } = require("../src/lib/api/java-wire.ts");
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");

  const javaLivePath = path.resolve(__dirname, "../../output/m2/source-pipeline-java-actual.json");
  const csharpLivePath = path.resolve(__dirname, "../../output/m2/source-pipeline-csharp-graph-actual.json");

  assert.ok(
    fs.existsSync(javaLivePath),
    "Connected integration requires live output/m2/source-pipeline-java-actual.json from upstream Java run (no fallback)",
  );
  assert.ok(
    fs.existsSync(csharpLivePath),
    "Connected integration requires live output/m2/source-pipeline-csharp-graph-actual.json from upstream Java run (no fallback)",
  );

  const javaActual = JSON.parse(fs.readFileSync(javaLivePath, "utf8"));
  const javaModel = modelView(javaActual.metadata, javaActual.graph, javaActual.details);
  const javaDoc = selectDiagram(javaModel, "CONTAINER", undefined, { systemName: "PipelineDemo" }).document;
  assert.ok(javaDoc);
  const javaXml = await generateDrawio(javaDoc);
  assert.match(javaXml, /Database access \[mysql\]/);
  assert.match(javaXml, /orders-service/);
  assert.match(javaXml, /orders_db @ orders-db/);

  const csharpActual = JSON.parse(fs.readFileSync(csharpLivePath, "utf8"));
  const csharpModel = modelView(csharpActual.metadata, csharpActual.graph, csharpActual.details);
  const extElem = csharpModel.elements.find((e) => e.name === "payment-service:5000");
  assert.ok(extElem);
  const appElem = csharpModel.elements.find((e) => e.name === "App");
  assert.ok(appElem);
  const csharpDoc = selectDiagram(csharpModel, "CONTAINER", undefined, { systemName: "CSharpSystem" }).document;
  assert.ok(csharpDoc);
  const csharpXml = await generateDrawio(csharpDoc);
  assert.match(csharpXml, /payment-service:5000/);
  assert.match(csharpXml, /App/);
  assert.match(csharpXml, /SERVICE_HTTP_CALL|HttpCall|calls/i);
});

test("connected pipeline integration: live Java observed sequence output from output/m3/ projects and round-trips into UML Sequence Draw.io XML", () => {
  const { runtimeSequence } = require("../src/lib/api/java-operations.ts");
  const {
    verifyObservedLineage,
    projectObservedSequenceToInteraction,
    interactionToDrawioXml,
    extractInteractionFromDrawioXml,
  } = require("../src/features/architecture/scenario-design.ts");

  const m3LivePath = path.resolve(__dirname, "../../output/m3/observed-sequence-java-actual.json");
  assert.ok(
    fs.existsSync(m3LivePath),
    "Connected integration requires live output/m3/observed-sequence-java-actual.json from upstream Java OtelTraceCorrelationServiceImplTest run (no fallback)",
  );

  const rawObserved = JSON.parse(fs.readFileSync(m3LivePath, "utf8"));
  const parsed = runtimeSequence(rawObserved);
  assert.equal(parsed.steps.length, 3);

  const activeModel = {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 4,
    label: "M3 Live Connected Model",
    elements: [
      { id: "aaaa0001-0000-4000-8000-000000000001", name: "api-gateway", layer: "edge", elementType: "SERVICE_CONTAINER", description: "Gateway", evidence: [] },
      { id: "aaaa0002-0000-4000-8000-000000000002", name: "order-service", layer: "domain", elementType: "SERVICE_CONTAINER", description: "Order", evidence: [] },
      { id: "aaaa0003-0000-4000-8000-000000000003", name: "payment-service", layer: "domain", elementType: "SERVICE_CONTAINER", description: "Payment", evidence: [] },
      { id: "aaaa0004-0000-4000-8000-000000000004", name: "audit-worker", layer: "infra", elementType: "SERVICE_CONTAINER", description: "Audit", evidence: [] },
    ],
    edges: [],
  };

  const lineage = verifyObservedLineage(parsed, activeModel, activeModel.id);
  assert.equal(lineage.valid, true, `Lineage summary: ${lineage.summary}`);

  const projected = projectObservedSequenceToInteraction(parsed, activeModel);
  assert.equal(projected.lineageValid, true);
  assert.equal(projected.document.mode, "OBSERVED");
  assert.equal(projected.document.messages.length, 3);
  const xml = interactionToDrawioXml(projected.document, activeModel);
  assert.match(xml, /mavisInteraction=/);
  assert.match(xml, /fontStyle=0/);
  assert.doesNotMatch(xml, /fontStyle=4/);

  const roundTripped = extractInteractionFromDrawioXml(xml, activeModel);
  assert.ok(roundTripped && roundTripped.document);
  assert.equal(roundTripped.roundTripConflicts.length, 0);
  assert.equal(roundTripped.document.interactionId, projected.document.interactionId);
});

test("connected pipeline integration: live Java and C# pipeline outputs project and round-trip across M4 Class/Package, M5 Deployment, M6 Activity, M7 State Machine, and M8 Coverage Matrix", () => {
  const { modelView } = require("../src/lib/api/java-wire.ts");
  const {
    projectUmlClassDiagram,
    projectUmlPackageDiagram,
    projectUmlDeploymentDiagram,
    projectUmlActivityDiagram,
    projectUmlStateDiagram,
    buildUmlDrawioXml,
    reconcileUmlDrawioXml,
  } = require("../src/features/architecture/uml-diagrams.ts");
  const {
    runSeededGraphBenchmark,
    buildM8CoverageMatrix,
  } = require("../src/features/architecture/m8-benchmark-and-coverage.ts");

  const javaLivePath = path.resolve(__dirname, "../../output/m2/source-pipeline-java-actual.json");
  const csharpLivePath = path.resolve(
    __dirname,
    "../../output/m2/source-pipeline-csharp-graph-actual.json",
  );
  const javaActual = JSON.parse(fs.readFileSync(javaLivePath, "utf8"));
  const csharpActual = JSON.parse(fs.readFileSync(csharpLivePath, "utf8"));
  const javaModel = modelView(javaActual.metadata, javaActual.graph, javaActual.details);
  const csharpModel = modelView(csharpActual.metadata, csharpActual.graph, csharpActual.details);

  for (const [label, model] of [
    ["JAVA", javaModel],
    ["CSHARP", csharpModel],
  ]) {
    const projections = [
      projectUmlClassDiagram(model),
      projectUmlPackageDiagram(model),
      projectUmlDeploymentDiagram(model),
      projectUmlActivityDiagram(model),
      projectUmlStateDiagram(model),
    ];
    for (const proj of projections) {
      const xml1 = buildUmlDrawioXml(proj);
      assert.match(xml1, /<mxGraphModel/, `${label} ${proj.diagramKind} XML must be valid Draw.io mxGraphModel`);
      const rt1 = reconcileUmlDrawioXml(xml1, proj);
      assert.equal(rt1.conflicts.length, 0, `${label} ${proj.diagramKind} cycle 1 must have 0 conflicts`);
      const xml2 = buildUmlDrawioXml(rt1.projection, rt1.preservedLayout);
      const rt2 = reconcileUmlDrawioXml(xml2, rt1.projection);
      assert.equal(rt2.conflicts.length, 0, `${label} ${proj.diagramKind} cycle 2 must have 0 conflicts`);
    }
  }

  const m8Dir = path.resolve(__dirname, "../../output/m8");
  fs.mkdirSync(m8Dir, { recursive: true });
  const browserBenchPath = path.join(m8Dir, "graph-browser-workload-benchmark-2026-10-25.json");
  const browserVerified = fs.existsSync(browserBenchPath);

  const projBench = runSeededGraphBenchmark([100, 500, 2000], 5, 20261025);
  const coverageMatrix = buildM8CoverageMatrix({
    javaModel,
    csharpModel,
    browserWorkloadVerified: browserVerified,
    liveOtelTraceCaptured: false,
  });

  fs.writeFileSync(
    path.join(m8Dir, "graph-performance-benchmark.json"),
    JSON.stringify(projBench, null, 2),
  );
  fs.writeFileSync(
    path.join(m8Dir, "coverage-matrix.json"),
    JSON.stringify(coverageMatrix, null, 2),
  );
  fs.writeFileSync(
    path.join(m8Dir, "rule-and-language-coverage-matrix-2026-10-25.json"),
    JSON.stringify(coverageMatrix, null, 2),
  );
});
