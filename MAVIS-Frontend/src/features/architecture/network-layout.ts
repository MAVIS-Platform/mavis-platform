import type { ArchitecturalModel } from "@/types/domain";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "./graph-layout";

type Point = { x: number; y: number };

function side(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

// A geometric score, not a change to relationship semantics. Shared endpoints
// are not crossings; label footprints reserve space below each circle.
export function networkLayoutCost(model: ArchitecturalModel, positions: Map<string, Point>) {
  const edges = model.edges.filter(
    (e) => e.from !== e.to && positions.has(e.from) && positions.has(e.to),
  );
  let score = 0;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!;
    const a = positions.get(edge.from)!,
      b = positions.get(edge.to)!;
    score += Math.hypot(b.x - a.x, b.y - a.y) * 0.002;
    for (let j = i + 1; j < edges.length; j++) {
      const other = edges[j]!;
      if ([edge.from, edge.to].includes(other.from) || [edge.from, edge.to].includes(other.to))
        continue;
      const c = positions.get(other.from)!,
        d = positions.get(other.to)!;
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) score += 10;
    }
    for (const [id, p] of positions) {
      if (id === edge.from || id === edge.to) continue;
      const corners = [
        { x: p.x - 88, y: p.y - 28 },
        { x: p.x + 88, y: p.y - 28 },
        { x: p.x + 88, y: p.y + 52 },
        { x: p.x - 88, y: p.y + 52 },
      ];
      if (
        corners.some((c, k) => {
          const d = corners[(k + 1) % 4]!;
          return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
        })
      )
        score += 30;
    }
  }
  return score;
}

export function networkPositions(model: ArchitecturalModel, aspectRatio = 2) {
  const nodes = layoutGraph(model);
  const positions = new Map(
    nodes.map((n) => [n.id, { x: n.x + NODE_WIDTH / 2, y: n.y + NODE_HEIGHT / 2 }]),
  );
  if (nodes.length < 2 || nodes.length > 300) return positions;
  const width =
    Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x)) + NODE_WIDTH;
  const height =
    Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)) + NODE_HEIGHT;
  // Expand the short axis to match the viewport; never compress label spacing.
  const target = Math.max(0.5, Math.min(4, aspectRatio));
  const scaleX = Math.max(1, (target * height) / width);
  const scaleY = Math.max(1, width / (target * height));
  for (const p of positions.values()) {
    p.x *= scaleX;
    p.y *= scaleY;
  }
  // Bound the optimization for interactive latency on larger models. Swapping
  // occupied slots preserves the collision-free spacing of the initial layout.
  if (nodes.length <= 60 && model.edges.length <= 120) {
    const ids = [...positions.keys()];
    let best = networkLayoutCost(model, positions);
    let remaining = 400;
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          if (--remaining < 0) break;
          const a = ids[i]!,
            b = ids[j]!,
            pa = positions.get(a)!,
            pb = positions.get(b)!;
          positions.set(a, pb);
          positions.set(b, pa);
          const score = networkLayoutCost(model, positions);
          if (score < best - 0.001) {
            best = score;
            improved = true;
          } else {
            positions.set(a, pa);
            positions.set(b, pb);
          }
        }
      if (!improved) break;
    }
  }
  return positions;
}
