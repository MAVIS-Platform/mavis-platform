"use client";

import { useState } from "react";
import { CheckCircle2, Lock, Play, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}) {
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
      aria-label="Change Impact & Auto-Grade"
      className="space-y-2.5 rounded-lg border border-indigo-500/30 bg-slate-900/75 p-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-200">
          <Target className="size-3.5 text-indigo-400" aria-hidden="true" />
          Change Impact &amp; Auto-Grade
        </span>
        {evaluation && evaluation.totalRules > 0 && (
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
              evaluation.passed
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/15 text-amber-200"
            }`}
          >
            {evaluation.autoScorePercent}% ({evaluation.passedRules}/{evaluation.totalRules})
          </span>
        )}
      </div>

      {/* Step 1: Student Change Impact Prediction */}
      {predictionLocked ? (
        <div className="space-y-1.5 rounded-md border border-indigo-500/25 bg-indigo-950/30 p-2">
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="inline-flex items-center gap-1 font-semibold text-indigo-200">
              <Lock className="size-3 text-indigo-400" aria-hidden="true" />
              Prediction locked
            </span>
            {evaluation?.impact && (
              <span className="font-mono font-semibold text-emerald-300">
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
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    tp
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                      : fp
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
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
                className="rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-200"
              >
                {svc} (Missed)
              </span>
            ))}
          </div>
          {evaluation?.impact && (
            <div className="grid grid-cols-3 gap-1 pt-0.5 font-mono text-[10px] text-slate-300">
              <span>P: {(evaluation.impact.precision * 100).toFixed(0)}%</span>
              <span>R: {(evaluation.impact.recall * 100).toFixed(0)}%</span>
              <span>F1: {(evaluation.impact.f1Score * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/60 p-2">
          <p className="text-[10.5px] text-slate-300">
            {hasConfirmedAction
              ? "A change was already applied before locking a prediction."
              : "1. Predict which services will degrade before applying a fault/change:"}
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
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors ${
                        active
                          ? "border-indigo-400 bg-indigo-500/25 text-indigo-100"
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
                placeholder="Short hypothesis (optional)…"
                className="h-7 border-slate-800 bg-slate-900 text-[11px] text-slate-100"
              />
              <Button
                type="button"
                size="sm"
                disabled={!canLockPrediction}
                onClick={() => void onLockPrediction(selectedPredicted, rationale)}
                className="h-7 w-full bg-indigo-600 text-[11px] text-white hover:bg-indigo-500"
              >
                <Lock className="mr-1 size-3" aria-hidden="true" />
                {submittingPrediction ? "Locking…" : `Lock Prediction (${selectedPredicted.length})`}
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
          className="h-7 w-full border-amber-500/40 bg-amber-500/10 font-mono text-[11px] text-amber-200 hover:bg-amber-500/20"
        >
          <Play className="mr-1 size-3" aria-hidden="true" />
          Apply {prescribed.action} on {prescribed.service}
          {prescribed.cpuPercent ? ` (${prescribed.cpuPercent}%)` : ""}
          {prescribed.targetRps ? ` (${prescribed.targetRps} RPS)` : ""}
          {prescribed.replicas ? ` (×${prescribed.replicas})` : ""}
        </Button>
      )}

      {/* Step 3: Live C3 Declarative Pass Criteria Checklist */}
      {evaluation && evaluation.rules.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Pass Criteria ({evaluation.passedRules}/{evaluation.totalRules})
          </div>
          <ul className="space-y-1">
            {evaluation.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-start gap-1.5 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1"
              >
                {rule.passed ? (
                  <CheckCircle2
                    className="mt-0.5 size-3 shrink-0 text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle className="mt-0.5 size-3 shrink-0 text-rose-400" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-200">{rule.label}</div>
                  <div className="truncate font-mono text-[10px] text-slate-400">{rule.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
