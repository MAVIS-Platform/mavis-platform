import type { ArchitecturalModel } from "@/types/domain";
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 62;

// Deterministic force layout: topology determines proximity, including when the
// analyzer cannot classify layers. Coordinates are view state, never model data.
export function layoutGraph(model: ArchitecturalModel) {
  const elements = [...model.elements].sort((a, b) => a.id.localeCompare(b.id));
  if (!elements.length) return [];
  const columns = Math.ceil(Math.sqrt(elements.length));
  const positions = elements.map((element, i) => ({
    ...element,
    x: (i % columns) * 240,
    y: Math.floor(i / columns) * 160,
  }));
  if (positions.length <= 300) {
    const index = new Map(positions.map((node, i) => [node.id, i]));
    const links = model.edges
      .filter((edge) => edge.from !== edge.to && index.has(edge.from) && index.has(edge.to))
      .map((edge) => [index.get(edge.from)!, index.get(edge.to)!] as const);
    const centerX = ((columns - 1) * 240) / 2;
    const centerY = ((Math.ceil(elements.length / columns) - 1) * 160) / 2;
    for (let step = 0; step < 220; step++) {
      const force = positions.map((node) => ({
        x: (centerX - node.x) * 0.012,
        y: (centerY - node.y) * 0.012,
      }));
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[j]!.x - positions[i]!.x || 0.01;
          const dy = positions[j]!.y - positions[i]!.y || 0.01;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const repulsion = 14000 / (distance * distance);
          const fx = (dx / distance) * repulsion;
          const fy = (dy / distance) * repulsion;
          force[i]!.x -= fx;
          force[i]!.y -= fy;
          force[j]!.x += fx;
          force[j]!.y += fy;
          const overlapX = NODE_WIDTH + 45 - Math.abs(dx);
          const overlapY = NODE_HEIGHT + 55 - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = Math.sign(dx) * overlapX * 0.3;
              force[i]!.x -= push;
              force[j]!.x += push;
            } else {
              const push = Math.sign(dy) * overlapY * 0.3;
              force[i]!.y -= push;
              force[j]!.y += push;
            }
          }
        }
      }
      for (const [i, j] of links) {
        const dx = positions[j]!.x - positions[i]!.x;
        const dy = positions[j]!.y - positions[i]!.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const pull = (distance - 250) * 0.025;
        force[i]!.x += (dx / distance) * pull;
        force[i]!.y += (dy / distance) * pull;
        force[j]!.x -= (dx / distance) * pull;
        force[j]!.y -= (dy / distance) * pull;
      }
      const speed = 1 - (step / 220) * 0.75;
      positions.forEach((node, i) => {
        node.x += Math.max(-20, Math.min(20, force[i]!.x)) * speed;
        node.y += Math.max(-20, Math.min(20, force[i]!.y)) * speed;
      });
    }
    // Resolve any remaining rectangular collisions after spring relaxation.
    for (let pass = 0; pass < 120; pass++) {
      let overlaps = false;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i]!;
          const b = positions[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ox = NODE_WIDTH + 28 - Math.abs(dx);
          const oy = NODE_HEIGHT + 28 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          overlaps = true;
          if (ox < oy) {
            const shift = (Math.sign(dx) || 1) * (ox / 2 + 0.1);
            a.x -= shift;
            b.x += shift;
          } else {
            const shift = (Math.sign(dy) || 1) * (oy / 2 + 0.1);
            a.y -= shift;
            b.y += shift;
          }
        }
      }
      if (!overlaps) break;
    }
  }
  const minX = Math.min(...positions.map((node) => node.x));
  const minY = Math.min(...positions.map((node) => node.y));
  return positions.map((node) => ({ ...node, x: node.x - minX + 55, y: node.y - minY + 55 }));
}

type Point = { x: number; y: number };
export function graphEdgePath(from: Point, to: Point, self = false) {
  const ax = from.x + NODE_WIDTH / 2;
  const ay = from.y + NODE_HEIGHT / 2;
  if (self) {
    return `M ${ax + 35} ${from.y} C ${ax + 110} ${from.y - 55}, ${ax - 110} ${from.y - 55}, ${ax - 35} ${from.y}`;
  }
  const bx = to.x + NODE_WIDTH / 2;
  const by = to.y + NODE_HEIGHT / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const scale = Math.max(
    Math.abs(dx) / (NODE_WIDTH / 2 + 3),
    Math.abs(dy) / (NODE_HEIGHT / 2 + 3),
    1,
  );
  const sx = ax + dx / scale;
  const sy = ay + dy / scale;
  const tx = bx - dx / scale;
  const ty = by - dy / scale;
  const length = Math.max(1, Math.hypot(dx, dy));
  // A small directional curve separates reciprocal relationships.
  return `M ${sx} ${sy} Q ${(sx + tx) / 2 - (dy / length) * 22} ${(sy + ty) / 2 + (dx / length) * 22}, ${tx} ${ty}`;
}
