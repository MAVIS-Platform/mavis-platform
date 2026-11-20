"use client";

import { useEffect, useId, useMemo, useState } from "react";

interface ParsedSvgNode {
  id: string;
  mavisId: string;
  role: string;
  parent: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startSize: number;
  dashed: boolean;
  isGroup: boolean;
  shape: "boundary" | "cylinder" | "channel" | "ellipse" | "rhombus" | "card";
}

interface ParsedSvgEdgeLabel {
  id: string;
  edgeId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParsedSvgEdge {
  id: string;
  mavisId: string;
  source: string;
  target: string;
  sourcePoint: { x: number; y: number } | null;
  targetPoint: { x: number; y: number } | null;
  label: string;
  dashed: boolean;
  exitX: number | null;
  exitY: number | null;
  entryX: number | null;
  entryY: number | null;
  points: Array<{ x: number; y: number }>;
}

interface ParsedDiagram {
  title: string;
  scopeMeta: string;
  hasLegend: boolean;
  nodes: ParsedSvgNode[];
  edges: ParsedSvgEdge[];
  edgeLabels: ParsedSvgEdgeLabel[];
  resolvedById: Map<string, ParsedSvgNode>;
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
  viewBox: string;
  hasBoundary: boolean;
  hasDatabase: boolean;
  hasChannel: boolean;
  hasDashedEdge: boolean;
}

export function getSvgNodePalette(
  role: string,
  shape: ParsedSvgNode["shape"],
  isDark: boolean,
) {
  if (shape === "boundary" || role === "boundary") {
    return isDark
      ? {
          fill: "rgba(15, 23, 42, 0.52)",
          stroke: "#334155",
          accent: "#38bdf8",
          headerFill: "rgba(30, 41, 59, 0.72)",
          title: "#e2e8f0",
          tag: "#94a3b8",
          sub: "#94a3b8",
        }
      : {
          fill: "rgba(255, 255, 255, 0.72)",
          stroke: "#64748b",
          accent: "#2563eb",
          headerFill: "#e2e8f0",
          title: "#0f172a",
          tag: "#334155",
          sub: "#475569",
        };
  }
  if (shape === "cylinder" || role === "DATABASE" || role === "DATASTORE_GROUP") {
    return isDark
      ? {
          fill: "#072019",
          stroke: "#10b981",
          accent: "#34d399",
          headerFill: "#0b2e24",
          title: "#ecfdf5",
          tag: "#6ee7b7",
          sub: "#94a3b8",
        }
      : {
          fill: "#ecfdf5",
          stroke: "#059669",
          accent: "#059669",
          headerFill: "#a7f3d0",
          title: "#064e3b",
          tag: "#047857",
          sub: "#334155",
        };
  }
  if (
    shape === "channel" ||
    role === "MESSAGE_CHANNEL" ||
    role === "QUEUE_BROKER" ||
    role === "CHANNEL_GROUP"
  ) {
    return isDark
      ? {
          fill: "#1a112d",
          stroke: "#a855f7",
          accent: "#c084fc",
          headerFill: "#251842",
          title: "#f5f3ff",
          tag: "#d8b4fe",
          sub: "#94a3b8",
        }
      : {
          fill: "#f5f3ff",
          stroke: "#7c3aed",
          accent: "#7c3aed",
          headerFill: "#ddd6fe",
          title: "#2e1065",
          tag: "#6d28d9",
          sub: "#334155",
        };
  }
  if (
    role === "COMPONENT" ||
    role === "LOGICAL_COMPONENT" ||
    role === "CLASS_INTERFACE" ||
    role === "PACKAGE"
  ) {
    return isDark
      ? {
          fill: "#0c2126",
          stroke: "#14b8a6",
          accent: "#2dd4bf",
          headerFill: "#112f36",
          title: "#f0fdfa",
          tag: "#5eead4",
          sub: "#94a3b8",
        }
      : {
          fill: "#ffffff",
          stroke: "#0d9488",
          accent: "#0d9488",
          headerFill: "#ccfbf1",
          title: "#0f172a",
          tag: "#0f766e",
          sub: "#475569",
        };
  }
  if (role === "EXTERNAL_SYSTEM" || shape === "rhombus") {
    return isDark
      ? {
          fill: "#1c1917",
          stroke: "#78716c",
          accent: "#f59e0b",
          headerFill: "#292524",
          title: "#f5f5f4",
          tag: "#fcd34d",
          sub: "#a8a29e",
        }
      : {
          fill: "#fffbeb",
          stroke: "#d97706",
          accent: "#d97706",
          headerFill: "#fde68a",
          title: "#451a03",
          tag: "#b45309",
          sub: "#57534e",
        };
  }
  if (role === "SYSTEM" || role === "SOFTWARE_SYSTEM" || role === "PERSON") {
    return isDark
      ? {
          fill: "#0c1f36",
          stroke: "#38bdf8",
          accent: "#38bdf8",
          headerFill: "#102b4a",
          title: "#f0f9ff",
          tag: "#7dd3fc",
          sub: "#94a3b8",
        }
      : {
          fill: "#ffffff",
          stroke: "#2563eb",
          accent: "#2563eb",
          headerFill: "#dbeafe",
          title: "#0f172a",
          tag: "#1d4ed8",
          sub: "#475569",
        };
  }
  return isDark
    ? {
        fill: "#0f1b30",
        stroke: "#3b82f6",
        accent: "#60a5fa",
        headerFill: "#142642",
        title: "#f1f5f9",
        tag: "#93c5fd",
        sub: "#94a3b8",
      }
    : {
        fill: "#ffffff",
        stroke: "#2563eb",
        accent: "#2563eb",
        headerFill: "#dbeafe",
        title: "#0f172a",
        tag: "#1d4ed8",
        sub: "#475569",
      };
}

function clipRectEdge(
  from: { x: number; y: number; width: number; height: number },
  towards: { x: number; y: number },
) {
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const scale = Math.min(
    Math.abs(dx) > 0.01 ? from.width / 2 / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.01 ? from.height / 2 / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function buildRoundedPolylinePath(pts: Array<{ x: number; y: number }>, radius = 6): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  if (pts.length === 2) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;
  const cmds = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const curr = pts[i]!;
    const next = pts[i + 1]!;
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (r < 1) {
      cmds.push(`L ${curr.x} ${curr.y}`);
      continue;
    }
    const p1x = curr.x - ((curr.x - prev.x) / d1) * r;
    const p1y = curr.y - ((curr.y - prev.y) / d1) * r;
    const p2x = curr.x + ((next.x - curr.x) / d2) * r;
    const p2y = curr.y + ((next.y - curr.y) / d2) * r;
    cmds.push(`L ${p1x} ${p1y} Q ${curr.x} ${curr.y} ${p2x} ${p2y}`);
  }
  const last = pts[pts.length - 1]!;
  cmds.push(`L ${last.x} ${last.y}`);
  return cmds.join(" ");
}

function wrapSvgLines(lines: string[], maxChars: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const rawLine of lines) {
    if (rawLine.length <= maxChars) {
      out.push(rawLine);
    } else {
      const words = rawLine.split(/\s+/);
      let acc = "";
      for (const word of words) {
        if (!acc) {
          acc = word.length > maxChars ? word.slice(0, Math.max(4, maxChars - 1)) + "…" : word;
        } else if (acc.length + 1 + word.length <= maxChars) {
          acc += " " + word;
        } else {
          out.push(acc);
          acc = word.length > maxChars ? word.slice(0, Math.max(4, maxChars - 1)) + "…" : word;
        }
        if (out.length >= maxLines) break;
      }
      if (acc && out.length < maxLines) out.push(acc);
    }
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseDiagramXml(xml: string): ParsedDiagram | null {
  if (!xml || typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const nodesById = new Map<string, ParsedSvgNode>();
    const edgeLabels: ParsedSvgEdgeLabel[] = [];
    const edges: ParsedSvgEdge[] = [];
    let title = "";
    let scopeMeta = "";
    let hasLegend = false;

    const getStyleProp = (style: string, key: string, fallback: string): string => {
      const m = new RegExp(`(?:^|;)${key}=([^;]+)`).exec(style);
      return m?.[1]?.trim() || fallback;
    };
    const getStyleNum = (style: string, key: string): number | null => {
      const raw = getStyleProp(style, key, "");
      if (!raw) return null;
      const parsedNum = Number(raw);
      return Number.isFinite(parsedNum) ? parsedNum : null;
    };

    const cleanLabel = (raw: string): string =>
      raw
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/div>|<\/p>|<\/li>|<hr[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#xa;/g, "\n")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join("\n");

    const allElements = Array.from(doc.querySelectorAll("mxCell"));
    for (const cell of allElements) {
      const parentObj =
        cell.parentElement &&
        ["object", "UserObject"].includes(cell.parentElement.tagName)
          ? cell.parentElement
          : null;
      const id = parentObj?.getAttribute("id") || cell.getAttribute("id") || "";
      if (!id || id === "0" || id === "1") continue;
      const style = cell.getAttribute("style") || "";
      const rawLabel =
        parentObj?.getAttribute("label") || cell.getAttribute("value") || "";
      const label = cleanLabel(rawLabel);
      const parent = cell.getAttribute("parent") || "1";
      const role = cell.getAttribute("mavisRole") || "";
      const mavisId = cell.getAttribute("mavisId") || "";

      if (id === "mavis_title") {
        title = label.split("\n")[0] ?? "";
        continue;
      }
      if (id === "mavis_scope") {
        scopeMeta = (label.split("\n")[0] ?? "").replace(/^mavis-[a-z0-9-]+\s*·\s*/i, "");
        continue;
      }
      if (id === "mavis_legend" || role === "legend") {
        hasLegend = true;
        continue;
      }

      if (cell.getAttribute("vertex") === "1") {
        const geo = cell.querySelector("mxGeometry");
        if (!geo) continue;
        const x = Number(geo.getAttribute("x") || 0);
        const y = Number(geo.getAttribute("y") || 0);
        const width = Math.max(24, Number(geo.getAttribute("width") || 160));
        const height = Math.max(20, Number(geo.getAttribute("height") || 72));

        if (role === "edge-label" || id.startsWith("label_")) {
          if (label) {
            edgeLabels.push({
              id,
              edgeId: cell.getAttribute("mavisEdgeId") || "",
              label,
              x,
              y,
              width,
              height,
            });
          }
          continue;
        }

        const fillColor = getStyleProp(style, "fillColor", "#f8fafc");
        const dashed = getStyleProp(style, "dashed", "0") === "1";
        const startSize = getStyleNum(style, "startSize") ?? 36;
        const isGroup =
          role === "boundary" ||
          style.includes("swimlane") ||
          style.includes("container=1") ||
          fillColor === "none";
        const shape: ParsedSvgNode["shape"] = isGroup
          ? "boundary"
          : role === "DATABASE" || style.includes("cylinder")
            ? "cylinder"
            : role === "MESSAGE_CHANNEL" ||
                role === "QUEUE_BROKER" ||
                style.includes("shape=process")
              ? "channel"
              : style.includes("ellipse")
                ? "ellipse"
                : style.includes("rhombus")
                  ? "rhombus"
                  : "card";

        nodesById.set(id, {
          id,
          mavisId,
          role,
          parent,
          label,
          x,
          y,
          width,
          height,
          startSize,
          dashed,
          isGroup,
          shape,
        });
      } else if (cell.getAttribute("edge") === "1") {
        const source = cell.getAttribute("source") || "";
        const target = cell.getAttribute("target") || "";
        const dashed = getStyleProp(style, "dashed", "0") === "1";
        const pts: Array<{ x: number; y: number }> = [];
        const arr = cell.querySelector('mxGeometry > Array[as="points"]');
        if (arr) {
          for (const pt of Array.from(arr.querySelectorAll("mxPoint"))) {
            const px = Number(pt.getAttribute("x"));
            const py = Number(pt.getAttribute("y"));
            if (Number.isFinite(px) && Number.isFinite(py)) {
              pts.push({ x: px, y: py });
            }
          }
        }
        const readPoint = (asAttr: string) => {
          const el = cell.querySelector(`mxGeometry > mxPoint[as="${asAttr}"]`);
          if (!el) return null;
          const px = Number(el.getAttribute("x"));
          const py = Number(el.getAttribute("y"));
          return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
        };
        edges.push({
          id,
          mavisId,
          source,
          target,
          sourcePoint: readPoint("sourcePoint"),
          targetPoint: readPoint("targetPoint"),
          label,
          dashed,
          exitX: getStyleNum(style, "exitX"),
          exitY: getStyleNum(style, "exitY"),
          entryX: getStyleNum(style, "entryX"),
          entryY: getStyleNum(style, "entryY"),
          points: pts,
        });
      }
    }

    const absCoords = new Map<string, { x: number; y: number }>();
    const resolveAbs = (id: string, visited = new Set<string>()): { x: number; y: number } => {
      if (absCoords.has(id)) return absCoords.get(id)!;
      const n = nodesById.get(id);
      if (!n) return { x: 0, y: 0 };
      if (n.parent && n.parent !== "1" && nodesById.has(n.parent) && !visited.has(n.parent)) {
        visited.add(id);
        const p = resolveAbs(n.parent, visited);
        const res = { x: p.x + n.x, y: p.y + n.y };
        absCoords.set(id, res);
        return res;
      }
      const res = { x: n.x, y: n.y };
      absCoords.set(id, res);
      return res;
    };

    const resolvedNodes: ParsedSvgNode[] = [];
    for (const n of nodesById.values()) {
      const pos = resolveAbs(n.id);
      resolvedNodes.push({ ...n, x: pos.x, y: pos.y });
    }

    if (resolvedNodes.length === 0) return null;

    const resolvedById = new Map(resolvedNodes.map((n) => [n.id, n]));
    const validEdges = edges.filter(
      (e) =>
        (resolvedById.has(e.source) || Boolean(e.sourcePoint)) &&
        (resolvedById.has(e.target) || Boolean(e.targetPoint)),
    );

    const xCoords = [
      ...resolvedNodes.flatMap((n) => [n.x, n.x + n.width]),
      ...edgeLabels.flatMap((l) => [l.x, l.x + l.width]),
      ...validEdges.flatMap((e) => [
        ...e.points.map((p) => p.x),
        ...(e.sourcePoint ? [e.sourcePoint.x] : []),
        ...(e.targetPoint ? [e.targetPoint.x] : []),
      ]),
    ];
    const yCoords = [
      ...resolvedNodes.flatMap((n) => [n.y, n.y + n.height]),
      ...edgeLabels.flatMap((l) => [l.y, l.y + l.height]),
      ...validEdges.flatMap((e) => [
        ...e.points.map((p) => p.y),
        ...(e.sourcePoint ? [e.sourcePoint.y] : []),
        ...(e.targetPoint ? [e.targetPoint.y] : []),
      ]),
    ];

    const padX = 48;
    const padY = 40;
    const rawMinX = Math.min(...xCoords);
    const rawMaxX = Math.max(...xCoords);
    const rawMinY = Math.min(...yCoords);
    const rawMaxY = Math.max(...yCoords);
    const contentW = rawMaxX - rawMinX;
    const contentH = rawMaxY - rawMinY;
    const vbW = Math.max(520, contentW + padX * 2);
    const vbH = Math.max(240, contentH + padY * 2);
    const vbX = rawMinX - (vbW - contentW) / 2;
    const vbY = rawMinY - (vbH - contentH) / 2;

    return {
      title,
      scopeMeta,
      hasLegend,
      nodes: resolvedNodes.sort((a, b) => (a.isGroup === b.isGroup ? 0 : a.isGroup ? -1 : 1)),
      edges: validEdges,
      edgeLabels,
      resolvedById,
      vbX,
      vbY,
      vbW,
      vbH,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      hasBoundary: resolvedNodes.some((n) => n.shape === "boundary"),
      hasDatabase: resolvedNodes.some((n) => n.shape === "cylinder"),
      hasChannel: resolvedNodes.some((n) => n.shape === "channel"),
      hasDashedEdge: validEdges.some((e) => e.dashed),
    };
  } catch {
    return null;
  }
}

function resolveEdgePoints(edge: ParsedSvgEdge, resolvedById: Map<string, ParsedSvgNode>) {
  const s = edge.source ? resolvedById.get(edge.source) : undefined;
  const t = edge.target ? resolvedById.get(edge.target) : undefined;
  const firstTarget =
    edge.points[0] ??
    edge.targetPoint ??
    (t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : { x: 0, y: 0 });
  const lastSource =
    edge.points.at(-1) ??
    edge.sourcePoint ??
    (s ? { x: s.x + s.width / 2, y: s.y + s.height / 2 } : { x: 0, y: 0 });
  const startPt = edge.sourcePoint
    ? edge.sourcePoint
    : s
      ? edge.exitX !== null && edge.exitY !== null
        ? { x: s.x + s.width * edge.exitX, y: s.y + s.height * edge.exitY }
        : clipRectEdge(s, firstTarget)
      : lastSource;
  const endPt = edge.targetPoint
    ? edge.targetPoint
    : t
      ? edge.entryX !== null && edge.entryY !== null
        ? { x: t.x + t.width * edge.entryX, y: t.y + t.height * edge.entryY }
        : clipRectEdge(t, lastSource)
      : firstTarget;
  return [startPt, ...edge.points, endPt];
}

/**
 * Pure client-side SVG string generator (zero external iframe or draw.io service required).
 */
export function renderDiagramXmlToSvgString(xml: string, isDark = false): string | null {
  const parsed = parseDiagramXml(xml);
  if (!parsed) return null;
  const bg = isDark ? "#080d17" : "#f8fafc";
  const edgeStroke = isDark ? "#7c8fa8" : "#64748b";
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${parsed.viewBox}" width="${Math.round(parsed.vbW)}" height="${Math.round(parsed.vbH)}">`,
    `<defs><marker id="mavis-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.2 L 9.5 5 L 0 8.8 z" fill="${edgeStroke}"/></marker></defs>`,
    `<rect x="${parsed.vbX}" y="${parsed.vbY}" width="${parsed.vbW}" height="${parsed.vbH}" fill="${bg}"/>`,
  ];

  for (const node of parsed.nodes.filter((n) => n.shape === "boundary")) {
    const c = getSvgNodePalette(node.role, "boundary", isDark);
    const titleLine = escapeXml(node.label.split("\n")[0] ?? "");
    parts.push(
      `<g data-cell-id="${escapeXml(node.id)}" transform="translate(${node.x},${node.y})"><rect width="${node.width}" height="${node.height}" rx="12" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"${node.dashed ? ' stroke-dasharray="6,4"' : ""}/><text x="14" y="20" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="${c.title}">${titleLine}</text></g>`,
    );
  }
  for (const edge of parsed.edges) {
    const pts = resolveEdgePoints(edge, parsed.resolvedById);
    const d = buildRoundedPolylinePath(pts, 6);
    parts.push(
      `<path data-cell-id="${escapeXml(edge.id)}" d="${d}" fill="none" stroke="${edgeStroke}" stroke-width="1.65"${edge.dashed ? ' stroke-dasharray="6,4"' : ""} marker-end="url(#mavis-arrow)"/>`,
    );
  }
  for (const node of parsed.nodes.filter((n) => n.shape !== "boundary")) {
    const c = getSvgNodePalette(node.role, node.shape, isDark);
    const lines = wrapSvgLines(
      node.label.split("\n").filter(Boolean),
      Math.max(24, Math.floor((node.width - 28) / 6.4)),
      6,
    );
    const textY = node.height / 2 - ((lines.length - 1) * 16) / 2;
    const textEls = lines
      .map(
        (line, idx) =>
          `<text x="${node.width / 2}" y="${textY + idx * 16}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="${idx === 0 ? 13 : 10.5}" font-weight="${idx === 0 ? 700 : 500}" fill="${idx === 0 ? c.title : c.sub}">${escapeXml(line)}</text>`,
      )
      .join("");
    parts.push(
      `<g data-cell-id="${escapeXml(node.id)}" transform="translate(${node.x},${node.y})"><rect width="${node.width}" height="${node.height}" rx="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>${textEls}</g>`,
    );
  }
  for (const lbl of parsed.edgeLabels) {
    const lines = lbl.label.split("\n").slice(0, 3);
    const pillH = Math.max(22, lines.length * 14 + 8);
    const pillY = lbl.y + (lbl.height - pillH) / 2;
    const textEls = lines
      .map(
        (line, idx) =>
          `<text x="${lbl.x + lbl.width / 2}" y="${pillY + pillH / 2 - ((lines.length - 1) * 13) / 2 + idx * 13}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="10.5" fill="${isDark ? "#cbd5e1" : "#334155"}">${escapeXml(line)}</text>`,
      )
      .join("");
    parts.push(
      `<g><rect x="${lbl.x}" y="${pillY}" width="${lbl.width}" height="${pillH}" rx="6" fill="${isDark ? "#0f172a" : "#ffffff"}" stroke="${isDark ? "#334155" : "#cbd5e1"}"/>${textEls}</g>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

/**
 * Pure Native React SVG Architecture Diagram Viewer — zero Draw.io iframe, zero external embeds.
 * Adapts live to Dark/Light theme and renders distinct C4 & UML shapes with ELK port-anchored routes.
 */
export function ArchitectureSvgViewer({
  xml,
  selectedId,
  onSelect,
}: {
  xml: string;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const uid = useId().replace(/:/g, "");
  const arrowId = `mavis-arrow-${uid}`;
  const arrowActiveId = `mavis-arrow-active-${uid}`;
  const shadowId = `mavis-shadow-${uid}`;
  const [zoom, setZoom] = useState(1);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const parsed = useMemo(() => parseDiagramXml(xml), [xml]);

  useEffect(() => {
    setZoom(1);
  }, [xml]);

  if (!parsed) {
    return (
      <div className="flex h-[320px] items-center justify-center bg-muted/15 p-6 text-sm text-muted-foreground">
        Preparing architecture diagram…
      </div>
    );
  }

  const canvasHeight = Math.max(320, Math.min(640, Math.round(parsed.vbH + 56)));
  const edgeStrokeDefault = isDark ? "#7c8fa8" : "#475569";
  const edgeStrokeSelected = isDark ? "#38bdf8" : "#2563eb";
  const dotColor = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.28)";

  return (
    <div className="flex flex-col overflow-hidden bg-background/40">
      {/* Compact Blueprint Header & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-2 text-xs dark:border-border/60 dark:bg-muted/15">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {parsed.title && (
            <span className="font-semibold text-slate-900 dark:text-foreground">{parsed.title}</span>
          )}
          {parsed.scopeMeta && (
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600 dark:border-border/60 dark:bg-muted/60 dark:text-muted-foreground">
              {parsed.scopeMeta}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] shadow-2xs dark:border-border/70 dark:bg-background/80">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
            className="rounded px-2 py-0.5 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[42px] text-center font-mono font-semibold tabular-nums text-slate-800 dark:text-foreground/85">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.15) * 100) / 100))}
            className="rounded px-2 py-0.5 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
            aria-label="Zoom in"
          >
            +
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="ml-0.5 rounded border-l border-slate-200 px-2 py-0.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-border/60 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Drafting Canvas */}
      <div
        className="flex w-full overflow-auto p-3"
        style={{
          height: canvasHeight,
          backgroundColor: isDark ? "#080d17" : "#f1f5f9",
          backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
          backgroundSize: "18px 18px",
        }}
      >
        <svg
          viewBox={parsed.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="m-auto block shrink-0 select-none"
          style={
            zoom <= 1
              ? {
                  width: `${Math.round(zoom * 100)}%`,
                  height: `${Math.round(zoom * 100)}%`,
                  maxWidth: `${Math.round(parsed.vbW * zoom)}px`,
                  maxHeight: `${Math.round(parsed.vbH * zoom)}px`,
                }
              : {
                  width: `${Math.round(parsed.vbW * zoom)}px`,
                  height: `${Math.round(parsed.vbH * zoom)}px`,
                }
          }
          role="img"
          aria-label="Architecture diagram SVG preview"
        >
            <defs>
              <marker
                id={arrowId}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 9.5 5 L 0 8.8 z" fill={edgeStrokeDefault} />
              </marker>
              <marker
                id={arrowActiveId}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 9.5 5 L 0 8.8 z" fill={edgeStrokeSelected} />
              </marker>
              <filter id={shadowId} x="-8%" y="-10%" width="116%" height="126%">
                <feDropShadow
                  dx="0"
                  dy="4"
                  stdDeviation="5"
                  floodColor={isDark ? "#000000" : "#0f172a"}
                  floodOpacity={isDark ? 0.42 : 0.08}
                />
              </filter>
            </defs>

            {/* Layer 1: Boundaries / Swimlanes */}
            {parsed.nodes
              .filter((n) => n.shape === "boundary")
              .map((node) => {
                const c = getSvgNodePalette(node.role, "boundary", isDark);
                const headerH = Math.min(36, Math.max(28, node.startSize));
                const titleLine = node.label.split("\n")[0] ?? "";
                return (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={12}
                      fill={c.fill}
                      stroke={c.stroke}
                      strokeWidth={1.4}
                      strokeDasharray={node.dashed ? "6,4" : undefined}
                    />
                    <rect
                      x={1}
                      y={1}
                      width={Math.min(node.width - 2, Math.max(180, titleLine.length * 7.2 + 28))}
                      height={headerH - 4}
                      rx={10}
                      fill={c.headerFill}
                    />
                    <text
                      x={14}
                      y={headerH / 2}
                      dominantBaseline="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill={c.title}
                    >
                      {titleLine}
                    </text>
                  </g>
                );
              })}

            {/* Layer 2: Edges using exact ELK port anchors */}
            {parsed.edges.map((edge) => {
              const allPts = resolveEdgePoints(edge, parsed.resolvedById);
              const pathD = buildRoundedPolylinePath(allPts, 6);
              const isSelected = Boolean(selectedId && edge.mavisId && selectedId === edge.mavisId);
              const startPt = allPts[0] ?? { x: 0, y: 0 };
              const endPt = allPts.at(-1) ?? startPt;
              const mid = allPts[Math.floor(allPts.length / 2)] ?? {
                x: (startPt.x + endPt.x) / 2,
                y: (startPt.y + endPt.y) / 2,
              };

              return (
                <g
                  key={edge.id}
                  onClick={
                    onSelect && edge.mavisId ? () => onSelect(edge.mavisId) : undefined
                  }
                  className={onSelect && edge.mavisId ? "cursor-pointer" : undefined}
                >
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth={12} />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? edgeStrokeSelected : edgeStrokeDefault}
                    strokeWidth={isSelected ? 2.4 : 1.65}
                    strokeDasharray={edge.dashed ? "6,4" : undefined}
                    markerEnd={
                      isSelected ? `url(#${arrowActiveId})` : `url(#${arrowId})`
                    }
                  />
                  {edge.label && (
                    <g transform={`translate(${mid.x}, ${mid.y - 6})`}>
                      <rect
                        x={-Math.min(110, edge.label.length * 3.4 + 10)}
                        y={-11}
                        width={Math.min(220, edge.label.length * 6.8 + 20)}
                        height={20}
                        rx={6}
                        fill={isDark ? "#0f172a" : "#ffffff"}
                        fillOpacity={0.94}
                        stroke={isSelected ? edgeStrokeSelected : isDark ? "#334155" : "#cbd5e1"}
                        strokeWidth={1}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={10.5}
                        fontWeight={500}
                        fill={isDark ? "#cbd5e1" : "#334155"}
                      >
                        {edge.label.split("\n")[0]}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Layer 3: Architectural Nodes (Cards, Cylinders, Channels, Ellipses, Diamonds) */}
            {parsed.nodes
              .filter((n) => n.shape !== "boundary")
              .map((node) => {
                const c = getSvgNodePalette(node.role, node.shape, isDark);
                const isSelected = Boolean(
                  selectedId && node.mavisId && selectedId === node.mavisId,
                );
                const maxChars = Math.max(20, Math.floor((node.width - 28) / 6.4));
                const rawLines = node.label.split("\n").filter(Boolean);
                const lines = wrapSvgLines(rawLines, maxChars, 6);
                const lineGap = 16;
                const textTopOffset = node.shape === "cylinder" ? 16 : 4;
                const blockH = (lines.length - 1) * lineGap;
                const startY = node.height / 2 + textTopOffset / 2 - blockH / 2;

                const cylRy = Math.min(14, node.height * 0.12);
                const cylPath = `M 0 ${cylRy} L 0 ${node.height - cylRy} A ${node.width / 2} ${cylRy} 0 0 0 ${node.width} ${node.height - cylRy} L ${node.width} ${cylRy} Z`;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    filter={`url(#${shadowId})`}
                    onClick={
                      onSelect && node.mavisId ? () => onSelect(node.mavisId) : undefined
                    }
                    className={onSelect && node.mavisId ? "cursor-pointer" : undefined}
                  >
                    {isSelected && (
                      <rect
                        x={-4}
                        y={-4}
                        width={node.width + 8}
                        height={node.height + 8}
                        rx={14}
                        fill="none"
                        stroke={edgeStrokeSelected}
                        strokeWidth={2}
                        strokeOpacity={0.85}
                      />
                    )}

                    {node.shape === "cylinder" ? (
                      <>
                        <path
                          d={cylPath}
                          fill={c.fill}
                          stroke={isSelected ? edgeStrokeSelected : c.stroke}
                          strokeWidth={isSelected ? 2.2 : 1.6}
                        />
                        <ellipse
                          cx={node.width / 2}
                          cy={cylRy}
                          rx={node.width / 2}
                          ry={cylRy}
                          fill={c.headerFill}
                          stroke={isSelected ? edgeStrokeSelected : c.stroke}
                          strokeWidth={isSelected ? 2.2 : 1.6}
                        />
                      </>
                    ) : node.shape === "channel" ? (
                      <>
                        <rect
                          width={node.width}
                          height={node.height}
                          rx={10}
                          fill={c.fill}
                          stroke={isSelected ? edgeStrokeSelected : c.stroke}
                          strokeWidth={isSelected ? 2.2 : 1.6}
                        />
                        <line
                          x1={14}
                          y1={1}
                          x2={14}
                          y2={node.height - 1}
                          stroke={c.accent}
                          strokeWidth={1.5}
                          strokeOpacity={0.55}
                        />
                        <line
                          x1={node.width - 14}
                          y1={1}
                          x2={node.width - 14}
                          y2={node.height - 1}
                          stroke={c.accent}
                          strokeWidth={1.5}
                          strokeOpacity={0.55}
                        />
                      </>
                    ) : node.shape === "ellipse" ? (
                      <ellipse
                        cx={node.width / 2}
                        cy={node.height / 2}
                        rx={node.width / 2}
                        ry={node.height / 2}
                        fill={c.fill}
                        stroke={isSelected ? edgeStrokeSelected : c.stroke}
                        strokeWidth={isSelected ? 2.2 : 1.6}
                      />
                    ) : node.shape === "rhombus" ? (
                      <polygon
                        points={`${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}`}
                        fill={c.fill}
                        stroke={isSelected ? edgeStrokeSelected : c.stroke}
                        strokeWidth={isSelected ? 2.2 : 1.6}
                      />
                    ) : (
                      <>
                        <rect
                          width={node.width}
                          height={node.height}
                          rx={10}
                          fill={c.fill}
                          stroke={isSelected ? edgeStrokeSelected : c.stroke}
                          strokeWidth={isSelected ? 2.2 : 1.5}
                          strokeDasharray={node.dashed ? "6,4" : undefined}
                        />
                        <rect
                          x={12}
                          y={1}
                          width={Math.max(24, node.width - 24)}
                          height={3}
                          rx={1.5}
                          fill={c.accent}
                        />
                      </>
                    )}

                    {lines.map((line, idx) => {
                      const isTagLine = idx > 0 && line.startsWith("[") && line.endsWith("]");
                      return (
                        <text
                          key={idx}
                          x={node.width / 2}
                          y={startY + idx * lineGap}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={idx === 0 ? 13 : 10.5}
                          fontWeight={idx === 0 ? 700 : isTagLine ? 600 : 400}
                          fill={idx === 0 ? c.title : isTagLine ? c.tag : c.sub}
                        >
                          {line}
                        </text>
                      );
                    })}
                  </g>
                );
              })}

            {/* Layer 4: Standalone Edge Labels (clean floating pills) */}
            {parsed.edgeLabels.map((lbl) => {
              const lines = lbl.label.split("\n").slice(0, 3);
              const isSelected = Boolean(selectedId && lbl.edgeId && selectedId === lbl.edgeId);
              const pillH = Math.max(22, lines.length * 14 + 8);
              const pillY = lbl.y + (lbl.height - pillH) / 2;
              return (
                <g
                  key={lbl.id}
                  onClick={
                    onSelect && lbl.edgeId ? () => onSelect(lbl.edgeId) : undefined
                  }
                  className={onSelect && lbl.edgeId ? "cursor-pointer" : undefined}
                >
                  <rect
                    x={lbl.x}
                    y={pillY}
                    width={lbl.width}
                    height={pillH}
                    rx={6}
                    fill={isDark ? "#0f172a" : "#ffffff"}
                    fillOpacity={0.94}
                    stroke={isSelected ? edgeStrokeSelected : isDark ? "#334155" : "#cbd5e1"}
                    strokeWidth={1}
                  />
                  {lines.map((line, idx) => (
                    <text
                      key={idx}
                      x={lbl.x + lbl.width / 2}
                      y={pillY + pillH / 2 - ((lines.length - 1) * 13) / 2 + idx * 13}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10.5}
                      fontWeight={500}
                      fill={isDark ? "#cbd5e1" : "#334155"}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
      </div>

      {/* Crisp HTML Legend Bar */}
      {(parsed.hasLegend || parsed.nodes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200 bg-slate-50/90 px-4 py-2 text-[11px] font-medium text-slate-600 dark:border-border/60 dark:bg-muted/15 dark:text-muted-foreground">
          {parsed.hasBoundary && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-xs border border-dashed border-slate-500 dark:border-slate-400" />
              Boundary
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-xs border border-blue-600 bg-blue-100 dark:border-sky-500/70 dark:bg-sky-500/20" />
            Service / System
          </span>
          {parsed.hasDatabase && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3.5 rounded-full border border-emerald-600 bg-emerald-100 dark:border-emerald-500/70 dark:bg-emerald-500/20" />
              Database
            </span>
          )}
          {parsed.hasChannel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-xs border-x-2 border-y border-violet-600 bg-violet-100 dark:border-violet-500/70 dark:bg-violet-500/20" />
              Message Channel
            </span>
          )}
          {parsed.edges.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-[1.5px] border-slate-500 dark:border-slate-400" />
              Source call
            </span>
          )}
          {parsed.hasDashedEdge && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-[1.5px] border-dashed border-slate-500 dark:border-slate-400" />
              Compose / Config
            </span>
          )}
          {onSelect && (
            <span className="ml-auto hidden text-[11px] font-normal text-slate-500 dark:text-muted-foreground/75 sm:inline">
              Click a node or edge to inspect
            </span>
          )}
        </div>
      )}
    </div>
  );
}
