"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/shared/data";
import { ErrorState } from "@/components/shared/request-state";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
import { ThreeEEvidence } from "@/features/architecture/three-e-evidence";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  buildDeterministicThreeESimplified,
  buildThreeEAiContext,
  buildThreeESubjectContext,
  collectConcreteThreeEEvidences,
  shortLocator,
  type ThreeEAiSimplifiedExplanation,
} from "@/features/architecture/three-e-content";

function formatInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function renderFormattedExplanation(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`${keyPrefix}-list`} className="ml-4 list-disc space-y-1.5 text-sm leading-6 text-muted-foreground">
        {listItems.map((item, i) => (
          <li key={i}>{formatInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`line-${index}`);
      return;
    }
    if (/^#{1,4}\s+/.test(line)) {
      flushList(`line-${index}`);
      const heading = line.replace(/^#{1,4}\s+/, "");
      blocks.push(
        <h4 key={`h-${index}`} className="pt-1 text-sm font-semibold text-foreground">
          {formatInlineMarkdown(heading)}
        </h4>,
      );
      return;
    }
    if (/^[-*•]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s+/, ""));
      return;
    }
    flushList(`line-${index}`);
    blocks.push(
      <p key={`p-${index}`} className="text-sm leading-6 text-muted-foreground">
        {formatInlineMarkdown(line)}
      </p>,
    );
  });
  flushList("end");
  return <div className="space-y-2.5">{blocks}</div>;
}

const QUICK_QUESTIONS = [
  "What is the main architectural role and responsibility of this element?",
  "Which components could be affected if this element changes?",
  "What coupling risks and assumptions need further verification?",
];

export function AIExplanationPanel({
  model,
  elementId,
}: {
  model: ArchitecturalModel;
  elementId: string;
}) {
  const api = useApi();
  const { locale } = useLocale();
  const generate = useApiMutation("explain");
  const isEdge = useMemo(
    () => !model.elements.some((e) => e.id === elementId) && model.edges.some((e) => e.id === elementId),
    [model, elementId],
  );
  const [scope, setScope] = useState<"ELEMENT" | "CHANGE_IMPACT">("ELEMENT");
  const [userQuestion, setUserQuestion] = useState("");
  const [ai3E, setAi3E] = useState<ThreeEAiSimplifiedExplanation | null>(null);
  const [ai3ELoading, setAi3ELoading] = useState(false);

  const effectiveScope: "ELEMENT" | "RELATIONSHIP" | "CHANGE_IMPACT" = isEdge
    ? "RELATIONSHIP"
    : scope;

  const ctx = useMemo(
    () => buildThreeESubjectContext({ model, selectedId: elementId }),
    [model, elementId],
  );

  const elementContextQuery = useApiQuery(
    "elementEvidenceContext",
    { modelId: model.id, elementId },
    { enabled: api.mode === "backend" && Boolean(elementId) && !isEdge },
  );
  const relationshipEvidenceQuery = useApiQuery(
    "relationshipEvidence",
    { modelId: model.id, relationshipId: elementId },
    { enabled: api.mode === "backend" && Boolean(elementId) && isEdge },
  );

  const persistedEvidences = useMemo<Evidence[]>(() => {
    if (isEdge) return relationshipEvidenceQuery.data ?? [];
    const direct = elementContextQuery.data?.directEvidence ?? [];
    const related = (elementContextQuery.data?.relationshipEvidence ?? []).map((r) => r.evidence);
    return [...direct, ...related];
  }, [isEdge, elementContextQuery.data, relationshipEvidenceQuery.data]);

  const current =
    generate.data?.modelId === model.id && generate.data.elementId === elementId
      ? generate.data
      : null;

  const citedAsEvidence = useMemo<Evidence[]>(
    () =>
      (current?.citedEvidences ?? []).map((e) => ({
        id: e.id,
        origin: "persisted" as const,
        kind: e.sourceType.startsWith("RUNTIME") ? ("runtime" as const) : ("source" as const),
        sourceType: e.sourceType,
        location: e.locator ?? "",
        snippet: e.excerpt ?? "",
        complete: null,
      })),
    [current?.citedEvidences],
  );

  const concreteEvidences = useMemo(
    () => collectConcreteThreeEEvidences(model, ctx, persistedEvidences, citedAsEvidence),
    [model, ctx, persistedEvidences, citedAsEvidence],
  );
  const deterministic3E = useMemo(
    () => buildDeterministicThreeESimplified(model, ctx, concreteEvidences, [], locale),
    [model, ctx, concreteEvidences, locale],
  );
  const threeEAiCtx = useMemo(
    () => buildThreeEAiContext(model, ctx, concreteEvidences, []),
    [model, ctx, concreteEvidences],
  );
  const active3E = ai3E ?? deterministic3E;

  useEffect(() => {
    if (!elementId || api.mode !== "backend") return;
    let cancelled = false;
    const controller = new AbortController();
    setAi3ELoading(true);
    fetch("/api/ai-diagram-semantics", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threeEContext: threeEAiCtx,
        threeEFallback: deterministic3E,
        locale,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { threeEEnrichment?: ThreeEAiSimplifiedExplanation } | null) => {
        if (!cancelled && data?.threeEEnrichment) setAi3E(data.threeEEnrichment);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAi3ELoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [elementId, api.mode, threeEAiCtx.contextHash, locale]);

  const triggerExplain = (forceRefresh: boolean, customQuestion?: string) => {
    const q = (customQuestion ?? userQuestion).trim();
    generate.mutate({
      modelId: model.id,
      elementId,
      ...(isEdge ? { relationshipId: elementId } : {}),
      explanationScope: effectiveScope,
      ...(q ? { userQuestion: q } : {}),
      forceRefresh,
      locale,
    });
  };

  const resolvedCitedEvidences = useMemo(() => {
    if (!current) return [];
    if (current.citedEvidences && current.citedEvidences.length > 0) {
      return current.citedEvidences.map((ev) => ({
        id: ev.id,
        sourceType: ev.sourceType,
        location: ev.locator ?? "",
        snippet: ev.excerpt ?? "",
      }));
    }
    const byId = new Map(concreteEvidences.map((ev) => [ev.id, ev]));
    return current.evidenceIds.map((id) => {
      const found = byId.get(id);
      return {
        id,
        sourceType: found?.sourceType ?? "EVIDENCE",
        location: found?.location ?? "",
        snippet: found?.snippet ?? "",
      };
    });
  }, [current, concreteEvidences]);

  return (
    <DetailPanel title="AI explanation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="ai">Interpretation · verify against evidence</Badge>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          {ai3ELoading
            ? "3E analyzing…"
            : active3E.tokenStats?.provider && active3E.tokenStats.provider !== "ast-skeleton"
              ? `3E Grounded (${active3E.tokenStats.provider.toUpperCase()})`
              : "3E + AST Grounded"}
        </span>
      </div>

      {/* Instant 3E Architectural Grounding */}
      {elementId && (
        <div className="space-y-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3.5 text-xs leading-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-primary">
              Instant 3E Architectural Summary · {ctx.subject.title}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {ctx.subject.type}
            </Badge>
          </div>

          <div className="space-y-1.5 rounded-md border bg-background/80 p-2.5">
            <p className="font-semibold text-foreground">1. Explain (Role &amp; Responsibilities)</p>
            <p className="text-muted-foreground">{active3E.explainSimple}</p>
          </div>

          <div className="space-y-2 rounded-md border bg-background/80 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                2. Explore (Source Code &amp; Configuration Evidence · {concreteEvidences.length})
              </p>
            </div>
            <p className="text-muted-foreground">{active3E.exploreSimple}</p>
            {concreteEvidences.length > 0 && (
              <details className="group rounded border bg-card/70 p-2">
                <summary className="cursor-pointer select-none font-medium text-primary hover:underline">
                  View {concreteEvidences.length} source/config evidence snippet(s)
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                  <ThreeEEvidence
                    evidence={concreteEvidences}
                    subjectTitle={ctx.subject.title}
                    snippetNotes={active3E.snippetNotes}
                  />
                </div>
              </details>
            )}
          </div>

          <div className="space-y-1.5 rounded-md border bg-background/80 p-2.5">
            <p className="font-semibold text-foreground">
              3. Evaluate (Dependencies &amp; Architectural Risks)
            </p>
            <p className="text-muted-foreground">{active3E.evaluateSimple}</p>
          </div>
        </div>
      )}

      {/* Deep Grounded AI Synthesis Controls */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">Deep AI Grounded Synthesis</h4>
            <p className="text-xs text-muted-foreground">
              Generate a persisted explanation verified against model relationships and source
              excerpts.
            </p>
          </div>
          {!isEdge && (
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setScope("ELEMENT")}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  scope === "ELEMENT"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Element Role
              </button>
              <button
                type="button"
                onClick={() => setScope("CHANGE_IMPACT")}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  scope === "CHANGE_IMPACT"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Change Impact
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!elementId || generate.isPending}
                onClick={() => {
                  setUserQuestion(q);
                  triggerExplain(true, q);
                }}
                className="rounded-full border bg-background px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  triggerExplain(Boolean(current));
                }
              }}
              placeholder="Optional: Ask a specific architectural question about this target…"
              className="min-w-[220px] flex-1 rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              disabled={!elementId || generate.isPending}
              onClick={() => triggerExplain(Boolean(current))}
            >
              {generate.isPending
                ? "Generating…"
                : current
                  ? "Regenerate explanation"
                  : "Request explanation"}
            </Button>
          </div>
        </div>
      </div>

      {generate.isError && (
        <ErrorState error={generate.error} onRetry={() => triggerExplain(Boolean(current))} />
      )}

      {current ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 border-b pb-2.5">
            {current.providerMode && <Badge variant="outline">{current.providerMode}</Badge>}
            {current.aiModelName && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                {current.aiModelName}
              </Badge>
            )}
            {current.explanationScope && (
              <Badge variant="outline" className="text-[11px]">
                Scope: {current.explanationScope}
              </Badge>
            )}
            {current.cached && (
              <Badge variant="outline" className="text-[11px]">
                Cached
              </Badge>
            )}
            {current.sample && <Badge variant="outline">Sample text · no AI service called</Badge>}
          </div>

          {current.epistemicBadge && (
            <p className="text-xs font-medium text-muted-foreground">{current.epistemicBadge}</p>
          )}

          {current.userQuestion && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <span className="font-semibold text-primary">Question: </span>
              <span className="text-foreground">{current.userQuestion}</span>
            </div>
          )}

          {renderFormattedExplanation(current.text)}

          {current.structuredContent && (
            <div className="grid gap-2.5 pt-2 sm:grid-cols-2">
              {current.structuredContent.whyItMatters && (
                <div className="rounded-md border bg-muted/20 p-2.5 text-xs">
                  <p className="font-semibold text-foreground">Why it matters</p>
                  <p className="mt-1 text-muted-foreground">
                    {current.structuredContent.whyItMatters}
                  </p>
                </div>
              )}
              {current.structuredContent.evidenceSufficiency && (
                <div className="rounded-md border bg-muted/20 p-2.5 text-xs">
                  <p className="font-semibold text-foreground">Evidence sufficiency</p>
                  <p className="mt-1 text-muted-foreground">
                    {current.structuredContent.evidenceSufficiency}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-foreground">
              Cited Evidence ({resolvedCitedEvidences.length})
            </p>
            {resolvedCitedEvidences.length > 0 ? (
              <div className="space-y-2">
                {resolvedCitedEvidences.map((ev) => (
                  <div key={ev.id} className="rounded-md border bg-muted/20 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {ev.sourceType}
                      </Badge>
                      <span className="break-all font-mono text-[11px] text-muted-foreground">
                        {ev.location ? shortLocator(ev.location) : ev.id}
                      </span>
                    </div>
                    {ev.snippet && (
                      <pre className="mt-1.5 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
                        <code>{ev.snippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="break-all text-xs text-muted-foreground">
                Evidence: {current.evidenceIds.join(", ") || "No attached evidence"}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select an element and request an explanation grounded in its evidence.
        </p>
      )}
    </DetailPanel>
  );
}

