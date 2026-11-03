"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { explainUrlTarget } from "@/features/ai-explanations/target";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { SearchInput, SelectField } from "@/components/shared/forms";
import { Badge } from "@/components/ui/badge";
import { ProjectSelector } from "@/features/projects/components";
import { ElementDetailsPanel, ModelVersionSelector } from "@/features/architecture/components";
import { AIExplanationPanel } from "@/features/ai-explanations/components";
import { useModel } from "@/features/architecture/use-model";
import type { ArchitecturalModel } from "@/types/domain";

export default function ExplainPage() {
  return (
    <AppShell>
      <ExplainWorkspace />
    </AppShell>
  );
}

function ExplainWorkspace() {
  const state = useModel();
  return (
    <PageContainer>
      <SectionHeader
        title="AI Explanations"
        description="Explain any architecture element or relationship in an exact model revision using saved source/config evidence and 3E grounding."
      />
      <div data-tour="explain-selectors" className="grid gap-4 md:grid-cols-2">
        <ProjectSelector />
        {state.projectId && state.model && (
          <ModelVersionSelector
            models={state.models}
            value={state.model.id}
            onChange={state.selectModel}
          />
        )}
      </div>
      {state.projectId && (
        <RequestState query={state.query} empty={!state.models.length}>
          {state.model && <Explanation key={state.model.id} model={state.model} />}
        </RequestState>
      )}
    </PageContainer>
  );
}

function elementBadge(type?: string | null) {
  switch (type) {
    case "SERVICE_CONTAINER":
      return "[SVC]";
    case "DATABASE":
      return "[DB]";
    case "QUEUE_BROKER":
    case "MESSAGE_CHANNEL":
      return "[QUEUE]";
    case "COMPONENT":
      return "[COMP]";
    case "CLASS_INTERFACE":
      return "[CLS]";
    case "EXTERNAL_SYSTEM":
      return "[EXT]";
    default:
      return "[EL]";
  }
}

export function selectDefaultExplainTarget(model: ArchitecturalModel): string {
  const connCount = (id: string) => model.edges.filter((e) => e.from === id || e.to === id).length;
  const services = model.elements.filter(
    (e) =>
      e.elementType === "SERVICE_CONTAINER" &&
      !/zookeeper|dynamodb|mysql|postgres|kafka|redis|cdc/i.test(e.name),
  );
  const pool = services.length
    ? services
    : model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER");
  if (pool.length) {
    const sorted = [...pool].sort((a, b) => connCount(b.id) - connCount(a.id));
    return sorted[0]?.id ?? model.elements[0]?.id ?? "";
  }
  return model.elements[0]?.id ?? model.edges[0]?.id ?? "";
}

function Explanation({ model }: { model: ArchitecturalModel }) {
  const params = useSearchParams();
  const target = explainUrlTarget(model, params.get("target"), params.get("kind"));
  const [targetId, setTargetId] = useState(() => target?.id ?? selectDefaultExplainTarget(model));
  const [targetKind, setTargetKind] = useState<"elements" | "relationships">(
    target?.kind ?? "elements",
  );
  const urlTargetId = target?.id;
  const urlTargetKind = target?.kind;
  useEffect(() => {
    if (urlTargetId && urlTargetKind) {
      setTargetId(urlTargetId);
      setTargetKind(urlTargetKind);
    }
  }, [urlTargetId, urlTargetKind]);
  const [category, setCategory] = useState<
    "all" | "services" | "data" | "components" | "classifiers"
  >("all");
  const [search, setSearch] = useState("");

  const connCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of model.edges) {
      map.set(edge.from, (map.get(edge.from) ?? 0) + 1);
      map.set(edge.to, (map.get(edge.to) ?? 0) + 1);
    }
    return map;
  }, [model.edges]);

  const nameOf = (id: string) => model.elements.find((e) => e.id === id)?.name ?? id;

  const filteredElements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...model.elements]
      .filter((el) => {
        if (category === "services" && el.elementType !== "SERVICE_CONTAINER") return false;
        if (
          category === "data" &&
          !["DATABASE", "QUEUE_BROKER", "MESSAGE_CHANNEL", "EXTERNAL_SYSTEM"].includes(
            el.elementType ?? "",
          )
        )
          return false;
        if (category === "components" && el.elementType !== "COMPONENT") return false;
        if (category === "classifiers" && el.elementType !== "CLASS_INTERFACE") return false;
        if (!q) return true;
        return (
          el.name.toLowerCase().includes(q) ||
          (el.elementType ?? "").toLowerCase().includes(q) ||
          (el.technology ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (connCounts.get(b.id) ?? 0) - (connCounts.get(a.id) ?? 0));
  }, [model.elements, category, search, connCounts]);

  const filteredEdges = useMemo(() => {
    const q = search.trim().toLowerCase();
    return model.edges.filter((edge) => {
      if (!q) return true;
      const label = `${nameOf(edge.from)} ${nameOf(edge.to)} ${edge.protocol}`.toLowerCase();
      return label.includes(q);
    });
  }, [model.edges, search]);

  const topServices = useMemo(
    () =>
      [...model.elements]
        .filter((e) => e.elementType === "SERVICE_CONTAINER")
        .sort((a, b) => (connCounts.get(b.id) ?? 0) - (connCounts.get(a.id) ?? 0))
        .slice(0, 8),
    [model.elements, connCounts],
  );

  const handleSelectTarget = (id: string) => {
    const isEdge = !model.elements.some((e) => e.id === id) && model.edges.some((e) => e.id === id);
    if (isEdge) {
      setTargetKind("relationships");
    } else {
      setTargetKind("elements");
      setCategory("all");
    }
    setSearch("");
    setTargetId(id);
  };

  const options =
    targetKind === "elements"
      ? filteredElements.map((e) => ({
          value: e.id,
          label: `${elementBadge(e.elementType)} ${e.name}${e.technology ? ` · ${e.technology}` : ""} (${connCounts.get(e.id) ?? 0} conn)`,
        }))
      : filteredEdges.map((edge) => ({
          value: edge.id,
          label: `${nameOf(edge.from)} → ${nameOf(edge.to)} · ${edge.protocol}${edge.uncertain ? " [Uncertain]" : ""}`,
        }));

  return (
    <div data-tour="explain-workspace" className="mt-5 space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTargetKind("elements");
                const first = filteredElements[0]?.id ?? model.elements[0]?.id;
                if (first && !model.elements.some((e) => e.id === targetId)) setTargetId(first);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                targetKind === "elements"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              Architecture Elements ({model.elements.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetKind("relationships");
                const first = filteredEdges[0]?.id ?? model.edges[0]?.id;
                if (first && !model.edges.some((e) => e.id === targetId)) setTargetId(first);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                targetKind === "relationships"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              Relationships ({model.edges.length})
            </button>
          </div>

          {targetKind === "elements" && (
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ["all", "All"],
                  ["services", "Services [SVC]"],
                  ["data", "Data & Brokers [DB/QUEUE]"],
                  ["components", "Components [COMP]"],
                  ["classifiers", "UML Classifiers [CLS]"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    category === key
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SearchInput
            label={
              targetKind === "elements"
                ? "Filter elements by name or stack"
                : "Filter relationships"
            }
            value={search}
            onChange={(val) => {
              setSearch(val);
            }}
          />
          <SelectField
            label={targetKind === "elements" ? "Architecture element" : "Architecture relationship"}
            value={targetId}
            onChange={setTargetId}
            options={
              options.length
                ? options
                : [{ value: targetId, label: nameOf(targetId) || "No matching items" }]
            }
          />
        </div>

        {topServices.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-medium text-muted-foreground">Quick services:</span>
            {topServices.map((svc) => {
              const active = targetId === svc.id;
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => handleSelectTarget(svc.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                    active
                      ? "border-primary bg-primary/15 font-semibold text-primary"
                      : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span>{svc.name}</span>
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {connCounts.get(svc.id) ?? 0}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ElementDetailsPanel model={model} selectedId={targetId} onSelect={handleSelectTarget} />
        <AIExplanationPanel key={targetId} model={model} elementId={targetId} />
      </div>
    </div>
  );
}
