"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/shared/forms";
import { relationLabel } from "@/lib/drawio/rules";
import { download } from "./selectable-diagram-preview";
import { DrawioEditor } from "./drawio-editor";
import {
  addCustomMessageToInteraction,
  addEdgeStepToInteraction,
  allocateNextSequenceId,
  changeMessageSortInInteraction,
  extractInteractionFromDrawioXml,
  inferAbstractionLevel,
  interactionToDrawioXml,
  removeMessageFromInteraction,
  reorderMessageInInteraction,
  scenarioInteractions,
  upgradeLegacyScenarioDesign,
  validateInteractionDocument,
  type CombinedFragment,
  type FragmentOperator,
  type InteractionDocument,
  type MessageSort,
  type ParticipantAbstractionLevel,
} from "./scenario-design";
import {
  resolveSequenceSelectionContext,
  type SequenceSelectionContext,
} from "./three-e-content";

const MESSAGE_SORT_OPTIONS: Array<{ value: MessageSort; label: string }> = [
  { value: "SYNCH_CALL", label: "SYNCH_CALL (Synchronous call)" },
  { value: "ASYNCH_CALL", label: "ASYNCH_CALL (Async request)" },
  { value: "ASYNCH_SIGNAL", label: "ASYNCH_SIGNAL (Async event/signal)" },
  { value: "REPLY", label: "REPLY (Return message)" },
  { value: "CREATE", label: "CREATE («create» lifeline)" },
  { value: "DELETE", label: "DELETE («destroy» lifeline)" },
  { value: "UNKNOWN", label: "UNKNOWN (Unverified sort)" },
];

const FRAGMENT_OPERATORS: Array<{ value: FragmentOperator; label: string }> = [
  { value: "alt", label: "alt (Alternative branches)" },
  { value: "opt", label: "opt (Optional branch)" },
  { value: "loop", label: "loop (Repeated execution)" },
  { value: "par", label: "par (Parallel branches)" },
  { value: "break", label: "break (Break enclosure · DESIGNED_ONLY)" },
  { value: "critical", label: "critical (Atomic region · DESIGNED_ONLY)" },
  { value: "strict", label: "strict (Strict ordering · DESIGNED_ONLY)" },
];

function sanitizeScenarioSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function DesignedScenario({
  model,
  onSelect,
  onSelectSequence,
  initialInteraction,
  onConsumedInitialInteraction,
}: {
  model: ArchitecturalModel;
  selectedId?: string | null | undefined;
  onSelect: (id: string) => void;
  onSelectSequence?:
    | ((id: string | null, seqCtx: SequenceSelectionContext | null) => void)
    | undefined;
  initialInteraction?: InteractionDocument | null | undefined;
  onConsumedInitialInteraction?: (() => void) | undefined;
}) {
  const api = useApi(),
    cache = useQueryClient();

  const [scenarioViews, setScenarioViews] = useState<string[]>(["scenarios:designed"]);
  const [viewId, setViewId] = useState("scenarios:designed");
  const [newScenarioSlug, setNewScenarioSlug] = useState("");

  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId },
    { enabled: api.mode === "backend" },
  );

  const loadedViewRef = useRef<string>("");
  const interactions = useMemo(() => scenarioInteractions(model), [model]);

  const [doc, setDoc] = useState<InteractionDocument>(() =>
    upgradeLegacyScenarioDesign(
      { modelId: model.id, name: "Application collaboration", edgeIds: [] },
      model,
      "scenarios:designed",
    ),
  );
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [migratedFromV0, setMigratedFromV0] = useState(false);
  const [legacyV0BackupXml, setLegacyV0BackupXml] = useState<string | null>(null);
  const [structuralConflicts, setStructuralConflicts] = useState<string[]>([]);
  const [conflictRecoveryXml, setConflictRecoveryXml] = useState<string | null>(null);

  // Custom lifeline builder state
  const [selectedModelElementId, setSelectedModelElementId] = useState("");
  const [customParticipantName, setCustomParticipantName] = useState("");
  const [customParticipantRole, setCustomParticipantRole] = useState("");
  const [customParticipantLevel, setCustomParticipantLevel] =
    useState<ParticipantAbstractionLevel>("ACTOR");

  // Custom message builder state
  const [msgFromId, setMsgFromId] = useState("");
  const [msgToId, setMsgToId] = useState("");
  const [msgSort, setMsgSort] = useState<MessageSort>("SYNCH_CALL");
  const [msgLabel, setMsgLabel] = useState("");
  const [msgGuard, setMsgGuard] = useState("");
  const [msgReplyToId, setMsgReplyToId] = useState("");
  const [msgNestedActivation, setMsgNestedActivation] = useState(false);

  // CombinedFragment builder state
  const [fragOperator, setFragOperator] = useState<FragmentOperator>("alt");
  const [fragLabel, setFragLabel] = useState("");
  const [fragGuard1, setFragGuard1] = useState("status == 200");
  const [fragGuard2, setFragGuard2] = useState("else");
  const [fragLoopMin, setFragLoopMin] = useState("1");
  const [fragLoopMax, setFragLoopMax] = useState("3");
  const [fragParentOperandId, setFragParentOperandId] = useState("");

  // InteractionUse (ref) builder state
  const [refName, setRefName] = useState("");
  const [refTargetViewId, setRefTargetViewId] = useState("");

  // Load initialInteraction when user clicks "Create designed copy" from Observed Runtime
  useEffect(() => {
    if (!initialInteraction) return;
    const targetView = initialInteraction.interactionId.startsWith("scenarios:designed")
      ? initialInteraction.interactionId
      : "scenarios:designed:from-observed";
    setScenarioViews((prev) => (prev.includes(targetView) ? prev : [...prev, targetView]));
    setViewId(targetView);
    loadedViewRef.current = `${model.id}:${targetView}:copied`;
    setDoc({
      ...initialInteraction,
      interactionId: targetView,
    });
    setDirty(true);
    setError("");
    setMigratedFromV0(false);
    setLegacyV0BackupXml(null);
    setStructuralConflicts([]);
    setConflictRecoveryXml(null);
    onConsumedInitialInteraction?.();
  }, [initialInteraction, model.id, onConsumedInitialInteraction]);

  // Restore saved XML when switching viewId or loading backend document
  useEffect(() => {
    const loadKey = `${model.id}:${viewId}:${saved.data?.revision ?? "init"}`;
    if (!saved.data || loadedViewRef.current === loadKey) return;
    if (loadedViewRef.current.startsWith(`${model.id}:${viewId}:copied`)) return;
    loadedViewRef.current = loadKey;

    if (!saved.data.xml) {
      setDoc(
        upgradeLegacyScenarioDesign(
          {
            modelId: model.id,
            name:
              viewId === "scenarios:designed"
                ? "Application collaboration"
                : `Scenario ${viewId.replace("scenarios:designed:", "")}`,
            edgeIds: [],
          },
          model,
          viewId,
        ),
      );
      setMigratedFromV0(false);
      setLegacyV0BackupXml(null);
      setStructuralConflicts([]);
      setConflictRecoveryXml(null);
      setDirty(false);
      return;
    }

    const extracted = extractInteractionFromDrawioXml(saved.data.xml, model);
    if (extracted) {
      setDoc({
        ...extracted.document,
        interactionId: viewId,
      });
      setMigratedFromV0(extracted.migratedFromV0);
      setLegacyV0BackupXml(extracted.migratedFromV0 ? saved.data.xml : null);
      setStructuralConflicts(extracted.roundTripConflicts);
      setConflictRecoveryXml(
        extracted.roundTripConflicts.length > 0 ? saved.data.xml : null,
      );
      setError("");
      setDirty(false);
    } else {
      setError(
        "The saved scenario cannot be restored for this model. Download it before replacing its steps.",
      );
    }
  }, [saved.data, model, viewId]);

  const validation = useMemo(() => validateInteractionDocument(doc, model), [doc, model]);

  const labelForEdge = (id: string) => {
    const edge =
      interactions.find((item) => item.id === id) ?? model.edges.find((item) => item.id === id);
    if (!edge) return "Unavailable interaction";
    const nodeName = (nodeId: string) => {
      const node = model.elements.find((item) => item.id === nodeId);
      const owner = model.elements.find((parent) => parent.id === node?.parentId);
      return `${node?.name ?? "Unknown"}${owner ? " (" + owner.name + ")" : ""}`;
    };
    return `${nodeName(edge.from)} → ${nodeName(edge.to)} · ${relationLabel({ id, type: edge.protocol })}`;
  };

  let xml = "";
  let issue = "";
  try {
    if (doc.participants.length > 0 || doc.messages.length > 0) {
      xml = interactionToDrawioXml(doc, model);
    }
  } catch (err) {
    issue = err instanceof Error ? err.message : "Scenario generation failed";
  }

  function applyDoc(next: InteractionDocument) {
    const cleaned: InteractionDocument = {
      ...next,
      limitations: next.limitations.filter(
        (l) => l !== "DRAWIO_STRUCTURAL_CONFLICT_DETECTED",
      ),
    };
    const v = validateInteractionDocument(cleaned, model);
    setDoc({
      ...cleaned,
      semanticStatus: v.semanticStatus,
    });
    setStructuralConflicts([]);
    setConflictRecoveryXml(null);
    setDirty(true);
    setError("");
  }

  function selectSequenceItem(itemId: string) {
    const seqCtx = resolveSequenceSelectionContext(doc, itemId);
    let canonicalTargetId = itemId;
    if (
      seqCtx.itemKind === "participant" &&
      seqCtx.modelElementId &&
      seqCtx.resolutionStatus === "RESOLVED"
    ) {
      canonicalTargetId = seqCtx.modelElementId;
    } else if (
      seqCtx.itemKind === "message" &&
      seqCtx.sourceRelationshipIds &&
      seqCtx.sourceRelationshipIds.length === 1
    ) {
      canonicalTargetId = seqCtx.sourceRelationshipIds[0]!;
    }
    if (onSelectSequence) {
      onSelectSequence(canonicalTargetId, seqCtx);
    } else {
      onSelect(canonicalTargetId);
    }
  }

  function handleAddEdgeStep(edgeId: string) {
    applyDoc(addEdgeStepToInteraction(doc, model, edgeId));
  }

  function handleReorderMessage(index: number, delta: -1 | 1) {
    applyDoc(reorderMessageInInteraction(doc, index, delta, model));
  }

  function handleRemoveMessage(index: number) {
    applyDoc(removeMessageFromInteraction(doc, index, model));
  }

  function handleChangeMessageSort(msgId: string, nextSort: MessageSort) {
    applyDoc(changeMessageSortInInteraction(doc, msgId, nextSort, model));
  }

  function handleAddModelLifeline() {
    const targetId = selectedModelElementId || model.elements[0]?.id;
    if (!targetId) return;
    if (doc.participants.some((p) => p.modelElementId === targetId && !p.role)) return;
    const el = model.elements.find((n) => n.id === targetId);
    if (!el) return;
    const owner = model.elements.find((n) => n.id === el.parentId);
    applyDoc({
      ...doc,
      participants: [
        ...doc.participants,
        {
          participantId: `part:${el.id}`,
          modelElementId: el.id,
          baseElementId: el.id,
          role: null,
          name: `${el.name}${owner ? ` (${owner.name})` : ""}`,
          elementType: el.elementType ?? "SERVICE_CONTAINER",
          abstractionLevel: inferAbstractionLevel(el.elementType),
          resolutionStatus: "RESOLVED",
          provenance: "DESIGNED",
        },
      ],
    });
  }

  function handleAddCustomLifeline() {
    const trimmed = customParticipantName.trim();
    if (!trimmed) return;
    const slug = sanitizeScenarioSlug(trimmed) || "role";
    const pid = allocateNextSequenceId(
      `part:custom:${slug}`,
      doc.participants.map((p) => p.participantId),
    );
    applyDoc({
      ...doc,
      participants: [
        ...doc.participants,
        {
          participantId: pid,
          modelElementId: null,
          baseElementId: null,
          role: customParticipantRole.trim() || null,
          name: trimmed,
          elementType:
            customParticipantLevel === "ACTOR"
              ? "ACTOR"
              : customParticipantLevel === "EXTERNAL"
                ? "EXTERNAL_SYSTEM"
                : "SERVICE_CONTAINER",
          abstractionLevel: customParticipantLevel,
          resolutionStatus: "DESIGNED_ROLE",
          provenance: "DESIGNED",
        },
      ],
    });
    setCustomParticipantName("");
    setCustomParticipantRole("");
  }

  function handleAddCustomMessage() {
    const fromPid = msgFromId || doc.participants[0]?.participantId;
    const toPid =
      msgToId || doc.participants[Math.min(1, doc.participants.length - 1)]?.participantId;
    if (!fromPid || !toPid) return;

    const replyTarget =
      msgSort === "REPLY"
        ? (msgReplyToId ||
          [...doc.messages]
            .reverse()
            .find((m) => m.messageSort === "SYNCH_CALL" || m.messageSort === "ASYNCH_CALL")
            ?.messageId ||
          null)
        : null;

    const defaultLabel =
      msgLabel.trim() ||
      (msgSort === "REPLY"
        ? "return ok"
        : msgSort === "CREATE"
          ? "createInstance()"
          : msgSort === "DELETE"
            ? "destroy()"
            : "invoke()");

    applyDoc(
      addCustomMessageToInteraction(doc, model, {
        fromParticipantId: fromPid,
        toParticipantId: toPid,
        label: defaultLabel,
        messageSort: msgSort,
        replyToMessageId: replyTarget,
        guard: msgGuard.trim() || null,
        returnValue: msgSort === "REPLY" ? msgLabel.trim() || "ok" : null,
        nestedActivation: msgNestedActivation,
        includeActivation: true,
      }),
    );
    setMsgLabel("");
    setMsgGuard("");
  }

  function handleAddCombinedFragment() {
    if (doc.participants.length === 0 || doc.messages.length === 0) return;
    const collectFragmentIds = (frags: CombinedFragment[]): string[] =>
      frags.flatMap((f) => [
        f.fragmentId,
        ...f.operands.flatMap((op) => collectFragmentIds(op.nestedFragments ?? [])),
      ]);
    const fragId = allocateNextSequenceId("frag", collectFragmentIds(doc.fragments));
    const coveredIds = doc.participants.map((p) => p.participantId);
    const allMsgIds = doc.messages.map((m) => m.messageId);
    const mid = Math.max(1, Math.ceil(allMsgIds.length / 2));

    const operands =
      fragOperator === "alt" || fragOperator === "par"
        ? [
            {
              operandId: `${fragId}-op-1`,
              guard: fragGuard1.trim() || (fragOperator === "par" ? "branch 1" : "condition"),
              minIterations: null,
              maxIterations: null,
              messageIds: allMsgIds.slice(0, mid),
            },
            {
              operandId: `${fragId}-op-2`,
              guard: fragGuard2.trim() || (fragOperator === "par" ? "branch 2" : "else"),
              minIterations: null,
              maxIterations: null,
              messageIds:
                allMsgIds.slice(mid).length > 0
                  ? allMsgIds.slice(mid)
                  : [allMsgIds[allMsgIds.length - 1]!],
            },
          ]
        : [
            {
              operandId: `${fragId}-op-1`,
              guard: fragGuard1.trim() || "guard",
              minIterations: fragOperator === "loop" ? Number(fragLoopMin) || 1 : null,
              maxIterations:
                fragOperator === "loop"
                  ? fragLoopMax.trim() === "*"
                    ? "*"
                    : Number(fragLoopMax) || 3
                  : null,
              messageIds: allMsgIds,
            },
          ];

    const newFragment: CombinedFragment = {
      fragmentId: fragId,
      operator: fragOperator,
      label: fragLabel.trim() || `${fragOperator} fragment`,
      coveredParticipantIds: coveredIds,
      operands,
      provenance: "DESIGNED",
    };

    if (fragParentOperandId) {
      const attachNested = (f: CombinedFragment): CombinedFragment => ({
        ...f,
        operands: f.operands.map((op) =>
          op.operandId === fragParentOperandId
            ? {
                ...op,
                nestedFragments: [...(op.nestedFragments ?? []), newFragment],
              }
            : {
                ...op,
                ...(op.nestedFragments
                  ? { nestedFragments: op.nestedFragments.map(attachNested) }
                  : {}),
              },
        ),
      });
      applyDoc({
        ...doc,
        fragments: doc.fragments.map(attachNested),
      });
    } else {
      applyDoc({
        ...doc,
        fragments: [...doc.fragments, newFragment],
      });
    }
    setFragLabel("");
  }

  function handleAddInteractionUse() {
    if (doc.participants.length === 0) return;
    const useId = allocateNextSequenceId(
      "use",
      doc.interactionUses.map((u) => u.interactionUseId),
    );
    const targetView = refTargetViewId.trim() || "scenarios:designed:auth";
    applyDoc({
      ...doc,
      interactionUses: [
        ...doc.interactionUses,
        {
          interactionUseId: useId,
          name: refName.trim() || "Shared Authentication Flow",
          targetInteractionId: targetView,
          targetViewId: targetView,
          coveredParticipantIds: doc.participants.map((p) => p.participantId),
          arguments: null,
          returnValue: null,
          afterMessageId:
            doc.messages.length > 0
              ? doc.messages[doc.messages.length - 1]!.messageId
              : null,
          resolutionStatus: scenarioViews.includes(targetView) ? "RESOLVED" : "UNRESOLVED",
          provenance: "DESIGNED",
        },
      ],
    });
    setRefName("");
    setRefTargetViewId("");
  }

  async function saveXmlDocument(contentXml: string) {
    if (!contentXml || !saved.data || saved.error) return;
    if (validation.errors.length > 0) {
      setError(
        `Cannot save invalid sequence diagram: ${validation.errors.map((e) => e.message).join("; ")}`,
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const extracted = extractInteractionFromDrawioXml(contentXml, model);
      if (!extracted) {
        setError("Scenario XML could not be parsed against the active model.");
        return;
      }
      if (extracted.roundTripConflicts.length > 0) {
        setDoc({
          ...extracted.document,
          interactionId: viewId,
        });
        setStructuralConflicts(extracted.roundTripConflicts);
        setConflictRecoveryXml(contentXml);
        setError(
          "Blocked saving conflicted Draw.io edits: Draw.io canvas is layout-only (horizontal lifeline X position). Semantic changes (deleting/adding/editing messages, lifelines, or fragments) must be made in the Scenario Editor. Download the recovery XML or discard unsupported canvas edits.",
        );
        return;
      }

      const nextDoc: InteractionDocument = {
        ...extracted.document,
        interactionId: viewId,
      };
      const canonicalXml = interactionToDrawioXml(nextDoc, model);
      setDoc(nextDoc);
      setStructuralConflicts([]);
      setConflictRecoveryXml(null);

      const result = await api.execute("saveArchitectureDocument", {
        modelId: model.id,
        viewId,
        expectedRevision: saved.data.revision,
        xml: canonicalXml,
      });
      cache.setQueryData(["api", "architectureDocument", { modelId: model.id, viewId }], result);
      loadedViewRef.current = `${model.id}:${viewId}:${result.revision}`;
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario could not be saved.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  const allOperands = doc.fragments.flatMap((f) =>
    f.operands.map((op) => ({
      value: op.operandId,
      label: `${f.label ?? f.operator} · [${op.guard}] (${op.operandId})`,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Choose existing interactions or compose UML 2.5 sequence messages, lifelines, activations,
            CombinedFragments (<code>alt</code>/<code>opt</code>/<code>loop</code>/<code>par</code>) and
            InteractionUses (<code>ref</code>). Each item opens 3E.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">UML_SEQUENCE · v2</Badge>
            <Badge
              variant={
                validation.semanticStatus === "COMPLETE"
                  ? "default"
                  : validation.semanticStatus === "PARTIAL"
                    ? "warning"
                    : "secondary"
              }
            >
              Status: {validation.semanticStatus}
            </Badge>
            <Badge variant="outline">Mode: {doc.mode}</Badge>
          </div>
        </div>

        {/* Multi-Scenario View Selector */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-end border-b pb-3">
          <SelectField
            label="Scenario document (viewId)"
            value={viewId}
            onChange={(nextView) => {
              setViewId(nextView);
              setError("");
              if (onSelectSequence) {
                onSelectSequence(null, null);
              }
            }}
            options={scenarioViews.map((v) => ({
              value: v,
              label: v === "scenarios:designed" ? "scenarios:designed (Default)" : v,
            }))}
          />
          <div className="flex items-center gap-2">
            <Input
              aria-label="New scenario slug"
              placeholder="New scenario slug (e.g. checkout)"
              value={newScenarioSlug}
              className="h-9 w-48 text-xs"
              onChange={(e) => setNewScenarioSlug(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const slug = sanitizeScenarioSlug(newScenarioSlug);
                if (!slug) return;
                const nextView = `scenarios:designed:${slug}`;
                setScenarioViews((prev) => (prev.includes(nextView) ? prev : [...prev, nextView]));
                setViewId(nextView);
                setNewScenarioSlug("");
                if (onSelectSequence) {
                  onSelectSequence(null, null);
                }
              }}
            >
              New scenario
            </Button>
          </div>
        </div>

        {/* Legacy V0 Migration Notice & Backup */}
        {migratedFromV0 && (
          <div
            role="status"
            data-v0-migration-banner
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs"
          >
            <div>
              <p className="font-semibold text-foreground">
                [V0_MIGRATED] Upgraded legacy mavisScenario (v0) to mavis-interaction/v2
              </p>
              <p className="text-muted-foreground">
                Repeated edges and step ordering were preserved. Static relationship steps are marked{" "}
                <code>UNKNOWN</code> (<code>PARTIAL</code>) until you confirm their messageSort. Save to
                commit v2 format.
              </p>
            </div>
            {legacyV0BackupXml && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  download(
                    legacyV0BackupXml,
                    `mavis-scenario-v0-backup-${model.id}.drawio`,
                    "application/xml",
                  )
                }
              >
                Download V0 backup (.drawio)
              </Button>
            )}
          </div>
        )}

        {/* Structural Conflict Banner from Draw.io Round-Trip */}
        {structuralConflicts.length > 0 && (
          <div
            role="alert"
            data-structural-conflict-banner
            className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-xs space-y-2"
          >
            <p className="font-semibold text-destructive">
              [STRUCTURAL_CONFLICT] Draw.io visual edits conflicted with canonical sequence semantics (status downgraded to UNVERIFIED, CAS overwrite blocked):
            </p>
            <ul className="list-disc pl-4">
              {structuralConflicts.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {conflictRecoveryXml && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(
                      conflictRecoveryXml,
                      `mavis-scenario-conflict-recovery-${model.id}.drawio`,
                      "application/xml",
                    )
                  }
                >
                  Download conflicted recovery XML (.drawio)
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const cleanedLimitations = doc.limitations.filter(
                    (l) => l !== "DRAWIO_STRUCTURAL_CONFLICT_DETECTED",
                  );
                  const nextDoc: InteractionDocument = {
                    ...doc,
                    limitations: cleanedLimitations,
                  };
                  const v = validateInteractionDocument(nextDoc, model);
                  setDoc({
                    ...nextDoc,
                    semanticStatus: v.semanticStatus,
                  });
                  setStructuralConflicts([]);
                  setConflictRecoveryXml(null);
                  setError("");
                }}
              >
                Discard unsupported canvas edits &amp; restore canonical layout
              </Button>
            </div>
          </div>
        )}

        {/* Validation Warnings & Errors */}
        {validation.warnings.length > 0 && (
          <div
            role="status"
            data-sequence-warnings
            className="rounded-lg border border-amber-500/40 bg-muted/40 p-2.5 text-xs space-y-1"
          >
            <p className="font-medium text-foreground">
              Semantic review notices ({validation.warnings.length}):
            </p>
            <ul className="list-disc pl-4 text-muted-foreground">
              {validation.warnings.map((w, idx) => (
                <li key={idx}>
                  [{w.code}] {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {validation.errors.length > 0 && (
          <div
            role="alert"
            data-sequence-errors
            className="rounded-lg border border-destructive bg-destructive/10 p-2.5 text-xs text-destructive space-y-1"
          >
            <p className="font-semibold">
              Lifecycle / ordering validation errors ({validation.errors.length}):
            </p>
            <ul className="list-disc pl-4">
              {validation.errors.map((e, idx) => (
                <li key={idx}>
                  [{e.code}] {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="block space-y-2 text-xs">
          Scenario name
          <Input
            value={doc.name}
            maxLength={120}
            disabled={api.mode === "backend" && !saved.data}
            onChange={(event) => {
              applyDoc({
                ...doc,
                name: event.target.value,
              });
            }}
          />
        </label>

        {/* Quick-Add from Model Interactions (Preserves M2/M3 Baseline Flow) */}
        {interactions.length ? (
          <div className="space-y-2">
            <SelectField
              label="Add interaction"
              value={chosen || interactions[0]!.id}
              onChange={setChosen}
              options={interactions.map((edge) => ({ value: edge.id, label: labelForEdge(edge.id) }))}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={doc.messages.length >= 50 || (saved.isPending && api.mode === "backend")}
                onClick={() => handleAddEdgeStep(chosen || interactions[0]!.id)}
              >
                Add step
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No source-supported interactions are available. You can still add lifelines and custom
            sequence messages below, or use an observed runtime scenario.
          </p>
        )}

        {/* Lifelines / Participants Section */}
        <details className="rounded-lg border bg-muted/20 p-3 text-xs" open={doc.participants.length > 0}>
          <summary className="cursor-pointer font-semibold text-sm">
            Lifelines / Participants ({doc.participants.length})
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {doc.participants.map((p, idx) => (
                <div
                  key={p.participantId}
                  data-participant-id={p.participantId}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs"
                >
                  <button
                    type="button"
                    className="font-medium underline-offset-4 hover:underline"
                    onClick={() => selectSequenceItem(p.participantId)}
                  >
                    {idx + 1}. {p.role ? `${p.role}:` : ":"}
                    {p.name}
                  </button>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    [{p.resolutionStatus}]
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 border-t pt-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <SelectField
                    label="Add model element lifeline"
                    value={selectedModelElementId || model.elements[0]?.id || ""}
                    onChange={setSelectedModelElementId}
                    options={model.elements.map((el) => ({
                      value: el.id,
                      label: `${el.name} (${el.elementType ?? el.layer})`,
                    }))}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={handleAddModelLifeline}>
                  Add model lifeline
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex-1 space-y-1 text-xs">
                  Custom role / external lifeline
                  <Input
                    placeholder="e.g. API Client / Payment Gateway"
                    value={customParticipantName}
                    onChange={(e) => setCustomParticipantName(e.target.value)}
                  />
                </label>
                <SelectField
                  label="Level"
                  value={customParticipantLevel}
                  onChange={(v) => setCustomParticipantLevel(v as ParticipantAbstractionLevel)}
                  options={[
                    { value: "ACTOR", label: "ACTOR" },
                    { value: "EXTERNAL", label: "EXTERNAL" },
                    { value: "CONTAINER", label: "CONTAINER" },
                  ]}
                />
                <Button size="sm" variant="outline" onClick={handleAddCustomLifeline}>
                  Add custom lifeline
                </Button>
              </div>
            </div>
          </div>
        </details>

        {/* UML 2.5 Message & Activation Composer */}
        {doc.participants.length > 0 && (
          <details className="rounded-lg border bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-sm">
              Compose UML Sequence Message (SYNCH / ASYNCH / REPLY / CREATE / DELETE / Self-call)
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <SelectField
                label="From lifeline"
                value={msgFromId || doc.participants[0]!.participantId}
                onChange={setMsgFromId}
                options={doc.participants.map((p) => ({
                  value: p.participantId,
                  label: p.name,
                }))}
              />
              <SelectField
                label="To lifeline"
                value={
                  msgToId ||
                  doc.participants[Math.min(1, doc.participants.length - 1)]!.participantId
                }
                onChange={setMsgToId}
                options={doc.participants.map((p) => ({
                  value: p.participantId,
                  label: p.name,
                }))}
              />
              <SelectField
                label="Message sort"
                value={msgSort}
                onChange={(v) => setMsgSort(v as MessageSort)}
                options={MESSAGE_SORT_OPTIONS}
              />
              <label className="space-y-1">
                Operation / Message label
                <Input
                  placeholder="e.g. POST /orders or validateOrder()"
                  value={msgLabel}
                  onChange={(e) => setMsgLabel(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                Guard condition (optional)
                <Input
                  placeholder="e.g. token.valid"
                  value={msgGuard}
                  onChange={(e) => setMsgGuard(e.target.value)}
                />
              </label>
              {msgSort === "REPLY" ? (
                <SelectField
                  label="Reply to call message"
                  value={msgReplyToId}
                  onChange={setMsgReplyToId}
                  options={[
                    { value: "", label: "Latest call message" },
                    ...doc.messages
                      .filter(
                        (m) => m.messageSort === "SYNCH_CALL" || m.messageSort === "ASYNCH_CALL",
                      )
                      .map((m) => ({
                        value: m.messageId,
                        label: `#${m.sequenceIndex} ${m.label} (${m.messageId})`,
                      })),
                  ]}
                />
              ) : (
                <label className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={msgNestedActivation}
                    onChange={(e) => setMsgNestedActivation(e.target.checked)}
                  />
                  Nested activation bar (ExecutionSpecification)
                </label>
              )}
            </div>
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={handleAddCustomMessage}>
                Append sequence message
              </Button>
            </div>
          </details>
        )}

        {/* CombinedFragment & InteractionUse (ref) Composer */}
        {doc.participants.length > 0 && (
          <details className="rounded-lg border bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-sm">
              CombinedFragments ({doc.fragments.length}) &amp; InteractionUses ({doc.interactionUses.length})
            </summary>
            <div className="mt-3 space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <SelectField
                  label="Fragment operator"
                  value={fragOperator}
                  onChange={(v) => setFragOperator(v as FragmentOperator)}
                  options={FRAGMENT_OPERATORS}
                />
                <label className="space-y-1">
                  Fragment label
                  <Input
                    placeholder="e.g. Payment validation"
                    value={fragLabel}
                    onChange={(e) => setFragLabel(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  Operand 1 guard
                  <Input
                    placeholder="e.g. authorized"
                    value={fragGuard1}
                    onChange={(e) => setFragGuard1(e.target.value)}
                  />
                </label>
                {(fragOperator === "alt" || fragOperator === "par") && (
                  <label className="space-y-1">
                    Operand 2 guard
                    <Input
                      placeholder="e.g. else / rejected"
                      value={fragGuard2}
                      onChange={(e) => setFragGuard2(e.target.value)}
                    />
                  </label>
                )}
                {fragOperator === "loop" && (
                  <>
                    <label className="space-y-1">
                      Min iterations
                      <Input
                        value={fragLoopMin}
                        onChange={(e) => setFragLoopMin(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      Max iterations (number or *)
                      <Input
                        value={fragLoopMax}
                        onChange={(e) => setFragLoopMax(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {allOperands.length > 0 && (
                  <SelectField
                    label="Enclosing parent operand (nesting)"
                    value={fragParentOperandId}
                    onChange={setFragParentOperandId}
                    options={[
                      { value: "", label: "Top-level fragment" },
                      ...allOperands,
                    ]}
                  />
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={doc.messages.length === 0}
                onClick={handleAddCombinedFragment}
              >
                Add CombinedFragment
              </Button>

              {doc.fragments.length > 0 && (
                <ul aria-label="Combined fragments" className="space-y-1.5">
                  {doc.fragments.map((f) => (
                    <li
                      key={f.fragmentId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2"
                    >
                      <button
                        type="button"
                        className="text-left font-medium underline-offset-4 hover:underline"
                        onClick={() => selectSequenceItem(f.fragmentId)}
                      >
                        [{f.operator}] {f.label ?? f.fragmentId} ·{" "}
                        {f.operands.map((op) => `[${op.guard}]`).join(" | ")}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Remove fragment ${f.fragmentId}`}
                        onClick={() =>
                          applyDoc({
                            ...doc,
                            fragments: doc.fragments.filter(
                              (item) => item.fragmentId !== f.fragmentId,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-2 sm:grid-cols-3 border-t pt-3">
                <label className="space-y-1">
                  InteractionUse (ref) name
                  <Input
                    placeholder="e.g. Verify JWT Token"
                    value={refName}
                    onChange={(e) => setRefName(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  Target scenario viewId
                  <Input
                    placeholder="e.g. scenarios:designed:auth"
                    value={refTargetViewId}
                    onChange={(e) => setRefTargetViewId(e.target.value)}
                  />
                </label>
                <div className="flex items-end">
                  <Button size="sm" variant="outline" onClick={handleAddInteractionUse}>
                    Add InteractionUse (ref)
                  </Button>
                </div>
              </div>

              {doc.interactionUses.length > 0 && (
                <ul aria-label="Interaction uses" className="space-y-1.5">
                  {doc.interactionUses.map((u) => (
                    <li
                      key={u.interactionUseId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2"
                    >
                      <button
                        type="button"
                        className="text-left font-medium underline-offset-4 hover:underline"
                        onClick={() => selectSequenceItem(u.interactionUseId)}
                      >
                        ref: {u.name}
                        {u.targetViewId ? ` → ${u.targetViewId}` : ""}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Remove interaction use ${u.interactionUseId}`}
                        onClick={() =>
                          applyDoc({
                            ...doc,
                            interactionUses: doc.interactionUses.filter(
                              (item) => item.interactionUseId !== u.interactionUseId,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}

        {/* Ordered Sequence Message Steps List */}
        <ol aria-label="Scenario steps" className="space-y-2">
          {doc.messages.map((msg, i) => {
            const fromPart = doc.participants.find(
              (p) => p.participantId === msg.fromParticipantId,
            );
            const toPart = doc.participants.find(
              (p) => p.participantId === msg.toParticipantId,
            );
            const stepTitle = `${fromPart?.name ?? msg.fromParticipantId} → ${toPart?.name ?? msg.toParticipantId} · ${msg.label}`;
            return (
              <li
                key={msg.messageId}
                data-message-id={msg.messageId}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 whitespace-normal break-words text-left"
                  onClick={() => selectSequenceItem(msg.messageId)}
                >
                  {i + 1}. {stepTitle}
                  {msg.guard ? ` [${msg.guard}]` : ""}
                </Button>
                <select
                  aria-label={`Message sort for step ${i + 1}`}
                  value={msg.messageSort}
                  onChange={(e) =>
                    handleChangeMessageSort(msg.messageId, e.target.value as MessageSort)
                  }
                  className="h-8 rounded border bg-background px-2 font-mono text-xs"
                >
                  {MESSAGE_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Move step ${i + 1} up`}
                  disabled={!i}
                  onClick={() => handleReorderMessage(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Move step ${i + 1} down`}
                  disabled={i === doc.messages.length - 1}
                  onClick={() => handleReorderMessage(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => handleRemoveMessage(i)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ol>

        {(error || issue) && (
          <p role="alert" className="text-sm text-destructive">
            {error || issue}
          </p>
        )}
        {saved.error && (
          <p role="alert" className="text-sm text-destructive">
            Saved scenario could not load.{" "}
            <button className="underline" onClick={() => void saved.refetch()}>
              Retry
            </button>
          </p>
        )}
        {xml && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={
                  !dirty ||
                  saving ||
                  !saved.data ||
                  !!saved.error ||
                  api.mode !== "backend" ||
                  validation.errors.length > 0 ||
                  structuralConflicts.length > 0
                }
                onClick={() => void saveXmlDocument(xml)}
              >
                {saving ? "Saving…" : "Save scenario"}
              </Button>
              <span role="status" className="text-xs text-muted-foreground">
                {dirty
                  ? "Unsaved changes"
                  : saved.data?.revision
                    ? `Saved revision ${saved.data.revision}`
                    : "Designed scenario"}
              </span>
            </div>
            <p
              data-drawio-layout-only-notice
              className="text-xs text-muted-foreground"
            >
              Draw.io canvas contract: horizontal lifeline position (<code>layoutX</code>) is
              round-tripped. Semantic edits (adding/deleting/renaming lifelines, messages,{" "}
              <code>messageSort</code>, <code>CombinedFragment</code>, or <code>InteractionUse</code>)
              must be made in the Scenario Editor above; unsupported canvas edits are flagged as{" "}
              <code>[STRUCTURAL_CONFLICT]</code> and blocked from overwriting CAS.
            </p>
          </div>
        )}
        {!doc.messages.length && !doc.participants.length && (
          <p role="status" className="text-sm text-muted-foreground">
            Add the first interaction to create the sequence diagram.
          </p>
        )}
      </div>

      {xml && (
        <DrawioEditor
          key={`${model.id}:${viewId}:${saved.data?.revision ?? 0}`}
          modelId={model.id}
          diagramId={viewId}
          title={`4+1 · Scenarios · ${doc.name}`}
          notation="UML_SEQUENCE"
          level="SCENARIO"
          scope={viewId}
          xml={xml}
          generatedXml={xml}
          preferProvidedXml={true}
          onSave={saveXmlDocument}
        />
      )}
    </div>
  );
}
