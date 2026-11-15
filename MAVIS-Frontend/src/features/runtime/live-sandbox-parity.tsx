"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Boxes,
  Camera,
  Cpu,
  Gauge,
  Layers,
  Play,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Response } from "@/lib/api/contracts";
import type { StudioQuickAction } from "./studio-observability";
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

export function LiveSandboxParity({
  data,
  selected,
  busy,
  onSelect,
  onCommand,
  sections,
  compact = false,
  label = "Live capability parity",
}: LiveSandboxParityProps) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const topology = data.topology;
  const selectedBlock = topology?.blocks.find((block) => block.service === selected);
  const canScale = topology ? selectedBlock?.canScale === true : Boolean(selected);
  const running = runningReplicas(data, selected);
  const observed = serviceTelemetry(data, selected);
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
    if (!Number.isInteger(value) || value < 1 || value > 8) {
      setMessage("Live accepts 1–8 replicas. BR-07 rejects larger requests.");
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

      {show("scenarios") && (
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
      )}

      {show("library") && (
        <CapabilitySection
          title="Block library"
          capability={capability("prepared-block")}
          icon={<Boxes aria-hidden="true" className="size-3.5" />}
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
          <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
            {visibleBlocks.map((block) => {
              const live = runningReplicas(data, block.service);
              return (
                <li
                  key={block.service}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/60 p-1.5 text-[11px]"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(block.service)}
                    aria-label={`Inspect ${block.label}`}
                    className="mr-auto max-w-full truncate font-semibold text-slate-100 hover:text-sky-200"
                  >
                    {block.label}
                  </button>
                  <span className="font-mono text-slate-400">
                    {live === undefined ? "Waiting" : `${live} pods`}
                  </span>
                  <button
                    type="button"
                    disabled={busy || live === undefined || live > 0}
                    onClick={() => void command("START", block.service)}
                    className="h-5 rounded border border-slate-700 px-1 text-[10px] font-semibold text-slate-200 disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    disabled={busy || !live}
                    onClick={() => void command("STOP", block.service)}
                    className="h-5 rounded border border-slate-700 px-1 text-[10px] font-semibold text-slate-200 disabled:opacity-40"
                  >
                    Remove
                  </button>
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
      )}

      {show("inspector") && (
        <CapabilitySection
          title={`Inspector · ${selectedBlock?.label ?? (selected || "service")}`}
          capability={capability("service-actions")}
          icon={<Server aria-hidden="true" className="size-3.5" />}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-1 text-[11px]">
            <span className="font-mono text-slate-300">{selected || "—"}</span>
            <span
              className={
                running === undefined
                  ? "text-slate-400"
                  : running === 0
                    ? "font-semibold text-rose-300"
                    : "font-semibold text-emerald-300"
              }
            >
              {running === undefined ? "Waiting" : running === 0 ? "Stopped" : "Running"}
            </span>
          </div>
          <p className="font-mono text-[10.5px] text-slate-400">
            CPU {observed?.stats[0]?.cpu ?? "—"} · RAM {observed?.stats[0]?.memory ?? "—"} ·
            replicas {running ?? "—"}
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                Custom replicas (Live 1–8)
                <span
                  className={`rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] font-semibold ${BADGE[capability("replicas-1-8").state]}`}
                >
                  {capability("replicas-1-8").state}
                </span>
              </span>
              <input
                key={`${selected}:${running}`}
                type="number"
                min={1}
                max={8}
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
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 4, 8].map((preset) => (
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
              {[16, 32].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Scale ${selected} to ${preset}`}
                  disabled
                  title="BR-07 bounds a Live session to 8 replicas."
                  className="h-6 rounded border border-slate-800 bg-slate-950/40 font-mono text-[10.5px] font-semibold text-slate-600"
                >
                  ×{preset}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              disabled={busy || running === undefined || running === 0}
              onClick={() => void command("STOP", selected)}
              className="h-6 min-w-0 rounded border border-amber-500/40 bg-amber-500/15 px-1 text-[10.5px] font-semibold text-amber-200 disabled:opacity-40"
            >
              Stop
            </button>
            <button
              type="button"
              disabled={busy || running === undefined || running > 0}
              onClick={() => void command("START", selected)}
              className="h-6 min-w-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-1 text-[10.5px] font-semibold text-emerald-200 disabled:opacity-40"
            >
              Start
            </button>
            <button
              type="button"
              disabled={!canScale || busy || running === undefined || running === 0 || running >= 8}
              onClick={() => void command("SCALE", selected, (running ?? 0) + 1)}
              className="h-6 min-w-0 rounded border border-sky-500/40 bg-sky-500/15 px-1 text-[10.5px] font-semibold text-sky-200 disabled:opacity-40"
            >
              Clone
            </button>
            <button
              type="button"
              disabled
              title={capability("delete-block").reason}
              className="flex h-6 min-w-0 items-center justify-center gap-0.5 rounded border border-red-500/40 bg-red-500/15 px-1 text-[10.5px] font-semibold text-red-200 opacity-40"
            >
              <Trash2 aria-hidden="true" className="size-3" /> Delete
            </button>
          </div>
          {draft !== null && (
            <p className="text-[10px] text-slate-500">Press Enter or leave the field to apply.</p>
          )}
        </CapabilitySection>
      )}

      {show("hardware") && (
        <CapabilitySection
          title="Hardware & Stress Simulation"
          capability={capability("hardware-stress")}
          icon={<Cpu aria-hidden="true" className="size-3.5" />}
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
          <DisabledField
            label="Incoming Traffic (req/s)"
            placeholder="Measured by the Lab workload"
          />
          <DisabledField label="Network / Query Lag (+ms)" placeholder="Not injected in Live" />
          <p className="text-[11px] leading-relaxed text-slate-400">
            CPU, RAM and timeout come from the approved execution profile. Edit them in Runtime
            Configuration, not from the canvas.
          </p>
        </CapabilitySection>
      )}

      {show("resilience") && (
        <CapabilitySection
          title="Resilience Policies"
          capability={capability("resilience-policy")}
          icon={<ShieldCheck aria-hidden="true" className="size-3.5" />}
        >
          <div className="grid grid-cols-2 gap-1.5">
            <ObservationCard label="Circuit Breaker" observed={circuitObserved} />
            <ObservationCard label="Rate Limiter" observed={rateLimited} />
            <ObservationCard label="Retry / Bulkhead" observed={retryObserved} />
            <ObservationCard label="L1 Read Cache" observed={cacheObserved} />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Read-only observations from real logs and spans. Live never toggles application policy
            code; the curated repository owns it.
          </p>
        </CapabilitySection>
      )}

      {show("load") && (
        <CapabilitySection
          title="Load & capacity"
          capability={capability("load-capacity")}
          icon={<Gauge aria-hidden="true" className="size-3.5" />}
        >
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Metric label="Requests measured" value={requestCount?.toLocaleString()} />
            <Metric
              label="p95 latency"
              value={p95 === undefined ? undefined : `${Number(p95.toFixed(1))} ms`}
            />
            <Metric
              label="Error rate"
              value={errorRate === undefined ? undefined : `${Number(errorRate.toFixed(2))}%`}
            />
            <Metric
              label="Replicas after action"
              value={lastMeasured?.replicasAfter?.toLocaleString()}
            />
          </div>
          {lastMeasured && (
            <p className="text-[10px] text-slate-500">Session-wide last confirmed measurement.</p>
          )}
          {failedRequests !== undefined && requestCount !== undefined && (
            <p className="text-[11px] text-slate-400">
              <span className="font-mono text-slate-200">
                {Math.max(0, requestCount - failedRequests).toLocaleString()}
              </span>{" "}
              handled ·{" "}
              <span className="font-mono text-rose-300">
                {failedRequests.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>{" "}
              failed in the last confirmed measurement.
            </p>
          )}
          {!lastMeasured && (
            <p className="text-[11px] text-slate-400">
              Run a confirmed START, STOP or SCALE on a replayable GET/HEAD workload to populate
              measured values.
            </p>
          )}
        </CapabilitySection>
      )}

      {show("config") && (
        <CapabilitySection
          title="Current configuration"
          capability={capability("telemetry")}
          icon={<Layers aria-hidden="true" className="size-3.5" />}
        >
          <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Fact label="Running pods" value={running?.toLocaleString() ?? "—"} />
            <Fact label="CPU observed" value={observed?.stats[0]?.cpu ?? "—"} />
            <Fact label="RAM observed" value={observed?.stats[0]?.memory ?? "—"} />
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
      )}

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
  children,
}: {
  title: string;
  capability: LiveCapability;
  icon: ReactNode;
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
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold ${BADGE[capability.state]}`}
        >
          {capability.state}
        </span>
      </div>
      {children}
      <p className="text-[10.5px] leading-relaxed text-slate-500">{capability.reason}</p>
    </section>
  );
}

function ObservationCard({ label, observed }: { label: string; observed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px]">
      <span className="truncate text-slate-300">{label}</span>
      <span className={observed ? "font-semibold text-emerald-300" : "text-slate-500"}>
        {observed ? "Observed" : "Not observed"}
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
