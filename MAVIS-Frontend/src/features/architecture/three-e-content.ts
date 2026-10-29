import type { ArchitecturalModel, Evidence } from "@/types/domain";
import {
  ruleNamesVi,
  resultNamesVi,
  getRuleNameVi,
  getResultNameVi,
  sourceLabelVi,
  selectionSummaryVi,
  explainEvidenceSnippetSimplyVi,
  buildDeterministicThreeESimplifiedVi,
  threeERefusalMessageVi,
} from "@/lib/i18n/three-e-vi";

export { ruleNamesVi, resultNamesVi };

export function getRuleName(ruleId: string, locale: "en" | "vi" = "en"): string {
  if (locale === "vi") return getRuleNameVi(ruleId);
  return ruleNames[ruleId] ?? ruleId;
}

export function getResultName(status: string, locale: "en" | "vi" = "en"): string {
  if (locale === "vi") return getResultNameVi(status);
  return resultNames[status] ?? status;
}

export const RULE_SET = "3e-2";
export const ruleNames: Record<string, string> = {
  "RULE-01": "Cyclic dependencies between services",
  "RULE-02": "Data ownership boundary across services",
  "RULE-03": "Low-connectivity service in model",
  "RULE-04": "Evidence coverage for relationships",
  "RULE-05": "Mappings requiring verification",
};
export const resultNames: Record<string, string> = {
  PASS: "Passed within verified scope",
  VIOLATION: "Violation detected",
  NEEDS_REVIEW: "Needs verification",
  NOT_APPLICABLE: "Not applicable",
};
export function sourceLabel(evidence: Pick<Evidence, "kind" | "sourceType">, locale: "en" | "vi" = "en") {
  if (locale === "vi") return sourceLabelVi(evidence);
  const type = evidence.sourceType?.toUpperCase() ?? "";
  if (type.startsWith("RUNTIME")) return "Observed at runtime";
  if (type.includes("CONFIG") || type.includes("COMPOSE")) return "From configuration";
  if (type.includes("SOURCE") || type.includes("AST") || type.includes("CODE"))
    return "From source code";
  if (type.includes("USER")) return "User confirmed";
  return "Unclassified source";
}
export function shortLocator(location: string) {
  const normalized = location.replaceAll("\\", "/");
  const extracted = normalized.match(/_source_extracted\/[^/]+\/(.+)$/);
  if (extracted) return extracted[1]!;
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/"))
    return normalized.split("/").slice(-3).join("/");
  return normalized || "No source location";
}
export function selectionSummary(model: ArchitecturalModel, id: string, locale: "en" | "vi" = "en") {
  if (locale === "vi") return selectionSummaryVi(model, id);
  const node = model.elements.find((node) => node.id === id),
    edge = model.edges.find((edge) => edge.id === id);
  const name = (id: string) =>
    model.elements.find((node) => node.id === id)?.name ?? "Unresolved element";
  if (edge) {
    const umlRelKind =
      typeof edge.properties?.["umlRelationKind"] === "string"
        ? edge.properties["umlRelationKind"]
        : null;
    const meaning: Record<string, string> = {
      DATABASE_ACCESS:
        "The model maps a data access relationship. Inspect both source code and datasource configuration to verify the target datastore.",
      DECLARED_COMPOSE:
        "Deployment configuration declares a startup dependency; this relationship does not prove runtime API calls or data access.",
      CODE_DEPENDENCY: umlRelKind
        ? `Source code declares a UML ${umlRelKind} relationship between two classifiers; execution order is not implied.`
        : "Source code declares a static dependency between components; execution order is not implied.",
      SERVICE_HTTP_CALL:
        "The model records a declared HTTP dependency. Inspect evidence to distinguish static declarations from observed runtime traffic.",
      DECLARED_LINK: "Compose declares a link between containers; it does not establish HTTP calls or business behavior.",
      CONFIGURATION_DEPENDENCY: "Configuration declares a configuration-server dependency; actual execution is not observed.",
      SERVICE_DISCOVERY: "Configuration declares a service registry/discovery dependency; runtime registration is not verified.",
      TRACING_EXPORT: "Configuration declares a trace exporter endpoint; actual trace delivery is not verified.",
      GATEWAY_ROUTE: "Configuration declares an HTTP route; it does not prove that any request traversed it.",
      CONFIGURED_ENDPOINT: "Configuration references an endpoint; a reference alone does not prove an invocation.",
      MESSAGE_PUBLISH:
        "Source or configuration declares publishing to a message channel; runtime delivery is not yet verified.",
      MESSAGE_SUBSCRIBE:
        "Source or configuration declares message consumption from a channel; runtime execution is not yet verified.",
    };
    return {
      title: `${name(edge.from)} → ${name(edge.to)}`,
      type: umlRelKind ? `UML Relationship · ${umlRelKind}` : "Architectural Relationship",
      summary:
        meaning[edge.protocol] ??
        "Relationship recorded in the architectural model. Inspect evidence to verify its semantics and scope.",
      connections: [edge],
      node,
      edge,
    };
  }
  const connections = model.edges.filter((edge) => edge.from === id || edge.to === id);
  const role: Record<string, [string, string]> = {
    SERVICE_CONTAINER: ["Service / Application Container", "Deployable service or application unit identified in the model."],
    COMPONENT: [
      "Internal Service Component",
      "Component extracted from source code; verify its architectural role in context.",
    ],
    CLASS_INTERFACE: [
      "UML Classifier (Class / Interface / Enum)",
      "Classifier extracted from source AST for UML Class, Package, Activity, and State projections.",
    ],
    DATABASE: [
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Logical Datastore"
        : "Database · Scope Requires Verification",
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Logical datastore target mapped from application configuration."
        : "Insufficient metadata on this node to distinguish a physical database server from a logical schema.",
    ],
    MESSAGE_CHANNEL: [
      "Message Channel",
      "Declared message publishing or consumption channel; runtime message traffic is not yet confirmed.",
    ],
    QUEUE_BROKER: [
      "Message Broker Infrastructure",
      "Messaging broker infrastructure resource identified in the model.",
    ],
    EXTERNAL_SYSTEM: [
      "External System",
      "Element classified as an external system; verify system boundary against project scope.",
    ],
  };
  const [type, summary] = role[node?.elementType ?? ""] ?? [
    "Architectural Element",
    "The architectural role of this element has not been fully classified.",
  ];
  const responsibilities: Record<string, string> = {
    "Exposes HTTP endpoints": "Source code declares a component exposing HTTP endpoints.",
    "Persists and retrieves application data":
      "Source code declares a component persisting and retrieving application data.",
    "Implements application operations":
      "Source code identifies a component implementing application business operations.",
    "Declares message publishing or handling endpoints":
      "Source code declares a component publishing or handling asynchronous messages.",
    "Spring application component": "Application component declared via Spring annotations.",
  };
  const responsibility =
    typeof node?.properties?.["responsibility"] === "string"
      ? responsibilities[node.properties["responsibility"]]
      : undefined;
  const children = model.elements.filter((child) => child.parentId === node?.id);
  const description =
    responsibility ??
    (node?.elementType === "SERVICE_CONTAINER" && children.length
      ? `The model groups ${children.length} extracted components inside this service.`
      : summary);
  const owner = model.elements.find((parent) => parent.id === node?.parentId);
  return {
    title: node?.name ?? "Unidentified",
    type,
    summary: description + (owner ? ` Owned by ${owner.name}.` : ""),
    connections,
    node,
    edge,
  };
}
export function findingRelated(finding: Record<string, unknown>, id: string) {
  const details = finding["details"] as Record<string, unknown> | null | undefined;
  return (
    finding["elementId"] === id ||
    finding["relationshipId"] === id ||
    [details?.["relatedElementIds"], details?.["relatedRelationshipIds"]].some(
      (ids) => Array.isArray(ids) && ids.includes(id),
    )
  );
}

export interface SequenceSelectionContext {
  interactionId: string;
  mode: "DESIGNED" | "OBSERVED" | "HYBRID" | string;
  sessionId?: string | null | undefined;
  traceId?: string | null | undefined;
  itemKind?: "participant" | "message" | "fragment" | "interaction-use" | undefined;
  itemId?: string | undefined;
  label?: string | undefined;
  modelElementId?: string | null | undefined;
  sourceRelationshipIds?: string[] | undefined;
  messageSort?: string | undefined;
  occurrenceIndex?: number | undefined;
  fromParticipantLabel?: string | undefined;
  toParticipantLabel?: string | undefined;
  guard?: string | null | undefined;
  provenance?: string | undefined;
  resolutionStatus?: string | undefined;
  evaluationStatus?: string | undefined;
  operator?: string | undefined;
  coveredParticipantLabels?: string[] | undefined;
  operandSummaries?: string[] | undefined;
  enclosedMessageLabels?: string[] | undefined;
  refTargetViewId?: string | null | undefined;
  runtimeEvidence?: {
    traceId?: string | null | undefined;
    spanId?: string | null | undefined;
    parentSpanId?: string | null | undefined;
    protocol?: string | null | undefined;
    httpMethod?: string | null | undefined;
    operation?: string | null | undefined;
    durationMs?: number | null | undefined;
    statusCode?: number | null | undefined;
    timestamp?: string | null | undefined;
  } | null | undefined;
}

export function resolveSequenceSelectionContext(
  interaction: {
    interactionId: string;
    mode: string;
    provenance?: {
      sessionId?: string | null | undefined;
      traceId?: string | null | undefined;
    } | undefined;
    sessionId?: string | null | undefined;
    traceId?: string | null | undefined;
    participants: Array<{
      participantId?: string | undefined;
      id?: string | undefined;
      name?: string | undefined;
      label?: string | undefined;
      modelElementId: string | null;
      provenance: string;
      resolutionStatus: string;
    }>;
    messages: Array<{
      messageId?: string | undefined;
      id?: string | undefined;
      sequenceIndex?: number | undefined;
      occurrenceIndex?: number | undefined;
      fromParticipantId: string;
      toParticipantId: string;
      label: string;
      messageSort: string;
      protocol?: string | null | undefined;
      httpMethod?: string | null | undefined;
      httpStatusCode?: number | null | undefined;
      durationMs?: number | null | undefined;
      traceId?: string | null | undefined;
      spanId?: string | null | undefined;
      parentSpanId?: string | null | undefined;
      guard?: string | null | undefined;
      sourceRelationshipIds: string[];
      provenance: string;
      resolutionStatus?: string | undefined;
    }>;
    fragments: Array<{
      fragmentId?: string | undefined;
      id?: string | undefined;
      operator: string;
      label?: string | null | undefined;
      coveredParticipantIds: string[];
      provenance: string;
      operands: Array<{
        operandId?: string | undefined;
        id?: string | undefined;
        guard: string;
        minIterations?: number | null | undefined;
        maxIterations?: number | string | null | undefined;
        messageIds: string[];
        nestedFragments?: unknown[] | undefined;
      }>;
    }>;
    interactionUses: Array<{
      interactionUseId?: string | undefined;
      id?: string | undefined;
      name?: string | undefined;
      interactionName?: string | undefined;
      targetInteractionId?: string | null | undefined;
      targetViewId?: string | null | undefined;
      coveredParticipantIds: string[];
      provenance: string;
    }>;
  },
  itemId: string,
  overrides?: {
    sessionId?: string | null | undefined;
    traceId?: string | null | undefined;
  },
): SequenceSelectionContext {
  const base = {
    interactionId: interaction.interactionId,
    mode: interaction.mode,
    sessionId:
      overrides?.sessionId !== undefined
        ? overrides.sessionId
        : (interaction.provenance?.sessionId ?? interaction.sessionId ?? null),
    traceId:
      overrides?.traceId !== undefined
        ? overrides.traceId
        : (interaction.provenance?.traceId ?? interaction.traceId ?? null),
  };

  const pIdOf = (p: (typeof interaction.participants)[number]) => p.participantId ?? p.id ?? "";
  const pLabelOf = (p: (typeof interaction.participants)[number]) => p.name ?? p.label ?? pIdOf(p);
  const mIdOf = (m: (typeof interaction.messages)[number]) => m.messageId ?? m.id ?? "";

  const participant = interaction.participants.find(
    (p) => pIdOf(p) === itemId || (p.modelElementId && p.modelElementId === itemId),
  );
  if (participant) {
    return {
      ...base,
      itemKind: "participant",
      itemId: pIdOf(participant),
      label: pLabelOf(participant),
      modelElementId: participant.modelElementId,
      provenance: participant.provenance,
      resolutionStatus: participant.resolutionStatus,
    };
  }

  // Search top-level and nested fragments
  type FragLike = (typeof interaction.fragments)[number];
  const findFragment = (frags: FragLike[]): FragLike | undefined => {
    for (const f of frags) {
      const fid = f.fragmentId ?? f.id ?? "";
      if (fid === itemId) return f;
      for (const op of f.operands) {
        if (Array.isArray(op.nestedFragments)) {
          const found = findFragment(op.nestedFragments as FragLike[]);
          if (found) return found;
        }
      }
    }
    return undefined;
  };

  const fragment = findFragment(interaction.fragments);
  if (fragment) {
    const fid = fragment.fragmentId ?? fragment.id ?? itemId;
    const pName = (pid: string) => {
      const found = interaction.participants.find((p) => pIdOf(p) === pid);
      return found ? pLabelOf(found) : pid;
    };
    const mName = (mid: string) =>
      interaction.messages.find((m) => mIdOf(m) === mid)?.label ?? mid;
    return {
      ...base,
      itemKind: "fragment",
      itemId: fid,
      label: fragment.label
        ? `[${fragment.operator}] ${fragment.label}`
        : `[${fragment.operator}] CombinedFragment`,
      operator: fragment.operator,
      provenance: fragment.provenance,
      evaluationStatus: "NOT_EVALUATED_STATIC_RULE",
      coveredParticipantLabels: fragment.coveredParticipantIds.map(pName),
      operandSummaries: fragment.operands.map(
        (op) =>
          `[${op.guard}]${
            op.minIterations !== null && op.minIterations !== undefined
              ? ` (${op.minIterations}..${op.maxIterations ?? "*"})`
              : ""
          }: ${op.messageIds.length} message(s)`,
      ),
      enclosedMessageLabels: fragment.operands.flatMap((op) => op.messageIds).map(mName),
    };
  }

  const use = interaction.interactionUses.find(
    (u) => (u.interactionUseId ?? u.id) === itemId,
  );
  if (use) {
    const uid = use.interactionUseId ?? use.id ?? itemId;
    const uname = use.name ?? use.interactionName ?? uid;
    const pName = (pid: string) => {
      const found = interaction.participants.find((p) => pIdOf(p) === pid);
      return found ? pLabelOf(found) : pid;
    };
    return {
      ...base,
      itemKind: "interaction-use",
      itemId: uid,
      label: `ref: ${uname}`,
      refTargetViewId: use.targetViewId ?? use.targetInteractionId ?? null,
      provenance: use.provenance,
      evaluationStatus: "NOT_EVALUATED_STATIC_RULE",
      coveredParticipantLabels: use.coveredParticipantIds.map(pName),
    };
  }

  const message =
    interaction.messages.find((m) => mIdOf(m) === itemId) ??
    interaction.messages.find((m) => m.sourceRelationshipIds.includes(itemId));
  if (message) {
    const mid = mIdOf(message);
    const occ = message.sequenceIndex ?? message.occurrenceIndex ?? 1;
    const fromPart = interaction.participants.find(
      (p) => pIdOf(p) === message.fromParticipantId,
    );
    const toPart = interaction.participants.find(
      (p) => pIdOf(p) === message.toParticipantId,
    );
    const hasRuntimeSpan = Boolean(
      message.traceId || message.spanId || message.durationMs !== undefined,
    );
    return {
      ...base,
      itemKind: "message",
      itemId: mid,
      label: message.label,
      sourceRelationshipIds: [...message.sourceRelationshipIds],
      messageSort: message.messageSort,
      occurrenceIndex: occ,
      fromParticipantLabel: fromPart ? pLabelOf(fromPart) : message.fromParticipantId,
      toParticipantLabel: toPart ? pLabelOf(toPart) : message.toParticipantId,
      guard: message.guard ?? null,
      provenance: message.provenance,
      resolutionStatus:
        message.resolutionStatus ??
        (message.sourceRelationshipIds.length === 1
          ? "RESOLVED"
          : message.sourceRelationshipIds.length > 1
            ? "AMBIGUOUS"
            : "UNMAPPED"),
      runtimeEvidence: hasRuntimeSpan
        ? {
            traceId: message.traceId ?? null,
            spanId: message.spanId ?? null,
            parentSpanId: message.parentSpanId ?? null,
            httpMethod: message.httpMethod ?? null,
            operation: message.label,
            durationMs: message.durationMs ?? null,
            statusCode: message.httpStatusCode ?? null,
          }
        : null,
    };
  }

  return {
    ...base,
    itemId,
    label: itemId,
  };
}

export interface ThreeESelectionContextParams {
  model: ArchitecturalModel;
  selectedId: string;
  projectedEdge?: ArchitecturalModel["edges"][number] | undefined;
  drilledSourceEdgeId?: string | null | undefined;
  sequenceContext?: SequenceSelectionContext | null | undefined;
}

export interface ThreeEExplainRequestPayload {
  modelVersionId: string;
  explanationScope: "ELEMENT" | "RELATIONSHIP" | "RULE_FINDING";
  elementId?: string | undefined;
  relationshipId?: string | undefined;
  findingId?: string | undefined;
  evaluationRunId?: string | undefined;
  forceRefresh: boolean;
}

export function computeSelectionScopeKey(params: ThreeESelectionContextParams): string {
  const { model, selectedId, projectedEdge, drilledSourceEdgeId, sequenceContext } = params;
  if (sequenceContext) {
    const seqRelIds = (sequenceContext.sourceRelationshipIds ?? []).filter((id) =>
      model.edges.some((e) => e.id === id),
    );
    const isSeqGroup =
      sequenceContext.itemKind === "message" &&
      !drilledSourceEdgeId &&
      seqRelIds.length > 1;
    const isSeqParticipantResolved =
      sequenceContext.itemKind === "participant" &&
      !!sequenceContext.modelElementId &&
      sequenceContext.resolutionStatus !== "AMBIGUOUS" &&
      sequenceContext.resolutionStatus !== "UNMAPPED" &&
      model.elements.some((el) => el.id === sequenceContext.modelElementId);
    const isSeqMessageSingleRel =
      sequenceContext.itemKind === "message" &&
      (!!drilledSourceEdgeId || seqRelIds.length === 1);

    const scopeKind =
      sequenceContext.itemKind === "fragment" || sequenceContext.itemKind === "interaction-use"
        ? "sequence-fragment"
        : isSeqParticipantResolved
          ? "node"
          : isSeqGroup
            ? "group"
            : isSeqMessageSingleRel
              ? "source"
              : "sequence-unmapped";

    const activeTargetId = isSeqParticipantResolved
      ? sequenceContext.modelElementId!
      : isSeqMessageSingleRel
        ? (drilledSourceEdgeId ?? seqRelIds[0]!)
        : (sequenceContext.itemId ?? selectedId);

    const memberSignature = isSeqGroup
      ? seqRelIds.slice().sort().join(",")
      : activeTargetId;

    return [
      model.id,
      "seq",
      sequenceContext.interactionId || "default",
      sequenceContext.mode || "DESIGNED",
      sequenceContext.sessionId || "none",
      sequenceContext.traceId || "all",
      sequenceContext.itemKind || "item",
      sequenceContext.itemId || selectedId,
      scopeKind,
      activeTargetId,
      memberSignature,
    ].join(":");
  }

  const isGroup =
    !drilledSourceEdgeId &&
    !!projectedEdge?.underlyingEdgeIds &&
    projectedEdge.underlyingEdgeIds.length > 1;

  const activeRelationshipId = drilledSourceEdgeId ?? selectedId;
  const summarySubject = selectionSummary(model, activeRelationshipId);
  const isNode = !!summarySubject.node;

  const scopeKind: "node" | "group" | "source" = isNode
    ? "node"
    : isGroup
      ? "group"
      : "source";

  const memberSignature = isGroup
    ? (projectedEdge?.underlyingEdgeIds ?? []).slice().sort().join(",")
    : isNode
      ? selectedId
      : activeRelationshipId;

  const activeTargetId = isNode ? selectedId : activeRelationshipId;
  return `${model.id}:${scopeKind}:${activeTargetId}:${memberSignature}`;
}

export interface ThreeESubjectContext {
  isGroup: boolean;
  canExplain: boolean;
  scopeKind: "node" | "group" | "source" | "sequence-fragment" | "sequence-unmapped";
  scopeKey: string;
  activeRelationshipId: string;
  activeTargetId: string;
  effectiveProjectedEdge?: ArchitecturalModel["edges"][number] | undefined;
  sequenceContext?: SequenceSelectionContext | null | undefined;
  subject: {
    title: string;
    type: string;
    summary: string;
    connections: ArchitecturalModel["edges"];
    node: ArchitecturalModel["elements"][number] | undefined;
    edge: ArchitecturalModel["edges"][number] | undefined;
  };
  evidenceQueryParam: ({ modelId: string } & ({ elementId: string } | { relationshipId: string })) | null;
  filterFindings: (findings: Record<string, unknown>[]) => Record<string, unknown>[];
  buildExplainRequest: (options?: {
    finding?: Record<string, unknown> | undefined;
    runId?: string | undefined;
    forceRefresh?: boolean | undefined;
  }) => ThreeEExplainRequestPayload;
  validateExplainResponse: (
    result: {
      modelVersionId: string;
      elementId?: string | null | undefined;
      relationshipId?: string | null | undefined;
      findingId?: string | null | undefined;
      evaluationRunId?: string | null | undefined;
    },
    finding?: Record<string, unknown> | undefined,
    runId?: string | undefined,
    requestScopeKey?: string | undefined,
  ) => boolean;
}

export function buildThreeESubjectContext(params: ThreeESelectionContextParams): ThreeESubjectContext {
  const { model, selectedId, projectedEdge, drilledSourceEdgeId, sequenceContext } = params;
  const scopeKey = computeSelectionScopeKey(params);

  if (sequenceContext && sequenceContext.itemKind) {
    // 1. CombinedFragment or InteractionUse
    if (sequenceContext.itemKind === "fragment" || sequenceContext.itemKind === "interaction-use") {
      const isFragment = sequenceContext.itemKind === "fragment";
      const activeTargetId = sequenceContext.itemId ?? selectedId;
      const covered = (sequenceContext.coveredParticipantLabels ?? []).join(", ") || "No assigned lifelines";
      const operandsText = (sequenceContext.operandSummaries ?? []).join(" · ");
      const summary = isFragment
        ? `CombinedFragment [${sequenceContext.operator ?? "alt"}] covering (${covered}). ${operandsText ? `Operands: ${operandsText}. ` : ""}Provenance: ${sequenceContext.provenance ?? "DESIGNED_ONLY"} · Static evaluation: ${sequenceContext.evaluationStatus ?? "NOT_EVALUATED_STATIC_RULE"}.`
        : `InteractionUse reference (${sequenceContext.label ?? activeTargetId})${sequenceContext.refTargetViewId ? ` → ${sequenceContext.refTargetViewId}` : ""} covering (${covered}). Provenance: ${sequenceContext.provenance ?? "DESIGNED_ONLY"} · Static evaluation: ${sequenceContext.evaluationStatus ?? "NOT_EVALUATED_STATIC_RULE"}.`;

      return {
        isGroup: false,
        canExplain: false,
        scopeKind: "sequence-fragment",
        scopeKey,
        activeRelationshipId: activeTargetId,
        activeTargetId,
        sequenceContext,
        subject: {
          title: sequenceContext.label ?? activeTargetId,
          type: isFragment
            ? `CombinedFragment [${sequenceContext.operator ?? "alt"}] · ${sequenceContext.provenance ?? "DESIGNED_ONLY"}`
            : `InteractionUse [ref] · ${sequenceContext.provenance ?? "DESIGNED_ONLY"}`,
          summary,
          connections: [],
          node: undefined,
          edge: undefined,
        },
        evidenceQueryParam: null,
        filterFindings: () => [],
        buildExplainRequest: () => {
          throw new Error(
            "Cannot request AI explanation for a CombinedFragment / InteractionUse block (DESIGNED_ONLY · NOT_EVALUATED_STATIC_RULE).",
          );
        },
        validateExplainResponse: () => false,
      };
    }

    // 2. Sequence Participant / Lifeline
    if (sequenceContext.itemKind === "participant") {
      const canonicalNode =
        sequenceContext.modelElementId &&
        sequenceContext.resolutionStatus !== "AMBIGUOUS" &&
        sequenceContext.resolutionStatus !== "UNMAPPED"
          ? model.elements.find((el) => el.id === sequenceContext.modelElementId)
          : undefined;

      if (canonicalNode) {
        const canonicalId = canonicalNode.id;
        const summarySubject = selectionSummary(model, canonicalId);
        return {
          isGroup: false,
          canExplain: true,
          scopeKind: "node",
          scopeKey,
          activeRelationshipId: canonicalId,
          activeTargetId: canonicalId,
          sequenceContext,
          subject: summarySubject,
          evidenceQueryParam: { modelId: model.id, elementId: canonicalId },
          filterFindings: (findings) => findings.filter((f) => findingRelated(f, canonicalId)),
          buildExplainRequest: (options) => {
            const f = options?.finding;
            return {
              modelVersionId: model.id,
              explanationScope: f ? "RULE_FINDING" : "ELEMENT",
              elementId: canonicalId,
              ...(f ? { findingId: String(f["id"]), evaluationRunId: options?.runId ?? "" } : {}),
              forceRefresh: !!options?.forceRefresh,
            };
          },
          validateExplainResponse: (result, finding, runId, requestScopeKey) => {
            if (requestScopeKey && requestScopeKey !== scopeKey) return false;
            if (result.modelVersionId !== model.id) return false;
            if (result.elementId !== canonicalId) return false;
            if (finding) {
              if (result.findingId !== String(finding["id"])) return false;
              if (runId && result.evaluationRunId !== runId) return false;
            }
            return true;
          },
        };
      }

      const activeTargetId = sequenceContext.itemId ?? selectedId;
      return {
        isGroup: false,
        canExplain: false,
        scopeKind: "sequence-unmapped",
        scopeKey,
        activeRelationshipId: activeTargetId,
        activeTargetId,
        sequenceContext,
        subject: {
          title: sequenceContext.label ?? activeTargetId,
          type: `Lifeline · ${sequenceContext.resolutionStatus ?? "UNMAPPED"} (${sequenceContext.provenance ?? "USER_DEFINED"})`,
          summary: `Lifeline "${sequenceContext.label ?? activeTargetId}" has status ${sequenceContext.resolutionStatus ?? "UNMAPPED"} (${sequenceContext.provenance ?? "USER_DEFINED"}) and is not uniquely mapped to a canonical architectural element in the model.`,
          connections: [],
          node: undefined,
          edge: undefined,
        },
        evidenceQueryParam: null,
        filterFindings: () => [],
        buildExplainRequest: () => {
          throw new Error(
            "Cannot request AI explanation for an unmapped or ambiguous lifeline (UNMAPPED / AMBIGUOUS).",
          );
        },
        validateExplainResponse: () => false,
      };
    }

    // 3. Sequence Message
    if (sequenceContext.itemKind === "message") {
      const validRelIds = (sequenceContext.sourceRelationshipIds ?? []).filter((id) =>
        model.edges.some((e) => e.id === id),
      );
      const effectiveRelId =
        drilledSourceEdgeId && validRelIds.includes(drilledSourceEdgeId)
          ? drilledSourceEdgeId
          : validRelIds.length === 1
            ? validRelIds[0]!
            : null;

      if (effectiveRelId) {
        const summarySubject = selectionSummary(model, effectiveRelId);
        const syntheticGroupEdge =
          validRelIds.length > 1
            ? (projectedEdge ?? {
                ...summarySubject.edge!,
                underlyingEdgeIds: validRelIds,
              })
            : projectedEdge;

        return {
          isGroup: false,
          canExplain: true,
          scopeKind: "source",
          scopeKey,
          activeRelationshipId: effectiveRelId,
          activeTargetId: effectiveRelId,
          effectiveProjectedEdge: syntheticGroupEdge,
          sequenceContext,
          subject: summarySubject,
          evidenceQueryParam: { modelId: model.id, relationshipId: effectiveRelId },
          filterFindings: (findings) => findings.filter((f) => findingRelated(f, effectiveRelId)),
          buildExplainRequest: (options) => {
            const f = options?.finding;
            return {
              modelVersionId: model.id,
              explanationScope: f ? "RULE_FINDING" : "RELATIONSHIP",
              relationshipId: effectiveRelId,
              ...(f ? { findingId: String(f["id"]), evaluationRunId: options?.runId ?? "" } : {}),
              forceRefresh: !!options?.forceRefresh,
            };
          },
          validateExplainResponse: (result, finding, runId, requestScopeKey) => {
            if (requestScopeKey && requestScopeKey !== scopeKey) return false;
            if (result.modelVersionId !== model.id) return false;
            if (result.relationshipId !== effectiveRelId) return false;
            if (finding) {
              if (result.findingId !== String(finding["id"])) return false;
              if (runId && result.evaluationRunId !== runId) return false;
            }
            return true;
          },
        };
      }

      if (validRelIds.length > 1) {
        const firstEdge = model.edges.find((e) => e.id === validRelIds[0])!;
        const syntheticGroupEdge: ArchitecturalModel["edges"][number] = projectedEdge ?? {
          ...firstEdge,
          underlyingEdgeIds: validRelIds,
        };
        const fromName =
          sequenceContext.fromParticipantLabel ??
          model.elements.find((n) => n.id === firstEdge.from)?.name ??
          firstEdge.from;
        const toName =
          sequenceContext.toParticipantLabel ??
          model.elements.find((n) => n.id === firstEdge.to)?.name ??
          firstEdge.to;
        const activeTargetId = sequenceContext.itemId ?? selectedId;

        return {
          isGroup: true,
          canExplain: false,
          scopeKind: "group",
          scopeKey,
          activeRelationshipId: activeTargetId,
          activeTargetId,
          effectiveProjectedEdge: syntheticGroupEdge,
          sequenceContext,
          subject: {
            title: `${fromName} → ${toName} · ${sequenceContext.label ?? "Sequence message"}`,
            type: `${sequenceContext.messageSort ?? firstEdge.protocol} · Aggregated Sequence Message (${validRelIds.length} member relationships)`,
            summary: `Sequence message between ${fromName} and ${toName} is linked to ${validRelIds.length} static relationships in the model. Select a specific member relationship before viewing evidence or requesting AI explanation.`,
            connections: model.edges.filter((e) => validRelIds.includes(e.id)),
            node: undefined,
            edge: syntheticGroupEdge,
          },
          evidenceQueryParam: null,
          filterFindings: (findings) =>
            findings.filter((f) => validRelIds.some((id) => findingRelated(f, id))),
          buildExplainRequest: () => {
            throw new Error(
              "Cannot request AI explanation in aggregated relationship mode. Select Details on a specific member relationship.",
            );
          },
          validateExplainResponse: () => false,
        };
      }

      // Unmapped sequence message (0 static sourceRelationshipIds)
      const activeTargetId = sequenceContext.itemId ?? selectedId;
      const fromName = sequenceContext.fromParticipantLabel ?? "Sender";
      const toName = sequenceContext.toParticipantLabel ?? "Receiver";
      return {
        isGroup: false,
        canExplain: false,
        scopeKind: "sequence-unmapped",
        scopeKey,
        activeRelationshipId: activeTargetId,
        activeTargetId,
        sequenceContext,
        subject: {
          title: `${fromName} → ${toName} · ${sequenceContext.label ?? activeTargetId}`,
          type: `Sequence Message (${sequenceContext.messageSort ?? "SYNCH_CALL"}) · ${sequenceContext.resolutionStatus ?? "UNMAPPED"} (${sequenceContext.provenance ?? "USER_DEFINED"})`,
          summary: `Sequence message #${sequenceContext.occurrenceIndex ?? "?"} (${sequenceContext.messageSort ?? "SYNCH_CALL"}) is not linked to a canonical static relationship (empty sourceRelationshipIds). Relationship evidence and AI Explain cannot be invoked with synthetic IDs.`,
          connections: [],
          node: undefined,
          edge: undefined,
        },
        evidenceQueryParam: null,
        filterFindings: () => [],
        buildExplainRequest: () => {
          throw new Error(
            "Cannot request AI explanation for a sequence message not linked to a canonical static relationship (UNMAPPED).",
          );
        },
        validateExplainResponse: () => false,
      };
    }
  }

  const isGroup =
    !drilledSourceEdgeId &&
    !!projectedEdge?.underlyingEdgeIds &&
    projectedEdge.underlyingEdgeIds.length > 1;

  const activeRelationshipId = drilledSourceEdgeId ?? selectedId;
  const summarySubject = selectionSummary(model, activeRelationshipId);
  const isNode = !!summarySubject.node;

  const scopeKind: "node" | "group" | "source" = isNode
    ? "node"
    : isGroup
      ? "group"
      : "source";

  const activeTargetId = isNode ? selectedId : activeRelationshipId;

  const groupFromNode = isGroup ? model.elements.find((n) => n.id === projectedEdge!.from) : undefined;
  const groupToNode = isGroup ? model.elements.find((n) => n.id === projectedEdge!.to) : undefined;
  const fromName = groupFromNode?.name ?? projectedEdge?.from ?? "";
  const toName = groupToNode?.name ?? projectedEdge?.to ?? "";

  const subject = isGroup
    ? {
        title: `${fromName} → ${toName}`,
        type: `${projectedEdge!.protocol} · Aggregated Relationship (${projectedEdge!.underlyingEdgeIds!.length} member relationships)`,
        summary: `Aggregated relationship between ${fromName} and ${toName} combining ${projectedEdge!.underlyingEdgeIds!.length} member relationships with the same direction and origin layer (${projectedEdge!.originLayer}).`,
        connections: model.edges.filter((e) => projectedEdge!.underlyingEdgeIds?.includes(e.id)),
        node: undefined,
        edge: projectedEdge!,
      }
    : summarySubject;

  const evidenceQueryParam = isNode
    ? { modelId: model.id, elementId: selectedId }
    : isGroup
      ? null
      : { modelId: model.id, relationshipId: activeRelationshipId };

  const filterFindings = (findings: Record<string, unknown>[]) => {
    if (isNode) {
      return findings.filter((f) => findingRelated(f, selectedId));
    }
    if (isGroup) {
      const groupEdgeIds = projectedEdge?.underlyingEdgeIds ?? [selectedId];
      return findings.filter((f) => groupEdgeIds.some((id) => findingRelated(f, id)));
    }
    return findings.filter((f) => findingRelated(f, activeRelationshipId));
  };

  const buildExplainRequest = (options?: {
    finding?: Record<string, unknown> | undefined;
    runId?: string | undefined;
    forceRefresh?: boolean | undefined;
  }): ThreeEExplainRequestPayload => {
    if (isGroup) {
      throw new Error(
        "Cannot request AI explanation in aggregated relationship mode. Select Details on a specific member relationship.",
      );
    }
    const f = options?.finding;
    const explanationScope = f ? "RULE_FINDING" : isNode ? "ELEMENT" : "RELATIONSHIP";
    return {
      modelVersionId: model.id,
      explanationScope,
      ...(isNode ? { elementId: selectedId } : { relationshipId: activeRelationshipId }),
      ...(f ? { findingId: String(f["id"]), evaluationRunId: options?.runId ?? "" } : {}),
      forceRefresh: !!options?.forceRefresh,
    };
  };

  const validateExplainResponse = (
    result: {
      modelVersionId: string;
      elementId?: string | null | undefined;
      relationshipId?: string | null | undefined;
      findingId?: string | null | undefined;
      evaluationRunId?: string | null | undefined;
    },
    finding?: Record<string, unknown> | undefined,
    runId?: string | undefined,
    requestScopeKey?: string | undefined,
  ): boolean => {
    if (isGroup) return false;
    if (requestScopeKey && requestScopeKey !== scopeKey) return false;
    if (result.modelVersionId !== model.id) return false;
    const expectedTarget = isNode ? selectedId : activeRelationshipId;
    const returnedTarget = isNode ? result.elementId : result.relationshipId;
    if (returnedTarget !== expectedTarget) return false;
    if (finding) {
      if (result.findingId !== String(finding["id"])) return false;
      if (runId && result.evaluationRunId !== runId) return false;
    }
    return true;
  };

  return {
    isGroup,
    canExplain: !isGroup,
    scopeKind,
    scopeKey,
    activeRelationshipId,
    activeTargetId,
    effectiveProjectedEdge: projectedEdge,
    sequenceContext,
    subject,
    evidenceQueryParam,
    filterFindings,
    buildExplainRequest,
    validateExplainResponse,
  };
}

export interface ThreeEAiSimplifiedExplanation {
  explainSimple: string;
  exploreSimple: string;
  evaluateSimple: string;
  snippetNotes?: Record<string, string>;
  assumptions?: string[];
  unknowns?: string[];
  grounding?: { status: "MODEL_ONLY" | "PARTIAL_SOURCE"; suppliedSnippets: number; omittedSnippets: number; notice: string };
  tokenStats?: {
    rawChars: number;
    compressedChars: number;
    savedPercent: number;
    provider: "openai" | "gemini" | "ast-skeleton";
  };
}

export interface ThreeEAiPromptContext {
  contextHash: string;
  targetId: string;
  title: string;
  type: string;
  elementType: string;
  summary: string;
  inboundPeers: string[];
  outboundPeers: string[];
  childComponents: string[];
  findingsSummary: string[];
  evidencePolicy?: "literal-source-v2";
  omittedSnippets?: number;
  codeSnippets: Array<{
    id: string;
    locator: string;
    sourceType: string;
    snippet: string;
  }>;
  otherElementNames?: string[];
  rawChars: number;
  compressedChars: number;
  savedPercent: number;
}

export function explainEvidenceSnippetSimply(
  item: Pick<Evidence, "kind" | "sourceType" | "location" | "snippet">,
  subjectTitle?: string,
  locale: "en" | "vi" = "en",
): string {
  if (locale === "vi") return explainEvidenceSnippetSimplyVi(item, subjectTitle);
  const loc = shortLocator(item.location);
  const snippet = item.snippet ?? "";
  const lower = (loc + "\n" + snippet).toLowerCase();
  const target = subjectTitle ? `"${subjectTitle}"` : "the selected item";

  if (item.sourceType?.toUpperCase().startsWith("RUNTIME")) {
    return `Observed runtime trace at ${loc}: records the invocation, latency, and response status of ${target}.`;
  }
  if (
    lower.includes("docker-compose") ||
    loc.endsWith(".yml") ||
    loc.endsWith(".yaml") ||
    loc.endsWith(".properties")
  ) {
    return `Infrastructure configuration evidence (${loc}): declares container settings, environment variables, exposed ports, or Database / Message Broker bindings for ${target}.`;
  }
  if (
    lower.includes("@restcontroller") ||
    lower.includes("@controller") ||
    lower.includes("@requestmapping") ||
    lower.includes("@postmapping") ||
    lower.includes("@getmapping") ||
    lower.includes("controller.java")
  ) {
    return `API entrypoint evidence (${loc}): handles inbound HTTP requests and delegates execution to the domain/service layer of ${target}.`;
  }
  if (
    lower.includes("saga") ||
    lower.includes("command") ||
    lower.includes("domainevent") ||
    lower.includes("eventpublisher") ||
    lower.includes("messageproducer") ||
    lower.includes("kafkatemplate")
  ) {
    return `Asynchronous Saga / Event messaging evidence (${loc}): publishes or consumes cross-service commands and domain events involving ${target}.`;
  }
  if (
    lower.includes("@entity") ||
    lower.includes("@table") ||
    lower.includes("repository") ||
    lower.includes("jparepository") ||
    lower.includes("crudrepository")
  ) {
    return `Persistence & data layer evidence (${loc}): defines the domain entity mapping or database repository operations for ${target}.`;
  }
  if (lower.includes("@service") || lower.includes("@transactional") || lower.includes("service.java")) {
    return `Application service layer evidence (${loc}): implements core business logic and transactional orchestration for ${target}.`;
  }
  if (lower.includes("pom.xml") || lower.includes("build.gradle")) {
    return `Build dependency declaration (${loc}): specifies module dependencies and libraries used by ${target}.`;
  }
  return `Source code evidence at ${loc} directly illustrating the declaration and behavior of ${target}.`;
}

function synthesizeAstEvidenceForElement(
  model: ArchitecturalModel,
  node: ArchitecturalModel["elements"][number],
): Evidence[] {
  const path =
    typeof node.properties?.["sourcePath"] === "string"
      ? node.properties["sourcePath"]
      : "Model metadata";
  const children = model.elements
    .filter((item) => item.parentId === node.id)
    .map((item) => item.name);
  return [
    {
      id: "ast-node-" + node.id,
      kind: "source",
      origin: "preview",
      sourceType: "MODEL_METADATA_PREVIEW",
      location: path,
      snippet: [
        "Model element: " + node.name,
        "Kind: " + (node.elementType ?? "Unknown"),
        "Source path: " + path,
        children.length ? "Child elements: " + children.join(", ") : "No child elements recorded.",
        "This metadata preview is not source code and does not establish implementation behavior.",
      ].join("\n"),
      complete: false,
    },
  ];
}
function synthesizeAstEvidenceForEdge(
  model: ArchitecturalModel,
  edge: ArchitecturalModel["edges"][number],
): Evidence[] {
  const name = (id: string) => model.elements.find((node) => node.id === id)?.name ?? id;
  return [
    {
      id: "ast-edge-" + edge.id,
      kind: "source",
      origin: "preview",
      sourceType: "MODEL_METADATA_PREVIEW",
      location: "Model relationship",
      snippet: [
        "Relationship: " + edge.protocol,
        "Source: " + name(edge.from),
        "Target: " + name(edge.to),
        "No verbatim implementation snippet is attached. HTTP methods, database engine, execution order and business purpose are unknown.",
      ].join("\n"),
      complete: false,
    },
  ];
}

export function collectConcreteThreeEEvidences(
  model: ArchitecturalModel,
  ctx: ThreeESubjectContext,
  apiEvidences?: readonly Evidence[] | null,
  citedEvidences?: readonly Evidence[] | null,
): Evidence[] {
  const seen = new Set<string>();
  const collected: Evidence[] = [];

  const pushIfValid = (ev: Evidence | undefined | null) => {
    if (!ev) return;
    const snippet = (ev.snippet ?? "").trim();
    if (!snippet) return;
    const dedupeKey = `${shortLocator(ev.location)}::${snippet.slice(0, 120)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    collected.push(ev);
  };

  for (const ev of apiEvidences ?? []) pushIfValid(ev);
  for (const ev of citedEvidences ?? []) pushIfValid(ev);

  const { node, edge } = ctx.subject;
  if (node) {
    for (const ev of node.evidence ?? []) pushIfValid(ev);
    // Also gather concrete code snippets from child components/classes inside this container/component
    const children = model.elements.filter((el) => el.parentId === node.id);
    for (const child of children) {
      for (const ev of child.evidence ?? []) {
        pushIfValid(ev);
        if (collected.length >= 10) break;
      }
      if (collected.length >= 10) break;
    }
    // Also gather concrete code snippets from connected edges
    if (collected.length < 6) {
      const connEdges = model.edges.filter((e) => e.from === node.id || e.to === node.id);
      for (const ce of connEdges) {
        for (const ev of ce.evidence ?? []) {
          pushIfValid(ev);
          if (collected.length >= 10) break;
        }
        if (collected.length >= 10) break;
      }
    }
    // If still no concrete snippets with code, synthesize from AST metadata or child components
    if (collected.length === 0) {
      for (const child of children.slice(0, 4)) {
        for (const synth of synthesizeAstEvidenceForElement(model, child)) {
          pushIfValid({ ...synth, origin: "preview", sourceType: "MODEL_METADATA_PREVIEW", complete: false });
        }
      }
      for (const synth of synthesizeAstEvidenceForElement(model, node)) {
        pushIfValid({ ...synth, origin: "preview", sourceType: "MODEL_METADATA_PREVIEW", complete: false });
      }
    }
  } else if (edge) {
    for (const ev of edge.evidence ?? []) pushIfValid(ev);
    if (edge.underlyingEdgeIds && edge.underlyingEdgeIds.length > 0) {
      for (const subId of edge.underlyingEdgeIds) {
        const subEdge = model.edges.find((e) => e.id === subId);
        for (const ev of subEdge?.evidence ?? []) {
          pushIfValid(ev);
          if (collected.length >= 10) break;
        }
      }
    }
    if (collected.length === 0) {
      for (const synth of synthesizeAstEvidenceForEdge(model, edge)) {
        pushIfValid({ ...synth, origin: "preview", sourceType: "MODEL_METADATA_PREVIEW", complete: false });
      }
    }
  }

  return collected;
}

export function buildDeterministicThreeESimplified(
  model: ArchitecturalModel,
  ctx: ThreeESubjectContext,
  concreteEvidences: readonly Evidence[],
  matchingFindings: readonly Record<string, unknown>[],
  locale: "en" | "vi" = "en",
): ThreeEAiSimplifiedExplanation {
  if (locale === "vi") return buildDeterministicThreeESimplifiedVi(model, ctx, concreteEvidences, matchingFindings);
  const { node, edge, title, connections } = ctx.subject;
  const saved = concreteEvidences.filter(
    (ev) => ev.origin !== "preview" && ev.sourceType !== "MODEL_METADATA_PREVIEW",
  );
  const kinds: Record<string, string> = {
    DECLARED_COMPOSE: "a startup dependency; it does not prove HTTP traffic",
    SERVICE_HTTP_CALL:
      "a declared HTTP dependency; runtime traffic and business purpose are not established",
    CONFIGURATION_DEPENDENCY: "a configured configuration-server dependency",
    SERVICE_DISCOVERY: "a configured service-discovery dependency",
    TRACING_EXPORT: "a configured tracing exporter",
    GATEWAY_ROUTE: "a configured HTTP gateway route",
    CONFIGURED_ENDPOINT: "a configured endpoint reference; invocation is not established",
  };
  const explainSimple = node
    ? 'The model classifies "' +
      title +
      '" as ' +
      (node.elementType ?? "an element") +
      ". Its name and dependency count do not establish a business role or runtime behavior."
    : edge
      ? "The model records " +
        (kinds[edge.protocol] ?? "a declared " + edge.protocol + " relationship") +
        "."
      : ctx.subject.summary;
  const grounding = {
    status: saved.length ? ("PARTIAL_SOURCE" as const) : ("MODEL_ONLY" as const),
    suppliedSnippets: Math.min(saved.length, 6),
    omittedSnippets: Math.max(0, saved.length - 6),
    notice: saved.length
      ? "Interpretation of selected evidence only; this is not a complete source or runtime verification."
      : "Model metadata only. No saved source snippet is available; implementation behavior and business roles are unknown.",
  };
  return {
    explainSimple,
    exploreSimple: saved.length
      ? saved.length +
        " saved source/configuration snippet(s) are attached (" +
        saved
          .slice(0, 3)
          .map((item) => shortLocator(item.location))
          .join(", ") +
        "); inspect their exact scope below."
      : "No saved source snippet is attached. Metadata reconstructions are previews, not source evidence.",
    evaluateSimple: matchingFindings.length
      ? matchingFindings.length +
        " recorded finding(s) require review: " +
        String(matchingFindings[0]?.["message"] ?? "Details unavailable")
      : "No findings are attached to this selection. This does not establish correctness, low coupling or operational safety (" +
        connections.length +
        " declared connection(s)).",
    snippetNotes: Object.fromEntries(
      concreteEvidences.map((ev) => [
        ev.id,
        ev.origin === "preview"
          ? "Metadata preview only; this is not verbatim source and cannot prove implementation details."
          : explainEvidenceSnippetSimply(ev, title),
      ]),
    ),
    assumptions: [],
    unknowns: [grounding.notice],
    grounding,
  };
}

export function buildThreeEAiContext(
  model: ArchitecturalModel,
  ctx: ThreeESubjectContext,
  concreteEvidences: readonly Evidence[],
  matchingFindings: readonly Record<string, unknown>[],
): ThreeEAiPromptContext {
  const { node, edge, title, type, summary, connections } = ctx.subject;
  const peerName = (id: string) => model.elements.find((n) => n.id === id)?.name ?? id;

  const inboundPeers = node
    ? [
        ...new Set(
          connections
            .filter((e) => e.to === node.id)
            .map((e) => `${peerName(e.from)} [${e.protocol}]`),
        ),
      ].slice(0, 8)
    : edge
      ? [peerName(edge.from)]
      : [];
  const outboundPeers = node
    ? [
        ...new Set(
          connections
            .filter((e) => e.from === node.id)
            .map((e) => `${peerName(e.to)} [${e.protocol}]`),
        ),
      ].slice(0, 8)
    : edge
      ? [peerName(edge.to)]
      : [];
  const childComponents = node
    ? model.elements
        .filter((el) => el.parentId === node.id)
        .slice(0, 10)
        .map((el) => el.name)
    : [];

  const findingsSummary = matchingFindings
    .slice(0, 4)
    .map((f) => `${String(f["ruleId"] ?? "RULE")}: ${String(f["message"] ?? "")}`);

  const savedSnippets = concreteEvidences.filter(
    (ev) => ev.origin !== "preview" && ev.sourceType !== "MODEL_METADATA_PREVIEW",
  );
  const codeSnippets = savedSnippets.slice(0, 6).map((ev) => ({
    id: ev.id,
    locator: shortLocator(ev.location),
    sourceType: ev.sourceType ?? ev.kind,
    snippet: ev.snippet.slice(0, 380),
  }));

  const rawChars =
    JSON.stringify(ctx.subject).length +
    concreteEvidences.reduce((sum, e) => sum + (e.snippet?.length ?? 0), 0);
  const compressedPayload = JSON.stringify({
    title,
    type,
    inboundPeers,
    outboundPeers,
    childComponents,
    findingsSummary,
    codeSnippets,
  });
  const compressedChars = compressedPayload.length;
  const savedPercent =
    rawChars > compressedChars ? Math.round(((rawChars - compressedChars) / rawChars) * 100) : 15;

  const relatedElementIds = new Set<string>();
  if (node) {
    relatedElementIds.add(node.id);
    if (node.parentId) relatedElementIds.add(node.parentId);
    for (const c of connections) {
      relatedElementIds.add(c.from);
      relatedElementIds.add(c.to);
    }
    for (const el of model.elements) {
      if (el.parentId === node.id) relatedElementIds.add(el.id);
    }
  } else if (edge) {
    relatedElementIds.add(edge.from);
    relatedElementIds.add(edge.to);
  }
  const otherElementNames = model.elements
    .filter((el) => !relatedElementIds.has(el.id) && el.name.trim().length >= 4)
    .map((el) => el.name.trim())
    .slice(0, 40);

  let evidenceHash = 2166136261;
  for (const char of JSON.stringify(codeSnippets)) {
    evidenceHash ^= char.charCodeAt(0);
    evidenceHash = Math.imul(evidenceHash, 16777619);
  }
  return {
    contextHash: `3e:${model.id}:literal-source-v2:${ctx.scopeKey}:ev${(evidenceHash >>> 0).toString(16)}:f${matchingFindings.length}`,
    targetId: ctx.activeTargetId,
    title,
    type,
    elementType: node?.elementType ?? edge?.protocol ?? "ELEMENT",
    summary,
    inboundPeers,
    outboundPeers,
    childComponents,
    findingsSummary,
    codeSnippets,
    evidencePolicy: "literal-source-v2",
    omittedSnippets: Math.max(0, savedSnippets.length - codeSnippets.length),
    otherElementNames,
    rawChars: Math.max(rawChars, compressedChars),
    compressedChars,
    savedPercent,
  };
}

const OFF_TOPIC_GUARDRAIL_REGEX =
  /(ăn gì|uống gì|món ăn|nấu ăn|cơm trưa|cơm tối|ăn cơm|ăn phở|ăn bún|trà sữa|cà phê|nhà hàng|quán ăn|đi chơi|du lịch|mua sắm|thời tiết|trời mưa|trời nắng|nhiệt độ|xem bói|tử vi|cung hoàng đạo|xổ số|lô đề|bóng đá|ca sĩ|bài hát|xem phim|kể chuyện|chuyện cười|làm thơ|viết thơ|chứng khoán|cổ phiếu|bitcoin|crypto|giá vàng|tỷ giá|ignore previous|ignore all|disregard|system prompt|jailbreak|bỏ qua hướng dẫn|quên hướng dẫn)/i;

const CHITCHAT_ONLY_REGEX =
  /^(hi|hello|hey|xin chào|chào|chào bạn|alo|ok|test|abc|123|haha|hihi|keke|wtf|ờ|ừ|vậy à|sao thế|khỏe không|bạn là ai|who are you|what's up)[?!.\s]*$/i;

const ARCH_DOMAIN_KEYWORDS_REGEX =
  /(service|microservice|api|rest|http|https|grpc|graphql|endpoint|route|routing|gateway|proxy|controller|repository|repo|entity|model|dto|class|interface|method|function|hàm|lớp|code|mã nguồn|source|snippet|file|tệp|package|module|component|container|layer|tầng|domain|edge|platform|database|db|sql|postgres|postgresql|mysql|mongo|redis|cache|queue|broker|kafka|rabbit|event|message|topic|channel|saga|transaction|async|sync|đồng bộ|bất đồng bộ|call|caller|callee|luồng gọi|luồng|flow|request|response|payload|port|cổng|config|cấu hình|docker|compose|yaml|yml|pom|gradle|spring|jpa|hibernate|jdbc|bean|annotation|dependency|dependencies|phụ thuộc|kết nối|connection|relationship|quan hệ|inbound|outbound|upstream|downstream|peer|client|server|node|kiến trúc|architecture|architectural|c4|uml|diagram|sơ đồ|3e|explain|explore|evaluate|giải thích|phân tích|đánh giá|evidence|bằng chứng|runtime|static|trace|log|error|lỗi|bug|exception|rủi ro|risk|trade-off|tradeoff|coupling|cohesion|bottleneck|nghẽn|latency|độ trễ|timeout|retry|circuit|breaker|resilience|scale|scaling|performance|hiệu năng|security|bảo mật|auth|jwt|token|vai trò|chức năng|nhiệm vụ|trách nhiệm|responsibility|định tuyến|truy vấn|bảng)/i;

const CONTEXTUAL_INQUIRY_REGEX =
  /((?:^|\s)(nó|này|đây|this|it)(?:\s|$).*(làm gì|dùng để|hoạt động|xử lý|kết nối|gọi|gồm|chứa|ở đâu|như thế nào|như nào|tại sao|vì sao|work|do|handle|connect|call|contain|role|purpose))|((làm gì|dùng để|hoạt động|xử lý|như thế nào|tại sao|vì sao).*(?:^|\s)(nó|này|đây|this|it)(?:\s|[?!.]|$))/i;

export function checkThreeEScopeGuardrail(
  question: string,
  tCtx: Pick<
    ThreeEAiPromptContext,
    | "title"
    | "type"
    | "inboundPeers"
    | "outboundPeers"
    | "childComponents"
    | "codeSnippets"
    | "otherElementNames"
  >,
  locale: "en" | "vi" = "en",
): { allowed: boolean; reason?: "off-topic" | "wrong-service"; refusalMessage?: string } {
  const q = question.trim();
  const defaultRefusal = locale === "vi"
    ? threeERefusalMessageVi("off-topic", tCtx)
    : `I only answer questions about the software architecture, code evidence, dependencies, and design trade-offs of "${tCtx.title}" (${tCtx.type}). Please ask a question scoped to this selected element.`;

  if (q.length < 2 || CHITCHAT_ONLY_REGEX.test(q) || OFF_TOPIC_GUARDRAIL_REGEX.test(q)) {
    return { allowed: false, reason: "off-topic", refusalMessage: defaultRefusal };
  }

  const lower = q.toLowerCase();
  const normalizePeer = (p: string) => p.replace(/\s*\[.*\]$/, "").trim().toLowerCase();
  const scopedTerms = [
    tCtx.title.toLowerCase(),
    ...tCtx.title
      .toLowerCase()
      .split(/[-_.\s/→]+/)
      .filter((tok) => tok.length >= 4),
    ...tCtx.inboundPeers.map(normalizePeer),
    ...tCtx.outboundPeers.map(normalizePeer),
    ...tCtx.childComponents.map((c) => c.toLowerCase()),
    ...tCtx.codeSnippets.map((s) => s.locator.toLowerCase()),
  ].filter(Boolean);

  const mentionsSelectedOrPeer = scopedTerms.some((term) => term && lower.includes(term));

  if (!mentionsSelectedOrPeer && Array.isArray(tCtx.otherElementNames)) {
    const foreignMatch = tCtx.otherElementNames.find((other) => {
      const oLower = other.toLowerCase();
      return oLower.length >= 4 && lower.includes(oLower);
    });
    if (foreignMatch) {
      return {
        allowed: false,
        reason: "wrong-service",
        refusalMessage: locale === "vi"
          ? threeERefusalMessageVi("wrong-service", tCtx, foreignMatch)
          : `You currently have "${tCtx.title}" selected, but your question asks about "${foreignMatch}" (which is outside "${tCtx.title}"'s direct scope). Please select "${foreignMatch}" on the diagram or ask about "${tCtx.title}".`,
      };
    }
  }

  const hasArchIntent =
    mentionsSelectedOrPeer ||
    ARCH_DOMAIN_KEYWORDS_REGEX.test(q) ||
    CONTEXTUAL_INQUIRY_REGEX.test(q);

  if (!hasArchIntent) {
    return { allowed: false, reason: "off-topic", refusalMessage: defaultRefusal };
  }

  return { allowed: true };
}
