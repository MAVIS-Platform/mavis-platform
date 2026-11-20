"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Sparkles,
  Square,
  Target,
  Trash2,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import type { Response } from "@/lib/api/contracts";
import {
  StudioObservability,
  serializeStudioGraph,
  type StudioQuickAction,
} from "./studio-observability";
import { startStudioRecording } from "./studio-recording";
import {
  StudioEvidenceReplay,
  StudioVideo,
  deleteStudioEvidence,
  downloadStudioEvidence,
  loadStudioEvidence,
  storeStudioEvidence,
  type EvidenceFrame,
} from "./studio-evidence";
import {
  LiveSandboxParity,
  summarizeServiceStats,
  type LiveBlockAuthoringControls,
  type StudioSetupPanel,
} from "./live-sandbox-parity";
import { useStudioSession } from "./use-studio-session";

type LiveRuntimeReplay = {
  id: string;
  sessionId: string;
  kind: "LIVE_REPLAY";
  capturedAt: string;
  explanation: string;
  digest: string;
  frame: EvidenceFrame;
  replay: EvidenceFrame[];
  video?: Blob;
  durationMs?: number;
};

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
  hasVerifiedSession?: boolean | undefined;
  publishHref?: string | undefined;
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
  onSetReplicaTarget?: ((service: string, count: number) => void) | undefined;
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

const BOOTING_STATUSES = new Set([
  "PENDING",
  "STARTING",
  "QUEUED",
  "PROVISIONING",
  "READY_FOR_DISPATCH",
  "READY_FOR_EXECUTION",
  "ALLOCATED",
  "DISPATCHED",
]);

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
  standalone,
  standaloneHeader,
  previewTopology,
  previewModelId,
  previewServiceMappings,
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
  standalone?: boolean | undefined;
  standaloneHeader?: { left?: ReactNode; right?: ReactNode } | undefined;
  previewTopology?: Studio["topology"] | undefined;
  previewModelId?: string | undefined;
  previewServiceMappings?: Record<string, string> | undefined;
  authoring?: LiveStudioAuthoringProps | undefined;
}) {
  const startHref = projectId
    ? `/sessions?${new URLSearchParams({ project: projectId, studio: "1" })}`
    : "/sessions?studio=1";
  const activeSessionId = authoring ? sessionId : sessionId || sessions[0]?.id || "";
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

  const isTerminalAuthorSession =
    Boolean(authoring) &&
    Boolean(liveData) &&
    (liveData!.executionStatus === "CANCELLED" || liveData!.executionStatus === "FAILED");
  const isPreviewMode =
    !activeSessionId ||
    !liveData ||
    isTerminalAuthorSession ||
    (liveData.services.length === 0 && !liveData.topology);
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
      ...(projectId ? { projectId } : {}),
      ...(previewModelId ? { modelVersionId: previewModelId } : {}),
      ...(previewServiceMappings ? { serviceMappings: previewServiceMappings } : {}),
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
  }, [
    isPreviewMode,
    liveData,
    effectivePreviewTopology,
    projectId,
    previewModelId,
    previewServiceMappings,
  ]);

  const services = liveServices.length > 0 ? liveServices : data.services;
  const canvasSelected = services.includes(studio.service) ? studio.service : "";
  const selected = canvasSelected || target || services[0] || "";
  const graphRef = useRef<HTMLDivElement>(null);
  const snapshotNoteRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"stats" | "telemetry" | "logs" | "snapshots">("telemetry");
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [leftWidth, setLeftWidth] = useState(268);
  const [rightWidth, setRightWidth] = useState(288);
  const [bottomHeight, setBottomHeight] = useState(232);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [resizingAxis, setResizingAxis] = useState<"left" | "right" | "bottom" | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dockExpanded = !bottomCollapsed && bottomHeight >= 320;

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  function startResize(
    axis: "left" | "right" | "bottom",
    startEvent: ReactPointerEvent<HTMLDivElement>,
  ) {
    startEvent.preventDefault();
    resizeCleanupRef.current?.();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const initialLeft = showLeft ? leftWidth : 0;
    const initialRight = showRight ? rightWidth : 0;
    const initialBottom = bottomCollapsed ? 36 : bottomHeight;

    setResizingAxis(axis);
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "bottom" ? "row-resize" : "col-resize";

    function onPointerMove(moveEvent: PointerEvent) {
      if (axis === "left") {
        const raw = initialLeft + (moveEvent.clientX - startX);
        if (raw < 90) {
          setShowLeft(false);
        } else {
          setShowLeft(true);
          setLeftWidth(Math.max(180, Math.min(560, Math.round(raw))));
        }
      } else if (axis === "right") {
        const raw = initialRight - (moveEvent.clientX - startX);
        if (raw < 110) {
          setShowRight(false);
        } else {
          setShowRight(true);
          setRightWidth(Math.max(220, Math.min(560, Math.round(raw))));
        }
      } else {
        const raw = initialBottom - (moveEvent.clientY - startY);
        if (raw < 72) {
          setBottomCollapsed(true);
        } else {
          setBottomCollapsed(false);
          setBottomHeight(Math.max(100, Math.min(540, Math.round(raw))));
        }
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setResizingAxis(null);
      resizeCleanupRef.current = null;
    }

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }
  const [setupPanel, setSetupPanel] = useState<StudioSetupPanel>(() =>
    authoring ? "presets" : "service",
  );
  const [missionDraft, setMissionDraft] = useState(authoring?.instructions ?? "");
  const [baselineDraft, setBaselineDraft] = useState(authoring?.baselinePath ?? "/health");
  const [maxErrDraft, setMaxErrDraft] = useState(authoring?.maxErrorRatePercent ?? "0");
  const [replicaSvcDraft, setReplicaSvcDraft] = useState(authoring?.replicaService ?? "");
  const [replicaCountDraft, setReplicaCountDraft] = useState(authoring?.replicaCount ?? "");

  // Runtime replay recording (step-by-step timeline + optional canvas video proof)
  const [liveReplays, setLiveReplays] = useState<LiveRuntimeReplay[]>([]);
  const [recordingSteps, setRecordingSteps] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savingReplay, setSavingReplay] = useState(false);
  const [replayError, setReplayError] = useState("");
  const replayCaptureRef = useRef<{
    started: number;
    frames: EvidenceFrame[];
    lastActionCount: number;
  } | null>(null);
  const videoRecorderRef = useRef<ReturnType<typeof startStudioRecording> | null>(null);

  useEffect(() => {
    let active = true;
    void loadStudioEvidence<LiveRuntimeReplay>()
      .then((items) => {
        if (!active) return;
        setLiveReplays(
          items.filter(
            (item) =>
              item &&
              item.kind === "LIVE_REPLAY" &&
              (!activeSessionId || item.sessionId === activeSessionId),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!recordingSteps) return;
    const started = replayCaptureRef.current?.started ?? performance.now();
    const timer = window.setInterval(
      () => setRecordingSeconds(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recordingSteps > 0]);

  useEffect(
    () => () => {
      void videoRecorderRef.current?.stop();
    },
    [],
  );

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
        return;
      }
      if (command.action === "SCALE" && command.replicas && command.replicas >= 1 && command.replicas <= 8) {
        authoring.onSetReplicaTarget?.(command.service, command.replicas);
      }
      return;
    }
    if (command.action === "SCALE") {
      if (!canScaleFor(command.service)) return;
      if (command.replicas === undefined || command.replicas < 1 || command.replicas > 8) return;
    }
    void send(command.action, command.service, command.replicas);
  }

  async function dispatchCommand(
    actionType: StudioQuickAction["action"],
    serviceName: string,
    replicas?: number,
  ) {
    if (isPreviewMode && authoring) {
      quickAction({
        action: actionType,
        service: serviceName,
        ...(replicas !== undefined ? { replicas } : {}),
      });
      return;
    }
    await send(actionType, serviceName, replicas);
  }

  function scaleTo(service: string, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 8 || !canScaleFor(service)) return;
    void send("SCALE", service, value);
  }

  const captureLiveReplayFrame = useCallback(
    (label: string, elapsedMs = 0): EvidenceFrame | null => {
      const svg = graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
      if (!svg) return null;
      const reqCount = Number(lastConfirmed?.result?.metricsAfter?.["requestCount"] ?? 0);
      const errRate = Number(lastConfirmed?.result?.metricsAfter?.["errorRatePercent"] ?? 0);
      const p95 = Number(lastConfirmed?.result?.metricsAfter?.["p95LatencyMs"] ?? NaN);
      const dropped = Number.isFinite(reqCount) && Number.isFinite(errRate)
        ? Math.round((reqCount * errRate) / 100)
        : 0;
      const handled = Math.max(0, Math.round(reqCount) - dropped);
      const nodes = blocks.map((block) => {
        const rep = runningFor(data, block.service) ?? 0;
        const obs = data.telemetry?.services.find((s) => s.service === block.service);
        const stats = summarizeServiceStats(obs?.stats);
        return {
          id: block.service,
          name: block.label || block.service,
          type: "SERVICE_CONTAINER",
          replicas: rep,
          demandRps: handled + dropped,
          capacityRps: rep,
          droppedRps: rep === 0 ? Math.max(1, dropped) : 0,
          p95Ms: Number.isFinite(p95) ? Number(p95.toFixed(1)) : null,
          configuration: {
            status: rep === 0 ? "STOPPED" : "RUNNING",
            cpu: stats.cpu,
            memory: stats.memory,
            canScale: block.canScale,
          },
        };
      });
      const connections = (data.telemetry?.interactions ?? []).map((edge) => ({
        from: edge.fromService,
        to: edge.toService,
        protocol: "OTEL_TRACE",
      }));
      return {
        elapsedMs,
        label,
        svg: serializeStudioGraph(svg),
        totals: {
          pods: totalRunningReplicas,
          demandRps: handled + dropped,
          handledRps: handled,
          droppedRps: dropped,
        },
        nodes,
        connections,
      };
    },
    [blocks, data, lastConfirmed, totalRunningReplicas],
  );

  // Auto-record a checkpoint frame whenever a confirmed Docker action completes while recording
  useEffect(() => {
    const rec = replayCaptureRef.current;
    if (!rec) return;
    if (confirmedActions.length <= rec.lastActionCount) return;
    rec.lastActionCount = confirmedActions.length;
    if (rec.frames.length >= 39) return;
    const latest = confirmedActions[confirmedActions.length - 1];
    const label = latest
      ? `${latest.action} ${latest.service}${latest.replicas ? ` → ${latest.replicas}×` : ""}`
      : "Confirmed live action";
    const frame = captureLiveReplayFrame(label, performance.now() - rec.started);
    if (frame) {
      rec.frames.push(frame);
      setRecordingSteps(rec.frames.length);
    }
  }, [confirmedActions, captureLiveReplayFrame]);

  function startLiveReplayRecording() {
    setReplayError("");
    const frame = captureLiveReplayFrame("Initial live state", 0);
    if (!frame) {
      setReplayError("Render the live topology canvas before starting a replay recording.");
      return;
    }
    const svg = graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    if (svg) {
      try {
        videoRecorderRef.current = startStudioRecording(svg);
      } catch {
        // Fallback cleanly to frame-by-frame interactive replay when MediaRecorder is unavailable
        videoRecorderRef.current = null;
      }
    }
    setRecordingSeconds(0);
    replayCaptureRef.current = {
      started: performance.now(),
      frames: [frame],
      lastActionCount: confirmedActions.length,
    };
    setRecordingSteps(1);
  }

  function addLiveReplayCheckpoint() {
    const rec = replayCaptureRef.current;
    if (!rec || rec.frames.length >= 39) return;
    const frame = captureLiveReplayFrame(
      `Checkpoint #${rec.frames.length + 1}`,
      performance.now() - rec.started,
    );
    if (frame) {
      rec.frames.push(frame);
      setRecordingSteps(rec.frames.length);
    }
  }

  async function stopAndSaveLiveReplay() {
    const rec = replayCaptureRef.current;
    if (!rec) return;
    setSavingReplay(true);
    setReplayError("");
    try {
      const elapsed = performance.now() - rec.started;
      const finalFrame =
        captureLiveReplayFrame("Final live state", elapsed) ?? rec.frames[rec.frames.length - 1]!;
      const frames = [...rec.frames, finalFrame];
      const video = await videoRecorderRef.current?.stop().catch(() => undefined);
      videoRecorderRef.current = null;
      const digestBytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ sessionId: activeSessionId, frames })),
      );
      const digest =
        "sha256:" +
        Array.from(new Uint8Array(digestBytes), (b) => b.toString(16).padStart(2, "0")).join("");
      const saved: LiveRuntimeReplay = {
        id: crypto.randomUUID(),
        sessionId: activeSessionId,
        kind: "LIVE_REPLAY",
        capturedAt: new Date().toISOString(),
        explanation:
          explanation.trim() ||
          `Live runtime replay · ${frames.length} steps · ${totalRunningReplicas} pods`,
        digest,
        frame: finalFrame,
        replay: frames,
        ...(video ? { video: video.blob, durationMs: video.durationMs } : { durationMs: elapsed }),
      };
      await storeStudioEvidence(saved).catch(() => undefined);
      setLiveReplays((prev) => [saved, ...prev]);
      replayCaptureRef.current = null;
      setRecordingSteps(0);
      setRecordingSeconds(0);
      setTab("snapshots");
    } catch (cause) {
      setReplayError(cause instanceof Error ? cause.message : "Could not save runtime replay.");
    } finally {
      setSavingReplay(false);
    }
  }

  async function removeLiveReplay(id: string) {
    await deleteStudioEvidence(id).catch(() => undefined);
    setLiveReplays((prev) => prev.filter((item) => item.id !== id));
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

  const isBooting = Boolean(
    starting || BOOTING_STATUSES.has(data.executionStatus.toUpperCase()),
  );
  const lastSessionFailed = data.executionStatus === "FAILED" || liveData?.executionStatus === "FAILED";

  const presetTargets = useMemo(() => {
    const isStateful = (name: string) =>
      /postgres|mysql|mariadb|mongo|redis|kafka|rabbit|zookeeper|elastic|minio|db\b/.test(
        name.toLowerCase(),
      );
    const stateless = blocks.filter(
      (b) => !isStateful(b.service) && !/gateway|edge|proxy/i.test(b.service),
    );
    const primaryScale =
      stateless[0]?.service ??
      blocks.find((b) => !isStateful(b.service))?.service ??
      blocks[0]?.service ??
      "";
    const faultTarget =
      stateless[1]?.service ??
      stateless[0]?.service ??
      blocks[blocks.length - 1]?.service ??
      "";
    return { primaryScale, faultTarget };
  }, [blocks]);

  const activePreset = useMemo(() => {
    if (!authoring) return null;
    const stopped = authoring.initialStoppedServices;
    const hasScale = Boolean(authoring.replicaService && Number(authoring.replicaCount) >= 2);
    if (stopped.length === 0 && !hasScale) return "healthy";
    if (stopped.length === 1 && !hasScale) return "outage";
    if (stopped.length === 0 && hasScale) return "scale";
    if (stopped.length >= 1 && hasScale) return "chaos-scale";
    return "custom";
  }, [authoring]);

  const missionDirty = Boolean(
    authoring &&
      (missionDraft !== authoring.instructions ||
        baselineDraft !== authoring.baselinePath ||
        maxErrDraft !== authoring.maxErrorRatePercent ||
        replicaSvcDraft !== authoring.replicaService ||
        replicaCountDraft !== authoring.replicaCount),
  );
  const missionReady = Boolean(
    authoring && authoring.instructions.trim().length > 0 && authoring.baselinePath.trim().length > 0 && !missionDirty,
  );

  const probeSuggestions = useMemo(() => {
    const names = blocks.map((b) => b.service.toLowerCase());
    const hasGateway = names.some((n) => n.includes("gateway") || n.includes("edge"));
    const hasOrders = names.some((n) => n.includes("order"));
    const items: string[] = [];
    if (hasGateway && hasOrders) items.push("/api/gateway/orders");
    else if (hasOrders) items.push("/api/orders");
    items.push("/health");
    return Array.from(new Set(items));
  }, [blocks]);

  const checklist = authoring
    ? ([
        ["1. Pick Scenario / Initial Faults", blocks.length > 0],
        ["2. Save Student Mission & Pass Target", missionReady],
        [
          "3. Optional: Test-Run Live Docker",
          data.executionStatus === "RUNNING" || Boolean(authoring.hasVerifiedSession),
        ],
        ["4. Return & Publish in Step 6", Boolean(authoring.publishHref)],
      ] as const)
    : ([
        ["Step 1: Capture baseline snapshot", (data.snapshots?.length ?? 0) >= 1],
        ["Step 2: Scale replicas or inject fault", hasConfirmedAction],
        ["Step 3: Capture post-change snapshot & compare", (data.snapshots?.length ?? 0) >= 2],
        [
          "Step 4: Finish Studio & seal HMAC receipt",
          data.executionStatus === "COMPLETED" || Boolean(data.receiptDigest),
        ],
      ] as const);

  const statusTone =
    data.executionStatus === "RUNNING"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : isBooting
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
      : isBooting
        ? "BOOTING"
        : data.executionStatus === "COMPLETED"
          ? "SEALED"
          : data.executionStatus === "FAILED"
            ? "FAILED"
            : isPreviewMode && effectivePreviewTopology
              ? authoring
                ? "LAB SETUP"
                : "PREVIEW"
              : "IDLE";

  const showLiveSessionControls = !authoring || !isPreviewMode || isBooting;

  return (
    <div
      data-testid="live-workbench"
      className={
        expanded
          ? "fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-[#070b12] text-slate-100"
          : "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#070b12] text-slate-100"
      }
    >
      {/* Single Unified Top Studio Bar */}
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0b101b] px-3 py-1.5">
        {standaloneHeader?.left && (
          <>
            {standaloneHeader.left}
            <span className="h-4 w-px shrink-0 bg-slate-800" aria-hidden="true" />
          </>
        )}

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusTone}`}
        >
          <span
            className={`size-1.5 rounded-full ${
              data.executionStatus === "RUNNING"
                ? "animate-pulse bg-emerald-400"
                : isBooting
                  ? "animate-pulse bg-sky-400"
                  : data.executionStatus === "FAILED"
                    ? "bg-rose-400"
                    : "bg-slate-400"
            }`}
            aria-hidden="true"
          />
          {statusLabel}
        </span>

        {(!authoring || !isPreviewMode || isBooting) && (
          <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
            <select
              aria-label="Select active or recent runtime session"
              value={activeSessionId}
              onChange={(event) => onSelectSession(event.target.value)}
              className="h-7 w-36 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100"
            >
              {authoring && <option value="">Design Preview</option>}
              {sessions.length > 0 ? (
                sessions.map((session) => {
                  const displayStatus =
                    session.id === activeSessionId && liveData?.executionStatus
                      ? liveData.executionStatus
                      : (session.executionStatus ?? "SESSION");
                  return (
                    <option key={session.id} value={session.id}>
                      {session.id.slice(0, 8)} · {displayStatus}
                    </option>
                  );
                })
              ) : (
                !authoring && <option value="">No live sessions</option>
              )}
            </select>
          </label>
        )}

        {data.executionStatus !== "RUNNING" &&
          (onStartSession ? (
            <Button
              type="button"
              size="sm"
              className={`h-7 px-2.5 text-[11px] ${
                authoring
                  ? "border border-emerald-500/45 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:border-sky-500/40 disabled:bg-sky-900/70 disabled:text-sky-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-sky-900/70 disabled:text-sky-200"
              }`}
              disabled={isBooting}
              onClick={onStartSession}
            >
              {isBooting ? (
                <RefreshCw aria-hidden="true" className="mr-1 size-3 animate-spin" />
              ) : (
                <Play aria-hidden="true" className="mr-1 size-3" />
              )}
              {isBooting
                ? `${authoring ? "Booting Docker" : "Booting Docker"} (${data.executionStatus === "NOT_STARTED" ? "STARTING" : data.executionStatus})…`
                : authoring
                  ? "Test Live Docker"
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {authoring && authoring.saved && !missionDirty && (
            <span className="hidden items-center gap-1 text-[10.5px] font-medium text-emerald-400 lg:inline-flex">
              <Check aria-hidden="true" className="size-3" /> Saved
            </span>
          )}

          {authoring && data.executionStatus === "RUNNING" && (
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

          {showLiveSessionControls && (
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
                    graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]") ??
                      null,
                  );
                } else {
                  requestAnimationFrame(() => snapshotNoteRef.current?.focus());
                }
              }}
            >
              <Camera aria-hidden="true" className="mr-1 size-3.5" />
              Snapshot
            </Button>
          )}
          {recordingSteps > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingReplay}
              onClick={() => void stopAndSaveLiveReplay()}
              className="h-7 border-rose-500/50 bg-rose-500/15 px-2 font-mono text-[10.5px] text-rose-200 hover:bg-rose-500/25"
            >
              <span className="mr-1.5 size-1.5 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />
              REC {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
              {String(recordingSeconds % 60).padStart(2, "0")} · {recordingSteps}
            </Button>
          )}
          {showLiveSessionControls && (
            <>
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
                disabled={cancel.isPending || (data.executionStatus !== "RUNNING" && !isBooting)}
                onClick={() => void cancelStudio()}
              >
                Cancel
              </Button>
            </>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={showLeft}
            aria-label="Toggle blocks sidebar"
            title={showLeft ? "Hide Blocks sidebar" : "Show Blocks sidebar"}
            onClick={() => setShowLeft((value) => !value)}
            className={`h-7 px-1.5 text-[11px] hover:bg-slate-800 hover:text-white ${
              showLeft ? "text-slate-200" : "text-slate-500"
            }`}
          >
            <PanelLeft aria-hidden="true" className="size-3.5" />
            {!standalone && <span className="ml-1">Blocks</span>}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={showRight}
            aria-label="Toggle inspector sidebar"
            title={showRight ? "Hide Setup / Inspector sidebar" : "Show Setup / Inspector sidebar"}
            onClick={() => setShowRight((value) => !value)}
            className={`h-7 px-1.5 text-[11px] hover:bg-slate-800 hover:text-white ${
              showRight ? "text-slate-200" : "text-slate-500"
            }`}
          >
            <PanelRight aria-hidden="true" className="size-3.5" />
            {!standalone && <span className="ml-1">Inspector</span>}
          </Button>

          {standaloneHeader?.right}

          {!standalone && (
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
          )}
        </div>
      </div>

      {isBooting && !mutationError && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b border-sky-500/30 bg-sky-950/35 px-3 py-1.5 text-[11px] text-sky-200"
        >
          <RefreshCw aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-sky-300" />
          <span>
            Provisioning real Docker containers on Runner ({data.executionStatus === "NOT_STARTED" ? "STARTING" : data.executionStatus}) — live telemetry, traces and Start/Stop/Scale controls activate automatically once containers pass health checks (~15–45s).
          </span>
        </div>
      )}

      {(mutationError || lastSessionFailed) && (
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

      {/* Main 3-Column IDE Layout: Full-Height Resizable Left Blocks | Center (Canvas + Resizable Bottom Dock) | Full-Height Resizable Right Setup */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showLeft && (
          <aside
            style={{
              width: leftWidth,
              scrollbarWidth: "thin",
              scrollbarColor: "#334155 #0b101b",
            }}
            className="h-full shrink-0 overflow-x-hidden overflow-y-auto bg-[#0b101b] p-2.5"
          >
            <LiveSandboxParity
              data={data}
              selected={canvasSelected}
              busy={isPreviewMode ? false : busy}
              onSelect={(svc) => {
                studio.setService(svc);
                if (svc) setSetupPanel("service");
              }}
              onCommand={dispatchCommand}
              sections={["library"]}
              compact
              label="Live block library"
              authoring={authoring}
              activeSetupPanel={setupPanel}
              onSelectSetupPanel={(panel) => {
                setSetupPanel(panel);
                setShowRight(true);
              }}
            />
          </aside>
        )}

        {/* LEFT RESIZE SPLITTER */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize blocks panel"
          aria-valuenow={showLeft ? leftWidth : 0}
          aria-valuemin={180}
          aria-valuemax={560}
          title="Drag left/right to resize Blocks panel (double-click to collapse/expand)"
          onPointerDown={(event) => startResize("left", event)}
          onDoubleClick={() => setShowLeft((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setShowLeft(true);
              setLeftWidth((w) => Math.min(560, w + 16));
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              setLeftWidth((w) => Math.max(180, w - 16));
            }
          }}
          className={`group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-800 bg-slate-950 transition-colors hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
            resizingAxis === "left" ? "bg-sky-500/35" : ""
          }`}
        >
          <div
            className={`h-10 w-0.5 rounded-full transition-colors ${
              resizingAxis === "left"
                ? "bg-sky-400"
                : "bg-slate-700 group-hover:bg-sky-400"
            }`}
          />
        </div>

        {/* Center Column: Interactive 3D/2D Canvas + Strictly Bounded Resizable Bottom Telemetry Dock */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#070b12]">
          <div ref={graphRef} className="relative min-h-[160px] min-w-0 flex-1 overflow-hidden p-2.5">
            {isPreviewMode && effectivePreviewTopology && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10">
                <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 text-[10.5px] text-slate-300 shadow-lg backdrop-blur-sm">
                  <span className="size-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true" />
                  <span>
                    {authoring
                      ? "Preview · Select a block or drag tools onto nodes"
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
                selected={canvasSelected}
                onSelect={(svc) => {
                  studio.setService(svc);
                  if (svc) setSetupPanel("service");
                }}
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
                    <Button type="button" size="sm" disabled={isBooting} onClick={onStartSession}>
                      {isBooting ? "Starting Studio session…" : "Start Studio Live session"}
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

          {/* BOTTOM RESIZE SPLITTER */}
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Resize telemetry dock"
            aria-valuenow={bottomCollapsed ? 36 : bottomHeight}
            aria-valuemin={100}
            aria-valuemax={540}
            title="Drag up/down to resize Telemetry dock (double-click to collapse/expand)"
            onPointerDown={(event) => startResize("bottom", event)}
            onDoubleClick={() => setBottomCollapsed((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setBottomCollapsed(false);
                setBottomHeight((h) => Math.min(540, h + 20));
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setBottomHeight((h) => Math.max(100, h - 20));
              }
            }}
            className={`group relative flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-slate-800 bg-slate-950 transition-colors hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
              resizingAxis === "bottom" ? "bg-sky-500/35" : ""
            }`}
          >
            <div
              className={`h-0.5 w-10 rounded-full transition-colors ${
                resizingAxis === "bottom"
                  ? "bg-sky-400"
                  : "bg-slate-700 group-hover:bg-sky-400"
              }`}
            />
          </div>

          {/* Bottom Telemetry, Logs & Snapshots Dock — aligned strictly inside the center column */}
          <div
            style={{ height: bottomCollapsed ? 36 : bottomHeight }}
            className={`flex min-w-0 shrink-0 flex-col overflow-hidden bg-[#0b101b] ${
              resizingAxis === "bottom" ? "" : "transition-[height] duration-150"
            }`}
          >
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 px-2.5">
              {(
                [
                  ["stats", "Stats", "Stats"],
                  [
                    "telemetry",
                    `Telemetry (${data.services.length})`,
                    `Service Telemetry & Impact (${data.services.length})`,
                  ],
                  [
                    "logs",
                    `Logs & Traces (${data.telemetry?.spans.length ?? 0})`,
                    `Logs & Traces (${data.telemetry?.spans.length ?? 0})`,
                  ],
                  [
                    "snapshots",
                    `Snapshots & Replay (${(data.snapshots?.length ?? 0) + liveReplays.length})`,
                    `Snapshots & Replay (${(data.snapshots?.length ?? 0) + liveReplays.length})`,
                  ],
                ] as const
              ).map(([id, label, ariaLabel]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={ariaLabel}
                  onClick={() => {
                    setTab(id);
                    setBottomCollapsed(false);
                  }}
                  className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ${
                    tab === id
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 text-[10px] text-slate-500">
                <span className="hidden whitespace-nowrap rounded-full border border-slate-800 bg-slate-950/70 px-2 py-0.5 font-mono text-slate-300 2xl:inline-flex">
                  {data.finishRequested
                    ? "Finishing"
                    : waiting
                      ? "Waiting for Runner"
                      : statusLabel}
                </span>
                {data.telemetry?.observedAt && (
                  <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap xl:inline-flex">
                    <RefreshCw aria-hidden="true" className="size-3" />
                    {new Date(data.telemetry.observedAt).toLocaleTimeString()}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={dockExpanded ? "Collapse telemetry dock" : "Expand telemetry dock"}
                  title={dockExpanded ? "Collapse dock" : "Expand dock"}
                  onClick={() => {
                    if (bottomCollapsed) {
                      setBottomCollapsed(false);
                      setBottomHeight(232);
                    } else {
                      setBottomHeight(dockExpanded ? 232 : 400);
                    }
                  }}
                  className="grid size-6 shrink-0 place-items-center rounded border border-slate-800 bg-slate-950/70 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-100"
                >
                  {dockExpanded ? (
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  ) : (
                    <ChevronUp aria-hidden="true" className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
            {!bottomCollapsed && (
            <div
              style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 #0b101b" }}
              className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-2.5"
            >
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
                        const derivedStatus =
                          span.spanStatus && span.spanStatus !== "UNSET"
                            ? span.spanStatus
                            : typeof span.httpStatusCode === "number"
                              ? span.httpStatusCode >= 400
                                ? "ERROR"
                                : "OK"
                              : "OK";
                        const isErr = derivedStatus.toUpperCase() === "ERROR";
                        return (
                          <tr key={span.spanId} className="border-t border-slate-800/70">
                            <td className="px-1 py-0.5 text-slate-200">{span.runtimeService}</td>
                            <td className="max-w-[200px] truncate px-1 py-0.5 text-slate-300">
                              {span.operationName ||
                                (span.httpStatusCode ? `HTTP ${span.httpStatusCode}` : "Trace span")}
                            </td>
                            <td className="px-1 py-0.5 text-slate-300">
                              {span.httpStatusCode ?? "—"}
                            </td>
                            <td
                              className={`px-1 py-0.5 ${isErr ? "text-rose-300" : "text-emerald-300"}`}
                            >
                              {derivedStatus}
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
              {!authoring && data.actions.length === 0 && !isPreviewMode && (
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

                {recordingSteps === 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPreviewMode || data.executionStatus !== "RUNNING" || savingReplay}
                    onClick={startLiveReplayRecording}
                    className="h-8 border-sky-500/45 bg-sky-500/10 px-2.5 text-[11px] text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
                  >
                    <Video aria-hidden="true" className="mr-1.5 size-3.5" />
                    Record runtime replay
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingReplay}
                      onClick={addLiveReplayCheckpoint}
                      className="h-8 border-slate-600 bg-slate-900 px-2.5 text-[11px] text-slate-200 hover:bg-slate-800"
                    >
                      <Plus aria-hidden="true" className="mr-1 size-3" />
                      Add checkpoint ({recordingSteps})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingReplay}
                      onClick={() => void stopAndSaveLiveReplay()}
                      className="h-8 bg-rose-600 px-2.5 text-[11px] text-white hover:bg-rose-500"
                    >
                      <Square aria-hidden="true" className="mr-1.5 size-3 fill-current" />
                      {savingReplay
                        ? "Saving replay…"
                        : `Stop & save replay (${recordingSeconds}s)`}
                    </Button>
                  </>
                )}

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
              {(downloadError || replayError) && (
                <p className="text-[11px] text-rose-300">
                  {downloadError?.message ?? replayError}
                </p>
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
              {liveReplays.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                    Recorded Runtime Replays ({liveReplays.length})
                  </p>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {liveReplays.map((replayItem) => (
                      <div
                        key={replayItem.id}
                        className="space-y-2 rounded-lg border border-sky-500/30 bg-slate-950/75 p-2.5 text-[10.5px]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-200">{replayItem.explanation}</p>
                            <p className="text-[10px] text-slate-400">
                              {new Date(replayItem.capturedAt).toLocaleString()} ·{" "}
                              {replayItem.replay.length} frames
                              {replayItem.durationMs
                                ? ` · ${(replayItem.durationMs / 1000).toFixed(1)}s`
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeLiveReplay(replayItem.id)}
                            aria-label="Delete runtime replay"
                            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                        {replayItem.video && replayItem.video.size > 0 && (
                          <StudioVideo
                            blob={replayItem.video}
                            durationMs={replayItem.durationMs ?? 0}
                            posterSvg={replayItem.frame.svg}
                          />
                        )}
                        <StudioEvidenceReplay frames={replayItem.replay} />
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-1.5">
                          <span className="truncate font-mono text-[9.5px] text-slate-500">
                            {replayItem.digest.slice(0, 26)}…
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 border-sky-500/40 bg-sky-500/10 px-2 text-[10px] text-sky-200 hover:bg-sky-500/20"
                            onClick={() => downloadStudioEvidence(replayItem)}
                          >
                            Download Replay HTML
                          </Button>
                        </div>
                      </div>
                    ))}
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
                {!data.snapshots?.length && liveReplays.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    No snapshots or runtime replays captured in this session yet.
                  </p>
                )}
              </div>
            </div>
          )}
            </div>
            )}
          </div>
        </div>

        {/* RIGHT RESIZE SPLITTER */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize inspector panel"
          aria-valuenow={showRight ? rightWidth : 0}
          aria-valuemin={220}
          aria-valuemax={560}
          title="Drag left/right to resize Inspector panel (double-click to collapse/expand)"
          onPointerDown={(event) => startResize("right", event)}
          onDoubleClick={() => setShowRight((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setShowRight(true);
              setRightWidth((w) => Math.min(560, w + 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setRightWidth((w) => Math.max(220, w - 16));
            }
          }}
          className={`group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-800 bg-slate-950 transition-colors hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
            resizingAxis === "right" ? "bg-sky-500/35" : ""
          }`}
        >
          <div
            className={`h-10 w-0.5 rounded-full transition-colors ${
              resizingAxis === "right"
                ? "bg-sky-400"
                : "bg-slate-700 group-hover:bg-sky-400"
            }`}
          />
        </div>

        {/* Full-Height Right Setup & Inspector Panel (Context-sensitive to Left Block / Function) */}
        {showRight && (
          <aside
            style={{
              width: rightWidth,
              scrollbarWidth: "thin",
              scrollbarColor: "#334155 #0a0f18",
            }}
            className="h-full shrink-0 overflow-x-hidden overflow-y-auto bg-[#0a0f18] p-2.5"
          >
            {authoring && (
              <div
                role="tablist"
                aria-label="Lecturer setup panel tabs"
                className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/90 p-1"
              >
                {(
                  [
                    ["presets", "1. Scenario"],
                    ["mission", missionDirty ? "2. Mission *" : "2. Mission"],
                    ["service", "3. Block"],
                  ] as const
                ).map(([id, tabLabel]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={setupPanel === id}
                    onClick={() => setSetupPanel(id)}
                    className={`rounded-md px-1.5 py-1 text-[10.5px] font-semibold transition-colors ${
                      setupPanel === id
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
            )}

            {setupPanel === "mission" && authoring ? (
              <section aria-label="Mission setup" className="space-y-3 text-xs">
                <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 font-semibold text-slate-100">
                  <Target aria-hidden="true" className="size-3.5 text-sky-400" />
                  <span>Mission &amp; Pass Criteria</span>
                </div>

                <label className="block space-y-1 text-[11px] text-slate-400">
                  <span>Student Mission</span>
                  <Textarea
                    value={missionDraft}
                    onChange={(e) => setMissionDraft(e.target.value)}
                    className="min-h-20 border-slate-700 bg-slate-950 text-xs text-slate-100"
                  />
                </label>

                <div className="space-y-1.5">
                  <label className="block space-y-1 text-[11px] text-slate-400">
                    <span>Baseline Probe GET Path</span>
                    <Input
                      value={baselineDraft}
                      onChange={(e) => setBaselineDraft(e.target.value)}
                      placeholder="/api/gateway/orders"
                      className="h-8 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {probeSuggestions.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setBaselineDraft(path)}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                          baselineDraft === path
                            ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1 text-[11px] text-slate-400">
                    <span>Max Error %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={maxErrDraft}
                      onChange={(e) => setMaxErrDraft(e.target.value)}
                      placeholder="0"
                      className="h-8 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <label className="block space-y-1 text-[11px] text-slate-400">
                    <span>Min Replicas</span>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={replicaCountDraft}
                      onChange={(e) => setReplicaCountDraft(e.target.value)}
                      placeholder="2"
                      className="h-8 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100"
                    />
                  </label>
                </div>

                <label className="block space-y-1 text-[11px] text-slate-400">
                  <span>Target Scale Service</span>
                  <select
                    value={replicaSvcDraft}
                    onChange={(e) => setReplicaSvcDraft(e.target.value)}
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 font-mono text-xs text-slate-100"
                  >
                    <option value="">None</option>
                    {blocks.map((b) => (
                      <option key={b.service} value={b.service}>
                        {b.service}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Live Student Preview */}
                <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/75 p-2 text-[10.5px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Student Will Receive
                  </p>
                  <p className="text-slate-300">
                    Initial Faults:{" "}
                    <code className="font-mono text-amber-300">
                      {authoring.initialStoppedServices.length > 0
                        ? authoring.initialStoppedServices.join(", ")
                        : "None (all start Up)"}
                    </code>
                  </p>
                  <p className="text-slate-300">
                    Pass Target:{" "}
                    <code className="font-mono text-emerald-300">
                      ≤{maxErrDraft || "0"}% err
                      {replicaSvcDraft && Number(replicaCountDraft) >= 2
                        ? ` · ${replicaSvcDraft} ≥${replicaCountDraft}×`
                        : ""}
                    </code>
                  </p>
                  <p className="text-slate-300">
                    Probe:{" "}
                    <code className="font-mono text-sky-300">GET {baselineDraft || "/health"}</code>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {authoring.saved && !missionDirty ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <Check aria-hidden="true" className="size-3.5" /> Saved
                    </span>
                  ) : (
                    <span
                      className={`text-[10.5px] ${missionDirty ? "text-amber-300" : "text-slate-500"}`}
                    >
                      {missionDirty ? "Unsaved changes" : "Applies immediately to Lab"}
                    </span>
                  )}
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
                    className={`h-8 px-3 text-xs text-white ${
                      missionDirty
                        ? "bg-amber-600 hover:bg-amber-500"
                        : "bg-teal-600 hover:bg-teal-500"
                    }`}
                  >
                    <Save aria-hidden="true" className="mr-1.5 size-3.5" />
                    {authoring.saving
                      ? "Saving…"
                      : missionDirty
                        ? "Save Mission *"
                        : "Save Mission"}
                  </Button>
                </div>
              </section>
            ) : setupPanel === "presets" && authoring?.onApplyPreset ? (
              <section aria-label="Lab Exercise Presets setup" className="space-y-3 text-xs">
                <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 font-semibold text-slate-100">
                  <Zap aria-hidden="true" className="size-3.5 text-amber-400" />
                  <span>Step 1 · Pick Lab Scenario</span>
                </div>

                <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[10.5px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Active Config ({blocks.length} services)
                  </p>
                  <p className="text-slate-300">
                    Starts Down:{" "}
                    <code className="font-mono text-amber-300">
                      {authoring.initialStoppedServices.length > 0
                        ? authoring.initialStoppedServices.join(", ")
                        : "None"}
                    </code>
                  </p>
                  <p className="text-slate-300">
                    Scale Target:{" "}
                    <code className="font-mono text-sky-300">
                      {authoring.replicaService && Number(authoring.replicaCount) >= 2
                        ? `${authoring.replicaService} ≥ ${authoring.replicaCount}×`
                        : "Any (observe only)"}
                    </code>
                  </p>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-400">
                  Pick a 1-click scenario for this repo, or click any 3D service block to customize.
                </p>

                <div className="space-y-2">
                  {(
                    [
                      [
                        "outage",
                        "Outage Recovery",
                        presetTargets.faultTarget
                          ? `Starts ${presetTargets.faultTarget} Down · students recover it to 0% error.`
                          : "Marks 1 core service as Starts Down and requires 0% error rate after recovery.",
                        "border-amber-500/35 bg-amber-500/10 hover:border-amber-400",
                      ],
                      [
                        "scale",
                        "Horizontal Scale ×2",
                        presetTargets.primaryScale
                          ? `All Up · students scale ${presetTargets.primaryScale} to ≥ 2 replicas.`
                          : "Enables scaling on the primary stateless service and targets ≥ 2 replicas.",
                        "border-sky-500/35 bg-sky-500/10 hover:border-sky-400",
                      ],
                      [
                        "chaos-scale",
                        "Fault + Scale Drill",
                        presetTargets.faultTarget && presetTargets.primaryScale
                          ? `Stops ${presetTargets.faultTarget} + scales ${presetTargets.primaryScale} to ≥ 2×.`
                          : "Combines 1 stopped dependency with scaling the primary service to 2 pods.",
                        "border-purple-500/35 bg-purple-500/10 hover:border-purple-400",
                      ],
                      [
                        "healthy",
                        "Healthy Baseline",
                        `All ${blocks.length} services Start Up · students inspect traces & baseline metrics.`,
                        "border-slate-700 bg-slate-950/70 hover:border-slate-500",
                      ],
                    ] as const
                  ).map(([id, title, desc, tone]) => {
                    const isActive = activePreset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={authoring.busy}
                        onClick={() => authoring.onApplyPreset?.(id)}
                        className={`w-full rounded-lg border p-2.5 text-left transition-colors disabled:opacity-40 ${tone} ${
                          isActive ? "ring-1 ring-emerald-400/70" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11.5px] font-semibold text-slate-100">{title}</p>
                          {isActive && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-emerald-300">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{desc}</p>
                      </button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSetupPanel("mission")}
                  className="h-8 w-full border-sky-500/40 bg-sky-500/10 text-[11px] text-sky-200 hover:bg-sky-500/20"
                >
                  Next: Step 2 Mission &amp; Pass Target
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-3.5" />
                </Button>
              </section>
            ) : setupPanel === "drills" && !authoring && data.executionStatus === "RUNNING" ? (
              <section aria-label="Quick Live Drills setup" className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                    <RotateCcw aria-hidden="true" className="size-3.5 text-emerald-400" />
                    <span>Quick Live Drills</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSetupPanel("service")}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    Service Setup
                  </button>
                </div>
                {(() => {
                  const stoppedBlock = blocks.find((b) => runningFor(data, b.service) === 0);
                  const scalableBlock =
                    blocks.find(
                      (b) =>
                        b.service === selected &&
                        b.canScale &&
                        (runningFor(data, b.service) ?? 0) > 0,
                    ) ??
                    blocks.find((b) => b.canScale && (runningFor(data, b.service) ?? 0) > 0);
                  const stoppableBlock =
                    blocks.find(
                      (b) => b.service === selected && (runningFor(data, b.service) ?? 0) > 0,
                    ) ??
                    blocks.find(
                      (b) =>
                        !/gateway|edge|postgres|db|kafka/.test(b.service.toLowerCase()) &&
                        (runningFor(data, b.service) ?? 0) > 0,
                    );
                  return (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={busy || !stoppableBlock}
                        onClick={() =>
                          stoppableBlock && void dispatchCommand("STOP", stoppableBlock.service)
                        }
                        className="w-full rounded-lg border border-rose-500/35 bg-rose-500/10 p-2.5 text-left transition-colors hover:border-rose-400 disabled:opacity-40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-rose-200">Inject Service Fault</span>
                          <code className="font-mono text-[10px] text-rose-300">
                            {stoppableBlock?.service ?? "—"}
                          </code>
                        </div>
                        <p className="mt-1 text-[10.5px] text-slate-400">
                          Stops the running Docker container to observe real error propagation.
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={busy || !scalableBlock}
                        onClick={() =>
                          scalableBlock && void dispatchCommand("SCALE", scalableBlock.service, 2)
                        }
                        className="w-full rounded-lg border border-sky-500/35 bg-sky-500/10 p-2.5 text-left transition-colors hover:border-sky-400 disabled:opacity-40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sky-200">Scale Out ×2 Pods</span>
                          <code className="font-mono text-[10px] text-sky-300">
                            {scalableBlock?.service ?? "—"}
                          </code>
                        </div>
                        <p className="mt-1 text-[10.5px] text-slate-400">
                          Scales the service to 2 real replicas to compare p95 latency.
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={busy || !stoppedBlock}
                        onClick={() =>
                          stoppedBlock && void dispatchCommand("START", stoppedBlock.service)
                        }
                        className="w-full rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2.5 text-left transition-colors hover:border-emerald-400 disabled:opacity-40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-emerald-200">Recover Stopped</span>
                          <code className="font-mono text-[10px] text-emerald-300">
                            {stoppedBlock?.service ?? "All up"}
                          </code>
                        </div>
                        <p className="mt-1 text-[10.5px] text-slate-400">
                          Restarts a stopped container and restores cluster health.
                        </p>
                      </button>
                    </div>
                  );
                })()}
              </section>
            ) : (
              <LiveSandboxParity
                data={data}
                selected={selected}
                busy={isPreviewMode ? false : busy}
                onSelect={(svc) => {
                  studio.setService(svc);
                  setSetupPanel("service");
                }}
                onCommand={dispatchCommand}
                sections={["inspector", "hardware", "resilience", "load"]}
                compact
                label="Live inspector"
                authoring={authoring}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
