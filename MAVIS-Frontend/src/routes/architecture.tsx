"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Crosshair,
  Filter,
  Layers,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  X,
  Activity,
  Cpu,
  Database,
  GitBranch,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  services,
  edges,
  layerMeta,
  healthMeta,
  NODE_W,
  NODE_H,
  type Layer,
  type Health,
  type ServiceNode,
  type Edge,
} from "@/lib/graph-data";
import { cn } from "@/lib/utils";

// Graph model and dataset live in @/lib/graph-data (shared with the impact page).

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export default function ArchitecturePage() {
  const [query, setQuery] = useState("");
  const [activeLayers, setActiveLayers] = useState<Layer[]>(["edge", "domain", "platform", "data"]);
  const [healthFilter, setHealthFilter] = useState<Health | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>("orders");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [offset, setOffset] = useState({ x: 40, y: 20 });

  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ zoom, offset });
  stateRef.current = { zoom, offset };
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      services
        .filter(
          (s) =>
            activeLayers.includes(s.layer) &&
            (healthFilter === "all" || s.health === healthFilter) &&
            (q === "" ||
              s.name.toLowerCase().includes(q) ||
              s.owner.toLowerCase().includes(q) ||
              s.language.toLowerCase().includes(q)),
        )
        .map((s) => s.id),
    );
  }, [query, activeLayers, healthFilter]);

  const selected = services.find((s) => s.id === selectedId) ?? null;
  const incoming = edges.filter((e) => e.to === selectedId);
  const outgoing = edges.filter((e) => e.from === selectedId);
  const neighborIds = new Set([...incoming.map((e) => e.from), ...outgoing.map((e) => e.to)]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    const { zoom: z, offset: o } = stateRef.current;
    const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
    const k = next / z;
    setZoom(next);
    setOffset({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
  }, []);

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      zoomAtRef.current(Math.exp(-dy * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomButton = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    zoomAt(factor, (rect?.width ?? 800) / 2, (rect?.height ?? 600) / 2);
  };

  const resetView = () => {
    setZoom(0.85);
    setOffset({ x: 40, y: 20 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    movedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    setOffset({ x: d.ox + dx, y: d.oy + dy });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const toggleLayer = (l: Layer) =>
    setActiveLayers((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const isDimmed = (id: string) => {
    if (!visibleIds.has(id)) return true;
    if (!selectedId) return false;
    return id !== selectedId && !neighborIds.has(id);
  };

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <GitBranch className="size-3.5" />
            checkout-platform / main
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
            Microservices architecture graph
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {services.length} services · {edges.length} dependencies · last analyzed 14 min ago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            Graph engine <span className="font-mono text-foreground">static + runtime</span>
          </span>
          <button className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent">
            Export SVG
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Graph */}
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Toolbar
            query={query}
            setQuery={setQuery}
            activeLayers={activeLayers}
            toggleLayer={toggleLayer}
            healthFilter={healthFilter}
            setHealthFilter={setHealthFilter}
            matchCount={visibleIds.size}
          />

          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative h-[620px] cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:22px_22px] active:cursor-grabbing"
          >
            <svg
              className="absolute inset-0 size-full"
              role="img"
              aria-label="Microservices dependency graph"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
                </marker>
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
              </defs>
              <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
                {edges.map((e) => {
                  const a = services.find((s) => s.id === e.from)!;
                  const b = services.find((s) => s.id === e.to)!;
                  const active =
                    selectedId != null && (e.from === selectedId || e.to === selectedId);
                  const dim =
                    !visibleIds.has(e.from) ||
                    !visibleIds.has(e.to) ||
                    (selectedId != null && !active);
                  const x1 = a.x + NODE_W;
                  const y1 = a.y + NODE_H / 2;
                  const x2 = b.x;
                  const y2 = b.y + NODE_H / 2;
                  const mx = (x1 + x2) / 2;
                  return (
                    <g key={`${e.from}-${e.to}`} opacity={dim ? 0.14 : 1}>
                      <path
                        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke={active ? "var(--primary)" : "var(--muted-foreground)"}
                        strokeWidth={active ? 2 : 1.3}
                        markerEnd={active ? "url(#arrow-active)" : "url(#arrow)"}
                      />
                      {active && (
                        <text
                          x={mx}
                          y={(y1 + y2) / 2 - 6}
                          textAnchor="middle"
                          className="fill-muted-foreground font-mono"
                          fontSize={10}
                        >
                          {e.protocol} · {e.calls}
                        </text>
                      )}
                    </g>
                  );
                })}

                {services.map((s) => {
                  const dim = isDimmed(s.id);
                  const isSel = s.id === selectedId;
                  return (
                    <g
                      key={s.id}
                      transform={`translate(${s.x} ${s.y})`}
                      opacity={dim ? 0.28 : 1}
                      className="cursor-pointer"
                      onPointerUp={() => {
                        if (!movedRef.current) setSelectedId(s.id === selectedId ? null : s.id);
                      }}
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <rect
                        width={NODE_W}
                        height={NODE_H}
                        rx={10}
                        fill="var(--card)"
                        stroke={
                          isSel
                            ? "var(--primary)"
                            : hoverId === s.id
                              ? "var(--primary)"
                              : "var(--border)"
                        }
                        strokeWidth={isSel ? 2 : 1.2}
                      />
                      <rect width={4} height={NODE_H} rx={2} fill={healthMeta[s.health].stroke} />
                      <text x={16} y={25} className="fill-foreground font-medium" fontSize={13}>
                        {s.name}
                      </text>
                      <text
                        x={16}
                        y={43}
                        className="fill-muted-foreground font-mono"
                        fontSize={10.5}
                      >
                        {s.language} · {s.version} · {s.instances}×
                      </text>
                      <text
                        x={NODE_W - 12}
                        y={25}
                        textAnchor="end"
                        className="fill-muted-foreground font-mono"
                        fontSize={10}
                      >
                        {layerMeta[s.layer].label}
                      </text>
                      {s.vulns > 0 && (
                        <text
                          x={NODE_W - 12}
                          y={43}
                          textAnchor="end"
                          fill={healthMeta[s.health].stroke}
                          className="font-mono"
                          fontSize={10}
                        >
                          {s.vulns} CVE
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <button
                aria-label="Zoom in"
                onClick={() => zoomButton(1.2)}
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
              <div className="h-px bg-border" />
              <button
                aria-label="Zoom out"
                onClick={() => zoomButton(1 / 1.2)}
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minus className="size-4" />
              </button>
              <div className="h-px bg-border" />
              <button
                aria-label="Reset view"
                onClick={resetView}
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Crosshair className="size-4" />
              </button>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3 rounded-lg border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
              <span className="font-mono text-foreground">{Math.round(zoom * 100)}%</span>
              <span className="h-3 w-px bg-border" />
              {(Object.keys(layerMeta) as Layer[]).map((l) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", layerMeta[l].dot)} />
                  {layerMeta[l].label}
                </span>
              ))}
              <span className="h-3 w-px bg-border" />
              <span>Scroll to zoom · drag to pan</span>
            </div>
          </div>
        </section>

        {/* Details */}
        <aside className="space-y-4">
          {selected ? (
            <DetailsPanel
              service={selected}
              incoming={incoming}
              outgoing={outgoing}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center shadow-sm">
              <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Boxes className="size-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">No service selected</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Click a node in the graph to inspect its metadata, incoming callers and outgoing
                dependencies.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Graph insights
            </p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <Insight icon={Activity} label="Most called" value="event-bus (12k/s)" />
              <Insight
                icon={ShieldAlert}
                label="Highest risk"
                value="order-service (7 CVE)"
                tone="destructive"
              />
              <Insight icon={Layers} label="Deepest chain" value="gateway → … → redis (4)" />
              <Insight
                icon={Cpu}
                label="Cyclic dependencies"
                value="None detected"
                tone="success"
              />
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Toolbar({
  query,
  setQuery,
  activeLayers,
  toggleLayer,
  healthFilter,
  setHealthFilter,
  matchCount,
}: {
  query: string;
  setQuery: (v: string) => void;
  activeLayers: Layer[];
  toggleLayer: (l: Layer) => void;
  healthFilter: Health | "all";
  setHealthFilter: (h: Health | "all") => void;
  matchCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services, owners, languages…"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
        <Filter className="ml-1 size-3.5 text-muted-foreground" />
        {(Object.keys(layerMeta) as Layer[]).map((l) => (
          <button
            key={l}
            onClick={() => toggleLayer(l)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              activeLayers.includes(l)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("size-1.5 rounded-full", layerMeta[l].dot)} />
            {layerMeta[l].label}
          </button>
        ))}
      </div>

      <select
        value={healthFilter}
        onChange={(e) => setHealthFilter(e.target.value as Health | "all")}
        className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Filter by health"
      >
        <option value="all">All health</option>
        <option value="healthy">Healthy</option>
        <option value="degraded">Degraded</option>
        <option value="critical">Critical</option>
      </select>

      <span className="ml-auto font-mono text-xs text-muted-foreground">
        {matchCount}/{services.length} nodes
      </span>
    </div>
  );
}

function DetailsPanel({
  service,
  incoming,
  outgoing,
  onClose,
  onSelect,
}: {
  service: ServiceNode;
  incoming: Edge[];
  outgoing: Edge[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const h = healthMeta[service.health];
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-foreground">{service.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {layerMeta[service.layer].label} layer · owned by {service.owner}
          </p>
        </div>
        <button
          aria-label="Close details"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", h.bg, h.text)}>
          {h.label}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {service.version}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {service.language}
        </span>
        {service.vulns > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {service.vulns} vulnerabilities
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <Metric label="p95 latency" value={service.p95} />
        <Metric label="Throughput" value={service.rps} />
        <Metric label="Error rate" value={service.errorRate} />
        <Metric label="Instances" value={`${service.instances}`} />
      </div>

      <DepList
        title="Incoming dependencies"
        icon={ArrowDownLeft}
        empty="No upstream callers"
        items={incoming.map((e) => ({ id: e.from, protocol: e.protocol, calls: e.calls }))}
        onSelect={onSelect}
      />
      <DepList
        title="Outgoing dependencies"
        icon={ArrowUpRight}
        empty="No downstream dependencies"
        items={outgoing.map((e) => ({ id: e.to, protocol: e.protocol, calls: e.calls }))}
        onSelect={onSelect}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DepList({
  title,
  icon: Icon,
  items,
  empty,
  onSelect,
}: {
  title: string;
  icon: typeof ArrowUpRight;
  items: { id: string; protocol: string; calls: string }[];
  empty: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-border p-4 last:border-b-0">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => {
            const svc = services.find((s) => s.id === it.id)!;
            return (
              <li key={it.id}>
                <button
                  onClick={() => onSelect(it.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", layerMeta[svc.layer].dot)}
                  />
                  <span className="truncate font-mono text-xs text-foreground">{svc.name}</span>
                  <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {it.protocol}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {it.calls}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Insight({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  return (
    <li className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "ml-auto truncate font-mono text-xs",
          tone === "destructive"
            ? "text-destructive"
            : tone === "success"
              ? "text-success"
              : "text-foreground",
        )}
      >
        {value}
      </span>
    </li>
  );
}
