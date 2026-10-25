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
const {
  diagramKinds,
  canonicalNineDiagramCatalog,
  selectDiagram,
} = require("../src/features/architecture/diagram-catalog.ts");
const {
  projectUmlClassDiagram,
  projectUmlPackageDiagram,
  projectUmlDeploymentDiagram,
  projectUmlActivityDiagram,
  projectUmlStateDiagram,
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

test("M5-AC01 through M5-AC06: UML Deployment nodes, nested artifacts, «manifest» edges, CommunicationPath vs Compose depends_on separation, and environment isolation", () => {
  const javaModel = loadJavaFixtureModel();
  const deployProj = projectUmlDeploymentDiagram(javaModel, { environment: "default" });

  const execNodes = deployProj.nodes.filter((n) => n.nodeKind === "EXECUTION_ENVIRONMENT");
  const artifacts = deployProj.nodes.filter((n) => n.nodeKind === "ARTIFACT");
  const manifestations = deployProj.edges.filter((e) => e.edgeKind === "MANIFESTATION");
  const commPaths = deployProj.edges.filter((e) => e.edgeKind === "COMMUNICATION_PATH");

  assert.ok(execNodes.length >= 2, "Must extract executionEnvironment deployment nodes");
  assert.equal(artifacts.length, 1, "Only explicit container image (mysql:8.0) must produce extracted ARTIFACT");
  assert.equal(artifacts[0].name, "mysql:8.0");
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

  assert.equal(diagramKinds.C4.length, 3);
  assert.equal(diagramKinds.UML.length, 6);
  assert.equal(diagramKinds["4+1"].length, 5);
  assert.equal(canonicalNineDiagramCatalog.length, 9);

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
  assert.equal(coverageMatrix.diagrams.length, 9);
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


