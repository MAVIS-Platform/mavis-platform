import type { ArchitecturalModel } from "@/types/domain";
import { summarizeEvidence } from "./service-overview";
export type NetworkConnection = {
  key: string;
  elementIds: [string, string];
  projectedEdgeIds: string[];
  relationshipIds: string[];
  relationships: {
    id: string;
    fromElementId: string;
    toElementId: string;
    edge: ArchitecturalModel["edges"][number];
    metadataAvailable: boolean;
  }[];
  evidenceIds: string[];
  evidenceCount: number | null;
};

// Group the existing Graph view, including resources and unclassified nodes.
// No service-only projection, ownership guessing or transitive edges are added.
export function networkConnections(
  source: ArchitecturalModel,
  view: ArchitecturalModel,
): NetworkConnection[] {
  const canonical = new Map(source.edges.map((edge) => [edge.id, edge]));
  const visible = new Set(view.elements.map((node) => node.id));
  const groups = new Map<string, NetworkConnection>();
  const seen = new Set<string>();
  for (const edge of view.edges) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
    const elementIds: [string, string] =
      edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
    const key = JSON.stringify(["network-connection", source.id, ...elementIds]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        elementIds,
        projectedEdgeIds: [],
        relationshipIds: [],
        relationships: [],
        evidenceIds: [],
        evidenceCount: null,
      };
      groups.set(key, group);
    }
    group.projectedEdgeIds.push(edge.id);
    for (const id of edge.underlyingEdgeIds?.length ? edge.underlyingEdgeIds : [edge.id]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const original = canonical.get(id);
      group.relationships.push({
        id,
        fromElementId: edge.from,
        toElementId: edge.to,
        edge: original ?? edge,
        metadataAvailable:
          Boolean(original) &&
          !(original?.underlyingEdgeIds && original.underlyingEdgeIds.length > 1),
      });
    }
  }
  return [...groups.values()]
    .filter((group) => group.relationships.length)
    .map((group) => ({
      ...group,
      projectedEdgeIds: [...new Set(group.projectedEdgeIds)],
      relationshipIds: group.relationships.map((row) => row.id),
      ...summarizeEvidence(group.relationships),
    }));
}
