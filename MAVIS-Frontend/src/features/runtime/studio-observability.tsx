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

export function StudioObservability({
  data,
  selected,
  onSelect,
  busy = false,
  onQuickAction,
}: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
  busy?: boolean;
  onQuickAction?: (command: StudioQuickAction) => void;
}) {
  const { t } = useLocale();
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("LAYERED");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState({ yaw: 0.45, pitch: 0.35 });
  const [customOffsets, setCustomOffsets] = useState<Record<string, { x: number; y: number }>>({});
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
        return from && to ? [{ from, to, id: edge.id }] : [];
      }) ?? [],
    [reference.data, data.serviceMappings],
  );

  // Compute topological depth for LAYERED layout
  const serviceDepth = useMemo(() => {
    const depths = new Map<string, number>();
    data.services.forEach((s) => depths.set(s, 0));
    for (let pass = 0; pass < data.services.length; pass++) {
      for (const edge of staticEdges) {
        const dFrom = depths.get(edge.from) ?? 0;
        const dTo = depths.get(edge.to) ?? 0;
        if (dTo <= dFrom) {
          depths.set(edge.to, Math.min(3, dFrom + 1));
        }
      }
    }
    return depths;
  }, [data.services, staticEdges]);

  const positions = useMemo(() => {
    const raw = new Map<string, { x: number; y: number; z: number; tier: number }>();
    const total = Math.max(1, data.services.length);

    // Group by tier for LAYERED mode
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
        x = Math.cos(angle) * 210;
        y = Math.sin(angle) * 135;
        z = ((index % 3) - 1) * 95;
      } else if (layoutMode === "GRID") {
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const rows = Math.ceil(total / cols);
        x = (col - (cols - 1) / 2) * 195;
        y = (row - (rows - 1) / 2) * 125;
        z = (row - (rows - 1) / 2) * 90;
      } else {
        // LAYERED architecture tiers (Ingress/Upstream -> Core Services -> Downstream/Data)
        const tierIndex = Math.max(0, tierKeys.indexOf(tier));
        const tierCount = Math.max(1, tierKeys.length);
        const siblings = tierGroups.get(tier) ?? [name];
        const siblingIndex = siblings.indexOf(name);
        if (tierCount === 1) {
          x = (siblingIndex - (siblings.length - 1) / 2) * 210;
          y = (siblingIndex % 2 === 0 ? -1 : 1) * (siblings.length > 2 ? 55 : 0);
        } else {
          x = (tierIndex - (tierCount - 1) / 2) * 220;
          y = (siblingIndex - (siblings.length - 1) / 2) * 125;
        }
        z = (tierIndex - (tierCount - 1) / 2) * 110;
      }

      if (view === "3D") {
        const rotatedX = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw);
        const rotatedZ = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
        x = rotatedX;
        z = rotatedZ;
        const rotatedY = y * Math.cos(camera.pitch) - z * Math.sin(camera.pitch);
        z = y * Math.sin(camera.pitch) + z * Math.cos(camera.pitch);
        y = rotatedY;
        const perspective = 680 / Math.max(220, 680 + z);
        x *= perspective;
        y *= perspective;
      }

      raw.set(name, { x: x + 350, y: y + 230, z, tier });
    });

    if (raw.size > 0) {
      const points = [...raw.values()];
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const fit = Math.min(1, 480 / Math.max(1, maxX - minX), 270 / Math.max(1, maxY - minY));
      for (const [name, point] of raw.entries()) {
        const offset = customOffsets[name] ?? { x: 0, y: 0 };
        let px = 350 + (point.x - (minX + maxX) / 2) * fit + offset.x + pan.x;
        let py = 235 + (point.y - (minY + maxY) / 2) * fit + offset.y + pan.y;
        px = 350 + (px - 350) * zoom;
        py = 235 + (py - 235) * zoom;
        if (snapToGrid && view === "2D" && (offset.x !== 0 || offset.y !== 0)) {
          px = Math.round(px / 16) * 16;
          py = Math.round(py / 16) * 16;
        }
        point.x = Math.max(82, Math.min(618, px));
        point.y = Math.max(66, Math.min(404, py));
      }
    }
    return raw;
  }, [data.services, serviceDepth, layoutMode, view, camera, customOffsets, pan, zoom, snapToGrid]);

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

  return (
    <div className="space-y-4">
      {exportError && <p role="alert">{t("Could not export graph")}</p>}

      {/* Top Studio Viewport & Layout Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
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
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 border-l pl-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={t("Zoom in")}
            onClick={() => setZoom((z) => Math.min(1.45, Number((z + 0.12).toFixed(2))))}
          >
            +
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={t("Zoom out")}
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.12).toFixed(2))))}
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
                  busy ? "cursor-not-allowed opacity-50" : "hover:border-primary hover:bg-accent/40"
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

      {/* Interactive 2D/3D Studio Canvas + Direct Node Manipulation */}
      <div className="relative max-w-full overflow-x-auto">
        <svg
          ref={svg}
          data-studio-graph="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 700 460"
          className="min-w-[640px] w-full select-none rounded-lg border bg-background shadow-inner"
          role="group"
          aria-label={t("Runtime topology and impact")}
          style={{
            maxHeight: 520,
            touchAction: view === "3D" || draggingNode ? "none" : "auto",
            cursor: draggingNode ? "grabbing" : view === "3D" ? "grab" : "default",
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
              const scaleX = 700 / Math.max(1, rect.width);
              const scaleY = 460 / Math.max(1, rect.height);
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
                x: Math.max(-180, Math.min(180, prev.x + dx * 0.7)),
                y: Math.max(-120, Math.min(120, prev.y + dy * 0.7)),
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
          </defs>

          {/* Subtle Studio Blueprint Grid */}
          <rect x="0" y="0" width="700" height="460" fill="url(#studio-grid)" />

          {/* 3D Isometric Floor Plane when in 3D mode */}
          {view === "3D" && (
            <polygon
              points="350,65 655,235 350,415 45,235"
              fill="currentColor"
              opacity="0.035"
              stroke="currentColor"
              strokeDasharray="4 4"
            />
          )}

          {/* Legend & Viewport Metadata */}
          <text x="16" y="22" fill="currentColor" fontSize="12">
            {t("Static dependencies (dashed)")}
          </text>
          <text x="16" y="40" fill="currentColor" fontSize="12">
            {t("Observed runtime (solid)")}
          </text>
          <text x="684" y="22" fill="currentColor" fontSize="12" textAnchor="end">
            {view}
          </text>
          <text x="684" y="40" fill="currentColor" fontSize="10" opacity="0.65" textAnchor="end">
            {layoutMode} · {Math.round(zoom * 100)}%
          </text>

          {/* Static Dependency Edges (Dashed) */}
          {staticEdges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            return from && to ? (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                strokeDasharray="5 5"
                strokeWidth="1.5"
                opacity=".28"
              />
            ) : null;
          })}

          {/* Observed Live OTel Trace Edges + Animated Request Particles */}
          {telemetry?.interactions
            .filter((edge) => !traceId || edge.traceId === traceId)
            .map((edge, index) => {
              const from = positions.get(edge.fromService);
              const to = positions.get(edge.toService);
              if (!from || !to) return null;
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const qx1 = from.x + (to.x - from.x) * 0.28;
              const qy1 = from.y + (to.y - from.y) * 0.28;
              const qx2 = from.x + (to.x - from.x) * 0.72;
              const qy2 = from.y + (to.y - from.y) * 0.72;
              return (
                <g
                  key={edge.traceId + index}
                  onClick={() => setTraceId(edge.traceId)}
                  className="cursor-pointer"
                >
                  <title>{edge.fromService + " → " + edge.toService + " · " + edge.traceId}</title>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    markerEnd="url(#studio-arrow-live)"
                  />
                  {/* Telemetry Flow Particles along the active trace link */}
                  <circle cx={qx1} cy={qy1} r="3" fill="var(--primary)" opacity="0.65" />
                  <circle cx={mx} cy={my} r="4.5" fill="var(--primary)" />
                  <circle cx={qx2} cy={qy2} r="3" fill="var(--primary)" opacity="0.65" />
                </g>
              );
            })}

          {/* Interactive Draggable 2D/3D Service Blocks & Volumetric Replica Pods */}
          {[...positions.entries()]
            .sort((a, b) => b[1].z - a[1].z)
            .map(([name, point]) => {
              const live = telemetry?.services.find((item) => item.service === name);
              const isAffected = affected.has(data.serviceMappings?.[name] ?? "");
              const isSelected = selected === name;
              const isDropTarget = dropTargetNode === name;
              const isStopped = live !== undefined && live.runningReplicas === 0;
              const activePods = Math.min(live?.runningReplicas ?? 0, 8);
              const depthOffset = view === "3D" ? 12 : 0;

              const strokeColor = isDropTarget
                ? "var(--primary)"
                : isSelected
                  ? "var(--primary)"
                  : isStopped || isAffected
                    ? "var(--destructive)"
                    : "currentColor";

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
                  {/* 3D Isometric Extrusion Faces (Top Roof + Right Side Wall) */}
                  {view === "3D" && (
                    <>
                      <polygon
                        points={`${point.x - 74},${point.y - 30} ${point.x - 74 + depthOffset},${point.y - 30 - depthOffset} ${point.x + 74 + depthOffset},${point.y - 30 - depthOffset} ${point.x + 74},${point.y - 30}`}
                        fill="currentColor"
                        opacity="0.14"
                        stroke={strokeColor}
                        strokeWidth="1"
                      />
                      <polygon
                        points={`${point.x + 74},${point.y - 30} ${point.x + 74 + depthOffset},${point.y - 30 - depthOffset} ${point.x + 74 + depthOffset},${point.y + 30 - depthOffset} ${point.x + 74},${point.y + 30}`}
                        fill="currentColor"
                        opacity="0.22"
                        stroke={strokeColor}
                        strokeWidth="1"
                      />
                    </>
                  )}

                  {/* Drop Target Highlight Halo */}
                  {isDropTarget && (
                    <rect
                      x={point.x - 80}
                      y={point.y - 36}
                      width="160"
                      height="72"
                      rx="11"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2.5"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Main Service Container Card */}
                  <rect
                    x={point.x - 74}
                    y={point.y - 30}
                    width="148"
                    height="60"
                    rx="9"
                    fill="var(--background)"
                    stroke={strokeColor}
                    strokeWidth={isSelected || isDropTarget ? 3 : 1.5}
                  />

                  {/* Health Status Dot */}
                  <circle
                    cx={point.x - 58}
                    cy={point.y - 12}
                    r="4"
                    fill={isStopped ? "var(--destructive)" : "var(--primary)"}
                  />

                  {/* Service Name */}
                  <text
                    x={point.x + 4}
                    y={point.y - 8}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {name}
                  </text>

                  {/* Running / Configured Replicas Status */}
                  <text
                    x={point.x}
                    y={point.y + 10}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="11"
                    opacity="0.85"
                  >
                    {live
                      ? `${live.runningReplicas}/${live.replicas} ${t("running")}`
                      : t("Waiting for telemetry")}
                  </text>

                  {/* Visual Replica Pod Cluster (1..8 Pods rendered inside/below the block) */}
                  {Array.from({ length: activePods }, (_, i) => {
                    const podX = point.x - 52 + i * 14;
                    const podY = point.y + 20 + (view === "3D" ? (i % 2) * 2 : 0);
                    return (
                      <g key={i}>
                        <rect
                          x={podX - 4.5}
                          y={podY - 4}
                          width="9"
                          height="7"
                          rx="2"
                          fill="var(--primary)"
                        />
                        <circle cx={podX} cy={podY + 18} r="2.2" fill="var(--primary)" />
                      </g>
                    );
                  })}
                </g>
              );
            })}
        </svg>
      </div>

      {/* Floating Direct Node Controller Bar for the Selected Service */}
      {selected && onQuickAction && (
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

      {!telemetry && <p role="status">{t("Waiting for observed telemetry from Runner.")}</p>}
      {telemetry && (
        <p className="text-sm text-muted-foreground">
          {t("Observed at")} {new Date(telemetry.observedAt).toLocaleTimeString()}
        </p>
      )}
      {impact && (
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
      {telemetry && (
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
