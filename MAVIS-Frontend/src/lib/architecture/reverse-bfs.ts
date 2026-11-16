import { projectGraphModel } from "@/features/architecture/graph-projection";
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

export interface UnaffectedElementEntry {
  elementId: string;
  name: string;
  elementType: string;
  isolated: boolean;
}

export interface ComputedArchitectureImpact {
  targetId: string;
  targetName: string;
  targetType: string;
  upstreamImpacted: ImpactPathEntry[];
  downstreamDependencies: ImpactPathEntry[];
  unaffectedElements: UnaffectedElementEntry[];
  directImpactCount: number;
  indirectImpactCount: number;
  downstreamCount: number;
  blastRadiusCount: number;
  cyclesDetected: boolean;
  cycleNodeIds: string[];
  cycleNodeNames: string[];
  isolatedCount: number;
  candidateTargets: Array<{ id: string; name: string; elementType: string }>;
}

interface AdjStep {
  neighborId: string;
  protocol: string;
  origin: string;
}

function runImpactBfs(
  startId: string,
  adj: Map<string, AdjStep[]>,
  byId: Map<string, ArchitecturalModel["elements"][number]>,
  allById: Map<string, ArchitecturalModel["elements"][number]>,
  reverseOrder: boolean,
): { entries: ImpactPathEntry[]; visited: Set<string> } {
  const entries: ImpactPathEntry[] = [];
  const visited = new Set<string>([startId]);
  const queue: Array<{
    currentId: string;
    hopIds: string[];
    protocols: string[];
    origins: string[];
  }> = [{ currentId: startId, hopIds: [startId], protocols: [], origins: [] }];

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const neighbors = (adj.get(current.currentId) ?? [])
      .slice()
      .sort((a, b) =>
        (byId.get(a.neighborId)?.name ?? "").localeCompare(byId.get(b.neighborId)?.name ?? ""),
      );

    for (const step of neighbors) {
      if (visited.has(step.neighborId)) continue;
      visited.add(step.neighborId);
      const el = byId.get(step.neighborId)!;
      const nextHopIds = reverseOrder
        ? [step.neighborId, ...current.hopIds]
        : [...current.hopIds, step.neighborId];
      const nextProtocols = reverseOrder
        ? [step.protocol, ...current.protocols]
        : [...current.protocols, step.protocol];
      const nextOrigins = reverseOrder
        ? [step.origin, ...current.origins]
        : [...current.origins, step.origin];

      entries.push({
        elementId: step.neighborId,
        name: el.name,
        elementType: el.elementType ?? "SERVICE_CONTAINER",
        distance: nextHopIds.length - 1,
        hops: nextHopIds.map((id) => byId.get(id)?.name ?? allById.get(id)?.name ?? id),
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });

      queue.push({
        currentId: step.neighborId,
        hopIds: nextHopIds,
        protocols: nextProtocols,
        origins: nextOrigins,
      });
    }
  }

  return { entries, visited };
}

/**
 * Iterative three-color DFS over the upstream subgraph reachable from startId
 * to detect directed dependency cycles without false positives on DAG diamonds.
 */
function detectUpstreamCycles(
  startId: string,
  adj: Map<string, AdjStep[]>,
): { cyclesDetected: boolean; cycleNodeIds: string[] } {
  const color = new Map<string, 0 | 1 | 2>();
  const cycleNodeSet = new Set<string>();
  const stack: Array<{ id: string; neighbors: AdjStep[]; index: number }> = [
    { id: startId, neighbors: adj.get(startId) ?? [], index: 0 },
  ];
  color.set(startId, 1);

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    if (top.index >= top.neighbors.length) {
      color.set(top.id, 2);
      stack.pop();
      continue;
    }

    const step = top.neighbors[top.index++]!;
    const neighborColor = color.get(step.neighborId) ?? 0;
    if (neighborColor === 1) {
      const startIdx = stack.findIndex((frame) => frame.id === step.neighborId);
      if (startIdx >= 0) {
        for (let idx = startIdx; idx < stack.length; idx++) {
          cycleNodeSet.add(stack[idx]!.id);
        }
      }
    } else if (neighborColor === 0) {
      color.set(step.neighborId, 1);
      stack.push({
        id: step.neighborId,
        neighbors: adj.get(step.neighborId) ?? [],
        index: 0,
      });
    }
  }

  const cycleNodeIds = [...cycleNodeSet];
  return { cyclesDetected: cycleNodeIds.length > 0, cycleNodeIds };
}

/**
 * Computes cycle-safe upstream (Reverse BFS) and downstream (Forward BFS) architectural impact
 * plus unaffected/isolated element separation for a selected target element.
 */
export function computeArchitectureImpact(
  model: ArchitecturalModel,
  targetId: string,
  scope: ImpactScopeMode = "all",
  workerPaths: readonly (readonly string[])[] = [],
): ComputedArchitectureImpact {
  const rawTarget = model.elements.find((e) => e.id === targetId);
  const showComponents = scope === "components" || rawTarget?.elementType === "COMPONENT";
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

  // reverseAdj[X] = callers/dependents A where changing X impacts A
  // forwardAdj[X] = dependencies B where X relies on B
  const reverseAdj = new Map<string, AdjStep[]>();
  const forwardAdj = new Map<string, AdjStep[]>();

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
      addDirectedDependency(edge.to, edge.from, edge.protocol, origin);
    } else if (edge.protocol === "MESSAGE_PUBLISH" && toIsChannel) {
      addDirectedDependency(edge.from, edge.to, edge.protocol, origin);
      addDirectedDependency(edge.to, edge.from, edge.protocol, origin);
    } else {
      addDirectedDependency(edge.from, edge.to, edge.protocol, origin);
    }
  }

  const upstream = runImpactBfs(targetId, reverseAdj, byId, allById, true);
  const upstreamImpacted = upstream.entries;
  const visitedUpstream = upstream.visited;

  for (const rawPath of workerPaths) {
    if (!rawPath || rawPath.length < 2) continue;
    const resolvedNames = rawPath.map((h) => allById.get(h)?.name ?? h);
    const firstHop = rawPath[0]!;
    const matchedEl =
      projected.elements.find((e) => e.id === firstHop || e.name === firstHop) ??
      model.elements.find((e) => e.id === firstHop || e.name === firstHop);
    const elId = matchedEl?.id ?? firstHop;
    if (
      elId !== targetId &&
      !upstreamImpacted.some((u) => u.elementId === elId || u.name === resolvedNames[0])
    ) {
      visitedUpstream.add(elId);
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

  const downstream = runImpactBfs(targetId, forwardAdj, byId, allById, false);
  const downstreamDependencies = downstream.entries;

  const { cyclesDetected, cycleNodeIds } = detectUpstreamCycles(targetId, reverseAdj);
  const cycleNodeNames = cycleNodeIds.map((id) => byId.get(id)?.name ?? allById.get(id)?.name ?? id);

  const unaffectedElements: UnaffectedElementEntry[] = projected.elements
    .filter((el) => el.id !== targetId && !visitedUpstream.has(el.id))
    .map((el) => ({
      elementId: el.id,
      name: el.name,
      elementType: el.elementType ?? "SERVICE_CONTAINER",
      isolated: !(reverseAdj.has(el.id) || forwardAdj.has(el.id)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const candidateTargets = projected.elements
    .map((el) => ({
      id: el.id,
      name: el.name,
      elementType: el.elementType ?? "SERVICE_CONTAINER",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
    unaffectedElements,
    directImpactCount,
    indirectImpactCount,
    downstreamCount: downstreamDependencies.length,
    blastRadiusCount: blastRadiusIds.size,
    cyclesDetected,
    cycleNodeIds,
    cycleNodeNames,
    isolatedCount: unaffectedElements.filter((u) => u.isolated).length,
    candidateTargets,
  };
}
