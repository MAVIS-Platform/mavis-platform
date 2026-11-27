"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { contracts, type Response as ApiResponse } from "@/lib/api/contracts";
import { captureStudioImage } from "./studio-observability";
import type { SmartSnapshotOverlay } from "./studio-smart-snapshot";

type StudioAction =
  | "START"
  | "STOP"
  | "SCALE"
  | "PAUSE"
  | "RESUME"
  | "THROTTLE_CPU"
  | "SET_LOAD"
  | "SET_ENV"
  | "SWAP_VERSION";
type StudioState = ApiResponse<"studioState">;
const TERMINAL_STUDIO_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "TIMEDOUT",
  "TIMEOUT",
]);

type StudioReplicaSource = {
  actions: ReadonlyArray<{
    service: string;
    status: string;
    requestedAt?: string | null | undefined;
    completedAt?: string | null | undefined;
    result?: { replicasAfter: number } | null | undefined;
  }>;
  telemetry?: {
    observedAt?: string | null | undefined;
    services: ReadonlyArray<{ service: string; runningReplicas: number }>;
  } | null | undefined;
};

/** Prefer live telemetry replicas once a frame arrives at/after the last confirmed action so post-action crashes show immediately. */
export function resolveRunningReplicas(
  data: StudioReplicaSource | null | undefined,
  service: string,
): number | undefined {
  if (!data || !service) return undefined;
  const lastConfirmed = [...data.actions]
    .reverse()
    .find((item) => item.service === service && item.status === "CONFIRMED");
  const confirmedReplicas = lastConfirmed?.result?.replicasAfter;
  const observedReplicas = data.telemetry?.services.find(
    (item) => item.service === service,
  )?.runningReplicas;
  if (observedReplicas === undefined) return confirmedReplicas;
  if (confirmedReplicas === undefined) return observedReplicas;
  const telemetryMs = data.telemetry?.observedAt ? Date.parse(data.telemetry.observedAt) : NaN;
  const actionIso = lastConfirmed?.completedAt ?? lastConfirmed?.requestedAt;
  const actionMs = actionIso ? Date.parse(actionIso) : NaN;
  if (Number.isFinite(telemetryMs) && Number.isFinite(actionMs) && telemetryMs >= actionMs) {
    return observedReplicas;
  }
  return confirmedReplicas;
}

/**
 * Shared Live-session state and commands for the card and workbench layouts.
 * Keeping this in one hook prevents the two layouts from drifting apart.
 */
export function useStudioSession(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [sseConnected, setSseConnected] = useState(false);
  const [cachedStatus, setCachedStatus] = useState("");
  const isTerminalCached = TERMINAL_STUDIO_STATUSES.has(cachedStatus);
  const slowPoll = sseConnected && cachedStatus === "RUNNING";
  const state = useApiQuery(
    "studioState",
    { sessionId },
    {
      enabled: !!sessionId,
      poll: Boolean(sessionId) && !isTerminalCached,
      ...(slowPoll ? { refreshMs: 8000 } : {}),
    },
  );
  const action = useApiMutation("studioAction");
  const prediction = useApiMutation("studioPrediction");
  const finish = useApiMutation("studioFinish");
  const cancel = useApiMutation("stopRuntime");
  const capture = useApiMutation("studioCapture");

  const [explanation, setExplanation] = useState("");
  const [capturing, setCapturing] = useState(false);
  const capturePromiseRef = useRef<Promise<void> | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [downloadError, setDownloadError] = useState<Error | null>(null);
  const [chaosTarget, setChaosTarget] = useState("");
  const [service, setService] = useState("");
  const [replicas, setReplicas] = useState(2);
  const pending = useRef<{
    actionId: string;
    action: StudioAction;
    service: string;
    replicas?: number;
    cpuPercent?: number;
    targetRps?: number;
    envKey?: string;
    envValue?: string;
    targetImage?: string;
  } | null>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const sawQueuedRef = useRef(false);
  const sendingRef = useRef(false);
  const sseRetryAttemptRef = useRef(0);
  const [cancelledWhileQueued, setCancelledWhileQueued] = useState(false);

  // Reset transient per-session UI state when switching or restarting sessions.
  const resetAction = action.reset;
  const resetPrediction = prediction.reset;
  const resetFinish = finish.reset;
  const resetCancel = cancel.reset;
  const resetCapture = capture.reset;
  useEffect(() => {
    setExplanation("");
    setActionError(null);
    setDownloadError(null);
    setChaosTarget("");
    setSseConnected(false);
    setCancelledWhileQueued(false);
    pending.current = null;
    prevStatusRef.current = undefined;
    sawQueuedRef.current = false;
    sseRetryAttemptRef.current = 0;
    resetAction();
    resetPrediction();
    resetFinish();
    resetCancel();
    resetCapture();
  }, [sessionId, resetAction, resetPrediction, resetFinish, resetCancel, resetCapture]);

  const data = state.data;
  const latestObservedAtRef = useRef<string | undefined>(undefined);
  latestObservedAtRef.current = data?.telemetry?.observedAt;
  const executionStatus = data?.executionStatus?.toUpperCase() ?? "";
  useEffect(() => {
    setCachedStatus(
      TERMINAL_STUDIO_STATUSES.has(executionStatus)
        ? executionStatus
        : data?.finishRequested
          ? "FINISHING"
          : executionStatus,
    );
    if (executionStatus === "QUEUED") {
      sawQueuedRef.current = true;
      setCancelledWhileQueued(false);
    } else if (executionStatus === "CANCELLED" && sawQueuedRef.current) {
      setCancelledWhileQueued(true);
    } else if (executionStatus === "RUNNING" || executionStatus === "COMPLETED") {
      sawQueuedRef.current = false;
      setCancelledWhileQueued(false);
    }
  }, [executionStatus, data?.finishRequested]);

  // Visible-tab heartbeat: refetch /studio/state every 30s (and on tab return) so only visible tabs keep QUEUED/RUNNING sessions alive.
  const activeHeartbeatStatus =
    executionStatus === "QUEUED" ||
    executionStatus === "READY_FOR_DISPATCH" ||
    executionStatus === "ALLOCATED" ||
    executionStatus === "RUNNING";
  const refetchState = state.refetch;
  useEffect(() => {
    if (!sessionId || !activeHeartbeatStatus) return;
    const pingIfVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void refetchState();
      }
    };
    const timer = window.setInterval(pingIfVisible, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refetchState();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionId, activeHeartbeatStatus, refetchState]);
  const streamEnabled =
    Boolean(sessionId) &&
    /^[a-f0-9-]{36}$/i.test(sessionId) &&
    !finish.isPending &&
    !data?.finishRequested &&
    !TERMINAL_STUDIO_STATUSES.has(executionStatus);

  const MAX_SSE_RETRIES = 8;
  const [sseRetryNonce, setSseRetryNonce] = useState(0);
  // Subscribe to live SSE frames from the backend ring buffer; automatically falls back to polling if disconnected.
  useEffect(() => {
    if (!streamEnabled || typeof EventSource === "undefined") {
      setSseConnected(false);
      return;
    }
    let reconnectTimer: number | null = null;
    const source = new EventSource(
      `/api/backend/analyzer/runtime/sessions/${sessionId}/studio/stream`,
    );
    const onOpen = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      sseRetryAttemptRef.current = 0;
      setSseConnected(true);
    };
    const onError = () => {
      setSseConnected(false);
      // Bounded exponential backoff when proxy/network closes EventSource permanently (CLOSED).
      if (
        source.readyState === EventSource.CLOSED &&
        reconnectTimer === null &&
        sseRetryAttemptRef.current < MAX_SSE_RETRIES &&
        (typeof document === "undefined" || document.visibilityState === "visible")
      ) {
        const delayMs = Math.min(30_000, 3_000 * 2 ** sseRetryAttemptRef.current);
        sseRetryAttemptRef.current += 1;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          setSseRetryNonce((n) => n + 1);
        }, delayMs);
      }
    };
    const onVisibilityResume = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        source.readyState === EventSource.CLOSED &&
        reconnectTimer === null
      ) {
        sseRetryAttemptRef.current = 0;
        setSseRetryNonce((n) => n + 1);
      }
    };
    const onTelemetry = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          telemetry?: unknown;
          telemetryReceivedAt?: string;
          frame?: unknown;
          executionStatus?: string;
        };
        const parsedTelemetry = contracts.studioState.output.shape.telemetry.safeParse(
          payload.telemetry,
        );
        if (!parsedTelemetry.success || !parsedTelemetry.data) return;
        const nextTelemetry = parsedTelemetry.data;
        const parsedFrame = payload.frame
          ? contracts.studioState.output.shape.telemetryHistory.unwrap().element.safeParse(payload.frame)
          : null;
        let shouldSyncState = false;
        queryClient.setQueryData<StudioState>(["api", "studioState", { sessionId }], (prev) => {
          if (!prev) return prev;
          const nextHistory =
            parsedFrame?.success
              ? [...(prev.telemetryHistory ?? []).slice(-59), parsedFrame.data]
              : prev.telemetryHistory;
          const nextStatus =
            typeof payload.executionStatus === "string" && payload.executionStatus.trim()
              ? payload.executionStatus.trim()
              : prev.executionStatus;
          if (
            nextStatus !== prev.executionStatus ||
            ((prev.executionStatus === "ALLOCATED" ||
              prev.executionStatus === "QUEUED" ||
              prev.executionStatus === "READY_FOR_DISPATCH") &&
              nextTelemetry.services.some((svc) => svc.runningReplicas > 0))
          ) {
            shouldSyncState = true;
          }
          return {
            ...prev,
            executionStatus: nextStatus,
            telemetry: nextTelemetry,
            ...(payload.telemetryReceivedAt
              ? { telemetryReceivedAt: payload.telemetryReceivedAt }
              : {}),
            ...(nextHistory ? { telemetryHistory: nextHistory } : {}),
          };
        });
        if (shouldSyncState) {
          void queryClient.invalidateQueries({ queryKey: ["api", "studioState", { sessionId }] });
        }
      } catch {
        // Ignore malformed frame; fallback polling keeps state consistent.
      }
    };
    const onState = (event: MessageEvent<string>) => {
      try {
        const parsed = contracts.studioState.output.safeParse(JSON.parse(event.data));
        if (!parsed.success) return;
        queryClient.setQueryData<StudioState>(["api", "studioState", { sessionId }], parsed.data);
      } catch {
        // Ignore malformed state event.
      }
    };
    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);
    source.addEventListener("telemetry", onTelemetry as EventListener);
    source.addEventListener("state", onState as EventListener);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityResume);
    }
    return () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityResume);
      }
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.removeEventListener("telemetry", onTelemetry as EventListener);
      source.removeEventListener("state", onState as EventListener);
      source.close();
      setSseConnected(false);
    };
  }, [sessionId, streamEnabled, queryClient, sseRetryNonce]);
  const services = data?.services ?? [];
  const target = services.includes(service) ? service : (services[0] ?? "");
  const waiting =
    data?.actions.some((item) => item.status === "PENDING" || item.status === "RUNNING") ?? false;
  const hasConfirmedAction = data?.actions.some((item) => item.status === "CONFIRMED") ?? false;
  const runningReplicas = resolveRunningReplicas(data, target);
  const selectedBlock = data?.topology?.blocks.find((block) => block.service === target);
  const canScaleTarget = data?.topology ? selectedBlock?.canScale === true : Boolean(target);
  const busy =
    !data ||
    state.isError ||
    action.isPending ||
    finish.isPending ||
    cancel.isPending ||
    waiting ||
    data.finishRequested ||
    data.executionStatus !== "RUNNING";

  async function send(
    kind: StudioAction,
    targetService = target,
    overrideReplicas?: number,
    cpuPercent?: number,
    targetRps?: number,
    extra?: { envKey?: string; envValue?: string; targetImage?: string },
  ) {
    if (!data || action.isPending || sendingRef.current) return;
    sendingRef.current = true;
    const requestedReplicas = overrideReplicas ?? replicas;
    if (overrideReplicas !== undefined) {
      setReplicas(overrideReplicas);
    }
    const previous = pending.current;
    const command =
      previous &&
      previous.action === kind &&
      previous.service === targetService &&
      previous.replicas === (kind === "SCALE" ? requestedReplicas : undefined) &&
      previous.cpuPercent === (kind === "THROTTLE_CPU" ? cpuPercent : undefined) &&
      previous.targetRps === (kind === "SET_LOAD" ? targetRps : undefined) &&
      previous.envKey === (kind === "SET_ENV" ? extra?.envKey : undefined) &&
      previous.envValue === (kind === "SET_ENV" ? extra?.envValue : undefined) &&
      previous.targetImage === (kind === "SWAP_VERSION" ? extra?.targetImage : undefined)
        ? previous
        : {
            actionId: crypto.randomUUID(),
            action: kind,
            service: targetService,
            ...(kind === "SCALE" ? { replicas: requestedReplicas } : {}),
            ...(kind === "THROTTLE_CPU" && cpuPercent !== undefined ? { cpuPercent } : {}),
            ...(kind === "SET_LOAD" && targetRps !== undefined ? { targetRps } : {}),
            ...(kind === "SET_ENV" && extra?.envKey !== undefined && extra?.envValue !== undefined
              ? { envKey: extra.envKey, envValue: extra.envValue }
              : {}),
            ...(kind === "SWAP_VERSION" && extra?.targetImage !== undefined
              ? { targetImage: extra.targetImage }
              : {}),
          };
    pending.current = command;
    setActionError(null);
    try {
      await action.mutateAsync({ sessionId, ...command });
      pending.current = null;
      await state.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error ? error : new Error("Studio action was not confirmed"),
      );
      await state.refetch();
    } finally {
      sendingRef.current = false;
    }
  }

  async function submitPrediction(predictedServices: string[], rationale: string) {
    if (!data || predictedServices.length === 0) return;
    setActionError(null);
    try {
      await prediction.mutateAsync({
        sessionId,
        predictedServices,
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
      });
      await state.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error ? error : new Error("Could not lock Change Impact prediction"),
      );
      await state.refetch();
    }
  }

  useEffect(() => {
    const status = data?.executionStatus;
    if (!status) return;
    const changed = prevStatusRef.current !== undefined && prevStatusRef.current !== status;
    prevStatusRef.current = status;
    if (changed || status === "COMPLETED" || data?.receiptDigest) {
      void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "runtimeReadSessions"] });
      if (status === "COMPLETED" || data?.receiptDigest) {
        void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-context"] });
        void queryClient.refetchQueries({
          queryKey: ["api", "student-lab-studio-sessions"],
          type: "all",
        });
        void queryClient.refetchQueries({
          queryKey: ["api", "student-lab-context"],
          type: "all",
        });
      }
    }
  }, [data?.executionStatus, data?.receiptDigest, queryClient]);

  async function finishStudio() {
    if (finish.isPending) return;
    if (capturePromiseRef.current) {
      await capturePromiseRef.current.catch(() => {});
    }
    setActionError(null);
    try {
      const finished = await finish.mutateAsync({ sessionId });
      // Transition cached state out of LIVE immediately and close SSE before teardown begins.
      if (finished && typeof finished === "object") {
        queryClient.setQueryData<StudioState>(["api", "studioState", { sessionId }], (prev) =>
          prev
            ? {
                ...prev,
                ...(finished as Partial<StudioState>),
                finishRequested: true,
              }
            : (finished as StudioState),
        );
      }
      setCachedStatus((prev) =>
        TERMINAL_STUDIO_STATUSES.has(prev) ? prev : "FINISHING",
      );
    } catch (error) {
      const refreshed = await state.refetch();
      const nextExec = refreshed.data?.executionStatus?.toUpperCase() ?? "";
      if (!refreshed.data?.finishRequested && !TERMINAL_STUDIO_STATUSES.has(nextExec)) {
        setActionError(error instanceof Error ? error : new Error("Could not finish Studio session"));
      }
    } finally {
      await state.refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "runtimeReadSessions"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "student-lab-context"] }),
      ]);
    }
  }

  async function cancelStudio() {
    if (cancel.isPending) return;
    setActionError(null);
    try {
      await cancel.mutateAsync({ sessionId, action: "cancel" });
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error("Could not cancel Studio session"));
    } finally {
      await state.refetch();
      void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "runtimeReadSessions"] });
    }
  }

  async function captureSnapshot(
    graph: SVGSVGElement | null,
    options?: {
      smartOverlay?: SmartSnapshotOverlay;
      explanationOverride?: string;
      videoData?: string;
      posterImageData?: string;
    },
  ): Promise<boolean> {
    const finalExplanation = (options?.explanationOverride ?? explanation).trim();
    if (!data || !finalExplanation || capturePromiseRef.current) return false;
    setCapturing(true);
    setDownloadError(null);
    let succeeded = false;
    const task = (async () => {
      try {
        const sessionUser = queryClient.getQueryData<ApiResponse<"session">>([
          "api",
          "session",
          {},
        ])?.user;
        const watermark = {
          studentName: sessionUser?.name,
          studentEmail: sessionUser?.email,
          snapshotIndex: (data.snapshots?.length ?? 0) + 1,
          sessionId,
          capturedAt: new Date().toISOString(),
        };
        const imageData =
          options?.posterImageData ??
          (graph
            ? await captureStudioImage(graph, false, watermark, options?.smartOverlay).catch(
                () => undefined,
              )
            : undefined);
        const created = await capture.mutateAsync({
          sessionId,
          explanation: finalExplanation,
          ...(imageData ? { imageData } : {}),
          ...(options?.videoData ? { videoData: options.videoData } : {}),
          observedAt: latestObservedAtRef.current ?? data.telemetry?.observedAt,
        });
        const createdId =
          created && typeof created["id"] === "string" ? (created["id"] as string) : null;
        if (createdId && (imageData || options?.videoData)) {
          // Seed immutable snapshot cache so the captured image/video renders immediately in Studio with zero extra round-trip.
          queryClient.setQueryData(["api", "studioSnapshot", { sessionId, snapshotId: createdId }], {
            ...created,
            ...(imageData ? { imageData } : {}),
            ...(options?.videoData ? { videoData: options.videoData, hasVideo: true } : {}),
          });
        }
        succeeded = true;
        setExplanation("");
        await queryClient.invalidateQueries({ queryKey: ["api", "studioState", { sessionId }] });
        void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] });
        await state.refetch();
      } catch (error) {
        setDownloadError(error instanceof Error ? error : new Error("Could not capture evidence"));
      } finally {
        capturePromiseRef.current = null;
        setCapturing(false);
      }
    })();
    capturePromiseRef.current = task;
    await task;
    return succeeded;
  }

  async function downloadReceipt() {
    setDownloadError(null);
    try {
      const evidence = await api.execute("studioReceipt", { sessionId });
      downloadJson(evidence, `studio-receipt-${sessionId}.json`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error : new Error("Could not load receipt"));
    }
  }

  async function downloadSnapshot(snapshotId: string) {
    setDownloadError(null);
    try {
      const evidence = await api.execute("studioSnapshot", { sessionId, snapshotId });
      downloadJson(evidence, `studio-evidence-${snapshotId}.json`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error : new Error("Could not load evidence"));
    }
  }

  return {
    state,
    sseConnected,
    cancelledWhileQueued,
    data,
    services,
    target,
    service,
    setService,
    replicas,
    setReplicas,
    waiting,
    hasConfirmedAction,
    runningReplicas,
    selectedBlock,
    canScaleTarget,
    busy,
    action,
    prediction,
    finish,
    cancel,
    capture,
    explanation,
    setExplanation,
    capturing,
    actionError,
    downloadError,
    setDownloadError,
    chaosTarget,
    setChaosTarget,
    send,
    submitPrediction,
    finishStudio,
    cancelStudio,
    captureSnapshot,
    downloadReceipt,
    downloadSnapshot,
  };
}

function downloadJson(evidence: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
