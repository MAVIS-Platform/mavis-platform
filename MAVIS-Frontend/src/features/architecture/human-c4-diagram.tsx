"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import type { ArchitecturalModel } from "@/types/domain";
import {
  buildHumanC4Scene,
  type HumanC4Edge,
  type HumanC4Kind,
  type HumanC4Node,
  type HumanC4Scene,
} from "@/lib/architecture/human-c4-layout";

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(4, maxChars - 1))}…`;
}

function shapeStyle(shape: HumanC4Node["shape"]) {
  switch (shape) {
    case "person":
      return {
        fill: "#0f294a",
        stroke: "#1d4ed8",
        titleColor: "#ffffff",
        subColor: "#bae6fd",
        badgeBg: "rgba(255,255,255,0.16)",
        badgeColor: "#e0f2fe",
        accent: "#38bdf8",
      };
    case "system":
      return {
        fill: "url(#hc4-system-grad)",
        stroke: "#0e4391",
        titleColor: "#ffffff",
        subColor: "#dbeafe",
        badgeBg: "rgba(255,255,255,0.18)",
        badgeColor: "#f0f9ff",
        accent: "#38bdf8",
      };
    case "database":
      return {
        fill: "#ecfdf5",
        stroke: "#10b981",
        titleColor: "#064e3b",
        subColor: "#047857",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        accent: "#10b981",
      };
    case "broker":
      return {
        fill: "#fffbeb",
        stroke: "#f59e0b",
        titleColor: "#78350f",
        subColor: "#b45309",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        accent: "#f59e0b",
      };
    case "external":
      return {
        fill: "#f8fafc",
        stroke: "#64748b",
        titleColor: "#0f172a",
        subColor: "#475569",
        badgeBg: "#e2e8f0",
        badgeColor: "#334155",
        accent: "#64748b",
      };
    case "component-api":
      return {
        fill: "#f0f9ff",
        stroke: "#0284c7",
        titleColor: "#0c4a6e",
        subColor: "#0369a1",
        badgeBg: "#e0f2fe",
        badgeColor: "#075985",
        accent: "#0284c7",
      };
    case "component-service":
      return {
        fill: "#eef2ff",
        stroke: "#4f46e5",
        titleColor: "#1e1b4b",
        subColor: "#4338ca",
        badgeBg: "#e0e7ff",
        badgeColor: "#3730a3",
        accent: "#4f46e5",
      };
    case "component-data":
      return {
        fill: "#f0fdfa",
        stroke: "#0d9488",
        titleColor: "#134e4a",
        subColor: "#0f766e",
        badgeBg: "#ccfbf1",
        badgeColor: "#115e59",
        accent: "#0d9488",
      };
    case "component-client":
      return {
        fill: "#faf5ff",
        stroke: "#7c3aed",
        titleColor: "#3b0764",
        subColor: "#6d28d9",
        badgeBg: "#ede9fe",
        badgeColor: "#5b21b6",
        accent: "#7c3aed",
      };
    default:
      // container (Microservice)
      return {
        fill: "#ffffff",
        stroke: "#2563eb",
        titleColor: "#0f172a",
        subColor: "#475569",
        badgeBg: "#dbeafe",
        badgeColor: "#1e40af",
        accent: "#2563eb",
      };
  }
}

function renderNodeSvg(
  node: HumanC4Node,
  opts: {
    selected: boolean;
    dimmed: boolean;
    onHover: (id: string | null) => void;
    onClick: () => void;
  },
) {
  const s = shapeStyle(node.shape);
  const { x, y, width: w, height: h } = node;
  const cx = x + w / 2;
  const ringStroke = opts.selected ? "#f59e0b" : s.stroke;
  const ringWidth = opts.selected ? 3 : 1.75;

  return (
    <g
      key={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${node.name} (${node.badge})`}
      style={{
        cursor: node.canonicalId ? "pointer" : "default",
        opacity: opts.dimmed ? 0.28 : 1,
        transition: "opacity 160ms ease",
      }}
      onMouseEnter={() => opts.onHover(node.id)}
      onMouseLeave={() => opts.onHover(null)}
      onClick={opts.onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          opts.onClick();
        }
      }}
    >
      {/* Shape Body */}
      {node.shape === "database" ? (
        <>
          {/* Classic 3D C4 Database Cylinder */}
          <path
            d={`M ${x} ${y + 16} L ${x} ${y + h - 14} A ${w / 2} 14 0 0 0 ${x + w} ${y + h - 14} L ${x + w} ${y + 16} Z`}
            fill={s.fill}
            stroke={ringStroke}
            strokeWidth={ringWidth}
            filter="url(#hc4-shadow)"
          />
          <ellipse
            cx={cx}
            cy={y + 16}
            rx={w / 2}
            ry={14}
            fill="#d1fae5"
            stroke={ringStroke}
            strokeWidth={ringWidth}
          />
          <text
            x={cx}
            y={y + 46}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill={s.badgeColor}
          >
            [{node.badge}]
          </text>
          <text
            x={cx}
            y={y + 66}
            textAnchor="middle"
            fontSize="13.5"
            fontWeight="700"
            fill={s.titleColor}
          >
            {truncateLabel(node.name, 22)}
          </text>
          <text
            x={cx}
            y={y + 84}
            textAnchor="middle"
            fontSize="11"
            fill={s.subColor}
          >
            {truncateLabel(node.subtitle, 28)}
          </text>
        </>
      ) : node.shape === "person" ? (
        <>
          <rect
            x={x}
            y={y + 18}
            width={w}
            height={h - 18}
            rx={16}
            fill={s.fill}
            stroke={ringStroke}
            strokeWidth={ringWidth}
            filter="url(#hc4-shadow)"
          />
          {/* Classic C4 Person Head Circle */}
          <circle
            cx={cx}
            cy={y + 16}
            r={16}
            fill="#1e40af"
            stroke="#93c5fd"
            strokeWidth={2}
          />
          <circle cx={cx} cy={y + 12} r={5} fill="#ffffff" />
          <path
            d={`M ${cx - 8} ${y + 24} C ${cx - 8} ${y + 18}, ${cx + 8} ${y + 18}, ${cx + 8} ${y + 24}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text
            x={cx}
            y={y + 52}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill={s.badgeColor}
          >
            [{node.badge}]
          </text>
          <text
            x={cx}
            y={y + 72}
            textAnchor="middle"
            fontSize="13.5"
            fontWeight="700"
            fill={s.titleColor}
          >
            {truncateLabel(node.name, 26)}
          </text>
          <text
            x={cx}
            y={y + 92}
            textAnchor="middle"
            fontSize="11"
            fill={s.subColor}
          >
            {truncateLabel(node.subtitle, 34)}
          </text>
        </>
      ) : node.shape === "broker" ? (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={26}
            fill={s.fill}
            stroke={ringStroke}
            strokeWidth={ringWidth}
            filter="url(#hc4-shadow)"
          />
          <rect x={x + 12} y={y + 12} width={w - 24} height={22} rx={11} fill={s.badgeBg} />
          <text
            x={cx}
            y={y + 27}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill={s.badgeColor}
          >
            {node.badge}
          </text>
          <text
            x={cx}
            y={y + 56}
            textAnchor="middle"
            fontSize="13.5"
            fontWeight="700"
            fill={s.titleColor}
          >
            {truncateLabel(node.name, 22)}
          </text>
          <text
            x={cx}
            y={y + 76}
            textAnchor="middle"
            fontSize="11"
            fill={s.subColor}
          >
            {truncateLabel(node.subtitle, 26)}
          </text>
        </>
      ) : node.shape === "system" ? (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={18}
            fill={s.fill}
            stroke={ringStroke}
            strokeWidth={ringWidth}
            filter="url(#hc4-shadow)"
          />
          <rect x={cx - 94} y={y + 14} width={188} height={22} rx={11} fill={s.badgeBg} />
          <text
            x={cx}
            y={y + 29}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill={s.badgeColor}
          >
            {node.badge}
          </text>
          <text
            x={cx}
            y={y + 62}
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            fill={s.titleColor}
          >
            {truncateLabel(node.name, 34)}
          </text>
          <text
            x={cx}
            y={y + 84}
            textAnchor="middle"
            fontSize="12"
            fill={s.subColor}
          >
            {truncateLabel(node.subtitle, 46)}
          </text>
          {node.metaChips && node.metaChips.length > 0 && (
            <text
              x={cx}
              y={y + 114}
              textAnchor="middle"
              fontSize="10.5"
              fill="#bae6fd"
            >
              {truncateLabel(node.metaChips.join("  ·  "), 52)}
            </text>
          )}
        </>
      ) : (
        <>
          {/* Clean Container / Component Card with Top Semantic Accent Bar */}
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={14}
            fill={s.fill}
            stroke={ringStroke}
            strokeWidth={ringWidth}
            filter="url(#hc4-shadow)"
          />
          <path
            d={`M ${x + 14} ${y + 1} L ${x + w - 14} ${y + 1} Q ${x + w - 1} ${y + 1} ${x + w - 1} ${y + 6} L ${x + 1} ${y + 6} Q ${x + 1} ${y + 1} ${x + 14} ${y + 1} Z`}
            fill={s.accent}
          />
          <rect x={x + 14} y={y + 14} width={Math.min(w - 28, Math.max(82, node.badge.length * 7 + 18))} height={20} rx={10} fill={s.badgeBg} />
          <text
            x={x + 23}
            y={y + 27.5}
            fontSize="10.5"
            fontWeight="700"
            fill={s.badgeColor}
          >
            {node.badge}
          </text>
          <text
            x={x + 14}
            y={y + 54}
            fontSize="13.5"
            fontWeight="700"
            fill={s.titleColor}
          >
            {truncateLabel(node.name, 25)}
          </text>
          <text
            x={x + 14}
            y={y + 73}
            fontSize="11"
            fill={s.subColor}
          >
            {truncateLabel(node.subtitle, 30)}
          </text>
        </>
      )}
    </g>
  );
}

function renderEdgeSvg(
  edge: HumanC4Edge,
  opts: {
    selected: boolean;
    dimmed: boolean;
    onHover: (id: string | null) => void;
    onClick: () => void;
  },
) {
  const isHttp =
    edge.protocol === "SERVICE_HTTP_CALL" || edge.protocol === "GATEWAY_ROUTE";
  const isDb =
    edge.protocol === "DATABASE_ACCESS" || edge.protocol === "DATABASE_QUERY";
  const isMsg =
    edge.protocol === "MESSAGE_PUBLISH" || edge.protocol === "MESSAGE_SUBSCRIBE";

  const strokeColor = opts.selected
    ? "#d97706"
    : isDb
      ? "#059669"
      : isMsg
        ? "#d97706"
        : isHttp
          ? "#2563eb"
          : "#475569";

  const markerId = opts.selected
    ? "url(#hc4-arrow-active)"
    : isDb
      ? "url(#hc4-arrow-db)"
      : isMsg
        ? "url(#hc4-arrow-msg)"
        : isHttp
          ? "url(#hc4-arrow-http)"
          : "url(#hc4-arrow-default)";

  const pillX = edge.labelX - edge.labelWidth / 2;
  const pillY = edge.labelY - edge.labelHeight / 2;

  return (
    <g
      key={edge.id}
      style={{
        cursor: edge.canonicalId ? "pointer" : "default",
        opacity: opts.dimmed ? 0.16 : 1,
        transition: "opacity 160ms ease",
      }}
      onMouseEnter={() => opts.onHover(edge.id)}
      onMouseLeave={() => opts.onHover(null)}
      onClick={opts.onClick}
    >
      {/* Invisible thicker hit area for effortless clicking */}
      <path d={edge.pathD} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        d={edge.pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={opts.selected ? 2.8 : 1.9}
        strokeDasharray={edge.style === "dashed" ? "6 4" : undefined}
        strokeLinecap="round"
        markerEnd={markerId}
      />
      <rect
        x={pillX}
        y={pillY}
        width={edge.labelWidth}
        height={edge.labelHeight}
        rx={12}
        fill="#ffffff"
        stroke={strokeColor}
        strokeWidth={opts.selected ? 1.8 : 1}
        opacity={0.96}
      />
      <text
        x={edge.labelX}
        y={edge.labelY + 4}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill={strokeColor}
      >
        {edge.label}
      </text>
    </g>
  );
}

function DiagramCanvas({
  scene,
  selectedId,
  onSelect,
  zoom,
}: {
  scene: HumanC4Scene;
  selectedId: string | null;
  onSelect: (id: string) => void;
  zoom: number;
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const focusNodeId =
    hoveredNodeId ??
    scene.nodes.find((n) => n.canonicalId && n.canonicalId === selectedId)?.id ??
    null;

  const connectedToFocus = useMemo(() => {
    if (!focusNodeId && !hoveredEdgeId) return null;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    if (hoveredEdgeId) {
      const edge = scene.edges.find((e) => e.id === hoveredEdgeId);
      if (edge) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.from);
        nodeIds.add(edge.to);
      }
      return { nodeIds, edgeIds };
    }
    if (focusNodeId) {
      nodeIds.add(focusNodeId);
      for (const e of scene.edges) {
        if (e.from === focusNodeId || e.to === focusNodeId) {
          edgeIds.add(e.id);
          nodeIds.add(e.from);
          nodeIds.add(e.to);
        }
      }
    }
    return { nodeIds, edgeIds };
  }, [focusNodeId, hoveredEdgeId, scene.edges]);

  const scaledW = Math.round(scene.width * zoom);
  const scaledH = Math.round(scene.height * zoom);

  return (
    <div className="overflow-auto rounded-xl border bg-slate-50/70 p-3 dark:bg-slate-950/40">
      <div className="flex min-w-full justify-center">
        <svg
          width={scaledW}
          height={scaledH}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          role="img"
          aria-label={scene.title}
          className="select-none"
          style={{
            fontFamily: "var(--font-sans), Inter, system-ui, -apple-system, sans-serif",
            maxWidth: zoom <= 1 ? "100%" : "none",
            height: zoom <= 1 ? "auto" : scaledH,
          }}
        >
          <defs>
            <linearGradient id="hc4-system-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f2d5e" />
              <stop offset="55%" stopColor="#164e9e" />
              <stop offset="100%" stopColor="#0e7490" />
            </linearGradient>
            <filter id="hc4-shadow" x="-10%" y="-10%" width="120%" height="124%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.10" />
            </filter>
            {(
              [
                ["hc4-arrow-http", "#2563eb"],
                ["hc4-arrow-db", "#059669"],
                ["hc4-arrow-msg", "#d97706"],
                ["hc4-arrow-default", "#475569"],
                ["hc4-arrow-active", "#d97706"],
              ] as const
            ).map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 1 1.5 L 8.8 5 L 1 8.5 z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Subtle clean dot grid backdrop */}
          <pattern id="hc4-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#cbd5e1" opacity="0.55" />
          </pattern>
          <rect width={scene.width} height={scene.height} fill="url(#hc4-dots)" rx={12} />

          {/* System / Service Dashed Boundary Frame */}
          {scene.boundary && (
            <g>
              <rect
                x={scene.boundary.x}
                y={scene.boundary.y}
                width={scene.boundary.width}
                height={scene.boundary.height}
                rx={20}
                fill="#ffffff"
                fillOpacity={0.68}
                stroke="#94a3b8"
                strokeWidth={1.6}
                strokeDasharray="8 6"
              />
              <text
                x={scene.boundary.x + 20}
                y={scene.boundary.y + 24}
                fontSize="13"
                fontWeight="700"
                fill="#1e293b"
              >
                {scene.boundary.title}
              </text>
              <text
                x={scene.boundary.x + 20}
                y={scene.boundary.y + 40}
                fontSize="10.5"
                fontWeight="500"
                fill="#64748b"
              >
                {scene.boundary.subtitle}
              </text>
            </g>
          )}

          {/* Render Wires Underneath or Cleanly Connected */}
          <g>
            {scene.edges.map((edge) => {
              const selected = Boolean(
                selectedId &&
                  (edge.canonicalId === selectedId || edge.underlyingEdgeIds.includes(selectedId)),
              );
              const dimmed = Boolean(connectedToFocus && !connectedToFocus.edgeIds.has(edge.id));
              return renderEdgeSvg(edge, {
                selected: selected || hoveredEdgeId === edge.id,
                dimmed,
                onHover: setHoveredEdgeId,
                onClick: () => {
                  if (edge.canonicalId) onSelect(edge.canonicalId);
                },
              });
            })}
          </g>

          {/* Render C4 Shapes */}
          <g>
            {scene.nodes.map((node) => {
              const selected = Boolean(selectedId && node.canonicalId === selectedId);
              const dimmed = Boolean(connectedToFocus && !connectedToFocus.nodeIds.has(node.id));
              return renderNodeSvg(node, {
                selected: selected || hoveredNodeId === node.id,
                dimmed,
                onHover: setHoveredNodeId,
                onClick: () => {
                  if (node.canonicalId) onSelect(node.canonicalId);
                },
              });
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function HumanC4Diagram({
  model,
  kind,
  containerId,
  systemName,
  selectedId,
  onSelect,
}: {
  model: ArchitecturalModel;
  kind: HumanC4Kind;
  containerId?: string | undefined;
  systemName?: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { locale, t } = useLocale();
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const scene = useMemo(
    () =>
      buildHumanC4Scene(model, kind, {
        containerId,
        systemName,
        locale,
      }),
    [model, kind, containerId, systemName, locale],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-foreground sm:text-base">{scene.title}</h4>
          <Badge variant="outline" className="mavis-tabular text-[11px]">
            {scene.nodes.length} {t("nodes", "khối")} · {scene.edges.length}{" "}
            {t("links", "liên kết")}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{scene.subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          aria-label={t("Zoom out", "Thu nhỏ")}
          onClick={() => setZoom((z) => Math.max(0.65, Math.round((z - 0.15) * 100) / 100))}
        >
          <ZoomOut className="size-3.5" aria-hidden="true" />
        </Button>
        <span className="mavis-tabular min-w-11 text-center text-xs font-medium text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          aria-label={t("Zoom in", "Phóng to")}
          onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.15) * 100) / 100))}
        >
          <ZoomIn className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          onClick={() => setZoom(1)}
        >
          <RotateCcw className="mr-1 size-3" aria-hidden="true" />
          {t("Fit", "Vừa khung")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          onClick={() => setFullscreen((f) => !f)}
        >
          {fullscreen ? (
            <>
              <Minimize2 className="mr-1 size-3.5" aria-hidden="true" />
              {t("Close", "Thu gọn")}
            </>
          ) : (
            <>
              <Maximize2 className="mr-1 size-3.5" aria-hidden="true" />
              {t("Expand", "Toàn màn hình")}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/25 px-3.5 py-2 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-blue-600 bg-white" />
          {kind === "COMPONENT"
            ? t("Controller / Service / Adapter", "Controller / Service / Adapter")
            : t("Microservice Container", "Microservice Container")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-emerald-500 bg-emerald-100" />
          {t("Database", "Cơ sở dữ liệu")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-amber-500 bg-amber-100" />
          {t("Message Broker", "Hàng đợi (Broker)")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-blue-600" />
          {t("Sync Call (HTTP / JDBC)", "Gọi đồng bộ (HTTP / JDBC)")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-600" />
          {t("Async / Config", "Bất đồng bộ / Cấu hình")}
        </span>
      </div>
      <span>
        {t(
          "Click any node or arrow to inspect 3E source evidence.",
          "Bấm vào khối hoặc mũi tên bất kỳ để xem bằng chứng mã nguồn 3E.",
        )}
      </span>
    </div>
  );

  if (scene.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t(
          "No architectural elements extracted for this view yet.",
          "Chưa trích xuất được phần tử kiến trúc nào cho góc nhìn này.",
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
        {toolbar}
        <DiagramCanvas scene={scene} selectedId={selectedId} onSelect={onSelect} zoom={zoom} />
        {legend}
      </div>

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={scene.title}
          className="fixed inset-0 z-50 flex flex-col gap-3 bg-background/95 p-4 backdrop-blur-sm sm:p-6"
        >
          {toolbar}
          <div className="min-h-0 flex-1 overflow-auto">
            <DiagramCanvas
              scene={scene}
              selectedId={selectedId}
              onSelect={onSelect}
              zoom={zoom}
            />
          </div>
          {legend}
        </div>
      )}
    </>
  );
}
