"use client";

import { useState } from "react";
import { z } from "zod";
import { useApiQuery } from "@/hooks/use-api";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";
import { stripLegacySubmissionNoise } from "./submission-text";

const evaluationRuleSchema = z
  .object({
    label: z.string(),
    passed: z.boolean(),
    reason: z.string().optional(),
    observedValue: z.number().nullish(),
  })
  .passthrough();

const evaluationImpactSchema = z
  .object({
    precision: z.number(),
    recall: z.number(),
    f1Score: z.number(),
    truePositives: z.array(z.string()).default([]),
    falsePositives: z.array(z.string()).default([]),
    falseNegatives: z.array(z.string()).default([]),
  })
  .passthrough();

const exerciseEvaluationSchema = z
  .object({
    predictionLocked: z.boolean().optional(),
    predictedServices: z.array(z.string()).optional(),
    observedAffectedServices: z.array(z.string()).optional(),
    impact: evaluationImpactSchema.nullish(),
    rules: z.array(evaluationRuleSchema).optional(),
    passedRules: z.number().optional(),
    totalRules: z.number().optional(),
    autoScorePercent: z.number().optional(),
    passed: z.boolean().optional(),
  })
  .passthrough();

const frozenStudio = z
  .object({
    studioEvidence: z
      .object({
        receiptDigest: z.string(),
        receiptSignature: z.string().nullable().optional(),
        snapshots: z.array(
          z
            .object({
              id: z.string(),
              capturedAt: z.string(),
              explanation: z.string(),
              digest: z.string(),
              imageData: z.string().startsWith("data:image/png;base64,").optional(),
              exerciseEvaluation: exerciseEvaluationSchema.nullish(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export function StudioSubmissionEvidence({
  submissionId,
  available,
}: {
  submissionId: string;
  available: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const exported = useApiQuery(
    "submissionExport",
    { submissionId },
    { enabled: available },
  );
  const evidence = frozenStudio.safeParse(exported.data);
  if (!available) return null;
  const latestEval = evidence.success
    ? [...evidence.data.studioEvidence.snapshots]
        .reverse()
        .find((snapshot) => snapshot.exerciseEvaluation)?.exerciseEvaluation ?? null
    : null;
  return (
    <div className="my-3 space-y-3">
      {latestEval && (
        <section
          aria-label={t(
            "Auto-check (grading hint, not a score)",
            "Tự kiểm tra (gợi ý chấm, không phải điểm)",
          )}
          className="space-y-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-xs dark:border-indigo-900 dark:bg-indigo-950/25"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-indigo-950 dark:text-indigo-200">
              {t(
                "Auto-check (grading hint, not a score)",
                "Tự kiểm tra (gợi ý chấm, không phải điểm)",
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-semibold">
              {latestEval.impact && (
                <span className="rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                  F1 {Math.round(latestEval.impact.f1Score * 100)}%
                </span>
              )}
              {typeof latestEval.totalRules === "number" && latestEval.totalRules > 0 && (
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    latestEval.passed
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                  }`}
                >
                  {latestEval.passedRules ?? 0}/{latestEval.totalRules}{" "}
                  {t("rules", "tiêu chí")}
                  {typeof latestEval.autoScorePercent === "number"
                    ? ` (${latestEval.autoScorePercent}%)`
                    : ""}
                </span>
              )}
            </div>
          </div>

          {latestEval.impact && (
            <div className="space-y-1.5 rounded-md border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {t(
                    "Change Impact prediction vs. observed runtime impact",
                    "Dự đoán Change Impact so với tác động runtime thực tế",
                  )}
                </span>
                <span className="font-mono font-semibold text-foreground">
                  P {Math.round(latestEval.impact.precision * 100)}% · R{" "}
                  {Math.round(latestEval.impact.recall * 100)}% · F1{" "}
                  {Math.round(latestEval.impact.f1Score * 100)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {latestEval.impact.truePositives.map((svc) => (
                  <span
                    key={`tp-${svc}`}
                    className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    {svc} ✓ TP
                  </span>
                ))}
                {latestEval.impact.falsePositives.map((svc) => (
                  <span
                    key={`fp-${svc}`}
                    className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                  >
                    {svc} (FP)
                  </span>
                ))}
                {latestEval.impact.falseNegatives.map((svc) => (
                  <span
                    key={`fn-${svc}`}
                    className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    {svc} (FN)
                  </span>
                ))}
              </div>
            </div>
          )}

          {latestEval.rules && latestEval.rules.length > 0 && (
            <ul className="space-y-1 rounded-md border bg-background p-2.5">
              {latestEval.rules.map((rule, index) => (
                <li
                  key={`${rule.label}-${index}`}
                  className="flex items-start justify-between gap-2 text-[11.5px]"
                >
                  <span className="min-w-0">
                    <span
                      className={`mr-1.5 font-bold ${
                        rule.passed
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {rule.passed ? "✓" : "✕"}
                    </span>
                    <span className="font-medium text-foreground">{rule.label}</span>
                    {rule.reason && (
                      <span className="ml-1.5 text-muted-foreground">· {rule.reason}</span>
                    )}
                  </span>
                  {typeof rule.observedValue === "number" && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {rule.observedValue}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <details
        className="rounded-lg border p-3"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="font-medium">{t("Frozen Studio evidence")}</summary>
        {exported.isPending && <p role="status">{t("Loading evidence")}</p>}
        {exported.isError && <ErrorState error={exported.error} />}
        {evidence.success && (
          <div className="space-y-3 py-2">
            <p className="break-all font-mono text-xs">
              {evidence.data.studioEvidence.receiptDigest}
            </p>
            {evidence.data.studioEvidence.snapshots.map((snapshot, index) => (
              <figure key={snapshot.id} className="space-y-2">
                <figcaption className="text-sm">
                  {new Date(snapshot.capturedAt).toLocaleString()} ·{" "}
                  {stripLegacySubmissionNoise(snapshot.explanation)}
                </figcaption>
                {snapshot.imageData && (
                  <img
                    src={snapshot.imageData}
                    alt={t("Studio snapshot") + " " + (index + 1)}
                    width={1400}
                    height={920}
                    className="h-auto w-full rounded border"
                  />
                )}
                <p className="break-all font-mono text-xs">{snapshot.digest}</p>
              </figure>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
