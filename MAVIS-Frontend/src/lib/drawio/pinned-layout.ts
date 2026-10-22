import { inspectGeometry, type Rect, type Route } from "./geometry";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { DiagramDocument } from "./rules";
type Layout = {
  graph: ElkNode;
  rects: Rect[];
  groups: Rect[];
  routes: Route[];
  labels: Rect[];
  quality: ReturnType<typeof inspectGeometry>;
};
type Point = { x: number; y: number };
const overlap = (a: Rect, b: Rect, pad = 16) =>
  a.x < b.x + b.width + pad &&
  a.x + a.width + pad > b.x &&
  a.y < b.y + b.height + pad &&
  a.y + a.height + pad > b.y;
function segmentHits(a: Point, b: Point, r: Rect, pad = 18) {
  if (Math.abs(a.x - b.x) < 0.1)
    return (
      a.x > r.x - pad + 0.1 &&
      a.x < r.x + r.width + pad - 0.1 &&
      Math.max(a.y, b.y) > r.y - pad + 0.1 &&
      Math.min(a.y, b.y) < r.y + r.height + pad - 0.1
    );
  return (
    a.y > r.y - pad + 0.1 &&
    a.y < r.y + r.height + pad - 0.1 &&
    Math.max(a.x, b.x) > r.x - pad + 0.1 &&
    Math.min(a.x, b.x) < r.x + r.width + pad - 0.1
  );
}
class Heap {
  values: { key: number; score: number }[] = [];
  push(value: { key: number; score: number }) {
    let i = this.values.length;
    this.values.push(value);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.values[p]!.score <= value.score) break;
      this.values[i] = this.values[p]!;
      i = p;
    }
    this.values[i] = value;
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop();
    if (!first || !last || !this.values.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.values.length) {
      let c = i * 2 + 1;
      if (c + 1 < this.values.length && this.values[c + 1]!.score < this.values[c]!.score) c++;
      if (this.values[c]!.score >= last.score) break;
      this.values[i] = this.values[c]!;
      i = c;
    }
    this.values[i] = last;
    return first;
  }
}
function routeGrid(start: Point, end: Point, obstacles: Rect[], placed: Route[]): Point[] {
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.x - 28, r.x + r.width + 28]),
      Math.min(start.x, end.x, ...obstacles.map((r) => r.x)) - 64,
      Math.max(start.x, end.x, ...obstacles.map((r) => r.x + r.width)) + 64,
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.y - 28, r.y + r.height + 28]),
      Math.min(start.y, end.y, ...obstacles.map((r) => r.y)) - 64,
      Math.max(start.y, end.y, ...obstacles.map((r) => r.y + r.height)) + 64,
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    source = ys.indexOf(start.y) * width + xs.indexOf(start.x),
    target = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const point = (key: number) => ({ x: xs[key % width]!, y: ys[Math.floor(key / width)]! });
  const heap = new Heap(),
    cost = new Map<number, number>([[source, 0]]),
    prev = new Map<number, number>();
  heap.push({ key: source, score: 0 });
  let visited = 0;
  while (heap.values.length && visited++ < 120000) {
    const current = heap.pop()!,
      index = current.key;
    if (index === target) {
      const points: Point[] = [];
      let cursor: number | undefined = target;
      while (cursor !== undefined) {
        points.push(point(cursor));
        cursor = prev.get(cursor);
      }
      return points.reverse();
    }
    const x = index % width,
      y = Math.floor(index / width),
      a = point(index);
    for (const next of [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < ys.length ? index + width : -1,
    ]) {
      if (next < 0) continue;
      const b = point(next);
      if (obstacles.some((r) => segmentHits(a, b, r))) continue;
      let penalty = 0;
      for (const route of placed)
        for (let i = 1; i < route.points.length; i++) {
          const c = route.points[i - 1]!,
            d = route.points[i]!;
          if (
            a.y === b.y &&
            c.x === d.x &&
            c.x > Math.min(a.x, b.x) &&
            c.x < Math.max(a.x, b.x) &&
            a.y > Math.min(c.y, d.y) &&
            a.y < Math.max(c.y, d.y)
          )
            penalty += 600;
          if (
            a.x === b.x &&
            c.y === d.y &&
            a.x > Math.min(c.x, d.x) &&
            a.x < Math.max(c.x, d.x) &&
            c.y > Math.min(a.y, b.y) &&
            c.y < Math.max(a.y, b.y)
          )
            penalty += 600;
        }
      const parent = prev.get(index),
        p = parent === undefined ? null : point(parent);
      if (p && (p.x === a.x) !== (a.x === b.x)) penalty += 32;
      const value = cost.get(index)! + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + penalty;
      if (value >= (cost.get(next) ?? Infinity) - 0.01) continue;
      cost.set(next, value);
      prev.set(next, index);
      heap.push({ key: next, score: value + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  throw new Error(
    "Locked positions leave no clear connector route. Move or unlock a shape and retry.",
  );
}
function simplify(points: Point[]) {
  return points.filter(
    (p, i) =>
      i === 0 ||
      i === points.length - 1 ||
      !(
        (points[i - 1]!.x === p.x && points[i + 1]!.x === p.x) ||
        (points[i - 1]!.y === p.y && points[i + 1]!.y === p.y)
      ),
  );
}
export function respectPins(candidate: Layout, doc: DiagramDocument): Layout {
  const fixed = new Map(
    doc.layoutJson.nodes.flatMap((node) => {
      const value = node["pinned"] as Partial<Rect> | undefined;
      if (!value) return [];
      if (
        ![value.x, value.y, value.width, value.height].every(
          (n) => typeof n === "number" && Number.isFinite(n),
        ) ||
        value.width! <= 0 ||
        value.height! <= 0
      )
        throw new Error("Invalid locked shape geometry");
      return [
        [
          node.id,
          { id: node.id, x: value.x!, y: value.y!, width: value.width!, height: value.height! },
        ] as const,
      ];
    }),
  );
  if (!fixed.size) return candidate;
  const rects = candidate.rects.map((r) => ({ ...r })),
    groups = candidate.groups.map((r) => ({ ...r }));
  for (const rect of rects) {
    const pin = fixed.get(rect.id);
    if (pin) {
      if (pin.width < rect.width - 0.1 || pin.height < rect.height - 0.1)
        throw new Error(
          "A locked shape is too small for its content. Resize or unlock it before relayout.",
        );
      Object.assign(rect, pin);
    }
  }
  const locked = rects.filter((r) => fixed.has(r.id));
  for (let i = 0; i < locked.length; i++)
    for (let j = i + 1; j < locked.length; j++)
      if (overlap(locked[i]!, locked[j]!, 0))
        throw new Error("Locked shapes overlap. Move or unlock them before relayout.");
  const placed = [...locked];
  for (const rect of rects.filter((r) => !fixed.has(r.id))) {
    let tries = 0;
    const x = rect.x,
      y = rect.y;
    while (placed.some((r) => overlap(rect, r, 36))) {
      tries++;
      if (tries > 1600) throw new Error("Cannot arrange remaining shapes around locks");
      rect.x = x + (tries % 20) * 96;
      rect.y = y + Math.floor(tries / 20) * 96;
    }
    placed.push(rect);
  }
  for (const group of groups) {
    const parent = group.id.slice("boundary_".length),
      pin = fixed.get(parent),
      children = rects.filter(
        (r) => doc.layoutJson.nodes.find((node) => node.id === r.id)?.parentId === parent,
      );
    if (pin) {
      Object.assign(group, { ...pin, id: group.id });
      if (
        children.some(
          (r) =>
            r.x < group.x + 24 ||
            r.y < group.y + 52 ||
            r.x + r.width > group.x + group.width - 24 ||
            r.y + r.height > group.y + group.height - 24,
        )
      )
        throw new Error(
          "Locked boundary has insufficient space. Unlock it or its children before relayout.",
        );
    } else if (children.length) {
      group.x = Math.min(...children.map((r) => r.x)) - 32;
      group.y = Math.min(...children.map((r) => r.y)) - 60;
      group.width = Math.max(...children.map((r) => r.x + r.width)) - group.x + 32;
      group.height = Math.max(...children.map((r) => r.y + r.height)) - group.y + 32;
    }
  }
  const all = [...rects, ...groups],
    lookup = (id: string) => all.find((r) => r.id === id || r.id === "boundary_" + id)!;
  const routes: Route[] = [],
    labels: Rect[] = [];
  const obstacles = [
    ...rects,
    ...groups.map((group) => ({ ...group, id: group.id + "_header", height: 44 })),
  ];
  const anchor = (old: Rect, current: Rect, point: Point) => {
    const x = Math.max(0, Math.min(1, (point.x - old.x) / old.width)),
      y = Math.max(0, Math.min(1, (point.y - old.y) / old.height));
    const actual = { x: current.x + current.width * x, y: current.y + current.height * y };
    const distances = [x, 1 - x, y, 1 - y];
    const side = distances.indexOf(Math.min(...distances));
    return {
      actual,
      outside: {
        x: actual.x + (side === 0 ? -32 : side === 1 ? 32 : 0),
        y: actual.y + (side === 2 ? -32 : side === 3 ? 32 : 0),
      },
    };
  };
  for (const original of candidate.routes) {
    const oldFrom =
        candidate.rects.find((r) => r.id === original.from) ??
        candidate.groups.find((r) => r.id === "boundary_" + original.from)!,
      oldTo =
        candidate.rects.find((r) => r.id === original.to) ??
        candidate.groups.find((r) => r.id === "boundary_" + original.to)!;
    const from = anchor(oldFrom, lookup(original.from), original.points[0]!),
      to = anchor(oldTo, lookup(original.to), original.points.at(-1)!);
    const points = simplify([
      from.actual,
      ...routeGrid(from.outside, to.outside, obstacles, routes),
      to.actual,
    ]);
    routes.push({ ...original, points });
    const oldLabel = candidate.labels.find((label) => label.id === original.id);
    if (!oldLabel) continue;
    let label: Rect | undefined;
    for (let distance = 8; distance <= 120 && !label; distance += 16)
      for (let i = 1; i < points.length && !label; i++) {
        const a = points[i - 1]!,
          b = points[i]!,
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        for (const r of [
          { ...oldLabel, x: mid.x - oldLabel.width / 2, y: mid.y - oldLabel.height - distance },
          { ...oldLabel, x: mid.x - oldLabel.width / 2, y: mid.y + distance },
          { ...oldLabel, x: mid.x + distance, y: mid.y - oldLabel.height / 2 },
          { ...oldLabel, x: mid.x - oldLabel.width - distance, y: mid.y - oldLabel.height / 2 },
        ])
          if (
            !obstacles.some((node) => overlap(r, node, 4)) &&
            !labels.some((other) => overlap(r, other, 8))
          ) {
            label = r;
            break;
          }
      }
    if (!label)
      throw new Error("Locked layout has no room for relationship labels. Move or unlock a shape.");
    labels.push(label);
  }
  const quality = inspectGeometry(rects, labels, routes);
  if (quality.needsReview)
    throw new Error(
      "Locked layout did not pass geometry checks. Your original draft was preserved.",
    );
  return {
    ...candidate,
    rects,
    groups,
    routes,
    labels,
    quality,
    graph: {
      ...candidate.graph,
      width: Math.max(...all.map((r) => r.x + r.width)) + 36,
      height:
        Math.max(...all.map((r) => r.y + r.height), ...labels.map((r) => r.y + r.height)) + 36,
    },
  };
}
