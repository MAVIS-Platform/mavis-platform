"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";
import { StudioObservability } from "./studio-observability";
import { LiveSandboxParity } from "./live-sandbox-parity";
import { Textarea } from "@/components/ui/textarea";
import { StudioSnapshotComparison } from "./studio-snapshot-comparison";
import { PreparedLiveTopology } from "./prepared-live-topology";
import { useStudioSession } from "./use-studio-session";

export function StudioControls({ sessionId }: { sessionId: string }) {
  const { t } = useLocale();
  const {
    state,
    services,
    target,
    service,
    setService,
    replicas,
    setReplicas,
    waiting,
    hasConfirmedAction,
    runningReplicas,
    canScaleTarget,
    busy,
    action,
    finish,
    cancel,
    capture,
    explanation,
    setExplanation,
    capturing,
    downloadError,
    chaosTarget,
    setChaosTarget,
    send,
    finishStudio,
    cancelStudio,
    captureSnapshot,
    downloadReceipt,
    downloadSnapshot,
  } = useStudioSession(sessionId);
  const workspace = useRef<HTMLElement>(null);
  if (!state.data?.interactive)
    return state.isError ? (
      <ErrorState error={state.error} onRetry={() => void state.refetch()} />
    ) : null;
  const data = state.data;
  return (
    <section ref={workspace} className="space-y-3 rounded-lg border p-4" aria-label="MAVIS Studio">
      <h3 className="font-medium">MAVIS Studio</h3>
      {state.isError && <ErrorState error={state.error} onRetry={() => void state.refetch()} />}
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
        <label
          className="text-sm"
          title={
            canScaleTarget
              ? undefined
              : t("This prepared service is not marked canScale in the assigned topology.")
          }
        >
          {t("Replicas (1–8)")}
          <Input
            type="number"
            min={1}
            max={8}
            step={1}
            value={replicas}
            disabled={busy || !canScaleTarget}
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
            disabled={busy || !canScaleTarget}
            aria-label={t("Scale replica slider")}
            className="block w-32"
            onChange={(event) => setReplicas(Number(event.target.value))}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={
            busy || !canScaleTarget || !target || runningReplicas === 0 || runningReplicas === replicas
          }
          title={
            canScaleTarget
              ? undefined
              : t("This prepared service is not marked canScale in the assigned topology.")
          }
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
          onClick={() => void finishStudio()}
        >
          {t("Finish Studio and save evidence")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={cancel.isPending || data.executionStatus !== "RUNNING"}
          onClick={() => void cancelStudio()}
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
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("Guided Lab Mission Checklist")}
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Step 1: Capture baseline snapshot", (data.snapshots?.length ?? 0) >= 1],
              ["Step 2: Scale replicas (4 → 8) or inject fault", hasConfirmedAction],
              [
                "Step 3: Capture post-change snapshot & compare",
                (data.snapshots?.length ?? 0) >= 2,
              ],
              [
                "Step 4: Finish Studio & seal HMAC receipt",
                data.executionStatus === "COMPLETED" || Boolean(data.receiptDigest),
              ],
            ] as const
          ).map(([label, done]) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded border px-2.5 py-1.5 ${
                done ? "border-primary/40 bg-primary/10 font-medium" : "bg-background opacity-80"
              }`}
            >
              <span className="font-mono text-sm">{done ? "✓" : "○"}</span>
              <span>{t(label)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          {data.topology ? <PreparedLiveTopology
            data={data} selected={target} onSelect={setService} busy={busy}
            onCommand={send}
          /> : <StudioObservability
            data={data}
            selected={target}
            onSelect={setService}
            busy={busy}
            onQuickAction={(cmd) => {
              setService(cmd.service);
              void send(cmd.action, cmd.service, cmd.replicas).catch(() => undefined);
            }}
          />}
        </div>
        <LiveSandboxParity
          data={data}
          selected={target}
          busy={busy}
          onSelect={setService}
          onCommand={send}
        />
      </div>
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
      {(data.snapshots?.length ?? 0) > 1 && (
        <StudioSnapshotComparison sessionId={sessionId} snapshots={data.snapshots ?? []} />
      )}
      <section className="space-y-2">
        <h4 className="font-medium">{t("Capture evidence snapshot")}</h4>
        {data.receiptDigest && (
          <Button type="button" variant="outline" onClick={() => void downloadReceipt()}>
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
          onClick={() =>
            void captureSnapshot(
              workspace.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]") ?? null,
            )
          }
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
              onClick={() => void downloadSnapshot(snapshot.id)}
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
