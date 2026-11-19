"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, Camera, PanelLeft, PanelRight, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import type { Response } from "@/lib/api/contracts";
import { StudioObservability, type StudioQuickAction } from "./studio-observability";
import { LiveSandboxParity, summarizeServiceStats } from "./live-sandbox-parity";
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
  projectId,
  projectName,
  onSelectSession,
  onSwitchToSandbox,
  onStartSession,
  starting,
  hideSwitchToSandbox,
}: {
  sessions: readonly SessionOption[];
  sessionId: string;
  projectId?: string | undefined;
  projectName?: string | undefined;
  onSelectSession: (id: string) => void;
  onSwitchToSandbox?: (() => void) | undefined;
  onStartSession?: (() => void) | undefined;
  starting?: boolean | undefined;
  hideSwitchToSandbox?: boolean | undefined;
}) {
  const startHref = projectId
    ? `/sessions?${new URLSearchParams({ project: projectId, studio: "1" })}`
    : "/sessions?studio=1";
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
    actionError,
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
  const [tab, setTab] = useState<"stats" | "telemetry" | "logs" | "snapshots">("telemetry");
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);

  const confirmedActions = data.actions.filter((item) => item.status === "CONFIRMED" && item.result);
  const firstConfirmed = confirmedActions[0];
  const lastConfirmed = confirmedActions[confirmedActions.length - 1];
  const totalRunningReplicas = data.services.reduce(
    (sum, service) => sum + (runningFor(data, service) ?? 0),
    0,
  );
  const mutationError =
    actionError?.message ??
    (finish.error ? (finish.error instanceof Error ? finish.error.message : String(finish.error)) : null) ??
    (cancel.error ? (cancel.error instanceof Error ? cancel.error.message : String(cancel.error)) : null) ??
    (capture.error ? (capture.error instanceof Error ? capture.error.message : String(capture.error)) : null) ??
    downloadError?.message ??
    null;

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
    <div
      data-testid="live-workbench"
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#070b12] text-slate-100"
    >
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
        {onStartSession ? (
          <Button type="button" size="sm" disabled={starting} onClick={onStartSession}>
            {starting
              ? "Starting Studio session…"
              : projectName
                ? `Start ${projectName}`
                : "Start Studio session"}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href={startHref}>
              {projectName ? `Prepare and start ${projectName}` : "Prepare and start Live project"}
            </Link>
          </Button>
        )}
        {!hideSwitchToSandbox && onSwitchToSandbox && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={onSwitchToSandbox}
          >
            Switch to Sandbox
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={showLeft}
            aria-label="Toggle blocks sidebar"
            onClick={() => setShowLeft((value) => !value)}
            className="h-7 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <PanelLeft aria-hidden="true" className="mr-1 size-3.5" />
            Blocks
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={showRight}
            aria-label="Toggle inspector sidebar"
            onClick={() => setShowRight((value) => !value)}
            className="h-7 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <PanelRight aria-hidden="true" className="mr-1 size-3.5" />
            Inspector
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
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
            className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            disabled={cancel.isPending || data.executionStatus !== "RUNNING"}
            onClick={() => void cancelStudio()}
          >
            Cancel
          </Button>
        </div>
      </div>

      {(mutationError || data.executionStatus === "FAILED") && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-[11px] text-rose-200"
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 text-rose-300" />
          <span className="font-medium">
            {mutationError ??
              "Studio Live session failed on Runner. Cancel or start a fresh session, or check Logs & Traces."}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showLeft && (
          <aside className="w-[228px] shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-800 bg-[#0b101b] p-2">
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
        )}

        <div ref={graphRef} className="relative min-h-[300px] min-w-0 flex-1 bg-[#070b12] p-2.5">
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
                {...(configuredEdges && configuredEdges.length > 0 ? { configuredEdges } : {})}
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
                  {onStartSession ? (
                    <Button type="button" size="sm" disabled={starting} onClick={onStartSession}>
                      {starting ? "Starting Studio session…" : "Start Studio Live session"}
                    </Button>
                  ) : (
                    <Button asChild size="sm">
                      <Link href={startHref}>
                        {projectName
                          ? `Prepare and start ${projectName}`
                          : "Prepare and start Live project"}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {showRight && (
            <aside className="w-[260px] shrink-0 overflow-x-hidden overflow-y-auto border-l border-slate-800 bg-[#0a0f18] p-2">
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
          )}
        </div>

        <div className="h-[236px] shrink-0 border-t border-slate-800 bg-[#0b101b]">
          <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-slate-800 px-2">
            {(
              [
                ["stats", "Stats"],
                ["telemetry", `Service Telemetry & Impact (${data.services.length})`],
                ["logs", `Logs & Traces (${data.telemetry?.spans.length ?? 0})`],
                ["snapshots", `Snapshots (${data.snapshots?.length ?? 0})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-[11px] font-semibold ${
                  tab === id
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-[10px] text-slate-500">
              <span className="whitespace-nowrap rounded-full border border-slate-800 bg-slate-950/70 px-2 py-0.5 font-mono text-slate-300">
                {data.finishRequested
                  ? "Finishing"
                  : waiting
                    ? "Waiting for Runner"
                    : data.executionStatus}
                {" · "}
                {data.cleanupStatus}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
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
                  <div className="mavis-tabular grid grid-cols-2 gap-1.5 text-[10.5px] sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["Running replicas", String(totalRunningReplicas)],
                      [
                        "Last requests",
                        lastConfirmed?.result
                          ? metric(lastConfirmed.result.metricsAfter["requestCount"])
                          : "—",
                      ],
                      [
                        "Last p95",
                        lastConfirmed?.result
                          ? `${metric(lastConfirmed.result.metricsAfter["p95LatencyMs"])} ms`
                          : "—",
                      ],
                      [
                        "Error rate",
                        lastConfirmed?.result
                          ? `${metric(lastConfirmed.result.metricsAfter["errorRatePercent"])}%`
                          : "—",
                      ],
                      ["Observed spans", String(data.telemetry?.spans.length ?? 0)],
                      ["Confirmed actions", String(confirmedActions.length)],
                    ].map(([kpiLabel, kpiValue]) => (
                      <div
                        key={kpiLabel}
                        className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1"
                      >
                        <p className="truncate text-[10px] text-slate-400">{kpiLabel}</p>
                        <p className="mt-0.5 font-mono font-semibold text-slate-100">{kpiValue}</p>
                      </div>
                    ))}
                  </div>
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
                            <span className="mavis-tabular ml-2 font-mono text-slate-400">
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
                      <th className="px-1 py-1">CPU total</th>
                      <th className="px-1 py-1">RAM total</th>
                      <th className="px-1 py-1">p95</th>
                      <th className="px-1 py-1">Replicas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((service) => {
                      const telemetry = data.telemetry?.services.find(
                        (item) => item.service === service,
                      );
                      const agg = summarizeServiceStats(telemetry?.stats);
                      const running = runningFor(data, service);
                      const result = lastResultFor(data, service);
                      const scale = canScaleFor(service);
                      return (
                        <tr key={service} className="border-t border-slate-800/80">
                          <td className="px-1 py-1 font-mono text-slate-200">
                            {service}
                            {agg.containers > 1 && (
                              <span className="ml-1.5 text-[10px] text-slate-500">
                                ({agg.containers} pods)
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-1 py-1 font-semibold ${running === 0 ? "text-rose-300" : running === undefined ? "text-slate-400" : "text-emerald-300"}`}
                          >
                            {running === undefined ? "Waiting" : running === 0 ? "Down" : "Running"}
                          </td>
                          <td className="mavis-tabular px-1 py-1 font-mono text-slate-300">
                            {agg.cpu}
                          </td>
                          <td className="mavis-tabular px-1 py-1 font-mono text-slate-300">
                            {agg.memory}
                          </td>
                          <td className="mavis-tabular px-1 py-1 font-mono text-slate-300">
                            {result ? `${metric(result.metricsAfter["p95LatencyMs"])} ms` : "—"}
                          </td>
                          <td className="mavis-tabular px-1 py-1 font-mono text-slate-300">
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
                        </tr>
                      );
                    })}
                    {data.services.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-1 py-3 text-center text-slate-500">
                          Select a Live session to see real telemetry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "logs" && (
                <div className="space-y-2 text-[11px]">
                  {(data.telemetry?.spans.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Observed Spans ({data.telemetry?.spans.length})
                      </p>
                      <table className="mavis-tabular w-full text-left font-mono text-[10.5px]">
                        <thead className="text-[10px] text-slate-500">
                          <tr>
                            <th className="px-1 py-0.5">Service</th>
                            <th className="px-1 py-0.5">Operation</th>
                            <th className="px-1 py-0.5">HTTP</th>
                            <th className="px-1 py-0.5">Status</th>
                            <th className="px-1 py-0.5">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.telemetry?.spans.slice(0, 25).map((span) => {
                            const ns = span.durationNanoseconds
                              ? Number(span.durationNanoseconds)
                              : NaN;
                            const durationMs = Number.isFinite(ns)
                              ? `${(ns / 1e6).toFixed(1)} ms`
                              : "—";
                            return (
                              <tr key={span.spanId} className="border-t border-slate-800/70">
                                <td className="px-1 py-0.5 text-slate-200">{span.runtimeService}</td>
                                <td className="max-w-[200px] truncate px-1 py-0.5 text-slate-300">
                                  {span.operationName ?? "—"}
                                </td>
                                <td className="px-1 py-0.5 text-slate-300">
                                  {span.httpStatusCode ?? "—"}
                                </td>
                                <td
                                  className={`px-1 py-0.5 ${span.spanStatus === "ERROR" ? "text-rose-300" : "text-emerald-300"}`}
                                >
                                  {span.spanStatus ?? "—"}
                                </td>
                                <td className="px-1 py-0.5 text-slate-400">{durationMs}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(data.telemetry?.services.filter((s) => s.logs?.trim()).length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Service Logs
                      </p>
                      {data.telemetry?.services
                        .filter((item) => item.logs?.trim())
                        .map((item) => (
                          <div
                            key={item.service}
                            className="rounded border border-slate-800 bg-slate-950/60 p-1.5"
                          >
                            <p className="mb-1 font-mono text-[10px] font-semibold text-slate-300">
                              {item.service}
                            </p>
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-slate-950/80 p-1.5 font-mono text-[10px] text-slate-300">
                              {item.logs}
                            </pre>
                          </div>
                        ))}
                    </div>
                  )}
                  {(data.telemetry?.spans.length ?? 0) === 0 &&
                    (data.telemetry?.services.filter((s) => s.logs?.trim()).length ?? 0) === 0 && (
                      <p className="py-3 text-center text-slate-500">
                        No observed spans or service logs captured yet.
                      </p>
                    )}
                  {(data.telemetry?.warnings?.length ?? 0) > 0 && (
                    <p className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-slate-400">
                      Telemetry notes: {data.telemetry?.warnings?.join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {tab === "snapshots" && (
                <div className="space-y-2">
                  {data.actions.length === 0 && (
                    <p
                      role="note"
                      className="rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200"
                    >
                      BR-08 (INCOMPLETE_SCENARIO guard): Execute at least one Start, Stop, or Scale
                      action on a live service before sealing your signed receipt.
                    </p>
                  )}
                  {data.receiptDigest && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
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
                  {firstConfirmed?.result && lastConfirmed?.result && (
                    <div className="mavis-tabular rounded border border-slate-800 bg-slate-950/70 p-2 text-[10.5px]">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Before vs After Confirmed Metrics
                      </p>
                      <div className="grid grid-cols-2 gap-2 font-mono sm:grid-cols-4">
                        <div>
                          <span className="block text-[10px] text-slate-500">Requests</span>
                          <span className="text-slate-200">
                            {metric(firstConfirmed.result.metricsBefore["requestCount"])} →{" "}
                            {metric(lastConfirmed.result.metricsAfter["requestCount"])}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">p95 latency</span>
                          <span className="text-slate-200">
                            {metric(firstConfirmed.result.metricsBefore["p95LatencyMs"])} ms →{" "}
                            {metric(lastConfirmed.result.metricsAfter["p95LatencyMs"])} ms
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Error rate</span>
                          <span className="text-slate-200">
                            {metric(firstConfirmed.result.metricsBefore["errorRatePercent"])}% →{" "}
                            {metric(lastConfirmed.result.metricsAfter["errorRatePercent"])}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Replicas delta</span>
                          <span className="text-slate-200">
                            {firstConfirmed.result.service}: {firstConfirmed.result.replicasBefore}{" "}
                            → {lastConfirmed.result.service}: {lastConfirmed.result.replicasAfter}
                          </span>
                        </div>
                      </div>
                    </div>
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
                          className="mt-1 border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
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
  );
}
