import type { ArchitecturalModel, Evidence } from "@/types/domain";
export const RULE_SET = "3e-2";
export const ruleNames: Record<string, string> = {
  "RULE-01": "Vòng phụ thuộc giữa các service",
  "RULE-02": "Ranh giới dữ liệu giữa các service",
  "RULE-03": "Service ít kết nối trong mô hình",
  "RULE-04": "Căn cứ cho các quan hệ",
  "RULE-05": "Ánh xạ cần xác minh",
};
export const resultNames: Record<string, string> = {
  PASS: "Đạt trong phạm vi đã kiểm tra",
  VIOLATION: "Có điểm cần xem xét",
  NEEDS_REVIEW: "Cần xác minh",
  NOT_APPLICABLE: "Không áp dụng",
};
export function sourceLabel(evidence: Pick<Evidence, "kind" | "sourceType">) {
  const type = evidence.sourceType?.toUpperCase() ?? "";
  if (type.startsWith("RUNTIME")) return "Quan sát khi chạy";
  if (type.includes("CONFIG") || type.includes("COMPOSE")) return "Từ cấu hình";
  if (type.includes("SOURCE") || type.includes("AST") || type.includes("CODE"))
    return "Từ mã nguồn";
  if (type.includes("USER")) return "Người dùng xác nhận";
  return "Nguồn chưa phân loại";
}
export function shortLocator(location: string) {
  const normalized = location.replaceAll("\\", "/");
  const extracted = normalized.match(/_source_extracted\/[^/]+\/(.+)$/);
  if (extracted) return extracted[1]!;
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/"))
    return normalized.split("/").slice(-3).join("/");
  return normalized || "Chưa có vị trí source";
}
export function selectionSummary(model: ArchitecturalModel, id: string) {
  const node = model.elements.find((node) => node.id === id),
    edge = model.edges.find((edge) => edge.id === id);
  const name = (id: string) =>
    model.elements.find((node) => node.id === id)?.name ?? "Đối tượng chưa phân giải";
  if (edge) {
    const umlRelKind =
      typeof edge.properties?.["umlRelationKind"] === "string"
        ? edge.properties["umlRelationKind"]
        : null;
    const meaning: Record<string, string> = {
      DATABASE_ACCESS:
        "Mô hình ánh xạ một quan hệ truy cập dữ liệu. Cần xem cả source và datasource để xác minh đích dữ liệu.",
      DECLARED_COMPOSE:
        "Cấu hình triển khai khai báo phụ thuộc khởi động; quan hệ này chưa chứng minh có gọi API hay truy cập dữ liệu.",
      CODE_DEPENDENCY: umlRelKind
        ? `Source khai báo quan hệ UML ${umlRelKind} giữa hai classifier; thứ tự thực thi chưa được xác định.`
        : "Source khai báo một phụ thuộc giữa các thành phần; thứ tự thực thi chưa được xác định.",
      SERVICE_HTTP_CALL:
        "Mô hình ghi nhận một lời gọi HTTP giữa hai đầu mút. Xem nguồn để phân biệt khai báo với quan sát thực tế.",
      MESSAGE_PUBLISH:
        "Source/cấu hình khai báo việc gửi tới kênh thông điệp; chưa xác nhận thông điệp đã được chuyển.",
      MESSAGE_SUBSCRIBE:
        "Source/cấu hình khai báo xử lý thông điệp từ kênh; chưa xác nhận đã thực thi.",
    };
    return {
      title: `${name(edge.from)} → ${name(edge.to)}`,
      type: umlRelKind ? `Quan hệ UML · ${umlRelKind}` : "Quan hệ kiến trúc",
      summary:
        meaning[edge.protocol] ??
        "Quan hệ được lưu trong mô hình kiến trúc. Mở căn cứ để kiểm tra ý nghĩa và phạm vi.",
      connections: [edge],
      node,
      edge,
    };
  }
  const connections = model.edges.filter((edge) => edge.from === id || edge.to === id);
  const role: Record<string, [string, string]> = {
    SERVICE_CONTAINER: ["Service / ứng dụng", "Đơn vị ứng dụng được nhận diện trong mô hình."],
    COMPONENT: [
      "Thành phần bên trong service",
      "Thành phần được trích xuất từ source; vai trò kiến trúc cần đối chiếu ngữ cảnh.",
    ],
    CLASS_INTERFACE: [
      "UML Classifier (Class / Interface / Enum)",
      "Classifier được trích xuất từ AST mã nguồn phục vụ các biểu đồ UML Class, Package, Activity và State.",
    ],
    DATABASE: [
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Database logic"
        : "Cơ sở dữ liệu · phạm vi cần xác minh",
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Đích dữ liệu được ánh xạ từ cấu hình của ứng dụng."
        : "Chưa đủ thông tin ở node này để phân biệt máy chủ dữ liệu với database/schema logic.",
    ],
    MESSAGE_CHANNEL: [
      "Kênh thông điệp",
      "Kênh gửi hoặc xử lý thông điệp đã khai báo; chưa khẳng định có trao đổi khi chạy.",
    ],
    QUEUE_BROKER: [
      "Hạ tầng thông điệp",
      "Tài nguyên phục vụ trao đổi thông điệp được nhận diện trong mô hình.",
    ],
    EXTERNAL_SYSTEM: [
      "Hệ thống bên ngoài",
      "Phần tử được mô hình phân loại là hệ thống bên ngoài; ranh giới cần đối chiếu dự án.",
    ],
  };
  const [type, summary] = role[node?.elementType ?? ""] ?? [
    "Phần tử kiến trúc",
    "Vai trò của phần tử này chưa được phân loại đầy đủ.",
  ];
  const responsibilities: Record<string, string> = {
    "Exposes HTTP endpoints": "Source khai báo thành phần cung cấp endpoint HTTP.",
    "Persists and retrieves application data":
      "Source khai báo thành phần lưu và truy xuất dữ liệu ứng dụng.",
    "Implements application operations":
      "Source nhận diện thành phần thực hiện các thao tác ứng dụng.",
    "Declares message publishing or handling endpoints":
      "Source khai báo thành phần gửi hoặc xử lý thông điệp.",
    "Spring application component": "Thành phần ứng dụng được khai báo bằng Spring.",
  };
  const responsibility =
    typeof node?.properties?.["responsibility"] === "string"
      ? responsibilities[node.properties["responsibility"]]
      : undefined;
  const children = model.elements.filter((child) => child.parentId === node?.id);
  const description =
    responsibility ??
    (node?.elementType === "SERVICE_CONTAINER" && children.length
      ? "Mô hình xếp " + children.length + " thành phần đã trích xuất vào ứng dụng này."
      : summary);
  const owner = model.elements.find((parent) => parent.id === node?.parentId);
  return {
    title: node?.name ?? "Chưa xác định",
    type,
    summary: description + (owner ? ` Thuộc ${owner.name}.` : ""),
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
      const covered = (sequenceContext.coveredParticipantLabels ?? []).join(", ") || "Chưa gán lifeline";
      const operandsText = (sequenceContext.operandSummaries ?? []).join(" · ");
      const summary = isFragment
        ? `Khối điều khiển CombinedFragment [${sequenceContext.operator ?? "alt"}] bao phủ (${covered}). ${operandsText ? `Operands: ${operandsText}. ` : ""}Provenance: ${sequenceContext.provenance ?? "DESIGNED_ONLY"} · Đánh giá tĩnh: ${sequenceContext.evaluationStatus ?? "NOT_EVALUATED_STATIC_RULE"}.`
        : `Tham chiếu kịch bản InteractionUse (${sequenceContext.label ?? activeTargetId})${sequenceContext.refTargetViewId ? ` → ${sequenceContext.refTargetViewId}` : ""} bao phủ (${covered}). Provenance: ${sequenceContext.provenance ?? "DESIGNED_ONLY"} · Đánh giá tĩnh: ${sequenceContext.evaluationStatus ?? "NOT_EVALUATED_STATIC_RULE"}.`;

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
            "Không thể gọi giải thích AI cho khối CombinedFragment / InteractionUse (DESIGNED_ONLY · NOT_EVALUATED_STATIC_RULE).",
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
          summary: `Lifeline "${sequenceContext.label ?? activeTargetId}" có trạng thái ${sequenceContext.resolutionStatus ?? "UNMAPPED"} (${sequenceContext.provenance ?? "USER_DEFINED"}) và chưa ánh xạ duy nhất tới phần tử kiến trúc canonical trong model.`,
          connections: [],
          node: undefined,
          edge: undefined,
        },
        evidenceQueryParam: null,
        filterFindings: () => [],
        buildExplainRequest: () => {
          throw new Error(
            "Không thể gọi giải thích AI cho lifeline chưa ánh xạ hoặc mơ hồ (UNMAPPED / AMBIGUOUS).",
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
            type: `${sequenceContext.messageSort ?? firstEdge.protocol} · Thông điệp trình tự gộp (${validRelIds.length} quan hệ con)`,
            summary: `Thông điệp trình tự giữa ${fromName} và ${toName} liên kết với ${validRelIds.length} quan hệ tĩnh trong model. Hãy chọn 1 quan hệ thành phần cụ thể trước khi xem bằng chứng hoặc yêu cầu giải thích AI.`,
            connections: model.edges.filter((e) => validRelIds.includes(e.id)),
            node: undefined,
            edge: syntheticGroupEdge,
          },
          evidenceQueryParam: null,
          filterFindings: (findings) =>
            findings.filter((f) => validRelIds.some((id) => findingRelated(f, id))),
          buildExplainRequest: () => {
            throw new Error(
              "Không thể yêu cầu giải thích AI ở chế độ quan hệ gộp. Vui lòng chọn Chi tiết ở một quan hệ thành phần cụ thể.",
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
          type: `Thông điệp trình tự (${sequenceContext.messageSort ?? "SYNCH_CALL"}) · ${sequenceContext.resolutionStatus ?? "UNMAPPED"} (${sequenceContext.provenance ?? "USER_DEFINED"})`,
          summary: `Thông điệp trình tự #${sequenceContext.occurrenceIndex ?? "?"} (${sequenceContext.messageSort ?? "SYNCH_CALL"}) chưa gắn với quan hệ tĩnh canonical (sourceRelationshipIds rỗng). Không gọi relationship evidence hay AI Explain với ID giả.`,
          connections: [],
          node: undefined,
          edge: undefined,
        },
        evidenceQueryParam: null,
        filterFindings: () => [],
        buildExplainRequest: () => {
          throw new Error(
            "Không thể gọi giải thích AI cho thông điệp trình tự chưa gắn với quan hệ tĩnh canonical (UNMAPPED).",
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
        type: `${projectedEdge!.protocol} · Quan hệ gộp (${projectedEdge!.underlyingEdgeIds!.length} quan hệ con)`,
        summary: `Quan hệ gộp giữa ${fromName} và ${toName} gom ${projectedEdge!.underlyingEdgeIds!.length} quan hệ thành phần cùng hướng và cùng tầng dữ kiện (${projectedEdge!.originLayer}).`,
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
        "Không thể yêu cầu giải thích AI ở chế độ quan hệ gộp. Vui lòng chọn Chi tiết ở một quan hệ thành phần cụ thể.",
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
