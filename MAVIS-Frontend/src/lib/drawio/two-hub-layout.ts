import type { DiagramDocument } from "./rules";
import { ends, relationLabel, wrapText } from "./rules";
import { inspectGeometry, type Rect, type Route } from "./geometry";
// A planar two-hub fan is common for configuration/discovery dependencies.
// Recognize topology, never service names; preserve all vertices and directions.
export function twoHubLayout(sizes: Rect[], edges: DiagramDocument["layoutJson"]["edges"]) {
  const neighbors = new Map(sizes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    const { from, to } = ends(edge);
    if (from === to) return null;
    neighbors.get(from)!.add(to);
    neighbors.get(to)!.add(from);
  }
  const hubs = sizes
    .filter((node) => neighbors.get(node.id)!.size > 2)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (hubs.length !== 2) return null;
  const [a, b] = hubs as [Rect, Rect];
  const leaves = sizes
    .filter((node) => node.id !== a.id && node.id !== b.id && neighbors.get(node.id)!.size > 0)
    .sort((x, y) => x.id.localeCompare(y.id));
  if (
    leaves.length < 3 ||
    leaves.length > 12 ||
    leaves.some((node) => {
      const set = neighbors.get(node.id)!;
      return set.size !== 2 || !set.has(a.id) || !set.has(b.id);
    })
  )
    return null;
  const hubEdges = edges.filter((edge) => {
    const e = ends(edge);
    return [a.id, b.id].includes(e.from) && [a.id, b.id].includes(e.to);
  });
  if (hubEdges.length > 1 || edges.length !== leaves.length * 2 + hubEdges.length) return null;
  const measure = (edge: (typeof edges)[number]) => {
    const lines = wrapText(relationLabel(edge), 24);
    return {
      width: Math.max(...lines.map((line) => Array.from(line).length)) * 7.5 + 16,
      height: lines.length * 17 + 10,
    };
  };
  const widest = Math.max(...edges.map((edge) => measure(edge).width));
  const laneGap = 28,
    lanes = Math.ceil(leaves.length / 2),
    corridor = widest + lanes * laneGap + 80;
  const leafX = 36 + a.width + corridor,
    rightX = leafX + Math.max(...leaves.map((node) => node.width)) + corridor;
  const step = Math.max(...leaves.map((node) => node.height)) + 88;
  const total = step * (leaves.length - 1) + Math.max(...leaves.map((node) => node.height));
  const left = { ...a, x: 36, y: 36 + (total - a.height) / 2 },
    right = { ...b, x: rightX, y: 36 + (total - b.height) / 2 };
  const positioned = leaves.map((node, i) => ({ ...node, x: leafX, y: 36 + i * step }));
  const rects: Rect[] = [left, right, ...positioned],
    routes: Route[] = [],
    labels: Rect[] = [];
  const oriented = (edge: (typeof edges)[number], from: string, points: Route["points"]) => {
    const actual = ends(edge);
    routes.push({
      id: edge.id,
      from: actual.from,
      to: actual.to,
      points: actual.from === from ? points : [...points].reverse(),
    });
  };
  for (let i = 0; i < positioned.length; i++) {
    const leaf = positioned[i]!,
      y = leaf.y + leaf.height / 2;
    for (const hub of [left, right]) {
      const edge = edges.find((edge) => {
        const e = ends(edge);
        return (e.from === leaf.id && e.to === hub.id) || (e.to === leaf.id && e.from === hub.id);
      })!;
      const portY = hub.y + (hub.height * (i + 1)) / (positioned.length + 1),
        above = y < portY;
      const distance = laneGap * (above ? i + 1 : positioned.length - i);
      const isLeft = hub.id === left.id,
        hubX = isLeft ? hub.x + hub.width : hub.x;
      const laneX = isLeft ? hubX + distance : hubX - distance,
        leafPortX = isLeft ? leaf.x : leaf.x + leaf.width;
      oriented(edge, leaf.id, [
        { x: leafPortX, y },
        { x: laneX, y },
        { x: laneX, y: portY },
        { x: hubX, y: portY },
      ]);
      const size = measure(edge);
      labels.push({
        id: edge.id,
        x: isLeft ? leaf.x - size.width - 24 : leaf.x + leaf.width + 24,
        y: y - size.height - 8,
        ...size,
      });
    }
  }
  const bottom = 36 + total + 80;
  for (const edge of hubEdges) {
    const x1 = left.x + left.width / 2,
      x2 = right.x + right.width / 2;
    oriented(edge, left.id, [
      { x: x1, y: left.y + left.height },
      { x: x1, y: bottom },
      { x: x2, y: bottom },
      { x: x2, y: right.y + right.height },
    ]);
    const size = measure(edge);
    labels.push({ id: edge.id, x: (x1 + x2 - size.width) / 2, y: bottom + 8, ...size });
  }
  const isolated = sizes.filter((node) => !neighbors.get(node.id)!.size);
  isolated.forEach((node, i) =>
    rects.push({ ...node, x: 36 + i * (node.width + 64), y: bottom + 160 }),
  );
  const graph = {
    id: "root",
    width: Math.max(...rects.map((node) => node.x + node.width)) + 36,
    height: Math.max(bottom + 70, ...rects.map((node) => node.y + node.height)) + 36,
  };
  return {
    graph,
    rects,
    labels,
    routes,
    groups: [] as Rect[],
    quality: inspectGeometry(rects, labels, routes),
  };
}
