"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";

type BaselineRequest = { method: "GET" | "HEAD"; path: string; expectedStatus: number | null };
type TraceEdge = { from: string; to: string };
type ReplicaTarget = { service: string; count: number };

type ExerciseView = {
  runtimeProjectId: string | null;
  runtimeModelId: string | null;
  runtimeSnapshotId: string | null;
  baselineRequests: BaselineRequest[];
  initialState: { stoppedServices: string[]; stoppedControllers: string[] };
  allowedActions: string[];
  successCriteria: {
    maxErrorRatePercent: number | null;
    maxP95Ms: number | null;
    requiredTraceEdge: TraceEdge | null;
    minReplicas: ReplicaTarget[];
  };
  instructions: string;
  revision: number;
  updatedAt: string;
};

type Form = {
  runtimeModelId: string;
  baselineRequests: BaselineRequest[];
  stoppedServices: string[];
  stoppedControllers: string;
  allowedActions: string[];
  maxErrorRatePercent: string;
  maxP95Ms: string;
  traceFrom: string;
  traceTo: string;
  replicaService: string;
  replicaCount: string;
  instructions: string;
};

const ACTIONS = ["START", "STOP", "SCALE", "CONNECT", "DISCONNECT"] as const;

const EMPTY: Form = {
  runtimeModelId: "",
  baselineRequests: [{ method: "GET", path: "/", expectedStatus: null }],
  stoppedServices: [],
  stoppedControllers: "",
  allowedActions: [...ACTIONS],
  maxErrorRatePercent: "0",
  maxP95Ms: "",
  traceFrom: "",
  traceTo: "",
  replicaService: "",
  replicaCount: "",
  instructions: "",
};

export function StudioExerciseEditor({
  workspaceId,
  assignmentId,
  applications,
}: {
  workspaceId: string;
  assignmentId: string;
  applications: string[];
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const versions = useApiQuery("referenceVersions", { workspaceId });
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      api<ExerciseView | null>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
        { signal },
      ),
    retry: false,
  });

  useEffect(() => {
    const current = exercise.data;
    if (!current) {
      setForm(EMPTY);
      return;
    }
    const replica = current.successCriteria?.minReplicas?.[0];
    setForm({
      runtimeModelId: current.runtimeModelId ?? "",
      baselineRequests:
        current.baselineRequests?.length ? current.baselineRequests : EMPTY.baselineRequests,
      stoppedServices: current.initialState?.stoppedServices ?? [],
      stoppedControllers: (current.initialState?.stoppedControllers ?? []).join(", "),
      allowedActions: current.allowedActions?.length ? current.allowedActions : [...ACTIONS],
      maxErrorRatePercent:
        current.successCriteria?.maxErrorRatePercent == null
          ? ""
          : String(current.successCriteria.maxErrorRatePercent),
      maxP95Ms:
        current.successCriteria?.maxP95Ms == null ? "" : String(current.successCriteria.maxP95Ms),
      traceFrom: current.successCriteria?.requiredTraceEdge?.from ?? "",
      traceTo: current.successCriteria?.requiredTraceEdge?.to ?? "",
      replicaService: replica?.service ?? "",
      replicaCount: replica?.count == null ? "" : String(replica.count),
      instructions: current.instructions ?? "",
    });
  }, [exercise.data]);

  const selectedVersion = useMemo(
    () => (versions.data ?? []).find((version) => version.model.id === form.runtimeModelId),
    [versions.data, form.runtimeModelId],
  );

  const save = useMutation({
    mutationFn: () => {
      if (!selectedVersion) {
        throw new Error(t("Choose the deployable Studio repository.", "Hãy chọn repo Studio có thể deploy."));
      }
      const edge =
        form.traceFrom.trim() && form.traceTo.trim()
          ? { from: form.traceFrom.trim(), to: form.traceTo.trim() }
          : null;
      const replica =
        form.replicaService.trim() && form.replicaCount
          ? { service: form.replicaService.trim(), count: Number(form.replicaCount) }
          : null;
      return api<ExerciseView>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
        {
          method: "PUT",
          body: JSON.stringify({
            runtimeProjectId: selectedVersion.model.projectId,
            runtimeModelId: selectedVersion.model.id,
            runtimeSnapshotId: selectedVersion.snapshot.id,
            baselineRequests: form.baselineRequests.map((request) => ({
              method: request.method,
              path: request.path.trim(),
              expectedStatus: request.expectedStatus,
            })),
            initialState: {
              stoppedServices: form.stoppedServices,
              stoppedControllers: form.stoppedControllers
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            },
            allowedActions: form.allowedActions,
            successCriteria: {
              maxErrorRatePercent: form.maxErrorRatePercent ? Number(form.maxErrorRatePercent) : null,
              maxP95Ms: form.maxP95Ms ? Number(form.maxP95Ms) : null,
              requiredTraceEdge: edge,
              minReplicas: replica ? [replica] : [],
            },
            instructions: form.instructions.trim(),
          }),
        },
      );
    },
    onSuccess: () => {
      setError("");
      void cache.invalidateQueries({
        queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
      });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });

  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4 text-primary" aria-hidden="true" />
        {t("Studio exercise (teacher)", "Đề Studio (giảng viên)")}
        {exercise.data && <Badge variant="outline">rev {exercise.data.revision}</Badge>}
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-xs leading-5 text-muted-foreground">
          {t(
            "The Studio repository must build and run with Docker. Students only start/stop/scale services and connect/disconnect prepared wires; no code editing and no synthetic latency.",
            "Repo Studio phải build và chạy được bằng Docker. Sinh viên chỉ start/stop/scale service và connect/disconnect dây đã chuẩn bị; không sửa code, không latency giả.",
          )}
        </p>

        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Deployable Studio repository", "Repo Studio có thể deploy")}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={form.runtimeModelId}
            onChange={(event) => setForm({ ...form, runtimeModelId: event.target.value })}
          >
            <option value="">{t("Choose an analyzed repository…", "Chọn repo đã phân tích…")}</option>
            {(versions.data ?? []).map((version) => (
              <option key={version.model.id} value={version.model.id}>
                r{version.model.revision} · {version.model.projectId.slice(0, 8)} ·{" "}
                {version.snapshot.sourceType}
              </option>
            ))}
          </select>
        </label>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Baseline workload", "Workload nền")}
          </p>
          {form.baselineRequests.map((request, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={request.method}
                onChange={(event) => {
                  const next = [...form.baselineRequests];
                  next[index] = { ...request, method: event.target.value as "GET" | "HEAD" };
                  setForm({ ...form, baselineRequests: next });
                }}
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
              </select>
              <Input
                className="h-9 min-w-48 flex-1"
                value={request.path}
                placeholder="/api/orders"
                onChange={(event) => {
                  const next = [...form.baselineRequests];
                  next[index] = { ...request, path: event.target.value };
                  setForm({ ...form, baselineRequests: next });
                }}
              />
              <Input
                className="h-9 w-24"
                type="number"
                value={request.expectedStatus ?? ""}
                placeholder="200"
                onChange={(event) => {
                  const next = [...form.baselineRequests];
                  next[index] = {
                    ...request,
                    expectedStatus: event.target.value ? Number(event.target.value) : null,
                  };
                  setForm({ ...form, baselineRequests: next });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t("Remove request", "Xoá request")}
                onClick={() =>
                  setForm({
                    ...form,
                    baselineRequests: form.baselineRequests.filter((_, position) => position !== index),
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={form.baselineRequests.length >= 10}
            onClick={() =>
              setForm({
                ...form,
                baselineRequests: [
                  ...form.baselineRequests,
                  { method: "GET", path: "/", expectedStatus: null },
                ],
              })
            }
          >
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {t("Add request", "Thêm request")}
          </Button>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Stopped at start", "Dừng sẵn khi bắt đầu")}
            </p>
            {applications.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Prepare the runtime profile first.", "Hãy chuẩn bị runtime profile trước.")}
              </p>
            ) : (
              <ul className="space-y-1">
                {applications.map((service) => (
                  <li key={service}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={form.stoppedServices.includes(service)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            stoppedServices: event.target.checked
                              ? [...form.stoppedServices, service]
                              : form.stoppedServices.filter((value) => value !== service),
                          })
                        }
                      />
                      {service}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="block space-y-1 text-xs font-medium">
              <span>{t("Stopped controllers", "Controller dừng sẵn")}</span>
              <Input
                value={form.stoppedControllers}
                placeholder="orders-payment-route"
                onChange={(event) => setForm({ ...form, stoppedControllers: event.target.value })}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Allowed actions", "Hành động được phép")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {ACTIONS.map((action) => (
                <label key={action} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={form.allowedActions.includes(action)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        allowedActions: event.target.checked
                          ? [...form.allowedActions, action]
                          : form.allowedActions.filter((value) => value !== action),
                      })
                    }
                  />
                  {action}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Max error rate (%)", "Tỉ lệ lỗi tối đa (%)")}</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.maxErrorRatePercent}
              onChange={(event) => setForm({ ...form, maxErrorRatePercent: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Max p95 (ms)", "p95 tối đa (ms)")}</span>
            <Input
              type="number"
              min={0}
              max={60000}
              value={form.maxP95Ms}
              onChange={(event) => setForm({ ...form, maxP95Ms: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium">
              <span>{t("Trace from", "Trace từ")}</span>
              <Input
                value={form.traceFrom}
                placeholder="orders"
                onChange={(event) => setForm({ ...form, traceFrom: event.target.value })}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t("Trace to", "Trace đến")}</span>
              <Input
                value={form.traceTo}
                placeholder="payment"
                onChange={(event) => setForm({ ...form, traceTo: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Replica service", "Service cần scale")}</span>
            <Input
              value={form.replicaService}
              placeholder="orders"
              onChange={(event) => setForm({ ...form, replicaService: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t("Minimum replicas", "Số replica tối thiểu")}</span>
            <Input
              type="number"
              min={1}
              max={8}
              value={form.replicaCount}
              onChange={(event) => setForm({ ...form, replicaCount: event.target.value })}
            />
          </label>
        </section>

        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Student instructions", "Hướng dẫn sinh viên")}</span>
          <Textarea
            rows={4}
            value={form.instructions}
            placeholder={t(
              "Explain the initial fault and what the student must prove.",
              "Mô tả lỗi ban đầu và điều sinh viên phải chứng minh.",
            )}
            onChange={(event) => setForm({ ...form, instructions: event.target.value })}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("Saving…", "Đang lưu…") : t("Save exercise", "Lưu đề")}
          </Button>
          {exercise.data && (
            <span className="text-xs text-muted-foreground">
              {t("Revision", "Bản")} {exercise.data.revision}
            </span>
          )}
          {error && (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
