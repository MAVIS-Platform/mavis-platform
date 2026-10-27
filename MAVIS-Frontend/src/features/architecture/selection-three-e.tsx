"use client";
import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { api as backend } from "@/lib/mainflow-api";
import { Button } from "@/components/ui/button";
import { ThreeEEvidence } from "./three-e-evidence";
import {
  buildThreeESubjectContext,
  collectConcreteThreeEEvidences,
  buildDeterministicThreeESimplified,
  buildThreeEAiContext,
  checkThreeEScopeGuardrail,
  type ThreeEAiSimplifiedExplanation,
} from "./three-e-content";

const explanationSchema = z.object({
  modelVersionId: z.string(),
  elementId: z.string().nullish(),
  relationshipId: z.string().nullish(),
  findingId: z.string().nullish(),
  evaluationRunId: z.string().nullish(),
  contractVersion: z.string().nullish(),
  ruleSetVersion: z.string().nullish(),
  explanationText: z.string(),
  providerMode: z.string(),
  cached: z.boolean().nullish(),
  structuredContent: z
    .object({
      summary: z.string(),
      whyItMatters: z.string(),
      unknowns: z.array(z.string()),
      nextSteps: z.array(z.string()),
      evidenceSufficiency: z.string(),
      evidenceRefs: z.array(z.string()),
    })
    .nullish(),
  citedEvidences: z
    .array(
      z.object({
        id: z.string(),
        sourceType: z.string(),
        locator: z.string().nullish(),
        excerpt: z.string().nullish(),
      }),
    )
    .optional(),
});
// S2b: node metadata resolved by the adapter lives in node.properties. transportAuthority is a
// binding-authority label, not an endpoint address; resolutionIssue describes this node's own
// resolution problem — node metadata, never an edge status.
const NODE_METADATA_LABELS: Array<[string, string]> = [
  ["protocol", "Protocol"],
  ["transportAuthority", "Transport binding"],
  ["resolutionIssue", "Node resolution issue"],
];
function nodeMetadataRows(
  node: ArchitecturalModel["elements"][number] | undefined,
): Array<[string, string]> {
  if (!node) return [];
  return NODE_METADATA_LABELS.flatMap(([key, label]) => {
    const value = node.properties?.[key];
    return typeof value === "string" && value.trim() !== ""
      ? [[label, value] as [string, string]]
      : [];
  });
}
export function SelectionThreeE({
  model,
  selectedId,
  onSelect,
  onClose,
  projectedEdge: rawProjectedEdge,
  drilledSourceEdgeId,
  onDrilldown,
  sequenceContext,
}: {
  model: ArchitecturalModel;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onHighlight?: (ids: string[]) => void;
  projectedEdge?: ArchitecturalModel["edges"][number] | undefined;
  drilledSourceEdgeId?: string | null | undefined;
  onDrilldown?: ((subId: string | null) => void) | undefined;
  sequenceContext?: Parameters<typeof buildThreeESubjectContext>[0]["sequenceContext"];
}) {
  const api = useApi();
  const [ai3E, setAi3E] = useState<ThreeEAiSimplifiedExplanation | null>(null),
    [ai3ELoading, setAi3ELoading] = useState(false),
    [chatByScope, setChatByScope] = useState<
      Record<string, Array<{ role: "user" | "assistant"; content: string }>>
    >({}),
    [chatInput, setChatInput] = useState(""),
    [chatLoading, setChatLoading] = useState(false);
  const ctx = buildThreeESubjectContext({
    model,
    selectedId,
    projectedEdge: rawProjectedEdge,
    drilledSourceEdgeId,
    sequenceContext,
  });
  const { isGroup, canExplain, subject } = ctx;
  const projectedEdge = ctx.effectiveProjectedEdge ?? rawProjectedEdge;
  const { node, edge } = subject;

  const evidence = useApiQuery(
    node ? "elementEvidence" : "relationshipEvidence",
    ctx.evidenceQueryParam ?? { modelId: model.id, relationshipId: "" },
    { enabled: api.mode === "backend" && !isGroup && !!ctx.evidenceQueryParam },
  );
  const runs = useApiQuery(
    "evaluations",
    { modelId: model.id },
    { enabled: api.mode === "backend" },
  );
  const ordered = [...(runs.data ?? [])].sort((a, b) =>
    String(b.result?.["createdAt"] ?? "").localeCompare(String(a.result?.["createdAt"] ?? "")),
  );
  const run = ordered[0],
    runId = run?.id ?? "";
  const findings = useApiQuery(
    "evaluationFindings",
    { modelId: model.id, evaluationId: runId },
    { enabled: api.mode === "backend" && !!runId },
  );
  const matching = ctx.filterFindings(findings.data ?? []);
  const explain = useMutation({
    mutationFn: async (input: { finding?: Record<string, unknown>; refresh?: boolean }) => {
      const requestScopeKey = ctx.scopeKey;
      const f = input.finding;
      const payload = ctx.buildExplainRequest({
        finding: f,
        runId,
        forceRefresh: !!input.refresh,
      });
      const raw = await backend<unknown>("analyzer/ai/explain", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result = explanationSchema.parse(raw);
      if (!ctx.validateExplainResponse(result, f, runId, requestScopeKey)) {
        throw Error("Response does not match the current selection. Please try again.");
      }
      return result;
    },
  });
  const result = explain.data;
  const refs: Evidence[] = (result?.citedEvidences ?? []).map((e) => ({
    id: e.id,
    origin: "persisted",
    kind: e.sourceType.startsWith("RUNTIME") ? "runtime" : "source",
    sourceType: e.sourceType,
    location: e.locator ?? "",
    snippet: e.excerpt ?? "",
    complete: null,
  }));

  const concreteEvidences = useMemo(
    () => collectConcreteThreeEEvidences(model, ctx, evidence.data, refs),
    [model, ctx.scopeKey, evidence.data, refs.length],
  );
  const deterministic3E = useMemo(
    () => buildDeterministicThreeESimplified(model, ctx, concreteEvidences, matching),
    [model, ctx.scopeKey, concreteEvidences, matching.length],
  );
  const threeEAiCtx = useMemo(
    () => buildThreeEAiContext(model, ctx, concreteEvidences, matching),
    [model, ctx.scopeKey, concreteEvidences, matching.length],
  );
  const active3E: ThreeEAiSimplifiedExplanation = ai3E ?? deterministic3E;
  const currentChatMessages = chatByScope[ctx.scopeKey] ?? [];

  const sendChatQuestion = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || chatLoading) return;
    const scopeKey = ctx.scopeKey;
    const prevHistory = chatByScope[scopeKey] ?? [];
    setChatInput("");
    const guard = checkThreeEScopeGuardrail(q, threeEAiCtx);
    if (!guard.allowed && guard.refusalMessage) {
      setChatByScope((prev) => ({
        ...prev,
        [scopeKey]: [
          ...(prev[scopeKey] ?? []),
          { role: "user", content: q },
          { role: "assistant", content: guard.refusalMessage! },
        ],
      }));
      return;
    }
    setChatByScope((prev) => ({
      ...prev,
      [scopeKey]: [...(prev[scopeKey] ?? []), { role: "user", content: q }],
    }));
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai-diagram-semantics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threeEChat: {
            threeEContext: threeEAiCtx,
            currentExplanation: {
              explainSimple: active3E.explainSimple,
              exploreSimple: active3E.exploreSimple,
              evaluateSimple: active3E.evaluateSimple,
            },
            history: prevHistory,
            question: q,
          },
        }),
      });
      const data = (res.ok ? await res.json() : null) as { answer?: string } | null;
      const reply =
        data?.answer?.trim() ||
        `${subject.title}: ${active3E.explainSimple} ${active3E.exploreSimple}`;
      setChatByScope((prev) => ({
        ...prev,
        [scopeKey]: [...(prev[scopeKey] ?? []), { role: "assistant", content: reply }],
      }));
    } catch {
      setChatByScope((prev) => ({
        ...prev,
        [scopeKey]: [
          ...(prev[scopeKey] ?? []),
          {
            role: "assistant",
            content: `${subject.title}: ${active3E.explainSimple} ${active3E.evaluateSimple}`,
          },
        ],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    explain.reset();
    if (api.mode === "backend" && canExplain && !isGroup) {
      explain.mutate({});
    }
  }, [ctx.scopeKey]);

  useEffect(() => {
    let cancelled = false;
    setAi3ELoading(true);
    fetch("/api/ai-diagram-semantics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threeEContext: threeEAiCtx,
        threeEFallback: deterministic3E,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { threeEEnrichment?: ThreeEAiSimplifiedExplanation } | null) => {
        if (!cancelled && data?.threeEEnrichment) {
          setAi3E(data.threeEEnrichment);
        }
      })
      .catch(() => {
        // fallback deterministic3E remains active
      })
      .finally(() => {
        if (!cancelled) setAi3ELoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threeEAiCtx.contextHash]);

  return (
    <aside
      aria-label="3E details"
      data-selection-scope-key={ctx.scopeKey}
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[85vh] min-w-0 max-w-full flex-col rounded-xl border bg-card shadow-lg [overflow-wrap:anywhere] [&_dt]:max-w-full [&_button]:max-w-full [&_button]:whitespace-normal xl:sticky xl:inset-auto xl:top-20 xl:z-auto xl:w-full xl:max-h-[calc(100vh-6rem)] xl:self-start xl:shadow-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Architecture Inspector · 3E</p>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {ai3ELoading
                ? "AI 3E analyzing…"
                : active3E.tokenStats?.provider && active3E.tokenStats.provider !== "ast-skeleton"
                  ? `AI 3E (${active3E.tokenStats.provider.toUpperCase()})`
                  : active3E.grounding?.status === "MODEL_ONLY" ? "Model context · source not attached" : "Selected source evidence"}
            </span>
          </div>
          <h2 className="mt-1 break-words text-base font-semibold">{subject.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subject.type}</p>
        </div>
        <Button size="sm" variant="ghost" className="shrink-0" aria-label="Close 3E" onClick={onClose}>
          ×
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-6">
        <p className="text-sm leading-6">{subject.summary}</p>

        {/* AI 3E Summary + Expandable Source Evidence + Interactive Follow-up Q&A Chat */}
        <div
          data-ai-three-e-simplified
          className="space-y-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs leading-5"
        >
          <p className="text-xs text-muted-foreground">{active3E.grounding?.notice ?? deterministic3E.grounding?.notice}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-primary">
              3E interpretation
            </span>
            {active3E.tokenStats && (
              <span className="font-mono text-[10px] text-muted-foreground">
                saved {active3E.tokenStats.savedPercent}% tokens
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div className="rounded border bg-background/90 p-2">
              <p className="font-semibold text-foreground">
                1. Explain (what is known):
              </p>
              <p className="mt-0.5 text-foreground/90">{active3E.explainSimple}</p>
            </div>
            <div className="rounded border bg-background/90 p-2">
              <p className="font-semibold text-foreground">
                2. Explore (Source Code Evidence):
              </p>
              <p className="mt-0.5 text-foreground/90">{active3E.exploreSimple}</p>
            </div>
            <div className="rounded border bg-background/90 p-2">
              <p className="font-semibold text-foreground">
                3. Evaluate (Assessment &amp; Trade-offs):
              </p>
              <p className="mt-0.5 text-foreground/90">{active3E.evaluateSimple}</p>
            </div>
          </div>

          {(active3E.assumptions?.length || active3E.unknowns?.length) ? <details className="rounded-md border bg-background p-2.5">
            <summary className="cursor-pointer font-medium">Assumptions and unknowns</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {active3E.assumptions?.map((text, index) => <li key={"assumption-" + index}>Inference (unverified): {text}</li>)}
              {active3E.unknowns?.map((text, index) => <li key={"unknown-" + index}>Unknown: {text}</li>)}
            </ul>
          </details> : null}
          <details className="rounded-md border bg-background p-2.5">
            <summary className="cursor-pointer font-semibold text-primary select-none">
              Expand source evidence and metadata previews ({concreteEvidences.length} snippet{concreteEvidences.length === 1 ? "" : "s"})
            </summary>
            <div className="mt-3">
              <ThreeEEvidence
                evidence={concreteEvidences}
                subjectTitle={subject.title}
                snippetNotes={active3E.snippetNotes}
                defaultOpen={true}
              />
            </div>
          </details>

          <div
            data-three-e-ai-chat
            className="space-y-2 rounded-md border bg-background p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                Ask AI follow-up questions about {subject.title}
              </p>
              {currentChatMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setChatByScope((prev) => ({
                      ...prev,
                      [ctx.scopeKey]: [],
                    }))
                  }
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Clear chat
                </button>
              )}
            </div>

            {currentChatMessages.length > 0 && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded border bg-muted/20 p-2">
                {currentChatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "ml-6 bg-primary text-primary-foreground"
                        : "mr-4 border bg-background text-foreground"
                    }`}
                  >
                    <p className="text-[10px] font-semibold opacity-75">
                      {msg.role === "user" ? "You" : "AI 3E"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
                {chatLoading && (
                  <p className="px-2 py-1 text-[11px] italic text-muted-foreground">
                    AI is responding…
                  </p>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChatQuestion(chatInput);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question about this architectural element…"
                disabled={chatLoading}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                type="submit"
                size="sm"
                disabled={chatLoading || !chatInput.trim()}
                className="h-8 shrink-0 px-3 text-xs"
              >
                {chatLoading ? "…" : "Ask AI"}
              </Button>
            </form>
          </div>
        </div>

        {nodeMetadataRows(node).length > 0 && (
          <dl className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs leading-5">
            {nodeMetadataRows(node).map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">{label}:</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {edge && (
          <dl className="space-y-2 rounded-md border bg-muted/40 p-2 text-xs leading-5">
            <div className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="shrink-0 font-medium text-muted-foreground">Origin:</dt>
              <dd className="min-w-0 break-words">{edge.originLayer ?? "unknown"}</dd>
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="shrink-0 font-medium text-muted-foreground">Resolution:</dt>
              <dd className="min-w-0 break-words">{edge.resolutionStatus ?? "unknown"}</dd>
            </div>

            {isGroup && projectedEdge && (
              <>
                <div className="flex min-w-0 flex-wrap gap-x-2">
                  <dt className="shrink-0 font-medium text-muted-foreground">Linked evidence (aggregated):</dt>
                  <dd className="min-w-0 break-words font-medium">
                    {projectedEdge.evidenceCount === null || projectedEdge.evidenceCount === undefined
                      ? "— (unverified / not loaded)"
                      : projectedEdge.evidenceCount === 0
                        ? "0 (verified no evidence)"
                        : `${projectedEdge.evidenceCount} verified evidence item(s) (distinct across ${projectedEdge.underlyingEdgeIds!.length} member relationships)`}
                  </dd>
                </div>
                <div className="pt-1">
                  <dt className="font-medium text-muted-foreground">Member relationships ({projectedEdge.underlyingEdgeIds!.length}):</dt>
                  <dd className="mt-1 space-y-1">
                    {projectedEdge.underlyingEdgeIds!.map((subId) => {
                      const subEdge = model.edges.find((e) => e.id === subId);
                      return (
                        <div key={subId} className="flex items-center justify-between rounded border bg-background p-1.5 text-xs">
                          <span className="font-mono text-[11px]" title={subId}>
                            {subEdge?.protocol ?? "EDGE"}: {subId.slice(0, 8)}…
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {subEdge?.evidenceCount === null || subEdge?.evidenceCount === undefined
                              ? "— (unverified)"
                              : `${subEdge.evidenceCount} evidence`}
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => onDrilldown ? onDrilldown(subId) : onSelect(subId)}>
                            Details
                          </Button>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              </>
            )}

            {!isGroup && projectedEdge && projectedEdge.underlyingEdgeIds && projectedEdge.underlyingEdgeIds.length > 1 && (
              <>
                <div className="flex min-w-0 flex-wrap gap-x-2">
                  <dt className="shrink-0 font-medium text-muted-foreground">Linked evidence (single edge):</dt>
                  <dd className="min-w-0 break-words font-medium">
                    {edge.evidenceCount === null || edge.evidenceCount === undefined
                      ? "— (unverified / not loaded)"
                      : edge.evidenceCount === 0
                        ? "0 (verified no evidence)"
                        : `${edge.evidenceCount} verified evidence item(s)`}
                  </dd>
                </div>
                <div className="rounded border bg-background p-2 text-xs">
                  <p className="text-muted-foreground">
                    This edge belongs to an aggregated relationship ({projectedEdge.underlyingEdgeIds.length} relationships · distinct total:{" "}
                    <strong className="text-foreground">
                      {projectedEdge.evidenceCount === null ? "—" : `${projectedEdge.evidenceCount} evidence`}
                    </strong>
                    )
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => onDrilldown ? onDrilldown(null) : onSelect(projectedEdge.id)}
                  >
                    ← View full aggregated relationship ({projectedEdge.underlyingEdgeIds.length} member relationships)
                  </Button>
                </div>
              </>
            )}

            {!isGroup && (!projectedEdge || !projectedEdge.underlyingEdgeIds || projectedEdge.underlyingEdgeIds.length <= 1) && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Linked evidence:</dt>
                <dd className="min-w-0 break-words font-medium">
                  {edge.evidenceCount === null || edge.evidenceCount === undefined
                    ? "— (unverified / not loaded)"
                    : edge.evidenceCount === 0
                      ? "0 (verified no evidence)"
                      : `${edge.evidenceCount} verified evidence item(s)`}
                </dd>
              </div>
            )}
          </dl>
        )}
        {sequenceContext && (
          <dl
            data-sequence-three-e-meta
            className="space-y-1.5 rounded-md border bg-muted/40 p-2 text-xs leading-5"
          >
            <div className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="shrink-0 font-medium text-muted-foreground">Sequence scope:</dt>
              <dd className="min-w-0 break-words font-mono">
                {sequenceContext.interactionId} · {sequenceContext.mode}
                {sequenceContext.sessionId ? ` · session ${sequenceContext.sessionId.slice(0, 8)}` : ""}
                {sequenceContext.traceId ? ` · trace ${sequenceContext.traceId.slice(0, 12)}` : ""}
              </dd>
            </div>
            {sequenceContext.provenance && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Provenance:</dt>
                <dd className="min-w-0 break-words">{sequenceContext.provenance}</dd>
              </div>
            )}
            {sequenceContext.resolutionStatus && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Sequence resolution:</dt>
                <dd className="min-w-0 break-words">{sequenceContext.resolutionStatus}</dd>
              </div>
            )}
            {sequenceContext.messageSort && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Message sort:</dt>
                <dd className="min-w-0 break-words font-mono">
                  #{sequenceContext.occurrenceIndex ?? "?"} · {sequenceContext.messageSort}
                  {sequenceContext.guard ? ` [${sequenceContext.guard}]` : ""}
                </dd>
              </div>
            )}
            {sequenceContext.operator && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Fragment operator:</dt>
                <dd className="min-w-0 break-words font-mono">{sequenceContext.operator}</dd>
              </div>
            )}
            {sequenceContext.coveredParticipantLabels &&
              sequenceContext.coveredParticipantLabels.length > 0 && (
                <div className="flex min-w-0 flex-wrap gap-x-2">
                  <dt className="shrink-0 font-medium text-muted-foreground">Covered lifelines:</dt>
                  <dd className="min-w-0 break-words">
                    {sequenceContext.coveredParticipantLabels.join(", ")}
                  </dd>
                </div>
              )}
            {sequenceContext.operandSummaries && sequenceContext.operandSummaries.length > 0 && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Operands &amp; guards:</dt>
                <dd className="min-w-0 break-words">
                  {sequenceContext.operandSummaries.join(" · ")}
                </dd>
              </div>
            )}
            {sequenceContext.evaluationStatus && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Static evaluation:</dt>
                <dd className="min-w-0 break-words font-mono">{sequenceContext.evaluationStatus}</dd>
              </div>
            )}
            {sequenceContext.runtimeEvidence && (
              <div className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">Runtime span:</dt>
                <dd className="min-w-0 break-words font-mono">
                  trace={sequenceContext.runtimeEvidence.traceId ?? "n/a"} · span=
                  {sequenceContext.runtimeEvidence.spanId ?? "n/a"} ·{" "}
                  {sequenceContext.runtimeEvidence.durationMs ?? "?"}ms · status=
                  {sequenceContext.runtimeEvidence.statusCode ?? "n/a"}
                </dd>
              </div>
            )}
          </dl>
        )}

        {subject.connections.length > 0 && (
          <details className="rounded-md border bg-muted/20 p-2.5 text-xs">
            <summary className="cursor-pointer font-medium text-primary">
              Related relationships ({subject.connections.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {subject.connections.slice(0, 20).map((e: ArchitecturalModel["edges"][number]) => (
                <li key={e.id}>
                  <button
                    className="break-words text-left text-xs underline"
                    onClick={() => onSelect(e.id)}
                  >
                    {model.elements.find((n) => n.id === e.from)?.name} →{" "}
                    {model.elements.find((n) => n.id === e.to)?.name}
                  </button>
                </li>
              ))}
            </ul>
            {subject.connections.length > 20 && (
              <p className="mt-1 text-xs text-muted-foreground">Showing first 20 relationships; view all on graph.</p>
            )}
          </details>
        )}
      </div>
      <footer className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
        Model revision {model.revision} ·{" "}
        <span title="Explore evidence; Explain finding; Evaluate by rule">
          3E: Evidence · Explanation · Evaluation
        </span>
      </footer>
    </aside>
  );
}
