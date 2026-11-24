import { includesGraphOrigin } from "./service-overview";
import { modelSchema, type ArchitecturalModel, type Evidence } from "@/types/domain";
// S2c aggregate contract: normalize a missing/blank edge resolutionStatus to UNKNOWN, then a
// group keeps that single status only when every underlying edge agrees; with differing
// statuses the group reports UNKNOWN — meaning "no single status can represent this group",
// not "every underlying edge is UNKNOWN". uncertain stays an OR and underlyingEdgeIds stay
// complete. Source edges and stored data are never modified.
function normalizeResolutionStatus(value: string | undefined): string {
  return value && value.trim() !== "" ? value : "UNKNOWN";
}

interface EdgeEvidenceInfo {
  isKnown: boolean;
  hasCompleteIds: boolean;
  count: number | null;
  ids: string[];
}

function extractEdgeEvidence(edge: ArchitecturalModel["edges"][number]): EdgeEvidenceInfo {
  // If evidenceCount is explicitly null or undefined, the count is unknown
  if (edge.evidenceCount === null || edge.evidenceCount === undefined) {
    return {
      isKnown: false,
      hasCompleteIds: false,
      count: null,
      ids: Array.isArray(edge.evidenceIds) ? edge.evidenceIds : [],
    };
  }

  // Here evidenceCount is a known non-negative number
  const count = edge.evidenceCount;
  if (Array.isArray(edge.evidenceIds)) {
    return {
      isKnown: true,
      hasCompleteIds: true,
      count,
      ids: edge.evidenceIds,
    };
  }
  if (count === 0) {
    return {
      isKnown: true,
      hasCompleteIds: true,
      count: 0,
      ids: [],
    };
  }

  // Count is known (>0) but IDs were not loaded (count-only)
  return {
    isKnown: true,
    hasCompleteIds: false,
    count,
    ids: [],
  };
}

export function projectGraphModel(
  model: ArchitecturalModel,
  showComponents: boolean,
  origin: "all" | "source" | "deployment" | "runtime",
) {
  const byId = new Map(model.elements.map((node) => [node.id, node]));
  const architectureTypes = new Set([
    "SERVICE_CONTAINER",
    "DATABASE",
    "QUEUE_BROKER",
    "MESSAGE_CHANNEL",
    "PERSON",
    "EXTERNAL_SYSTEM",
  ]);
  const implementationTypes = new Set([
    "COMPONENT",
    "CLASS",
    "INTERFACE",
    "ENUM",
    "METHOD",
    "FIELD",
  ]);
  const representative = (id: string): string | null => {
    const node = byId.get(id);
    if (!node) return null;
    if (showComponents || architectureTypes.has(node.elementType ?? "")) return id;
    const seen = new Set<string>();
    let current = node;
    while (current.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      if (parent.elementType === "SERVICE_CONTAINER") return parent.id;
      current = parent;
    }
    // Do not guess ownership from names or connectivity. Unassigned internals
    // remain available when expanded; unknown top-level resources stay explicit.
    return implementationTypes.has(node.elementType ?? "") ? null : id;
  };
  let unassignedElements = 0,
    unassignedRelationships = 0;
  const members = new Map<string, string[]>();
  for (const node of model.elements) {
    const id = representative(node.id);
    if (id === null) {
      unassignedElements++;
      continue;
    }
    if (!members.has(id)) members.set(id, []);
    members.get(id)!.push(node.id);
  }
  const elements = [...members].map(([id, ids]) => {
    const node = byId.get(id)!;
    return {
      ...node,
      properties: { ...node.properties, componentCount: ids.length - 1, memberElementIds: ids },
    };
  });

  const groups = new Map<string, ArchitecturalModel["edges"][number]>();
  const groupUnderlying = new Map<string, ArchitecturalModel["edges"][number][]>();
  let filteredRelationships = 0,
    internalRelationships = 0;

  for (const edge of model.edges) {
    const included = includesGraphOrigin(edge, origin);
    if (!included) {
      filteredRelationships++;
      continue;
    }
    const from = representative(edge.from),
      to = representative(edge.to);
    if (from === null || to === null) {
      unassignedRelationships++;
      continue;
    }
    if (!showComponents && from === to && edge.from !== edge.to) {
      internalRelationships++;
      continue;
    }
    const key = showComponents
      ? JSON.stringify([from, to, edge.protocol, edge.originLayer])
      : JSON.stringify([from, to, edge.protocol]);
    const status = normalizeResolutionStatus(edge.resolutionStatus);

    let underList = groupUnderlying.get(key);
    if (!underList) {
      underList = [];
      groupUnderlying.set(key, underList);
    }
    underList.push(edge);

    const previous = groups.get(key);
    if (previous) {
      previous.underlyingEdgeIds!.push(edge.id);
      previous.uncertain ||= edge.uncertain;
      if (previous.resolutionStatus !== status) previous.resolutionStatus = "UNKNOWN";
      const prevOrig = previous.originLayer;
      const nextOrig = edge.originLayer;
      if (prevOrig === "STATIC_AND_RUNTIME" || nextOrig === "STATIC_AND_RUNTIME") {
        previous.originLayer = "STATIC_AND_RUNTIME";
      } else if (
        (prevOrig === "RUNTIME" && (nextOrig === "STATIC" || nextOrig === "CONFIG")) ||
        ((prevOrig === "STATIC" || prevOrig === "CONFIG") && nextOrig === "RUNTIME")
      ) {
        previous.originLayer = "STATIC_AND_RUNTIME";
      } else if (nextOrig === "RUNTIME") {
        previous.originLayer = "RUNTIME";
      }
      if (edge.properties) {
        const merged: Record<string, unknown> = { ...(previous.properties ?? {}) };
        for (const [k, v] of Object.entries(edge.properties)) {
          const existing = merged[k];
          if (existing === undefined || existing === null || existing === "") {
            merged[k] = v;
          }
        }
        previous.properties = merged;
      }
    } else {
      groups.set(key, {
        ...edge,
        resolutionStatus: status,
        from,
        to,
        properties: edge.properties ? { ...edge.properties } : undefined,
        underlyingEdgeIds: [edge.id],
      });
    }
  }

  const projectedEdges = [...groups.entries()].map(([key, representativeEdge]) => {
    const underlying = groupUnderlying.get(key) ?? [representativeEdge];

    // Collect distinct evidence objects
    const evidenceObjMap = new Map<string, Evidence>();
    for (const u of underlying) {
      if (Array.isArray(u.evidence)) {
        for (const ev of u.evidence) {
          if (ev?.id && !evidenceObjMap.has(ev.id)) {
            evidenceObjMap.set(ev.id, ev);
          }
        }
      }
    }

    // Case 1: Single edge in group (no other edges merged)
    if (underlying.length === 1) {
      const single = underlying[0]!;
      return {
        ...representativeEdge,
        evidenceCount: single.evidenceCount ?? null,
        evidenceIds: single.evidenceIds,
        evidence: Array.from(evidenceObjMap.values()),
      };
    }

    // Case 2: Multiple edges merged in group
    // Check if ALL underlying edges have known, complete IDs
    const evidenceInfos = underlying.map(extractEdgeEvidence);
    const allComplete = evidenceInfos.every((info) => info.isKnown && info.hasCompleteIds);

    if (allComplete) {
      const distinctIdSet = new Set<string>();
      for (const info of evidenceInfos) {
        for (const id of info.ids) {
          distinctIdSet.add(id);
        }
      }
      const distinctIds = Array.from(distinctIdSet);
      return {
        ...representativeEdge,
        evidenceCount: distinctIds.length,
        evidenceIds: distinctIds,
        evidence: Array.from(evidenceObjMap.values()),
      };
    }

    // If any edge has unknown evidence or count-only without IDs, distinct union cannot be known
    return {
      ...representativeEdge,
      evidenceCount: null,
      evidenceIds: undefined,
      evidence: Array.from(evidenceObjMap.values()),
    };
  });

  return {
    model: modelSchema.parse({ ...model, elements, edges: projectedEdges }),
    filteredRelationships,
    internalRelationships,
    unassignedElements,
    unassignedRelationships,
  };
}

export const graphCategories = [
  { id: "service", label: "Service", color: "#397ed7" },
  { id: "database", label: "Data store", color: "#16815d" },
  { id: "messaging", label: "Messaging", color: "#9455c9" },
  { id: "component", label: "Component", color: "#d65370" },
  { id: "external", label: "External System", color: "#b7791f" },
  { id: "unknown", label: "Unknown", color: "#94a3b8" },
] as const;

export type GraphCategory = (typeof graphCategories)[number]["id"];

export function graphCategory(type: string | undefined): GraphCategory {
  switch (type) {
    case "SERVICE_CONTAINER":
      return "service";
    case "DATABASE":
      return "database";
    case "QUEUE_BROKER":
    case "MESSAGE_CHANNEL":
      return "messaging";
    case "COMPONENT":
      return "component";
    case "PERSON":
    case "EXTERNAL_SYSTEM":
      return "external";
    default:
      return "unknown";
  }
}

// Filter the projected view without changing the canonical model or aggregated evidence.
export function filterGraphCategories(model: ArchitecturalModel, hidden: readonly GraphCategory[]) {
  if (!hidden.length) return model;
  const elements = model.elements.filter(
    (node) => !hidden.includes(graphCategory(node.elementType)),
  );
  const visible = new Set(elements.map((node) => node.id));
  const edges = model.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  return { ...model, elements, edges };
}

export function graphSelectionVisible(model: ArchitecturalModel, id: string): boolean {
  return (
    model.elements.some(
      (node) =>
        node.id === id ||
        (Array.isArray(node.properties?.["memberElementIds"]) &&
          node.properties["memberElementIds"].includes(id)),
    ) || model.edges.some((edge) => edge.id === id || edge.underlyingEdgeIds?.includes(id))
  );
}
