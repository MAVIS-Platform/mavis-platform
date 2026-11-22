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
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Lightbulb,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Target,
  Terminal,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";
import {
  StudioObservability,
  captureStudioImage,
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
import { LiveTerminalConsole } from "./live-terminal-console";
import { StudioRedCharts } from "./studio-red-charts";
import { StudioExercisePanel } from "./studio-exercise-panel";
import { resolveRunningReplicas, useStudioSession } from "./use-studio-session";

type LiveRuntimeReplay = {
  id: string;
  sessionId: string;
  kind: "LIVE_REPLAY" | "LIVE_SCREENSHOT";
  capturedAt: string;
  explanation: string;
  digest: string;
  frame: EvidenceFrame;
  replay: EvidenceFrame[];
  imageData?: string;
  video?: Blob;
  durationMs?: number;
};

type RuntimeFlowSummary = {
  from: string;
  to: string;
  operation: string;
  httpStatus: number | null;
  avgMs: number | null;
  count: number;
  hasError: boolean;
  observed: boolean;
  label: string;
};

function summarizeRuntimeFlows(data: Studio): RuntimeFlowSummary[] {
  const interactions = data.telemetry?.interactions ?? [];
  if (interactions.length > 0) {
    const spanMap = new Map(
      (data.telemetry?.spans ?? []).map((span) => [`${span.traceId}:${span.spanId}`, span]),
    );
    const grouped = new Map<
      string,
      {
        from: string;
        to: string;
        operation: string;
        httpStatus: number | null;
        durationSum: number;
        durationCount: number;
        count: number;
        hasError: boolean;
      }
    >();
    for (const edge of interactions) {
      const span = spanMap.get(`${edge.traceId}:${edge.childSpanId}`);
      const op = span?.operationName?.trim() || "";
      const status = typeof span?.httpStatusCode === "number" ? span.httpStatusCode : null;
      const isErr =
        span?.spanStatus?.toUpperCase() === "ERROR" ||
        span?.circuitOpen === true ||
        (status !== null && status >= 400);
      const ns = span?.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
      const ms = Number.isFinite(ns) && ns >= 0 ? ns / 1e6 : null;
      const key = `${edge.fromService}→${edge.toService}`;
      const prev = grouped.get(key);
      if (prev) {
        prev.count += 1;
        if (!prev.operation && op) prev.operation = op;
        if (status !== null && (isErr || prev.httpStatus === null)) prev.httpStatus = status;
        if (ms !== null) {
          prev.durationSum += ms;
          prev.durationCount += 1;
        }
        if (isErr) prev.hasError = true;
      } else {
        grouped.set(key, {
          from: edge.fromService,
          to: edge.toService,
          operation: op,
          httpStatus: status,
          durationSum: ms ?? 0,
          durationCount: ms !== null ? 1 : 0,
          count: 1,
          hasError: isErr,
        });
      }
    }
    return [...grouped.values()].map((item) => {
      const avgMs =
        item.durationCount > 0 ? Number((item.durationSum / item.durationCount).toFixed(1)) : null;
      const parts = [
        item.operation || "OTEL_TRACE",
        item.httpStatus !== null ? `HTTP ${item.httpStatus}` : null,
        avgMs !== null ? `${avgMs} ms` : null,
        item.count > 1 ? `×${item.count}` : null,
      ].filter(Boolean);
      return {
        from: item.from,
        to: item.to,
        operation: item.operation || "OTEL_TRACE",
        httpStatus: item.httpStatus,
        avgMs,
        count: item.count,
        hasError: item.hasError,
        observed: true,
        label: parts.join(" · "),
      };
    });
  }

  return (data.topology?.connections ?? [])
    .filter((conn) => (runningFor(data, conn.controllerService) ?? 1) > 0)
    .map((conn) => ({
      from: conn.from,
      to: conn.to,
      operation: conn.protocol || "HTTP",
      httpStatus: null,
      avgMs: null,
      count: 1,
      hasError: false,
      observed: false,
      label: `${conn.protocol || "HTTP"} (configured)`,
    }));
}

type Studio = Response<"studioState">;
type SessionOption = {
  id: string;
  scenarioName?: string | null;
  executionStatus?: string | null;
  failureReason?: string | null | undefined;
  diagnostics?: readonly string[] | null | undefined;
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
  onClearError?: (() => void) | undefined;
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
  return resolveRunningReplicas(data, service);
}

function lastResultFor(data: Studio, service: string) {
  return [...data.actions]
    .reverse()
    .find((action) => action.service === service && action.status === "CONFIRMED")?.result;
}

function parseLiveMemMiB(part?: string | null): number {
  if (!part) return 0;
  const m = part.trim().match(/^([\d.]+)\s*(KiB|KB|K|MiB|MB|M|GiB|GB|G|B)?$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? "MiB").toLowerCase();
  if (unit === "gib" || unit === "gb" || unit === "g") return n * 1024;
  if (unit === "kib" || unit === "kb" || unit === "k") return n / 1024;
  if (unit === "b") return n / (1024 * 1024);
  return n;
}

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2)).toString()
    : "—";
}

export function resolveTelemetryServiceStatus({
  isPreview,
  running,
  executionStatus,
  lastSessionFailed,
  isTimedOut,
  isBooting,
}: {
  isPreview: boolean;
  running: number | undefined;
  executionStatus: string;
  lastSessionFailed: boolean;
  isTimedOut: boolean;
  isBooting: boolean;
}): { label: string; textClass: string; dotClass: string } {
  if (isPreview) {
    return running === 0
      ? { label: "Starts Down", textClass: "text-amber-300", dotClass: "bg-amber-400" }
      : { label: "Prepared", textClass: "text-sky-300", dotClass: "bg-sky-400" };
  }
  if (running !== undefined) {
    return running === 0
      ? { label: "Down", textClass: "text-rose-300", dotClass: "bg-rose-400" }
      : { label: "Running", textClass: "text-emerald-300", dotClass: "bg-emerald-400" };
  }
  if (isTimedOut) {
    return { label: "Timed Out", textClass: "text-rose-300", dotClass: "bg-rose-400" };
  }
  if (lastSessionFailed) {
    return { label: "Failed", textClass: "text-rose-300", dotClass: "bg-rose-400" };
  }
  if (executionStatus.toUpperCase() === "CANCELLED") {
    return { label: "Stopped", textClass: "text-slate-400", dotClass: "bg-slate-500" };
  }
  if (isBooting) {
    return { label: "Booting", textClass: "text-amber-300", dotClass: "bg-amber-400" };
  }
  return { label: "Waiting", textClass: "text-slate-400", dotClass: "bg-slate-500" };
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
  missionCard,
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
  missionCard?: {
    instructions?: string | null | undefined;
    maxErrorRatePercent?: number | null | undefined;
    maxP95Ms?: number | null | undefined;
    minReplicas?: Array<{ service?: string; count?: number }> | null | undefined;
    stoppedServices?: string[] | null | undefined;
    requiredTraceEdge?: { from?: string; to?: string } | null | undefined;
    submitHref?: string | null | undefined;
    verified?: boolean | undefined;
  } | undefined;
}) {
  const { t } = useLocale();
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
    ["CANCELLED", "FAILED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT"].includes(
      liveData!.executionStatus.toUpperCase(),
    );
  const hasLiveRuntimeState =
    Boolean(liveData) &&
    !isTerminalAuthorSession &&
    (liveData!.services.length > 0 ||
      Boolean(liveData!.topology) ||
      Boolean(liveData!.telemetry?.observedAt) ||
      liveData!.executionStatus.toUpperCase() === "RUNNING" ||
      BOOTING_STATUSES.has(liveData!.executionStatus.toUpperCase()));
  const isPreviewMode =
    !activeSessionId || !liveData || isTerminalAuthorSession || !hasLiveRuntimeState;
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
    if (!isPreviewMode && liveData) {
      if (liveData.services.length > 0 || liveData.topology) return liveData;
      const fallbackServices =
        liveData.telemetry?.services.map((item) => item.service).filter(Boolean) ??
        (effectivePreviewTopology
          ? [
              ...effectivePreviewTopology.blocks.map((b) => b.service),
              ...effectivePreviewTopology.connections.map((c) => c.controllerService),
            ]
          : []);
      return {
        ...liveData,
        services: fallbackServices,
        ...(effectivePreviewTopology ? { topology: effectivePreviewTopology } : {}),
      };
    }
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
  const snapshotNoteRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"stats" | "telemetry" | "logs" | "snapshots">("telemetry");
  const [inspectedTraceId, setInspectedTraceId] = useState<string | null>(null);
  useEffect(() => {
    setInspectedTraceId(null);
  }, [sessionId]);
  // GonnaCrash Canvas-First LIVE defaults: airy light whiteboard, 90% canvas open, floating contextual cards.
  const [studioTheme, setStudioTheme] = useState<"light" | "dark">("light");
  const isLight = studioTheme === "light";
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mavis.studio-theme");
      if (saved === "light" || saved === "dark") setStudioTheme(saved);
    } catch {
      // ignore storage restrictions
    }
  }, []);
  const setThemePersisted = (next: "light" | "dark") => {
    setStudioTheme(next);
    try {
      localStorage.setItem("mavis.studio-theme", next);
    } catch {
      // ignore storage restrictions
    }
  };
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(() => Boolean(authoring));
  const [rightCardMode, setRightCardMode] = useState<"service" | "diagnostics">("service");
  const [missionCollapsed, setMissionCollapsed] = useState(false);
  const [missionHidden, setMissionHidden] = useState(false);
  const [telemetryPopoverOpen, setTelemetryPopoverOpen] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [verifiedModalOpen, setVerifiedModalOpen] = useState(false);
  const prevFinishSuccessRef = useRef(false);
  useEffect(() => {
    if (finish.isSuccess && !prevFinishSuccessRef.current) {
      setVerifiedModalOpen(true);
    }
    prevFinishSuccessRef.current = finish.isSuccess;
  }, [finish.isSuccess]);
  const [leftWidth, setLeftWidth] = useState(244);
  const [rightWidth, setRightWidth] = useState(324);
  const [bottomHeight, setBottomHeight] = useState(256);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [resizingAxis, setResizingAxis] = useState<"left" | "right" | "bottom" | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dockExpanded = !bottomCollapsed && bottomHeight >= 320;
  const [freshnessNow, setFreshnessNow] = useState(() => Date.now());
  const isLiveRunning = !isPreviewMode && data.executionStatus === "RUNNING";
  useEffect(() => {
    if (!isLiveRunning) return;
    setFreshnessNow(Date.now());
    const timer = window.setInterval(() => setFreshnessNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [isLiveRunning, data.telemetryReceivedAt, data.telemetry?.observedAt]);
  const lastTelemetryMs = Date.parse(
    data.telemetryReceivedAt ?? data.telemetry?.observedAt ?? "",
  );
  const telemetryStale =
    isLiveRunning &&
    Number.isFinite(lastTelemetryMs) &&
    freshnessNow - lastTelemetryMs > 10_000;

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
  const evidenceScopeId = activeSessionId || (projectId ? `preview:${projectId}` : "preview");
  const [liveReplays, setLiveReplays] = useState<LiveRuntimeReplay[]>([]);
  const [recordingSteps, setRecordingSteps] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savingReplay, setSavingReplay] = useState(false);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [replayError, setReplayError] = useState("");
  const replayCaptureRef = useRef<{
    started: number;
    frames: EvidenceFrame[];
    lastActionCount: number;
    lastObservedAt: string;
  } | null>(null);
  const videoRecorderRef = useRef<ReturnType<typeof startStudioRecording> | null>(null);

  useEffect(() => {
    let active = true;
    void loadStudioEvidence<LiveRuntimeReplay>()
      .then((items) => {
        if (!active) return;
        setLiveReplays(
          items
            .filter(
              (item) =>
                item &&
                (item.kind === "LIVE_REPLAY" || item.kind === "LIVE_SCREENSHOT") &&
                (item.sessionId === evidenceScopeId || (!activeSessionId && !item.sessionId)),
            )
            .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeSessionId, evidenceScopeId]);

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

  const runtimeFlows = useMemo(() => summarizeRuntimeFlows(data), [data]);

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
      const connections = runtimeFlows.map((flow) => ({
        from: flow.from,
        to: flow.to,
        protocol: flow.label,
      }));
      return {
        elapsedMs,
        label,
        svg: serializeStudioGraph(svg, true),
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
    [blocks, data, lastConfirmed, runtimeFlows, totalRunningReplicas],
  );

  // Auto-record a checkpoint frame whenever a confirmed Docker action completes OR new observed trace flows arrive while recording
  useEffect(() => {
    const rec = replayCaptureRef.current;
    if (!rec || rec.frames.length >= 39) return;
    if (confirmedActions.length > rec.lastActionCount) {
      rec.lastActionCount = confirmedActions.length;
      rec.lastObservedAt = data.telemetry?.observedAt ?? rec.lastObservedAt;
      const latest = confirmedActions[confirmedActions.length - 1];
      const label = latest
        ? `${latest.action} ${latest.service}${latest.replicas ? ` → ${latest.replicas}×` : ""}`
        : "Confirmed live action";
      const frame = captureLiveReplayFrame(label, performance.now() - rec.started);
      if (frame) {
        rec.frames.push(frame);
        setRecordingSteps(rec.frames.length);
      }
      return;
    }
    const observedAt = data.telemetry?.observedAt ?? "";
    if (
      observedAt &&
      observedAt !== rec.lastObservedAt &&
      (data.telemetry?.interactions.length ?? 0) > 0
    ) {
      rec.lastObservedAt = observedAt;
      const topFlow = runtimeFlows[0];
      const label = topFlow
        ? `Traffic flow · ${topFlow.from} → ${topFlow.to}${runtimeFlows.length > 1 ? ` (+${runtimeFlows.length - 1})` : ""}`
        : `Telemetry snapshot · ${data.telemetry?.interactions.length ?? 0} traces`;
      const frame = captureLiveReplayFrame(label, performance.now() - rec.started);
      if (frame) {
        rec.frames.push(frame);
        setRecordingSteps(rec.frames.length);
      }
    }
  }, [confirmedActions, data.telemetry?.observedAt, data.telemetry?.interactions.length, runtimeFlows, captureLiveReplayFrame]);

  async function captureCanvasScreenshot() {
    const svg = graphRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    const frame = captureLiveReplayFrame("Canvas screenshot", 0);
    if (!svg || !frame) {
      setReplayError("Render the topology canvas before taking a screenshot.");
      return;
    }
    setCapturingScreen(true);
    setReplayError("");
    try {
      const imageData = await captureStudioImage(svg, true);
      const digestBytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ sessionId: evidenceScopeId, frame })),
      );
      const digest =
        "sha256:" +
        Array.from(new Uint8Array(digestBytes), (b) => b.toString(16).padStart(2, "0")).join("");
      const saved: LiveRuntimeReplay = {
        id: crypto.randomUUID(),
        sessionId: evidenceScopeId,
        kind: "LIVE_SCREENSHOT",
        capturedAt: new Date().toISOString(),
        explanation:
          explanation.trim() ||
          `${projectName || "Studio Live"} screenshot · ${blocks.length} services · ${totalRunningReplicas} pods`,
        digest,
        frame,
        replay: [frame],
        imageData,
      };
      await storeStudioEvidence(saved).catch(() => undefined);
      setLiveReplays((prev) => [saved, ...prev]);
      setTab("snapshots");
    } catch (cause) {
      setReplayError(cause instanceof Error ? cause.message : "Could not capture screenshot.");
    } finally {
      setCapturingScreen(false);
    }
  }

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
      lastObservedAt: data.telemetry?.observedAt ?? "",
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
        new TextEncoder().encode(JSON.stringify({ sessionId: evidenceScopeId, frames })),
      );
      const digest =
        "sha256:" +
        Array.from(new Uint8Array(digestBytes), (b) => b.toString(16).padStart(2, "0")).join("");
      const saved: LiveRuntimeReplay = {
        id: crypto.randomUUID(),
        sessionId: evidenceScopeId,
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

  const activeSessionMeta = sessions.find((item) => item.id === activeSessionId);
  const isBooting = Boolean(
    starting ||
      BOOTING_STATUSES.has(data.executionStatus.toUpperCase()) ||
      BOOTING_STATUSES.has(liveData?.executionStatus?.toUpperCase() ?? ""),
  );
  const failedStatuses = ["FAILED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT"];
  const timedOutStatuses = ["TIMED_OUT", "TIMEDOUT", "TIMEOUT"];
  const lastSessionFailed =
    failedStatuses.includes(data.executionStatus.toUpperCase()) ||
    failedStatuses.includes(liveData?.executionStatus?.toUpperCase() ?? "") ||
    failedStatuses.includes(activeSessionMeta?.executionStatus?.toUpperCase() ?? "");
  const isCancelling = data.executionStatus.toUpperCase() === "CANCELLING";
  const isTimedOut =
    timedOutStatuses.includes(data.executionStatus.toUpperCase()) ||
    timedOutStatuses.includes(liveData?.executionStatus?.toUpperCase() ?? "") ||
    timedOutStatuses.includes(activeSessionMeta?.executionStatus?.toUpperCase() ?? "");

  const failedSessionDetail = useApiQuery(
    "runtimeReadSession",
    { sessionId: activeSessionId },
    { enabled: Boolean(activeSessionId && lastSessionFailed) },
  );

  const failedDiagnostics = useMemo(() => {
    if (!lastSessionFailed) return [] as string[];
    const lines: string[] = [];
    const pushUnique = (value: string | null | undefined) => {
      const trimmed = value?.trim();
      if (trimmed && !lines.includes(trimmed)) lines.push(trimmed);
    };
    pushUnique(failedSessionDetail.data?.failureReason ?? activeSessionMeta?.failureReason);
    for (const item of failedSessionDetail.data?.diagnostics ?? activeSessionMeta?.diagnostics ?? []) {
      pushUnique(item);
    }
    for (const step of failedSessionDetail.data?.stepResults ?? []) {
      if (step.status === "FAILED" || step.status === "TIMED_OUT") {
        const detail = step.failureReason ?? step.status;
        pushUnique(`Step ${step.id} (${step.method ?? "GET"} ${step.path ?? step.service ?? ""}): ${detail}`);
      }
    }
    return lines;
  }, [
    lastSessionFailed,
    failedSessionDetail.data?.failureReason,
    failedSessionDetail.data?.diagnostics,
    failedSessionDetail.data?.stepResults,
    activeSessionMeta?.failureReason,
    activeSessionMeta?.diagnostics,
  ]);

  // Preserve failed/cancelled session logs and sessionId in the terminal even while Author canvas returns to editable Preview.
  const terminalData: Studio = useMemo(() => {
    if (isTerminalAuthorSession && liveData) {
      return {
        ...liveData,
        services: liveData.services.length > 0 ? liveData.services : data.services,
      };
    }
    return data;
  }, [isTerminalAuthorSession, liveData, data]);

  // Keep real observed/failed telemetry in Stats & Telemetry tabs instead of replacing it with fake Preview status.
  const observedData: Studio = useMemo(() => {
    if (!lastSessionFailed) return data;
    if (liveData) return terminalData;
    const { telemetry: _previewTelemetry, ...withoutPreviewTelemetry } = data;
    return withoutPreviewTelemetry;
  }, [lastSessionFailed, liveData, terminalData, data]);
  const isTelemetryPreview = isPreviewMode && !lastSessionFailed;

  const terminalSystemError =
    mutationError ??
    (lastSessionFailed && failedDiagnostics.length === 0
      ? "Studio Live session failed on Runner. Check diagnostics or click Run to retry."
      : null);
  const terminalAlertSignal = terminalSystemError ?? failedDiagnostics[0] ?? null;
  const logsAndTracesCount =
    (terminalData.telemetry?.services ?? []).reduce(
      (sum, svc) =>
        sum +
        (svc.logs
          ? svc.logs.split(/\r?\n/).filter((line) => line.trim().length > 0).length
          : 0),
      0,
    ) +
    (terminalData.telemetry?.spans.length ?? 0) +
    failedDiagnostics.length +
    (terminalSystemError ? 1 : 0);

  // Auto-open the Logs & Traces terminal on boot start or new error so all status/errors stay inside the terminal
  const wasBootingRef = useRef(false);
  const lastOpenedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (isBooting && !wasBootingRef.current) {
      setTab("logs");
      setBottomCollapsed(false);
    }
    wasBootingRef.current = isBooting;
  }, [isBooting]);
  useEffect(() => {
    if (terminalAlertSignal && terminalAlertSignal !== lastOpenedErrorRef.current) {
      setTab("logs");
      setBottomCollapsed(false);
    }
    lastOpenedErrorRef.current = terminalAlertSignal;
  }, [terminalAlertSignal]);

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

  const isQueued = data.executionStatus.toUpperCase() === "QUEUED";

  const statusTone =
    data.executionStatus === "RUNNING"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : isQueued || isCancelling
        ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
        : isBooting
          ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
          : data.executionStatus === "COMPLETED"
            ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
            : lastSessionFailed
              ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
              : "border-slate-700 bg-slate-900 text-slate-300";

  const statusLabel =
    data.executionStatus === "RUNNING"
      ? waiting
        ? "APPLYING"
        : "LIVE"
      : isQueued
        ? `QUEUED${data.queuePosition ? ` #${data.queuePosition}` : ""}`
        : isCancelling
          ? "CANCELLING"
          : isBooting
            ? "BOOTING"
            : data.executionStatus === "COMPLETED"
              ? "SEALED"
              : lastSessionFailed
                ? isTimedOut
                  ? "TIMED OUT"
                  : "FAILED"
                : isPreviewMode && effectivePreviewTopology
                  ? authoring
                    ? "LAB SETUP"
                    : "PREVIEW"
                  : "IDLE";

  const showLiveSessionControls = !authoring || !isPreviewMode || isBooting;
  const liveProbeMetrics = data.telemetry?.probe;
  const liveP95Ms =
    liveProbeMetrics?.p95Ms != null && Number.isFinite(liveProbeMetrics.p95Ms)
      ? Math.round(liveProbeMetrics.p95Ms)
      : typeof lastConfirmed?.result?.metricsAfter["p95LatencyMs"] === "number"
        ? Math.round(Number(lastConfirmed.result.metricsAfter["p95LatencyMs"]))
        : null;
  const liveErrorPct =
    liveProbeMetrics != null && Number.isFinite(liveProbeMetrics.errorRatePercent)
      ? Number(liveProbeMetrics.errorRatePercent.toFixed(1))
      : typeof lastConfirmed?.result?.metricsAfter["errorRatePercent"] === "number"
        ? Number(Number(lastConfirmed.result.metricsAfter["errorRatePercent"]).toFixed(1))
        : null;
  const liveRps =
    liveProbeMetrics != null && Number.isFinite(liveProbeMetrics.rps)
      ? Number(liveProbeMetrics.rps.toFixed(1))
      : null;
  const stoppedServiceNames = services.filter((svc) => runningFor(data, svc) === 0);
  const pausedServiceNames = services.filter((svc) => {
    if (runningFor(data, svc) === 0) return false;
    const latest = [...(data.actions ?? [])]
      .reverse()
      .find((item) => item.service === svc && item.status === "CONFIRMED");
    return latest?.action === "PAUSE";
  });
  const faultedServices = [...stoppedServiceNames, ...pausedServiceNames];
  const snapshotCount = data.snapshots?.length ?? 0;
  const healthyCount = Math.max(0, services.length - faultedServices.length);
  const parsedAuthorMaxErr =
    authoring?.maxErrorRatePercent && Number.isFinite(Number(authoring.maxErrorRatePercent))
      ? Number(authoring.maxErrorRatePercent)
      : null;
  const effectiveMissionInstructions =
    missionCard?.instructions?.trim() ||
    authoring?.instructions?.trim() ||
    t(
      "Click any live microservice on the canvas to inject faults, scale replicas, observe live Change Impact, and capture a Snapshot.",
      "Bấm vào bất kỳ microservice đang chạy nào trên sơ đồ để tiêm lỗi, scale replica, quan sát Change Impact trực tiếp và chụp Snapshot.",
    );
  const missionMaxErr: number | null = missionCard?.maxErrorRatePercent ?? parsedAuthorMaxErr;
  const missionMaxP95: number | null = missionCard?.maxP95Ms ?? null;
  const missionMinReplicas: Array<{ service?: string; count?: number }> | null =
    missionCard?.minReplicas ??
    (authoring?.replicaService
      ? [{ service: authoring.replicaService, count: Number(authoring.replicaCount) || 1 }]
      : null);

  return (
    <div
      data-testid="live-workbench"
      data-studio-theme={studioTheme}
      data-theme={studioTheme}
      className={
        expanded
          ? `fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden ${isLight ? "bg-[#FBFBF8] text-slate-900" : "dark bg-[#070b12] text-slate-100"}`
          : `flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden ${isLight ? "bg-[#FBFBF8] text-slate-900" : "dark bg-[#070b12] text-slate-100"}`
      }
    >
      {/* GonnaCrash-Inspired Slim Top Bar */}
      <div
        className={`relative z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3.5 py-1.5 ${
          isLight
            ? "border-slate-200 bg-white/95 text-slate-900 shadow-2xs"
            : "border-slate-800 bg-[#0b101b] text-slate-100"
        }`}
      >
        {standaloneHeader?.left && (
          <>
            {standaloneHeader.left}
            <span
              className={`h-4 w-px shrink-0 ${isLight ? "bg-slate-200" : "bg-slate-800"}`}
              aria-hidden="true"
            />
          </>
        )}

        {(data.executionStatus === "RUNNING" ||
          isBooting ||
          isCancelling ||
          data.executionStatus === "COMPLETED" ||
          lastSessionFailed) && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${
              isLight
                ? data.executionStatus === "RUNNING"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : isBooting || isQueued || isCancelling
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : lastSessionFailed
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : "border-slate-300 bg-slate-100 text-slate-700"
                : statusTone
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                data.executionStatus === "RUNNING"
                  ? "animate-pulse bg-emerald-500"
                  : isQueued || isCancelling
                    ? "animate-pulse bg-amber-500"
                    : isBooting
                      ? "animate-pulse bg-sky-500"
                      : lastSessionFailed
                        ? "bg-rose-500"
                        : "bg-slate-400"
              }`}
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        )}

        {/* Center GonnaCrash Live Telemetry Pill (click for breakdown & session switcher) */}
        <div className="relative mx-auto hidden md:block">
          <button
            type="button"
            onClick={() => {
              setTelemetryPopoverOpen((open) => !open);
              setSettingsPopoverOpen(false);
            }}
            className={`inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1 text-xs font-medium shadow-2xs transition ${
              isLight
                ? "border-slate-300 bg-[#F8FAFC] text-slate-800 hover:border-slate-400 hover:bg-white"
                : "border-slate-700 bg-slate-900/90 text-slate-200 hover:border-slate-600"
            }`}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span
                className={`size-2 rounded-full ${
                  faultedServices.length > 0
                    ? "bg-rose-500"
                    : data.executionStatus === "RUNNING"
                      ? "bg-emerald-500"
                      : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              {healthyCount}/{services.length || 0} {t("Services", "Dịch vụ")}
            </span>
            <span className={isLight ? "text-slate-300" : "text-slate-600"}>|</span>
            <span className="font-mono">
              {liveRps != null ? `${liveRps} req/s` : `${totalRunningReplicas} pods`}
            </span>
            {liveP95Ms != null && (
              <>
                <span className={isLight ? "text-slate-300" : "text-slate-600"}>·</span>
                <span className="font-mono">p95 {liveP95Ms}ms</span>
              </>
            )}
            {liveErrorPct != null && (
              <>
                <span className={isLight ? "text-slate-300" : "text-slate-600"}>·</span>
                <span
                  className={`font-mono font-semibold ${
                    liveErrorPct > 0
                      ? isLight ? "text-rose-600" : "text-rose-300"
                      : isLight ? "text-emerald-700" : "text-emerald-300"
                  }`}
                >
                  {liveErrorPct}% err
                </span>
              </>
            )}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </button>

          {telemetryPopoverOpen && (
            <div
              className={`absolute left-1/2 top-full z-40 mt-2 w-80 -translate-x-1/2 space-y-3 rounded-2xl border p-4 shadow-xl ${
                isLight
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-slate-700 bg-[#0d1422] text-slate-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{t("Live Runtime Telemetry", "Thông số Runtime trực tiếp")}</span>
                <button
                  type="button"
                  onClick={() => setTelemetryPopoverOpen(false)}
                  className="rounded p-1 opacity-70 hover:opacity-100"
                  aria-label={t("Close", "Đóng")}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className={`rounded-lg border p-2 ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-900/60"}`}>
                  <dt className="text-muted-foreground">{t("Running Pods", "Pod đang chạy")}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-bold">{totalRunningReplicas}</dd>
                </div>
                <div className={`rounded-lg border p-2 ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-900/60"}`}>
                  <dt className="text-muted-foreground">{t("Snapshots", "Snapshot đã lưu")}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-bold">{snapshotCount}</dd>
                </div>
                <div className={`rounded-lg border p-2 ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-900/60"}`}>
                  <dt className="text-muted-foreground">P95 Latency</dt>
                  <dd className="mt-0.5 font-mono text-sm font-bold">{liveP95Ms != null ? `${liveP95Ms} ms` : "—"}</dd>
                </div>
                <div className={`rounded-lg border p-2 ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-900/60"}`}>
                  <dt className="text-muted-foreground">{t("Error Rate", "Tỉ lệ lỗi")}</dt>
                  <dd className={`mt-0.5 font-mono text-sm font-bold ${liveErrorPct && liveErrorPct > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {liveErrorPct != null ? `${liveErrorPct}%` : "—"}
                  </dd>
                </div>
              </dl>
              {(!authoring || !isPreviewMode || isBooting) && (
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">{t("Runtime session", "Phiên chạy Docker")}</span>
                  <select
                    aria-label="Select active or recent runtime session"
                    value={activeSessionId}
                    onChange={(event) => onSelectSession(event.target.value)}
                    className={`h-8 w-full rounded-lg border px-2 text-xs ${
                      isLight
                        ? "border-slate-300 bg-white text-slate-900"
                        : "border-slate-700 bg-slate-950 text-slate-100"
                    }`}
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
            </div>
          )}
        </div>

        {/* Right Actions Cluster (GonnaCrash-style icon buttons + primary Run/Finish pill + Settings) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {authoring && authoring.saved && !missionDirty && (
            <span className="hidden items-center gap-1 text-xs font-medium text-emerald-600 lg:inline-flex">
              <Check aria-hidden="true" className="size-3.5" /> Saved
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
              className="h-8 px-2.5 text-xs"
            >
              <Save aria-hidden="true" className="mr-1 size-3.5" />
              {authoring.saving ? "Saving…" : "Save Canvas"}
            </Button>
          )}

          {/* Snapshots History Icon Button */}
          {showLiveSessionControls && (
            <button
              type="button"
              title={t("Snapshots & History", "Lịch sử Snapshot")}
              aria-label={t("Snapshots & History", "Lịch sử Snapshot")}
              onClick={() => {
                setTab("snapshots");
                setBottomCollapsed(false);
                setSettingsPopoverOpen(false);
                setTelemetryPopoverOpen(false);
              }}
              className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                isLight
                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <History className="size-4" aria-hidden="true" />
              {snapshotCount > 0 && (
                <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {snapshotCount}
                </span>
              )}
            </button>
          )}

          {/* Impact / Diagnostics Lightbulb Icon Button */}
          <button
            type="button"
            title={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
            aria-label={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
            onClick={() => {
              setRightCardMode("diagnostics");
              setShowRight((open) => (rightCardMode === "diagnostics" ? !open : true));
              setSettingsPopoverOpen(false);
              setTelemetryPopoverOpen(false);
            }}
            className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
              showRight && rightCardMode === "diagnostics"
                ? "border-primary bg-primary/10 text-primary"
                : isLight
                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Lightbulb className="size-4" aria-hidden="true" />
            {faultedServices.length > 0 && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-950" />
            )}
          </button>

          {/* Primary Start / Run Button when not RUNNING */}
          {data.executionStatus !== "RUNNING" &&
            (onStartSession ? (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg bg-[#0056D2] px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-[#00419E] disabled:opacity-60"
                disabled={isBooting || isCancelling || cancel.isPending}
                onClick={onStartSession}
              >
                {isBooting ? (
                  <RefreshCw aria-hidden="true" className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Play aria-hidden="true" className="mr-1.5 size-3.5 fill-current" />
                )}
                {isQueued ? `Queued${data.queuePosition ? ` #${data.queuePosition}` : "…"}` : isBooting ? "Booting…" : "Run"}
              </Button>
            ) : (
              <Button asChild size="sm" className="h-8 rounded-lg px-3 text-xs">
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
              className="h-8 px-2.5 text-xs"
              onClick={onSwitchToSandbox}
            >
              Switch to Sandbox
            </Button>
          )}

          {showLiveSessionControls && data.executionStatus === "RUNNING" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-8 px-2.5 text-xs font-semibold ${
                isLight
                  ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  : "border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
              disabled={
                data.executionStatus !== "RUNNING" ||
                !data.telemetry ||
                capturing ||
                capture.isPending ||
                (data.snapshots?.length ?? 0) >= 8
              }
              onClick={() => {
                setTab("snapshots");
                setBottomCollapsed(false);
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
              <Camera aria-hidden="true" className="mr-1.5 size-3.5" />
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
              className="h-8 border-rose-500/50 bg-rose-500/15 px-2.5 font-mono text-xs text-rose-600 dark:text-rose-200"
            >
              <span className="mr-1.5 size-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />
              REC {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
              {String(recordingSeconds % 60).padStart(2, "0")} · {recordingSteps}
            </Button>
          )}

          {showLiveSessionControls && data.executionStatus === "RUNNING" && (() => {
            const finishDisabledReason =
              data.finishRequested || finish.isPending
                ? t(
                    "Finishing Studio session and sealing receipt…",
                    "Đang kết thúc phiên Studio và niêm phong biên nhận…",
                  )
                : action.isPending || waiting
                  ? t(
                      "Wait for the current runtime action to complete",
                      "Vui lòng đợi thao tác runtime hiện tại hoàn tất",
                    )
                  : capturing || capture.isPending
                    ? t(
                        "Wait for the snapshot capture to finish",
                        "Vui lòng đợi quá trình chụp snapshot hoàn tất",
                      )
                    : !hasConfirmedAction
                      ? t(
                          "Run at least one confirmed action (Pause, Resume, Stop, Start, or Scale) and capture a snapshot before finishing",
                          "Thực hiện ít nhất 1 thao tác được xác nhận (Pause, Resume, Stop, Start hoặc Scale) và chụp 1 Snapshot trước khi kết thúc",
                        )
                      : t(
                          "Finish Studio and seal your verifiable RuntimeReceipt",
                          "Kết thúc Studio và ký niêm phong RuntimeReceipt",
                        );
            const finishDisabled =
              finish.isPending ||
              action.isPending ||
              capturing ||
              capture.isPending ||
              waiting ||
              !hasConfirmedAction ||
              data.finishRequested ||
              data.executionStatus !== "RUNNING";
            return (
              <span className="inline-flex" title={finishDisabledReason}>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-45"
                  disabled={finishDisabled}
                  aria-label={finishDisabled ? `${t("Finish Studio", "Kết thúc Studio")} (${finishDisabledReason})` : t("Finish Studio", "Kết thúc Studio")}
                  onClick={() => void finishStudio()}
                >
                  {t("Finish Studio", "Kết thúc Studio")}
                </Button>
              </span>
            );
          })()}

          {/* GonnaCrash-Style Settings Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              aria-label={t("Studio settings", "Cài đặt Studio")}
              title={t("Studio settings", "Cài đặt Studio")}
              onClick={() => {
                setSettingsPopoverOpen((open) => !open);
                setTelemetryPopoverOpen(false);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                settingsPopoverOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : isLight
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </button>

            {settingsPopoverOpen && (
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-72 space-y-3 rounded-2xl border p-4 shadow-xl ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-slate-700 bg-[#0d1422] text-slate-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{t("Studio Settings", "Cài đặt Studio")}</span>
                  <button
                    type="button"
                    onClick={() => setSettingsPopoverOpen(false)}
                    className="rounded p-1 opacity-70 hover:opacity-100"
                    aria-label={t("Close", "Đóng")}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Light / Dark Whiteboard Theme Switcher */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{t("Canvas Theme", "Chế độ màu")}</span>
                  <div className={`inline-flex rounded-lg border p-0.5 ${isLight ? "border-slate-200 bg-slate-100" : "border-slate-700 bg-slate-900"}`}>
                    <button
                      type="button"
                      onClick={() => setThemePersisted("light")}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold ${
                        isLight ? "bg-white text-slate-900 shadow-2xs" : "text-slate-400"
                      }`}
                    >
                      <Sun className="size-3.5" aria-hidden="true" />
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setThemePersisted("dark")}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold ${
                        !isLight ? "bg-slate-800 text-white shadow-2xs" : "text-slate-500"
                      }`}
                    >
                      <Moon className="size-3.5" aria-hidden="true" />
                      Dark
                    </button>
                  </div>
                </div>

                {/* Panel Toggles */}
                <div className="space-y-1.5 border-t pt-2.5 text-xs">
                  <button
                    type="button"
                    aria-pressed={showRight}
                    onClick={() => {
                      setShowRight((v) => !v);
                      setSettingsPopoverOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                      isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PanelRight className="size-3.5" aria-hidden="true" />
                      {t("Service Controls Card", "Thẻ điều khiển Service")}
                    </span>
                    <span className="font-mono text-xs text-primary">{showRight ? "ON" : "OFF"}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={showLeft}
                    onClick={() => {
                      setShowLeft((v) => !v);
                      setSettingsPopoverOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                      isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PanelLeft className="size-3.5" aria-hidden="true" />
                      {t("Service List Sidebar", "Danh sách Service")}
                    </span>
                    <span className="font-mono text-xs text-primary">{showLeft ? "ON" : "OFF"}</span>
                  </button>
                  {missionHidden && (
                    <button
                      type="button"
                      onClick={() => {
                        setMissionHidden(false);
                        setMissionCollapsed(false);
                        setSettingsPopoverOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                        isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Target className="size-3.5 text-amber-600" aria-hidden="true" />
                        {t("Show Mission Note", "Hiện tờ Mục tiêu")}
                      </span>
                    </button>
                  )}
                  {showLiveSessionControls && (data.executionStatus === "RUNNING" || isBooting) && (
                    <button
                      type="button"
                      disabled={cancel.isPending}
                      onClick={() => {
                        setSettingsPopoverOpen(false);
                        void cancelStudio();
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      <span>{t("Stop & Cancel Session", "Dừng & Hủy phiên Docker")}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {standaloneHeader?.right}

          {!standalone && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={expanded ? "Exit fullscreen Studio Live" : "Expand Studio Live fullscreen"}
              title={expanded ? "Exit fullscreen (Esc)" : "Expand fullscreen"}
              onClick={() => setExpanded((value) => !value)}
              className="h-8 px-2"
            >
              {expanded ? (
                <Minimize2 aria-hidden="true" className="size-4" />
              ) : (
                <Maximize2 aria-hidden="true" className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* GonnaCrash Canvas-First Full-Bleed Workspace with Floating Contextual Islands */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {showLeft && (
          <>
            <aside
              style={{
                width: leftWidth,
                scrollbarWidth: "thin",
                scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #0b101b",
              }}
              className={`h-full shrink-0 overflow-x-hidden overflow-y-auto border-r p-2.5 ${
                isLight ? "border-slate-200 bg-white text-slate-900" : "border-slate-800 bg-[#0b101b] text-slate-100"
              }`}
            >
              <LiveSandboxParity
                data={data}
                selected={canvasSelected}
                busy={isPreviewMode ? false : busy}
                onSelect={(svc) => {
                  studio.setService(svc);
                  if (svc) {
                    setSetupPanel("service");
                    setRightCardMode("service");
                    setShowRight(true);
                  }
                }}
                onCommand={dispatchCommand}
                sections={["library"]}
                compact
                label="Live block library"
                authoring={authoring}
                activeSetupPanel={setupPanel}
                onSelectSetupPanel={(panel) => {
                  setSetupPanel(panel);
                  setRightCardMode("service");
                  setShowRight(true);
                }}
              />
            </aside>
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize blocks panel"
              aria-valuenow={leftWidth}
              aria-valuemin={180}
              aria-valuemax={560}
              onPointerDown={(event) => startResize("left", event)}
              onDoubleClick={() => setShowLeft(false)}
              className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30"
            />
          </>
        )}

        {/* Center Full-Bleed Interactive Live Canvas + Slide-Up Telemetry/Logs Drawer */}
        <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${isLight ? "bg-[#FBFBF8]" : "bg-[#070b12]"}`}>
          <div ref={graphRef} className="relative min-h-[240px] min-w-0 flex-1 overflow-hidden">
            {state.isError && state.data && (
              <div
                role="status"
                className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/70 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-900 shadow-lg dark:bg-amber-950/90 dark:text-amber-100"
              >
                <span>Connection interrupted — keeping last live view while retrying…</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => void state.refetch()}
                >
                  Retry now
                </Button>
              </div>
            )}
            {state.isError && !state.data ? (
              <div className="p-6">
                <ErrorState error={state.error} onRetry={() => void state.refetch()} />
              </div>
            ) : data.services.length > 0 || data.topology ? (
              <StudioObservability
                data={data}
                selected={canvasSelected}
                onSelect={(svc) => {
                  studio.setService(svc);
                  if (svc) {
                    setSetupPanel("service");
                    setRightCardMode("service");
                    setShowRight(true);
                  }
                }}
                busy={isPreviewMode ? false : busy}
                canvasOnly
                defaultView="2D"
                surfaceTheme={studioTheme}
                nodeNames={nodeNames}
                {...(configuredEdges && configuredEdges.length > 0 ? { configuredEdges } : {})}
                onConnect={connect}
                onDisconnect={disconnect}
                onQuickAction={quickAction}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className={`max-w-md space-y-3 rounded-2xl border p-6 shadow-sm ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950/70 text-slate-100"}`}>
                  <Server aria-hidden="true" className="mx-auto size-8 text-primary" />
                  <p className="text-base font-bold">
                    {t("No live Docker session running yet", "Chưa có phiên Docker chạy trực tiếp")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Start the live sandbox to boot the real microservices on this canvas.", "Bấm Run để khởi động các microservice thật ngay trên sơ đồ này.")}
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

            {/* TOP-LEFT FLOATING YELLOW STICKY MISSION NOTE (GonnaCrash Signature) */}
            {!missionHidden && (
              <div
                aria-label={t("Lab Mission", "Mục tiêu Lab")}
                className={`pointer-events-auto absolute top-4 left-4 z-20 w-72 rounded-xl border shadow-md transition-all ${
                  isLight
                    ? "border-amber-400/80 bg-[#FEF08A]/95 text-[#1C1917]"
                    : "border-amber-500/40 bg-amber-950/90 text-amber-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-tight">
                    <Target className="size-3.5 shrink-0" aria-hidden="true" />
                    {t("Mission", "Mục tiêu")}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setMissionCollapsed((c) => !c)}
                      aria-label={missionCollapsed ? t("Expand mission", "Mở rộng mục tiêu") : t("Collapse mission", "Thu gọn mục tiêu")}
                      className="rounded p-1 opacity-75 hover:bg-black/10 hover:opacity-100"
                    >
                      {missionCollapsed ? (
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronUp className="size-3.5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissionHidden(true)}
                      aria-label={t("Hide mission note", "Ẩn tờ mục tiêu")}
                      className="rounded p-1 opacity-75 hover:bg-black/10 hover:opacity-100"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {!missionCollapsed && (
                  <div className="space-y-2.5 border-t border-amber-500/25 px-3.5 pt-2.5 pb-3 text-xs leading-relaxed">
                    <p className="font-medium">{effectiveMissionInstructions}</p>
                    <ul className="space-y-1.5 pt-0.5 text-xs">
                      <li className="flex items-center justify-between gap-2">
                        <span>{t("Run a live Docker action", "Thực hiện 1 thao tác Docker")}</span>
                        <span className={`font-bold ${hasConfirmedAction ? "text-emerald-700 dark:text-emerald-300" : "opacity-60"}`}>
                          {hasConfirmedAction ? "✓" : "○"}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span>{t("Capture evidence Snapshot", "Chụp Snapshot minh chứng")}</span>
                        <span className={`font-mono font-bold ${snapshotCount > 0 ? "text-emerald-700 dark:text-emerald-300" : "opacity-60"}`}>
                          {snapshotCount > 0 ? `${snapshotCount} ✓` : "0/1"}
                        </span>
                      </li>
                      {missionMaxErr != null && (
                        <li className="flex items-center justify-between gap-2">
                          <span>{t(`Error rate ≤ ${missionMaxErr}%`, `Tỉ lệ lỗi ≤ ${missionMaxErr}%`)}</span>
                          <span
                            className={`font-mono font-bold ${
                              liveErrorPct == null
                                ? "opacity-60"
                                : liveErrorPct <= missionMaxErr
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {liveErrorPct != null ? `${liveErrorPct}% ${liveErrorPct <= missionMaxErr ? "✓" : "✕"}` : "—"}
                          </span>
                        </li>
                      )}
                      {missionMaxP95 != null && (
                        <li className="flex items-center justify-between gap-2">
                          <span>{t(`P95 latency ≤ ${missionMaxP95} ms`, `Độ trễ P95 ≤ ${missionMaxP95} ms`)}</span>
                          <span
                            className={`font-mono font-bold ${
                              liveP95Ms == null
                                ? "opacity-60"
                                : liveP95Ms <= missionMaxP95
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {liveP95Ms != null ? `${liveP95Ms}ms ${liveP95Ms <= missionMaxP95 ? "✓" : "✕"}` : "—"}
                          </span>
                        </li>
                      )}
                      {missionMinReplicas && missionMinReplicas.length > 0 &&
                        missionMinReplicas.map((req, idx) => {
                          const svc = req.service ?? "";
                          const targetCount = req.count ?? 1;
                          const cur = runningFor(data, svc) ?? 0;
                          const ok = cur >= targetCount;
                          return (
                            <li key={`${svc}-${idx}`} className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono">{svc} ≥ {targetCount}x</span>
                              <span className={`font-mono font-bold ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                                {cur}x {ok ? "✓" : "✕"}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* BOTTOM-LEFT FLOATING LIVE STATUS & ACTION CARD (GonnaCrash Signature) */}
            {bottomCollapsed && (
              <div
                className={`pointer-events-auto absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-lg backdrop-blur-md ${
                  isLight
                    ? "border-slate-300 bg-white/95 text-slate-900"
                    : "border-slate-700 bg-[#0d1422]/95 text-slate-100"
                }`}
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-extrabold uppercase tracking-wide ${
                    missionCard?.verified || data.executionStatus === "COMPLETED"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : faultedServices.length > 0
                        ? "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : data.executionStatus === "RUNNING"
                          ? "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                          : "border-slate-400/50 bg-slate-500/10 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {missionCard?.verified || data.executionStatus === "COMPLETED"
                    ? t("VERIFIED", "ĐÃ XÁC MINH")
                    : faultedServices.length > 0
                      ? t("IMPACT ACTIVE", "ĐANG SỰ CỐ")
                      : data.executionStatus === "RUNNING"
                        ? t("LIVE", "ĐANG CHẠY")
                        : t("STANDBY", "SẴN SÀNG")}
                </span>
                <span className="max-w-60 truncate text-xs font-medium text-muted-foreground">
                  {faultedServices.length > 0
                    ? t(
                        `${faultedServices.join(", ")} faulted — click a node or view impact`,
                        `${faultedServices.join(", ")} đang sự cố — xem chẩn đoán`,
                      )
                    : data.executionStatus === "RUNNING"
                      ? t("Click any microservice to inject fault or scale", "Bấm vào service để tiêm lỗi hoặc scale")
                      : t("Click Run to start live Docker containers", "Bấm Run để khởi chạy Docker thật")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRightCardMode("diagnostics");
                    setShowRight(true);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    isLight
                      ? "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {t("Why / Impact", "Xem tác động")}
                </button>
                {missionCard?.verified && missionCard.submitHref && (
                  <Button asChild size="sm" className="h-7 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                    <Link href={missionCard.submitHref}>
                      {t("Submit Lab", "Nộp bài")}
                      <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </div>
            )}

            {/* BOTTOM-RIGHT FLOATING LOGS & TRACES DRAWER PILL (Next to StudioObservability's 2D/3D/Zoom Pill) */}
            {bottomCollapsed && (
              <button
                type="button"
                onClick={() => {
                  setTab("logs");
                  setBottomCollapsed(false);
                }}
                className={`pointer-events-auto absolute right-[258px] bottom-4 z-20 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition ${
                  isLight
                    ? "border-slate-300 bg-white/95 text-slate-800 hover:bg-slate-50"
                    : "border-slate-700/80 bg-slate-950/90 text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Terminal className="size-3.5 text-primary" aria-hidden="true" />
                <span>{t("Logs & Traces", "Logs & Traces")}</span>
                {logsAndTracesCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.2 font-mono text-[11px] font-bold text-primary">
                    {logsAndTracesCount}
                  </span>
                )}
                {(terminalAlertSignal || isBooting) && (
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${
                      terminalAlertSignal ? "bg-rose-500" : "animate-pulse bg-amber-500"
                    }`}
                  />
                )}
              </button>
            )}
          </div>

          {/* SLIDE-UP BOTTOM TELEMETRY, LOGS & SNAPSHOTS DRAWER (Hidden by default so canvas gets 90% of viewport) */}
          {!bottomCollapsed && (
          <>
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Resize telemetry dock"
            aria-valuenow={bottomHeight}
            aria-valuemin={120}
            aria-valuemax={540}
            title="Drag up/down to resize Logs & Telemetry drawer"
            onPointerDown={(event) => startResize("bottom", event)}
            onDoubleClick={() => setBottomCollapsed(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setBottomHeight((h) => Math.min(540, h + 20));
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setBottomHeight((h) => Math.max(120, h - 20));
              }
            }}
            className={`group relative flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y transition-colors hover:bg-primary/25 ${
              isLight ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-950"
            }`}
          >
            <div className="h-0.5 w-10 rounded-full bg-slate-400 group-hover:bg-primary" />
          </div>

          <div
            style={{ height: bottomHeight }}
            className={`flex min-w-0 shrink-0 flex-col overflow-hidden bg-[#0b101b] text-slate-100 ${
              resizingAxis === "bottom" ? "" : "transition-[height] duration-150"
            }`}
          >
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-800 px-3">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["stats", "Stats", "Stats"],
                  [
                    "telemetry",
                    `Telemetry (${observedData.services.length})`,
                    `Service Telemetry & Impact (${observedData.services.length})`,
                  ],
                  [
                    "logs",
                    `Logs & Traces (${logsAndTracesCount})`,
                    `Logs & Traces (${logsAndTracesCount})`,
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
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${
                    tab === id
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {id === "logs" && (terminalAlertSignal || isBooting) && (
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${
                          terminalAlertSignal
                            ? "bg-rose-400"
                            : "animate-pulse bg-amber-400"
                        }`}
                      />
                    )}
                  </span>
                </button>
              ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pl-1 text-[10px] text-slate-500">
                <span className="hidden whitespace-nowrap rounded-full border border-slate-800 bg-slate-950/70 px-2 py-0.5 font-mono text-slate-300 2xl:inline-flex">
                  {data.finishRequested
                    ? "Finishing"
                    : waiting
                      ? "Waiting for Runner"
                      : statusLabel}
                </span>
                {data.telemetry?.probe && (
                  <span
                    className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 font-mono text-emerald-200 lg:inline-flex"
                    title="Continuous live probe RED metrics"
                  >
                    <span>{metric(data.telemetry.probe.rps)} RPS</span>
                    {data.telemetry.probe.p95Ms != null && (
                      <span>· p95 {metric(data.telemetry.probe.p95Ms)}ms</span>
                    )}
                    <span
                      className={
                        data.telemetry.probe.errorRatePercent > 0 ? "text-rose-300" : "text-emerald-300"
                      }
                    >
                      · {metric(data.telemetry.probe.errorRatePercent)}% err
                    </span>
                  </span>
                )}
                {studio.sseConnected && (
                  <span
                    className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-500/30 bg-sky-950/40 px-1.5 py-0.5 font-mono text-[9px] text-sky-300 xl:inline-flex"
                    title="Real-time SSE telemetry stream connected"
                  >
                    <span className="size-1.5 rounded-full bg-sky-400" />
                    SSE
                  </span>
                )}
                {data.telemetry?.observedAt && (
                  <span
                    className={`hidden shrink-0 items-center gap-1 whitespace-nowrap 2xl:inline-flex ${
                      telemetryStale ? "text-amber-300" : ""
                    }`}
                    title={
                      telemetryStale
                        ? "No telemetry update received in over 10 seconds"
                        : "Last telemetry frame observed"
                    }
                  >
                    <RefreshCw aria-hidden="true" className="size-3" />
                    {new Date(data.telemetry.observedAt).toLocaleTimeString()}
                    {telemetryStale && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                        Stale
                      </span>
                    )}
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
                <button
                  type="button"
                  aria-label={t("Close logs drawer", "Đóng ngăn Logs & Telemetry")}
                  title={t("Close drawer", "Đóng")}
                  onClick={() => setBottomCollapsed(true)}
                  className="grid size-6 shrink-0 place-items-center rounded border border-slate-800 bg-slate-950/70 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-100"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            </div>
            {!bottomCollapsed && (
            <div
              style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 #0b101b" }}
              className={
                tab === "logs"
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2"
                  : "min-h-0 min-w-0 flex-1 overflow-auto px-3 py-2.5"
              }
            >
          {tab === "stats" && (() => {
            const observedRunningReplicas = observedData.services.reduce(
              (sum, service) => sum + (runningFor(observedData, service) ?? 0),
              0,
            );
            const hasAnyReplicaSample = observedData.services.some(
              (service) => runningFor(observedData, service) !== undefined,
            );
            const downServicesCount = blocks.filter(
              (b) => runningFor(observedData, b.service) === 0,
            ).length;
            const liveProbe = observedData.telemetry?.probe;
            const observedConfirmed = observedData.actions.filter(
              (item) => item.status === "CONFIRMED" && item.result,
            );
            const observedLastConfirmed = observedConfirmed[observedConfirmed.length - 1];
            const rawReq = observedLastConfirmed?.result?.metricsAfter["requestCount"];
            const rawP95 = observedLastConfirmed?.result?.metricsAfter["p95LatencyMs"];
            const rawErr = observedLastConfirmed?.result?.metricsAfter["errorRatePercent"];
            const reqNum =
              liveProbe && liveProbe.requests > 0
                ? liveProbe.requests
                : typeof rawReq === "number" && Number.isFinite(rawReq)
                  ? rawReq
                  : null;
            const p95Num =
              liveProbe && liveProbe.p95Ms != null && Number.isFinite(liveProbe.p95Ms)
                ? liveProbe.p95Ms
                : typeof rawP95 === "number" && Number.isFinite(rawP95)
                  ? rawP95
                  : null;
            const errNum =
              liveProbe && liveProbe.requests > 0 && Number.isFinite(liveProbe.errorRatePercent)
                ? liveProbe.errorRatePercent
                : typeof rawErr === "number" && Number.isFinite(rawErr)
                  ? rawErr
                  : null;
            const spanCount = observedData.telemetry?.spans.length ?? 0;

            let totalCpuPct = 0;
            let cpuSamples = 0;
            let peakCpu = -1;
            let peakCpuService = "";
            let totalRamUsedMiB = 0;
            let totalRamLimitMiB = 0;
            let totalVcpuAllocated = 0;

            const cpusPerPod = observedData.limits?.cpus ?? 1;
            const memPerPodMiB = observedData.limits?.memoryMiB ?? 1024;
            for (const block of blocks) {
              const rep = runningFor(observedData, block.service) ?? 0;
              if (rep > 0) {
                totalVcpuAllocated += cpusPerPod * rep;
                totalRamLimitMiB += memPerPodMiB * rep;
              }
              const obs = observedData.telemetry?.services.find((s) => s.service === block.service);
              let svcCpu = 0;
              let hasSvcCpu = false;
              for (const st of obs?.stats ?? []) {
                const cm = st.cpu?.match(/[\d.]+/);
                if (cm) {
                  const v = Number(cm[0]);
                  if (Number.isFinite(v)) {
                    svcCpu += v;
                    hasSvcCpu = true;
                  }
                }
                if (st.memory) {
                  const [usedPart, limPart] = st.memory.split("/");
                  totalRamUsedMiB += parseLiveMemMiB(usedPart);
                  if (observedData.limits?.memoryMiB === undefined && limPart) {
                    const parsedLim = parseLiveMemMiB(limPart);
                    if (parsedLim > 0 && rep === 0) totalRamLimitMiB += parsedLim;
                  }
                }
              }
              if (hasSvcCpu) {
                totalCpuPct += svcCpu;
                cpuSamples += 1;
                if (svcCpu > peakCpu) {
                  peakCpu = svcCpu;
                  peakCpuService = block.label || block.service;
                }
              }
            }
            const avgCpuPct = cpuSamples > 0 ? totalCpuPct / cpuSamples : 0;
            const maxPoolVcpu = Math.max(totalVcpuAllocated, blocks.length * 2, 4);
            const ramPoolMiB = Math.max(totalRamLimitMiB, blocks.length * 1024, 1024);
            const cpuBarPct = cpuSamples > 0
              ? Math.min(100, Math.max(2, totalCpuPct / Math.max(1, totalVcpuAllocated)))
              : Math.min(100, (totalVcpuAllocated / maxPoolVcpu) * 100);
            const ramBarPct = Math.min(100, (totalRamUsedMiB / ramPoolMiB) * 100);

            return (
              <section
                className="mavis-tabular mx-auto max-w-6xl space-y-4 px-1 py-1"
                aria-labelledby="live-cluster-overview"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <h2 id="live-cluster-overview" className="text-base font-semibold text-slate-100">
                    Cluster Overview
                  </h2>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {[
                        ["Error rate", errNum !== null ? `${metric(errNum)}%` : "—"],
                        ["Running pods", hasAnyReplicaSample ? observedRunningReplicas.toLocaleString() : "—"],
                        ["Services down", downServicesCount.toLocaleString()],
                        ["Confirmed actions", observedConfirmed.length.toLocaleString()],
                      ].map(([kLabel, kValue]) => (
                        <div key={kLabel} className="flex items-baseline gap-2">
                          <dt className="text-slate-400">{kLabel}</dt>
                          <dd className="font-semibold tabular-nums text-slate-200">{kValue}</dd>
                        </div>
                      ))}
                    </dl>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                        lastSessionFailed
                          ? "bg-rose-500/15 text-rose-300"
                          : downServicesCount
                            ? "bg-rose-500/15 text-rose-300"
                            : isTelemetryPreview
                              ? "bg-sky-500/15 text-sky-300"
                              : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {lastSessionFailed
                        ? isTimedOut
                          ? "Timed out"
                          : "Failed"
                        : downServicesCount
                          ? `${downServicesCount} down`
                          : isTelemetryPreview
                            ? "Setup preview"
                            : blocks.length
                              ? "Healthy"
                              : "No services"}
                    </span>
                  </div>
                </header>

                <StudioRedCharts
                  history={observedData.telemetryHistory}
                  actions={observedData.actions}
                  serviceGraph={observedData.telemetry?.serviceGraph}
                  spans={observedData.telemetry?.spans}
                  onSelectTrace={(tid) => {
                    setInspectedTraceId(tid);
                    setTab("logs");
                  }}
                />

                <section aria-label="Traffic & reliability">
                  <h3 className="mb-2 text-xs font-semibold text-slate-200">
                    Traffic &amp; reliability
                  </h3>
                  <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-2">
                    {[
                      {
                        label: "Measured requests",
                        value: reqNum !== null ? reqNum.toLocaleString() : "—",
                        unit: reqNum !== null ? "req" : "",
                        detail:
                          reqNum !== null
                            ? "Latest probe workload"
                            : observedData.executionStatus === "RUNNING"
                              ? "Live Docker running — awaiting probe traffic"
                              : isBooting
                                ? "Booting Live Docker containers…"
                                : "Start Live Docker to measure",
                        warning: false,
                      },
                      {
                        label: "Observed E2E p95",
                        value: p95Num !== null ? metric(p95Num) : "—",
                        unit: p95Num !== null ? "ms" : "",
                        detail: "Measured from live probe",
                        warning: p95Num !== null && p95Num > 500,
                      },
                      {
                        label: "Error rate",
                        value: errNum !== null ? metric(errNum) : "—",
                        unit: errNum !== null ? "%" : "",
                        detail: "HTTP 5xx & failed spans",
                        warning: errNum !== null && errNum > 0,
                      },
                      {
                        label: "Observed spans",
                        value: spanCount.toLocaleString(),
                        unit: "spans",
                        detail: "Live OpenTelemetry traces",
                        warning: false,
                      },
                    ].map(({ label, value, unit, detail, warning }) => (
                      <div
                        key={label}
                        className="rounded-lg border border-slate-700/80 bg-slate-900 p-3"
                      >
                        <dt className="text-xs font-medium text-slate-300">{label}</dt>
                        <dd
                          className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                            warning ? "text-rose-300" : "text-slate-100"
                          }`}
                        >
                          {value}{" "}
                          {unit && <span className="text-[11px] text-slate-400">{unit}</span>}
                          <span className="mt-1 block font-sans text-[11px] font-normal text-slate-400">
                            {detail}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section aria-label="Resource capacity">
                  <h3 className="mb-2 text-xs font-semibold text-slate-200">Resource capacity</h3>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-2">
                    {[
                      {
                        label: "CPU allocation",
                        rightText: `${Number(totalVcpuAllocated.toFixed(1))} / ${maxPoolVcpu} vCPU`,
                        pct: cpuBarPct,
                        detail:
                          cpuSamples > 0
                            ? `${avgCpuPct.toFixed(1)}% average CPU load${peakCpuService ? ` · Highest: ${peakCpuService}` : ""}`
                            : `${observedRunningReplicas} pod(s) allocated · live CPU measured when Docker runs`,
                      },
                      {
                        label: "RAM usage",
                        rightText: `${Math.round(totalRamUsedMiB).toLocaleString()} / ${Math.round(ramPoolMiB).toLocaleString()} MiB`,
                        pct: ramBarPct,
                        detail: `${Math.max(0, Math.round(ramPoolMiB - totalRamUsedMiB)).toLocaleString()} MiB available across ${observedRunningReplicas} pod(s)`,
                      },
                    ].map(({ label, rightText, pct, detail }) => (
                      <div
                        key={label}
                        className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900 p-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">{label}</span>
                          <span className="font-mono text-xs tabular-nums text-slate-300">
                            {rightText}
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-sky-400 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                        <p className="break-words text-[11px] text-slate-400">{detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                  {checklist.map(([label, done]) => (
                    <div
                      key={label}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
                        done
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-800 bg-slate-900/70 text-slate-400"
                      }`}
                    >
                      <span className="font-mono">{done ? "✓" : "○"}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {observedData.actions.length > 0 && (
                  <ol className="space-y-1.5 text-[11px]">
                    {observedData.actions.map((item) => (
                      <li
                        key={item.actionId}
                        className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5"
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
              </section>
            );
          })()}

          {tab === "telemetry" && (() => {
            const observedDate = observedData.telemetry?.observedAt
              ? new Date(observedData.telemetry.observedAt)
              : null;
            const observedLabel =
              observedDate && Number.isFinite(observedDate.getTime())
                ? `Observed ${observedDate.toLocaleTimeString()}${
                    lastSessionFailed ? (isTimedOut ? " · Timed out" : " · Failed") : ""
                  }`
                : lastSessionFailed
                  ? isTimedOut
                    ? "Session timed out · Check Logs & Traces"
                    : "Session failed · Check Logs & Traces"
                  : observedData.executionStatus.toUpperCase() === "CANCELLED"
                    ? "Session cancelled"
                    : isTelemetryPreview
                      ? mutationError
                        ? "Preview · Start failed — check Logs & Traces"
                        : "Preview · Live metrics populate when Docker runs"
                      : "Waiting for container telemetry";

            const rows = observedData.services.map((service) => {
              const telemetry = observedData.telemetry?.services.find(
                (item) => item.service === service,
              );
              const agg = summarizeServiceStats(telemetry?.stats);
              const running = runningFor(observedData, service);
              const desired = telemetry?.replicas;
              const result = lastResultFor(observedData, service);
              const svcLimit = observedData.limits?.services?.[service];
              const netStats = (telemetry?.stats ?? [])
                .map((st) => st.network?.trim())
                .filter((v): v is string => Boolean(v));
              const netIo =
                netStats.length === 0
                  ? "—"
                  : netStats.length === 1
                    ? netStats[0]!
                    : `${netStats[0]} (+${netStats.length - 1})`;
              const serviceSpans = (observedData.telemetry?.spans ?? []).filter(
                (span) => span.runtimeService === service,
              );
              const errorSpanCount = serviceSpans.filter(
                (span) =>
                  span.spanStatus?.toUpperCase() === "ERROR" ||
                  (span.httpStatusCode ?? 0) >= 500 ||
                  span.circuitOpen === true,
              ).length;
              const spanDurationsMs = serviceSpans
                .map((span) =>
                  span.durationNanoseconds ? Number(span.durationNanoseconds) / 1e6 : NaN,
                )
                .filter((ms) => Number.isFinite(ms) && ms >= 0)
                .sort((a, b) => a - b);
              const spanP95Ms =
                spanDurationsMs.length > 0
                  ? spanDurationsMs[
                      Math.max(0, Math.ceil(spanDurationsMs.length * 0.95) - 1)
                    ]
                  : undefined;
              const spanAvgMs =
                spanDurationsMs.length > 0
                  ? spanDurationsMs.reduce((sum, ms) => sum + ms, 0) / spanDurationsMs.length
                  : undefined;
              const rawP95 = result?.metricsAfter["p95LatencyMs"];
              const e2eP95Ms =
                typeof rawP95 === "number" && Number.isFinite(rawP95) ? rawP95 : undefined;
              // Prefer per-service OTel span p95; only fall back to action E2E workload p95 when no spans exist.
              const p95Ms = spanP95Ms ?? e2eP95Ms;
              const p95SampleNote =
                spanP95Ms !== undefined
                  ? `n=${spanDurationsMs.length}`
                  : e2eP95Ms !== undefined
                    ? "E2E"
                    : undefined;
              const rawReq = result?.metricsAfter["requestCount"];
              const reqCount =
                typeof rawReq === "number" && Number.isFinite(rawReq) ? rawReq : undefined;
              const rawErr = result?.metricsAfter["errorRatePercent"];
              const errRate =
                typeof rawErr === "number" && Number.isFinite(rawErr) ? rawErr : undefined;
              const {
                label: statusLabel,
                textClass: statusClass,
                dotClass,
              } = resolveTelemetryServiceStatus({
                isPreview: isTelemetryPreview,
                running,
                executionStatus: observedData.executionStatus,
                lastSessionFailed,
                isTimedOut,
                isBooting,
              });
              return {
                service,
                telemetry,
                agg,
                running,
                desired,
                svcLimit,
                netIo,
                serviceSpans,
                errorSpanCount,
                spanAvgMs,
                p95Ms,
                p95SampleNote,
                reqCount,
                errRate,
                statusLabel,
                statusClass,
                dotClass,
              };
            });

            const activeRow = canvasSelected
              ? rows.find((row) => row.service === canvasSelected)
              : undefined;
            const outboundPeers = activeRow
              ? (data.topology?.connections ?? [])
                  .filter((conn) => conn.from === activeRow.service)
                  .map((conn) => conn.to)
              : [];
            const inboundPeers = activeRow
              ? (data.topology?.connections ?? [])
                  .filter((conn) => conn.to === activeRow.service)
                  .map((conn) => conn.from)
              : [];

            return (
              <section aria-label={t("Service telemetry", "Thông số Telemetry dịch vụ")} className="min-w-0 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold text-slate-200">
                    {t("Service Telemetry", "Thông số Dịch vụ")} ({rows.length})
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    {observedLabel} · {t("Read-only", "Chỉ đọc")}
                  </span>
                </div>

                <div className="max-w-full overflow-x-auto rounded-lg border border-slate-800">
                  <table className="mavis-tabular w-full whitespace-nowrap text-left text-xs">
                    <thead className="bg-slate-900 text-[11px] text-slate-400">
                      <tr>
                        {[
                          t("Service", "Dịch vụ"),
                          t("Status", "Trạng thái"),
                          t("Replicas", "Bản sao"),
                          "CPU",
                          "RAM",
                          t("Net I/O", "Mạng I/O"),
                          "p95",
                          t("Req / Err%", "Yêu cầu / Lỗi%"),
                          "Spans",
                        ].map((heading) => (
                          <th key={heading} scope="col" className="px-2.5 py-2 font-medium">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.map((row) => {
                        const isSelected = row.service === canvasSelected;
                        return (
                          <tr
                            key={row.service}
                            className={
                              isSelected ? "bg-sky-950/35" : "hover:bg-slate-900/80"
                            }
                          >
                            <td className="px-2.5 py-1.5">
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  studio.setService(isSelected ? "" : row.service)
                                }
                                className="inline-flex items-center gap-1.5 font-mono font-medium text-sky-200 hover:underline"
                              >
                                <span>{row.service}</span>
                                {row.svcLimit?.runtime && (
                                  <span className="rounded border border-slate-700/80 bg-slate-900 px-1 py-0.5 font-sans text-[10px] font-normal text-slate-400">
                                    {row.svcLimit.runtime}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className={`px-2.5 py-1.5 font-medium ${row.statusClass}`}>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden="true"
                                  className={`size-1.5 rounded-full ${row.dotClass}`}
                                />
                                {row.statusLabel}
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">
                              {row.running === undefined
                                ? "—"
                                : row.desired !== undefined && row.desired !== row.running
                                  ? `${row.running}/${row.desired}`
                                  : row.running}
                              {row.agg.containers > 1 && (
                                <span className="ml-1 text-[10px] text-slate-400">
                                  ({row.agg.containers} active)
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">
                              {row.agg.cpu}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">
                              {row.agg.memory}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-300">
                              {row.netIo}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">
                              {row.p95Ms !== undefined ? (
                                <span>
                                  {metric(row.p95Ms)} ms
                                  {row.p95SampleNote && (
                                    <span className="ml-1 text-[10px] text-slate-500">
                                      ({row.p95SampleNote})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-300">
                              {row.reqCount !== undefined || row.errRate !== undefined ? (
                                <span>
                                  {row.reqCount !== undefined
                                    ? `${row.reqCount.toLocaleString()} req`
                                    : "—"}
                                  {" · "}
                                  <span
                                    className={
                                      row.errRate !== undefined && row.errRate > 0
                                        ? "text-rose-300"
                                        : "text-slate-300"
                                    }
                                  >
                                    {row.errRate !== undefined
                                      ? `${metric(row.errRate)}%`
                                      : "—"}
                                  </span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-300">
                              <span>{row.serviceSpans.length}</span>
                              {row.errorSpanCount > 0 && (
                                <span className="ml-1 text-rose-300">
                                  ({row.errorSpanCount} err)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-3 text-center text-slate-500">
                            Start a Live session to observe container telemetry.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {activeRow && (
                  <div
                    aria-label={`${activeRow.service} detailed telemetry`}
                    className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-100">
                          {activeRow.service}
                        </span>
                        <span className={`text-[11px] font-medium ${activeRow.statusClass}`}>
                          {activeRow.statusLabel}
                        </span>
                        {activeRow.svcLimit && (
                          <span className="font-mono text-[11px] text-slate-400">
                            :{activeRow.svcLimit.containerPort} {activeRow.svcLimit.readinessPath}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        {observedData.limits?.cpus !== undefined && (
                          <span className="font-mono">
                            Quota: {observedData.limits.cpus} vCPU
                            {observedData.limits.memoryMiB !== undefined
                              ? ` · ${observedData.limits.memoryMiB} MiB`
                              : ""}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => studio.setService("")}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <dl className="mavis-tabular grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 lg:grid-cols-6">
                      {[
                        [
                          "Replicas",
                          activeRow.running === undefined
                            ? "—"
                            : activeRow.desired !== undefined
                              ? `${activeRow.running} / ${activeRow.desired} ready`
                              : String(activeRow.running),
                        ],
                        ["CPU", activeRow.agg.cpu],
                        ["RAM", activeRow.agg.memory],
                        ["Net I/O", activeRow.netIo],
                        [
                          "Latency (p95 / avg)",
                          activeRow.p95Ms !== undefined
                            ? `${metric(activeRow.p95Ms)} ms${
                                activeRow.spanAvgMs !== undefined
                                  ? ` / ${metric(activeRow.spanAvgMs)} ms`
                                  : ""
                              }`
                            : "—",
                        ],
                        [
                          "Spans / Errors",
                          `${activeRow.serviceSpans.length} / ${activeRow.errorSpanCount}`,
                        ],
                      ].map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5"
                        >
                          <dt className="text-[10px] text-slate-400">{k}</dt>
                          <dd className="mt-0.5 font-mono text-xs text-slate-100">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    {(activeRow.telemetry?.stats.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Containers ({activeRow.telemetry!.stats.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeRow.telemetry!.stats.map((st, idx) => (
                            <span
                              key={st.containerId ?? idx}
                              className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[10.5px] text-slate-300"
                            >
                              {st.containerId ? st.containerId.slice(0, 12) : `pod-${idx + 1}`}
                              {" · CPU "}
                              {st.cpu?.trim() || "—"}
                              {" · RAM "}
                              {st.memory?.trim() || "—"}
                              {st.network?.trim() ? ` · Net ${st.network.trim()}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(outboundPeers.length > 0 || inboundPeers.length > 0) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        {outboundPeers.length > 0 && (
                          <span>
                            Calls →{" "}
                            <span className="font-mono text-slate-200">
                              {outboundPeers.join(", ")}
                            </span>
                          </span>
                        )}
                        {inboundPeers.length > 0 && (
                          <span>
                            Called by ←{" "}
                            <span className="font-mono text-slate-200">
                              {inboundPeers.join(", ")}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

          <div className={tab === "logs" ? "flex h-full min-h-0 flex-1 flex-col" : "hidden"}>
            <LiveTerminalConsole
              data={terminalData}
              projectName={projectName}
              isPreviewMode={isPreviewMode && !lastSessionFailed}
              isBooting={isBooting}
              waiting={waiting}
              statusLabel={statusLabel}
              systemError={terminalSystemError}
              diagnosticLines={failedDiagnostics}
              selectedTraceId={inspectedTraceId}
              onSelectTrace={setInspectedTraceId}
            />
          </div>

          {tab === "snapshots" && (
            <section aria-label="Snapshots and runtime recording" className="space-y-3">
              {/* Compact Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-100">
                    Snapshots &amp; Runtime Recording
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Capture topology screenshots (PNG) or record live runtime traffic flows between services.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {recordingSteps > 0 && (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[11px] text-rose-200"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 animate-pulse rounded-full bg-rose-400"
                      />
                      Recording · {recordingSeconds}s · {recordingSteps} frames
                    </span>
                  )}
                  {data.receiptDigest && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-slate-600 bg-slate-900 px-2.5 text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white"
                      onClick={() => void downloadReceipt()}
                    >
                      {data.receiptSignature ? "Download signed receipt" : "Download receipt"}
                    </Button>
                  )}
                </div>
              </div>

              {!authoring && data.actions.length === 0 && !isPreviewMode && (
                <p
                  role="note"
                  className="rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200"
                >
                  BR-08 (INCOMPLETE_SCENARIO guard): Execute at least one Start, Stop, or Scale action on a live service before
                  sealing your signed receipt.
                </p>
              )}

              {/* Single-row Capture & Record Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  ref={snapshotNoteRef}
                  aria-label="Explain the observed behavior"
                  placeholder="Observation note (required for signed evidence snapshot)…"
                  value={explanation}
                  maxLength={4000}
                  onChange={(event) => setExplanation(event.target.value)}
                  className="h-8 min-w-52 flex-1 border-slate-700/80 bg-slate-950 text-xs text-slate-100 placeholder:text-slate-500"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={capturingScreen || blocks.length === 0}
                  onClick={() => void captureCanvasScreenshot()}
                  className="h-8 border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  <Camera aria-hidden="true" className="mr-1.5 size-3.5" />
                  {capturingScreen ? "Capturing…" : "Screenshot PNG"}
                </Button>

                {recordingSteps === 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPreviewMode || data.executionStatus !== "RUNNING" || savingReplay}
                    title={
                      isPreviewMode || data.executionStatus !== "RUNNING"
                        ? "Start Live Docker first to record live runtime service-to-service traffic"
                        : "Record live canvas video + traffic flow timeline"
                    }
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
                  className="h-8 px-2.5 text-[11px]"
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

              {(downloadError || replayError) && (
                <p role="alert" className="text-[11px] text-rose-300">
                  {downloadError?.message ?? replayError}
                </p>
              )}

              {/* Live / Configured Runtime Call Flow Strip */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-300">
                    {runtimeFlows.some((f) => f.observed)
                      ? `Observed Runtime Traffic Flows (${runtimeFlows.length})`
                      : `Active Service Routes (${runtimeFlows.length})`}
                  </span>
                  <span className="text-[10.5px] text-slate-400">
                    {runtimeFlows.some((f) => f.observed)
                      ? "Live service-to-service calls captured in video & replay checkpoints"
                      : isPreviewMode
                        ? "Screenshot works now · Start Live Docker to record live animated traffic video"
                        : "Waiting for live requests between services…"}
                  </span>
                </div>
                {runtimeFlows.length > 0 ? (
                  <ul
                    aria-label="Runtime traffic flows"
                    className="flex flex-wrap gap-1.5 font-mono text-[10.5px]"
                  >
                    {runtimeFlows.map((flow) => (
                      <li
                        key={`${flow.from}-${flow.to}`}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                          flow.hasError
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : flow.observed
                              ? "border-sky-500/35 bg-sky-500/10 text-sky-100"
                              : "border-slate-800 bg-slate-900/70 text-slate-300"
                        }`}
                      >
                        <span className="font-semibold text-sky-300">{flow.from}</span>
                        <span className="text-slate-500">→</span>
                        <span className="font-semibold text-emerald-300">{flow.to}</span>
                        <span className="text-slate-400">· {flow.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    No active routes or trace calls observed yet.
                  </p>
                )}
              </div>

              {firstConfirmed?.result && lastConfirmed?.result && (
                <div className="mavis-tabular rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-[10.5px]">
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
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-300">
                    Screenshots &amp; Runtime Recordings ({liveReplays.length})
                  </p>
                  <div className="grid gap-2.5 lg:grid-cols-2">
                    {liveReplays.map((replayItem) => {
                      const isScreenshot = replayItem.kind === "LIVE_SCREENSHOT";
                      return (
                        <div
                          key={replayItem.id}
                          className={`space-y-2 rounded-lg border bg-slate-950/75 p-2.5 text-[10.5px] ${
                            isScreenshot ? "border-emerald-500/30" : "border-sky-500/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${
                                    isScreenshot
                                      ? "bg-emerald-500/15 text-emerald-300"
                                      : "bg-sky-500/15 text-sky-300"
                                  }`}
                                >
                                  {isScreenshot ? "SCREENSHOT" : "RUNTIME VIDEO"}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(replayItem.capturedAt).toLocaleString()}
                                  {!isScreenshot && ` · ${replayItem.replay.length} frames`}
                                  {replayItem.durationMs
                                    ? ` · ${(replayItem.durationMs / 1000).toFixed(1)}s`
                                    : ""}
                                </span>
                              </div>
                              <p className="mt-1 font-medium text-slate-200">
                                {replayItem.explanation}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeLiveReplay(replayItem.id)}
                              aria-label={isScreenshot ? "Delete screenshot" : "Delete runtime replay"}
                              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                            </button>
                          </div>

                          {isScreenshot && replayItem.imageData ? (
                            <div className="space-y-1.5">
                              <img
                                src={replayItem.imageData}
                                alt="Captured runtime topology screenshot"
                                className="max-h-72 w-full rounded-md border border-slate-800 bg-[#070b14] object-contain"
                              />
                              {replayItem.frame.connections.length > 0 && (
                                <ul className="flex flex-wrap gap-1 font-mono text-[10px]">
                                  {replayItem.frame.connections.slice(0, 6).map((conn, idx) => (
                                    <li
                                      key={`${conn.from}-${conn.to}-${idx}`}
                                      className="rounded border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 text-slate-300"
                                    >
                                      <span className="text-sky-300">{conn.from}</span>
                                      <span className="mx-1 text-slate-500">→</span>
                                      <span className="text-emerald-300">{conn.to}</span>
                                      {conn.protocol && (
                                        <span className="ml-1 text-slate-400">
                                          · {conn.protocol}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <>
                              {replayItem.video && replayItem.video.size > 0 && (
                                <StudioVideo
                                  blob={replayItem.video}
                                  durationMs={replayItem.durationMs ?? 0}
                                  posterSvg={replayItem.frame.svg}
                                />
                              )}
                              <StudioEvidenceReplay frames={replayItem.replay} />
                            </>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-1.5">
                            <span className="truncate font-mono text-[9.5px] text-slate-500">
                              {replayItem.digest.slice(0, 26)}…
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isScreenshot && replayItem.imageData && (
                                <a
                                  href={replayItem.imageData}
                                  download={`mavis-screenshot-${replayItem.id.slice(0, 8)}.png`}
                                  className="inline-flex h-6 items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                                >
                                  Download PNG
                                </a>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 border-sky-500/40 bg-sky-500/10 px-2 text-[10px] text-sky-200 hover:bg-sky-500/20"
                                onClick={() => downloadStudioEvidence(replayItem)}
                              >
                                {isScreenshot ? "Download HTML" : "Download Replay HTML"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(data.snapshots?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                    Signed Session Snapshots ({data.snapshots?.length})
                  </p>
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {data.snapshots?.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[10.5px]"
                      >
                        <p className="text-slate-200">
                          {new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.explanation}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                          {snapshot.digest}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1.5 h-7 border-slate-600 bg-slate-900 px-2 text-[10.5px] text-slate-200 hover:bg-slate-800 hover:text-white"
                          onClick={() => void downloadSnapshot(snapshot.id)}
                        >
                          Download evidence
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!data.snapshots?.length && liveReplays.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No screenshots or runtime recordings captured yet.
                </p>
              )}
            </section>
          )}
            </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* FLOATING RIGHT CONTEXTUAL CARD (GonnaCrash Style — Only 1 Card Open at a Time, Close Returns 100% Canvas) */}
        {showRight && (
          <aside
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #0a0f18",
            }}
            className={`pointer-events-auto absolute top-4 right-4 z-20 flex max-h-[calc(100%-6.25rem)] w-[336px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isLight
                ? "border-slate-300 bg-white/98 text-slate-900"
                : "border-slate-700 bg-[#0d1422]/98 text-slate-100"
            }`}
          >
            {/* Floating Card Header with Close Button */}
            <div
              className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5 ${
                isLight ? "border-slate-200 bg-slate-50/90" : "border-slate-800 bg-slate-950/70"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {rightCardMode === "diagnostics" && (!authoring || setupPanel === "service")
                    ? t("Impact & Diagnostics", "Chẩn đoán Change Impact")
                    : authoring && setupPanel === "presets"
                      ? t("Scenario Setup", "Thiết lập kịch bản")
                      : authoring && setupPanel === "mission"
                        ? t("Mission Setup", "Thiết lập mục tiêu")
                        : selected || t("Service Controls", "Điều khiển Service")}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("Close panel", "Đóng thẻ")}
                onClick={() => setShowRight(false)}
                className={`rounded-lg p-1 transition ${
                  isLight ? "text-slate-500 hover:bg-slate-200 hover:text-slate-900" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
              {rightCardMode === "diagnostics" && (!authoring || setupPanel === "service") ? (
                <section aria-label={t("Change Impact Diagnostics", "Chẩn đoán Change Impact")} className="space-y-3.5 text-xs">
                  {/* Overall Status Stamp */}
                  <div
                    className={`rounded-xl border p-3 ${
                      faultedServices.length > 0
                        ? isLight ? "border-rose-200 bg-rose-50/80" : "border-rose-500/30 bg-rose-950/30"
                        : isLight ? "border-emerald-200 bg-emerald-50/80" : "border-emerald-500/30 bg-emerald-950/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold">
                        {faultedServices.length > 0 ? (
                          <AlertTriangle className="size-4 text-rose-600" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        )}
                        {faultedServices.length > 0
                          ? t("Fault & Impact Detected", "Phát hiện sự cố & lan truyền")
                          : t("All Services Healthy", "Hệ thống đang hoạt động ổn định")}
                      </span>
                      <span className="font-mono font-semibold">
                        {healthyCount}/{services.length}
                      </span>
                    </div>
                    <p className="mt-1.5 leading-relaxed opacity-85">
                      {faultedServices.length > 0
                        ? t(
                            `Faulted container(s): ${faultedServices.join(", ")}. Observe upstream errors and P95 spikes, then capture a Snapshot.`,
                            `Container gặp sự cố: ${faultedServices.join(", ")}. Quan sát lỗi dây chuyền ở dịch vụ gọi lên trên và chụp Snapshot minh chứng.`,
                          )
                        : t(
                            "Click any microservice on the canvas to stop, pause, throttle CPU, or scale replicas and watch real Docker & OpenTelemetry impact.",
                            "Bấm vào bất kỳ microservice nào trên sơ đồ để dừng, tạm ngưng, bóp CPU hoặc scale replica và theo dõi tác động thực tế qua Docker & OTel.",
                          )}
                    </p>
                  </div>

                  {/* Criteria Breakdown (GonnaCrash "Kết quả" style) */}
                  <div className="space-y-1.5">
                    <h4 className="font-bold uppercase tracking-wide text-muted-foreground">
                      {t("Live Results", "Kết quả trực tiếp")}
                    </h4>
                    <div className={`divide-y rounded-xl border ${isLight ? "divide-slate-200 border-slate-200 bg-slate-50/60" : "divide-slate-800 border-slate-800 bg-slate-900/50"}`}>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span>{t("Error Rate", "Tỉ lệ lỗi HTTP")}</span>
                        <span className={`font-mono font-bold ${liveErrorPct && liveErrorPct > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {liveErrorPct != null ? `${liveErrorPct}%` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span>P95 Latency</span>
                        <span className="font-mono font-bold">
                          {liveP95Ms != null ? `${liveP95Ms} ms` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span>{t("Confirmed Actions", "Thao tác đã xác nhận")}</span>
                        <span className="font-mono font-bold">
                          {data.actions.filter((a) => a.status === "CONFIRMED").length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span>{t("Sealed Snapshots", "Snapshot minh chứng")}</span>
                        <span className="font-mono font-bold">{snapshotCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Action Timeline (GonnaCrash "Diễn biến" style) */}
                  <div className="space-y-1.5">
                    <h4 className="font-bold uppercase tracking-wide text-muted-foreground">
                      {t("Timeline", "Diễn biến")}
                    </h4>
                    {data.actions.length > 0 ? (
                      <ul className="space-y-1.5">
                        {data.actions.slice(-5).reverse().map((act) => (
                          <li
                            key={act.actionId}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-xs ${
                              isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-900/60"
                            }`}
                          >
                            <span className="truncate font-semibold">
                              {act.action} {act.service}
                            </span>
                            <span
                              className={
                                act.status === "CONFIRMED"
                                  ? "text-emerald-600"
                                  : act.status === "FAILED"
                                    ? "text-rose-600"
                                    : "text-amber-600"
                              }
                            >
                              {act.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">
                        {t("No Docker actions executed yet.", "Chưa có thao tác Docker nào được chạy.")}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setTab("logs");
                        setBottomCollapsed(false);
                      }}
                    >
                      <Terminal className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("Open Logs & Traces", "Mở Logs & Traces")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setRightCardMode("service")}
                    >
                      {t("Control Service", "Điều khiển Service")}
                    </Button>
                  </div>
                </section>
              ) : (
              <div className="dark rounded-xl bg-[#0a0f18] p-2.5 text-slate-100">
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
              <div className="space-y-3">
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
                {!isPreviewMode && selected && data.executionStatus === "RUNNING" && (
                  <section
                    aria-label="Live Docker fault injection"
                    className="space-y-2 rounded-lg border border-amber-500/25 bg-slate-900/70 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-200">Fault Injection (Docker)</span>
                      <code className="font-mono text-[10px] text-slate-400">{selected}</code>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || (runningFor(data, selected) ?? 0) === 0}
                        onClick={() => void studio.send("PAUSE", selected)}
                        className="h-7 whitespace-nowrap border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200 hover:bg-amber-500/20"
                      >
                        Pause (Freeze)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || (runningFor(data, selected) ?? 1) > 0}
                        onClick={() => void studio.send("RESUME", selected)}
                        className="h-7 whitespace-nowrap border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Resume
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        CPU Throttle (cgroup)
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[25, 50, 100].map((pct) => (
                          <Button
                            key={pct}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || (runningFor(data, selected) ?? 0) === 0}
                            onClick={() => void studio.send("THROTTLE_CPU", selected, undefined, pct)}
                            className="h-7 whitespace-nowrap border-slate-700 bg-slate-950/60 font-mono text-[11px] text-slate-200 hover:border-sky-400"
                          >
                            {pct}%
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 border-t border-slate-800 pt-2">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                        <span>Live Probe Load (RPS)</span>
                        <span className="font-mono text-sky-300">
                          {data.telemetry?.probe?.targetRps ?? 5} RPS
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[5, 15, 30, 50].map((rps) => (
                          <Button
                            key={rps}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void studio.send("SET_LOAD", selected, undefined, undefined, rps)
                            }
                            className={`h-7 whitespace-nowrap font-mono text-[11px] ${
                              data.telemetry?.probe?.targetRps === rps
                                ? "border-sky-400 bg-sky-500/20 text-sky-200"
                                : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-sky-400"
                            }`}
                          >
                            {rps}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
                {!isPreviewMode &&
                  studio.services.length > 0 &&
                  (data.executionStatus === "RUNNING" || Boolean(data.exerciseEvaluation)) && (
                    <StudioExercisePanel
                      data={data}
                      services={studio.services}
                      busy={busy}
                      submittingPrediction={studio.prediction.isPending}
                      onLockPrediction={(svcs, rationale) =>
                        studio.submitPrediction(svcs, rationale)
                      }
                      onRunPrescribedChange={(kind, svc, rep, cpu, rps) =>
                        studio.send(kind, svc, rep, cpu, rps)
                      }
                    />
                  )}
              </div>
            )}
              </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* GONNACRASH-STYLE SESSION VERIFIED CELEBRATION MODAL */}
      {verifiedModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Live Session Verified", "Phiên Studio Live đã xác minh")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setVerifiedModalOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-5 rounded-3xl border border-slate-300 bg-white p-6 text-center text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {t("Verified", "Đã xác minh")}
              </span>
              <button
                type="button"
                onClick={() => setVerifiedModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label={t("Close", "Đóng")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="size-8" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">
                {t("Runtime Evidence Sealed!", "Minh chứng Runtime đã niêm phong!")}
              </h3>
              <p className="text-sm text-slate-600">
                {t(
                  "Your live Docker session and OpenTelemetry receipt are ready to attach to your Lab submission.",
                  "Phiên chạy Docker thật và biên nhận OpenTelemetry của bạn đã sẵn sàng để nộp bài Lab.",
                )}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-left">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{t("Error Rate", "Tỉ lệ lỗi")}</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                  {liveErrorPct != null ? `${liveErrorPct}%` : "0%"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">P95 Latency</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                  {liveP95Ms != null ? `${liveP95Ms} ms` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Snapshots</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700">
                  {snapshotCount}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl border-slate-300"
                onClick={() => setVerifiedModalOpen(false)}
              >
                {t("Stay on Canvas", "Ở lại sơ đồ")}
              </Button>
              {missionCard?.submitHref && (
                <Button
                  asChild
                  className="flex-1 rounded-xl bg-[#0056D2] font-semibold text-white hover:bg-[#00419E]"
                >
                  <Link href={missionCard.submitHref}>
                    {t("Submit Lab", "Nộp bài Lab")}
                    <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
