"use client";

import { useState } from "react";
import { CheckCircle2, Lock, Play, Target, XCircle } from "lucide-react";
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
      aria-label="Change Impact & Auto-Check"
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
          {t("Change Impact & Auto-Check", "Change Impact & Tự kiểm tra")}
        </span>
        {evaluation && evaluation.totalRules > 0 && (
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
              evaluation.passed
                ? isLight
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : isLight
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-200"
            }`}
          >
            {evaluation.autoScorePercent}% ({evaluation.passedRules}/{evaluation.totalRules})
          </span>
        )}
      </div>

      {/* Step 1: Student Change Impact Prediction */}
      {predictionLocked ? (
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
            {evaluation?.impact && (
              <span className={`font-mono font-bold ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
                F1 {(evaluation.impact.f1Score * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {prediction?.predictedServices.map((svc) => {
              const tp = evaluation?.impact?.truePositives.includes(svc);
              const fp = evaluation?.impact?.falsePositives.includes(svc);
              return (
                <span
                  key={svc}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${
                    tp
                      ? isLight
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                      : fp
                        ? isLight
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-amber-500/40 bg-amber-500/15 text-amber-200"
                        : isLight
                          ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                          : "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
                  }`}
                >
                  {svc}
                  {tp ? " ✓" : fp ? " (FP)" : ""}
                </span>
              );
            })}
            {evaluation?.impact?.falseNegatives.map((svc) => (
              <span
                key={`fn-${svc}`}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${
                  isLight
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-200"
                }`}
              >
                {svc} ({t("Missed", "Thiếu")})
              </span>
            ))}
          </div>
          {evaluation?.impact && (
            <div
              className={`grid grid-cols-3 gap-1 pt-0.5 font-mono text-[10.5px] font-semibold ${
                isLight ? "text-slate-700" : "text-slate-300"
              }`}
            >
              <span>P: {(evaluation.impact.precision * 100).toFixed(0)}%</span>
              <span>R: {(evaluation.impact.recall * 100).toFixed(0)}%</span>
              <span>F1: {(evaluation.impact.f1Score * 100).toFixed(0)}%</span>
            </div>
          )}
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
                {services.map((svc) => {
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
      )}

      {/* Step 2: 1-Click Prescribed Lecturer Change Action */}
      {prescribed?.action && prescribed?.service && data.executionStatus === "RUNNING" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || (predictionRequired && !predictionLocked)}
          onClick={runPrescribed}
          className={`h-7 w-full font-mono text-[11px] ${
            isLight
              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          }`}
        >
          <Play className="mr-1 size-3" aria-hidden="true" />
          {t("Apply", "Chạy")} {prescribed.action} {t("on", "trên")} {prescribed.service}
          {prescribed.cpuPercent ? ` (${prescribed.cpuPercent}%)` : ""}
          {prescribed.targetRps ? ` (${prescribed.targetRps} RPS)` : ""}
          {prescribed.replicas ? ` (×${prescribed.replicas})` : ""}
        </Button>
      )}

      {/* Step 3: Live C3 Declarative Pass Criteria Checklist */}
      {evaluation && evaluation.rules.length > 0 && (
        <div className={`space-y-1 border-t pt-2 ${isLight ? "border-indigo-200" : "border-slate-800"}`}>
          <div
            className={`text-[10px] font-semibold uppercase tracking-wide ${
              isLight ? "text-slate-600" : "text-slate-400"
            }`}
          >
            {t("Pass Criteria", "Tiêu chí đạt")} ({evaluation.passedRules}/{evaluation.totalRules})
          </div>
          <ul className="space-y-1">
            {evaluation.rules.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-start gap-1.5 rounded border px-2 py-1 ${
                  isLight
                    ? "border-slate-200 bg-white"
                    : "border-slate-800/80 bg-slate-950/60"
                }`}
              >
                {rule.passed ? (
                  <CheckCircle2
                    className={`mt-0.5 size-3 shrink-0 ${isLight ? "text-emerald-600" : "text-emerald-400"}`}
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle
                    className={`mt-0.5 size-3 shrink-0 ${isLight ? "text-rose-600" : "text-rose-400"}`}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-medium ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                    {rule.label}
                  </div>
                  <div className={`truncate font-mono text-[10px] ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                    {rule.reason}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
