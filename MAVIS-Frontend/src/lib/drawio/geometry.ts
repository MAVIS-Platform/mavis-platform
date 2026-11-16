export type Point = { x: number; y: number };
export type Rect = { id: string; x: number; y: number; width: number; height: number };
export type Route = { id: string; from: string; to: string; points: Point[] };

export const snap4 = (v: number) => Math.round(v / 4) * 4;

export function estimateLabelBox(text: string, fontSize = 11, isMono = false) {
  const lines = String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const effective = lines.length > 0 ? lines : [""];
  const maxChars = Math.max(...effective.map((l) => Array.from(l).length), 1);
  const charEm = isMono ? 0.62 : 0.6;
  const width = snap4(Math.max(44, Math.ceil(maxChars * fontSize * charEm + 14)));
  const lineH = Math.max(14, Math.round(fontSize * 1.35));
  const height = snap4(Math.max(20, effective.length * lineH + 6));
  return { width, height, lines: effective };
}

export function wrapEdgeLabelLines(text: string, maxChars = 22): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxChars || !clean.includes(" ")) return [clean];
  const mid = Math.floor(clean.length / 2);
  let splitAt = -1;
  for (let d = 0; d <= mid; d++) {
    if (clean[mid - d] === " ") {
      splitAt = mid - d;
      break;
    }
    if (mid + d < clean.length && clean[mid + d] === " ") {
      splitAt = mid + d;
      break;
    }
  }
  if (splitAt <= 2 || splitAt >= clean.length - 2) return [clean];
  return [clean.slice(0, splitAt).trim(), clean.slice(splitAt + 1).trim()];
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.5 &&
  a.x + a.width > b.x + 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  a.y + a.height > b.y + 0.5;

function crossesRect(a: Point, b: Point, r: Rect) {
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

export function segmentRidesRectBorder(a: Point, b: Point, r: Rect, tol = 1.5, minRun = 4) {
  if (Math.abs(a.y - b.y) < 0.1) {
    const onTop = Math.abs(a.y - r.y) <= tol;
    const onBottom = Math.abs(a.y - (r.y + r.height)) <= tol;
    if (!onTop && !onBottom) return false;
    const ov = Math.min(Math.max(a.x, b.x), r.x + r.width) - Math.max(Math.min(a.x, b.x), r.x);
    return ov > minRun;
  }
  if (Math.abs(a.x - b.x) < 0.1) {
    const onLeft = Math.abs(a.x - r.x) <= tol;
    const onRight = Math.abs(a.x - (r.x + r.width)) <= tol;
    if (!onLeft && !onRight) return false;
    const ov = Math.min(Math.max(a.y, b.y), r.y + r.height) - Math.max(Math.min(a.y, b.y), r.y);
    return ov > minRun;
  }
  return false;
}

export function segmentRectClearanceWithin(
  a: Point,
  b: Point,
  r: { x: number; y: number; width: number; height: number },
  pad = 4,
) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    maxX >= r.x - pad &&
    minX <= r.x + r.width + pad &&
    maxY >= r.y - pad &&
    minY <= r.y + r.height + pad
  );
}

export function simplifyOrthogonalPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const dedup: Point[] = [];
  for (const p of pts) {
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.abs(prev.x - p.x) > 0.5 || Math.abs(prev.y - p.y) > 0.5) {
      dedup.push({ x: p.x, y: p.y });
    }
  }
  const out: Point[] = [];
  for (const p of dedup) {
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5;
      const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5;
      if (sameX || sameY) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

export function applyPortRhythmBridge(pts: Point[], minJog = 16): Point[] {
  const clean = simplifyOrthogonalPoints(pts);
  if (clean.length !== 4) return clean;
  const [p0, p1, p2, p3] = clean as [Point, Point, Point, Point];
  // Horizontal-vertical-horizontal Z-jog with tiny vertical bridge
  if (Math.abs(p0.y - p1.y) < 0.5 && Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p2.y - p3.y) < 0.5) {
    const jog = Math.abs(p2.y - p1.y);
    if (jog > 0 && jog < minJog) {
      const midX = snap4((p0.x + p3.x) / 2);
      return [p0, { x: midX, y: p0.y }, { x: midX, y: p3.y }, p3];
    }
  }
  // Vertical-horizontal-vertical Z-jog with tiny horizontal bridge
  if (Math.abs(p0.x - p1.x) < 0.5 && Math.abs(p1.y - p2.y) < 0.5 && Math.abs(p2.x - p3.x) < 0.5) {
    const jog = Math.abs(p2.x - p1.x);
    if (jog > 0 && jog < minJog) {
      const midY = snap4((p0.y + p3.y) / 2);
      return [p0, { x: p0.x, y: midY }, { x: p3.x, y: midY }, p3];
    }
  }
  return clean;
}

export function spreadSidePorts<T extends { id: string; refCoord: number }>(
  items: T[],
  sideLength: number,
  cornerClearance = 16,
  minSeparation = 12,
): Map<string, number> {
  const result = new Map<string, number>();
  if (items.length === 0) return result;
  if (items.length === 1) {
    result.set(items[0]!.id, 0.5);
    return result;
  }
  const sorted = [...items].sort((a, b) => a.refCoord - b.refCoord || a.id.localeCompare(b.id));
  const safeLen = Math.max(32, sideLength);
  const minFrac = Math.min(0.35, Math.max(0.14, cornerClearance / safeLen));
  const maxFrac = 1 - minFrac;
  const maxStep = Math.max(minSeparation, 28) / safeLen;
  const rawSpan = Math.min(maxFrac - minFrac, (sorted.length - 1) * maxStep);
  const startFrac = 0.5 - rawSpan / 2;
  sorted.forEach((item, idx) => {
    const frac =
      sorted.length === 1
        ? 0.5
        : Number((startFrac + (idx / (sorted.length - 1)) * rawSpan).toFixed(3));
    result.set(item.id, Math.max(minFrac, Math.min(maxFrac, frac)));
  });
  return result;
}

export function slidingLabelCandidates(
  a: Point,
  b: Point,
  labelW: number,
  labelH: number,
  otherRoutes: Point[][] = [],
  normalGap = 8,
): Array<{ x: number; y: number; cx: number; cy: number; fraction: number }> {
  const isHoriz = Math.abs(a.y - b.y) < 0.5;
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  const needed = isHoriz ? labelW + 12 : labelH + 12;
  if (segLen < Math.min(28, needed * 0.45)) return [];

  const fractions = new Set<number>([0.5, 0.36, 0.64, 0.24, 0.76]);
  // Add archify-style sliding offsets adjacent to perpendicular route crossings along this segment
  if (segLen >= needed) {
    const lo = isHoriz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = isHoriz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const halfSpan = (isHoriz ? labelW : labelH) / 2 + 8;
    for (const r of otherRoutes) {
      for (let i = 1; i < r.length; i++) {
        const p1 = r[i - 1]!;
        const p2 = r[i]!;
        if (isHoriz && Math.abs(p1.x - p2.x) < 0.5) {
          if (p1.x > lo + 8 && p1.x < hi - 8 && a.y >= Math.min(p1.y, p2.y) - 6 && a.y <= Math.max(p1.y, p2.y) + 6) {
            for (const c of [p1.x - halfSpan, p1.x + halfSpan]) {
              const f = (c - a.x) / (b.x - a.x || 1);
              if (f >= 0.16 && f <= 0.84) fractions.add(Number(f.toFixed(3)));
            }
          }
        } else if (!isHoriz && Math.abs(p1.y - p2.y) < 0.5) {
          if (p1.y > lo + 8 && p1.y < hi - 8 && a.x >= Math.min(p1.x, p2.x) - 6 && a.x <= Math.max(p1.x, p2.x) + 6) {
            for (const c of [p1.y - halfSpan, p1.y + halfSpan]) {
              const f = (c - a.y) / (b.y - a.y || 1);
              if (f >= 0.16 && f <= 0.84) fractions.add(Number(f.toFixed(3)));
            }
          }
        }
      }
    }
  }

  const out: Array<{ x: number; y: number; cx: number; cy: number; fraction: number }> = [];
  const sortedFracs = [...fractions].sort((x, y) => Math.abs(x - 0.5) - Math.abs(y - 0.5));
  for (const f of sortedFracs) {
    const px = a.x + (b.x - a.x) * f;
    const py = a.y + (b.y - a.y) * f;
    for (const sign of [-1, 1]) {
      const cx = isHoriz ? px : px + sign * (labelW / 2 + normalGap);
      const cy = isHoriz ? py + sign * (labelH / 2 + normalGap) : py;
      out.push({
        x: snap4(cx - labelW / 2),
        y: snap4(cy - labelH / 2),
        cx: snap4(cx),
        cy: snap4(cy),
        fraction: f,
      });
    }
  }
  return out;
}

export function assignArcTrackLevels(
  spans: Array<{ id: string; low?: number; high?: number; start?: number; end?: number }>,
  padding = 4,
): Map<string, number> {
  const normalized = spans.map((s) => {
    const a = s.low ?? s.start ?? 0;
    const b = s.high ?? s.end ?? 0;
    return { id: s.id, low: Math.min(a, b), high: Math.max(a, b) };
  });
  const sorted = [...normalized].sort(
    (a, b) => a.high - a.low - (b.high - b.low) || a.low - b.low || a.id.localeCompare(b.id),
  );
  const trackIntervals: Array<Array<{ low: number; high: number }>> = [];
  const result = new Map<string, number>();
  for (const s of sorted) {
    let placed = -1;
    for (let t = 0; t < trackIntervals.length; t++) {
      const conflict = trackIntervals[t]!.some((iv) => !(s.high < iv.low - padding || s.low > iv.high + padding));
      if (!conflict) {
        placed = t;
        trackIntervals[t]!.push({ low: s.low, high: s.high });
        break;
      }
    }
    if (placed < 0) {
      placed = trackIntervals.length;
      trackIntervals.push([{ low: s.low, high: s.high }]);
    }
    result.set(s.id, placed);
  }
  return result;
}

export function inspectGeometry(nodes: Rect[], labels: Rect[], routes: Route[]) {
  let nodeOverlaps = 0,
    labelNodeOverlaps = 0,
    labelOverlaps = 0,
    edgeThroughNodes = 0,
    crossings = 0,
    diagonalSegments = 0,
    borderRides = 0,
    sharedRuns = 0,
    nearCornerPorts = 0;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) if (overlap(nodes[i]!, nodes[j]!)) nodeOverlaps++;
  for (const label of labels)
    for (const node of nodes) if (overlap(label, node)) labelNodeOverlaps++;
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlap(labels[i]!, labels[j]!)) labelOverlaps++;
  for (const route of routes) {
    const startPt = route.points[0];
    const endPt = route.points[route.points.length - 1];
    const checkCorner = (pt: Point | undefined, n: Rect | undefined) => {
      if (!pt || !n) return;
      const corners = [
        { x: n.x, y: n.y },
        { x: n.x + n.width, y: n.y },
        { x: n.x, y: n.y + n.height },
        { x: n.x + n.width, y: n.y + n.height },
      ];
      if (corners.some((c) => Math.hypot(pt.x - c.x, pt.y - c.y) < 8)) nearCornerPorts++;
    };
    checkCorner(startPt, nodeById.get(route.from));
    checkCorner(endPt, nodeById.get(route.to));
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!,
        b = route.points[i]!;
      if (Math.abs(a.x - b.x) > 0.1 && Math.abs(a.y - b.y) > 0.1) diagonalSegments++;
      for (const node of nodes)
        if (node.id !== route.from && node.id !== route.to) {
          if (crossesRect(a, b, node)) edgeThroughNodes++;
          else if (segmentRidesRectBorder(a, b, node)) borderRides++;
        }
    }
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
          if (Math.abs(a.y - b.y) < 0.1 && Math.abs(c.y - d.y) < 0.1 && Math.abs(a.y - c.y) <= 1.5) {
            const ov = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
            if (ov > 4) sharedRuns++;
          } else if (Math.abs(a.x - b.x) < 0.1 && Math.abs(c.x - d.x) < 0.1 && Math.abs(a.x - c.x) <= 1.5) {
            const ov = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
            if (ov > 4) sharedRuns++;
          }
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
    borderRides,
    sharedRuns,
    nearCornerPorts,
    needsReview:
      nodeOverlaps + labelNodeOverlaps + labelOverlaps + edgeThroughNodes + diagonalSegments > 0,
  };
}

