import { candidateSchema, keyOf } from "./context-candidates";
import type { ArchitecturalModel } from "@/types/domain";
import { palette, type DiagramDocument, type DiagramNode, type DrawioTheme } from "@/lib/drawio/rules";
import { isDeclarativeClientElement } from "./classifier-semantics";
import { compressCodeToAstSkeleton } from "./scenario-design";

type Edge = DiagramDocument["layoutJson"]["edges"][number];
const deployed = (edge: Edge) =>
  edge.type === "DECLARED_COMPOSE" || edge.type === "DECLARED_LINK" || edge.originLayer === "DEPLOYMENT";
const interaction = (edge: Edge) =>
  !deployed(edge) &&
  [
    "SERVICE_HTTP_CALL", "RUNTIME_OBSERVED", "GATEWAY_ROUTE",
    "DATABASE_ACCESS",
    "DATABASE_QUERY",
    "MESSAGE_PUBLISH",
    "MESSAGE_SUBSCRIBE",
  ].includes(edge.type ?? "");

const SYSTEM_DESCRIPTION_DEFAULTS: Record<string, string> = {
  "Mộc Hương Shop Platform":
    "Nền tảng thương mại điện tử nhang trầm kiến trúc Java 21 / Spring Cloud Microservices",
  "Project Trái Cây Platform":
    "Nền tảng thương mại điện tử trái cây sạch kiến trúc .NET 8 / ASP.NET Core Microservices",
};

function resolveSystemDescription(
  model: ArchitecturalModel,
  resolvedSystemName: string,
  fallback?: string,
): string | undefined {
  const custom = model.elements.find(
    (el) => typeof el.properties?.["systemDescription"] === "string" && el.properties["systemDescription"].trim(),
  )?.properties?.["systemDescription"] as string | undefined;
  return custom?.trim() || SYSTEM_DESCRIPTION_DEFAULTS[resolvedSystemName] || fallback;
}

export function selectDefaultGuidedC3Service(
  containers: ReadonlyArray<{ id: string; name: string; count: number }>,
): string {
  if (containers.length === 0) return "ALL";
  const exactOrder = containers.find((node) => node.name === "order-service");
  if (exactOrder) return exactOrder.id;
  const orderingService = containers.find((node) => /ordering|order/i.test(node.name));
  if (orderingService) return orderingService.id;
  const sorted = [...containers].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  return sorted[0]?.id ?? "ALL";
}

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

// S2e/M1 review: a source-declared HTTP entrypoint proves an inbound interface, NOT that an
// external caller exists. The context therefore shows the system alone (plus evidenced
// externals) and reports missing caller data instead of fabricating an external system.
export function contextProjection(
  model: ArchitecturalModel,
  raw: DiagramDocument,
  options?: { systemName?: string | undefined },
) {
  const established = deriveC4ContextModel(model);
  const actorActionLabels = new Map<string, string>();
  for (const person of established.persons) {
    if (person.actionLabel && person.actionLabel !== "Declared interaction with the system") {
      actorActionLabels.set(person.id, person.actionLabel);
    }
  }
  for (const ext of established.externals) {
    if (
      ext.actionLabel &&
      ext.actionLabel !== "Declared inbound dependency" &&
      ext.actionLabel !== "Declared external dependency"
    ) {
      actorActionLabels.set(ext.id, ext.actionLabel);
    }
  }
  const allowedContextIds = new Set([...established.persons, ...established.externals].map(item => item.id));
  const external = raw.layoutJson.nodes.filter((node) =>
    ["EXTERNAL_SYSTEM", "PERSON"].includes(node.kind ?? "") && allowedContextIds.has(node.id),
  );
  const inside = new Set(
    raw.layoutJson.nodes
      .filter((node) => !["EXTERNAL_SYSTEM", "PERSON"].includes(node.kind ?? ""))
      .map((node) => node.id),
  );
  const resolvedSystemName = options?.systemName?.trim() || "System under analysis";
  const systemDescription = resolveSystemDescription(model, resolvedSystemName);
  const system: DiagramNode = {
    id: `system:${model.projectId}`,
    name: resolvedSystemName,
    kind: "SYSTEM",
    ...(systemDescription ? { description: systemDescription } : {}),
    underlyingNodeIds: [...inside],
  };
  const links = aggregate(
    raw.layoutJson.edges.filter((edge) => !deployed(edge)),
    (id) => (inside.has(id) ? system.id : external.some((node) => node.id === id) ? id : undefined),
  ).map((edge) => {
    const customLabel =
      actorActionLabels.get(edge.from ?? "") ?? actorActionLabels.get(edge.to ?? "");
    return customLabel ? { ...edge, label: customLabel } : edge;
  });
  // A caller role is supported by declared inbound endpoints, but its identity is not known.
  // Do not infer people, business actors, or external ownership from service names: the entry
  // points only prove an inbound interface, so they stay inside the system and the missing
  // caller data is reported instead of drawn as a fact.
  const entrypoints = model.elements.filter(
    (node) =>
      node.elementType === "COMPONENT" &&
      node.properties?.["responsibility"] === "Exposes HTTP endpoints",
  );
  const connected = new Set(links.flatMap((edge) => [edge.from, edge.to]));
  return {
    document: {
      ...raw,
      notation: "C4",
      level: "CONTEXT",
      viewId: "context",
      viewTitle: "C4 · System Context",
      layoutJson: {
        nodes: [system, ...external.filter((node) => connected.has(node.id))],
        edges: links,
      },
    },
    notice: external.some((node) => node.kind === "PERSON" && connected.has(node.id))
      ? "Only explicit model actors and declared dependencies are shown; no roles are inferred from endpoint or entity names."
      : entrypoints.length
      ? `The analysis declares ${entrypoints.length} HTTP entrypoint component(s), but no external caller or actor is established by this model; the context shows the system alone and callers require review.`
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

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#xa;");

interface C4ContextPersonSpec {
  provisional?: boolean;
  id: string;
  name: string;
  description: string;
  actionLabel: string;
  underlyingNodeIds: string[];
  underlyingEdgeIds: string[];
  direction: "INBOUND" | "OUTBOUND";
}

interface C4ContextExternalSpec {
  id: string;
  name: string;
  description: string;
  actionLabel: string;
  direction: "OUTBOUND" | "INBOUND";
  underlyingEdgeIds: string[];
}

export function deriveC4ContextModel(model: ArchitecturalModel): {
  persons: C4ContextPersonSpec[];
  externals: C4ContextExternalSpec[];
  systemDescription: string;
  internalNodeIds: string[];
} {
  // Controller/entity names establish interfaces, never human roles. Only an
  // explicit PERSON with an existing inbound relationship can enter this view.
  const internalNodes = model.elements.filter(
    (element) => !["EXTERNAL_SYSTEM", "PERSON"].includes(element.elementType ?? ""),
  );
  const internalNodeIds = internalNodes.map((element) => element.id);
  const internalIds = new Set(internalNodeIds);
  const isInteraction = (edge: ArchitecturalModel["edges"][number]) =>
    edge.originLayer !== "DEPLOYMENT" &&
    !["DECLARED_COMPOSE", "DECLARED_LINK", "STARTUP_DEPENDENCY"].includes(edge.protocol);
  const persons: C4ContextPersonSpec[] = model.elements
    .filter((element) => element.elementType === "PERSON" && !["PROPOSED", "REJECTED"].includes(String(element.properties?.["contextReviewState"] ?? "")))
    .flatMap((element) => {
      const incoming = model.edges.filter(
        (edge) => ((edge.from === element.id && internalIds.has(edge.to)) || (edge.to === element.id && internalIds.has(edge.from))) && isInteraction(edge),
      );
      return incoming.length
        ? [
            {
              id: element.id,
              name: element.name,
              description:
                element.description ||
                "Explicit actor declared in the model; its business role requires confirmation.",
              actionLabel:
                typeof element.properties?.["contextActionLabel"] === "string" &&
                element.properties["contextActionLabel"].trim()
                  ? element.properties["contextActionLabel"].trim()
                  : "Declared interaction with the system",
              underlyingNodeIds: [element.id],
              underlyingEdgeIds: incoming.map((edge) => edge.id),
              direction: incoming.some((edge) => edge.from === element.id) ? "INBOUND" as const : "OUTBOUND" as const,
            },
          ]
        : [];
    });

  const targets = new Map(internalNodes.map(n => [keyOf(n), n]));
  const seenCandidates = new Set<string>();
  for (const node of model.elements) {
    const raw = node.properties?.["contextReview"];
    if (!raw || typeof raw !== "object" || !("entries" in raw) || !Array.isArray(raw.entries)) continue;
    for (const value of raw.entries) {
      const parsed = candidateSchema.safeParse(value);
      if (!parsed.success) continue;
      const entry = parsed.data, target = targets.get(entry.targetKey);
      if (entry.state !== "PROPOSED" || entry.kind !== "PERSON" || entry.proposalOrigin !== "SOURCE_CANDIDATE" || !entry.sourceLocator || !entry.sourceExcerpt || !entry.evidenceIds?.length || !target || seenCandidates.has(entry.id)) continue;
      seenCandidates.add(entry.id);
      persons.push({id:`candidate:${entry.id}`, name:entry.name, provisional:true, description:`Security principal inferred from an access rule; human identity and business role require review. Source: ${entry.sourceLocator}`, actionLabel:"Source access rule · unverified interaction", underlyingNodeIds:[target.id], underlyingEdgeIds:[], direction:entry.direction});
    }
  }

  // N-C1-02: Strictly exclude internal Databases, Kafka/Queues, CDC, Zipkin, and Services!
  // Only include true EXTERNAL_SYSTEM elements outside the system boundary.
  const internalSet = new Set(internalNodeIds);
  const externals: C4ContextExternalSpec[] = [];
  for (const el of model.elements) {
    if (el.elementType !== "EXTERNAL_SYSTEM") continue;
    const reviewState = String(el.properties?.["contextReviewState"] ?? "");
    if (["PROPOSED", "REJECTED"].includes(reviewState)) continue;
    if ((el.properties?.["resolutionIssue"] || el.properties?.["status"] === "UNCERTAIN_MAPPING") && reviewState !== "CONFIRMED") continue;
    const relatedEdges = model.edges.filter(
      (edge) =>
        isInteraction(edge) &&
        ((internalSet.has(edge.from) && edge.to === el.id) ||
          (edge.from === el.id && internalSet.has(edge.to))),
    );
    if (!relatedEdges.length) continue;
    const inboundCount = relatedEdges.filter((edge) => edge.from === el.id).length;
    const outboundCount = relatedEdges.length - inboundCount;
    const direction: "OUTBOUND" | "INBOUND" = inboundCount > outboundCount ? "INBOUND" : "OUTBOUND";
    externals.push({
      id: el.id,
      name: el.name,
      description:
        el.description?.replace(/\s*·\s*null\b/gi, "").trim() ||
        "External software system outside the target system boundary",
      actionLabel:
        typeof el.properties?.["contextActionLabel"] === "string" &&
        el.properties["contextActionLabel"].trim()
          ? el.properties["contextActionLabel"].trim()
          : direction === "INBOUND"
            ? "Declared inbound dependency"
            : "Declared external dependency",
      direction,
      underlyingEdgeIds: relatedEdges.map((e) => e.id),
    });
  }

  const declaredApiOwners = model.elements.filter(element => {
    const classifier = element.properties?.["umlClassifier"] as Record<string, unknown> | undefined;
    const methods = Array.isArray(classifier?.["methodsCfg"]) ? classifier["methodsCfg"] as Record<string, unknown>[] : [];
    return methods.some(method => Array.isArray(method["endpointDeclarations"]) && method["endpointDeclarations"].length > 0);
  }).map(element => element.name);
  const hasConfirmedContext = persons.some(person => model.elements.find(n => n.id === person.id)?.properties?.["contextFactOrigin"] === "USER_CONFIRMED") || externals.some(ext => model.elements.find(n => n.id === ext.id)?.properties?.["contextFactOrigin"] === "USER_CONFIRMED");
  const systemDescription = hasConfirmedContext ? "Software system under analysis. Context roles and boundaries include explicit user-confirmed assertions; this is not proof of runtime behavior." : declaredApiOwners.length
    ? "HTTP APIs declared by " + [...new Set(declaredApiOwners)].slice(0, 4).join(", ") + ". External caller roles are not established."
    : "Software system under analysis. API purpose and external caller roles are not established by this revision.";

  return { persons, externals, systemDescription, internalNodeIds };
}

export interface C4AiDiagramEnrichment {
  systemDescription?: string;
  persons?: Record<
    string,
    {
      name?: string;
      description?: string;
      actionLabel?: string;
    }
  >;
  externals?: Record<
    string,
    {
      description?: string;
      actionLabel?: string;
    }
  >;
  nodeDescriptions?: Record<string, string>;
  tokenStats?: {
    rawChars: number;
    compressedChars: number;
    savedPercent: number;
    provider: "openai" | "gemini" | "ast-skeleton";
  };
}

export interface CompactC4AiContext {
  contextHash: string;
  kind: "CONTEXT" | "CONTAINER" | "COMPONENT";
  systemName: string;
  containerId?: string;
  nodes: Array<{
    id: string;
    name: string;
    kind: string;
    technology?: string | null;
    defaultDescription?: string | null;
    hasSourceEvidence?: boolean;
  }>;
  persons?: Array<{
    id: string;
    name: string;
    description: string;
    actionLabel: string;
  }>;
  externals?: Array<{
    id: string;
    name: string;
    description: string;
    actionLabel: string;
  }>;
  astSkeleton: string;
  rawChars: number;
  compressedChars: number;
  savedPercent: number;
}

export function buildC4CompactContext(
  model: ArchitecturalModel,
  kind: "CONTEXT" | "CONTAINER" | "COMPONENT",
  containerId?: string,
  systemName?: string,
): CompactC4AiContext {
  const resolvedSystemName = systemName?.trim() || model.label || "System under analysis";
  const rawChunks: string[] = [];

  let focusElements = model.elements;
  if (kind === "CONTEXT") {
    focusElements = model.elements.filter(
      (el) =>
        el.elementType === "EXTERNAL_SYSTEM" ||
        el.elementType === "SERVICE_CONTAINER" ||
        /(Controller|Resource|Endpoint|Handler)$/i.test(el.name) ||
        el.properties?.["responsibility"] === "Exposes HTTP endpoints",
    );
  } else if (kind === "CONTAINER") {
    focusElements = model.elements.filter((el) =>
      [
        "SERVICE_CONTAINER",
        "DATABASE",
        "MESSAGE_CHANNEL",
        "QUEUE_BROKER",
        "EXTERNAL_SYSTEM",
      ].includes(el.elementType ?? ""),
    );
  } else if (kind === "COMPONENT") {
    focusElements = model.elements.filter(
      (el) =>
        (!containerId || el.parentId === containerId || el.id === containerId) &&
        (el.elementType !== "CLASS_INTERFACE" || isDeclarativeClientElement(el)),
    );
  }

  const capped = focusElements.slice(0, 18);
  for (const el of capped) {
    for (const ev of (el.evidence ?? [])
      .filter((item) => item.origin !== "preview" && item.sourceType !== "MODEL_METADATA_PREVIEW")
      .slice(0, 2)) {
      if (ev.snippet) rawChunks.push(`// [${el.name}]\n${ev.snippet}`);
    }
  }

  const rawJoined = rawChunks.join("\n");
  const astSkeleton = compressCodeToAstSkeleton(rawJoined, 1500);
  const rawChars = rawJoined.length;
  const compressedChars = astSkeleton.length;
  const savedPercent =
    rawChars > 0
      ? Math.max(0, Math.min(99, Math.round((1 - compressedChars / rawChars) * 100)))
      : 0;

  const ctxBase = kind === "CONTEXT" ? deriveC4ContextModel(model) : null;
  const nodeSpecs = capped.map((el) => ({
    id: el.id,
    name: el.name,
    kind: el.elementType ?? "COMPONENT",
    technology: el.technology ?? null,
    defaultDescription: el.description ?? null,
    hasSourceEvidence: (el.evidence ?? []).some(
      (ev) =>
        ev.origin !== "preview" &&
        ev.sourceType !== "MODEL_METADATA_PREVIEW" &&
        !!ev.snippet.trim(),
    ),
  }));

  const sig = `evidence-policy-2|${model.id}|${kind}|${containerId ?? ""}|${resolvedSystemName}|${nodeSpecs.map((n) => n.id).join(",")}|${astSkeleton}`;
  let hash = 2166136261;
  for (let i = 0; i < sig.length; i += 1) {
    hash ^= sig.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const contextHash = `mavis-c4-${kind.toLowerCase()}-${(hash >>> 0).toString(16)}`;

  return {
    contextHash,
    kind,
    systemName: resolvedSystemName,
    ...(containerId ? { containerId } : {}),
    nodes: nodeSpecs,
    ...(ctxBase
      ? {
          persons: ctxBase.persons.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            actionLabel: p.actionLabel,
          })),
          externals: ctxBase.externals.map((x) => ({
            id: x.id,
            name: x.name,
            description: x.description,
            actionLabel: x.actionLabel,
          })),
        }
      : {}),
    astSkeleton,
    rawChars,
    compressedChars,
    savedPercent,
  };
}

export function applyC4AiEnrichmentToDocument(
  doc: DiagramDocument,
  aiEnrichment?: C4AiDiagramEnrichment | null,
): DiagramDocument {
  if (!aiEnrichment?.nodeDescriptions || Object.keys(aiEnrichment.nodeDescriptions).length === 0) {
    return doc;
  }
  const descMap = aiEnrichment.nodeDescriptions;
  return {
    ...doc,
    layoutJson: {
      ...doc.layoutJson,
      nodes: doc.layoutJson.nodes.map((node) => {
        const aiDesc = descMap[node.id]?.trim();
        if (!aiDesc) return node;
        return {
          ...node,
          description: aiDesc.slice(0, 60),
        };
      }),
    },
  };
}

export function buildContextDiagramDrawioXml(
  model: ArchitecturalModel,
  systemName?: string,
  theme: DrawioTheme = "clean",
  aiEnrichment?: C4AiDiagramEnrichment | null,
): string {
  // Accepted for API compatibility only; context assertions are never AI rewrites.
  void aiEnrichment;
  const baseContext = deriveC4ContextModel(model);
  const internalNodeIds = baseContext.internalNodeIds;
  // Context assertions come from the reviewed model. AI wording cannot replace them.
  const resolvedSystemName = systemName?.trim() || "System under analysis";
  const systemDescription = resolveSystemDescription(
    model,
    resolvedSystemName,
    baseContext.systemDescription,
  );
  const persons = baseContext.persons;
  const externals = baseContext.externals;
  const basePalette = palette(theme);
  const p =
    theme === "clean"
      ? {
          ...basePalette,
          person: "#08427B",
          system: "#1168BD",
          external: "#64748B",
          nodeText: "#FFFFFF",
          border: "#0B4884",
        }
      : basePalette;

  type Side = "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
  interface PlacedActor {
    cellId: string;
    edgeId: string;
    mavisEdgeId: string;
    id: string;
    name: string;
    role: "PERSON" | "EXTERNAL_SYSTEM";
    provisional?: boolean;
    badge: string;
    description: string;
    actionLabel: string;
    direction: "INBOUND" | "OUTBOUND";
    underlyingNodeIds?: string[];
    underlyingEdgeIds?: string[];
    side: Side;
  }

  const personItems: Omit<PlacedActor, "side">[] = persons.map((person, idx) => ({
    cellId: `person_${idx}`,
    edgeId: `person_edge_${idx}`,
    mavisEdgeId: `ctx-edge:${person.id}`,
    id: person.id,
    name: person.name,
    role: "PERSON",
    badge: person.provisional ? "Security principal · needs review" : "Person",
    provisional: Boolean(person.provisional),
    description: person.description,
    actionLabel: person.actionLabel,
    direction: person.direction,
    underlyingNodeIds: person.underlyingNodeIds,
    underlyingEdgeIds: person.underlyingEdgeIds,
  }));

  const externalItems: Omit<PlacedActor, "side">[] = externals.map((ext, idx) => ({
    cellId: `external_${idx}`,
    edgeId: `external_edge_${idx}`,
    mavisEdgeId: `ctx-edge:${ext.id}`,
    id: ext.id,
    name: ext.name,
    role: "EXTERNAL_SYSTEM",
    badge: "Software System · External",
    description: ext.description,
    actionLabel: ext.actionLabel,
    direction: ext.direction,
    underlyingEdgeIds: ext.underlyingEdgeIds,
  }));

  const bySide: Record<Side, PlacedActor[]> = {
    TOP: [],
    BOTTOM: [],
    LEFT: [],
    RIGHT: [],
  };

  if (externalItems.length === 0) {
    if (personItems.length === 1) {
      bySide.LEFT.push({ ...personItems[0]!, side: "LEFT" });
    } else if (personItems.length === 2) {
      bySide.LEFT.push({ ...personItems[0]!, side: "LEFT" });
      bySide.RIGHT.push({ ...personItems[1]!, side: "RIGHT" });
    } else if (personItems.length === 3) {
      bySide.TOP.push({ ...personItems[0]!, side: "TOP" });
      bySide.LEFT.push({ ...personItems[1]!, side: "LEFT" });
      bySide.RIGHT.push({ ...personItems[2]!, side: "RIGHT" });
    } else if (personItems.length === 4) {
      bySide.TOP.push({ ...personItems[0]!, side: "TOP" });
      bySide.RIGHT.push({ ...personItems[1]!, side: "RIGHT" });
      bySide.BOTTOM.push({ ...personItems[2]!, side: "BOTTOM" });
      bySide.LEFT.push({ ...personItems[3]!, side: "LEFT" });
    } else if (personItems.length >= 5) {
      bySide.TOP.push({ ...personItems[0]!, side: "TOP" });
      bySide.RIGHT.push({ ...personItems[1]!, side: "RIGHT" });
      bySide.BOTTOM.push({ ...personItems[2]!, side: "BOTTOM" });
      for (const item of personItems.slice(3)) {
        bySide.LEFT.push({ ...item, side: "LEFT" });
      }
    }
  } else {
    for (const ext of externalItems) {
      bySide.RIGHT.push({ ...ext, side: "RIGHT" });
    }
    if (personItems.length === 1) {
      bySide.LEFT.push({ ...personItems[0]!, side: "LEFT" });
    } else if (personItems.length === 2) {
      bySide.TOP.push({ ...personItems[0]!, side: "TOP" });
      bySide.LEFT.push({ ...personItems[1]!, side: "LEFT" });
    } else if (personItems.length >= 3) {
      bySide.TOP.push({ ...personItems[0]!, side: "TOP" });
      bySide.BOTTOM.push({ ...personItems[1]!, side: "BOTTOM" });
      for (const item of personItems.slice(2)) {
        bySide.LEFT.push({ ...item, side: "LEFT" });
      }
    }
  }

  const cardWidth = 260;
  const cardHeight = 116;
  const sysWidth = 320;
  const sysHeight = 176;
  const gapX = 276;
  const gapY = 132;
  const slotPitchY = 164;
  const slotPitchX = 300;

  const hasLeft = bySide.LEFT.length > 0;
  const hasTop = bySide.TOP.length > 0;
  const hasBottom = bySide.BOTTOM.length > 0;
  const hasRight = bySide.RIGHT.length > 0;

  const maxSideRows = Math.max(bySide.LEFT.length, bySide.RIGHT.length, 1);
  const sideStackHeight = maxSideRows * slotPitchY - (slotPitchY - cardHeight);

  const leftX = 64;
  const sysX = hasLeft ? leftX + cardWidth + gapX : 240;
  const rightX = sysX + sysWidth + gapX;
  const centerX = Math.round(sysX + sysWidth / 2);

  const topY = 112;
  const minCenterYFromTop = hasTop
    ? topY + cardHeight + gapY + Math.round(sysHeight / 2)
    : 120 + Math.round(sysHeight / 2);
  const minCenterYFromSides = 112 + Math.round(sideStackHeight / 2);
  const centerY = Math.max(minCenterYFromTop, minCenterYFromSides);
  const sysY = Math.round(centerY - sysHeight / 2);
  const bottomYCard = Math.max(
    sysY + sysHeight + gapY,
    Math.round(centerY + sideStackHeight / 2 + 40),
  );

  const boxHtml = (title: string, badge: string, desc: string) =>
    `<div style="font-family:Arial;line-height:1.35"><div style="font-size:15px;font-weight:bold">${escapeXml(title)}</div><div style="font-size:11px;opacity:0.9;margin-top:3px">[${escapeXml(badge)}]</div><div style="font-size:11px;margin-top:6px">${escapeXml(desc)}</div></div>`;

  const documentMeta = {
    modelVersionId: model.id,
    notation: "C4",
    level: "CONTEXT",
    viewId: "context",
    viewTitle: `System Context diagram for ${resolvedSystemName}`,
  };

  const cells: string[] = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    `<mxCell id="mavis_title" mavisC4Context="6" mavisDocument="${escapeXml(JSON.stringify(documentMeta))}" mavisRuleVersion="mavis-se-3" mavisTheme="${theme}" value="${escapeXml(`System Context diagram for ${resolvedSystemName}`)}" style="text;html=0;fontFamily=Arial;fontSize=20;fontStyle=1;fontColor=${p.text};align=left;" vertex="1" parent="1"><mxGeometry x="64" y="24" width="960" height="32" as="geometry"/></mxCell>`,
    `<mxCell id="mavis_scope" value="${escapeXml(`C4 Level 1 (System Context) · 1 Software System · ${persons.filter(p=>!p.provisional).length} declared actor(s) · ${persons.filter(p=>p.provisional).length} provisional security principal(s) · ${externals.length} identified external system(s) · ${persons.length === 0 ? "Context incomplete: caller roles require confirmation" : "Declared context: boundary and actor roles require review"}`)}" style="text;html=0;fontFamily=Arial;fontSize=12;fontColor=${p.text};align=left;" vertex="1" parent="1"><mxGeometry x="64" y="60" width="980" height="24" as="geometry"/></mxCell>`,
    `<mxCell id="system_center" mavisId="system:${escapeXml(model.projectId)}" mavisRole="SYSTEM" mavisName="${escapeXml(resolvedSystemName)}" mavisDescription="${escapeXml(systemDescription)}" mavisNodeMetadata="${escapeXml(JSON.stringify({ underlyingNodeIds: internalNodeIds }))}" value="${escapeXml(boxHtml(resolvedSystemName, "Software System", systemDescription))}" style="rounded=1;arcSize=8;whiteSpace=wrap;html=1;fillColor=${p.system};fontColor=${p.nodeText};strokeColor=${p.border};strokeWidth=2;fontFamily=Arial;spacing=12;align=center;verticalAlign=middle;" vertex="1" parent="1"><mxGeometry x="${sysX}" y="${sysY}" width="${sysWidth}" height="${sysHeight}" as="geometry"/></mxCell>`,
  ];

  const pushActorAndEdge = (
    item: PlacedActor,
    x: number,
    y: number,
    exitX: number,
    exitY: number,
    entryX: number,
    entryY: number,
    waypoints: { x: number; y: number }[],
  ) => {
    const isPerson = item.role === "PERSON";
    const fill = isPerson ? p.person : p.external;
    const stroke = isPerson && theme === "clean" ? "#052E56" : p.border;
    const arcSize = isPerson ? 10 : 8;
    const nodeMetaAttr = item.underlyingNodeIds
      ? ` mavisNodeMetadata="${escapeXml(JSON.stringify({ viewLocal: true, underlyingNodeIds: item.underlyingNodeIds }))}"`
      : "";
    cells.push(
      `<mxCell id="${item.cellId}" mavisId="${escapeXml(item.id)}" mavisRole="${item.provisional ? "SECURITY_PRINCIPAL" : item.role}" mavisName="${escapeXml(item.name)}" mavisDescription="${escapeXml(item.description)}"${nodeMetaAttr} value="${escapeXml(boxHtml(item.name, item.badge, item.description))}" style="rounded=1;arcSize=${arcSize};whiteSpace=wrap;html=1;fillColor=${fill};fontColor=${p.nodeText};strokeColor=${stroke};strokeWidth=1.5;${item.provisional ? "dashed=1;dashPattern=6 4;" : ""}fontFamily=Arial;spacing=10;align=center;verticalAlign=middle;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" as="geometry"/></mxCell>`,
    );

    const isInbound = item.direction === "INBOUND";
    const sourceId = isInbound ? item.cellId : "system_center";
    const targetId = isInbound ? "system_center" : item.cellId;
    const realExitX = isInbound ? exitX : entryX;
    const realExitY = isInbound ? exitY : entryY;
    const realEntryX = isInbound ? entryX : exitX;
    const realEntryY = isInbound ? entryY : exitY;
    const orderedPoints = isInbound ? waypoints : [...waypoints].reverse();
    const pointsXml =
      orderedPoints.length > 0
        ? `<Array as="points">${orderedPoints.map((pt) => `<mxPoint x="${pt.x}" y="${pt.y}"/>`).join("")}</Array>`
        : "";
    const edgeMetaAttr = item.underlyingEdgeIds
      ? ` mavisEdgeMetadata="${escapeXml(JSON.stringify({ underlyingEdgeIds: item.underlyingEdgeIds }))}"`
      : ` mavisRelationType="USES_API"`;

    cells.push(
      `<mxCell id="${item.edgeId}" mavisId="${escapeXml(item.mavisEdgeId)}" mavisRole="edge"${edgeMetaAttr} value="${escapeXml(item.actionLabel)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${p.line};strokeWidth=1.5;${item.provisional ? "dashed=1;dashPattern=6 4;" : ""}endArrow=block;endFill=1;fontFamily=Arial;fontSize=11;fontColor=${p.text};labelBackgroundColor=${p.background};exitX=${realExitX};exitY=${realExitY};exitPerimeter=0;entryX=${realEntryX};entryY=${realEntryY};entryPerimeter=0;" edge="1" parent="1" source="${sourceId}" target="${targetId}"><mxGeometry relative="1" as="geometry">${pointsXml}</mxGeometry></mxCell>`,
    );
  };

  // 1. TOP actors (straight vertical arrow down into top of system_center)
  if (bySide.TOP.length > 0) {
    const totalW = bySide.TOP.length * slotPitchX - (slotPitchX - cardWidth);
    const startX = Math.round(centerX - totalW / 2);
    bySide.TOP.forEach((item, idx) => {
      const x = startX + idx * slotPitchX;
      const ratio =
        bySide.TOP.length === 1
          ? 0.5
          : Number((0.25 + (idx / (bySide.TOP.length - 1)) * 0.5).toFixed(3));
      const cardCenterX = Math.round(x + cardWidth / 2);
      const sysTargetX = Math.round(sysX + sysWidth * ratio);
      const midY = Math.round((topY + cardHeight + sysY) / 2);
      const pts =
        Math.abs(cardCenterX - sysTargetX) <= 4
          ? []
          : [
              { x: cardCenterX, y: midY },
              { x: sysTargetX, y: midY },
            ];
      pushActorAndEdge(item, x, topY, 0.5, 1, ratio, 0, pts);
    });
  }

  // 2. BOTTOM actors (straight vertical arrow up into bottom of system_center)
  if (bySide.BOTTOM.length > 0) {
    const totalW = bySide.BOTTOM.length * slotPitchX - (slotPitchX - cardWidth);
    const startX = Math.round(centerX - totalW / 2);
    bySide.BOTTOM.forEach((item, idx) => {
      const x = startX + idx * slotPitchX;
      const ratio =
        bySide.BOTTOM.length === 1
          ? 0.5
          : Number((0.25 + (idx / (bySide.BOTTOM.length - 1)) * 0.5).toFixed(3));
      const cardCenterX = Math.round(x + cardWidth / 2);
      const sysTargetX = Math.round(sysX + sysWidth * ratio);
      const midY = Math.round((sysY + sysHeight + bottomYCard) / 2);
      const pts =
        Math.abs(cardCenterX - sysTargetX) <= 4
          ? []
          : [
              { x: cardCenterX, y: midY },
              { x: sysTargetX, y: midY },
            ];
      pushActorAndEdge(item, x, bottomYCard, 0.5, 0, ratio, 1, pts);
    });
  }

  // 3. LEFT actors (horizontal or clean stepped arrow into left face of system_center)
  if (bySide.LEFT.length > 0) {
    const totalH = bySide.LEFT.length * slotPitchY - (slotPitchY - cardHeight);
    const startY = Math.round(centerY - totalH / 2);
    bySide.LEFT.forEach((item, idx) => {
      const y = startY + idx * slotPitchY;
      const ratio =
        bySide.LEFT.length === 1
          ? 0.5
          : Number((0.26 + (idx / (bySide.LEFT.length - 1)) * 0.48).toFixed(3));
      const sourceY = Math.round(y + cardHeight / 2);
      const targetY = Math.round(sysY + sysHeight * ratio);
      const midX = Math.round((leftX + cardWidth + sysX) / 2);
      const pts =
        Math.abs(sourceY - targetY) <= 4
          ? []
          : [
              { x: midX, y: sourceY },
              { x: midX, y: targetY },
            ];
      pushActorAndEdge(item, leftX, y, 1, 0.5, 0, ratio, pts);
    });
  }

  // 4. RIGHT actors / external systems (horizontal or clean stepped arrow into right face of system_center)
  if (bySide.RIGHT.length > 0) {
    const totalH = bySide.RIGHT.length * slotPitchY - (slotPitchY - cardHeight);
    const startY = Math.round(centerY - totalH / 2);
    bySide.RIGHT.forEach((item, idx) => {
      const y = startY + idx * slotPitchY;
      const ratio =
        bySide.RIGHT.length === 1
          ? 0.5
          : Number((0.26 + (idx / (bySide.RIGHT.length - 1)) * 0.48).toFixed(3));
      const sourceY = Math.round(y + cardHeight / 2);
      const targetY = Math.round(sysY + sysHeight * ratio);
      const midX = Math.round((sysX + sysWidth + rightX) / 2);
      const pts =
        Math.abs(sourceY - targetY) <= 4
          ? []
          : [
              { x: midX, y: sourceY },
              { x: midX, y: targetY },
            ];
      pushActorAndEdge(item, rightX, y, 0, 0.5, 1, ratio, pts);
    });
  }

  const maxBottomY = Math.max(
    hasBottom ? bottomYCard + cardHeight : sysY + sysHeight,
    Math.round(centerY + sideStackHeight / 2),
  );
  const legendY = maxBottomY + 48;
  const legendLines = [
    "SYSTEM CONTEXT LEGEND (C4 LEVEL 1 — SYSTEM CONTEXT)",
    "• [Person] (Perimeter): Explicit actors with declared model relationships; roles are never inferred from controller or entity names.",
    "• Dashed security principal: inferred from a source access rule, not a confirmed human actor or observed interaction. Please verify the business role.",
    "• [Software System] (Center): Target software system treated as a black box (internal microservices, databases, and brokers are detailed in the C2 Container diagram).",
    "• Directed Arrow (───►): Declared relationship direction; not proof of observed traffic or business behavior.",
  ];
  const minVisualX = hasLeft ? leftX : sysX;
  const maxVisualX = hasRight ? rightX + cardWidth : sysX + sysWidth;
  const legendWidth = Math.min(880, Math.max(720, maxVisualX - minVisualX));
  const legendX = Math.max(64, Math.round(minVisualX + (maxVisualX - minVisualX - legendWidth) / 2));
  cells.push(
    `<mxCell id="mavis_legend" mavisRole="legend" value="${escapeXml(legendLines.join("\n"))}" style="rounded=1;arcSize=6;dashed=1;whiteSpace=wrap;html=0;fontFamily=Arial;fontSize=12;fontColor=${p.text};fillColor=${p.background};strokeColor=${p.border};align=left;verticalAlign=middle;spacing=12;" vertex="1" parent="1"><mxGeometry x="${legendX}" y="${legendY}" width="${legendWidth}" height="92" as="geometry"/></mxCell>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="MAVIS" agent="MAVIS" version="1"><diagram id="context-${escapeXml(model.id)}" name="C4 · CONTEXT"><mxGraphModel mavisC4Context="6" mavisDocument="${escapeXml(JSON.stringify(documentMeta))}" mavisModelId="${escapeXml(model.id)}" mavisViewId="context" mavisRuleVersion="mavis-se-3" mavisTheme="${theme}" grid="1" gridSize="10" page="0" background="${p.background}" connect="1" arrows="1" math="0" shadow="0"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}


