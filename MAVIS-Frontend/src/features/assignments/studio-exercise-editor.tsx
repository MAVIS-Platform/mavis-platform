"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Assignment } from "./requirements";

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
  labTitle: _labTitle,
  applications,
  defaultModelId,
  referenceSource,
  onSaved,
}: {
  workspaceId: string;
  assignmentId: string;
  labTitle: string;
  applications: string[];
  defaultModelId?: string | undefined;
  referenceSource?: Assignment["referenceSource"] | undefined;
  onSaved?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [extraReplicas, setExtraReplicas] = useState<ReplicaTarget[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState("");
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
      setExtraReplicas([]);
      setForm((prev) => ({
        ...EMPTY,
        runtimeModelId: prev.runtimeModelId || referenceSource?.modelId || defaultModelId || "",
      }));
      return;
    }
    const replica = current.successCriteria?.minReplicas?.[0];
    setExtraReplicas(current.successCriteria?.minReplicas?.slice(1) ?? []);
    setForm({
      runtimeModelId: referenceSource?.modelId ?? current.runtimeModelId ?? defaultModelId ?? "",
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
  }, [exercise.data, referenceSource?.modelId, defaultModelId]);

  const applyPreset = () => {
    const hasCommerce =
      applications.includes("api-gateway") || applications.includes("order-service");
    const hasOrdersDemo =
      applications.includes("orders") ||
      applications.includes("payment") ||
      applications.includes("orders-payment-route");
    setSavedNotice(false);
    setExtraReplicas([]);
    if (hasCommerce && !hasOrdersDemo) {
      const targetScale = applications.includes("order-service")
        ? "order-service"
        : applications[0] ?? "api-gateway";
      const stopTarget = applications.includes("payment-service")
        ? ["payment-service"]
        : applications.length > 1
          ? [applications[applications.length - 1]!]
          : [];
      setForm((current) => ({
        ...current,
        baselineRequests: [{ method: "GET", path: "/api/gateway/orders", expectedStatus: 200 }],
        stoppedServices: stopTarget,
        stoppedControllers: "",
        allowedActions: [...ACTIONS],
        maxErrorRatePercent: "0",
        maxP95Ms: "2500",
        traceFrom: "api-gateway",
        traceTo: targetScale === "api-gateway" ? "" : targetScale,
        replicaService: targetScale,
        replicaCount: "2",
        instructions: t(
          `The stack starts with ${stopTarget.join(", ") || "a downstream service"} stopped. (1) START stopped services so GET /api/gateway/orders succeeds with 0% errors, (2) SCALE ${targetScale} to 2 replicas, capture Before/After snapshots, and click Finish Studio to seal the RuntimeReceipt.`,
          `Hệ thống bắt đầu với ${stopTarget.join(", ") || "dịch vụ phụ"} đang dừng. (1) Bật (START) service để GET /api/gateway/orders đạt 0% lỗi, (2) Nhân bản (SCALE) ${targetScale} lên 2 replicas, chụp Snapshot và nhấn Finish Studio để ký RuntimeReceipt.`,
        ),
      }));
      return;
    }
    const nonControllers = applications.filter((app) => app !== "orders-payment-route");
    const primary = applications.includes("orders")
      ? "orders"
      : nonControllers[0] ?? applications[0] ?? "orders";
    const secondary = applications.includes("payment")
      ? "payment"
      : nonControllers.find((app) => app !== primary) ?? (hasOrdersDemo ? "payment" : "");
    const controller = applications.includes("orders-payment-route")
      ? "orders-payment-route"
      : "";
    setForm((current) => ({
      ...current,
      baselineRequests: [
        { method: "GET", path: primary === "orders" ? "/orders" : "/health", expectedStatus: 200 },
      ],
      stoppedServices: secondary ? [secondary] : [],
      stoppedControllers: controller,
      allowedActions: [...ACTIONS],
      maxErrorRatePercent: "0",
      maxP95Ms: "2500",
      traceFrom: primary,
      traceTo: secondary,
      replicaService: primary,
      replicaCount: "2",
      instructions: t(
        `The stack starts with ${secondary || primary}${controller ? ` and ${controller}` : ""} stopped. (1) START ${secondary || primary}${controller ? ` & connect ${controller}` : ""} to restore 0% error rate, (2) SCALE ${primary} to at least 2 replicas, capture Before/After snapshots, and click Finish Studio to seal the RuntimeReceipt.`,
        `Hệ thống bắt đầu với ${secondary || primary}${controller ? ` và ${controller}` : ""} đang dừng. (1) Bật (START) ${secondary || primary}${controller ? ` và nối ${controller}` : ""} về 0% lỗi, (2) Scale ${primary} lên tối thiểu 2 replicas, chụp Snapshot và nhấn Finish Studio.`,
      ),
    }));
  };

  const save = useMutation({
    mutationFn: () => {
      const source =
        referenceSource?.modelId && referenceSource.projectId && referenceSource.snapshotId
          ? {
              modelId: referenceSource.modelId,
              projectId: referenceSource.projectId,
              snapshotId: referenceSource.snapshotId,
            }
          : exercise.data?.runtimeModelId &&
              exercise.data.runtimeProjectId &&
              exercise.data.runtimeSnapshotId
            ? {
                modelId: exercise.data.runtimeModelId,
                projectId: exercise.data.runtimeProjectId,
                snapshotId: exercise.data.runtimeSnapshotId,
              }
            : null;
      if (!source) {
        throw new Error(
          t(
            "Pin the Lab Reference Repository in Step 2 before saving the Studio exercise.",
            "Hãy gắn Repo tham chiếu ở Bước 2 trước khi lưu đề Studio.",
          ),
        );
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
            runtimeProjectId: source.projectId,
            runtimeModelId: source.modelId,
            runtimeSnapshotId: source.snapshotId,
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
              minReplicas: [...(replica ? [replica] : []), ...extraReplicas],
            },
            instructions: form.instructions.trim(),
          }),
        },
      );
    },
    onMutate: () => setSavedNotice(false),
    onSuccess: () => {
      setError("");
      setSavedNotice(true);
      void cache.invalidateQueries({
        queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
      });
      onSaved?.();
    },
    onError: (cause) => {
      setSavedNotice(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    },
  });

  const allServices = Array.from(new Set([...applications, ...form.stoppedServices]));
  const hasAdvancedConstraints = Boolean(
    form.stoppedControllers.trim() || form.traceFrom.trim() || form.traceTo.trim(),
  );

  return (
    <div className="space-y-5">
      {/* Compact Repo + Preset Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <GitBranch className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          <span className="truncate font-mono font-medium text-foreground">
            {referenceSource?.projectName
              ? referenceSource.projectName
              : form.runtimeModelId
                ? `model ${form.runtimeModelId.slice(0, 8)}`
                : t("No repository linked", "Chưa gắn repo")}
          </span>
          {exercise.data && (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              rev {exercise.data.revision}
            </span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={applyPreset}
          className="h-7 gap-1 px-2.5 text-xs"
        >
          <Zap className="size-3 text-amber-400" aria-hidden="true" />
          {t("Auto-fill preset", "Điền nhanh mẫu")}
        </Button>
      </div>

      {/* 1. Baseline Probe Endpoints */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Baseline workload", "Workload nền")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={form.baselineRequests.length >= 10}
            onClick={() =>
              setForm({
                ...form,
                baselineRequests: [
                  ...form.baselineRequests,
                  { method: "GET", path: "/", expectedStatus: 200 },
                ],
              })
            }
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="mr-1 size-3" aria-hidden="true" />
            {t("Add endpoint", "Thêm endpoint")}
          </Button>
        </div>
        <div className="space-y-1.5">
          {form.baselineRequests.map((request, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <select
                aria-label={t("HTTP method", "Phương thức HTTP")}
                className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
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
                className="h-8 min-w-0 flex-1 font-mono text-xs"
                value={request.path}
                placeholder="/api/orders"
                onChange={(event) => {
                  const next = [...form.baselineRequests];
                  next[index] = { ...request, path: event.target.value };
                  setForm({ ...form, baselineRequests: next });
                }}
              />
              <Input
                className="h-8 w-20 font-mono text-xs"
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
                className="size-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
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
        </div>
      </section>

      {/* 2. Initial Stopped Services & Allowed Actions (Toggle Pills) */}
      <section className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Stopped at start", "Dừng sẵn khi bắt đầu")}
          </p>
          {allServices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Prepare the runtime profile first.", "Hãy chuẩn bị runtime profile trước.")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allServices.map((service) => {
                const stopped = form.stoppedServices.includes(service);
                return (
                  <button
                    key={service}
                    type="button"
                    aria-pressed={stopped}
                    onClick={() =>
                      setForm({
                        ...form,
                        stoppedServices: stopped
                          ? form.stoppedServices.filter((value) => value !== service)
                          : [...form.stoppedServices, service],
                      })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                      stopped
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-200"
                        : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${stopped ? "bg-amber-400" : "bg-muted-foreground/40"}`}
                    />
                    {service}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Allowed actions", "Hành động được phép")}
            </p>
            <span className="text-[10px] text-muted-foreground/80">
              {t("Docker only · no code editing", "Chỉ Docker · không sửa code")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((action) => {
              const allowed = form.allowedActions.includes(action);
              return (
                <button
                  key={action}
                  type="button"
                  aria-pressed={allowed}
                  onClick={() =>
                    setForm({
                      ...form,
                      allowedActions: allowed
                        ? form.allowedActions.filter((value) => value !== action)
                        : [...form.allowedActions, action],
                    })
                  }
                  className={`rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                    allowed
                      ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-200"
                      : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {action}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Pass Criteria (Symmetrical 2x2 Grid) */}
      <section className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Pass criteria", "Tiêu chí đạt")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Max error rate (%)", "Tỉ lệ lỗi tối đa (%)")}</span>
            <Input
              className="h-8 font-mono text-xs"
              type="number"
              min={0}
              max={100}
              placeholder="0"
              value={form.maxErrorRatePercent}
              onChange={(event) => setForm({ ...form, maxErrorRatePercent: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Max p95 (ms)", "p95 tối đa (ms)")}</span>
            <Input
              className="h-8 font-mono text-xs"
              type="number"
              min={0}
              max={60000}
              placeholder="—"
              value={form.maxP95Ms}
              onChange={(event) => setForm({ ...form, maxP95Ms: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Scale target service", "Service cần scale")}</span>
            {allServices.length > 0 ? (
              <select
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={form.replicaService}
                onChange={(event) => setForm({ ...form, replicaService: event.target.value })}
              >
                <option value="">{t("None", "Không yêu cầu")}</option>
                {Array.from(
                  new Set([
                    ...allServices,
                    ...(form.replicaService ? [form.replicaService] : []),
                  ]),
                ).map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                className="h-8 font-mono text-xs"
                value={form.replicaService}
                placeholder="order-service"
                onChange={(event) => setForm({ ...form, replicaService: event.target.value })}
              />
            )}
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Minimum replicas (1–8)", "Số replica tối thiểu (1–8)")}</span>
            <Input
              className="h-8 font-mono text-xs"
              type="number"
              min={1}
              max={8}
              placeholder="2"
              value={form.replicaCount}
              onChange={(event) => setForm({ ...form, replicaCount: event.target.value })}
            />
          </label>
        </div>
      </section>

      {/* 4. Student Instructions */}
      <label className="block space-y-1.5 border-t border-border/60 pt-4 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Student instructions", "Hướng dẫn sinh viên")}
        </span>
        <Textarea
          rows={3}
          className="text-xs leading-relaxed"
          value={form.instructions}
          placeholder={t(
            "Explain the initial fault and what the student must prove.",
            "Mô tả lỗi ban đầu và điều sinh viên phải chứng minh.",
          )}
          onChange={(event) => setForm({ ...form, instructions: event.target.value })}
        />
      </label>

      {/* 5. Optional Advanced Trace & Controller Constraints */}
      <details
        open={hasAdvancedConstraints}
        className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2"
      >
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
          {t("Advanced trace & route constraints", "Ràng buộc trace & controller nâng cao")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Required trace from", "Trace từ")}</span>
            <Input
              className="h-8 font-mono text-xs"
              value={form.traceFrom}
              placeholder="order-service"
              onChange={(event) => setForm({ ...form, traceFrom: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Required trace to", "Trace đến")}</span>
            <Input
              className="h-8 font-mono text-xs"
              value={form.traceTo}
              placeholder="payment-service"
              onChange={(event) => setForm({ ...form, traceTo: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Stopped controllers", "Controller dừng sẵn")}</span>
            <Input
              className="h-8 font-mono text-xs"
              value={form.stoppedControllers}
              placeholder="orders-payment-route"
              onChange={(event) => setForm({ ...form, stoppedControllers: event.target.value })}
            />
          </label>
        </div>
      </details>

      {/* Footer Save Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-2 text-xs">
          {savedNotice && (
            <span role="status" className="font-medium text-emerald-600 dark:text-emerald-300">
              {t("✓ Saved", "✓ Đã lưu đề Studio")}
            </span>
          )}
          {error && (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          )}
        </div>
        <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("Saving…", "Đang lưu…") : t("Save exercise", "Lưu đề")}
        </Button>
      </div>
    </div>
  );
}
