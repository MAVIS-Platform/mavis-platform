"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { DetailPanel, SummaryCard } from "@/components/shared/data";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectSelector } from "@/features/projects/components";
import { ElementDetailsPanel, ModelVersionSelector } from "@/features/architecture/components";
import { projectGraphModel } from "@/features/architecture/graph-projection";
import {
  SearchableThreeESelect,
  type ThreeESelectOption,
} from "@/features/architecture/three-e-searchable-select";
import { useModel } from "@/features/architecture/use-model";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";

export type ImpactScopeMode = "all" | "source" | "components" | "strict";

export interface ImpactPathEntry {
  elementId: string;
  name: string;
  elementType: string;
  distance: number;
  hops: string[];
  hopIds: string[];
  protocols: string[];
  origins: string[];
}

export interface ComputedArchitectureImpact {
  targetId: string;
  targetName: string;
  targetType: string;
  upstreamImpacted: ImpactPathEntry[];
  downstreamDependencies: ImpactPathEntry[];
  directImpactCount: number;
  indirectImpactCount: number;
  downstreamCount: number;
  blastRadiusCount: number;
}

const TYPE_BADGE: Record<string, string> = {
  SERVICE_CONTAINER: "SVC",
  DATABASE: "DB",
  QUEUE_BROKER: "QUEUE",
  MESSAGE_CHANNEL: "CHANNEL",
  EXTERNAL_SYSTEM: "EXT",
  COMPONENT: "COMP",
  CLASS_INTERFACE: "CLASS",
};

const SCOPE_OPTIONS: ReadonlyArray<{ value: ImpactScopeMode; label: string }> = [
  { value: "all", label: "Full Architecture (Source + Messaging + Deployment)" },
  { value: "source", label: "Application & Data Only (Excludes Compose)" },
  { value: "components", label: "Component Granularity (Include Internal Components)" },
  { value: "strict", label: "Strict Confirmed HTTP Policy (Worker Only)" },
];

export function computeArchitectureImpact(
  model: ArchitecturalModel,
  targetId: string,
  scope: ImpactScopeMode = "all",
  workerPaths: readonly (readonly string[])[] = [],
): ComputedArchitectureImpact {
  const rawTarget = model.elements.find((e) => e.id === targetId);
  const showComponents =
    scope === "components" || rawTarget?.elementType === "COMPONENT";
  const originFilter = scope === "source" ? "source" : "all";

  const projected =
    scope === "strict"
      ? {
          elements: model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER"),
          edges: model.edges.filter((e) => e.protocol === "SERVICE_HTTP_CALL"),
        }
      : projectGraphModel(model, showComponents, originFilter).model;

  const byId = new Map(projected.elements.map((e) => [e.id, e]));
  const allById = new Map(model.elements.map((e) => [e.id, e]));
  const targetNode = byId.get(targetId) ?? allById.get(targetId);
  const targetName = targetNode?.name ?? targetId;
  const targetType = targetNode?.elementType ?? "SERVICE_CONTAINER";

  // Build adjacency lists:
  // reverseAdj[X] = list of { neighbor: A, protocol, origin } where A depends on X (so changing X impacts A)
  // forwardAdj[X] = list of { neighbor: B, protocol, origin } where X depends on B (so X relies on B)
  const reverseAdj = new Map<
    string,
    Array<{ neighborId: string; protocol: string; origin: string }>
  >();
  const forwardAdj = new Map<
    string,
    Array<{ neighborId: string; protocol: string; origin: string }>
  >();

  const addDirectedDependency = (
    dependentId: string,
    dependencyId: string,
    protocol: string,
    origin: string,
  ) => {
    if (!dependentId || !dependencyId || dependentId === dependencyId) return;
    if (!byId.has(dependentId) || !byId.has(dependencyId)) return;

    const revList = reverseAdj.get(dependencyId) ?? [];
    if (!revList.some((r) => r.neighborId === dependentId && r.protocol === protocol)) {
      revList.push({ neighborId: dependentId, protocol, origin });
      reverseAdj.set(dependencyId, revList);
    }

    const fwdList = forwardAdj.get(dependentId) ?? [];
    if (!fwdList.some((f) => f.neighborId === dependencyId && f.protocol === protocol)) {
      fwdList.push({ neighborId: dependencyId, protocol, origin });
      forwardAdj.set(dependentId, fwdList);
    }
  };

  for (const edge of projected.edges) {
    const origin = edge.originLayer ?? "STATIC";
    const fromEl = byId.get(edge.from);
    const toEl = byId.get(edge.to);
    if (!fromEl || !toEl) continue;

    const fromIsChannel =
      fromEl.elementType === "MESSAGE_CHANNEL" || fromEl.elementType === "QUEUE_BROKER";
    const toIsChannel =
      toEl.elementType === "MESSAGE_CHANNEL" || toEl.elementType === "QUEUE_BROKER";

    if (edge.protocol === "MESSAGE_SUBSCRIBE" && fromIsChannel) {
      // Channel -> Subscriber: Subscriber (edge.to) depends on Channel (edge.from)
      addDirectedDependency(edge.to, edge.from, edge.protocol, origin);
    } else if (edge.protocol === "MESSAGE_PUBLISH" && toIsChannel) {
      // Publisher -> Channel: Publisher depends on Channel infrastructure, AND Channel contract depends on Publisher
      addDirectedDependency(edge.from, edge.to, edge.protocol, origin);
      addDirectedDependency(edge.to, edge.from, edge.protocol, origin);
    } else {
      // Standard dependency: edge.from (caller) depends on edge.to (callee)
      addDirectedDependency(edge.from, edge.to, edge.protocol, origin);
    }
  }

  // 1. BFS for Upstream Impact (Who breaks if targetId changes?)
  const upstreamImpacted: ImpactPathEntry[] = [];
  const visitedUpstream = new Set<string>([targetId]);
  const upQueue: Array<{
    currentId: string;
    hopIds: string[];
    protocols: string[];
    origins: string[];
  }> = [{ currentId: targetId, hopIds: [targetId], protocols: [], origins: [] }];

  while (upQueue.length > 0) {
    const current = upQueue.shift()!;
    if (current.hopIds.length > 8) continue;
    const neighbors = (reverseAdj.get(current.currentId) ?? [])
      .slice()
      .sort((a, b) => (byId.get(a.neighborId)?.name ?? "").localeCompare(byId.get(b.neighborId)?.name ?? ""));

    for (const step of neighbors) {
      if (visitedUpstream.has(step.neighborId)) continue;
      visitedUpstream.add(step.neighborId);
      const el = byId.get(step.neighborId)!;
      // Path ordered from Affected Caller -> ... -> Target
      const nextHopIds = [step.neighborId, ...current.hopIds];
      const nextProtocols = [step.protocol, ...current.protocols];
      const nextOrigins = [step.origin, ...current.origins];
      upstreamImpacted.push({
        elementId: step.neighborId,
        name: el.name,
        elementType: el.elementType ?? "SERVICE_CONTAINER",
        distance: nextHopIds.length - 1,
        hops: nextHopIds.map((id) => byId.get(id)?.name ?? allById.get(id)?.name ?? id),
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });
      upQueue.push({
        currentId: step.neighborId,
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });
    }
  }

  // Merge any additional worker-reported paths not already present
  for (const rawPath of workerPaths) {
    if (!rawPath || rawPath.length < 2) continue;
    const resolvedNames = rawPath.map((h) => allById.get(h)?.name ?? h);
    const firstHop = rawPath[0]!;
    const matchedEl =
      projected.elements.find((e) => e.id === firstHop || e.name === firstHop) ??
      model.elements.find((e) => e.id === firstHop || e.name === firstHop);
    const elId = matchedEl?.id ?? firstHop;
    if (elId !== targetId && !upstreamImpacted.some((u) => u.elementId === elId || u.name === resolvedNames[0])) {
      upstreamImpacted.push({
        elementId: elId,
        name: matchedEl?.name ?? resolvedNames[0]!,
        elementType: matchedEl?.elementType ?? "SERVICE_CONTAINER",
        distance: rawPath.length - 1,
        hops: resolvedNames,
        hopIds: [...rawPath],
        protocols: ["SERVICE_HTTP_CALL"],
        origins: ["STATIC"],
      });
    }
  }

  // 2. BFS for Downstream Dependencies (What does targetId rely on?)
  const downstreamDependencies: ImpactPathEntry[] = [];
  const visitedDownstream = new Set<string>([targetId]);
  const downQueue: Array<{
    currentId: string;
    hopIds: string[];
    protocols: string[];
    origins: string[];
  }> = [{ currentId: targetId, hopIds: [targetId], protocols: [], origins: [] }];

  while (downQueue.length > 0) {
    const current = downQueue.shift()!;
    if (current.hopIds.length > 8) continue;
    const neighbors = (forwardAdj.get(current.currentId) ?? [])
      .slice()
      .sort((a, b) => (byId.get(a.neighborId)?.name ?? "").localeCompare(byId.get(b.neighborId)?.name ?? ""));

    for (const step of neighbors) {
      if (visitedDownstream.has(step.neighborId)) continue;
      visitedDownstream.add(step.neighborId);
      const el = byId.get(step.neighborId)!;
      // Path ordered from Target -> ... -> Dependency
      const nextHopIds = [...current.hopIds, step.neighborId];
      const nextProtocols = [...current.protocols, step.protocol];
      const nextOrigins = [...current.origins, step.origin];
      downstreamDependencies.push({
        elementId: step.neighborId,
        name: el.name,
        elementType: el.elementType ?? "SERVICE_CONTAINER",
        distance: nextHopIds.length - 1,
        hops: nextHopIds.map((id) => byId.get(id)?.name ?? allById.get(id)?.name ?? id),
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });
      downQueue.push({
        currentId: step.neighborId,
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });
    }
  }

  const directImpactCount = upstreamImpacted.filter((u) => u.distance === 1).length;
  const indirectImpactCount = upstreamImpacted.filter((u) => u.distance > 1).length;
  const blastRadiusIds = new Set<string>([
    ...upstreamImpacted.map((u) => u.elementId),
    ...downstreamDependencies.map((d) => d.elementId),
  ]);

  return {
    targetId,
    targetName,
    targetType,
    upstreamImpacted,
    downstreamDependencies,
    directImpactCount,
    indirectImpactCount,
    downstreamCount: downstreamDependencies.length,
    blastRadiusCount: blastRadiusIds.size,
  };
}

export default function ImpactPage() {
  return (
    <AppShell>
      <ImpactWorkspace />
    </AppShell>
  );
}

function ImpactWorkspace() {
  const state = useModel();
  return (
    <PageContainer>
      <SectionHeader
        title="Change Impact Analysis"
        actions={
          state.projectId && state.model ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/diagrams?project=${state.projectId}&model=${state.model.id}`}>
                  Architecture Diagrams
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/architecture?project=${state.projectId}&model=${state.model.id}`}>
                  Graph Explorer
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="space-y-5">
        <div className="grid gap-3 rounded-xl border bg-card p-3.5 sm:grid-cols-2">
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
            {state.model && <ImpactResults key={state.model.id} model={state.model} />}
          </RequestState>
        )}
      </div>
    </PageContainer>
  );
}

function ImpactResults({ model }: { model: ArchitecturalModel }) {
  const api = useApi();
  const [scope, setScope] = useState<ImpactScopeMode>("all");

  // Prioritize elements that participate in edges so the default selection immediately shows meaningful paths
  const candidateElements = useMemo(() => {
    const projected = projectGraphModel(model, scope === "components", "all").model;
    const degreeMap = new Map<string, { incoming: number; outgoing: number }>();
    for (const el of projected.elements) {
      degreeMap.set(el.id, { incoming: 0, outgoing: 0 });
    }
    for (const edge of projected.edges) {
      const f = degreeMap.get(edge.from);
      if (f) f.outgoing++;
      const t = degreeMap.get(edge.to);
      if (t) t.incoming++;
    }
    return projected.elements
      .slice()
      .sort((a, b) => {
        const da = degreeMap.get(a.id) ?? { incoming: 0, outgoing: 0 };
        const db = degreeMap.get(b.id) ?? { incoming: 0, outgoing: 0 };
        // Sort by incoming dependents first, then total degree, then name
        if (db.incoming !== da.incoming) return db.incoming - da.incoming;
        const totalA = da.incoming + da.outgoing;
        const totalB = db.incoming + db.outgoing;
        if (totalB !== totalA) return totalB - totalA;
        return a.name.localeCompare(b.name);
      })
      .map((el) => {
        const deg = degreeMap.get(el.id) ?? { incoming: 0, outgoing: 0 };
        return { element: el, incoming: deg.incoming, outgoing: deg.outgoing };
      });
  }, [model, scope]);

  const defaultTargetId =
    candidateElements.find((c) => c.incoming > 0)?.element.id ??
    candidateElements[0]?.element.id ??
    model.elements[0]?.id ??
    "";

  const [targetId, setTargetId] = useState(defaultTargetId);
  const activeTargetId = candidateElements.some((c) => c.element.id === targetId)
    ? targetId
    : defaultTargetId;
  const [inspectedId, setInspectedId] = useState<string | null>(activeTargetId);

  const activeTargetElement = model.elements.find((e) => e.id === activeTargetId);
  const canQueryWorkerImpact =
    Boolean(activeTargetId) &&
    (api.mode === "mock" || activeTargetElement?.elementType === "SERVICE_CONTAINER");

  const workerQuery = useApiQuery(
    "impact",
    { modelId: model.id, targetId: activeTargetId },
    { enabled: canQueryWorkerImpact },
  );

  const impact = useMemo(
    () =>
      computeArchitectureImpact(
        model,
        activeTargetId,
        scope,
        workerQuery.data?.paths ?? [],
      ),
    [model, activeTargetId, scope, workerQuery.data?.paths],
  );

  const targetOptions = useMemo<ThreeESelectOption[]>(
    () =>
      candidateElements.map(({ element, incoming, outgoing }) => ({
        value: element.id,
        label: element.name,
        badge: TYPE_BADGE[element.elementType ?? ""] ?? element.elementType ?? "NODE",
        sublabel: `${incoming} dependent${incoming === 1 ? "" : "s"} · ${outgoing} dependenc${outgoing === 1 ? "y" : "ies"}`,
      })),
    [candidateElements],
  );

  function handleSelectTarget(nextId: string) {
    setTargetId(nextId);
    setInspectedId(nextId);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-card p-3.5 lg:grid-cols-2">
        <SearchableThreeESelect
          label="Target element to analyze"
          selectedValue={activeTargetId}
          onSelect={handleSelectTarget}
          options={targetOptions}
        />
        <SelectField
          label="Analysis scope"
          value={scope}
          onChange={(v) => setScope(v as ImpactScopeMode)}
          options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Direct impact (1 hop)" value={impact.directImpactCount} />
        <SummaryCard label="Indirect impact (2+ hops)" value={impact.indirectImpactCount} />
        <SummaryCard label="Downstream dependencies" value={impact.downstreamCount} />
        <SummaryCard label="Total blast radius" value={impact.blastRadiusCount} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <DetailPanel
            title={`Impacted if ${impact.targetName} changes (${impact.upstreamImpacted.length})`}
          >
            {impact.upstreamImpacted.length > 0 ? (
              <div className="divide-y rounded-lg border bg-background/40">
                {impact.upstreamImpacted.map((entry) => (
                  <div
                    key={entry.elementId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={entry.distance === 1 ? "warning" : "secondary"}>
                          {entry.distance === 1
                            ? "Direct · 1 hop"
                            : `Indirect · ${entry.distance} hops`}
                        </Badge>
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {TYPE_BADGE[entry.elementType] ?? entry.elementType}
                        </span>
                        <span className="font-mono text-sm font-semibold">{entry.name}</span>
                        {Array.from(new Set(entry.protocols)).map((proto) => (
                          <Badge key={proto} variant="outline" className="font-mono text-[10px]">
                            {proto}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
                        {entry.hops.map((hopName, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1">
                            <span
                              className={
                                idx === 0 || idx === entry.hops.length - 1
                                  ? "font-medium text-foreground"
                                  : ""
                              }
                            >
                              {hopName}
                            </span>
                            {idx < entry.hops.length - 1 && (
                              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setInspectedId(entry.elementId)}
                      >
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleSelectTarget(entry.elementId)}
                      >
                        Set as target
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                No upstream elements depend on{" "}
                <strong className="font-mono text-foreground">{impact.targetName}</strong> under the
                selected scope.{" "}
                {impact.downstreamCount > 0 && (
                  <span>
                    However, <strong className="font-mono text-foreground">{impact.targetName}</strong>{" "}
                    depends on <strong>{impact.downstreamCount}</strong> downstream element(s) listed
                    below.
                  </span>
                )}
              </div>
            )}
          </DetailPanel>

          <DetailPanel
            title={`Downstream dependencies of ${impact.targetName} (${impact.downstreamDependencies.length})`}
          >
            {impact.downstreamDependencies.length > 0 ? (
              <div className="divide-y rounded-lg border bg-background/40">
                {impact.downstreamDependencies.map((entry) => (
                  <div
                    key={entry.elementId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={entry.distance === 1 ? "source" : "secondary"}>
                          {entry.distance === 1
                            ? "Direct · 1 hop"
                            : `Transitive · ${entry.distance} hops`}
                        </Badge>
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {TYPE_BADGE[entry.elementType] ?? entry.elementType}
                        </span>
                        <span className="font-mono text-sm font-semibold">{entry.name}</span>
                        {Array.from(new Set(entry.protocols)).map((proto) => (
                          <Badge key={proto} variant="outline" className="font-mono text-[10px]">
                            {proto}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
                        {entry.hops.map((hopName, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1">
                            <span
                              className={
                                idx === 0 || idx === entry.hops.length - 1
                                  ? "font-medium text-foreground"
                                  : ""
                              }
                            >
                              {hopName}
                            </span>
                            {idx < entry.hops.length - 1 && (
                              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setInspectedId(entry.elementId)}
                      >
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleSelectTarget(entry.elementId)}
                      >
                        Analyze impact →
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                <strong className="font-mono text-foreground">{impact.targetName}</strong> has no
                outgoing dependencies in the selected scope (leaf / infrastructure node).
              </p>
            )}
          </DetailPanel>
        </div>

        <div className="xl:col-span-1">
          <ElementDetailsPanel
            model={model}
            selectedId={inspectedId ?? activeTargetId}
            onSelect={setInspectedId}
          />
        </div>
      </div>
    </div>
  );
}

