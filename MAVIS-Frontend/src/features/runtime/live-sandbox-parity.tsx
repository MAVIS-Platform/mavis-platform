"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Boxes,
  Camera,
  ChevronRight,
  Cpu,
  CreditCard,
  Database,
  Flame,
  Gauge,
  GripVertical,
  Layers,
  Lock,
  Network,
  Package,
  Play,
  Plus,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  ShoppingCart,
  Square,
  Target,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Response } from "@/lib/api/contracts";
import type { StudioQuickAction } from "./studio-observability";
import { resolveStudioSidebarIconClass, type StudioStyleId } from "./studio-styles";
import {
  capabilitySummary,
  liveCapabilities,
  type LiveCapability,
  type LiveCapabilityState,
} from "./studio-live-capabilities";

type Studio = Response<"studioState">;

export type LiveParitySection =
  | "scenarios"
  | "library"
  | "inspector"
  | "hardware"
  | "resilience"
  | "load"
  | "config"
  | "snapshots";

export type AuthorPresetId = "outage" | "scale" | "chaos-scale" | "healthy";

export type LiveBlockAuthoringControls = {
  initialStoppedServices: readonly string[];
  initialStoppedControllers: readonly string[];
  scalableServices: readonly string[];
  availableServices?: readonly string[] | undefined;
  onToggleInitialStopped: (service: string, isController: boolean) => void;
  onToggleScalable: (service: string) => void;
  onAddBlock?: ((service: string) => void) | undefined;
  onRemoveBlock?: ((service: string) => void) | undefined;
  onApplyPreset?: ((preset: AuthorPresetId) => void) | undefined;
  busy?: boolean | undefined;
};

const LIVE_LIFECYCLE_TOOLS = [
  {
    id: "palette-stop",
    shortLabel: "Stop",
    title: "Stop container (drag onto any block or click)",
    action: "STOP" as const,
    iconColor: "text-rose-400",
    hoverClass: "hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-100",
  },
  {
    id: "palette-start",
    shortLabel: "Restart",
    title: "Restart stopped container (drag onto any block or click)",
    action: "START" as const,
    iconColor: "text-emerald-400",
    hoverClass: "hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-100",
  },
] as const;

const LIVE_SCALE_TOOLS = [
  {
    id: "palette-scale-plus-1",
    badge: "+1",
    sub: "Pod",
    title: "Scale +1 replica (1–3)",
    action: "SCALE" as const,
    delta: 1,
  },
  {
    id: "palette-scale-2",
    badge: "×2",
    sub: "HA",
    title: "Scale to 2 replicas",
    action: "SCALE" as const,
    replicas: 2,
  },
  {
    id: "palette-scale-3",
    badge: "×3",
    sub: "Max",
    title: "Scale to 3 replicas (BR-07 max)",
    action: "SCALE" as const,
    replicas: 3,
  },
] as const;

function renderLiveBlockIcon(name: string, studioStyle: StudioStyleId = "daylight") {
  const n = name.toLowerCase();
  const colorClass = resolveStudioSidebarIconClass(studioStyle, name);
  const cls = `size-3.5 shrink-0 ${colorClass}`;
  if (n.includes("gateway") || n.includes("edge") || n.includes("proxy") || n.includes("ingress")) {
    return <Network aria-hidden="true" className={cls} />;
  }
  if (n.includes("redis") || n.includes("cache")) {
    return <Flame aria-hidden="true" className={cls} />;
  }
  if (n.includes("postgres") || n.includes("mysql") || n.includes("mongo") || n.includes("db")) {
    return <Database aria-hidden="true" className={cls} />;
  }
  if (n.includes("kafka") || n.includes("rabbit") || n.includes("broker") || n.includes("queue")) {
    return <Activity aria-hidden="true" className={cls} />;
  }
  if (n.includes("worker") || n.includes("consumer") || n.includes("async")) {
    return <Cpu aria-hidden="true" className={cls} />;
  }
  if (n.includes("order")) {
    return <ShoppingCart aria-hidden="true" className={cls} />;
  }
  if (n.includes("payment") || n.includes("billing")) {
    return <CreditCard aria-hidden="true" className={cls} />;
  }
  if (n.includes("catalog") || n.includes("inventory") || n.includes("product")) {
    return <Package aria-hidden="true" className={cls} />;
  }
  return <Server aria-hidden="true" className={cls} />;
}

export type StudioSetupPanel = "service" | "mission" | "presets" | "drills";

type LiveSandboxParityProps = {
  data: Studio;
  selected: string;
  busy: boolean;
  onSelect: (service: string) => void;
  onCommand: (
    action: StudioQuickAction["action"],
    service: string,
    replicas?: number,
  ) => Promise<void>;
  sections?: readonly LiveParitySection[];
  compact?: boolean;
  label?: string;
  authoring?: LiveBlockAuthoringControls | undefined;
  activeSetupPanel?: StudioSetupPanel | undefined;
  onSelectSetupPanel?: ((panel: StudioSetupPanel) => void) | undefined;
  studioStyle?: StudioStyleId | undefined;
};

const LIVE_SCENARIOS = [
  ["FLASH_SALE", "Flash sale"],
  ["DB_OUTAGE", "Database outage"],
  ["SLOW_DB", "Slow database queries"],
  ["RATE_LIMIT", "Gateway throttling"],
  ["POD_FAILURE", "Single pod failure"],
  ["NETWORK_DELAY", "Slow upstream dependency"],
  ["CPU_PRESSURE", "CPU quota reduction"],
  ["SCALE_OUT", "Scale out a service"],
] as const;

const BADGE: Record<LiveCapabilityState, string> = {
  REAL: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  PREPARED: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  OBSERVE: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  UNAVAILABLE: "border-slate-600/60 bg-slate-700/30 text-slate-400",
};

function confirmedResult(data: Studio, service: string) {
  return [...data.actions]
    .reverse()
    .filter((action) => action.service === service && action.status === "CONFIRMED")
    .at(0)?.result;
}

function runningReplicas(data: Studio, service: string) {
  const confirmed = confirmedResult(data, service);
  return (
    confirmed?.replicasAfter ??
    data.telemetry?.services.find((item) => item.service === service)?.runningReplicas
  );
}

function serviceTelemetry(data: Studio, service: string) {
  return data.telemetry?.services.find((item) => item.service === service);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function observedLogs(data: Studio) {
  return (data.telemetry?.services ?? [])
    .map((item) => item.logs ?? "")
    .join("\n")
    .toLowerCase();
}

export function parseMemoryMiB(raw?: string): number | undefined {
  if (!raw) return undefined;
  const usage = raw.split("/")[0]?.trim() ?? "";
  const match = usage.match(/^([\d.]+)\s*(KiB|KB|K|MiB|MB|M|GiB|GB|G|B)?$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = (match[2] ?? "MiB").toLowerCase();
  if (unit === "gib" || unit === "gb" || unit === "g") return value * (unit === "gb" ? 953.674 : 1024);
  if (unit === "kib" || unit === "kb" || unit === "k") return value / 1024;
  if (unit === "b") return value / (1024 * 1024);
  return value;
}

export function summarizeServiceStats(
  stats?: ReadonlyArray<{ cpu?: string | null; memory?: string | null }>,
): { cpu: string; memory: string; containers: number } {
  if (!stats || stats.length === 0) return { cpu: "—", memory: "—", containers: 0 };
  if (stats.length === 1) {
    return {
      cpu: stats[0]?.cpu?.trim() || "—",
      memory: stats[0]?.memory?.trim() || "—",
      containers: 1,
    };
  }
  let cpuSum = 0;
  let hasCpu = false;
  let memSum = 0;
  let hasMem = false;
  for (const item of stats) {
    const cpuMatch = item.cpu?.match(/[\d.]+/);
    if (cpuMatch) {
      const n = Number(cpuMatch[0]);
      if (Number.isFinite(n)) {
        cpuSum += n;
        hasCpu = true;
      }
    }
    const miB = parseMemoryMiB(item.memory ?? undefined);
    if (miB !== undefined) {
      memSum += miB;
      hasMem = true;
    }
  }
  const cpu = hasCpu ? `${Number(cpuSum.toFixed(1))}%` : (stats[0]?.cpu ?? "—");
  const memory = hasMem
    ? memSum >= 1024
      ? `${Number((memSum / 1024).toFixed(2))}GiB`
      : `${Number(memSum.toFixed(memSum < 10 ? 1 : 0))}MiB`
    : (stats[0]?.memory ?? "—");
  return { cpu, memory, containers: stats.length };
}

export function LiveSandboxParity({
  data,
  selected,
  busy,
  onSelect,
  onCommand,
  sections,
  compact = false,
  label = "Live capability parity",
  authoring,
  activeSetupPanel = "service",
  onSelectSetupPanel,
  studioStyle = "daylight",
}: LiveSandboxParityProps) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const topology = data.topology;
  const selectedBlock = topology?.blocks.find((block) => block.service === selected);
  const canScale = topology ? selectedBlock?.canScale === true : Boolean(selected);
  const running = runningReplicas(data, selected);
  const observed = serviceTelemetry(data, selected);
  const observedStats = summarizeServiceStats(observed?.stats);
  const limits = data.limits;
  const selectedLimit = limits?.services?.[selected];
  const lastMeasured = useMemo(
    () =>
      [...data.actions].reverse().find((action) => action.status === "CONFIRMED" && action.result)
        ?.result,
    [data.actions],
  );
  const capabilities = useMemo(
    () =>
      liveCapabilities({
        hasSession: Boolean(data.sessionId) && data.interactive,
        hasTopology: Boolean(topology),
        hasTelemetry: Boolean(data.telemetry),
        canScale,
        hasMeasuredAction: Boolean(lastMeasured),
      }),
    [topology, data.telemetry, canScale, lastMeasured],
  );
  const counts = capabilitySummary(capabilities);
  const capability = (id: string) =>
    capabilities.find((item) => item.id === id) ?? capabilities[capabilities.length - 1]!;
  const blocks =
    topology?.blocks ??
    data.services.map((service) => ({
      service,
      label: service,
      canScale: false,
      initiallyStopped: false,
    }));
  const query = search.trim().toLowerCase();
  const visibleBlocks = blocks.filter((block) =>
    `${block.label} ${block.service}`.toLowerCase().includes(query),
  );
  const logs = observedLogs(data);
  const circuitObserved =
    data.telemetry?.spans.some((span) => span.circuitOpen) === true ||
    /circuit.?breaker|fallback/.test(logs);
  const rateLimited =
    data.telemetry?.spans.some((span) => span.httpStatusCode === 429) === true ||
    /\b429\b|rate.?limit/.test(logs);
  const retryObserved = /retry|bulkhead/.test(logs);
  const cacheObserved = /cache hit|read cache/.test(logs);
  const requestCount = numberValue(lastMeasured?.metricsAfter["requestCount"]);
  const errorRate = numberValue(lastMeasured?.metricsAfter["errorRatePercent"]);
  const p95 = numberValue(lastMeasured?.metricsAfter["p95LatencyMs"]);
  const failedRequests =
    requestCount !== undefined && errorRate !== undefined
      ? (requestCount * errorRate) / 100
      : undefined;

  async function command(action: StudioQuickAction["action"], service: string, replicas?: number) {
    if (busy) return;
    setMessage("");
    try {
      await onCommand(action, service, replicas);
    } catch {
      setMessage("The command was not confirmed. Check the action history before retrying.");
    }
  }

  function scaleTo(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      setMessage("Live accepts 1–3 replicas. BR-07 rejects larger requests.");
      return;
    }
    if (value === running || !canScale) return;
    void command("SCALE", selected, value);
  }

  const show = (section: LiveParitySection) => !sections || sections.includes(section);

  return (
    <section
      aria-label={label}
      className={
        compact
          ? "space-y-3 text-slate-100"
          : "space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3 pr-1 text-slate-100 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
      }
    >
      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Live capability parity</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Every Sandbox surface is listed. A control is enabled only when a real Docker action
              or observed telemetry backs it; the others explain why they stay in Sandbox.
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-slate-300">
            {counts.REAL} real · {counts.PREPARED} prepared · {counts.OBSERVE} observe ·{" "}
            {counts.UNAVAILABLE} off
          </span>
        </div>
      )}
      {message && (
        <p
          role="status"
          className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-100"
        >
          {message}
        </p>
      )}

      {show("scenarios") &&
        (compact ? (
          <details className="rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-2">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-400 hover:text-slate-200">
              Sandbox-only: Cluster Scenarios (unavailable in Live)
            </summary>
            <div className="mt-2 space-y-2 text-[11px] text-slate-400">
              <p className="leading-relaxed">
                Sandbox injects synthetic traffic, outages and latency. Live only measures the
                Lab&apos;s real workload.
              </p>
            </div>
          </details>
        ) : (
          <CapabilitySection
            title="Cluster Scenarios"
            capability={capability("cluster-scenario")}
            icon={<Activity aria-hidden="true" className="size-3.5" />}
          >
            <select
              aria-label="Live cluster scenario"
              disabled
              value="FLASH_SALE"
              onChange={() => undefined}
              className="min-h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-400 disabled:opacity-70"
            >
              {LIVE_SCENARIOS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" disabled className="w-full">
              <Play aria-hidden="true" className="size-3" /> Apply scenario
            </Button>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Sandbox injects synthetic traffic, outages and latency. Live only measures the
              Lab&apos;s real workload.
            </p>
          </CapabilitySection>
        ))}

      {show("library") &&
        (compact ? (
          <section aria-label="Block library" className="space-y-3.5 text-slate-100">
            {/* 1. Services Explorer Header & Search */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-1.5">
                  <Boxes aria-hidden="true" className="size-3.5 text-slate-400" />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Services
                  </h4>
                  <span className="rounded-full bg-slate-800/90 px-1.5 py-0.2 font-mono text-[10px] font-medium tabular-nums text-slate-400">
                    {blocks.length}
                  </span>
                </div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => onSelect("")}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    Deselect
                  </button>
                )}
              </div>

              {blocks.length > 3 && (
                <label className="relative block">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-2 size-3 text-slate-500"
                  />
                  <Input
                    type="search"
                    aria-label="Search Live blocks"
                    placeholder="Filter services…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-7 rounded-lg border-slate-800 bg-slate-950/80 pl-7 text-[11px] placeholder:text-slate-500 focus-visible:border-sky-500/50"
                  />
                </label>
              )}

              {/* Clean Flat IDE Service Tree Rows */}
              <ul className="space-y-0.5">
                {visibleBlocks.map((block) => {
                  const live = runningReplicas(data, block.service);
                  const isSelected = selected === block.service;
                  const startsStopped = authoring
                    ? authoring.initialStoppedServices.includes(block.service)
                    : block.initiallyStopped === true;
                  const isScalable = authoring
                    ? authoring.scalableServices.includes(block.service)
                    : block.canScale === true;
                  const statusDot =
                    live === undefined
                      ? startsStopped
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                      : live === 0
                        ? "bg-rose-400"
                        : "bg-emerald-400";
                  const replicaText =
                    live === undefined
                      ? startsStopped
                        ? "0×"
                        : "1×"
                      : live === 0
                        ? "0×"
                        : `${live}×`;
                  return (
                    <li
                      key={block.service}
                      className={`group relative flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
                        isSelected
                          ? "bg-sky-500/12 text-white ring-1 ring-inset ring-sky-500/45"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                      }`}
                    >
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-sky-400"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            onSelect("");
                          } else {
                            onSelect(block.service);
                            onSelectSetupPanel?.("service");
                          }
                        }}
                        aria-label={`Inspect ${block.label}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${statusDot}`}
                          aria-hidden="true"
                        />
                        {renderLiveBlockIcon(block.service, studioStyle)}
                        <span className="truncate font-mono text-[11px] font-medium">
                          {block.label}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {authoring && startsStopped && (
                          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-300">
                            Down
                          </span>
                        )}
                        {authoring && !isScalable && (
                          <span
                            title="Fixed replicas (student cannot scale)"
                            className="text-slate-500"
                          >
                            <Lock aria-hidden="true" className="size-2.5" />
                          </span>
                        )}
                        <span
                          className={`min-w-[22px] rounded px-1 py-0.5 text-center font-mono text-[10px] tabular-nums ${
                            isSelected
                              ? "bg-sky-500/20 font-semibold text-sky-200"
                              : live === 0
                                ? "bg-rose-500/15 text-rose-300"
                                : "bg-slate-900/90 text-slate-400"
                          }`}
                        >
                          {replicaText}
                        </span>
                        {authoring?.onRemoveBlock && blocks.length > 1 && (
                          <button
                            type="button"
                            disabled={authoring.busy}
                            onClick={() => authoring.onRemoveBlock?.(block.service)}
                            title={`Remove ${block.service} from Studio topology`}
                            aria-label={`Remove ${block.service} from Studio topology`}
                            className="rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-800 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                          >
                            <X aria-hidden="true" className="size-3" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {visibleBlocks.length === 0 && (
                  <li className="px-2 py-2 text-[11px] text-slate-500">
                    No matching services.
                  </li>
                )}
              </ul>
            </div>

            {/* 2. Available Compose Containers to Add */}
            {authoring?.availableServices &&
              authoring.onAddBlock &&
              (() => {
                const placed = new Set(blocks.map((b) => b.service));
                const extraServices = authoring.availableServices.filter(
                  (svc) => !placed.has(svc),
                );
                if (extraServices.length === 0) return null;
                return (
                  <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                    <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Add from Compose
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {extraServices.map((svc) => (
                        <button
                          key={svc}
                          type="button"
                          disabled={authoring.busy}
                          onClick={() => authoring.onAddBlock?.(svc)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700/90 bg-slate-900/50 px-2 py-1 font-mono text-[10.5px] text-slate-300 transition-colors hover:border-sky-500/60 hover:bg-sky-500/10 hover:text-sky-200 disabled:opacity-40"
                        >
                          <Plus aria-hidden="true" className="size-3 text-slate-400" />
                          {renderLiveBlockIcon(svc, studioStyle)}
                          <span>{svc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

            {/* 3. Explicit Connections (when configured) */}
            {(topology?.connections.length ?? 0) > 0 && (
              <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Connections ({topology?.connections.length})
                </p>
                <ul className="space-y-1">
                  {topology?.connections.map((link) => {
                    const linkRunning = runningReplicas(data, link.controllerService);
                    const connected = (linkRunning ?? 0) > 0;
                    const startsCut = authoring
                      ? authoring.initialStoppedControllers.includes(link.controllerService)
                      : link.initiallyStopped === true;
                    return (
                      <li
                        key={`${link.from}:${link.to}:${link.controllerService}`}
                        className="flex items-center justify-between gap-1.5 rounded-lg bg-slate-900/50 px-2 py-1.5 text-[10.5px]"
                      >
                        <span className="truncate font-mono text-slate-300">
                          {link.from} → {link.to}
                        </span>
                        {linkRunning !== undefined ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void command(connected ? "STOP" : "START", link.controllerService)
                            }
                            className={`h-5 shrink-0 rounded border px-1.5 text-[9.5px] font-semibold transition-colors disabled:opacity-40 ${
                              connected
                                ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                                : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                            }`}
                          >
                            {connected ? "Disconnect" : "Connect"}
                          </button>
                        ) : authoring ? (
                          <button
                            type="button"
                            disabled={authoring.busy}
                            onClick={() =>
                              authoring.onToggleInitialStopped(link.controllerService, true)
                            }
                            className={`h-5 shrink-0 rounded border px-1.5 text-[9.5px] font-medium ${
                              startsCut
                                ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                                : "border-slate-800 bg-slate-950/70 text-slate-400"
                            }`}
                          >
                            {startsCut ? "Starts Cut" : "Active"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 4. Calm, Context-Aware Action Toolbox (Drag onto any node OR click for selected node) */}
            {(() => {
              const isLiveRunning = data.executionStatus === "RUNNING";
              const isPreviewAuthor = !isLiveRunning && Boolean(authoring);
              const canDrag = !busy && (isLiveRunning || isPreviewAuthor);
              return (
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <p className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <Wrench aria-hidden="true" className="size-3 text-slate-400" />
                      Action Toolbox
                    </p>
                    {selected ? (
                      <span className="truncate rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-sky-300">
                        {selected}
                      </span>
                    ) : (
                      <span className="truncate text-[9.5px] text-slate-500">
                        Drag onto block
                      </span>
                    )}
                  </div>

                  {/* Row 1: Lifecycle (Stop / Restart) */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {LIVE_LIFECYCLE_TOOLS.map((tool) => {
                      const blocked =
                        busy ||
                        (!isLiveRunning && !isPreviewAuthor) ||
                        (tool.action === "START" &&
                          isLiveRunning &&
                          (!selected || (running ?? 0) > 0)) ||
                        (tool.action === "STOP" &&
                          isLiveRunning &&
                          (!selected || !running));
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          draggable={canDrag}
                          disabled={blocked && !canDrag}
                          title={tool.title}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-mavis-studio-tool", tool.id);
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => {
                            if (!selected) {
                              setMessage("Select a block on the canvas, or drag this tool onto one.");
                              return;
                            }
                            if (blocked) return;
                            void command(tool.action, selected);
                          }}
                          className={`group flex items-center justify-between gap-1.5 rounded-lg border border-slate-800 bg-slate-900/75 px-2.5 py-2 text-left text-[11px] font-medium text-slate-200 transition-colors ${
                            canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
                          } ${blocked && selected ? "opacity-45" : ""} ${tool.hoverClass}`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {tool.action === "STOP" ? (
                              <Square aria-hidden="true" className={`size-3 shrink-0 fill-current ${tool.iconColor}`} />
                            ) : (
                              <RotateCcw aria-hidden="true" className={`size-3 shrink-0 ${tool.iconColor}`} />
                            )}
                            <span className="truncate">{tool.shortLabel}</span>
                          </span>
                          <GripVertical
                            aria-hidden="true"
                            className="size-3 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400"
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Row 2: Scale Replicas (+1 / ×2 / ×3) */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {LIVE_SCALE_TOOLS.map((tool) => {
                      const scaleBlocked =
                        busy ||
                        (!isLiveRunning && !isPreviewAuthor) ||
                        (isLiveRunning && (!selected || !canScale || !running));
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          draggable={canDrag}
                          disabled={scaleBlocked && !canDrag}
                          title={tool.title}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-mavis-studio-tool", tool.id);
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => {
                            if (!selected) {
                              setMessage("Select a block on the canvas, or drag this scale tool onto one.");
                              return;
                            }
                            if (scaleBlocked) return;
                            const next =
                              "delta" in tool
                                ? Math.max(
                                    1,
                                    Math.min(3, (running && running > 0 ? running : 1) + tool.delta),
                                  )
                                : tool.replicas;
                            void command("SCALE", selected, next);
                          }}
                          className={`flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/75 px-1.5 py-1.5 text-center transition-colors hover:border-sky-500/50 hover:bg-sky-500/10 ${
                            canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
                          } ${scaleBlocked && selected ? "opacity-45" : ""}`}
                        >
                          <span className="font-mono text-[11px] font-semibold text-sky-300">
                            {tool.badge}
                          </span>
                          <span className="text-[9.5px] text-slate-400">{tool.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 5. Compact Lab Setup Shortcuts */}
            {(authoring || data.executionStatus === "RUNNING") && (
              <div className="space-y-1 border-t border-slate-800/80 pt-3">
                <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {authoring ? "Lab Setup" : "Practice"}
                </p>
                {authoring && (
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => onSelectSetupPanel?.("presets")}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                        activeSetupPanel === "presets"
                          ? "bg-amber-500/12 text-amber-200 ring-1 ring-inset ring-amber-500/35"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Zap aria-hidden="true" className="size-3.5 shrink-0 text-amber-400" />
                        <span className="truncate">Lab Exercise Presets</span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectSetupPanel?.("mission")}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                        activeSetupPanel === "mission"
                          ? "bg-sky-500/12 text-sky-200 ring-1 ring-inset ring-sky-500/35"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Target aria-hidden="true" className="size-3.5 shrink-0 text-sky-400" />
                        <span className="truncate">Mission &amp; Pass Criteria</span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-600" />
                    </button>
                  </div>
                )}
                {!authoring && data.executionStatus === "RUNNING" && (
                  <button
                    type="button"
                    onClick={() => onSelectSetupPanel?.("drills")}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                      activeSetupPanel === "drills"
                        ? "bg-emerald-500/12 text-emerald-200 ring-1 ring-inset ring-emerald-500/35"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <RotateCcw aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400" />
                      <span className="truncate">Quick Live Drills</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-600" />
                  </button>
                )}
              </div>
            )}
          </section>
        ) : (
          <CapabilitySection
            title="Block library"
            capability={capability("prepared-block")}
            icon={<Boxes aria-hidden="true" className="size-3.5" />}
            compact={false}
          >
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400"
              />
              <Input
                type="search"
                aria-label="Search Live blocks"
                placeholder="Search prepared blocks…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 rounded-md border-slate-700 bg-slate-950 pl-8 text-xs"
              />
            </label>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
              {visibleBlocks.map((block) => {
                const live = runningReplicas(data, block.service);
                const isSelected = selected === block.service;
                const startsStopped = authoring
                  ? authoring.initialStoppedServices.includes(block.service)
                  : block.initiallyStopped === true;
                const statusDot =
                  live === undefined
                    ? startsStopped
                      ? "bg-amber-400"
                      : "bg-sky-400"
                    : live === 0
                      ? "bg-rose-400"
                      : "bg-emerald-400";
                return (
                  <li
                    key={block.service}
                    className={`space-y-1.5 rounded-md border p-2 text-[11px] transition-colors ${
                      isSelected
                        ? "border-sky-500/60 bg-sky-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(block.service);
                          onSelectSetupPanel?.("service");
                        }}
                        aria-label={`Inspect ${block.label}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <span className={`size-1.5 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />
                        <span className="truncate font-mono text-[11px] font-semibold text-slate-100 hover:text-sky-200">
                          {block.label}
                        </span>
                      </button>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">
                        {live === undefined
                          ? startsStopped
                            ? "Fault"
                            : "Ready"
                          : live === 0
                            ? "Down"
                            : `${live}×`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        disabled={busy || live === undefined || live > 0}
                        onClick={() => void command("START", block.service)}
                        className="h-5 rounded border border-slate-700 px-1.5 text-[9.5px] font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-200 disabled:opacity-35"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        disabled={busy || !live}
                        onClick={() => void command("STOP", block.service)}
                        className="h-5 rounded border border-slate-700 px-1.5 text-[9.5px] font-semibold text-slate-200 hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-35"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
              {visibleBlocks.length === 0 && (
                <li className="px-1 text-[11px] text-slate-400">No matching prepared blocks.</li>
              )}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title={capability("custom-block").reason}
              className="w-full"
            >
              + Custom block
            </Button>
          </CapabilitySection>
        ))}

      {show("inspector") && (
        <CapabilitySection
          title={`Inspector · ${selectedBlock?.label ?? (selected || "service")}`}
          capability={capability("service-actions")}
          icon={<Server aria-hidden="true" className="size-3.5" />}
          compact={compact}
        >
          {(() => {
            const isPreview = data.executionStatus !== "RUNNING" && !data.telemetry?.observedAt;
            const isPaused =
              !isPreview &&
              running === 0 &&
              [...data.actions]
                .reverse()
                .find((item) => item.service === selected && item.status === "CONFIRMED")?.action ===
                "PAUSE";
            const statusText = isPreview
              ? running === 0
                ? "Starts Down"
                : "Prepared"
              : running === undefined
                ? "Waiting"
                : isPaused
                  ? "Paused"
                  : running === 0
                    ? "Stopped"
                    : "Running";
            const statusTone = isPreview
              ? running === 0
                ? "font-semibold text-amber-300"
                : "font-semibold text-sky-300"
              : running === undefined
                ? "text-slate-400"
                : isPaused
                  ? "font-semibold text-amber-300"
                  : running === 0
                    ? "font-semibold text-rose-300"
                    : "font-semibold text-emerald-300";
            return (
              <div className="flex flex-wrap items-baseline justify-between gap-1 text-[11px]">
                <span className="font-mono text-slate-300">{selected || "—"}</span>
                <span className={statusTone}>{statusText}</span>
              </div>
            );
          })()}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] text-slate-400">
            <span className="whitespace-nowrap">CPU {observedStats.cpu}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">RAM {observedStats.memory}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">replicas {running ?? "—"}</span>
          </p>
          {compact && authoring && selected && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Lab Exercise Setup · {selected}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-slate-400">Initial State</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-700 bg-slate-900">
                    <button
                      type="button"
                      disabled={authoring.busy}
                      onClick={() => {
                        if (authoring.initialStoppedServices.includes(selected)) {
                          authoring.onToggleInitialStopped(selected, false);
                        }
                      }}
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        !authoring.initialStoppedServices.includes(selected)
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Starts Up
                    </button>
                    <button
                      type="button"
                      disabled={authoring.busy}
                      onClick={() => {
                        if (!authoring.initialStoppedServices.includes(selected)) {
                          authoring.onToggleInitialStopped(selected, false);
                        }
                      }}
                      className={`border-l border-slate-700 px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        authoring.initialStoppedServices.includes(selected)
                          ? "bg-amber-500/20 text-amber-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Starts Down
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-slate-400">Student Scaling</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-700 bg-slate-900">
                    <button
                      type="button"
                      disabled={authoring.busy}
                      onClick={() => {
                        if (!authoring.scalableServices.includes(selected)) {
                          authoring.onToggleScalable(selected);
                        }
                      }}
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        authoring.scalableServices.includes(selected)
                          ? "bg-sky-500/20 text-sky-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Scalable
                    </button>
                    <button
                      type="button"
                      disabled={authoring.busy}
                      onClick={() => {
                        if (authoring.scalableServices.includes(selected)) {
                          authoring.onToggleScalable(selected);
                        }
                      }}
                      className={`border-l border-slate-700 px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        !authoring.scalableServices.includes(selected)
                          ? "bg-slate-700/70 text-slate-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Fixed 1×
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                {compact ? "Replicas (1–3)" : "Custom replicas (Live 1–3)"}
                {!compact && (
                  <span
                    className={`rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] font-semibold ${BADGE[capability("replicas-1-8").state]}`}
                  >
                    {capability("replicas-1-8").state}
                  </span>
                )}
              </span>
              <input
                key={`${selected}:${running}`}
                type="number"
                min={1}
                max={3}
                step={1}
                aria-label="Live replica count"
                defaultValue={Math.max(1, running ?? 1)}
                disabled={!canScale || busy || running === undefined || running === 0}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value);
                  setDraft(null);
                  scaleTo(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="h-6 w-14 rounded border border-slate-700 bg-slate-950 px-1.5 text-center font-mono text-xs font-semibold text-slate-100 disabled:opacity-40"
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 3].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Scale ${selected} to ${preset}`}
                  disabled={!canScale || busy || running === undefined || running === 0}
                  onClick={() => scaleTo(preset)}
                  className="h-6 rounded border border-slate-800 bg-slate-950/80 font-mono text-[10.5px] font-semibold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-40"
                >
                  ×{preset}
                </button>
              ))}
            </div>
            {!compact && (
              <div className="grid grid-cols-2 gap-1">
                {[16, 32].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Scale ${selected} to ${preset}`}
                    disabled
                    title="BR-07 bounds a Live session to 3 replicas."
                    className="h-6 rounded border border-slate-800 bg-slate-950/40 font-mono text-[10.5px] font-semibold text-slate-600"
                  >
                    ×{preset}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={busy || running === undefined || running === 0}
              onClick={() => void command("STOP", selected)}
              className="h-7 min-w-0 shrink-0 whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/15 px-2 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-40"
            >
              Stop
            </button>
            <button
              type="button"
              disabled={
                busy ||
                running === undefined ||
                running > 0 ||
                [...data.actions]
                  .reverse()
                  .find((item) => item.service === selected && item.status === "CONFIRMED")
                  ?.action === "PAUSE"
              }
              onClick={() => void command("START", selected)}
              className="h-7 min-w-0 shrink-0 whitespace-nowrap rounded border border-emerald-500/40 bg-emerald-500/15 px-2 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
            >
              Start
            </button>
            <button
              type="button"
              disabled={!canScale || busy || running === undefined || running === 0 || running >= 3}
              onClick={() => void command("SCALE", selected, (running ?? 0) + 1)}
              className={`h-7 min-w-0 shrink-0 whitespace-nowrap rounded border border-sky-500/40 bg-sky-500/15 px-2 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-500/25 disabled:opacity-40 ${compact ? "col-span-2" : ""}`}
            >
              {compact ? "+1 Clone Replica" : "Clone"}
            </button>
            {!compact && (
              <button
                type="button"
                disabled
                title={capability("delete-block").reason}
                className="flex h-7 min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border border-red-500/40 bg-red-500/15 px-2 text-[11px] font-semibold text-red-200 opacity-40"
              >
                <Trash2 aria-hidden="true" className="size-3 shrink-0" /> Delete
              </button>
            )}
          </div>
          {draft !== null && (
            <p className="text-[10px] text-slate-500">Press Enter or leave the field to apply.</p>
          )}
        </CapabilitySection>
      )}

      {show("hardware") && (
        <CapabilitySection
          title={compact ? "Container Resources" : "Hardware & Stress Simulation"}
          capability={capability("hardware-stress")}
          icon={<Cpu aria-hidden="true" className="size-3.5" />}
          compact={compact}
        >
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <ReadOnlyFact label="vCPU / pod" value={limits?.cpus ?? "—"} />
            <ReadOnlyFact
              label="RAM / pod"
              value={limits?.memoryMiB === undefined ? "—" : `${limits.memoryMiB} MiB`}
            />
          </div>
          {selectedLimit && (
            <p className="break-words font-mono text-[10px] text-slate-400">
              {selectedLimit.runtime || "runtime"} · :{selectedLimit.containerPort} ·{" "}
              {selectedLimit.readinessPath}
            </p>
          )}
          {!compact && (
            <>
              <DisabledField
                label="Incoming Traffic (req/s)"
                placeholder="Measured by the Lab workload"
              />
              <DisabledField label="Network / Query Lag (+ms)" placeholder="Not injected in Live" />
              <p className="text-[11px] leading-relaxed text-slate-400">
                CPU, RAM and timeout come from the approved execution profile. Edit them in Runtime
                Configuration, not from the canvas.
              </p>
            </>
          )}
        </CapabilitySection>
      )}

      {show("resilience") && (
        <CapabilitySection
          title="Resilience Signals"
          capability={capability("resilience-policy")}
          icon={<ShieldCheck aria-hidden="true" className="size-3.5" />}
          compact={compact}
        >
          <div className={compact ? "space-y-1" : "grid grid-cols-2 gap-1.5"}>
            <ObservationCard label="Circuit Breaker" observed={circuitObserved} compact={compact} />
            <ObservationCard label="Rate Limiter" observed={rateLimited} compact={compact} />
            <ObservationCard label="Retry / Bulkhead" observed={retryObserved} compact={compact} />
            <ObservationCard label="L1 Read Cache" observed={cacheObserved} compact={compact} />
          </div>
          {!compact && (
            <p className="text-[11px] leading-relaxed text-slate-400">
              Read-only observations from real logs and spans. Live never toggles application policy
              code; the curated repository owns it.
            </p>
          )}
        </CapabilitySection>
      )}

      {show("load") && (
        <CapabilitySection
          title="Load & capacity"
          capability={capability("load-capacity")}
          icon={<Gauge aria-hidden="true" className="size-3.5" />}
          compact={compact}
        >
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Metric label="Requests" value={requestCount?.toLocaleString()} />
            <Metric
              label="p95 latency"
              value={p95 === undefined ? undefined : `${Number(p95.toFixed(1))} ms`}
            />
            <Metric
              label="Error rate"
              value={errorRate === undefined ? undefined : `${Number(errorRate.toFixed(2))}%`}
            />
            <Metric
              label="Replicas"
              value={lastMeasured?.replicasAfter?.toLocaleString()}
            />
          </div>
          {failedRequests !== undefined && requestCount !== undefined && (
            <p className="text-[10.5px] text-slate-400">
              <span className="font-mono text-slate-200">
                {Math.max(0, requestCount - failedRequests).toLocaleString()}
              </span>{" "}
              ok ·{" "}
              <span className="font-mono text-rose-300">
                {failedRequests.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>{" "}
              failed
            </p>
          )}
          {!lastMeasured && !compact && (
            <p className="text-[11px] text-slate-400">
              Run a confirmed START, STOP or SCALE on a replayable GET/HEAD workload to populate
              measured values.
            </p>
          )}
        </CapabilitySection>
      )}

      {show("config") &&
        (compact ? (
          <details className="rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-2">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-400 hover:text-slate-200">
              Current configuration &amp; limits ({limits?.timeoutSeconds ?? "—"}s timeout)
            </summary>
            <div className="mt-2 space-y-2">
              <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
                <Fact label="Running pods" value={running?.toLocaleString() ?? "—"} />
                <Fact label="CPU observed" value={observedStats.cpu} />
                <Fact label="RAM observed" value={observedStats.memory} />
                <Fact
                  label="Session timeout"
                  value={limits?.timeoutSeconds === undefined ? "—" : `${limits.timeoutSeconds}s`}
                />
              </dl>
              {selectedLimit && (
                <p className="break-words font-mono text-[10px] text-slate-400">
                  readiness {selectedLimit.readinessPath}
                </p>
              )}
            </div>
          </details>
        ) : (
          <CapabilitySection
            title="Current configuration"
            capability={capability("telemetry")}
            icon={<Layers aria-hidden="true" className="size-3.5" />}
          >
            <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
              <Fact label="Running pods" value={running?.toLocaleString() ?? "—"} />
              <Fact label="CPU observed" value={observedStats.cpu} />
              <Fact label="RAM observed" value={observedStats.memory} />
              <Fact
                label="Session timeout"
                value={limits?.timeoutSeconds === undefined ? "—" : `${limits.timeoutSeconds}s`}
              />
            </dl>
            {selectedLimit && (
              <p className="break-words font-mono text-[10px] text-slate-400">
                readiness {selectedLimit.readinessPath}
              </p>
            )}
          </CapabilitySection>
        ))}

      {show("snapshots") && (
        <CapabilitySection
          title="Snapshots"
          capability={capability("snapshots")}
          icon={<Camera aria-hidden="true" className="size-3.5" />}
        >
          <p className="text-[11px] text-slate-300">
            {data.snapshots?.length ?? 0} captured ·{" "}
            {data.snapshots?.filter((snapshot) => Boolean(snapshot.digest)).length ?? 0} with digest
          </p>
          <p className="text-[10.5px] leading-relaxed text-slate-400">
            Use Capture evidence snapshot below. Each capture freezes the observed graph, telemetry
            and explanation.
          </p>
          <div className="flex items-center justify-between gap-1 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px]">
            <span className="text-slate-300">Local video recording</span>
            <span className="font-mono font-semibold text-slate-500">UNAVAILABLE</span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-slate-500">
            {capability("local-video").reason}
          </p>
        </CapabilitySection>
      )}
    </section>
  );
}

function CapabilitySection({
  title,
  capability,
  icon,
  compact = false,
  children,
}: {
  title: string;
  capability: LiveCapability;
  icon: ReactNode;
  compact?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-slate-800 text-slate-300">
            {icon}
          </span>
          <h4 className="truncate text-xs font-semibold text-slate-100">{title}</h4>
        </div>
        {!compact && (
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold ${BADGE[capability.state]}`}
          >
            {capability.state}
          </span>
        )}
      </div>
      {children}
      {!compact && (
        <p className="text-[10.5px] leading-relaxed text-slate-500">{capability.reason}</p>
      )}
    </section>
  );
}

function ObservationCard({
  label,
  observed,
  compact = false,
}: {
  label: string;
  observed: boolean;
  compact?: boolean | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px]">
      <span className="truncate text-slate-300">{label}</span>
      <span
        className={`shrink-0 whitespace-nowrap ${observed ? "font-semibold text-emerald-300" : "text-slate-500"}`}
      >
        {observed ? "Observed" : compact ? "—" : "Not observed"}
      </span>
    </div>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function DisabledField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
      <span>{label}</span>
      <input
        type="text"
        disabled
        aria-label={label}
        placeholder={placeholder}
        className="h-6 w-36 rounded border border-slate-800 bg-slate-950/60 px-1.5 text-right text-[10px] text-slate-500 placeholder:text-slate-600 disabled:opacity-80"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-950/70 p-2">
      <p className="text-slate-400">{label}</p>
      <p className="mt-1 break-words font-mono font-semibold text-slate-100">{value ?? "—"}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-950/70 p-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-mono font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
