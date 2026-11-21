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
type ChangeAction = {
  action: "STOP" | "START" | "SCALE" | "PAUSE" | "RESUME" | "THROTTLE_CPU" | "SET_LOAD";
  service: string;
  replicas?: number | null;
  cpuPercent?: number | null;
  targetRps?: number | null;
};
type DeclarativeRule = {
  metric: "ERROR_RATE" | "EDGE_ERROR_RATE" | "P95_MS" | "P95_DELTA_PCT" | "REPLICAS" | "TRACE_EDGE" | "IMPACT_F1";
  target: string;
  operator: "LT" | "LTE" | "GT" | "GTE" | "EQ";
  threshold: number;
  label?: string | null;
};
type ExerciseTemplateKey =
  | "CHANGE_IMPACT"
  | "CASCADING_FAILURE"
  | "CIRCUIT_BREAKER"
  | "SCALE_UNDER_LOAD"
  | "CONFIG_REGRESSION"
  | "CUSTOM";

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
    exerciseType?: ExerciseTemplateKey | null;
    predictionRequired?: boolean | null;
    minImpactF1?: number | null;
    targetChangeAction?: ChangeAction | null;
    rules?: DeclarativeRule[] | null;
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
  exerciseType: ExerciseTemplateKey;
  predictionRequired: boolean;
  minImpactF1: string;
  changeActionKind: "" | ChangeAction["action"];
  changeActionService: string;
  changeActionValue: string;
  rules: DeclarativeRule[];
  instructions: string;
};

const ACTIONS = [
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

const RULE_METRICS: ReadonlyArray<{ value: DeclarativeRule["metric"]; label: string }> = [
  { value: "ERROR_RATE", label: "Error Rate (%)" },
  { value: "EDGE_ERROR_RATE", label: "Edge Error (%)" },
  { value: "P95_MS", label: "p95 Latency (ms)" },
  { value: "P95_DELTA_PCT", label: "p95 Delta (%)" },
  { value: "REPLICAS", label: "Replicas" },
  { value: "IMPACT_F1", label: "Change Impact F1" },
];

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
  exerciseType: "CUSTOM",
  predictionRequired: false,
  minImpactF1: "0.7",
  changeActionKind: "",
  changeActionService: "",
  changeActionValue: "",
  rules: [],
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
    const change = current.successCriteria?.targetChangeAction;
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
      exerciseType: current.successCriteria?.exerciseType ?? "CUSTOM",
      predictionRequired: Boolean(current.successCriteria?.predictionRequired),
      minImpactF1:
        current.successCriteria?.minImpactF1 == null
          ? "0.7"
          : String(current.successCriteria.minImpactF1),
      changeActionKind: change?.action ?? "",
      changeActionService: change?.service ?? "",
      changeActionValue:
        change?.replicas != null
          ? String(change.replicas)
          : change?.cpuPercent != null
            ? String(change.cpuPercent)
            : change?.targetRps != null
              ? String(change.targetRps)
              : "",
      rules: current.successCriteria?.rules ?? [],
      instructions: current.instructions ?? "",
    });
  }, [exercise.data, referenceSource?.modelId, defaultModelId]);

  const applyTemplate = (template: ExerciseTemplateKey) => {
    const nonControllers = applications.filter((app) => app !== "orders-payment-route");
    const primary = applications.includes("api-gateway")
      ? "api-gateway"
      : applications.includes("orders")
        ? "orders"
        : nonControllers[0] ?? applications[0] ?? "order-service";
    const middle = applications.includes("order-service")
      ? "order-service"
      : nonControllers.find((app) => app !== primary) ?? primary;
    const leaf = applications.includes("payment-service")
      ? "payment-service"
      : applications.includes("payment")
        ? "payment"
        : nonControllers[nonControllers.length - 1] ?? middle;
    const baselinePath = primary === "api-gateway"
      ? "/api/gateway/orders"
      : primary === "orders"
        ? "/orders"
        : "/health";

    setSavedNotice(false);
    setExtraReplicas([]);

    if (template === "CHANGE_IMPACT") {
      setForm((current) => ({
        ...current,
        exerciseType: "CHANGE_IMPACT",
        baselineRequests: [{ method: "GET", path: baselinePath, expectedStatus: 200 }],
        stoppedServices: [],
        stoppedControllers: "",
        allowedActions: ["PAUSE", "RESUME", "STOP", "START", "SET_LOAD"],
        maxErrorRatePercent: "",
        maxP95Ms: "",
        traceFrom: "",
        traceTo: "",
        replicaService: "",
        replicaCount: "",
        predictionRequired: true,
        minImpactF1: "0.7",
        changeActionKind: "PAUSE",
        changeActionService: leaf,
        changeActionValue: "",
        rules: [
          {
            metric: "IMPACT_F1",
            target: "PREDICTION",
            operator: "GTE",
            threshold: 0.7,
            label: "Change Impact F1 >= 0.70",
          },
        ],
        instructions: t(
          `Inspect the live service map, predict every service that will degrade when ${leaf} freezes, lock your prediction, then execute PAUSE on ${leaf} and observe real RED/edge propagation.`,
          `Quan sát sơ đồ service sống, dự đoán các service sẽ bị ảnh hưởng khi ${leaf} bị treo, khóa dự đoán, sau đó thực thi PAUSE lên ${leaf} và đối chiếu F1 tự động.`,
        ),
      }));
      return;
    }

    if (template === "CASCADING_FAILURE") {
      setForm((current) => ({
        ...current,
        exerciseType: "CASCADING_FAILURE",
        baselineRequests: [{ method: "GET", path: baselinePath, expectedStatus: 200 }],
        stoppedServices: [],
        stoppedControllers: "",
        allowedActions: ["PAUSE", "RESUME", "STOP", "START"],
        maxErrorRatePercent: "",
        maxP95Ms: "",
        traceFrom: "",
        traceTo: "",
        replicaService: "",
        replicaCount: "",
        predictionRequired: true,
        minImpactF1: "0.7",
        changeActionKind: "STOP",
        changeActionService: leaf,
        changeActionValue: "",
        rules: [
          {
            metric: "EDGE_ERROR_RATE",
            target: `${middle}->${leaf}`,
            operator: "GT",
            threshold: 50,
            label: `Edge ${middle}→${leaf} error > 50%`,
          },
          {
            metric: "IMPACT_F1",
            target: "PREDICTION",
            operator: "GTE",
            threshold: 0.7,
            label: "Cascading Impact F1 >= 0.70",
          },
        ],
        instructions: t(
          `Predict the cascading failure blast radius when ${leaf} stops, lock prediction, trigger STOP on ${leaf}, capture Before/After evidence, then restore it.`,
          `Dự đoán bán kính lan truyền lỗi khi ${leaf} dừng, khóa dự đoán, dừng ${leaf}, chụp Before/After rồi khôi phục.`,
        ),
      }));
      return;
    }

    if (template === "SCALE_UNDER_LOAD") {
      setForm((current) => ({
        ...current,
        exerciseType: "SCALE_UNDER_LOAD",
        baselineRequests: [{ method: "GET", path: baselinePath, expectedStatus: 200 }],
        stoppedServices: [],
        stoppedControllers: "",
        allowedActions: ["SET_LOAD", "SCALE", "START", "STOP"],
        maxErrorRatePercent: "5",
        maxP95Ms: "500",
        traceFrom: "",
        traceTo: "",
        replicaService: middle,
        replicaCount: "2",
        predictionRequired: false,
        minImpactF1: "0.7",
        changeActionKind: "SET_LOAD",
        changeActionService: primary,
        changeActionValue: "30",
        rules: [
          {
            metric: "P95_DELTA_PCT",
            target: "ALL",
            operator: "LTE",
            threshold: -15,
            label: "p95 latency improves by >= 15% after scaling",
          },
        ],
        instructions: t(
          `Raise live probe load to 30 RPS, observe p95 latency rise on ${middle}, then SCALE ${middle} to >= 2 replicas so error rate stays <= 5% and p95 drops.`,
          `Tăng tải probe lên 30 RPS, quan sát p95 tăng trên ${middle}, sau đó SCALE ${middle} lên >= 2 replicas để lỗi <= 5% và p95 giảm.`,
        ),
      }));
      return;
    }

    if (template === "CONFIG_REGRESSION") {
      setForm((current) => ({
        ...current,
        exerciseType: "CONFIG_REGRESSION",
        baselineRequests: [{ method: "GET", path: baselinePath, expectedStatus: 200 }],
        stoppedServices: [],
        stoppedControllers: "",
        allowedActions: ["THROTTLE_CPU", "SCALE", "SET_LOAD"],
        maxErrorRatePercent: "5",
        maxP95Ms: "800",
        traceFrom: "",
        traceTo: "",
        replicaService: "",
        replicaCount: "",
        predictionRequired: true,
        minImpactF1: "0.7",
        changeActionKind: "THROTTLE_CPU",
        changeActionService: middle,
        changeActionValue: "25",
        rules: [
          {
            metric: "P95_MS",
            target: middle,
            operator: "LT",
            threshold: 800,
            label: `p95(${middle}) < 800ms after recovery`,
          },
        ],
        instructions: t(
          `Predict which upstream callers slow down when ${middle} is throttled to 25% CPU, apply THROTTLE_CPU 25%, measure real p95 latency regression, then restore CPU to 100% or scale out.`,
          `Dự đoán service chậm theo khi giới hạn CPU ${middle} xuống 25%, áp dụng THROTTLE_CPU 25%, đo độ trễ p95 rồi khôi phục 100% hoặc scale.`,
        ),
      }));
      return;
    }

    // Default / CIRCUIT_BREAKER recovery template
    const controller = applications.includes("orders-payment-route") ? "orders-payment-route" : "";
    setForm((current) => ({
      ...current,
      exerciseType: "CIRCUIT_BREAKER",
      baselineRequests: [{ method: "GET", path: baselinePath, expectedStatus: 200 }],
      stoppedServices: leaf && leaf !== primary ? [leaf] : [],
      stoppedControllers: controller,
      allowedActions: [...ACTIONS],
      maxErrorRatePercent: "0",
      maxP95Ms: "2500",
      traceFrom: primary,
      traceTo: leaf === primary ? "" : leaf,
      replicaService: middle,
      replicaCount: "2",
      predictionRequired: false,
      minImpactF1: "0.7",
      changeActionKind: "",
      changeActionService: "",
      changeActionValue: "",
      rules: [],
      instructions: t(
        `The stack starts with ${leaf}${controller ? ` and ${controller}` : ""} stopped. (1) START ${leaf} to restore 0% error rate, (2) SCALE ${middle} to at least 2 replicas, capture Before/After snapshots, and click Finish Studio to seal the RuntimeReceipt.`,
        `Hệ thống bắt đầu với ${leaf}${controller ? ` và ${controller}` : ""} đang dừng. (1) Bật (START) ${leaf} về 0% lỗi, (2) Scale ${middle} lên tối thiểu 2 replicas, chụp Snapshot và nhấn Finish Studio.`,
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
      const numericChangeVal = form.changeActionValue ? Number(form.changeActionValue) : null;
      const targetChangeAction =
        form.changeActionKind && form.changeActionService.trim()
          ? {
              action: form.changeActionKind,
              service: form.changeActionService.trim(),
              replicas: form.changeActionKind === "SCALE" ? (numericChangeVal ?? 2) : null,
              cpuPercent: form.changeActionKind === "THROTTLE_CPU" ? (numericChangeVal ?? 25) : null,
              targetRps: form.changeActionKind === "SET_LOAD" ? (numericChangeVal ?? 25) : null,
            }
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
              exerciseType: form.exerciseType,
              predictionRequired: form.predictionRequired,
              minImpactF1: form.predictionRequired && form.minImpactF1 ? Number(form.minImpactF1) : null,
              targetChangeAction,
              rules: form.rules.map((rule) => ({
                metric: rule.metric,
                target: rule.target.trim() || "ALL",
                operator: rule.operator,
                threshold: Number(rule.threshold),
                label: rule.label?.trim() || null,
              })),
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
      {/* Compact Repo + C4 Exercise Template Library Strip */}
      <div className="space-y-2.5 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("1-Click Exercise Templates", "Thư viện mẫu bài tập")}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "CHANGE_IMPACT", label: t("Change Impact (Auto-Graded)", "Change Impact (Tự chấm)") },
              { id: "CASCADING_FAILURE", label: t("Cascading Failure", "Lỗi lan truyền") },
              { id: "CIRCUIT_BREAKER", label: t("Recovery / Circuit Breaker", "Phục hồi / Circuit Breaker") },
              { id: "SCALE_UNDER_LOAD", label: t("Scale-Out under Load", "Scale dưới tải cao") },
              { id: "CONFIG_REGRESSION", label: t("CPU Degradation", "Suy giảm CPU") },
            ] as const
          ).map((tpl) => {
            const active = form.exerciseType === tpl.id;
            return (
              <Button
                key={tpl.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => applyTemplate(tpl.id)}
                className="h-7 gap-1 px-2.5 text-[11px]"
              >
                <Zap className="size-3 text-amber-400" aria-hidden="true" />
                {tpl.label}
              </Button>
            );
          })}
        </div>
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

      {/* 3b. C2 Change Impact & C3 Declarative Pass Rules */}
      <section className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Change Impact & Declarative Rules", "Change Impact & Tiêu chí khai báo")}
          </p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={form.predictionRequired}
              onChange={(event) =>
                setForm({ ...form, predictionRequired: event.target.checked })
              }
              className="size-3.5 accent-primary"
            />
            {t("Require student prediction before change", "Bắt buộc sinh viên dự đoán trước khi đổi")}
          </label>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-4">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Prescribed change", "Thao tác đề bài")}</span>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              value={form.changeActionKind}
              onChange={(event) =>
                setForm({
                  ...form,
                  changeActionKind: event.target.value as Form["changeActionKind"],
                })
              }
            >
              <option value="">{t("None", "Không cố định")}</option>
              <option value="PAUSE">PAUSE</option>
              <option value="STOP">STOP</option>
              <option value="THROTTLE_CPU">THROTTLE_CPU</option>
              <option value="SET_LOAD">SET_LOAD</option>
              <option value="SCALE">SCALE</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Target service", "Service mục tiêu")}</span>
            {allServices.length > 0 ? (
              <select
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={form.changeActionService}
                onChange={(event) => setForm({ ...form, changeActionService: event.target.value })}
              >
                <option value="">—</option>
                {allServices.map((svc) => (
                  <option key={svc} value={svc}>
                    {svc}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                className="h-8 font-mono text-xs"
                value={form.changeActionService}
                placeholder="payment-service"
                onChange={(event) => setForm({ ...form, changeActionService: event.target.value })}
              />
            )}
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>
              {form.changeActionKind === "THROTTLE_CPU"
                ? "CPU (%)"
                : form.changeActionKind === "SET_LOAD"
                  ? "Target RPS"
                  : form.changeActionKind === "SCALE"
                    ? "Replicas"
                    : t("Action param", "Tham số")}
            </span>
            <Input
              className="h-8 font-mono text-xs"
              type="number"
              disabled={!["THROTTLE_CPU", "SET_LOAD", "SCALE"].includes(form.changeActionKind)}
              value={form.changeActionValue}
              placeholder="25"
              onChange={(event) => setForm({ ...form, changeActionValue: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("Min Impact F1 (0–1)", "F1 tối thiểu (0–1)")}</span>
            <Input
              className="h-8 font-mono text-xs"
              type="number"
              step="0.05"
              min={0}
              max={1}
              disabled={!form.predictionRequired}
              value={form.minImpactF1}
              onChange={(event) => setForm({ ...form, minImpactF1: event.target.value })}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("Declarative auto-grade rules", "Điều kiện tự chấm dạng khai báo")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={form.rules.length >= 12}
              onClick={() =>
                setForm({
                  ...form,
                  rules: [
                    ...form.rules,
                    { metric: "P95_MS", target: allServices[0] ?? "ALL", operator: "LT", threshold: 300 },
                  ],
                })
              }
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-1 size-3" aria-hidden="true" />
              {t("Add rule", "Thêm điều kiện")}
            </Button>
          </div>
          {form.rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-[1.2fr_1.1fr_0.6fr_0.7fr_auto] items-center gap-1.5">
              <select
                aria-label="Rule metric"
                className="h-8 rounded-md border border-border bg-background px-1.5 font-mono text-[11px] text-foreground"
                value={rule.metric}
                onChange={(event) => {
                  const next = [...form.rules];
                  next[idx] = { ...rule, metric: event.target.value as DeclarativeRule["metric"] };
                  setForm({ ...form, rules: next });
                }}
              >
                {RULE_METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Input
                className="h-8 font-mono text-[11px]"
                value={rule.target}
                placeholder="ALL or svcA->svcB"
                onChange={(event) => {
                  const next = [...form.rules];
                  next[idx] = { ...rule, target: event.target.value };
                  setForm({ ...form, rules: next });
                }}
              />
              <select
                aria-label="Rule operator"
                className="h-8 rounded-md border border-border bg-background px-1.5 font-mono text-[11px] text-foreground"
                value={rule.operator}
                onChange={(event) => {
                  const next = [...form.rules];
                  next[idx] = { ...rule, operator: event.target.value as DeclarativeRule["operator"] };
                  setForm({ ...form, rules: next });
                }}
              >
                <option value="LT">&lt;</option>
                <option value="LTE">&lt;=</option>
                <option value="GT">&gt;</option>
                <option value="GTE">&gt;=</option>
                <option value="EQ">=</option>
              </select>
              <Input
                className="h-8 font-mono text-[11px]"
                type="number"
                step="any"
                value={Number.isFinite(rule.threshold) ? String(rule.threshold) : ""}
                onChange={(event) => {
                  const next = [...form.rules];
                  next[idx] = { ...rule, threshold: Number(event.target.value || 0) };
                  setForm({ ...form, rules: next });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remove rule"
                className="size-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setForm({
                    ...form,
                    rules: form.rules.filter((_, i) => i !== idx),
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
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
