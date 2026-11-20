"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DRAWIO_THEME_OPTIONS,
  palette,
  RULE_VERSION,
  type DrawioTheme,
} from "@/lib/drawio/rules";
import { generateDrawio } from "@/lib/drawio/generate";
import { projectDiagram } from "@/lib/drawio/rules";
import { themeDrawioXml, extractDraftDocument } from "./drawio-document";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-api";
import {
  DRAWIO_URL,
  FALLBACK_DRAWIO_URL,
  ALLOWED_DRAWIO_ORIGINS,
  DRAWIO_LAYOUT,
  DRAWIO_MAX_XML_LENGTH,
  readDrawioEvent,
} from "./drawio-protocol";

const VALID_THEMES = new Set<string>(DRAWIO_THEME_OPTIONS.map((t) => t.value));

function buildEditorUrl(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/?embed=1&configure=1&proto=json&spin=1&ui=atlas&dark=0&libraries=1&noExitBtn=1&saveAndExit=0&plugins=0&offline=1`;
}

function validXml(xml: string) {
  if (!xml || xml.length > DRAWIO_MAX_XML_LENGTH || /<!DOCTYPE/i.test(xml)) return false;
  const document = new DOMParser().parseFromString(xml, "text/xml");
  return (
    !document.querySelector("parsererror") &&
    ["mxfile", "mxGraphModel"].includes(document.documentElement.localName)
  );
}

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
  shape: "boundary" | "cylinder" | "channel" | "card";
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
  label: string;
  dashed: boolean;
  exitX: number | null;
  exitY: number | null;
  entryX: number | null;
  entryY: number | null;
  points: Array<{ x: number; y: number }>;
}

function getSvgNodePalette(role: string, shape: ParsedSvgNode["shape"], isDark: boolean) {
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
          fill: "rgba(241, 245, 249, 0.65)",
          stroke: "#94a3b8",
          accent: "#0284c7",
          headerFill: "rgba(226, 232, 240, 0.85)",
          title: "#1e293b",
          tag: "#475569",
          sub: "#64748b",
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
          accent: "#10b981",
          headerFill: "#d1fae5",
          title: "#064e3b",
          tag: "#047857",
          sub: "#475569",
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
          accent: "#8b5cf6",
          headerFill: "#ede9fe",
          title: "#2e1065",
          tag: "#6d28d9",
          sub: "#475569",
        };
  }
  if (role === "COMPONENT" || role === "LOGICAL_COMPONENT" || role === "CLASS_INTERFACE" || role === "PACKAGE") {
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
          fill: "#f0fdfa",
          stroke: "#0d9488",
          accent: "#14b8a6",
          headerFill: "#ccfbf1",
          title: "#134e4a",
          tag: "#0f766e",
          sub: "#475569",
        };
  }
  if (role === "EXTERNAL_SYSTEM") {
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
          fill: "#fafaf9",
          stroke: "#78716c",
          accent: "#d97706",
          headerFill: "#f5f5f4",
          title: "#1c1917",
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
          fill: "#eff6ff",
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
        fill: "#f0f7ff",
        stroke: "#3b82f6",
        accent: "#2563eb",
        headerFill: "#dbeafe",
        title: "#0f172a",
        tag: "#1e40af",
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

/**
 * Built-in Native SVG Renderer for <mxGraphModel> XML so architecture diagrams render
 * crisply in dark and light mode without requiring an external Draw.io iframe.
 */
export function MxGraphNativeSvgPreview({
  xml,
  selectedId,
  onSelect,
}: {
  xml: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
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

  const parsed = useMemo(() => {
    if (!xml) return null;
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
          .slice(0, 6)
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
          const width = Math.max(40, Number(geo.getAttribute("width") || 160));
          const height = Math.max(24, Number(geo.getAttribute("height") || 72));

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
          edges.push({
            id,
            mavisId,
            source,
            target,
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

      // Resolve relative coordinates for child vertices inside parent containers
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
        (e) => resolvedById.has(e.source) && resolvedById.has(e.target),
      );

      const xCoords = [
        ...resolvedNodes.flatMap((n) => [n.x, n.x + n.width]),
        ...edgeLabels.flatMap((l) => [l.x, l.x + l.width]),
        ...validEdges.flatMap((e) => e.points.map((p) => p.x)),
      ];
      const yCoords = [
        ...resolvedNodes.flatMap((n) => [n.y, n.y + n.height]),
        ...edgeLabels.flatMap((l) => [l.y, l.y + l.height]),
        ...validEdges.flatMap((e) => e.points.map((p) => p.y)),
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
  }, [xml]);

  if (!parsed) {
    return (
      <div className="flex h-[320px] items-center justify-center bg-muted/15 p-6 text-sm text-muted-foreground">
        Preparing architecture diagram…
      </div>
    );
  }

  const canvasHeight = Math.max(300, Math.min(580, Math.round(parsed.vbH * 0.88 + 44)));
  const edgeStrokeDefault = isDark ? "#7c8fa8" : "#64748b";
  const edgeStrokeSelected = isDark ? "#38bdf8" : "#2563eb";
  const dotColor = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.22)";

  return (
    <div className="flex flex-col overflow-hidden bg-background/40">
      {/* Compact Blueprint Header & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/15 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {parsed.title && (
            <span className="font-medium text-foreground">{parsed.title}</span>
          )}
          {parsed.scopeMeta && (
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {parsed.scopeMeta}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/80 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
            className="rounded px-2 py-0.5 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[42px] text-center font-mono tabular-nums text-foreground/85">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.15) * 100) / 100))}
            className="rounded px-2 py-0.5 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Zoom in"
          >
            +
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="ml-0.5 rounded border-l border-border/60 px-2 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Drafting Canvas */}
      <div
        className="w-full overflow-auto"
        style={{
          height: canvasHeight,
          backgroundColor: isDark ? "#080d17" : "#f8fafc",
          backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
          backgroundSize: "18px 18px",
        }}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center p-4"
          style={
            zoom !== 1
              ? {
                  width: `${Math.round(zoom * 100)}%`,
                  height: `${Math.round(zoom * 100)}%`,
                }
              : undefined
          }
        >
          <svg
            viewBox={parsed.viewBox}
            className="h-full w-full max-w-full select-none"
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
              const s = parsed.resolvedById.get(edge.source)!;
              const t = parsed.resolvedById.get(edge.target)!;
              const firstTarget = edge.points[0] ?? {
                x: t.x + t.width / 2,
                y: t.y + t.height / 2,
              };
              const lastSource = edge.points.at(-1) ?? {
                x: s.x + s.width / 2,
                y: s.y + s.height / 2,
              };
              const startPt =
                edge.exitX !== null && edge.exitY !== null
                  ? { x: s.x + s.width * edge.exitX, y: s.y + s.height * edge.exitY }
                  : clipRectEdge(s, firstTarget);
              const endPt =
                edge.entryX !== null && edge.entryY !== null
                  ? { x: t.x + t.width * edge.entryX, y: t.y + t.height * edge.entryY }
                  : clipRectEdge(t, lastSource);
              const allPts = [startPt, ...edge.points, endPt];
              const pathD = buildRoundedPolylinePath(allPts, 6);
              const isSelected = Boolean(selectedId && edge.mavisId && selectedId === edge.mavisId);
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
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                  />
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

            {/* Layer 3: Architectural Nodes (Cards, Cylinders, Channels) */}
            {parsed.nodes
              .filter((n) => n.shape !== "boundary")
              .map((node) => {
                const c = getSvgNodePalette(node.role, node.shape, isDark);
                const isSelected = Boolean(
                  selectedId && node.mavisId && selectedId === node.mavisId,
                );
                const maxChars = Math.max(24, Math.floor((node.width - 28) / 6.4));
                const rawLines = node.label.split("\n").filter(Boolean);
                const lines = wrapSvgLines(rawLines, maxChars, 5);
                const lineGap = 16;
                const textTopOffset = node.shape === "cylinder" ? 16 : 4;
                const blockH = (lines.length - 1) * lineGap;
                const startY =
                  node.height / 2 + textTopOffset / 2 - blockH / 2;

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
                          fontSize={idx === 0 ? 13 : isTagLine ? 10.5 : 10.5}
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
      </div>

      {/* Crisp HTML Legend Bar (replaces truncated SVG legend box) */}
      {(parsed.hasLegend || parsed.nodes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
          {parsed.hasBoundary && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-xs border border-dashed border-slate-400" />
              Boundary
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-xs border border-sky-500/70 bg-sky-500/15" />
            Service / System
          </span>
          {parsed.hasDatabase && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3.5 rounded-full border border-emerald-500/70 bg-emerald-500/15" />
              Database
            </span>
          )}
          {parsed.hasChannel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-xs border-x-2 border-y border-violet-500/70 bg-violet-500/15" />
              Message Channel
            </span>
          )}
          {parsed.edges.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-[1.5px] border-slate-400" />
              Source call
            </span>
          )}
          {parsed.hasDashedEdge && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-[1.5px] border-dashed border-slate-400" />
              Compose / Config
            </span>
          )}
          {onSelect && (
            <span className="ml-auto hidden text-[11px] text-muted-foreground/75 sm:inline">
              Click a node or edge to inspect
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Draw.io's mxCodec strips custom mavis* attributes from <mxGraphModel> on autosave/export.
 * Restore them from the reference XML so round-trip reconcilers and themeDrawioXml never lose metadata.
 */
function preserveMavisGraphModelAttributes(
  exportedXml: string,
  referenceXml: string,
  activeTheme: DrawioTheme,
): string {
  try {
    const expDoc = new DOMParser().parseFromString(exportedXml, "text/xml");
    const refDoc = new DOMParser().parseFromString(referenceXml, "text/xml");
    if (expDoc.querySelector("parsererror") || refDoc.querySelector("parsererror")) {
      return exportedXml;
    }
    const expGraph = expDoc.querySelector("mxGraphModel");
    const refGraph = refDoc.querySelector("mxGraphModel");
    if (!expGraph) return exportedXml;
    if (refGraph) {
      for (const attr of Array.from(refGraph.attributes)) {
        if (attr.name.startsWith("mavis") && !expGraph.hasAttribute(attr.name)) {
          expGraph.setAttribute(attr.name, attr.value);
        }
      }
    }
    expGraph.setAttribute("mavisTheme", activeTheme);
    expGraph.setAttribute("background", palette(activeTheme).background);
    return new XMLSerializer().serializeToString(expDoc);
  } catch {
    return exportedXml;
  }
}

export function DrawioEditor({
  xml,
  modelId,
  diagramId,
  title,
  notation,
  level,
  scope = "overview",
  theme = "clean",
  onThemeChange,
  onSave,
  onDraftChange,
  onRelayout,
  generatedXml,
  preferProvidedXml = false,
  autoSaveWhenReady = false,
}: {
  xml: string;
  modelId: string;
  diagramId: string;
  title: string;
  notation?: string | undefined;
  level?: string | undefined;
  scope?: string;
  theme?: DrawioTheme;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
  onSave?: (xml: string) => Promise<void>;
  onDraftChange?: ((xml: string) => void) | undefined;
  onRelayout?: (() => void) | undefined;
  generatedXml?: string;
  preferProvidedXml?: boolean;
  autoSaveWhenReady?: boolean;
}) {
  const session = useSession();
  const [activeTheme, setActiveTheme] = useState<DrawioTheme>(theme);
  useEffect(() => {
    setActiveTheme(theme);
  }, [theme]);

  const [engineMode, setEngineMode] = useState<"local" | "cloud" | "svg">("local");
  const activeBaseUrl = engineMode === "cloud" ? FALLBACK_DRAWIO_URL : DRAWIO_URL;
  const activeEditorUrl = useMemo(() => buildEditorUrl(activeBaseUrl), [activeBaseUrl]);

  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLElement>(null);
  const original = useRef(generatedXml ?? xml);
  original.current = generatedXml ?? xml;
  const initial = useRef(xml);
  initial.current = xml;
  const loadedPropXml = useRef(xml);
  const saveCallback = useRef(onSave);
  saveCallback.current = onSave;
  const draftCallback = useRef(onDraftChange);
  draftCallback.current = onDraftChange;
  const relayoutCallback = useRef(onRelayout);
  relayoutCallback.current = onRelayout;

  const propsRef = useRef({
    title,
    notation,
    level,
    modelId,
    diagramId,
    scope,
    preferProvidedXml,
  });
  propsRef.current = {
    title,
    notation,
    level,
    modelId,
    diagramId,
    scope,
    preferProvidedXml,
  };

  const cloudPending = useRef(false);
  const autoSavedRef = useRef<string | null>(null);
  const pending = useRef<"style" | "relayout" | null>(null);
  const exportFallbackTimer = useRef<number | null>(null);
  const currentTheme = useRef(activeTheme);
  currentTheme.current = activeTheme;
  const previousTheme = useRef(activeTheme);
  const latest = useRef(xml);
  const connectedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Đang tải trình chỉnh sửa sơ đồ Draw.io…");
  const [error, setError] = useState("");

  const userId = session.data?.user?.id ?? "default";
  const iframeKey = `mavis:drawio:${engineMode}:${modelId}:${diagramId}:${scope}:${attempt}`;
  const storageKey = `mavis:drawio-draft:${userId}:${modelId}:${diagramId}${
    scope === "overview" || scope === "overview:all" ? "" : ":" + scope
  }`;

  function send(message: object) {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
  }

  async function persistToProject(content: string) {
    if (!saveCallback.current) return;
    const restored = preserveMavisGraphModelAttributes(
      content,
      original.current || latest.current,
      currentTheme.current,
    );
    latest.current = restored;
    setProcessing(true);
    try {
      await saveCallback.current(restored);
      setDirty(false);
      setStatus("Saved");
      setError("");
      send({ action: "status", message: "Saved", modified: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function executeRelayoutOnXml(rawXml: string) {
    const {
      title: curTitle,
      notation: curNotation,
      level: curLevel,
      modelId: curModelId,
      diagramId: curDiagramId,
      scope: curScope,
    } = propsRef.current;
    const restoredXml = preserveMavisGraphModelAttributes(
      rawXml,
      original.current || latest.current,
      currentTheme.current,
    );
    setProcessing(true);
    try {
      relayoutCallback.current?.();
      if (
        curNotation === "UML_SEQUENCE" ||
        restoredXml.includes("mavisInteraction=") ||
        restoredXml.includes("mavisScenario=")
      ) {
        setStatus("Re-aligning UML Sequence lifelines and timeline…");
        const { relayoutSequenceDrawioXml } = await import("./scenario-design");
        let content = relayoutSequenceDrawioXml(restoredXml);
        try {
          content = themeDrawioXml(content, currentTheme.current);
        } catch {
          // keep content if theme fails
        }
        latest.current = content;
        draftCallback.current?.(content);
        setDirty(true);
        send({
          action: "load",
          xml: content,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
        setStatus("Relayout applied · click Save to persist");
        setProcessing(false);
        return;
      }
      if (
        curNotation === "UML" ||
        curLevel === "CONTEXT" ||
        restoredXml.includes("mavisUmlDocument=") ||
        restoredXml.includes("mavisUmlRole=") ||
        restoredXml.includes('mavisContextDfd="1"') ||
        restoredXml.includes("mavisC4Context=")
      ) {
        let content = original.current;
        try {
          content = themeDrawioXml(content, currentTheme.current);
        } catch {
          // fallback if theme cannot be applied
        }
        latest.current = content;
        draftCallback.current?.(content);
        setDirty(true);
        send({
          action: "load",
          xml: content,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
        setStatus("Relayout applied · click Save to persist");
        setProcessing(false);
        return;
      }
      const diagram = projectDiagram(
        extractDraftDocument(
          restoredXml,
          curModelId,
          curDiagramId,
          curNotation,
          curLevel,
          curScope,
        ),
      );
      setStatus("Applying drawing rules locally…");
      const { layoutLocally } = await import("./drawio-local-layout");
      const content = await generateDrawio(diagram, currentTheme.current, layoutLocally);
      latest.current = content;
      draftCallback.current?.(content);
      setDirty(true);
      send({
        action: "load",
        xml: content,
        title: `${curTitle}.drawio`,
        autosave: 1,
        fit: 1,
        noExitBtn: 1,
      });
      setStatus("Relayout applied · click Save to persist");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Relayout failed.");
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    if (engineMode === "svg") {
      setReady(true);
      setError("");
      setStatus("Đang hiển thị ở chế độ Sơ đồ SVG trực tiếp");
      return;
    }

    connectedRef.current = false;
    setReady(false);
    setDirty(false);
    setError("");
    setStatus(
      engineMode === "local"
        ? "Loading local draw.io editor…"
        : "Đang kết nối trình vẽ Draw.io trực tuyến…",
    );
    loadedPropXml.current = initial.current;
    latest.current = initial.current;
    if (latest.current.includes("shape=cylinder3;size=16;")) {
      latest.current = latest.current.replaceAll(
        "shape=cylinder3;size=16;",
        "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=12;spacingTop=18;",
      );
    }
    const storedTheme = new DOMParser()
      .parseFromString(latest.current, "text/xml")
      .querySelector("[mavisTheme]")
      ?.getAttribute("mavisTheme");
    const resolvedStored = (
      VALID_THEMES.has(storedTheme ?? "") ? storedTheme : "clean"
    ) as DrawioTheme;
    previousTheme.current = resolvedStored;
    try {
      latest.current = themeDrawioXml(latest.current, currentTheme.current);
      previousTheme.current = currentTheme.current;
    } catch {
      // Fallback if XML cannot be re-themed
    }

    // Auto-fallback: if local Docker draw.io (127.0.0.1:8090) does not respond within 2.5s,
    // automatically switch to official embed.diagrams.net so the user never sees a broken black screen.
    const autoFallbackTimer =
      engineMode === "local"
        ? window.setTimeout(() => {
            if (!connectedRef.current) {
              setEngineMode("cloud");
            }
          }, 2500)
        : null;

    const timeout = window.setTimeout(() => {
      if (!connectedRef.current) {
        setEngineMode("svg");
        setError(
          "Không kết nối được container Draw.io cục bộ (cổng 8090). Hệ thống đã tự động chuyển sang chế độ hiển thị Sơ đồ SVG trực tiếp.",
        );
      }
    }, 12000);

    async function receive(message: MessageEvent) {
      const data = readDrawioEvent(message, frame.current?.contentWindow, ALLOWED_DRAWIO_ORIGINS);
      if (!data) return;
      connectedRef.current = true;
      if (autoFallbackTimer !== null) {
        window.clearTimeout(autoFallbackTimer);
      }
      window.clearTimeout(timeout);

      if (data.event === "configure") {
        const logoUrl = new URL("/mavis-logo.png", window.location.origin).href;
        send({
          action: "configure",
          config: {
            css: `.geSmallAppIcon { content: url(${JSON.stringify(
              logoUrl,
            )}) !important; width: 24px !important; height: 24px !important; object-fit: contain; clip-path: ellipse(47% 47% at 50% 50%) content-box; }`,
          },
        });
        return;
      }

      if (data.error) {
        setError("Draw.io could not complete this operation.");
        return;
      }
      const {
        title: curTitle,
        notation: curNotation,
        preferProvidedXml: curPreferProvidedXml,
      } = propsRef.current;

      if (data.event === "init") {
        setReady(true);
        setError("");
        if (!validXml(latest.current)) {
          setError("The generated XML cannot be opened by draw.io.");
          return;
        }
        const isSequence =
          curNotation === "UML_SEQUENCE" ||
          latest.current.includes("mavisInteraction=") ||
          latest.current.includes("mavisScenario=");
        const isUml =
          curNotation === "UML" ||
          latest.current.includes("mavisUmlDocument=") ||
          latest.current.includes("mavisUmlRole=");
        send({
          action: "load",
          xml: latest.current,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          layout:
            !curPreferProvidedXml &&
            !isSequence &&
            !isUml &&
            !latest.current.includes(`mavisRuleVersion="${RULE_VERSION}"`)
              ? DRAWIO_LAYOUT
              : undefined,
          noExitBtn: 1,
          saveAndExit: 0,
        });
      } else if (data.event === "load") {
        setReady(true);
        setError("");
        send({ action: "invokeAction", actionName: "fitWindow" });
        setStatus((prev) =>
          prev.includes("Unsaved") || prev.includes("applied") ? prev : "Ready to edit",
        );
      } else if (data.event === "layout") {
        send({ action: "export", format: "xml" });
      } else if (data.event === "save" || data.event === "autosave") {
        setReady(true);
        setError("");
        if (data.xml && validXml(data.xml)) {
          const restored = preserveMavisGraphModelAttributes(
            data.xml,
            original.current || latest.current,
            currentTheme.current,
          );
          latest.current = restored;
          draftCallback.current?.(restored);
          if (data.event === "save") {
            await persistToProject(restored);
          } else {
            setDirty(true);
            setStatus("Unsaved edits · click Save to persist");
          }
        }
      } else if (data.event === "export") {
        setReady(true);
        if (exportFallbackTimer.current !== null) {
          window.clearTimeout(exportFallbackTimer.current);
          exportFallbackTimer.current = null;
        }
        if (data.error || !data.xml || !validXml(data.xml)) {
          setError("Could not retrieve the current diagram.");
          return;
        }
        const restored = preserveMavisGraphModelAttributes(
          data.xml,
          original.current || latest.current,
          currentTheme.current,
        );
        latest.current = restored;
        const command = pending.current;
        pending.current = null;
        if (command === "relayout") {
          await executeRelayoutOnXml(restored);
          return;
        }
        if (command === "style") {
          setProcessing(true);
          try {
            const updated = themeDrawioXml(restored, currentTheme.current);
            latest.current = updated;
            draftCallback.current?.(updated);
            setDirty(true);
            send({
              action: "load",
              xml: updated,
              title: `${curTitle}.drawio`,
              autosave: 1,
              fit: 1,
              noExitBtn: 1,
            });
            setStatus("Theme applied · click Save to persist");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Theme operation failed.");
          }
          setProcessing(false);
          return;
        }
        if (cloudPending.current && saveCallback.current) {
          cloudPending.current = false;
          await persistToProject(restored);
        }
      }
    }

    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (autoFallbackTimer !== null) {
        window.clearTimeout(autoFallbackTimer);
      }
      window.clearTimeout(timeout);
      if (exportFallbackTimer.current !== null) {
        window.clearTimeout(exportFallbackTimer.current);
        exportFallbackTimer.current = null;
      }
    };
  }, [iframeKey, engineMode]);

  useEffect(() => {
    if (!xml || loadedPropXml.current === xml) return;
    if (dirty) {
      setStatus("Source data changed. Your unsaved drawing has been retained.");
      return;
    }
    loadedPropXml.current = xml;
    let nextXml = xml;
    try {
      nextXml = themeDrawioXml(nextXml, currentTheme.current);
    } catch {
      // Fallback if XML cannot be re-themed
    }
    latest.current = nextXml;
    autoSavedRef.current = null;
    if (ready && engineMode !== "svg" && validXml(nextXml)) {
      send({
        action: "load",
        xml: nextXml,
        title: `${title}.drawio`,
        autosave: 1,
        fit: 1,
        noExitBtn: 1,
        saveAndExit: 0,
      });
    }
  }, [xml, ready, title, dirty, engineMode]);

  useEffect(() => {
    const currentKey = `${modelId}:${diagramId}:${scope}`;
    if (!ready || dirty || !autoSaveWhenReady || !saveCallback.current) return;
    if (autoSavedRef.current === currentKey) return;
    autoSavedRef.current = currentKey;
    void saveCallback
      .current(latest.current)
      .then(() => {
        setDirty(false);
        setStatus("Saved");
      })
      .catch(() => {
        // Silent fallback
      });
  }, [ready, autoSaveWhenReady, modelId, diagramId, scope, xml, dirty]);

  useEffect(() => {
    if (!ready || previousTheme.current === activeTheme) return;
    previousTheme.current = activeTheme;
    try {
      const updated = themeDrawioXml(latest.current, activeTheme);
      latest.current = updated;
      draftCallback.current?.(updated);
      setDirty(true);
      setError("");
      if (engineMode !== "svg") {
        send({
          action: "load",
          xml: updated,
          title: `${propsRef.current.title}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
      }
      setStatus("Theme applied · click Save to persist");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply theme.");
    }
  }, [activeTheme, ready, engineMode]);

  function relayoutDiagram() {
    if (processing) return;
    if (engineMode === "svg") {
      void executeRelayoutOnXml(latest.current);
      return;
    }
    pending.current = "relayout";
    send({ action: "export", format: "xml" });
    if (exportFallbackTimer.current !== null) {
      window.clearTimeout(exportFallbackTimer.current);
    }
    exportFallbackTimer.current = window.setTimeout(() => {
      if (pending.current === "relayout") {
        pending.current = null;
        void executeRelayoutOnXml(latest.current);
      }
    }, 350);
  }

  function triggerSave() {
    if (processing || !saveCallback.current) return;
    if (engineMode === "svg") {
      void persistToProject(latest.current);
      return;
    }
    cloudPending.current = true;
    send({ action: "export", format: "xml" });
    if (exportFallbackTimer.current !== null) {
      window.clearTimeout(exportFallbackTimer.current);
    }
    exportFallbackTimer.current = window.setTimeout(() => {
      if (cloudPending.current) {
        cloudPending.current = false;
        void persistToProject(latest.current);
      }
    }, 350);
  }

  return (
    <section
      ref={container}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card shadow-sm [&:fullscreen]:bg-card [&:fullscreen_iframe]:h-[calc(100vh-150px)]"
      aria-label="Draw.io diagram editor"
      data-storage-key={storageKey}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="w-full min-w-0">
          <h2 className="break-words text-sm font-semibold">{title}</h2>
          <p
            role="status"
            className={`mt-0.5 text-xs ${
              dirty
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {status}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-muted/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setEngineMode("local")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "local"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Draw.io Local
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("cloud")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "cloud"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Draw.io Cloud
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("svg")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "svg"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Xem nhanh SVG
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Theme</span>
            <select
              aria-label="Diagram color theme"
              value={activeTheme}
              disabled={!ready || processing}
              onChange={(event) => {
                const next = event.target.value as DrawioTheme;
                setActiveTheme(next);
                onThemeChange?.(next);
              }}
              className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {DRAWIO_THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {engineMode !== "svg" && (
            <div role="group" aria-label="Diagram zoom" className="flex items-center gap-1">
              {(
                [
                  ["zoomOut", "−", "Zoom diagram out"],
                  ["resetView", "100%", "Read diagram at 100%"],
                  ["zoomIn", "+", "Zoom diagram in"],
                  ["fitWindow", "Fit", "Fit entire diagram"],
                ] as const
              ).map(([actionName, label, description]) => (
                <Button
                  key={actionName}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={description}
                  title={description}
                  disabled={!ready || processing}
                  onClick={() => send({ action: "invokeAction", actionName })}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          {onSave && (
            <Button
              size="sm"
              variant={dirty ? "default" : "outline"}
              className={dirty ? "ring-2 ring-primary/40 font-semibold" : ""}
              disabled={!ready || processing}
              onClick={triggerSave}
            >
              {processing ? "Saving…" : dirty ? "Save *" : "Save"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : container.current?.requestFullscreen();
              void action?.catch(() => setError("Fullscreen is unavailable in this browser."));
            }}
          >
            Fullscreen
          </Button>
        </div>
      </div>
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-500/10 p-3">
          <p role="alert" className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {error}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEngineMode("cloud");
                setAttempt((value) => value + 1);
              }}
            >
              Dùng Draw.io Trực tuyến
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry editor
            </Button>
          </div>
        </div>
      )}
      {engineMode === "svg" ? (
        <MxGraphNativeSvgPreview xml={latest.current || xml} />
      ) : (
        <div className="relative h-[720px] w-full bg-white">
          {!ready && (
            <div className=" inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/90 p-6">
              <p className="text-xs font-medium text-muted-foreground">{status}</p>
              <MxGraphNativeSvgPreview xml={latest.current || xml} />
            </div>
          )}
          <iframe
            key={iframeKey}
            ref={frame}
            title="draw.io diagram editor"
            src={activeEditorUrl}
            className="block h-[720px] w-full max-w-full border-0 bg-white"
            referrerPolicy="no-referrer"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"
          />
        </div>
      )}
      <details className="border-t p-4">
        <summary className="cursor-pointer text-sm">View generated XML source</summary>
        <pre className="mt-3 max-h-80 overflow-auto text-xs">
          <code>{original.current}</code>
        </pre>
      </details>
    </section>
  );
}
