"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { projectGraphModel } from "./graph-projection";
import { layoutGraph } from "./graph-layout";
import { zoomDiagramCamera } from "./diagram-camera";
export function DependencyNetwork({
  model,
  selectedId,
  onSelect,
  highlightIds = [],
  onClearHighlight,
  expanded: controlledExpanded,
  onToggleExpanded,
  origin: controlledOrigin,
  onOriginChange,
  projection: controlledProjection,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  highlightIds?: string[];
  onClearHighlight?: () => void;
  expanded?: boolean | undefined;
  onToggleExpanded?: (() => void) | undefined;
  origin?: ("all" | "source" | "deployment" | "runtime") | undefined;
  onOriginChange?: ((origin: "all" | "source" | "deployment" | "runtime") => void) | undefined;
  projection?: ReturnType<typeof projectGraphModel> | undefined;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((v) => !v));

  const [internalOrigin, setInternalOrigin] = useState<"all" | "source" | "deployment" | "runtime">("all");
  const origin = controlledOrigin ?? internalOrigin;
  const changeOrigin = (v: typeof origin) => {
    if (onOriginChange) onOriginChange(v);
    else setInternalOrigin(v);
  };

  const [query, setQuery] = useState("");
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 }),
    [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const viewport = useRef<HTMLDivElement>(null),
    section = useRef<HTMLElement>(null),
    drag = useRef<{
      id: number;
      node?: string;
      selection?: string | undefined;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null);
  const [width, setWidth] = useState(900);
  const marker = useId().replace(/:/g, "");
  const internalProjection = useMemo(
    () => projectGraphModel(model, expanded, origin),
    [model, expanded, origin],
  );
  const projection = controlledProjection ?? internalProjection;
  const positions = useMemo(() => layoutGraph(projection.model), [projection.model]);
  const nodes = positions.map((node) => ({
    ...node,
    x: (offsets[node.id]?.x ?? node.x) + 84,
    y: (offsets[node.id]?.y ?? node.y) + 31,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = projection.model.edges;
  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });
  const radius = (id: string) => Math.min(23, 9 + Math.sqrt(degree.get(id) ?? 0) * 2.6);
  const bounds = {
    width: Math.max(400, ...positions.map((n) => n.x + 240)),
    height: Math.max(250, ...positions.map((n) => n.y + 140)),
  };
  const fit = Math.min(Math.max(1, width - 64) / bounds.width, 520 / bounds.height, 1),
    ox = (width - bounds.width * fit) / 2,
    oy = (620 - bounds.height * fit) / 2;
  const neighbors = new Set<string>();
  if (selectedId) {
    neighbors.add(selectedId);
    edges.forEach((edge) => {
      if (
        edge.id === selectedId ||
        edge.underlyingEdgeIds?.includes(selectedId) ||
        edge.from === selectedId ||
        edge.to === selectedId
      ) {
        neighbors.add(edge.from);
        neighbors.add(edge.to);
      }
    });
  }
  if (highlightIds.length) {
    neighbors.clear();
    for (let id of highlightIds) {
      const seen = new Set<string>();
      while (!byId.has(id) && !seen.has(id)) {
        seen.add(id);
        const parent = model.elements.find((n) => n.id === id)?.parentId;
        if (!parent) break;
        id = parent;
      }
      if (byId.has(id)) neighbors.add(id);
    }
    for (const edge of edges)
      if (
        highlightIds.includes(edge.id) ||
        edge.underlyingEdgeIds?.some((id) => highlightIds.includes(id))
      ) {
        neighbors.add(edge.from);
        neighbors.add(edge.to);
      }
  }
  const color = (type?: string) =>
    type === "DATABASE"
      ? "#16815d"
      : type === "QUEUE_BROKER" || type === "MESSAGE_CHANNEL"
        ? "#9455c9"
        : type === "EXTERNAL_SYSTEM"
          ? "#b7791f"
          : type === "COMPONENT"
            ? "#d65370"
            : "#397ed7";
  function zoom(factor: number, x = width / 2, y = 310) {
    setCamera((current) => zoomDiagramCamera(current, factor, { x, y }, { x: ox, y: oy }));
  }
  useEffect(() => {
    if (!viewport.current) return;
    const el = viewport.current;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 620 : 1;
      setCamera((current) =>
        zoomDiagramCamera(
          current,
          Math.exp(-Math.max(-300, Math.min(300, event.deltaY * unit)) * 0.003),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          { x: ox, y: oy },
        ),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [ox, oy]);
  return (
    <section
      ref={section}
      className="min-w-0 overflow-hidden rounded-xl border bg-card"
      aria-label="Dependency graph"
    >
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <label className="mr-auto text-sm">
          <span className="sr-only">Search graph</span>
          <input
            aria-label="Search graph"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-52 rounded-md border bg-background px-3"
            placeholder="Search service…"
          />
        </label>
        {highlightIds.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearHighlight}>
            Trở lại lựa chọn
          </Button>
        )}
        <Button variant="outline" size="sm" aria-label="Zoom graph in" onClick={() => zoom(1.2)}>
          +
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Zoom graph out"
          onClick={() => zoom(1 / 1.2)}
        >
          −
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCamera({ x: 0, y: 0, zoom: 1 });
            setOffsets({});
          }}
        >
          Fit graph
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void (
              document.fullscreenElement
                ? document.exitFullscreen()
                : (
                    section.current?.closest("[data-architecture-workspace]") ?? section.current
                  )?.requestFullscreen()
            )?.catch(() => {});
          }}
        >
          Fullscreen
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">Source model:</strong> {model.elements.length} elements · {model.edges.length} relationships
        </span>
        <span>
          <strong className="text-foreground">Displayed in view:</strong> {nodes.length} elements · {edges.length} visible connections
        </span>
        <span>
          <strong className="text-foreground">Filtered by origin:</strong> {projection.filteredRelationships} relationships ({origin})
        </span>
        <span>
          <strong className="text-foreground">Internal:</strong> {projection.internalRelationships} hidden within collapsed containers
        </span>
        {query.trim() !== "" && (
          <span>
            <strong className="text-foreground">Search:</strong> {nodes.filter((n) => n.name.toLowerCase().includes(query.toLowerCase())).length}/{nodes.length} elements highlighted
          </span>
        )}
        {nodes.length > 300 && (
          <span className="font-medium text-amber-600 dark:text-amber-400">
            (Grid layout mode: &gt;300 elements active, force simulation bypassed for performance)
          </span>
        )}
      </div>
      <div
        ref={viewport}
        role="region"
        aria-label="Graph canvas"
        tabIndex={0}
        className="relative h-[620px] touch-none select-none overflow-hidden bg-background cursor-grab"
        data-zoom={camera.zoom}
        data-pan-x={camera.x}
        data-pan-y={camera.y}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = (event.target as Element).closest("[data-node-id]");
          const node = target?.getAttribute("data-node-id") ?? undefined;
          drag.current = {
            id: event.pointerId,
            ...(node ? { node } : {}),
            selection:
              node ??
              (event.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id") ??
              undefined,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x,
            dy = event.clientY - previous.y;
          if (Math.abs(dx) + Math.abs(dy) < 2 && !previous.moved) return;
          previous.moved = true;
          previous.x = event.clientX;
          previous.y = event.clientY;
          if (previous.node) {
            const id = previous.node,
              node = positions.find((n) => n.id === id)!;
            setOffsets((current) => ({
              ...current,
              [id]: {
                x: (current[id]?.x ?? node.x) + dx / (fit * camera.zoom),
                y: (current[id]?.y ?? node.y) + dy / (fit * camera.zoom),
              },
            }));
          } else setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          const previous = drag.current;
          if (previous?.id !== event.pointerId) return;
          if (!previous.moved && previous.selection)
            onSelect(selectedId === previous.selection ? null : previous.selection);
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const deltas: Record<string, [number, number]> = {
            ArrowLeft: [-40, 0],
            ArrowRight: [40, 0],
            ArrowUp: [0, -40],
            ArrowDown: [0, 40],
          };
          if (deltas[event.key]) {
            event.preventDefault();
            const [x, y] = deltas[event.key]!;
            setCamera((c) => ({ ...c, x: c.x + x, y: c.y + y }));
          } else if (event.key === "+" || event.key === "=") zoom(1.2);
          else if (event.key === "-") zoom(1 / 1.2);
          else if (event.key === "0" || event.key === "Home") setCamera({ x: 0, y: 0, zoom: 1 });
        }}
      >
        <svg width="100%" height="620" aria-label="Service dependency network">
          <defs>
            <marker id={marker} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6" fill="context-stroke" />
            </marker>
          </defs>
          <g transform={`translate(${ox + camera.x},${oy + camera.y}) scale(${fit * camera.zoom})`}>
            {edges.map((edge) => {
              const a = byId.get(edge.from),
                b = byId.get(edge.to);
              if (!a || !b) return null;
              const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
                dx = (b.x - a.x) / len,
                dy = (b.y - a.y) / len;
              const active = !selectedId || (neighbors.has(a.id) && neighbors.has(b.id));
              const selected = edge.underlyingEdgeIds?.includes(selectedId ?? "");
              const d =
                a.id === b.id
                  ? `M ${a.x - 8} ${a.y - 8} C ${a.x - 55} ${a.y - 70},${a.x + 55} ${a.y - 70},${a.x + 8} ${a.y - 8}`
                  : `M ${a.x + dx * radius(a.id)} ${a.y + dy * radius(a.id)} Q ${(a.x + b.x) / 2 - dy * 16} ${(a.y + b.y) / 2 + dx * 16} ${b.x - dx * (radius(b.id) + 3)} ${b.y - dy * (radius(b.id) + 3)}`;
              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color(a.elementType)}
                    strokeWidth={selected ? 3 : 1.5}
                    strokeOpacity={active ? 0.65 : 0.12}
                    strokeDasharray={
                    edge.uncertain
                      ? "2 3"
                      : edge.protocol === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT"
                        ? "5 4"
                        : undefined
                  }
                    markerEnd={`url(#${marker})`}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    data-edge-id={edge.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${a.name} to ${b.name}: ${edge.protocol}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(selectedId === edge.id ? null : edge.id);
                      }
                    }}
                  >
                    <title>
                      {a.name} → {b.name} · {edge.protocol}
                    </title>
                  </path>
                </g>
              );
            })}
            {nodes.map((node) => {
              const match = !query || node.name.toLowerCase().includes(query.toLowerCase()),
                active = match && (!selectedId || neighbors.has(node.id)),
                r = radius(node.id);
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${node.name}`}
                  aria-pressed={selectedId === node.id}
                  className="cursor-pointer focus:outline-none"
                  transform={`translate(${node.x},${node.y})`}
                  opacity={active ? 1 : 0.2}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(selectedId === node.id ? null : node.id);
                    }
                  }}
                >
                  <title>
                    {node.name} · {node.elementType} · {degree.get(node.id) ?? 0} connections
                  </title>
                  <circle
                    r={r + 5}
                    fill="none"
                    stroke={selectedId === node.id ? "var(--primary)" : "transparent"}
                    strokeWidth={2}
                  />
                  <circle
                    r={r}
                    fill={color(node.elementType)}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                  <text
                    y={r + 18}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize={11}
                    fontWeight={selectedId === node.id ? 700 : 400}
                  >
                    <tspan fill="var(--muted-foreground)" fontFamily="monospace" fontSize={10} fontWeight="bold">
                      {node.elementType === "SERVICE_CONTAINER"
                        ? "[SVC] "
                        : node.elementType === "COMPONENT"
                          ? "[COMP] "
                          : node.elementType === "DATABASE"
                            ? "[DB] "
                            : node.elementType === "MESSAGE_CHANNEL" || node.elementType === "QUEUE_BROKER"
                              ? "[QUEUE] "
                              : node.elementType === "EXTERNAL_SYSTEM"
                                ? "[EXT] "
                                : `[${(node.elementType ?? "NODE").slice(0, 4).toUpperCase()}] `}
                    </tspan>
                    {node.name.length > 25 ? node.name.slice(0, 23) + "…" : node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {!nodes.length && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No elements available for this filter.
          </p>
        )}
      </div>
      <div className="space-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-foreground">Elements:</span>
          <span className="inline-flex items-center gap-1">
            <span style={{ background: "#397ed7" }} className="inline-block size-2.5 rounded-full" />
            <span className="font-mono font-bold text-foreground">[SVC]</span> Service
          </span>
          <span className="inline-flex items-center gap-1">
            <span style={{ background: "#16815d" }} className="inline-block size-2.5 rounded-full" />
            <span className="font-mono font-bold text-foreground">[DB]</span> Data store
          </span>
          <span className="inline-flex items-center gap-1">
            <span style={{ background: "#9455c9" }} className="inline-block size-2.5 rounded-full" />
            <span className="font-mono font-bold text-foreground">[QUEUE]</span> Messaging
          </span>
          <span className="inline-flex items-center gap-1">
            <span style={{ background: "#d65370" }} className="inline-block size-2.5 rounded-full" />
            <span className="font-mono font-bold text-foreground">[COMP]</span> Component
          </span>
          <span className="inline-flex items-center gap-1">
            <span style={{ background: "#b7791f" }} className="inline-block size-2.5 rounded-full" />
            <span className="font-mono font-bold text-foreground">[EXT]</span> External System
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-foreground">Relationships &amp; Origins:</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
            <span className="font-bold">───</span> Solid (Static / Inferred call)
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
            <span className="font-bold">- - -</span> Dashed (Deployment / Declared)
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
            <span className="font-bold">···</span> Dotted (Uncertain mapping)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-muted px-1 font-mono text-[10px] font-semibold text-foreground">[STATIC]</span>
            Source
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-muted px-1 font-mono text-[10px] font-semibold text-foreground">[CONFIG]</span>
            Config
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-muted px-1 font-mono text-[10px] font-semibold text-foreground">[DEPLOY]</span>
            Deployment
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-muted px-1 font-mono text-[10px] font-semibold text-foreground">[RUNTIME]</span>
            Observed
          </span>
        </div>
        <div className="text-[11px]">
          Drag nodes or background · Scroll to zoom · Click for 3E · Click again to clear focus
        </div>
      </div>
      <details className="border-t p-3 text-sm">
        <summary className="cursor-pointer">Graph options</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField
            label="Relationship origin"
            value={origin}
            onChange={(v) => {
              changeOrigin(v as typeof origin);
              setCamera({ x: 0, y: 0, zoom: 1 });
            }}
            options={[
              { value: "all", label: "All relationships" },
              { value: "source", label: "Source and configuration" },
              { value: "deployment", label: "Deployment dependencies" },
              { value: "runtime", label: "Runtime observations" },
            ]}
          />
          <Button
            variant="outline"
            onClick={() => {
              toggleExpanded();
              setOffsets({});
            }}
          >
            {expanded ? "Collapse service internals" : "Expand service internals"}
          </Button>
        </div>
      </details>
    </section>
  );
}
