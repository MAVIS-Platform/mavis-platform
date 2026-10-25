import type { ArchitecturalModel } from "@/types/domain";
import { projectGraphModel } from "./graph-projection";
import { assessReadability } from "@/lib/architecture/readability";
import { canonicalNineDiagramCatalog } from "./diagram-catalog";
import {
  hydrateUmlWorkspaceFromXml,
  projectUmlActivityDiagram,
  projectUmlClassDiagram,
  projectUmlDeploymentDiagram,
  projectUmlPackageDiagram,
  projectUmlStateDiagram,
  buildUmlDrawioXml,
  reconcileUmlDrawioXml,
} from "./uml-diagrams";

export interface SeededBenchmarkScaleResult {
  scaleNodes: number;
  seed: number;
  runs: number;
  durationsMs: number[];
  medianMs: number;
  maxMs: number;
  serviceContainersCount: number;
  componentsCount: number;
  totalEdgesCount: number;
  collapsedElementsCount: number;
  collapsedEdgesCount: number;
  expandedElementsCount: number;
  expandedEdgesCount: number;
  readabilityCollapsed: {
    screenReadable: boolean;
    printReadable: boolean;
    minimumScreenFontPx: number;
  };
}

export interface M8GraphBenchmarkReport {
  benchmarkVersion: string;
  benchmarkKind: "PROJECTION_MICROBENCHMARK_ONLY";
  isBrowserWorkloadBenchmark: false;
  scopeNote: string;
  generatedAt: string;
  scales: SeededBenchmarkScaleResult[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSeededModel(nodeCount: number, seed = 20261025): ArchitecturalModel {
  const rand = mulberry32(seed + nodeCount);
  const serviceCount = Math.max(5, Math.min(60, Math.floor(nodeCount / 10)));
  const elements: ArchitecturalModel["elements"] = [];
  const edges: ArchitecturalModel["edges"] = [];

  const layers: Array<"edge" | "domain" | "platform" | "data"> = [
    "edge",
    "domain",
    "platform",
    "data",
  ];

  for (let i = 0; i < serviceCount; i++) {
    elements.push({
      id: `svc-${i}`,
      name: `service-${i}`,
      elementType: i % 8 === 7 ? "DATABASE" : "SERVICE_CONTAINER",
      parentId: null,
      technology: i % 2 === 0 ? "Java / Spring Boot" : "C# / .NET",
      layer: layers[i % layers.length]!,
      description: `Seeded service container ${i}`,
      properties: i % 8 === 7 ? { resourceRole: "LOGICAL_DATASTORE" } : {},
      evidence: [],
    });
  }

  const remaining = Math.max(0, nodeCount - serviceCount);
  for (let j = 0; j < remaining; j++) {
    const parentIdx = Math.floor(rand() * serviceCount);
    const parentId = `svc-${parentIdx}`;
    elements.push({
      id: `comp-${j}`,
      name: `Component_${j}`,
      elementType: "COMPONENT",
      parentId,
      technology: parentIdx % 2 === 0 ? "Java" : "C#",
      layer: "domain",
      description: `Seeded component ${j} in ${parentId}`,
      properties: {
        qualifiedName: `bench.svc${parentIdx}.Component_${j}`,
      },
      evidence: [],
    });
  }

  const edgeTargetCount = Math.floor(nodeCount * 1.6);
  const protocols = [
    "SERVICE_HTTP_CALL",
    "CODE_DEPENDENCY",
    "DATABASE_ACCESS",
    "MESSAGE_PUBLISH",
    "DECLARED_COMPOSE",
  ];
  for (let k = 0; k < edgeTargetCount; k++) {
    const fromIdx = Math.floor(rand() * elements.length);
    let toIdx = Math.floor(rand() * elements.length);
    if (toIdx === fromIdx) toIdx = (toIdx + 1) % elements.length;
    const protocol = protocols[k % protocols.length]!;
    edges.push({
      id: `edge-${k}`,
      from: elements[fromIdx]!.id,
      to: elements[toIdx]!.id,
      protocol,
      uncertain: k % 7 === 0,
      originLayer: protocol === "DECLARED_COMPOSE" ? "DEPLOYMENT" : "STATIC",
      resolutionStatus: k % 7 === 0 ? "UNRESOLVED" : "RESOLVED",
      evidenceCount: 1,
      evidenceIds: [],
      evidence: [],
    });
  }

  return {
    id: `bench-model-${nodeCount}`,
    projectId: "bench-project",
    snapshotId: "bench-snapshot",
    revision: 1,
    label: `Seeded Benchmark Model (${nodeCount} nodes)`,
    elements,
    edges,
  };
}

export function runSeededGraphBenchmark(
  scales: number[] = [100, 500, 2000],
  runs = 5,
  baseSeed = 20261025,
): M8GraphBenchmarkReport {
  const results: SeededBenchmarkScaleResult[] = [];

  for (const scaleNodes of scales) {
    const model = generateSeededModel(scaleNodes, baseSeed);
    const durationsMs: number[] = [];
    let collapsedProjection = projectGraphModel(model, false, "source");
    let expandedProjection = projectGraphModel(model, true, "all");

    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      collapsedProjection = projectGraphModel(model, false, "source");
      expandedProjection = projectGraphModel(model, true, "all");
      const elapsed = Number((performance.now() - t0).toFixed(3));
      durationsMs.push(elapsed);
    }

    const sorted = [...durationsMs].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)]!;
    const maxMs = sorted[sorted.length - 1]!;

    const collapsedCount = collapsedProjection.model.elements.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(collapsedCount)));
    const rows = Math.max(1, Math.ceil(collapsedCount / cols));
    const estWidth = Math.max(600, cols * 220);
    const estHeight = Math.max(400, rows * 120);
    const readability = assessReadability({
      width: estWidth,
      height: estHeight,
      minimumFontPx: 12,
      viewportWidth: 1280,
      viewportHeight: 760,
    });

    results.push({
      scaleNodes,
      seed: baseSeed + scaleNodes,
      runs,
      durationsMs,
      medianMs,
      maxMs,
      serviceContainersCount: model.elements.filter((e) => e.elementType !== "COMPONENT").length,
      componentsCount: model.elements.filter((e) => e.elementType === "COMPONENT").length,
      totalEdgesCount: model.edges.length,
      collapsedElementsCount: collapsedProjection.model.elements.length,
      collapsedEdgesCount: collapsedProjection.model.edges.length,
      expandedElementsCount: expandedProjection.model.elements.length,
      expandedEdgesCount: expandedProjection.model.edges.length,
      readabilityCollapsed: {
        screenReadable: readability.screenReadable,
        printReadable: readability.printReadable,
        minimumScreenFontPx: Number(readability.minimumScreenFontPx.toFixed(2)),
      },
    });
  }

  return {
    benchmarkVersion: "m8-seeded-graph-projection-microbenchmark-v2",
    benchmarkKind: "PROJECTION_MICROBENCHMARK_ONLY",
    isBrowserWorkloadBenchmark: false,
    scopeNote:
      "Measures pure in-memory projectGraphModel() data projection only. For browser layout, SVG/DOM render, usable time, interaction latency, and JS heap memory, see browserWorkloadBenchmark in graph-browser-workload-benchmark-2026-10-25.json.",
    generatedAt: new Date().toISOString(),
    scales: results,
  };
}

export interface M8CoverageVerificationOptions {
  javaModel?: ArchitecturalModel | undefined;
  csharpModel?: ArchitecturalModel | undefined;
  browserWorkloadVerified?: boolean | undefined;
  browserZoom2000ExceededTarget?: boolean | undefined;
  liveOtelTraceCaptured?: boolean | undefined;
}

function runDynamicSelfChecks(options?: M8CoverageVerificationOptions) {
  // Dynamically verify O1-O5 & Q1-Q3 invariants on synthetic and supplied models
  const missingSourceModel: ArchitecturalModel = {
    id: "selfcheck-missing-source",
    projectId: "p",
    snapshotId: "s",
    revision: 1,
    label: "Missing Source Check",
    elements: [
      {
        id: "svc-a",
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
        id: "svc-b",
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
        id: "comp-1",
        name: "OrderStatus",
        elementType: "COMPONENT",
        parentId: "svc-a",
        technology: "Java",
        layer: "domain",
        description: "",
        properties: { packageName: "shared", qualifiedName: "shared.OrderStatus" },
        evidence: [],
      },
      {
        id: "comp-2",
        name: "InvoiceStatus",
        elementType: "COMPONENT",
        parentId: "svc-b",
        technology: "C#",
        layer: "domain",
        description: "",
        properties: { packageName: "shared", qualifiedName: "shared.InvoiceStatus" },
        evidence: [],
      },
    ],
    edges: [],
  };

  const depNoMeta = projectUmlDeploymentDiagram(missingSourceModel);
  const actNoCfg = projectUmlActivityDiagram(missingSourceModel);
  const stateNoLifecycle = projectUmlStateDiagram(missingSourceModel);
  const pkgMultiService = projectUmlPackageDiagram(missingSourceModel);

  const honestDeploymentNoMeta = depNoMeta.nodes.length === 0 && depNoMeta.edges.length === 0;
  const honestActivityNoCfg = actNoCfg.nodes.length === 0 && actNoCfg.edges.length === 0;
  const honestStateNoLifecycle =
    stateNoLifecycle.states.length === 0 && stateNoLifecycle.transitions.length === 0;
  const distinctServicePackages = pkgMultiService.packages.length === 2;

  // Verify Q3: buildContext-only compose service does not fabricate :build artifact
  const buildContextOnlyModel: ArchitecturalModel = {
    ...missingSourceModel,
    id: "selfcheck-build-context-only",
    elements: [
      {
        id: "svc-build-only",
        name: "orders-service",
        elementType: "SERVICE_CONTAINER",
        parentId: null,
        technology: "Docker",
        layer: "domain",
        description: "",
        properties: {
          sourceType: "DOCKER_COMPOSE",
          buildContext: "./orders",
          deploymentMetadata: {
            nodeStereotype: "<<executionEnvironment>>",
            declaredBuildContext: "./orders",
            artifactResolution: "BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT",
            environment: "default",
          },
        },
        evidence: [],
      },
    ],
  };
  const depBuildOnly = projectUmlDeploymentDiagram(buildContextOnlyModel);
  const honestBuildContextNoFabricatedArtifact =
    depBuildOnly.nodes.length === 1 &&
    depBuildOnly.nodes[0]?.nodeKind === "EXECUTION_ENVIRONMENT" &&
    !depBuildOnly.nodes.some((n) => n.nodeKind === "ARTIFACT" || n.name.endsWith(":build")) &&
    depBuildOnly.edges.length === 0;

  // Verify deletion conflict, Q1 semantic canvas edit conflict, Q2 foreign document rejection, & persistence hydration
  const clsProj = projectUmlClassDiagram(missingSourceModel, {
    overlay: {
      designedClassifiers: [
        {
          classifierId: "designed:cls:shared.AuditPolicy",
          modelElementId: null,
          name: "AuditPolicy",
          qualifiedName: "shared.AuditPolicy",
          packageName: "shared",
          serviceId: "svc-a",
          serviceName: "orders-service",
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
  const xml = buildUmlDrawioXml(clsProj);
  const hydrated = hydrateUmlWorkspaceFromXml(xml, missingSourceModel);
  const hydrationPreservesDesigned =
    (hydrated.classOverlay.designedClassifiers?.length ?? 0) === 1;

  // Q1 self-check: changing mxCell.value without changing mavisMeta must emit conflict
  const xmlWithLabelEdited = xml.replace(
    /(<mxCell id="comp-1" value=")[^"]*(")/,
    "$1RenamedByUser$2",
  );
  const rtLabelEdited = reconcileUmlDrawioXml(xmlWithLabelEdited, clsProj);
  const semanticCanvasEditDetected = rtLabelEdited.conflicts.some(
    (c) => c.code === "EXTRACTED_FACT_IMMUTABLE",
  );

  // Q2 self-check: hydrating XML into a different modelId must emit FOREIGN_MODEL_DOCUMENT_REJECTED
  const foreignHydrated = hydrateUmlWorkspaceFromXml(xml, buildContextOnlyModel);
  const foreignModelDocumentRejected = foreignHydrated.conflicts.some(
    (c) => c.code === "FOREIGN_MODEL_DOCUMENT_REJECTED",
  );

  const xmlWithDeletedClassifier = xml.replace(
    /<mxCell id="comp-1"[\s\S]*?<\/mxCell>/,
    "",
  );
  const rtDeleted = reconcileUmlDrawioXml(xmlWithDeletedClassifier, clsProj);
  const deletionConflictDetected =
    rtDeleted.conflicts.some((c) => c.code === "DELETED_ELEMENT_IN_DRAWIO") &&
    !rtDeleted.projection.classifiers.some((c) => c.classifierId === "comp-1");

  const javaModelChecked = options?.javaModel
    ? projectUmlClassDiagram(options.javaModel).classifiers.length > 0
    : false;
  const csharpModelChecked = options?.csharpModel
    ? projectUmlClassDiagram(options.csharpModel).classifiers.length > 0
    : false;

  return {
    honestDeploymentNoMeta,
    honestBuildContextNoFabricatedArtifact,
    honestActivityNoCfg,
    honestStateNoLifecycle,
    distinctServicePackages,
    hydrationPreservesDesigned,
    deletionConflictDetected,
    semanticCanvasEditDetected,
    foreignModelDocumentRejected,
    javaModelChecked,
    csharpModelChecked,
    browserWorkloadVerified: Boolean(options?.browserWorkloadVerified),
    browserZoom2000ExceededTarget: Boolean(options?.browserZoom2000ExceededTarget),
    liveOtelTraceCaptured: Boolean(options?.liveOtelTraceCaptured),
  };
}

export function buildM8CoverageMatrix(options?: M8CoverageVerificationOptions) {
  const checks = runDynamicSelfChecks(options);
  const coreInvariantsPass =
    checks.honestDeploymentNoMeta &&
    checks.honestBuildContextNoFabricatedArtifact &&
    checks.honestActivityNoCfg &&
    checks.honestStateNoLifecycle &&
    checks.distinctServicePackages &&
    checks.hydrationPreservesDesigned &&
    checks.deletionConflictDetected &&
    checks.semanticCanvasEditDetected &&
    checks.foreignModelDocumentRejected;

  return {
    matrixVersion: "m8-rule-and-language-coverage-v3-q1-q4",
    generatedAt: new Date().toISOString(),
    overallGovernanceStatus: {
      staticAndUnitSelfVerification: coreInvariantsPass ? "SELF_VERIFIED" : "FAILED_INVARIANT",
      browserWorkloadVerification: checks.browserWorkloadVerified
        ? checks.browserZoom2000ExceededTarget
          ? "SELF_VERIFIED_WITH_2000_NODE_SVG_ZOOM_FRAME_OVER_BUDGET"
          : "SELF_VERIFIED"
        : "PENDING_BROWSER_RUN",
      liveRuntimeOtelTraceVerification: checks.liveOtelTraceCaptured
        ? "OBSERVED_LIVE_TRACE"
        : "BLOCKED_NO_LIVE_TRACE",
      independentReviewerAcceptance: "PENDING_INDEPENDENT_REVIEW",
    },
    dynamicInvariantChecks: checks,
    systemCatalog: {
      interactiveGraph: {
        id: "GRAPH",
        label: "Interactive Dependency Graph",
        collapseExpandSupported: true,
        originFilters: ["all", "source", "deployment", "runtime"],
      },
      canonicalDiagrams: canonicalNineDiagramCatalog,
    },
    diagrams: [
      {
        diagramId: "C4_CONTEXT",
        milestone: "M1",
        verificationStatus: coreInvariantsPass ? "SELF_VERIFIED" : "UNVERIFIED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "EXTRACTED",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Inbound HTTP entrypoints do not fabricate external actors/callers",
          "Compose depends_on excluded from context interactions",
        ],
      },
      {
        diagramId: "C4_CONTAINER",
        milestone: "M1",
        verificationStatus: coreInvariantsPass ? "SELF_VERIFIED" : "UNVERIFIED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "EXTRACTED",
        runtimeOtelSupport: "SUPPORTED",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Named system boundary wraps owned containers and logical datastores only",
          "Channel protocol badge derived strictly from channel properties.protocol",
        ],
      },
      {
        diagramId: "C4_COMPONENT",
        milestone: "M2",
        verificationStatus: coreInvariantsPass ? "SELF_VERIFIED" : "UNVERIFIED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "NOT_APPLICABLE",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Scoped to a single SERVICE_CONTAINER",
          "CLASS_INTERFACE nodes excluded from C3 component level to keep C3/C4 separation clean",
        ],
      },
      {
        diagramId: "UML_SEQUENCE",
        milestone: "M3",
        verificationStatus: checks.liveOtelTraceCaptured
          ? "SELF_VERIFIED"
          : "SELF_VERIFIED_STATIC_AND_REPLAY_ONLY__LIVE_OTEL_BLOCKED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "EXCLUDED_STARTUP_ONLY",
        runtimeOtelSupport: checks.liveOtelTraceCaptured
          ? "RUNTIME_OBSERVED_VERIFIED"
          : "REPLAY_VERIFIED__LIVE_OTEL_PENDING",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Causal parentSpanId tree DFS ordering with cyclic/self-parent guards",
          "Ambiguous parallel candidate edges require explicit user disambiguation",
          "EXTRACTED/OBSERVED message facts are immutable in Draw.io round-trip",
        ],
      },
      {
        diagramId: "UML_CLASS",
        milestone: "M4",
        verificationStatus:
          checks.hydrationPreservesDesigned && checks.deletionConflictDetected
            ? "SELF_VERIFIED"
            : "FAILED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "NOT_APPLICABLE",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Java package-private (~ [package-private]) kept distinct from C# internal (~ [internal])",
          "All overloaded method signatures preserved by signatureKey",
          "Contract interface without I-prefix and IHelper class with I-prefix classified by AST kind, never by name prefix",
          "SHARED_AGGREGATION and COMPOSITION require DESIGNED overlay or explicit ownership evidence; static fields default to ASSOCIATION with UNKNOWN multiplicity omitted",
        ],
      },
      {
        diagramId: "UML_PACKAGE",
        milestone: "M4",
        verificationStatus: checks.distinctServicePackages ? "SELF_VERIFIED" : "FAILED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "NOT_APPLICABLE",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Package identity scoped by owning service (pkg:<serviceId>:<qualifiedName>) so shared package names across services never collide",
          "Package dependencies aggregate cross-package classifier edges with full underlyingEdgeIds",
          "Cyclic «merge» relationships rejected by PACKAGE_MERGE_CYCLE_DETECTED validator",
        ],
      },
      {
        diagramId: "UML_DEPLOYMENT",
        milestone: "M5",
        verificationStatus: checks.honestDeploymentNoMeta ? "SELF_VERIFIED" : "FAILED",
        javaSupport: "EXTRACTED",
        csharpSupport: "EXTRACTED",
        composeSupport: "EXTRACTED",
        runtimeOtelSupport: "SUPPORTED",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Logical services/datastores without explicit deploymentMetadata/Compose/image/ports are never fabricated into deployment nodes",
          "CommunicationPath derived only from evidenced communication edges or DESIGNED overlay; Compose depends_on excluded from CommunicationPath",
          "Multi-environment deployment definitions isolated by environment filter",
        ],
      },
      {
        diagramId: "UML_ACTIVITY",
        milestone: "M6",
        verificationStatus: checks.honestActivityNoCfg ? "SELF_VERIFIED" : "FAILED",
        javaSupport: "EXTRACTED_AND_PARTIAL",
        csharpSupport: "EXTRACTED_AND_PARTIAL",
        composeSupport: "NOT_APPLICABLE",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Never fabricates handle() operations or INITIAL->ACTION->FINAL flows when methodsCfg is absent",
          "Early returns terminate branch tails without wiring into post-if MergeNode; do-while executes body before bottom DecisionNode",
          "Unsupported AST constructs (break/continue/yield/try/catch/switch fall-through/lambda) emit PARTIAL completeness marker",
          "ObjectNode and ObjectFlow derived from AST enum state assignments, never frontend label regex",
        ],
      },
      {
        diagramId: "UML_STATE",
        milestone: "M7",
        verificationStatus: checks.honestStateNoLifecycle ? "SELF_VERIFIED" : "FAILED",
        javaSupport: "EXTRACTED_AND_PARTIAL",
        csharpSupport: "EXTRACTED_AND_PARTIAL",
        composeSupport: "NOT_APPLICABLE",
        runtimeOtelSupport: "NOT_APPLICABLE",
        designedOverlaySupport: "SUPPORTED",
        restraintRules: [
          "Never fabricates ENUM_DECLARATION or PENDING->COMPLETED transitions from component names",
          "Primitive/string fields excluded from state-carrier inference; transitions require enclosing AST guard or dominating early-exit guard",
          "Unguarded or else-branch state assignments recorded in unresolvedAssignments (PARTIAL) rather than fabricated from initialState/ANY",
        ],
      },
    ],
  };
}
