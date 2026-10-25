import { z } from "zod";
import type { ArchitecturalModel } from "@/types/domain";
import { relationLabel, wrapText } from "@/lib/drawio/rules";

export const MESSAGE_SORTS = [
  "SYNCH_CALL",
  "ASYNCH_CALL",
  "ASYNCH_SIGNAL",
  "REPLY",
  "CREATE",
  "DELETE",
  "UNKNOWN",
] as const;
export type MessageSort = (typeof MESSAGE_SORTS)[number];

export const SUPPORTED_FRAGMENT_OPERATORS = ["alt", "opt", "loop", "par"] as const;
export const DEFERRED_FRAGMENT_OPERATORS = ["break", "critical", "strict"] as const;
export const ALL_FRAGMENT_OPERATORS = [
  ...SUPPORTED_FRAGMENT_OPERATORS,
  ...DEFERRED_FRAGMENT_OPERATORS,
] as const;
export type FragmentOperator = (typeof ALL_FRAGMENT_OPERATORS)[number];

export const PARTICIPANT_RESOLUTION_STATUSES = [
  "RESOLVED",
  "UNCERTAIN_MAPPING",
  "UNMAPPED",
  "AMBIGUOUS",
  "DESIGNED_ROLE",
] as const;
export type ParticipantResolutionStatus = (typeof PARTICIPANT_RESOLUTION_STATUSES)[number];

export const ABSTRACTION_LEVELS = [
  "ACTOR",
  "CONTAINER",
  "COMPONENT",
  "CLASS",
  "EXTERNAL",
] as const;
export type ParticipantAbstractionLevel = (typeof ABSTRACTION_LEVELS)[number];

export const PROVENANCE_ORIGINS = ["STATIC", "OBSERVED", "DESIGNED", "MIGRATED_V0"] as const;
export type SequenceProvenanceOrigin = (typeof PROVENANCE_ORIGINS)[number];

export const sequenceParticipantSchema = z.object({
  participantId: z.string().min(1).max(160),
  modelElementId: z.string().nullable().default(null),
  baseElementId: z.string().nullable().optional(),
  role: z.string().max(80).nullable().default(null),
  name: z.string().trim().min(1).max(160),
  elementType: z.string().default("SERVICE_CONTAINER"),
  abstractionLevel: z.enum(ABSTRACTION_LEVELS).default("CONTAINER"),
  resolutionStatus: z.enum(PARTICIPANT_RESOLUTION_STATUSES).default("RESOLVED"),
  provenance: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
  layoutX: z.number().optional(),
});
export type SequenceParticipant = z.infer<typeof sequenceParticipantSchema>;

export const MESSAGE_ENDPOINT_KINDS = ["COMPLETE", "FOUND", "LOST"] as const;
export type MessageEndpointKind = (typeof MESSAGE_ENDPOINT_KINDS)[number];

export const sequenceMessageSchema = z.object({
  messageId: z.string().min(1).max(160),
  sequenceIndex: z.number().int().positive(),
  fromParticipantId: z.string().min(1).max(160),
  toParticipantId: z.string().min(1).max(160),
  label: z.string().trim().min(1).max(240),
  messageSort: z.enum(MESSAGE_SORTS).default("UNKNOWN"),
  endpointKind: z.enum(MESSAGE_ENDPOINT_KINDS).default("COMPLETE").optional(),
  replyToMessageId: z.string().nullable().optional(),
  guard: z.string().max(160).nullable().optional(),
  arguments: z.string().max(240).nullable().optional(),
  returnValue: z.string().max(240).nullable().optional(),
  sourceRelationshipIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  traceId: z.string().nullable().optional(),
  spanId: z.string().nullable().optional(),
  parentSpanId: z.string().nullable().optional(),
  httpMethod: z.string().nullable().optional(),
  httpStatusCode: z.number().int().nullable().optional(),
  durationMs: z.number().nonnegative().nullable().optional(),
  causalParentMessageIds: z.array(z.string()).default([]),
  provenance: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
  isUncertain: z.boolean().optional(),
});
export type SequenceMessage = z.infer<typeof sequenceMessageSchema>;

export const executionSpecificationSchema = z.object({
  executionId: z.string().min(1).max(160),
  participantId: z.string().min(1).max(160),
  startMessageId: z.string().min(1).max(160),
  endMessageId: z.string().min(1).max(160),
  nestingLevel: z.number().int().min(0).max(6).default(0),
  provenance: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
});
export type ExecutionSpecification = z.infer<typeof executionSpecificationSchema>;

export interface InteractionOperand {
  operandId: string;
  guard: string;
  minIterations?: number | null | undefined;
  maxIterations?: number | string | null | undefined;
  messageIds: string[];
  nestedFragments?: CombinedFragment[] | undefined;
  interactionUseIds?: string[] | undefined;
}

export interface CombinedFragment {
  fragmentId: string;
  operator: FragmentOperator;
  label?: string | null | undefined;
  coveredParticipantIds: string[];
  operands: InteractionOperand[];
  provenance: SequenceProvenanceOrigin;
}

export const interactionOperandSchema: z.ZodType<InteractionOperand, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.object({
      operandId: z.string().min(1).max(160),
      guard: z.string().max(200).default(""),
      minIterations: z.number().int().nonnegative().nullable().optional(),
      maxIterations: z.union([z.number().int().nonnegative(), z.string()]).nullable().optional(),
      messageIds: z.array(z.string()).default([]),
      nestedFragments: z.array(combinedFragmentSchema).optional(),
      interactionUseIds: z.array(z.string()).optional(),
    }),
  );

export const combinedFragmentSchema: z.ZodType<CombinedFragment, z.ZodTypeDef, unknown> = z.lazy(
  () =>
    z.object({
      fragmentId: z.string().min(1).max(160),
      operator: z.enum(ALL_FRAGMENT_OPERATORS),
      label: z.string().max(200).nullable().optional(),
      coveredParticipantIds: z.array(z.string()).default([]),
      operands: z.array(interactionOperandSchema).min(1),
      provenance: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
    }),
);

export const interactionUseSchema = z.object({
  interactionUseId: z.string().min(1).max(160),
  name: z.string().trim().min(1).max(200),
  targetInteractionId: z.string().nullable().optional(),
  targetViewId: z.string().nullable().optional(),
  coveredParticipantIds: z.array(z.string()).min(1),
  arguments: z.string().max(240).nullable().optional(),
  returnValue: z.string().max(240).nullable().optional(),
  afterMessageId: z.string().nullable().optional(),
  resolutionStatus: z.enum(["RESOLVED", "UNRESOLVED"]).default("UNRESOLVED"),
  provenance: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
});
export type InteractionUse = z.infer<typeof interactionUseSchema>;

const legacyDesignSchema = z.object({
  modelId: z.string(),
  name: z.string().trim().min(1).max(120),
  edgeIds: z.array(z.string()).max(30),
});
export type ScenarioDesign = z.infer<typeof legacyDesignSchema>;

export const interactionDocumentSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  interactionId: z.string().min(1).max(160).default("scenarios:designed"),
  name: z.string().trim().min(1).max(120),
  modelId: z.string().min(1),
  baseModelId: z.string().nullable().optional(),
  snapshotId: z.string().nullable().optional(),
  mode: z.enum(["DESIGNED", "OBSERVED", "HYBRID"]).default("DESIGNED"),
  semanticStatus: z.enum(["COMPLETE", "PARTIAL", "UNVERIFIED"]).default("COMPLETE"),
  provenance: z
    .object({
      origin: z.enum(PROVENANCE_ORIGINS).default("DESIGNED"),
      sessionId: z.string().nullable().optional(),
      traceId: z.string().nullable().optional(),
      migratedFromV0: z.boolean().optional(),
      legacyBackupPreserved: z.boolean().optional(),
    })
    .default({ origin: "DESIGNED" }),
  limitations: z.array(z.string()).default([]),
  participants: z.array(sequenceParticipantSchema).max(24).default([]),
  messages: z.array(sequenceMessageSchema).max(120).default([]),
  executions: z.array(executionSpecificationSchema).default([]),
  fragments: z.array(combinedFragmentSchema).default([]),
  interactionUses: z.array(interactionUseSchema).default([]),
  legacyV0Scenario: legacyDesignSchema.nullable().optional(),
});
export type InteractionDocument = z.infer<typeof interactionDocumentSchema>;

export interface SequenceValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  targetId?: string;
}

export interface SequenceValidationResult {
  valid: boolean;
  semanticStatus: "COMPLETE" | "PARTIAL" | "UNVERIFIED";
  errors: SequenceValidationIssue[];
  warnings: SequenceValidationIssue[];
}

export function inferAbstractionLevel(elementType?: string): ParticipantAbstractionLevel {
  const upper = (elementType ?? "").toUpperCase();
  if (upper === "ACTOR" || upper === "PERSON") return "ACTOR";
  if (upper === "EXTERNAL_SYSTEM") return "EXTERNAL";
  if (upper === "COMPONENT") return "COMPONENT";
  if (upper === "CLASS" || upper === "INTERFACE") return "CLASS";
  return "CONTAINER";
}

export function inferInitialMessageSortFromEdge(
  _protocol: string,
  explicitSort?: string | null,
): {
  messageSort: MessageSort;
  isCertain: boolean;
} {
  if (explicitSort) {
    const normalized = explicitSort.trim().toUpperCase();
    if (
      (MESSAGE_SORTS as readonly string[]).includes(normalized) &&
      normalized !== "UNKNOWN"
    ) {
      return { messageSort: normalized as MessageSort, isCertain: true };
    }
  }
  // Transport/relation kind (SERVICE_HTTP_CALL, DATABASE_ACCESS, MESSAGE_PUBLISH,
  // MESSAGE_SUBSCRIBE, CODE_DEPENDENCY, etc.) does NOT by itself prove UML MessageSort
  // (synchronous vs asynchronous call/signal/reply). Without an explicit verified sort
  // rule or designer selection, initial sort remains UNKNOWN (isCertain: false).
  return { messageSort: "UNKNOWN", isCertain: false };
}

export function allocateNextSequenceId(
  prefix: string,
  existingIds: Iterable<string>,
): string {
  const used = new Set<string>();
  let maxNumber = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const rawId of existingIds) {
    const id = String(rawId).trim();
    if (!id) continue;
    used.add(id);
    const match = pattern.exec(id);
    if (match && match[1]) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNumber) {
        maxNumber = n;
      }
    }
  }
  let candidateNum = maxNumber + 1;
  let candidate = `${prefix}-${candidateNum}`;
  while (used.has(candidate)) {
    candidateNum += 1;
    candidate = `${prefix}-${candidateNum}`;
  }
  return candidate;
}

export function scenarioInteractions(model: ArchitecturalModel) {
  const ids = new Set(model.elements.map((node) => node.id));
  return model.edges.filter(
    (edge) =>
      edge.originLayer !== "DEPLOYMENT" &&
      [
        "CODE_DEPENDENCY",
        "SERVICE_HTTP_CALL",
        "DATABASE_ACCESS",
        "DATABASE_QUERY",
        "MESSAGE_PUBLISH",
        "MESSAGE_SUBSCRIBE",
        "RUNTIME_OBSERVED",
      ].includes(edge.protocol) &&
      ids.has(edge.from) &&
      ids.has(edge.to),
  );
}

export function validateInteractionDocument(
  doc: InteractionDocument,
  model?: ArchitecturalModel,
): SequenceValidationResult {
  const errors: SequenceValidationIssue[] = [];
  const warnings: SequenceValidationIssue[] = [];

  if (model && doc.modelId !== model.id && doc.baseModelId !== model.id) {
    errors.push({
      code: "MODEL_REVISION_MISMATCH",
      severity: "error",
      message: `Interaction belongs to model ${doc.modelId}, not active model ${model.id}.`,
    });
  }

  const participantById = new Map<string, SequenceParticipant>();
  const modelElementRoles = new Map<string, Set<string>>();

  for (const p of doc.participants) {
    if (participantById.has(p.participantId)) {
      errors.push({
        code: "DUPLICATE_PARTICIPANT_ID",
        severity: "error",
        message: `Duplicate participantId "${p.participantId}".`,
        targetId: p.participantId,
      });
    }
    participantById.set(p.participantId, p);

    if (p.modelElementId) {
      if (model && !model.elements.some((el) => el.id === p.modelElementId)) {
        warnings.push({
          code: "UNRESOLVED_MODEL_ELEMENT",
          severity: "warning",
          message: `Participant "${p.name}" references element ${p.modelElementId} not found in current model.`,
          targetId: p.participantId,
        });
      }
      const roleKey = (p.role ?? "").trim().toLowerCase();
      const seenRoles = modelElementRoles.get(p.modelElementId) ?? new Set<string>();
      if (seenRoles.has(roleKey)) {
        warnings.push({
          code: "SHARED_ELEMENT_NEEDS_DISTINCT_ROLE",
          severity: "warning",
          message: `Multiple lifelines reference element "${p.name}" without distinct role labels.`,
          targetId: p.participantId,
        });
      }
      seenRoles.add(roleKey);
      modelElementRoles.set(p.modelElementId, seenRoles);
    }

    if (p.resolutionStatus === "AMBIGUOUS" || p.resolutionStatus === "UNCERTAIN_MAPPING" || p.resolutionStatus === "UNMAPPED") {
      warnings.push({
        code: `PARTICIPANT_${p.resolutionStatus}`,
        severity: "warning",
        message: `Participant "${p.name}" has resolution status ${p.resolutionStatus}.`,
        targetId: p.participantId,
      });
    }
  }

  const createdAtOrder = new Map<string, number>();
  const destroyedAtOrder = new Map<string, number>();
  const messageById = new Map<string, { msg: SequenceMessage; order: number }>();

  doc.messages.forEach((msg, index) => {
    const order = index + 1;
    if (messageById.has(msg.messageId)) {
      errors.push({
        code: "DUPLICATE_MESSAGE_ID",
        severity: "error",
        message: `Duplicate messageId "${msg.messageId}". Every occurrence must have a unique messageId.`,
        targetId: msg.messageId,
      });
    }
    messageById.set(msg.messageId, { msg, order });

    const isFoundEndpoint =
      msg.endpointKind === "FOUND" || msg.fromParticipantId === "__FOUND__";
    const isLostEndpoint =
      msg.endpointKind === "LOST" || msg.toParticipantId === "__LOST__";

    if (!isFoundEndpoint && !participantById.has(msg.fromParticipantId)) {
      errors.push({
        code: "MISSING_SENDER_PARTICIPANT",
        severity: "error",
        message: `Message "${msg.label}" references unknown sender "${msg.fromParticipantId}".`,
        targetId: msg.messageId,
      });
    }
    if (!isLostEndpoint && !participantById.has(msg.toParticipantId)) {
      errors.push({
        code: "MISSING_RECEIVER_PARTICIPANT",
        severity: "error",
        message: `Message "${msg.label}" references unknown receiver "${msg.toParticipantId}".`,
        targetId: msg.messageId,
      });
    }

    if (msg.messageSort === "CREATE") {
      if (msg.fromParticipantId === msg.toParticipantId) {
        errors.push({
          code: "SELF_CREATE_INVALID",
          severity: "error",
          message: `Participant "${msg.toParticipantId}" cannot create itself.`,
          targetId: msg.messageId,
        });
      }
      if (createdAtOrder.has(msg.toParticipantId)) {
        errors.push({
          code: "DUPLICATE_CREATE_MESSAGE",
          severity: "error",
          message: `Participant "${msg.toParticipantId}" is created more than once.`,
          targetId: msg.messageId,
        });
      } else {
        createdAtOrder.set(msg.toParticipantId, order);
      }
    }

    if (msg.messageSort === "DELETE") {
      if (destroyedAtOrder.has(msg.toParticipantId)) {
        errors.push({
          code: "DUPLICATE_DELETE_MESSAGE",
          severity: "error",
          message: `Participant "${msg.toParticipantId}" is destroyed more than once.`,
          targetId: msg.messageId,
        });
      } else {
        destroyedAtOrder.set(msg.toParticipantId, order);
      }
    }

    if (msg.messageSort === "UNKNOWN") {
      warnings.push({
        code: "UNCLASSIFIED_MESSAGE_SORT",
        severity: "warning",
        message: `Message #${order} "${msg.label}" has unclassified messageSort=UNKNOWN.`,
        targetId: msg.messageId,
      });
    }
    if (msg.sourceRelationshipIds.length > 1) {
      warnings.push({
        code: "AMBIGUOUS_SOURCE_RELATIONSHIPS",
        severity: "warning",
        message: `Message #${order} "${msg.label}" matches multiple candidate relationships (${msg.sourceRelationshipIds.join(", ")}).`,
        targetId: msg.messageId,
      });
    }
  });

  // Second pass: check lifecycle bounds (no use before CREATE, no use after DELETE) and REPLY references
  doc.messages.forEach((msg, index) => {
    const order = index + 1;
    for (const pid of [msg.fromParticipantId, msg.toParticipantId]) {
      const createOrd = createdAtOrder.get(pid);
      if (createOrd !== undefined && order < createOrd) {
        errors.push({
          code: "LIFELINE_USED_BEFORE_CREATE",
          severity: "error",
          message: `Participant "${participantById.get(pid)?.name ?? pid}" participates in message #${order} before its «create» message at #${createOrd}.`,
          targetId: msg.messageId,
        });
      }
      const destroyOrd = destroyedAtOrder.get(pid);
      if (destroyOrd !== undefined && order > destroyOrd) {
        errors.push({
          code: "MESSAGE_AFTER_LIFELINE_DESTROYED",
          severity: "error",
          message: `Participant "${participantById.get(pid)?.name ?? pid}" participates in message #${order} after being destroyed («destroy») at #${destroyOrd}.`,
          targetId: msg.messageId,
        });
      }
    }

    if (msg.messageSort === "REPLY") {
      if (!msg.replyToMessageId) {
        warnings.push({
          code: "REPLY_WITHOUT_CALL_REF",
          severity: "warning",
          message: `Reply message #${order} "${msg.label}" does not specify replyToMessageId.`,
          targetId: msg.messageId,
        });
      } else {
        const ref = messageById.get(msg.replyToMessageId);
        if (!ref) {
          errors.push({
            code: "INVALID_REPLY_TARGET",
            severity: "error",
            message: `Reply message #${order} references non-existent call "${msg.replyToMessageId}".`,
            targetId: msg.messageId,
          });
        } else if (
          ref.order >= order ||
          ref.msg.fromParticipantId !== msg.toParticipantId ||
          ref.msg.toParticipantId !== msg.fromParticipantId
        ) {
          errors.push({
            code: "INVALID_REPLY_TARGET",
            severity: "error",
            message: `Reply message #${order} does not match caller/callee or precede order of "${msg.replyToMessageId}".`,
            targetId: msg.messageId,
          });
        }
      }
    }
  });

  // Validate executions
  for (const exec of doc.executions) {
    if (!participantById.has(exec.participantId)) {
      errors.push({
        code: "EXECUTION_UNKNOWN_PARTICIPANT",
        severity: "error",
        message: `Execution "${exec.executionId}" references unknown participant "${exec.participantId}".`,
        targetId: exec.executionId,
      });
    }
    const startRef = messageById.get(exec.startMessageId);
    const endRef = messageById.get(exec.endMessageId);
    if (!startRef || !endRef || startRef.order > endRef.order) {
      errors.push({
        code: "INVALID_EXECUTION_BOUNDS",
        severity: "error",
        message: `Execution "${exec.executionId}" has invalid start/end message bounds.`,
        targetId: exec.executionId,
      });
    } else {
      const destroyOrd = destroyedAtOrder.get(exec.participantId);
      if (destroyOrd !== undefined && endRef.order > destroyOrd) {
        errors.push({
          code: "EXECUTION_AFTER_LIFELINE_DESTROYED",
          severity: "error",
          message: `Execution "${exec.executionId}" extends past lifeline destruction at message #${destroyOrd}.`,
          targetId: exec.executionId,
        });
      }
    }
  }

  // Validate CombinedFragments recursively
  const validateFragment = (frag: CombinedFragment) => {
    if ((DEFERRED_FRAGMENT_OPERATORS as readonly string[]).includes(frag.operator)) {
      warnings.push({
        code: "UNSUPPORTED_FRAGMENT_OPERATOR",
        severity: "warning",
        message: `CombinedFragment operator "${frag.operator}" is DESIGNED_ONLY / DEFERRED in M3 profile; preserved as annotated frame.`,
        targetId: frag.fragmentId,
      });
    }
    if (frag.operator === "alt" && frag.operands.length < 1) {
      errors.push({
        code: "EMPTY_ALT_FRAGMENT",
        severity: "error",
        message: `CombinedFragment "${frag.fragmentId}" (alt) must have at least one operand.`,
        targetId: frag.fragmentId,
      });
    }
    for (const op of frag.operands) {
      if ((frag.operator === "alt" || frag.operator === "opt" || frag.operator === "loop") && !op.guard.trim()) {
        warnings.push({
          code: "EMPTY_OPERAND_GUARD",
          severity: "warning",
          message: `Operand "${op.operandId}" in ${frag.operator} fragment "${frag.fragmentId}" has no guard condition.`,
          targetId: frag.fragmentId,
        });
      }
      if (
        frag.operator === "loop" &&
        typeof op.minIterations === "number" &&
        typeof op.maxIterations === "number" &&
        op.minIterations > op.maxIterations
      ) {
        errors.push({
          code: "INVALID_LOOP_BOUNDS",
          severity: "error",
          message: `Loop operand "${op.operandId}" has minIterations (${op.minIterations}) > maxIterations (${op.maxIterations}).`,
          targetId: frag.fragmentId,
        });
      }
      for (const mid of op.messageIds) {
        if (!messageById.has(mid)) {
          errors.push({
            code: "FRAGMENT_UNKNOWN_MESSAGE",
            severity: "error",
            message: `Fragment "${frag.fragmentId}" operand "${op.operandId}" references unknown message "${mid}".`,
            targetId: frag.fragmentId,
          });
        }
      }
      for (const nested of op.nestedFragments ?? []) {
        validateFragment(nested);
      }
    }
  };
  for (const frag of doc.fragments) {
    validateFragment(frag);
  }

  // Validate InteractionUses
  for (const iu of doc.interactionUses) {
    for (const pid of iu.coveredParticipantIds) {
      if (!participantById.has(pid)) {
        errors.push({
          code: "INTERACTION_USE_UNKNOWN_PARTICIPANT",
          severity: "error",
          message: `InteractionUse "${iu.name}" covers unknown participant "${pid}".`,
          targetId: iu.interactionUseId,
        });
      }
    }
    if (!iu.targetInteractionId || iu.resolutionStatus === "UNRESOLVED") {
      warnings.push({
        code: "UNRESOLVED_INTERACTION_USE",
        severity: "warning",
        message: `InteractionUse "ref ${iu.name}" does not resolve to a saved target interaction view.`,
        targetId: iu.interactionUseId,
      });
    }
  }

  const hasUnknownSort = doc.messages.some((m) => m.messageSort === "UNKNOWN");
  const hasAmbiguousRel = doc.messages.some((m) => m.sourceRelationshipIds.length > 1);
  const hasUncertainParticipant = doc.participants.some(
    (p) => p.resolutionStatus !== "RESOLVED" && p.resolutionStatus !== "DESIGNED_ROLE",
  );
  const hasStructuralConflict = doc.limitations.includes("DRAWIO_STRUCTURAL_CONFLICT_DETECTED");
  const semanticStatus: "COMPLETE" | "PARTIAL" | "UNVERIFIED" =
    errors.length > 0 || hasStructuralConflict
      ? "UNVERIFIED"
      : hasUnknownSort || hasAmbiguousRel || hasUncertainParticipant
        ? "PARTIAL"
        : "COMPLETE";

  return {
    valid: errors.length === 0 && !hasStructuralConflict,
    semanticStatus,
    errors,
    warnings,
  };
}

export function upgradeLegacyScenarioDesign(
  legacy: ScenarioDesign,
  model: ArchitecturalModel,
  interactionId = "scenarios:designed",
): InteractionDocument {
  const allowed = new Map(scenarioInteractions(model).map((edge) => [edge.id, edge]));
  const elementById = new Map(model.elements.map((el) => [el.id, el]));

  const participantMap = new Map<string, SequenceParticipant>();
  const messages: SequenceMessage[] = [];
  let hasUncertainSort = false;

  const ensureParticipant = (elementId: string): SequenceParticipant => {
    const existing = participantMap.get(elementId);
    if (existing) return existing;
    const node = elementById.get(elementId);
    const participant: SequenceParticipant = {
      participantId: `part:${elementId}`,
      modelElementId: node ? node.id : null,
      baseElementId: node ? node.id : null,
      role: null,
      name: node ? node.name : elementId,
      elementType: node?.elementType ?? "SERVICE_CONTAINER",
      abstractionLevel: inferAbstractionLevel(node?.elementType),
      resolutionStatus: node ? "RESOLVED" : "UNMAPPED",
      provenance: "MIGRATED_V0",
    };
    participantMap.set(elementId, participant);
    return participant;
  };

  legacy.edgeIds.forEach((edgeId) => {
    const edge = allowed.get(edgeId) ?? model.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const sender = ensureParticipant(edge.from);
    const receiver = ensureParticipant(edge.to);
    const { messageSort, isCertain } = inferInitialMessageSortFromEdge(edge.protocol);
    if (!isCertain) hasUncertainSort = true;
    const seqIdx = messages.length + 1;
    const msgId = allocateNextSequenceId(
      "msg",
      messages.map((m) => m.messageId),
    );
    const baseLabel = relationLabel({
      id: edge.id,
      type: edge.protocol,
      properties: {
        protocol:
          (elementById.get(edge.to)?.properties?.["protocol"] as string | undefined) ?? undefined,
      },
    });
    messages.push({
      messageId: msgId,
      sequenceIndex: seqIdx,
      fromParticipantId: sender.participantId,
      toParticipantId: receiver.participantId,
      label: baseLabel,
      messageSort,
      sourceRelationshipIds: [edge.id],
      evidenceIds: edge.evidenceIds ?? edge.evidence.map((ev) => ev.id),
      causalParentMessageIds: [],
      provenance: "MIGRATED_V0",
      isUncertain: edge.uncertain || !isCertain,
    });
  });

  const limitations: string[] = [
    "MIGRATED_FROM_V0_EDGE_LIST",
    "STATIC_RELATIONSHIPS_REQUIRE_HUMAN_SORT_CONFIRMATION",
  ];

  return {
    schemaVersion: 2,
    interactionId,
    name: legacy.name,
    modelId: legacy.modelId,
    baseModelId: legacy.modelId,
    snapshotId: model.snapshotId,
    mode: "DESIGNED",
    semanticStatus: hasUncertainSort || messages.length === 0 ? "PARTIAL" : "COMPLETE",
    provenance: {
      origin: "MIGRATED_V0",
      migratedFromV0: true,
      legacyBackupPreserved: true,
    },
    limitations,
    participants: [...participantMap.values()],
    messages,
    executions: [],
    fragments: [],
    interactionUses: [],
    legacyV0Scenario: legacy,
  };
}

export function ensureModelParticipantInInteraction(
  participants: SequenceParticipant[],
  model: ArchitecturalModel,
  elementId: string,
  provenance: SequenceProvenanceOrigin = "DESIGNED",
): { participants: SequenceParticipant[]; participant: SequenceParticipant } {
  const existing = participants.find(
    (p) => p.modelElementId === elementId && !p.role,
  );
  if (existing) {
    return { participants, participant: existing };
  }
  const el = model.elements.find((e) => e.id === elementId);
  const participant: SequenceParticipant = {
    participantId: `part:${elementId}`,
    modelElementId: el ? el.id : null,
    baseElementId: el ? el.id : null,
    role: null,
    name: el ? el.name : elementId,
    elementType: el?.elementType ?? "SERVICE_CONTAINER",
    abstractionLevel: inferAbstractionLevel(el?.elementType),
    resolutionStatus: el ? "RESOLVED" : "UNMAPPED",
    provenance,
  };
  return {
    participants: [...participants, participant],
    participant,
  };
}

export function addEdgeStepToInteraction(
  doc: InteractionDocument,
  model: ArchitecturalModel,
  edgeId: string,
): InteractionDocument {
  const edge =
    scenarioInteractions(model).find((e) => e.id === edgeId) ??
    model.edges.find((e) => e.id === edgeId);
  if (!edge || doc.messages.length >= 60) return doc;

  const senderRes = ensureModelParticipantInInteraction(
    doc.participants,
    model,
    edge.from,
    "DESIGNED",
  );
  const receiverRes = ensureModelParticipantInInteraction(
    senderRes.participants,
    model,
    edge.to,
    "DESIGNED",
  );
  const nextParticipants = receiverRes.participants;
  const sender = senderRes.participant;
  const receiver = receiverRes.participant;

  if (nextParticipants.length > 16) return doc;

  const { messageSort, isCertain } = inferInitialMessageSortFromEdge(edge.protocol);
  const msgId = allocateNextSequenceId(
    "msg",
    doc.messages.map((m) => m.messageId),
  );
  const elementById = new Map(model.elements.map((el) => [el.id, el]));
  const label = relationLabel({
    id: edge.id,
    type: edge.protocol,
    properties: {
      protocol:
        (elementById.get(edge.to)?.properties?.["protocol"] as string | undefined) ?? undefined,
    },
  });

  const newMsg: SequenceMessage = {
    messageId: msgId,
    sequenceIndex: doc.messages.length + 1,
    fromParticipantId: sender.participantId,
    toParticipantId: receiver.participantId,
    label,
    messageSort,
    sourceRelationshipIds: [edge.id],
    evidenceIds: edge.evidenceIds ?? edge.evidence.map((ev) => ev.id),
    causalParentMessageIds: [],
    provenance: "DESIGNED",
    isUncertain: edge.uncertain || !isCertain,
  };

  const nextDoc: InteractionDocument = {
    ...doc,
    participants: nextParticipants,
    messages: [...doc.messages, newMsg],
  };
  const validation = validateInteractionDocument(nextDoc, model);
  return {
    ...nextDoc,
    semanticStatus: validation.semanticStatus,
  };
}

export interface CustomMessageInput {
  fromParticipantId: string;
  toParticipantId: string;
  label: string;
  messageSort: MessageSort;
  endpointKind?: MessageEndpointKind;
  guard?: string | null;
  arguments?: string | null;
  returnValue?: string | null;
  replyToMessageId?: string | null;
  nestedActivation?: boolean;
  includeActivation?: boolean;
}

export function addCustomMessageToInteraction(
  doc: InteractionDocument,
  model: ArchitecturalModel,
  input: CustomMessageInput,
): InteractionDocument {
  const cleanLabel = input.label.trim();
  if (
    !input.fromParticipantId ||
    !input.toParticipantId ||
    !cleanLabel ||
    doc.messages.length >= 60
  ) {
    return doc;
  }

  const msgId = allocateNextSequenceId(
    "msg",
    doc.messages.map((m) => m.messageId),
  );

  const sender = doc.participants.find((p) => p.participantId === input.fromParticipantId);
  const receiver = doc.participants.find((p) => p.participantId === input.toParticipantId);
  const matchingEdges =
    sender?.modelElementId && receiver?.modelElementId
      ? model.edges
          .filter(
            (e) =>
              e.originLayer !== "DEPLOYMENT" &&
              e.from === sender.modelElementId &&
              e.to === receiver.modelElementId,
          )
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

  const sourceRelationshipIds = matchingEdges.map((e) => e.id);
  const evidenceIds = [
    ...new Set(
      matchingEdges.flatMap((e) => e.evidenceIds ?? e.evidence.map((ev) => ev.id)),
    ),
  ];

  const effectiveEndpointKind: MessageEndpointKind =
    input.endpointKind ??
    (input.fromParticipantId === "__FOUND__"
      ? "FOUND"
      : input.toParticipantId === "__LOST__"
        ? "LOST"
        : "COMPLETE");

  const newMsg: SequenceMessage = {
    messageId: msgId,
    sequenceIndex: doc.messages.length + 1,
    fromParticipantId: input.fromParticipantId,
    toParticipantId: input.toParticipantId,
    label: cleanLabel.slice(0, 200),
    messageSort: input.messageSort,
    endpointKind: effectiveEndpointKind,
    replyToMessageId:
      input.messageSort === "REPLY" && input.replyToMessageId?.trim()
        ? input.replyToMessageId.trim()
        : null,
    guard: input.guard?.trim() ? input.guard.trim().slice(0, 140) : null,
    arguments: input.arguments?.trim() ? input.arguments.trim().slice(0, 180) : null,
    returnValue: input.returnValue?.trim() ? input.returnValue.trim().slice(0, 180) : null,
    sourceRelationshipIds,
    evidenceIds,
    causalParentMessageIds: [],
    provenance: "DESIGNED",
    isUncertain: input.messageSort === "UNKNOWN" || sourceRelationshipIds.length > 1,
  };

  const shouldAddExec =
    effectiveEndpointKind === "LOST"
      ? false
      : input.includeActivation !== undefined
        ? input.includeActivation
        : input.messageSort !== "REPLY" && input.messageSort !== "DELETE";

  const nextExecs = [...doc.executions];
  if (shouldAddExec) {
    const execId = allocateNextSequenceId(
      "exec",
      doc.executions.map((e) => e.executionId),
    );
    nextExecs.push({
      executionId: execId,
      participantId: input.toParticipantId,
      startMessageId: msgId,
      endMessageId: msgId,
      nestingLevel:
        input.nestedActivation || input.fromParticipantId === input.toParticipantId ? 1 : 0,
      provenance: "DESIGNED",
    });
  }

  const nextDoc: InteractionDocument = {
    ...doc,
    messages: [...doc.messages, newMsg],
    executions: nextExecs,
  };
  const validation = validateInteractionDocument(nextDoc, model);
  return {
    ...nextDoc,
    semanticStatus: validation.semanticStatus,
  };
}

export function changeMessageSortInInteraction(
  doc: InteractionDocument,
  messageId: string,
  nextSort: MessageSort,
  model?: ArchitecturalModel,
): InteractionDocument {
  const updatedMessages = doc.messages.map((m) =>
    m.messageId === messageId
      ? {
          ...m,
          messageSort: nextSort,
          provenance: "DESIGNED" as const,
          isUncertain: nextSort === "UNKNOWN" || m.sourceRelationshipIds.length > 1,
        }
      : m,
  );
  const nextDoc: InteractionDocument = {
    ...doc,
    messages: updatedMessages,
  };
  const validation = validateInteractionDocument(nextDoc, model);
  return {
    ...nextDoc,
    semanticStatus: validation.semanticStatus,
  };
}

export function removeMessageFromInteraction(
  doc: InteractionDocument,
  index: number,
  model?: ArchitecturalModel,
): InteractionDocument {
  const target = doc.messages[index];
  if (!target) return doc;
  const removedId = target.messageId;

  const remainingMessages = doc.messages
    .filter((_, idx) => idx !== index)
    .map((m, idx) => ({
      ...m,
      sequenceIndex: idx + 1,
      replyToMessageId: m.replyToMessageId === removedId ? null : m.replyToMessageId,
      causalParentMessageIds: m.causalParentMessageIds.filter((pid) => pid !== removedId),
    }));

  const remainingExecutions = doc.executions.filter(
    (ex) => ex.startMessageId !== removedId && ex.endMessageId !== removedId,
  );

  const cleanFragment = (frag: CombinedFragment): CombinedFragment => ({
    ...frag,
    operands: frag.operands.map((op) => ({
      ...op,
      messageIds: op.messageIds.filter((mid) => mid !== removedId),
      ...(op.nestedFragments
        ? { nestedFragments: op.nestedFragments.map(cleanFragment) }
        : {}),
    })),
  });

  const nextDoc: InteractionDocument = {
    ...doc,
    messages: remainingMessages,
    executions: remainingExecutions,
    fragments: doc.fragments.map(cleanFragment),
    interactionUses: doc.interactionUses.map((iu) =>
      iu.afterMessageId === removedId ? { ...iu, afterMessageId: null } : iu,
    ),
  };
  const validation = validateInteractionDocument(nextDoc, model);
  return {
    ...nextDoc,
    semanticStatus: validation.semanticStatus,
  };
}

export function reorderMessageInInteraction(
  doc: InteractionDocument,
  index: number,
  delta: number,
  model?: ArchitecturalModel,
): InteractionDocument {
  const nextIdx = index + delta;
  if (index < 0 || index >= doc.messages.length || nextIdx < 0 || nextIdx >= doc.messages.length) {
    return doc;
  }
  const copy = [...doc.messages];
  const current = copy[index]!;
  copy[index] = copy[nextIdx]!;
  copy[nextIdx] = current;

  const reindexed = copy.map((m, idx) => ({
    ...m,
    sequenceIndex: idx + 1,
  }));

  const nextDoc: InteractionDocument = {
    ...doc,
    messages: reindexed,
  };
  const validation = validateInteractionDocument(nextDoc, model);
  return {
    ...nextDoc,
    semanticStatus: validation.semanticStatus,
  };
}

export function interactionToLegacyScenarioDesign(doc: InteractionDocument): ScenarioDesign {
  const edgeIds: string[] = [];
  for (const msg of doc.messages) {
    if (msg.sourceRelationshipIds && msg.sourceRelationshipIds.length > 0) {
      edgeIds.push(msg.sourceRelationshipIds[0]!);
    }
  }
  return {
    modelId: doc.modelId,
    name: doc.name.slice(0, 120),
    edgeIds: edgeIds.slice(0, 30),
  };
}

const escapeXml = (value: string) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#xa;");

const unescapeXml = (value: string) =>
  String(value)
    .replace(/&#(?:10|x0?[aA]);/g, "\n")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

function formatStereotype(elementType: string, resolutionStatus: ParticipantResolutionStatus): string {
  const upper = (elementType ?? "").toUpperCase();
  const base =
    upper === "ACTOR" || upper === "PERSON"
      ? "«actor»"
      : upper === "DATABASE"
        ? "«datastore»"
        : upper === "MESSAGE_CHANNEL"
          ? "«channel»"
          : upper === "COMPONENT"
            ? "«component»"
            : upper === "CLASS"
              ? "«class»"
              : upper === "EXTERNAL_SYSTEM"
                ? "«external»"
                : "«container»";
  if (resolutionStatus === "AMBIGUOUS") return `${base} [AMBIGUOUS]`;
  if (resolutionStatus === "UNCERTAIN_MAPPING") return `${base} [UNCERTAIN]`;
  if (resolutionStatus === "UNMAPPED") return `${base} [UNMAPPED]`;
  return base;
}

function formatLifelineTitle(p: SequenceParticipant): string {
  const rolePrefix = p.role && p.role.trim() ? `${p.role.trim()}:` : ":";
  return `${rolePrefix}${p.name}`;
}

function styleForMessageSort(sort: MessageSort): string {
  switch (sort) {
    case "SYNCH_CALL":
      return "endArrow=block;endFill=1;dashed=0;strokeWidth=1.6;strokeColor=#1e3a8a;";
    case "ASYNCH_CALL":
    case "ASYNCH_SIGNAL":
      return "endArrow=open;endFill=0;dashed=0;strokeWidth=1.5;strokeColor=#0f766e;";
    case "REPLY":
      return "endArrow=open;endFill=0;dashed=1;dashPattern=6 4;strokeWidth=1.4;strokeColor=#475569;";
    case "CREATE":
      return "endArrow=open;endFill=0;dashed=1;dashPattern=4 4;strokeWidth=1.5;strokeColor=#15803d;";
    case "DELETE":
      return "endArrow=block;endFill=1;dashed=0;strokeWidth=1.6;strokeColor=#b91c1c;";
    case "UNKNOWN":
    default:
      return "endArrow=oval;endFill=0;dashed=1;dashPattern=3 3;strokeWidth=1.5;strokeColor=#b45309;";
  }
}

function formatMessageLabel(msg: SequenceMessage, index: number): string {
  const num = `${index + 1}.`;
  const guardPrefix = msg.guard && msg.guard.trim() ? `[${msg.guard.trim()}] ` : "";
  const sortBadge =
    msg.messageSort === "CREATE"
      ? "«create» "
      : msg.messageSort === "DELETE"
        ? "«destroy» "
        : msg.messageSort === "ASYNCH_SIGNAL" && !msg.label.includes("«signal»")
          ? "«signal» "
          : msg.messageSort === "UNKNOWN"
            ? "[? sort=UNKNOWN] "
            : "";
  const argsSuffix =
    msg.arguments && msg.arguments.trim() && !msg.label.includes("(")
      ? `(${msg.arguments.trim()})`
      : "";
  const returnSuffix =
    msg.returnValue && msg.returnValue.trim() ? ` : ${msg.returnValue.trim()}` : "";
  const timingSuffix =
    typeof msg.durationMs === "number"
      ? ` (${msg.durationMs}ms${typeof msg.httpStatusCode === "number" ? ` · ${msg.httpStatusCode}` : ""})`
      : typeof msg.httpStatusCode === "number"
        ? ` (${msg.httpStatusCode})`
        : "";
  return `${num} ${guardPrefix}${sortBadge}${msg.label}${argsSuffix}${returnSuffix}${timingSuffix}`;
}

export function interactionToDrawioXml(
  inputDoc: InteractionDocument,
  model?: ArchitecturalModel,
): string {
  const doc = interactionDocumentSchema.parse(inputDoc);
  if (model && doc.modelId !== model.id && doc.baseModelId !== model.id) {
    throw new Error("Scenario belongs to another model revision.");
  }
  if (doc.participants.length > 16) {
    throw new Error("Use at most 16 participants per scenario to keep it readable.");
  }

  const validation = validateInteractionDocument(doc, model);
  const effectiveDoc: InteractionDocument = {
    ...doc,
    semanticStatus: validation.semanticStatus,
  };

  const legacySummary: ScenarioDesign =
    effectiveDoc.legacyV0Scenario ?? interactionToLegacyScenarioDesign(effectiveDoc);

  const participantIndex = new Map<string, number>();
  effectiveDoc.participants.forEach((p, idx) => participantIndex.set(p.participantId, idx));

  const COL_WIDTH = 220;
  const COL_STEP = 280;
  const LEFT_MARGIN = 50;
  const ROW_STEP = 82;

  const participantX = effectiveDoc.participants.map((p, idx) =>
    typeof p.layoutX === "number" && Number.isFinite(p.layoutX) && p.layoutX >= 20
      ? Math.round(p.layoutX)
      : LEFT_MARGIN + idx * COL_STEP,
  );
  const participantCenterX = participantX.map((x) => x + COL_WIDTH / 2);

  const headerHeight = Math.max(
    84,
    ...effectiveDoc.participants.map(
      (p) => wrapText(formatLifelineTitle(p), 24).length * 18 + 42,
    ),
  );
  const topLifelineY = 120;
  const firstMessageY = topLifelineY + headerHeight + 52;

  const extraRefRows = effectiveDoc.interactionUses.length;
  const totalTimelineRows = Math.max(1, effectiveDoc.messages.length + extraRefRows);
  const maxRightX =
    participantX.length > 0 ? Math.max(...participantX) + COL_WIDTH + 80 : 760;
  const width = Math.max(820, maxRightX);
  const height = Math.max(460, firstMessageY + totalTimelineRows * ROW_STEP + 90);

  // Determine lifecycle create/destroy Y positions per participant
  const createdAtY = new Map<string, number>();
  const destroyedAtY = new Map<string, number>();
  const messageYById = new Map<string, number>();

  effectiveDoc.messages.forEach((msg, idx) => {
    const y = firstMessageY + idx * ROW_STEP;
    messageYById.set(msg.messageId, y);
    if (msg.messageSort === "CREATE" && !createdAtY.has(msg.toParticipantId)) {
      createdAtY.set(msg.toParticipantId, y);
    }
    if (msg.messageSort === "DELETE" && !destroyedAtY.has(msg.toParticipantId)) {
      destroyedAtY.set(msg.toParticipantId, y);
    }
  });

  const encodedInteraction = encodeURIComponent(JSON.stringify(effectiveDoc));
  const encodedLegacy = encodeURIComponent(JSON.stringify(legacySummary));

  const scopeBannerText =
    effectiveDoc.mode === "OBSERVED"
      ? `Observed runtime trace · status=${effectiveDoc.semanticStatus} · no synthetic reply from endTime`
      : effectiveDoc.mode === "HYBRID"
        ? `Hybrid scenario (designed overlay on observed trace) · status=${effectiveDoc.semanticStatus}`
        : `Designed UML 2.5.1 interaction · status=${effectiveDoc.semanticStatus} · not observed execution`;

  const cells: string[] = [
    '<mxCell id="0"/><mxCell id="1" parent="0"/>',
    `<mxCell id="title" mavisRole="metadata-carrier" mavisInteraction="${escapeXml(encodedInteraction)}" mavisScenario="${escapeXml(encodedLegacy)}" mavisRuleVersion="M3-UML251-v2" value="${escapeXml(effectiveDoc.name)}" style="text;html=0;fontFamily=Arial;fontSize=20;fontStyle=1;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="18" width="${width - 80}" height="32" as="geometry"/></mxCell>`,
    `<mxCell id="scope" value="${escapeXml(scopeBannerText)}" style="text;html=0;fontFamily=Arial;fontSize=12;fontColor=#334155;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="54" width="${width - 80}" height="24" as="geometry"/></mxCell>`,
    `<mxCell id="notation-legend" value="${escapeXml("Legend: solid+filled=SYNCH_CALL · solid+open=ASYNCH · dashed+open=REPLY/CREATE · X=DELETE · dashed+oval+[?]=UNKNOWN (unclassified)")}" style="text;html=0;fontFamily=Arial;fontSize=11;fontColor=#475569;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="80" width="${width - 80}" height="22" as="geometry"/></mxCell>`,
  ];

  // 1. Render CombinedFragments (behind lifelines/messages or framing them)
  const renderFragmentCells = (frag: CombinedFragment, depth: number) => {
    const coveredIndices = frag.coveredParticipantIds
      .map((pid) => participantIndex.get(pid))
      .filter((idx): idx is number => idx !== undefined);
    const allMsgYs: number[] = [];
    const collectYs = (f: CombinedFragment) => {
      for (const op of f.operands) {
        for (const mid of op.messageIds) {
          const my = messageYById.get(mid);
          if (my !== undefined) allMsgYs.push(my);
        }
        for (const nf of op.nestedFragments ?? []) collectYs(nf);
      }
    };
    collectYs(frag);

    const minColIdx = coveredIndices.length > 0 ? Math.min(...coveredIndices) : 0;
    const maxColIdx =
      coveredIndices.length > 0
        ? Math.max(...coveredIndices)
        : Math.max(0, effectiveDoc.participants.length - 1);
    const inset = depth * 14;
    const frameX = (participantX[minColIdx] ?? LEFT_MARGIN) - 18 + inset;
    const frameRight =
      (participantX[maxColIdx] ?? LEFT_MARGIN) + COL_WIDTH + 18 - inset;
    const frameWidth = Math.max(240, frameRight - frameX);

    const topY = (allMsgYs.length > 0 ? Math.min(...allMsgYs) : firstMessageY) - 34 + inset;
    const bottomY =
      (allMsgYs.length > 0 ? Math.max(...allMsgYs) : firstMessageY + 60) + 34 - inset;
    const frameHeight = Math.max(68, bottomY - topY);

    let operatorHeader: string = frag.operator;
    if (frag.operator === "loop" && frag.operands[0]) {
      const minIt = frag.operands[0].minIterations;
      const maxIt = frag.operands[0].maxIterations;
      if (minIt !== undefined && minIt !== null) {
        operatorHeader = `loop(${minIt}${maxIt !== undefined && maxIt !== null ? `, ${maxIt}` : ""})`;
      }
    }
    if ((DEFERRED_FRAGMENT_OPERATORS as readonly string[]).includes(frag.operator)) {
      operatorHeader = `${frag.operator} [DESIGNED_ONLY]`;
    }

    cells.push(
      `<mxCell id="fragment-${escapeXml(frag.fragmentId)}" mavisId="${escapeXml(frag.fragmentId)}" mavisRole="combined-fragment" mavisOperator="${escapeXml(frag.operator)}" value="${escapeXml(operatorHeader)}" style="shape=umlFrame;whiteSpace=wrap;html=0;width=88;height=22;boundedLbl=1;verticalAlign=top;align=left;spacingLeft=6;fontFamily=Arial;fontSize=12;fontStyle=1;fillColor=none;strokeColor=#334155;fontColor=#0f172a;" vertex="1" parent="1"><mxGeometry x="${frameX}" y="${topY}" width="${frameWidth}" height="${frameHeight}" as="geometry"/></mxCell>`,
    );

    frag.operands.forEach((op, opIdx) => {
      const opYs = op.messageIds
        .map((id) => messageYById.get(id))
        .filter((y): y is number => y !== undefined);
      const opTopY =
        opYs.length > 0
          ? Math.min(...opYs) - 24
          : topY + 22 + opIdx * Math.floor((frameHeight - 22) / Math.max(1, frag.operands.length));

      if (opIdx > 0) {
        cells.push(
          `<mxCell id="fragment-${escapeXml(frag.fragmentId)}-div-${opIdx}" mavisRole="operand-divider" value="" style="endArrow=none;dashed=1;dashPattern=6 4;html=0;strokeColor=#475569;strokeWidth=1.2;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${frameX}" y="${opTopY}" as="sourcePoint"/><mxPoint x="${frameX + frameWidth}" y="${opTopY}" as="targetPoint"/></mxGeometry></mxCell>`,
        );
      }
      if (op.guard && op.guard.trim()) {
        const guardText = op.guard.trim().startsWith("[") ? op.guard.trim() : `[${op.guard.trim()}]`;
        cells.push(
          `<mxCell id="fragment-${escapeXml(frag.fragmentId)}-guard-${opIdx}" mavisRole="operand-guard" value="${escapeXml(guardText)}" style="text;html=0;fontFamily=Arial;fontSize=11;fontStyle=2;fontColor=#1e293b;align=left;" vertex="1" parent="1"><mxGeometry x="${frameX + 12}" y="${opTopY + 2}" width="${Math.min(320, frameWidth - 24)}" height="18" as="geometry"/></mxCell>`,
        );
      }
      for (const nested of op.nestedFragments ?? []) {
        renderFragmentCells(nested, depth + 1);
      }
    });
  };

  for (const frag of effectiveDoc.fragments) {
    renderFragmentCells(frag, 0);
  }

  // 2. Render InteractionUses (ref frames — distinct from CombinedFragment)
  effectiveDoc.interactionUses.forEach((iu, iuIdx) => {
    const coveredIndices = iu.coveredParticipantIds
      .map((pid) => participantIndex.get(pid))
      .filter((idx): idx is number => idx !== undefined);
    const minColIdx = coveredIndices.length > 0 ? Math.min(...coveredIndices) : 0;
    const maxColIdx =
      coveredIndices.length > 0
        ? Math.max(...coveredIndices)
        : Math.max(0, effectiveDoc.participants.length - 1);
    const refX = (participantX[minColIdx] ?? LEFT_MARGIN) - 12;
    const refRight = (participantX[maxColIdx] ?? LEFT_MARGIN) + COL_WIDTH + 12;
    const refWidth = Math.max(220, refRight - refX);

    const anchorY =
      (iu.afterMessageId ? messageYById.get(iu.afterMessageId) : undefined) ??
      firstMessageY + (effectiveDoc.messages.length + iuIdx) * ROW_STEP;
    const refY = iu.afterMessageId ? anchorY + 24 : anchorY - 20;
    const refStatus =
      iu.resolutionStatus === "RESOLVED" && iu.targetInteractionId
        ? `→ ${iu.targetInteractionId}`
        : "[UNRESOLVED TARGET]";
    const bodyText = `${iu.name}${iu.arguments ? `(${iu.arguments})` : ""}\n${refStatus}`;

    cells.push(
      `<mxCell id="interaction-use-${escapeXml(iu.interactionUseId)}" mavisId="${escapeXml(iu.interactionUseId)}" mavisRole="interaction-use" mavisTargetInteractionId="${escapeXml(iu.targetInteractionId ?? "")}" value="ref" style="shape=umlFrame;whiteSpace=wrap;html=0;width=48;height=20;boundedLbl=1;verticalAlign=top;align=left;spacingLeft=6;fontFamily=Arial;fontSize=12;fontStyle=1;fillColor=#f8fafc;strokeColor=#0f766e;fontColor=#0f766e;" vertex="1" parent="1"><mxGeometry x="${refX}" y="${refY}" width="${refWidth}" height="52" as="geometry"/></mxCell>`,
      `<mxCell id="interaction-use-label-${escapeXml(iu.interactionUseId)}" mavisRole="interaction-use-label" value="${escapeXml(bodyText)}" style="text;html=0;fontFamily=Arial;fontSize=12;align=center;verticalAlign=middle;fontColor=#0f172a;" vertex="1" parent="1"><mxGeometry x="${refX + 50}" y="${refY + 6}" width="${Math.max(120, refWidth - 60)}" height="40" as="geometry"/></mxCell>`,
    );
  });

  // 3. Render Participant Lifelines (never underlined; supports CREATE start Y and DELETE destroy X)
  effectiveDoc.participants.forEach((p, i) => {
    const x = participantX[i]!;
    const createY = createdAtY.get(p.participantId);
    const destroyY = destroyedAtY.get(p.participantId);
    const startY = createY !== undefined ? Math.max(topLifelineY, createY - Math.floor(headerHeight / 2)) : topLifelineY;
    const endY = destroyY !== undefined ? Math.min(height - 30, destroyY + 12) : height - 30;
    const lifelineHeight = Math.max(headerHeight + 40, endY - startY);

    const stereotype = formatStereotype(p.elementType, p.resolutionStatus);
    const titleLines = wrapText(formatLifelineTitle(p), 24);
    const displayValue = [stereotype, ...titleLines].join("\n");

    const isUncertain =
      p.resolutionStatus !== "RESOLVED" && p.resolutionStatus !== "DESIGNED_ROLE";
    const fillColor = isUncertain ? "#fef3c7" : "#eaf2ff";
    const strokeColor = isUncertain ? "#b45309" : "#52677f";

    // fontStyle=0 ensures lifeline header is NEVER underlined (UML 2.5.1 compliant)
    cells.push(
      `<mxCell id="participant-${i}" mavisId="${escapeXml(p.modelElementId ?? p.participantId)}" mavisParticipantId="${escapeXml(p.participantId)}" mavisModelElementId="${escapeXml(p.modelElementId ?? "")}" mavisResolutionStatus="${escapeXml(p.resolutionStatus)}" mavisName="${escapeXml(p.name)}" mavisRole="participant" value="${escapeXml(displayValue)}" style="shape=umlLifeline;perimeter=lifelinePerimeter;size=${headerHeight};html=0;whiteSpace=wrap;fontFamily=Arial;fontSize=13;fontStyle=0;verticalAlign=top;spacingTop=10;fillColor=${fillColor};strokeColor=${strokeColor};fontColor=#102c4f;" vertex="1" parent="1"><mxGeometry x="${x}" y="${startY}" width="${COL_WIDTH}" height="${lifelineHeight}" as="geometry"/></mxCell>`,
    );

    if (destroyY !== undefined) {
      const cx = participantCenterX[i]!;
      cells.push(
        `<mxCell id="destroy-${escapeXml(p.participantId)}" mavisParticipantId="${escapeXml(p.participantId)}" mavisRole="lifeline-destroy" value="" style="shape=umlDestroy;whiteSpace=wrap;html=0;strokeWidth=2.2;strokeColor=#b91c1c;fillColor=none;" vertex="1" parent="1"><mxGeometry x="${cx - 12}" y="${destroyY - 12}" width="24" height="24" as="geometry"/></mxCell>`,
      );
    }
  });

  // 4. Render ExecutionSpecification (activation bars, including nested activations)
  effectiveDoc.executions.forEach((exec) => {
    const pIdx = participantIndex.get(exec.participantId);
    if (pIdx === undefined) return;
    const startY = messageYById.get(exec.startMessageId);
    const endY = messageYById.get(exec.endMessageId);
    if (startY === undefined || endY === undefined) return;
    const cx = participantCenterX[pIdx]!;
    const barX = cx - 6 + exec.nestingLevel * 6;
    const barY = Math.min(startY, endY) - 6;
    const barHeight = Math.max(28, Math.abs(endY - startY) + 24);
    cells.push(
      `<mxCell id="exec-${escapeXml(exec.executionId)}" mavisId="${escapeXml(exec.executionId)}" mavisParticipantId="${escapeXml(exec.participantId)}" mavisRole="execution-spec" value="" style="html=0;whiteSpace=wrap;fillColor=#dbeafe;strokeColor=#1d4ed8;strokeWidth=1.2;" vertex="1" parent="1"><mxGeometry x="${barX}" y="${barY}" width="12" height="${barHeight}" as="geometry"/></mxCell>`,
    );
  });

  // 5. Render Messages (distinct occurrence IDs, UML 2.5.1 arrowhead/dash styles, self-call loops, Found/Lost black circle endpoints)
  effectiveDoc.messages.forEach((msg, i) => {
    const isFoundEndpoint =
      msg.endpointKind === "FOUND" || msg.fromParticipantId === "__FOUND__";
    const isLostEndpoint =
      msg.endpointKind === "LOST" || msg.toParticipantId === "__LOST__";
    const fromIdx = participantIndex.get(msg.fromParticipantId);
    const toIdx = participantIndex.get(msg.toParticipantId);
    if (!isFoundEndpoint && fromIdx === undefined) return;
    if (!isLostEndpoint && toIdx === undefined) return;

    const y = messageYById.get(msg.messageId) ?? firstMessageY + i * ROW_STEP;
    const fromStartY =
      createdAtY.get(msg.fromParticipantId) !== undefined
        ? Math.max(topLifelineY, createdAtY.get(msg.fromParticipantId)! - Math.floor(headerHeight / 2))
        : topLifelineY;
    const toStartY =
      createdAtY.get(msg.toParticipantId) !== undefined
        ? Math.max(topLifelineY, createdAtY.get(msg.toParticipantId)! - Math.floor(headerHeight / 2))
        : topLifelineY;
    const fromEndY =
      destroyedAtY.get(msg.fromParticipantId) !== undefined
        ? Math.min(height - 30, destroyedAtY.get(msg.fromParticipantId)! + 12)
        : height - 30;
    const toEndY =
      destroyedAtY.get(msg.toParticipantId) !== undefined
        ? Math.min(height - 30, destroyedAtY.get(msg.toParticipantId)! + 12)
        : height - 30;

    const fromHeight = Math.max(headerHeight + 40, fromEndY - fromStartY);
    const toHeight = Math.max(headerHeight + 40, toEndY - toStartY);
    const exitPos = Math.max(0.05, Math.min(0.98, (y - fromStartY) / fromHeight));
    const entryTargetY = fromIdx !== undefined && fromIdx === toIdx ? y + 28 : y;
    const entryPos = Math.max(0.05, Math.min(0.98, (entryTargetY - toStartY) / toHeight));

    let sourceCellId = `participant-${fromIdx ?? 0}`;
    let targetCellId = `participant-${toIdx ?? 0}`;
    let exitPortStyle = `exitX=0.5;exitY=${exitPos};exitPerimeter=0;`;
    let entryPortStyle = `entryX=0.5;entryY=${entryPos};entryPerimeter=0;`;

    if (isFoundEndpoint) {
      const foundCellId = `found-origin-${escapeXml(msg.messageId)}`;
      const targetCenterX = participantCenterX[toIdx ?? 0] ?? LEFT_MARGIN + COL_WIDTH / 2;
      const foundX = Math.max(12, targetCenterX - 130);
      cells.push(
        `<mxCell id="${foundCellId}" mavisId="${escapeXml(msg.fromParticipantId)}" mavisParticipantId="${escapeXml(msg.fromParticipantId)}" mavisRole="found-message-origin" value="" style="ellipse;whiteSpace=wrap;html=0;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;" vertex="1" parent="1"><mxGeometry x="${foundX}" y="${y - 7}" width="14" height="14" as="geometry"/></mxCell>`,
      );
      sourceCellId = foundCellId;
      exitPortStyle = "exitX=1;exitY=0.5;exitPerimeter=1;";
    }

    if (isLostEndpoint) {
      const lostCellId = `lost-target-${escapeXml(msg.messageId)}`;
      const sourceCenterX = participantCenterX[fromIdx ?? 0] ?? LEFT_MARGIN + COL_WIDTH / 2;
      const lostX = sourceCenterX + 116;
      cells.push(
        `<mxCell id="${lostCellId}" mavisId="${escapeXml(msg.toParticipantId)}" mavisParticipantId="${escapeXml(msg.toParticipantId)}" mavisRole="lost-message-target" value="" style="ellipse;whiteSpace=wrap;html=0;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;" vertex="1" parent="1"><mxGeometry x="${lostX}" y="${y - 7}" width="14" height="14" as="geometry"/></mxCell>`,
      );
      targetCellId = lostCellId;
      entryPortStyle = "entryX=0;entryY=0.5;entryPerimeter=1;";
    }

    const label = formatMessageLabel(msg, i);
    const arrowStyle = styleForMessageSort(msg.messageSort);
    const selfLoopX = (participantCenterX[fromIdx ?? 0] ?? LEFT_MARGIN) + 48;
    const points =
      !isFoundEndpoint && !isLostEndpoint && fromIdx !== undefined && fromIdx === toIdx
        ? `<Array as="points"><mxPoint x="${selfLoopX}" y="${y}"/><mxPoint x="${selfLoopX}" y="${y + 28}"/></Array>`
        : "";
    const primarySourceRelId = msg.sourceRelationshipIds[0] ?? msg.messageId;
    const underlyingAttr =
      msg.sourceRelationshipIds.length > 0
        ? ` underlyingEdgeIds="${escapeXml(msg.sourceRelationshipIds.join(","))}"`
        : "";

    cells.push(
      `<mxCell id="step-${i}" mavisId="${escapeXml(primarySourceRelId)}" mavisMessageId="${escapeXml(msg.messageId)}" mavisMessageSort="${escapeXml(msg.messageSort)}" mavisFromParticipantId="${escapeXml(msg.fromParticipantId)}" mavisToParticipantId="${escapeXml(msg.toParticipantId)}"${underlyingAttr} mavisRole="edge" value="${escapeXml(label)}" style="edgeStyle=none;html=0;${arrowStyle}fontFamily=Arial;fontSize=12;fontColor=#102c4f;labelBackgroundColor=#ffffff;${exitPortStyle}${entryPortStyle}" edge="1" parent="1" source="${sourceCellId}" target="${targetCellId}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="MAVIS"><diagram id="designed-scenario" name="${escapeXml(effectiveDoc.name)}"><mxGraphModel mavisNotation="UML_SEQUENCE" mavisModelId="${escapeXml(effectiveDoc.modelId)}" mavisViewId="${escapeXml(effectiveDoc.interactionId)}" mavisInteraction="${escapeXml(encodedInteraction)}" mavisScenario="${escapeXml(encodedLegacy)}" page="0" grid="0" background="#ffffff"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

export interface ExtractedInteractionResult {
  document: InteractionDocument;
  migratedFromV0: boolean;
  roundTripConflicts: string[];
}

function parseXmlAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrString)) !== null) {
    if (m[1]) {
      attrs[m[1]] = unescapeXml(m[2] ?? "");
    }
  }
  return attrs;
}

function formatFragmentOperatorHeader(frag: CombinedFragment): string {
  let operatorHeader: string = frag.operator;
  if (frag.operator === "loop" && frag.operands[0]) {
    const minIt = frag.operands[0].minIterations;
    const maxIt = frag.operands[0].maxIterations;
    if (minIt !== undefined && minIt !== null) {
      operatorHeader = `loop(${minIt}${maxIt !== undefined && maxIt !== null ? `, ${maxIt}` : ""})`;
    }
  }
  if ((DEFERRED_FRAGMENT_OPERATORS as readonly string[]).includes(frag.operator)) {
    operatorHeader = `${frag.operator} [DESIGNED_ONLY]`;
  }
  return operatorHeader;
}

export function extractInteractionFromDrawioXml(
  xml: string,
  model?: ArchitecturalModel,
): ExtractedInteractionResult | null {
  try {
    const roundTripConflicts: string[] = [];
    // 1. Prefer V2 mavisInteraction carrier (from either <mxCell id="title"> or <mxGraphModel>)
    const interactionMatch = /\bmavisInteraction="([^"]*)"/.exec(xml)?.[1];
    let doc: InteractionDocument | null = null;
    let migratedFromV0 = false;

    if (interactionMatch) {
      const rawJson = decodeURIComponent(unescapeXml(interactionMatch));
      doc = interactionDocumentSchema.parse(JSON.parse(rawJson));
    } else {
      // 2. Fallback to V0 mavisScenario carrier
      const legacyMatch = /\bmavisScenario="([^"]*)"/.exec(xml)?.[1];
      if (!legacyMatch) return null;
      const legacy = legacyDesignSchema.parse(
        JSON.parse(decodeURIComponent(unescapeXml(legacyMatch))),
      );
      if (!model) {
        return null;
      }
      doc = upgradeLegacyScenarioDesign(legacy, model);
      migratedFromV0 = true;
    }

    if (model && doc.modelId !== model.id && doc.baseModelId !== model.id) {
      return null;
    }

    // 3. Parse all <mxCell> nodes in the XML to preserve layoutX edits and detect structural/semantic edits
    const cellRegex = /<mxCell\b([^>]*)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
    const xmlParticipantX = new Map<string, number>();
    const xmlParticipantsByPid = new Map<
      string,
      { cellId: string; value: string; name?: string; style?: string }
    >();
    const xmlStepMessages = new Map<
      string,
      {
        cellId: string;
        value: string;
        source?: string;
        target?: string;
        sort?: string;
        style?: string;
      }
    >();
    const cellIdToParticipantId = new Map<string, string>();
    const allCellsById = new Map<
      string,
      { attrs: Record<string, string>; body: string }
    >();

    let match: RegExpExecArray | null;
    while ((match = cellRegex.exec(xml)) !== null) {
      const rawAttrs = match[1] ?? "";
      const body = match[2] ?? "";
      const attrs = parseXmlAttributes(rawAttrs);
      const cellId = attrs["id"];
      if (cellId) {
        allCellsById.set(cellId, { attrs, body });
      }
      const role = attrs["mavisRole"];
      const pId =
        attrs["mavisParticipantId"] ??
        (role === "participant" ? attrs["mavisId"] : undefined);

      if ((role === "found-message-origin" || role === "lost-message-target") && cellId && pId) {
        cellIdToParticipantId.set(cellId, pId);
      } else if (role === "participant" && cellId) {
        const effectivePid =
          pId && doc.participants.some((p) => p.participantId === pId)
            ? pId
            : doc.participants.find((p) => p.modelElementId === pId)?.participantId;
        if (effectivePid) {
          cellIdToParticipantId.set(cellId, effectivePid);
          xmlParticipantsByPid.set(effectivePid, {
            cellId,
            value: attrs["value"] ?? "",
            ...(attrs["mavisName"] ? { name: attrs["mavisName"] } : {}),
            ...(attrs["style"] ? { style: attrs["style"] } : {}),
          });
          const xMatch = /<mxGeometry\b[^>]*\bx="([0-9.-]+)"/.exec(body);
          if (xMatch && xMatch[1]) {
            const parsedX = Number(xMatch[1]);
            if (Number.isFinite(parsedX)) {
              xmlParticipantX.set(effectivePid, Math.round(parsedX));
            }
          }
        }
      } else if ((role === "edge" || (cellId && cellId.startsWith("step-"))) && cellId) {
        const msgId =
          attrs["mavisMessageId"] ??
          doc.messages[Number(cellId.replace("step-", ""))]?.messageId ??
          `msg-${Number(cellId.replace("step-", "")) + 1}`;
        xmlStepMessages.set(msgId, {
          cellId,
          value: attrs["value"] ?? "",
          ...(attrs["source"] ? { source: attrs["source"] } : {}),
          ...(attrs["target"] ? { target: attrs["target"] } : {}),
          ...(attrs["mavisMessageSort"] ? { sort: attrs["mavisMessageSort"] } : {}),
          ...(attrs["style"] ? { style: attrs["style"] } : {}),
        });
      }
    }

    // Apply preserved layoutX from Draw.io canvas
    const updatedParticipants = doc.participants.map((p) => {
      const newX = xmlParticipantX.get(p.participantId);
      return newX !== undefined ? { ...p, layoutX: newX } : p;
    });

    // 4. Enforce Layout-Only Draw.io Contract when loading V2 mavisInteraction XML with diagram cells
    const hasRenderedDiagramCells = !migratedFromV0 && allCellsById.size > 3;
    if (hasRenderedDiagramCells) {
      const expectedVertexCellIds = new Set<string>([
        "0",
        "1",
        "title",
        "scope",
        "notation-legend",
      ]);
      const expectedEdgeCellIds = new Set<string>();

      // 4a. Check participants (deletion or label edit)
      doc.participants.forEach((p, idx) => {
        expectedVertexCellIds.add(`participant-${idx}`);
        expectedVertexCellIds.add(`destroy-${p.participantId}`);
        const xmlP = xmlParticipantsByPid.get(p.participantId);
        if (!xmlP) {
          roundTripConflicts.push(
            `[DELETED_PARTICIPANT_IN_DRAWIO] Participant "${p.participantId}" ("${p.name}") was deleted from the Draw.io XML while remaining in the interaction metadata. Use the Scenario Editor to remove participants.`,
          );
          return;
        }
        expectedVertexCellIds.add(xmlP.cellId);
        const stereotype = formatStereotype(p.elementType, p.resolutionStatus);
        const titleLines = wrapText(formatLifelineTitle(p), 24);
        const expectedDisplayValue = [stereotype, ...titleLines].join("\n");
        if (xmlP.value.trim() !== expectedDisplayValue.trim()) {
          roundTripConflicts.push(
            `[EDITED_PARTICIPANT_LABEL_IN_DRAWIO] Participant "${p.participantId}" label was edited in Draw.io ("${xmlP.value.replace(/\n/g, " ")}" vs "${expectedDisplayValue.replace(/\n/g, " ")}"). Use the Scenario Editor to rename participants or roles.`,
          );
        }
      });

      // 4b. Check messages (deletion, endpoint rewiring, label edit, or sort/style edit)
      doc.messages.forEach((msg, idx) => {
        expectedEdgeCellIds.add(`step-${idx}`);
        expectedVertexCellIds.add(`found-origin-${msg.messageId}`);
        expectedVertexCellIds.add(`lost-target-${msg.messageId}`);
        const xmlEdge = xmlStepMessages.get(msg.messageId);
        if (!xmlEdge) {
          roundTripConflicts.push(
            `[DELETED_MESSAGE_IN_DRAWIO] Message "${msg.messageId}" ("${msg.label}") was deleted from the Draw.io XML while remaining in the interaction metadata. Use the Scenario Editor to delete messages.`,
          );
          return;
        }
        expectedEdgeCellIds.add(xmlEdge.cellId);

        const srcPid = xmlEdge.source ? cellIdToParticipantId.get(xmlEdge.source) : undefined;
        const tgtPid = xmlEdge.target ? cellIdToParticipantId.get(xmlEdge.target) : undefined;
        if (!srcPid || srcPid !== msg.fromParticipantId) {
          roundTripConflicts.push(
            `[REWIRED_MESSAGE_SOURCE_IN_DRAWIO] Message "${msg.messageId}" sender was changed or detached in Draw.io (expected "${msg.fromParticipantId}", found "${srcPid ?? xmlEdge.source ?? "none"}"). Typed semantics preserved; use Scenario Editor to change message endpoints.`,
          );
        }
        if (!tgtPid || tgtPid !== msg.toParticipantId) {
          roundTripConflicts.push(
            `[REWIRED_MESSAGE_TARGET_IN_DRAWIO] Message "${msg.messageId}" receiver was changed or detached in Draw.io (expected "${msg.toParticipantId}", found "${tgtPid ?? xmlEdge.target ?? "none"}"). Typed semantics preserved; use Scenario Editor to change message endpoints.`,
          );
        }

        const expectedLabel = formatMessageLabel(msg, idx);
        if (xmlEdge.value.trim() !== expectedLabel.trim()) {
          roundTripConflicts.push(
            `[EDITED_MESSAGE_LABEL_IN_DRAWIO] Message "${msg.messageId}" label was edited in Draw.io ("${xmlEdge.value}" vs "${expectedLabel}"). Use the Scenario Editor to edit message labels, guards, or arguments.`,
          );
        }

        if (xmlEdge.sort && xmlEdge.sort !== msg.messageSort) {
          roundTripConflicts.push(
            `[EDITED_MESSAGE_SORT_STYLE_IN_DRAWIO] Message "${msg.messageId}" mavisMessageSort attribute was modified in Draw.io ("${xmlEdge.sort}" vs "${msg.messageSort}").`,
          );
        } else if (xmlEdge.style) {
          const expectedStyle = styleForMessageSort(msg.messageSort);
          const expectedEndArrow = /\bendArrow=([^;]+);/.exec(expectedStyle)?.[1];
          const expectedDashed = /\bdashed=([^;]+);/.exec(expectedStyle)?.[1];
          const actualEndArrow = /\bendArrow=([^;]+);/.exec(xmlEdge.style)?.[1];
          const actualDashed = /\bdashed=([^;]+);/.exec(xmlEdge.style)?.[1];
          if (
            (expectedEndArrow && actualEndArrow && expectedEndArrow !== actualEndArrow) ||
            (expectedDashed && actualDashed && expectedDashed !== actualDashed)
          ) {
            roundTripConflicts.push(
              `[EDITED_MESSAGE_SORT_STYLE_IN_DRAWIO] Message "${msg.messageId}" arrow style was modified in Draw.io (expected ${msg.messageSort} style). Use the Scenario Editor to change messageSort.`,
            );
          }
        }
      });

      // 4c. Check ExecutionSpecifications
      for (const exec of doc.executions) {
        const execCellId = `exec-${exec.executionId}`;
        expectedVertexCellIds.add(execCellId);
        if (!allCellsById.has(execCellId)) {
          roundTripConflicts.push(
            `[DELETED_EXECUTION_IN_DRAWIO] ExecutionSpecification "${exec.executionId}" was deleted from the Draw.io XML.`,
          );
        }
      }

      // 4d. Check CombinedFragments recursively
      const checkFragmentCells = (frag: CombinedFragment) => {
        const fragCellId = `fragment-${frag.fragmentId}`;
        expectedVertexCellIds.add(fragCellId);
        const fragCell = allCellsById.get(fragCellId);
        if (!fragCell) {
          roundTripConflicts.push(
            `[DELETED_FRAGMENT_IN_DRAWIO] CombinedFragment "${frag.fragmentId}" (${frag.operator}) was deleted from the Draw.io XML.`,
          );
        } else {
          const expectedHeader = formatFragmentOperatorHeader(frag);
          const actualVal = (fragCell.attrs["value"] ?? "").trim();
          const actualOp = fragCell.attrs["mavisOperator"];
          if (
            actualVal !== expectedHeader.trim() ||
            (actualOp && actualOp !== frag.operator)
          ) {
            roundTripConflicts.push(
              `[EDITED_FRAGMENT_IN_DRAWIO] CombinedFragment "${frag.fragmentId}" header/operator was edited in Draw.io ("${actualVal}" vs "${expectedHeader}").`,
            );
          }
        }

        frag.operands.forEach((op, opIdx) => {
          if (opIdx > 0) {
            const divCellId = `fragment-${frag.fragmentId}-div-${opIdx}`;
            expectedEdgeCellIds.add(divCellId);
            if (!allCellsById.has(divCellId)) {
              roundTripConflicts.push(
                `[EDITED_FRAGMENT_OPERAND_IN_DRAWIO] CombinedFragment "${frag.fragmentId}" operand divider #${opIdx} was deleted in Draw.io.`,
              );
            }
          }
          if (op.guard && op.guard.trim()) {
            const guardCellId = `fragment-${frag.fragmentId}-guard-${opIdx}`;
            expectedVertexCellIds.add(guardCellId);
            const guardCell = allCellsById.get(guardCellId);
            const expectedGuard = op.guard.trim().startsWith("[")
              ? op.guard.trim()
              : `[${op.guard.trim()}]`;
            if (!guardCell) {
              roundTripConflicts.push(
                `[EDITED_FRAGMENT_OPERAND_IN_DRAWIO] CombinedFragment "${frag.fragmentId}" guard "${expectedGuard}" was deleted in Draw.io.`,
              );
            } else if ((guardCell.attrs["value"] ?? "").trim() !== expectedGuard) {
              roundTripConflicts.push(
                `[EDITED_FRAGMENT_OPERAND_IN_DRAWIO] CombinedFragment "${frag.fragmentId}" guard was edited in Draw.io ("${guardCell.attrs["value"]}" vs "${expectedGuard}").`,
              );
            }
          }
          for (const nested of op.nestedFragments ?? []) {
            checkFragmentCells(nested);
          }
        });
      };
      for (const frag of doc.fragments) {
        checkFragmentCells(frag);
      }

      // 4e. Check InteractionUses
      for (const iu of doc.interactionUses) {
        const iuCellId = `interaction-use-${iu.interactionUseId}`;
        const iuLabelCellId = `interaction-use-label-${iu.interactionUseId}`;
        expectedVertexCellIds.add(iuCellId);
        expectedVertexCellIds.add(iuLabelCellId);
        const iuCell = allCellsById.get(iuCellId);
        const iuLabelCell = allCellsById.get(iuLabelCellId);
        const refStatus =
          iu.resolutionStatus === "RESOLVED" && iu.targetInteractionId
            ? `→ ${iu.targetInteractionId}`
            : "[UNRESOLVED TARGET]";
        const expectedBodyText = `${iu.name}${iu.arguments ? `(${iu.arguments})` : ""}\n${refStatus}`;
        if (!iuCell || !iuLabelCell) {
          roundTripConflicts.push(
            `[EDITED_OR_DELETED_INTERACTION_USE_IN_DRAWIO] InteractionUse "${iu.interactionUseId}" ("ref ${iu.name}") was deleted from the Draw.io XML.`,
          );
        } else if (
          (iuCell.attrs["value"] ?? "").trim() !== "ref" ||
          (iuLabelCell.attrs["value"] ?? "").trim() !== expectedBodyText.trim()
        ) {
          roundTripConflicts.push(
            `[EDITED_OR_DELETED_INTERACTION_USE_IN_DRAWIO] InteractionUse "${iu.interactionUseId}" ("ref ${iu.name}") was edited in Draw.io.`,
          );
        }
      }

      // 4f. Check for unmapped added vertices or edges in Draw.io
      for (const [cellId, { attrs }] of allCellsById.entries()) {
        if (cellId === "0" || cellId === "1") continue;
        if (attrs["edge"] === "1" && !expectedEdgeCellIds.has(cellId)) {
          roundTripConflicts.push(
            `[ADDED_UNMAPPED_MESSAGE_IN_DRAWIO] Unmapped edge cell "${cellId}" was added directly in Draw.io. Add messages via the Scenario Editor instead.`,
          );
        } else if (attrs["vertex"] === "1" && !expectedVertexCellIds.has(cellId)) {
          roundTripConflicts.push(
            `[ADDED_UNMAPPED_CELL_IN_DRAWIO] Unmapped vertex cell "${cellId}" was added directly in Draw.io. Add participants or fragments via the Scenario Editor instead.`,
          );
        }
      }
    }

    const nextLimitations =
      roundTripConflicts.length > 0
        ? [...new Set([...doc.limitations, "DRAWIO_STRUCTURAL_CONFLICT_DETECTED"])]
        : doc.limitations.filter((l) => l !== "DRAWIO_STRUCTURAL_CONFLICT_DETECTED");

    const baseUpdatedDoc: InteractionDocument = {
      ...doc,
      participants: updatedParticipants,
      limitations: nextLimitations,
    };
    const validation = validateInteractionDocument(baseUpdatedDoc, model);

    const updatedDoc: InteractionDocument = {
      ...baseUpdatedDoc,
      semanticStatus:
        roundTripConflicts.length > 0 ? "UNVERIFIED" : validation.semanticStatus,
    };

    return {
      document: updatedDoc,
      migratedFromV0,
      roundTripConflicts,
    };
  } catch {
    return null;
  }
}

export function relayoutSequenceDrawioXml(xml: string, model?: ArchitecturalModel): string {
  const extracted = extractInteractionFromDrawioXml(xml, model);
  if (!extracted) return xml;
  const resetParticipants = extracted.document.participants.map((p) => {
    const copy = { ...p };
    delete copy.layoutX;
    return copy;
  });
  return interactionToDrawioXml(
    {
      ...extracted.document,
      participants: resetParticipants,
    },
    model,
  );
}

export function readScenarioDesign(xml: string, model: ArchitecturalModel): ScenarioDesign | null {
  try {
    const extracted = extractInteractionFromDrawioXml(xml, model);
    if (extracted) {
      if (extracted.document.legacyV0Scenario) {
        const allowed = new Set(scenarioInteractions(model).map((edge) => edge.id));
        const leg = extracted.document.legacyV0Scenario;
        if (leg.modelId === model.id && leg.edgeIds.every((id) => allowed.has(id))) {
          return leg;
        }
      }
      const derived = interactionToLegacyScenarioDesign(extracted.document);
      const allowed = new Set(scenarioInteractions(model).map((edge) => edge.id));
      if (derived.modelId === model.id && derived.edgeIds.every((id) => allowed.has(id))) {
        return derived;
      }
    }
    const metadata = /\bmavisScenario="([^"]*)"/.exec(xml)?.[1];
    if (!metadata) return null;
    const design = legacyDesignSchema.parse(JSON.parse(decodeURIComponent(unescapeXml(metadata))));
    const allowed = new Set(scenarioInteractions(model).map((edge) => edge.id));
    return design.modelId === model.id && design.edgeIds.every((id) => allowed.has(id))
      ? design
      : null;
  } catch {
    return null;
  }
}

export function scenarioXml(model: ArchitecturalModel, input: ScenarioDesign): string {
  const design = legacyDesignSchema.parse(input);
  if (design.modelId !== model.id) throw Error("Scenario belongs to another model revision.");
  const allowed = new Map(scenarioInteractions(model).map((edge) => [edge.id, edge]));
  for (const id of design.edgeIds) {
    if (!allowed.has(id)) throw Error("A scenario step is not present in this model.");
  }
  const interaction = upgradeLegacyScenarioDesign(design, model);
  if (interaction.participants.length > 12) {
    throw Error("Use at most 12 participants per scenario to keep it readable.");
  }
  return interactionToDrawioXml(interaction, model);
}

export interface ObservedStepWire {
  stepOrder?: number | null | undefined;
  messageId?: string | null | undefined;
  callerService?: string | null | undefined;
  calleeService?: string | null | undefined;
  callerParticipantId?: string | null | undefined;
  calleeParticipantId?: string | null | undefined;
  callerElementId?: string | null | undefined;
  calleeElementId?: string | null | undefined;
  callerBaseElementId?: string | null | undefined;
  calleeBaseElementId?: string | null | undefined;
  callerResolutionStatus?: string | null | undefined;
  calleeResolutionStatus?: string | null | undefined;
  operation?: string | null | undefined;
  messageSort?: string | null | undefined;
  httpMethod?: string | null | undefined;
  httpStatusCode?: number | null | undefined;
  durationMs?: number | null | undefined;
  traceId?: string | null | undefined;
  spanId?: string | null | undefined;
  parentSpanId?: string | null | undefined;
  relationshipId?: string | null | undefined;
  baseRelationshipId?: string | null | undefined;
  candidateRelationshipIds?: string[] | null | undefined;
  evidenceId?: string | null | undefined;
  provenanceType?: string | null | undefined;
  causalParentMessageIds?: string[] | undefined;
}

export interface ObservedSequencePayload {
  sessionId: string;
  modelId: string;
  baseModelId?: string | null | undefined;
  snapshotId?: string | null | undefined;
  modelRevision?: number | null | undefined;
  baseModelRevision?: number | null | undefined;
  modelOrigin?: string | null | undefined;
  traceStatus?: string | null | undefined;
  mappingStatus?: string | null | undefined;
  startedAt?: string | number | null | undefined;
  completedAt?: string | number | null | undefined;
  limitations?: string[] | undefined;
  steps: ObservedStepWire[];
}

export interface ObservedProjectionOptions {
  traceId?: string | null;
  page?: number;
  pageSize?: number;
  scenarioName?: string | null;
}

export interface ObservedProjectionResult {
  document: InteractionDocument;
  totalSteps: number;
  displayedSteps: number;
  page: number;
  pageCount: number;
  availableTraceIds: string[];
  parallelBranchMessageIds: string[];
  paginationSplitWarning: string | null;
  lineageValid: boolean;
  lineageSummary: string;
}

export function verifyObservedLineage(
  payload: ObservedSequencePayload,
  activeModel: ArchitecturalModel,
  sessionPinnedModelId?: string | null,
): { valid: boolean; summary: string } {
  const matchesEnriched = payload.modelId === activeModel.id;
  const matchesBase =
    Boolean(payload.baseModelId && payload.baseModelId === activeModel.id) ||
    Boolean(sessionPinnedModelId && sessionPinnedModelId === activeModel.id);

  if (!matchesEnriched && !matchesBase) {
    return {
      valid: false,
      summary: `Trace belongs to model ${payload.modelId}${payload.baseModelId ? ` (base ${payload.baseModelId})` : ""}, which does not match active model ${activeModel.id}.`,
    };
  }
  if (matchesBase && !matchesEnriched) {
    return {
      valid: true,
      summary: `Pinned base model rev ${activeModel.revision} (${activeModel.id.slice(0, 8)}) → Runtime-enriched model ${payload.modelRevision ? `rev ${payload.modelRevision} ` : ""}(${payload.modelId.slice(0, 8)})`,
    };
  }
  return {
    valid: true,
    summary: `Runtime-enriched model (${payload.modelId.slice(0, 8)})${payload.baseModelId ? ` derived from base model (${payload.baseModelId.slice(0, 8)})` : ""}`,
  };
}

export function projectObservedSequenceToInteraction(
  payload: ObservedSequencePayload,
  model: ArchitecturalModel,
  options: ObservedProjectionOptions = {},
): ObservedProjectionResult {
  const lineage = verifyObservedLineage(payload, model);
  const elementById = new Map(model.elements.map((el) => [el.id, el]));
  const extraLimitations = new Set<string>();

  // Group elements by lower-case display name to avoid first-name guessing when ambiguous
  const elementsByLowerName = new Map<string, typeof model.elements>();
  for (const el of model.elements) {
    const key = el.name.trim().toLowerCase();
    const list = elementsByLowerName.get(key) ?? [];
    list.push(el);
    elementsByLowerName.set(key, list);
  }

  const availableTraceIds = [
    ...new Set(
      payload.steps
        .map((s) => (typeof s.traceId === "string" && s.traceId.trim() ? s.traceId.trim() : null))
        .filter((t): t is string => Boolean(t)),
    ),
  ];

  const traceFiltered =
    options.traceId && options.traceId !== "all"
      ? payload.steps.filter((s) => s.traceId === options.traceId)
      : payload.steps;

  // Preserve causal partial order: deterministic Kahn topological sort respecting causalParentMessageIds,
  // tie-breaking by stepOrder then msgId BEFORE pagination.
  type IndexedStep = {
    raw: ObservedStepWire;
    order: number;
    msgId: string;
  };
  const indexedSteps: IndexedStep[] = traceFiltered.map((s, idx) => ({
    raw: s,
    order: typeof s.stepOrder === "number" ? s.stepOrder : idx + 1,
    msgId:
      typeof s.messageId === "string" && s.messageId.trim()
        ? s.messageId.trim()
        : `msg-obs-${typeof s.stepOrder === "number" ? s.stepOrder : idx + 1}`,
  }));

  const stepByMsgId = new Map<string, IndexedStep>();
  for (const item of indexedSteps) {
    stepByMsgId.set(item.msgId, item);
  }

  const inDegree = new Map<string, number>();
  const childrenByMsgId = new Map<string, string[]>();
  for (const item of indexedSteps) {
    inDegree.set(item.msgId, 0);
    childrenByMsgId.set(item.msgId, []);
  }

  for (const item of indexedSteps) {
    const seenParents = new Set<string>();
    for (const parentId of item.raw.causalParentMessageIds ?? []) {
      if (!parentId || parentId === item.msgId || seenParents.has(parentId)) continue;
      seenParents.add(parentId);
      if (!stepByMsgId.has(parentId)) {
        extraLimitations.add("MISSING_CAUSAL_PARENT_IN_TRACE");
        continue;
      }
      childrenByMsgId.get(parentId)!.push(item.msgId);
      inDegree.set(item.msgId, (inDegree.get(item.msgId) ?? 0) + 1);
    }
  }

  const compareSteps = (a: IndexedStep, b: IndexedStep) =>
    a.order !== b.order ? a.order - b.order : a.msgId.localeCompare(b.msgId);

  const readyQueue: IndexedStep[] = indexedSteps
    .filter((item) => (inDegree.get(item.msgId) ?? 0) === 0)
    .sort(compareSteps);

  const sortedSteps: IndexedStep[] = [];
  const placedIds = new Set<string>();

  while (readyQueue.length > 0) {
    const current = readyQueue.shift()!;
    if (placedIds.has(current.msgId)) continue;
    placedIds.add(current.msgId);
    sortedSteps.push(current);

    for (const childId of childrenByMsgId.get(current.msgId) ?? []) {
      const nextDeg = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, nextDeg);
      if (nextDeg === 0) {
        const childItem = stepByMsgId.get(childId);
        if (childItem && !placedIds.has(childId)) {
          readyQueue.push(childItem);
          readyQueue.sort(compareSteps);
        }
      }
    }
  }

  if (sortedSteps.length < indexedSteps.length) {
    extraLimitations.add("CAUSAL_CYCLE_DETECTED_IN_TRACE");
    const remaining = indexedSteps
      .filter((item) => !placedIds.has(item.msgId))
      .sort(compareSteps);
    sortedSteps.push(...remaining);
  }

  const pageSize = Math.max(1, options.pageSize ?? 25);
  const totalSteps = sortedSteps.length;
  const pageCount = Math.max(1, Math.ceil(totalSteps / pageSize));
  const page = Math.min(Math.max(0, options.page ?? 0), pageCount - 1);
  const pagedSlice = sortedSteps.slice(page * pageSize, (page + 1) * pageSize);
  const pagedMsgIdSet = new Set(pagedSlice.map((s) => s.msgId));

  let paginationSplitWarning: string | null = null;
  if (totalSteps > pageSize) {
    for (const item of pagedSlice) {
      for (const parentId of item.raw.causalParentMessageIds ?? []) {
        if (!pagedMsgIdSet.has(parentId)) {
          paginationSplitWarning = `Page ${page + 1}/${pageCount} splits a causal call chain: message ${item.msgId} depends on ${parentId} outside this page.`;
          break;
        }
      }
      if (paginationSplitWarning) break;
    }
  }

  const participantMap = new Map<string, SequenceParticipant>();
  const resolveObservedParticipant = (
    serviceName: string | null | undefined,
    explicitPid: string | null | undefined,
    elId: string | null | undefined,
    baseElId: string | null | undefined,
    statusWire: string | null | undefined,
  ): SequenceParticipant => {
    const cleanName = serviceName && serviceName.trim() ? serviceName.trim() : "unknown-service";
    const lowerName = cleanName.toLowerCase();

    // 1. Try canonical IDs first (baseElId for pinned model, elId for enriched model)
    const matchedElement =
      (baseElId && elementById.get(baseElId)) ||
      (elId && elementById.get(elId)) ||
      null;

    if (matchedElement) {
      const pid = explicitPid && explicitPid.trim() ? explicitPid.trim() : `part:${matchedElement.id}`;
      const existing = participantMap.get(pid);
      if (existing) return existing;
      const p: SequenceParticipant = {
        participantId: pid,
        modelElementId: matchedElement.id,
        baseElementId: baseElId ?? matchedElement.id,
        role: null,
        name: matchedElement.name,
        elementType: matchedElement.elementType ?? "SERVICE_CONTAINER",
        abstractionLevel: inferAbstractionLevel(matchedElement.elementType),
        resolutionStatus: "RESOLVED",
        provenance: "OBSERVED",
      };
      participantMap.set(pid, p);
      return p;
    }

    // 2. If backend explicitly marked AMBIGUOUS or UNCERTAIN_MAPPING, honor it without guessing
    if (statusWire === "AMBIGUOUS") {
      const pid = explicitPid && explicitPid.trim() ? explicitPid.trim() : `part:ambiguous:${lowerName}`;
      const existing = participantMap.get(pid);
      if (existing) return existing;
      const p: SequenceParticipant = {
        participantId: pid,
        modelElementId: null,
        baseElementId: null,
        role: null,
        name: cleanName,
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "AMBIGUOUS",
        provenance: "OBSERVED",
      };
      participantMap.set(pid, p);
      return p;
    }

    // 3. Fallback name lookup ONLY when unambiguous in active model
    const candidates = elementsByLowerName.get(lowerName) ?? [];
    const serviceContainers = candidates.filter(
      (c) => (c.elementType ?? "").toUpperCase() === "SERVICE_CONTAINER",
    );
    const uniqueCandidate =
      candidates.length === 1
        ? candidates[0]!
        : serviceContainers.length === 1
          ? serviceContainers[0]!
          : null;

    if (candidates.length > 1 && !uniqueCandidate) {
      const pid = `part:ambiguous:${lowerName}`;
      const existing = participantMap.get(pid);
      if (existing) return existing;
      const p: SequenceParticipant = {
        participantId: pid,
        modelElementId: null,
        baseElementId: null,
        role: null,
        name: cleanName,
        elementType: "SERVICE_CONTAINER",
        abstractionLevel: "CONTAINER",
        resolutionStatus: "AMBIGUOUS",
        provenance: "OBSERVED",
      };
      participantMap.set(pid, p);
      return p;
    }

    if (uniqueCandidate && statusWire !== "UNCERTAIN_MAPPING") {
      const pid = `part:${uniqueCandidate.id}`;
      const existing = participantMap.get(pid);
      if (existing) return existing;
      const p: SequenceParticipant = {
        participantId: pid,
        modelElementId: uniqueCandidate.id,
        baseElementId: uniqueCandidate.id,
        role: null,
        name: uniqueCandidate.name,
        elementType: uniqueCandidate.elementType ?? "SERVICE_CONTAINER",
        abstractionLevel: inferAbstractionLevel(uniqueCandidate.elementType),
        resolutionStatus: "RESOLVED",
        provenance: "OBSERVED",
      };
      participantMap.set(pid, p);
      return p;
    }

    const resStatus: ParticipantResolutionStatus =
      statusWire === "UNCERTAIN_MAPPING" ? "UNCERTAIN_MAPPING" : "UNMAPPED";
    const pid = explicitPid && explicitPid.trim() ? explicitPid.trim() : `part:service:${lowerName}`;
    const existing = participantMap.get(pid);
    if (existing) return existing;
    const p: SequenceParticipant = {
      participantId: pid,
      modelElementId: null,
      baseElementId: null,
      role: null,
      name: cleanName,
      elementType: "SERVICE_CONTAINER",
      abstractionLevel: "CONTAINER",
      resolutionStatus: resStatus,
      provenance: "OBSERVED",
    };
    participantMap.set(pid, p);
    return p;
  };

  const messages: SequenceMessage[] = [];
  const executions: ExecutionSpecification[] = [];
  const parallelGroupCounts = new Map<string, string[]>();
  const modelEdgeIdSet = new Set(model.edges.map((e) => e.id));

  pagedSlice.forEach((item, idx) => {
    const s = item.raw;
    const sender = resolveObservedParticipant(
      s.callerService,
      s.callerParticipantId,
      s.callerElementId,
      s.callerBaseElementId,
      s.callerResolutionStatus,
    );
    const receiver = resolveObservedParticipant(
      s.calleeService,
      s.calleeParticipantId,
      s.calleeElementId,
      s.calleeBaseElementId,
      s.calleeResolutionStatus,
    );

    const rawSort = (s.messageSort ?? "UNKNOWN").toUpperCase();
    const messageSort: MessageSort = (MESSAGE_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as MessageSort)
      : "UNKNOWN";

    // Canonical relationship resolution for 3E lookup:
    // Never pick first-match when multiple relationships share (from, to).
    let relIds: string[] = [];
    if (s.candidateRelationshipIds && s.candidateRelationshipIds.length > 0) {
      relIds = [
        ...new Set(
          s.candidateRelationshipIds.filter((cid) => modelEdgeIdSet.has(cid)),
        ),
      ].sort((a, b) => a.localeCompare(b));
    }
    if (relIds.length === 0) {
      if (s.baseRelationshipId && modelEdgeIdSet.has(s.baseRelationshipId)) {
        relIds = [s.baseRelationshipId];
      } else if (s.relationshipId && modelEdgeIdSet.has(s.relationshipId)) {
        relIds = [s.relationshipId];
      } else if (sender.modelElementId && receiver.modelElementId) {
        relIds = [
          ...new Set(
            model.edges
              .filter(
                (e) =>
                  e.originLayer !== "DEPLOYMENT" &&
                  e.from === sender.modelElementId &&
                  e.to === receiver.modelElementId,
              )
              .map((e) => e.id),
          ),
        ].sort((a, b) => a.localeCompare(b));
      }
    }

    if (relIds.length > 1) {
      extraLimitations.add("AMBIGUOUS_STATIC_RELATIONSHIP_CANDIDATES");
    }

    const evIds: string[] = [];
    if (s.evidenceId) evIds.push(s.evidenceId);

    const causalParents = s.causalParentMessageIds ?? [];
    const parentSignature =
      causalParents.length > 0
        ? `parents:${causalParents.join(",")}`
        : `root:${s.traceId ?? "trace"}:${sender.participantId}`;
    const siblings = parallelGroupCounts.get(parentSignature) ?? [];
    siblings.push(item.msgId);
    parallelGroupCounts.set(parentSignature, siblings);

    const opLabel =
      (s.operation && s.operation.trim()) ||
      [s.httpMethod, s.calleeService].filter(Boolean).join(" ") ||
      "Observed Call";

    messages.push({
      messageId: item.msgId,
      sequenceIndex: idx + 1,
      fromParticipantId: sender.participantId,
      toParticipantId: receiver.participantId,
      label: opLabel,
      messageSort,
      sourceRelationshipIds: relIds,
      evidenceIds: evIds,
      traceId: s.traceId ?? null,
      spanId: s.spanId ?? null,
      parentSpanId: s.parentSpanId ?? null,
      httpMethod: s.httpMethod ?? null,
      httpStatusCode: typeof s.httpStatusCode === "number" ? s.httpStatusCode : null,
      durationMs: typeof s.durationMs === "number" ? s.durationMs : null,
      causalParentMessageIds: causalParents,
      provenance: "OBSERVED",
      isUncertain:
        messageSort === "UNKNOWN" ||
        relIds.length > 1 ||
        sender.resolutionStatus !== "RESOLVED" ||
        receiver.resolutionStatus !== "RESOLVED",
    });

    executions.push({
      executionId: `exec-obs-${idx + 1}`,
      participantId: receiver.participantId,
      startMessageId: item.msgId,
      endMessageId: item.msgId,
      nestingLevel: sender.participantId === receiver.participantId ? 1 : 0,
      provenance: "OBSERVED",
    });
  });

  const parallelBranchMessageIds = [...parallelGroupCounts.values()]
    .filter((group) => group.length > 1)
    .flat();

  const limitations = [
    ...new Set([
      ...(payload.limitations ?? [
        "NO_SYNTHETIC_REPLY_FROM_END_TIME",
        "NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE",
      ]),
      ...extraLimitations,
    ]),
  ];
  if (parallelBranchMessageIds.length > 0 && !limitations.includes("PARALLEL_CAUSAL_BRANCHES_OBSERVED")) {
    limitations.push("PARALLEL_CAUSAL_BRANCHES_OBSERVED");
  }
  if (paginationSplitWarning && !limitations.includes("PAGINATED_TRACE_WINDOW")) {
    limitations.push("PAGINATED_TRACE_WINDOW");
  }

  const hasUnresolvedOrUnknown =
    messages.some((m) => m.messageSort === "UNKNOWN" || m.sourceRelationshipIds.length > 1) ||
    [...participantMap.values()].some((p) => p.resolutionStatus !== "RESOLVED") ||
    extraLimitations.has("CAUSAL_CYCLE_DETECTED_IN_TRACE") ||
    extraLimitations.has("MISSING_CAUSAL_PARENT_IN_TRACE");

  const doc: InteractionDocument = {
    schemaVersion: 2,
    interactionId: `scenarios:observed:${payload.sessionId}`,
    name: options.scenarioName?.trim() || `Observed Session ${payload.sessionId.slice(0, 8)}`,
    modelId: model.id,
    baseModelId: payload.baseModelId ?? model.id,
    snapshotId: payload.snapshotId ?? model.snapshotId,
    mode: "OBSERVED",
    semanticStatus: extraLimitations.has("CAUSAL_CYCLE_DETECTED_IN_TRACE")
      ? "UNVERIFIED"
      : hasUnresolvedOrUnknown
        ? "PARTIAL"
        : "COMPLETE",
    provenance: {
      origin: "OBSERVED",
      sessionId: payload.sessionId,
      traceId: options.traceId ?? availableTraceIds[0] ?? null,
    },
    limitations,
    participants: [...participantMap.values()],
    messages,
    executions,
    fragments: [],
    interactionUses: [],
  };

  return {
    document: doc,
    totalSteps,
    displayedSteps: messages.length,
    page,
    pageCount,
    availableTraceIds,
    parallelBranchMessageIds,
    paginationSplitWarning,
    lineageValid: lineage.valid,
    lineageSummary: lineage.summary,
  };
}

export function createDesignedCopyFromObserved(
  observedDoc: InteractionDocument,
  targetModel: ArchitecturalModel,
  customName?: string,
  customInteractionId?: string,
): InteractionDocument {
  const name = (customName?.trim() || `${observedDoc.name} (Designed Overlay)`).slice(0, 120);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const interactionId = customInteractionId ?? `scenarios:designed:${slug || "from-observed"}`;

  return {
    ...observedDoc,
    schemaVersion: 2,
    interactionId,
    name,
    modelId: targetModel.id,
    baseModelId: targetModel.id,
    snapshotId: targetModel.snapshotId,
    mode: "HYBRID",
    provenance: {
      origin: "DESIGNED",
      sessionId: observedDoc.provenance.sessionId ?? null,
      traceId: observedDoc.provenance.traceId ?? null,
    },
    limitations: [
      ...new Set([
        ...observedDoc.limitations,
        "DESIGNED_OVERLAY_COPIED_FROM_OBSERVED_TRACE",
      ]),
    ],
  };
}
