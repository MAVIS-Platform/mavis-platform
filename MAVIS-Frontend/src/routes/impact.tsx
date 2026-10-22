"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChevronRight,
  GitBranch,
  Loader2,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import {
  services,
  edges,
  layerMeta,
  healthMeta,
  serviceById,
  NODE_W,
  NODE_H,
  type ServiceNode,
} from "@/lib/graph-data";

type Severity = "low" | "moderate" | "high" | "critical";

const severityMeta: Record<
  Severity,
  { label: string; text: string; bg: string; ring: string; bar: string }
> = {
  low: {
    label: "Low",
    text: "text-success",
    bg: "bg-success/10",
    ring: "ring-success/30",
    bar: "bg-success",
  },
  moderate: {
    label: "Moderate",
    text: "text-info",
    bg: "bg-info/10",
    ring: "ring-info/30",
    bar: "bg-info",
  },
  high: {
    label: "High",
    text: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/30",
    bar: "bg-warning",
  },
  critical: {
    label: "Critical",
    text: "text-destructive",
    bg: "bg-destructive/10",
    ring: "ring-destructive/30",
    bar: "bg-destructive",
  },
};

/** Depth of every upstream dependent (callers of the target, transitively). */
function computeDepths(targetId: string) {
  const depths = new Map<string, number>();
  let frontier = [targetId];
  let depth = 0;
  while (frontier.length && depth < 8) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        if (e.to !== id) continue;
        if (e.from === targetId || depths.has(e.from)) continue;
        depths.set(e.from, depth);
        next.push(e.from);
      }
    }
    frontier = next;
  }
  return depths;
}

/** All upstream dependency paths ending at the target, root-first. */
function computePaths(targetId: string) {
  const paths: string[][] = [];
  const walk = (id: string, trail: string[]) => {
    const callers = edges.filter((e) => e.to === id && !trail.includes(e.from));
    if (callers.length === 0 || trail.length > 6) {
      paths.push([...trail].reverse());
      return;
    }
    for (const c of callers) walk(c.from, [...trail, c.from]);
  };
  walk(targetId, [targetId]);
  return paths.sort((a, b) => b.length - a.length);
}

export default function ImpactPage() {
  const [targetId, setTargetId] = useState("payments");
  const [query, setQuery] = useState("");
  const [aiState, setAiState] = useState<"idle" | "loading" | "done">("idle");

  const target = serviceById(targetId);
  const depths = useMemo(() => computeDepths(targetId), [targetId]);
  const paths = useMemo(() => computePaths(targetId), [targetId]);

  const direct = useMemo(
    () => [...depths.entries()].filter(([, d]) => d === 1).map(([id]) => serviceById(id)),
    [depths],
  );
  const indirect = useMemo(
    () => [...depths.entries()].filter(([, d]) => d > 1).map(([id]) => serviceById(id)),
    [depths],
  );

  const affectedIds = useMemo(() => new Set(depths.keys()), [depths]);
  const totalAffected = direct.length + indirect.length;
  const maxDepth = Math.max(0, ...depths.values());
  const teams = new Set([...direct, ...indirect].map((s) => s.owner));
  const criticalAffected = [...direct, ...indirect].filter((s) => s.health !== "healthy").length;
  const affectedInstances = [...direct, ...indirect].reduce((n, s) => n + s.instances, 0);

  const score = Math.min(
    100,
    Math.round(
      totalAffected * 9 +
        direct.length * 6 +
        maxDepth * 5 +
        criticalAffected * 7 +
        (target.health === "critical" ? 14 : target.health === "degraded" ? 7 : 0),
    ),
  );
  const severity: Severity =
    score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
  const sev = severityMeta[severity];

  useEffect(() => {
    setAiState("idle");
  }, [targetId]);

  useEffect(() => {
    if (aiState !== "loading") return;
    const t = setTimeout(() => setAiState("done"), 1600);
    return () => clearTimeout(t);
  }, [aiState]);

  const filtered = services.filter((s) => {
    const q = query.trim().toLowerCase();
    return q === "" || s.name.toLowerCase().includes(q) || s.owner.toLowerCase().includes(q);
  });

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <GitBranch className="size-3.5" />
            checkout-platform / main
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
            Change impact analysis
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulate a change to a service and trace its blast radius across the dependency graph.
          </p>
        </div>
        <button
          onClick={() => setAiState("loading")}
          disabled={aiState === "loading"}
          className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {aiState === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {aiState === "loading" ? "Generating…" : "Generate AI explanation"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        {/* Service picker */}
        <aside className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Select a microservice
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter services…"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <ul className="max-h-[560px] overflow-y-auto p-2">
            {filtered.map((s) => {
              const active = s.id === targetId;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setTargetId(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                      active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", layerMeta[s.layer].dot)}
                    />
                    <span
                      className={cn(
                        "truncate font-mono text-xs",
                        active ? "font-semibold text-primary" : "text-foreground",
                      )}
                    >
                      {s.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {s.owner}
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                No matching services
              </li>
            )}
          </ul>
        </aside>

        {/* Main column */}
        <div className="space-y-4">
          {/* Impact summary */}
          <section
            className={cn("rounded-xl border border-border bg-card p-4 shadow-sm ring-1", sev.ring)}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Target className="size-5" />
                </div>
                <div>
                  <p className="font-mono text-sm font-semibold text-foreground">{target.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {layerMeta[target.layer].label} layer · {target.language} {target.version} ·
                    owned by {target.owner}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    sev.bg,
                    sev.text,
                  )}
                >
                  <AlertTriangle className="size-3.5" />
                  {sev.label} impact
                </span>
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                  risk score {score}/100
                </p>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", sev.bar)}
                style={{ width: `${score}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <Stat label="Affected services" value={`${totalAffected}`} icon={Boxes} />
              <Stat
                label="Direct / indirect"
                value={`${direct.length} / ${indirect.length}`}
                icon={ArrowRight}
              />
              <Stat label="Max chain depth" value={`${maxDepth}`} icon={RouteIcon} />
              <Stat label="Teams involved" value={`${teams.size}`} icon={Users} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              A change to <span className="font-mono text-foreground">{target.name}</span>{" "}
              propagates to <span className="font-medium text-foreground">{totalAffected}</span>{" "}
              upstream services across{" "}
              <span className="font-medium text-foreground">{affectedInstances}</span> running
              instances.{" "}
              {criticalAffected > 0 ? (
                <>
                  <span className="font-medium text-warning">{criticalAffected}</span> of them are
                  already degraded or critical.
                </>
              ) : (
                "All affected services are currently healthy."
              )}
            </p>
          </section>

          {/* Graph */}
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Architecture graph — affected services highlighted
              </p>
              <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                <Legend swatch="bg-primary" label="Changed service" />
                <Legend swatch="bg-destructive" label="Directly affected" />
                <Legend swatch="bg-warning" label="Indirectly affected" />
                <Legend swatch="bg-muted-foreground/40" label="Unaffected" />
              </div>
            </div>
            <div className="bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:22px_22px]">
              <ImpactGraph targetId={targetId} depths={depths} onSelect={setTargetId} />
            </div>
          </section>

          {/* Affected services */}
          <div className="grid gap-4 md:grid-cols-2">
            <AffectedList
              title="Directly affected"
              subtitle="Immediate callers — depth 1"
              tone="destructive"
              items={direct}
              targetId={targetId}
              onSelect={setTargetId}
            />
            <AffectedList
              title="Indirectly affected"
              subtitle="Reached transitively — depth 2+"
              tone="warning"
              items={indirect}
              depths={depths}
              targetId={targetId}
              onSelect={setTargetId}
            />
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <RouteIcon className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Dependency paths
              </p>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {paths.length}
              </span>
            </div>
            <ul className="max-h-[320px] divide-y divide-border overflow-y-auto">
              {paths.map((p, i) => (
                <li key={i} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                    {p.map((id, idx) => (
                      <span key={id} className="flex items-center gap-1">
                        {idx > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                        <span
                          className={cn(
                            "font-mono text-[11px]",
                            id === targetId ? "font-semibold text-primary" : "text-foreground",
                          )}
                        >
                          {serviceById(id).name}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {p.length - 1} hop{p.length - 1 === 1 ? "" : "s"} · entry{" "}
                    {serviceById(p[0]!).layer}
                  </p>
                </li>
              ))}
              {paths.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No upstream paths — nothing depends on this service.
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Sparkles className="size-3.5 text-primary" />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                AI explanation
              </p>
            </div>
            <div className="p-4">
              {aiState === "idle" && (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Get a written breakdown of why these services are affected, what could break,
                    and how to roll the change out safely.
                  </p>
                  <button
                    onClick={() => setAiState("loading")}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <Sparkles className="size-4" />
                    Generate AI explanation
                  </button>
                </>
              )}
              {aiState === "loading" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    Analyzing {totalAffected} affected services…
                  </div>
                  {[90, 100, 75, 95, 60].map((w, i) => (
                    <div
                      key={i}
                      className="h-2.5 animate-pulse rounded bg-muted"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              )}
              {aiState === "done" && (
                <AiExplanation
                  target={target}
                  direct={direct}
                  indirect={indirect}
                  severity={severity}
                  maxDepth={maxDepth}
                  onRegenerate={() => setAiState("loading")}
                />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Severity drivers
            </p>
            <ul className="mt-3 space-y-2.5 text-xs">
              <Driver
                label="Upstream fan-out"
                value={`${totalAffected} services`}
                weight={totalAffected * 9}
              />
              <Driver
                label="Direct callers"
                value={`${direct.length}`}
                weight={direct.length * 6}
              />
              <Driver label="Propagation depth" value={`${maxDepth} hops`} weight={maxDepth * 5} />
              <Driver
                label="Unhealthy dependents"
                value={`${criticalAffected}`}
                weight={criticalAffected * 7}
              />
              <Driver
                label="Target health"
                value={healthMeta[target.health].label}
                weight={target.health === "critical" ? 14 : target.health === "degraded" ? 7 : 0}
              />
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", swatch)} />
      {label}
    </span>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Boxes }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Driver({ label, value, weight }: { label: string; value: string; weight: number }) {
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto font-mono text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, weight * 2.5)}%` }}
        />
      </div>
    </li>
  );
}

function AffectedList({
  title,
  subtitle,
  tone,
  items,
  depths,
  targetId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  tone: "destructive" | "warning";
  items: ServiceNode[];
  depths?: Map<string, number>;
  targetId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <span
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            tone === "destructive" ? "bg-destructive" : "bg-warning",
          )}
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="ml-auto font-mono text-sm font-semibold text-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          None detected for this change.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => {
            const edge = edges.find((e) => e.to === targetId && e.from === s.id);
            return (
              <li key={s.id}>
                <button
                  onClick={() => onSelect(s.id)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", layerMeta[s.layer].dot)} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{s.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {s.owner} · {s.instances} instances
                      {depths
                        ? ` · depth ${depths.get(s.id)}`
                        : edge
                          ? ` · ${edge.protocol} ${edge.calls}`
                          : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      healthMeta[s.health].bg,
                      healthMeta[s.health].text,
                    )}
                  >
                    {healthMeta[s.health].label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ImpactGraph({
  targetId,
  depths,
  onSelect,
}: {
  targetId: string;
  depths: Map<string, number>;
  onSelect: (id: string) => void;
}) {
  const strokeFor = (id: string) => {
    if (id === targetId) return "var(--primary)";
    const d = depths.get(id);
    if (d === 1) return "var(--destructive)";
    if (d && d > 1) return "var(--warning)";
    return "var(--border)";
  };

  return (
    <svg
      viewBox="40 20 1250 600"
      className="h-[430px] w-full"
      role="img"
      aria-label="Architecture graph with affected services highlighted"
    >
      <defs>
        <marker
          id="impact-arrow"
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
          id="impact-arrow-hot"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--destructive)" />
        </marker>
      </defs>

      {edges.map((e) => {
        const a = serviceById(e.from);
        const b = serviceById(e.to);
        const hot =
          (e.to === targetId || depths.has(e.to)) && (e.from === targetId || depths.has(e.from));
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={hot ? "var(--destructive)" : "var(--muted-foreground)"}
            strokeWidth={hot ? 2 : 1.2}
            opacity={hot ? 0.9 : 0.16}
            markerEnd={hot ? "url(#impact-arrow-hot)" : "url(#impact-arrow)"}
          />
        );
      })}

      {services.map((s) => {
        const isTarget = s.id === targetId;
        const affected = depths.has(s.id);
        const stroke = strokeFor(s.id);
        return (
          <g
            key={s.id}
            transform={`translate(${s.x} ${s.y})`}
            className="cursor-pointer"
            opacity={isTarget || affected ? 1 : 0.32}
            onClick={() => onSelect(s.id)}
          >
            <rect
              width={NODE_W}
              height={NODE_H}
              rx={10}
              fill="var(--card)"
              stroke={stroke}
              strokeWidth={isTarget ? 2.4 : affected ? 1.8 : 1.1}
            />
            <rect width={4} height={NODE_H} rx={2} fill={stroke} />
            <text x={16} y={25} className="fill-foreground font-medium" fontSize={13}>
              {s.name}
            </text>
            <text x={16} y={43} className="fill-muted-foreground font-mono" fontSize={10.5}>
              {isTarget
                ? "target of change"
                : affected
                  ? `impacted · depth ${depths.get(s.id)}`
                  : "not impacted"}
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
          </g>
        );
      })}
    </svg>
  );
}

function AiExplanation({
  target,
  direct,
  indirect,
  severity,
  maxDepth,
  onRegenerate,
}: {
  target: ServiceNode;
  direct: ServiceNode[];
  indirect: ServiceNode[];
  severity: Severity;
  maxDepth: number;
  onRegenerate: () => void;
}) {
  const list = (arr: ServiceNode[]) => (arr.length ? arr.map((s) => s.name).join(", ") : "none");
  return (
    <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
      <div>
        <p className="mb-1 font-medium text-foreground">Why it matters</p>
        <p>
          <span className="font-mono text-foreground">{target.name}</span> sits {maxDepth} hop
          {maxDepth === 1 ? "" : "s"} below the edge of the graph, so a breaking change here
          surfaces as a {severityMeta[severity].label.toLowerCase()}-severity incident for{" "}
          {direct.length + indirect.length} services.
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium text-foreground">Immediate blast radius</p>
        <p>
          <span className="font-mono">{list(direct)}</span> call it synchronously and will observe
          schema or latency changes first.
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium text-foreground">Second-order effects</p>
        <p>
          <span className="font-mono">{list(indirect)}</span> inherit the failure through their own
          dependencies, typically as timeouts or stale reads rather than hard errors.
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium text-foreground">Recommended rollout</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            Ship behind a version-negotiated contract and keep the previous response shape for one
            release.
          </li>
          <li>
            Canary to 5% of traffic and watch p95 latency and error rate on the direct callers
            above.
          </li>
          <li>
            Notify {new Set([...direct, ...indirect].map((s) => s.owner)).size} owning teams before
            deploy.
          </li>
        </ul>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Zap className="size-3.5" />
          Regenerate
        </button>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldAlert className="size-3" />
          AI-generated · verify before deploy
        </span>
      </div>
    </div>
  );
}
