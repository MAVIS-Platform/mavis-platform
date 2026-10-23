import { modelSchema, type ArchitecturalModel } from "@/types/domain";
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
    const previous = groups.get(key);
    if (previous) {
      previous.underlyingEdgeIds!.push(edge.id);
      previous.uncertain ||= edge.uncertain;
    } else groups.set(key, { ...edge, from, to, underlyingEdgeIds: [edge.id] });
  }
  return {
    model: modelSchema.parse({ ...model, elements, edges: [...groups.values()] }),
    filteredRelationships,
    internalRelationships,
  };
}
