"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Camera, RefreshCw, Server, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import type { Response } from "@/lib/api/contracts";
import { StudioObservability, type StudioQuickAction } from "./studio-observability";
import { LiveSandboxParity } from "./live-sandbox-parity";
import { useStudioSession } from "./use-studio-session";

type Studio = Response<"studioState">;
type SessionOption = {
  id: string;
  scenarioName?: string | null;
  executionStatus?: string | null;
};

const EMPTY_STUDIO: Studio = {
  sessionId: "",
  interactive: true,
  services: [],
  finishRequested: false,
  executionStatus: "NOT_STARTED",
  cleanupStatus: "UNKNOWN",
  actions: [],
};

function confirmedResult(data: Studio, service: string) {
  return [...data.actions]
    .reverse()
    .filter((action) => action.service === service && action.status === "CONFIRMED")
    .at(0)?.result;
}

function runningFor(data: Studio, service: string) {
  return (
    confirmedResult(data, service)?.replicasAfter ??
    data.telemetry?.services.find((item) => item.service === service)?.runningReplicas
  );
}

function lastResultFor(data: Studio, service: string) {
  return [...data.actions]
    .reverse()
    .find((action) => action.service === service && action.status === "CONFIRMED")?.result;
}

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2)).toString()
    : "—";
}

export function LiveStudioWorkbench({
  sessions,
  sessionId,
  onSelectSession,
  onSwitchToSandbox,
}: {
  sessions: readonly SessionOption[];
  sessionId: string;
  onSelectSession: (id: string) => void;
  onSwitchToSandbox: () => void;
}) {
  const activeSessionId = sessionId || sessions[0]?.id || "";
  const studio = useStudioSession(activeSessionId);
  const {
    state,
    data: liveData,
    services,
    target,
    waiting,
    hasConfirmedAction,
    busy,
    action,
    finish,
    cancel,
    capture,
    explanation,
    setExplanation,
    capturing,
    downloadError,
    send,
    finishStudio,
    cancelStudio,
    captureSnapshot,
    downloadReceipt,
    downloadSnapshot,
  } = studio;
  const data = liveData ?? EMPTY_STUDIO;
  const selected = target || services[0] || "";
  const graphRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"stats" | "telemetry" | "snapshots">("telemetry");

  const blocks =
    data.topology?.blocks ??
    data.services.map((service) => ({
      service,
      label: service,
      canScale: false,
      initiallyStopped: false,
    }));
  const nodeNames = Object.fromEntries(blocks.map((block) => [block.service, block.label]));
  const configuredEdges = data.topology?.connections.flatMap((link) => {
    const running = runningFor(data, link.controllerService) ?? 0;
    return running > 0
      ? [
          {
            from: link.from,
            to: link.to,
            id: link.controllerService,
            protocol: link.protocol,
            active: true,
          },
        ]
      : [];
  });
  const canScaleFor = (service: string) =>
    data.topology
      ? data.topology.blocks.find((block) => block.service === service)?.canScale === true
      : true;

  function connect(from: string, to: string) {
    const link = data.topology?.connections.find((item) => item.from === from && item.to === to);
    if (!link) return;
    const running = runningFor(data, link.controllerService);
    if (running === 0) void send("START", link.controllerService);
  }

  function disconnect(from: string, to: string) {
    const link = data.topology?.connections.find((item) => item.from === from && item.to === to);
    if (!link) return;
    if ((runningFor(data, link.controllerService) ?? 0) > 0)
      void send("STOP", link.controllerService);
  }

  function quickAction(command: StudioQuickAction) {
    if (command.action === "SCALE") {
      if (!canScaleFor(command.service)) return;
      if (command.replicas === undefined || command.replicas < 1 || command.replicas > 8) return;
    }
    void send(command.action, command.service, command.replicas);
  }

  function scaleTo(service: string, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 8 || !canScaleFor(service)) return;
    void send("SCALE", service, value);
  }

  const checklist = [
    ["Step 1: Capture baseline snapshot", (data.snapshots?.length ?? 0) >= 1],
    ["Step 2: Scale replicas or inject fault", hasConfirmedAction],
    ["Step 3: Capture post-change snapshot & compare", (data.snapshots?.length ?? 0) >= 2],
    [
      "Step 4: Finish Studio & seal HMAC receipt",
      data.executionStatus === "COMPLETED" || Boolean(data.receiptDigest),
    ],
  ] as const;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[680px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#070b12] text-slate-100">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0b101b] px-3 py-2 pr-2">
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
          <span className="shrink-0 font-semibold text-slate-200">LIVE</span>
          <select
            aria-label="Select active or recent runtime session"
            value={activeSessionId}
            onChange={(event) => onSelectSession(event.target.value)}
            className="h-7 max-w-[260px] rounded border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100"
          >
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.id.slice(0, 8)} · {session.scenarioName ?? "Studio Session"} ·{" "}
                  {session.executionStatus}
                </option>
              ))
            ) : (
              <option value="">No live Docker sessions found</option>
            )}
          </select>
        </label>
        <Button asChild size="sm">
          <Link href="/sessions?studio=1">Prepare and start Live project</Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSwitchToSandbox}>
          Switch to Sandbox
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={
              finish.isPending ||
              action.isPending ||
              waiting ||
              !hasConfirmedAction ||
              data.finishRequested ||
              data.executionStatus !== "RUNNING"
            }
            onClick={() => void finishStudio()}
          >
            Finish Studio
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={cancel.isPending || data.executionStatus !== "RUNNING"}
            onClick={() => void cancelStudio()}
          >
            Cancel
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[286px] shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-800 bg-[#0b101b] p-2.5">
          <LiveSandboxParity
            data={data}
            selected={selected}
            busy={busy}
            onSelect={studio.setService}
            onCommand={send}
            sections={["scenarios", "library"]}
            compact
            label="Live block library"
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={graphRef} className="relative min-h-0 flex-1 bg-[#070b12] p-2.5">
            {state.isError ? (
              <ErrorState error={state.error} onRetry={() => void state.refetch()} />
            ) : data.services.length > 0 || data.topology ? (
              <StudioObservability
                data={data}
                selected={selected}
                onSelect={studio.setService}
                busy={busy}
                canvasOnly
                defaultView="3D"
                nodeNames={nodeNames}
                {...(configuredEdges ? { configuredEdges } : {})}
                onConnect={connect}
                onDisconnect={disconnect}
                onQuickAction={quickAction}
              />
            ) : (
              <div className="grid h-full place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
                <div className="max-w-md space-y-2">
                  <Server aria-hidden="true" className="mx-auto size-8 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-100">
                    No live Docker session selected
                  </p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Start one from the Lab runtime workspace or select an existing session above.
                    The Live workbench uses the same four-zone layout as Sandbox.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/sessions?studio=1">Prepare and start Live project</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="h-[242px] shrink-0 border-t border-slate-800 bg-[#0b101b]">
            <div className="flex h-9 items-center gap-1 border-b border-slate-800 px-2">
              {(
                [
                  ["stats", "Stats"],
                  ["telemetry", `Service Telemetry & Impact (${data.services.length})`],
                  ["snapshots", `Snapshots (${data.snapshots?.length ?? 0})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded px-2 py-1 text-[11px] font-semibold ${
                    tab === id
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
                <span className="rounded-full border border-slate-800 bg-slate-950/70 px-2 py-0.5 font-mono text-slate-300">
                  {data.finishRequested
                    ? "Finishing"
                    : waiting
                      ? "Waiting for Runner"
                      : data.executionStatus}
                  {" · "}
                  {data.cleanupStatus}
                </span>
                <span className="inline-flex items-center gap-1">
                  <RefreshCw aria-hidden="true" className="size-3" />
                  {data.telemetry?.observedAt
                    ? new Date(data.telemetry.observedAt).toLocaleTimeString()
                    : "waiting for telemetry"}
                </span>
              </div>
            </div>
            <div className="h-[calc(100%-2.25rem)] overflow-auto p-2.5">
              {tab === "stats" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                    {checklist.map(([label, done]) => (
                      <div
                        key={label}
                        className={`flex items-center gap-1.5 rounded border px-2 py-1 ${done ? "border-emerald-500/30 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 text-slate-400"}`}
                      >
                        <span className="font-mono">{done ? "✓" : "○"}</span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  {data.actions.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      No actions yet. Start, stop or scale a prepared service.
                    </p>
                  ) : (
                    <ol className="space-y-1.5 text-[11px]">
                      {data.actions.map((item) => (
                        <li
                          key={item.actionId}
                          className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                        >
                          <span className="font-semibold text-slate-200">
                            {item.action} {item.service}
                            {item.replicas ? ` → ${item.replicas}` : ""}
                          </span>
                          <span className="text-slate-400"> · {item.status}</span>
                          {item.result && (
                            <span className="ml-2 font-mono text-slate-400">
                              replicas {item.result.replicasBefore} → {item.result.replicasAfter} ·
                              requests {metric(item.result.metricsAfter["requestCount"])} · p95{" "}
                              {metric(item.result.metricsAfter["p95LatencyMs"])} ms · errors{" "}
                              {metric(item.result.metricsAfter["errorRatePercent"])}%
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {tab === "telemetry" && (
                <table className="w-full text-left text-[11px]">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-1 py-1">Service</th>
                      <th className="px-1 py-1">Status</th>
                      <th className="px-1 py-1">CPU / pod</th>
                      <th className="px-1 py-1">RAM total</th>
                      <th className="px-1 py-1">p95</th>
                      <th className="px-1 py-1">Replicas</th>
                      <th className="px-1 py-1 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((service) => {
                      const telemetry = data.telemetry?.services.find(
                        (item) => item.service === service,
                      );
                      const running = runningFor(data, service);
                      const result = lastResultFor(data, service);
                      const scale = canScaleFor(service);
                      return (
                        <tr key={service} className="border-t border-slate-800/80">
                          <td className="px-1 py-1 font-mono text-slate-200">{service}</td>
                          <td
                            className={`px-1 py-1 font-semibold ${running === 0 ? "text-rose-300" : running === undefined ? "text-slate-400" : "text-emerald-300"}`}
                          >
                            {running === undefined ? "Waiting" : running === 0 ? "Down" : "Running"}
                          </td>
                          <td className="px-1 py-1 font-mono text-slate-300">
                            {telemetry?.stats[0]?.cpu ?? "—"}
                          </td>
                          <td className="px-1 py-1 font-mono text-slate-300">
                            {telemetry?.stats[0]?.memory ?? "—"}
                          </td>
                          <td className="px-1 py-1 font-mono text-slate-300">
                            {result ? `${metric(result.metricsAfter["p95LatencyMs"])} ms` : "—"}
                          </td>
                          <td className="px-1 py-1 font-mono text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Decrease ${service} replicas`}
                                disabled={busy || running === undefined || running === 0 || !scale}
                                onClick={() => {
                                  if (running === 1) void send("STOP", service);
                                  else if (running !== undefined && running > 1)
                                    scaleTo(service, running - 1);
                                }}
                                className="grid size-5 place-items-center rounded border border-slate-700 text-slate-300 disabled:opacity-30"
                              >
                                −
                              </button>
                              <span>{running ?? "—"}</span>
                              <button
                                type="button"
                                aria-label={`Increase ${service} replicas`}
                                disabled={busy || running === undefined || running >= 8 || !scale}
                                onClick={() => {
                                  if (running === 0) void send("START", service);
                                  else if (running !== undefined) scaleTo(service, running + 1);
                                }}
                                className="grid size-5 place-items-center rounded border border-slate-700 text-slate-300 disabled:opacity-30"
                              >
                                +
                              </button>
                            </span>
                          </td>
                          <td className="px-1 py-1 text-right">
                            <button
                              type="button"
                              disabled
                              title="Live keeps the prepared service definition; use Remove/STOP instead."
                              className="inline-grid size-5 place-items-center rounded border border-slate-800 text-slate-600"
                            >
                              <Trash2 aria-hidden="true" className="size-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {data.services.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-1 py-3 text-center text-slate-500">
                          Select a Live session to see real telemetry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "snapshots" && (
                <div className="space-y-2">
                  {data.receiptDigest && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void downloadReceipt()}
                    >
                      {data.receiptSignature ? "Download signed receipt" : "Download receipt"}
                    </Button>
                  )}
                  <label className="block text-[11px] text-slate-400">
                    Explain the observed behavior
                    <Textarea
                      value={explanation}
                      maxLength={4000}
                      onChange={(event) => setExplanation(event.target.value)}
                      className="mt-1 min-h-12 bg-slate-950 text-[11px]"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !data.telemetry ||
                      !explanation.trim() ||
                      capture.isPending ||
                      capturing ||
                      waiting ||
                      (data.snapshots?.length ?? 0) >= 8
                    }
                    onClick={() =>
                      void captureSnapshot(
                        graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]") ??
                          null,
                      )
                    }
                  >
                    <Camera aria-hidden="true" className="mr-1 size-3" /> Capture evidence snapshot
                  </Button>
                  {downloadError && (
                    <p className="text-[11px] text-rose-300">{downloadError.message}</p>
                  )}
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {data.snapshots?.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[10.5px]"
                      >
                        <p className="text-slate-300">
                          {new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.explanation}
                        </p>
                        <p className="break-all font-mono text-slate-500">{snapshot.digest}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => void downloadSnapshot(snapshot.id)}
                        >
                          Download evidence
                        </Button>
                      </div>
                    ))}
                    {!data.snapshots?.length && (
                      <p className="text-[11px] text-slate-500">
                        No snapshots captured in this session.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="w-[320px] shrink-0 overflow-x-hidden overflow-y-auto border-l border-slate-800 bg-[#0a0f18] p-2.5">
          <LiveSandboxParity
            data={data}
            selected={selected}
            busy={busy}
            onSelect={studio.setService}
            onCommand={send}
            sections={["inspector", "hardware", "resilience", "load", "config"]}
            compact
            label="Live inspector"
          />
        </aside>
      </div>
    </div>
  );
}
