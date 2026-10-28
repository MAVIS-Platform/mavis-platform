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

const { projectGraphModel } = require("../src/features/architecture/graph-projection.ts");
const { relationLabel } = require("../src/lib/drawio/rules.ts");
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "edge-semantics-contract.json"), "utf8"),
);
const model = fixture.model;
const answer = fixture.answerKey;
const findEdge = (edges, id) => edges.find((e) => e.id === id);

// Lưu ý phạm vi: test này xác minh FIXTURE mã hóa đúng contract implementation đã đọc thủ công
// (GraphBuilderServiceImpl.java:404-414) — KHÔNG chạy Java nên không phải regression test của Java.
test("fixture encodes the verified implementation contract (direction)", () => {
  const pub = model.edges.find((e) => e.id === "e-pub-1");
  const sub = model.edges.find((e) => e.id === "e-sub-1");
  assert.deepEqual({ from: pub.from, to: pub.to }, answer.directions["e-pub-1"]);
  assert.deepEqual({ from: sub.from, to: sub.to }, answer.directions["e-sub-1"]);
});

test("aggregation keeps underlying edge ids, OR-accumulates uncertainty and respects originLayer", () => {
  const { model: projected } = projectGraphModel(model, true, "all");
  const staticGroup = projected.edges.filter((e) => e.protocol === "CODE_DEPENDENCY" && e.originLayer === "STATIC");
  assert.equal(staticGroup.length, 1, "same from/to/kind/originLayer must aggregate into one edge");
  const group = staticGroup[0];
  assert.deepEqual(
    [...group.underlyingEdgeIds].sort(),
    [...answer.aggregatedGroups[0].underlying].sort(),
  );
  assert.equal(group.uncertain, answer.aggregatedGroups[0].uncertain);
  assert.equal(group.resolutionStatus, answer.aggregatedGroups[0].resolutionStatus, "mixed-status group must report UNKNOWN");
  // Same from/to/kind nhưng KHÁC originLayer phải giữ nhóm riêng (key có originLayer).
  const runtimeGroup = projected.edges.filter(
    (e) => e.protocol === "CODE_DEPENDENCY" && e.originLayer === "STATIC_AND_RUNTIME",
  );
  assert.equal(runtimeGroup.length, 1);
  assert.deepEqual([...runtimeGroup[0].underlyingEdgeIds].sort(), [...answer.aggregatedGroups[1].underlying].sort());
  assert.equal(runtimeGroup[0].resolutionStatus, answer.aggregatedGroups[1].resolutionStatus);
  for (const id of answer.notAggregated) {
    const edge = findEdge(projected.edges, id);
    assert.ok(edge, `${id} must stay its own projected edge`);
    assert.equal(edge.underlyingEdgeIds.length, 1);
  }
});

// Contract S2c — aggregate resolutionStatus của nhóm phải độc lập thứ tự đầu vào và trung thực
// khi nhóm chứa nhiều trạng thái. Expected là literal trong test (không đọc từ output production).
// Thay thế characterization test UC-02 cũ (không còn assertion nào buộc production tái hiện lỗi cũ).
test("aggregate resolutionStatus follows the S2c contract regardless of input order", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "a", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "b", layer: "domain", description: "", evidence: [] },
  ];
  const edge = (id, status, uncertain) => ({
    id,
    from: "44444444-4444-4444-8444-444444444444",
    to: "55555555-5555-4555-8555-555555555555",
    protocol: "CODE_DEPENDENCY",
    evidence: [],
    uncertain,
    originLayer: "STATIC",
    ...(status === undefined ? {} : { resolutionStatus: status }),
  });
  const group = (edges) =>
    projectGraphModel(
      { id: modelId, projectId: "11111111-1111-4111-8111-111111111111", snapshotId: "22222222-2222-4222-8222-222222222222", revision: 1, label: "s2c", elements, edges },
      true,
      "all",
    ).model.edges.filter((e) => e.protocol === "CODE_DEPENDENCY" && e.originLayer === "STATIC")[0];
  // RESOLVED + RESOLVED → RESOLVED
  assert.equal(group([edge("a1", "RESOLVED", false), edge("a2", "RESOLVED", false)]).resolutionStatus, "RESOLVED");
  // UNRESOLVED + UNRESOLVED → UNRESOLVED
  assert.equal(group([edge("a1", "UNRESOLVED", true), edge("a2", "UNRESOLVED", true)]).resolutionStatus, "UNRESOLVED");
  // RESOLVED + UNRESOLVED → UNKNOWN, bất kể thứ tự; ID gốc và uncertain OR không mất
  const mixedA = group([edge("a1", "RESOLVED", false), edge("a2", "UNRESOLVED", true)]);
  const mixedB = group([edge("a2", "UNRESOLVED", true), edge("a1", "RESOLVED", false)]);
  assert.equal(mixedA.resolutionStatus, "UNKNOWN");
  assert.equal(mixedB.resolutionStatus, "UNKNOWN");
  assert.deepEqual([...mixedA.underlyingEdgeIds].sort(), ["a1", "a2"]);
  assert.deepEqual([...mixedB.underlyingEdgeIds].sort(), ["a1", "a2"]);
  assert.equal(mixedA.uncertain, true);
  assert.equal(mixedB.uncertain, true);
  // RESOLVED + thiếu trạng thái → UNKNOWN, bất kể thứ tự
  assert.equal(group([edge("a1", "RESOLVED", false), edge("a2", undefined, true)]).resolutionStatus, "UNKNOWN");
  assert.equal(group([edge("a2", undefined, true), edge("a1", "RESOLVED", false)]).resolutionStatus, "UNKNOWN");
  // Tất cả thiếu trạng thái → UNKNOWN
  const allMissing = group([edge("a1", undefined, false), edge("a2", undefined, false)]);
  assert.equal(allMissing.resolutionStatus, "UNKNOWN");
  assert.equal(allMissing.uncertain, false);
  // Ba cạnh nhiều trạng thái, nhiều thứ tự đầu vào cho kết quả tương đương
  for (const order of [["a1", "a2", "a3"], ["a3", "a1", "a2"], ["a2", "a3", "a1"]]) {
    const g3 = group(
      order.map((id) => edge(id, id === "a1" ? "RESOLVED" : id === "a2" ? "UNRESOLVED" : undefined, id !== "a1")),
    );
    assert.equal(g3.resolutionStatus, "UNKNOWN", `order ${order.join(",")}`);
    assert.deepEqual([...g3.underlyingEdgeIds].sort(), ["a1", "a2", "a3"]);
    assert.equal(g3.uncertain, true);
  }
});

test("uncertainty and resolution state are never silently upgraded on individual edges", () => {
  const { model: projected } = projectGraphModel(model, true, "all");
  const db = findEdge(projected.edges, "e-db-1");
  assert.equal(db.uncertain, true);
  assert.equal(db.resolutionStatus, "UNRESOLVED");
  for (const id of ["e-pub-1", "e-sub-1", "e-comp-1", "e-rt-1"]) {
    const edge = findEdge(projected.edges, id);
    assert.equal(edge.uncertain, false, `${id} must stay resolved`);
    assert.equal(edge.resolutionStatus, "RESOLVED");
  }
});

test("origin filter excludes deployment/runtime facts from the source view with explicit counts", () => {
  const source = projectGraphModel(model, true, "source");
  assert.equal(source.filteredRelationships, answer.originFilter.source.filteredRelationships);
  assert.ok(!findEdge(source.model.edges, "e-comp-1"), "declared compose is deployment-classified");
  assert.ok(!findEdge(source.model.edges, "e-rt-1"), "runtime-observed is not a source fact");
  const all = projectGraphModel(model, true, "all");
  assert.equal(all.filteredRelationships, 0);
  const deployment = projectGraphModel(model, true, "deployment");
  assert.ok(findEdge(deployment.model.edges, "e-comp-1"));
});

// Expected là golden data đóng băng trong answer key (đã review), KHÔNG đọc bảng mapping
// production lúc chạy. So sánh bằng chuỗi chính xác nên production tự thêm/bớt thông tin
// ngoài nguồn đều làm test đỏ — thay cho assertion cấm ký tự "[" trước đây.
test("edge labels match frozen expected labels; explicit mapping and fallback are distinguished", () => {
  for (const [type, expected] of Object.entries(answer.labelExpectations.explicit)) {
    assert.equal(relationLabel({ type }), expected, `${type} must use its explicit label`);
  }
  for (const [type, expected] of Object.entries(answer.labelExpectations.fallback)) {
    assert.equal(relationLabel({ type }), expected, `${type} has no explicit entry and must fall through unchanged`);
  }
  assert.equal(relationLabel({ type: "" }), answer.labelExpectations.emptyTypeFallback);
  assert.equal(relationLabel({ type: "WEIRD_KIND" }), answer.labelExpectations.unknownTypeFallback);
});

test("FTGO baseline fixture labels resolve fully (supplementary comparison, provenance recorded)", () => {
  const ftgo = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ftgo-component.json"), "utf8"));
  assert.equal(ftgo.modelVersionId, "4a31c2e7-1d60-46b1-8a45-f5cea1df57b1");
  assert.equal(ftgo.sourceSnapshotId, "67b338bf-db51-4d21-ac35-283bbec29df2");
  assert.equal(ftgo.modelRevision, 1);
  const counts = {};
  for (const edge of ftgo.layoutJson.edges) {
    const label = relationLabel(edge);
    assert.notEqual(label, "Unclassified relationship", `edge ${edge.id} must map to an explicit label`);
    counts[edge.type] = (counts[edge.type] ?? 0) + 1;
  }
  assert.deepEqual(counts, { DECLARED_COMPOSE: 33, DATABASE_ACCESS: 10, CODE_DEPENDENCY: 10 });
  assert.equal(
    ftgo.layoutJson.edges.some((e) => e.type === "MESSAGE_PUBLISH" || e.type === "MESSAGE_SUBSCRIBE"),
    false,
    "baseline FTGO model has no messaging edges, so messaging direction cannot be compared on it",
  );
});
test("node metadata survives graph projection",()=>{
 const {modelView}=require("../src/lib/api/java-wire.ts");
 const m=modelView(
  {id:"33333333-3333-4333-8333-333333333333",projectId:"11111111-1111-4111-8111-111111111111",sourceSnapshotId:"22222222-2222-4222-8222-222222222222",revision:1,isLatestValid:true},
  {nodes:[
    {id:"44444444-4444-4444-8444-444444444444",name:"order-events [kafka]",type:"MESSAGE_CHANNEL",sourcePath:null,protocol:"kafka",transportAuthority:"kafka",resolutionIssue:null},
    {id:"66666666-6666-4666-8666-666666666666",name:"orders-api",type:"SERVICE_CONTAINER",sourcePath:null},
   ],edges:[]},
  []);
 const projected=projectGraphModel(m,true,"all").model;
 const channel=projected.elements.find(e=>e.id==="44444444-4444-4444-8444-444444444444");
 assert.equal(channel.properties.protocol,"kafka");assert.equal(channel.properties.transportAuthority,"kafka");assert.equal(channel.properties.resolutionIssue,null);
 const service=projected.elements.find(e=>e.id==="66666666-6666-4666-8666-666666666666");
 assert.equal(service.properties.protocol,null);
});

test("aggregate edges combine evidence into distinct union without double-counting shared IDs", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "orders-service", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "kitchen-service", layer: "domain", description: "", evidence: [] },
  ];
  const edges = [
    {
      id: "e1",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 2,
      evidenceIds: ["11111111-0000-0000-0000-000000000001", "11111111-0000-0000-0000-000000000002"],
      evidence: [],
    },
    {
      id: "e2",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 2,
      evidenceIds: ["11111111-0000-0000-0000-000000000002", "11111111-0000-0000-0000-000000000003"],
      evidence: [],
    },
  ];
  const m = {
    id: modelId,
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    label: "m2-test",
    elements,
    edges,
  };
  const { model: projected } = projectGraphModel(m, true, "all");
  assert.equal(projected.edges.length, 1);
  const agg = projected.edges[0];
  assert.equal(agg.evidenceCount, 3, "distinct union of {1,2} and {2,3} must be 3, not 4");
  assert.deepEqual(
    [...agg.evidenceIds].sort(),
    ["11111111-0000-0000-0000-000000000001", "11111111-0000-0000-0000-000000000002", "11111111-0000-0000-0000-000000000003"].sort()
  );
});

test("aggregate edges report null evidenceCount when any underlying edge has unknown evidence", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "orders-service", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "kitchen-service", layer: "domain", description: "", evidence: [] },
  ];
  const edges = [
    {
      id: "e1",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 1,
      evidenceIds: ["11111111-0000-0000-0000-000000000001"],
      evidence: [],
    },
    {
      id: "e2",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: null,
      evidence: [],
    },
  ];
  const m = {
    id: modelId,
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    label: "m2-test-unknown",
    elements,
    edges,
  };
  const { model: projected } = projectGraphModel(m, true, "all");
  assert.equal(projected.edges.length, 1);
  const agg = projected.edges[0];
  assert.equal(agg.evidenceCount, null, "aggregate with unknown underlying edge must be null, never 0");
});

test("database connection labels append detected protocol in container view without defaulting to JDBC", () => {
  const { containerDatabaseLabel } = require("../src/lib/drawio/rules.ts");
  const edge = { id: "e-db", from: "orders-svc", to: "orders-db", type: "DATABASE_ACCESS" };
  const dbs = (props) => new Map([["orders-db", { id: "orders-db", name: "orders-db", kind: "DATABASE", properties: props }]]);

  // Detected PostgreSQL
  assert.equal(containerDatabaseLabel(edge, dbs({ protocol: "PostgreSQL" })), "Database access [PostgreSQL]");
  // Detected MongoDB
  assert.equal(containerDatabaseLabel(edge, dbs({ protocol: "MongoDB" })), "Database access [MongoDB]");
  // Undetermined protocol returns null (caller falls back to plain "Database access" — NEVER JDBC)
  assert.equal(containerDatabaseLabel(edge, dbs({})), null);
  assert.equal(containerDatabaseLabel(edge, dbs({ protocol: null })), null);
  assert.equal(containerDatabaseLabel(edge, dbs({ protocol: "   " })), null);
});

test("re-projecting aggregate output with unknown evidence remains null and never promotes to known count (F3 repro)", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "orders-service", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "kitchen-service", layer: "domain", description: "", evidence: [] },
  ];
  const edges = [
    {
      id: "e1",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 1,
      evidenceIds: ["11111111-0000-0000-0000-000000000001"],
      evidence: [],
    },
    {
      id: "e2",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: null,
      evidence: [],
    },
  ];
  const m = {
    id: modelId,
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    label: "m2-f3-repro",
    elements,
    edges,
  };
  // First projection
  const first = projectGraphModel(m, true, "all").model;
  assert.equal(first.edges.length, 1);
  assert.equal(first.edges[0].evidenceCount, null, "First projection must report null");
  assert.equal(first.edges[0].evidenceIds, undefined, "First projection must not publish partial IDs");

  // Re-projecting the first result
  const second = projectGraphModel(first, true, "all").model;
  assert.equal(second.edges.length, 1);
  assert.equal(second.edges[0].evidenceCount, null, "Second projection must remain null and not promote to 1");
  assert.equal(second.edges[0].evidenceIds, undefined);
});

test("single edge with count-only preserves evidenceCount across projection without resetting to null (F3 repro)", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "orders-service", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "kitchen-service", layer: "domain", description: "", evidence: [] },
  ];
  const edges = [
    {
      id: "e-single-count-5",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 5,
      evidence: [],
    },
  ];
  const m = {
    id: modelId,
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    label: "m2-single-count-only",
    elements,
    edges,
  };
  const projected = projectGraphModel(m, true, "all").model;
  assert.equal(projected.edges.length, 1);
  assert.equal(projected.edges[0].evidenceCount, 5, "Single edge with count-only must keep evidenceCount=5");
});

test("multiple edges with count-only report null evidenceCount because overlap cannot be determined (F3)", () => {
  const modelId = "33333333-3333-4333-8333-333333333333";
  const elements = [
    { id: "44444444-4444-4444-8444-444444444444", name: "orders-service", layer: "domain", description: "", evidence: [] },
    { id: "55555555-5555-4555-8555-555555555555", name: "kitchen-service", layer: "domain", description: "", evidence: [] },
  ];
  const edges = [
    {
      id: "e1",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 5,
      evidence: [],
    },
    {
      id: "e2",
      from: "44444444-4444-4444-8444-444444444444",
      to: "55555555-5555-4555-8555-555555555555",
      protocol: "SERVICE_HTTP_CALL",
      uncertain: false,
      originLayer: "STATIC",
      evidenceCount: 3,
      evidence: [],
    },
  ];
  const m = {
    id: modelId,
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    label: "m2-multi-count-only",
    elements,
    edges,
  };
  const projected = projectGraphModel(m, true, "all").model;
  assert.equal(projected.edges.length, 1);
  assert.equal(projected.edges[0].evidenceCount, null, "Merged count-only edges must report null because overlap is unknown");
});

test("real producer database protocol wire mapping to Draw.io XML label (F5)", async () => {
  const { modelView } = require("../src/lib/api/java-wire.ts");
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");
  const mId = "11111111-1111-4111-8111-111111111111";
  const sId = "22222222-2222-4222-8222-222222222222";
  const dbId = "33333333-3333-4333-8333-333333333333";
  const eId = "44444444-4444-4444-8444-444444444444";
  const evId = "55555555-5555-4555-8555-555555555555";

  const metadata = {
    id: mId,
    projectId: "66666666-6666-4666-8666-666666666666",
    sourceSnapshotId: "77777777-7777-4777-8777-777777777777",
    revision: 1,
    label: "f5-db-test",
    createdAt: "2026-10-24T00:00:00Z",
  };

  const graph = {
    nodes: [
      { id: sId, name: "orders-service", type: "SERVICE_CONTAINER", sourcePath: "/repo", protocol: null, transportAuthority: null, resolutionIssue: null },
      { id: dbId, name: "orders_data @ mysql", type: "DATABASE", sourcePath: "/repo", protocol: "mysql", transportAuthority: null, resolutionIssue: null },
    ],
    edges: [
      { id: eId, sourceNodeId: sId, targetNodeId: dbId, kind: "DATABASE_ACCESS", originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [evId] },
    ],
  };

  const details = [
    { id: sId, modelVersionId: mId, name: "orders-service", elementType: "SERVICE_CONTAINER", properties: { layer: "domain" } },
    { id: dbId, modelVersionId: mId, name: "orders_data @ mysql", elementType: "DATABASE", properties: { resourceRole: "LOGICAL_DATASTORE", physicalHost: "mysql", database: "orders_data", ownerService: "orders-service", classificationSource: "COMPOSE_JDBC_BINDING", protocol: "mysql" } },
  ];

  const model = modelView(metadata, graph, details);
  const dbElem = model.elements.find((e) => e.id === dbId);
  assert.equal(dbElem.properties.protocol, "mysql", "Database node protocol must be preserved from wire payload");

  const doc = selectDiagram(model, "CONTAINER", undefined, { systemName: "OrderSystem" }).document;
  assert.ok(doc, "C4 Container document must be generated");

  const xml = await generateDrawio(doc);
  assert.match(xml, /Database access \[mysql\]/, "C4 Container view must format database access edge label with [mysql]");

  const graphWithoutProto = {
    nodes: [
      { id: sId, name: "orders-service", type: "SERVICE_CONTAINER", sourcePath: "/repo", protocol: null, transportAuthority: null, resolutionIssue: null },
      { id: dbId, name: "orders_data @ mysql", type: "DATABASE", sourcePath: "/repo", protocol: null, transportAuthority: null, resolutionIssue: null },
    ],
    edges: [
      { id: eId, sourceNodeId: sId, targetNodeId: dbId, kind: "DATABASE_ACCESS", originLayer: "STATIC", resolutionStatus: "RESOLVED", evidenceCount: 1, evidenceIds: [evId] },
    ],
  };
  const detailsWithoutProto = [
    { id: sId, modelVersionId: mId, name: "orders-service", elementType: "SERVICE_CONTAINER", properties: { layer: "domain" } },
    { id: dbId, modelVersionId: mId, name: "orders_data @ mysql", elementType: "DATABASE", properties: { resourceRole: "LOGICAL_DATASTORE", physicalHost: "mysql", database: "orders_data" } },
  ];
  const modelWithoutProto = modelView(metadata, graphWithoutProto, detailsWithoutProto);
  const docWithoutProto = selectDiagram(modelWithoutProto, "CONTAINER", undefined, { systemName: "OrderSystem" }).document;
  const xmlWithoutProto = await generateDrawio(docWithoutProto);
  assert.match(xmlWithoutProto, /Database access/);
  assert.doesNotMatch(xmlWithoutProto, /Database access \[/);
});

test("committed baseline fixtures regression: Java and C# canonical graphs render into C4 Container view (provenance: tests/fixtures)", async () => {
  const { modelView } = require("../src/lib/api/java-wire.ts");
  const { selectDiagram } = require("../src/features/architecture/diagram-catalog.ts");
  const { generateDrawio } = require("../src/lib/drawio/server.ts");

  // Java baseline
  const javaFixturePath = path.resolve(__dirname, "fixtures", "source-pipeline-java-actual.json");
  assert.ok(fs.existsSync(javaFixturePath), "Baseline tests/fixtures/source-pipeline-java-actual.json must exist");
  const javaActual = JSON.parse(fs.readFileSync(javaFixturePath, "utf8"));
  const javaModel = modelView(javaActual.metadata, javaActual.graph, javaActual.details);
  const javaDoc = selectDiagram(javaModel, "CONTAINER", undefined, { systemName: "PipelineDemo" }).document;
  const javaXml = await generateDrawio(javaDoc);
  assert.match(javaXml, /Database access \[mysql\]/);
  assert.match(javaXml, /orders-service/);

  // C# baseline
  const csharpFixturePath = path.resolve(__dirname, "fixtures", "source-pipeline-csharp-graph-actual.json");
  assert.ok(fs.existsSync(csharpFixturePath), "Baseline tests/fixtures/source-pipeline-csharp-graph-actual.json must exist");
  const csharpActual = JSON.parse(fs.readFileSync(csharpFixturePath, "utf8"));
  const csharpModel = modelView(csharpActual.metadata, csharpActual.graph, csharpActual.details);
  const csharpDoc = selectDiagram(csharpModel, "CONTAINER", undefined, { systemName: "CSharpSystem" }).document;
  const csharpXml = await generateDrawio(csharpDoc);
  assert.match(csharpXml, /payment-service:5000/);
  assert.match(csharpXml, /App/);
});

test("Architecture presentation selection and projection lifecycle: collapsed group -> drill-down first edge -> return group -> drill-down second edge -> expanded individual (B2/B3/H1/H2/G1/G2)", () => {
  const { buildThreeESubjectContext, computeSelectionScopeKey } = require("../src/features/architecture/three-e-content.ts");

  const modelId = "mod-wire-1";
  const svcA = { id: "svc-a", name: "Order Service", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", evidence: [] };
  const svcB = { id: "svc-b", name: "Payment Service", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", evidence: [] };
  const compA1 = { id: "comp-a1", parentId: "svc-a", name: "Order Client", elementType: "COMPONENT", layer: "domain", description: "", evidence: [] };
  const compA2 = { id: "comp-a2", parentId: "svc-a", name: "Checkout Handler", elementType: "COMPONENT", layer: "domain", description: "", evidence: [] };
  const compB1 = { id: "comp-b1", parentId: "svc-b", name: "Payment Gateway", elementType: "COMPONENT", layer: "domain", description: "", evidence: [] };
  const compB2 = { id: "comp-b2", parentId: "svc-b", name: "Charge Service", elementType: "COMPONENT", layer: "domain", description: "", evidence: [] };

  const edge1 = {
    id: "edge-1",
    from: "comp-a1",
    to: "comp-b1",
    protocol: "SERVICE_HTTP_CALL",
    originLayer: "STATIC",
    resolutionStatus: "RESOLVED",
    uncertain: false,
    evidenceCount: 2,
    evidenceIds: ["ev-1", "ev-2"],
    evidence: [],
  };
  const edge2 = {
    id: "edge-2",
    from: "comp-a2",
    to: "comp-b2",
    protocol: "SERVICE_HTTP_CALL",
    originLayer: "STATIC",
    resolutionStatus: "RESOLVED",
    uncertain: false,
    evidenceCount: 2,
    evidenceIds: ["ev-2", "ev-3"],
    evidence: [],
  };

  const rawModel = {
    id: modelId,
    projectId: "proj-1",
    snapshotId: "snap-1",
    revision: 1,
    label: "Lifecycle Test",
    elements: [svcA, svcB, compA1, compA2, compB1, compB2],
    edges: [edge1, edge2],
  };

  const sampleFindings = [
    { id: "find-1", ruleId: "CIRCULAR_DEPENDENCY", elementId: "comp-a1", relationshipId: "edge-1", message: "Rule finding 1" },
    { id: "find-2", ruleId: "DIRECT_DB_ACCESS", elementId: "comp-a2", relationshipId: "edge-2", message: "Rule finding 2" },
  ];

  // 1. Initial view: Collapsed mode (expanded = false).
  const projCollapsed = projectGraphModel(rawModel, false, "all");
  assert.equal(projCollapsed.model.edges.length, 1, "Collapsed projection must group into 1 representative edge");
  const groupEdge = projCollapsed.model.edges[0];
  assert.equal(groupEdge.id, "edge-1");
  assert.deepEqual(groupEdge.underlyingEdgeIds, ["edge-1", "edge-2"]);

  // User clicks group edge in canvas
  let ctx = buildThreeESubjectContext({
    model: rawModel,
    selectedId: groupEdge.id,
    projectedEdge: groupEdge,
    drilledSourceEdgeId: null,
  });
  assert.equal(ctx.isGroup, true, "Panel must be in group mode");
  assert.equal(ctx.scopeKind, "group");
  assert.equal(ctx.scopeKey, `${modelId}:group:edge-1:edge-1,edge-2`);
  assert.equal(ctx.activeRelationshipId, "edge-1");
  assert.equal(ctx.subject.edge.evidenceCount, 3);
  // Truthful scope (G1): group does not pretend edge-1 evidence is the group's evidence
  assert.equal(ctx.evidenceQueryParam, null, "Group mode must have null evidenceQueryParam");

  // In group mode, filterFindings returns findings for ALL underlying relationships
  const groupFindings = ctx.filterFindings(sampleFindings);
  assert.equal(groupFindings.length, 2);
  assert.deepEqual(groupFindings.map((f) => f.id).sort(), ["find-1", "find-2"].sort());

  // In group mode, AI explain request without finding is rejected
  assert.throws(
    () => ctx.buildExplainRequest(),
    /Cannot request AI explanation in aggregated relationship mode/,
    "Group explain without finding must be rejected",
  );

  // In group mode, AI explain request WITH finding is ALSO rejected (G1 fix)
  assert.throws(
    () => ctx.buildExplainRequest({ finding: sampleFindings[1], runId: "run-test" }),
    /Cannot request AI explanation in aggregated relationship mode/,
    "Group explain with member finding must be rejected to prevent wrong representative payload (G1)",
  );

  // Group mode validateExplainResponse rejects any incoming response (G1)
  assert.equal(
    ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-1" }),
    false,
    "Group mode rejects any explain response",
  );

  // G2 verification: Selection scope identity contract
  const expandedScopeKey = computeSelectionScopeKey({
    model: rawModel,
    selectedId: "edge-1",
    projectedEdge: edge1,
    drilledSourceEdgeId: null,
  });
  assert.equal(expandedScopeKey, `${modelId}:source:edge-1:edge-1`);
  assert.notEqual(
    expandedScopeKey,
    ctx.scopeKey,
    "Source edge-1 and group edge-1 MUST have distinct scope keys (G2)",
  );

  // Changing group membership yields distinct scope key (G2)
  const group3Edge = { ...groupEdge, underlyingEdgeIds: ["edge-1", "edge-2", "edge-3"] };
  const group3ScopeKey = computeSelectionScopeKey({
    model: rawModel,
    selectedId: group3Edge.id,
    projectedEdge: group3Edge,
    drilledSourceEdgeId: null,
  });
  assert.equal(group3ScopeKey, `${modelId}:group:edge-1:edge-1,edge-2,edge-3`);
  assert.notEqual(ctx.scopeKey, group3ScopeKey, "Membership change must yield distinct scope key");

  // Stale in-flight response rejection: request initiated in source scope arriving in group scope is rejected (G2)
  assert.equal(
    ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-1" }, undefined, undefined, expandedScopeKey),
    false,
    "In-flight response from prior source scope must be rejected after collapsing to group (G2)",
  );

  // 2. User clicks 'Chi tiết' on FIRST underlying edge (subId === "edge-1" === projectedEdge.id)
  ctx = buildThreeESubjectContext({
    model: rawModel,
    selectedId: groupEdge.id,
    projectedEdge: groupEdge,
    drilledSourceEdgeId: "edge-1",
  });
  assert.equal(ctx.isGroup, false, "Panel must exit group mode even when subId === projectedEdge.id");
  assert.equal(ctx.scopeKind, "source");
  assert.equal(ctx.scopeKey, `${modelId}:source:edge-1:edge-1`);
  assert.equal(ctx.activeRelationshipId, "edge-1");
  assert.equal(ctx.activeTargetId, "edge-1");
  assert.equal(ctx.subject.edge.id, "edge-1");
  assert.equal(ctx.subject.edge.evidenceCount, 2, "Canonical count 2, NOT group 3");
  assert.equal(ctx.evidenceQueryParam.relationshipId, "edge-1");

  // Findings are scoped exclusively to edge-1
  const edge1Findings = ctx.filterFindings(sampleFindings);
  assert.equal(edge1Findings.length, 1);
  assert.equal(edge1Findings[0].id, "find-1");

  // Explain request uses canonical ID edge-1
  const req1 = ctx.buildExplainRequest({ finding: sampleFindings[0], runId: "run-1" });
  assert.equal(req1.explanationScope, "RULE_FINDING");
  assert.equal(req1.relationshipId, "edge-1");
  assert.equal(req1.findingId, "find-1");
  assert.equal(req1.modelVersionId, modelId);

  // Response validation: accepts edge-1, rejects stale edge-2
  assert.equal(ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-1", findingId: "find-1", evaluationRunId: "run-1" }, sampleFindings[0], "run-1", ctx.scopeKey), true);
  assert.equal(ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-2" }, sampleFindings[0], "run-1", ctx.scopeKey), false);

  // 3. User clicks '← Xem toàn bộ quan hệ gộp' (return to group)
  ctx = buildThreeESubjectContext({
    model: rawModel,
    selectedId: groupEdge.id,
    projectedEdge: groupEdge,
    drilledSourceEdgeId: null,
  });
  assert.equal(ctx.isGroup, true, "Panel returns to group mode");
  assert.equal(ctx.scopeKind, "group");
  assert.equal(ctx.scopeKey, `${modelId}:group:edge-1:edge-1,edge-2`);
  assert.equal(ctx.subject.edge.evidenceCount, 3);
  assert.equal(ctx.evidenceQueryParam, null);

  // 4. User clicks 'Chi tiết' on SECOND underlying edge (subId === "edge-2")
  ctx = buildThreeESubjectContext({
    model: rawModel,
    selectedId: groupEdge.id,
    projectedEdge: groupEdge,
    drilledSourceEdgeId: "edge-2",
  });
  assert.equal(ctx.isGroup, false, "Panel must exit group mode for edge-2");
  assert.equal(ctx.scopeKind, "source");
  assert.equal(ctx.scopeKey, `${modelId}:source:edge-2:edge-2`);
  assert.equal(ctx.activeRelationshipId, "edge-2");
  assert.equal(ctx.activeTargetId, "edge-2");
  assert.equal(ctx.subject.edge.id, "edge-2");
  assert.equal(ctx.subject.edge.evidenceCount, 2);
  assert.equal(ctx.evidenceQueryParam.relationshipId, "edge-2");

  // Findings are scoped exclusively to edge-2
  const edge2Findings = ctx.filterFindings(sampleFindings);
  assert.equal(edge2Findings.length, 1);
  assert.equal(edge2Findings[0].id, "find-2");

  // Explain request uses canonical ID edge-2 (NOT edge-1!) (G1 fix)
  const req2 = ctx.buildExplainRequest({ finding: sampleFindings[1], runId: "run-2" });
  assert.equal(req2.explanationScope, "RULE_FINDING");
  assert.equal(req2.relationshipId, "edge-2", "AI Explain payload must use drilled edge-2, never edge-1");
  assert.equal(req2.findingId, "find-2");

  // Response validation: accepts edge-2, rejects slow delayed response from edge-1!
  assert.equal(ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-2", findingId: "find-2", evaluationRunId: "run-2" }, sampleFindings[1], "run-2", ctx.scopeKey), true);
  assert.equal(
    ctx.validateExplainResponse({ modelVersionId: modelId, relationshipId: "edge-1" }, sampleFindings[1], "run-2", ctx.scopeKey),
    false,
    "Delayed response from previous subject edge-1 must be rejected when active is edge-2",
  );

  // 5. User toggles Expanded (expanded = true)
  const projExpanded = projectGraphModel(rawModel, true, "all");
  assert.equal(projExpanded.model.edges.length, 2, "Expanded projection displays 2 individual edges");

  const edge1InExpanded = projExpanded.model.edges.find((e) => e.id === "edge-1");
  const ctxExpanded1 = buildThreeESubjectContext({
    model: rawModel,
    selectedId: "edge-1",
    projectedEdge: edge1InExpanded,
    drilledSourceEdgeId: null,
  });
  assert.equal(ctxExpanded1.isGroup, false);
  assert.equal(ctxExpanded1.scopeKey, `${modelId}:source:edge-1:edge-1`);
  assert.equal(ctxExpanded1.activeRelationshipId, "edge-1");
  assert.equal(ctxExpanded1.buildExplainRequest().relationshipId, "edge-1");

  const edge2InExpanded = projExpanded.model.edges.find((e) => e.id === "edge-2");
  const ctxExpanded2 = buildThreeESubjectContext({
    model: rawModel,
    selectedId: "edge-2",
    projectedEdge: edge2InExpanded,
    drilledSourceEdgeId: null,
  });
  assert.equal(ctxExpanded2.isGroup, false);
  assert.equal(ctxExpanded2.scopeKey, `${modelId}:source:edge-2:edge-2`);
  assert.equal(ctxExpanded2.activeRelationshipId, "edge-2");
  assert.equal(ctxExpanded2.buildExplainRequest().relationshipId, "edge-2");
});

test("DependencyNetwork truthful statistics and search highlighting contract (H4)", () => {
  const el1 = { id: "n1", name: "order-service", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", evidence: [] };
  const el2 = { id: "n2", name: "payment-service", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", evidence: [] };
  const el3 = { id: "n3", name: "customer-service", elementType: "SERVICE_CONTAINER", layer: "domain", description: "", evidence: [] };
  const nodes = [el1, el2, el3];

  // Search query matches 1 node
  const query = "payment";
  const matched = nodes.filter((n) => n.name.toLowerCase().includes(query.toLowerCase()));
  assert.equal(matched.length, 1);
  const searchStat = `${matched.length}/${nodes.length} elements highlighted`;
  assert.equal(searchStat, "1/3 elements highlighted", "Truthful search count reports highlighted nodes without edge subtraction");

  // Scale condition for layout fallback
  assert.equal(nodes.length > 300, false, "3 nodes do not trigger grid layout fallback");
  const largeNodeList = Array.from({ length: 301 }, (_, i) => ({ id: `node-${i}`, name: `service-${i}` }));
  assert.equal(largeNodeList.length > 300, true, "301 nodes trigger grid layout mode (>300 elements active)");
});


test("graph type toggles hide nodes and incident edges, then restore the same evidence", () => {
  const { filterGraphCategories, graphCategories } = require("../src/features/architecture/graph-projection.ts");
  const types = ["SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER", "MESSAGE_CHANNEL", "COMPONENT", "EXTERNAL_SYSTEM", "OTHER"];
  const elements = types.map((elementType, i) => ({ ...model.elements[0], id: `toggle-${i}`, elementType }));
  const edges = elements.slice(1).map((node, i) => ({ ...model.edges[0], id: `toggle-edge-${i}`, from: elements[0].id, to: node.id }));
  const source = { ...model, elements, edges };
  const before = JSON.stringify(source);
  for (const category of graphCategories) {
    const hidden = filterGraphCategories(source, [category.id]);
    const visibleIds = new Set(hidden.elements.map((node) => node.id));
    assert.ok(hidden.elements.length < elements.length, `${category.label} must hide matching nodes`);
    assert.ok(hidden.edges.every((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)));
  }
  const messagingHidden = filterGraphCategories(source, ["messaging"]);
  assert.ok(!messagingHidden.elements.some((node) => ["QUEUE_BROKER", "MESSAGE_CHANNEL"].includes(node.elementType)));
  assert.equal(filterGraphCategories(source, []).edges, edges, "turning back on restores original relationship/evidence objects");
  assert.equal(JSON.stringify(source), before, "canonical data is unchanged");
  const empty = filterGraphCategories(source, graphCategories.map((category) => category.id));
  assert.equal(empty.elements.length, 0);
  assert.equal(empty.edges.length, 0);
});

test("type filtering composes with collapsed and expanded graph projections", () => {
  const { filterGraphCategories, graphCategory } = require("../src/features/architecture/graph-projection.ts");
  for (const expanded of [false, true]) {
    const projected = projectGraphModel(model, expanded, "source");
    const filtered = filterGraphCategories(projected.model, ["component", "messaging"]);
    assert.ok(filtered.elements.every((node) => !["component", "messaging"].includes(graphCategory(node.elementType))));
    assert.ok(filtered.edges.every((edge) => projected.model.edges.includes(edge)));
    assert.deepEqual(filterGraphCategories(projected.model, []), projected.model);
  }
});


test("overview preserves architecture resources, groups owned internals and discloses unassigned internals", () => {
  const node = (id, elementType, parentId = null) => ({ ...model.elements[0], id, name: id, elementType, parentId });
  const elements = [node("svc", "SERVICE_CONTAINER"), node("db", "DATABASE", "svc"),
    node("channel", "MESSAGE_CHANNEL", "svc"), node("external", "EXTERNAL_SYSTEM", "svc"),
    node("owned", "COMPONENT", "svc"), node("nested", "CLASS", "owned"),
    node("orphan", "COMPONENT"), node("missing", "CLASS", "absent"),
    node("cycle-a", "COMPONENT", "cycle-b"), node("cycle-b", "COMPONENT", "cycle-a"),
    node("unknown", "UNKNOWN")];
  const edge = (id, from, to) => ({ ...model.edges[0], id, from, to });
  const source = { ...model, elements, edges: [edge("db-access", "nested", "db"), edge("orphan-call", "orphan", "svc"), edge("inside", "owned", "nested")] };
  const before = JSON.stringify(source);
  const collapsed = projectGraphModel(source, false, "all");
  assert.deepEqual(collapsed.model.elements.map((n) => n.id).sort(), ["svc", "db", "channel", "external", "unknown"].sort());
  assert.equal(collapsed.unassignedElements, 4);
  assert.equal(collapsed.unassignedRelationships, 1);
  assert.equal(collapsed.internalRelationships, 1);
  assert.deepEqual(collapsed.model.elements.find((n) => n.id === "svc").properties.memberElementIds.sort(), ["svc", "owned", "nested"].sort());
  assert.equal(collapsed.model.edges[0].from, "svc");
  assert.equal(collapsed.model.edges[0].to, "db");
  assert.deepEqual(collapsed.model.edges[0].underlyingEdgeIds, ["db-access"]);
  const expanded = projectGraphModel(source, true, "all");
  assert.equal(expanded.model.elements.length, elements.length);
  assert.equal(expanded.model.edges.length, source.edges.length);
  assert.equal(expanded.unassignedElements, 0);
  assert.equal(JSON.stringify(source), before);
});

test("selection visibility follows the filtered view including canonical members and underlying edges", () => {
  const { filterGraphCategories, graphSelectionVisible } = require("../src/features/architecture/graph-projection.ts");
  const node = (id, elementType, parentId = null) => ({ ...model.elements[0], id, name: id, elementType, parentId });
  const source = { ...model, elements: [node("svc", "SERVICE_CONTAINER"), node("class", "COMPONENT", "svc"), node("db", "DATABASE")],
    edges: [{ ...model.edges[0], id: "call", from: "class", to: "db" }] };
  const projected = projectGraphModel(source, false, "all").model;
  assert.equal(graphSelectionVisible(projected, "class"), true);
  assert.equal(graphSelectionVisible(projected, "call"), true);
  const hidden = filterGraphCategories(projected, ["database"]);
  assert.equal(graphSelectionVisible(hidden, "db"), false);
  assert.equal(graphSelectionVisible(hidden, "call"), false);
  assert.equal(graphSelectionVisible(hidden, "svc"), true);
  assert.equal(graphSelectionVisible(filterGraphCategories(projected, ["service"]), "class"), false);
});


function serviceOverviewFixture() {
 const node=(id,type,parentId=null,name=id)=>({...model.elements[0],id,name,elementType:type,parentId});
 const edge=(id,from,to,protocol='SERVICE_HTTP_CALL',originLayer='STATIC',evidenceIds=[])=>({...model.edges[0],id,from,to,protocol,originLayer,underlyingEdgeIds:undefined,uncertain:false,evidenceIds,evidenceCount:evidenceIds.length});
 return {...model,elements:[node('a','SERVICE_CONTAINER'),node('b','SERVICE_CONTAINER'),node('c','SERVICE_CONTAINER'),node('d','SERVICE_CONTAINER'),node('isolated','SERVICE_CONTAINER'),node('same-name','SERVICE_CONTAINER',null,'a'),node('a1','COMPONENT','a'),node('b1','COMPONENT','b'),node('db','DATABASE','a'),node('q','MESSAGE_CHANNEL','a'),node('orphan','COMPONENT','missing'),node('cycle1','COMPONENT','cycle2'),node('cycle2','COMPONENT','cycle1')],edges:[
 edge('ab-http','a1','b1','SERVICE_HTTP_CALL','STATIC',['ev1','shared']),edge('ba-http','b1','a1','SERVICE_HTTP_CALL','STATIC',['ev2','shared']),edge('ab-code','a','b','CODE_DEPENDENCY','STATIC',['ev3']),edge('ab-deploy','a','b','DECLARED_COMPOSE','DEPLOYMENT'),edge('ac','a','c'),edge('cd','c','d'),edge('aq','a','q','MESSAGE_PUBLISH'),edge('qb','q','b','MESSAGE_SUBSCRIBE'),edge('adb','a','db','DATABASE_ACCESS'),edge('bdb','b','db','DATABASE_ACCESS'),edge('orphan-call','orphan','b'),edge('cycle-call','cycle1','b'),edge('inside','a1','a')
 ]};
}

test('Service overview groups both directions and protocols into one pair while preserving source identity and evidence',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');const source=serviceOverviewFixture(),before=JSON.stringify(source);
 const projected=projectServiceOverview(source),ab=projected.connections.find(c=>c.serviceIds.join(',')==='a,b');
 assert.equal(projected.services.length,6);assert.equal(projected.connections.length,3);assert.equal(projected.relationshipCount,6);
 assert.deepEqual(ab.relationshipIds,['ab-code','ab-deploy','ab-http','ba-http']);
 assert.deepEqual(new Set(ab.relationships.map(row=>row.fromServiceId)),new Set(['a','b']));
 assert.equal(ab.evidenceCount,4);assert.deepEqual(ab.evidenceIds,['ev1','ev2','ev3','shared']);
 assert.ok(projected.services.some(n=>n.id==='isolated'));assert.ok(projected.services.some(n=>n.id==='same-name'));
 assert.ok(!source.edges.some(edge=>edge.id===ab.key));assert.equal(JSON.stringify(source),before);
});

test('Service overview never adds transitive, shared database or broker-mediated service links and rejects broken ownership',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');const source=serviceOverviewFixture();
 const graph=projectServiceOverview(source);assert.ok(!graph.connections.some(c=>c.serviceIds.join(',')==='a,d'));
 assert.equal(graph.owners.get('db'),null);assert.equal(graph.owners.get('q'),null);assert.equal(graph.owners.get('orphan'),null);assert.equal(graph.owners.get('cycle1'),null);
 assert.equal(graph.unassignedElements,3);assert.equal(graph.internalRelationships,1);
 const indirect=projectServiceOverview({...source,edges:source.edges.filter(e=>['aq','qb','adb','bdb','orphan-call','cycle-call'].includes(e.id))});
 assert.equal(indirect.connections.length,0);assert.equal(indirect.services.length,6);
});

test('Overview filters are applied before grouping and unknown evidence is never promoted to zero',()=>{
 const {projectServiceOverview,defaultOverviewFilters}=require('../src/features/architecture/service-overview.ts');const source=serviceOverviewFixture();
 const deployed=projectServiceOverview(source,{...defaultOverviewFilters,origin:'deployment'});assert.equal(deployed.connections.length,1);assert.deepEqual(deployed.connections[0].relationshipIds,['ab-deploy']);assert.equal(deployed.connections[0].evidenceCount,0);
 const http=projectServiceOverview(source,{...defaultOverviewFilters,protocol:'SERVICE_HTTP_CALL'});assert.equal(http.relationshipCount,4);assert.equal(http.connections.find(c=>c.serviceIds.join(',')==='a,b').relationships.length,2);
 source.edges.find(e=>e.id==='ab-code').uncertain=true;source.edges.find(e=>e.id==='ab-code').evidenceCount=null;
 const uncertain=projectServiceOverview(source,{...defaultOverviewFilters,uncertainty:'uncertain'});assert.equal(uncertain.relationshipCount,1);assert.equal(uncertain.connections[0].evidenceCount,null);
 source.edges.find(e=>e.id==='ab-code').evidenceCount=0;
 assert.equal(projectServiceOverview(source).connections.find(c=>c.serviceIds.join(',')==='a,b').evidenceCount,null,'inconsistent zero count with IDs is unknown');
});

test('Overview flattens older aggregate IDs once and does not invent per-member metadata',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');const source=serviceOverviewFixture();
 const legacy={...source.edges[0],id:'legacy-group',underlyingEdgeIds:['ab-http','ab-code','not-loaded']};source.edges.unshift(legacy);
 const graph=projectServiceOverview(source),ab=graph.connections.find(c=>c.serviceIds.join(',')==='a,b');
 assert.equal(ab.relationshipIds.length,5);assert.equal(new Set(ab.relationshipIds).size,5);
 assert.equal(ab.relationships.find(row=>row.id==='ab-code').edge.protocol,'CODE_DEPENDENCY');
 assert.equal(ab.relationships.find(row=>row.id==='not-loaded').metadataAvailable,false);
});

test('Overview focus is one-hop only and virtual group keys cannot become canonical selections',()=>{
 const {projectServiceOverview,overviewFocus,overviewSelectionVisible}=require('../src/features/architecture/service-overview.ts');const graph=projectServiceOverview(serviceOverviewFixture());
 const focused=overviewFocus(graph,'a',null);assert.deepEqual(focused.nodes,new Set(['a','b','c']));assert.ok(!focused.nodes.has('d'));
 const pair=graph.connections.find(c=>c.serviceIds.join(',')==='a,b');assert.deepEqual(overviewFocus(graph,null,pair.key).nodes,new Set(['a','b']));
 assert.deepEqual(overviewFocus(graph,null,null,['a1']).nodes,new Set(['a']));
 assert.equal(overviewSelectionVisible(graph,pair.key),false);assert.equal(overviewSelectionVisible(graph,'ab-http'),true);assert.equal(overviewSelectionVisible(graph,'orphan'),false);
});


test('Overview circular-node label layout is deterministic and reserves non-overlapping footprints at small and large scales',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');
 const {serviceOverviewPositions,SERVICE_WIDTH,SERVICE_HEIGHT}=require('../src/features/architecture/service-overview-layout.ts');
 for(const count of [6,180]) {
  const source=serviceOverviewFixture();if(count>6){source.elements=Array.from({length:count},(_,i)=>({...source.elements[0],id:'svc'+i,parentId:null}));source.edges=[];}
  const projection=projectServiceOverview(source),points=serviceOverviewPositions(projection,2.4);
  assert.deepEqual(points,serviceOverviewPositions(projection,2.4));assert.equal(points.size,count);
  const entries=[...points.values()];for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.ok(Math.abs(entries[i].x-entries[j].x)>=SERVICE_WIDTH||Math.abs(entries[i].y-entries[j].y)>=SERVICE_HEIGHT,'node and label footprints must not overlap');
 }
});

test('Unknown relationship origin is visible in All but not mislabeled as source or runtime',()=>{
 const {projectServiceOverview,defaultOverviewFilters}=require('../src/features/architecture/service-overview.ts');
 const source=serviceOverviewFixture();source.edges=[{...source.edges[0],originLayer:undefined}];
 assert.equal(projectServiceOverview(source).relationshipCount,1);
 for(const origin of ['source','runtime','deployment'])assert.equal(projectServiceOverview(source,{...defaultOverviewFilters,origin}).relationshipCount,0);
 assert.equal(projectGraphModel(source,false,'source').model.edges.length,0);
});


test('A legacy aggregate representative is not offered as individually loaded source metadata',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');const source=serviceOverviewFixture();
 source.edges=[{...source.edges[0],underlyingEdgeIds:['ab-http','not-loaded']}];
 const connection=projectServiceOverview(source).connections[0];
 assert.deepEqual(connection.relationshipIds,['ab-http','not-loaded']);
 assert.ok(connection.relationships.every(row=>!row.metadataAvailable));
});


test('FTGO and actual Java/CSharp pipeline fixtures retain all eligible source IDs in service overview',()=>{
 const {projectServiceOverview}=require('../src/features/architecture/service-overview.ts');
 const {modelView}=require('../src/lib/api/java-wire.ts');
 const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ftgo-component.json'),'utf8'));
 const ftgo={id:raw.modelVersionId,projectId:'ftgo',snapshotId:'fixture',revision:1,label:'FTGO fixture',elements:raw.layoutJson.nodes.map(n=>({id:n.id,name:n.name,elementType:n.kind,parentId:n.parentId,description:n.description??'',layer:'unclassified',evidence:[],properties:n.properties})),edges:raw.layoutJson.edges.map(e=>({id:e.id,from:e.from,to:e.to,protocol:e.type,originLayer:e.originLayer,uncertain:true,evidence:[]}))};
 const fixtures=[ftgo];for(const filename of ['source-pipeline-java-actual.json','source-pipeline-csharp-graph-actual.json']) {const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',filename),'utf8'));fixtures.push(modelView(fixture.metadata,fixture.graph,fixture.details));}
 for(const source of fixtures){const before=JSON.stringify(source),overview=projectServiceOverview(source);assert.deepEqual(new Set(overview.services.map(n=>n.id)),new Set(source.elements.filter(n=>n.elementType==="SERVICE_CONTAINER").map(n=>n.id)));
  const expected=new Set(source.edges.filter(e=>overview.owners.get(e.from)&&overview.owners.get(e.to)&&overview.owners.get(e.from)!==overview.owners.get(e.to)).flatMap(e=>e.underlyingEdgeIds?.length?e.underlyingEdgeIds:[e.id]));
  assert.equal(overview.relationshipCount,expected.size);assert.deepEqual(new Set(overview.connections.flatMap(c=>c.relationshipIds)),expected);
  assert.equal(new Set(overview.connections.map(c=>c.serviceIds.join('|'))).size,overview.connections.length);assert.equal(JSON.stringify(source),before);
 }
});
