import type { ArchitecturalModel } from "@/types/domain";
export function explainUrlTarget(
  model: ArchitecturalModel,
  target: string | null,
  kind: string | null,
) {
  if (!target) return null;
  if (kind === "relationship" && model.edges.some((edge) => edge.id === target))
    return { id: target, kind: "relationships" as const };
  if (kind !== "relationship" && model.elements.some((element) => element.id === target))
    return { id: target, kind: "elements" as const };
  return null;
}
