"use client";

import { CheckCircle2, Camera, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useApiQuery } from "@/hooks/use-api";
import { DetailPanel } from "@/components/shared/data";
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

function formatSnapshotTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localizeRuleLabel(label: string, locale: string): string {
  if (locale !== "vi") return label;
  return label
    .replace(/^Global error rate\b/i, "Tỉ lệ lỗi toàn hệ thống")
    .replace(/^Global p95 latency\b/i, "Độ trễ p95 toàn hệ thống")
    .replace(/^Replicas\(([^)]+)\)/i, "Số bản sao ($1)")
    .replace(/^Change Impact F1\b/i, "Độ chính xác dự đoán (F1)")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥");
}

function localizeRuleReason(reason: string, locale: string): string {
  if (locale !== "vi") return reason;
  return reason
    .replace(/^Observed\s+/i, "Thực tế: ")
    .replace(/\(expected\s+([^)]+)\)/i, "(yêu cầu $1)")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥");
}

export function StudioSubmissionEvidence({
  submissionId,
  available,
}: {
  submissionId: string;
  available: boolean;
}) {
  const { locale, t } = useLocale();
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
  const snapshots = evidence.success ? evidence.data.studioEvidence.snapshots : [];

  return (
    <div className="space-y-4">
      {latestEval && (
        <section
          aria-label={t(
            "Auto-check (grading hint, not a score)",
            "Tự kiểm tra (gợi ý chấm, không phải điểm)",
          )}
          className="space-y-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-xs dark:border-indigo-900 dark:bg-indigo-950/25"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">
              {t(
                "Auto-check (grading hint, not a score)",
                "Tự kiểm tra (gợi ý chấm, không phải điểm)",
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              {latestEval.impact && (
                <span className="rounded-full border border-indigo-300 bg-white px-2.5 py-0.5 font-mono text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                  F1 {Math.round(latestEval.impact.f1Score * 100)}%
                </span>
              )}
              {typeof latestEval.totalRules === "number" && latestEval.totalRules > 0 && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 ${
                    latestEval.passed
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                  }`}
                >
                  {latestEval.passedRules ?? 0}/{latestEval.totalRules}{" "}
                  {t("criteria", "tiêu chí")}
                  {typeof latestEval.autoScorePercent === "number"
                    ? ` (${latestEval.autoScorePercent}%)`
                    : ""}
                </span>
              )}
            </div>
          </div>

          {latestEval.impact && (
            <div className="space-y-1.5 rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {t(
                    "Change Impact prediction vs. observed runtime impact",
                    "Dự đoán ảnh hưởng so với thực tế chạy Docker",
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
                    className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    {svc} ✓ {t("Correct", "Đúng")}
                  </span>
                ))}
                {latestEval.impact.falsePositives.map((svc) => (
                  <span
                    key={`fp-${svc}`}
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                  >
                    {svc} · {t("Extra", "Dư")}
                  </span>
                ))}
                {latestEval.impact.falseNegatives.map((svc) => (
                  <span
                    key={`fn-${svc}`}
                    className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    {svc} · {t("Missed", "Thiếu")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {latestEval.rules && latestEval.rules.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border bg-background p-3">
              {latestEval.rules.map((rule, index) => (
                <li
                  key={`${rule.label}-${index}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <span
                      className={`mr-1.5 font-bold ${
                        rule.passed
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {rule.passed ? "✓" : "✕"}
                    </span>
                    <span className="font-medium text-foreground">
                      {localizeRuleLabel(rule.label, locale)}
                    </span>
                    {rule.reason && (
                      <span className="ml-1.5 text-muted-foreground">
                        · {localizeRuleReason(rule.reason, locale)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      rule.passed
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {rule.passed ? t("Pass", "Đạt") : t("Fail", "Chưa đạt")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <DetailPanel title={t("Studio practice snapshots", "Ảnh chụp thực hành Studio")}>
        {exported.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("Loading snapshots…", "Đang tải ảnh chụp thực hành…")}
          </p>
        )}
        {exported.isError && <ErrorState error={exported.error} />}
        {evidence.success && snapshots.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Camera className="size-3.5" aria-hidden="true" />
                {t(
                  `${snapshots.length} verified snapshot${snapshots.length === 1 ? "" : "s"} captured during the Studio session`,
                  `${snapshots.length} ảnh chụp từ phiên thực hành Studio của sinh viên`,
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t("Verified by MAVIS", "Đã xác thực bởi MAVIS")}
              </span>
            </div>

            {snapshots.map((snapshot, index) => {
              const note = stripLegacySubmissionNoise(snapshot.explanation);
              return (
                <figure
                  key={snapshot.id}
                  className="overflow-hidden rounded-xl border bg-muted/15"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {t(`Snapshot #${index + 1}`, `Ảnh chụp #${index + 1}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatSnapshotTime(snapshot.capturedAt, locale)}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      {t("Verified", "Đã xác thực")}
                    </span>
                  </div>

                  {snapshot.imageData && (
                    <div className="bg-slate-950/90 p-2">
                      <img
                        src={snapshot.imageData}
                        alt={t("Studio snapshot") + " " + (index + 1)}
                        width={1400}
                        height={920}
                        className="h-auto w-full rounded-lg border border-slate-800/80"
                      />
                    </div>
                  )}

                  {note && (
                    <figcaption className="space-y-1 border-t bg-background/80 px-3.5 py-2.5">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {t("Student note when capturing", "Ghi chú của sinh viên lúc chụp")}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {note}
                      </p>
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
