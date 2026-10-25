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
  const representative = (id: string) => {
    const seen = new Set<string>();
    while (
      !showComponents &&
      byId.get(id)?.parentId &&
      byId.has(byId.get(id)!.parentId!) &&
      !seen.has(id)
    ) {
      seen.add(id);
      id = byId.get(id)!.parentId!;
    }
    return id;
  };
  const members = new Map<string, string[]>();
  for (const node of model.elements) {
    const id = representative(node.id);
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
    const deployment = edge.originLayer === "DEPLOYMENT" || edge.protocol === "DECLARED_COMPOSE",
      runtime = edge.originLayer === "RUNTIME" || edge.originLayer === "STATIC_AND_RUNTIME";
    const included =
      origin === "all" ||
      (origin === "deployment" && deployment) ||
      (origin === "runtime" && runtime) ||
      (origin === "source" && !deployment && edge.originLayer !== "RUNTIME");
    if (!included) {
      filteredRelationships++;
      continue;
    }
    const from = representative(edge.from),
      to = representative(edge.to);
    if (!showComponents && from === to && edge.from !== edge.to) {
      internalRelationships++;
      continue;
    }
    const key = JSON.stringify([from, to, edge.protocol, edge.originLayer]);
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
    } else {
      groups.set(key, {
        ...edge,
        resolutionStatus: status,
        from,
        to,
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
  };
}
