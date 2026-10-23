import type { ArchitecturalModel } from "@/types/domain";
import type { DiagramDocument, DiagramNode } from "@/lib/drawio/rules";

type Edge = DiagramDocument["layoutJson"]["edges"][number];
const deployed = (edge: Edge) =>
  edge.type === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT";
const interaction = (edge: Edge) =>
  !deployed(edge) &&
  [
    "SERVICE_HTTP_CALL",
    "DATABASE_ACCESS",
    "DATABASE_QUERY",
    "MESSAGE_PUBLISH",
    "MESSAGE_SUBSCRIBE",
  ].includes(edge.type ?? "");

export function elementOwner(model: ArchitecturalModel, id: string): string {
  const visited = new Set<string>();
  while (!visited.has(id)) {
    visited.add(id);
    const parent = model.elements.find((node) => node.id === id)?.parentId;
    if (!parent || !model.elements.some((node) => node.id === parent)) break;
    id = parent;
  }
  return id;
}

function aggregate(edges: Edge[], member: (id: string) => string | undefined): Edge[] {
  const links = new Map<string, Edge>();
  for (const edge of edges) {
    const from = member(edge.from ?? ""),
      to = member(edge.to ?? "");
    if (!from || !to || from === to) continue;
    const token = JSON.stringify([from, to, edge.type, edge.originLayer]);
    const prior = links.get(token);
    if (prior) (prior["underlyingEdgeIds"] as string[]).push(edge.id);
    else
      links.set(token, {
        ...edge,
        id: `projection:${edge.id}`,
        from,
        to,
        source: from,
        target: to,
        underlyingEdgeIds: [edge.id],
      });
  }
  return [...links.values()];
}

export function contextProjection(model: ArchitecturalModel, raw: DiagramDocument) {
  const external = raw.layoutJson.nodes.filter((node) => node.kind === "EXTERNAL_SYSTEM");
  const inside = new Set(
    raw.layoutJson.nodes.filter((node) => node.kind !== "EXTERNAL_SYSTEM").map((node) => node.id),
  );
  const system: DiagramNode = {
    id: `system:${model.projectId}`,
    name: "System under analysis",
    kind: "SYSTEM",
    underlyingNodeIds: [...inside],
  };
  const links = aggregate(
    raw.layoutJson.edges.filter((edge) => !deployed(edge)),
    (id) => (inside.has(id) ? system.id : external.some((node) => node.id === id) ? id : undefined),
  );
  // A caller role is supported by declared inbound endpoints, but its identity is not known.
  // Do not infer people, business actors, or external ownership from service names.
  const entrypoints = model.elements.filter(
    (node) =>
      node.elementType === "COMPONENT" &&
      node.properties?.["responsibility"] === "Exposes HTTP endpoints",
  );
  const clients: DiagramNode[] = entrypoints.length
    ? [
        {
          id: `api-clients:${model.projectId}`,
          name: "Unidentified API consumers",
          kind: "EXTERNAL_SYSTEM",
          description:
            "Caller role inferred from declared HTTP endpoints; identity and system boundary require review",
          underlyingNodeIds: entrypoints.map((node) => node.id),
          inference: "INBOUND_ENDPOINT_CALLER_ROLE",
        },
      ]
    : [];
  if (clients[0])
    links.push({
      id: `inbound:${model.projectId}`,
      from: clients[0].id,
      to: system.id,
      type: "USES_API",
      underlyingNodeIds: entrypoints.map((node) => node.id),
    });
  const connected = new Set(links.flatMap((edge) => [edge.from, edge.to]));
  return {
    document: {
      ...raw,
      notation: "C4",
      level: "CONTEXT",
      viewId: "context",
      viewTitle: "C4 · System Context",
      layoutJson: {
        nodes: [system, ...external.filter((node) => connected.has(node.id)), ...clients],
        edges: links,
      },
    },
    notice: entrypoints.length
      ? "API consumers represent an unidentified caller role supported by source HTTP endpoints. Confirm actors and external ownership in draw.io; internal services, databases and brokers stay inside the system."
      : external.length
        ? "Only known external dependencies are shown. Internal services and infrastructure stay inside the system."
        : "System boundary only: this analysis has no identified actors or external systems. Add confirmed context in draw.io; no actors have been invented.",
  };
}

export function logicalProjection(
  model: ArchitecturalModel,
  raw: DiagramDocument,
  containerId?: string,
) {
  const abstractions = raw.layoutJson.nodes.filter((node) =>
    ["COMPONENT", "CLASS_INTERFACE"].includes(node.kind ?? ""),
  );
  const focus = abstractions.filter(
    (node) => !containerId || elementOwner(model, node.id) === containerId,
  );
  const ids = new Set(focus.map((node) => node.id));
  const relations = raw.layoutJson.edges.filter(
    (edge) =>
      !deployed(edge) &&
      [
        "CODE_DEPENDENCY",
        "ASSOCIATION",
        "COMPOSITION",
        "AGGREGATION",
        "INHERITANCE",
        "IMPLEMENTS",
      ].includes(edge.type ?? "") &&
      ids.has(edge.from ?? "") &&
      ids.has(edge.to ?? ""),
  );
  return {
    document: focus.length
      ? {
          ...raw,
          notation: "VIEW_4_PLUS_1",
          level: "LOGICAL",
          layoutJson: {
            nodes: focus.map((node) => ({
              ...node,
              kind: node.kind === "CLASS_INTERFACE" ? "CLASS_INTERFACE" : "LOGICAL_COMPONENT",
              languageStack: null,
              description:
                typeof (node["properties"] as Record<string, unknown> | undefined)?.[
                  "responsibility"
                ] === "string"
                  ? (node["properties"] as Record<string, string>)["responsibility"]
                  : node.description,
            })),
            edges: relations,
          },
        }
      : null,
    notice:
      "Logical decomposition of extracted application abstractions and their structural usage. Only source-supported relationships are shown; domain entities, inheritance and multiplicities are not invented.",
    reason:
      "No logical abstractions were extracted for this service. Choose another service or add the missing structure in the model editor and re-analyze.",
  };
}

export function processProjection(model: ArchitecturalModel, raw: DiagramDocument) {
  const links = aggregate(raw.layoutJson.edges.filter(interaction), (id) =>
    elementOwner(model, id),
  );
  const linked = new Set(links.flatMap((edge) => [edge.from, edge.to]));
  const owners = new Set(
    model.elements
      .filter((node) => node.elementType === "COMPONENT")
      .map((node) => elementOwner(model, node.id)),
  );
  const units = raw.layoutJson.nodes.filter(
    (node) =>
      !node.parentId &&
      (linked.has(node.id) || (node.kind === "SERVICE_CONTAINER" && owners.has(node.id))),
  );
  const ids = new Set(units.map((node) => node.id));
  return {
    document: units.length
      ? {
          ...raw,
          notation: "VIEW_4_PLUS_1",
          level: "PROCESS",
          layoutJson: {
            nodes: units.map((node) =>
              node.kind === "SERVICE_CONTAINER"
                ? {
                    ...node,
                    kind: "PROCESS_UNIT",
                    description: "Independent application execution unit (declared)",
                  }
                : {
                    ...node,
                    description:
                      node.kind === "MESSAGE_CHANNEL"
                        ? "Declared asynchronous communication channel"
                        : node.description,
                  },
            ),
            edges: links.filter((edge) => ids.has(edge.from!) && ids.has(edge.to!)),
          },
        }
      : null,
    notice:
      "Declared execution units and communication: HTTP calls, database access, and message publishing/handling. Startup dependencies are excluded. Thread scheduling, replicas, delivery guarantees and observed execution order are not inferred.",
    reason:
      "No application execution units or inter-process communication were extracted from this snapshot.",
  };
}
