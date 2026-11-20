"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { captureStudioImage } from "./studio-observability";

type StudioAction = "START" | "STOP" | "SCALE";

/**
 * Shared Live-session state and commands for the card and workbench layouts.
 * Keeping this in one hook prevents the two layouts from drifting apart.
 */
export function useStudioSession(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const state = useApiQuery("studioState", { sessionId }, { enabled: !!sessionId, poll: true });
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

  const data = state.data;
  const services = data?.services ?? [];
  const target = services.includes(service) ? service : (services[0] ?? "");
  const waiting =
    data?.actions.some((item) => item.status === "PENDING" || item.status === "RUNNING") ?? false;
  const hasConfirmedAction = data?.actions.some((item) => item.status === "CONFIRMED") ?? false;
  const lastConfirmedReplicas = [...(data?.actions ?? [])]
    .reverse()
    .find((item) => item.service === target && item.status === "CONFIRMED")?.result?.replicasAfter;
  const observedRunningReplicas = data?.telemetry?.services.find(
    (item) => item.service === target,
  )?.runningReplicas;
  const runningReplicas = lastConfirmedReplicas ?? observedRunningReplicas;
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

  const prevStatusRef = useRef<string | undefined>(undefined);
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
