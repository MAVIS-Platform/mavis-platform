import { z } from "zod";
export const RULE_VERSION = "mavis-se-3";
export type DrawioTheme = "clean" | "dark" | "blueprint";
const nodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.string().optional(),
    type: z.string().optional(),
    parentId: z.string().nullish(),
    languageStack: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
const edgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().optional(),
    to: z.string().optional(),
    source: z.string().optional(),
    target: z.string().optional(),
    type: z.string().optional(),
    relationType: z.string().optional(),
    originLayer: z.string().optional(),
  })
  .passthrough();
export const diagramDocument = z
  .object({
    modelVersionId: z.string(),
    notation: z.string(),
    level: z.string(),
    layoutJson: z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) }).passthrough(),
  })
  .passthrough();
export type DiagramDocument = z.infer<typeof diagramDocument>;
export type DiagramNode = z.infer<typeof nodeSchema>;
export const kindOf = (node: DiagramNode) => node.kind ?? node.type ?? "UNKNOWN";
export const ends = (edge: DiagramDocument["layoutJson"]["edges"][number]) => ({
  from: edge.from ?? edge.source ?? "",
  to: edge.to ?? edge.target ?? "",
});
export function projectDiagram(raw: unknown, containerId?: string): DiagramDocument {
  const doc = diagramDocument.parse(raw);
  const nodes = doc.layoutJson.nodes;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = doc.layoutJson.edges;
  if (
    ids.size !== nodes.length ||
    new Set(edges.map((edge) => edge.id)).size !== edges.length ||
    edges.some((edge) => {
      const { from, to } = ends(edge);
      return !ids.has(from) || !ids.has(to);
    })
  )
    throw new Error("Invalid diagram topology");
  if (!containerId) return doc;
  if (
    doc.notation !== "C4" ||
    doc.level !== "COMPONENT" ||
    !nodes.some((node) => node.id === containerId && kindOf(node) === "SERVICE_CONTAINER")
  )
    throw new Error("Invalid component container scope");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const focus = new Set(
    nodes
      .filter((node) => node.parentId === containerId && kindOf(node) !== "CLASS_INTERFACE")
      .map((node) => node.id),
  );
  const visible = new Set([...focus, containerId]);
  for (const edge of edges) {
    const { from, to } = ends(edge);
    const fromNode = byId.get(from),
      toNode = byId.get(to);
    if (
      (fromNode && kindOf(fromNode) === "CLASS_INTERFACE") ||
      (toNode && kindOf(toNode) === "CLASS_INTERFACE")
    ) {
      continue;
    }
    if (focus.has(from) || focus.has(to)) {
      visible.add(from);
      visible.add(to);
    }
  }
  const shownEdges = edges.filter((edge) => {
    const { from, to } = ends(edge);
    return visible.has(from) && visible.has(to) && (focus.has(from) || focus.has(to));
  });
  return {
    ...doc,
    scopeContainerId: containerId,
    omittedNodes: nodes.length - visible.size,
    omittedEdges: edges.length - shownEdges.length,
    layoutJson: {
      ...doc.layoutJson,
      nodes: nodes.filter((node) => visible.has(node.id)),
      edges: shownEdges,
    },
  };
}
export function componentContainers(raw: unknown) {
  const doc = diagramDocument.parse(raw);
  return doc.layoutJson.nodes
    .filter((node) => kindOf(node) === "SERVICE_CONTAINER")
    .map((node) => ({
      id: node.id,
      name: node.name,
      componentCount: doc.layoutJson.nodes.filter(
        (child) => child.parentId === node.id && kindOf(child) === "COMPONENT",
      ).length,
    }))
    .sort((a, b) => b.componentCount - a.componentCount || a.name.localeCompare(b.name));
}
const relations: Record<string, string> = {
  USES_API: "Uses exposed API",
  DECLARED_COMPOSE: "Compose dependency",
  CODE_DEPENDENCY: "Code dependency",
  SERVICE_HTTP_CALL: "HTTP call",
  DATABASE_ACCESS: "Database access",
  DATABASE_QUERY: "Database query",
  MESSAGE_PUBLISH: "Declares publishing to",
  MESSAGE_SUBSCRIBE: "Delivers messages to",
};
export function relationLabel(edge: DiagramDocument["layoutJson"]["edges"][number]) {
  const raw = edge.relationType ?? edge.type ?? "";
  return relations[raw] ?? (raw.replaceAll("_", " ") || "Unclassified relationship");
}
// S2e: C4 Container messaging labels may append the channel protocol in brackets. The protocol
// comes ONLY from the MESSAGE_CHANNEL endpoint's properties.protocol (non-blank string) — never
// from the channel name, languageStack, transportAuthority, relation kind, or a default. The
// edge direction stays the current contract (publish: producer→channel; subscribe: channel→consumer).
export function containerDatabaseLabel(
  edge: DiagramDocument["layoutJson"]["edges"][number],
  nodesById: Map<string, DiagramNode>,
): string | null {
  const type = edge.relationType ?? edge.type ?? "";
  if (type !== "DATABASE_ACCESS" && type !== "DATABASE_QUERY") return null;
  const dbId = ends(edge).to;
  const db = nodesById.get(dbId);
  if (!db || kindOf(db) !== "DATABASE") return null;
  const props = (db as Record<string, unknown>)["properties"];
  const protocol =
    props && typeof props === "object" ? (props as Record<string, unknown>)["protocol"] : undefined;
  if (typeof protocol !== "string" || protocol.trim() === "") return null;
  return `${relationLabel(edge)} [${protocol.trim()}]`;
}

export function containerMessagingLabel(
  edge: DiagramDocument["layoutJson"]["edges"][number],
  nodesById: Map<string, DiagramNode>,
): string | null {
  const type = edge.relationType ?? edge.type ?? "";
  if (type !== "MESSAGE_PUBLISH" && type !== "MESSAGE_SUBSCRIBE") return null;
  const channelId = type === "MESSAGE_PUBLISH" ? ends(edge).to : ends(edge).from;
  const channel = nodesById.get(channelId);
  if (!channel || kindOf(channel) !== "MESSAGE_CHANNEL") return null;
  const props = (channel as Record<string, unknown>)["properties"];
  const protocol =
    props && typeof props === "object" ? (props as Record<string, unknown>)["protocol"] : undefined;
  if (typeof protocol !== "string" || protocol.trim() === "") return null;
  return `${relationLabel(edge)} [${protocol}]`;
}
export function wrapText(text: string, max = 30) {
  const result: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    for (let offset = 0; offset < Array.from(word).length; offset += max) {
      const part = Array.from(word)
        .slice(offset, offset + max)
        .join("");
      if (Array.from(line + (line ? " " : "") + part).length > max) {
        if (line) result.push(line);
        line = part;
      } else line += (line ? " " : "") + part;
    }
  }
  if (line) result.push(line);
  return result.length ? result : [""];
}
export function nodeText(node: DiagramNode) {
  const type = kindOf(node);
  const labels: Record<string, string> = {
    PROCESS_UNIT: "Process unit · declared",
    LOGICAL_COMPONENT: "Logical component",
    CLASS_INTERFACE: "Class / Interface",
  };
  const label =
    labels[type] ??
    (type === "SYSTEM"
      ? "Software system"
      : type === "PACKAGE"
        ? "Source package"
        : type === "DATASTORE_GROUP"
          ? "Data store group"
          : type === "SERVICE_GROUP"
            ? "Service group"
            : type === "CHANNEL_GROUP"
              ? "Channel group"
              : type === "SERVICE_CONTAINER"
                ? "Container"
                : type === "COMPONENT"
                  ? "Component"
                  : type === "MESSAGE_CHANNEL"
                    ? "Message channel"
                    : type === "DATABASE"
                      ? "Database"
                      : type === "QUEUE_BROKER"
                        ? "Queue / Broker"
                        : type === "EXTERNAL_SYSTEM"
                          ? "External system"
                          : "Unknown element");
  const technology =
    node.languageStack === "JAVA_SPRING"
      ? "Java / Spring"
      : node.languageStack === "CSHARP_DOTNET"
        ? "C# / .NET"
        : node.languageStack;
  return [
    ...wrapText(node.name),
    ...wrapText(`[${label}${technology ? " · " + technology : ""}]`),
    ...(node.description ? wrapText(node.description) : []),
  ];
}
export function palette(theme: DrawioTheme) {
  if (theme === "dark")
    return {
      background: "#161B22",
      text: "#E6EDF3",
      line: "#94A3B8",
      internal: "#233C59",
      data: "#203E35",
      external: "#30363D",
      border: "#91B8E2",
    };
  if (theme === "blueprint")
    return {
      background: "#082032",
      text: "#E0F2FE",
      line: "#7DD3FC",
      internal: "#0B3658",
      data: "#13443E",
      external: "#243747",
      border: "#7DD3FC",
    };
  return {
    background: "#FFFFFF",
    text: "#172B4D",
    line: "#475569",
    internal: "#EAF2FF",
    data: "#E7F2EC",
    external: "#F1F3F5",
    border: "#64748B",
  };
}
export function nodeStyle(kind: string, theme: DrawioTheme) {
  const p = palette(theme);
  const shape =
    kind === "DATABASE"
      ? "shape=cylinder3;size=16;"
      : ["QUEUE_BROKER", "MESSAGE_CHANNEL"].includes(kind)
        ? "shape=process;"
        : "rounded=1;arcSize=8;";
  const fill = [
    "DATABASE",
    "QUEUE_BROKER",
    "MESSAGE_CHANNEL",
    "DATASTORE_GROUP",
    "CHANNEL_GROUP",
  ].includes(kind)
    ? p.data
    : kind === "EXTERNAL_SYSTEM" || kind === "UNKNOWN"
      ? p.external
      : p.internal;
  return `${shape}whiteSpace=wrap;html=0;fontFamily=Arial;fontSize=14;fontColor=${p.text};fillColor=${fill};strokeColor=${p.border};strokeWidth=1.5;spacing=14;align=center;verticalAlign=middle;`;
}

export function nodeHtml(node: DiagramNode) {
  const escaped = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const lines = nodeText(node),
    count = wrapText(node.name).length;
  return `<div style="font-family:Arial;line-height:1.3"><div style="font-size:16px;font-weight:bold">${lines.slice(0, count).map(escaped).join("<br>")}</div><div style="font-size:12px;margin-top:6px">${lines.slice(count).map(escaped).join("<br>")}</div></div>`;
}

export function selectRelationships(
  doc: DiagramDocument,
  view: "all" | "source" | "declared" | "runtime" = "all",
): DiagramDocument {
  if (view === "all") return doc;
  const edges = doc.layoutJson.edges.filter((edge) => {
    const declared =
      (edge.relationType ?? edge.type) === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT";
    const runtime = ["RUNTIME", "STATIC_AND_RUNTIME"].includes(edge.originLayer ?? "");
    return view === "declared"
      ? declared
      : view === "runtime"
        ? runtime
        : !declared && (!runtime || edge.originLayer === "STATIC_AND_RUNTIME");
  });
  return {
    ...doc,
    relationshipView: view,
    omittedEdges: Number(doc["omittedEdges"] ?? 0) + doc.layoutJson.edges.length - edges.length,
    layoutJson: { ...doc.layoutJson, edges },
  };
}
