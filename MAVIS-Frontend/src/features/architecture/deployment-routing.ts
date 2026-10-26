export interface DeploymentPoint {
  x: number;
  y: number;
}
export interface DeploymentBox extends DeploymentPoint {
  w: number;
  h: number;
}

export function deploymentSegmentHitsBox(
  a: DeploymentPoint,
  b: DeploymentPoint,
  box: DeploymentBox,
  pad = 10,
): boolean {
  const left = box.x - pad,
    right = box.x + box.w + pad;
  const top = box.y - pad,
    bottom = box.y + box.h + pad;
  return a.x === b.x
    ? a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
    : a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
}

// Search a rectilinear visibility grid built from actual box boundaries. Unlike
// fixed column corridors, these tracks also work with centered rows and moved boxes.
export function routeDeploymentPath(
  start: DeploymentPoint,
  end: DeploymentPoint,
  boxes: DeploymentBox[],
  previousPaths: DeploymentPoint[][],
  lane: number,
): DeploymentPoint[] | null {
  const clearance = 22 + (lane % 7) * 12;
  const altClearance = 22 + ((lane + 3) % 7) * 12;
  const xs = new Set([start.x, end.x]);
  const ys = new Set([start.y, end.y]);
  for (const b of boxes) {
    for (const c of [clearance, altClearance]) {
      xs.add(b.x - c);
      xs.add(b.x + b.w + c);
      ys.add(b.y - c);
      ys.add(b.y + b.h + c);
    }
  }
  const xx = [...xs].sort((a, b) => a - b),
    yy = [...ys].sort((a, b) => a - b);
  const width = xx.length,
    count = width * yy.length;
  const source = yy.indexOf(start.y) * width + xx.indexOf(start.x);
  const target = yy.indexOf(end.y) * width + xx.indexOf(end.x);
  const point = (id: number): DeploymentPoint => ({
    x: xx[id % width]!,
    y: yy[Math.floor(id / width)]!,
  });
  const blocked = new Uint8Array(count);
  for (let id = 0; id < count; id++) {
    const p = point(id);
    if (
      boxes.some(
        (b) => p.x > b.x - 10 && p.x < b.x + b.w + 10 && p.y > b.y - 10 && p.y < b.y + b.h + 10,
      )
    )
      blocked[id] = 1;
  }
  if (blocked[source] || blocked[target]) return null;
  // Include direction in the search state so unnecessary bends have a cost.
  const dist = new Float64Array(count * 2).fill(Infinity);
  const parent = new Int32Array(count * 2).fill(-1);
  const heap: Array<{ state: number; cost: number }> = [];
  const push = (item: { state: number; cost: number }) => {
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]!.cost <= item.cost) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const first = heap[0]!,
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.cost < heap[child]!.cost) child++;
        if (last.cost <= heap[child]!.cost) break;
        heap[i] = heap[child]!;
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const tracks = previousPaths.flatMap((path) => path.slice(1).map((b, i) => ({ a: path[i]!, b })));
  for (const dir of [0, 1]) {
    dist[source * 2 + dir] = 0;
    push({ state: source * 2 + dir, cost: 0 });
  }
  let final = -1;
  while (heap.length) {
    const { state, cost } = pop();
    if (cost !== dist[state]) continue;
    const id = Math.floor(state / 2),
      direction = state % 2;
    if (id === target) {
      final = state;
      break;
    }
    const a = point(id),
      col = id % width;
    const nextIds = [col > 0 ? id - 1 : -1, col + 1 < width ? id + 1 : -1, id - width, id + width];
    for (const next of nextIds) {
      if (next < 0 || next >= count || blocked[next]) continue;
      const b = point(next);
      if (boxes.some((box) => deploymentSegmentHitsBox(a, b, box))) continue;
      const dir = a.y === b.y ? 0 : 1;
      let penalty = direction === dir ? 0 : 32;
      for (const track of tracks) {
        const horizontal = track.a.y === track.b.y;
        if (horizontal === (dir === 0)) {
          const separation = dir === 0 ? Math.abs(a.y - track.a.y) : Math.abs(a.x - track.a.x);
          const overlap =
            dir === 0
              ? Math.min(Math.max(a.x, b.x), Math.max(track.a.x, track.b.x)) -
                Math.max(Math.min(a.x, b.x), Math.min(track.a.x, track.b.x))
              : Math.min(Math.max(a.y, b.y), Math.max(track.a.y, track.b.y)) -
                Math.max(Math.min(a.y, b.y), Math.min(track.a.y, track.b.y));
          if (separation < 16 && overlap > 0)
            penalty += separation < 1 ? 50000 + overlap * 200 : overlap * 8;
        } else {
          const h = dir === 0 ? { a, b } : track,
            v = dir === 0 ? track : { a, b };
          if (
            v.a.x >= Math.min(h.a.x, h.b.x) &&
            v.a.x <= Math.max(h.a.x, h.b.x) &&
            h.a.y >= Math.min(v.a.y, v.b.y) &&
            h.a.y <= Math.max(v.a.y, v.b.y)
          )
            penalty += 80;
        }
      }
      const nextState = next * 2 + dir;
      const nextCost = cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + penalty;
      if (nextCost < dist[nextState]!) {
        dist[nextState] = nextCost;
        parent[nextState] = state;
        push({ state: nextState, cost: nextCost });
      }
    }
  }
  if (final < 0) return null;
  const path: DeploymentPoint[] = [];
  for (let s = final; s >= 0; s = parent[s]!) path.push(point(Math.floor(s / 2)));
  path.reverse();
  return path.filter((p, i) => {
    if (i === 0 || i === path.length - 1) return true;
    const a = path[i - 1]!,
      b = path[i + 1]!;
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}
