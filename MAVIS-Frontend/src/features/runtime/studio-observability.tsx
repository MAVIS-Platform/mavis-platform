"use client";

import { useMemo, useRef, useState } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeArchitectureImpact } from "@/lib/architecture/reverse-bfs";
import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;

export type StudioQuickAction = {
  action: "START" | "STOP" | "SCALE";
  service: string;
  replicas?: number;
};

type LayoutMode = "LAYERED" | "CIRCULAR" | "GRID";

type DragPaletteItem = {
  id: string;
  label: string;
  badge: string;
  action: "START" | "STOP" | "SCALE";
  replicas?: number;
  delta?: number;
  tone: "primary" | "warning" | "danger" | "success";
};

const PALETTE_ITEMS: DragPaletteItem[] = [
  {
    id: "palette-scale-plus-1",
    label: "Scale +1 Replica",
    badge: "+1 POD",
    action: "SCALE",
    delta: 1,
    tone: "primary",
  },
  {
    id: "palette-scale-4",
    label: "Scale ×4 Cluster",
    badge: "×4 PODS",
    action: "SCALE",
    replicas: 4,
    tone: "primary",
  },
  {
    id: "palette-scale-8",
    label: "Scale ×8 Max Load",
    badge: "×8 PODS",
    action: "SCALE",
    replicas: 8,
    tone: "warning",
  },
  {
    id: "palette-stop",
    label: "Stop Container",
    badge: "FAULT",
    action: "STOP",
    tone: "danger",
  },
  {
    id: "palette-start",
    label: "Restart Service",
    badge: "RECOVER",
    action: "START",
    tone: "success",
  },
];

function parseCpuPercent(raw?: string | null): number {
  if (!raw) return 0;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Math.min(100, Math.max(0, Number(match[1]))) : 0;
}

function parseRamMiB(raw?: string | null): { usedMiB: number; limitMiB: number; percent: number } {
  if (!raw) return { usedMiB: 0, limitMiB: 512, percent: 0 };
  const parts = raw.split("/");
  const toMiB = (part?: string) => {
    if (!part) return 0;
    const m = part.trim().match(/(\d+(?:\.\d+)?)\s*(GiB|GB|MiB|MB|KiB|KB)?/i);
    if (!m) return 0;
    const val = Number(m[1]);
    const unit = (m[2] ?? "MiB").toUpperCase();
    if (unit.startsWith("G")) return val * 1024;
    if (unit.startsWith("K")) return val / 1024;
    return val;
  };
  const usedMiB = toMiB(parts[0]);
  const limitMiB = Math.max(1, toMiB(parts[1]) || 512);
  return {
    usedMiB,
    limitMiB,
    percent: Math.min(100, Math.max(0, (usedMiB / limitMiB) * 100)),
  };
}

function classifyArchetype(
  serviceName: string,
  elementType?: string,
  layer?: string,
): "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE" {
  const sig = `${serviceName} ${elementType ?? ""} ${layer ?? ""}`.toLowerCase();
  if (/(postgres|mysql|mongo|redis|db|database|data_store|storage)/.test(sig)) return "DATABASE";
  if (/(kafka|rabbit|mq|broker|queue|event|stream)/.test(sig)) return "QUEUE";
  if (/(gateway|ingress|proxy|nginx|bff|edge|router)/.test(sig)) return "GATEWAY";
  return "SERVICE";
}

function getArchetypeTheme(
  archetype: "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE",
  isStopped: boolean,
  isSelected: boolean,
  isDropTarget: boolean,
) {
  if (isStopped) {
    return {
      stroke: "#f43f5e",
      cardFill: "#2a0913",
      iconBg: "#4c0519",
      accent: "#fb7185",
      badgeText: "CRASHED",
      typeLabel: "503 FAULT",
    };
  }
  const base =
    archetype === "GATEWAY"
      ? {
          stroke: "#f59e0b",
          cardFill: "#1d1407",
          iconBg: "#451a03",
          accent: "#fbbf24",
          badgeText: "EDGE",
          typeLabel: "LOAD BALANCER",
        }
      : archetype === "DATABASE"
        ? {
            stroke: "#10b981",
            cardFill: "#061f17",
            iconBg: "#064e3b",
            accent: "#34d399",
            badgeText: "DATA",
            typeLabel: "RELATIONAL DB",
          }
        : archetype === "QUEUE"
          ? {
              stroke: "#a855f7",
              cardFill: "#1a0e29",
              iconBg: "#3b0764",
              accent: "#c084fc",
              badgeText: "STREAM",
              typeLabel: "EVENT BROKER",
            }
          : {
              stroke: "#6366f1",
              cardFill: "#0f152a",
              iconBg: "#1e1b4b",
              accent: "#818cf8",
              badgeText: "COMPUTE",
              typeLabel: "APP SERVER",
            };
  if (isDropTarget) {
    return { ...base, stroke: "#38bdf8", accent: "#38bdf8" };
  }
  if (isSelected) {
    return { ...base, stroke: base.accent };
  }
  return base;
}

function renderIsoBox(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  stroke: string,
  fillBase = "var(--background)",
  strokeWidth = 1.4,
) {
  const topY = cy - height;
  const topPoints = `${cx},${topY - ry} ${cx + rx},${topY} ${cx},${topY + ry} ${cx - rx},${topY}`;
  const leftPoints = `${cx - rx},${topY} ${cx},${topY + ry} ${cx},${cy + ry} ${cx - rx},${cy}`;
  const rightPoints = `${cx},${topY + ry} ${cx + rx},${topY} ${cx + rx},${cy} ${cx},${cy + ry}`;
  return (
    <g>
      {/* Base solid backing so dashed lines behind don't bleed through */}
      <polygon
        points={`${cx},${topY - ry} ${cx + rx},${topY} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy} ${cx - rx},${topY}`}
        fill={fillBase}
      />
      {/* Left Shaded Wall */}
      <polygon
        points={leftPoints}
        fill="currentColor"
        opacity="0.12"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Right Deep-Shaded Wall */}
      <polygon
        points={rightPoints}
        fill="currentColor"
        opacity="0.22"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Top Illuminated Roof */}
      <polygon
        points={topPoints}
        fill={fillBase}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <polygon points={topPoints} fill="currentColor" opacity="0.04" />
    </g>
  );
}

export function StudioObservability({
  data,
  selected,
  onSelect,
  busy = false,
  onQuickAction,
  onSpawnBlock,
  canvasOnly = false,
  defaultView = "2D",
}: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
  busy?: boolean;
  onQuickAction?: (command: StudioQuickAction) => void;
  onSpawnBlock?: (archetype: "SERVICE" | "GATEWAY" | "DATABASE" | "QUEUE") => string | undefined;
  canvasOnly?: boolean;
  defaultView?: "2D" | "3D";
}) {
  const { t } = useLocale();
  const [view, setView] = useState<"2D" | "3D">(defaultView);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("LAYERED");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState({ yaw: 0.45, pitch: 0.35 });
  const [customOffsets, setCustomOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [draggedTool, setDraggedTool] = useState<DragPaletteItem | null>(null);
  const [dropTargetNode, setDropTargetNode] = useState<string | null>(null);
  const [traceId, setTraceId] = useState("");
  const [exportError, setExportError] = useState(false);

  const cameraDrag = useRef<{ x: number; y: number; mode: "ROTATE" | "PAN" } | null>(null);
  const nodeDrag = useRef<{
    service: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const reference = useApiQuery(
    "model",
    { modelId: data.modelVersionId ?? "", projectId: data.projectId ?? "" },
    { enabled: Boolean(data.modelVersionId && data.projectId) },
  );
  const telemetry = data.telemetry;
  const modelId = data.serviceMappings?.[selected];
  const workerImpact = useApiQuery(
    "impact",
    { modelId: data.modelVersionId ?? "", targetId: modelId ?? "" },
    { enabled: Boolean(data.modelVersionId && modelId) },
  );
  const impact = useMemo(
    () =>
      reference.data && modelId
        ? computeArchitectureImpact(reference.data, modelId, "all", workerImpact.data?.paths ?? [])
        : null,
    [reference.data, modelId, workerImpact.data],
  );
  const affected = new Set(impact?.upstreamImpacted.map((item) => item.elementId) ?? []);

  const staticEdges = useMemo(
    () =>
      reference.data?.edges.flatMap((edge) => {
        const from = Object.entries(data.serviceMappings ?? {}).find(
          ([, id]) => id === edge.from,
        )?.[0];
        const to = Object.entries(data.serviceMappings ?? {}).find(([, id]) => id === edge.to)?.[0];
        return from && to
          ? [{ from, to, id: edge.id, protocol: edge.protocol ?? "HTTP" }]
          : [];
      }) ?? [],
    [reference.data, data.serviceMappings],
  );

  // Compute topological depth for LAYERED layout (uses staticEdges or falls back to telemetry interactions)
  const serviceDepth = useMemo(() => {
    const depths = new Map<string, number>();
    data.services.forEach((s) => depths.set(s, 0));
    const flowEdges =
      staticEdges.length > 0
        ? staticEdges
        : (telemetry?.interactions ?? []).map((edge) => ({
            from: edge.fromService,
            to: edge.toService,
          }));
    for (let pass = 0; pass < data.services.length; pass++) {
      for (const edge of flowEdges) {
        const dFrom = depths.get(edge.from) ?? 0;
        const dTo = depths.get(edge.to) ?? 0;
        if (dTo <= dFrom) {
          depths.set(edge.to, Math.min(3, dFrom + 1));
        }
      }
    }
    // Keep stateful Databases & Message Brokers in the rightmost data/infra tier
    data.services.forEach((s) => {
      const arch = classifyArchetype(s);
      if ((arch === "DATABASE" || arch === "QUEUE") && (depths.get(s) ?? 0) >= 2) {
        depths.set(s, 3);
      }
    });
    return depths;
  }, [data.services, staticEdges, telemetry?.interactions]);

  const positions = useMemo(() => {
    const raw = new Map<string, { x: number; y: number; z: number; tier: number }>();
    const total = Math.max(1, data.services.length);

    const tierGroups = new Map<number, string[]>();
    data.services.forEach((name) => {
      const tier = serviceDepth.get(name) ?? 0;
      const list = tierGroups.get(tier) ?? [];
      list.push(name);
      tierGroups.set(tier, list);
    });
    const tierKeys = [...tierGroups.keys()].sort((a, b) => a - b);

    data.services.forEach((name, index) => {
      const tier = serviceDepth.get(name) ?? 0;
      let x = 0;
      let y = 0;
      let z = (tier - 1) * 95;

      if (layoutMode === "CIRCULAR") {
        const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
        x = Math.cos(angle) * 340;
        y = Math.sin(angle) * 205;
        z = ((index % 3) - 1) * 115;
      } else if (layoutMode === "GRID") {
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const rows = Math.ceil(total / cols);
        x = (col - (cols - 1) / 2) * 290;
        y = (row - (rows - 1) / 2) * 165;
        z = (row - (rows - 1) / 2) * 105;
      } else {
        const tierIndex = Math.max(0, tierKeys.indexOf(tier));
        const tierCount = Math.max(1, tierKeys.length);
        const siblings = tierGroups.get(tier) ?? [name];
        const siblingIndex = siblings.indexOf(name);
        if (tierCount === 1) {
          const cols = Math.min(3, siblings.length);
          const col = siblingIndex % cols;
          const row = Math.floor(siblingIndex / cols);
          const rows = Math.ceil(siblings.length / cols);
          x = (col - (cols - 1) / 2) * 300;
          y = (row - (rows - 1) / 2) * 165;
        } else {
          x = (tierIndex - (tierCount - 1) / 2) * 300;
          y = (siblingIndex - (siblings.length - 1) / 2) * 165;
        }
        z = (tierIndex - (tierCount - 1) / 2) * 125;
      }

      if (view === "3D") {
        const rotatedX = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw);
        const rotatedZ = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
        x = rotatedX;
        z = rotatedZ;
        const rotatedY = y * Math.cos(camera.pitch) - z * Math.sin(camera.pitch);
        z = y * Math.sin(camera.pitch) + z * Math.cos(camera.pitch);
        y = rotatedY;
        const perspective = 920 / Math.max(280, 920 + z);
        x *= perspective;
        y *= perspective;
      }

      raw.set(name, { x: x + 600, y: y + 340, z, tier });
    });

    if (raw.size > 0) {
      const points = [...raw.values()];
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const fit = Math.min(1, 960 / Math.max(1, maxX - minX), 460 / Math.max(1, maxY - minY));
      for (const [name, point] of raw.entries()) {
        const offset = customOffsets[name] ?? { x: 0, y: 0 };
        const pinned = pinnedPositions[name];
        let px = pinned
          ? pinned.x + offset.x + pan.x
          : 600 + (point.x - (minX + maxX) / 2) * fit + offset.x + pan.x;
        let py = pinned
          ? pinned.y + offset.y + pan.y
          : 340 + (point.y - (minY + maxY) / 2) * fit + offset.y + pan.y;
        px = 600 + (px - 600) * zoom;
        py = 340 + (py - 340) * zoom;
        if (snapToGrid && view === "2D" && (offset.x !== 0 || offset.y !== 0 || Boolean(pinned))) {
          px = Math.round(px / 16) * 16;
          py = Math.round(py / 16) * 16;
        }
        point.x = Math.max(88, Math.min(1112, px));
        point.y = Math.max(58, Math.min(602, py));
      }
    }
    return raw;
  }, [
    data.services,
    serviceDepth,
    layoutMode,
    view,
    camera,
    customOffsets,
    pinnedPositions,
    pan,
    zoom,
    snapToGrid,
  ]);

  function resolveLiveReplicas(serviceName: string): number {
    const live = telemetry?.services.find((item) => item.service === serviceName);
    if (live) return live.runningReplicas;
    const confirmed = [...data.actions]
      .reverse()
      .find((item) => item.service === serviceName && item.status === "CONFIRMED");
    return confirmed?.result?.replicasAfter ?? 1;
  }

  function applyPaletteToolToService(tool: DragPaletteItem, targetService: string) {
    if (busy || !onQuickAction) return;
    onSelect(targetService);
    if (tool.action === "STOP") {
      onQuickAction({ action: "STOP", service: targetService });
      return;
    }
    if (tool.action === "START") {
      onQuickAction({ action: "START", service: targetService });
      return;
    }
    const current = resolveLiveReplicas(targetService);
    const nextReplicas = tool.delta
      ? Math.max(1, Math.min(8, (current <= 0 ? 1 : current) + tool.delta))
      : Math.max(1, Math.min(8, tool.replicas ?? 2));
    onQuickAction({ action: "SCALE", service: targetService, replicas: nextReplicas });
  }

  async function downloadGraph(png = false) {
    if (!svg.current) return;
    try {
      const url = png
        ? await captureStudioImage(svg.current)
        : URL.createObjectURL(
            new Blob([serializeStudioGraph(svg.current)], { type: "image/svg+xml;charset=utf-8" }),
          );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `studio-${data.sessionId}-${view}.${png ? "png" : "svg"}`;
      anchor.click();
      if (!png) URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    }
  }

  const selectedLive = telemetry?.services.find((item) => item.service === selected);
  const selectedReplicas = resolveLiveReplicas(selected);

  // Compute Project Deployment & Scaling Impact Matrix rows (Static AST + Live Docker/OTel Delta)
  const deploymentRows = useMemo(() => {
    return data.services.map((serviceName) => {
      const elId = data.serviceMappings?.[serviceName];
      const element = reference.data?.elements.find((el) => el.id === elId);
      const inboundStatic = staticEdges.filter((e) => e.to === serviceName);
      const outboundStatic = staticEdges.filter((e) => e.from === serviceName);
      const live = telemetry?.services.find((item) => item.service === serviceName);
      const latestAction = [...data.actions]
        .reverse()
        .find((item) => item.service === serviceName && item.status === "CONFIRMED");
      const firstAction = data.actions.find(
        (item) => item.service === serviceName && item.status === "CONFIRMED",
      );
      const replicasBefore = firstAction?.result?.replicasBefore ?? 1;
      const replicasNow = live?.runningReplicas ?? latestAction?.result?.replicasAfter ?? 1;
      const cpuValues = (live?.stats ?? []).map((s) => parseCpuPercent(s.cpu));
      const ramValues = (live?.stats ?? []).map((s) => parseRamMiB(s.memory));
      const avgCpu =
        cpuValues.length > 0
          ? cpuValues.reduce((acc, v) => acc + v, 0) / cpuValues.length
          : 0;
      const perInstanceRamMiB =
        ramValues.length > 0
          ? ramValues.reduce((acc, v) => acc + v.usedMiB, 0) / ramValues.length
          : 0;
      const ramLimitMiB = ramValues[0]?.limitMiB ?? 512;
      const totalServiceRamMiB =
        ramValues.length > 1
          ? ramValues.reduce((acc, v) => acc + v.usedMiB, 0)
          : perInstanceRamMiB * Math.max(0, replicasNow);
      const p95Before = latestAction?.result?.metricsBefore?.["p95LatencyMs"];
      const p95After = latestAction?.result?.metricsAfter?.["p95LatencyMs"];
      const reqBefore = latestAction?.result?.metricsBefore?.["requestCount"];
      const reqAfter = latestAction?.result?.metricsAfter?.["requestCount"];
      const errAfter = latestAction?.result?.metricsAfter?.["errorRatePercent"];

      const downstreamServices = outboundStatic.map((e) => e.to);
      const bottleneckTarget = downstreamServices.find((ds) => {
        const dsReplicas = resolveLiveReplicas(ds);
        return replicasNow >= 4 && dsReplicas <= 1;
      });

      return {
        serviceName,
        layer: element?.layer ?? "domain",
        elementType: element?.elementType ?? "SERVICE_CONTAINER",
        evidenceCount: element?.evidence?.length ?? 0,
        inboundCount: inboundStatic.length,
        outboundCount: outboundStatic.length,
        protocols: [...new Set([...inboundStatic, ...outboundStatic].map((e) => e.protocol))].join(
          ", ",
        ),
        replicasBefore,
        replicasNow,
        avgCpu,
        perInstanceRamMiB,
        totalServiceRamMiB,
        ramLimitMiB,
        p95Before: typeof p95Before === "number" ? p95Before : undefined,
        p95After: typeof p95After === "number" ? p95After : undefined,
        reqBefore: typeof reqBefore === "number" ? reqBefore : undefined,
        reqAfter: typeof reqAfter === "number" ? reqAfter : undefined,
        errAfter: typeof errAfter === "number" ? errAfter : undefined,
        bottleneckTarget,
      };
    });
  }, [data.services, data.serviceMappings, data.actions, reference.data, staticEdges, telemetry]);

  const totalRunningInstances = deploymentRows.reduce((sum, r) => sum + r.replicasNow, 0);
  const totalRamMiB = deploymentRows.reduce((sum, r) => sum + r.totalServiceRamMiB, 0);
  const avgClusterCpu =
    deploymentRows.length > 0
      ? deploymentRows.reduce((sum, r) => sum + r.avgCpu, 0) / deploymentRows.length
      : 0;

  return (
    <div className={canvasOnly ? "flex h-full min-h-0 flex-1 flex-col gap-2" : "space-y-4"}>
      {exportError && <p role="alert">{t("Could not export graph")}</p>}

      {/* Top Studio Viewport & Layout Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
        <h3 className="mr-auto font-medium">{t("Runtime topology and impact")}</h3>
        {(["2D", "3D"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={view === mode ? "default" : "outline"}
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
          >
            {mode}
          </Button>
        ))}
        <div className="flex flex-wrap items-center gap-1 border-l pl-2">
          {(
            [
              ["LAYERED", "Layered"],
              ["CIRCULAR", "Circular"],
              ["GRID", "Grid"],
            ] as const
          ).map(([mode, label]) => (
            <Button
              key={mode}
              size="sm"
              variant={layoutMode === mode ? "secondary" : "outline"}
              onClick={() => {
                setLayoutMode(mode);
                setCustomOffsets({});
              }}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        {view === "3D" && (
          <div className="flex flex-wrap items-center gap-1 border-l pl-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw - 0.2 }))}
            >
              {t("Rotate left")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw + 0.2 }))}
            >
              {t("Rotate right")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCamera((value) => ({ ...value, pitch: Math.min(0.95, value.pitch + 0.15) }))
              }
            >
              {t("Tilt up")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCamera((value) => ({ ...value, pitch: Math.max(-0.6, value.pitch - 0.15) }))
              }
            >
              {t("Tilt down")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera({ yaw: 0.55, pitch: 0.38 })}
            >
              {t("Isometric")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera({ yaw: 0.0, pitch: 0.92 })}
            >
              {t("Top-down")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera({ yaw: 0.2, pitch: 0.08 })}
            >
              {t("Elevation")}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 border-l pl-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={t("Zoom in")}
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
          >
            +
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={t("Zoom out")}
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
          >
            −
          </Button>
          <Button
            size="sm"
            variant={snapToGrid ? "secondary" : "outline"}
            onClick={() => setSnapToGrid((prev) => !prev)}
          >
            {t("Snap to grid")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCustomOffsets({});
              setPinnedPositions({});
              setPan({ x: 0, y: 0 });
              setZoom(1);
              setCamera({ yaw: 0.45, pitch: 0.35 });
            }}
          >
            {t("Reset layout")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-l pl-2">
          <Button size="sm" variant="outline" onClick={() => void downloadGraph()}>
            {t("Export graph")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void downloadGraph(true)}>
            {t("Export snapshot image")}
          </Button>
        </div>
      </div>

      {/* Drag-and-Drop Action Palette (Drag onto any 2D/3D Service Block) */}
      {!canvasOnly && (
        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("Studio Action Palette")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("Drag an action block onto any service node on the 2D/3D canvas")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {PALETTE_ITEMS.map((item) => {
              const active = draggedTool?.id === item.id;
              return (
                <div
                  key={item.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    if (busy) {
                      event.preventDefault();
                      return;
                    }
                    setDraggedTool(item);
                    event.dataTransfer.setData("application/x-mavis-studio-tool", item.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => {
                    setDraggedTool(null);
                    setDropTargetNode(null);
                  }}
                  onClick={() => {
                    if (selected && !busy) {
                      applyPaletteToolToService(item, selected);
                    }
                  }}
                  className={`flex cursor-grab select-none flex-col justify-between rounded-md border p-2 text-left text-xs transition active:cursor-grabbing ${
                    busy
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-primary hover:bg-accent/40"
                  } ${active ? "ring-2 ring-primary" : ""}`}
                  title={`${t(item.label)} — ${t("Drop onto a service node to execute")}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                      {item.badge}
                    </span>
                    <span className="text-[10px] text-muted-foreground">⋮⋮</span>
                  </div>
                  <span className="mt-1.5 font-medium">{t(item.label)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive 2D/3D Studio Canvas + Volumetric 3D Isometric Server Racks & Stacked Replica Cubes */}
      <div
        className={
          canvasOnly
            ? "relative flex min-h-0 flex-1 overflow-hidden"
            : "relative max-w-full overflow-x-auto"
        }
      >
        <svg
          ref={svg}
          data-studio-graph="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 660"
          className={
            canvasOnly
              ? "h-full w-full select-none rounded-lg border bg-background shadow-inner"
              : "min-w-[640px] w-full select-none rounded-lg border bg-background shadow-inner"
          }
          role="group"
          aria-label={t("Runtime topology and impact")}
          style={{
            ...(canvasOnly ? {} : { maxHeight: 560 }),
            touchAction: view === "3D" || draggingNode ? "none" : "auto",
            cursor: draggingNode ? "grabbing" : view === "3D" ? "grab" : "default",
          }}
          onWheel={(event) => {
            if (!canvasOnly) return;
            const delta = event.deltaY < 0 ? 0.1 : -0.1;
            setZoom((z) => Math.max(0.4, Math.min(2.2, Number((z + delta).toFixed(2)))));
          }}
          onDragOver={(event) => {
            if (busy) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const spawnArch = event.dataTransfer.getData("application/x-mavis-studio-spawn") as
              | "SERVICE"
              | "GATEWAY"
              | "DATABASE"
              | "QUEUE"
              | "";
            if (!spawnArch || !onSpawnBlock) return;
            event.preventDefault();
            const createdName = onSpawnBlock(spawnArch);
            if (createdName && svg.current) {
              const rect = svg.current.getBoundingClientRect();
              const dropX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1200;
              const dropY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 660;
              setPinnedPositions((prev) => ({
                ...prev,
                [createdName]: {
                  x: Math.max(88, Math.min(1112, dropX)),
                  y: Math.max(58, Math.min(602, dropY)),
                },
              }));
            }
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              cameraDrag.current = {
                x: event.clientX,
                y: event.clientY,
                mode: view === "3D" ? "ROTATE" : "PAN",
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerUp={() => {
            cameraDrag.current = null;
            nodeDrag.current = null;
            setDraggingNode(null);
          }}
          onPointerCancel={() => {
            cameraDrag.current = null;
            nodeDrag.current = null;
            setDraggingNode(null);
          }}
          onPointerMove={(event) => {
            if (nodeDrag.current && svg.current) {
              const rect = svg.current.getBoundingClientRect();
              const scaleX = 1200 / Math.max(1, rect.width);
              const scaleY = 660 / Math.max(1, rect.height);
              const dx = ((event.clientX - nodeDrag.current.startX) * scaleX) / zoom;
              const dy = ((event.clientY - nodeDrag.current.startY) * scaleY) / zoom;
              if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                nodeDrag.current.moved = true;
              }
              const targetService = nodeDrag.current.service;
              const nextX = nodeDrag.current.origX + dx;
              const nextY = nodeDrag.current.origY + dy;
              setCustomOffsets((prev) => ({
                ...prev,
                [targetService]: {
                  x: snapToGrid ? Math.round(nextX / 12) * 12 : nextX,
                  y: snapToGrid ? Math.round(nextY / 12) * 12 : nextY,
                },
              }));
              return;
            }
            if (!cameraDrag.current) return;
            const dx = event.clientX - cameraDrag.current.x;
            const dy = event.clientY - cameraDrag.current.y;
            cameraDrag.current = {
              x: event.clientX,
              y: event.clientY,
              mode: cameraDrag.current.mode,
            };
            if (cameraDrag.current.mode === "ROTATE") {
              setCamera((value) => ({
                yaw: value.yaw + dx * 0.008,
                pitch: Math.max(-1, Math.min(1, value.pitch + dy * 0.008)),
              }));
            } else {
              setPan((prev) => ({
                x: Math.max(-520, Math.min(520, prev.x + dx * 0.9)),
                y: Math.max(-340, Math.min(340, prev.y + dy * 0.9)),
              }));
            }
          }}
        >
          <defs>
            <pattern id="studio-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity="0.08"
              />
            </pattern>
            <marker
              id="studio-arrow-live"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary)" />
            </marker>
            <marker
              id="studio-arrow-fault"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--destructive)" />
            </marker>
          </defs>

          {/* Subtle Studio Blueprint Grid */}
          <rect x="0" y="0" width="1200" height="660" fill="url(#studio-grid)" />

          {/* 3D Isometric Multi-Tier Architecture Platform Deck when in 3D mode */}
          {view === "3D" && (
            <g>
              {/* Outer 3D Slab Side Thickness */}
              <polygon
                points="110,340 600,600 1090,340 1090,352 600,612 110,352"
                fill="currentColor"
                opacity="0.11"
              />
              {/* Main Isometric Platform Surface */}
              <polygon
                points="600,80 1090,340 600,600 110,340"
                fill="currentColor"
                opacity="0.035"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="5 4"
              />
              {/* Inner Tier Zone Divider Lines */}
              <line
                x1="435"
                y1="168"
                x2="925"
                y2="428"
                stroke="currentColor"
                strokeDasharray="3 4"
                opacity="0.22"
              />
              <line
                x1="275"
                y1="252"
                x2="765"
                y2="512"
                stroke="currentColor"
                strokeDasharray="3 4"
                opacity="0.22"
              />
              {/* 3D Tier Zone Labels */}
              <text x="290" y="182" fill="currentColor" fontSize="11" opacity="0.55">
                {t("Ingress / Edge Tier")}
              </text>
              <text x="910" y="495" fill="currentColor" fontSize="11" opacity="0.55" textAnchor="end">
                {t("Data & Downstream Tier")}
              </text>
            </g>
          )}

          {/* Legend & Viewport Metadata */}
          <text x="20" y="26" fill="currentColor" fontSize="12">
            {t("Static dependencies (dashed)")}
          </text>
          <text x="20" y="44" fill="currentColor" fontSize="12">
            {t("Observed runtime (solid)")}
          </text>
          <text x="1180" y="26" fill="currentColor" fontSize="12" textAnchor="end">
            {view}
          </text>
          <text x="1180" y="44" fill="currentColor" fontSize="10" opacity="0.65" textAnchor="end">
            {layoutMode} · {Math.round(zoom * 100)}%
          </text>

          {/* Static Dependency Edges + Severed Link / Circuit Breaker Banner when target is STOPPED */}
          {staticEdges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const targetStopped = resolveLiveReplicas(edge.to) === 0;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g key={edge.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={targetStopped ? "var(--destructive)" : "currentColor"}
                  strokeDasharray={targetStopped ? "6 4" : "5 5"}
                  strokeWidth={targetStopped ? "2.2" : "1.5"}
                  opacity={targetStopped ? "0.9" : ".28"}
                  markerEnd={targetStopped ? "url(#studio-arrow-fault)" : undefined}
                />
                {targetStopped && (
                  <g>
                    <rect
                      x={midX - 54}
                      y={midY - 10}
                      width="108"
                      height="18"
                      rx="4"
                      fill="var(--background)"
                      stroke="var(--destructive)"
                      strokeWidth="1.2"
                    />
                    <text
                      x={midX}
                      y={midY + 2}
                      textAnchor="middle"
                      fill="var(--destructive)"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {t("503 / CIRCUIT OPEN")}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Observed Live OTel Trace Edges + Animated SVG Traffic Pulses */}
          {telemetry?.interactions
            .filter((edge) => !traceId || edge.traceId === traceId)
            .map((edge, index) => {
              const from = positions.get(edge.fromService);
              const to = positions.get(edge.toService);
              if (!from || !to) return null;
              const targetStopped = resolveLiveReplicas(edge.toService) === 0;
              const targetReplicas = resolveLiveReplicas(edge.toService);
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const qx1 = from.x + (to.x - from.x) * 0.28;
              const qy1 = from.y + (to.y - from.y) * 0.28;
              const qx2 = from.x + (to.x - from.x) * 0.72;
              const qy2 = from.y + (to.y - from.y) * 0.72;
              const cx1 = from.x + (to.x - from.x) * 0.5;
              const cx2 = from.x + (to.x - from.x) * 0.5;
              const pathD = `M ${from.x} ${from.y} C ${cx1} ${from.y}, ${cx2} ${to.y}, ${to.x} ${to.y}`;
              const speedSec = Math.max(0.7, 2.2 / Math.max(1, Math.min(targetReplicas, 6))).toFixed(
                2,
              );
              const edgeColor = targetStopped ? "#f43f5e" : "#38bdf8";
              return (
                <g
                  key={edge.traceId + index}
                  onClick={() => setTraceId(edge.traceId)}
                  className="cursor-pointer"
                >
                  <title>{edge.fromService + " → " + edge.toService + " · " + edge.traceId}</title>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={edgeColor}
                    strokeDasharray={targetStopped ? "6 4" : undefined}
                    strokeWidth="2.2"
                    opacity={targetStopped ? "0.9" : "0.65"}
                    markerEnd={
                      targetStopped ? "url(#studio-arrow-fault)" : "url(#studio-arrow-live)"
                    }
                  />
                  {/* Static snapshot anchor dots + Live animated motion pulses */}
                  <circle
                    cx={qx1}
                    cy={qy1}
                    r="3"
                    fill={edgeColor}
                    opacity="0.65"
                  />
                  <circle
                    cx={mx}
                    cy={my}
                    r="4.5"
                    fill={edgeColor}
                  />
                  <circle
                    cx={qx2}
                    cy={qy2}
                    r="3"
                    fill={edgeColor}
                    opacity="0.65"
                  />
                  {!targetStopped && (
                    <circle r="4.5" fill="#38bdf8">
                      <animateMotion dur={`${speedSec}s`} repeatCount="indefinite" path={pathD} />
                    </circle>
                  )}
                </g>
              );
            })}

          {/* Interactive Draggable 2D/3D Service Blocks + True Volumetric 3D Isometric Server Racks & Stacked Replica Cubes */}
          {[...positions.entries()]
            .sort((a, b) => b[1].z - a[1].z)
            .map(([name, point]) => {
              const live = telemetry?.services.find((item) => item.service === name);
              const elId = data.serviceMappings?.[name];
              const element = reference.data?.elements.find((el) => el.id === elId);
              const archetype = classifyArchetype(name, element?.elementType, element?.layer);
              const isAffected = affected.has(elId ?? "");
              const isSelected = selected === name;
              const isDropTarget = dropTargetNode === name;
              const isStopped = live !== undefined && live.runningReplicas === 0;
              const activePods = Math.min(live?.runningReplicas ?? 0, 8);

              const cpuPercent = parseCpuPercent(live?.stats[0]?.cpu);
              const ramInfo = parseRamMiB(live?.stats[0]?.memory);

              const theme = getArchetypeTheme(
                archetype,
                isStopped || isAffected,
                isSelected,
                isDropTarget,
              );
              const strokeColor = theme.stroke;

              // 3D Isometric Pedestal + Volumetric Stacked Replica Cubes (Cloudcraft style)
              if (view === "3D") {
                const towerHeight = isStopped ? 8 : 16 + activePods * 5;
                // Compute up to 8 3D mini container cube positions arranged in 2 rows × 4 columns on the pedestal roof
                const podSlots = [
                  { dx: -30, dy: -6 },
                  { dx: -10, dy: -15 },
                  { dx: 10, dy: -6 },
                  { dx: 30, dy: -15 },
                  { dx: -24, dy: 5 },
                  { dx: -4, dy: -4 },
                  { dx: 16, dy: 5 },
                  { dx: 36, dy: -4 },
                ];

                return (
                  <g
                    key={name}
                    role="button"
                    tabIndex={0}
                    aria-label={name}
                    aria-pressed={isSelected}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      const existing = customOffsets[name] ?? { x: 0, y: 0 };
                      nodeDrag.current = {
                        service: name,
                        startX: event.clientX,
                        startY: event.clientY,
                        origX: existing.x,
                        origY: existing.y,
                        moved: false,
                      };
                      setDraggingNode(name);
                    }}
                    onClick={() => {
                      onSelect(name);
                    }}
                    onDragOver={(event) => {
                      if (busy) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      if (dropTargetNode !== name) setDropTargetNode(name);
                    }}
                    onDragLeave={() => {
                      if (dropTargetNode === name) setDropTargetNode(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropTargetNode(null);
                      const toolId = event.dataTransfer.getData("application/x-mavis-studio-tool");
                      const tool =
                        PALETTE_ITEMS.find((item) => item.id === toolId) ?? draggedTool ?? null;
                      if (tool) {
                        applyPaletteToolToService(tool, name);
                      }
                      setDraggedTool(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(name);
                      }
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {/* 3D Isometric Ground Shadow */}
                    <polygon
                      points={`${point.x},${point.y - 35} ${point.x + 82},${point.y + 6} ${point.x},${point.y + 47} ${point.x - 82},${point.y + 6}`}
                      fill={theme.stroke}
                      opacity="0.16"
                    />

                    {/* Drop Target Highlight Isometric Ring */}
                    {isDropTarget && (
                      <polygon
                        points={`${point.x},${point.y - 46} ${point.x + 90},${point.y} ${point.x},${point.y + 46} ${point.x - 90},${point.y}`}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                      />
                    )}

                    {/* 3D Base Pedestal Slab */}
                    {renderIsoBox(
                      point.x,
                      point.y + 6,
                      76,
                      36,
                      14,
                      strokeColor,
                      theme.cardFill,
                      isSelected || isDropTarget ? 2.6 : 1.5,
                    )}

                    {/* Main 3D Archetype Sculpture: Database Cylinder / Gateway Hex-Prism / Queue Pipeline / Server Blade Rack */}
                    {archetype === "DATABASE" ? (
                      <g>
                        <path
                          d={`M ${point.x - 36},${point.y - 8 - towerHeight} L ${point.x - 36},${point.y - 6} A 36 15 0 0 0 ${point.x + 36},${point.y - 6} L ${point.x + 36},${point.y - 8 - towerHeight} Z`}
                          fill={theme.cardFill}
                          stroke={strokeColor}
                          strokeWidth="1.9"
                        />
                        {/* 3D Database Platter Grooves */}
                        <path
                          d={`M ${point.x - 36},${point.y - 6 - towerHeight * 0.35} A 36 14 0 0 0 ${point.x + 36},${point.y - 6 - towerHeight * 0.35}`}
                          fill="none"
                          stroke={theme.accent}
                          strokeWidth="1.2"
                          opacity="0.65"
                        />
                        <path
                          d={`M ${point.x - 36},${point.y - 6 - towerHeight * 0.7} A 36 14 0 0 0 ${point.x + 36},${point.y - 6 - towerHeight * 0.7}`}
                          fill="none"
                          stroke={theme.accent}
                          strokeWidth="1.2"
                          opacity="0.65"
                        />
                        <ellipse
                          cx={point.x}
                          cy={point.y - 8 - towerHeight}
                          rx="36"
                          ry="15"
                          fill={theme.iconBg}
                          stroke={strokeColor}
                          strokeWidth="1.9"
                        />
                        <ellipse
                          cx={point.x}
                          cy={point.y - 8 - towerHeight}
                          rx="18"
                          ry="7"
                          fill="none"
                          stroke={theme.accent}
                          strokeWidth="1.1"
                          opacity="0.8"
                        />
                      </g>
                    ) : archetype === "GATEWAY" ? (
                      <g>
                        {/* Tapered Hexagonal / Trapezoidal 3D Load-Balancer Router Frustum */}
                        <polygon
                          points={`${point.x - 52},${point.y - 6} ${point.x},${point.y + 18} ${point.x + 52},${point.y - 6} ${point.x + 34},${point.y - 10 - towerHeight} ${point.x},${point.y + 6 - towerHeight} ${point.x - 34},${point.y - 10 - towerHeight}`}
                          fill={theme.iconBg}
                          stroke={strokeColor}
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <polygon
                          points={`${point.x},${point.y - 24 - towerHeight} ${point.x + 34},${point.y - 10 - towerHeight} ${point.x},${point.y + 6 - towerHeight} ${point.x - 34},${point.y - 10 - towerHeight}`}
                          fill={theme.cardFill}
                          stroke={strokeColor}
                          strokeWidth="1.8"
                        />
                        {/* Router Signal Spire / Beacon */}
                        <line
                          x1={point.x}
                          y1={point.y - 10 - towerHeight}
                          x2={point.x}
                          y2={point.y - 26 - towerHeight}
                          stroke={theme.accent}
                          strokeWidth="2"
                        />
                        <circle
                          cx={point.x}
                          cy={point.y - 28 - towerHeight}
                          r="4"
                          fill={theme.accent}
                        />
                      </g>
                    ) : archetype === "QUEUE" ? (
                      <g>
                        {/* 3-Partition Isometric Event Stream Pipeline Conduit */}
                        {[-14, 0, 14].map((offsetY, idx) => (
                          <g key={idx}>
                            <rect
                              x={point.x - 44}
                              y={point.y - 24 - towerHeight * 0.5 + offsetY * 0.7}
                              width="88"
                              height="11"
                              rx="5.5"
                              fill={theme.iconBg}
                              stroke={strokeColor}
                              strokeWidth="1.5"
                            />
                            <circle
                              cx={point.x - 24 + idx * 24}
                              cy={point.y - 18.5 - towerHeight * 0.5 + offsetY * 0.7}
                              r="2.8"
                              fill={theme.accent}
                            />
                          </g>
                        ))}
                      </g>
                    ) : (
                      <g>
                        {renderIsoBox(
                          point.x,
                          point.y - 8,
                          46,
                          22,
                          towerHeight,
                          strokeColor,
                          theme.iconBg,
                          isSelected ? 2.4 : 1.5,
                        )}
                        {/* Glowing 3D Server Rack Blade Slots on Left & Right Walls */}
                        <line
                          x1={point.x - 36}
                          y1={point.y - 12}
                          x2={point.x - 8}
                          y2={point.y + 1}
                          stroke={theme.accent}
                          strokeWidth="1.6"
                          opacity="0.85"
                        />
                        <line
                          x1={point.x - 36}
                          y1={point.y - 19}
                          x2={point.x - 8}
                          y2={point.y - 6}
                          stroke={theme.accent}
                          strokeWidth="1.6"
                          opacity="0.7"
                        />
                        <line
                          x1={point.x + 8}
                          y1={point.y + 1}
                          x2={point.x + 36}
                          y2={point.y - 12}
                          stroke={theme.accent}
                          strokeWidth="1.6"
                          opacity="0.85"
                        />
                      </g>
                    )}

                    {/* Stacked 3D Isometric Replica Container Cubes (1..8 volumetric cubes on the tower roof) */}
                    {Array.from({ length: activePods }, (_, i) => {
                      const slot = podSlots[i] ?? { dx: 0, dy: 0 };
                      const stackLayer = Math.floor(i / 4);
                      const cubeCx = point.x + slot.dx * 0.65;
                      const cubeCy =
                        point.y - 8 - towerHeight + slot.dy * 0.65 - stackLayer * 11;
                      return (
                        <g key={i}>
                          {renderIsoBox(
                            cubeCx,
                            cubeCy,
                            10,
                            5.5,
                            9,
                            theme.accent,
                            theme.cardFill,
                            1.3,
                          )}
                          <circle
                            cx={cubeCx}
                            cy={cubeCy - 9}
                            r="2.2"
                            fill={theme.accent}
                          />
                        </g>
                      );
                    })}

                    {/* Floating 3D Billboard HUD Tag above the 3D Tower */}
                    <rect
                      x={point.x - 68}
                      y={point.y + 14}
                      width="136"
                      height="40"
                      rx="7"
                      fill={theme.cardFill}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2.4 : 1.4}
                    />
                    <circle
                      cx={point.x - 54}
                      cy={point.y + 26}
                      r="3.8"
                      fill={theme.accent}
                    />
                    <text
                      x={point.x + 4}
                      y={point.y + 29}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="11.5"
                      fontWeight="700"
                    >
                      {name}
                    </text>
                    <text
                      x={point.x}
                      y={point.y + 42}
                      textAnchor="middle"
                      fill={theme.accent}
                      fontSize="10"
                      fontWeight="600"
                    >
                      {live
                        ? `${live.runningReplicas}/${live.replicas} ${t("running")}`
                        : t("Waiting for telemetry")}
                    </text>

                    {/* Mini CPU & RAM Bars on the 3D HUD */}
                    <rect
                      x={point.x - 56}
                      y={point.y + 47}
                      width="52"
                      height="3.5"
                      rx="1.5"
                      fill="#1e293b"
                    />
                    <rect
                      x={point.x - 56}
                      y={point.y + 47}
                      width={Math.max(3, Math.round((cpuPercent / 100) * 52))}
                      height="3.5"
                      rx="1.5"
                      fill="#38bdf8"
                    />
                    <rect
                      x={point.x + 4}
                      y={point.y + 47}
                      width="52"
                      height="3.5"
                      rx="1.5"
                      fill="#1e293b"
                    />
                    <rect
                      x={point.x + 4}
                      y={point.y + 47}
                      width={Math.max(3, Math.round((ramInfo.percent / 100) * 52))}
                      height="3.5"
                      rx="1.5"
                      fill="#10b981"
                    />
                  </g>
                );
              }

              // 2D Mode Distinct Archetype Silhouettes (Cylinder DB, Trapezoid Gateway, Flanged Pipe Queue, Rack Blade Service)
              return (
                <g
                  key={name}
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  aria-pressed={isSelected}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const existing = customOffsets[name] ?? { x: 0, y: 0 };
                    nodeDrag.current = {
                      service: name,
                      startX: event.clientX,
                      startY: event.clientY,
                      origX: existing.x,
                      origY: existing.y,
                      moved: false,
                    };
                    setDraggingNode(name);
                  }}
                  onClick={() => {
                    onSelect(name);
                  }}
                  onDragOver={(event) => {
                    if (busy) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (dropTargetNode !== name) setDropTargetNode(name);
                  }}
                  onDragLeave={() => {
                    if (dropTargetNode === name) setDropTargetNode(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropTargetNode(null);
                    const toolId = event.dataTransfer.getData("application/x-mavis-studio-tool");
                    const tool =
                      PALETTE_ITEMS.find((item) => item.id === toolId) ?? draggedTool ?? null;
                    if (tool) {
                      applyPaletteToolToService(tool, name);
                    }
                    setDraggedTool(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(name);
                    }
                  }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  {/* Drop Target / Selected Outer Glow Halo */}
                  {(isDropTarget || isSelected || isStopped) && (
                    <rect
                      x={point.x - 88}
                      y={point.y - 42}
                      width="176"
                      height="84"
                      rx="14"
                      fill={theme.stroke}
                      opacity={isStopped ? "0.18" : "0.14"}
                      stroke={theme.stroke}
                      strokeWidth={isDropTarget ? "2.5" : "1.5"}
                      strokeDasharray={isDropTarget ? "4 3" : undefined}
                    />
                  )}

                  {/* DISTINCT 2D SILHOUETTE PER ARCHETYPE */}
                  {archetype === "DATABASE" ? (
                    <g>
                      {/* Cylindrical Database Drum Body + Top Elliptical Platter Lid */}
                      <path
                        d={`M ${point.x - 80},${point.y - 24} L ${point.x - 80},${point.y + 24} A 80 14 0 0 0 ${point.x + 80},${point.y + 24} L ${point.x + 80},${point.y - 24} Z`}
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      <ellipse
                        cx={point.x}
                        cy={point.y - 24}
                        rx="80"
                        ry="13"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.4 : 1.6}
                      />
                      <path
                        d={`M ${point.x - 80},${point.y + 2} A 80 11 0 0 0 ${point.x + 80},${point.y + 2}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                        opacity="0.35"
                      />
                    </g>
                  ) : archetype === "GATEWAY" ? (
                    <g>
                      {/* Trapezoid Load Balancer Shield (200Lab style) */}
                      <polygon
                        points={`${point.x - 64},${point.y - 36} ${point.x + 64},${point.y - 36} ${point.x + 86},${point.y + 34} ${point.x - 86},${point.y + 34}`}
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                        strokeLinejoin="round"
                      />
                      {/* Top Ingress Port & Bottom Fan-out Ports */}
                      <rect
                        x={point.x - 16}
                        y={point.y - 40}
                        width="32"
                        height="5"
                        rx="2.5"
                        fill={theme.accent}
                      />
                      <circle cx={point.x - 36} cy={point.y + 34} r="3" fill={theme.accent} />
                      <circle cx={point.x} cy={point.y + 34} r="3" fill={theme.accent} />
                      <circle cx={point.x + 36} cy={point.y + 34} r="3" fill={theme.accent} />
                    </g>
                  ) : archetype === "QUEUE" ? (
                    <g>
                      {/* Flanged Message Broker Pipeline Capsule */}
                      <rect
                        x={point.x - 86}
                        y={point.y - 20}
                        width="8"
                        height="40"
                        rx="3"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.5"
                      />
                      <rect
                        x={point.x + 78}
                        y={point.y - 20}
                        width="8"
                        height="40"
                        rx="3"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.5"
                      />
                      <rect
                        x={point.x - 78}
                        y={point.y - 34}
                        width="156"
                        height="68"
                        rx="22"
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      {/* Kafka Topic Partition Vertical Slots */}
                      <line x1={point.x + 62} y1={point.y - 18} x2={point.x + 62} y2={point.y - 2} stroke={theme.accent} strokeWidth="2" opacity="0.6" />
                      <line x1={point.x + 67} y1={point.y - 18} x2={point.x + 67} y2={point.y - 2} stroke={theme.accent} strokeWidth="2" opacity="0.85" />
                    </g>
                  ) : (
                    <g>
                      {/* 19-Inch Server Rack Blade Chassis with Dual Mount Ears & LED Rails */}
                      <rect
                        x={point.x - 84}
                        y={point.y - 26}
                        width="6"
                        height="52"
                        rx="2"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={point.x + 78}
                        y={point.y - 26}
                        width="6"
                        height="52"
                        rx="2"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={point.x - 78}
                        y={point.y - 34}
                        width="156"
                        height="68"
                        rx="7"
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      {/* Dual Server Rack LED Columns */}
                      <circle cx={point.x - 72} cy={point.y - 16} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x - 72} cy={point.y - 10} r="1.4" fill={theme.accent} opacity="0.45" />
                      <circle cx={point.x - 72} cy={point.y - 4} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x + 72} cy={point.y - 16} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x + 72} cy={point.y - 10} r="1.4" fill={theme.accent} opacity="0.45" />
                      <circle cx={point.x + 72} cy={point.y - 4} r="1.4" fill={theme.accent} opacity="0.85" />
                    </g>
                  )}

                  {/* Top-Left Floating Status Badge (CRASHED or Archetype Tag) like 200Lab */}
                  <rect
                    x={point.x - 66}
                    y={point.y - 45}
                    width={isStopped ? 64 : activePods > 1 ? 66 : 58}
                    height="15"
                    rx="4"
                    fill={isStopped ? "#9f1239" : theme.iconBg}
                    stroke={strokeColor}
                    strokeWidth="1.1"
                  />
                  <text
                    x={point.x - 66 + (isStopped ? 32 : activePods > 1 ? 33 : 29)}
                    y={point.y - 35}
                    textAnchor="middle"
                    fill={isStopped ? "#fecdd3" : theme.accent}
                    fontSize="8.5"
                    fontWeight="800"
                  >
                    {isStopped ? "CRASHED" : activePods > 1 ? `×${activePods} CLUSTER` : theme.badgeText}
                  </text>

                  {/* Left Colored Icon Tile + Distinct Vector Icon per Archetype */}
                  <rect
                    x={point.x - 65}
                    y={point.y - 21}
                    width="24"
                    height="24"
                    rx="6"
                    fill={theme.iconBg}
                    stroke={theme.stroke}
                    strokeWidth="1.1"
                  />
                  {archetype === "DATABASE" ? (
                    <g stroke={theme.accent} strokeWidth="1.4" fill="none">
                      <ellipse cx={point.x - 53} cy={point.y - 14} rx="6" ry="2.5" />
                      <path d={`M ${point.x - 59},${point.y - 14} L ${point.x - 59},${point.y - 4} A 6 2.5 0 0 0 ${point.x - 47},${point.y - 4} L ${point.x - 47},${point.y - 14}`} />
                      <path d={`M ${point.x - 59},${point.y - 9} A 6 2.2 0 0 0 ${point.x - 47},${point.y - 9}`} />
                    </g>
                  ) : archetype === "GATEWAY" ? (
                    <g stroke={theme.accent} strokeWidth="1.6" strokeLinecap="round" fill="none">
                      <path d={`M ${point.x - 53},${point.y - 3} L ${point.x - 53},${point.y - 9}`} />
                      <path d={`M ${point.x - 53},${point.y - 9} L ${point.x - 58},${point.y - 14}`} />
                      <path d={`M ${point.x - 53},${point.y - 9} L ${point.x - 48},${point.y - 14}`} />
                      <circle cx={point.x - 58} cy={point.y - 15} r="1.3" fill={theme.accent} />
                      <circle cx={point.x - 48} cy={point.y - 15} r="1.3" fill={theme.accent} />
                    </g>
                  ) : archetype === "QUEUE" ? (
                    <g stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round">
                      <line x1={point.x - 59} y1={point.y - 13} x2={point.x - 47} y2={point.y - 13} />
                      <line x1={point.x - 59} y1={point.y - 9} x2={point.x - 47} y2={point.y - 9} />
                      <line x1={point.x - 59} y1={point.y - 5} x2={point.x - 47} y2={point.y - 5} />
                    </g>
                  ) : (
                    <g stroke={theme.accent} strokeWidth="1.3" fill="none">
                      <rect x={point.x - 60} y={point.y - 15} width="14" height="5" rx="1" />
                      <rect x={point.x - 60} y={point.y - 8} width="14" height="5" rx="1" />
                    </g>
                  )}

                  {/* Service Name */}
                  <text
                    x={point.x + 8}
                    y={point.y - 13}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize="12"
                    fontWeight="700"
                  >
                    {name}
                  </text>

                  {/* Running / Configured Replicas Status */}
                  <text
                    x={point.x + 8}
                    y={point.y + 1}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {live
                      ? `${live.runningReplicas}/${live.replicas} ${t("running")}`
                      : t("Waiting for telemetry")}
                  </text>

                  {/* Mini Embedded CPU (Cyan) & RAM (Emerald) Progress Bars inside the Node */}
                  <rect
                    x={point.x - 66}
                    y={point.y + 10}
                    width="62"
                    height="4"
                    rx="2"
                    fill="#1e293b"
                  />
                  <rect
                    x={point.x - 66}
                    y={point.y + 10}
                    width={Math.max(4, Math.round((cpuPercent / 100) * 62))}
                    height="4"
                    rx="2"
                    fill={isStopped ? "#f43f5e" : "#38bdf8"}
                  />
                  <rect
                    x={point.x + 4}
                    y={point.y + 10}
                    width="62"
                    height="4"
                    rx="2"
                    fill="#1e293b"
                  />
                  <rect
                    x={point.x + 4}
                    y={point.y + 10}
                    width={Math.max(4, Math.round((ramInfo.percent / 100) * 62))}
                    height="4"
                    rx="2"
                    fill={isStopped ? "#f43f5e" : "#10b981"}
                  />

                  {/* Visual Replica Pod Cluster (1..8 Pods rendered inside/below the block) */}
                  {Array.from({ length: activePods }, (_, i) => {
                    const podX = point.x - 52 + i * 14.5;
                    const podY = point.y + 22;
                    return (
                      <g key={i}>
                        <rect
                          x={podX - 4.5}
                          y={podY - 3.5}
                          width="9"
                          height="6.5"
                          rx="1.8"
                          fill={theme.accent}
                        />
                        <circle cx={podX} cy={podY + 20} r="2.2" fill={theme.accent} />
                      </g>
                    );
                  })}
                </g>
              );
            })}
        </svg>
      </div>

      {/* Floating Direct Node Controller Bar for the Selected Service */}
      {!canvasOnly && selected && onQuickAction && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {t("Quick node controls")}: <span className="font-mono">{selected}</span>
            </span>
            <span className="rounded bg-background px-2 py-0.5 font-mono text-[11px]">
              {selectedLive
                ? `${selectedLive.runningReplicas}/${selectedLive.replicas} ${t("running")}`
                : `${selectedReplicas} ${t("running")}`}
            </span>
            {selectedLive?.stats[0] && (
              <span className="text-muted-foreground">
                CPU {selectedLive.stats[0].cpu ?? "—"} · RAM {selectedLive.stats[0].memory ?? "—"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {([1, 2, 4, 8] as const).map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={selectedReplicas === preset ? "secondary" : "outline"}
                disabled={busy || selectedReplicas === 0 || selectedReplicas === preset}
                onClick={() =>
                  onQuickAction({ action: "SCALE", service: selected, replicas: preset })
                }
              >
                ×{preset}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Project Deployment & Scaling Impact Matrix (Static Architecture + Live 1 -> 4 -> 8 Scaling Delta) */}
      {!canvasOnly && (
        <section className="space-y-3 rounded-lg border bg-card p-3.5 text-sm shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">{t("Project Deployment & Scaling Impact Matrix")}</h4>
            <p className="text-xs text-muted-foreground">
              {t("Static Architecture Footprint")} + {t("Live Deployment & Scaling Delta")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total running instances")}: <strong>{totalRunningInstances}</strong>
            </span>
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total CPU load")}: <strong>{avgClusterCpu.toFixed(1)}%</strong>
            </span>
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total RAM footprint")}: <strong>{Math.round(totalRamMiB)} MiB</strong>
            </span>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="px-2 py-2 font-medium">{t("Layer / Type")}</th>
                <th className="px-2 py-2 font-medium">{t("Inbound / Outbound")}</th>
                <th className="px-2 py-2 font-medium">{t("Replicas (Before → Now)")}</th>
                <th className="px-2 py-2 font-medium">{t("Per-instance CPU / RAM")}</th>
                <th className="px-2 py-2 font-medium">{t("Aggregated service RAM")}</th>
                <th className="pl-2 py-2 font-medium">{t("Scaling & Fault Impact")}</th>
              </tr>
            </thead>
            <tbody>
              {deploymentRows.map((row) => {
                const isSelectedRow = row.serviceName === selected;
                const scaleFactor =
                  row.replicasBefore > 0 ? row.replicasNow / row.replicasBefore : row.replicasNow;
                return (
                  <tr
                    key={row.serviceName}
                    onClick={() => onSelect(row.serviceName)}
                    className={`cursor-pointer border-b last:border-0 transition hover:bg-muted/40 ${
                      isSelectedRow ? "bg-muted/30 font-medium" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 font-mono font-semibold">{row.serviceName}</td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {row.layer} · {row.elementType}
                      </span>
                      {row.evidenceCount > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({row.evidenceCount} {t("Source evidence")})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.inboundCount} in / {row.outboundCount} out
                      {row.protocols ? ` (${row.protocols})` : ""}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.replicasBefore} → <strong>{row.replicasNow}</strong>
                      {scaleFactor > 1 && (
                        <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                          ×{scaleFactor.toFixed(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.avgCpu.toFixed(1)}% · {Math.round(row.perInstanceRamMiB)} MiB
                    </td>
                    <td className="px-2 py-2 font-mono">
                      <strong>{Math.round(row.totalServiceRamMiB)} MiB</strong> /{" "}
                      {Math.round(row.ramLimitMiB * Math.max(1, row.replicasNow))} MiB
                    </td>
                    <td className="pl-2 py-2">
                      {row.replicasNow === 0 ? (
                        <span className="font-semibold text-destructive">
                          {t("Service stopped (Fault injected)")} · {t("503 / CIRCUIT OPEN")}
                        </span>
                      ) : row.replicasNow > 1 ? (
                        <span>
                          {t("Load balanced across")} {row.replicasNow} {t("instances")} (~
                          {Math.round(100 / row.replicasNow)}%/pod)
                          {row.p95Before !== undefined && row.p95After !== undefined
                            ? ` · p95: ${row.p95Before}ms → ${row.p95After}ms`
                            : ""}
                          {row.bottleneckTarget
                            ? ` · ⚠ ${t("Downstream bottleneck risk")}: ${row.bottleneckTarget} (1 pod)`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("Single instance baseline")} (100%/pod)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {!canvasOnly && !telemetry && <p role="status">{t("Waiting for observed telemetry from Runner.")}</p>}
      {!canvasOnly && telemetry && (
        <p className="text-sm text-muted-foreground">
          {t("Observed at")} {new Date(telemetry.observedAt).toLocaleTimeString()}
        </p>
      )}
      {!canvasOnly && impact && (
        <section className="space-y-1 rounded-lg border p-3 text-sm">
          <h4 className="font-medium">
            {t("Static upstream impact")} · {selected}
          </h4>
          <p>
            {t("Direct callers")}: {impact.directImpactCount} · {t("Indirect callers")}:{" "}
            {impact.indirectImpactCount}
          </p>
          {impact.upstreamImpacted.map((item) => (
            <p key={item.elementId} className="font-mono text-xs">
              {item.hops.join(" → ")}
            </p>
          ))}
        </section>
      )}
      {workerImpact.data && (
        <section className="space-y-1 rounded-lg border p-3 text-sm">
          <h4 className="font-medium">{t("Worker verified impact paths")}</h4>
          {workerImpact.data.paths.map((path, index) => (
            <p key={index} className="font-mono text-xs">
              {path
                .map(
                  (id) => reference.data?.elements.find((element) => element.id === id)?.name ?? id,
                )
                .join(" → ")}
            </p>
          ))}
          {workerImpact.data.limitations && (
            <p className="text-muted-foreground">{workerImpact.data.limitations}</p>
          )}
        </section>
      )}
      {workerImpact.isError && (
        <p role="status" className="text-sm">
          {t("Worker impact is unavailable. Static reference paths are shown above.")}
        </p>
      )}
      {reference.data?.elements
        .find((element) => element.id === modelId)
        ?.evidence.map((evidence) => (
          <details key={evidence.id} className="text-sm">
            <summary>{evidence.location}</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
              {evidence.snippet}
            </pre>
          </details>
        ))}
      {!canvasOnly && telemetry && (
        <div className="space-y-3">
          <h4 className="font-medium">{t("Service metrics and logs")}</h4>
          <details>
            <summary>{t("Observed resilience events")}</summary>
            {telemetry.services.flatMap((service) =>
              service.logs
                .split("\n")
                .filter((line) => /circuit.?breaker|fallback|bulkhead|retry/i.test(line))
                .map((line, index) => (
                  <pre
                    key={service.service + index}
                    className="whitespace-pre-wrap break-all text-sm"
                  >
                    {service.service}: {line}
                  </pre>
                )),
            )}
            {!telemetry.services.some((service) =>
              /circuit.?breaker|fallback|bulkhead|retry/i.test(service.logs),
            ) && <p className="text-sm">{t("No explicit resilience event captured.")}</p>}
          </details>
          {telemetry.services
            .filter((service) => !selected || service.service === selected)
            .map((service) => (
              <section key={service.service} className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {service.service} · {service.runningReplicas}/{service.replicas}
                </p>
                {service.stats.map((stat, index) => (
                  <p key={stat.containerId ?? index} className="font-mono text-xs">
                    CPU {stat.cpu ?? "—"} · RAM {stat.memory ?? "—"} · {t("Network")}{" "}
                    {stat.network ?? "—"}
                  </p>
                ))}
                <details>
                  <summary>{t("Container logs")}</summary>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                    {service.logs || t("No logs captured")}
                  </pre>
                </details>
              </section>
            ))}
          <details open={traceId ? true : undefined}>
            <summary className="font-medium">
              {t("Trace spans")} · {telemetry.spans.length}
            </summary>
            <div className="flex flex-wrap items-center gap-2">
              {traceId && (
                <Button variant="outline" size="sm" onClick={() => setTraceId("")}>
                  {t("Show all traces")}
                </Button>
              )}
            </div>
            {telemetry.spans
              .filter(
                (span) =>
                  (!selected || span.runtimeService === selected) &&
                  (!traceId || span.traceId === traceId),
              )
              .slice(-50)
              .map((span) => (
                <button
                  type="button"
                  key={span.traceId + span.spanId}
                  className="block w-full break-all rounded border p-2 text-left text-sm"
                  onClick={() => setTraceId(span.traceId)}
                >
                  {span.runtimeService} · HTTP {span.httpStatusCode ?? "—"} ·{" "}
                  {span.spanStatus ?? "UNSET"} · {span.traceId}
                  <span className="block text-xs text-muted-foreground">
                    {span.spanId} ·{" "}
                    {span.durationNanoseconds && Number.isFinite(Number(span.durationNanoseconds))
                      ? (Number(span.durationNanoseconds) / 1000000).toFixed(2) + " ms"
                      : "—"}
                  </span>
                </button>
              ))}
            {telemetry.spans.length === 0 && <p role="status">{t("No captured spans yet.")}</p>}
          </details>
        </div>
      )}
    </div>
  );
}

export async function captureStudioImage(svg: SVGSVGElement): Promise<string> {
  const styles = getComputedStyle(svg);
  const url = URL.createObjectURL(
    new Blob([serializeStudioGraph(svg)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render Studio snapshot"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 920;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render Studio snapshot");
    context.fillStyle = styles.backgroundColor;
    context.fillRect(0, 0, 1400, 920);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function serializeStudioGraph(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styles = getComputedStyle(svg);
  clone.setAttribute(
    "style",
    `color:${styles.color};background:${styles.backgroundColor};font-family:Arial,sans-serif`,
  );
  clone.setAttribute("width", "1400");
  clone.setAttribute("height", "920");
  clone.querySelectorAll("[fill],[stroke]").forEach((element) => {
    for (const attribute of ["fill", "stroke"]) {
      const variable = element.getAttribute(attribute)?.match(/^var\((--[\w-]+)\)$/);
      if (variable) element.setAttribute(attribute, styles.getPropertyValue(variable[1]!).trim());
    }
  });
  return new XMLSerializer().serializeToString(clone);
}
