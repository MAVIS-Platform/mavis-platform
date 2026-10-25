const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(
    output.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    filename,
  );
};

const {
  inferInitialMessageSortFromEdge,
  allocateNextSequenceId,
  addEdgeStepToInteraction,
  addCustomMessageToInteraction,
  changeMessageSortInInteraction,
  removeMessageFromInteraction,
  reorderMessageInInteraction,
  validateInteractionDocument,
  upgradeLegacyScenarioDesign,
  interactionToDrawioXml,
  extractInteractionFromDrawioXml,
  relayoutSequenceDrawioXml,
  verifyObservedLineage,
  projectObservedSequenceToInteraction,
  createDesignedCopyFromObserved,
  readScenarioDesign,
  scenarioXml,
} = require("../src/features/architecture/scenario-design.ts");

const {
  resolveSequenceSelectionContext,
  computeSelectionScopeKey,
  buildThreeESubjectContext,
} = require("../src/features/architecture/three-e-content.ts");

const { runtimeSequence } = require("../src/lib/api/java-operations.ts");

function createM3ReferenceModel() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "11111111-1111-4111-8111-111111111111",
    snapshotId: "22222222-2222-4222-8222-222222222222",
    revision: 4,
    label: "M3 Reference Model",
    elements: [
      {
        id: "aaaa0001-0000-4000-8000-000000000001",
        name: "api-gateway",
        layer: "edge",
        elementType: "SERVICE_CONTAINER",
        description: "API Gateway",
        evidence: [{ id: "ev-el-1", kind: "source", location: "Gateway.java", snippet: "class Gateway" }],
      },
      {
        id: "aaaa0002-0000-4000-8000-000000000002",
        name: "order-service",
        layer: "domain",
        elementType: "SERVICE_CONTAINER",
        description: "Order Service",
        evidence: [{ id: "ev-el-2", kind: "source", location: "OrderService.java", snippet: "class OrderService" }],
      },
      {
        id: "aaaa0003-0000-4000-8000-000000000003",
        name: "payment-service",
        layer: "domain",
        elementType: "SERVICE_CONTAINER",
        description: "Payment Service",
        evidence: [],
      },
      {
        id: "aaaa0004-0000-4000-8000-000000000004",
        name: "inventory-service",
        layer: "domain",
        elementType: "MESSAGE_CHANNEL",
        description: "Inventory Topic",
        evidence: [],
      },
    ],
    edges: [
      {
        id: "bbbb0001-0000-4000-8000-000000000001",
        from: "aaaa0001-0000-4000-8000-000000000001",
        to: "aaaa0002-0000-4000-8000-000000000002",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [{ id: "eeee0001-0000-4000-8000-000000000001", kind: "source", location: "Gateway.java:42", snippet: "rest.post('/orders')" }],
      },
      {
        id: "bbbb0002-0000-4000-8000-000000000002",
        from: "aaaa0002-0000-4000-8000-000000000002",
        to: "aaaa0003-0000-4000-8000-000000000003",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [{ id: "eeee0002-0000-4000-8000-000000000002", kind: "source", location: "OrderService.java:88", snippet: "paymentClient.authorize()" }],
      },
      {
        id: "bbbb0003-0000-4000-8000-000000000003",
        from: "aaaa0002-0000-4000-8000-000000000002",
        to: "aaaa0004-0000-4000-8000-000000000004",
        protocol: "MESSAGE_PUBLISH",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [{ id: "eeee0003-0000-4000-8000-000000000003", kind: "source", location: "OrderService.java:105", snippet: "kafka.send('inventory')" }],
      },
      {
        id: "bbbb0004-0000-4000-8000-000000000004",
        from: "aaaa0002-0000-4000-8000-000000000002",
        to: "aaaa0002-0000-4000-8000-000000000002",
        protocol: "CODE_DEPENDENCY",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [],
      },
    ],
  };
}

test("Fixture 1 (Designed Order & Repeats): 4+ participants, repeated edge occurrences, self-call, and nested ExecutionSpecifications", () => {
  const model = createM3ReferenceModel();
  const doc = {
    schemaVersion: 2,
    interactionId: "scenarios:designed:order-flow",
    name: "Order Checkout & Retry",
    modelId: model.id,
    baseModelId: model.id,
    snapshotId: model.snapshotId,
    mode: "DESIGNED",
    semanticStatus: "COMPLETE",
    provenance: { origin: "DESIGNED" },
    limitations: [],
    participants: [
      {
        participantId: "part:gw",
        modelElementId: model.elements[0].id,
        role: "edge",
        name: "api-gateway",
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "RESOLVED",
        provenance: "STATIC",
      },
      {
        participantId: "part:ord",
        modelElementId: model.elements[1].id,
        role: null,
        name: "order-service",
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "RESOLVED",
        provenance: "STATIC",
      },
      {
        participantId: "part:pay",
        modelElementId: model.elements[2].id,
        role: null,
        name: "payment-service",
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "RESOLVED",
        provenance: "STATIC",
      },
      {
        participantId: "part:inv",
        modelElementId: model.elements[3].id,
        role: null,
        name: "inventory-service",
        elementType: "MESSAGE_CHANNEL",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "RESOLVED",
        provenance: "STATIC",
      },
    ],
    messages: [
      {
        messageId: "msg-1",
        sequenceIndex: 1,
        fromParticipantId: "part:gw",
        toParticipantId: "part:ord",
        label: "POST /orders",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [model.edges[0].id],
        evidenceIds: ["eeee0001-0000-4000-8000-000000000001"],
        causalParentMessageIds: [],
        provenance: "STATIC",
      },
      {
        messageId: "msg-2",
        sequenceIndex: 2,
        fromParticipantId: "part:ord",
        toParticipantId: "part:ord",
        label: "validateTotals()",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [model.edges[3].id],
        evidenceIds: [],
        causalParentMessageIds: ["msg-1"],
        provenance: "DESIGNED",
      },
      {
        messageId: "msg-3",
        sequenceIndex: 3,
        fromParticipantId: "part:ord",
        toParticipantId: "part:pay",
        label: "authorize(attempt=1)",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [model.edges[1].id],
        evidenceIds: [],
        causalParentMessageIds: ["msg-2"],
        provenance: "STATIC",
      },
      {
        messageId: "msg-4",
        sequenceIndex: 4,
        fromParticipantId: "part:ord",
        toParticipantId: "part:pay",
        label: "authorize(attempt=2)",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [model.edges[1].id], // Repeated canonical edge!
        evidenceIds: [],
        causalParentMessageIds: ["msg-3"],
        provenance: "STATIC",
      },
      {
        messageId: "msg-5",
        sequenceIndex: 5,
        fromParticipantId: "part:pay",
        toParticipantId: "part:ord",
        label: "200 Authorized",
        messageSort: "REPLY",
        replyToMessageId: "msg-4",
        returnValue: "authToken",
        sourceRelationshipIds: [],
        evidenceIds: [],
        causalParentMessageIds: ["msg-4"],
        provenance: "DESIGNED",
      },
      {
        messageId: "msg-6",
        sequenceIndex: 6,
        fromParticipantId: "part:ord",
        toParticipantId: "part:inv",
        label: "OrderAuthorizedEvent",
        messageSort: "ASYNCH_SIGNAL",
        sourceRelationshipIds: [model.edges[2].id],
        evidenceIds: [],
        causalParentMessageIds: ["msg-5"],
        provenance: "STATIC",
      },
    ],
    executions: [
      {
        executionId: "exec-outer",
        participantId: "part:ord",
        startMessageId: "msg-1",
        endMessageId: "msg-6",
        nestingLevel: 0,
        provenance: "DESIGNED",
      },
      {
        executionId: "exec-nested-self",
        participantId: "part:ord",
        startMessageId: "msg-2",
        endMessageId: "msg-2",
        nestingLevel: 1,
        provenance: "DESIGNED",
      },
    ],
    fragments: [],
    interactionUses: [],
  };

  const val = validateInteractionDocument(doc, model);
  assert.equal(val.valid, true);
  assert.equal(val.semanticStatus, "COMPLETE");

  const xml = interactionToDrawioXml(doc, model);
  // SEQ-N01: Lifeline headers are NEVER underlined (fontStyle=0)
  assert.match(xml, /mavisRole="participant"[^>]*fontStyle=0/);
  assert.doesNotMatch(xml, /mavisRole="participant"[^>]*fontStyle=4/);
  // Repeated edge occurrences (msg-3 and msg-4) both exist with distinct mavisMessageId
  assert.match(xml, /mavisMessageId="msg-3"/);
  assert.match(xml, /mavisMessageId="msg-4"/);
  // Self-call loop points and nested execution bar offset exist
  assert.match(xml, /<Array as="points">/);
  assert.match(xml, /id="exec-exec-outer"/);
  assert.match(xml, /id="exec-exec-nested-self"/);
});

test("Fixture 2 (Fragments & InteractionUse): alt, opt, loop(1, 3), par, nested operand, deferred operators, and distinct ref InteractionUse", () => {
  const model = createM3ReferenceModel();
  const base = upgradeLegacyScenarioDesign(
    {
      modelId: model.id,
      name: "Fragment & Ref Coverage",
      edgeIds: [model.edges[0].id, model.edges[1].id, model.edges[2].id],
    },
    model,
  );

  const doc = {
    ...base,
    fragments: [
      {
        fragmentId: "frag-alt-1",
        operator: "alt",
        label: "Payment outcome",
        coveredParticipantIds: ["part:" + model.elements[1].id, "part:" + model.elements[2].id],
        provenance: "DESIGNED",
        operands: [
          {
            operandId: "op-alt-ok",
            guard: "status == 200",
            messageIds: ["msg-2"],
            nestedFragments: [
              {
                fragmentId: "frag-loop-nested",
                operator: "loop",
                label: "Retry publish",
                coveredParticipantIds: ["part:" + model.elements[1].id, "part:" + model.elements[3].id],
                provenance: "DESIGNED",
                operands: [
                  {
                    operandId: "op-loop-1",
                    guard: "hasMore",
                    minIterations: 1,
                    maxIterations: 3,
                    messageIds: ["msg-3"],
                  },
                ],
              },
            ],
          },
          {
            operandId: "op-alt-else",
            guard: "else",
            messageIds: ["msg-3"],
          },
        ],
      },
      {
        fragmentId: "frag-opt-1",
        operator: "opt",
        coveredParticipantIds: ["part:" + model.elements[0].id, "part:" + model.elements[1].id],
        provenance: "DESIGNED",
        operands: [{ operandId: "op-opt-1", guard: "auditEnabled", messageIds: ["msg-1"] }],
      },
      {
        fragmentId: "frag-par-1",
        operator: "par",
        coveredParticipantIds: ["part:" + model.elements[1].id, "part:" + model.elements[2].id],
        provenance: "DESIGNED",
        operands: [
          { operandId: "op-par-1", guard: "branch A", messageIds: ["msg-2"] },
          { operandId: "op-par-2", guard: "branch B", messageIds: ["msg-3"] },
        ],
      },
      {
        fragmentId: "frag-critical-1",
        operator: "critical",
        coveredParticipantIds: ["part:" + model.elements[1].id],
        provenance: "DESIGNED",
        operands: [{ operandId: "op-crit-1", guard: "lockAcquired", messageIds: ["msg-1"] }],
      },
    ],
    interactionUses: [
      {
        interactionUseId: "use-auth-1",
        name: "Verify Customer Token",
        targetInteractionId: "scenarios:designed:auth",
        targetViewId: "scenarios:designed:auth",
        coveredParticipantIds: ["part:" + model.elements[0].id, "part:" + model.elements[1].id],
        arguments: "jwt",
        returnValue: "claims",
        afterMessageId: "msg-1",
        resolutionStatus: "RESOLVED",
        provenance: "DESIGNED",
      },
    ],
  };

  const val = validateInteractionDocument(doc, model);
  assert.equal(val.valid, true);
  // critical operator triggers UNSUPPORTED_FRAGMENT_OPERATOR warning
  assert.ok(val.warnings.some((w) => w.code === "UNSUPPORTED_FRAGMENT_OPERATOR"));

  const xml = interactionToDrawioXml(doc, model);
  assert.match(xml, /mavisRole="combined-fragment" mavisOperator="alt" value="alt"/);
  assert.match(xml, /mavisRole="combined-fragment" mavisOperator="loop" value="loop\(1, 3\)"/);
  assert.match(xml, /mavisRole="combined-fragment" mavisOperator="opt" value="opt"/);
  assert.match(xml, /mavisRole="combined-fragment" mavisOperator="par" value="par"/);
  assert.match(xml, /mavisRole="combined-fragment" mavisOperator="critical" value="critical \[DESIGNED_ONLY\]"/);
  assert.match(xml, /mavisRole="operand-divider"/);
  // Distinct InteractionUse ref frame (SEQ-N05)
  assert.match(xml, /mavisRole="interaction-use"[^>]*value="ref"/);
  assert.match(xml, /Verify Customer Token\(jwt\)/);
});

test("Fixture 3 (Lifecycle): CREATE message, DELETE message with umlDestroy X, and negative validation for message after DELETE", () => {
  const model = createM3ReferenceModel();
  const validLifecycleDoc = {
    schemaVersion: 2,
    interactionId: "scenarios:designed:lifecycle",
    name: "Worker Ephemeral Lifecycle",
    modelId: model.id,
    mode: "DESIGNED",
    semanticStatus: "COMPLETE",
    provenance: { origin: "DESIGNED" },
    limitations: [],
    participants: [
      {
        participantId: "part:ord",
        modelElementId: model.elements[1].id,
        role: null,
        name: "order-service",
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "RESOLVED",
        provenance: "STATIC",
      },
      {
        participantId: "part:worker",
        modelElementId: null,
        role: "ephemeral",
        name: "CheckoutWorker",
        elementType: "COMPONENT",
        abstractionLevel: "COMPONENT",
        resolutionStatus: "DESIGNED_ROLE",
        provenance: "DESIGNED",
      },
    ],
    messages: [
      {
        messageId: "msg-create",
        sequenceIndex: 1,
        fromParticipantId: "part:ord",
        toParticipantId: "part:worker",
        label: "spawnWorker()",
        messageSort: "CREATE",
        sourceRelationshipIds: [],
        evidenceIds: [],
        causalParentMessageIds: [],
        provenance: "DESIGNED",
      },
      {
        messageId: "msg-work",
        sequenceIndex: 2,
        fromParticipantId: "part:ord",
        toParticipantId: "part:worker",
        label: "runJob()",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [],
        evidenceIds: [],
        causalParentMessageIds: ["msg-create"],
        provenance: "DESIGNED",
      },
      {
        messageId: "msg-delete",
        sequenceIndex: 3,
        fromParticipantId: "part:ord",
        toParticipantId: "part:worker",
        label: "close()",
        messageSort: "DELETE",
        sourceRelationshipIds: [],
        evidenceIds: [],
        causalParentMessageIds: ["msg-work"],
        provenance: "DESIGNED",
      },
    ],
    executions: [],
    fragments: [],
    interactionUses: [],
  };

  const validRes = validateInteractionDocument(validLifecycleDoc, model);
  assert.equal(validRes.valid, true);
  const xml = interactionToDrawioXml(validLifecycleDoc, model);
  assert.match(xml, /«create» spawnWorker\(\)/);
  assert.match(xml, /«destroy» close\(\)/);
  assert.match(xml, /mavisRole="lifeline-destroy"[^>]*shape=umlDestroy/);

  // Negative test: sending a message to part:worker AFTER msg-delete must fail validation!
  const invalidDoc = {
    ...validLifecycleDoc,
    messages: [
      ...validLifecycleDoc.messages,
      {
        messageId: "msg-after-delete",
        sequenceIndex: 4,
        fromParticipantId: "part:ord",
        toParticipantId: "part:worker",
        label: "illegalCallAfterDelete()",
        messageSort: "SYNCH_CALL",
        sourceRelationshipIds: [],
        evidenceIds: [],
        causalParentMessageIds: ["msg-delete"],
        provenance: "DESIGNED",
      },
    ],
  };
  const invalidRes = validateInteractionDocument(invalidDoc, model);
  assert.equal(invalidRes.valid, false);
  assert.ok(invalidRes.errors.some((e) => e.code === "MESSAGE_AFTER_LIFELINE_DESTROYED"));
});

test("Fixture 4 & 5 (Runtime Mapping, Ambiguity, Partial Order & Clock Skew): actual Java DTO fixture + ambiguous duplicate name handling", () => {
  const model = createM3ReferenceModel();
  const fixturePath = path.resolve(__dirname, "fixtures/observed-sequence-java-actual.json");
  assert.ok(fs.existsSync(fixturePath), "Controlled Java observed sequence fixture must exist");

  const rawJavaDto = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const mappedSequence = runtimeSequence(rawJavaDto);

  // Verify lineage between base model (4444...) and runtime-enriched model (5555...)
  const lineage = verifyObservedLineage(mappedSequence, model, model.id);
  assert.equal(lineage.valid, true);
  assert.match(lineage.summary, /Pinned base model rev 4/);

  // Project observed trace to InteractionDocument
  const proj = projectObservedSequenceToInteraction(mappedSequence, model, {
    traceId: "trace-m3-001",
    pageSize: 30,
  });
  assert.equal(proj.totalSteps, 3);
  assert.equal(proj.document.mode, "OBSERVED");
  assert.ok(proj.document.limitations.includes("NO_SYNTHETIC_REPLY_FROM_END_TIME"));
  assert.ok(proj.document.limitations.includes("NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE"));
  assert.ok(proj.document.limitations.includes("CLOCK_SKEW_DETECTED_CAUSAL_ORDER_PRESERVED"));
  assert.ok(proj.document.limitations.includes("PARALLEL_CAUSAL_BRANCHES_OBSERVED"));

  // Check step 1 (HTTP without explicit mavis.message.sort attribute) remains UNKNOWN (R1)
  const msg1 = proj.document.messages.find((m) => m.messageId === "msg-obs-1");
  assert.ok(msg1);
  assert.equal(msg1.messageSort, "UNKNOWN");
  assert.ok(
    proj.document.limitations.includes(
      "UNCLASSIFIED_MESSAGE_SORT_WITHOUT_EXPLICIT_SPAN_ATTRIBUTE",
    ),
  );

  // Check causal parent linkage across internal CLIENT span (msg-obs-2 -> msg-obs-1)
  const msg2 = proj.document.messages.find((m) => m.messageId === "msg-obs-2");
  assert.ok(msg2);
  assert.deepEqual(msg2.causalParentMessageIds, ["msg-obs-1"]);
  assert.equal(msg2.messageSort, "SYNCH_CALL");

  // Check parallel sibling branch (msg-obs-3 is a sibling of msg-obs-1 from gwRoot, ASYNCH_SIGNAL, null duration/status preserved)
  const msg3 = proj.document.messages.find((m) => m.messageId === "msg-obs-3");
  assert.ok(msg3);
  assert.deepEqual(msg3.causalParentMessageIds, []);
  assert.equal(msg3.messageSort, "ASYNCH_SIGNAL");
  assert.equal(msg3.httpStatusCode, null);
  assert.equal(msg3.durationMs, null);

  // Duplicate display name ambiguity test: if model has 2 SERVICE_CONTAINERs with name "dup-service" and no canonical elementId is provided, must mark AMBIGUOUS (never guess elements[0]!)
  const modelWithDuplicates = {
    ...model,
    elements: [
      ...model.elements,
      {
        id: "dup-1111",
        name: "dup-service",
        layer: "domain",
        elementType: "SERVICE_CONTAINER",
        description: "Duplicate A",
        evidence: [],
      },
      {
        id: "dup-2222",
        name: "dup-service",
        layer: "domain",
        elementType: "SERVICE_CONTAINER",
        description: "Duplicate B",
        evidence: [],
      },
    ],
  };

  const ambiguousProj = projectObservedSequenceToInteraction(
    {
      ...mappedSequence,
      steps: [
        {
          stepOrder: 1,
          messageId: "msg-amb-1",
          callerService: "api-gateway",
          calleeService: "dup-service",
          operation: "GET /items",
          httpMethod: "GET",
          httpStatusCode: 200,
          durationMs: 12,
          traceId: "trace-amb",
          spanId: "span-amb-1",
        },
      ],
    },
    modelWithDuplicates,
  );
  const dupParticipant = ambiguousProj.document.participants.find((p) => p.name === "dup-service");
  assert.ok(dupParticipant);
  assert.equal(dupParticipant.resolutionStatus, "AMBIGUOUS");
  assert.equal(dupParticipant.modelElementId, null);

  // Test Create designed copy from observed
  const hybridCopy = createDesignedCopyFromObserved(proj.document, model, "Checkout Hybrid");
  assert.equal(hybridCopy.mode, "HYBRID");
  assert.equal(hybridCopy.modelId, model.id);
  assert.ok(hybridCopy.limitations.includes("DESIGNED_OVERLAY_COPIED_FROM_OBSERVED_TRACE"));
});

test("Fixture 6 (Persistence, V0 Migration & Draw.io Round-Trip): V0 CODE_DEPENDENCY -> UNKNOWN, stripped mxGraphModel attributes, layoutX preservation, structural conflict detection, and XML special characters", () => {
  const model = createM3ReferenceModel();
  // Legacy V0 scenario with repeated edges and CODE_DEPENDENCY
  const legacyV0 = {
    modelId: model.id,
    name: 'Legacy Flow & <Special> "Chars"',
    edgeIds: [
      model.edges[0].id,
      model.edges[1].id,
      model.edges[1].id, // repeated edge!
      model.edges[3].id, // CODE_DEPENDENCY!
    ],
  };

  const upgraded = upgradeLegacyScenarioDesign(legacyV0, model);
  assert.equal(upgraded.messages.length, 4);
  // CODE_DEPENDENCY is upgraded to UNKNOWN (not SYNCH_CALL) and semanticStatus is PARTIAL
  assert.equal(upgraded.messages[3].messageSort, "UNKNOWN");
  assert.equal(upgraded.semanticStatus, "PARTIAL");
  assert.equal(upgraded.provenance.migratedFromV0, true);
  assert.deepEqual(upgraded.legacyV0Scenario, legacyV0);

  // Render XML with special characters in labels & guards
  upgraded.messages[0].label = 'POST /orders?filter=a&b<c>"d"';
  upgraded.messages[0].guard = 'x < 10 && y > 2 && name == "ok"';
  const xml = interactionToDrawioXml(upgraded, model);

  // Simulate Draw.io editor stripping custom attributes from <mxGraphModel> AND dragging participant-1 horizontally to x="420"
  const strippedRootXml = xml
    .replace(/<mxGraphModel[^>]*>/, '<mxGraphModel page="0" grid="0">')
    .replace(
      /(<mxCell id="participant-1"[^>]*><mxGeometry\s+x=")\d+(")/,
      "$1420$2",
    );

  // Extract back: must succeed via <mxCell id="title" mavisRole="metadata-carrier" mavisInteraction="...">
  const extracted = extractInteractionFromDrawioXml(strippedRootXml, model);
  assert.ok(extracted, "Must recover InteractionDocument even when <mxGraphModel> custom attributes are stripped");
  assert.equal(extracted.document.name, 'Legacy Flow & <Special> "Chars"');
  assert.equal(extracted.document.messages[0].label, 'POST /orders?filter=a&b<c>"d"');
  assert.equal(extracted.document.messages[0].guard, 'x < 10 && y > 2 && name == "ok"');
  assert.equal(extracted.document.participants[1].layoutX, 420);
  assert.equal(extracted.roundTripConflicts.length, 0);

  // Backward compatibility: readScenarioDesign still works on V2 XML
  const compatV0 = readScenarioDesign(strippedRootXml, model);
  assert.ok(compatV0);
  assert.deepEqual(compatV0.edgeIds, legacyV0.edgeIds);

  // Relayout resets custom layoutX back to deterministic column spacing
  const relayoutedXml = relayoutSequenceDrawioXml(strippedRootXml, model);
  const afterRelayout = extractInteractionFromDrawioXml(relayoutedXml, model);
  assert.equal(afterRelayout.document.participants[1].layoutX, 330);

  // Simulate structural tampering in Draw.io: rewiring step-0 target from participant-1 to participant-2
  const tamperedXml = strippedRootXml.replace(
    /(<mxCell id="step-0"[^>]*target=")participant-1(")/,
    "$1participant-2$2",
  );
  const tamperedResult = extractInteractionFromDrawioXml(tamperedXml, model);
  assert.ok(tamperedResult);
  assert.ok(tamperedResult.roundTripConflicts.length > 0);
  assert.match(tamperedResult.roundTripConflicts[0], /REWIRED_MESSAGE_TARGET_IN_DRAWIO/);
  // Canonical message endpoint is preserved despite Draw.io visual arrow tampering
  assert.equal(
    tamperedResult.document.messages[0].toParticipantId,
    upgraded.participants[1].participantId,
  );
});

test("Fixture 7 (3E Scope Isolation): canonical element/relationship resolution, multi-edge drilldown gating, fragment/unmapped AI gating, and stale AI response rejection on scope switch", () => {
  const model = createM3ReferenceModel();
  const baseDoc = upgradeLegacyScenarioDesign(
    {
      modelId: model.id,
      name: "3E Scope Test",
      edgeIds: [model.edges[0].id, model.edges[1].id],
    },
    model,
  );
  baseDoc.fragments.push({
    fragmentId: "frag-alt-scope",
    operator: "alt",
    label: "Auth branch",
    coveredParticipantIds: [baseDoc.participants[0].participantId],
    provenance: "DESIGNED",
    operands: [{ operandId: "op-1", guard: "valid", messageIds: ["msg-1"] }],
  });

  // 1. Resolved participant -> canonical modelElementId
  const partSeqCtx = resolveSequenceSelectionContext(
    baseDoc,
    baseDoc.participants[0].participantId,
  );
  const part3E = buildThreeESubjectContext({
    model,
    selectedId: model.elements[0].id,
    sequenceContext: partSeqCtx,
  });
  assert.equal(part3E.scopeKind, "node");
  assert.equal(part3E.canExplain, true);
  assert.deepEqual(part3E.evidenceQueryParam, {
    modelId: model.id,
    elementId: model.elements[0].id,
  });

  // 2. Single-relationship message -> canonical relationshipId
  const msgSeqCtx = resolveSequenceSelectionContext(baseDoc, "msg-1");
  const msg3E = buildThreeESubjectContext({
    model,
    selectedId: model.edges[0].id,
    sequenceContext: msgSeqCtx,
  });
  assert.equal(msg3E.scopeKind, "source");
  assert.equal(msg3E.canExplain, true);
  assert.deepEqual(msg3E.evidenceQueryParam, {
    modelId: model.id,
    relationshipId: model.edges[0].id,
  });

  // 3. Multi-relationship message -> group mode until drilled down
  const multiRelSeqCtx = {
    ...msgSeqCtx,
    itemId: "msg-multi",
    sourceRelationshipIds: [model.edges[0].id, model.edges[1].id],
  };
  const group3E = buildThreeESubjectContext({
    model,
    selectedId: "msg-multi",
    sequenceContext: multiRelSeqCtx,
  });
  assert.equal(group3E.isGroup, true);
  assert.equal(group3E.canExplain, false);
  assert.equal(group3E.evidenceQueryParam, null);
  assert.throws(() => group3E.buildExplainRequest(), /quan hệ gộp/);

  // Drill down into edges[1].id -> unlocks evidence & AI explain for edges[1].id
  const drilled3E = buildThreeESubjectContext({
    model,
    selectedId: "msg-multi",
    drilledSourceEdgeId: model.edges[1].id,
    sequenceContext: multiRelSeqCtx,
  });
  assert.equal(drilled3E.isGroup, false);
  assert.equal(drilled3E.canExplain, true);
  assert.deepEqual(drilled3E.evidenceQueryParam, {
    modelId: model.id,
    relationshipId: model.edges[1].id,
  });

  // 4. CombinedFragment -> sequence-fragment mode, blocks AI explain and evidence fetch
  const fragSeqCtx = resolveSequenceSelectionContext(baseDoc, "frag-alt-scope");
  const frag3E = buildThreeESubjectContext({
    model,
    selectedId: "frag-alt-scope",
    sequenceContext: fragSeqCtx,
  });
  assert.equal(frag3E.scopeKind, "sequence-fragment");
  assert.equal(frag3E.canExplain, false);
  assert.equal(frag3E.evidenceQueryParam, null);
  assert.throws(() => frag3E.buildExplainRequest(), /CombinedFragment/);

  // 5. Scope Reset & Stale AI Response Rejection across scenario / mode / session / trace / item switches
  const initialScopeKey = msg3E.scopeKey;
  // Valid response for current scope
  assert.equal(
    msg3E.validateExplainResponse(
      {
        modelVersionId: model.id,
        relationshipId: model.edges[0].id,
      },
      undefined,
      undefined,
      initialScopeKey,
    ),
    true,
  );

  // Switch traceId from trace-A to trace-B while AI Explain was in-flight for the same relationship
  const switchedTrace3E = buildThreeESubjectContext({
    model,
    selectedId: model.edges[0].id,
    sequenceContext: {
      ...msgSeqCtx,
      mode: "OBSERVED",
      sessionId: "sess-1",
      traceId: "trace-B",
    },
  });
  assert.notEqual(switchedTrace3E.scopeKey, initialScopeKey);
  assert.equal(
    switchedTrace3E.validateExplainResponse(
      {
        modelVersionId: model.id,
        relationshipId: model.edges[0].id,
      },
      undefined,
      undefined,
      initialScopeKey,
    ),
    false,
    "Must reject in-flight AI response from previous sequence scopeKey",
  );
});

test("Reviewer Repro R1: inferInitialMessageSortFromEdge, addEdgeStepToInteraction, addCustomMessageToInteraction, and changeMessageSortInInteraction preserve honest provenance and UNKNOWN sort until confirmed", () => {
  const model = createM3ReferenceModel();

  // 1. Transport/relation kind never auto-infers SYNCH_CALL or ASYNCH_SIGNAL without explicit sort evidence
  for (const kind of [
    "SERVICE_HTTP_CALL",
    "DATABASE_ACCESS",
    "DATABASE_QUERY",
    "MESSAGE_PUBLISH",
    "MESSAGE_SUBSCRIBE",
    "CODE_DEPENDENCY",
  ]) {
    const inferred = inferInitialMessageSortFromEdge(kind);
    assert.deepEqual(inferred, { messageSort: "UNKNOWN", isCertain: false });
  }
  assert.deepEqual(inferInitialMessageSortFromEdge("SERVICE_HTTP_CALL", "SYNCH_CALL"), {
    messageSort: "SYNCH_CALL",
    isCertain: true,
  });

  // 2. Adding edge steps in Designed mode keeps provenance="DESIGNED", messageSort="UNKNOWN", causalParentMessageIds=[], executions=[]
  let doc = upgradeLegacyScenarioDesign(
    { modelId: model.id, name: "R1 Provenance Honesty", edgeIds: [] },
    model,
  );
  doc = addEdgeStepToInteraction(doc, model, model.edges[0].id);
  doc = addEdgeStepToInteraction(doc, model, model.edges[1].id);
  assert.equal(doc.messages.length, 2);
  assert.equal(doc.messages[0].messageSort, "UNKNOWN");
  assert.equal(doc.messages[0].provenance, "DESIGNED");
  assert.deepEqual(doc.messages[0].causalParentMessageIds, []);
  assert.deepEqual(doc.messages[0].sourceRelationshipIds, [model.edges[0].id]);
  assert.equal(doc.messages[1].messageSort, "UNKNOWN");
  assert.equal(doc.messages[1].provenance, "DESIGNED");
  assert.deepEqual(doc.messages[1].causalParentMessageIds, []);
  assert.equal(doc.executions.length, 0);
  assert.equal(doc.semanticStatus, "PARTIAL");

  // 3. Changing message sort in Designed mode keeps provenance="DESIGNED" and updates semanticStatus when all sorts are confirmed
  doc = changeMessageSortInInteraction(doc, "msg-1", "SYNCH_CALL", model);
  doc = changeMessageSortInInteraction(doc, "msg-2", "ASYNCH_SIGNAL", model);
  assert.equal(doc.messages[0].messageSort, "SYNCH_CALL");
  assert.equal(doc.messages[0].provenance, "DESIGNED");
  assert.equal(doc.messages[0].isUncertain, false);
  assert.deepEqual(doc.messages[0].sourceRelationshipIds, [model.edges[0].id]);
  assert.equal(doc.semanticStatus, "COMPLETE");

  // 4. Composing a custom message between lifelines that also have a static relationship sets provenance="DESIGNED" and causalParentMessageIds=[]
  doc = addCustomMessageToInteraction(doc, model, {
    fromParticipantId: doc.participants[0].participantId,
    toParticipantId: doc.participants[1].participantId,
    label: "customVerifyOrder()",
    messageSort: "SYNCH_CALL",
    includeActivation: true,
  });
  const customMsg = doc.messages[2];
  assert.equal(customMsg.provenance, "DESIGNED");
  assert.deepEqual(customMsg.causalParentMessageIds, []);
  assert.deepEqual(customMsg.sourceRelationshipIds, [model.edges[0].id]);
  assert.equal(doc.executions.length, 1);
  assert.equal(doc.executions[0].provenance, "DESIGNED");
});

test("Reviewer Repro R2: projectObservedSequenceToInteraction performs Kahn causal topological sort before pagination and preserves all sorted candidateRelationshipIds when ambiguous", () => {
  const baseModel = createM3ReferenceModel();

  // 1. Causal parent order vs stepOrder (exact reviewer repro: child has stepOrder=1, parent has stepOrder=2)
  const outOfOrderPayload = {
    sessionId: "33333333-3333-4333-8333-333333333333",
    modelId: baseModel.id,
    steps: [
      {
        stepOrder: 1,
        messageId: "child",
        callerService: "order-service",
        calleeService: "payment-service",
        callerElementId: baseModel.elements[1].id,
        calleeElementId: baseModel.elements[2].id,
        callerResolutionStatus: "RESOLVED",
        calleeResolutionStatus: "RESOLVED",
        operation: "childOp",
        messageSort: "SYNCH_CALL",
        causalParentMessageIds: ["parent"],
        traceId: "t1",
      },
      {
        stepOrder: 2,
        messageId: "parent",
        callerService: "api-gateway",
        calleeService: "order-service",
        callerElementId: baseModel.elements[0].id,
        calleeElementId: baseModel.elements[1].id,
        callerResolutionStatus: "RESOLVED",
        calleeResolutionStatus: "RESOLVED",
        operation: "parentOp",
        messageSort: "SYNCH_CALL",
        causalParentMessageIds: [],
        traceId: "t1",
      },
    ],
  };

  const fullOrdered = projectObservedSequenceToInteraction(outOfOrderPayload, baseModel);
  assert.deepEqual(
    fullOrdered.document.messages.map((m) => m.messageId),
    ["parent", "child"],
    "Causal parent must precede child even when child has smaller stepOrder",
  );

  // Also verify topological sort happens BEFORE pagination (pageSize=1 -> page 0 is 'parent', page 1 is 'child')
  const page0 = projectObservedSequenceToInteraction(outOfOrderPayload, baseModel, {
    page: 0,
    pageSize: 1,
  });
  const page1 = projectObservedSequenceToInteraction(outOfOrderPayload, baseModel, {
    page: 1,
    pageSize: 1,
  });
  assert.deepEqual(
    page0.document.messages.map((m) => m.messageId),
    ["parent"],
  );
  assert.deepEqual(
    page1.document.messages.map((m) => m.messageId),
    ["child"],
  );
  assert.match(page1.paginationSplitWarning, /splits a causal call chain/);

  // 2. Missing causal parent and cycle detection
  const cyclePayload = {
    sessionId: "33333333-3333-4333-8333-333333333333",
    modelId: baseModel.id,
    steps: [
      {
        stepOrder: 1,
        messageId: "m-a",
        callerService: "api-gateway",
        calleeService: "order-service",
        callerElementId: baseModel.elements[0].id,
        calleeElementId: baseModel.elements[1].id,
        causalParentMessageIds: ["m-b", "missing-parent-id"],
        traceId: "t-cycle",
      },
      {
        stepOrder: 2,
        messageId: "m-b",
        callerService: "order-service",
        calleeService: "payment-service",
        callerElementId: baseModel.elements[1].id,
        calleeElementId: baseModel.elements[2].id,
        causalParentMessageIds: ["m-a"],
        traceId: "t-cycle",
      },
    ],
  };
  const cycleProj = projectObservedSequenceToInteraction(cyclePayload, baseModel);
  assert.ok(cycleProj.document.limitations.includes("MISSING_CAUSAL_PARENT_IN_TRACE"));
  assert.ok(cycleProj.document.limitations.includes("CAUSAL_CYCLE_DETECTED_IN_TRACE"));
  assert.equal(cycleProj.document.semanticStatus, "UNVERIFIED");

  // 3. Ambiguous static relationships between same endpoints (order-independent, preserves all candidates, gates 3E AI)
  const modelForward = {
    ...baseModel,
    edges: [
      {
        id: "rel-first",
        from: baseModel.elements[0].id,
        to: baseModel.elements[1].id,
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [],
      },
      {
        id: "rel-second",
        from: baseModel.elements[0].id,
        to: baseModel.elements[1].id,
        protocol: "MESSAGE_PUBLISH",
        originLayer: "SOURCE",
        resolutionStatus: "RESOLVED",
        evidenceCount: 1,
        evidence: [],
      },
    ],
  };
  const modelReversed = {
    ...modelForward,
    edges: [...modelForward.edges].reverse(),
  };

  const ambStepPayload = {
    sessionId: "33333333-3333-4333-8333-333333333333",
    modelId: baseModel.id,
    steps: [
      {
        stepOrder: 1,
        messageId: "m-amb-rel",
        callerService: "api-gateway",
        calleeService: "order-service",
        callerElementId: baseModel.elements[0].id,
        calleeElementId: baseModel.elements[1].id,
        callerResolutionStatus: "RESOLVED",
        calleeResolutionStatus: "RESOLVED",
        operation: "call",
        messageSort: "SYNCH_CALL",
        traceId: "t1",
      },
    ],
  };

  const projForward = projectObservedSequenceToInteraction(ambStepPayload, modelForward);
  const projReversed = projectObservedSequenceToInteraction(ambStepPayload, modelReversed);

  assert.deepEqual(projForward.document.messages[0].sourceRelationshipIds, [
    "rel-first",
    "rel-second",
  ]);
  assert.deepEqual(projReversed.document.messages[0].sourceRelationshipIds, [
    "rel-first",
    "rel-second",
  ]);
  assert.equal(projForward.document.messages[0].isUncertain, true);
  assert.equal(projForward.document.semanticStatus, "PARTIAL");
  assert.ok(
    projForward.document.limitations.includes("AMBIGUOUS_STATIC_RELATIONSHIP_CANDIDATES"),
  );

  // Verify 3E gates AI explanation until user drills down into a specific candidate relationship
  const ambSeqCtx = resolveSequenceSelectionContext(projForward.document, "m-amb-rel");
  const amb3E = buildThreeESubjectContext({
    model: modelForward,
    selectedId: "m-amb-rel",
    sequenceContext: ambSeqCtx,
  });
  assert.equal(amb3E.isGroup, true);
  assert.equal(amb3E.canExplain, false);
});

test("Reviewer Repro R3: extractInteractionFromDrawioXml detects deleted/edited messages, participants, labels, styles, fragments, interactionUses, executions, and unmapped added cells", () => {
  const model = createM3ReferenceModel();

  // 1. Exact reviewer repro file: output/m3/reviewer-inputs/deleted-message.drawio
  const deletedMessageXmlPath = path.resolve(
    root,
    "../output/m3/reviewer-inputs/deleted-message.drawio",
  );
  if (fs.existsSync(deletedMessageXmlPath)) {
    const reviewerDeletedXml = fs.readFileSync(deletedMessageXmlPath, "utf8");
    const extractedDeleted = extractInteractionFromDrawioXml(reviewerDeletedXml);
    assert.ok(extractedDeleted);
    assert.equal(extractedDeleted.document.messages.length, 3);
    assert.ok(
      extractedDeleted.roundTripConflicts.length > 0,
      "Deleting <mxCell id='step-0'> in Draw.io must report a structural conflict",
    );
    assert.ok(
      extractedDeleted.roundTripConflicts.some((c) =>
        c.includes("[DELETED_MESSAGE_IN_DRAWIO]"),
      ),
    );
    assert.equal(extractedDeleted.document.semanticStatus, "UNVERIFIED");
    assert.ok(
      extractedDeleted.document.limitations.includes(
        "DRAWIO_STRUCTURAL_CONFLICT_DETECTED",
      ),
    );
  }

  // 2. Build a complete interaction with fragment, interactionUse, and execution, then test tampering each element
  let doc = upgradeLegacyScenarioDesign(
    {
      modelId: model.id,
      name: "R3 Conflict Detection Suite",
      edgeIds: [model.edges[0].id, model.edges[1].id],
    },
    model,
  );
  doc = changeMessageSortInInteraction(doc, "msg-1", "SYNCH_CALL", model);
  doc = changeMessageSortInInteraction(doc, "msg-2", "SYNCH_CALL", model);
  doc.executions.push({
    executionId: "exec-1",
    participantId: doc.participants[1].participantId,
    startMessageId: "msg-1",
    endMessageId: "msg-1",
    nestingLevel: 0,
    provenance: "DESIGNED",
  });
  doc.fragments.push({
    fragmentId: "frag-1",
    operator: "alt",
    label: "Check",
    coveredParticipantIds: [doc.participants[0].participantId, doc.participants[1].participantId],
    provenance: "DESIGNED",
    operands: [
      { operandId: "op-1", guard: "ok", messageIds: ["msg-1"] },
      { operandId: "op-2", guard: "else", messageIds: ["msg-2"] },
    ],
  });
  doc.interactionUses.push({
    interactionUseId: "use-1",
    name: "AuditSubflow",
    targetInteractionId: "scenarios:designed:audit",
    targetViewId: "scenarios:designed:audit",
    coveredParticipantIds: [doc.participants[0].participantId],
    resolutionStatus: "RESOLVED",
    provenance: "DESIGNED",
  });

  const cleanXml = interactionToDrawioXml(doc, model);
  const cleanExtracted = extractInteractionFromDrawioXml(cleanXml, model);
  assert.equal(cleanExtracted.roundTripConflicts.length, 0);
  assert.equal(cleanExtracted.document.semanticStatus, "COMPLETE");

  // 2a. Delete participant-0
  const deletedPartXml = cleanXml.replace(/<mxCell id="participant-0"[\s\S]*?<\/mxCell>/, "");
  const resDeletedPart = extractInteractionFromDrawioXml(deletedPartXml, model);
  assert.ok(
    resDeletedPart.roundTripConflicts.some((c) => c.includes("[DELETED_PARTICIPANT_IN_DRAWIO]")),
  );
  assert.equal(resDeletedPart.document.semanticStatus, "UNVERIFIED");

  // 2b. Edit message label on step-0
  const editedMsgLabelXml = cleanXml.replace(
    /(<mxCell id="step-0"[^>]*value=")[^"]*(")/,
    "$11. TamperedLabel()$2",
  );
  const resEditedMsgLabel = extractInteractionFromDrawioXml(editedMsgLabelXml, model);
  assert.ok(
    resEditedMsgLabel.roundTripConflicts.some((c) => c.includes("[EDITED_MESSAGE_LABEL_IN_DRAWIO]")),
  );

  // 2c. Edit message arrow style on step-0 (solid -> dashed)
  const editedMsgStyleXml = cleanXml.replace(
    /(<mxCell id="step-0"[^>]*style="[^"]*)dashed=0;/,
    "$1dashed=1;",
  );
  const resEditedMsgStyle = extractInteractionFromDrawioXml(editedMsgStyleXml, model);
  assert.ok(
    resEditedMsgStyle.roundTripConflicts.some((c) =>
      c.includes("[EDITED_MESSAGE_SORT_STYLE_IN_DRAWIO]"),
    ),
  );

  // 2d. Delete CombinedFragment
  const deletedFragXml = cleanXml.replace(/<mxCell id="fragment-frag-1"[\s\S]*?<\/mxCell>/, "");
  const resDeletedFrag = extractInteractionFromDrawioXml(deletedFragXml, model);
  assert.ok(
    resDeletedFrag.roundTripConflicts.some((c) => c.includes("[DELETED_FRAGMENT_IN_DRAWIO]")),
  );

  // 2e. Delete InteractionUse
  const deletedUseXml = cleanXml.replace(/<mxCell id="interaction-use-use-1"[\s\S]*?<\/mxCell>/, "");
  const resDeletedUse = extractInteractionFromDrawioXml(deletedUseXml, model);
  assert.ok(
    resDeletedUse.roundTripConflicts.some((c) =>
      c.includes("[EDITED_OR_DELETED_INTERACTION_USE_IN_DRAWIO]"),
    ),
  );

  // 2f. Add unmapped vertex and edge in Draw.io
  const addedUnmappedXml = cleanXml.replace(
    "</root>",
    '<mxCell id="user-added-box" value=" rogue " vertex="1" parent="1"><mxGeometry x="10" y="10" width="50" height="20" as="geometry"/></mxCell><mxCell id="user-added-edge" value="rogueEdge" edge="1" parent="1" source="participant-0" target="participant-1"><mxGeometry relative="1" as="geometry"/></mxCell></root>',
  );
  const resAddedUnmapped = extractInteractionFromDrawioXml(addedUnmappedXml, model);
  assert.ok(
    resAddedUnmapped.roundTripConflicts.some((c) => c.includes("[ADDED_UNMAPPED_CELL_IN_DRAWIO]")),
  );
  assert.ok(
    resAddedUnmapped.roundTripConflicts.some((c) =>
      c.includes("[ADDED_UNMAPPED_MESSAGE_IN_DRAWIO]"),
    ),
  );
});

test("Reviewer Repro R4: Collision-free occurrence & execution ID allocation across add -> remove middle -> add -> reorder -> XML round-trip", () => {
  const model = createM3ReferenceModel();
  let doc = upgradeLegacyScenarioDesign(
    { modelId: model.id, name: "R4 ID Lifecycle", edgeIds: [] },
    model,
  );

  // Add 3 steps: msg-1, msg-2, msg-3
  doc = addEdgeStepToInteraction(doc, model, model.edges[0].id);
  doc = addEdgeStepToInteraction(doc, model, model.edges[1].id);
  doc = addEdgeStepToInteraction(doc, model, model.edges[2].id);
  assert.deepEqual(
    doc.messages.map((m) => m.messageId),
    ["msg-1", "msg-2", "msg-3"],
  );

  // Remove middle step (index 1 -> msg-2)
  doc = removeMessageFromInteraction(doc, 1, model);
  assert.deepEqual(
    doc.messages.map((m) => m.messageId),
    ["msg-1", "msg-3"],
    "Surviving messageIds must not be renumbered",
  );

  // Add a 3rd step again: must allocate msg-4 (NOT msg-3!)
  doc = addCustomMessageToInteraction(doc, model, {
    fromParticipantId: doc.participants[1].participantId,
    toParticipantId: doc.participants[0].participantId,
    label: "201 Created",
    messageSort: "REPLY",
    replyToMessageId: "msg-1",
    includeActivation: true,
  });
  assert.deepEqual(
    doc.messages.map((m) => m.messageId),
    ["msg-1", "msg-3", "msg-4"],
    "New message after middle deletion must allocate msg-4 without colliding with msg-3",
  );
  assert.equal(doc.executions.length, 1);
  assert.equal(doc.executions[0].executionId, "exec-1");

  // Add another custom message with activation, remove exec-1's message, and add again to test exec ID non-collision
  doc = addCustomMessageToInteraction(doc, model, {
    fromParticipantId: doc.participants[0].participantId,
    toParticipantId: doc.participants[1].participantId,
    label: "followUp()",
    messageSort: "SYNCH_CALL",
    includeActivation: true,
  });
  assert.deepEqual(
    doc.executions.map((e) => e.executionId),
    ["exec-1", "exec-2"],
  );

  // Reorder msg-4 up before msg-3
  doc = reorderMessageInInteraction(doc, 2, -1, model);
  assert.deepEqual(
    doc.messages.map((m) => m.messageId),
    ["msg-1", "msg-4", "msg-3", "msg-5"],
  );

  // Confirm sorts so validation is COMPLETE, then round-trip through Draw.io XML
  doc = changeMessageSortInInteraction(doc, "msg-1", "SYNCH_CALL", model);
  doc = changeMessageSortInInteraction(doc, "msg-3", "ASYNCH_SIGNAL", model);
  const val = validateInteractionDocument(doc, model);
  assert.equal(val.valid, true);
  assert.equal(val.semanticStatus, "COMPLETE");

  const xml = interactionToDrawioXml(doc, model);
  const extracted = extractInteractionFromDrawioXml(xml, model);
  assert.ok(extracted);
  assert.equal(extracted.roundTripConflicts.length, 0);
  assert.deepEqual(
    extracted.document.messages.map((m) => m.messageId),
    ["msg-1", "msg-4", "msg-3", "msg-5"],
  );
  assert.equal(extracted.document.messages[1].replyToMessageId, "msg-1");

  const deletedMessageFixtureXml = fs.readFileSync(
    path.resolve(__dirname, "./fixtures/deleted-message.drawio"),
    "utf8",
  );
  const extractedDeletedFixture = extractInteractionFromDrawioXml(deletedMessageFixtureXml);
  assert.ok(extractedDeletedFixture);
  assert.ok(extractedDeletedFixture.roundTripConflicts.length >= 1);
});

