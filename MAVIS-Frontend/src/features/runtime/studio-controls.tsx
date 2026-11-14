"use client";

import { useRef, useState } from "react";
import { useApi, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";
import { StudioObservability, captureStudioImage } from "./studio-observability";
import { Textarea } from "@/components/ui/textarea";

export function StudioControls({ sessionId }: { sessionId: string }) {
  const { t } = useLocale();
  const api = useApi();
  const [downloadError, setDownloadError] = useState<Error | null>(null);
  const state = useApiQuery("studioState", { sessionId }, { enabled: !!sessionId, poll: true });
  const action = useApiMutation("studioAction");
  const finish = useApiMutation("studioFinish");
  const cancel = useApiMutation("stopRuntime");
  const capture = useApiMutation("studioCapture");
  const [explanation, setExplanation] = useState("");
  const [capturing, setCapturing] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const [chaosTarget, setChaosTarget] = useState("");
  const [service, setService] = useState("");
  const [replicas, setReplicas] = useState(2);
  const pending = useRef<{
    actionId: string;
    action: "START" | "STOP" | "SCALE";
    service: string;
    replicas?: number;
  } | null>(null);
  const services = state.data?.services ?? [];
  const target = services.includes(service) ? service : (services[0] ?? "");
  if (!state.data?.interactive) return state.isError ? <ErrorState error={state.error} /> : null;
  const data = state.data;
  const waiting = data.actions.some(
    (item) => item.status === "PENDING" || item.status === "RUNNING",
  );
  const hasConfirmedAction = data.actions.some((item) => item.status === "CONFIRMED");
  const runningReplicas = [...data.actions]
    .reverse()
    .find((item) => item.service === target && item.status === "CONFIRMED")?.result?.replicasAfter;
  const busy =
    action.isPending ||
    finish.isPending ||
    cancel.isPending ||
    waiting ||
    data.finishRequested ||
    data.executionStatus !== "RUNNING";
  async function send(kind: "START" | "STOP" | "SCALE", targetService = target) {
    const previous = pending.current;
    const command =
      previous &&
      previous.action === kind &&
      previous.service === targetService &&
      previous.replicas === (kind === "SCALE" ? replicas : undefined)
        ? previous
        : {
            actionId: crypto.randomUUID(),
            action: kind,
            service: targetService,
            ...(kind === "SCALE" ? { replicas } : {}),
          };
    pending.current = command;
    try {
      await action.mutateAsync({ sessionId, ...command });
      pending.current = null;
      await state.refetch();
    } catch {
      await state.refetch();
    }
  }
  return (
    <section ref={workspace} className="space-y-3 rounded-lg border p-4" aria-label="MAVIS Studio">
      <h3 className="font-medium">MAVIS Studio</h3>
      <StudioObservability data={data} selected={target} onSelect={setService} />
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label={t("Target service")}
          value={target}
          onChange={setService}
          disabled={busy}
          options={services.map((value) => ({ value, label: value }))}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !target || (runningReplicas !== undefined && runningReplicas > 0)}
          onClick={() => void send("START")}
        >
          {t("Start service")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !target || runningReplicas === 0}
          onClick={() => void send("STOP")}
        >
          {t("Stop service")}
        </Button>
        <label className="text-sm">
          {t("Replicas (1–8)")}
          <Input
            type="number"
            min={1}
            max={8}
            step={1}
            value={replicas}
            disabled={busy}
            className="w-24"
            onChange={(event) =>
              setReplicas(Math.max(1, Math.min(8, Math.trunc(Number(event.target.value)) || 1)))
            }
          />
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={replicas}
            disabled={busy}
            aria-label={t("Scale replica slider")}
            className="block w-32"
            onChange={(event) => setReplicas(Number(event.target.value))}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !target || runningReplicas === 0 || runningReplicas === replicas}
          onClick={() => void send("SCALE")}
        >
          {t("Scale replicas")}
        </Button>
        <Button
          type="button"
          disabled={
            finish.isPending ||
            action.isPending ||
            waiting ||
            !hasConfirmedAction ||
            data.finishRequested ||
            data.executionStatus !== "RUNNING"
          }
          onClick={() =>
            void finish
              .mutateAsync({ sessionId })
              .then(() => state.refetch())
              .catch(() => state.refetch())
          }
        >
          {t("Finish Studio and save evidence")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={cancel.isPending || data.executionStatus !== "RUNNING"}
          onClick={() =>
            void cancel
              .mutateAsync({ sessionId, action: "cancel" })
              .then(() => state.refetch())
              .catch(() => state.refetch())
          }
        >
          {t("Cancel Studio session")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !data.telemetry?.services.some((item) => item.runningReplicas > 0)}
          onClick={() => {
            const running =
              data.telemetry?.services
                .filter((item) => item.runningReplicas > 0)
                .map((item) => item.service) ?? [];
            if (running.length)
              setChaosTarget(
                running[crypto.getRandomValues(new Uint32Array(1))[0]! % running.length]!,
              );
          }}
        >
          {t("Chaos Monkey experiment")}
        </Button>
        {chaosTarget && (
          <>
            <p className="text-sm">
              {t("Stop the selected running service")}: {chaosTarget}
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setService(chaosTarget);
                void send("STOP", chaosTarget);
                setChaosTarget("");
              }}
            >
              {t("Confirm fault injection")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setChaosTarget("")}>
              {t("Cancel")}
            </Button>
          </>
        )}
      </div>
      {action.isError && <ErrorState error={action.error} />}
      {finish.isError && <ErrorState error={finish.error} />}
      {cancel.isError && <ErrorState error={cancel.error} />}
      {capture.isError && <ErrorState error={capture.error} />}
      {downloadError && <ErrorState error={downloadError} />}
      <p role="status" className="text-sm text-muted-foreground">
        {t(
          data.finishRequested
            ? "Finishing Studio and cleaning up"
            : waiting
              ? "Waiting for Runner confirmation"
              : "Studio session ready",
        )}
        {" · "}
        {data.executionStatus}
        {" · "}
        {t("Cleanup")}: {data.cleanupStatus}
      </p>
      {data.actions.length > 0 && (
        <ol className="space-y-2 text-sm">
          {data.actions.map((item) => (
            <li key={item.actionId} className="space-y-1">
              <span className="font-medium">
                {item.action} {item.service}
                {item.replicas ? ` → ${item.replicas}` : ""}
              </span>
              {" · "}
              {item.status}
              {item.result && (
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
                  <dt>{t("Running replicas")}</dt>
                  <dd>
                    {item.result.replicasBefore} → {item.result.replicasAfter}
                  </dd>
                  {(
                    [
                      ["requestCount", "Requests measured"],
                      ["p95LatencyMs", "p95 latency (ms)"],
                      ["errorRatePercent", "Request error rate (%)"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="contents">
                      <dt>{t(label)}</dt>
                      <dd>
                        {metric(item.result?.metricsBefore[key])} →{" "}
                        {metric(item.result?.metricsAfter[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {item.result && (
                <details className="text-sm">
                  <summary>{t("Before/After trace evidence")}</summary>
                  <p>
                    {t("Before")}: {traceIds(item.result.metricsBefore["traceIds"])}
                  </p>
                  <p>
                    {t("After")}: {traceIds(item.result.metricsAfter["traceIds"])}
                  </p>
                  <p>{item.completedAt ? new Date(item.completedAt).toLocaleString() : ""}</p>
                </details>
              )}
              {item.result && item.result.metricsAfter["requestCount"] === undefined && (
                <p className="text-sm text-muted-foreground">
                  {t("Request metrics require a replayable GET/HEAD workload.")}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <section className="space-y-2">
        <h4 className="font-medium">{t("Capture evidence snapshot")}</h4>
        {data.receiptDigest && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDownloadError(null);
              void api
                .execute("studioReceipt", { sessionId })
                .then((evidence) => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `studio-receipt-${sessionId}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                })
                .catch((error) =>
                  setDownloadError(
                    error instanceof Error ? error : new Error("Could not load receipt"),
                  ),
                );
            }}
          >
            {t(data.receiptSignature ? "Download signed receipt" : "Download receipt")}
          </Button>
        )}
        <label className="block text-sm">
          {t("Explain the observed behavior")}
          <Textarea
            value={explanation}
            maxLength={4000}
            onChange={(event) => setExplanation(event.target.value)}
          />
        </label>
        <Button
          type="button"
          disabled={
            !data.telemetry ||
            !explanation.trim() ||
            capture.isPending ||
            capturing ||
            waiting ||
            (data.snapshots?.length ?? 0) >= 8
          }
          onClick={() => {
            setCapturing(true);
            setDownloadError(null);
            const graph = workspace.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
            if (!graph) {
              setCapturing(false);
              return;
            }
            void captureStudioImage(graph)
              .then((imageData) =>
                capture.mutateAsync({
                  sessionId,
                  explanation: explanation.trim(),
                  imageData,
                  observedAt: data.telemetry?.observedAt,
                }),
              )
              .then(() => {
                setExplanation("");
                return state.refetch();
              })
              .catch((error) =>
                setDownloadError(
                  error instanceof Error ? error : new Error("Could not capture evidence"),
                ),
              )
              .finally(() => setCapturing(false));
          }}
        >
          {t("Capture evidence snapshot")}
        </Button>
        {data.snapshots?.map((snapshot) => (
          <div key={snapshot.id} className="rounded border p-2 text-sm">
            <p>
              {new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.explanation}
            </p>
            <p className="break-all font-mono">{snapshot.digest}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDownloadError(null);
                void api
                  .execute("studioSnapshot", { sessionId, snapshotId: snapshot.id })
                  .then((evidence) => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `studio-evidence-${snapshot.id}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch((error) =>
                    setDownloadError(
                      error instanceof Error ? error : new Error("Could not load evidence"),
                    ),
                  );
              }}
            >
              {t("Download evidence")}
            </Button>
          </div>
        ))}
      </section>
    </section>
  );
}

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2)).toString()
    : "—";
}
function traceIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").join(", ") : "—";
}
