"use client";

import { useRef, useState } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";

export function StudioControls({ sessionId }: { sessionId: string }) {
  const { t } = useLocale();
  const state = useApiQuery(
    "studioState",
    { sessionId },
    { enabled: !!sessionId, poll: true },
  );
  const action = useApiMutation("studioAction");
  const finish = useApiMutation("studioFinish");
  const cancel = useApiMutation("stopRuntime");
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
  const runningReplicas = [...data.actions].reverse().find(
    (item) => item.service === target && item.status === "CONFIRMED",
  )?.result?.replicasAfter;
  const busy =
    action.isPending ||
    finish.isPending ||
    cancel.isPending ||
    waiting ||
    data.finishRequested ||
    data.executionStatus !== "RUNNING";
  async function send(kind: "START" | "STOP" | "SCALE") {
    const previous = pending.current;
    const command =
      previous &&
      previous.action === kind &&
      previous.service === target &&
      previous.replicas === (kind === "SCALE" ? replicas : undefined)
        ? previous
        : {
            actionId: crypto.randomUUID(),
            action: kind,
            service: target,
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
    <section className="space-y-3 rounded-lg border p-4" aria-label="MAVIS Studio">
      <h3 className="font-medium">MAVIS Studio</h3>
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
      {action.isError && <ErrorState error={action.error} />}
      {finish.isError && <ErrorState error={finish.error} />}
      {cancel.isError && <ErrorState error={cancel.error} />}
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
              {item.result && item.result.metricsAfter["requestCount"] === undefined && (
                <p className="text-sm text-muted-foreground">
                  {t("Request metrics require a replayable GET/HEAD workload.")}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2)).toString()
    : "—";
}
