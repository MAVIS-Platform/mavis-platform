"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/request-state";
import { ScreenHelpTrigger } from "@/components/shared/screen-guided-tour";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";
import {
  StudioObservability,
  captureStudioImage,
  serializeStudioGraph,
  type StudioAuthorHighlights,
  type StudioQuickAction,
} from "./studio-observability";
import {
  AUTHOR_DRAG_CHIPS,
  AUTHOR_GOALS,
  buildStudentExerciseInstructions,
  computeStaticBlastRadius,
  deriveExerciseFromLiveActions,
  resolveModelServiceEdges,
  smartPickBaselineEndpoint,
  type AuthorBlockChipId,
  type DerivedExerciseFromDemo,
  type EndpointOption,
  type ExerciseTypeKey,
  type StudioGoalId,
  type TargetChangeAction,
} from "./studio-authoring-helpers";
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
  parseMemoryMiB,
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
  maxP95Ms?: string | undefined;
  minImpactF1?: string | undefined;
  predictionRequired?: boolean | undefined;
  exerciseType?: ExerciseTypeKey | null | undefined;
  targetChangeAction?: TargetChangeAction | null | undefined;
  requiredTraceEdge?: { from: string; to: string } | null | undefined;
  allowedActions?: readonly string[] | undefined;
  endpointOptions?: readonly EndpointOption[] | undefined;
  replicaService: string;
  replicaCount: string;
  saving?: boolean | undefined;
  saved?: boolean | undefined;
  syncingDocker?: boolean | undefined;
  error?: string | undefined;
  onClearError?: (() => void) | undefined;
  onSyncDocker?: (() => void) | undefined;
  hasVerifiedSession?: boolean | undefined;
  publishHref?: string | undefined;
  onSelectGoal?: ((goalId: StudioGoalId, preferredService?: string) => void) | undefined;
  onApplyBlockChip?: ((chipId: AuthorBlockChipId, service: string) => void) | undefined;
  onUpdateGoalRule?:
    | ((patch: {
        targetChangeAction?: TargetChangeAction | null;
        predictionRequired?: boolean;
        maxErrorRatePercent?: string;
        minReplicas?: Array<{ service: string; count: number }>;
        instructions?: string;
      }) => void)
    | undefined;
  onToggleWire?: ((from: string, to: string) => void) | undefined;
  onApplyLiveDemoAsExercise?: ((derived: DerivedExerciseFromDemo) => void) | undefined;
  onSaveMission: (patch: {
    instructions: string;
    baselinePath: string;
    maxErrorRatePercent: string;
    maxP95Ms?: string;
    minImpactF1?: string;
    predictionRequired?: boolean;
    allowedActions?: string[];
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

function servicePhase(data: Studio, service: string): "running" | "paused" | "stopped" {
  const running = runningFor(data, service) ?? 0;
  if (running > 0) return "running";
  const last = [...data.actions]
    .reverse()
    .find((a) => a.service === service && a.status === "CONFIRMED");
  return last?.action === "PAUSE" ? "paused" : "stopped";
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
  const { locale, setLocale, t } = useLocale();
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
  const authoringScalable = authoring?.scalableServices;
  const authoringStoppedServices = authoring?.initialStoppedServices;
  const authoringStoppedControllers = authoring?.initialStoppedControllers;
  const effectivePreviewTopology = useMemo<Studio["topology"] | undefined>(() => {
    if (!previewTopology) return undefined;
    if (!authoringScalable || !authoringStoppedServices || !authoringStoppedControllers) {
      return previewTopology;
    }
    return {
      ...previewTopology,
      blocks: previewTopology.blocks.map((block) => ({
        ...block,
        canScale: authoringScalable.includes(block.service),
        initiallyStopped: authoringStoppedServices.includes(block.service),
      })),
      connections: previewTopology.connections.map((conn) => ({
        ...conn,
        initiallyStopped: authoringStoppedControllers.includes(conn.controllerService),
      })),
    };
  }, [previewTopology, authoringScalable, authoringStoppedServices, authoringStoppedControllers]);

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
  const [showNodeTags, setShowNodeTags] = useState(true);
  const [showEdgeTags, setShowEdgeTags] = useState(true);
  const styleCfg = STUDIO_STYLES[studioStyle];
  const isLight = !styleCfg.isDark;
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mavis.studio-style") ?? localStorage.getItem("mavis.studio-theme");
      if (saved) setStudioStyle(resolveStudioStyle(saved));
      const savedNodeTags = localStorage.getItem("mavis.studio.show-node-tags");
      if (savedNodeTags === "0" || savedNodeTags === "false") setShowNodeTags(false);
      const savedEdgeTags = localStorage.getItem("mavis.studio.show-edge-tags");
      if (savedEdgeTags === "0" || savedEdgeTags === "false") setShowEdgeTags(false);
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
  const toggleNodeTagsPersisted = () => {
    setShowNodeTags((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mavis.studio.show-node-tags", next ? "1" : "0");
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  };
  const toggleEdgeTagsPersisted = () => {
    setShowEdgeTags((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mavis.studio.show-edge-tags", next ? "1" : "0");
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  };
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(() => Boolean(authoring));
  const [rightCardMode, setRightCardMode] = useState<"service" | "diagnostics">("service");
  const [missionCollapsed, setMissionCollapsed] = useState(false);
  const [missionHidden, setMissionHidden] = useState(() => Boolean(authoring));
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
  const [rightWidth, setRightWidth] = useState(() => (authoring ? 360 : 340));
  const [rightHeight, setRightHeight] = useState<number | null>(null);
  const [rightOffset, setRightOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [missionWidth, setMissionWidth] = useState(278);
  const [missionHeight, setMissionHeight] = useState<number | null>(null);
  const [missionOffset, setMissionOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [frontPanel, setFrontPanel] = useState<"right" | "mission">("right");
  const [bottomHeight, setBottomHeight] = useState(256);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const leftAsideRef = useRef<HTMLElement>(null);
  const bottomDrawerRef = useRef<HTMLDivElement>(null);
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
    if (graphRef.current) graphRef.current.style.pointerEvents = "none";
    const resizedCard =
      axis === "right" || axis === "right-height" || axis === "right-corner"
        ? rightCardRef.current
        : axis === "mission-width" || axis === "mission-height" || axis === "mission-corner"
          ? missionCardRef.current
          : null;
    if (resizedCard) resizedCard.style.backdropFilter = "none";
    document.body.style.cursor =
      axis === "bottom" || axis === "right-height" || axis === "mission-height"
        ? "row-resize"
        : axis === "right-corner"
          ? "nesw-resize"
          : axis === "mission-corner"
            ? "nwse-resize"
            : "col-resize";

    let rafId = 0;
    let pendingMove: PointerEvent | null = null;
    let nextLeftWidth = leftWidth;
    let nextShowLeft = showLeft;
    let nextRightWidth = initialRight;
    let nextRightHeight: number | null = rightHeight;
    let nextMissionWidth = initialMissionWidth;
    let nextMissionHeight: number | null = missionHeight;
    let nextBottomHeight = bottomHeight;
    let nextBottomCollapsed = bottomCollapsed;
    let didMove = false;

    const applyFrame = () => {
      rafId = 0;
      const moveEvent = pendingMove;
      if (!moveEvent) return;
      pendingMove = null;
      didMove = true;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxCardW = Math.max(360, Math.min(720, window.innerWidth - 96));
      const maxCardH = Math.max(260, window.innerHeight - 104);

      if (axis === "left") {
        const raw = initialLeft + dx;
        if (raw < 90) {
          nextShowLeft = false;
        } else {
          nextShowLeft = true;
          nextLeftWidth = Math.max(180, Math.min(560, Math.round(raw)));
          if (leftAsideRef.current) leftAsideRef.current.style.width = `${nextLeftWidth}px`;
        }
      } else if (axis === "right" || axis === "right-corner") {
        nextRightWidth = Math.max(260, Math.min(maxCardW, Math.round(initialRight - dx)));
        if (rightCardRef.current) rightCardRef.current.style.width = `${nextRightWidth}px`;
        if (axis === "right-corner") {
          nextRightHeight = Math.max(220, Math.min(maxCardH, Math.round(initialRightHeight + dy)));
          if (rightCardRef.current) rightCardRef.current.style.height = `${nextRightHeight}px`;
        }
      } else if (axis === "right-height") {
        nextRightHeight = Math.max(220, Math.min(maxCardH, Math.round(initialRightHeight + dy)));
        if (rightCardRef.current) rightCardRef.current.style.height = `${nextRightHeight}px`;
      } else if (axis === "mission-width" || axis === "mission-corner") {
        nextMissionWidth = Math.max(210, Math.min(Math.min(520, maxCardW), Math.round(initialMissionWidth + dx)));
        if (missionCardRef.current) missionCardRef.current.style.width = `${nextMissionWidth}px`;
        if (axis === "mission-corner") {
          nextMissionHeight = Math.max(140, Math.min(maxCardH, Math.round(initialMissionHeight + dy)));
          if (missionCardRef.current) missionCardRef.current.style.height = `${nextMissionHeight}px`;
        }
      } else if (axis === "mission-height") {
        nextMissionHeight = Math.max(140, Math.min(maxCardH, Math.round(initialMissionHeight + dy)));
        if (missionCardRef.current) missionCardRef.current.style.height = `${nextMissionHeight}px`;
      } else {
        const raw = initialBottom - dy;
        const maxBottom = Math.max(540, Math.round(window.innerHeight * 0.78));
        if (raw < 72) {
          nextBottomCollapsed = true;
        } else {
          nextBottomCollapsed = false;
          nextBottomHeight = Math.max(100, Math.min(maxBottom, Math.round(raw)));
          if (bottomDrawerRef.current) bottomDrawerRef.current.style.height = `${nextBottomHeight}px`;
          if (rightCardRef.current) {
            const topPx = Math.max(16, 16 + rightOffset.y);
            rightCardRef.current.style.maxHeight = `calc(100% - ${topPx + nextBottomHeight + 24}px)`;
          }
        }
      }
    };

    function onPointerMove(moveEvent: PointerEvent) {
      pendingMove = moveEvent;
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    }

    function cleanup() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (pendingMove) applyFrame();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (graphRef.current) graphRef.current.style.pointerEvents = "";
      if (resizedCard) resizedCard.style.backdropFilter = "";
      if (didMove) {
        if (axis === "left") {
          setShowLeft(nextShowLeft);
          if (nextShowLeft) setLeftWidth(nextLeftWidth);
        } else if (axis === "right" || axis === "right-corner") {
          setRightWidth(nextRightWidth);
          if (axis === "right-corner" && nextRightHeight != null) setRightHeight(nextRightHeight);
        } else if (axis === "right-height" && nextRightHeight != null) {
          setRightHeight(nextRightHeight);
        } else if (axis === "mission-width" || axis === "mission-corner") {
          setMissionWidth(nextMissionWidth);
          if (axis === "mission-corner" && nextMissionHeight != null) {
            setMissionCollapsed(false);
            setMissionHeight(nextMissionHeight);
          }
        } else if (axis === "mission-height" && nextMissionHeight != null) {
          setMissionCollapsed(false);
          setMissionHeight(nextMissionHeight);
        } else if (axis === "bottom") {
          setBottomCollapsed(nextBottomCollapsed);
          if (!nextBottomCollapsed) setBottomHeight(nextBottomHeight);
        }
      }
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
    // Pause WebGL pointer raycasts & backdrop-blur readbacks while dragging over 3D canvas.
    if (graphRef.current) graphRef.current.style.pointerEvents = "none";
    if (card) {
      card.style.willChange = "transform";
      card.style.backdropFilter = "none";
    }

    let rafId = 0;
    let pendingMove: PointerEvent | null = null;
    let latestOffset = initial;
    let didMove = false;

    const applyFrame = () => {
      rafId = 0;
      const moveEvent = pendingMove;
      if (!moveEvent) return;
      pendingMove = null;
      didMove = true;
      const nextX = initial.x + (moveEvent.clientX - startX);
      const nextY = initial.y + (moveEvent.clientY - startY);
      const minY = -8;
      const maxY = Math.max(-8, ph - 72);
      const clampedY = Math.max(minY, Math.min(maxY, Math.round(nextY)));
      const clampedX =
        panel === "right"
          ? Math.max(16 - Math.max(8, pw - cw - 8), Math.min(8, Math.round(nextX)))
          : Math.max(-62, Math.min(Math.max(-62, pw - cw - 78), Math.round(nextX)));
      latestOffset = { x: clampedX, y: clampedY };
      if (card) {
        // GPU-composited drag: 0 React re-renders per pixel while dragging floating panels.
        card.style.transform = `translate3d(${clampedX - initial.x}px, ${clampedY - initial.y}px, 0)`;
      }
    };

    function onPointerMove(moveEvent: PointerEvent) {
      pendingMove = moveEvent;
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    }

    function cleanup() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (pendingMove) applyFrame();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (graphRef.current) graphRef.current.style.pointerEvents = "";
      if (card) {
        card.style.transform = "";
        card.style.willChange = "";
        card.style.backdropFilter = "";
      }
      if (didMove) {
        if (panel === "right") setRightOffset(latestOffset);
        else setMissionOffset(latestOffset);
      }
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
  const [maxP95Draft, setMaxP95Draft] = useState(authoring?.maxP95Ms ?? "");
  const [minImpactF1Draft, setMinImpactF1Draft] = useState(authoring?.minImpactF1 ?? "0.7");
  const [predictionRequiredDraft, setPredictionRequiredDraft] = useState(
    authoring?.predictionRequired === true,
  );
  const [allowedActionsDraft, setAllowedActionsDraft] = useState<string[]>(() =>
    authoring?.allowedActions?.length
      ? [...authoring.allowedActions]
      : ["START", "STOP", "SCALE", "PAUSE", "RESUME", "THROTTLE_CPU", "SET_LOAD", "CONNECT", "DISCONNECT"],
  );
  const [replicaSvcDraft, setReplicaSvcDraft] = useState(authoring?.replicaService ?? "");
  const [replicaCountDraft, setReplicaCountDraft] = useState(authoring?.replicaCount ?? "");
  const [selectedAuthorWire, setSelectedAuthorWire] = useState<{ from: string; to: string } | null>(
    null,
  );

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
    setMaxP95Draft(authoring.maxP95Ms ?? "");
    setMinImpactF1Draft(authoring.minImpactF1 ?? "0.7");
    setPredictionRequiredDraft(authoring.predictionRequired === true);
    if (authoring.allowedActions?.length) {
      setAllowedActionsDraft([...authoring.allowedActions]);
    }
    setReplicaSvcDraft(authoring.replicaService);
    setReplicaCountDraft(authoring.replicaCount);
  }, [
    authoring?.instructions,
    authoring?.baselinePath,
    authoring?.maxErrorRatePercent,
    authoring?.maxP95Ms,
    authoring?.minImpactF1,
    authoring?.predictionRequired,
    authoring?.allowedActions,
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

  const blocks = useMemo(
    () =>
      data.topology?.blocks ??
      data.services.map((service) => ({
        service,
        label: service,
        canScale: false,
        initiallyStopped: false,
      })),
    [data.topology?.blocks, data.services],
  );
  const nodeNames = useMemo(
    () => Object.fromEntries(blocks.map((block) => [block.service, block.label])),
    [blocks],
  );
  const configuredEdges = useMemo(
    () =>
      data.topology?.connections.flatMap((link) => {
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
      }),
    [data],
  );
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
      if (command.action === "SCALE" && command.replicas && command.replicas >= 1 && command.replicas <= 3) {
        authoring.onSetReplicaTarget?.(command.service, command.replicas);
      }
      return;
    }
    if (command.action === "SCALE") {
      if (!canScaleFor(command.service)) return;
      if (command.replicas === undefined || command.replicas < 1 || command.replicas > 3) return;
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

  const referenceModel = useApiQuery(
    "model",
    { modelId: data.modelVersionId ?? "", projectId: data.projectId ?? "" },
    { enabled: Boolean(data.modelVersionId && data.projectId) },
  );

  const staticEdgesForBlast = useMemo(() => {
    const seen = new Set<string>();
    const edges: Array<{ from: string; to: string }> = [];
    const add = (from: string, to: string) => {
      if (!from || !to || from === to) return;
      const key = `${from}->${to}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to });
    };
    for (const c of data.topology?.connections ?? []) add(c.from, c.to);
    for (const m of resolveModelServiceEdges(referenceModel.data, data.serviceMappings, services)) {
      add(m.from, m.to);
    }
    for (const inter of data.telemetry?.interactions ?? []) {
      add(inter.fromService, inter.toService);
    }
    return edges;
  }, [data.topology?.connections, referenceModel.data, data.serviceMappings, services, data.telemetry?.interactions]);

  const staticBlastRadius = useMemo(
    () =>
      computeStaticBlastRadius(
        authoring?.targetChangeAction?.service ?? null,
        staticEdgesForBlast,
      ),
    [authoring?.targetChangeAction?.service, staticEdgesForBlast],
  );

  const authoringTargetService = authoring?.targetChangeAction?.service ?? null;
  const authoringRequiredEdge = authoring?.requiredTraceEdge ?? null;
  const authorHighlights = useMemo<StudioAuthorHighlights | undefined>(() => {
    if (!authoringStoppedServices || !authoringScalable) return undefined;
    return {
      authorStoppedServices: new Set(authoringStoppedServices),
      impactTarget: authoringTargetService,
      predictedUpstream: new Set(staticBlastRadius.upstreamImpacted),
      impactEdgeKeys: staticBlastRadius.impactedEdgeKeys,
      requiredTraceEdge: authoringRequiredEdge,
      scalableServices: new Set(authoringScalable),
    };
  }, [
    authoringStoppedServices,
    authoringTargetService,
    authoringRequiredEdge,
    authoringScalable,
    staticBlastRadius,
  ]);

  const authoringWithBlast = useMemo<LiveBlockAuthoringControls | undefined>(() => {
    if (!authoring) return undefined;
    return {
      ...authoring,
      impactTargetService: authoring.targetChangeAction?.service ?? null,
      predictedImpactedServices: staticBlastRadius.upstreamImpacted,
      onDropAuthorChip: (chipId: string, svc: string) => {
        authoring.onApplyBlockChip?.(chipId as AuthorBlockChipId, svc);
      },
    };
  }, [authoring, staticBlastRadius.upstreamImpacted]);

  const activeGoalId = useMemo<StudioGoalId | null>(() => {
    if (!authoring) return null;
    if (
      authoring.exerciseType === "CHANGE_IMPACT" ||
      (authoring.predictionRequired &&
        (authoring.targetChangeAction?.action === "PAUSE" ||
          authoring.targetChangeAction?.action === "STOP"))
    ) {
      return "change-impact";
    }
    if (
      authoring.exerciseType === "CONFIG_REGRESSION" ||
      authoring.targetChangeAction?.action === "THROTTLE_CPU"
    ) {
      return "cpu";
    }
    if (
      authoring.exerciseType === "SCALE_UNDER_LOAD" ||
      (authoring.replicaService && Number(authoring.replicaCount) >= 2)
    ) {
      return "scale";
    }
    if (
      authoring.exerciseType === "CIRCUIT_BREAKER" ||
      authoring.initialStoppedServices.length > 0
    ) {
      return "recovery";
    }
    return null;
  }, [authoring]);

  const missionDirty = Boolean(
    authoring &&
      (missionDraft !== authoring.instructions ||
        baselineDraft !== authoring.baselinePath ||
        maxErrDraft !== authoring.maxErrorRatePercent ||
        maxP95Draft !== (authoring.maxP95Ms ?? "") ||
        minImpactF1Draft !== (authoring.minImpactF1 ?? "0.7") ||
        predictionRequiredDraft !== (authoring.predictionRequired === true) ||
        replicaSvcDraft !== authoring.replicaService ||
        replicaCountDraft !== authoring.replicaCount ||
        (authoring.allowedActions &&
          allowedActionsDraft.slice().sort().join(",") !==
            [...authoring.allowedActions].sort().join(","))),
  );

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
  const stoppedServiceNames = services.filter(
    (svc) => runningFor(data, svc) === 0 && servicePhase(data, svc) === "stopped",
  );
  const liveDemoDerived = useMemo(
    () =>
      authoring && !isPreviewMode
        ? deriveExerciseFromLiveActions(data.actions, stoppedServiceNames, locale)
        : null,
    [authoring, isPreviewMode, data.actions, stoppedServiceNames, locale],
  );
  const pausedServiceNames = services.filter((svc) => servicePhase(data, svc) === "paused");
  const faultedServices = [...stoppedServiceNames, ...pausedServiceNames];
  const snapshotCount = data.snapshots?.length ?? 0;
  const healthyCount = Math.max(0, services.length - faultedServices.length);
  const needsPrediction =
    !isPreviewMode &&
    !authoring &&
    Boolean(
      (data.exerciseCriteria as { predictionRequired?: boolean } | null | undefined)
        ?.predictionRequired || data.exerciseEvaluation?.predictionRequired,
    ) &&
    !(data.prediction?.predictedServices?.length) &&
    !hasConfirmedAction &&
    data.executionStatus === "RUNNING";
  const autoOpenedPredictionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!needsPrediction || !sessionId) return;
    if (autoOpenedPredictionRef.current === sessionId) return;
    autoOpenedPredictionRef.current = sessionId;
    setRightCardMode("service");
    setShowRight(true);
  }, [needsPrediction, sessionId]);
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
        className={`relative z-40 flex h-12 shrink-0 flex-nowrap items-center gap-2 border-b px-3 ${styleCfg.topBarClass}`}
      >
        {standaloneHeader?.left && (
          <>
            <div data-tour="studio-top-nav" className="flex min-w-0 items-center gap-2">
              {standaloneHeader.left}
            </div>
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
              onClick={() => {
                if (liveDemoDerived && authoring.onApplyLiveDemoAsExercise) {
                  authoring.onApplyLiveDemoAsExercise(liveDemoDerived);
                } else {
                  captureLiveCanvasAsExercise();
                }
              }}
              title={
                liveDemoDerived
                  ? `${t("Turn your live Docker actions into the graded Lab exercise", "Dùng trạng thái và thao tác vừa thử làm đề bài Lab")}: ${liveDemoDerived.summary}`
                  : t(
                      "Turn your live Docker actions into the graded Lab exercise",
                      "Dùng trạng thái và thao tác vừa thử làm đề bài Lab",
                    )
              }
              className="h-8 px-2.5 text-[12.5px]"
            >
              {authoring.saving
                ? t("Saving…", "Đang lưu…")
                : liveDemoDerived
                  ? t("Use live actions as exercise", "Dùng thao tác làm đề bài")
                  : t("Save Canvas", "Lưu trạng thái")}
            </Button>
          )}

          {/* Studio Live Guided Tour (?) Trigger + Comprehensive SE EN/VI Switcher */}
          <ScreenHelpTrigger
            screenId={authoring ? "studio-live-author" : "studio-live"}
            surfaceTheme={isLight ? "light" : "dark"}
            onTriggerClick={() => {
              setTelemetryPopoverOpen(false);
              setStylePopoverOpen(false);
              setSettingsPopoverOpen(false);
            }}
            onStepChange={(stepId) => {
              if (stepId === "studio-author-builder" || stepId === "studio-inspector") {
                setRightCardMode("service");
                setShowRight(true);
              } else if (stepId === "studio-mission") {
                setMissionHidden(false);
                setMissionCollapsed(false);
              } else if (stepId === "studio-dock") {
                setBottomCollapsed(true);
              }
            }}
            triggerClassName={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${styleCfg.topControlClass}`}
            iconClassName="size-4"
          />
          <div
            role="group"
            data-testid="studio-locale-toggle"
            data-tour="studio-locale-toggle"
            aria-label={t("Studio language", "Ngôn ngữ Studio")}
            className={`inline-flex h-8 shrink-0 items-center p-0.5 text-[11.5px] font-semibold ${styleCfg.tabTrackClass}`}
          >
            {(["en", "vi"] as const).map((lang) => {
              const active = locale === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLocale(lang)}
                  title={
                    lang === "vi"
                      ? "Tiếng Việt chuẩn SE (giữ nguyên tên service & thuật ngữ kỹ thuật)"
                      : "Switch Studio UI to English"
                  }
                  className={`px-2 py-0.5 font-mono text-[11px] font-bold uppercase transition ${
                    active ? styleCfg.tabActiveClass : styleCfg.tabIdleClass
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* Compact Live Metrics Summary & Session Switcher Popover */}
          <div data-tour="studio-telemetry-hud" className="relative hidden shrink-0 lg:block">
            <button
              type="button"
              onClick={() => {
                setTelemetryPopoverOpen((open) => !open);
                setStylePopoverOpen(false);
                setSettingsPopoverOpen(false);
              }}
              className={`inline-flex h-8 items-center gap-2 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition ${styleCfg.topControlClass}`}
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

          {/* Theme Switcher + Workspace Settings Grouped Together for Clean Spotlight */}
          <div data-tour="studio-top-right-tools" className="flex shrink-0 items-center gap-1.5">
          {/* 4-Style Architectural Visual Switcher (Daylight Cloud / Blueprint / Tactile Pop / Control Glass) */}
          <div data-tour="studio-style-picker" className="relative">
            <button
              type="button"
              aria-label={t("Studio visual style", "Chọn phong cách Studio")}
              title={t("Studio visual style", "Chọn phong cách Studio")}
              onClick={() => {
                setStylePopoverOpen((open) => !open);
                setTelemetryPopoverOpen(false);
                setSettingsPopoverOpen(false);
              }}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-semibold transition ${
                stylePopoverOpen
                  ? `${styleCfg.controlRadiusClass} border ${styleCfg.controlActiveClass}`
                  : styleCfg.topControlClass
              }`}
            >
              <Palette className="size-3.5 opacity-80" aria-hidden="true" />
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

          {/* Workspace Options Popover Trigger */}
          <div data-tour="studio-settings-btn" className="relative">
            <button
              type="button"
              aria-label={t("Studio settings", "Cài đặt Studio")}
              title={t("Studio settings", "Cài đặt Studio")}
              onClick={() => {
                setSettingsPopoverOpen((open) => !open);
                setStylePopoverOpen(false);
                setTelemetryPopoverOpen(false);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center transition ${
                settingsPopoverOpen
                  ? `${styleCfg.controlRadiusClass} border ${styleCfg.controlActiveClass}`
                  : styleCfg.topControlClass
              }`}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </button>

            {settingsPopoverOpen && (
              <div
                className={`absolute right-0 top-full z-40 mt-2 w-72 space-y-2.5 p-3.5 ${styleCfg.floatingCardClass}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Workspace Panels", "Hiển thị & Bảng điều khiển")}
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
                        ? t("Visual Builder Panel", "Bảng soạn bài 3D")
                        : t("Service Controls Card", "Bảng điều khiển service")}
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
                      {t("Service List Sidebar", "Thanh danh sách service")}
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
                        {t("Show Mission Card", "Hiện thẻ đề bài")}
                      </span>
                    </button>
                  )}
                </div>

                {/* 3D Floating Tag Toggles (stay open so lecturer/student can toggle both cleanly) */}
                <div
                  className={`space-y-1 border-t pt-2 text-xs ${
                    isLight ? "border-slate-200" : "border-slate-800"
                  }`}
                >
                  <p className="px-2.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("3D Canvas Tags", "Nhãn nổi trên sơ đồ 3D")}
                  </p>
                  <button
                    type="button"
                    data-testid="toggle-3d-node-tags"
                    aria-pressed={showNodeTags}
                    onClick={toggleNodeTagsPersisted}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                      isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                    }`}
                  >
                    <span>{t("Service tags (3D)", "Nhãn tên service (3D)")}</span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        showNodeTags ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {showNodeTags ? "ON" : "OFF"}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="toggle-3d-edge-tags"
                    aria-pressed={showEdgeTags}
                    onClick={toggleEdgeTagsPersisted}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                      isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                    }`}
                  >
                    <span>{t("Path & impact tags", "Nhãn đường gọi & Impact")}</span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        showEdgeTags ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {showEdgeTags ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>

                {showLiveSessionControls && (data.executionStatus === "RUNNING" || isBooting) && (
                  <div
                    className={`border-t pt-2 text-xs ${
                      isLight ? "border-slate-200" : "border-slate-800"
                    }`}
                  >
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
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {standaloneHeader?.right && (
            <div data-tour="studio-author-actions" className="flex shrink-0 items-center gap-1.5">
              {standaloneHeader.right}
            </div>
          )}

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
              ref={leftAsideRef}
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
                  // Clicking the already-selected service toggles deselection cleanly.
                  const nextSvc = svc && svc === canvasSelected ? "" : svc;
                  studio.setService(nextSvc);
                  setSelectedAuthorWire(null);
                  if (nextSvc) {
                    if (!authoring) setSetupPanel("service");
                    else if (setupPanel === "mission") setSetupPanel("presets");
                    setRightCardMode("service");
                    setShowRight(true);
                  }
                }}
                onCommand={dispatchCommand}
                sections={["library"]}
                compact
                label="Live block library"
                studioStyle={studioStyle}
                authoring={authoringWithBlast}
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
          <div ref={graphRef} data-tour="studio-canvas" className="relative min-h-[240px] min-w-0 flex-1 overflow-hidden">
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
                  // Clicking the already-selected service toggles deselection cleanly.
                  const nextSvc = svc && svc === canvasSelected ? "" : svc;
                  studio.setService(nextSvc);
                  setSelectedAuthorWire(null);
                  if (nextSvc) {
                    if (!authoring) setSetupPanel("service");
                    else if (setupPanel === "mission") setSetupPanel("presets");
                    setRightCardMode("service");
                    setShowRight(true);
                  }
                }}
                busy={isPreviewMode ? false : busy}
                canvasOnly
                defaultView="3D"
                studioStyle={studioStyle}
                surfaceTheme={isLight ? "light" : "dark"}
                showNodeTags={showNodeTags}
                showEdgeTags={showEdgeTags}
                nodeNames={nodeNames}
                {...(configuredEdges && configuredEdges.length > 0 ? { configuredEdges } : {})}
                {...(authorHighlights ? { authorHighlights } : {})}
                {...(authoring?.onApplyBlockChip
                  ? {
                      onDropAuthorChip: (chipId: string, svc: string) => {
                        studio.setService(svc);
                        setSelectedAuthorWire(null);
                        setSetupPanel("presets");
                        setRightCardMode("service");
                        setShowRight(true);
                        authoring.onApplyBlockChip?.(chipId as AuthorBlockChipId, svc);
                      },
                    }
                  : {})}
                {...(authoring
                  ? {
                      onSelectEdge: (edge: { id: string; from: string; to: string }) => {
                        setSelectedAuthorWire({ from: edge.from, to: edge.to });
                        setSetupPanel("presets");
                        setRightCardMode("service");
                        setShowRight(true);
                      },
                    }
                  : {})}
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
              data-tour="studio-tool-rail"
              aria-label={t("Studio tools", "Công cụ Studio")}
              className={`pointer-events-auto absolute top-4 left-4 z-20 flex flex-col items-center gap-1.5 p-1.5 ${styleCfg.railClass}`}
            >
              <button
                type="button"
                data-tour="studio-tool-mission"
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
                className={`relative grid size-9 place-items-center transition ${
                  !missionHidden ? styleCfg.railActiveClass : styleCfg.railIdleClass
                }`}
              >
                <Target className="size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                data-tour="studio-tool-services"
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
                className={`relative grid size-9 place-items-center transition ${
                  showRight && rightCardMode === "service"
                    ? styleCfg.railActiveClass
                    : styleCfg.railIdleClass
                }`}
              >
                <Layers className="size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                data-tour="studio-tool-diagnostics"
                title={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
                aria-label={t("Impact & Root Cause Diagnostics", "Chẩn đoán Change Impact")}
                aria-pressed={showRight && rightCardMode === "diagnostics"}
                onClick={() => {
                  setRightCardMode("diagnostics");
                  setShowRight((open) => (rightCardMode === "diagnostics" ? !open : true));
                }}
                className={`relative grid size-9 place-items-center transition ${
                  showRight && rightCardMode === "diagnostics"
                    ? styleCfg.railActiveClass
                    : styleCfg.railIdleClass
                }`}
              >
                <Lightbulb className="size-4" aria-hidden="true" />
                {faultedServices.length > 0 && (
                  <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              <span className={`my-0.5 h-px w-6 ${styleCfg.dividerClass}`} aria-hidden="true" />

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
                  className={`relative grid size-9 place-items-center transition ${
                    !bottomCollapsed && tab === "snapshots"
                      ? styleCfg.railActiveClass
                      : styleCfg.railIdleClass
                  }`}
                >
                  <History className="size-4" aria-hidden="true" />
                  {snapshotCount > 0 && (
                    <span
                      style={{ fontSize: 9, lineHeight: 1 }}
                      className={`pointer-events-none absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full px-1 py-0.5 font-mono font-bold ${styleCfg.railBadgeClass}`}
                    >
                      {snapshotCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                title={t("Logs & Traces", "Log & Trace")}
                aria-label={t("Logs & Traces", "Log & Trace")}
                aria-pressed={!bottomCollapsed && tab !== "snapshots"}
                onClick={() => {
                  if (!bottomCollapsed && tab !== "snapshots") {
                    setBottomCollapsed(true);
                  } else {
                    setTab("logs");
                    setBottomCollapsed(false);
                  }
                }}
                className={`relative grid size-9 place-items-center transition ${
                  !bottomCollapsed && tab !== "snapshots"
                    ? styleCfg.railActiveClass
                    : styleCfg.railIdleClass
                }`}
              >
                <Terminal className="size-4" aria-hidden="true" />
                {logsAndTracesCount > 0 && (
                  <span
                    style={{ fontSize: 9, lineHeight: 1 }}
                    className={`pointer-events-none absolute -top-1 -right-1 rounded-full px-1 py-0.5 font-mono font-bold ${styleCfg.railBadgeClass}`}
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
                data-tour="studio-mission"
                aria-label={t("Lab Mission", "Mục tiêu Lab")}
                onPointerDown={() => setFrontPanel("mission")}
                style={{
                  left: 70 + missionOffset.x,
                  top: 16 + missionOffset.y,
                  width: missionWidth,
                  maxHeight: `calc(100% - ${Math.max(16, 16 + missionOffset.y) + 172}px)`,
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
                    {studio.cancelledWhileQueued && (
                      <p
                        role="status"
                        className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium ${
                          isLight
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-amber-500/40 bg-amber-500/15 text-amber-200"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {t(
                            "Your queued session was cancelled because the tab was inactive. Click Run again.",
                            "Phiên chờ đã bị hủy do tab không hoạt động. Hãy bấm Run lại.",
                          )}
                        </span>
                      </p>
                    )}
                    {needsPrediction && (
                      <p
                        role="status"
                        className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium ${
                          isLight
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-amber-500/40 bg-amber-500/15 text-amber-200"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {t(
                            "Lock your impact prediction before your first action.",
                            "Hãy khóa dự đoán tác động trước thao tác đầu tiên.",
                          )}
                        </span>
                      </p>
                    )}
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
                data-tour="studio-command-dock"
                aria-label={t("Live Command Dock", "Thanh điều khiển trực tiếp")}
                className={`pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 px-3 py-2 ${styleCfg.floatingPillClass}`}
              >
                {faultedServices.length > 0 && (
                  <>
                    <span className="hidden max-w-[260px] truncate text-[13px] font-medium text-muted-foreground xl:inline">
                      {t(`${faultedServices.join(", ")} faulted`, `${faultedServices.join(", ")} đang sự cố`)}
                    </span>
                    <span className={`hidden h-4 w-px shrink-0 xl:inline-block ${isLight ? "bg-slate-200" : "bg-slate-700"}`} aria-hidden="true" />
                  </>
                )}

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
                      {locale === "vi"
                        ? isQueued
                          ? `Đang chờ${data.queuePosition ? ` #${data.queuePosition}` : "…"}`
                          : isBooting ? "Đang khởi động…" : "Chạy Docker"
                        : isQueued
                          ? `Queued${data.queuePosition ? ` #${data.queuePosition}` : "…"}`
                          : isBooting ? "Booting…" : "Run"}
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
                                : (data.snapshots?.length ?? 0) === 0
                                  ? t(
                                      "Capture at least one evidence snapshot before finishing.",
                                      "Chụp ít nhất 1 snapshot bằng chứng trước khi kết thúc.",
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
                        (data.snapshots?.length ?? 0) === 0 ||
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
                  className={`h-8 whitespace-nowrap border px-3 text-[12.5px] font-semibold transition ${
                    studioStyle === "blueprint" ? "rounded-sm" : "rounded-full"
                  } ${styleCfg.controlIdleClass}`}
                >
                  {t("Impact", "Tác động")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab("logs");
                    setBottomCollapsed(false);
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap border px-3 text-[12.5px] font-semibold transition ${
                    studioStyle === "blueprint" ? "rounded-sm" : "rounded-full"
                  } ${styleCfg.controlIdleClass}`}
                >
                  <Terminal className="size-3.5 opacity-80" aria-hidden="true" />
                  <span>{t("Logs & Traces", "Log & Trace")}</span>
                  {logsAndTracesCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 font-mono text-[11px] font-bold ${
                        studioStyle === "pop"
                          ? "border border-slate-900 bg-[#DBEAFE] text-slate-950"
                          : studioStyle === "blueprint"
                            ? "bg-blue-100 text-blue-800"
                            : isLight
                              ? "bg-sky-100 text-sky-800"
                              : "bg-sky-500/20 text-sky-200"
                      }`}
                    >
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
            ref={bottomDrawerRef}
            style={{ height: bottomHeight }}
            className={`flex min-w-0 shrink-0 flex-col overflow-hidden border-t ${styleCfg.drawerClass} ${
              resizingAxis === "bottom" ? "" : "transition-[height] duration-150"
            }`}
          >
            <div
              className={`flex h-10 shrink-0 items-center gap-1 border-b px-3 ${styleCfg.drawerTabBarClass}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["stats", t("Stats", "Tổng quan"), t("Stats", "Tổng quan hệ thống")],
                  [
                    "telemetry",
                    `${t("Telemetry", "Thông số")} (${observedData.services.length})`,
                    `${t("Service Telemetry & Impact", "Thông số service & Tác động")} (${observedData.services.length})`,
                  ],
                  [
                    "logs",
                    `${t("Logs & Traces", "Log & Trace")} (${logsAndTracesCount})`,
                    `${t("Logs & Traces", "Log & Trace")} (${logsAndTracesCount})`,
                  ],
                  [
                    "snapshots",
                    `${t("Snapshots & Replay", "Snapshot & Phát lại")} (${(data.snapshots?.length ?? 0) + liveReplays.length})`,
                    `${t("Snapshots & Replay", "Snapshot & Phát lại")} (${(data.snapshots?.length ?? 0) + liveReplays.length})`,
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
                  className={`shrink-0 whitespace-nowrap border px-2.5 py-1 text-[12.5px] font-semibold transition ${styleCfg.controlRadiusClass} ${
                    tab === id
                      ? styleCfg.controlActiveClass
                      : `border-transparent ${styleCfg.tabIdleClass}`
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
                  title={dockExpanded ? t("Collapse dock", "Thu gọn ngăn dưới") : t("Expand dock", "Mở rộng ngăn dưới")}
                  onClick={() => {
                    if (bottomCollapsed) {
                      setBottomCollapsed(false);
                      setBottomHeight(232);
                    } else {
                      setBottomHeight(dockExpanded ? 232 : 400);
                    }
                  }}
                  className={`grid size-6 shrink-0 place-items-center rounded border transition-colors ${
                    isLight
                      ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-100"
                  }`}
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
                  className={`grid size-6 shrink-0 place-items-center rounded border transition-colors ${
                    isLight
                      ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-100"
                  }`}
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
            const leaseSeconds =
              observedData.limits?.sessionTimeoutSeconds ?? observedData.limits?.timeoutSeconds;
            const leaseLabel =
              typeof leaseSeconds === "number" && leaseSeconds > 0
                ? leaseSeconds >= 3600
                  ? `${Math.round(leaseSeconds / 60)}m`
                  : leaseSeconds >= 60
                    ? `${Math.round(leaseSeconds / 60)}m`
                    : `${leaseSeconds}s`
                : null;

            return (
              <section
                className="mavis-tabular mx-auto max-w-7xl space-y-2.5 px-1 py-0.5"
                aria-labelledby="live-cluster-overview"
              >
                {/* Row 1: Compact Single-Line Header */}
                <header
                  className={`flex flex-wrap items-center justify-between gap-2 border-b pb-1.5 ${
                    isLight ? "border-slate-200" : "border-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2
                      id="live-cluster-overview"
                      className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}
                    >
                      {locale === "vi" ? "Tổng quan hệ thống" : "Cluster Overview"}
                    </h2>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {cpusPerPod} vCPU · {memPerPodMiB.toLocaleString()} MiB/pod
                      {leaseLabel ? ` · ${t("Lease", "Thời lượng")} ${leaseLabel}` : ""}
                    </span>
                  </div>

                  <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {[
                      [t("Services", "Service"), blocks.length.toLocaleString()],
                      ["Pods", hasAnyReplicaSample ? observedRunningReplicas.toLocaleString() : "—"],
                      [t("Down", "Đang tắt"), downServicesCount.toLocaleString()],
                      [t("Actions", "Thao tác"), observedConfirmed.length.toLocaleString()],
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

                {/* Row 2: Full-Width Unified KPI + Capacity Strip */}
                <div
                  className={`grid gap-2.5 rounded-xl border px-3 py-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)] lg:items-center ${
                    isLight
                      ? "border-slate-200 bg-slate-50/70"
                      : "border-slate-800 bg-slate-900/75"
                  }`}
                >
                  <section aria-label="Traffic & reliability">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className={`text-[10.5px] font-bold uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                        {locale === "vi" ? "Lưu lượng & Độ ổn định" : <>Traffic &amp; reliability</>}
                      </h3>
                      {reqNum === null && (
                        <span className="text-[10.5px] text-muted-foreground">
                          {observedData.executionStatus === "RUNNING"
                            ? t("Live Docker running — awaiting probe traffic", "Docker đang chạy — chờ lưu lượng probe")
                            : isBooting
                              ? t("Booting Live Docker…", "Đang khởi động Docker…")
                              : t("Start Live Docker to measure", "Bấm Chạy Docker để đo thông số thật")}
                        </span>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[
                        {
                          label: t("Throughput", "Lưu lượng"),
                          value: liveRps !== null ? metric(liveRps) : "—",
                          unit: liveRps !== null ? "rps" : "",
                          warning: false,
                        },
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
                          label: t("Error rate", "Tỉ lệ lỗi"),
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
                          className={`rounded-lg border px-2.5 py-1.5 ${
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
                        {locale === "vi" ? "Tài nguyên cấp phát" : "Resource capacity"}
                      </h3>
                      {peakCpuService && cpuSamples > 0 && (
                        <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          {t("Peak:", "Cao nhất:")}{" "}
                          <span className="font-mono font-medium">{peakCpuService}</span>
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

                {/* Row 3: Live RED Charts + Collapsible Service Edges & Action History */}
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
                          {t("Action history", "Lịch sử thao tác")} ({observedData.actions.length})
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
                      <span className="text-[11px] text-muted-foreground">{t("History", "Chi tiết")} ▾</span>
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
                ? `${t("Observed", "Ghi nhận lúc")} ${observedDate.toLocaleTimeString()}${
                    lastSessionFailed
                      ? isTimedOut
                        ? ` · ${t("Timed out", "Hết thời gian")}`
                        : ` · ${t("Failed", "Lỗi")}`
                      : ""
                  }`
                : lastSessionFailed
                  ? isTimedOut
                    ? t("Session timed out · Check Logs & Traces", "Phiên hết thời gian · Xem Log & Trace")
                    : t("Session failed · Check Logs & Traces", "Phiên gặp lỗi · Xem Log & Trace")
                  : observedData.executionStatus.toUpperCase() === "CANCELLED"
                    ? t("Session cancelled", "Phiên đã hủy")
                    : isTelemetryPreview
                      ? mutationError
                        ? t("Preview · Start failed — check Logs & Traces", "Xem trước · Khởi chạy lỗi — xem Log & Trace")
                        : t("Preview · Live metrics populate when Docker runs", "Xem trước · Thông số thật sẽ hiện khi chạy Docker")
                      : t("Waiting for container telemetry", "Đang chờ telemetry từ container");

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
                          t("Service", "Service"),
                          t("Status", "Trạng thái"),
                          t("Replicas", "Replica"),
                          "CPU",
                          "RAM",
                          t("Net I/O", "Net I/O"),
                          "p95",
                          t("Req / Err%", "Req / Lỗi%"),
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
              studioStyle={studioStyle}
            />
          </div>

          {tab === "snapshots" && (
            <section aria-label="Snapshots and runtime recording" className="space-y-3">
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
                  {t("Capture evidence snapshot", "Chụp Snapshot minh chứng")}
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
                    {capturingScreen ? t("Capturing…", "Đang chụp…") : t("Screenshot PNG", "Chụp ảnh PNG")}
                  </Button>

                  {recordingSteps === 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPreviewMode || data.executionStatus !== "RUNNING" || savingReplay}
                      title={
                        isPreviewMode || data.executionStatus !== "RUNNING"
                          ? t(
                              "Start Live Docker first to record live runtime service-to-service traffic",
                              "Hãy chạy Docker thật trước để quay lại luồng gọi giữa các service",
                            )
                          : t(
                              "Record live canvas video + traffic flow timeline",
                              "Quay video sơ đồ trực tiếp + dòng thời gian lưu lượng",
                            )
                      }
                      onClick={startLiveReplayRecording}
                      className={`h-8 px-2.5 text-xs font-medium disabled:opacity-40 ${
                        isLight
                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      <Video aria-hidden="true" className="mr-1.5 size-3.5" />
                      {t("Record runtime replay", "Quay replay trực tiếp")}
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
        {showRight && (() => {
          const rightTopPx = Math.max(16, 16 + rightOffset.y);
          // Reserve space above the open bottom drawer so drawer controls (Expand/Close/Filters) are never occluded.
          const rightBottomReserve = !bottomCollapsed
            ? bottomHeight + 24
            : rightHeight != null || rightOffset.y !== 0
              ? 16
              : 100;
          return (
          <aside
            ref={rightCardRef}
            data-tour="studio-service-inspector"
            onPointerDown={() => setFrontPanel("right")}
            style={{
              top: 16 + rightOffset.y,
              right: 16 - rightOffset.x,
              width: rightWidth,
              maxHeight: `calc(100% - ${rightTopPx + rightBottomReserve}px)`,
              ...(rightHeight != null ? { height: rightHeight } : {}),
              scrollbarWidth: "thin",
              scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #0a0f18",
            }}
            className={`pointer-events-auto absolute flex max-w-[calc(100%-1rem)] flex-col overflow-hidden ${
              frontPanel === "right" ? "z-30" : "z-20"
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
              className={`flex shrink-0 cursor-grab items-center justify-between gap-2 border-b px-3.5 py-2.5 select-none active:cursor-grabbing ${styleCfg.panelHeaderClass}`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <GripVertical className="size-3.5 shrink-0 opacity-45" aria-hidden="true" />
                <p className="truncate text-sm font-bold">
                  {rightCardMode === "diagnostics"
                    ? t("Impact & Diagnostics", "Chẩn đoán Change Impact")
                    : authoring && setupPanel === "mission"
                      ? t("Mission & Advanced", "Đề bài & Nâng cao")
                      : authoring
                        ? t("Visual Studio Builder", "Soạn bài trên Studio 3D")
                        : selected || t("Service Controls", "Điều khiển Service")}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("Close panel", "Đóng thẻ")}
                onClick={() => setShowRight(false)}
                className={`p-1 transition ${styleCfg.railIdleClass}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-5">
              {rightCardMode === "diagnostics" ? (
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
                  const [ramUsed, ramLimit] = selStats.memory.split("/").map((part) => part.trim());
                  const ramUsedMiB = parseMemoryMiB(ramUsed);
                  const ramLimitMiB = parseMemoryMiB(ramLimit);
                  const ramPct =
                    ramUsedMiB !== undefined && ramLimitMiB !== undefined && ramLimitMiB > 0
                      ? Math.min(100, Math.round((ramUsedMiB / ramLimitMiB) * 100))
                      : null;
                  const selBlock = blocks.find((b) => b.service === selSvc);
                  const selCanScale = Boolean(selBlock?.canScale ?? (selSvc && !data.topology));
                  const selPhase = selSvc ? servicePhase(data, selSvc) : "stopped";
                  const selPaused = selPhase === "paused";
                  const selStopped = selRunning === 0 && !selPaused;
                  const canLiveAct = !isPreviewMode && data.executionStatus === "RUNNING" && Boolean(selSvc);
                  return (
                    <section aria-label={t("Live Service Controls", "Điều khiển Service")} className="space-y-3.5 text-[13px] text-slate-900">
                      {/* Service Picker & Status */}
                      <div className={`p-3 ${styleCfg.subSurfaceClass}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm font-bold text-slate-900">
                            {selSvc || t("No service selected", "Chưa chọn service")}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${
                              selPaused
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : selStopped
                                  ? "border-rose-300 bg-rose-50 text-rose-700"
                                  : selRunning && selRunning > 0
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            {selPaused
                              ? "PAUSED"
                              : selStopped
                                ? "CRASHED · 0x"
                                : selRunning != null
                                  ? `RUNNING · ${selRunning}x`
                                  : "STANDBY"}
                          </span>
                        </div>
                        <dl className="mavis-tabular mt-2.5 grid grid-cols-2 gap-1.5">
                          <div className={`flex items-center justify-between gap-1.5 border px-2.5 py-1.5 ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}>
                            <dt className={`shrink-0 text-[11px] ${styleCfg.subtleTextClass}`}>Replicas</dt>
                            <dd className="whitespace-nowrap font-mono text-xs font-bold">
                              {selRunning ?? "—"}
                            </dd>
                          </div>
                          <div className={`flex items-center justify-between gap-1.5 border px-2.5 py-1.5 ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}>
                            <dt className={`shrink-0 text-[11px] ${styleCfg.subtleTextClass}`}>CPU</dt>
                            <dd className="whitespace-nowrap font-mono text-xs font-bold">
                              {selStats.cpu}
                            </dd>
                          </div>
                          <div
                            data-testid="studio-inspector-ram-card"
                            className={`col-span-2 border px-2.5 py-1.5 ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <dt className="shrink-0 text-[11px] text-slate-500">RAM</dt>
                              <dd className="whitespace-nowrap font-mono text-[11.5px] font-bold text-slate-900">
                                {ramLimit ? (
                                  <>
                                    {ramUsed}
                                    <span className="font-medium text-slate-400"> / {ramLimit}</span>
                                    {ramPct !== null && (
                                      <span className="ml-1.5 text-[10.5px] font-semibold text-slate-500">
                                        ({ramPct}%)
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  selStats.memory
                                )}
                              </dd>
                            </div>
                            {ramPct !== null && (
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    ramPct >= 85
                                      ? "bg-rose-500"
                                      : ramPct >= 70
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${ramPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </dl>
                      </div>

                      {/* Real Docker Lifecycle & Fault Injection Actions */}
                      <div className="space-y-2.5">
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
                            disabled={!canLiveAct || busy || selPhase !== "running"}
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
                            disabled={!canLiveAct || busy || selPhase !== "stopped"}
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
                            disabled={!canLiveAct || busy || selPhase !== "running"}
                            onClick={() => void studio.send("PAUSE", selSvc)}
                            className="h-9 whitespace-nowrap border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            Pause
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canLiveAct || busy || selPhase !== "paused"}
                            onClick={() => void studio.send("RESUME", selSvc)}
                            className="h-9 whitespace-nowrap border-sky-300 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            Resume
                          </Button>
                        </div>

                        {/* Scale */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canLiveAct || busy || !selCanScale || selPhase !== "running" || (selRunning ?? 1) >= 3}
                          onClick={() => void dispatchCommand("SCALE", selSvc, Math.min(3, (selRunning ?? 1) + 1))}
                          className={`h-8 w-full whitespace-nowrap border text-xs font-semibold disabled:opacity-45 ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                        >
                          <Plus className="mr-1 size-3.5" aria-hidden="true" />
                          Scale +1
                        </Button>

                        {/* CPU Throttle (cgroup) */}
                        <div className="space-y-1">
                          <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${styleCfg.subtleTextClass}`}>
                            {t("CPU Throttle (cgroup)", "Giới hạn CPU (cgroup)")}
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[25, 50, 100].map((pct) => (
                              <Button
                                key={pct}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canLiveAct || busy || selPhase !== "running"}
                                onClick={() => void studio.send("THROTTLE_CPU", selSvc, undefined, pct)}
                                className={`h-8 whitespace-nowrap border font-mono text-xs font-semibold disabled:opacity-45 ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                              >
                                CPU {pct}%
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Live Probe Load (RPS) */}
                        <div className="space-y-1 border-t border-border/60 pt-2">
                          <div className={`flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wide ${styleCfg.subtleTextClass}`}>
                            <span>{t("Live Probe Load (RPS)", "Tải Probe trực tiếp (RPS)")}</span>
                            <span className="font-mono font-bold text-foreground">
                              {data.telemetry?.probe?.targetRps ?? 5} RPS
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[5, 15, 30, 50].map((rps) => (
                              <Button
                                key={rps}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canLiveAct || busy}
                                onClick={() =>
                                  void studio.send("SET_LOAD", selSvc, undefined, undefined, rps)
                                }
                                className={`h-8 whitespace-nowrap border font-mono text-xs font-semibold disabled:opacity-45 ${styleCfg.controlRadiusClass} ${
                                  data.telemetry?.probe?.targetRps === rps
                                    ? styleCfg.controlActiveClass
                                    : styleCfg.controlIdleClass
                                }`}
                              >
                                {rps}
                              </Button>
                            ))}
                          </div>
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
                              const phase = servicePhase(data, svc);
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
                                      phase === "paused"
                                        ? "bg-amber-500"
                                        : rep === 0
                                          ? "bg-rose-500"
                                          : rep && rep > 0
                                            ? "bg-emerald-500"
                                            : "bg-slate-400"
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
              <div className={isLight ? "space-y-3 text-slate-900" : "dark space-y-3 text-slate-100"}>
            {authoring && (
              <div
                role="tablist"
                aria-label="Lecturer setup panel tabs"
                className={`mb-3 grid grid-cols-2 gap-1 p-1 ${styleCfg.tabTrackClass}`}
              >
                {(
                  [
                    ["presets", t("Visual Builder", "Thiết kế 3D")],
                    [
                      "mission",
                      missionDirty
                        ? t("Mission & Advanced *", "Đề bài & Nâng cao *")
                        : t("Mission & Advanced", "Đề bài & Nâng cao"),
                    ],
                  ] as const
                ).map(([id, tabLabel]) => {
                  const isTabActive =
                    id === "presets" ? setupPanel !== "mission" : setupPanel === "mission";
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={isTabActive}
                      onClick={() => setSetupPanel(id)}
                      style={{ fontSize: 12.5, lineHeight: "1.25" }}
                      className={`px-2 py-1.5 font-semibold transition-colors ${
                        isTabActive ? styleCfg.tabActiveClass : styleCfg.tabIdleClass
                      }`}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
              </div>
            )}

            {setupPanel === "mission" && authoring ? (
              (() => {
                const endpointList = authoring.endpointOptions?.length
                  ? authoring.endpointOptions
                  : [{ path: baselineDraft || "/health", label: `GET ${baselineDraft || "/health"}` }];
                const hasSelectedEndpoint = endpointList.some((ep) => ep.path === baselineDraft);
                const activeGoalTargetSvc =
                  authoring.targetChangeAction?.service ||
                  (activeGoalId === "scale" ? replicaSvcDraft || authoring.replicaService : "") ||
                  (activeGoalId === "recovery" ? authoring.initialStoppedServices[0] ?? "" : "") ||
                  null;
                const smartPick = smartPickBaselineEndpoint({
                  endpointOptions: endpointList,
                  currentPath: baselineDraft,
                  targetService: activeGoalTargetSvc,
                  edges: staticEdgesForBlast,
                });
                const hasVerifiedRoutes = endpointList.some((ep) => ep.verified);
                const themeRadius = styleCfg.controlRadiusClass;
                const selectPopoverClass =
                  studioStyle === "pop"
                    ? "border-2 border-slate-900 bg-white text-slate-950 shadow-[3px_3px_0_#0F172A]"
                    : studioStyle === "blueprint"
                      ? "border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-md"
                      : isLight
                        ? "border border-sky-200/90 bg-white text-slate-900 shadow-lg"
                        : "border border-slate-700 bg-[#0C1324] text-slate-100 shadow-xl";
                const selectItemFocusClass =
                  studioStyle === "pop"
                    ? "focus:bg-[#DBEAFE] focus:text-slate-950"
                    : studioStyle === "blueprint"
                      ? "focus:bg-[#E6F0FF] focus:text-blue-950"
                      : isLight
                        ? "focus:bg-sky-50 focus:text-sky-950"
                        : "focus:bg-sky-500/20 focus:text-sky-100";
                const advancedGoalBadge =
                  activeGoalId === "change-impact"
                    ? t("Change Impact", "Phân tích ảnh hưởng")
                    : activeGoalId === "scale"
                      ? t("Scale-Out", "Chịu tải & Scale")
                      : activeGoalId === "recovery"
                        ? t("Outage Recovery", "Khôi phục sự cố")
                        : activeGoalId === "cpu"
                          ? t("CPU Degradation", "Tắc nghẽn CPU")
                          : t("General", "Tổng quát");
                const regenerateInstructions = () => {
                  const parsedF1 = minImpactF1Draft.trim() ? Number(minImpactF1Draft) : 0.7;
                  const parsedErr = maxErrDraft.trim() ? Number(maxErrDraft) : null;
                  const parsedP95 = maxP95Draft.trim() ? Number(maxP95Draft) : null;
                  const nextText = buildStudentExerciseInstructions({
                    exerciseType:
                      activeGoalId === "change-impact"
                        ? "CHANGE_IMPACT"
                        : activeGoalId === "scale"
                          ? "SCALE_UNDER_LOAD"
                          : activeGoalId === "recovery"
                            ? "CIRCUIT_BREAKER"
                            : activeGoalId === "cpu"
                              ? "CONFIG_REGRESSION"
                              : authoring.exerciseType,
                    targetAction: authoring.targetChangeAction,
                    stoppedServices: authoring.initialStoppedServices,
                    minReplicas:
                      replicaSvcDraft && Number(replicaCountDraft) >= 2
                        ? [{ service: replicaSvcDraft, count: Number(replicaCountDraft) }]
                        : [],
                    predictionRequired: predictionRequiredDraft,
                    minImpactF1: Number.isFinite(parsedF1) ? parsedF1 : 0.7,
                    maxErrorRatePercent: parsedErr != null && Number.isFinite(parsedErr) ? parsedErr : null,
                    maxP95Ms: parsedP95 != null && Number.isFinite(parsedP95) ? parsedP95 : null,
                    locale,
                  });
                  setMissionDraft(nextText);
                };
                const ALL_ACTIONS = [
                  "START",
                  "STOP",
                  "SCALE",
                  "PAUSE",
                  "RESUME",
                  "THROTTLE_CPU",
                  "SET_LOAD",
                  "CONNECT",
                  "DISCONNECT",
                ] as const;
                const toggleAllowedAction = (act: string) => {
                  setAllowedActionsDraft((prev) =>
                    prev.includes(act)
                      ? prev.length > 1
                        ? prev.filter((item) => item !== act)
                        : prev
                      : [...prev, act],
                  );
                };
                const presetBtn = (active: boolean) =>
                  `h-7 whitespace-nowrap border px-1.5 font-mono text-[11px] font-semibold transition ${themeRadius} ${
                    active ? styleCfg.controlActiveClass : styleCfg.controlIdleClass
                  }`;
                const goalPillClass =
                  studioStyle === "pop"
                    ? "border-slate-900 bg-[#DBEAFE] text-slate-950"
                    : studioStyle === "blueprint"
                      ? "border-blue-300 bg-blue-50 text-blue-900"
                      : isLight
                        ? "border-sky-200 bg-sky-50 text-sky-900"
                        : "border-sky-500/40 bg-sky-500/15 text-sky-200";
                const gradingSummary = (() => {
                  if (activeGoalId === "change-impact") {
                    const pct = Math.round((Number(minImpactF1Draft) || 0.7) * 100);
                    return predictionRequiredDraft
                      ? t(`Auto-graded prediction F1 >= ${pct}%`, `Chấm tự động dự đoán F1 >= ${pct}%`)
                      : t("Evidence-based impact report", "Đánh giá qua bằng chứng Snapshot");
                  }
                  if (activeGoalId === "scale") {
                    const rep = Number(replicaCountDraft) || 2;
                    const parts = [
                      replicaSvcDraft ? `${replicaSvcDraft} >= ${rep}x` : `>= ${rep}x`,
                      maxErrDraft.trim() ? `${t("Error", "Lỗi")} <= ${maxErrDraft}%` : null,
                      maxP95Draft.trim() ? `p95 <= ${maxP95Draft}ms` : null,
                    ].filter(Boolean);
                    return parts.join(" · ");
                  }
                  if (activeGoalId === "recovery") {
                    const err = maxErrDraft.trim() || "0";
                    return [
                      t(`Recover to <= ${err}% errors`, `Khôi phục về <= ${err}% lỗi`),
                      maxP95Draft.trim() ? `p95 <= ${maxP95Draft}ms` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  }
                  if (activeGoalId === "cpu") {
                    const parts = [
                      maxP95Draft.trim() ? `p95 <= ${maxP95Draft}ms` : t("Observe p95 latency jump", "Quan sát độ trễ p95 tăng"),
                      maxErrDraft.trim() ? `${t("Error", "Lỗi")} <= ${maxErrDraft}%` : null,
                    ].filter(Boolean);
                    return parts.join(" · ");
                  }
                  return null;
                })();

                return (
                  <section aria-label="Mission setup" className="space-y-3 text-xs">
                    {/* Baseline Endpoint (Themed Radix Select + Smart Auto-Pick Indicator) */}
                    <div className="space-y-1.5">
                      <span
                        className={`block text-[11.5px] font-medium ${isLight ? "text-slate-700" : "text-slate-300"}`}
                      >
                        {t("Baseline Endpoint (auto-detected)", "Endpoint kiểm thử (tự quét từ repo)")}
                      </span>
                      <Select
                        value={hasSelectedEndpoint ? baselineDraft : "__custom__"}
                        onValueChange={(nextVal) => {
                          if (nextVal !== "__custom__") {
                            setBaselineDraft(nextVal);
                          }
                        }}
                      >
                        <SelectTrigger
                          aria-label={t("Baseline Endpoint", "Endpoint kiểm thử")}
                          data-testid="studio-baseline-endpoint-select"
                          style={{ fontSize: 12.5, lineHeight: "1.25" }}
                          className={`h-9 w-full px-2.5 py-0 font-mono font-medium shadow-none focus:ring-1 focus:ring-offset-0 ${styleCfg.inputClass}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          className={`max-h-64 p-1 ${themeRadius} ${selectPopoverClass}`}
                        >
                          {endpointList.map((ep) => (
                            <SelectItem
                              key={ep.path}
                              value={ep.path}
                              style={{ fontSize: 12.5 }}
                              className={`min-h-8 py-1.5 font-mono ${themeRadius} ${selectItemFocusClass}`}
                            >
                              {ep.label}
                            </SelectItem>
                          ))}
                          {!hasSelectedEndpoint && baselineDraft && (
                            <SelectItem
                              value="__custom__"
                              style={{ fontSize: 12.5 }}
                              className={`min-h-8 py-1.5 font-mono ${themeRadius} ${selectItemFocusClass}`}
                            >
                              GET {baselineDraft}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      {hasVerifiedRoutes && (
                        <div data-testid="smart-endpoint-hint">
                          {smartPick.isCurrentStale && smartPick.recommendedPath !== baselineDraft ? (
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                isLight
                                  ? "border-amber-300 bg-amber-50/90 text-amber-900"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              }`}
                            >
                              <span className="min-w-0 leading-snug">
                                {t(
                                  `Not in scanned routes — recommended:`,
                                  `Chưa có trong route quét từ repo — gợi ý:`,
                                )}{" "}
                                <code className="font-mono font-semibold">
                                  GET {smartPick.recommendedPath}
                                </code>
                              </span>
                              <button
                                type="button"
                                data-testid="apply-smart-endpoint-btn"
                                onClick={() => setBaselineDraft(smartPick.recommendedPath)}
                                className={`shrink-0 border px-2 py-0.5 text-[11px] font-semibold transition ${themeRadius} ${styleCfg.controlActiveClass}`}
                              >
                                {t("Use smart pick", "Áp dụng ngay")}
                              </button>
                            </div>
                          ) : smartPick.recommendedPath === baselineDraft ? (
                            <p
                              className={`text-[11px] leading-snug ${styleCfg.subtleTextClass}`}
                            >
                              {locale === "vi" ? smartPick.reasonVi : smartPick.reasonEn}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Structured Student Instructions + 1-Click Regenerate */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11.5px] font-medium ${isLight ? "text-slate-700" : "text-slate-300"}`}
                        >
                          {t("Student Mission", "Đề bài cho sinh viên")}
                        </span>
                        <button
                          type="button"
                          data-testid="regenerate-instructions-btn"
                          onClick={regenerateInstructions}
                          className={`text-[11px] font-medium underline underline-offset-2 transition hover:opacity-100 ${styleCfg.subtleTextClass}`}
                        >
                          {t("Regenerate from setup", "Viết lại mẫu chuẩn")}
                        </button>
                      </div>
                      <Textarea
                        value={missionDraft}
                        onChange={(e) => setMissionDraft(e.target.value)}
                        style={{ fontSize: 12.5, lineHeight: "1.45" }}
                        placeholder={t(
                          "Pick a goal or click a 3D block to auto-draft step-by-step instructions.",
                          "Chọn dạng bài hoặc bấm vào khối 3D để tự sinh hướng dẫn từng bước cho sinh viên.",
                        )}
                        className={`min-h-28 ${styleCfg.inputClass}`}
                      />
                    </div>

                    {/* Live Student Preview */}
                    <div className={`space-y-1 p-2.5 text-[11px] ${styleCfg.subSurfaceClass}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("Student Will Receive", "Tóm tắt đề bài")}
                      </p>
                      <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                        {t("Initial State:", "Trạng thái ban đầu:")}{" "}
                        <code
                          className={`font-mono font-semibold ${
                            authoring.initialStoppedServices.length > 0
                              ? isLight
                                ? "text-rose-700"
                                : "text-rose-300"
                              : isLight
                                ? "text-emerald-700"
                                : "text-emerald-300"
                          }`}
                        >
                          {authoring.initialStoppedServices.length > 0
                            ? `${t("Starts down (0x)", "Tắt sẵn (0x)")}: ${authoring.initialStoppedServices.join(", ")}`
                            : t("All services running", "Tất cả chạy bình thường")}
                        </code>
                      </p>
                      {authoring.targetChangeAction?.service && (
                        <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                          {t("Target Action:", "Thao tác mục tiêu:")}{" "}
                          <code
                            className={`font-mono font-semibold ${isLight ? "text-amber-700" : "text-amber-300"}`}
                          >
                            {authoring.targetChangeAction.action} {authoring.targetChangeAction.service}
                            {authoring.targetChangeAction.replicas
                              ? ` (${authoring.targetChangeAction.replicas}x)`
                              : authoring.targetChangeAction.cpuPercent
                                ? ` (${authoring.targetChangeAction.cpuPercent}% CPU)`
                                : ""}
                          </code>
                        </p>
                      )}
                      {gradingSummary && (
                        <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                          {t("Grading Rule:", "Tiêu chí chấm:")}{" "}
                          <span className="font-semibold text-foreground">{gradingSummary}</span>
                        </p>
                      )}
                      {authoring.requiredTraceEdge && (
                        <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                          {t("Required Path:", "Đường gọi kiểm chứng:")}{" "}
                          <code
                            className={`font-mono font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}
                          >
                            {authoring.requiredTraceEdge.from} -&gt; {authoring.requiredTraceEdge.to}
                          </code>
                        </p>
                      )}
                      <p className={isLight ? "text-slate-700" : "text-slate-300"}>
                        Probe:{" "}
                        <code
                          className={`font-mono font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}
                        >
                          GET {baselineDraft || "/health"}
                        </code>
                      </p>
                    </div>

                    {/* Goal-Specific Collapsible Advanced Settings */}
                    <details
                      data-testid="goal-specific-advanced"
                      data-advanced-goal={activeGoalId ?? "none"}
                      className={`p-2.5 ${styleCfg.subSurfaceClass}`}
                    >
                      <summary
                        className={`flex cursor-pointer select-none items-center justify-between gap-2 text-[11.5px] font-semibold ${
                          isLight ? "text-slate-800 hover:text-slate-950" : "text-slate-200 hover:text-white"
                        }`}
                      >
                        <span>{t("Advanced settings", "Tùy chỉnh nâng cao")}</span>
                        <span
                          className={`border px-2 py-0.5 text-[10.5px] font-semibold ${themeRadius} ${goalPillClass}`}
                        >
                          {advancedGoalBadge}
                        </span>
                      </summary>

                      <div className="mt-3 space-y-3">
                        {/* 1. Change Impact Specialized Advanced Controls */}
                        {activeGoalId === "change-impact" && (
                          <div data-testid="advanced-change-impact" className="space-y-2.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[11px] font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>
                                  {t("Minimum Prediction Accuracy (F1)", "Ngưỡng chấm dự đoán (Min F1)")}
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-foreground">
                                  {Math.round((Number(minImpactF1Draft) || 0.7) * 100)}%
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-1.5">
                                {(
                                  [
                                    ["0.6", "60%", t("Basic (60%)", "Cơ bản (60%)")],
                                    ["0.7", "70%", t("Standard (70%)", "Chuẩn (70%)")],
                                    ["0.85", "85%", t("Strict (85%)", "Chặt (85%)")],
                                  ] as const
                                ).map(([val, lbl, tip]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    title={tip}
                                    onClick={() => setMinImpactF1Draft(val)}
                                    className={presetBtn(Number(minImpactF1Draft) === Number(val))}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                                <Input
                                  type="number"
                                  aria-label="Min F1 (0-1)"
                                  style={{ fontSize: 12 }}
                                  step="0.05"
                                  min={0}
                                  max={1}
                                  value={minImpactF1Draft}
                                  onChange={(e) => setMinImpactF1Draft(e.target.value)}
                                  placeholder="0.7"
                                  className={`h-7 px-2 font-mono ${styleCfg.inputClass}`}
                                />
                              </div>
                              <p className={`text-[10.5px] leading-snug ${styleCfg.subtleTextClass}`}>
                                {t(
                                  "Auto-grades student predictions against real impacted services from OpenTelemetry traces.",
                                  "Tự chấm F1 giữa danh sách sinh viên dự đoán và các nhánh lỗi thực tế từ trace.",
                                )}
                              </p>
                            </div>

                            <label className="flex cursor-pointer items-center justify-between gap-2 pt-0.5 text-[11px]">
                              <span className={isLight ? "text-slate-700" : "text-slate-300"}>
                                {t(
                                  "Require student impact prediction before action",
                                  "Yêu cầu sinh viên khóa dự đoán trước khi gây lỗi",
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={predictionRequiredDraft}
                                onChange={(e) => setPredictionRequiredDraft(e.target.checked)}
                                className={`size-4 rounded ${styleCfg.checkboxAccentClass}`}
                              />
                            </label>
                          </div>
                        )}

                        {/* 2. Scale-Out Specialized Advanced Controls */}
                        {activeGoalId === "scale" && (
                          <div data-testid="advanced-scale" className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                  {t("Scale target", "Service cần Scale")}
                                </span>
                                <Select
                                  value={replicaSvcDraft || "__none__"}
                                  onValueChange={(nextVal) =>
                                    setReplicaSvcDraft(nextVal === "__none__" ? "" : nextVal)
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={t("Scale target", "Service cần Scale")}
                                    style={{ fontSize: 12 }}
                                    className={`h-8 w-full px-2 py-0 font-mono shadow-none ${styleCfg.inputClass}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent
                                    align="start"
                                    className={`max-h-56 p-1 ${themeRadius} ${selectPopoverClass}`}
                                  >
                                    <SelectItem
                                      value="__none__"
                                      style={{ fontSize: 12 }}
                                      className={`min-h-7 py-1 ${themeRadius} ${selectItemFocusClass}`}
                                    >
                                      {t("None", "Không")}
                                    </SelectItem>
                                    {blocks.map((b) => (
                                      <SelectItem
                                        key={b.service}
                                        value={b.service}
                                        style={{ fontSize: 12 }}
                                        className={`min-h-7 py-1 font-mono ${themeRadius} ${selectItemFocusClass}`}
                                      >
                                        {b.service}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                  {t("Min replicas", "Số replica tối thiểu")}
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(["1", "2", "3"] as const).map((cnt) => (
                                    <button
                                      key={cnt}
                                      type="button"
                                      onClick={() => setReplicaCountDraft(cnt)}
                                      className={`h-8 border font-mono text-xs font-semibold transition ${themeRadius} ${
                                        (replicaCountDraft || "2") === cnt
                                          ? styleCfg.controlActiveClass
                                          : styleCfg.controlIdleClass
                                      }`}
                                    >
                                      {cnt}x
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                  {t("Max Error % under load", "Lỗi tối đa khi chịu tải (%)")}
                                </span>
                                <div className="flex items-center gap-1">
                                  {(["0", "5"] as const).map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => setMaxErrDraft(val)}
                                      className={presetBtn(maxErrDraft === val)}
                                    >
                                      {val}%
                                    </button>
                                  ))}
                                  <Input
                                    type="number"
                                    aria-label="Max Error %"
                                    style={{ fontSize: 12 }}
                                    min={0}
                                    max={100}
                                    value={maxErrDraft}
                                    onChange={(e) => setMaxErrDraft(e.target.value)}
                                    placeholder="5"
                                    className={`h-7 flex-1 px-2 font-mono ${styleCfg.inputClass}`}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                  {t("Max p95 latency (ms)", "Độ trễ p95 tối đa (ms)")}
                                </span>
                                <div className="flex items-center gap-1">
                                  {(["", "500"] as const).map((val) => (
                                    <button
                                      key={val || "none"}
                                      type="button"
                                      onClick={() => setMaxP95Draft(val)}
                                      className={presetBtn(maxP95Draft === val)}
                                    >
                                      {val ? `${val}` : "—"}
                                    </button>
                                  ))}
                                  <Input
                                    type="number"
                                    aria-label="Max p95 (ms)"
                                    style={{ fontSize: 12 }}
                                    min={1}
                                    value={maxP95Draft}
                                    onChange={(e) => setMaxP95Draft(e.target.value)}
                                    placeholder="—"
                                    className={`h-7 flex-1 px-2 font-mono ${styleCfg.inputClass}`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. Outage Recovery Specialized Advanced Controls */}
                        {activeGoalId === "recovery" && (
                          <div data-testid="advanced-recovery" className="space-y-2.5">
                            <div className="space-y-1.5">
                              <span className={`block text-[11px] font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>
                                {t("Recovery Error Threshold (Max Error %)", "Ngưỡng lỗi xác nhận hồi phục (%)")}
                              </span>
                              <div className="grid grid-cols-3 gap-1.5">
                                <button
                                  type="button"
                                  title={t("Strict 0% errors", "Tuyệt đối 0% lỗi")}
                                  onClick={() => setMaxErrDraft("0")}
                                  className={presetBtn(maxErrDraft === "0")}
                                >
                                  0%
                                </button>
                                <button
                                  type="button"
                                  title={t("Allow <= 5% errors", "Chấp nhận tối đa 5% lỗi")}
                                  onClick={() => setMaxErrDraft("5")}
                                  className={presetBtn(maxErrDraft === "5")}
                                >
                                  &lt;= 5%
                                </button>
                                <Input
                                  type="number"
                                  aria-label="Max Error %"
                                  style={{ fontSize: 12 }}
                                  min={0}
                                  max={100}
                                  value={maxErrDraft}
                                  onChange={(e) => setMaxErrDraft(e.target.value)}
                                  placeholder="0"
                                  className={`h-7 px-2 font-mono ${styleCfg.inputClass}`}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                {t("Optional Max p95 after recovery (ms)", "Ngưỡng độ trễ p95 sau khôi phục (tùy chọn)")}
                              </span>
                              <Input
                                type="number"
                                aria-label="Max p95 (ms)"
                                style={{ fontSize: 12 }}
                                min={1}
                                value={maxP95Draft}
                                onChange={(e) => setMaxP95Draft(e.target.value)}
                                placeholder={t("Leave empty to skip latency gate", "Để trống nếu không ràng buộc độ trễ")}
                                className={`h-7 px-2 font-mono ${styleCfg.inputClass}`}
                              />
                            </div>
                          </div>
                        )}

                        {/* 4. CPU Degradation Specialized Advanced Controls */}
                        {activeGoalId === "cpu" && (
                          <div data-testid="advanced-cpu" className="space-y-2.5">
                            <div className="space-y-1.5">
                              <span className={`block text-[11px] font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>
                                {t("Reference p95 Latency Threshold (ms)", "Ngưỡng độ trễ p95 tham chiếu (ms)")}
                              </span>
                              <div className="grid grid-cols-4 gap-1.5">
                                {(
                                  [
                                    ["", "—"],
                                    ["500", "500ms"],
                                    ["1000", "1000ms"],
                                  ] as const
                                ).map(([val, lbl]) => (
                                  <button
                                    key={val || "none"}
                                    type="button"
                                    onClick={() => setMaxP95Draft(val)}
                                    className={presetBtn(maxP95Draft === val)}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                                <Input
                                  type="number"
                                  aria-label="Max p95 (ms)"
                                  style={{ fontSize: 12 }}
                                  min={1}
                                  value={maxP95Draft}
                                  onChange={(e) => setMaxP95Draft(e.target.value)}
                                  placeholder="—"
                                  className={`h-7 px-2 font-mono ${styleCfg.inputClass}`}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <span className={`block text-[11px] font-medium ${styleCfg.subtleTextClass}`}>
                                {t("Optional Max Error %", "Giới hạn lỗi tối đa (tùy chọn)")}
                              </span>
                              <div className="grid grid-cols-3 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setMaxErrDraft("")}
                                  className={presetBtn(maxErrDraft === "")}
                                >
                                  {t("No limit", "Không ép")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMaxErrDraft("5")}
                                  className={presetBtn(maxErrDraft === "5")}
                                >
                                  &lt;= 5%
                                </button>
                                <Input
                                  type="number"
                                  aria-label="Max Error %"
                                  style={{ fontSize: 12 }}
                                  min={0}
                                  max={100}
                                  value={maxErrDraft}
                                  onChange={(e) => setMaxErrDraft(e.target.value)}
                                  placeholder="—"
                                  className={`h-7 px-2 font-mono ${styleCfg.inputClass}`}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {!activeGoalId && (
                          <p className={`text-[11px] leading-snug ${styleCfg.subtleTextClass}`}>
                            {t(
                              "Pick one of the 4 Exercise Goals in Visual Builder to unlock specialized grading settings.",
                              "Chọn 1 trong 4 dạng bài ở tab Thiết kế 3D để mở bộ tùy chỉnh chấm điểm chuyên biệt.",
                            )}
                          </p>
                        )}

                        {/* Shared Technical Controls (Custom GET path, Allowed Actions, Sync Docker) */}
                        <div className={`space-y-2.5 border-t pt-2.5 ${styleCfg.dividerClass}`}>
                          <label className="block space-y-1 text-[11px]">
                            <span className={styleCfg.subtleTextClass}>
                              {t("Custom GET path", "Đường dẫn GET tùy chỉnh")}
                            </span>
                            <Input
                              value={baselineDraft}
                              onChange={(e) => setBaselineDraft(e.target.value)}
                              style={{ fontSize: 12 }}
                              placeholder="/api/v1/storefront/live-flow"
                              className={`h-7 font-mono ${styleCfg.inputClass}`}
                            />
                          </label>

                          <div className="space-y-1">
                            <p className={`text-[11px] ${styleCfg.subtleTextClass}`}>
                              {t("Allowed student actions", "Thao tác cho phép sinh viên")}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {ALL_ACTIONS.map((act) => {
                                const on = allowedActionsDraft.includes(act);
                                return (
                                  <button
                                    key={act}
                                    type="button"
                                    onClick={() => toggleAllowedAction(act)}
                                    className={`border px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${themeRadius} ${
                                      on ? styleCfg.controlActiveClass : styleCfg.controlIdleClass
                                    }`}
                                  >
                                    {act}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {authoring.onSyncDocker && (
                            <div className={`border-t pt-2 ${styleCfg.dividerClass}`}>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={authoring.syncingDocker}
                                onClick={authoring.onSyncDocker}
                                className={`h-7 w-full text-[11px] ${themeRadius} ${styleCfg.controlIdleClass}`}
                              >
                                {authoring.syncingDocker
                                  ? t("Syncing Docker topology…", "Đang đồng bộ Docker…")
                                  : t("Re-sync Docker Compose from repo", "Đồng bộ lại Docker Compose từ repo")}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {authoring.saved && !missionDirty ? (
                        <span
                          className={`text-[11.5px] font-semibold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}
                        >
                          {t("Saved", "Đã lưu")}
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] ${missionDirty ? (isLight ? "font-medium text-amber-700" : "text-amber-300") : "text-muted-foreground"}`}
                        >
                          {missionDirty
                            ? t("Unsaved changes", "Có thay đổi chưa lưu")
                            : t("Applies immediately", "Áp dụng ngay cho Lab")}
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
                            maxErrorRatePercent:
                              activeGoalId === "change-impact" ? "" : maxErrDraft,
                            maxP95Ms: activeGoalId === "change-impact" ? "" : maxP95Draft,
                            minImpactF1:
                              activeGoalId === "change-impact" ? minImpactF1Draft : "",
                            predictionRequired:
                              activeGoalId === "change-impact" ? predictionRequiredDraft : false,
                            allowedActions: allowedActionsDraft,
                            replicaService: activeGoalId === "scale" ? replicaSvcDraft : "",
                            replicaCount: activeGoalId === "scale" ? replicaCountDraft : "",
                          })
                        }
                        className={`h-8 px-3 text-xs font-semibold ${themeRadius} ${
                          missionDirty
                            ? "bg-amber-600 text-white hover:bg-amber-500"
                            : "bg-teal-600 text-white hover:bg-teal-500"
                        }`}
                      >
                        {authoring.saving
                          ? t("Saving…", "Đang lưu…")
                          : missionDirty
                            ? t("Save Exercise *", "Lưu đề bài *")
                            : t("Save Exercise", "Lưu đề bài")}
                      </Button>
                    </div>
                  </section>
                );
              })()
            ) : authoring ? (
              (() => {
                const goalTargetSvc =
                  authoring.targetChangeAction?.service ||
                  (activeGoalId === "scale" ? authoring.replicaService : "") ||
                  (activeGoalId === "recovery" ? authoring.initialStoppedServices[0] ?? "" : "");
                const svc = canvasSelected || goalTargetSvc;
                const startsDown = Boolean(svc && authoring.initialStoppedServices.includes(svc));
                const isImpactTarget =
                  Boolean(svc) &&
                  authoring.targetChangeAction?.service === svc &&
                  (authoring.targetChangeAction.action === "PAUSE" ||
                    authoring.targetChangeAction.action === "STOP");
                const impactActionKind =
                  authoring.targetChangeAction?.action === "STOP" ? "STOP" : "PAUSE";
                const isCpuTarget =
                  Boolean(svc) &&
                  authoring.targetChangeAction?.service === svc &&
                  authoring.targetChangeAction.action === "THROTTLE_CPU";
                const cpuTargetPct = authoring.targetChangeAction?.cpuPercent ?? 25;
                const scaleTargetCount =
                  svc && authoring.replicaService === svc ? Number(authoring.replicaCount) || 0 : 0;
                const chipFor = (id: AuthorBlockChipId) =>
                  AUTHOR_DRAG_CHIPS.find((c) => c.id === id)!;
                const startChipDrag = (
                  event: ReactDragEvent<HTMLButtonElement>,
                  chipId: AuthorBlockChipId,
                ) => {
                  event.dataTransfer.setData("application/x-mavis-studio-tool", chipId);
                  event.dataTransfer.setData("text/plain", chipId);
                  event.dataTransfer.effectAllowed = "copy";
                };
                const activeWireFocus = selectedAuthorWire ?? authoring.requiredTraceEdge ?? null;
                const wireIsRequired = Boolean(
                  activeWireFocus &&
                    authoring.requiredTraceEdge &&
                    authoring.requiredTraceEdge.from === activeWireFocus.from &&
                    authoring.requiredTraceEdge.to === activeWireFocus.to,
                );
                const wireController = activeWireFocus
                  ? data.topology?.connections.find(
                      (c) => c.from === activeWireFocus.from && c.to === activeWireFocus.to,
                    )?.controllerService
                  : undefined;
                const wireCutAtStart = Boolean(
                  wireController && authoring.initialStoppedControllers.includes(wireController),
                );
                const liveSvcPhase = svc ? servicePhase(data, svc) : "running";
                const isLiveDemoMode = !isPreviewMode && data.executionStatus === "RUNNING";
                const goalSectionTitle =
                  activeGoalId === "change-impact"
                    ? t("2. Change Impact Setup", "2. Cấu hình Change Impact")
                    : activeGoalId === "scale"
                      ? t("2. Scale-Out Setup", "2. Cấu hình Chịu tải & Scale")
                      : activeGoalId === "recovery"
                        ? t("2. Outage Recovery Setup", "2. Cấu hình Khôi phục sự cố")
                        : activeGoalId === "cpu"
                          ? t("2. CPU Degradation Setup", "2. Cấu hình Tắc nghẽn CPU")
                          : t("2. Goal Setup", "2. Cấu hình theo dạng bài");

                const themeBox = styleCfg.subSurfaceClass;
                const themeActiveBtn = styleCfg.controlActiveClass;
                const themeActiveMuted = styleCfg.controlActiveMutedClass;
                const themeIdleBtn = styleCfg.controlIdleClass;
                const themeSubtleText = styleCfg.subtleTextClass;
                const themeRadius = styleCfg.controlRadiusClass;

                return (
                  <section
                    aria-label="Visual Studio Builder"
                    style={{ fontSize: 12, lineHeight: "1.35" }}
                    className="space-y-3"
                  >
                    {/* Top Stage Service Selector (belongs to the 3D Stage, separate from Exercise Goal details) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="studio-stage-service-select"
                          style={{ fontSize: 11 }}
                          className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                        >
                          {t("Service on 3D Stage", "Service trên sân khấu 3D")} ({blocks.length})
                        </label>
                        {canvasSelected && (
                          <button
                            type="button"
                            onClick={() => {
                              studio.setService("");
                              setSelectedAuthorWire(null);
                            }}
                            style={{ fontSize: 11 }}
                            className={`font-medium underline underline-offset-2 transition hover:opacity-100 ${themeSubtleText}`}
                          >
                            {t("Clear", "Bỏ chọn")}
                          </button>
                        )}
                      </div>
                      <Select
                        value={canvasSelected || "__none__"}
                        onValueChange={(nextVal) => {
                          studio.setService(nextVal === "__none__" ? "" : nextVal);
                          setSelectedAuthorWire(null);
                        }}
                      >
                        <SelectTrigger
                          id="studio-stage-service-select"
                          aria-label={t("Select service on 3D stage", "Chọn service trên sân khấu 3D")}
                          data-testid="studio-stage-service-select"
                          style={{ fontSize: 13, lineHeight: "1.25" }}
                          className={`h-9 w-full px-2.5 py-0 font-sans font-medium shadow-none focus:ring-1 focus:ring-offset-0 ${styleCfg.inputClass}`}
                        >
                          <SelectValue placeholder={t("Select service…", "Chọn service…")} />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          className={`max-h-64 p-1 ${themeRadius} ${
                            studioStyle === "pop"
                              ? "border-2 border-slate-900 bg-white text-slate-950 shadow-[3px_3px_0_#0F172A]"
                              : studioStyle === "blueprint"
                                ? "border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-md"
                                : isLight
                                  ? "border border-sky-200/90 bg-white text-slate-900 shadow-lg"
                                  : "border border-slate-700 bg-[#0C1324] text-slate-100 shadow-xl"
                          }`}
                        >
                          <SelectItem
                            value="__none__"
                            style={{ fontSize: 13 }}
                            className={`min-h-8 py-1.5 font-sans ${themeRadius} ${
                              isLight
                                ? "text-slate-500 focus:bg-sky-50 focus:text-slate-900"
                                : "text-slate-400 focus:bg-slate-800 focus:text-slate-100"
                            }`}
                          >
                            {t("Select service…", "Chọn service…")}
                          </SelectItem>
                          {blocks.map((block) => {
                            const tags: string[] = [];
                            if (authoring.initialStoppedServices.includes(block.service)) {
                              tags.push(t("Down", "Tắt sẵn"));
                            }
                            if (
                              authoring.targetChangeAction?.service === block.service &&
                              (authoring.targetChangeAction.action === "PAUSE" ||
                                authoring.targetChangeAction.action === "STOP")
                            ) {
                              tags.push(t("Impact", "Impact"));
                            } else if (
                              authoring.targetChangeAction?.service === block.service &&
                              authoring.targetChangeAction.action === "THROTTLE_CPU"
                            ) {
                              tags.push(`CPU ${authoring.targetChangeAction.cpuPercent ?? 25}%`);
                            }
                            if (
                              authoring.replicaService === block.service &&
                              Number(authoring.replicaCount) >= 2
                            ) {
                              tags.push(`Scale ${authoring.replicaCount}x`);
                            }
                            return (
                              <SelectItem
                                key={block.service}
                                value={block.service}
                                style={{ fontSize: 13 }}
                                className={`min-h-8 py-1.5 font-sans ${themeRadius} ${
                                  studioStyle === "pop"
                                    ? "focus:bg-[#DBEAFE] focus:text-slate-950"
                                    : studioStyle === "blueprint"
                                      ? "focus:bg-[#E6F0FF] focus:text-blue-950"
                                      : isLight
                                        ? "focus:bg-sky-50 focus:text-sky-950"
                                        : "focus:bg-sky-500/20 focus:text-sky-100"
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="font-mono font-medium">{block.service}</span>
                                  {tags.length > 0 && (
                                    <span style={{ fontSize: 11.5 }} className={themeSubtleText}>
                                      ({tags.join(", ")})
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 1. 4-Card Exercise Goal Picker (Theme-Synchronized) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          style={{ fontSize: 11 }}
                          className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                        >
                          {t("1. Exercise Goal", "1. Chọn dạng bài")}
                        </p>
                        {authoring.saving && (
                          <span style={{ fontSize: 11 }} className={themeSubtleText}>
                            {t("Saving…", "Đang lưu…")}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {AUTHOR_GOALS.map((goal) => {
                          const isActive = activeGoalId === goal.id;
                          return (
                            <button
                              key={goal.id}
                              type="button"
                              disabled={authoring.busy}
                              onClick={() =>
                                authoring.onSelectGoal?.(goal.id, canvasSelected || undefined)
                              }
                              className={`border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-45 ${themeRadius} ${
                                isActive ? themeActiveBtn : themeIdleBtn
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span style={{ fontSize: 12.5, lineHeight: "1.3" }} className="font-semibold">
                                  {t(goal.titleEn, goal.titleVi)}
                                </span>
                                {isActive && (
                                  <span style={{ fontSize: 10 }} className="font-mono font-bold opacity-85">
                                    ON
                                  </span>
                                )}
                              </div>
                              <p
                                style={{ fontSize: 11.5, lineHeight: "1.35" }}
                                className={`mt-1 ${isActive ? themeActiveMuted : themeSubtleText}`}
                              >
                                {t(goal.descEn, goal.descVi)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Pure Goal-Specific Details (strictly scoped to the Exercise Goal chosen in #1) */}
                    <div
                      data-testid="goal-specific-setup"
                      data-active-goal={activeGoalId ?? "none"}
                      className={`space-y-2.5 p-2.5 ${themeBox}`}
                    >
                      <p
                        style={{ fontSize: 11 }}
                        className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                      >
                        {goalSectionTitle}
                      </p>

                      {activeGoalId === "change-impact" && (() => {
                        const chip = chipFor("author-impact-target");
                        const impactSvc = svc;
                        return (
                          <div className="space-y-2.5">
                            <button
                              type="button"
                              draggable={!authoring.busy}
                              disabled={authoring.busy || !impactSvc}
                              title={t(chip.hintEn, chip.hintVi)}
                              onDragStart={(e) => startChipDrag(e, "author-impact-target")}
                              onClick={() =>
                                impactSvc &&
                                authoring.onApplyBlockChip?.("author-impact-target", impactSvc)
                              }
                              style={{ fontSize: 12.5, lineHeight: "1.25" }}
                              className={`flex h-9 w-full cursor-grab items-center justify-between gap-2 border px-2.5 text-left font-medium transition active:cursor-grabbing disabled:opacity-45 ${themeRadius} ${
                                isImpactTarget ? themeActiveBtn : themeIdleBtn
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                {impactSvc ? (
                                  <>
                                    {t("Target:", "Mục tiêu:")}{" "}
                                    <span className="font-mono font-semibold">{impactSvc}</span>
                                  </>
                                ) : (
                                  t("Select or drag onto a 3D block", "Chọn hoặc kéo thả lên khối 3D")
                                )}
                              </span>
                              <span style={{ fontSize: 11 }} className="shrink-0 font-mono font-semibold opacity-85">
                                {isImpactTarget ? "ON" : t("Set", "Đặt")}
                              </span>
                            </button>

                            {isImpactTarget && impactSvc && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span style={{ fontSize: 12 }} className={themeSubtleText}>
                                    {t("Fault action", "Hành động gây lỗi")}
                                  </span>
                                  <div className={`inline-flex p-0.5 ${styleCfg.tabTrackClass}`}>
                                    {(["PAUSE", "STOP"] as const).map((act) => {
                                      const on = impactActionKind === act;
                                      return (
                                        <button
                                          key={act}
                                          type="button"
                                          onClick={() =>
                                            authoring.onUpdateGoalRule?.({
                                              targetChangeAction: { action: act, service: impactSvc },
                                            })
                                          }
                                          style={{ fontSize: 11 }}
                                          className={`px-2.5 py-0.5 font-mono font-semibold transition ${
                                            on ? styleCfg.tabActiveClass : styleCfg.tabIdleClass
                                          }`}
                                        >
                                          {act}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <label className="flex cursor-pointer items-center justify-between gap-2">
                                  <span style={{ fontSize: 12 }} className={themeSubtleText}>
                                    {t(
                                      "Require student prediction first",
                                      "Yêu cầu SV dự đoán trước khi chạy",
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={authoring.predictionRequired === true}
                                    onChange={(e) =>
                                      authoring.onUpdateGoalRule?.({
                                        predictionRequired: e.target.checked,
                                      })
                                    }
                                    className={`size-4 rounded border-slate-400 ${styleCfg.checkboxAccentClass}`}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {activeGoalId === "scale" && (() => {
                        const chip = chipFor("author-scale-2x");
                        const scaleSvc = svc;
                        const isScaleTarget = scaleTargetCount >= 2;
                        return (
                          <div className="space-y-2.5">
                            <button
                              type="button"
                              draggable={!authoring.busy}
                              disabled={authoring.busy || !scaleSvc}
                              title={t(chip.hintEn, chip.hintVi)}
                              onDragStart={(e) => startChipDrag(e, "author-scale-2x")}
                              onClick={() =>
                                scaleSvc &&
                                authoring.onApplyBlockChip?.("author-scale-2x", scaleSvc)
                              }
                              style={{ fontSize: 12.5, lineHeight: "1.25" }}
                              className={`flex h-9 w-full cursor-grab items-center justify-between gap-2 border px-2.5 text-left font-medium transition active:cursor-grabbing disabled:opacity-45 ${themeRadius} ${
                                isScaleTarget ? themeActiveBtn : themeIdleBtn
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                {scaleSvc ? (
                                  <>
                                    {t("Target:", "Mục tiêu:")}{" "}
                                    <span className="font-mono font-semibold">{scaleSvc}</span>
                                  </>
                                ) : (
                                  t("Select or drag onto a 3D block", "Chọn hoặc kéo thả lên khối 3D")
                                )}
                              </span>
                              <span style={{ fontSize: 11 }} className="shrink-0 font-mono font-semibold opacity-85">
                                {isScaleTarget ? `${scaleTargetCount}x` : t("Set", "Đặt")}
                              </span>
                            </button>

                            {scaleSvc && (
                              <div className="flex items-center justify-between gap-2">
                                <span style={{ fontSize: 12 }} className={themeSubtleText}>
                                  {t("Minimum replicas", "Số replica tối thiểu")}
                                </span>
                                <div className={`inline-flex p-0.5 ${styleCfg.tabTrackClass}`}>
                                  {([2, 3] as const).map((cnt) => {
                                    const on = scaleTargetCount === cnt;
                                    return (
                                      <button
                                        key={cnt}
                                        type="button"
                                        onClick={() => authoring.onSetReplicaTarget?.(scaleSvc, cnt)}
                                        style={{ fontSize: 11 }}
                                        className={`px-2.5 py-0.5 font-mono font-semibold transition ${
                                          on ? styleCfg.tabActiveClass : styleCfg.tabIdleClass
                                        }`}
                                      >
                                        &gt;= {cnt}x
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {activeGoalId === "recovery" && (() => {
                        const chip = chipFor("author-starts-down");
                        const downSvc = svc;
                        return (
                          <div className="space-y-2.5">
                            <button
                              type="button"
                              draggable={!authoring.busy}
                              disabled={authoring.busy || !downSvc}
                              title={t(chip.hintEn, chip.hintVi)}
                              onDragStart={(e) => startChipDrag(e, "author-starts-down")}
                              onClick={() =>
                                downSvc &&
                                authoring.onApplyBlockChip?.("author-starts-down", downSvc)
                              }
                              style={{ fontSize: 12.5, lineHeight: "1.25" }}
                              className={`flex h-9 w-full cursor-grab items-center justify-between gap-2 border px-2.5 text-left font-medium transition active:cursor-grabbing disabled:opacity-45 ${themeRadius} ${
                                startsDown ? themeActiveBtn : themeIdleBtn
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                {downSvc ? (
                                  <>
                                    {t("Starts Down:", "Tắt sẵn:")}{" "}
                                    <span className="font-mono font-semibold">{downSvc}</span>
                                  </>
                                ) : (
                                  t("Select or drag onto a 3D block", "Chọn hoặc kéo thả lên khối 3D")
                                )}
                              </span>
                              <span style={{ fontSize: 11 }} className="shrink-0 font-mono font-semibold opacity-85">
                                {startsDown ? "ON" : t("Set", "Đặt")}
                              </span>
                            </button>

                            <div className="flex flex-wrap items-center gap-1.5" style={{ fontSize: 12 }}>
                              <span className={themeSubtleText}>
                                {t("Stopped at start:", "Tắt sẵn lúc mở bài:")}
                              </span>
                              {authoring.initialStoppedServices.length > 0 ? (
                                authoring.initialStoppedServices.map((stoppedName) => (
                                  <span
                                    key={stoppedName}
                                    style={{ fontSize: 11.5 }}
                                    className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono font-medium ${themeRadius} ${themeIdleBtn}`}
                                  >
                                    {stoppedName}
                                    <button
                                      type="button"
                                      aria-label={`Remove ${stoppedName} from Starts Down`}
                                      onClick={() =>
                                        authoring.onApplyBlockChip?.("author-starts-down", stoppedName)
                                      }
                                      className="ml-0.5 opacity-60 hover:opacity-100"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className={themeSubtleText}>
                                  {t("None (all start Up)", "Không (tất cả chạy sẵn)")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {activeGoalId === "cpu" && (() => {
                        const chip = chipFor("author-cpu-target");
                        const cpuSvc = svc;
                        return (
                          <div className="space-y-2.5">
                            <button
                              type="button"
                              draggable={!authoring.busy}
                              disabled={authoring.busy || !cpuSvc}
                              title={t(chip.hintEn, chip.hintVi)}
                              onDragStart={(e) => startChipDrag(e, "author-cpu-target")}
                              onClick={() =>
                                cpuSvc &&
                                authoring.onApplyBlockChip?.("author-cpu-target", cpuSvc)
                              }
                              style={{ fontSize: 12.5, lineHeight: "1.25" }}
                              className={`flex h-9 w-full cursor-grab items-center justify-between gap-2 border px-2.5 text-left font-medium transition active:cursor-grabbing disabled:opacity-45 ${themeRadius} ${
                                isCpuTarget ? themeActiveBtn : themeIdleBtn
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                {cpuSvc ? (
                                  <>
                                    {t("Target:", "Mục tiêu:")}{" "}
                                    <span className="font-mono font-semibold">{cpuSvc}</span>
                                  </>
                                ) : (
                                  t("Select or drag onto a 3D block", "Chọn hoặc kéo thả lên khối 3D")
                                )}
                              </span>
                              <span style={{ fontSize: 11 }} className="shrink-0 font-mono font-semibold opacity-85">
                                {isCpuTarget ? `${cpuTargetPct}%` : t("Set", "Đặt")}
                              </span>
                            </button>

                            {isCpuTarget && cpuSvc && (
                              <div className="flex items-center justify-between gap-2">
                                <span style={{ fontSize: 12 }} className={themeSubtleText}>
                                  {t("CPU quota limit", "Ngưỡng giới hạn CPU")}
                                </span>
                                <div className={`inline-flex p-0.5 ${styleCfg.tabTrackClass}`}>
                                  {([25, 50] as const).map((pct) => {
                                    const on = cpuTargetPct === pct;
                                    return (
                                      <button
                                        key={pct}
                                        type="button"
                                        onClick={() =>
                                          authoring.onUpdateGoalRule?.({
                                            targetChangeAction: {
                                              action: "THROTTLE_CPU",
                                              service: cpuSvc,
                                              cpuPercent: pct,
                                            },
                                          })
                                        }
                                        style={{ fontSize: 11 }}
                                        className={`px-2.5 py-0.5 font-mono font-semibold transition ${
                                          on ? styleCfg.tabActiveClass : styleCfg.tabIdleClass
                                        }`}
                                      >
                                        {pct}%
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {!activeGoalId && (
                        <p style={{ fontSize: 12, lineHeight: "1.45" }} className={themeSubtleText}>
                          {t(
                            "Pick an Exercise Goal above to show its settings.",
                            "Chọn 1 dạng bài phía trên để hiện phần cấu hình riêng.",
                          )}
                        </p>
                      )}

                      {/* Live Docker Test Controls while Running so Lecturer can Author-by-Doing */}
                      {isLiveDemoMode && svc && (
                        <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                          <p
                            style={{ fontSize: 11 }}
                            className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                          >
                            {t("Live Test (Author by Doing)", "Thao tác thử trực tiếp trên Docker")}
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void studio.send(
                                  liveSvcPhase === "paused" ? "RESUME" : "PAUSE",
                                  svc,
                                )
                              }
                              style={{ fontSize: 12 }}
                              className={`h-8 border ${themeRadius} ${themeIdleBtn}`}
                            >
                              {liveSvcPhase === "paused" ? "Resume" : "Pause"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void dispatchCommand(
                                  liveSvcPhase === "stopped" ? "START" : "STOP",
                                  svc,
                                )
                              }
                              style={{ fontSize: 12 }}
                              className={`h-8 border ${themeRadius} ${themeIdleBtn}`}
                            >
                              {liveSvcPhase === "stopped" ? "Start" : "Stop"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || !canScaleFor(svc)}
                              onClick={() => void dispatchCommand("SCALE", svc, 2)}
                              style={{ fontSize: 12 }}
                              className={`h-8 border ${themeRadius} ${themeIdleBtn}`}
                            >
                              Scale 2x
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void studio.send("THROTTLE_CPU", svc, undefined, 25)}
                              style={{ fontSize: 12 }}
                              className={`h-8 border ${themeRadius} ${themeIdleBtn}`}
                            >
                              CPU 25%
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Static Reverse BFS Blast Radius Preview (Theme-Synchronized) */}
                    {staticBlastRadius.target &&
                      (activeGoalId === "change-impact" || activeGoalId === "recovery") && (
                      <div className={`space-y-1 p-2.5 ${themeBox}`}>
                        <p
                          style={{ fontSize: 11 }}
                          className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                        >
                          {t("Static Reverse BFS Preview", "Dự báo lan truyền (Reverse BFS)")}
                        </p>
                        <p style={{ fontSize: 12 }}>
                          <span className={themeSubtleText}>{t("Target:", "Mục tiêu:")}</span>{" "}
                          <code className="font-mono font-semibold">{staticBlastRadius.target}</code>
                        </p>
                        <p style={{ fontSize: 12 }}>
                          <span className={themeSubtleText}>
                            {t("Impacted upstream:", "Nhánh upstream bị ảnh hưởng:")}
                          </span>{" "}
                          <code className="font-mono font-semibold">
                            {staticBlastRadius.upstreamImpacted.length > 0
                              ? staticBlastRadius.upstreamImpacted.join(", ")
                              : t("None detected in static graph", "Chưa có nhánh gọi ngược")}
                          </code>
                        </p>
                      </div>
                    )}

                    {/* Direct 3D Wire Selection Card (Theme-Synchronized) */}
                    {activeWireFocus && (
                      <div className={`space-y-2 p-2.5 ${themeBox}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            style={{ fontSize: 11 }}
                            className={`font-semibold uppercase tracking-wide ${themeSubtleText}`}
                          >
                            {t("Selected Wire", "Dây nối đang chọn")}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedAuthorWire(null)}
                            style={{ fontSize: 11 }}
                            className={`underline opacity-75 hover:opacity-100 ${themeSubtleText}`}
                          >
                            {t("Dismiss", "Ẩn")}
                          </button>
                        </div>
                        <p style={{ fontSize: 12 }} className="font-mono font-semibold">
                          {activeWireFocus.from} -&gt; {activeWireFocus.to}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={authoring.busy}
                            onClick={() =>
                              authoring.onToggleWire?.(activeWireFocus.from, activeWireFocus.to)
                            }
                            style={{ fontSize: 12 }}
                            className={`h-8 flex-1 border ${themeRadius} ${wireIsRequired ? themeActiveBtn : themeIdleBtn}`}
                          >
                            {wireIsRequired
                              ? t("Clear required path", "Bỏ đánh dấu đường gọi")
                              : t("Mark required path", "Đánh dấu đường gọi cần kiểm chứng")}
                          </Button>
                          {wireController && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={authoring.busy}
                              onClick={() => authoring.onToggleInitialStopped(wireController, true)}
                              style={{ fontSize: 12 }}
                              className={`h-8 border ${themeRadius} ${wireCutAtStart ? themeActiveBtn : themeIdleBtn}`}
                            >
                              {wireCutAtStart
                                ? t("Reconnect", "Nối lại")
                                : t("Cut at start", "Ngắt ban đầu")}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSetupPanel("mission")}
                      style={{ fontSize: 12.5 }}
                      className={`h-9 w-full border font-semibold ${themeRadius} ${themeIdleBtn}`}
                    >
                      {t("Next: Mission & Endpoint", "Tiếp: Đề bài & Endpoint")}
                    </Button>
                  </section>
                );
              })()
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
                  authoring={authoringWithBlast}
                />
                {!isPreviewMode && selected && data.executionStatus === "RUNNING" && (() => {
                  const darkPhase = servicePhase(data, selected);
                  return (
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
                        disabled={busy || darkPhase !== "running"}
                        onClick={() => void studio.send("PAUSE", selected)}
                        className="h-7 whitespace-nowrap border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200 hover:bg-amber-500/20"
                      >
                        Pause (Freeze)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || darkPhase !== "paused"}
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
                            disabled={busy || darkPhase !== "running"}
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
                  );
                })()}
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
          );
        })()}
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
                className="flex-1 rounded-xl border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900"
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
