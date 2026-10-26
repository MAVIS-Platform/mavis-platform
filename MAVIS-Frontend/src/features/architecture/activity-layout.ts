import type { DeploymentBox, DeploymentPoint } from "./deployment-routing";

// Derive layout from the control-flow graph rather than serialization order.
// Remove only DFS back edges from the layout DAG; loop edges still render.
export function planActivityRows(
  nodes: Array<{ nodeId: string; partitionId: string; kind: string }>,
  edges: Array<{ from: string; to: string }>,
): Map<string, number> {
  const cmpId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const children = new Map(nodes.map((n) => [n.nodeId, new Set<string>()]));
  for (const e of edges)
    if (e.from !== e.to && byId.has(e.from) && byId.has(e.to)) children.get(e.from)!.add(e.to);
  const color = new Map<string, number>();
  const back = new Set<string>();
  const visit = (id: string) => {
    color.set(id, 1);
    for (const child of [...children.get(id)!].sort(cmpId)) {
      if (color.get(child) === 1) back.add(JSON.stringify([id, child]));
      else if (!color.has(child)) visit(child);
    }
    color.set(id, 2);
  };
  const ordered = [...nodes].sort(
    (a, b) =>
      Number(b.kind === "INITIAL") - Number(a.kind === "INITIAL") ||
      cmpId(a.nodeId, b.nodeId),
  );
  for (const n of ordered) if (!color.has(n.nodeId)) visit(n.nodeId);
  const parents = new Map(nodes.map((n) => [n.nodeId, new Set<string>()]));
  for (const [id, list] of children)
    for (const child of list) {
      if (back.has(JSON.stringify([id, child]))) list.delete(child);
      else parents.get(child)!.add(id);
    }
  const pending = new Map([...parents].map(([id, list]) => [id, list.size]));
  const queue = ordered.filter((n) => pending.get(n.nodeId) === 0).map((n) => n.nodeId);
  const rows = new Map<string, number>(),
    occupied = new Map<string, Set<number>>();
  while (queue.length) {
    const id = queue.shift()!,
      node = byId.get(id)!;
    let row = Math.max(0, ...[...parents.get(id)!].map((p) => rows.get(p)! + 1));
    const lane = occupied.get(node.partitionId) ?? new Set<number>();
    while (lane.has(row)) row++;
    rows.set(id, row);
    lane.add(row);
    occupied.set(node.partitionId, lane);
    const immediateTerms: string[] = [];
    for (const child of [...children.get(id)!].sort(cmpId)) {
      pending.set(child, pending.get(child)! - 1);
      if (pending.get(child) === 0) {
        const childNode = byId.get(child)!;
        if (
          childNode.partitionId === node.partitionId &&
          (childNode.kind === "FLOW_FINAL" || childNode.kind === "ACTIVITY_FINAL")
        ) {
          immediateTerms.push(child);
        } else {
          queue.push(child);
        }
      }
    }
    if (immediateTerms.length > 0) queue.unshift(...immediateTerms);
  }
  return rows;
}

export function activityNodeSize(kind: string, label: string): { w: number; h: number } {
  if (["INITIAL", "ACTIVITY_FINAL", "FLOW_FINAL"].includes(kind)) return { w: 36, h: 36 };
  if (["FORK", "JOIN"].includes(kind)) return { w: 220, h: 10 };
  const diamond = kind === "DECISION" || kind === "MERGE";
  const w = diamond ? 220 : 280;
  const chars = diamond ? 22 : 38;
  const lines = label
    .split(/\n|<br\s*\/?\s*>/i)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0);
  return { w, h: diamond ? Math.max(96, lines * 32 + 32) : Math.max(68, lines * 17 + 30) };
}

export function placeActivityGuard(
  path: DeploymentPoint[],
  text: string,
  obstacles: DeploymentBox[],
): { position: number; dx: number; dy: number; box: DeploymentBox } | null {
  // Port stubs split a straight corridor into several short pieces. Measure
  // the whole corridor or short same-lane branches cannot place their guard.
  const distinct = path.filter(
    (p, i) => i === 0 || p.x !== path[i - 1]!.x || p.y !== path[i - 1]!.y,
  );
  path = distinct.filter((p, i) => {
    if (i === 0 || i === distinct.length - 1) return true;
    const a = distinct[i - 1]!,
      b = distinct[i + 1]!;
    return !(
      (a.x === p.x && p.x === b.x && (p.y - a.y) * (b.y - p.y) >= 0) ||
      (a.y === p.y && p.y === b.y && (p.x - a.x) * (b.x - p.x) >= 0)
    );
  });
  const lengths = path
    .slice(1)
    .map((p, i) => Math.abs(p.x - path[i]!.x) + Math.abs(p.y - path[i]!.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const w = Math.max(56, text.length * 6.5 + 20),
    h = 24;
  const candidates: Array<{
    position: number;
    dx: number;
    dy: number;
    box: DeploymentBox;
    score: number;
  }> = [];
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = path[i]!,
      b = path[i + 1]!,
      horizontal = a.y === b.y;
    if (lengths[i]! < (horizontal ? w + 16 : h + 16)) {
      walked += lengths[i]!;
      continue;
    }
    for (const fraction of [0.5, 0.25, 0.75]) {
      for (const side of [-1, 1]) {
        const dx = horizontal ? 0 : side * (w / 2 + 14),
          dy = horizontal ? side * 20 : 0;
        const box = {
          x: a.x + (b.x - a.x) * fraction + dx - w / 2,
          y: a.y + (b.y - a.y) * fraction + dy - h / 2,
          w,
          h,
        };
        if (
          obstacles.some(
            (o) =>
              box.x < o.x + o.w + 6 &&
              box.x + w > o.x - 6 &&
              box.y < o.y + o.h + 6 &&
              box.y + h > o.y - 6,
          )
        )
          continue;
        candidates.push({
          position: total ? (2 * (walked + lengths[i]! * fraction)) / total - 1 : 0,
          dx,
          dy,
          box,
          score: (horizontal ? 0 : 10000) + walked + Math.abs(fraction - 0.5) * 100,
        });
      }
    }
    walked += lengths[i]!;
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}
