"use client";

import { useState } from "react";
import { CheckCircle2, Lock, Play, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;
type StudioActionKind = "START" | "STOP" | "SCALE" | "PAUSE" | "RESUME" | "THROTTLE_CPU" | "SET_LOAD";

type PrescribedChange = {
  action?: string;
  service?: string;
  replicas?: number | null;
  cpuPercent?: number | null;
  targetRps?: number | null;
};

/**
 * C2 Change Impact prediction lock + live Precision/Recall/F1 diff + C3 Declarative Pass Criteria checklist.
 */
export function StudioExercisePanel({
  data,
  services,
  busy,
  submittingPrediction,
  onLockPrediction,
  onRunPrescribedChange,
  isLight = false,
}: {
  data: Studio;
  services: readonly string[];
  busy: boolean;
  submittingPrediction: boolean;
  onLockPrediction: (predictedServices: string[], rationale: string) => Promise<void> | void;
  onRunPrescribedChange: (
    action: StudioActionKind,
    service: string,
    replicas?: number,
    cpuPercent?: number,
    targetRps?: number,
  ) => Promise<void> | void;
  isLight?: boolean | undefined;
}) {
  const { t } = useLocale();
  const [selectedPredicted, setSelectedPredicted] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");

  const evaluation = data.exerciseEvaluation;
  const prediction = data.prediction;
  const criteria = data.exerciseCriteria as
    | {
        exerciseType?: string;
        predictionRequired?: boolean;
        targetChangeAction?: PrescribedChange | null;
      }
    | null
    | undefined;

  const hasConfirmedAction = data.actions.some((a) => a.status === "CONFIRMED");
  const predictionLocked = Boolean(prediction?.predictedServices?.length);
  const predictionRequired = Boolean(evaluation?.predictionRequired || criteria?.predictionRequired);
  const prescribed = criteria?.targetChangeAction ?? null;
  const exerciseType = (criteria?.exerciseType ?? evaluation?.exerciseType ?? "").toUpperCase();
  const isOutageRecovery = exerciseType === "CIRCUIT_BREAKER";
  const prescribedCompleted = Boolean(
    prescribed?.action &&
      prescribed?.service &&
      data.actions.some(
        (a) =>
          a.status === "CONFIRMED" &&
          a.action.toUpperCase() === prescribed.action?.toUpperCase() &&
          a.service === prescribed.service,
      ),
  );
  const canLockPrediction =
    !busy &&
    !submittingPrediction &&
    !predictionLocked &&
    !hasConfirmedAction &&
    data.executionStatus === "RUNNING" &&
    selectedPredicted.length > 0;

  const toggleService = (svc: string) => {
    setSelectedPredicted((prev) =>
      prev.includes(svc) ? prev.filter((item) => item !== svc) : [...prev, svc],
    );
  };

  const runPrescribed = () => {
    if (!prescribed?.action || !prescribed?.service) return;
    const kind = prescribed.action.toUpperCase() as StudioActionKind;
    void onRunPrescribedChange(
      kind,
      prescribed.service,
      prescribed.replicas ?? undefined,
      prescribed.cpuPercent ?? undefined,
      prescribed.targetRps ?? undefined,
    );
  };

  return (
    <section
      aria-label={t("Studio Exercise", "Nhiệm vụ thực hành Studio")}
      className={`space-y-2.5 rounded-xl border p-3 text-xs ${
        isLight
          ? "border-indigo-200 bg-indigo-50/55 text-slate-900"
          : "border-indigo-500/30 bg-slate-900/75 text-slate-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            isLight ? "text-indigo-900" : "text-indigo-200"
          }`}
        >
          <Target className={`size-3.5 ${isLight ? "text-indigo-600" : "text-indigo-400"}`} aria-hidden="true" />
          {predictionRequired || predictionLocked
            ? t("Change Impact Prediction", "Dự đoán phạm vi ảnh hưởng")
            : t("Lab Exercise Action", "Thao tác bài thực hành")}
        </span>
      </div>

      {/* Step 1: Student Change Impact Prediction (auto-check grading is reserved exclusively for Lecturer grading) */}
      {(predictionRequired || predictionLocked) &&
        (predictionLocked ? (
          <div
            className={`space-y-1.5 rounded-lg border p-2.5 ${
              isLight
                ? "border-indigo-200 bg-white"
                : "border-indigo-500/25 bg-indigo-950/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  isLight ? "text-indigo-800" : "text-indigo-200"
                }`}
              >
                <Lock className={`size-3 ${isLight ? "text-indigo-600" : "text-indigo-400"}`} aria-hidden="true" />
                {t("Prediction locked", "Đã khóa dự đoán")}
              </span>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {prediction?.predictedServices.length ?? 0} {t("services", "dịch vụ")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {prediction?.predictedServices.map((svc) => (
                <span
                  key={svc}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${
                    isLight
                      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                      : "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
                  }`}
                >
                  {svc}
                </span>
              ))}
            </div>
            {prediction?.rationale?.trim() && (
              <p
                className={`rounded border px-2 py-1 text-[11px] leading-snug ${
                  isLight
                    ? "border-slate-200 bg-slate-50 text-slate-700"
                    : "border-slate-700/80 bg-slate-900/70 text-slate-200"
                }`}
              >
                <span className="font-semibold">{t("Hypothesis:", "Giả thuyết:")} </span>
                {prediction.rationale.trim()}
              </p>
            )}
            <p className={`text-[10.5px] ${isLight ? "text-slate-600" : "text-slate-400"}`}>
              {t(
                "Saved with your lab submission for Lecturer review.",
                "Đã lưu kèm bài làm để Giảng viên đối chiếu khi chấm.",
              )}
            </p>
          </div>
        ) : (
          <div
            className={`space-y-1.5 rounded-lg border p-2.5 ${
              isLight
                ? "border-slate-200 bg-white"
                : "border-slate-800 bg-slate-950/60"
            }`}
          >
            <p className={`text-[11px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              {hasConfirmedAction
                ? t(
                    "A change was already applied before locking a prediction.",
                    "Bạn đã chạy thao tác trước khi khóa dự đoán.",
                  )
                : t(
                    "1. Predict which services will degrade before applying a fault/change:",
                    "1. Chọn các service dự kiến bị ảnh hưởng trước khi thao tác:",
                  )}
            </p>
            {!hasConfirmedAction && (
              <>
                <div className="flex flex-wrap gap-1">
                  {services
                    .filter((svc) => !prescribed?.service || svc !== prescribed.service)
                    .map((svc) => {
                      const active = selectedPredicted.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleService(svc)}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium transition-colors ${
                          active
                            ? isLight
                              ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                              : "border-indigo-400 bg-indigo-500/25 text-indigo-100"
                            : isLight
                              ? "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400"
                              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {svc}
                      </button>
                    );
                  })}
                </div>
                <Input
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder={t("Short hypothesis (optional)…", "Giả thuyết ngắn gọn (tùy chọn)…")}
                  className={`h-7 text-[11px] ${
                    isLight
                      ? "border-slate-300 bg-white text-slate-900"
                      : "border-slate-800 bg-slate-900 text-slate-100"
                  }`}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!canLockPrediction}
                  onClick={() => void onLockPrediction(selectedPredicted, rationale)}
                  className="h-7 w-full bg-indigo-600 text-[11px] text-white hover:bg-indigo-500"
                >
                  <Lock className="mr-1 size-3" aria-hidden="true" />
                  {submittingPrediction
                    ? t("Locking…", "Đang khóa…")
                    : `${t("Lock Prediction", "Khóa dự đoán")} (${selectedPredicted.length})`}
                </Button>
              </>
            )}
          </div>
        ))}

      {/* Step 2: Outage Recovery asks students to diagnose & start the crashed service themselves; Scale-Out adds 2-step Load -> Scale cue */}
      {data.executionStatus === "RUNNING" && isOutageRecovery ? (
        <div
          className={`rounded-lg border px-2.5 py-2 text-[11px] leading-snug ${
            isLight
              ? "border-rose-200 bg-rose-50/70 text-rose-900"
              : "border-rose-500/35 bg-rose-950/35 text-rose-200"
          }`}
        >
          {t(
            "Diagnose the crashed (0x) service on the 3D topology or Logs & Traces, select it, and click Start above to recover.",
            "Quan sát khối đỏ (0x) trên sơ đồ 3D hoặc Log & Trace để xác định service đang gặp sự cố, chọn khối đó rồi bấm Khởi động ở trên để phục hồi.",
          )}
        </div>
      ) : (
        prescribed?.action &&
        prescribed?.service &&
        data.executionStatus === "RUNNING" && (
          <div className="space-y-1.5">
            {exerciseType === "SCALE_UNDER_LOAD" &&
              !data.actions.some((a) => a.status === "CONFIRMED" && a.action === "SET_LOAD") && (
                <p
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${
                    isLight
                      ? "border-sky-200 bg-sky-50/75 text-sky-900"
                      : "border-sky-500/30 bg-sky-950/35 text-sky-200"
                  }`}
                >
                  {t(
                    "Tip: Increase live load (5–15 RPS) above first to observe target saturation, then scale replicas to verify recovery (30–50 RPS tests downstream 0.5 vCPU bottlenecks).",
                    "Gợi ý: Tăng tải lên 5–15 RPS ở bảng trên trước để thấy điểm nghẽn mục tiêu, rồi nhân bản replica để kiểm chứng hồi phục (mức 30–50 RPS có thể gây bão hòa dây chuyền ở các service tầng dưới 0.5 vCPU).",
                  )}
                </p>
              )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || (predictionRequired && !predictionLocked)}
            onClick={runPrescribed}
            className={`h-auto min-h-8 w-full whitespace-normal px-2.5 py-1.5 text-center font-mono text-[11px] leading-snug ${
              prescribedCompleted
                ? isLight
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                : isLight
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
            }`}
          >
            {prescribedCompleted ? (
              <CheckCircle2 className="mr-1.5 size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Play className="mr-1.5 size-3 shrink-0" aria-hidden="true" />
            )}
            <span>
              {prescribedCompleted ? t("Applied:", "Đã chạy:") : t("Apply", "Chạy")}{" "}
              {prescribed.action} {t("on", "trên")} {prescribed.service}
              {prescribed.cpuPercent ? ` (${prescribed.cpuPercent}%)` : ""}
              {prescribed.targetRps ? ` (${prescribed.targetRps} RPS)` : ""}
              {prescribed.replicas ? ` (×${prescribed.replicas})` : ""}
            </span>
          </Button>
          </div>
        )
      )}

      <p className={`text-[10.5px] leading-snug ${isLight ? "text-slate-600" : "text-slate-400"}`}>
        {t(
          "Observe the live 3D graph & telemetry, capture Snapshots or record a Video, then finish Studio to submit for Lecturer grading.",
          "Quan sát đồ thị 3D & thông số thực tế, chụp Snapshot hoặc quay Video làm minh chứng rồi bấm Kết thúc Studio để nộp Giảng viên chấm.",
        )}
      </p>
    </section>
  );
}
