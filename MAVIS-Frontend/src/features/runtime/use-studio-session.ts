"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { contracts, type Response as ApiResponse } from "@/lib/api/contracts";
import { captureStudioImage } from "./studio-observability";

type StudioAction = "START" | "STOP" | "SCALE";
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
  const state = useApiQuery(
    "studioState",
    { sessionId },
    { enabled: !!sessionId, poll: true, ...(sseConnected ? { refreshMs: 12000 } : {}) },
  );
  const action = useApiMutation("studioAction");
  const finish = useApiMutation("studioFinish");
  const cancel = useApiMutation("stopRuntime");
  const capture = useApiMutation("studioCapture");

  const [explanation, setExplanation] = useState("");
  const [capturing, setCapturing] = useState(false);
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
  } | null>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);

  // Reset transient per-session UI state when switching or restarting sessions.
  const resetAction = action.reset;
  const resetFinish = finish.reset;
  const resetCancel = cancel.reset;
  const resetCapture = capture.reset;
  useEffect(() => {
    setExplanation("");
    setActionError(null);
    setDownloadError(null);
    setChaosTarget("");
    setSseConnected(false);
    pending.current = null;
    prevStatusRef.current = undefined;
    resetAction();
    resetFinish();
    resetCancel();
    resetCapture();
  }, [sessionId, resetAction, resetFinish, resetCancel, resetCapture]);

  const data = state.data;
  const executionStatus = data?.executionStatus?.toUpperCase() ?? "";
  const streamEnabled =
    Boolean(sessionId) &&
    /^[a-f0-9-]{36}$/i.test(sessionId) &&
    !TERMINAL_STUDIO_STATUSES.has(executionStatus);

  // Subscribe to live SSE frames from the backend ring buffer; automatically falls back to polling if disconnected.
  useEffect(() => {
    if (!streamEnabled || typeof EventSource === "undefined") {
      setSseConnected(false);
      return;
    }
    const source = new EventSource(
      `/api/backend/analyzer/runtime/sessions/${sessionId}/studio/stream`,
    );
    const onOpen = () => setSseConnected(true);
    const onError = () => setSseConnected(false);
    const onTelemetry = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          telemetry?: unknown;
          telemetryReceivedAt?: string;
          frame?: unknown;
        };
        const parsedTelemetry = contracts.studioState.output.shape.telemetry.safeParse(
          payload.telemetry,
        );
        if (!parsedTelemetry.success || !parsedTelemetry.data) return;
        const parsedFrame = payload.frame
          ? contracts.studioState.output.shape.telemetryHistory.unwrap().element.safeParse(payload.frame)
          : null;
        queryClient.setQueryData<StudioState>(["api", "studioState", { sessionId }], (prev) => {
          if (!prev) return prev;
          const nextHistory =
            parsedFrame?.success
              ? [...(prev.telemetryHistory ?? []).slice(-59), parsedFrame.data]
              : prev.telemetryHistory;
          return {
            ...prev,
            telemetry: parsedTelemetry.data,
            ...(payload.telemetryReceivedAt
              ? { telemetryReceivedAt: payload.telemetryReceivedAt }
              : {}),
            ...(nextHistory ? { telemetryHistory: nextHistory } : {}),
          };
        });
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
    return () => {
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.removeEventListener("telemetry", onTelemetry as EventListener);
      source.removeEventListener("state", onState as EventListener);
      source.close();
      setSseConnected(false);
    };
  }, [sessionId, streamEnabled, queryClient]);
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

  async function send(kind: StudioAction, targetService = target, overrideReplicas?: number) {
    if (!data) return;
    const requestedReplicas = overrideReplicas ?? replicas;
    if (overrideReplicas !== undefined) {
      setReplicas(overrideReplicas);
    }
    const previous = pending.current;
    const command =
      previous &&
      previous.action === kind &&
      previous.service === targetService &&
      previous.replicas === (kind === "SCALE" ? requestedReplicas : undefined)
        ? previous
        : {
            actionId: crypto.randomUUID(),
            action: kind,
            service: targetService,
            ...(kind === "SCALE" ? { replicas: requestedReplicas } : {}),
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
      }
    }
  }, [data?.executionStatus, data?.receiptDigest, queryClient]);

  async function finishStudio() {
    try {
      await finish.mutateAsync({ sessionId });
    } finally {
      await state.refetch();
      void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "runtimeReadSessions"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-context"] });
    }
  }

  async function cancelStudio() {
    try {
      await cancel.mutateAsync({ sessionId, action: "cancel" });
    } finally {
      await state.refetch();
      void queryClient.invalidateQueries({ queryKey: ["api", "student-lab-studio-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "runtimeReadSessions"] });
    }
  }

  async function captureSnapshot(graph: SVGSVGElement | null) {
    if (!data || !explanation.trim()) return;
    setCapturing(true);
    setDownloadError(null);
    try {
      const imageData = graph ? await captureStudioImage(graph).catch(() => undefined) : undefined;
      await capture.mutateAsync({
        sessionId,
        explanation: explanation.trim(),
        ...(imageData ? { imageData } : {}),
        observedAt: data.telemetry?.observedAt,
      });
      setExplanation("");
      await state.refetch();
    } catch (error) {
      setDownloadError(error instanceof Error ? error : new Error("Could not capture evidence"));
    } finally {
      setCapturing(false);
    }
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
  link.click();
  URL.revokeObjectURL(url);
}
