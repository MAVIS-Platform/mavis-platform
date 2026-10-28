import type { ElementDefinition } from "cytoscape";
import type { ArchitecturalModel } from "@/types/domain";
import { networkPositions } from "./network-layout";
import type { NetworkConnection } from "./network-connections";
import { exploreAppearance } from "./explore-layout";

export function networkBadge(type?: string) {
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
    case "EXTERNAL_SYSTEM":
      return "[EXT]";
    default:
      return "[UNKNOWN]";
  }
}

export function networkColor(type?: string) {
  switch (type) {
    case "SERVICE_CONTAINER":
      return "#397ed7";
    case "DATABASE":
      return "#16815d";
    case "QUEUE_BROKER":
    case "MESSAGE_CHANNEL":
      return "#9455c9";
    case "EXTERNAL_SYSTEM":
      return "#b7791f";
    case "COMPONENT":
      return "#d65370";
    default:
      return "#94a3b8";
  }
}

// Renderer IDs are namespaced; source IDs remain unchanged for evidence and 3E.
export function networkElements(
  model: ArchitecturalModel,
  aspectRatio = 2,
  connections?: NetworkConnection[],
): ElementDefinition[] {
  const positions = networkPositions(model, aspectRatio);
  const appearance = exploreAppearance(model);
  const nodes = new Map(model.elements.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  for (const edge of model.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const rankedDegrees = [...degree.values()].sort((a, b) => b - a);
  const hubThreshold = Math.max(2, rankedDegrees[Math.min(5, rankedDegrees.length - 1)] ?? 2);
  return [
    ...model.elements.map((node) => ({
      group: "nodes" as const,
      classes: (degree.get(node.id) ?? 0) >= hubThreshold ? "hub" : "",
      position: positions.get(node.id)!,
      data: {
        id: `node:${node.id}`,
        sourceId: node.id,
        label: `${networkBadge(node.elementType)} ${node.name}`,
        name: node.name,
        color: networkColor(node.elementType),
        exploreColor: appearance.get(node.id)!.color,
        glowImage: appearance.get(node.id)!.image,
        size: Math.min(46, 18 + Math.sqrt(degree.get(node.id) ?? 0) * 5.2),
        exploreSize: Math.min(150, 28 + Math.sqrt(degree.get(node.id) ?? 0) * 32),
        haloSize: Math.min(22, 3 + (degree.get(node.id) ?? 0) * 1.4),
        elementType: node.elementType,
      },
    })),
    ...(connections
      ? connections.map((connection) => ({
          group: "edges" as const,
          data: {
            id: connection.key,
            connectionKey: connection.key,
            sourceId: connection.key,
            source: `node:${connection.elementIds[0]}`,
            target: `node:${connection.elementIds[1]}`,
            label: `${connection.relationshipIds.length} recorded relationship(s)`,
            color: networkColor(nodes.get(connection.elementIds[0])?.elementType),
            exploreColor: appearance.get(connection.elementIds[0])!.color,
            lineStyle: "solid",
            underlyingEdgeIds: connection.relationshipIds,
            projectedEdgeIds: connection.projectedEdgeIds,
          },
        }))
      : model.edges
          .filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
          .map((edge) => ({
            group: "edges" as const,
            data: {
              id: `edge:${edge.id}`,
              sourceId: edge.id,
              source: `node:${edge.from}`,
              target: `node:${edge.to}`,
              label: edge.protocol,
              color: networkColor(nodes.get(edge.from)?.elementType),
              exploreColor: appearance.get(edge.from)!.color,
              lineStyle: edge.uncertain
                ? "dotted"
                : edge.protocol === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT"
                  ? "dashed"
                  : "solid",
              underlyingEdgeIds: edge.underlyingEdgeIds ?? [edge.id],
            },
          }))),
  ];
}

export function networkFocus(
  source: ArchitecturalModel,
  view: ArchitecturalModel,
  selectedId: string | null,
  highlightIds: readonly string[],
) {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const visible = new Set(view.elements.map((node) => node.id));
  const parents = new Map(source.elements.map((node) => [node.id, node.parentId]));
  function representative(id: string) {
    const seen = new Set<string>();
    while (!visible.has(id) && !seen.has(id)) {
      seen.add(id);
      const parent = parents.get(id);
      if (!parent) return;
      id = parent;
    }
    if (visible.has(id)) nodes.add(id);
  }
  const ids = new Set(highlightIds.length ? highlightIds : selectedId ? [selectedId] : []);
  for (const id of ids) representative(id);
  for (const edge of view.edges) {
    const selectedEdge = ids.has(edge.id) || edge.underlyingEdgeIds?.some((id) => ids.has(id));
    const adjacent = !highlightIds.length && (edge.from === selectedId || edge.to === selectedId);
    if (selectedEdge || adjacent) {
      edges.add(edge.id);
      nodes.add(edge.from);
      nodes.add(edge.to);
    }
  }
  return { nodes, edges, active: ids.size > 0 };
}
