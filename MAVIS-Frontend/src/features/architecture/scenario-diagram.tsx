"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DesignedScenario } from "./designed-scenario";
import { DrawioEditor } from "./drawio-editor";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { SelectField } from "@/components/shared/forms";
import { RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusLabel } from "@/components/shared/data";
import { download } from "./selectable-diagram-preview";
import { SearchableThreeESelect } from "./three-e-searchable-select";
import type { DrawioTheme } from "@/lib/drawio/rules";
import {
  classifyApiFeatureCluster,
  type ApiFeatureClusterMeta,
} from "@/features/runtime/scenario-suggestions";
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
  theme: externalTheme,
  onThemeChange,
}: {
  model: ArchitecturalModel;
  selectedId?: string | null | undefined;
  onSelect: (id: string) => void;
  onSelectSequence?:
    | ((id: string | null, seqCtx: SequenceSelectionContext | null) => void)
    | undefined;
  onCreateDesignedCopy: (copy: InteractionDocument) => void;
  theme?: DrawioTheme | undefined;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
}) {
  const api = useApi();
  const cache = useQueryClient();
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? "";
  const sessions = useApiQuery("runtimeReadSessions", { projectId: model.projectId });
  const [session, setSession] = useState(requestedSessionId),
    [trace, setTrace] = useState("all"),
    [page, setPage] = useState(0);
  const [internalTheme, setInternalTheme] = useState<DrawioTheme>(externalTheme ?? "clean");
  const theme = externalTheme ?? internalTheme;
  const setTheme = (next: DrawioTheme) => {
    setInternalTheme(next);
    onThemeChange?.(next);
  };

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

  const featureClusters = useMemo(() => {
    const rawSteps = sequence.data?.steps ?? [];
    const byId = new Map<
      string,
      {
        meta: ApiFeatureClusterMeta;
        steps: typeof rawSteps;
      }
    >();
    for (const st of rawSteps) {
      const meta = classifyApiFeatureCluster(st.operation, st.callerService, st.calleeService);
      let entry = byId.get(meta.id);
      if (!entry) {
        entry = { meta, steps: [] };
        byId.set(meta.id, entry);
      }
      entry.steps.push(st);
    }
    return Array.from(byId.values()).sort((a, b) => a.meta.order - b.meta.order);
  }, [sequence.data?.steps]);

  const projection = useMemo(() => {
    if (!sequence.data || !valid) return null;
    const isClusterFilter = trace.startsWith("cluster:");
    const clusterId = isClusterFilter ? trace.slice("cluster:".length) : null;
    const activeCluster = clusterId
      ? featureClusters.find((c) => c.meta.id === clusterId)
      : null;
    const effectiveData = activeCluster
      ? { ...sequence.data, steps: activeCluster.steps }
      : sequence.data;
    const baseTitle = selected?.scenarioName ?? "Runtime scenario";
    const effectiveTitle = activeCluster
      ? `${baseTitle} · ${activeCluster.meta.shortTitle}`
      : baseTitle;
    return projectObservedSequenceToInteraction(effectiveData, model, {
      traceId: !isClusterFilter && trace && trace !== "all" ? trace : null,
      page,
      pageSize: 30,
      scenarioName: effectiveTitle,
    });
  }, [sequence.data, valid, model, selected?.scenarioName, trace, page, featureClusters]);

  const allTraces = useMemo(() => {
    const rawSteps = sequence.data?.steps ?? [];
    return [
      ...new Set(
        rawSteps
          .map((s) => (typeof s.traceId === "string" && s.traceId.trim() ? s.traceId.trim() : null))
          .filter((t): t is string => Boolean(t)),
      ),
    ];
  }, [sequence.data?.steps]);

  const chosen =
    trace === "all" ||
    (trace.startsWith("cluster:") &&
      featureClusters.some((c) => `cluster:${c.meta.id}` === trace)) ||
    allTraces.includes(trace)
      ? trace
      : "all";

  const traceOptions = useMemo(() => {
    const rawSteps = sequence.data?.steps ?? [];
    const totalCount = rawSteps.length;
    const opts: Array<{ value: string; label: string }> = [
      {
        value: "all",
        label: `Full End-to-End Scenario (${totalCount} observed call${totalCount === 1 ? "" : "s"})`,
      },
    ];
    featureClusters.forEach((cluster, cIdx) => {
      opts.push({
        value: `cluster:${cluster.meta.id}`,
        label: `Flow ${cIdx + 1}: ${cluster.meta.shortTitle} (${cluster.steps.length} call${cluster.steps.length === 1 ? "" : "s"})`,
      });
    });
    allTraces.forEach((tid, idx) => {
      const matching = rawSteps.filter((s) => s.traceId === tid);
      const first = matching[0];
      if (first) {
        const stepNum = typeof first.stepOrder === "number" ? first.stepOrder : idx + 1;
        const method = first.httpMethod ? `${first.httpMethod.toUpperCase()} ` : "";
        const op = first.operation ?? "";
        const opText =
          method && !op.toUpperCase().startsWith(method.trim()) ? `${method}${op}` : op;
        const status =
          typeof first.httpStatusCode === "number" ? ` · HTTP ${first.httpStatusCode}` : "";
        const dur = typeof first.durationMs === "number" ? ` · ${first.durationMs}ms` : "";
        const extra = matching.length > 1 ? ` (+${matching.length - 1} downstream)` : "";
        opts.push({
          value: tid,
          label: `Step #${stepNum}: ${opText} → ${first.calleeService ?? "service"}${status}${dur}${extra}`,
        });
      } else {
        opts.push({ value: tid, label: `Step #${idx + 1} (${tid.slice(0, 8)})` });
      }
    });
    return opts;
  }, [sequence.data?.steps, featureClusters, allTraces]);

  const interaction = useMemo<InteractionDocument | null>(() => {
    const doc = projection?.document;
    if (!doc) return null;
    const normalizedMessages = doc.messages.map((m) => {
      const nextSort = m.messageSort === "UNKNOWN" ? "SYNCH_CALL" : m.messageSort;
      const methodPrefix = m.httpMethod ? m.httpMethod.trim().toUpperCase() : "";
      const nextLabel =
        methodPrefix && !m.label.toUpperCase().startsWith(methodPrefix)
          ? `${methodPrefix} ${m.label}`
          : m.label;
      return {
        ...m,
        messageSort: nextSort,
        label: nextLabel,
        isUncertain: false,
      };
    });
    return {
      ...doc,
      semanticStatus: "COMPLETE",
      messages: normalizedMessages,
    };
  }, [projection?.document]);

  const viewId = interaction?.interactionId ?? `scenarios:observed:${selected?.id ?? "default"}`;
  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId },
    { enabled: api.mode === "backend" && Boolean(interaction && chosen === "all") },
  );

  let drawioXml = "";
  if (interaction && interaction.messages.length > 0) {
    try {
      drawioXml = interactionToDrawioXml(interaction, model);
    } catch {
      drawioXml = "";
    }
  }

  async function saveXmlDocument(contentXml: string) {
    if (!contentXml || !saved.data || saved.error) return;
    const result = await api.execute("saveArchitectureDocument", {
      modelId: model.id,
      viewId,
      expectedRevision: saved.data.revision,
      xml: contentXml,
    });
    cache.setQueryData(["api", "architectureDocument", { modelId: model.id, viewId }], result);
  }

  function handleSelectObservedItem(itemId: string) {
    if (!interaction) return;
    const seqCtx = resolveSequenceSelectionContext(interaction, itemId, {
      sessionId: selected?.id ?? null,
      traceId: chosen !== "all" && !chosen.startsWith("cluster:") ? chosen : null,
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
              label="Runtime Session"
              value={selected?.id ?? ""}
              onChange={(v) => {
                setSession(v);
                setTrace("all");
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
                        <Badge variant="outline">
                          {interaction.participants.length} Lifelines · {interaction.messages.length} Calls
                        </Badge>
                        {sequence.data?.traceStatus && (
                          <Badge variant="outline">
                            Trace: <StatusLabel status={sequence.data.traceStatus} />
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const copy = createDesignedCopyFromObserved(
                              interaction,
                              model,
                              `${interaction.name} (Designed copy)`,
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

                    {featureClusters.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs font-medium text-muted-foreground mr-1">
                          Feature Flows:
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          variant={chosen === "all" ? "default" : "outline"}
                          onClick={() => {
                            setTrace("all");
                            setPage(0);
                            onSelectSequence?.(null, null);
                          }}
                        >
                          Full End-to-End ({sequence.data?.steps?.length ?? 0})
                        </Button>
                        {featureClusters.map((cluster, idx) => {
                          const val = `cluster:${cluster.meta.id}`;
                          return (
                            <Button
                              key={cluster.meta.id}
                              type="button"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              variant={chosen === val ? "default" : "outline"}
                              onClick={() => {
                                setTrace(val);
                                setPage(0);
                                onSelectSequence?.(null, null);
                              }}
                            >
                              {idx + 1}. {cluster.meta.shortTitle} ({cluster.steps.length})
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    {allTraces.length > 1 && (
                      <SelectField
                        label="Filter by Flow or HTTP step"
                        value={chosen}
                        onChange={(v) => {
                          setTrace(v);
                          setPage(0);
                          onSelectSequence?.(null, null);
                        }}
                        options={traceOptions}
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
                    <DrawioEditor
                      key={`${model.id}:${viewId}:${chosen}:${page}`}
                      modelId={model.id}
                      diagramId={viewId}
                      title={`Sequence · ${interaction.name}`}
                      notation="UML_SEQUENCE"
                      level="SCENARIO"
                      scope={viewId}
                      theme={theme}
                      onThemeChange={setTheme}
                      xml={drawioXml}
                      generatedXml={drawioXml}
                      onSave={saveXmlDocument}
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
