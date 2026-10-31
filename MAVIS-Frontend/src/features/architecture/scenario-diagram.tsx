"use client";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DesignedScenario } from "./designed-scenario";
import { useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { SelectField } from "@/components/shared/forms";
import { RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusLabel } from "@/components/shared/data";
import { SelectablePreview, download } from "./selectable-diagram-preview";
import { SearchableThreeESelect } from "./three-e-searchable-select";
import {
  createDesignedCopyFromObserved,
  interactionToDrawioXml,
  projectObservedSequenceToInteraction,
  verifyObservedLineage,
  type InteractionDocument,
} from "./scenario-design";
import {
  resolveSequenceSelectionContext,
  type SequenceSelectionContext,
} from "./three-e-content";

function ObservedScenarioDiagram({
  model,
  selectedId,
  onSelect,
  onSelectSequence,
  onCreateDesignedCopy,
}: {
  model: ArchitecturalModel;
  selectedId?: string | null | undefined;
  onSelect: (id: string) => void;
  onSelectSequence?:
    | ((id: string | null, seqCtx: SequenceSelectionContext | null) => void)
    | undefined;
  onCreateDesignedCopy: (copy: InteractionDocument) => void;
}) {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? "";
  const sessions = useApiQuery("runtimeReadSessions", { projectId: model.projectId });
  const [session, setSession] = useState(requestedSessionId),
    [trace, setTrace] = useState(""),
    [page, setPage] = useState(0);

  const exactModelSessions = (sessions.data ?? []).filter(
    (s) =>
      (s.modelId === model.id || s.enrichedModelId === model.id) &&
      (!s.snapshotId || s.snapshotId === model.snapshotId),
  );
  const available =
    exactModelSessions.length > 0
      ? exactModelSessions
      : (sessions.data ?? []).filter((s) => s.executionStatus === "COMPLETED" || s.id === requestedSessionId);

  const selected =
    available.find((s) => s.id === session) ??
    available.find((s) => s.id === requestedSessionId) ??
    available[0];
  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selected?.id ?? "" },
    { enabled: !!selected },
  );

  const lineageCheck = sequence.data
    ? verifyObservedLineage(sequence.data, model, selected?.modelId)
    : { valid: false, summary: "" };
  const hasSteps = Boolean(sequence.data?.steps && sequence.data.steps.length > 0);
  const valid = lineageCheck.valid || hasSteps;

  const projection = useMemo(() => {
    if (!sequence.data || !valid) return null;
    return projectObservedSequenceToInteraction(sequence.data, model, {
      traceId: trace || null,
      page,
      pageSize: 30,
      scenarioName: selected?.scenarioName ?? null,
    });
  }, [sequence.data, valid, model, selected?.scenarioName, trace, page]);

  const traces = projection?.availableTraceIds ?? [];
  const chosen = trace && traces.includes(trace) ? trace : (traces[0] ?? "");
  const interaction = projection?.document ?? null;

  let drawioXml = "";
  if (interaction && interaction.messages.length > 0) {
    try {
      drawioXml = interactionToDrawioXml(interaction, model);
    } catch {
      drawioXml = "";
    }
  }

  function handleSelectObservedItem(itemId: string) {
    if (!interaction) return;
    const seqCtx = resolveSequenceSelectionContext(interaction, itemId, {
      sessionId: selected?.id ?? null,
      traceId: chosen || null,
    });
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

  return (
    <div className="space-y-4">
      <RequestState query={sessions}>
        {!available.length ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No observed scenario is linked to this model revision. Run a scenario from Runtime, then
            return here; static dependencies do not establish execution order.
          </p>
        ) : (
          <>
            <SelectField
              label="Scenario"
              value={selected?.id ?? ""}
              onChange={(v) => {
                setSession(v);
                setTrace("");
                setPage(0);
                onSelectSequence?.(null, null);
              }}
              options={available.map((s) => ({
                value: s.id,
                label: `${s.scenarioName ?? "Runtime scenario"} · ${s.id.slice(0, 8)}`,
              }))}
            />
            <RequestState query={sequence}>
              {sequence.data && !valid ? (
                <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">
                  The trace belongs to another model revision ({lineageCheck.summary}).
                </p>
              ) : !interaction || !interaction.messages.length ? (
                <p className="text-sm text-muted-foreground">
                  No sequence evidence is available for this scenario.
                </p>
              ) : (
                <>
                  <div className="space-y-3 rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="runtime">OBSERVED RUNTIME</Badge>
                        {sequence.data?.traceStatus && (
                          <Badge variant="outline">
                            Trace: <StatusLabel status={sequence.data.traceStatus} />
                          </Badge>
                        )}
                        <Badge variant="outline">
                          Semantic: <StatusLabel status={interaction.semanticStatus} />
                        </Badge>
                        {interaction.limitations.map((lim: string) => (
                          <Badge key={lim} variant="secondary" className="font-mono text-[10px]">
                            {lim}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const copy = createDesignedCopyFromObserved(
                              interaction,
                              model,
                              `${selected?.scenarioName ?? "Observed scenario"} (Designed copy)`,
                            );
                            onCreateDesignedCopy(copy);
                          }}
                        >
                          Create designed copy
                        </Button>
                        {drawioXml && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              download(
                                drawioXml,
                                `mavis-observed-sequence-${selected?.id.slice(0, 8) ?? "trace"}.drawio`,
                                "application/xml",
                              )
                            }
                          >
                            Download .drawio
                          </Button>
                        )}
                      </div>
                    </div>

                    {traces.length > 1 && (
                      <SelectField
                        label="Observed trace"
                        value={chosen}
                        onChange={(v) => {
                          setTrace(v);
                          setPage(0);
                          onSelectSequence?.(null, null);
                        }}
                        options={traces.map((id) => ({ value: id, label: id }))}
                      />
                    )}

                    {projection?.paginationSplitWarning && (
                      <p
                        role="status"
                        data-pagination-split-warning
                        className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs"
                      >
                        {projection.paginationSplitWarning}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Observed interactions · steps {page * 30 + 1}–
                      {page * 30 + interaction.messages.length} of {projection?.totalSteps ?? 0}.
                      Order reflects recorded partial order &amp; span causality; span{" "}
                      <code>endTime</code> does not fabricate synthetic <code>REPLY</code> messages,
                      and single traces do not infer <code>alt</code>/<code>opt</code>/
                      <code>loop</code> fragments.
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <SearchableThreeESelect
                        label="Element to explore"
                        placeholder="Select or search elements…"
                        selectedValue={selectedId}
                        onSelect={handleSelectObservedItem}
                        options={interaction.participants.map((p, idx) => ({
                          value: p.participantId,
                          badge: p.resolutionStatus,
                          label: `${idx + 1}. :${p.name}`,
                        }))}
                      />
                      <SearchableThreeESelect
                        label="Connection to explore"
                        placeholder="Select or search connections…"
                        selectedValue={selectedId}
                        onSelect={handleSelectObservedItem}
                        options={interaction.messages.map((m) => {
                          const fromP = interaction.participants.find(
                            (p) => p.participantId === m.fromParticipantId,
                          );
                          const toP = interaction.participants.find(
                            (p) => p.participantId === m.toParticipantId,
                          );
                          const timing = [
                            m.durationMs !== null && m.durationMs !== undefined
                              ? `${m.durationMs}ms`
                              : "",
                            m.httpStatusCode !== null && m.httpStatusCode !== undefined
                              ? `HTTP ${m.httpStatusCode}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return {
                            value: m.messageId,
                            badge: m.messageSort,
                            label: `#${m.sequenceIndex} ${fromP?.name ?? m.fromParticipantId} → ${toP?.name ?? m.toParticipantId}`,
                            sublabel: [m.label, timing].filter(Boolean).join(" · "),
                          };
                        })}
                      />
                    </div>

                    {(projection?.totalSteps ?? 0) > 30 && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!page}
                          onClick={() => {
                            setPage((p) => p - 1);
                            onSelectSequence?.(null, null);
                          }}
                        >
                          Previous steps
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(page + 1) * 30 >= (projection?.totalSteps ?? 0)}
                          onClick={() => {
                            setPage((p) => p + 1);
                            onSelectSequence?.(null, null);
                          }}
                        >
                          Next steps
                        </Button>
                      </div>
                    )}
                  </div>

                  {drawioXml && (
                    <SelectablePreview
                      xml={drawioXml}
                      title={`4+1 · Observed Scenario · ${interaction.name}`}
                      selectedId={selectedId ?? null}
                      onSelect={(hitId) => handleSelectObservedItem(hitId)}
                    />
                  )}
                </>
              )}
            </RequestState>
          </>
        )}
      </RequestState>
    </div>
  );
}

export function ScenarioDiagram(props: {
  model: ArchitecturalModel;
  selectedId?: string | null | undefined;
  onSelect: (id: string) => void;
  onSelectSequence?:
    | ((id: string | null, seqCtx: SequenceSelectionContext | null) => void)
    | undefined;
  theme?: import("@/lib/drawio/rules").DrawioTheme | undefined;
  onThemeChange?: ((theme: import("@/lib/drawio/rules").DrawioTheme) => void) | undefined;
}) {
  const searchParams = useSearchParams();
  const initialMode =
    searchParams.get("mode") === "observed" || Boolean(searchParams.get("session"))
      ? "observed"
      : "designed";
  const [mode, setMode] = useState<"designed" | "observed">(initialMode);
  const [copiedInteraction, setCopiedInteraction] = useState<InteractionDocument | null>(null);

  function switchMode(nextMode: "designed" | "observed") {
    setMode(nextMode);
    props.onSelectSequence?.(null, null);
  }

  return (
    <div className="space-y-2.5">
      <div role="tablist" aria-label="Scenario source" className="flex gap-1.5">
        <Button
          role="tab"
          size="sm"
          aria-selected={mode === "designed"}
          variant={mode === "designed" ? "default" : "outline"}
          onClick={() => switchMode("designed")}
        >
          Auto-detected scenario
        </Button>
        <Button
          role="tab"
          size="sm"
          aria-selected={mode === "observed"}
          variant={mode === "observed" ? "default" : "outline"}
          onClick={() => switchMode("observed")}
        >
          Observed runtime
        </Button>
      </div>
      <div hidden={mode !== "designed"}>
        <DesignedScenario
          {...props}
          initialInteraction={copiedInteraction}
          onConsumedInitialInteraction={() => setCopiedInteraction(null)}
        />
      </div>
      {mode === "observed" && (
        <ObservedScenarioDiagram
          {...props}
          onCreateDesignedCopy={(copy) => {
            setCopiedInteraction(copy);
            switchMode("designed");
          }}
        />
      )}
    </div>
  );
}
