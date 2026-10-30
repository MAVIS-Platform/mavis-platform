"use client";
import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { api as backend } from "@/lib/mainflow-api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, FileCode2, ShieldCheck, X, MessageSquare, Loader2 } from "lucide-react";
import { ThreeEEvidence } from "./three-e-evidence";
import { CommunicationPanel } from "./communication-panel";
import { useLocale } from "@/lib/i18n/locale-context";
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
  projectId,
  docked = false,
  model,
  selectedId,
  onSelect,
  onClose,
  projectedEdge: rawProjectedEdge,
  drilledSourceEdgeId,
  onDrilldown,
  sequenceContext,
}: {
  projectId?: string;
  docked?: boolean;
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
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState("explain");
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
      const payload = {
        ...ctx.buildExplainRequest({
          finding: f,
          runId,
          forceRefresh: !!input.refresh,
        }),
        locale,
      };
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
    () => buildDeterministicThreeESimplified(model, ctx, concreteEvidences, matching, locale),
    [model, ctx.scopeKey, concreteEvidences, matching.length, locale],
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
    const guard = checkThreeEScopeGuardrail(q, threeEAiCtx, locale);
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
            locale,
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
        locale,
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
  }, [threeEAiCtx.contextHash, locale]);

  const savedEvidenceCount = concreteEvidences.filter((item) => item.origin !== "preview").length;
  const previewCount = concreteEvidences.length - savedEvidenceCount;
  const isModelOnly = active3E.grounding?.status === "MODEL_ONLY";

  return (
    <aside
      aria-label="3E details"
      data-selection-scope-key={ctx.scopeKey}
      className={
        docked
          ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card [&_dt]:max-w-full [&_button]:max-w-full"
          : "fixed inset-x-2 bottom-2 z-40 flex h-[min(86dvh,780px)] min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl [overflow-wrap:anywhere] [&_dt]:max-w-full [&_button]:max-w-full xl:sticky xl:inset-auto xl:top-20 xl:z-auto xl:h-[calc(100dvh-6rem)] xl:max-h-[960px] xl:w-full xl:self-start xl:shadow-sm"
      }
    >
      <header
        className={
          docked ? "shrink-0 border-b bg-card px-4 py-2" : "shrink-0 border-b bg-card px-5 py-4"
        }
      >
        {!docked && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Architecture Inspector · 3E
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 shrink-0 rounded-full"
              aria-label="Close 3E"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
        <h2 className="mt-1 break-words text-lg font-semibold leading-snug tracking-tight">
          {subject.title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {subject.type}
          {docked ? ` · Revision ${model.revision}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={
              "rounded-full px-2.5 py-1 font-medium " +
              (isModelOnly
                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")
            }
          >
            {isModelOnly ? "Model context only" : "Source context attached"}
          </span>
          <span className="text-muted-foreground">
            {savedEvidenceCount} saved · {previewCount} preview{previewCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b bg-muted/20 px-4 py-2">
          <TabsList
            aria-label="3E sections"
            className="grid h-auto min-h-11 w-full grid-cols-3 items-stretch rounded-xl bg-muted/70"
          >
            <TabsTrigger value="explain" className="min-w-0 gap-1.5 whitespace-normal rounded-lg px-2 py-2 text-xs leading-4">
              <BookOpen className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <span className="min-w-0">Explain</span>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="min-w-0 gap-1.5 whitespace-normal rounded-lg px-2 py-2 text-xs leading-4">
              <FileCode2 className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <span className="min-w-0">Evidence</span>
              <span className="shrink-0 rounded bg-background/80 px-1.5 text-[11px]">
                {concreteEvidences.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="evaluate" className="min-w-0 gap-1.5 whitespace-normal rounded-lg px-2 py-2 text-xs leading-4">
              <ShieldCheck className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <span className="min-w-0">Evaluate</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-6 [scrollbar-gutter:stable]">
          <TabsContent value="explain" className="m-0 space-y-5">
            <section data-ai-three-e-simplified aria-label="Explanation" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Understand this selection</h3>
                {ai3ELoading && (
                  <span
                    role="status"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Updating
                  </span>
                )}
              </div>
              <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                <p className="text-sm leading-7">{active3E.explainSimple}</p>
              </div>
            </section>

            <details className="group rounded-xl border bg-background">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                Ask a follow-up
                <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
                  Optional +
                </span>
              </summary>
              <div className="px-3 pb-3">
                {" "}
                <div
                  data-three-e-ai-chat
                  className="space-y-2 rounded-md border bg-background p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">Ask about this selection</p>
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
                      aria-label="Question about this selection"
                      placeholder="What does this connection mean?"
                      disabled={chatLoading}
                      className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />

                    <Button
                      type="submit"
                      size="sm"
                      disabled={chatLoading || !chatInput.trim()}
                      className="h-11 shrink-0 px-3 text-xs"
                    >
                      {chatLoading ? "…" : "Ask AI"}
                    </Button>
                  </form>
                </div>
              </div>
            </details>
            <CommunicationPanel
              key={`explain-panel-${edge?.id ?? node?.id ?? selectedId}`}
              projectId={projectId ?? model.projectId}
              model={model}
              selectedId={edge?.id ?? node?.id ?? selectedId}
              onSelect={onSelect}
            />
          </TabsContent>
          <TabsContent value="evidence" className="m-0 space-y-5">
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Trace it to the source</h3>
              <p className="text-sm text-muted-foreground">
                Inspect the caller, receiver and configuration snippets attached to this selection.
              </p>
              <p className="text-xs text-muted-foreground">
                Saved snippets are source evidence. Metadata previews are reconstructions. Static
                evidence does not prove runtime execution.
              </p>
            </section>
            {isGroup && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <p className="font-semibold">Choose one member relationship</p>
                <p className="mt-1 text-muted-foreground">
                  This selection groups multiple relationships. Open its details below to inspect
                  the evidence of a specific member.
                </p>
              </div>
            )}
            {evidence.isFetching && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading saved evidence…
              </p>
            )}
            {evidence.error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <p className="text-sm">
                  Saved evidence could not be loaded. Any previews below remain model context only.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void evidence.refetch()}
                >
                  Retry evidence
                </Button>
              </div>
            )}
            <CommunicationPanel
              key={`evidence-panel-${edge?.id ?? node?.id ?? selectedId}`}
              projectId={projectId ?? model.projectId}
              model={model}
              selectedId={edge?.id ?? node?.id ?? selectedId}
              onSelect={onSelect}
            />
            <details className="rounded-xl border bg-card/60 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                Internal declaration evidence ({subject.title})
              </summary>
              <div className="mt-3">
                <ThreeEEvidence
                  evidence={concreteEvidences}
                  subjectTitle={subject.title}
                  snippetNotes={active3E.snippetNotes}
                  defaultOpen={false}
                />
              </div>
            </details>
            <details open={isGroup} className="rounded-xl border bg-muted/20 p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Selection details &amp; relationships
              </summary>
              <div className="mt-4 space-y-4">
                {" "}
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
                          <dt className="shrink-0 font-medium text-muted-foreground">
                            Linked evidence (aggregated):
                          </dt>
                          <dd className="min-w-0 break-words font-medium">
                            {projectedEdge.evidenceCount === null ||
                            projectedEdge.evidenceCount === undefined
                              ? "— (unverified / not loaded)"
                              : projectedEdge.evidenceCount === 0
                                ? "0 (verified no evidence)"
                                : `${projectedEdge.evidenceCount} verified evidence item(s) (distinct across ${projectedEdge.underlyingEdgeIds!.length} member relationships)`}
                          </dd>
                        </div>
                        <div className="pt-1">
                          <dt className="font-medium text-muted-foreground">
                            Member relationships ({projectedEdge.underlyingEdgeIds!.length}):
                          </dt>
                          <dd className="mt-1 space-y-1">
                            {projectedEdge.underlyingEdgeIds!.map((subId) => {
                              const subEdge = model.edges.find((e) => e.id === subId);
                              return (
                                <div
                                  key={subId}
                                  className="flex items-center justify-between rounded border bg-background p-1.5 text-xs"
                                >
                                  <span className="font-mono text-[11px]" title={subId}>
                                    {subEdge?.protocol ?? "EDGE"}: {subId.slice(0, 8)}…
                                  </span>
                                  <span className="text-muted-foreground text-[11px]">
                                    {subEdge?.evidenceCount === null ||
                                    subEdge?.evidenceCount === undefined
                                      ? "— (unverified)"
                                      : `${subEdge.evidenceCount} evidence`}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-xs"
                                    onClick={() =>
                                      onDrilldown ? onDrilldown(subId) : onSelect(subId)
                                    }
                                  >
                                    Details
                                  </Button>
                                </div>
                              );
                            })}
                          </dd>
                        </div>
                      </>
                    )}

                    {!isGroup &&
                      projectedEdge &&
                      projectedEdge.underlyingEdgeIds &&
                      projectedEdge.underlyingEdgeIds.length > 1 && (
                        <>
                          <div className="flex min-w-0 flex-wrap gap-x-2">
                            <dt className="shrink-0 font-medium text-muted-foreground">
                              Linked evidence (single edge):
                            </dt>
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
                              This edge belongs to an aggregated relationship (
                              {projectedEdge.underlyingEdgeIds.length} relationships · distinct
                              total:{" "}
                              <strong className="text-foreground">
                                {projectedEdge.evidenceCount === null
                                  ? "—"
                                  : `${projectedEdge.evidenceCount} evidence`}
                              </strong>
                              )
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 text-xs"
                              onClick={() =>
                                onDrilldown ? onDrilldown(null) : onSelect(projectedEdge.id)
                              }
                            >
                              ← View full aggregated relationship (
                              {projectedEdge.underlyingEdgeIds.length} member relationships)
                            </Button>
                          </div>
                        </>
                      )}

                    {!isGroup &&
                      (!projectedEdge ||
                        !projectedEdge.underlyingEdgeIds ||
                        projectedEdge.underlyingEdgeIds.length <= 1) && (
                        <div className="flex min-w-0 flex-wrap gap-x-2">
                          <dt className="shrink-0 font-medium text-muted-foreground">
                            Linked evidence:
                          </dt>
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
                      <dt className="shrink-0 font-medium text-muted-foreground">
                        Sequence scope:
                      </dt>
                      <dd className="min-w-0 break-words font-mono">
                        {sequenceContext.interactionId} · {sequenceContext.mode}
                        {sequenceContext.sessionId
                          ? ` · session ${sequenceContext.sessionId.slice(0, 8)}`
                          : ""}
                        {sequenceContext.traceId
                          ? ` · trace ${sequenceContext.traceId.slice(0, 12)}`
                          : ""}
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
                        <dt className="shrink-0 font-medium text-muted-foreground">
                          Sequence resolution:
                        </dt>
                        <dd className="min-w-0 break-words">{sequenceContext.resolutionStatus}</dd>
                      </div>
                    )}
                    {sequenceContext.messageSort && (
                      <div className="flex min-w-0 flex-wrap gap-x-2">
                        <dt className="shrink-0 font-medium text-muted-foreground">
                          Message sort:
                        </dt>
                        <dd className="min-w-0 break-words font-mono">
                          #{sequenceContext.occurrenceIndex ?? "?"} · {sequenceContext.messageSort}
                          {sequenceContext.guard ? ` [${sequenceContext.guard}]` : ""}
                        </dd>
                      </div>
                    )}
                    {sequenceContext.operator && (
                      <div className="flex min-w-0 flex-wrap gap-x-2">
                        <dt className="shrink-0 font-medium text-muted-foreground">
                          Fragment operator:
                        </dt>
                        <dd className="min-w-0 break-words font-mono">
                          {sequenceContext.operator}
                        </dd>
                      </div>
                    )}
                    {sequenceContext.coveredParticipantLabels &&
                      sequenceContext.coveredParticipantLabels.length > 0 && (
                        <div className="flex min-w-0 flex-wrap gap-x-2">
                          <dt className="shrink-0 font-medium text-muted-foreground">
                            Covered lifelines:
                          </dt>
                          <dd className="min-w-0 break-words">
                            {sequenceContext.coveredParticipantLabels.join(", ")}
                          </dd>
                        </div>
                      )}
                    {sequenceContext.operandSummaries &&
                      sequenceContext.operandSummaries.length > 0 && (
                        <div className="flex min-w-0 flex-wrap gap-x-2">
                          <dt className="shrink-0 font-medium text-muted-foreground">
                            Operands &amp; guards:
                          </dt>
                          <dd className="min-w-0 break-words">
                            {sequenceContext.operandSummaries.join(" · ")}
                          </dd>
                        </div>
                      )}
                    {sequenceContext.evaluationStatus && (
                      <div className="flex min-w-0 flex-wrap gap-x-2">
                        <dt className="shrink-0 font-medium text-muted-foreground">
                          Static evaluation:
                        </dt>
                        <dd className="min-w-0 break-words font-mono">
                          {sequenceContext.evaluationStatus}
                        </dd>
                      </div>
                    )}
                    {sequenceContext.runtimeEvidence && (
                      <div className="flex min-w-0 flex-wrap gap-x-2">
                        <dt className="shrink-0 font-medium text-muted-foreground">
                          Runtime span:
                        </dt>
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
              </div>
            </details>
          </TabsContent>
          <TabsContent value="evaluate" className="m-0 space-y-5">
            <section className="space-y-3">
              <h3 className="text-base font-semibold">Assess what is supported</h3>
              <p className="text-sm leading-7">{active3E.evaluateSimple}</p>
              <p className="rounded-xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                This assessment uses the selected model and available evidence. It is not a
                certification of correctness, security or runtime behavior.
              </p>
            </section>
            {!!(active3E.assumptions?.length || active3E.unknowns?.length) && (
              <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                <h4 className="text-sm font-semibold">Assumptions &amp; unknowns</h4>
                <ul className="mt-3 list-disc space-y-3 pl-4 text-sm">
                  {active3E.assumptions?.map((text, index) => (
                    <li key={"assumption-" + index}>
                      <span className="font-medium">Unverified inference: </span>
                      {text}
                    </li>
                  ))}
                  {active3E.unknowns?.map((text, index) => (
                    <li key={"unknown-" + index}>
                      <span className="font-medium">Unknown: </span>
                      {text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Button variant="outline" className="w-full" onClick={() => setActiveTab("evidence")}>
              Review supporting evidence
            </Button>
          </TabsContent>
        </div>
      </Tabs>
      {!docked && (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
          <span>Model revision {model.revision}</span>
          <span>
            {active3E.tokenStats?.provider && active3E.tokenStats.provider !== "ast-skeleton"
              ? "AI-assisted interpretation"
              : isModelOnly
                ? "Model-based interpretation"
                : "Source-based interpretation"}
          </span>
        </footer>
      )}
    </aside>
  );
}
