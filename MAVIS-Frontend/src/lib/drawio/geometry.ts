export type Rect = { id: string; x: number; y: number; width: number; height: number };
export type Route = { id: string; from: string; to: string; points: { x: number; y: number }[] };
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.5 &&
  a.x + a.width > b.x + 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  a.y + a.height > b.y + 0.5;
function crossesRect(a: { x: number; y: number }, b: { x: number; y: number }, r: Rect) {
  if (Math.abs(a.y - b.y) < 0.1)
    return (
      a.y > r.y + 0.5 &&
      a.y < r.y + r.height - 0.5 &&
      Math.max(a.x, b.x) > r.x + 0.5 &&
      Math.min(a.x, b.x) < r.x + r.width - 0.5
    );
  if (Math.abs(a.x - b.x) < 0.1)
    return (
      a.x > r.x + 0.5 &&
      a.x < r.x + r.width - 0.5 &&
      Math.max(a.y, b.y) > r.y + 0.5 &&
      Math.min(a.y, b.y) < r.y + r.height - 0.5
    );
  return false;
}
export function inspectGeometry(nodes: Rect[], labels: Rect[], routes: Route[]) {
  let nodeOverlaps = 0,
    labelNodeOverlaps = 0,
    labelOverlaps = 0,
    edgeThroughNodes = 0,
    crossings = 0,
    diagonalSegments = 0;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) if (overlap(nodes[i]!, nodes[j]!)) nodeOverlaps++;
  for (const label of labels)
    for (const node of nodes) if (overlap(label, node)) labelNodeOverlaps++;
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlap(labels[i]!, labels[j]!)) labelOverlaps++;
  for (const route of routes)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!,
        b = route.points[i]!;
      if (Math.abs(a.x - b.x) > 0.1 && Math.abs(a.y - b.y) > 0.1) diagonalSegments++;
      for (const node of nodes)
        if (node.id !== route.from && node.id !== route.to && crossesRect(a, b, node))
          edgeThroughNodes++;
    }
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const r = routes[i]!,
        s = routes[j]!;
      for (let x = 1; x < r.points.length; x++)
        for (let y = 1; y < s.points.length; y++) {
          let a = r.points[x - 1]!,
            b = r.points[x]!,
            c = s.points[y - 1]!,
            d = s.points[y]!;
          if (Math.abs(a.x - b.x) < 0.1 && Math.abs(c.y - d.y) < 0.1) {
            [a, c] = [c, a];
            [b, d] = [d, b];
          }
          if (
            Math.abs(a.y - b.y) < 0.1 &&
            Math.abs(c.x - d.x) < 0.1 &&
            c.x > Math.min(a.x, b.x) + 0.5 &&
            c.x < Math.max(a.x, b.x) - 0.5 &&
            a.y > Math.min(c.y, d.y) + 0.5 &&
            a.y < Math.max(c.y, d.y) - 0.5
          )
            crossings++;
        }
    }
  return {
    nodeOverlaps,
    labelNodeOverlaps,
    labelOverlaps,
    edgeThroughNodes,
    diagonalSegments,
    crossings,
    needsReview:
      nodeOverlaps + labelNodeOverlaps + labelOverlaps + edgeThroughNodes + diagonalSegments > 0,
  };
}
