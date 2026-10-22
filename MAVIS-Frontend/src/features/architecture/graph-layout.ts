import type { ArchitecturalModel } from "@/types/domain";
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 62;
const layers = ["edge", "domain", "platform", "data"] as const;
export function layoutGraph(model: ArchitecturalModel) {
  const counts = new Map<string, number>();
  return model.elements.map((element) => {
    const row = counts.get(element.layer) ?? 0;
    counts.set(element.layer, row + 1);
    return { ...element, x: 40 + layers.indexOf(element.layer) * 250, y: 40 + row * 110 };
  });
}
