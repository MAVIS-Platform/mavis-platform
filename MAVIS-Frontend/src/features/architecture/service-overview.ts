import type { ArchitecturalModel, ArchitectureElement } from "@/types/domain";

export type GraphOrigin = "all" | "source" | "deployment" | "runtime";
export type OverviewFilters = {
  origin: GraphOrigin;
  protocol: string;
  uncertainty: "all" | "uncertain" | "not-flagged";
};
export const defaultOverviewFilters: OverviewFilters = {
  origin: "all",
  protocol: "all",
  uncertainty: "all",
};
type Relationship = ArchitecturalModel["edges"][number];
export type ServiceRelationship = {
  id: string;
  fromServiceId: string;
  toServiceId: string;
  edge: Relationship;
  metadataAvailable: boolean;
};
export type ServiceConnection = {
  key: string;
  serviceIds: [string, string];
  relationships: ServiceRelationship[];
  relationshipIds: string[];
  evidenceIds: string[];
  evidenceCount: number | null;
};
const resourceTypes = new Set(["DATABASE", "MESSAGE_CHANNEL", "QUEUE_BROKER", "EXTERNAL_SYSTEM"]);

export function serviceOwners(model: ArchitecturalModel): Map<string, string | null> {
  const byId = new Map(model.elements.map((node) => [node.id, node]));
  const owners = new Map<string, string | null>();
  for (const node of model.elements) {
    let current = node;
    const seen = new Set<string>();
    let owner: string | null = null;
    while (!seen.has(current.id)) {
      seen.add(current.id);
      if (current.elementType === "SERVICE_CONTAINER") {
        owner = current.id;
        break;
      }
      if (resourceTypes.has(current.elementType ?? "") || !current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    owners.set(node.id, owner);
  }
  return owners;
}

export function includesGraphOrigin(edge: Relationship, origin: GraphOrigin): boolean {
  const deployment = edge.originLayer === "DEPLOYMENT" || edge.protocol === "DECLARED_COMPOSE";
  const runtime = edge.originLayer === "RUNTIME" || edge.originLayer === "STATIC_AND_RUNTIME";
  return (
    origin === "all" ||
    (origin === "deployment" && deployment) ||
    (origin === "runtime" && runtime) ||
    (origin === "source" &&
      !deployment &&
      ["STATIC", "SOURCE", "CONFIGURATION", "STATIC_AND_RUNTIME"].includes(edge.originLayer ?? ""))
  );
}

function summarizeEvidence(rows: ServiceRelationship[]) {
  const facts = [...new Map(rows.map((row) => [row.edge.id, row.edge])).values()];
  const ids = new Set<string>();
  let complete = true;
  for (const edge of facts) {
    for (const id of edge.evidenceIds ?? []) ids.add(id);
    if (
      edge.evidenceCount == null ||
      (edge.evidenceIds
        ? new Set(edge.evidenceIds).size !== edge.evidenceCount
        : edge.evidenceCount !== 0)
    )
      complete = false;
  }
  return { evidenceIds: [...ids].sort(), evidenceCount: complete ? ids.size : null };
}

// UI groups have their own keys. They are never canonical relationship IDs.
export function projectServiceOverview(
  model: ArchitecturalModel,
  filters: OverviewFilters = defaultOverviewFilters,
) {
  const owners = serviceOwners(model);
  const services = model.elements
    .filter((node) => node.elementType === "SERVICE_CONTAINER")
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(model.edges.map((edge) => [edge.id, edge]));
  const seen = new Set<string>();
  const pairs = new Map<string, ServiceConnection>();
  const protocols = new Set<string>();
  let filteredRelationships = 0,
    internalRelationships = 0,
    nonServiceRelationships = 0;
  for (const input of model.edges) {
    const ids = input.underlyingEdgeIds?.length ? input.underlyingEdgeIds : [input.id];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const canonical = byId.get(id);
      const edge = canonical ?? input;
      const from = owners.get(edge.from),
        to = owners.get(edge.to);
      if (!from || !to) {
        nonServiceRelationships++;
        continue;
      }
      if (from === to) {
        internalRelationships++;
        continue;
      }
      protocols.add(edge.protocol);
      if (
        !includesGraphOrigin(edge, filters.origin) ||
        (filters.protocol !== "all" && edge.protocol !== filters.protocol) ||
        (filters.uncertainty === "uncertain" && !edge.uncertain) ||
        (filters.uncertainty === "not-flagged" && edge.uncertain)
      ) {
        filteredRelationships++;
        continue;
      }
      const serviceIds: [string, string] = from < to ? [from, to] : [to, from];
      const key = JSON.stringify(["service-connection", model.id, ...serviceIds]);
      let connection = pairs.get(key);
      if (!connection) {
        connection = {
          key,
          serviceIds,
          relationships: [],
          relationshipIds: [],
          evidenceIds: [],
          evidenceCount: null,
        };
        pairs.set(key, connection);
      }
      connection.relationships.push({
        id,
        fromServiceId: from,
        toServiceId: to,
        edge,
        metadataAvailable:
          Boolean(canonical) &&
          !(canonical?.underlyingEdgeIds && canonical.underlyingEdgeIds.length > 1),
      });
    }
  }
  const connections = [...pairs.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((connection) => ({
      ...connection,
      relationships: connection.relationships.sort((a, b) => a.id.localeCompare(b.id)),
      relationshipIds: connection.relationships.map((row) => row.id).sort(),
      ...summarizeEvidence(connection.relationships),
    }));
  return {
    modelId: model.id,
    services,
    connections,
    owners,
    protocols: [...protocols].sort(),
    relationshipCount: connections.reduce(
      (sum, connection) => sum + connection.relationshipIds.length,
      0,
    ),
    filteredRelationships,
    internalRelationships,
    nonServiceRelationships,
    hiddenInternals: model.elements.filter(
      (node) => node.elementType !== "SERVICE_CONTAINER" && owners.get(node.id),
    ).length,
    hiddenResources: model.elements.filter((node) => resourceTypes.has(node.elementType ?? ""))
      .length,
    unassignedElements: model.elements.filter(
      (node) =>
        node.elementType !== "SERVICE_CONTAINER" &&
        !resourceTypes.has(node.elementType ?? "") &&
        !owners.get(node.id),
    ).length,
  };
}
export type ServiceOverviewProjection = ReturnType<typeof projectServiceOverview>;

export function overviewFocus(
  projection: ServiceOverviewProjection,
  selectedId: string | null,
  connectionKey: string | null,
  highlightIds: readonly string[] = [],
) {
  const nodes = new Set<string>(),
    connections = new Set<string>();
  const ids = new Set(highlightIds.length ? highlightIds : selectedId ? [selectedId] : []);
  const selectedServices = new Set<string>();
  for (const id of ids) {
    const owner = projection.owners.get(id);
    if (owner) {
      nodes.add(owner);
      selectedServices.add(owner);
    }
  }
  for (const connection of projection.connections) {
    if (
      connection.key === connectionKey ||
      connection.relationshipIds.some((id) => ids.has(id)) ||
      (!highlightIds.length && connection.serviceIds.some((id) => selectedServices.has(id)))
    ) {
      connections.add(connection.key);
      connection.serviceIds.forEach((id) => nodes.add(id));
    }
  }
  return { nodes, connections, active: Boolean(ids.size || connectionKey) };
}
export function overviewSelectionVisible(
  projection: ServiceOverviewProjection,
  id: string,
): boolean {
  return (
    Boolean(projection.owners.get(id)) ||
    projection.connections.some((connection) =>
      connection.relationships.some((row) => row.id === id && row.metadataAvailable),
    )
  );
}
export function serviceName(services: ArchitectureElement[], id: string) {
  const name = services.find((service) => service.id === id)?.name;
  if (!name) return id;
  return services.filter((service) => service.name === name).length > 1
    ? `${name} · ${id.slice(0, 8)}`
    : name;
}
