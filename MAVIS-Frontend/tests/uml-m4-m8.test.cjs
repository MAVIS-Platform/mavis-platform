const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
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

const { modelView } = require("../src/lib/api/java-wire.ts");
const { deploymentSegmentHitsBox } = require("../src/features/architecture/deployment-routing.ts");
const { activityNodeSize } = require("../src/features/architecture/activity-layout.ts");
const {
  diagramKinds,
  canonicalDiagramCatalog,
  selectDiagram,
} = require("../src/features/architecture/diagram-catalog.ts");
const {
  projectUmlClassDiagram,
  projectUmlPackageDiagram,
  projectUmlDeploymentDiagram,
  projectUmlActivityDiagram,
  projectUmlStateDiagram,
  listStateTargets,
  buildUmlDrawioXml,
  reconcileUmlDrawioXml,
  hydrateUmlWorkspaceFromXml,
  resolveUmlSelectionContext,
} = require("../src/features/architecture/uml-diagrams.ts");
const {
  runSeededGraphBenchmark,
  buildM8CoverageMatrix,
} = require("../src/features/architecture/m8-benchmark-and-coverage.ts");

function loadJavaFixtureModel() {
  const javaFixturePath = path.resolve(__dirname, "./fixtures/source-pipeline-java-actual.json");
  const javaActual = JSON.parse(fs.readFileSync(javaFixturePath, "utf8"));
  return modelView(javaActual.metadata, javaActual.graph, javaActual.details);
}

function loadCsharpFixtureModel() {
  const csharpFixturePath = path.resolve(
    __dirname,
    "./fixtures/source-pipeline-csharp-graph-actual.json",
  );
  const csharpActual = JSON.parse(fs.readFileSync(csharpFixturePath, "utf8"));
  return modelView(csharpActual.metadata, csharpActual.graph, csharpActual.details);
}

function activityWorkflowFixture() {
  const services = ["api-gateway", "order-service", "consumer-service", "kitchen-service", "accounting-service", "delivery-service", "restaurant-service", "order-history-service"];
  return { id: "activity-lifecycle", projectId: "p", snapshotId: "s", revision: 1, label: "Workflows",
    elements: services.map(name => ({ id: name, name: "ftgo-" + name, elementType: "SERVICE_CONTAINER", parentId: null, properties: {}, evidence: [] })),
    edges: [{ id: "call", from: "order-service", to: "consumer-service", protocol: "HTTP", uncertain: false, evidence: [] }] };
}

test("Assignment requirements expose exactly the eight sidebar diagrams plus Graph and distinguish C4 levels", () => {
  const {COURSEWORK_DIAGRAM_TYPES,normalizeDiagramRequirements,diagramTypeLabel}=require("../src/lib/architecture/coursework-diagram-types.ts");
  const {artifactNotation,missingDiagramRequirements}=require("../src/features/submissions/submission-readiness.ts");
  assert.equal(COURSEWORK_DIAGRAM_TYPES.length,9);
  assert.deepEqual(new Set(COURSEWORK_DIAGRAM_TYPES.map(t=>t.id)),new Set([...canonicalDiagramCatalog.map(t=>t.id),"DEPENDENCY_GRAPH"]));
  assert.ok(!COURSEWORK_DIAGRAM_TYPES.some(t=>["C4","VIEW_4_PLUS_1","BUNDLE"].includes(t.id)));
  for(const [view,type] of [["context","C4_CONTEXT"],["container","C4_CONTAINER"],["containers","C4_CONTAINER"],["component:service-id","C4_COMPONENT"],["c4-context","C4_CONTEXT"],["uml-class:service","UML_CLASS"],["scenarios:auto:macro:service","UML_SEQUENCE"],["graph","DEPENDENCY_GRAPH"]])assert.equal(artifactNotation(view),type);
  assert.deepEqual(missingDiagramRequirements(["C4_CONTEXT","C4_CONTAINER","C4_COMPONENT"],{documents:[{viewId:"container",revision:1}],diagramVersionIds:[]},[]),["C4_CONTEXT","C4_COMPONENT"]);
  assert.deepEqual(missingDiagramRequirements(["C4_COMPONENT"],{documents:[],diagramVersionIds:["container"]},[{id:"container",notation:"C4",level:"CONTAINER"}]),["C4_COMPONENT"]);
  assert.deepEqual(missingDiagramRequirements(["C4_COMPONENT"],{documents:[],diagramVersionIds:["component"]},[{id:"component",notation:"C4",level:"COMPONENT"}]),[]);
  assert.deepEqual(new Set(normalizeDiagramRequirements(["C4","VIEW_4_PLUS_1","UML_CLASS"])),new Set(["C4_CONTAINER","C4_COMPONENT","UML_CLASS"]));
  assert.equal(diagramTypeLabel("DEPENDENCY_GRAPH"),"Graph");
});

test("Class semantics use lifecycle evidence for diamonds and keep domain models while hiding only isolated plumbing", () => {
  const cls = (id, extra = {}, members = []) => ({ id, name: id, parentId: "svc", elementType: "CLASS_INTERFACE", evidence: [], properties: { umlClassifier: {
    name: id, qualifiedName: "sample.fulfillment." + id, packageName: "sample.fulfillment", typeKind: "CLASS", members, extractionCompleteness: "COMPLETE", ...extra,
  } } });
  const field = (name, type) => ({ memberKind: "FIELD", name, type, visibility: "PUBLIC", isStatic: false });
  const elements = [
    { id: "svc", name: "fulfillment", elementType: "SERVICE_CONTAINER", evidence: [] },
    cls("InboundHandler"), cls("Coordinator"), cls("DocumentStore"),
    cls("Consignment", { annotations: ["Entity"] }), cls("PackageUnit", { annotations: ["Embeddable"] }),
    cls("OutboundPort", {}, [field("dispatch", "CommandEndpoint<DispatchCommand>")]),
    cls("TraceFilter", { interfaceTypes: ["Filter"], imports: ["jakarta.servlet.Filter"] }),
    cls("PriceFilter", { interfaceTypes: ["Filter"], imports: ["sample.domain.Filter"] }),
  ];
  const edge = (id, from, to, properties) => ({ id, from, to, protocol: "CODE_DEPENDENCY", uncertain: false, evidence: [], properties });
  const model = { id: "generic-class-semantics", elements, edges: [
    edge("injected-one", "InboundHandler", "Coordinator", { umlRelationKind: "SHARED_AGGREGATION", astVerifiedWholePart: true }),
    edge("injected-two", "Coordinator", "DocumentStore", { umlRelationKind: "COMPOSITION", astVerifiedWholePart: true }),
    edge("owned", "Consignment", "PackageUnit", { umlRelationKind: "COMPOSITION", astVerifiedWholePart: true, ownershipEvidence: "EMBEDDED_VALUE" }),
    edge("wrong-injected-proof", "Consignment", "DocumentStore", { umlRelationKind: "COMPOSITION", astVerifiedWholePart: true, ownershipEvidence: "EMBEDDED_VALUE", injectedReference: true }),
  ] };
  const projection = projectUmlClassDiagram(model);
  assert.equal(projection.relations.find(r => r.relationId === "injected-one").relationKind, "ASSOCIATION");
  assert.equal(projection.relations.find(r => r.relationId === "injected-two").relationKind, "ASSOCIATION");
  assert.equal(projection.relations.find(r => r.relationId === "owned").relationKind, "COMPOSITION");
  assert.equal(projection.relations.find(r => r.relationId === "wrong-injected-proof").relationKind, "ASSOCIATION");
  assert.ok(projection.classifiers.some(c => c.classifierId === "Consignment"));
  assert.ok(projection.classifiers.some(c => c.classifierId === "PackageUnit"));
  assert.ok(!projection.classifiers.some(c => c.classifierId === "TraceFilter"));
  assert.ok(projection.classifiers.some(c => c.classifierId === "PriceFilter"), "A business Filter must not be hidden by name");
  assert.equal(projection.classifiers.find(c => c.classifierId === "OutboundPort").isClientProxy, true);
  assert.ok(projectUmlClassDiagram(model, { packageName: "sample.fulfillment" }).classifiers.some(c => c.classifierId === "TraceFilter"), "Explicit package inspection includes isolated infrastructure");
  const connected = projectUmlClassDiagram({ ...model, edges: [...model.edges, edge("filter-use", "InboundHandler", "TraceFilter", {})] });
  assert.ok(connected.classifiers.some(c => c.classifierId === "TraceFilter"), "Connected infrastructure must remain visible");
  const xml = buildUmlDrawioXml(projection);
  assert.match(xml, /client proxy/);
  assert.equal(reconcileUmlDrawioXml(xml, projection).conflicts.length, 0);
});

test("Service class scope includes canonical shared signature types and owned value types without pulling in a foreign service", () => {
  const classifier = (id, parentId, extra = {}) => ({ id, name: id, elementType: "CLASS_INTERFACE", parentId, evidence: [], properties: { umlClassifier: {
    name: id, qualifiedName: "sample.shared." + id, packageName: "sample.shared", typeKind: "CLASS", members: [], ...extra,
  } } });
  const edge = (id, from, to, properties) => ({ id, from, to, protocol: "CODE_DEPENDENCY", evidence: [], uncertain: false, properties });
  const model = { id: "shared-closure", elements: [
    { id: "svc", name: "logistics", elementType: "SERVICE_CONTAINER", evidence: [] }, { id: "other", name: "billing", elementType: "SERVICE_CONTAINER", evidence: [] },
    classifier("CatalogStore", "svc"), classifier("Consignment", null, { annotations: ["Entity"] }),
    classifier("ShippingLabel", null, { annotations: ["Embeddable"] }), classifier("DeliveryStatus", null, { typeKind: "ENUM" }), classifier("ForeignCoordinator", "other"),
  ], edges: [
    edge("generic-entity", "CatalogStore", "Consignment", { umlRelationKind: "DEPENDENCY", declaredType: "CrudRepository<Consignment, Long>" }),
    edge("owned-value", "Consignment", "ShippingLabel", { umlRelationKind: "COMPOSITION", declaredType: "ShippingLabel", astVerifiedWholePart: true, ownershipEvidence: "EMBEDDED_VALUE" }),
    edge("status", "Consignment", "DeliveryStatus", { umlRelationKind: "ASSOCIATION", declaredType: "DeliveryStatus" }),
    edge("foreign", "CatalogStore", "ForeignCoordinator", { umlRelationKind: "DEPENDENCY", declaredType: "ForeignCoordinator" }),
  ] };
  const projection = projectUmlClassDiagram(model, { serviceId: "svc" });
  assert.deepEqual(new Set(projection.classifiers.map(c => c.classifierId)), new Set(["CatalogStore", "Consignment", "ShippingLabel", "DeliveryStatus"]));
  assert.equal(projection.classifiers.find(c => c.classifierId === "Consignment").serviceId, null);
  assert.ok(!projection.relations.some(r => r.toClassifierId === "ForeignCoordinator"));
  const xml = buildUmlDrawioXml(projection);
  assert.equal(reconcileUmlDrawioXml(xml, projection).conflicts.length, 0);
});

test("Legacy source preview reads builder/lambda fields and annotated operations without inventing lifecycle, members or graph IDs", () => {
  const os = require("node:os");
  const { parseSourceFileToUmlMeta, enrichModelWithSourceUmlMetadata } = require("../src/lib/api/java-operations.ts");
  const { formatClassifierCellValue } = require("../src/features/architecture/uml-diagrams.ts");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mavis-class-preview-"));
  try {
    const source = `package sample.preview;
      import sample.preview.RebalanceSaga;
      import sample.messaging.CommandEndpoint;
      public class InventoryService {
        public final CommandEndpoint<Dispatch> dispatch = EndpointBuilder.forCommand(Dispatch.class).build();
        public static final String URI = "http://example.invalid/{path}//literal";
        protected java.util.function.Supplier<String> state = () -> { return "{ready}"; };
        private final RebalanceSaga workflow;
        InventoryService(RebalanceSaga workflow, UndeclaredInput input) { this.workflow = workflow; }
        @org.springframework.web.bind.annotation.GetMapping(path={"/one", "/two"})
        public final reactor.core.publisher.Mono<Parcel> find(@org.springframework.web.bind.annotation.RequestParam("id") String id) { return null; }
      }`;
    const sourceFile = path.join(temp, "InventoryService.java"), sagaFile = path.join(temp, "RebalanceSaga.java");
    fs.writeFileSync(sourceFile, source);
    fs.writeFileSync(sagaFile, "package sample.preview; public class RebalanceSaga {} ");
    const meta = parseSourceFileToUmlMeta(sourceFile, "InventoryService", "sample.preview.InventoryService");
    assert.ok(meta);
    assert.deepEqual(new Set(meta.members.filter(m => m.memberKind === "FIELD").map(m => m.name)), new Set(["dispatch", "URI", "state", "workflow"]));
    assert.ok(meta.members.some(m => m.memberKind === "METHOD" && m.name === "find"));
    assert.ok(!meta.members.some(m => m.name === "input"), "A constructor parameter is not automatically a field");
    assert.ok(meta.rawSource.includes("http://example.invalid/{path}//literal"));
    assert.equal(parseSourceFileToUmlMeta(sourceFile, "DifferentType", "sample.preview.DifferentType"), null);
    const storeFile = path.join(temp, "CatalogStore.java");
    fs.writeFileSync(storeFile, "package sample.preview; public interface CatalogStore extends CrudRepository<Parcel, Long> {}");
    assert.equal(parseSourceFileToUmlMeta(storeFile, "CatalogStore", "sample.preview.CatalogStore").members.length, 0, "External inherited operations are not declared AST members");
    const element = (id, name, sourcePath) => ({ id, name, elementType: "COMPONENT", parentId: "svc", evidence: [], properties: { sourcePath, qualifiedName: "sample.preview." + name } });
    const model = { id: "legacy-preview", elements: [element("service", "InventoryService", sourceFile), element("workflow", "RebalanceSaga", sagaFile)],
      edges: [{ id: "canonical-edge", from: "service", to: "workflow", protocol: "CODE_DEPENDENCY", uncertain: false, evidence: [] }] };
    const enriched = enrichModelWithSourceUmlMetadata(model);
    assert.deepEqual(enriched.edges.map(e => e.id), ["canonical-edge"]);
    assert.equal(enriched.edges[0].properties.umlRelationKind, "ASSOCIATION");
    assert.ok(!enriched.edges[0].properties.astVerifiedWholePart);
    const diagram = projectUmlClassDiagram(enriched);
    const service = diagram.classifiers.find(c => c.classifierId === "service");
    assert.ok(service.attributes.some(a => a.name === "dispatch"));
    assert.equal(service.isClientProxy, true);
    assert.equal(service.sourceCompleteness, "PARTIAL");
    const workflow = diagram.classifiers.find(c => c.classifierId === "workflow");
    assert.match(formatClassifierCellValue(workflow), /operations not extracted/);
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith("mavis-class-preview-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("Package membership preserves every classifier and places annotated entities and aggregate roots first", () => {
  const specifications = [
    ["AService", {}], ["BRepository", {}], ["CPublisher", {}], ["DHelper", {}],
    ["ZParcel", { annotations: ["jakarta.persistence.Entity"] }],
    ["ZDepot", { annotations: ["Entity"] }], ["YAggregate", { baseTypes: ["AbstractAggregateRoot"] }],
  ];
  const model = { id: "entity-members", edges: [], elements: [{ id: "svc", name: "shipping", elementType: "SERVICE_CONTAINER", evidence: [] },
    ...specifications.map(([name, extra]) => ({ id: name, name, parentId: "svc", elementType: "CLASS_INTERFACE", evidence: [], properties: {
      umlClassifier: { name, qualifiedName: "sample.shipping.domain." + name, packageName: "sample.shipping.domain", typeKind: "CLASS", members: [], ...extra },
    } }))] };
  const projection = projectUmlPackageDiagram(model);
  const domain = projection.packages[0];
  assert.equal(domain.memberNames.length, specifications.length);
  assert.deepEqual(new Set(domain.memberNames.slice(0, 3)), new Set(["ZParcel", "ZDepot", "YAggregate"]));
  assert.deepEqual(domain.memberClassifierIds, domain.memberNames, "Member IDs must stay aligned with names when prioritized");
  const xml = buildUmlDrawioXml(projection);
  for (const [name] of specifications) assert.ok(xml.includes("• " + name), name + " must remain visible");
  assert.equal(reconcileUmlDrawioXml(xml, projection).conflicts.length, 0);
});

test("Package fan-in reserves separate ports, non-overlapping wire segments and independent use labels", () => {
  const ids = ["http", "rpc", "events", "domain"];
  const projection = { diagramKind: "UML_PACKAGE", modelId: "fan-in", scopeServiceId: "svc", validationIssues: [],
    packages: ids.map(id => ({ packageId: id, name: id, qualifiedName: "sample.shipping." + id, parentPackageId: null, serviceId: "svc", memberClassifierIds: [id + "-class"], memberNames: [id + "Class"], provenance: "EXTRACTED" })),
    edges: ids.slice(0, 3).map(id => ({ edgeId: id + "-domain", fromPackageId: id, toPackageId: "domain", relationKind: "DEPENDENCY", underlyingEdgeIds: [id + "-ref"], evidenceIds: [], provenance: "EXTRACTED" })) };
  const layout = { http: { x: 80, y: 80, width: 280, height: 150 }, rpc: { x: 460, y: 80, width: 280, height: 150 }, events: { x: 840, y: 80, width: 280, height: 150 }, domain: { x: 430, y: 520, width: 350, height: 200 } };
  const xml = buildUmlDrawioXml(projection, layout);
  const attrs = text => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const paths = [], labels = [], ports = [];
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const boxes = Object.values(layout).map(b => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
  for (const edge of projection.edges) {
    const cell = [...xml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].find(m => attrs(m[1]).id === edge.edgeId);
    const style = Object.fromEntries(attrs(cell[1]).style.split(";").map(p => p.split("=")));
    assert.equal(style.noEdgeStyle, "1", "Fan-in needs a resolved obstacle-checked route");
    assert.equal(style.entryPerimeter, "0");
    ports.push(+style.entryX);
    const sb = layout[edge.fromPackageId], tb = layout[edge.toPackageId];
    const waypoints = [...cell[2].matchAll(/<mxPoint\b([^>]*)\/>/g)].map(m => attrs(m[1]));
    const path = [{ x: Math.round(sb.x + sb.width * +style.exitX + +style.exitDx), y: Math.round(sb.y + sb.height * +style.exitY + +style.exitDy) },
      ...waypoints.filter(p => !p.as).map(p => ({ x: +p.x, y: +p.y })),
      { x: Math.round(tb.x + tb.width * +style.entryX + +style.entryDx), y: Math.round(tb.y + tb.height * +style.entryY + +style.entryDy) }];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      assert.ok(a.x === b.x || a.y === b.y, "Package wire segments must be orthogonal");
      for (const previous of paths) for (let j = 1; j < previous.length; j++) {
        const c = previous[j - 1], d = previous[j];
        const horizontal = a.y === b.y && c.y === d.y && a.y === c.y;
        const vertical = a.x === b.x && c.x === d.x && a.x === c.x;
        const length = horizontal ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
          : vertical ? Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) : 0;
        assert.ok(length <= 0, "Incoming package wires must not merge onto the same segment");
      }
    }
    const geometry = attrs(cell[2].match(/<mxGeometry\b([^>]*)/)[1]);
    const lengths = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y));
    let distance = (+geometry.x + 1) / 2 * lengths.reduce((a, b) => a + b, 0), index = 0;
    while (index < lengths.length - 1 && distance > lengths[index]) distance -= lengths[index++];
    const a = path[index], b = path[index + 1], fraction = lengths[index] ? distance / lengths[index] : 0;
    const offset = waypoints.find(p => p.as === "offset"), width = 56;
    const label = { x: a.x + (b.x - a.x) * fraction + +(offset.x || 0) - width / 2, y: a.y + (b.y - a.y) * fraction + +(offset.y || 0) - 12, w: width, h: 24 };
    assert.ok(![...boxes, ...labels].some(box => overlaps(label, box)), "Use labels must avoid packages and other labels");
    paths.push(path); labels.push(label);
  }
  assert.equal(new Set(ports).size, projection.edges.length, "Every incoming edge needs its own target port");
  assert.equal(reconcileUmlDrawioXml(xml, projection).conflicts.length, 0);
});

test("Deployment includes sanitized configured endpoints and keeps startup declarations distinct", () => {
  const services = ["gateway", "orders", "kafka", "mysql", "dynamo"];
  const model = { id: "configured", edges: [], elements: services.map(name => ({ id: name, name, elementType: "SERVICE_CONTAINER", parentId: null, evidence: [], properties: {
    deploymentMetadata: { environment: "default", nodeStereotype: "<<executionEnvironment>>", artifactName: name === "gateway" ? "gateway.jar" : name + ":latest", artifactResolution: name === "gateway" ? "DOCKERFILE_DECLARED_ARTIFACT" : "EXPLICIT_CONTAINER_IMAGE", connections: name === "gateway" ? [
      { targetService: "orders", protocol: "HTTP", port: 8080 }, { targetService: "kafka", protocol: "TCP", port: 29092 },
      { targetService: "dynamo", protocol: "HTTP", port: 8000 }, { targetService: "mysql", protocol: "STARTUP_DEPENDENCY", port: 3306 },
      { targetService: "unknown", protocol: "HTTP", port: 8080 },
    ] : [] }, sourceType: "DOCKER_COMPOSE" } })) };
  const diagram = projectUmlDeploymentDiagram(model);
  assert.equal(diagram.edges.filter(e => e.edgeKind === "COMMUNICATION_PATH").length, 3);
  assert.ok(diagram.edges.some(e => e.protocol === "TCP" && e.port === "29092"));
  assert.ok(diagram.edges.some(e => e.edgeKind === "DEPLOYMENT_DEPENDENCY_STARTUP" && e.protocol === "depends_on"));
  assert.ok(diagram.nodes.some(n => n.nodeKind === "ARTIFACT" && n.name === "gateway.jar"));
  assert.equal(reconcileUmlDrawioXml(buildUmlDrawioXml(diagram), diagram).conflicts.length, 0);
});

test("Class client proxy stereotype is source grounded and scoped connectors avoid sibling classifier boxes", () => {
  const model = loadJavaFixtureModel();
  const base = projectUmlClassDiagram(model);
  const source = model.elements.find(e => e.id === base.classifiers[0].classifierId);
  source.properties.umlClassifier.members = [...(source.properties.umlClassifier.members ?? []), { kind: "FIELD", name: "client", type: "WebClient", visibility: "PRIVATE" }];
  const updated = projectUmlClassDiagram(model);
  assert.equal(updated.classifiers.find(c => c.classifierId === source.id).isClientProxy, true);
  const boxes = updated.classifiers.slice(0, 3);
  assert.equal(boxes.length, 3);
  const projection = { ...updated, classifiers: boxes, relations: [{ relationId: "cross", sourceRelationshipId: null, fromClassifierId: boxes[0].classifierId, toClassifierId: boxes[2].classifierId, relationKind: "DEPENDENCY", roleName: null, multiplicity: null, provenance: "DESIGNED", evidenceIds: [] }] };
  const layout = Object.fromEntries(boxes.map((c, i) => [c.classifierId, { x: 80 + i * 400, y: 100, width: 300, height: 250 }]));
  const xml = buildUmlDrawioXml(projection, layout);
  assert.match(xml, /client proxy/);
  const cell = xml.match(/<mxCell id="cross"([^>]*)>([\s\S]*?)<\/mxCell>/);
  assert.match(cell[1], /noEdgeStyle=1/);
  const sibling = layout[boxes[1].classifierId], obstacle = { x: sibling.x, y: sibling.y, w: sibling.width, h: sibling.height };
  const points = [...cell[2].matchAll(/<mxPoint x="([^"]+)" y="([^"]+)"\/>/g)].map(m => ({ x: +m[1], y: +m[2] }));
  for (let i = 1; i < points.length; i++) assert.ok(!deploymentSegmentHitsBox(points[i - 1], points[i], obstacle, 0));
});

test("All Activity workflows remain complete and unique through repeated save/hydrate/regenerate cycles", () => {
  const { listActivityOperations } = require("../src/features/architecture/uml-diagrams.ts");
  const model = activityWorkflowFixture();
  for (const op of listActivityOperations(model)) {
    const baseline = projectUmlActivityDiagram(model, { operationId: op.operationId });
    let current = baseline;
    for (let cycle = 0; cycle < 4; cycle++) {
      const xml = buildUmlDrawioXml(current);
      const hydrated = hydrateUmlWorkspaceFromXml(xml, model, { diagramKind: "UML_ACTIVITY", selectedOperationId: op.operationId });
      assert.equal(hydrated.conflicts.length, 0, `${op.methodName}: cycle ${cycle} must have no hydration conflicts`);
      current = projectUmlActivityDiagram(model, { operationId: op.operationId, overlay: hydrated.activityOverlay });
      assert.equal(current.nodes.length, baseline.nodes.length, `${op.methodName}: save must not clone generated nodes`);
      assert.equal(current.edges.length, baseline.edges.length, `${op.methodName}: all wires must survive save`);
      assert.equal(new Set(current.nodes.map(n => n.nodeId)).size, current.nodes.length);
      assert.equal(new Set(current.edges.map(e => e.edgeId)).size, current.edges.length);
      assert.equal(current.nodes.filter(n => n.kind === "INITIAL").length, 1);
      const ids = new Set(current.nodes.map(n => n.nodeId));
      assert.ok(current.edges.every(e => ids.has(e.from) && ids.has(e.to)));
    }
  }
});

test("Activity repairs legacy generated overlays without losing authored steps or leaking them to another workflow", () => {
  const model = activityWorkflowFixture(), operationId = "flow:business:create-order-flow";
  const baseline = projectUmlActivityDiagram(model, { operationId });
  const authored = { ...baseline.nodes.find(n => n.kind === "ACTION"), nodeId: "user:review", kind: "OBJECT_NODE", label: "Manual review note", generatedBy: undefined };
  const overlay = { operationId, designedNodes: [...baseline.nodes.map(n => ({ ...n, generatedBy: undefined })), authored],
    designedEdges: baseline.edges.map(e => ({ ...e, generatedBy: undefined })) };
  const projected = projectUmlActivityDiagram(model, { operationId, overlay });
  assert.equal(projected.nodes.length, baseline.nodes.length + 1);
  assert.equal(projected.edges.length, baseline.edges.length);
  let xml = buildUmlDrawioXml(projected);
  // Reproduce a carrier written by the old saver, which persisted template nodes as user edits.
  const unescape = s => s.replaceAll("&#xa;", "\n").replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
  const escape = s => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "&#xa;");
  const carrier = JSON.parse(unescape(xml.match(/mavisUmlDocument="([^"]*)"/)[1]));
  carrier.activityOverlay = overlay;
  xml = xml.replace(/mavisUmlDocument="[^"]*"/, `mavisUmlDocument="${escape(JSON.stringify(carrier))}"`).replace('mavisActivityVersion="3"', '');
  const restored = hydrateUmlWorkspaceFromXml(xml, model, { diagramKind: "UML_ACTIVITY", selectedOperationId: operationId });
  assert.equal(restored.conflicts.length, 0);
  assert.deepEqual(restored.activityOverlay.designedNodes.map(n => n.nodeId), [authored.nodeId]);
  assert.equal(restored.activityOverlay.designedEdges.length, 0);
  const again = projectUmlActivityDiagram(model, { operationId, overlay: restored.activityOverlay });
  assert.equal(again.nodes.length, projected.nodes.length);
  const otherId = "flow:business:cancel-order-flow";
  const other = projectUmlActivityDiagram(model, { operationId: otherId, overlay: restored.activityOverlay });
  assert.ok(!other.nodes.some(n => n.nodeId === authored.nodeId));
  assert.equal(other.nodes.filter(n => n.kind === "INITIAL").length, 1);
});

test("Activity layout is independent of node serialization and supports back edges and single-lane branches", () => {
  const { planActivityRows } = require("../src/features/architecture/activity-layout.ts");
  const nodes = ["start", "validate", "decision", "retry", "accept", "done"].map((nodeId, i) => ({ nodeId, partitionId: "lane", kind: i === 0 ? "INITIAL" : "ACTION" }));
  const edges = [["start", "validate"], ["validate", "decision"], ["decision", "retry"], ["retry", "validate"], ["decision", "accept"], ["accept", "done"]].map(([from, to]) => ({ from, to }));
  const rows = planActivityRows(nodes, edges), reordered = planActivityRows([...nodes].reverse(), [...edges].reverse());
  assert.deepEqual([...rows].sort(), [...reordered].sort());
  assert.equal(rows.size, nodes.length);
  assert.equal(new Set(rows.values()).size, nodes.length, "Nodes in one lane must occupy distinct rows");
  assert.equal(rows.get("start"), 0);
  assert.ok(rows.get("done") > rows.get("accept"));
});

test("Activity validation detects missing wires and disconnected branches instead of reporting a complete workflow", () => {
  const { validateActivityStructure } = require("../src/features/architecture/uml-diagrams.ts");
  const base = projectUmlActivityDiagram(activityWorkflowFixture());
  const decision = base.nodes.find(n => n.kind === "DECISION");
  const issues = validateActivityStructure(base.nodes, base.edges.filter(e => e.from !== decision.nodeId).concat({
    ...base.edges[0], edgeId: "dangling", to: "missing-target",
  }));
  for (const code of ["DANGLING_ACTIVITY_EDGE", "UNREACHABLE_ACTIVITY_NODE", "INCOMPLETE_DECISION_BRANCHES", "ACTIVITY_DEAD_END"]) assert.ok(issues.some(i => i.code === code), code);
  const duplicated = validateActivityStructure([...base.nodes, base.nodes[0]], [...base.edges, base.edges[0]]);
  assert.ok(duplicated.some(i => i.code === "DUPLICATE_ACTIVITY_NODE"));
  assert.ok(duplicated.some(i => i.code === "DUPLICATE_ACTIVITY_EDGE"));
});

test("Activity inference does not promote infrastructure dependencies or invented branches to extracted main flows", () => {
  const element = (id, name) => ({ id, name, elementType: "SERVICE_CONTAINER", parentId: null, evidence: [], properties: {} });
  const model = { id: "inference", elements: [element("a", "alpha-service"), element("b", "beta-service"),
    element("z", "zookeeper"), element("c", "cdc-service"), element("d", "dynamodblocal-init")], edges: [
    { id: "az", from: "a", to: "z", protocol: "DECLARED_COMPOSE", originLayer: "DEPLOYMENT", evidence: [], uncertain: false },
    { id: "ab", from: "a", to: "b", protocol: "CODE_DEPENDENCY", originLayer: "STATIC", evidence: [], uncertain: false },
    { id: "ac", from: "a", to: "c", protocol: "HTTP", evidence: [], uncertain: false },
  ] };
  const { listActivityOperations, applyUmlAiEnrichment } = require("../src/features/architecture/uml-diagrams.ts");
  assert.equal(listActivityOperations(model).length, 0, "Dependencies and infrastructure do not prove a business flow");
  model.edges.push({ id: "http", from: "a", to: "b", protocol: "HTTP", evidence: [], uncertain: false });
  const flow = projectUmlActivityDiagram(model);
  assert.equal(flow.extractionCompleteness, "PARTIAL");
  assert.equal(flow.partitions.length, 2);
  assert.ok(flow.nodes.every(n => n.provenance === "DESIGNED"));
  assert.ok(!flow.nodes.some(n => n.kind === "DECISION" || /bồi hoàn|hợp lệ|hoàn tất/i.test(n.label)));
  assert.ok(flow.edges.every(e => e.guard === null));
  const patched = applyUmlAiEnrichment(flow, { flowTitle: "Confirmed main flow", activityEdges: { [flow.edges[0].edgeId]: { guard: "approved" } } });
  assert.equal(patched.availableOperations[0].methodName, flow.availableOperations[0].methodName);
  assert.equal(patched.edges[0].guard, null, "AI must not add conditions to unconditional edges");
});

test("Activity layout keeps branch guards off actions and preserves source conditions against AI rewrites", () => {
  const { applyUmlAiEnrichment } = require("../src/features/architecture/uml-diagrams.ts");
  const partitions = [{ partitionId: "left", name: "Kitchen", serviceId: "k" }, { partitionId: "right", name: "Payment", serviceId: "p" }];
  const makeNode = (id, kind, lane, label) => ({ nodeId: id, kind, label, partitionId: lane,
    partitionName: lane, provenance: "EXTRACTED", objectState: null, joinSpec: null });
  const nodes = [makeNode("start", "INITIAL", "right", "Start"),
    makeNode("pay", "ACTION", "right", "Authorize payment and validate customer account " + "with explicit source conditions ".repeat(5)),
    makeNode("decide", "DECISION", "right", "Payment authorization accepted and balance sufficient?"),
    makeNode("cancel", "ACTION", "left", "Hủy vé bếp tạm (cancelCreateTicket) [CANCELLED]"),
    makeNode("confirm", "ACTION", "left", "Xác nhận vé bếp chính thức (confirmCreateTicket) [AWAITING_ACCEPTANCE]"),
    makeNode("failed", "FLOW_FINAL", "left", "Stop"), makeNode("done", "ACTIVITY_FINAL", "left", "Complete")];
  const makeEdge = (from, to, guard = null) => ({ edgeId: from + to, from, to, guard, flowKind: "CONTROL_FLOW", provenance: "EXTRACTED" });
  const edges = [makeEdge("start", "pay"), makeEdge("pay", "decide"), makeEdge("decide", "cancel", "!authorized"),
    makeEdge("cancel", "failed"), makeEdge("decide", "confirm", "authorized && balance > amount"), makeEdge("confirm", "done")];
  const projection = { diagramKind: "UML_ACTIVITY", modelId: "layout", selectedOperationId: "pay", availableOperations: [],
    extractionCompleteness: "COMPLETE", unsupportedConstructs: [], partitions, nodes, edges, validationIssues: [] };
  const patched = applyUmlAiEnrichment(projection, { activityNodes: { decide: { label: "Always approved?" } },
    activityEdges: { decidecancel: { guard: "authorized" }, startpay: { guard: "success" } } });
  assert.deepEqual(patched.edges, edges, "AI must preserve branch expressions and unconditional flows");
  assert.equal(patched.nodes.find(n => n.nodeId === "decide").label, nodes[2].label);
  assert.ok(activityNodeSize("ACTION", nodes[1].label).h > 76, "Long labels must not be capped at 76px");
  const xml = buildUmlDrawioXml(projection);
  const attrs = text => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const cells = new Map([...xml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].map(m => {
    const a = attrs(m[1]); return [a.id, { a, body: m[2], g: attrs(m[2].match(/<mxGeometry\b([^>]*)/)[1]) }];
  }));
  const boxes = nodes.map(n => {
    const g = cells.get(n.nodeId).g, parent = cells.get(n.partitionId).g;
    return { id: n.nodeId, x: +g.x + +parent.x, y: +g.y + +parent.y, w: +g.width, h: +g.height };
  });
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (let i = 0; i < boxes.length; i++) assert.ok(!boxes.slice(i + 1).some(b => overlaps(boxes[i], b)), "Activity nodes must not overlap");
  const labels = [];
  for (const edge of edges) {
    const cell = cells.get(edge.edgeId), style = Object.fromEntries(cell.a.style.split(";").map(p => p.split("=")));
    assert.ok(cell.a.style.includes("noEdgeStyle=1"), "Route must be resolved, including compensation branches");
    const sb = boxes.find(b => b.id === edge.from), tb = boxes.find(b => b.id === edge.to);
    const points = [...cell.body.matchAll(/<mxPoint\b([^>]*)\/>/g)].map(m => attrs(m[1]));
    const path = [{ x: sb.x + sb.w * +style.exitX, y: sb.y + sb.h * +style.exitY },
      ...points.filter(p => !p.as).map(p => ({ x: +p.x, y: +p.y })), { x: tb.x + tb.w * +style.entryX, y: tb.y + tb.h * +style.entryY }];
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y);
      for (const box of boxes) {
        if (box === sb && i === 1 || box === tb && i === path.length - 1) continue;
        assert.ok(!deploymentSegmentHitsBox(path[i - 1], path[i], box, 0), `${edge.edgeId} must avoid ${box.id}`);
      }
    }
    if (!edge.guard) continue;
    const lens = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y));
    let distance = (+cell.g.x + 1) / 2 * lens.reduce((a, b) => a + b, 0), index = 0;
    while (index < lens.length - 1 && distance > lens[index]) distance -= lens[index++];
    const a = path[index], b = path[index + 1], fraction = lens[index] ? distance / lens[index] : 0;
    const offset = points.find(p => p.as === "offset"), w = Math.max(56, (edge.guard.length + 2) * 6.5 + 20);
    const label = { x: a.x + (b.x - a.x) * fraction + +(offset.x || 0) - w / 2,
      y: a.y + (b.y - a.y) * fraction + +(offset.y || 0) - 12, w, h: 24 };
    assert.ok(![...boxes, ...labels].some(b => overlaps(label, b)), "Guard text must not overlap any action, decision or other guard");
    labels.push(label);
  }
  assert.equal(reconcileUmlDrawioXml(xml, projection).conflicts.length, 0);
});

test("Deployment layout: crowded shared database routes avoid boxes, labels and artifact columns", () => {
  const node = (id, name, kind = "EXECUTION_ENVIRONMENT", parent = null) => ({
    nodeId: id, modelElementId: null, name, nodeKind: kind, parentNodeId: parent,
    environment: "default", stereotype: kind === "ARTIFACT" ? "«artifact»" : "«executionEnvironment»",
    ports: kind === "EXECUTION_ENVIRONMENT" ? ["8080:8080", "9000:9000", "9090:9090", "9001:9001", "9002:9002", "9003:9003"] : [],
    instanceName: null, replicaCount: null, properties: {}, provenance: "DESIGNED", evidenceIds: [],
  });
  const nodes = [node("gateway", "api-gateway"), node("mysql", "mysql"), node("kafka", "kafka")];
  const edges = [];
  for (let i = 0; i < 10; i++) {
    nodes.push(node(`service-${i}`, `business-service-${i}`));
    edges.push({ edgeId: `tcp-${i}`, sourceRelationshipId: null, fromNodeId: `service-${i}`,
      toNodeId: "mysql", edgeKind: "COMMUNICATION_PATH", protocol: "TCP", port: "3306",
      label: "TCP (3306)", provenance: "DESIGNED", evidenceIds: [] });
  }
  for (const host of ["kafka", "mysql"]) {
    nodes.push(node(`artifact-${host}`, "registry.example/team/" + "very-long-image-name-".repeat(7) + ":latest", "ARTIFACT", host));
    nodes.push(node(`component-${host}`, host, "MANIFESTED_COMPONENT"));
    edges.push({ edgeId: `manifest-${host}`, sourceRelationshipId: null, fromNodeId: `artifact-${host}`,
      toNodeId: `component-${host}`, edgeKind: "MANIFESTATION", protocol: null, port: null,
      label: "«manifest»", provenance: "DESIGNED", evidenceIds: [] });
  }
  const projection = { diagramKind: "UML_DEPLOYMENT", modelId: "crowded", environment: "default",
    availableEnvironments: ["default"], nodes, edges, excludedComposeStartupEdgesCount: 0, validationIssues: [] };
  for (const custom of [undefined, { kafka: { x: 2200, y: 950, width: 480, height: 320 } }]) {
    const xml = buildUmlDrawioXml(projection, custom);
    const attrs = text => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const cells = new Map([...xml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].map(m => {
      const a = attrs(m[1]);
      return [a.id, { a, body: m[2], g: attrs(m[2].match(/<mxGeometry\b([^>]*)/)[1]) }];
    }));
    const boxes = nodes.filter(n => !n.parentNodeId).map(n => {
      const g = cells.get(n.nodeId).g;
      return { id: n.nodeId, x: +g.x, y: +g.y, w: +g.width, h: +g.height };
    });
    const paths = [], labels = [];
    for (const edge of edges.filter(e => e.edgeKind === "COMMUNICATION_PATH")) {
      const cell = cells.get(edge.edgeId);
      assert.ok(cell.a.style.includes("noEdgeStyle=1"), `${edge.edgeId} must be resolved (custom=${!!custom}), without unchecked fallback`);
      const style = Object.fromEntries(cell.a.style.split(";").map(p => p.split("=")));
      const sb = boxes.find(b => b.id === edge.fromNodeId), tb = boxes.find(b => b.id === edge.toNodeId);
      const points = [...cell.body.matchAll(/<mxPoint\b([^>]*)\/>/g)].map(m => attrs(m[1]));
      const path = [{ x: sb.x + sb.w * +style.exitX, y: sb.y + sb.h * +style.exitY },
        ...points.filter(p => !p.as).map(p => ({ x: +p.x, y: +p.y })),
        { x: tb.x + tb.w * +style.entryX, y: tb.y + tb.h * +style.entryY }];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        assert.ok(a.x === b.x || a.y === b.y, "All segments must be orthogonal");
        for (const box of boxes) {
          if (box === sb && i === 1 || box === tb && i === path.length - 1) continue;
          assert.ok(!deploymentSegmentHitsBox(a, b, box, 0), `${edge.edgeId} must not pass through ${box.id}`);
        }
        for (const previous of paths) for (let j = 1; j < previous.length; j++) {
          const c = previous[j - 1], d = previous[j];
          const horizontal = a.y === b.y && c.y === d.y && a.y === c.y;
          const vertical = a.x === b.x && c.x === d.x && a.x === c.x;
          const overlap = horizontal
            ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
            : vertical ? Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) : 0;
          assert.ok(overlap <= 0, "Shared database wires must not share a line segment");
        }
      }
      const lens = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y));
      let distance = (+cell.g.x + 1) / 2 * lens.reduce((a, b) => a + b, 0), index = 0;
      while (index < lens.length - 1 && distance > lens[index]) distance -= lens[index++];
      const a = path[index], b = path[index + 1], fraction = lens[index] ? distance / lens[index] : 0;
      const offset = points.find(p => p.as === "offset"), w = edge.label.length * 6 + 16;
      const label = { x: a.x + (b.x - a.x) * fraction + +(offset.x || 0) - w / 2,
        y: a.y + (b.y - a.y) * fraction + +(offset.y || 0) - 10, w, h: 20 };
      const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.ok(![...boxes, ...labels].some(b => overlaps(label, b)), "TCP labels must not overlap nodes or each other");
      paths.push(path); labels.push(label);
    }
    for (const host of ["kafka", "mysql"]) {
      const parent = cells.get(host).g, child = cells.get(`artifact-${host}`).g;
      assert.ok(+child.y > 80, "Wrapped port headers need their own compartment");
      assert.ok(+child.height > 68, "Long image references need extra height");
      assert.ok(+child.y + +child.height < +parent.height, "Artifact must fit inside its host");
    }
    assert.doesNotMatch(xml, /direction=south/, "Cube style must not set direction=south (which rotates Draw.io exitX/entryX ports by 90°)");
    if (!custom) {
      assert.ok(+cells.get("mysql").g.y < +cells.get("kafka").g.y, "Active database hub must sit directly below its callers above passive manifest-only rows");
    }
    assert.equal(buildUmlDrawioXml(projection, custom), xml, "Layout must be deterministic");
  }
});

test("M4-AC01 & M4-AC02: Java and C# UML Class projection preserves visibility (package-private vs internal), compartments, overloads, non-I interface Contract, and I-prefixed class IHelper", () => {
  const javaModel = loadJavaFixtureModel();
  const csharpModel = loadCsharpFixtureModel();

  const javaClassProj = projectUmlClassDiagram(javaModel);
  const csharpClassProj = projectUmlClassDiagram(csharpModel);

  for (const [lang, proj] of [
    ["JAVA", javaClassProj],
    ["CSHARP", csharpClassProj],
  ]) {
    const contractCls = proj.classifiers.find((c) => c.name === "Contract");
    const iHelperCls = proj.classifiers.find((c) => c.name === "IHelper");
    const orderProcCls = proj.classifiers.find((c) => c.name === "OrderProcessor");
    const baseCls = proj.classifiers.find((c) => c.name === "AbstractOrderProcessor");
    const enumCls = proj.classifiers.find((c) => c.name === "OrderStatus");

    assert.ok(contractCls, `${lang}: Contract must be extracted`);
    assert.equal(contractCls.classifierKind, "INTERFACE", `${lang}: Contract must be INTERFACE`);
    assert.ok(iHelperCls, `${lang}: IHelper must be extracted`);
    assert.equal(iHelperCls.classifierKind, "CLASS", `${lang}: IHelper must be CLASS (not interface)`);
    assert.ok(baseCls, `${lang}: AbstractOrderProcessor must be extracted`);
    assert.equal(baseCls.isAbstract, true, `${lang}: AbstractOrderProcessor must be abstract`);
    assert.ok(enumCls, `${lang}: OrderStatus enum must be extracted`);
    assert.equal(enumCls.classifierKind, "ENUM", `${lang}: OrderStatus must be ENUM`);

    assert.ok(orderProcCls, `${lang}: OrderProcessor must be extracted`);
    const processOps = orderProcCls.operations.filter(
      (op) => op.name.toLowerCase() === "process",
    );
    assert.ok(
      processOps.length >= 2,
      `${lang}: OrderProcessor must preserve both overloaded process(...) signatures (found ${processOps.length})`,
    );
  }

  const javaXml = buildUmlDrawioXml(javaClassProj);
  const csharpXml = buildUmlDrawioXml(csharpClassProj);
  assert.match(javaXml, /~ \[package-private\]/);
  assert.doesNotMatch(javaXml, /~ \[internal\]/);
  assert.match(csharpXml, /~ \[internal\]/);
  assert.doesNotMatch(csharpXml, /~ \[package-private\]/);
  assert.match(javaXml, /&amp;laquo;interface&amp;raquo;/);
  assert.match(javaXml, /&amp;laquo;enumeration&amp;raquo;/);
});

test("M4-AC03 & M4-AC05: UML Class relationships deduplicate DEPENDENCY vs ASSOCIATION, enforce whole-part restraint, and support DESIGNED Composition/Aggregation", () => {
  const javaModel = loadJavaFixtureModel();
  const baseProj = projectUmlClassDiagram(javaModel);

  const kinds = new Set(baseProj.relations.map((r) => r.relationKind));
  assert.ok(kinds.has("GENERALIZATION"), "Must extract GENERALIZATION");
  assert.ok(kinds.has("REALIZATION"), "Must extract REALIZATION");
  assert.ok(kinds.has("ASSOCIATION"), "Must extract ASSOCIATION");
  assert.ok(kinds.has("DEPENDENCY"), "Must extract DEPENDENCY");
  assert.ok(!kinds.has("SHARED_AGGREGATION"), "Extracted static fields must not fabricate SHARED_AGGREGATION");
  assert.ok(!kinds.has("COMPOSITION"), "Extracted static fields must not fabricate COMPOSITION");

  const orderProc = baseProj.classifiers.find((c) => c.name === "OrderProcessor");
  const iHelper = baseProj.classifiers.find((c) => c.name === "IHelper");
  const pairs = baseProj.relations.filter(
    (r) =>
      r.fromClassifierId === orderProc.classifierId &&
      r.toClassifierId === iHelper.classifierId,
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].relationKind, "ASSOCIATION");
  assert.equal(pairs[0].multiplicity, null, "UNKNOWN multiplicity must be omitted on static association");

  const withDesigned = projectUmlClassDiagram(javaModel, {
    overlay: {
      designedRelations: [
        {
          relationId: "designed:comp:1",
          sourceRelationshipId: null,
          fromClassifierId: orderProc.classifierId,
          toClassifierId: iHelper.classifierId,
          relationKind: "COMPOSITION",
          roleName: "ownedHelper",
          multiplicity: "1..*",
          provenance: "DESIGNED",
          evidenceIds: [],
        },
      ],
    },
  });
  const designedRel = withDesigned.relations.find((r) => r.relationId === "designed:comp:1");
  assert.ok(designedRel);
  assert.equal(designedRel.relationKind, "COMPOSITION");
  assert.equal(designedRel.provenance, "DESIGNED");
  const xml = buildUmlDrawioXml(withDesigned);
  assert.match(xml, /startArrow=diamondThin;startFill=1/);
  assert.match(xml, /\[1\.\.\*\]/);
});

test("M4-AC04, M4-AC06, M4-AC07: UML Package hierarchy, cross-package dependency aggregation, «merge» cycle validator, 3E selection, and 2-cycle Draw.io round-trip", () => {
  const javaModel = loadJavaFixtureModel();
  const pkgProj = projectUmlPackageDiagram(javaModel);

  const ordersPkg = pkgProj.packages.find((p) => p.qualifiedName === "com.example.orders");
  const billingPkg = pkgProj.packages.find((p) => p.qualifiedName === "com.example.billing");
  assert.ok(ordersPkg, "com.example.orders package must be projected");
  assert.ok(billingPkg, "com.example.billing package must be projected");
  assert.ok(ordersPkg.memberNames.includes("OrderProcessor"));
  assert.ok(billingPkg.memberNames.includes("BillingInvoice"));

  const crossEdge = pkgProj.edges.find(
    (e) =>
      e.fromPackageId === ordersPkg.packageId &&
      e.toPackageId === billingPkg.packageId,
  );
  assert.ok(crossEdge, "Cross-package dependency from com.example.orders -> com.example.billing must be aggregated");
  assert.ok(crossEdge.underlyingEdgeIds.length >= 1);

  const cyclicMergeProj = projectUmlPackageDiagram(javaModel, {
    overlay: {
      designedEdges: [
        {
          edgeId: "merge-1",
          fromPackageId: ordersPkg.packageId,
          toPackageId: billingPkg.packageId,
          relationKind: "MERGE",
          underlyingEdgeIds: [],
          evidenceIds: [],
          provenance: "DESIGNED",
        },
        {
          edgeId: "merge-2",
          fromPackageId: billingPkg.packageId,
          toPackageId: ordersPkg.packageId,
          relationKind: "MERGE",
          underlyingEdgeIds: [],
          evidenceIds: [],
          provenance: "DESIGNED",
        },
      ],
    },
  });
  assert.ok(
    cyclicMergeProj.validationIssues.some((i) => i.code === "PACKAGE_MERGE_CYCLE_DETECTED"),
    "Must flag cyclic «merge» package edges",
  );

  const pkgCtx = resolveUmlSelectionContext(pkgProj, crossEdge.edgeId);
  assert.ok(pkgCtx);
  assert.equal(pkgCtx.diagramKind, "UML_PACKAGE");
  assert.deepEqual(pkgCtx.sourceRelationshipIds, crossEdge.underlyingEdgeIds);

  const pkgXml = buildUmlDrawioXml(pkgProj);
  assert.match(pkgXml, /entryY=0;entryDx=0;entryDy=26;/, "Folder top ports outside the 110px tab must use entryDy=26");
  assert.match(pkgXml, /exitPerimeter=0;entryPerimeter=0;/, "Recessed folder ports must not be projected back onto the bounding rectangle");
  assert.doesNotMatch(pkgXml, /<Array as="points">/, "Vertically aligned packages with a clear path must route straight with 0 waypoints");

  const classProj = projectUmlClassDiagram(javaModel);
  const xml1 = buildUmlDrawioXml(classProj);
  const rt1 = reconcileUmlDrawioXml(xml1, classProj);
  assert.equal(rt1.conflicts.length, 0);
  const xml2 = buildUmlDrawioXml(rt1.projection, rt1.preservedLayout);
  const rt2 = reconcileUmlDrawioXml(xml2, rt1.projection);
  assert.equal(rt2.conflicts.length, 0);
  assert.equal(rt2.projection.classifiers.length, classProj.classifiers.length);

  const mutatedXml = xml1.replace(
    'mavisRelationKind="ASSOCIATION"',
    'mavisRelationKind="COMPOSITION"',
  );
  const rtConflict = reconcileUmlDrawioXml(mutatedXml, classProj);
  assert.ok(rtConflict.conflicts.some((c) => c.code === "EXTRACTED_FACT_IMMUTABLE"));
});

test("Package analysis keeps distinct relation IDs and aggregated evidence without AI reclassification", () => {
  const { applyUmlAiEnrichment } = require("../src/features/architecture/uml-diagrams.ts");
  const model = loadJavaFixtureModel();
  const baseline = projectUmlPackageDiagram(model);
  const original = model.edges.find(e => e.id === baseline.edges[0].underlyingEdgeIds[0]);
  assert.ok(original);
  model.edges.push({ ...original, id: "second-use", properties: { ...original.properties, packageRelationKind: "DEPENDENCY" } },
    { ...original, id: "explicit-import", properties: { ...original.properties, packageRelationKind: "IMPORT" } },
    { ...original, id: "explicit-access", properties: { ...original.properties, packageRelationKind: "ACCESS" } });
  const projection = projectUmlPackageDiagram(model);
  assert.equal(new Set(projection.edges.map(e => e.edgeId)).size, projection.edges.length, "Every mxCell relation needs a unique ID");
  const pair = projection.edges.filter(e => e.fromPackageId === baseline.edges[0].fromPackageId && e.toPackageId === baseline.edges[0].toPackageId);
  assert.ok(pair.some(e => e.relationKind === "IMPORT" && e.underlyingEdgeIds.includes("explicit-import")));
  assert.ok(pair.some(e => e.relationKind === "ACCESS" && e.underlyingEdgeIds.includes("explicit-access")));
  const uses = pair.find(e => e.relationKind === "DEPENDENCY");
  assert.ok(uses.underlyingEdgeIds.includes(original.id) && uses.underlyingEdgeIds.includes("second-use"));
  assert.equal(new Set(uses.evidenceIds).size, uses.evidenceIds.length, "Aggregated evidence must stay deduplicated");
  const enrichment = { packageEdges: Object.fromEntries(pair.map(e => [e.edgeId, { relationKind: "IMPORT" }])) };
  assert.deepEqual(applyUmlAiEnrichment(projection, enrichment).edges, projection.edges);
  const xml = buildUmlDrawioXml(projection);
  const roundTrip = reconcileUmlDrawioXml(xml, projection);
  assert.equal(roundTrip.conflicts.length, 0);
  assert.equal(roundTrip.projection.edges.length, projection.edges.length);
  assert.ok(roundTrip.projection.edges.every(e => e.underlyingEdgeIds.length > 0));
});

test("M5-AC01 through M5-AC06: UML Deployment nodes, nested artifacts, «manifest» edges, CommunicationPath vs Compose depends_on separation, and environment isolation", () => {
  const javaModel = loadJavaFixtureModel();
  const deployProj = projectUmlDeploymentDiagram(javaModel, { environment: "default" });

  const execNodes = deployProj.nodes.filter((n) => n.nodeKind === "EXECUTION_ENVIRONMENT");
  const artifacts = deployProj.nodes.filter((n) => n.nodeKind === "ARTIFACT");
  const manifestations = deployProj.edges.filter((e) => e.edgeKind === "MANIFESTATION");
  const commPaths = deployProj.edges.filter((e) => e.edgeKind === "COMMUNICATION_PATH");

  assert.ok(execNodes.length >= 2, "Must extract executionEnvironment deployment nodes");
  assert.equal(artifacts.length, 2, "Explicit container image (mysql:8.0) and build-context service (orders-service.jar) must produce inner ARTIFACT nodes");
  assert.deepEqual(new Set(artifacts.map((a) => a.name)), new Set(["orders-service.jar", "mysql:8.0"]));
  assert.ok(!deployProj.nodes.some((n) => n.name.endsWith(":build")), "Must never fabricate :build artifact node");
  assert.equal(manifestations.length, 1, "Must emit «manifest» edge only for verified artifact");
  assert.ok(
    deployProj.validationIssues.some((i) => i.code === "BUILD_CONTEXT_WITHOUT_EXPLICIT_ARTIFACT"),
    "Build-context-only container must emit BUILD_CONTEXT_WITHOUT_EXPLICIT_ARTIFACT diagnostic",
  );
  assert.ok(commPaths.length >= 1, "Must derive CommunicationPath from evidenced communication edges");
  assert.ok(
    deployProj.excludedComposeStartupEdgesCount >= 1,
    "Compose depends_on edges must be excluded from CommunicationPath",
  );
  assert.ok(
    !commPaths.some((e) => e.protocol === "DECLARED_COMPOSE" || e.protocol === "depends_on"),
    "CommunicationPath must never contain Compose depends_on edges",
  );

  const stagingProj = projectUmlDeploymentDiagram(javaModel, {
    environment: "staging",
    overlay: {
      designedNodes: [
        {
          nodeId: "staging-node-1",
          modelElementId: null,
          name: "staging-k8s-worker",
          nodeKind: "DEVICE",
          parentNodeId: null,
          environment: "staging",
          stereotype: "«device»",
          ports: ["8443:8443"],
          instanceName: "worker01",
          replicaCount: 3,
          properties: {},
          provenance: "DESIGNED",
          evidenceIds: [],
        },
      ],
    },
  });
  assert.equal(stagingProj.environment, "staging");
  assert.ok(stagingProj.nodes.every((n) => n.environment === "staging"));

  const xml1 = buildUmlDrawioXml(deployProj);
  assert.match(xml1, /shape=cube/);
  assert.match(xml1, /«manifest»/);
  assert.match(xml1, /«communicationPath»/);
  const rt1 = reconcileUmlDrawioXml(xml1, deployProj);
  assert.equal(rt1.conflicts.length, 0);
  const xml2 = buildUmlDrawioXml(rt1.projection, rt1.preservedLayout);
  const rt2 = reconcileUmlDrawioXml(xml2, rt1.projection);
  assert.equal(rt2.conflicts.length, 0);
});

test("M6-AC01 through M6-AC06: UML Activity method CFG extraction (Java & C#), Swimlane Partition, PARTIAL marker for unsupported constructs, and Fork/Join vs Decision/Merge deadlock validator", () => {
  const javaModel = loadJavaFixtureModel();
  const csharpModel = loadCsharpFixtureModel();

  for (const [lang, model] of [
    ["JAVA", javaModel],
    ["CSHARP", csharpModel],
  ]) {
    const actProj = projectUmlActivityDiagram(model);
    assert.ok(actProj.availableOperations.length >= 2, `${lang}: Must extract method CFG operations`);
    assert.equal(actProj.partitions.length, 1, `${lang}: Must default to Swimlane Partition by service`);

    const completeOp = actProj.availableOperations.find(
      (op) =>
        op.methodName.toLowerCase() === "process" &&
        op.extractionCompleteness === "COMPLETE",
    );
    assert.ok(completeOp, `${lang}: process(...) COMPLETE overload must be extracted`);
    assert.equal(completeOp.extractionCompleteness, "COMPLETE");

    const completeProj = projectUmlActivityDiagram(model, {
      operationId: completeOp.operationId,
    });
    assert.ok(completeProj.nodes.some((n) => n.kind === "INITIAL"));
    assert.ok(completeProj.nodes.some((n) => n.kind === "DECISION"));
    assert.ok(completeProj.nodes.some((n) => n.kind === "MERGE"));
    assert.ok(completeProj.nodes.some((n) => n.kind === "OBJECT_NODE"));
    assert.ok(completeProj.nodes.some((n) => n.kind === "ACTIVITY_FINAL"));
    assert.ok(completeProj.edges.some((e) => e.flowKind === "OBJECT_FLOW"));
    assert.equal(
      completeProj.validationIssues.filter((i) => i.severity === "ERROR").length,
      0,
    );

    const partialOp = actProj.availableOperations.find(
      (op) => op.extractionCompleteness === "PARTIAL",
    );
    assert.ok(partialOp, `${lang}: Method with lambda/closure must be marked PARTIAL`);
    const partialProj = projectUmlActivityDiagram(model, {
      operationId: partialOp.operationId,
    });
    assert.ok(
      partialProj.validationIssues.some((i) => i.code === "ACTIVITY_CFG_PARTIAL"),
    );

    const xml1 = buildUmlDrawioXml(completeProj);
    assert.match(xml1, /swimlane/);
    assert.match(xml1, /rhombus/);
    const rt1 = reconcileUmlDrawioXml(xml1, completeProj);
    const xml2 = buildUmlDrawioXml(rt1.projection, rt1.preservedLayout);
    const rt2 = reconcileUmlDrawioXml(xml2, rt1.projection);
    assert.equal(rt2.conflicts.length, 0);
  }

  const deadlockProj = projectUmlActivityDiagram(javaModel, {
    overlay: {
      designedNodes: [
        {
          nodeId: "d-dec",
          kind: "DECISION",
          label: "checkStock?",
          partitionId: "p1",
          partitionName: "orders",
          provenance: "DESIGNED",
        },
        {
          nodeId: "d-join",
          kind: "JOIN",
          label: "Join (AND)",
          partitionId: "p1",
          partitionName: "orders",
          joinSpec: "AND",
          provenance: "DESIGNED",
        },
      ],
      designedEdges: [
        {
          edgeId: "de-1",
          from: "d-dec",
          to: "d-join",
          flowKind: "CONTROL_FLOW",
          guard: "[inStock]",
          provenance: "DESIGNED",
        },
        {
          edgeId: "de-2",
          from: "d-dec",
          to: "d-join",
          flowKind: "CONTROL_FLOW",
          guard: "[else]",
          provenance: "DESIGNED",
        },
      ],
    },
  });
  assert.ok(
    deadlockProj.validationIssues.some((i) => i.code === "JOIN_BRANCH_DEADLOCK"),
    "Must flag Decision branches entering a Join directly without Merge as JOIN_BRANCH_DEADLOCK",
  );
});

test("M7-AC01 through M7-AC06: UML State Machine extraction (Java & C#), enum-only transition refusal (ENUM_ONLY_NO_TRANSITIONS), structural validators, and 2-cycle round-trip", () => {
  const javaModel = loadJavaFixtureModel();
  const csharpModel = loadCsharpFixtureModel();

  for (const [lang, model] of [
    ["JAVA", javaModel],
    ["CSHARP", csharpModel],
  ]) {
    const stateProj = projectUmlStateDiagram(model);
    assert.ok(stateProj.availableTargets.length >= 2, `${lang}: Must extract stateful class and enum targets`);

    const statefulTarget = stateProj.availableTargets.find(
      (t) => t.lifecycleKind === "STATEFUL_CLASS",
    );
    assert.ok(statefulTarget, `${lang}: Stateful class target must be extracted`);
    const statefulProj = projectUmlStateDiagram(model, {
      targetId: statefulTarget.targetId,
    });
    assert.equal(statefulProj.enumOnlyNoTransitions, false);
    assert.ok(statefulProj.states.some((s) => s.kind === "INITIAL"));
    assert.ok(statefulProj.states.some((s) => s.name.toUpperCase() === "VALIDATED"));
    assert.ok(statefulProj.states.some((s) => s.name.toUpperCase() === "PAID"));
    assert.ok(statefulProj.transitions.length >= 3);

    const enumTarget = stateProj.availableTargets.find(
      (t) => t.lifecycleKind === "ENUM_DECLARATION",
    );
    assert.ok(enumTarget, `${lang}: Enum declaration target must be extracted`);
    assert.equal(enumTarget.enumOnlyNoTransitions, true);
    const enumProj = projectUmlStateDiagram(model, {
      targetId: enumTarget.targetId,
    });
    assert.equal(enumProj.transitions.length, 0, `${lang}: Enum-only declaration must NOT fabricate transitions`);
    assert.ok(
      enumProj.validationIssues.some((i) => i.code === "ENUM_ONLY_NO_TRANSITIONS"),
      `${lang}: Must emit ENUM_ONLY_NO_TRANSITIONS diagnostic`,
    );

    const xml1 = buildUmlDrawioXml(statefulProj);
    const rt1 = reconcileUmlDrawioXml(xml1, statefulProj);
    const xml2 = buildUmlDrawioXml(rt1.projection, rt1.preservedLayout);
    const rt2 = reconcileUmlDrawioXml(xml2, rt1.projection);
    assert.equal(rt2.conflicts.length, 0);
  }
});

test("O1 + O2 Regression: Honest empty/diagnostic states when source metadata is missing and service-scoped package identity", () => {
  const legacyModel = {
    id: "legacy-model-no-uml-meta",
    projectId: "p-1",
    snapshotId: "s-1",
    revision: 1,
    label: "Legacy Model Without UML/Deployment Metadata",
    elements: [
      {
        id: "svc-orders",
        name: "orders-service",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
        technology: "Spring Boot",
        layer: "domain",
        description: "",
        properties: {},
        evidence: [],
      },
      {
        id: "svc-billing",
        name: "billing-service",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
        technology: ".NET",
        layer: "domain",
        description: "",
        properties: {},
        evidence: [],
      },
      {
        id: "db-orders",
        name: "orders-db",
        elementType: "DATABASE",
        parentId: null,
        technology: "PostgreSQL",
        layer: "data",
        description: "",
        properties: { resourceRole: "LOGICAL_DATASTORE" },
        evidence: [],
      },
      {
        id: "comp-status",
        name: "OrderStatus",
        elementType: "COMPONENT",
        parentId: "svc-orders",
        technology: "Java",
        layer: "domain",
        description: "",
        properties: { packageName: "shared", qualifiedName: "shared.OrderStatus" },
        evidence: [],
      },
      {
        id: "comp-invoice",
        name: "InvoiceStatus",
        elementType: "COMPONENT",
        parentId: "svc-billing",
        technology: "C#",
        layer: "domain",
        description: "",
        properties: { packageName: "shared", qualifiedName: "shared.InvoiceStatus" },
        evidence: [],
      },
    ],
    edges: [],
  };

  // Repro 1 (missingSourceDeployment): 0 fabricated nodes/artifacts when deploymentMetadata is absent
  const depProj = projectUmlDeploymentDiagram(legacyModel);
  assert.equal(depProj.nodes.length, 0, "Must not fabricate deployment nodes/artifacts without deploymentMetadata");
  assert.equal(depProj.edges.length, 0);
  assert.ok(
    depProj.validationIssues.some((i) => i.code === "NO_DEPLOYMENT_METADATA_EXTRACTED"),
  );

  // Repro 2 (missingSourceState): 0 fabricated states/transitions when stateLifecycle is absent
  const stateProj = projectUmlStateDiagram(legacyModel);
  assert.equal(stateProj.availableTargets.length, 0);
  assert.equal(stateProj.states.length, 0, "Must not fabricate PENDING/COMPLETED states from component name");
  assert.equal(stateProj.transitions.length, 0);
  assert.ok(
    stateProj.validationIssues.some((i) => i.code === "NO_STATE_LIFECYCLE_EXTRACTED"),
  );

  // Repro 3 (missingSourceActivity): 0 fabricated operations/actions/objectNodes when methodsCfg is absent
  const actProj = projectUmlActivityDiagram(legacyModel);
  assert.equal(actProj.availableOperations.length, 0);
  assert.equal(actProj.nodes.length, 0, "Must not fabricate INITIAL->handle()->FINAL when methodsCfg is absent");
  assert.equal(actProj.edges.length, 0);
  assert.ok(
    actProj.validationIssues.some((i) => i.code === "NO_ACTIVITY_CFG_EXTRACTED"),
  );

  // Also verify that an operation without methodsCfg (e.g. abstract/unexpanded operation) emits 0 fabricated CFG nodes
  const modelWithUnexpandedOp = {
    ...legacyModel,
    elements: [
      legacyModel.elements[0],
      {
        id: "cls-contract",
        name: "OrderContract",
        elementType: "CLASS_INTERFACE",
        parentId: "svc-orders",
        technology: "Java",
        layer: "domain",
        description: "",
        properties: {
          umlClassifier: {
            name: "OrderContract",
            qualifiedName: "shared.OrderContract",
            packageName: "shared",
            typeKind: "INTERFACE",
            members: [
              {
                memberKind: "OPERATION",
                name: "handle",
                signatureKey: "handle(String)",
                isAbstract: true,
              },
            ],
            methodsCfg: [],
          },
        },
        evidence: [],
      },
    ],
  };
  const unexpandedAct = projectUmlActivityDiagram(modelWithUnexpandedOp);
  assert.equal(unexpandedAct.availableOperations.length, 1);
  assert.equal(unexpandedAct.availableOperations[0].extractionCompleteness, "PARTIAL");
  assert.equal(unexpandedAct.nodes.length, 0, "Abstract/unexpanded operation without CFG must not fabricate INITIAL->ACTION->FINAL");

  // Repro 4 (packageOwnership): two services with package "shared" must remain distinct packages
  const pkgProj = projectUmlPackageDiagram(legacyModel);
  assert.equal(pkgProj.packages.length, 2, "shared package in two services must produce 2 service-scoped package nodes");
  const pkgIds = pkgProj.packages.map((p) => p.packageId);
  assert.ok(pkgIds.includes("pkg:svc-orders:shared"));
  assert.ok(pkgIds.includes("pkg:svc-billing:shared"));
});

test("O3 + O5 Regression: Draw.io deletion/rewiring/unmapped-cell conflicts and full Save -> Reload -> Hydrate -> Edit -> Save lifecycle across M4-M7", () => {
  const javaModel = loadJavaFixtureModel();

  // Repro 5 (umlEditorDeletion): deleting a classifier cell from Draw.io XML must report DELETED_ELEMENT_IN_DRAWIO and remove it from reconciled projection
  const baseClassProj = projectUmlClassDiagram(javaModel);
  const baseXml = buildUmlDrawioXml(baseClassProj);
  const firstClassifier = baseClassProj.classifiers[0];
  const cellPattern = new RegExp(
    `<mxCell id="${firstClassifier.classifierId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?<\\/mxCell>`,
  );
  const xmlDeletedNode = baseXml.replace(cellPattern, "");
  const rtDeleted = reconcileUmlDrawioXml(xmlDeletedNode, baseClassProj);
  assert.ok(
    rtDeleted.conflicts.some(
      (c) => c.code === "DELETED_ELEMENT_IN_DRAWIO" && c.itemId === firstClassifier.classifierId,
    ),
    "Deleting a classifier in Draw.io must trigger DELETED_ELEMENT_IN_DRAWIO",
  );
  assert.ok(
    !rtDeleted.projection.classifiers.some((c) => c.classifierId === firstClassifier.classifierId),
    "Reconciled projection must reflect the deletion so UI metadata and canvas never diverge",
  );

  // Unmapped Draw.io cell added directly on canvas must trigger UNMAPPED_DRAWIO_CELL_ADDED
  const xmlUnmapped = baseXml.replace(
    "</root>",
    '<mxCell id="custom-freehand-cell" value="Adhoc Box" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell></root>',
  );
  const rtUnmapped = reconcileUmlDrawioXml(xmlUnmapped, baseClassProj);
  assert.ok(
    rtUnmapped.conflicts.some(
      (c) => c.code === "UNMAPPED_DRAWIO_CELL_ADDED" && c.itemId === "custom-freehand-cell",
    ),
  );

  // Full Save -> Reload -> Hydrate -> Edit Again -> Save lifecycle for M4 Class Diagram
  const step1Proj = projectUmlClassDiagram(javaModel, {
    overlay: {
      designedClassifiers: [
        {
          classifierId: "designed:cls:com.example.orders.OrderAuditPolicy",
          modelElementId: null,
          name: "OrderAuditPolicy",
          qualifiedName: "com.example.orders.OrderAuditPolicy",
          packageName: "com.example.orders",
          serviceId: null,
          serviceName: "Designed Overlay",
          classifierKind: "INTERFACE",
          visibility: "PUBLIC",
          isAbstract: true,
          isStatic: false,
          typeParameters: [],
          sourceLanguage: "DESIGNED",
          attributes: [],
          operations: [],
          provenance: "DESIGNED",
          evidenceIds: [],
        },
      ],
    },
  });
  const savedXml1 = buildUmlDrawioXml(step1Proj, {
    "designed:cls:com.example.orders.OrderAuditPolicy": {
      x: 780,
      y: 420,
      width: 290,
      height: 150,
    },
  });

  // Simulate Reload -> Hydrate from savedXml1
  const hydrated1 = hydrateUmlWorkspaceFromXml(savedXml1, javaModel);
  assert.equal(hydrated1.conflicts.length, 0);
  assert.equal(hydrated1.classOverlay.designedClassifiers.length, 1);
  assert.equal(hydrated1.classOverlay.designedClassifiers[0].name, "OrderAuditPolicy");
  assert.deepEqual(
    hydrated1.preservedLayout["designed:cls:com.example.orders.OrderAuditPolicy"],
    { x: 780, y: 420, width: 290, height: 150 },
  );

  // Continue structured editing after reload: add a DESIGNED relationship from OrderProcessor to OrderAuditPolicy
  const orderProc = hydrated1.projection.classifiers.find((c) => c.name === "OrderProcessor");
  const nextOverlay = {
    designedClassifiers: hydrated1.classOverlay.designedClassifiers,
    designedRelations: [
      ...(hydrated1.classOverlay.designedRelations ?? []),
      {
        relationId: "designed:rel:orderProc->auditPolicy",
        sourceRelationshipId: null,
        fromClassifierId: orderProc.classifierId,
        toClassifierId: "designed:cls:com.example.orders.OrderAuditPolicy",
        relationKind: "DEPENDENCY",
        roleName: "auditsVia",
        multiplicity: "1",
        provenance: "DESIGNED",
        evidenceIds: [],
      },
    ],
  };
  const step2Proj = projectUmlClassDiagram(javaModel, { overlay: nextOverlay });
  const savedXml2 = buildUmlDrawioXml(step2Proj, hydrated1.preservedLayout);
  const hydrated2 = hydrateUmlWorkspaceFromXml(savedXml2, javaModel);
  assert.equal(hydrated2.conflicts.length, 0);
  assert.equal(hydrated2.classOverlay.designedClassifiers.length, 1);
  assert.equal(hydrated2.classOverlay.designedRelations.length, 1);
  assert.equal(hydrated2.classOverlay.designedRelations[0].roleName, "auditsVia");
});

test("M8-AC01, M8-AC02, M8-AC03 & O6/O7/O8: Unified 9-diagram catalog, dynamic coverage matrix, projection microbenchmark, and unit test isolation guard", () => {
  const javaModel = loadJavaFixtureModel();
  const csharpModel = loadCsharpFixtureModel();

  assert.equal(diagramKinds.C4.length, 2);
  assert.equal(diagramKinds.UML.length, 6);
  assert.equal(diagramKinds["4+1"].length, 5);
  assert.equal(canonicalDiagramCatalog.length, 8);

  const ordersSvc = javaModel.elements.find((e) => e.name === "orders-service");
  const c3Doc = selectDiagram(javaModel, "COMPONENT", ordersSvc.id).document;
  assert.ok(c3Doc);
  assert.ok(
    !c3Doc.layoutJson.nodes.some((n) => n.kind === "CLASS_INTERFACE"),
    "C4 C3 Component view must not leak CLASS_INTERFACE nodes",
  );

  const benchReport = runSeededGraphBenchmark([100, 500, 2000], 5, 20261025);
  assert.equal(benchReport.benchmarkKind, "PROJECTION_MICROBENCHMARK_ONLY");
  assert.equal(benchReport.isBrowserWorkloadBenchmark, false);
  assert.equal(benchReport.scales.length, 3);
  for (const scale of benchReport.scales) {
    assert.equal(scale.runs, 5);
    assert.equal(scale.durationsMs.length, 5);
    assert.ok(scale.medianMs >= 0);
    assert.ok(scale.maxMs >= scale.medianMs);
    assert.equal(scale.expandedElementsCount, scale.scaleNodes);
    assert.ok(scale.collapsedElementsCount < scale.expandedElementsCount);
  }

  const coverageMatrix = buildM8CoverageMatrix({
    javaModel,
    csharpModel,
    browserWorkloadVerified: false,
    liveOtelTraceCaptured: false,
  });
  assert.equal(coverageMatrix.diagrams.length, 8);
  assert.equal(coverageMatrix.dynamicInvariantChecks.honestDeploymentNoMeta, true);
  assert.equal(coverageMatrix.dynamicInvariantChecks.honestActivityNoCfg, true);
  assert.equal(coverageMatrix.dynamicInvariantChecks.honestStateNoLifecycle, true);
  assert.equal(coverageMatrix.dynamicInvariantChecks.distinctServicePackages, true);
  assert.equal(coverageMatrix.dynamicInvariantChecks.hydrationPreservesDesigned, true);
  assert.equal(coverageMatrix.dynamicInvariantChecks.deletionConflictDetected, true);
  assert.equal(
    coverageMatrix.overallGovernanceStatus.liveRuntimeOtelTraceVerification,
    "BLOCKED_NO_LIVE_TRACE",
  );

  // O6 Guard: verify no default unit test file reads or writes the external output directory
  const testDir = __dirname;
  const forbiddenOutPath = ["..", "..", "output", ""].join("/");
  const unitTestFiles = fs
    .readdirSync(testDir)
    .filter(
      (f) =>
        f.endsWith(".test.cjs") &&
        f !== "connected-pipeline.test.cjs" &&
        f !== "mainflow.test.cjs",
    );
  for (const file of unitTestFiles) {
    const content = fs.readFileSync(path.join(testDir, file), "utf8");
    assert.ok(
      !content.includes(forbiddenOutPath),
      `Default unit test ${file} must use tests/fixtures/ and must not depend on external output artifacts`,
    );
  }
});

test("Q1: Canvas mxCell.value & mxCell.style semantic edit reconciliation across all 5 UML notations plus order-independent mxGeometry parsing", () => {
  const javaModel = loadJavaFixtureModel();

  // 1. UML_CLASS: reviewer repro — editing mxCell.value to RenamedByUser while keeping old mavisMeta
  const classOverlay = {
    designedClassifiers: [
      {
        classifierId: "designed:cls:com.example.orders.OrderAuditPolicy",
        modelElementId: null,
        name: "OrderAuditPolicy",
        qualifiedName: "com.example.orders.OrderAuditPolicy",
        packageName: "com.example.orders",
        serviceId: null,
        serviceName: null,
        classifierKind: "INTERFACE",
        visibility: "public",
        isAbstract: true,
        typeParameters: [],
        attributes: [],
        operations: [
          {
            name: "validateOrder",
            signature: "validateOrder(orderId: String): boolean",
            visibility: "public",
            visibilitySymbol: "+",
            typeName: "boolean",
            isStatic: false,
            isAbstract: true,
          },
        ],
        provenance: "DESIGNED",
        evidenceIds: [],
      },
    ],
    designedRelations: [],
  };
  const classProj = projectUmlClassDiagram(javaModel, { overlay: classOverlay });
  const classXml = buildUmlDrawioXml(classProj, {}, { classOverlay });

  // Mutate an EXTRACTED classifier cell's value attribute to "RenamedByUser" without changing mavisMeta
  const extractedRenameXml = classXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="classifier" mavisProvenance="EXTRACTED")/,
    "$1RenamedByUser$2",
  );
  const rtExtractedRename = reconcileUmlDrawioXml(extractedRenameXml, classProj);
  assert.ok(
    rtExtractedRename.conflicts.some((c) => c.code === "EXTRACTED_FACT_IMMUTABLE"),
    "Editing mxCell.value of an EXTRACTED classifier must trigger EXTRACTED_FACT_IMMUTABLE conflict",
  );
  const hydExtractedRename = hydrateUmlWorkspaceFromXml(extractedRenameXml, javaModel, {
    diagramKind: "UML_CLASS",
  });
  assert.ok(
    hydExtractedRename.conflicts.some((c) => c.code === "EXTRACTED_FACT_IMMUTABLE"),
    "hydrateUmlWorkspaceFromXml must surface EXTRACTED_FACT_IMMUTABLE when canvas value was edited",
  );

  // Mutate a DESIGNED classifier cell's value attribute to "RenamedDesignedByUser" without updating mavisMeta
  const designedRenameXml = classXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="classifier" mavisProvenance="DESIGNED")/,
    "$1RenamedDesignedByUser$2",
  );
  const rtDesignedRename = reconcileUmlDrawioXml(designedRenameXml, classProj);
  assert.ok(
    rtDesignedRename.conflicts.some((c) => c.code === "CARRIER_CANVAS_SEMANTIC_MISMATCH"),
    "Editing mxCell.value of a DESIGNED classifier without synced carrier metadata must trigger CARRIER_CANVAS_SEMANTIC_MISMATCH",
  );

  // Mutate a class-relation edge style (e.g. changing endArrow=open to endArrow=block)
  const edgeStyleMutatedXml = classXml.replace(
    /(style="[^"]*)endArrow=open([^"]*"[^>]*mavisUmlRole="class-relation")/,
    "$1endArrow=block$2",
  );
  const rtEdgeStyle = reconcileUmlDrawioXml(edgeStyleMutatedXml, classProj);
  assert.ok(
    rtEdgeStyle.conflicts.some(
      (c) => c.code === "EXTRACTED_FACT_IMMUTABLE" || c.code === "CARRIER_CANVAS_SEMANTIC_MISMATCH",
    ),
    "Changing relationship arrow style on canvas must be detected as a semantic conflict",
  );

  // Test order-independent <mxGeometry> attributes and omitted x=0 / y=0 attributes
  const targetClsId = classProj.classifiers[0].classifierId;
  const secondClsId = classProj.classifiers[1].classifierId;
  const reorderedGeomXml = classXml
    .replace(
      new RegExp(`(id="${targetClsId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\s*)<mxGeometry[^>]*\\/>`),
      `$1<mxGeometry height="165" width="315" y="95" x="245" as="geometry"/>`,
    )
    .replace(
      new RegExp(`(id="${secondClsId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\s*)<mxGeometry[^>]*\\/>`),
      `$1<mxGeometry width="290" height="140" as="geometry"/>`,
    );
  const rtGeom = reconcileUmlDrawioXml(reorderedGeomXml, classProj);
  assert.equal(rtGeom.conflicts.length, 0, "Pure geometry changes with reordered/omitted x=0,y=0 must have 0 conflicts");
  assert.deepEqual(rtGeom.preservedLayout[targetClsId], {
    x: 245,
    y: 95,
    width: 315,
    height: 165,
  });
  assert.deepEqual(rtGeom.preservedLayout[secondClsId], {
    x: 0,
    y: 0,
    width: 290,
    height: 140,
  });

  // 2. UML_PACKAGE: value & style edit detection
  const pkgProj = projectUmlPackageDiagram(javaModel);
  const pkgXml = buildUmlDrawioXml(pkgProj);
  const pkgValueMutated = pkgXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="package")/,
    "$1com.hacked.namespace$2",
  );
  assert.ok(reconcileUmlDrawioXml(pkgValueMutated, pkgProj).conflicts.length > 0);

  // 3. UML_DEPLOYMENT: value & style edit detection
  const deployProj = projectUmlDeploymentDiagram(javaModel);
  const deployXml = buildUmlDrawioXml(deployProj);
  const deployValueMutated = deployXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="deployment-node")/,
    "$1TamperedDeploymentNode$2",
  );
  assert.ok(reconcileUmlDrawioXml(deployValueMutated, deployProj).conflicts.length > 0);

  // 4. UML_ACTIVITY: action label & control-flow guard edit detection
  const actProj = projectUmlActivityDiagram(javaModel);
  const actXml = buildUmlDrawioXml(actProj);
  const actNodeMutated = actXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]+("[^>]*mavisUmlRole="activity-node")/,
    "$1TamperedActionStep$2",
  );
  assert.ok(reconcileUmlDrawioXml(actNodeMutated, actProj).conflicts.length > 0);
  const actEdgeGuardMutated = actXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="activity-edge")/,
    "$1[tamperedGuardCondition]$2",
  );
  assert.ok(reconcileUmlDrawioXml(actEdgeGuardMutated, actProj).conflicts.length > 0);

  // 5. UML_STATE: state compartment & transition trigger[guard]/effect edit detection
  const stateProj = projectUmlStateDiagram(javaModel);
  const stateXml = buildUmlDrawioXml(stateProj);
  const stateNodeMutated = stateXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]+("[^>]*mavisUmlRole="state-node")/,
    "$1TAMPERED_STATE$2",
  );
  assert.ok(reconcileUmlDrawioXml(stateNodeMutated, stateProj).conflicts.length > 0);
  const stateTransMutated = stateXml.replace(
    /(<mxCell id="[^"]+" value=")[^"]*("[^>]*mavisUmlRole="state-transition")/,
    "$1hackedTrigger [hackedGuard] / hackedEffect()$2",
  );
  assert.ok(reconcileUmlDrawioXml(stateTransMutated, stateProj).conflicts.length > 0);
});

test("Q2: Document identity, schemaVersion, diagramKind, scope, carrier, and overlay boundary validation on hydrate & reconcile", () => {
  const javaModel = loadJavaFixtureModel();
  const csharpModel = loadCsharpFixtureModel();

  const classProj = projectUmlClassDiagram(javaModel);
  const validXml = buildUmlDrawioXml(classProj);

  // 1. Foreign model document rejected (reviewer repro `foreignDocument`)
  const foreignHydrate = hydrateUmlWorkspaceFromXml(validXml, csharpModel, {
    diagramKind: "UML_CLASS",
  });
  assert.ok(
    foreignHydrate.conflicts.some((c) => c.code === "FOREIGN_MODEL_DOCUMENT_REJECTED"),
    "Hydrating XML from another modelId must emit FOREIGN_MODEL_DOCUMENT_REJECTED",
  );
  assert.equal(
    Object.keys(foreignHydrate.preservedLayout).length,
    0,
    "Foreign model document must not apply preserved layout to target model",
  );

  // 2. Wrong expected diagramKind rejected
  const wrongKindHydrate = hydrateUmlWorkspaceFromXml(validXml, javaModel, {
    diagramKind: "UML_PACKAGE",
  });
  assert.ok(
    wrongKindHydrate.conflicts.some((c) => c.code === "DOCUMENT_VIEW_KIND_MISMATCH"),
    "Hydrating UML_CLASS XML into UML_PACKAGE workspace view must emit DOCUMENT_VIEW_KIND_MISMATCH",
  );

  // 3. Wrong expected view scope rejected
  const ordersSvc = javaModel.elements.find((e) => e.name === "orders-service");
  const scopedClassProj = projectUmlClassDiagram(javaModel, {
    serviceId: ordersSvc.id,
    packageName: "com.example.orders",
  });
  const scopedXml = buildUmlDrawioXml(scopedClassProj, {}, {
    selectedServiceId: ordersSvc.id,
    selectedPackageName: "com.example.orders",
  });
  const wrongScopeHydrate = hydrateUmlWorkspaceFromXml(scopedXml, javaModel, {
    diagramKind: "UML_CLASS",
    selectedServiceId: ordersSvc.id,
    selectedPackageName: "com.example.billing",
  });
  assert.ok(
    wrongScopeHydrate.conflicts.some((c) => c.code === "DOCUMENT_VIEW_SCOPE_MISMATCH"),
    "Hydrating XML scoped to com.example.orders into com.example.billing view must emit DOCUMENT_VIEW_SCOPE_MISMATCH",
  );

  // 4. Invalid / unsupported future schemaVersion rejected
  const schemaZeroXml = validXml.replace('mavisSchemaVersion="1"', 'mavisSchemaVersion="0"');
  assert.ok(
    hydrateUmlWorkspaceFromXml(schemaZeroXml, javaModel).conflicts.some(
      (c) => c.code === "INVALID_DOCUMENT_SCHEMA_VERSION",
    ),
  );
  const futureSchemaXml = validXml.replace('mavisSchemaVersion="1"', 'mavisSchemaVersion="2"');
  assert.ok(
    hydrateUmlWorkspaceFromXml(futureSchemaXml, javaModel).conflicts.some(
      (c) => c.code === "UNSUPPORTED_FUTURE_SCHEMA_VERSION",
    ),
  );

  // 5. Missing or corrupted mavisUmlDocument carrier rejected
  const missingCarrierXml = validXml.replace(/\smavisUmlDocument="[^"]*"/, "");
  assert.ok(
    hydrateUmlWorkspaceFromXml(missingCarrierXml, javaModel).conflicts.some(
      (c) => c.code === "MISSING_DOCUMENT_CARRIER",
    ),
  );
  const corruptedCarrierXml = validXml.replace(
    /mavisUmlDocument="[^"]*"/,
    'mavisUmlDocument="%%%not-valid-base64%%%"',
  );
  assert.ok(
    hydrateUmlWorkspaceFromXml(corruptedCarrierXml, javaModel).conflicts.some(
      (c) => c.code === "MALFORMED_DOCUMENT_CARRIER",
    ),
  );

  // 6. Root mavisUmlDiagramKind vs carrier diagramKind mismatch & cell role mismatch
  const rootKindMismatchXml = validXml.replace(
    'mavisUmlDiagramKind="UML_CLASS"',
    'mavisUmlDiagramKind="UML_STATE"',
  );
  assert.ok(
    hydrateUmlWorkspaceFromXml(rootKindMismatchXml, javaModel).conflicts.some(
      (c) => c.code === "CARRIER_ROOT_KIND_MISMATCH",
    ),
  );
  const cellRoleMismatchXml = validXml.replace(
    'mavisUmlRole="classifier"',
    'mavisUmlRole="state-node"',
  );
  assert.ok(
    hydrateUmlWorkspaceFromXml(cellRoleMismatchXml, javaModel).conflicts.some(
      (c) => c.code === "CARRIER_CELL_ROLE_MISMATCH",
    ),
  );

  // 7. Nonexistent scope reference & dangling overlay reference in carrier rejected
  const badOverlayCarrier = Buffer.from(
    decodeURIComponent(
      encodeURIComponent(
        JSON.stringify({
          schemaVersion: 1,
          diagramKind: "UML_CLASS",
          modelId: javaModel.id,
          selectedServiceId: "non-existent-service-id",
          selectedPackageName: null,
          classOverlay: {
            designedClassifiers: [
              {
                classifierId: classProj.classifiers[0].classifierId, // collides with EXTRACTED ID
                modelElementId: null,
                name: "CollidingClassifier",
                qualifiedName: "com.example.orders.CollidingClassifier",
                packageName: "com.example.orders",
                serviceId: null,
                serviceName: null,
                classifierKind: "CLASS",
                visibility: "public",
                isAbstract: false,
                typeParameters: [],
                attributes: [],
                operations: [],
                provenance: "EXTRACTED", // spoofed provenance in overlay
                evidenceIds: [],
              },
            ],
            designedRelations: [
              {
                relationId: "designed:rel:dangling",
                sourceRelationshipId: null,
                fromClassifierId: "non-existent-source",
                toClassifierId: "non-existent-target",
                relationKind: "DEPENDENCY",
                provenance: "DESIGNED",
                evidenceIds: [],
              },
            ],
          },
        }),
      ),
    ),
    "utf8",
  ).toString("base64");
  const badCarrierXml = validXml.replace(
    /mavisUmlDocument="[^"]*"/,
    `mavisUmlDocument="${badOverlayCarrier}"`,
  );
  const badCarrierHydrated = hydrateUmlWorkspaceFromXml(badCarrierXml, javaModel);
  assert.ok(
    badCarrierHydrated.conflicts.some((c) => c.code === "INVALID_DOCUMENT_SCOPE_REFERENCE"),
  );
  assert.ok(
    badCarrierHydrated.conflicts.some((c) => c.code === "INVALID_OVERLAY_PROVENANCE"),
  );
  assert.ok(
    badCarrierHydrated.conflicts.some((c) => c.code === "OVERLAY_ID_COLLIDES_WITH_EXTRACTED"),
  );
  assert.ok(
    badCarrierHydrated.conflicts.some((c) => c.code === "DANGLING_OVERLAY_REFERENCE"),
  );
});

test("Q3: Compose service with ports/environment only or build context only never fabricates :build artifact or «manifest» edge", () => {
  const javaModel = loadJavaFixtureModel();

  // Construct model with 3 compose containers: (1) ports/env only, (2) build context only, (3) explicit image
  const modelWithComposeVariants = {
    ...javaModel,
    elements: [
      ...javaModel.elements,
      {
        id: "elem-edge-proxy-ports-only",
        modelVersionId: javaModel.id,
        name: "edge-proxy",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
        technology: "Docker",
        language: "UNKNOWN",
        protocol: "http",
        origin: "DEPLOYMENT",
        evidence: [],
        properties: {
          sourceType: "DOCKER_COMPOSE",
          locator: "docker-compose.yml:20",
          ports: ["8080:8080"],
          deploymentMetadata: {
            nodeStereotype: "<<executionEnvironment>>",
            executionEnvironment: "Docker Container",
            artifactResolution: "NO_ARTIFACT_DECLARED",
            composeFilePath: "docker-compose.yml",
            environment: "default",
            lineNumber: 20,
          },
        },
      },
      {
        id: "elem-legacy-fabricated-build",
        modelVersionId: javaModel.id,
        name: "legacy-worker",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
        technology: "Docker",
        language: "UNKNOWN",
        protocol: "http",
        origin: "DEPLOYMENT",
        evidence: [],
        properties: {
          sourceType: "DOCKER_COMPOSE",
          ports: ["9090:9090"],
          deploymentMetadata: {
            nodeStereotype: "<<executionEnvironment>>",
            executionEnvironment: "Docker Container",
            artifactName: "legacy-worker:build",
            artifactKind: "BUILD_ARTIFACT",
            environment: "default",
          },
        },
      },
    ],
  };

  const deployProj = projectUmlDeploymentDiagram(modelWithComposeVariants, {
    environment: "default",
  });

  // Verify edge-proxy (ports/env only) is rendered as EXECUTION_ENVIRONMENT node without any artifact or manifestation
  const edgeProxyNode = deployProj.nodes.find((n) => n.name === "edge-proxy");
  assert.ok(edgeProxyNode, "Compose service with ports/env must produce EXECUTION_ENVIRONMENT node");
  assert.equal(edgeProxyNode.nodeKind, "EXECUTION_ENVIRONMENT");
  assert.ok(
    !deployProj.nodes.some((n) => n.nodeKind === "ARTIFACT" && n.parentNodeId === edgeProxyNode.nodeId),
    "Ports/env-only compose service must not have any nested ARTIFACT node",
  );
  assert.ok(
    deployProj.validationIssues.some(
      (i) =>
        i.targetId === edgeProxyNode.nodeId &&
        i.code === "COMPOSE_SERVICE_NO_ARTIFACT_DECLARED",
    ),
    "Ports/env-only compose service must emit COMPOSE_SERVICE_NO_ARTIFACT_DECLARED diagnostic",
  );

  // Verify legacy `:build` fallback is rejected by frontend projection guard as well
  const legacyNode = deployProj.nodes.find((n) => n.name === "legacy-worker");
  assert.ok(legacyNode);
  assert.ok(
    !deployProj.nodes.some((n) => n.name === "legacy-worker:build"),
    "Frontend projection guard must reject fabricated :build artifact names",
  );
});

test("Docx Specification Alignment: Package default DEPENDENCY + nested parent, Class 2-ended role/multiplicity + /derived attribute, Sequence Found/Lost messages, and State composite substate + H/H* history", () => {
  const {
    upgradeLegacyScenarioDesign,
    addCustomMessageToInteraction,
    interactionToDrawioXml,
    extractInteractionFromDrawioXml,
    validateInteractionDocument,
  } = require("../src/features/architecture/scenario-design.ts");
  const javaModel = loadJavaFixtureModel();

  // 1. Package Diagram: code-level cross-package edge defaults to DEPENDENCY («use») and supports nested parentPackageId
  const basePkgProj = projectUmlPackageDiagram(javaModel);
  const extractedCrossEdge = basePkgProj.edges.find((e) => e.provenance === "EXTRACTED");
  assert.ok(extractedCrossEdge);
  assert.equal(
    extractedCrossEdge.relationKind,
    "DEPENDENCY",
    "Extracted code-level cross-package edge must default to DEPENDENCY rather than fabricating «import»",
  );
  const parentPkg = basePkgProj.packages[0];
  const nestedPkgProj = projectUmlPackageDiagram(javaModel, {
    overlay: {
      designedPackages: [
        {
          packageId: "designed:pkg:nested-subpkg",
          name: "internal",
          qualifiedName: `${parentPkg.qualifiedName}.internal`,
          parentPackageId: parentPkg.packageId,
          serviceId: parentPkg.serviceId,
          memberClassifierIds: [],
          memberNames: ["InternalPolicy"],
          provenance: "DESIGNED",
        },
      ],
    },
  });
  const nestedPkgXml = buildUmlDrawioXml(nestedPkgProj);
  assert.match(
    nestedPkgXml,
    new RegExp(`id="designed:pkg:nested-subpkg"[^>]*parent="${parentPkg.packageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    "Nested package must render with parent={parentPackageId} in Draw.io XML",
  );
  assert.equal(reconcileUmlDrawioXml(nestedPkgXml, nestedPkgProj).conflicts.length, 0);

  // 2. Class Diagram: 2-ended Role & Multiplicity and /derived attribute
  const baseClassProj = projectUmlClassDiagram(javaModel);
  const clsA = baseClassProj.classifiers[0];
  const clsB = baseClassProj.classifiers[1];
  const enhancedClassProj = projectUmlClassDiagram(javaModel, {
    overlay: {
      designedClassifiers: [
        {
          classifierId: "designed:cls:OrderSummary",
          modelElementId: null,
          name: "OrderSummary",
          qualifiedName: "com.example.orders.OrderSummary",
          packageName: "com.example.orders",
          serviceId: clsA.serviceId,
          serviceName: clsA.serviceName,
          classifierKind: "CLASS",
          visibility: "PUBLIC",
          isAbstract: false,
          isStatic: false,
          typeParameters: [],
          sourceLanguage: "DESIGNED",
          attributes: [
            {
              memberId: "designed:cls:OrderSummary:attr:total",
              kind: "FIELD",
              name: "totalPrice",
              type: "BigDecimal",
              visibility: "PRIVATE",
              isStatic: false,
              isAbstract: false,
              isDerived: true,
              signatureKey: "/totalPrice:BigDecimal",
              parameters: [],
              provenance: "DESIGNED",
            },
          ],
          operations: [],
          provenance: "DESIGNED",
          evidenceIds: [],
        },
      ],
      designedRelations: [
        {
          relationId: "designed:rel:two-ended",
          sourceRelationshipId: null,
          fromClassifierId: clsA.classifierId,
          toClassifierId: clsB.classifierId,
          relationKind: "ASSOCIATION",
          sourceRoleName: "employer",
          sourceMultiplicity: "1",
          roleName: "employees",
          multiplicity: "0..*",
          provenance: "DESIGNED",
          evidenceIds: [],
        },
      ],
    },
  });
  const enhancedClassXml = buildUmlDrawioXml(enhancedClassProj);
  assert.match(enhancedClassXml, /\/totalPrice: BigDecimal/, "Derived attribute must render with leading /");
  assert.match(
    enhancedClassXml,
    /employer \[1\] → employees \[0\.\.\*\]/,
    "Two-ended role and multiplicity must render on class relation edge",
  );
  assert.equal(reconcileUmlDrawioXml(enhancedClassXml, enhancedClassProj).conflicts.length, 0);

  // 3. Sequence Diagram: Found and Lost messages with black filled endpoint circle
  const baseSeq = upgradeLegacyScenarioDesign(
    {
      name: "Order Webhook & Audit Flow",
      modelId: javaModel.id,
      edgeIds: [javaModel.edges[0].id],
    },
    javaModel,
  );
  const p0 = baseSeq.participants[0].participantId;
  const p1 = baseSeq.participants[1].participantId;
  const seqWithFound = addCustomMessageToInteraction(baseSeq, javaModel, {
    fromParticipantId: p0,
    toParticipantId: p0,
    label: "onExternalWebhook()",
    messageSort: "ASYNCH_SIGNAL",
    endpointKind: "FOUND",
  });
  const seqDoc = addCustomMessageToInteraction(seqWithFound, javaModel, {
    fromParticipantId: p0,
    toParticipantId: p1,
    label: "emitFireAndForgetAudit()",
    messageSort: "ASYNCH_SIGNAL",
    endpointKind: "LOST",
  });
  const seqValidation = validateInteractionDocument(seqDoc, javaModel);
  assert.equal(seqValidation.errors.length, 0);
  const seqXml = interactionToDrawioXml(seqDoc);
  const foundMsgId = seqDoc.messages.find((m) => m.endpointKind === "FOUND").messageId;
  const lostMsgId = seqDoc.messages.find((m) => m.endpointKind === "LOST").messageId;
  assert.match(
    seqXml,
    new RegExp(`id="found-origin-${foundMsgId}"`),
    "Found message must render black filled origin circle",
  );
  assert.match(
    seqXml,
    new RegExp(`id="lost-target-${lostMsgId}"`),
    "Lost message must render black filled target circle",
  );
  const extractedSeq = extractInteractionFromDrawioXml(seqXml, javaModel);
  assert.ok(extractedSeq, "extractInteractionFromDrawioXml must succeed");
  assert.equal(extractedSeq.roundTripConflicts.length, 0, "Found/Lost message XML must have 0 round-trip conflicts");
  assert.equal(
    extractedSeq.document.messages.find((m) => m.messageId === foundMsgId).endpointKind,
    "FOUND",
  );
  assert.equal(
    extractedSeq.document.messages.find((m) => m.messageId === lostMsgId).endpointKind,
    "LOST",
  );

  // 4. State Diagram: Composite parentStateId substate nesting and H / H* history pseudostates
  const enhancedStateProj = projectUmlStateDiagram(javaModel, {
    overlay: {
      designedStates: [
        {
          stateId: "designed:state:ACTIVE_PROCESSING",
          name: "ACTIVE_PROCESSING",
          kind: "COMPOSITE_STATE",
          regionId: "region:Order",
          parentStateId: null,
          entryBehavior: null,
          doActivity: null,
          exitBehavior: null,
          provenance: "DESIGNED",
        },
        {
          stateId: "designed:state:VALIDATING_PAYMENT",
          name: "VALIDATING_PAYMENT",
          kind: "STATE",
          regionId: "region:Order",
          parentStateId: "designed:state:ACTIVE_PROCESSING",
          entryBehavior: "lockFunds()",
          doActivity: null,
          exitBehavior: null,
          provenance: "DESIGNED",
        },
        {
          stateId: "designed:state:H_SHALLOW",
          name: "H",
          kind: "SHALLOW_HISTORY",
          regionId: "region:Order",
          parentStateId: "designed:state:ACTIVE_PROCESSING",
          entryBehavior: null,
          doActivity: null,
          exitBehavior: null,
          provenance: "DESIGNED",
        },
        {
          stateId: "designed:state:H_DEEP",
          name: "H*",
          kind: "DEEP_HISTORY",
          regionId: "region:Order",
          parentStateId: "designed:state:ACTIVE_PROCESSING",
          entryBehavior: null,
          doActivity: null,
          exitBehavior: null,
          provenance: "DESIGNED",
        },
      ],
    },
  });
  const enhancedStateXml = buildUmlDrawioXml(enhancedStateProj);
  assert.match(
    enhancedStateXml,
    /id="designed:state:VALIDATING_PAYMENT"[^>]*parent="designed:state:ACTIVE_PROCESSING"/,
    "Substate must render inside parent CompositeState in Draw.io XML",
  );
  assert.match(enhancedStateXml, /mavisStateKind="SHALLOW_HISTORY"/);
  assert.match(enhancedStateXml, /mavisStateKind="DEEP_HISTORY"/);
  assert.equal(reconcileUmlDrawioXml(enhancedStateXml, enhancedStateProj).conflicts.length, 0);
});

test("UML AI Enrichment: buildUmlCompactContext, applyUmlAiEnrichment, and round-trip hydration across all 5 UML diagrams", () => {
  const {
    buildUmlCompactContext,
    applyUmlAiEnrichment,
  } = require("../src/features/architecture/uml-diagrams.ts");
  const javaModel = loadJavaFixtureModel();

  // 1. UML_CLASS
  const clsBase = projectUmlClassDiagram(javaModel);
  const clsCtx = buildUmlCompactContext(javaModel, clsBase);
  assert.match(clsCtx.contextHash, /^uml:UML_CLASS:/);
  assert.ok(clsCtx.savedPercent >= 50);
  const targetRel = clsBase.relations.find(
    (r) => r.provenance === "EXTRACTED" && r.relationKind !== "GENERALIZATION" && r.relationKind !== "REALIZATION",
  );
  if (targetRel) {
    const clsAi = {
      classRelations: {
        [targetRel.relationId]: { roleName: "orderRepository", multiplicity: "1" },
      },
    };
    const clsEnriched = applyUmlAiEnrichment(clsBase, clsAi);
    const updatedRel = clsEnriched.relations.find((r) => r.relationId === targetRel.relationId);
    assert.ok(updatedRel.roleName);
    const clsXml = buildUmlDrawioXml(clsEnriched, {}, { aiEnrichment: clsAi });
    const clsHydrated = hydrateUmlWorkspaceFromXml(clsXml, javaModel, {
      diagramKind: "UML_CLASS",
      aiEnrichment: clsAi,
    });
    assert.equal(clsHydrated.conflicts.length, 0);
  }

  // 2. UML_PACKAGE
  const pkgBase = projectUmlPackageDiagram(javaModel);
  const pkgEdge = pkgBase.edges[0];
  assert.ok(pkgEdge);
  const pkgAi = {
    packageEdges: {
      [pkgEdge.edgeId]: { relationKind: "IMPORT" },
    },
  };
  const pkgEnriched = applyUmlAiEnrichment(pkgBase, pkgAi);
  assert.equal(pkgEnriched.edges[0].relationKind, pkgEdge.relationKind, "AI layout suggestions must not change extracted namespace semantics");
  const pkgXml = buildUmlDrawioXml(pkgEnriched, {}, { aiEnrichment: pkgAi });
  assert.equal(
    hydrateUmlWorkspaceFromXml(pkgXml, javaModel, { diagramKind: "UML_PACKAGE" }).conflicts.length,
    0,
  );

  // 3. UML_DEPLOYMENT
  const depBase = projectUmlDeploymentDiagram(javaModel);
  const commEdge = depBase.edges.find((e) => e.edgeKind === "COMMUNICATION_PATH");
  if (commEdge) {
    const depAi = {
      deploymentEdges: {
        [commEdge.edgeId]: { label: "Kafka TCP :9092", protocol: "TCP" },
      },
    };
    const depEnriched = applyUmlAiEnrichment(depBase, depAi);
    const updatedComm = depEnriched.edges.find((e) => e.edgeId === commEdge.edgeId);
    assert.equal(updatedComm.label, "Kafka TCP :9092");
    const depXml = buildUmlDrawioXml(depEnriched, {}, { aiEnrichment: depAi });
    assert.equal(
      hydrateUmlWorkspaceFromXml(depXml, javaModel, { diagramKind: "UML_DEPLOYMENT" }).conflicts.length,
      0,
    );
  }

  // 4. UML_ACTIVITY
  const actBase = projectUmlActivityDiagram(javaModel);
  const actAction = actBase.nodes.find((n) => n.kind === "ACTION");
  if (actAction) {
    const actAi = {
      activityNodes: {
        [actAction.nodeId]: { label: "Persist Order Aggregate" },
      },
    };
    const actEnriched = applyUmlAiEnrichment(actBase, actAi);
    assert.equal(
      actEnriched.nodes.find((n) => n.nodeId === actAction.nodeId).label,
      "Persist Order Aggregate",
    );
    const actXml = buildUmlDrawioXml(actEnriched, {}, { aiEnrichment: actAi });
    assert.equal(
      hydrateUmlWorkspaceFromXml(actXml, javaModel, {
        diagramKind: "UML_ACTIVITY",
        selectedOperationId: actBase.selectedOperationId,
      }).conflicts.length,
      0,
    );
  }

  // 5. UML_STATE (stateful entity vs enum-only guard)
  const stBase = projectUmlStateDiagram(javaModel);
  const stNode = stBase.states.find((s) => s.kind === "STATE");
  if (stNode && !stBase.enumOnlyNoTransitions) {
    const stAi = {
      stateNodes: {
        [stNode.stateId]: { entryBehavior: "publishOrderEvent()" },
      },
    };
    const stEnriched = applyUmlAiEnrichment(stBase, stAi);
    assert.ok(stEnriched.states.find((s) => s.stateId === stNode.stateId).entryBehavior);
    const stXml = buildUmlDrawioXml(stEnriched, {}, { aiEnrichment: stAi });
    assert.equal(
      hydrateUmlWorkspaceFromXml(stXml, javaModel, {
        diagramKind: "UML_STATE",
        selectedTargetId: stBase.selectedTargetId,
      }).conflicts.length,
      0,
    );
  }
});

test("Multi-Swimlane Microservices Business Flow Activity Diagrams: groups diagrams by Main Flow / Use Case and assigns Swimlane columns to participating Actors & Microservices only", () => {
  const ftgoModel = {
    id: "ftgo-microservices-model",
    projectId: "ftgo-proj",
    snapshotId: "ftgo-snap",
    revision: 1,
    label: "FTGO Microservices",
    elements: [
      { id: "actor-customer", name: "Customer", elementType: "PERSON", parentId: null, technology: "Actor", layer: "edge", description: "", properties: {}, evidence: [] },
      { id: "svc-order", name: "ftgo-order-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
      { id: "svc-consumer", name: "ftgo-consumer-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
      { id: "svc-kitchen", name: "ftgo-kitchen-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
      { id: "svc-accounting", name: "ftgo-accounting-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
      { id: "svc-delivery", name: "ftgo-delivery-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
      { id: "svc-restaurant", name: "ftgo-restaurant-service", elementType: "SERVICE_CONTAINER", parentId: null, technology: "Spring Boot", layer: "domain", description: "", properties: {}, evidence: [] },
    ],
    edges: [
      { id: "e1", from: "actor-customer", to: "svc-order", protocol: "SERVICE_HTTP_CALL", uncertain: false, originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [], evidence: [] },
      { id: "e2", from: "svc-order", to: "svc-consumer", protocol: "MESSAGE_PUBLISH", uncertain: false, originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [], evidence: [] },
      { id: "e3", from: "svc-order", to: "svc-kitchen", protocol: "MESSAGE_PUBLISH", uncertain: false, originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [], evidence: [] },
      { id: "e4", from: "svc-order", to: "svc-accounting", protocol: "MESSAGE_PUBLISH", uncertain: false, originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [], evidence: [] },
      { id: "e5", from: "svc-kitchen", to: "svc-delivery", protocol: "MESSAGE_PUBLISH", uncertain: false, originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [], evidence: [] },
    ],
  };

  // 1. Default projection selects Create Order Flow with 5 Swimlanes (Customer, Order, Consumer, Kitchen, Accounting)
  const createOrderProj = projectUmlActivityDiagram(ftgoModel);
  assert.equal(createOrderProj.selectedOperationId, "flow:business:create-order-flow");
  assert.equal(createOrderProj.partitions.length, 5, "Create Order Flow must have 5 Swimlanes");
  assert.ok(createOrderProj.nodes.some((n) => n.kind === "DECISION"), "Must include Decision diamonds");
  assert.ok(createOrderProj.nodes.some((n) => n.kind === "FLOW_FINAL"), "Must include rollback/compensation FlowFinal");
  assert.ok(createOrderProj.nodes.some((n) => n.kind === "ACTIVITY_FINAL"), "Must include ActivityFinal");
  assert.equal(
    createOrderProj.validationIssues.filter((i) => i.severity === "ERROR").length,
    0,
    "Create Order Flow must have 0 structural validation errors",
  );

  // Verify Draw.io XML renders all 5 Swimlanes side-by-side and round-trips with 0 conflicts
  const createXml = buildUmlDrawioXml(createOrderProj);
  assert.equal(
    (createXml.match(/mavisUmlRole="activity-partition"/g) ?? []).length,
    5,
    "XML must render 5 activity-partition swimlane cells",
  );
  assert.match(createXml, /<Array as="points">/, "Cross-swimlane edges must include orthogonal waypoints");
  const rtCreate = reconcileUmlDrawioXml(createXml, createOrderProj);
  assert.equal(rtCreate.conflicts.length, 0, "Multi-swimlane round-trip must have 0 conflicts");

  // 2. Delivery Flow has 4 Swimlanes (Restaurant, Kitchen, Delivery, Order) and excludes Consumer & Accounting
  const deliveryProj = projectUmlActivityDiagram(ftgoModel, {
    operationId: "flow:business:delivery-flow",
  });
  assert.equal(deliveryProj.partitions.length, 4, "Delivery Flow must have 4 Swimlanes");
  assert.ok(
    !deliveryProj.partitions.some((p) => /consumer|accounting/i.test(p.name)),
    "Delivery Flow must not include Consumer or Accounting swimlanes",
  );
  assert.equal(deliveryProj.validationIssues.filter((i) => i.severity === "ERROR").length, 0);

  // 3. Cancel Order Flow has 4 Swimlanes (Customer, Order, Kitchen, Accounting) and excludes Delivery & Consumer
  const cancelProj = projectUmlActivityDiagram(ftgoModel, {
    operationId: "flow:business:cancel-order-flow",
  });
  assert.equal(cancelProj.partitions.length, 4, "Cancel Order Flow must have 4 Swimlanes");
  assert.ok(
    !cancelProj.partitions.some((p) => /delivery|consumer/i.test(p.name)),
    "Cancel Order Flow must not include Delivery or Consumer swimlanes",
  );
  assert.equal(cancelProj.validationIssues.filter((i) => i.severity === "ERROR").length, 0);

  // 4. Domain Entity State Machines (Order, Kitchen Ticket, Delivery) — 1 Entity per Microservice
  const orderStateProj = projectUmlStateDiagram(ftgoModel);
  assert.equal(orderStateProj.selectedTargetId, "state:entity:order");
  assert.equal(orderStateProj.availableTargets.length, 3, "FTGO must expose the 3 core Domain Entity State Machines");
  const orderStateNames = orderStateProj.states.map((s) => s.name);
  for (const expected of ["APPROVAL_PENDING", "APPROVED", "REJECTED", "CANCEL_PENDING", "REVISION_PENDING", "CANCELLED"]) {
    assert.ok(orderStateNames.includes(expected), `Order State Machine must include ${expected}`);
  }
  assert.ok(
    orderStateProj.transitions.some(
      (t) =>
        t.fromStateId === "state:entity:order:CANCEL_PENDING" &&
        t.toStateId === "state:entity:order:APPROVED" &&
        /undoCancel/i.test(t.trigger || ""),
    ),
    "Order State Machine must include undoCancel() transition returning from CANCEL_PENDING to APPROVED",
  );
  assert.equal(orderStateProj.validationIssues.filter((i) => i.severity === "ERROR").length, 0);

  const orderStateXml = buildUmlDrawioXml(orderStateProj);
  assert.match(orderStateXml, /<Array as="points">/, "State transitions must include orthogonal waypoints");
  assert.match(orderStateXml, /&#xa;/, "Long state transition labels must wrap onto multiple compact lines");
  const rtOrderState = reconcileUmlDrawioXml(orderStateXml, orderStateProj);
  assert.equal(rtOrderState.conflicts.length, 0, "Order State Machine XML round-trip must have 0 conflicts");
  assert.ok(
    rtOrderState.preservedLayout["state:entity:order:REJECTED"].x -
      (rtOrderState.preservedLayout["state:entity:order:APPROVED"].x +
        rtOrderState.preservedLayout["state:entity:order:APPROVED"].width) >=
      200,
    "Same-tier states must have >= 200px horizontal corridor gap",
  );
  assert.ok(
    rtOrderState.preservedLayout["state:entity:order:INITIAL"].y <
      rtOrderState.preservedLayout["state:entity:order:APPROVAL_PENDING"].y &&
      rtOrderState.preservedLayout["state:entity:order:APPROVAL_PENDING"].y <
        rtOrderState.preservedLayout["state:entity:order:APPROVED"].y &&
      rtOrderState.preservedLayout["state:entity:order:APPROVED"].y <
        rtOrderState.preservedLayout["state:entity:order:CANCEL_PENDING"].y &&
      rtOrderState.preservedLayout["state:entity:order:CANCEL_PENDING"].y <
        rtOrderState.preservedLayout["state:entity:order:CANCELLED"].y,
    "Order State Machine must use top-to-bottom hierarchical lifecycle tiers",
  );

  // Kitchen Ticket State Machine (ftgo-kitchen-service)
  const ticketStateProj = projectUmlStateDiagram(ftgoModel, {
    targetId: "state:entity:kitchen-ticket",
  });
  const ticketStateNames = ticketStateProj.states.map((s) => s.name);
  for (const expected of ["CREATE_PENDING", "AWAITING_ACCEPTANCE", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"]) {
    assert.ok(ticketStateNames.includes(expected), `Kitchen Ticket State Machine must include ${expected}`);
  }
  assert.equal(ticketStateProj.validationIssues.filter((i) => i.severity === "ERROR").length, 0);

  // Delivery State Machine (ftgo-delivery-service)
  const deliveryStateProj = projectUmlStateDiagram(ftgoModel, {
    targetId: "state:entity:delivery",
  });
  const deliveryStateNames = deliveryStateProj.states.map((s) => s.name);
  for (const expected of ["PENDING", "SCHEDULED", "DELIVERED", "CANCELLED"]) {
    assert.ok(deliveryStateNames.includes(expected), `Delivery State Machine must include ${expected}`);
  }
  assert.equal(deliveryStateProj.validationIssues.filter((i) => i.severity === "ERROR").length, 0);
});

test("UML_DEPLOYMENT multi-source deduplication, barycenter DB column alignment, top-down cross-tier ports, and inner build artifacts", () => {
  const makeBuildService = (id, name, port, connections = []) => ({
    id,
    name,
    elementType: "SERVICE_CONTAINER",
    parentId: null,
    technology: "Spring Boot",
    evidence: [{ id: `ev-compose-${id}` }],
    properties: {
      sourceType: "DOCKER_COMPOSE",
      ports: [`${port}:${port}`],
      buildContext: `./${name}`,
      deploymentMetadata: {
        environment: "default",
        nodeStereotype: "<<executionEnvironment>>",
        declaredBuildContext: `./${name}`,
        artifactResolution: "BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT",
        connections,
      },
    },
  });
  const makeDb = (id, name, hostPort) => ({
    id,
    name,
    elementType: "DATABASE",
    parentId: null,
    technology: "PostgreSQL",
    evidence: [{ id: `ev-db-${id}` }],
    properties: {
      sourceType: "DOCKER_COMPOSE",
      image: "postgres:15-alpine",
      protocol: "postgresql",
      ports: [`${hostPort}:5432`],
      deploymentMetadata: {
        environment: "default",
        nodeStereotype: "<<device>>",
        artifactName: "postgres:15-alpine",
        artifactKind: "CONTAINER_IMAGE",
        artifactResolution: "EXPLICIT_CONTAINER_IMAGE",
        connections: [],
      },
    },
  });

  const model = {
    id: "fruit-deployment-benchmark",
    elements: [
      makeBuildService("gw", "api-gateway", 8080, [
        { targetService: "fruit-order-service", protocol: "HTTP", port: 8081 },
      ]),
      makeBuildService("order", "fruit-order-service", 8081, [
        { targetService: "order-db", protocol: "TCP", port: 5432 },
        { targetService: "order-db", protocol: "STARTUP_DEPENDENCY", port: 5432 },
      ]),
      makeBuildService("inventory", "fruit-inventory-service", 8082, [
        { targetService: "inventory-db", protocol: "TCP", port: 5432 },
      ]),
      makeBuildService("catalog", "fruit-catalog-service", 8083, [
        { targetService: "catalog-db", protocol: "TCP", port: 5432 },
      ]),
      makeBuildService("payment", "fruit-payment-service", 8084, [
        { targetService: "payment-db", protocol: "TCP", port: 5432 },
      ]),
      makeDb("db-order", "order-db", 5431),
      makeDb("db-inventory", "inventory-db", 5432),
      makeDb("db-catalog", "catalog-db", 5433),
      makeDb("db-payment", "payment-db", 5434),
    ],
    edges: [
      { id: "e-gw-order", from: "gw", to: "order", protocol: "SERVICE_HTTP_CALL", evidence: [{ id: "ev-http-gw" }], uncertain: false },
      { id: "e-order-db", from: "order", to: "db-order", protocol: "DATABASE_ACCESS", evidence: [{ id: "ev-jdbc-order" }], uncertain: false },
      { id: "e-inv-db", from: "inventory", to: "db-inventory", protocol: "DATABASE_ACCESS", evidence: [{ id: "ev-jdbc-inv" }], uncertain: false },
      { id: "e-cat-db", from: "catalog", to: "db-catalog", protocol: "DATABASE_ACCESS", evidence: [{ id: "ev-jdbc-cat" }], uncertain: false },
      { id: "e-pay-db", from: "payment", to: "db-payment", protocol: "DATABASE_ACCESS", evidence: [{ id: "ev-jdbc-pay" }], uncertain: false },
    ],
  };

  const proj = projectUmlDeploymentDiagram(model);

  // 1. Parallel «configured» TCP (5432) and «communicationPath» POSTGRESQL (5432) edges must be deduplicated into 1 POSTGRESQL edge with merged evidence
  for (const [svcId, dbId, evJdbc, evCompose] of [
    ["order", "db-order", "ev-jdbc-order", "ev-compose-order"],
    ["inventory", "db-inventory", "ev-jdbc-inv", "ev-compose-inventory"],
    ["catalog", "db-catalog", "ev-jdbc-cat", "ev-compose-catalog"],
    ["payment", "db-payment", "ev-jdbc-pay", "ev-compose-payment"],
  ]) {
    const pairEdges = proj.edges.filter(
      (e) => e.fromNodeId === `deploy:node:${svcId}` && e.toNodeId === `deploy:node:${dbId}`,
    );
    assert.equal(pairEdges.length, 1, `Expected exactly 1 deduplicated edge for ${svcId} -> ${dbId}`);
    assert.equal(pairEdges[0].protocol, "POSTGRESQL");
    assert.equal(pairEdges[0].port, "5432");
    assert.equal(pairEdges[0].label, "«communicationPath» POSTGRESQL (5432)");
    assert.ok(pairEdges[0].evidenceIds.includes(evJdbc) && pairEdges[0].evidenceIds.includes(evCompose));
  }

  // 4. Built microservices must have synthesized inner «artifact» <service-name>.jar nodes
  for (const svcName of [
    "api-gateway",
    "fruit-order-service",
    "fruit-inventory-service",
    "fruit-catalog-service",
    "fruit-payment-service",
  ]) {
    assert.ok(
      proj.nodes.some((n) => n.nodeKind === "ARTIFACT" && n.name === `${svcName}.jar`),
      `Built service ${svcName} must have inner «artifact» ${svcName}.jar`,
    );
  }

  // 2 & 3. Verify Barycenter DB column alignment and exitY=1 -> entryY=0 cross-tier port routing in Draw.io XML
  const xml = buildUmlDrawioXml(proj);
  const attrs = (text) => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const cells = new Map(
    [...xml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].map((m) => {
      const a = attrs(m[1]);
      return [a.id, { a, body: m[2], g: attrs(m[2].match(/<mxGeometry\b([^>]*)/)[1]) }];
    }),
  );

  const centerX = (nodeId) => {
    const g = cells.get(nodeId).g;
    return +g.x + +g.width / 2;
  };
  for (const [svcId, dbId] of [
    ["order", "db-order"],
    ["inventory", "db-inventory"],
    ["catalog", "db-catalog"],
    ["payment", "db-payment"],
  ]) {
    assert.ok(
      Math.abs(centerX(`deploy:node:${svcId}`) - centerX(`deploy:node:${dbId}`)) < 5,
      `Dedicated DB ${dbId} must align directly beneath ${svcId} in the same column`,
    );
    const edge = proj.edges.find(
      (e) => e.fromNodeId === `deploy:node:${svcId}` && e.toNodeId === `deploy:node:${dbId}`,
    );
    const style = Object.fromEntries(cells.get(edge.edgeId).a.style.split(";").map((p) => p.split("=")));
    assert.equal(+style.exitY, 1, `Downward edge ${edge.edgeId} must exit bottom face (exitY=1)`);
    assert.equal(+style.entryY, 0, `Downward edge ${edge.edgeId} must enter top face (entryY=0)`);
  }
  assert.equal(reconcileUmlDrawioXml(xml, proj).conflicts.length, 0);
});

test("fruit-payment-service: @FeignClient promoted to C4 Component with outbound target edge & orphan bootstrap root package pruned in UML_PACKAGE", () => {
  const model = {
    id: "fruit-payment-v1",
    projectId: "proj-fruit",
    label: "fruit-payment",
    createdAt: "2026-04-17T00:00:00Z",
    status: "READY",
    elements: [
      {
        id: "svc-payment",
        name: "fruit-payment-service",
        elementType: "SERVICE_CONTAINER",
        technology: "JAVA_SPRING",
        parentId: null,
        description: null,
        evidence: [],
        properties: {},
      },
      {
        id: "cls-app",
        name: "FruitPaymentApplication",
        elementType: "CLASS_INTERFACE",
        technology: "JAVA_SPRING",
        parentId: "svc-payment",
        description: null,
        evidence: [
          {
            id: "ev-app",
            sourceType: "STATIC_CODE",
            filePath: "src/main/java/com/mekongfruit/payment/FruitPaymentApplication.java",
            lineRange: "1-12",
            snippet: "@SpringBootApplication public class FruitPaymentApplication { public static void main(String[] args) {} }",
          },
        ],
        properties: {
          qualifiedName: "com.mekongfruit.payment.FruitPaymentApplication",
          packageName: "com.mekongfruit.payment",
          typeKind: "CLASS",
          umlClassifier: {
            name: "FruitPaymentApplication",
            qualifiedName: "com.mekongfruit.payment.FruitPaymentApplication",
            packageName: "com.mekongfruit.payment",
            typeKind: "CLASS",
            annotations: ["SpringBootApplication"],
            members: [
              {
                name: "main",
                memberKind: "METHOD",
                returnType: "void",
                visibility: "PUBLIC",
                isStatic: true,
                parameters: [{ name: "args", type: "String[]" }],
              },
            ],
          },
        },
      },
      {
        id: "comp-controller",
        name: "FruitPaymentController",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
        parentId: "svc-payment",
        description: "Exposes HTTP endpoints",
        evidence: [],
        properties: {
          qualifiedName: "com.mekongfruit.payment.controller.FruitPaymentController",
          packageName: "com.mekongfruit.payment.controller",
          typeKind: "CLASS",
          umlClassifier: {
            name: "FruitPaymentController",
            qualifiedName: "com.mekongfruit.payment.controller.FruitPaymentController",
            packageName: "com.mekongfruit.payment.controller",
            typeKind: "CLASS",
            annotations: ["RestController"],
            members: [],
          },
        },
      },
      {
        id: "cls-feign",
        name: "NotificationFeignClient",
        elementType: "CLASS_INTERFACE",
        technology: "JAVA_SPRING",
        parentId: "svc-payment",
        description: null,
        evidence: [
          {
            id: "ev-feign",
            sourceType: "STATIC_CODE",
            filePath: "src/main/java/com/mekongfruit/payment/client/NotificationFeignClient.java",
            lineRange: "1-10",
            snippet: '@FeignClient(name = "notification-service", url = "${notification.service.url}") public interface NotificationFeignClient {}',
          },
        ],
        properties: {
          qualifiedName: "com.mekongfruit.payment.client.NotificationFeignClient",
          packageName: "com.mekongfruit.payment.client",
          typeKind: "INTERFACE",
          umlClassifier: {
            name: "NotificationFeignClient",
            qualifiedName: "com.mekongfruit.payment.client.NotificationFeignClient",
            packageName: "com.mekongfruit.payment.client",
            typeKind: "INTERFACE",
            annotations: ["FeignClient"],
            members: [],
          },
        },
      },
      {
        id: "comp-repo",
        name: "FruitPaymentRepository",
        elementType: "COMPONENT",
        technology: "JAVA_SPRING",
        parentId: "svc-payment",
        description: "Persists and retrieves application data",
        evidence: [],
        properties: {
          qualifiedName: "com.mekongfruit.payment.repository.FruitPaymentRepository",
          packageName: "com.mekongfruit.payment.repository",
          typeKind: "INTERFACE",
          umlClassifier: {
            name: "FruitPaymentRepository",
            qualifiedName: "com.mekongfruit.payment.repository.FruitPaymentRepository",
            packageName: "com.mekongfruit.payment.repository",
            typeKind: "INTERFACE",
            annotations: ["Repository"],
            members: [],
          },
        },
      },
      {
        id: "cls-entity",
        name: "PaymentRecord",
        elementType: "CLASS_INTERFACE",
        technology: "JAVA_SPRING",
        parentId: "svc-payment",
        description: null,
        evidence: [],
        properties: {
          qualifiedName: "com.mekongfruit.payment.entity.PaymentRecord",
          packageName: "com.mekongfruit.payment.entity",
          typeKind: "CLASS",
          umlClassifier: {
            name: "PaymentRecord",
            qualifiedName: "com.mekongfruit.payment.entity.PaymentRecord",
            packageName: "com.mekongfruit.payment.entity",
            typeKind: "CLASS",
            annotations: ["Entity"],
            members: [],
          },
        },
      },
    ],
    edges: [
      {
        id: "edge-ctrl-feign",
        from: "comp-controller",
        to: "cls-feign",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        resolutionStatus: "RESOLVED",
        evidence: [],
      },
      {
        id: "edge-ctrl-repo",
        from: "comp-controller",
        to: "comp-repo",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        resolutionStatus: "RESOLVED",
        evidence: [],
      },
      {
        id: "edge-ctrl-entity",
        from: "comp-controller",
        to: "cls-entity",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        resolutionStatus: "RESOLVED",
        evidence: [],
      },
      {
        id: "edge-repo-entity",
        from: "comp-repo",
        to: "cls-entity",
        protocol: "CODE_DEPENDENCY",
        originLayer: "STATIC",
        resolutionStatus: "RESOLVED",
        evidence: [],
      },
    ],
  };

  // 1. Verify C4_COMPONENT and C4_CONTAINER include NotificationFeignClient and its outbound target service
  const c3Selection = selectDiagram(model, "COMPONENT", "svc-payment");
  assert.ok(c3Selection.document, "C4 Component view for fruit-payment-service must be generated");
  const c3Nodes = c3Selection.document.layoutJson.nodes;
  const c3Edges = c3Selection.document.layoutJson.edges;

  const feignNode = c3Nodes.find((n) => n.id === "cls-feign");
  assert.ok(feignNode, "NotificationFeignClient must be present in C4 Component diagram");
  assert.equal(feignNode.kind, "COMPONENT");
  assert.equal(feignNode.languageStack, "Java / Spring Cloud Feign");
  assert.equal(feignNode.parentId, "svc-payment");

  const targetNode = c3Nodes.find((n) => n.name === "notification-service");
  assert.ok(targetNode, "Synthesized target service notification-service must be present outside C4 Component boundary");
  assert.ok(!targetNode.parentId, "External target service must sit outside the fruit-payment-service boundary");

  assert.ok(
    c3Edges.some((e) => e.from === "comp-controller" && e.to === "cls-feign"),
    "FruitPaymentController -> NotificationFeignClient edge must be rendered in C4 Component diagram",
  );
  assert.ok(
    c3Edges.some((e) => e.from === "cls-feign" && e.to === targetNode.id && e.type === "SERVICE_HTTP_CALL"),
    "NotificationFeignClient -> notification-service outbound HTTP call edge must be rendered in C4 Component diagram",
  );

  const c2Selection = selectDiagram(model, "CONTAINER");
  assert.ok(c2Selection.document, "C4 Container view must be generated");
  assert.ok(
    c2Selection.document.layoutJson.edges.some(
      (e) => e.from === "svc-payment" && e.to === targetNode.id && e.type === "SERVICE_HTTP_CALL",
    ),
    "Outbound HTTP call from NotificationFeignClient must aggregate to fruit-payment-service -> notification-service in C4 Container view",
  );

  // 2. Verify UML_PACKAGE prunes orphan root bootstrap package com.mekongfruit.payment
  const pkgProj = projectUmlPackageDiagram(model, { serviceId: "svc-payment" });
  const pkgNames = pkgProj.packages.map((p) => p.qualifiedName);
  assert.ok(
    !pkgNames.includes("com.mekongfruit.payment"),
    "Orphan bootstrap root package com.mekongfruit.payment (degree == 0) must be pruned from UML_PACKAGE",
  );
  assert.deepEqual(
    pkgNames.sort(),
    [
      "com.mekongfruit.payment.client",
      "com.mekongfruit.payment.controller",
      "com.mekongfruit.payment.entity",
      "com.mekongfruit.payment.repository",
    ],
  );
});

test("fruit-* UML_ACTIVITY: removes hardcoded FTGO labels, promotes project-specific multi-swimlane workflows to top, purges getters/setters/interfaces/main, and routes FLOW_FINAL/ACTIVITY_FINAL without box overlaps", () => {
  const { listActivityOperations } = require("../src/features/architecture/uml-diagrams.ts");
  const makeSvc = (id, name) => ({
    id,
    name,
    elementType: "SERVICE_CONTAINER",
    parentId: null,
    technology: "JAVA_SPRING",
    evidence: [],
    properties: {},
  });
  const makeClass = (id, parentId, name, typeKind, annotations, methodsCfg = [], members = []) => ({
    id,
    name,
    parentId,
    elementType: "CLASS_INTERFACE",
    technology: "JAVA_SPRING",
    evidence: [],
    properties: {
      typeKind,
      umlClassifier: {
        name,
        qualifiedName: `com.mekongfruit.${name}`,
        packageName: "com.mekongfruit",
        typeKind,
        annotations,
        methodsCfg,
        members,
      },
    },
  });

  const fruitModel = {
    id: "fruit-activity-benchmark",
    projectId: "proj-fruit",
    label: "fruit-microservices",
    elements: [
      makeSvc("gw", "api-gateway"),
      makeSvc("order", "fruit-order-service"),
      makeSvc("inventory", "fruit-inventory-service"),
      makeSvc("payment", "fruit-payment-service"),
      makeSvc("catalog", "fruit-catalog-service"),
      makeSvc("delivery", "fruit-delivery-service"),
      makeSvc("notification", "fruit-notification-service"),
      makeClass(
        "cls-order-app",
        "order",
        "FruitOrderApplication",
        "CLASS",
        ["SpringBootApplication"],
        [{ methodName: "main", signatureKey: "main(String[])", nodes: [{ id: "n1", kind: "INITIAL", label: "Start" }], edges: [] }],
      ),
      makeClass(
        "cls-order-entity",
        "order",
        "FruitOrder",
        "CLASS",
        ["Entity"],
        [
          { methodName: "getTotalAmount", signatureKey: "getTotalAmount()", nodes: [{ id: "n1", kind: "INITIAL", label: "Start" }], edges: [] },
          { methodName: "setOrderStatus", signatureKey: "setOrderStatus(String)", nodes: [{ id: "n1", kind: "INITIAL", label: "Start" }], edges: [] },
        ],
      ),
      makeClass(
        "cls-feign",
        "payment",
        "NotificationFeignClient",
        "INTERFACE",
        ["FeignClient"],
        [],
        [{ memberKind: "OPERATION", name: "sendPaymentReceiptNotification", signature: "sendPaymentReceiptNotification(Map)" }],
      ),
      makeClass(
        "cls-inv-ctrl",
        "inventory",
        "FruitInventoryController",
        "CLASS",
        ["RestController"],
        [
          {
            methodName: "reserveFruitStock",
            signatureKey: "reserveFruitStock(Map)",
            extractionCompleteness: "COMPLETE",
            nodes: [
              { id: "i1", kind: "INITIAL", label: "Start" },
              { id: "i2", kind: "DECISION", label: "stock >= qty" },
              { id: "i3", kind: "ACTIVITY_FINAL", label: "End" },
            ],
            edges: [
              { id: "e1", from: "i1", to: "i2", flowKind: "CONTROL_FLOW", guard: null },
              { id: "e2", from: "i2", to: "i3", flowKind: "CONTROL_FLOW", guard: "[inStock]" },
            ],
          },
        ],
      ),
      makeClass(
        "cls-del-ctrl",
        "delivery",
        "FruitDeliveryController",
        "CLASS",
        ["RestController"],
        [
          {
            methodName: "scheduleColdTruckDelivery",
            signatureKey: "scheduleColdTruckDelivery(Map)",
            extractionCompleteness: "COMPLETE",
            nodes: [
              { id: "d1", kind: "INITIAL", label: "Start" },
              { id: "d2", kind: "ACTIVITY_FINAL", label: "End" },
            ],
            edges: [{ id: "de1", from: "d1", to: "d2", flowKind: "CONTROL_FLOW", guard: null }],
          },
        ],
      ),
    ],
    edges: [
      { id: "e1", from: "gw", to: "order", protocol: "SERVICE_HTTP_CALL", uncertain: false, evidence: [] },
      { id: "e2", from: "order", to: "inventory", protocol: "SERVICE_HTTP_CALL", uncertain: false, evidence: [] },
      { id: "e3", from: "order", to: "payment", protocol: "SERVICE_HTTP_CALL", uncertain: false, evidence: [] },
      { id: "e4", from: "payment", to: "notification", protocol: "SERVICE_HTTP_CALL", uncertain: false, evidence: [] },
    ],
  };

  const ops = listActivityOperations(fruitModel);
  // 1. Multi-swimlane workflows promoted to the top & selected by default
  assert.ok(!ops[0].operationId.startsWith("flow:"), "Extracted method CFG takes priority over dependency illustrations");
  const defaultProj = projectUmlActivityDiagram(fruitModel);
  assert.equal(defaultProj.selectedOperationId, "cls-inv-ctrl::reserveFruitStock(Map)");
  assert.equal(defaultProj.partitions.length, 1);

  // 2. Getters, setters, main(), and FeignClient interface methods are purged from dropdown
  const opNames = ops.map((o) => `${o.classifierName}.${o.methodName}`);
  for (const forbidden of [
    "FruitOrder.getTotalAmount",
    "FruitOrder.setOrderStatus",
    "FruitOrderApplication.main",
    "NotificationFeignClient.sendPaymentReceiptNotification",
  ]) {
    assert.ok(!opNames.includes(forbidden), `Forbidden method ${forbidden} must be excluded from Activity dropdown`);
  }
  assert.ok(
    opNames.includes("FruitInventoryController.reserveFruitStock"),
    "Real service/controller method reserveFruitStock must remain in Activity dropdown",
  );

  // 3. Zero hardcoded FTGO strings in any fruit-* multi-swimlane workflow, and real project methods used
  for (const flowId of [
    "flow:business:create-order-flow",
    "flow:business:delivery-flow",
    "flow:business:cancel-order-flow",
    "flow:business:catalog-notification-flow",
  ]) {
    const proj = projectUmlActivityDiagram(fruitModel, { operationId: flowId });
    const xml = buildUmlDrawioXml(proj);
    assert.ok(
      !/Kitchen Ticket|beginCancelTicket|acceptTicket|already cooking|Menu & CQRS/i.test(xml),
      `Workflow ${flowId} must not leak FTGO restaurant/kitchen strings`,
    );
    if (proj.nodes.some((n) => n.kind === "FLOW_FINAL")) {
      assert.match(xml, /shape=sumEllipse/, `${flowId}: FLOW_FINAL must render with UML 2.5 sumEllipse (⊗)`);
    }

    // 4. Verify zero edges cut through non-endpoint activity boxes
    const attrs = (text) => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const cells = new Map(
      [...xml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].map((m) => {
        const a = attrs(m[1]);
        return [a.id, { a, body: m[2], g: attrs(m[2].match(/<mxGeometry\b([^>]*)/)[1]) }];
      }),
    );
    const boxes = proj.nodes.map((n) => {
      const g = cells.get(n.nodeId).g;
      const parent = cells.get(n.partitionId).g;
      return { id: n.nodeId, x: +g.x + +parent.x, y: +g.y + +parent.y, w: +g.width, h: +g.height };
    });
    for (const edge of proj.edges) {
      const cell = cells.get(edge.edgeId);
      const style = Object.fromEntries(cell.a.style.split(";").map((p) => p.split("=")));
      const sb = boxes.find((b) => b.id === edge.from);
      const tb = boxes.find((b) => b.id === edge.to);
      const points = [...cell.body.matchAll(/<mxPoint\b([^>]*)\/>/g)].map((m) => attrs(m[1]));
      const path = [
        { x: sb.x + sb.w * +style.exitX, y: sb.y + sb.h * +style.exitY },
        ...points.filter((p) => !p.as).map((p) => ({ x: +p.x, y: +p.y })),
        { x: tb.x + tb.w * +style.entryX, y: tb.y + tb.h * +style.entryY },
      ];
      for (let i = 1; i < path.length; i++) {
        for (const box of boxes) {
          if ((box === sb && i === 1) || (box === tb && i === path.length - 1)) continue;
          assert.ok(
            !deploymentSegmentHitsBox(path[i - 1], path[i], box, 0),
            `${flowId} edge ${edge.edgeId} must not cut through node box ${box.id}`,
          );
        }
      }
    }
  }
});

test("UML_STATE: dynamically discovers project-specific state machines from AST and separates terminal/back-edge ports", () => {
  const fruitStateModel = {
    id: "fruit-state-model",
    elements: [
      { id: "svc:order", kind: "SERVICE", name: "fruit-order-service", metadata: {} },
      { id: "svc:payment", kind: "SERVICE", name: "fruit-payment-service", metadata: {} },
      { id: "svc:delivery", kind: "SERVICE", name: "fruit-delivery-service", metadata: {} },
      {
        id: "comp:FruitOrder",
        kind: "COMPONENT",
        name: "FruitOrder",
        parentId: "svc:order",
        metadata: {
          umlClassifier: {
            qualifiedName: "com.mekongfruit.order.entity.FruitOrder",
            kind: "CLASS",
            stereotypes: ["Entity"],
            annotations: ["Entity"],
            members: [
              { kind: "ATTRIBUTE", name: "id", typeName: "Long" },
              { kind: "ATTRIBUTE", name: "orderStatus", typeName: "String" },
              { kind: "OPERATION", name: "getOrderStatus", returnType: "String", parameters: [] },
              {
                kind: "OPERATION",
                name: "setOrderStatus",
                returnType: "void",
                parameters: [{ name: "orderStatus", type: "String" }],
              },
            ],
          },
        },
      },
      {
        id: "comp:FruitOrderController",
        kind: "COMPONENT",
        name: "FruitOrderController",
        parentId: "svc:order",
        metadata: {
          umlClassifier: {
            qualifiedName: "com.mekongfruit.order.controller.FruitOrderController",
            kind: "CLASS",
            stereotypes: ["RestController"],
            members: [
              { kind: "OPERATION", name: "createOrder", returnType: "FruitOrder", parameters: [] },
              { kind: "OPERATION", name: "cancelOrder", returnType: "FruitOrder", parameters: [] },
            ],
          },
          methodsCfg: [
            {
              methodName: "createOrder",
              nodes: [
                { id: "n0", kind: "ENTRY", label: "createOrder()" },
                { id: "n1", kind: "STATEMENT", label: 'order.setOrderStatus("PENDING_PAYMENT")' },
                { id: "n2", kind: "CALL", label: "inventoryClient.reserveFruitStock()" },
                { id: "n3", kind: "DECISION", label: "paymentSucceeded" },
                { id: "n4", kind: "STATEMENT", label: 'order.setOrderStatus("CONFIRMED")' },
                { id: "n5", kind: "STATEMENT", label: 'order.setOrderStatus("PAYMENT_FAILED")' },
              ],
              edges: [],
            },
            {
              methodName: "cancelOrder",
              nodes: [
                { id: "c0", kind: "ENTRY", label: "cancelOrder()" },
                { id: "c1", kind: "DECISION", label: '"CONFIRMED".equals(order.getOrderStatus())' },
                { id: "c2", kind: "STATEMENT", label: 'order.setOrderStatus("CANCELLED")' },
              ],
              edges: [],
            },
          ],
        },
      },
      {
        id: "comp:FruitPaymentTransaction",
        kind: "COMPONENT",
        name: "FruitPaymentTransaction",
        parentId: "svc:payment",
        metadata: {
          umlClassifier: {
            qualifiedName: "com.mekongfruit.payment.entity.FruitPaymentTransaction",
            kind: "CLASS",
            stereotypes: ["Entity"],
            annotations: ["Entity"],
            members: [
              { kind: "ATTRIBUTE", name: "paymentStatus", typeName: "String" },
              {
                kind: "OPERATION",
                name: "setPaymentStatus",
                returnType: "void",
                parameters: [{ name: "paymentStatus", type: "String" }],
              },
            ],
          },
        },
      },
      {
        id: "comp:FruitPaymentService",
        kind: "COMPONENT",
        name: "FruitPaymentService",
        parentId: "svc:payment",
        metadata: {
          umlClassifier: {
            qualifiedName: "com.mekongfruit.payment.service.FruitPaymentService",
            kind: "CLASS",
            stereotypes: ["Service"],
            members: [
              { kind: "OPERATION", name: "processPayment", returnType: "FruitPaymentTransaction", parameters: [] },
            ],
          },
          methodsCfg: [
            {
              methodName: "processPayment",
              nodes: [
                { id: "p0", kind: "STATEMENT", label: 'tx.setPaymentStatus("PROCESSING")' },
                { id: "p1", kind: "DECISION", label: "amount <= limit" },
                { id: "p2", kind: "STATEMENT", label: 'tx.setPaymentStatus("COMPLETED")' },
                { id: "p3", kind: "STATEMENT", label: 'tx.setPaymentStatus("DECLINED")' },
              ],
              edges: [],
            },
          ],
        },
      },
      {
        id: "comp:ColdChainDeliveryController",
        kind: "COMPONENT",
        name: "ColdChainDeliveryController",
        parentId: "svc:delivery",
        metadata: {
          umlClassifier: {
            qualifiedName: "com.mekongfruit.delivery.controller.ColdChainDeliveryController",
            kind: "CLASS",
            stereotypes: ["RestController"],
            members: [
              { kind: "OPERATION", name: "scheduleDelivery", returnType: "Map", parameters: [] },
              { kind: "OPERATION", name: "completeDelivery", returnType: "Map", parameters: [] },
            ],
          },
          methodsCfg: [
            {
              methodName: "scheduleDelivery",
              nodes: [
                { id: "d0", kind: "STATEMENT", label: 'response.put("status", "COLD_TRUCK_SCHEDULED")' },
              ],
              edges: [],
            },
            {
              methodName: "completeDelivery",
              nodes: [
                { id: "d1", kind: "STATEMENT", label: 'response.put("status", "DELIVERED")' },
              ],
              edges: [],
            },
          ],
        },
      },
    ],
    edges: [],
    evidence: [],
  };

  const targets = listStateTargets(fruitStateModel);
  assert.ok(targets.length >= 3, "Must discover at least 3 state machines for fruit-* services");
  assert.ok(
    !targets.some((t) => /Kitchen Ticket/i.test(t.classifierName)),
    "Non-FTGO project must NEVER expose hardcoded Kitchen Ticket State Machine",
  );
  assert.ok(
    targets.some((t) => /FruitOrder State Machine/i.test(t.classifierName)),
    "Must discover FruitOrder State Machine",
  );
  assert.ok(
    targets.some((t) => /FruitPaymentTransaction State Machine/i.test(t.classifierName)),
    "Must discover FruitPaymentTransaction State Machine",
  );

  const orderTarget = targets.find((t) => /FruitOrder State Machine/i.test(t.classifierName));
  const orderProj = projectUmlStateDiagram(fruitStateModel, { targetElementId: orderTarget.targetId });
  const stateNames = orderProj.states.map((s) => s.name);
  assert.ok(stateNames.includes("PENDING_PAYMENT"), "FruitOrder must include PENDING_PAYMENT state");
  assert.ok(stateNames.includes("CONFIRMED"), "FruitOrder must include CONFIRMED state");
  assert.ok(stateNames.includes("CANCELLED"), "FruitOrder must include CANCELLED state");
  const orderXml = buildUmlDrawioXml(orderProj);
  assert.ok(
    !/TicketAcceptedEvent|verifyRestaurantMenu|releaseKitchenSlot/i.test(orderXml),
    "FruitOrder XML must not contain any hardcoded FTGO strings",
  );
  assert.match(orderXml, /entry \//, "States must render internal entry / compartment actions");
  assert.match(orderXml, /setOrderStatus/, "Transitions/entries must reference actual setOrderStatus mutator");

  // Verify Kitchen Ticket State Machine (when FTGO services exist) separates CANCELLED ports and routes undoCancel via L-path
  const ftgoModel = {
    id: "ftgo-state-model",
    elements: [
      { id: "svc:order", kind: "SERVICE", name: "ftgo-order-service", metadata: {} },
      { id: "svc:kitchen", kind: "SERVICE", name: "ftgo-kitchen-service", metadata: {} },
    ],
    edges: [{ id: "e1", source: "svc:order", target: "svc:kitchen", kind: "CALLS" }],
    evidence: [],
  };
  const kitchenProj = projectUmlStateDiagram(ftgoModel, { targetId: "state:entity:kitchen-ticket" });
  const kitchenXml = buildUmlDrawioXml(kitchenProj);
  const attrs = (text) => Object.fromEntries([...text.matchAll(/([\w]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const cells = new Map(
    [...kitchenXml.matchAll(/<mxCell\b([^>]*?)(?<!\/)>([\s\S]*?)<\/mxCell>/g)].map((m) => {
      const a = attrs(m[1]);
      return [a.id, { a, body: m[2], g: attrs((m[2].match(/<mxGeometry\b([^>]*)/) || ["", ""])[1]) }];
    }),
  );
  const cancelPendingId = kitchenProj.states.find((s) => s.name === "CANCEL_PENDING").stateId;
  const cancelledId = kitchenProj.states.find((s) => s.name === "CANCELLED").stateId;
  const awaitingId = kitchenProj.states.find((s) => s.name === "AWAITING_ACCEPTANCE").stateId;
  const finalId = kitchenProj.states.find((s) => s.kind === "FINAL_STATE").stateId;

  assert.ok(
    +cells.get(cancelledId).g.y > +cells.get(cancelPendingId).g.y,
    "Terminal sink CANCELLED must be tiered strictly below CANCEL_PENDING",
  );

  const cancelToFinalTr = kitchenProj.transitions.find(
    (t) => t.fromStateId === cancelledId && t.toStateId === finalId,
  );
  const cancelToFinalStyle = Object.fromEntries(
    cells.get(cancelToFinalTr.transitionId).a.style.split(";").map((p) => p.split("=")),
  );
  assert.equal(
    +cancelToFinalStyle.exitY,
    1,
    "CANCELLED -> FINAL_STATE must exit from the bottom face (exitY = 1) so it never collides with incoming ports",
  );

  const undoCancelTr = kitchenProj.transitions.find(
    (t) => t.fromStateId === cancelPendingId && t.toStateId === awaitingId,
  );
  const undoCancelStyle = Object.fromEntries(
    cells.get(undoCancelTr.transitionId).a.style.split(";").map((p) => p.split("=")),
  );
  assert.equal(+undoCancelStyle.exitY, 0, "undoCancel() must exit from top face of CANCEL_PENDING (exitY = 0)");
  assert.equal(+undoCancelStyle.entryX, 1, "undoCancel() must enter right face of AWAITING_ACCEPTANCE (entryX = 1)");
});
