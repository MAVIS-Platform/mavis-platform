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
  GripVertical,
  History,
  Layers,
  Lightbulb,
  Maximize2,
  Minimize2,
  Palette,
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
import {
  STUDIO_STYLES,
  STUDIO_STYLE_LIST,
  resolveStudioStyle,
  type StudioStyleId,
} from "./studio-styles";

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
  // Original MAVIS Studio Live defaults: Daylight Cloud bright canvas, 90%+ open canvas, floating tool rail & bottom dock.
  const [studioStyle, setStudioStyle] = useState<StudioStyleId>("daylight");
  const styleCfg = STUDIO_STYLES[studioStyle];
  const isLight = !styleCfg.isDark;
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mavis.studio-style") ?? localStorage.getItem("mavis.studio-theme");
      if (saved) setStudioStyle(resolveStudioStyle(saved));
    } catch {
      // ignore storage restrictions
    }
  }, []);
  const setStylePersisted = (next: StudioStyleId) => {
    setStudioStyle(next);
    try {
      localStorage.setItem("mavis.studio-style", next);
    } catch {
      // ignore storage restrictions
    }
  };
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [rightCardMode, setRightCardMode] = useState<"service" | "diagnostics">("service");
  const [missionCollapsed, setMissionCollapsed] = useState(false);
  const [missionHidden, setMissionHidden] = useState(false);
  const [telemetryPopoverOpen, setTelemetryPopoverOpen] = useState(false);
  const [stylePopoverOpen, setStylePopoverOpen] = useState(false);
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
  const [rightWidth, setRightWidth] = useState(340);
  const [rightHeight, setRightHeight] = useState<number | null>(null);
  const [rightOffset, setRightOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [missionWidth, setMissionWidth] = useState(278);
  const [missionHeight, setMissionHeight] = useState<number | null>(null);
  const [missionOffset, setMissionOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [frontPanel, setFrontPanel] = useState<"right" | "mission">("right");
  const [bottomHeight, setBottomHeight] = useState(256);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const rightCardRef = useRef<HTMLElement>(null);
  const missionCardRef = useRef<HTMLDivElement>(null);
  type ResizeAxis =
    | "left"
    | "right"
    | "right-height"
    | "right-corner"
    | "mission-width"
    | "mission-height"
    | "mission-corner"
    | "bottom";
  const [resizingAxis, setResizingAxis] = useState<ResizeAxis | null>(null);
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
    axis: ResizeAxis,
    startEvent: ReactPointerEvent<HTMLDivElement>,
  ) {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    resizeCleanupRef.current?.();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const initialLeft = showLeft ? leftWidth : 0;
    const initialRight = rightCardRef.current?.getBoundingClientRect().width ?? rightWidth;
    const initialRightHeight = rightCardRef.current?.getBoundingClientRect().height ?? rightHeight ?? 480;
    const initialMissionWidth = missionCardRef.current?.getBoundingClientRect().width ?? missionWidth;
    const initialMissionHeight = missionCardRef.current?.getBoundingClientRect().height ?? missionHeight ?? 240;
    const initialBottom = bottomCollapsed ? 36 : bottomHeight;

    setResizingAxis(axis);
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      axis === "bottom" || axis === "right-height" || axis === "mission-height"
        ? "row-resize"
        : axis === "right-corner"
          ? "nesw-resize"
          : axis === "mission-corner"
            ? "nwse-resize"
            : "col-resize";

    function onPointerMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxCardW = Math.max(360, Math.min(720, window.innerWidth - 96));
      const maxCardH = Math.max(260, window.innerHeight - 104);

      if (axis === "left") {
        const raw = initialLeft + dx;
        if (raw < 90) {
          setShowLeft(false);
        } else {
          setShowLeft(true);
          setLeftWidth(Math.max(180, Math.min(560, Math.round(raw))));
        }
      } else if (axis === "right" || axis === "right-corner") {
        setRightWidth(Math.max(260, Math.min(maxCardW, Math.round(initialRight - dx))));
        if (axis === "right-corner") {
          setRightHeight(Math.max(220, Math.min(maxCardH, Math.round(initialRightHeight + dy))));
        }
      } else if (axis === "right-height") {
        setRightHeight(Math.max(220, Math.min(maxCardH, Math.round(initialRightHeight + dy))));
      } else if (axis === "mission-width" || axis === "mission-corner") {
        setMissionWidth(Math.max(210, Math.min(Math.min(520, maxCardW), Math.round(initialMissionWidth + dx))));
        if (axis === "mission-corner") {
          setMissionCollapsed(false);
          setMissionHeight(Math.max(140, Math.min(maxCardH, Math.round(initialMissionHeight + dy))));
        }
      } else if (axis === "mission-height") {
        setMissionCollapsed(false);
        setMissionHeight(Math.max(140, Math.min(maxCardH, Math.round(initialMissionHeight + dy))));
      } else {
        const raw = initialBottom - dy;
        const maxBottom = Math.max(540, Math.round(window.innerHeight * 0.78));
        if (raw < 72) {
          setBottomCollapsed(true);
        } else {
          setBottomCollapsed(false);
          setBottomHeight(Math.max(100, Math.min(maxBottom, Math.round(raw))));
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

  function startPanelDrag(
    panel: "right" | "mission",
    startEvent: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (startEvent.button !== 0) return;
    if ((startEvent.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();
    resizeCleanupRef.current?.();
    setFrontPanel(panel);

    const card = panel === "right" ? rightCardRef.current : missionCardRef.current;
    const cardRect = card?.getBoundingClientRect();
    const parentRect = (card?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const initial = panel === "right" ? rightOffset : missionOffset;
    const pw = parentRect?.width ?? window.innerWidth;
    const ph = parentRect?.height ?? window.innerHeight;
    const cw = cardRect?.width ?? (panel === "right" ? rightWidth : missionWidth);

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    function onPointerMove(moveEvent: PointerEvent) {
      const nextX = initial.x + (moveEvent.clientX - startX);
      const nextY = initial.y + (moveEvent.clientY - startY);
      const minY = -8;
      const maxY = Math.max(-8, ph - 72);
      const clampedY = Math.max(minY, Math.min(maxY, Math.round(nextY)));

      if (panel === "right") {
        const minX = 16 - Math.max(8, pw - cw - 8);
        const maxX = 8;
        setRightOffset({
          x: Math.max(minX, Math.min(maxX, Math.round(nextX))),
          y: clampedY,
        });
      } else {
        const minX = -62;
        const maxX = Math.max(-62, pw - cw - 78);
        setMissionOffset({
          x: Math.max(minX, Math.min(maxX, Math.round(nextX))),
          y: clampedY,
        });
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
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
      data-studio-style={studioStyle}
      data-studio-theme={isLight ? "light" : "dark"}
      data-theme={isLight ? "light" : "dark"}
      style={{ background: styleCfg.canvasBg }}
      className={
        expanded
          ? `fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden ${isLight ? "text-slate-900" : "dark text-slate-100"}`
          : `flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden ${isLight ? "text-slate-900" : "dark text-slate-100"}`
      }
    >
      {/* Original MAVIS Slim Single-Row Header */}
      <div
        className={`relative z-30 flex h-12 shrink-0 flex-nowrap items-center gap-2 border-b px-3 ${styleCfg.topBarClass}`}
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11.5px] font-semibold ${
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

        {/* Right Cluster: Live Metrics Popover + 4-Style Visual Picker + Settings + Mode actions */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {authoring && authoring.saved && !missionDirty && (
            <span className="hidden items-center gap-1 text-xs font-medium text-emerald-600 xl:inline-flex">
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
              className="h-8 px-2.5 text-[12.5px]"
            >
              <Save aria-hidden="true" className="mr-1 size-3.5" />
              {authoring.saving ? "Saving…" : "Save Canvas"}
            </Button>
          )}

          {/* Compact Live Metrics Summary & Session Switcher Popover */}
          <div className="relative hidden shrink-0 lg:block">
            <button
              type="button"
              onClick={() => {
                setTelemetryPopoverOpen((open) => !open);
                setStylePopoverOpen(false);
                setSettingsPopoverOpen(false);
              }}
              className={`inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-medium transition ${
                isLight
                  ? "border-slate-200 bg-slate-50/90 text-slate-800 hover:border-slate-300 hover:bg-white"
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
                {healthyCount}/{services.length || 0}
              </span>
              <span className={isLight ? "text-slate-300" : "text-slate-600"}>·</span>
              <span className="font-mono">
                {liveRps != null ? `${liveRps} rps` : `${totalRunningReplicas} pods`}
              </span>
              {liveP95Ms != null && (
                <span className="hidden font-mono xl:inline">· {liveP95Ms}ms</span>
              )}
              {liveErrorPct != null && (
                <span
                  className={`font-mono font-semibold ${
                    liveErrorPct > 0
                      ? isLight ? "text-rose-600" : "text-rose-300"
                      : isLight ? "text-emerald-700" : "text-emerald-300"
                  }`}
                >
                  · {liveErrorPct}% err
                </span>
              )}
              <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
            </button>

            {telemetryPopoverOpen && (
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-80 space-y-3 p-4 ${styleCfg.floatingCardClass}`}
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

          {/* 4-Style Architectural Visual Switcher (Daylight Cloud / Blueprint / Tactile Pop / Control Glass) */}
          <div className="relative">
            <button
              type="button"
              aria-label={t("Studio visual style", "Chọn phong cách Studio")}
              title={t("Studio visual style", "Chọn phong cách Studio")}
              onClick={() => {
                setStylePopoverOpen((open) => !open);
                setTelemetryPopoverOpen(false);
                setSettingsPopoverOpen(false);
              }}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold transition ${
                stylePopoverOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : isLight
                    ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Palette className="size-3.5 text-primary" aria-hidden="true" />
              <span className="hidden sm:inline">{t(styleCfg.name, styleCfg.nameVi)}</span>
              <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
            </button>

            {stylePopoverOpen && (
              <div
                aria-label={t("Choose Studio Style", "Chọn phong cách Studio")}
                className={`absolute right-0 top-full z-40 mt-2 w-[340px] space-y-2.5 p-3.5 ${styleCfg.floatingCardClass}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Studio Style", "Phong cách Studio")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStylePopoverOpen(false)}
                    className="rounded p-1 opacity-70 hover:opacity-100"
                    aria-label={t("Close", "Đóng")}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STUDIO_STYLE_LIST.map((id) => {
                    const item = STUDIO_STYLES[id];
                    const active = studioStyle === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setStylePersisted(id);
                          setStylePopoverOpen(false);
                        }}
                        className={`group flex flex-col overflow-hidden rounded-xl border text-left transition ${
                          active
                            ? "border-primary ring-2 ring-primary/30"
                            : isLight
                              ? "border-slate-200 hover:border-slate-400"
                              : "border-slate-700 hover:border-slate-500"
                        }`}
                      >
                        <div
                          style={{ background: item.canvasBgCss }}
                          className="relative flex h-14 w-full items-center justify-center overflow-hidden border-b border-black/10 px-2"
                        >
                          {id === "blueprint" ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-12 rounded-[3px] border border-blue-500 bg-white px-1 py-0.5 font-mono text-[7px] font-bold text-blue-900 shadow-2xs">
                                API
                              </div>
                              <div className="h-px w-4 bg-blue-500" />
                              <div className="h-6 w-12 rounded-[3px] border border-blue-500 bg-white px-1 py-0.5 font-mono text-[7px] font-bold text-emerald-700 shadow-2xs">
                                DB
                              </div>
                            </div>
                          ) : id === "pop" ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-12 rounded-md border-2 border-slate-900 bg-sky-100 px-1 py-0.5 text-[7px] font-extrabold text-slate-900 shadow-[2px_2px_0_#0f172a]">
                                API
                              </div>
                              <div className="h-0.5 w-3 bg-slate-900" />
                              <div className="h-6 w-12 rounded-md border-2 border-slate-900 bg-emerald-100 px-1 py-0.5 text-[7px] font-extrabold text-slate-900 shadow-[2px_2px_0_#0f172a]">
                                DB
                              </div>
                            </div>
                          ) : id === "control" ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-12 overflow-hidden rounded-md border border-sky-400/50 bg-slate-900/95 shadow">
                                <div className="h-1 w-full bg-sky-400" />
                                <div className="px-1 pt-0.5 text-[7px] font-bold text-slate-100">API</div>
                              </div>
                              <div className="h-0.5 w-3 bg-emerald-400" />
                              <div className="h-6 w-12 overflow-hidden rounded-md border border-emerald-400/50 bg-slate-900/95 shadow">
                                <div className="h-1 w-full bg-emerald-400" />
                                <div className="px-1 pt-0.5 text-[7px] font-bold text-slate-100">DB</div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-12 overflow-hidden rounded-lg border border-sky-200 bg-white shadow-sm">
                                <div className="h-1 w-full bg-sky-500" />
                                <div className="px-1 pt-0.5 text-[7px] font-bold text-slate-800">API</div>
                              </div>
                              <div className="h-0.5 w-3 rounded bg-emerald-500" />
                              <div className="h-6 w-12 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                                <div className="h-1 w-full bg-emerald-500" />
                                <div className="px-1 pt-0.5 text-[7px] font-bold text-slate-800">DB</div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={`p-2 ${isLight ? "bg-white" : "bg-slate-900/90"}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[12px] font-bold">
                              {t(item.name, item.nameVi)}
                            </span>
                            {active && <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight text-muted-foreground">
                            {t(item.tagline, item.taglineVi)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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

          {/* Workspace Options Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              aria-label={t("Studio settings", "Cài đặt Studio")}
              title={t("Studio settings", "Cài đặt Studio")}
              onClick={() => {
                setSettingsPopoverOpen((open) => !open);
                setStylePopoverOpen(false);
                setTelemetryPopoverOpen(false);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                settingsPopoverOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : isLight
                    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </button>

            {settingsPopoverOpen && (
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-64 space-y-2 p-3.5 ${styleCfg.floatingCardClass}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Workspace Panels", "Bảng công cụ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettingsPopoverOpen(false)}
                    className="rounded p-1 opacity-70 hover:opacity-100"
                    aria-label={t("Close", "Đóng")}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Panel Toggles */}
                <div className="space-y-1 text-xs">
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
                      {authoring
                        ? t("Scenario & Block Panel", "Bảng thiết lập Lab")
                        : t("Service Controls Card", "Thẻ điều khiển Service")}
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
                        <Target className="size-3.5 text-primary" aria-hidden="true" />
                        {t("Show Mission Card", "Hiện thẻ Mục tiêu")}
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
              title={t("Drag to resize panel · Double-click to hide", "Kéo để chỉnh chiều rộng · Nhấp đúp để ẩn")}
              onPointerDown={(event) => startResize("left", event)}
              onDoubleClick={() => setShowLeft(false)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setLeftWidth((w) => Math.min(560, w + 20));
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setLeftWidth((w) => Math.max(180, w - 20));
                }
              }}
              className={`group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/20 ${
                resizingAxis === "left" ? "bg-primary/25" : "bg-transparent"
              }`}
            >
              <span
                className={`h-12 w-0.5 rounded-full transition-colors ${
                  resizingAxis === "left" ? "bg-primary" : "bg-slate-400/35 group-hover:bg-primary"
                }`}
              />
            </div>
          </>
        )}

        {/* Center Full-Bleed Interactive Live Canvas + Slide-Up Telemetry/Logs Drawer */}
        <div
          style={{ background: styleCfg.canvasBg }}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
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
                studioStyle={studioStyle}
                surfaceTheme={isLight ? "light" : "dark"}
                nodeNames={nodeNames}
                {...(configuredEdges && configuredEdges.length > 0 ? { configuredEdges } : {})}
                onConnect={connect}
                onDisconnect={disconnect}
                onQuickAction={quickAction}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className={`max-w-md space-y-3 p-6 ${styleCfg.floatingCardClass}`}>
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

            {/* LEFT VERTICAL FLOATING TOOL RAIL (Original MAVIS Architecture Workbench — Figma/Miro Style) */}
            <nav
              aria-label={t("Studio tools", "Công cụ Studio")}
              className={`pointer-events-auto absolute top-4 left-4 z-20 flex flex-col items-center gap-1.5 p-1.5 ${styleCfg.railClass}`}
            >
              <button
                type="button"
                title={t("Mission & Pass Criteria", "Mục tiêu & Tiêu chí")}
                aria-label={t("Mission & Pass Criteria", "Mục tiêu & Tiêu chí")}
                aria-pressed={!missionHidden}
                onClick={() => {
                  if (missionHidden) {
                    setMissionHidden(false);
                    setMissionCollapsed(false);
                  } else {
                    setMissionHidden(true);
                  }
                }}
                className={`relative grid size-9 place-items-center rounded-xl transition ${
                  !missionHidden
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Target className="size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                title={
                  authoring
                    ? t("Scenario & Block Setup", "Thiết lập Kịch bản & Block")
                    : t("Services & Controls", "Điều khiển Services")
                }
                aria-label={
                  authoring
                    ? t("Scenario & Block Setup", "Thiết lập Kịch bản & Block")
                    : t("Services & Controls", "Điều khiển Services")
                }
                aria-pressed={showRight && rightCardMode === "service"}
                onClick={() => {
                  if (authoring) {
                    setSetupPanel("presets");
                    setRightCardMode("service");
                    setShowRight((open) => (rightCardMode === "service" ? !open : true));
                  } else {
                    setRightCardMode("service");
                    setShowRight((open) => (rightCardMode === "service" ? !open : true));
                  }
                }}
                className={`relative grid size-9 place-items-center rounded-xl transition ${
                  showRight && rightCardMode === "service"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Layers className="size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                title={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
                aria-label={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
                aria-pressed={showRight && rightCardMode === "diagnostics"}
                onClick={() => {
                  setRightCardMode("diagnostics");
                  setShowRight((open) => (rightCardMode === "diagnostics" ? !open : true));
                }}
                className={`relative grid size-9 place-items-center rounded-xl transition ${
                  showRight && rightCardMode === "diagnostics"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Lightbulb className="size-4" aria-hidden="true" />
                {faultedServices.length > 0 && (
                  <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              <span className={`my-0.5 h-px w-6 ${isLight ? "bg-slate-200" : "bg-slate-700"}`} aria-hidden="true" />

              {showLiveSessionControls && (
                <button
                  type="button"
                  title={t("Snapshots & History", "Lịch sử Snapshot")}
                  aria-label={t("Snapshots & History", "Lịch sử Snapshot")}
                  aria-pressed={!bottomCollapsed && tab === "snapshots"}
                  onClick={() => {
                    if (!bottomCollapsed && tab === "snapshots") {
                      setBottomCollapsed(true);
                    } else {
                      setTab("snapshots");
                      setBottomCollapsed(false);
                    }
                  }}
                  className={`relative grid size-9 place-items-center rounded-xl transition ${
                    !bottomCollapsed && tab === "snapshots"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : isLight
                        ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <History className="size-4" aria-hidden="true" />
                  {snapshotCount > 0 && (
                    <span
                      style={{ fontSize: 9, lineHeight: 1 }}
                      className="pointer-events-none absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-emerald-600 px-1 py-0.5 font-mono font-bold text-white ring-2 ring-white dark:ring-slate-900"
                    >
                      {snapshotCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                title={t("Logs & Traces", "Logs & Traces")}
                aria-label={t("Logs & Traces", "Logs & Traces")}
                aria-pressed={!bottomCollapsed && tab !== "snapshots"}
                onClick={() => {
                  if (!bottomCollapsed && tab !== "snapshots") {
                    setBottomCollapsed(true);
                  } else {
                    setTab("logs");
                    setBottomCollapsed(false);
                  }
                }}
                className={`relative grid size-9 place-items-center rounded-xl transition ${
                  !bottomCollapsed && tab !== "snapshots"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Terminal className="size-4" aria-hidden="true" />
                {logsAndTracesCount > 0 && (
                  <span
                    style={{ fontSize: 9, lineHeight: 1 }}
                    className="pointer-events-none absolute -top-1 -right-1 rounded-full bg-sky-600 px-1 py-0.5 font-mono font-bold text-white ring-2 ring-white dark:ring-slate-900"
                  >
                    {logsAndTracesCount > 99 ? "99+" : logsAndTracesCount}
                  </span>
                )}
              </button>
            </nav>

            {/* MODERN MAVIS MISSION CARD (Docked cleanly beside Left Rail — Freely Draggable & Resizable) */}
            {!missionHidden && (
              <div
                ref={missionCardRef}
                aria-label={t("Lab Mission", "Mục tiêu Lab")}
                onPointerDown={() => setFrontPanel("mission")}
                style={{
                  left: 70 + missionOffset.x,
                  top: 16 + missionOffset.y,
                  width: missionWidth,
                  maxHeight: `calc(100% - ${Math.max(16, 16 + missionOffset.y) + 16}px)`,
                  ...(missionHeight != null && !missionCollapsed ? { height: missionHeight } : {}),
                }}
                className={`pointer-events-auto absolute flex max-h-[calc(100%-2rem)] max-w-[calc(100%-1rem)] flex-col overflow-hidden ${
                  frontPanel === "mission" ? "z-30" : "z-20"
                } ${styleCfg.missionCardClass}`}
              >
                <div className={`h-1.5 w-full shrink-0 ${styleCfg.missionAccentClass}`} aria-hidden="true" />
                <div
                  data-drag-handle="mission"
                  title={t("Drag to move · Double-click to reset position", "Kéo để di chuyển · Nhấp đúp để về vị trí cũ")}
                  onPointerDown={(event) => startPanelDrag("mission", event)}
                  onDoubleClick={() => setMissionOffset({ x: 0, y: 0 })}
                  className="flex shrink-0 cursor-grab items-center justify-between gap-2 px-3 py-2.5 select-none active:cursor-grabbing"
                >
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold tracking-tight">
                    <GripVertical className="size-3.5 shrink-0 opacity-45" aria-hidden="true" />
                    <Target className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {t("Lab Mission", "Mục tiêu Lab")}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setMissionCollapsed((c) => !c)}
                      aria-label={missionCollapsed ? t("Expand mission", "Mở rộng mục tiêu") : t("Collapse mission", "Thu gọn mục tiêu")}
                      className="rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
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
                      aria-label={t("Hide mission card", "Ẩn thẻ mục tiêu")}
                      className="rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {!missionCollapsed && (
                  <div className={`min-h-0 flex-1 space-y-2 overflow-y-auto border-t px-3.5 pt-2.5 pb-3 text-[13px] leading-snug ${isLight ? "border-slate-200/80" : "border-slate-800"}`}>
                    <p className={isLight ? "font-medium text-slate-700" : "font-medium text-slate-200"}>
                      {effectiveMissionInstructions}
                    </p>
                    <ul className="space-y-1.5 pt-0.5 text-[12.5px]">
                      <li className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{t("Run a live Docker action", "Thực hiện 1 thao tác Docker")}</span>
                        <span className={`font-bold ${hasConfirmedAction ? "text-emerald-600 dark:text-emerald-400" : "opacity-50"}`}>
                          {hasConfirmedAction ? "✓" : "○"}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{t("Capture evidence Snapshot", "Chụp Snapshot minh chứng")}</span>
                        <span className={`font-mono font-bold ${snapshotCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "opacity-50"}`}>
                          {snapshotCount > 0 ? `${snapshotCount} ✓` : "0/1"}
                        </span>
                      </li>
                      {missionMaxErr != null && (
                        <li className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{t(`Error rate ≤ ${missionMaxErr}%`, `Tỉ lệ lỗi ≤ ${missionMaxErr}%`)}</span>
                          <span
                            className={`font-mono font-bold ${
                              liveErrorPct == null
                                ? "opacity-50"
                                : liveErrorPct <= missionMaxErr
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {liveErrorPct != null ? `${liveErrorPct}% ${liveErrorPct <= missionMaxErr ? "✓" : "✕"}` : "—"}
                          </span>
                        </li>
                      )}
                      {missionMaxP95 != null && (
                        <li className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{t(`P95 latency ≤ ${missionMaxP95} ms`, `Độ trễ P95 ≤ ${missionMaxP95} ms`)}</span>
                          <span
                            className={`font-mono font-bold ${
                              liveP95Ms == null
                                ? "opacity-50"
                                : liveP95Ms <= missionMaxP95
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
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
                              <span className="truncate font-mono text-muted-foreground">{svc} ≥ {targetCount}x</span>
                              <span className={`font-mono font-bold ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {cur}x {ok ? "✓" : "✕"}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}

                {/* Draggable Right, Bottom & Corner Resize Handles for Lab Mission */}
                <div
                  role="separator"
                  tabIndex={0}
                  aria-orientation="vertical"
                  aria-label="Resize mission width"
                  aria-valuenow={missionWidth}
                  aria-valuemin={210}
                  aria-valuemax={520}
                  title={t("Drag to resize width · Double-click to reset", "Kéo để chỉnh chiều rộng · Nhấp đúp để đặt lại")}
                  onPointerDown={(event) => startResize("mission-width", event)}
                  onDoubleClick={() => setMissionWidth(278)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      setMissionWidth((w) => Math.min(520, w + 20));
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      setMissionWidth((w) => Math.max(210, w - 20));
                    }
                  }}
                  className="group absolute inset-y-2 right-0 z-10 flex w-2 cursor-col-resize items-center justify-end"
                >
                  <span
                    className={`h-10 w-0.5 rounded-full transition-colors ${
                      resizingAxis === "mission-width" || resizingAxis === "mission-corner"
                        ? "bg-primary"
                        : "bg-transparent group-hover:bg-primary/60"
                    }`}
                  />
                </div>
                {!missionCollapsed && (
                  <>
                    <div
                      role="separator"
                      tabIndex={0}
                      aria-orientation="horizontal"
                      aria-label="Resize mission height"
                      aria-valuenow={missionHeight ?? 240}
                      aria-valuemin={140}
                      aria-valuemax={640}
                      title={t("Drag to resize height · Double-click to reset", "Kéo để chỉnh chiều cao · Nhấp đúp để đặt lại")}
                      onPointerDown={(event) => startResize("mission-height", event)}
                      onDoubleClick={() => setMissionHeight(null)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setMissionHeight((h) => Math.min(640, (h ?? 240) + 20));
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setMissionHeight((h) => Math.max(140, (h ?? 240) - 20));
                        }
                      }}
                      className="group absolute inset-x-2 bottom-0 z-10 flex h-2 cursor-row-resize items-end justify-center"
                    >
                      <span
                        className={`h-0.5 w-10 rounded-full transition-colors ${
                          resizingAxis === "mission-height" || resizingAxis === "mission-corner"
                            ? "bg-primary"
                            : "bg-transparent group-hover:bg-primary/60"
                        }`}
                      />
                    </div>
                    <div
                      aria-label="Resize mission card"
                      title={t("Drag corner to resize · Double-click to reset", "Kéo góc để chỉnh kích thước · Nhấp đúp để đặt lại")}
                      onPointerDown={(event) => startResize("mission-corner", event)}
                      onDoubleClick={() => {
                        setMissionWidth(278);
                        setMissionHeight(null);
                      }}
                      className="absolute right-0 bottom-0 z-20 size-3.5 cursor-nwse-resize"
                    />
                  </>
                )}
              </div>
            )}

            {/* CENTERED BOTTOM FLOATING COMMAND DOCK (Original MAVIS Signature — Figma/macOS style) */}
            {bottomCollapsed && (
              <div
                aria-label={t("Live Command Dock", "Thanh điều khiển trực tiếp")}
                className={`pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 px-3 py-2 ${styleCfg.floatingPillClass}`}
              >
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] font-extrabold uppercase tracking-wide ${
                    missionCard?.verified || data.executionStatus === "COMPLETED"
                      ? "border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : faultedServices.length > 0
                        ? "border-rose-400/60 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                        : data.executionStatus === "RUNNING"
                          ? "border-sky-400/60 bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                          : "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
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

                <span className="hidden max-w-[260px] truncate text-[13px] font-medium text-muted-foreground xl:inline">
                  {faultedServices.length > 0
                    ? t(`${faultedServices.join(", ")} faulted`, `${faultedServices.join(", ")} đang sự cố`)
                    : data.executionStatus === "RUNNING"
                      ? t("Click any node to act", "Bấm node để thao tác")
                      : t("Boot real Docker stack", "Chạy Docker thật")}
                </span>

                <span className={`h-4 w-px shrink-0 ${isLight ? "bg-slate-200" : "bg-slate-700"}`} aria-hidden="true" />

                {/* Primary Run / Boot CTA when not RUNNING */}
                {data.executionStatus !== "RUNNING" &&
                  (onStartSession ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-full bg-[#0056D2] px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-[#00419E] disabled:opacity-60"
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
                    <Button asChild size="sm" className="h-8 rounded-full px-3.5 text-[13px]">
                      <Link href={startHref}>
                        {projectName ? `Prepare & start ${projectName}` : "Prepare & start Live"}
                      </Link>
                    </Button>
                  ))}

                {/* Running controls: Snapshot + Finish Studio */}
                {showLiveSessionControls && data.executionStatus === "RUNNING" && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full px-3 text-[13px] font-semibold"
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

                    {(() => {
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
                            className="h-8 rounded-full bg-emerald-600 px-3.5 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-45"
                            disabled={finishDisabled}
                            aria-label={finishDisabled ? `${t("Finish Studio", "Kết thúc Studio")} (${finishDisabledReason})` : t("Finish Studio", "Kết thúc Studio")}
                            onClick={() => void finishStudio()}
                          >
                            {t("Finish Studio", "Kết thúc Studio")}
                          </Button>
                        </span>
                      );
                    })()}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRightCardMode("diagnostics");
                    setShowRight(true);
                  }}
                  className={`h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition ${
                    isLight
                      ? "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {t("Impact", "Tác động")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab("logs");
                    setBottomCollapsed(false);
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition ${
                    isLight
                      ? "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Terminal className="size-3.5 text-primary" aria-hidden="true" />
                  <span>Logs &amp; Traces</span>
                  {logsAndTracesCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[11px] font-bold text-primary">
                      {logsAndTracesCount}
                    </span>
                  )}
                </button>

                {missionCard?.verified && missionCard.submitHref && (
                  <Button asChild size="sm" className="h-8 rounded-full bg-emerald-600 px-3.5 text-[13px] font-semibold text-white hover:bg-emerald-700">
                    <Link href={missionCard.submitHref}>
                      {t("Submit Lab", "Nộp bài")}
                      <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </div>
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
            aria-valuemax={680}
            title="Drag up/down to resize Logs & Telemetry drawer"
            onPointerDown={(event) => startResize("bottom", event)}
            onDoubleClick={() => setBottomCollapsed(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setBottomHeight((h) => Math.min(680, h + 20));
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setBottomHeight((h) => Math.max(120, h - 20));
              }
            }}
            className={`group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y transition-colors hover:bg-primary/20 ${
              resizingAxis === "bottom"
                ? "border-primary/40 bg-primary/20"
                : isLight
                  ? "border-slate-200 bg-slate-100"
                  : "border-slate-800 bg-slate-950"
            }`}
          >
            <div
              className={`h-1 w-12 rounded-full transition-colors ${
                resizingAxis === "bottom" ? "bg-primary" : "bg-slate-400/70 group-hover:bg-primary"
              }`}
            />
          </div>

          <div
            style={{ height: bottomHeight }}
            className={`flex min-w-0 shrink-0 flex-col overflow-hidden border-t ${styleCfg.drawerClass} ${
              resizingAxis === "bottom" ? "" : "transition-[height] duration-150"
            }`}
          >
            <div
              className={`flex h-10 shrink-0 items-center gap-1 border-b px-3 ${
                isLight ? "border-slate-200 bg-slate-50/80" : "border-slate-800 bg-[#0b101b]"
              }`}
            >
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
                  className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition ${
                    tab === id
                      ? isLight
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-slate-800 text-slate-100"
                      : isLight
                        ? "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
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
                            ? "bg-rose-500"
                            : "animate-pulse bg-amber-500"
                        }`}
                      />
                    )}
                  </span>
                </button>
              ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                <span
                  className={`hidden whitespace-nowrap rounded-full border px-2 py-0.5 font-mono 2xl:inline-flex ${
                    isLight
                      ? "border-slate-200 bg-white text-slate-700"
                      : "border-slate-800 bg-slate-950/70 text-slate-300"
                  }`}
                >
                  {data.finishRequested
                    ? "Finishing"
                    : waiting
                      ? "Waiting for Runner"
                      : statusLabel}
                </span>
                {data.telemetry?.probe && (
                  <span
                    className={`hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono lg:inline-flex ${
                      isLight
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
                    }`}
                    title="Continuous live probe RED metrics"
                  >
                    <span>{metric(data.telemetry.probe.rps)} RPS</span>
                    {data.telemetry.probe.p95Ms != null && (
                      <span>· p95 {metric(data.telemetry.probe.p95Ms)}ms</span>
                    )}
                    <span
                      className={
                        data.telemetry.probe.errorRatePercent > 0
                          ? isLight ? "text-rose-600 font-semibold" : "text-rose-300"
                          : isLight ? "text-emerald-700 font-semibold" : "text-emerald-300"
                      }
                    >
                      · {metric(data.telemetry.probe.errorRatePercent)}% err
                    </span>
                  </span>
                )}
                {studio.sseConnected && (
                  <span
                    className={`hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 font-mono text-[10px] xl:inline-flex ${
                      isLight
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-sky-500/30 bg-sky-950/40 text-sky-300"
                    }`}
                    title="Real-time SSE telemetry stream connected"
                  >
                    <span className="size-1.5 rounded-full bg-sky-500" />
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

            const latestAction = observedData.actions[observedData.actions.length - 1];

            return (
              <section
                className="mavis-tabular mx-auto max-w-6xl space-y-2 px-1 py-0.5"
                aria-labelledby="live-cluster-overview"
              >
                {/* Row 1: Compact Single-Line Header */}
                <header
                  className={`flex flex-wrap items-center justify-between gap-2 border-b pb-1.5 ${
                    isLight ? "border-slate-200" : "border-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="live-cluster-overview"
                      className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}
                    >
                      Cluster Overview
                    </h2>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        lastSessionFailed || downServicesCount
                          ? isLight
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-rose-500/30 bg-rose-500/15 text-rose-300"
                          : isTelemetryPreview
                            ? isLight
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-sky-500/30 bg-sky-500/15 text-sky-300"
                            : isLight
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
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

                  <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {[
                      ["Pods", hasAnyReplicaSample ? observedRunningReplicas.toLocaleString() : "—"],
                      ["Down", downServicesCount.toLocaleString()],
                      ["Actions", observedConfirmed.length.toLocaleString()],
                    ].map(([kLabel, kValue]) => (
                      <div key={kLabel} className="flex items-baseline gap-1.5">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>{kLabel}</dt>
                        <dd className={`font-mono font-semibold tabular-nums ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                          {kValue}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </header>

                {/* Row 2: Full-Width Unified KPI + Capacity Strip (always fits cleanly above the fold) */}
                <div
                  className={`grid gap-2.5 rounded-xl border px-3 py-2 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,1fr)] lg:items-center ${
                    isLight
                      ? "border-slate-200 bg-slate-50/70"
                      : "border-slate-800 bg-slate-900/75"
                  }`}
                >
                  <section aria-label="Traffic & reliability">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className={`text-[10.5px] font-bold uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                        Traffic &amp; reliability
                      </h3>
                      {reqNum === null && (
                        <span className="text-[10.5px] text-muted-foreground">
                          {observedData.executionStatus === "RUNNING"
                            ? "Live Docker running — awaiting probe traffic"
                            : isBooting
                              ? "Booting Live Docker…"
                              : "Start Live Docker to measure"}
                        </span>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        {
                          label: "Requests",
                          value: reqNum !== null ? reqNum.toLocaleString() : "—",
                          unit: reqNum !== null ? "req" : "",
                          warning: false,
                        },
                        {
                          label: "E2E p95",
                          value: p95Num !== null ? metric(p95Num) : "—",
                          unit: p95Num !== null ? "ms" : "",
                          warning: p95Num !== null && p95Num > 500,
                        },
                        {
                          label: "Error rate",
                          value: errNum !== null ? metric(errNum) : "—",
                          unit: errNum !== null ? "%" : "",
                          warning: errNum !== null && errNum > 0,
                        },
                        {
                          label: "Spans",
                          value: spanCount.toLocaleString(),
                          unit: "",
                          warning: false,
                        },
                      ].map(({ label, value, unit, warning }) => (
                        <div
                          key={label}
                          className={`rounded-lg border px-2.5 py-1 ${
                            isLight
                              ? "border-slate-200/80 bg-white"
                              : "border-slate-800 bg-slate-950/60"
                          }`}
                        >
                          <dt className={`text-[10px] font-medium ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            {label}
                          </dt>
                          <dd
                            className={`font-mono text-sm font-bold tabular-nums ${
                              warning
                                ? isLight ? "text-rose-600" : "text-rose-300"
                                : isLight ? "text-slate-900" : "text-slate-100"
                            }`}
                          >
                            {value}
                            {unit && (
                              <span className={`ml-0.5 text-[10px] font-medium ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                                {unit}
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section
                    aria-label="Resource capacity"
                    className={`space-y-1.5 border-t pt-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-3 ${
                      isLight ? "border-slate-200" : "border-slate-800"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={`text-[10.5px] font-bold uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                        Resource capacity
                      </h3>
                      {peakCpuService && cpuSamples > 0 && (
                        <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          Peak: <span className="font-mono font-medium">{peakCpuService}</span>
                        </span>
                      )}
                    </div>
                    {[
                      {
                        label: "CPU",
                        rightText: `${Number(totalVcpuAllocated.toFixed(1))}/${maxPoolVcpu} vCPU${
                          cpuSamples > 0 ? ` · ${avgCpuPct.toFixed(1)}%` : ""
                        }`,
                        pct: cpuBarPct,
                      },
                      {
                        label: "RAM",
                        rightText: `${Math.round(totalRamUsedMiB).toLocaleString()} / ${Math.round(ramPoolMiB).toLocaleString()} MiB`,
                        pct: ramBarPct,
                      },
                    ].map(({ label, rightText, pct }) => (
                      <div key={label} className="space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-[11px]">
                          <span className={`font-semibold ${isLight ? "text-slate-800" : "text-slate-200"}`}>
                            {label}
                          </span>
                          <span className={`font-mono tabular-nums ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                            {rightText}
                          </span>
                        </div>
                        <div
                          className={`h-1.5 overflow-hidden rounded-full ${isLight ? "bg-slate-200" : "bg-slate-800"}`}
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </section>
                </div>

                {/* Row 3: Slim 4-Step Mission Checklist */}
                <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                  {checklist.map(([label, done]) => (
                    <div
                      key={label}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium ${
                        done
                          ? isLight
                            ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : isLight
                            ? "border-slate-200 bg-white text-slate-600"
                            : "border-slate-800 bg-slate-900/70 text-slate-400"
                      }`}
                    >
                      <span className="font-mono">{done ? "✓" : "○"}</span>
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Row 4: Live RED Charts + Collapsible Service Edges & Action History */}
                <StudioRedCharts
                  history={observedData.telemetryHistory}
                  actions={observedData.actions}
                  serviceGraph={observedData.telemetry?.serviceGraph}
                  spans={observedData.telemetry?.spans}
                  isLight={isLight}
                  onSelectTrace={(tid) => {
                    setInspectedTraceId(tid);
                    setTab("logs");
                  }}
                />

                {/* Row 4: Collapsible Light/Dark Action Log */}
                {observedData.actions.length > 0 && (
                  <details
                    className={`rounded-lg border text-[11px] ${
                      isLight
                        ? "border-slate-200 bg-slate-50/75 text-slate-700"
                        : "border-slate-800 bg-slate-900/65 text-slate-300"
                    }`}
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-1.5 font-medium select-none">
                      <span className="inline-flex flex-wrap items-center gap-1.5 font-mono">
                        <span className={isLight ? "font-sans font-semibold text-slate-800" : "font-sans font-semibold text-slate-100"}>
                          Action history ({observedData.actions.length})
                        </span>
                        {latestAction && (
                          <>
                            <span aria-hidden="true" className="opacity-40">·</span>
                            <span>
                              {latestAction.action} {latestAction.service}
                              {latestAction.replicas ? ` → ${latestAction.replicas}` : ""}
                            </span>
                            {latestAction.result && (
                              <span className="text-muted-foreground">
                                ({latestAction.result.replicasBefore}→{latestAction.result.replicasAfter}× · p95{" "}
                                {metric(latestAction.result.metricsAfter["p95LatencyMs"])}ms · err{" "}
                                {metric(latestAction.result.metricsAfter["errorRatePercent"])}%)
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">History ▾</span>
                    </summary>
                    <ol
                      className={`divide-y border-t px-3 ${
                        isLight ? "divide-slate-200/80 border-slate-200 bg-white" : "divide-slate-800 border-slate-800 bg-slate-950/50"
                      }`}
                    >
                      {observedData.actions.map((item) => (
                        <li key={item.actionId} className="flex flex-wrap items-center justify-between gap-2 py-1.5 font-mono">
                          <span>
                            <strong className={isLight ? "text-slate-900" : "text-slate-100"}>
                              {item.action} {item.service}
                              {item.replicas ? ` → ${item.replicas}` : ""}
                            </strong>
                            <span className="ml-1.5 text-muted-foreground">· {item.status}</span>
                          </span>
                          {item.result && (
                            <span className="mavis-tabular text-muted-foreground">
                              {item.result.replicasBefore}→{item.result.replicasAfter}× · req{" "}
                              {metric(item.result.metricsAfter["requestCount"])} · p95{" "}
                              {metric(item.result.metricsAfter["p95LatencyMs"])} ms · err{" "}
                              {metric(item.result.metricsAfter["errorRatePercent"])}%
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
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
                  <h2 className={`text-xs font-bold ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                    {t("Service Telemetry", "Thông số Dịch vụ")} ({rows.length})
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    {observedLabel} · {t("Read-only", "Chỉ đọc")}
                  </span>
                </div>

                <div className={`max-w-full overflow-x-auto rounded-xl border ${isLight ? "border-slate-200 bg-white" : "border-slate-800"}`}>
                  <table className="mavis-tabular w-full whitespace-nowrap text-left text-xs">
                    <thead className={isLight ? "bg-slate-50 text-[11px] text-slate-600" : "bg-slate-900 text-[11px] text-slate-400"}>
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
                          <th key={heading} scope="col" className="px-2.5 py-2 font-semibold">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? "divide-slate-200/80" : "divide-slate-800"}`}>
                      {rows.map((row) => {
                        const isSelected = row.service === canvasSelected;
                        return (
                          <tr
                            key={row.service}
                            className={
                              isSelected
                                ? isLight ? "bg-sky-50" : "bg-sky-950/35"
                                : isLight ? "hover:bg-slate-50" : "hover:bg-slate-900/80"
                            }
                          >
                            <td className="px-2.5 py-1.5">
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  studio.setService(isSelected ? "" : row.service)
                                }
                                className={`inline-flex items-center gap-1.5 font-mono font-semibold hover:underline ${
                                  isLight ? "text-primary" : "text-sky-200"
                                }`}
                              >
                                <span>{row.service}</span>
                                {row.svcLimit?.runtime && (
                                  <span
                                    className={`rounded border px-1 py-0.5 font-sans text-[10px] font-normal ${
                                      isLight
                                        ? "border-slate-200 bg-slate-100 text-slate-600"
                                        : "border-slate-700/80 bg-slate-900 text-slate-400"
                                    }`}
                                  >
                                    {row.svcLimit.runtime}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className={`px-2.5 py-1.5 font-semibold ${isLight ? (row.running === 0 ? "text-rose-600" : row.running && row.running > 0 ? "text-emerald-700" : "text-slate-600") : row.statusClass}`}>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden="true"
                                  className={`size-1.5 rounded-full ${row.dotClass}`}
                                />
                                {row.statusLabel}
                              </span>
                            </td>
                            <td className={`px-2.5 py-1.5 font-mono tabular-nums ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                              {row.running === undefined
                                ? "—"
                                : row.desired !== undefined && row.desired !== row.running
                                  ? `${row.running}/${row.desired}`
                                  : row.running}
                              {row.agg.containers > 1 && (
                                <span className="ml-1 text-[10px] text-muted-foreground">
                                  ({row.agg.containers} active)
                                </span>
                              )}
                            </td>
                            <td className={`px-2.5 py-1.5 font-mono tabular-nums ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                              {row.agg.cpu}
                            </td>
                            <td className={`px-2.5 py-1.5 font-mono tabular-nums ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                              {row.agg.memory}
                            </td>
                            <td className={`px-2.5 py-1.5 font-mono tabular-nums ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                              {row.netIo}
                            </td>
                            <td className={`px-2.5 py-1.5 font-mono tabular-nums ${isLight ? "text-slate-900" : "text-slate-200"}`}>
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
              isLight={isLight}
            />
          </div>

          {tab === "snapshots" && (
            <section aria-label="Snapshots and runtime recording" className="space-y-3">
              {/* BR-08 (INCOMPLETE_SCENARIO guard): warn students before sealing an empty session */}
              {!authoring && data.actions.length === 0 && !isPreviewMode && (
                <p
                  role="note"
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    isLight
                      ? "border-amber-200 bg-amber-50/80 text-amber-900"
                      : "border-amber-500/35 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {t(
                    "Run at least one live action (Stop, Start, Pause, or Scale) before sealing your signed receipt.",
                    "Thực hiện ít nhất 1 thao tác live (Stop, Start, Pause hoặc Scale) trước khi niêm phong biên nhận.",
                  )}
                </p>
              )}

              {/* Primary Capture Bar + Compact Secondary Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex min-w-[240px] flex-1 items-center">
                  <Input
                    ref={snapshotNoteRef}
                    aria-label="Explain the observed behavior"
                    placeholder={t(
                      "Write a short observation note…",
                      "Nhập ghi chú ngắn về hành vi quan sát được…",
                    )}
                    value={explanation}
                    maxLength={4000}
                    onChange={(event) => setExplanation(event.target.value)}
                    className={`h-9 w-full text-xs ${!isPreviewMode && data.telemetry ? "pr-24" : ""} ${
                      isLight
                        ? "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                        : "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                    }`}
                  />
                  {!isPreviewMode && data.telemetry && (
                    <button
                      type="button"
                      onClick={buildAutoObservationNote}
                      title="Auto-fill summary"
                      className={`absolute right-1.5 inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition ${
                        isLight
                          ? "bg-slate-100 text-slate-700 hover:bg-sky-50 hover:text-sky-700"
                          : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      <Sparkles aria-hidden="true" className="size-3 text-sky-500" />
                      Auto-fill
                    </button>
                  )}
                </div>

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
                  className="h-9 bg-[#0056D2] px-3.5 text-xs font-semibold text-white hover:bg-[#00419E] disabled:opacity-45"
                >
                  <Camera aria-hidden="true" className="mr-1.5 size-3.5" />
                  Capture evidence snapshot
                </Button>

                <div
                  aria-hidden="true"
                  className={`hidden h-5 w-px sm:block ${isLight ? "bg-slate-200" : "bg-slate-800"}`}
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={capturingScreen || blocks.length === 0}
                    onClick={() => void captureCanvasScreenshot()}
                    className={`h-8 px-2.5 text-xs font-medium disabled:opacity-40 ${
                      isLight
                        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                    }`}
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
                      className={`h-8 px-2.5 text-xs font-medium disabled:opacity-40 ${
                        isLight
                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      <Video aria-hidden="true" className="mr-1.5 size-3.5" />
                      Record runtime replay
                    </Button>
                  ) : (
                    <>
                      <span
                        role="status"
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-medium ${
                          isLight
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-rose-500/40 bg-rose-500/15 text-rose-200"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 animate-pulse rounded-full bg-rose-500"
                        />
                        {recordingSeconds}s · {recordingSteps}f
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingReplay}
                        onClick={addLiveReplayCheckpoint}
                        className={`h-8 px-2.5 text-xs ${
                          isLight
                            ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <Plus aria-hidden="true" className="mr-1 size-3" />
                        Add checkpoint ({recordingSteps})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingReplay}
                        onClick={() => void stopAndSaveLiveReplay()}
                        className="h-8 bg-rose-600 px-2.5 text-xs text-white hover:bg-rose-500"
                      >
                        <Square aria-hidden="true" className="mr-1.5 size-3 fill-current" />
                        {savingReplay
                          ? "Saving replay…"
                          : `Stop & save replay (${recordingSeconds}s)`}
                      </Button>
                    </>
                  )}

                  {data.receiptDigest && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`h-8 px-2.5 text-xs font-medium ${
                        isLight
                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      }`}
                      onClick={() => void downloadReceipt()}
                    >
                      {data.receiptSignature ? "Download signed receipt" : "Download receipt"}
                    </Button>
                  )}
                </div>
              </div>

              {(downloadError || replayError) && (
                <p role="alert" className={`text-xs ${isLight ? "text-rose-700" : "text-rose-300"}`}>
                  {downloadError?.message ?? replayError}
                </p>
              )}

              {/* Slim Collapsible Metrics & Traffic Context (collapsed by default so Snapshots stays clean) */}
              {(runtimeFlows.length > 0 || (firstConfirmed?.result && lastConfirmed?.result)) && (
                <details
                  className={`rounded-lg border text-xs ${
                    isLight
                      ? "border-slate-200 bg-slate-50/75 text-slate-700"
                      : "border-slate-800 bg-slate-900/60 text-slate-300"
                  }`}
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 font-medium select-none">
                    <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[11.5px]">
                      {firstConfirmed?.result && lastConfirmed?.result ? (
                        <>
                          <span className={isLight ? "font-sans font-semibold text-slate-800" : "font-sans font-semibold text-slate-100"}>
                            Before → After:
                          </span>
                          <span>
                            p95 {metric(firstConfirmed.result.metricsBefore["p95LatencyMs"])}→
                            {metric(lastConfirmed.result.metricsAfter["p95LatencyMs"])} ms
                          </span>
                          <span aria-hidden="true" className="opacity-40">·</span>
                          <span>
                            err {metric(firstConfirmed.result.metricsBefore["errorRatePercent"])}%→
                            {metric(lastConfirmed.result.metricsAfter["errorRatePercent"])}%
                          </span>
                          <span aria-hidden="true" className="opacity-40">·</span>
                          <span>
                            {lastConfirmed.result.service} {firstConfirmed.result.replicasBefore}→
                            {lastConfirmed.result.replicasAfter}×
                          </span>
                        </>
                      ) : (
                        <span className={isLight ? "font-sans font-semibold text-slate-800" : "font-sans font-semibold text-slate-100"}>
                          {t("Captured traffic context", "Ngữ cảnh luồng dịch vụ")}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {runtimeFlows.length} {runtimeFlows.length === 1 ? "flow" : "flows"} ▾
                    </span>
                  </summary>

                  <div
                    className={`space-y-2.5 border-t px-3 py-2.5 ${
                      isLight ? "border-slate-200 bg-white/80" : "border-slate-800 bg-slate-950/50"
                    }`}
                  >
                    {firstConfirmed?.result && lastConfirmed?.result && (
                      <div className="mavis-tabular grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Requests</span>
                          <span>
                            {metric(firstConfirmed.result.metricsBefore["requestCount"])} →{" "}
                            {metric(lastConfirmed.result.metricsAfter["requestCount"])}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground">p95 latency</span>
                          <span>
                            {metric(firstConfirmed.result.metricsBefore["p95LatencyMs"])} ms →{" "}
                            {metric(lastConfirmed.result.metricsAfter["p95LatencyMs"])} ms
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Error rate</span>
                          <span>
                            {metric(firstConfirmed.result.metricsBefore["errorRatePercent"])}% →{" "}
                            {metric(lastConfirmed.result.metricsAfter["errorRatePercent"])}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Replicas</span>
                          <span>
                            {firstConfirmed.result.service}: {firstConfirmed.result.replicasBefore} →{" "}
                            {lastConfirmed.result.replicasAfter}
                          </span>
                        </div>
                      </div>
                    )}

                    {runtimeFlows.length > 0 && (
                      <ul
                        aria-label="Runtime traffic flows"
                        className="flex flex-wrap gap-1.5 font-mono text-[11px]"
                      >
                        {runtimeFlows.map((flow) => (
                          <li
                            key={`${flow.from}-${flow.to}`}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                              flow.hasError
                                ? isLight
                                  ? "border-rose-200 bg-rose-50 text-rose-800"
                                  : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                : flow.observed
                                  ? isLight
                                    ? "border-sky-200 bg-sky-50 text-sky-900"
                                    : "border-sky-500/35 bg-sky-500/10 text-sky-100"
                                  : isLight
                                    ? "border-slate-200 bg-slate-50 text-slate-700"
                                    : "border-slate-800 bg-slate-900/70 text-slate-300"
                            }`}
                          >
                            <span className="font-semibold">{flow.from}</span>
                            <span className="opacity-50">→</span>
                            <span className="font-semibold">{flow.to}</span>
                            <span className="opacity-70">· {flow.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )}

              {/* Signed Evidence Snapshots */}
              {(data.snapshots?.length ?? 0) > 0 && (
                <div className="grid gap-2 md:grid-cols-2">
                  {data.snapshots?.map((snapshot, idx) => (
                    <div
                      key={snapshot.id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${
                        isLight
                          ? "border-slate-200 bg-slate-50/70 text-slate-900"
                          : "border-slate-800 bg-slate-900/70 text-slate-100"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              isLight
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-emerald-500/15 text-emerald-300"
                            }`}
                          >
                            SNAPSHOT #{idx + 1}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(snapshot.capturedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="leading-snug font-medium">{snapshot.explanation}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          #{snapshot.digest.slice(0, 14)}…
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2.5 text-[11px]"
                        onClick={() => void downloadSnapshot(snapshot.id)}
                      >
                        Download evidence
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Local Screenshots & Runtime Replays */}
              {liveReplays.length > 0 && (
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {liveReplays.map((replayItem) => {
                    const isScreenshot = replayItem.kind === "LIVE_SCREENSHOT";
                    return (
                      <div
                        key={replayItem.id}
                        className={`space-y-2 rounded-xl border p-3 text-xs ${
                          isLight
                            ? "border-slate-200 bg-slate-50/70 text-slate-900"
                            : "border-slate-800 bg-slate-900/75 text-slate-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                  isScreenshot
                                    ? isLight
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-emerald-500/15 text-emerald-300"
                                    : isLight
                                      ? "bg-sky-100 text-sky-800"
                                      : "bg-sky-500/15 text-sky-300"
                                }`}
                              >
                                {isScreenshot ? "PNG" : "REPLAY"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(replayItem.capturedAt).toLocaleTimeString()}
                                {!isScreenshot && ` · ${replayItem.replay.length} frames`}
                                {replayItem.durationMs
                                  ? ` · ${(replayItem.durationMs / 1000).toFixed(1)}s`
                                  : ""}
                              </span>
                            </div>
                            <p className="mt-1 font-medium">{replayItem.explanation}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeLiveReplay(replayItem.id)}
                            aria-label={isScreenshot ? "Delete screenshot" : "Delete runtime replay"}
                            className={`rounded p-1 transition ${
                              isLight
                                ? "text-slate-400 hover:bg-slate-200/70 hover:text-rose-600"
                                : "text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                            }`}
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>

                        {isScreenshot && replayItem.imageData ? (
                          <img
                            src={replayItem.imageData}
                            alt="Captured runtime topology screenshot"
                            className={`max-h-60 w-full rounded-lg border object-contain ${
                              isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-[#070b14]"
                            }`}
                          />
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

                        <div
                          className={`flex flex-wrap items-center justify-end gap-1.5 border-t pt-2 ${
                            isLight ? "border-slate-200" : "border-slate-800"
                          }`}
                        >
                          {isScreenshot && replayItem.imageData && (
                            <a
                              href={replayItem.imageData}
                              download={`mavis-screenshot-${replayItem.id.slice(0, 8)}.png`}
                              className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition ${
                                isLight
                                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                  : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                              }`}
                            >
                              Download PNG
                            </a>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px]"
                            onClick={() => downloadStudioEvidence(replayItem)}
                          >
                            {isScreenshot ? "Download HTML" : "Download Replay HTML"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!data.snapshots?.length && liveReplays.length === 0 && (
                <div
                  className={`rounded-xl border border-dashed px-4 py-5 text-center text-xs ${
                    isLight
                      ? "border-slate-200 bg-slate-50/50 text-slate-500"
                      : "border-slate-800 bg-slate-900/30 text-slate-400"
                  }`}
                >
                  {t(
                    "No snapshots yet. Enter a short note above (or click Auto-fill) and press Capture evidence snapshot.",
                    "Chưa có snapshot nào. Nhập ghi chú ngắn phía trên (hoặc bấm Auto-fill) rồi nhấn Capture evidence snapshot.",
                  )}
                </div>
              )}
            </section>
          )}
            </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* FLOATING RIGHT CONTEXTUAL CARD (Style-Aware, Freely Draggable & Resizable) */}
        {showRight && (
          <aside
            ref={rightCardRef}
            onPointerDown={() => setFrontPanel("right")}
            style={{
              top: 16 + rightOffset.y,
              right: 16 - rightOffset.x,
              width: rightWidth,
              maxHeight:
                rightHeight != null || rightOffset.y !== 0
                  ? `calc(100% - ${Math.max(16, 16 + rightOffset.y) + 16}px)`
                  : undefined,
              ...(rightHeight != null ? { height: rightHeight } : {}),
              scrollbarWidth: "thin",
              scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #0a0f18",
            }}
            className={`pointer-events-auto absolute flex max-w-[calc(100%-1rem)] flex-col overflow-hidden ${
              frontPanel === "right" ? "z-30" : "z-20"
            } ${
              rightHeight != null ? "max-h-[calc(100%-2rem)]" : "max-h-[calc(100%-6.25rem)]"
            } ${styleCfg.floatingCardClass}`}
          >
            {/* Left-edge Horizontal Resize Handle */}
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize inspector width"
              aria-valuenow={rightWidth}
              aria-valuemin={260}
              aria-valuemax={720}
              title={t("Drag edge to resize width · Double-click to reset", "Kéo viền để chỉnh chiều rộng · Nhấp đúp để đặt lại")}
              onPointerDown={(event) => startResize("right", event)}
              onDoubleClick={() => setRightWidth(340)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setRightWidth((w) => Math.min(720, w + 24));
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setRightWidth((w) => Math.max(260, w - 24));
                }
              }}
              className="group absolute inset-y-2 left-0 z-20 flex w-2 cursor-col-resize items-center justify-start"
            >
              <span
                className={`h-14 w-1 rounded-full transition-colors ${
                  resizingAxis === "right" || resizingAxis === "right-corner"
                    ? "bg-primary"
                    : "bg-slate-400/35 group-hover:bg-primary/70"
                }`}
              />
            </div>

            {/* Bottom-edge Vertical Resize Handle */}
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label="Resize inspector height"
              aria-valuenow={rightHeight ?? 480}
              aria-valuemin={220}
              aria-valuemax={840}
              title={t("Drag edge to resize height · Double-click to reset", "Kéo viền để chỉnh chiều cao · Nhấp đúp để đặt lại")}
              onPointerDown={(event) => startResize("right-height", event)}
              onDoubleClick={() => setRightHeight(null)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setRightHeight((h) => Math.min(840, (h ?? 480) + 24));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setRightHeight((h) => Math.max(220, (h ?? 480) - 24));
                }
              }}
              className="group absolute inset-x-3 bottom-0 z-20 flex h-2 cursor-row-resize items-end justify-center"
            >
              <span
                className={`h-1 w-14 rounded-full transition-colors ${
                  resizingAxis === "right-height" || resizingAxis === "right-corner"
                    ? "bg-primary"
                    : "bg-slate-400/35 group-hover:bg-primary/70"
                }`}
              />
            </div>

            {/* Bottom-left Diagonal Corner Resize Handle */}
            <div
              aria-label="Resize inspector panel"
              title={t("Drag corner to resize · Double-click to reset", "Kéo góc để chỉnh kích thước · Nhấp đúp để đặt lại")}
              onPointerDown={(event) => startResize("right-corner", event)}
              onDoubleClick={() => {
                setRightWidth(340);
                setRightHeight(null);
              }}
              className="absolute bottom-0 left-0 z-30 size-3.5 cursor-nesw-resize"
            />
            {/* Floating Card Draggable Header with Close Button */}
            <div
              data-drag-handle="inspector"
              title={t("Drag to move · Double-click to reset position", "Kéo để di chuyển · Nhấp đúp để về vị trí cũ")}
              onPointerDown={(event) => startPanelDrag("right", event)}
              onDoubleClick={() => setRightOffset({ x: 0, y: 0 })}
              className={`flex shrink-0 cursor-grab items-center justify-between gap-2 border-b px-3.5 py-2.5 select-none active:cursor-grabbing ${
                isLight ? "border-slate-200 bg-slate-50/90" : "border-slate-800 bg-slate-950/70"
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <GripVertical className="size-3.5 shrink-0 opacity-45" aria-hidden="true" />
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
              ) : isLight && !authoring ? (
                (() => {
                  const selSvc = canvasSelected || selected || services[0] || "";
                  const selRunning = selSvc ? runningFor(data, selSvc) : undefined;
                  const selObs = selSvc ? data.telemetry?.services.find((s) => s.service === selSvc) : undefined;
                  const selStats = summarizeServiceStats(selObs?.stats);
                  const selBlock = blocks.find((b) => b.service === selSvc);
                  const selCanScale = Boolean(selBlock?.canScale ?? (selSvc && !data.topology));
                  const selStopped = selRunning === 0;
                  const selPaused =
                    !selStopped &&
                    [...data.actions]
                      .reverse()
                      .find((a) => a.service === selSvc && a.status === "CONFIRMED")?.action === "PAUSE";
                  const canLiveAct = !isPreviewMode && data.executionStatus === "RUNNING" && Boolean(selSvc);
                  return (
                    <section aria-label={t("Live Service Controls", "Điều khiển Service")} className="space-y-3.5 text-[13px] text-slate-900">
                      {/* Service Picker & Status */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm font-bold text-slate-900">
                            {selSvc || t("No service selected", "Chưa chọn service")}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${
                              selStopped
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : selPaused
                                  ? "border-amber-300 bg-amber-50 text-amber-800"
                                  : selRunning && selRunning > 0
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            {selStopped
                              ? "CRASHED · 0x"
                              : selPaused
                                ? `PAUSED · ${selRunning ?? 1}x`
                                : selRunning != null
                                  ? `RUNNING · ${selRunning}x`
                                  : "STANDBY"}
                          </span>
                        </div>
                        <dl className="mavis-tabular mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                            <dt className="text-[11px] text-slate-500">Replicas</dt>
                            <dd className="font-mono text-xs font-bold text-slate-900">
                              {selRunning ?? "—"}
                            </dd>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                            <dt className="text-[11px] text-slate-500">CPU</dt>
                            <dd className="font-mono text-xs font-bold text-slate-900">
                              {selStats.cpu}
                            </dd>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                            <dt className="text-[11px] text-slate-500">RAM</dt>
                            <dd className="font-mono text-xs font-bold text-slate-900">
                              {selStats.memory}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {/* Real Docker Lifecycle & Fault Injection Actions */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t("Live Docker Actions", "Thao tác Docker thật")}
                          </p>
                          {!canLiveAct && (
                            <span className="text-[11px] font-medium text-amber-700">
                              {t("Click Run to activate", "Bấm Run để bật")}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || selStopped}
                            onClick={() => void dispatchCommand("STOP", selSvc)}
                            className="h-9 whitespace-nowrap border-rose-300 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <Square className="mr-1.5 size-3.5 fill-current" aria-hidden="true" />
                            Stop
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || !selStopped}
                            onClick={() => void dispatchCommand("START", selSvc)}
                            className="h-9 whitespace-nowrap border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <Play className="mr-1.5 size-3.5 fill-current" aria-hidden="true" />
                            Start
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || selStopped || selPaused}
                            onClick={() => void studio.send("PAUSE", selSvc)}
                            className="h-9 whitespace-nowrap border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            Pause
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || !selPaused}
                            onClick={() => void studio.send("RESUME", selSvc)}
                            className="h-9 whitespace-nowrap border-sky-300 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            Resume
                          </Button>
                        </div>

                        {/* Scale & CPU Throttle */}
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || !selCanScale || selStopped || (selRunning ?? 1) >= 8}
                            onClick={() => void dispatchCommand("SCALE", selSvc, Math.min(8, (selRunning ?? 1) + 1))}
                            className="h-8 whitespace-nowrap border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <Plus className="mr-1 size-3.5" aria-hidden="true" />
                            Scale +1
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || selStopped}
                            onClick={() => void studio.send("THROTTLE_CPU", selSvc, undefined, 20)}
                            className="h-8 whitespace-nowrap border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            CPU 20%
                          </Button>
                        </div>
                      </div>

                      {/* Quick Service Switcher Chips */}
                      {services.length > 1 && (
                        <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t("All Services", "Tất cả Service")} ({services.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {services.map((svc) => {
                              const rep = runningFor(data, svc);
                              const active = svc === selSvc;
                              return (
                                <button
                                  key={svc}
                                  type="button"
                                  onClick={() => studio.setService(svc)}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11.5px] font-semibold transition ${
                                    active
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                  }`}
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${
                                      rep === 0 ? "bg-rose-500" : rep && rep > 0 ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                    aria-hidden="true"
                                  />
                                  {svc}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Change Impact Exercise Panel (Prediction Lock & F1 Check) */}
                      {!isPreviewMode &&
                        studio.services.length > 0 &&
                        (data.executionStatus === "RUNNING" || Boolean(data.exerciseEvaluation)) && (
                          <StudioExercisePanel
                            data={data}
                            services={studio.services}
                            busy={busy}
                            isLight={isLight}
                            submittingPrediction={studio.prediction.isPending}
                            onLockPrediction={(svcs, rationale) =>
                              studio.submitPrediction(svcs, rationale)
                            }
                            onRunPrescribedChange={(kind, svc, rep, cpu, rps) =>
                              studio.send(kind, svc, rep, cpu, rps)
                            }
                          />
                        )}

                      {/* Bottom Quick Shortcuts */}
                      <div className="flex gap-2 border-t border-slate-200 pt-2.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => setRightCardMode("diagnostics")}
                        >
                          <Lightbulb className="mr-1.5 size-3.5" aria-hidden="true" />
                          {t("Why / Impact", "Xem tác động")}
                        </Button>
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
                          Logs
                        </Button>
                      </div>
                    </section>
                  );
                })()
              ) : (
              <div className={isLight ? "space-y-3 text-slate-900" : "dark rounded-xl bg-[#0a0f18] p-2.5 text-slate-100"}>
            {authoring && (
              <div
                role="tablist"
                aria-label="Lecturer setup panel tabs"
                className={`mb-3 grid grid-cols-3 gap-1 rounded-xl border p-1 ${
                  isLight ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-950/90"
                }`}
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
                    className={`rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      setupPanel === id
                        ? isLight
                          ? "bg-white text-slate-900 shadow-xs"
                          : "bg-slate-800 text-white shadow-xs"
                        : isLight
                          ? "text-slate-600 hover:text-slate-900"
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
                <div className={`flex items-center gap-1.5 border-b pb-2 font-bold ${isLight ? "border-slate-200 text-slate-900" : "border-slate-800 text-slate-100"}`}>
                  <Target aria-hidden="true" className={`size-3.5 ${isLight ? "text-primary" : "text-sky-400"}`} />
                  <span>Mission &amp; Pass Criteria</span>
                </div>

                <label className={`block space-y-1 text-[11.5px] font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  <span>Student Mission</span>
                  <Textarea
                    value={missionDraft}
                    onChange={(e) => setMissionDraft(e.target.value)}
                    className={`min-h-20 text-xs ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
                  />
                </label>

                <div className="space-y-1.5">
                  <label className={`block space-y-1 text-[11.5px] font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                    <span>Baseline Probe GET Path</span>
                    <Input
                      value={baselineDraft}
                      onChange={(e) => setBaselineDraft(e.target.value)}
                      placeholder="/api/gateway/orders"
                      className={`h-8 font-mono text-xs ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {probeSuggestions.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setBaselineDraft(path)}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors ${
                          baselineDraft === path
                            ? isLight
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-sky-500/50 bg-sky-500/15 text-sky-200"
                            : isLight
                              ? "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                              : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={`block space-y-1 text-[11.5px] font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                    <span>Max Error %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={maxErrDraft}
                      onChange={(e) => setMaxErrDraft(e.target.value)}
                      placeholder="0"
                      className={`h-8 font-mono text-xs ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
                    />
                  </label>
                  <label className={`block space-y-1 text-[11.5px] font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                    <span>Min Replicas</span>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={replicaCountDraft}
                      onChange={(e) => setReplicaCountDraft(e.target.value)}
                      placeholder="2"
                      className={`h-8 font-mono text-xs ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
                    />
                  </label>
                </div>

                <label className={`block space-y-1 text-[11.5px] font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  <span>Target Scale Service</span>
                  <select
                    value={replicaSvcDraft}
                    onChange={(e) => setReplicaSvcDraft(e.target.value)}
                    className={`h-8 w-full rounded-md border px-2 font-mono text-xs ${isLight ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
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
                <div className={`space-y-1 rounded-xl border p-2.5 text-[11px] ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/75"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Student Will Receive
                  </p>
                  <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                    Initial Faults:{" "}
                    <code className={`font-mono font-semibold ${isLight ? "text-amber-700" : "text-amber-300"}`}>
                      {authoring.initialStoppedServices.length > 0
                        ? authoring.initialStoppedServices.join(", ")
                        : "None (all start Up)"}
                    </code>
                  </p>
                  <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                    Pass Target:{" "}
                    <code className={`font-mono font-semibold ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
                      ≤{maxErrDraft || "0"}% err
                      {replicaSvcDraft && Number(replicaCountDraft) >= 2
                        ? ` · ${replicaSvcDraft} ≥${replicaCountDraft}×`
                        : ""}
                    </code>
                  </p>
                  <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                    Probe:{" "}
                    <code className={`font-mono font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}>
                      GET {baselineDraft || "/health"}
                    </code>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {authoring.saved && !missionDirty ? (
                    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                      <Check aria-hidden="true" className="size-3.5" /> Saved
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] ${missionDirty ? (isLight ? "text-amber-700 font-medium" : "text-amber-300") : "text-muted-foreground"}`}
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
                <div className={`flex items-center gap-1.5 border-b pb-2 font-bold ${isLight ? "border-slate-200 text-slate-900" : "border-slate-800 text-slate-100"}`}>
                  <Zap aria-hidden="true" className="size-3.5 text-amber-500" />
                  <span>Step 1 · Pick Lab Scenario</span>
                </div>

                <div className={`space-y-1 rounded-xl border p-2.5 text-[11px] ${isLight ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/70"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Active Config ({blocks.length} services)
                  </p>
                  <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                    Starts Down:{" "}
                    <code className={`font-mono font-semibold ${isLight ? "text-amber-700" : "text-amber-300"}`}>
                      {authoring.initialStoppedServices.length > 0
                        ? authoring.initialStoppedServices.join(", ")
                        : "None"}
                    </code>
                  </p>
                  <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                    Scale Target:{" "}
                    <code className={`font-mono font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}>
                      {authoring.replicaService && Number(authoring.replicaCount) >= 2
                        ? `${authoring.replicaService} ≥ ${authoring.replicaCount}×`
                        : "Any (observe only)"}
                    </code>
                  </p>
                </div>

                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Pick a 1-click scenario for this repo, or click any service node to customize.
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
                        isLight
                          ? "border-amber-200 bg-amber-50/70 hover:border-amber-400"
                          : "border-amber-500/35 bg-amber-500/10 hover:border-amber-400",
                      ],
                      [
                        "scale",
                        "Horizontal Scale ×2",
                        presetTargets.primaryScale
                          ? `All Up · students scale ${presetTargets.primaryScale} to ≥ 2 replicas.`
                          : "Enables scaling on the primary stateless service and targets ≥ 2 replicas.",
                        isLight
                          ? "border-sky-200 bg-sky-50/70 hover:border-sky-400"
                          : "border-sky-500/35 bg-sky-500/10 hover:border-sky-400",
                      ],
                      [
                        "chaos-scale",
                        "Fault + Scale Drill",
                        presetTargets.faultTarget && presetTargets.primaryScale
                          ? `Stops ${presetTargets.faultTarget} + scales ${presetTargets.primaryScale} to ≥ 2×.`
                          : "Combines 1 stopped dependency with scaling the primary service to 2 pods.",
                        isLight
                          ? "border-violet-200 bg-violet-50/70 hover:border-violet-400"
                          : "border-purple-500/35 bg-purple-500/10 hover:border-purple-400",
                      ],
                      [
                        "healthy",
                        "Healthy Baseline",
                        `All ${blocks.length} services Start Up · students inspect traces & baseline metrics.`,
                        isLight
                          ? "border-slate-200 bg-slate-50/80 hover:border-slate-400"
                          : "border-slate-700 bg-slate-950/70 hover:border-slate-500",
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
                        className={`w-full rounded-xl border p-2.5 text-left transition-colors disabled:opacity-40 ${tone} ${
                          isActive
                            ? isLight
                              ? "ring-2 ring-emerald-500/60"
                              : "ring-1 ring-emerald-400/70"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-[12.5px] font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                            {title}
                          </p>
                          {isActive && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                                isLight
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-emerald-500/20 text-emerald-300"
                              }`}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <p className={`mt-1 text-[11px] leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                          {desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSetupPanel("mission")}
                  className={`h-8 w-full text-xs font-semibold ${
                    isLight
                      ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                      : "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                  }`}
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
            ) : isLight && authoring ? (
              (() => {
                const svc = selected || blocks[0]?.service || "";
                const startsDown = Boolean(svc && authoring.initialStoppedServices.includes(svc));
                const canScale = Boolean(svc && authoring.scalableServices.includes(svc));
                return (
                  <section aria-label="Block authoring setup" className="space-y-3 text-xs text-slate-900">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-sm font-bold text-slate-900">
                          {svc || t("Select a service", "Chọn một service")}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold ${
                            startsDown
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : "border-emerald-300 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {startsDown ? "Starts Down" : "Starts Up"}
                        </span>
                      </div>
                      {svc && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={authoring.busy}
                            onClick={() => authoring.onToggleInitialStopped(svc, false)}
                            className={`h-8 text-xs font-semibold ${
                              startsDown
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            }`}
                          >
                            {startsDown ? "Set Starts Up" : "Set Starts Down"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={authoring.busy}
                            onClick={() => authoring.onToggleScalable(svc)}
                            className={`h-8 text-xs font-semibold ${
                              canScale
                                ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {canScale ? "Scalable ✓" : "Allow Scale"}
                          </Button>
                        </div>
                      )}
                      {svc && authoring.onRemoveBlock && blocks.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={authoring.busy}
                          onClick={() => authoring.onRemoveBlock?.(svc)}
                          className="mt-2 h-8 w-full border-slate-200 bg-white text-xs text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                        >
                          <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                          Remove from Canvas
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Canvas Services ({blocks.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {blocks.map((block) => {
                          const down = authoring.initialStoppedServices.includes(block.service);
                          const active = block.service === svc;
                          return (
                            <button
                              key={block.service}
                              type="button"
                              onClick={() => studio.setService(block.service)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11.5px] font-semibold transition ${
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${down ? "bg-rose-500" : "bg-emerald-500"}`}
                                aria-hidden="true"
                              />
                              {block.service}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })()
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
