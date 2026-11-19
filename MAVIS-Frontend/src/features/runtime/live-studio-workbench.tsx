"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Play,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import type { Response } from "@/lib/api/contracts";
import { StudioObservability, type StudioQuickAction } from "./studio-observability";
import {
  LiveSandboxParity,
  summarizeServiceStats,
  type LiveBlockAuthoringControls,
} from "./live-sandbox-parity";
import { useStudioSession } from "./use-studio-session";

type Studio = Response<"studioState">;
type SessionOption = {
  id: string;
  scenarioName?: string | null;
  executionStatus?: string | null;
};

export type LiveStudioAuthoringProps = LiveBlockAuthoringControls & {
  instructions: string;
  baselinePath: string;
  maxErrorRatePercent: string;
  replicaService: string;
  replicaCount: string;
  saving?: boolean | undefined;
  saved?: boolean | undefined;
  error?: string | undefined;
  onSaveMission: (patch: {
    instructions: string;
    baselinePath: string;
    maxErrorRatePercent: string;
    replicaService: string;
    replicaCount: string;
  }) => void;
  onCaptureCanvasState: (captured: {
    stoppedServices: string[];
    stoppedControllers: string[];
    minReplicas: Array<{ service: string; count: number }>;
  }) => void;
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
  previewTopology,
  authoring,
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
  previewTopology?: Studio["topology"] | undefined;
  authoring?: LiveStudioAuthoringProps | undefined;
}) {
  const startHref = projectId
    ? `/sessions?${new URLSearchParams({ project: projectId, studio: "1" })}`
    : "/sessions?studio=1";
  const activeSessionId = sessionId || sessions[0]?.id || "";
  const studio = useStudioSession(activeSessionId);
  const {
    state,
    data: liveData,
    services: liveServices,
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

  const isPreviewMode = !liveData || (liveData.services.length === 0 && !liveData.topology);
  const effectivePreviewTopology = useMemo<Studio["topology"] | undefined>(() => {
    if (!previewTopology) return undefined;
    if (!authoring) return previewTopology;
    return {
      ...previewTopology,
      blocks: previewTopology.blocks.map((block) => ({
        ...block,
        canScale: authoring.scalableServices.includes(block.service),
        initiallyStopped: authoring.initialStoppedServices.includes(block.service),
      })),
      connections: previewTopology.connections.map((conn) => ({
        ...conn,
        initiallyStopped: authoring.initialStoppedControllers.includes(conn.controllerService),
      })),
    };
  }, [previewTopology, authoring]);

  const data: Studio = useMemo(() => {
    if (!isPreviewMode && liveData) return liveData;
    if (!effectivePreviewTopology) return EMPTY_STUDIO;
    const previewServices = [
      ...effectivePreviewTopology.blocks.map((b) => b.service),
      ...effectivePreviewTopology.connections.map((c) => c.controllerService),
    ];
    return {
      ...EMPTY_STUDIO,
      services: previewServices,
      topology: effectivePreviewTopology,
      telemetry: {
        observedAt: "",
        services: previewServices.map((svc) => {
          const stopped =
            effectivePreviewTopology.blocks.find((b) => b.service === svc)?.initiallyStopped ||
            effectivePreviewTopology.connections.find((c) => c.controllerService === svc)
              ?.initiallyStopped;
          return {
            service: svc,
            replicas: stopped ? 0 : 1,
            runningReplicas: stopped ? 0 : 1,
            stats: [],
            logs: "",
          };
        }),
        spans: [],
        interactions: [],
      },
    };
  }, [isPreviewMode, liveData, effectivePreviewTopology]);

  const services = liveServices.length > 0 ? liveServices : data.services;
  const selected = target || services[0] || "";
  const graphRef = useRef<HTMLDivElement>(null);
  const snapshotNoteRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"stats" | "telemetry" | "logs" | "snapshots">("telemetry");
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showMissionDrawer, setShowMissionDrawer] = useState(false);
  const [missionDraft, setMissionDraft] = useState(authoring?.instructions ?? "");
  const [baselineDraft, setBaselineDraft] = useState(authoring?.baselinePath ?? "/health");
  const [maxErrDraft, setMaxErrDraft] = useState(authoring?.maxErrorRatePercent ?? "0");
  const [replicaSvcDraft, setReplicaSvcDraft] = useState(authoring?.replicaService ?? "");
  const [replicaCountDraft, setReplicaCountDraft] = useState(authoring?.replicaCount ?? "");

  useEffect(() => {
    if (!authoring) return;
    setMissionDraft(authoring.instructions);
    setBaselineDraft(authoring.baselinePath);
    setMaxErrDraft(authoring.maxErrorRatePercent);
    setReplicaSvcDraft(authoring.replicaService);
    setReplicaCountDraft(authoring.replicaCount);
  }, [
    authoring?.instructions,
    authoring?.baselinePath,
    authoring?.maxErrorRatePercent,
    authoring?.replicaService,
    authoring?.replicaCount,
  ]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

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
    authoring?.error ??
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
    if (isPreviewMode && authoring) {
      if (authoring.initialStoppedControllers.includes(link.controllerService)) {
        authoring.onToggleInitialStopped(link.controllerService, true);
      }
      return;
    }
    const running = runningFor(data, link.controllerService);
    if (running === 0) void send("START", link.controllerService);
  }

  function disconnect(from: string, to: string) {
    const link = data.topology?.connections.find((item) => item.from === from && item.to === to);
    if (!link) return;
    if (isPreviewMode && authoring) {
      if (!authoring.initialStoppedControllers.includes(link.controllerService)) {
        authoring.onToggleInitialStopped(link.controllerService, true);
      }
      return;
    }
    if ((runningFor(data, link.controllerService) ?? 0) > 0)
      void send("STOP", link.controllerService);
  }

  function quickAction(command: StudioQuickAction) {
    if (isPreviewMode && authoring) {
      if (command.action === "STOP" || command.action === "START") {
        const isStopped = authoring.initialStoppedServices.includes(command.service);
        if ((command.action === "STOP" && !isStopped) || (command.action === "START" && isStopped)) {
          authoring.onToggleInitialStopped(command.service, false);
        }
      }
      return;
    }
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

  function buildAutoObservationNote() {
    const runningBlocks = blocks.filter((b) => (runningFor(data, b.service) ?? 0) > 0).length;
    const parts: string[] = [
      `${runningBlocks}/${blocks.length || data.services.length} services running (${totalRunningReplicas} pods)`,
    ];
    if (lastConfirmed) {
      parts.push(
        `latest action: ${lastConfirmed.action} ${lastConfirmed.service}${lastConfirmed.replicas ? ` → ${lastConfirmed.replicas}` : ""}`,
      );
    }
    if (lastConfirmed?.result) {
      const p95 = metric(lastConfirmed.result.metricsAfter["p95LatencyMs"]);
      const err = metric(lastConfirmed.result.metricsAfter["errorRatePercent"]);
      if (p95 !== "—") parts.push(`p95 ${p95} ms`);
      if (err !== "—") parts.push(`${err}% errors`);
    }
    setExplanation(parts.join(" · "));
  }

  function captureLiveCanvasAsExercise() {
    if (!authoring) return;
    const controllerSet = new Set((data.topology?.connections ?? []).map((c) => c.controllerService));
    const stoppedServices: string[] = [];
    const stoppedControllers: string[] = [];
    const minReplicas: Array<{ service: string; count: number }> = [];
    for (const block of blocks) {
      const r = runningFor(data, block.service);
      if (r === 0) stoppedServices.push(block.service);
      else if (r !== undefined && r >= 2) minReplicas.push({ service: block.service, count: r });
    }
    for (const ctrl of controllerSet) {
      if (runningFor(data, ctrl) === 0) stoppedControllers.push(ctrl);
    }
    authoring.onCaptureCanvasState({ stoppedServices, stoppedControllers, minReplicas });
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

  const statusTone =
    data.executionStatus === "RUNNING"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : starting || data.executionStatus === "PENDING" || data.executionStatus === "STARTING"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : data.executionStatus === "COMPLETED"
          ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
          : data.executionStatus === "FAILED"
            ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
            : "border-slate-700 bg-slate-900 text-slate-300";

  const statusLabel =
    data.executionStatus === "RUNNING"
      ? waiting
        ? "APPLYING"
        : "LIVE"
      : starting || data.executionStatus === "PENDING" || data.executionStatus === "STARTING"
        ? "BOOTING"
        : data.executionStatus === "COMPLETED"
          ? "SEALED"
          : data.executionStatus === "FAILED"
            ? "FAILED"
            : isPreviewMode && effectivePreviewTopology
              ? "PREVIEW"
              : "IDLE";

  return (
    <div
      data-testid="live-workbench"
      className={
        expanded
          ? "fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-[#070b12] text-slate-100"
          : "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#070b12] text-slate-100"
      }
    >
      {/* Top Command Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0b101b] px-3 py-2 pr-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusTone}`}
        >
          <span
            className={`size-1.5 rounded-full ${
              data.executionStatus === "RUNNING"
                ? "animate-pulse bg-emerald-400"
                : starting
                  ? "animate-pulse bg-sky-400"
                  : data.executionStatus === "FAILED"
                    ? "bg-rose-400"
                    : "bg-slate-400"
            }`}
            aria-hidden="true"
          />
          {statusLabel}
        </span>

        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
          <select
            aria-label="Select active or recent runtime session"
            value={activeSessionId}
            onChange={(event) => onSelectSession(event.target.value)}
            className="h-7 w-40 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100"
          >
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.id.slice(0, 8)} · {session.executionStatus ?? "SESSION"}
                </option>
              ))
            ) : (
              <option value="">No live sessions</option>
            )}
          </select>
        </label>

        {data.executionStatus !== "RUNNING" &&
          (onStartSession ? (
            <Button
              type="button"
              size="sm"
              className="h-7 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-500"
              disabled={starting}
              onClick={onStartSession}
            >
              <Play aria-hidden="true" className="mr-1 size-3" />
              {starting
                ? "Starting Docker…"
                : projectName
                  ? `Start ${projectName}`
                  : "Start Live Docker"}
            </Button>
          ) : (
            <Button asChild size="sm" className="h-7 px-2.5 text-[11px]">
              <Link href={startHref}>
                {projectName ? `Prepare and start ${projectName}` : "Prepare and start Live project"}
              </Link>
            </Button>
          ))}

        {!hideSwitchToSandbox && onSwitchToSandbox && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={onSwitchToSandbox}
          >
            Switch to Sandbox
          </Button>
        )}

        {/* Inline Live Telemetry Pill */}
        {data.executionStatus === "RUNNING" && (
          <div className="hidden items-center gap-2 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-slate-300 xl:flex">
            <span>{totalRunningReplicas} pods</span>
            {lastConfirmed?.result && (
              <>
                <span className="text-slate-600">·</span>
                <span>p95 {metric(lastConfirmed.result.metricsAfter["p95LatencyMs"])}ms</span>
                <span className="text-slate-600">·</span>
                <span
                  className={
                    Number(lastConfirmed.result.metricsAfter["errorRatePercent"] ?? 0) > 0
                      ? "text-rose-300"
                      : "text-emerald-300"
                  }
                >
                  err {metric(lastConfirmed.result.metricsAfter["errorRatePercent"])}%
                </span>
              </>
            )}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {authoring && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowMissionDrawer((v) => !v)}
                className={`h-7 px-2 text-[11px] ${
                  showMissionDrawer
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Target aria-hidden="true" className="mr-1 size-3.5" />
                Mission
              </Button>
              {data.executionStatus === "RUNNING" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={authoring.saving}
                  onClick={captureLiveCanvasAsExercise}
                  title="Save currently stopped services and scaled replicas on the canvas as the Lab exercise"
                  className="h-7 border-teal-500/40 bg-teal-500/10 px-2 text-[11px] text-teal-200 hover:bg-teal-500/20"
                >
                  <Save aria-hidden="true" className="mr-1 size-3" />
                  {authoring.saving ? "Saving…" : "Save Canvas State"}
                </Button>
              )}
            </>
          )}

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
            variant="outline"
            className="h-7 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            disabled={
              data.executionStatus !== "RUNNING" ||
              !data.telemetry ||
              capturing ||
              capture.isPending ||
              (data.snapshots?.length ?? 0) >= 8
            }
            onClick={() => {
              setTab("snapshots");
              if (explanation.trim() && !waiting) {
                void captureSnapshot(
                  graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]") ?? null,
                );
              } else {
                requestAnimationFrame(() => snapshotNoteRef.current?.focus());
              }
            }}
          >
            <Camera aria-hidden="true" className="mr-1 size-3.5" />
            Snapshot
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
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
            className="h-7 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            disabled={cancel.isPending || data.executionStatus !== "RUNNING"}
            onClick={() => void cancelStudio()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={expanded ? "Exit fullscreen Studio Live" : "Expand Studio Live fullscreen"}
            title={expanded ? "Exit fullscreen (Esc)" : "Expand fullscreen"}
            onClick={() => setExpanded((value) => !value)}
            className="h-7 px-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {expanded ? (
              <Minimize2 aria-hidden="true" className="size-3.5" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Inline Visual Mission Drawer (Teacher Authoring directly inside Studio Live) */}
      {authoring && showMissionDrawer && (
        <div className="border-b border-slate-800 bg-[#0d1422] px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="font-semibold text-slate-100">
              Lab Exercise Mission &amp; Pass Target
            </span>
            <div className="flex items-center gap-2">
              {authoring.saved && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <Check aria-hidden="true" className="size-3" /> Saved
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowMissionDrawer(false)}
                aria-label="Close mission panel"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]">
            <label className="space-y-1 text-[11px] text-slate-400">
              <span>Student Mission</span>
              <Textarea
                value={missionDraft}
                onChange={(e) => setMissionDraft(e.target.value)}
                placeholder="e.g. Start stopped services, scale order-service to 2 pods, capture Before/After snapshots."
                className="min-h-14 border-slate-700 bg-slate-950 text-xs text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-slate-400">
                <span>Probe GET Path</span>
                <Input
                  value={baselineDraft}
                  onChange={(e) => setBaselineDraft(e.target.value)}
                  placeholder="/api/gateway/orders"
                  className="h-7 border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-100"
                />
              </label>
              <label className="space-y-1 text-[11px] text-slate-400">
                <span>Max Error %</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={maxErrDraft}
                  onChange={(e) => setMaxErrDraft(e.target.value)}
                  placeholder="0"
                  className="h-7 border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-100"
                />
              </label>
              <label className="space-y-1 text-[11px] text-slate-400">
                <span>Scale Service</span>
                <select
                  value={replicaSvcDraft}
                  onChange={(e) => setReplicaSvcDraft(e.target.value)}
                  className="h-7 w-full rounded border border-slate-700 bg-slate-950 px-1.5 font-mono text-[11px] text-slate-100"
                >
                  <option value="">None</option>
                  {blocks.map((b) => (
                    <option key={b.service} value={b.service}>
                      {b.service}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[11px] text-slate-400">
                <span>Min Replicas</span>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={replicaCountDraft}
                  onChange={(e) => setReplicaCountDraft(e.target.value)}
                  placeholder="2"
                  className="h-7 border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-100"
                />
              </label>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                disabled={authoring.saving}
                onClick={() =>
                  authoring.onSaveMission({
                    instructions: missionDraft,
                    baselinePath: baselineDraft,
                    maxErrorRatePercent: maxErrDraft,
                    replicaService: replicaSvcDraft,
                    replicaCount: replicaCountDraft,
                  })
                }
                className="h-8 bg-teal-600 px-3 text-xs text-white hover:bg-teal-500"
              >
                <Save aria-hidden="true" className="mr-1.5 size-3.5" />
                {authoring.saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Main 3-Zone Visual Canvas */}
      <div className="flex min-h-0 flex-1">
        {showLeft && (
          <aside className="w-[232px] shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-800 bg-[#0b101b] p-2">
            <LiveSandboxParity
              data={data}
              selected={selected}
              busy={busy}
              onSelect={studio.setService}
              onCommand={send}
              sections={["library"]}
              compact
              label="Live block library"
              authoring={authoring}
            />
          </aside>
        )}

        <div ref={graphRef} className="relative min-h-[300px] min-w-0 flex-1 bg-[#070b12] p-2.5">
          {isPreviewMode && effectivePreviewTopology && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 text-[10.5px] text-slate-300 shadow-lg backdrop-blur-sm">
                <span className="size-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true" />
                <span>
                  {authoring
                    ? "Preview · Toggle faults or Start Live Docker"
                    : "Preview · Click Start Live Docker"}
                </span>
              </div>
            </div>
          )}

          {state.isError ? (
            <ErrorState error={state.error} onRetry={() => void state.refetch()} />
          ) : data.services.length > 0 || data.topology ? (
            <StudioObservability
              data={data}
              selected={selected}
              onSelect={studio.setService}
              busy={isPreviewMode ? false : busy}
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
              <div className="max-w-md space-y-2.5">
                <Server aria-hidden="true" className="mx-auto size-8 text-slate-500" />
                <p className="text-sm font-semibold text-slate-100">
                  No live Docker session selected
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
          <aside className="w-[252px] shrink-0 overflow-x-hidden overflow-y-auto border-l border-slate-800 bg-[#0a0f18] p-2">
            <LiveSandboxParity
              data={data}
              selected={selected}
              busy={busy}
              onSelect={studio.setService}
              onCommand={send}
              sections={["inspector", "hardware", "resilience", "load"]}
              compact
              label="Live inspector"
            />
          </aside>
        )}
      </div>

      {/* Bottom Telemetry, Logs & Snapshots Drawer */}
      <div className="h-[224px] shrink-0 border-t border-slate-800 bg-[#0b101b]">
        <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-slate-800 px-2.5 pr-4">
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
                : "No telemetry"}
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
                        className={`px-1 py-1 font-semibold ${
                          isPreviewMode
                            ? running === 0
                              ? "text-amber-300"
                              : "text-sky-300"
                            : running === 0
                              ? "text-rose-300"
                              : running === undefined
                                ? "text-slate-400"
                                : "text-emerald-300"
                        }`}
                      >
                        {isPreviewMode
                          ? running === 0
                            ? "Starts Down"
                            : "Prepared"
                          : running === undefined
                            ? "Waiting"
                            : running === 0
                              ? "Down"
                              : "Running"}
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
                      Start a Live session to observe container telemetry.
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
              {data.actions.length === 0 && !isPreviewMode && (
                <p
                  role="note"
                  className="rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200"
                >
                  BR-08 (INCOMPLETE_SCENARIO guard): Execute at least one Start, Stop, or Scale action on a live service before
                  sealing your signed receipt.
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
                  ref={snapshotNoteRef}
                  value={explanation}
                  maxLength={4000}
                  placeholder="Describe what you observed (e.g. Scaled payment to 2 pods — p95 stayed 55 ms, 0% errors)…"
                  onChange={(event) => setExplanation(event.target.value)}
                  className="mt-1 min-h-12 bg-slate-950 text-[11px]"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isPreviewMode ||
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
                {!isPreviewMode && data.telemetry && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={buildAutoObservationNote}
                    className="h-8 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <Sparkles aria-hidden="true" className="mr-1 size-3" />
                    Auto-fill summary
                  </Button>
                )}
              </div>
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
