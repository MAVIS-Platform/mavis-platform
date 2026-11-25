"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Download,
  Film,
  Maximize2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { z } from "zod";
import { useApiQuery, usePermission } from "@/hooks/use-api";
import { DetailPanel } from "@/components/shared/data";
import { ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
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
    exerciseType: z.string().optional(),
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

const studioActionSchema = z
  .object({
    action: z.string(),
    service: z.string().optional(),
    serviceName: z.string().optional(),
    status: z.string().optional(),
    replicas: z.number().nullish(),
    targetReplicas: z.number().nullish(),
    cpuPercent: z.number().nullish(),
    targetRps: z.number().nullish(),
    createdAt: z.string().optional(),
  })
  .passthrough();

const frozenStudio = z
  .object({
    studioEvidence: z
      .object({
        receiptDigest: z.string(),
        receiptSignature: z.string().nullable().optional(),
        actions: z.array(studioActionSchema).optional(),
        snapshots: z.array(
          z
            .object({
              id: z.string(),
              capturedAt: z.string(),
              explanation: z.string(),
              digest: z.string(),
              actions: z.array(studioActionSchema).optional(),
              imageData: z
                .string()
                .refine(
                  (val) =>
                    val.startsWith("data:image/png;base64,") ||
                    val.startsWith("data:image/webp;base64,"),
                )
                .optional(),
              videoData: z
                .string()
                .refine(
                  (val) =>
                    val.startsWith("data:video/webm") || val.startsWith("data:video/mp4"),
                )
                .optional(),
              hasVideo: z.boolean().optional(),
              telemetry: z
                .object({
                  p95LatencyMs: z.number().nullish(),
                  errorRate: z.number().nullish(),
                  rps: z.number().nullish(),
                })
                .passthrough()
                .nullish(),
              prediction: z
                .object({
                  predictedServices: z.array(z.string()).optional(),
                  rationale: z.string().nullish(),
                })
                .passthrough()
                .nullish(),
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
    .replace(/^Required trace\b/i, "Luồng gọi bắt buộc")
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

function detectSupportedExerciseLabel(
  latestEval: z.infer<typeof exerciseEvaluationSchema> | null,
  actions: ReadonlyArray<z.infer<typeof studioActionSchema>>,
  t: (en: string, vi?: string) => string,
): string {
  const explicitType = latestEval?.exerciseType?.toUpperCase();
  if (explicitType === "CHANGE_IMPACT" || latestEval?.impact || latestEval?.predictionLocked) {
    return t("Change Impact Analysis", "Phân tích ảnh hưởng (Change Impact)");
  }
  if (explicitType === "SCALE_UNDER_LOAD") {
    return t("Load & Horizontal Scaling", "Chịu tải & Scale ngang");
  }
  if (explicitType === "CIRCUIT_BREAKER" || explicitType === "CASCADING_FAILURE") {
    return t("Outage Recovery", "Khôi phục sự cố (Outage Recovery)");
  }
  if (explicitType === "CONFIG_REGRESSION") {
    return t("CPU Bottleneck & Latency", "Tắc nghẽn CPU & Độ trễ");
  }
  const labels = (latestEval?.rules ?? []).map((r) => r.label.toLowerCase()).join(" ");
  if (labels.includes("replicas") || actions.some((a) => a.action.toUpperCase() === "SCALE")) {
    return t("Load & Horizontal Scaling", "Chịu tải & Scale ngang");
  }
  if (actions.some((a) => a.action.toUpperCase() === "THROTTLE_CPU")) {
    return t("CPU Bottleneck & Latency", "Tắc nghẽn CPU & Độ trễ");
  }
  if (
    actions.some((a) => ["START", "RESUME", "PAUSE", "STOP"].includes(a.action.toUpperCase()))
  ) {
    return t("Outage Recovery", "Khôi phục sự cố (Outage Recovery)");
  }
  return t("Studio Practice", "Thực hành Studio");
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export function StudioSubmissionEvidence({
  submissionId,
  available,
}: {
  submissionId: string;
  available: boolean;
}) {
  const { locale, t } = useLocale();
  const canReview = usePermission("submission:review");
  const [lightbox, setLightbox] = useState<{
    src: string;
    title: string;
    note?: string | undefined;
  } | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);
  const exported = useApiQuery(
    "submissionExport",
    { submissionId },
    { enabled: available },
  );
  const evidence = frozenStudio.safeParse(exported.data);
  if (!available) return null;

  const snapshots = evidence.success ? evidence.data.studioEvidence.snapshots : [];
  const rawActions = evidence.success
    ? (evidence.data.studioEvidence.actions?.length
        ? evidence.data.studioEvidence.actions
        : [...snapshots].reverse().find((s) => (s.actions?.length ?? 0) > 0)?.actions ?? [])
    : [];
  const actions = rawActions.filter((a) => !a.status || a.status.toUpperCase() === "CONFIRMED");
  const latestEval = evidence.success
    ? [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.exerciseEvaluation)?.exerciseEvaluation ?? null
    : null;
  const predictionRationale = evidence.success
    ? [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.prediction?.rationale?.trim())?.prediction?.rationale?.trim() ??
      null
    : null;
  const throttleAction = actions.find((a) => a.action.toUpperCase() === "THROTTLE_CPU");
  const displayRules =
    latestEval?.rules && latestEval.rules.length > 0
      ? latestEval.rules
      : latestEval?.exerciseType?.toUpperCase() === "CONFIG_REGRESSION" && throttleAction
        ? [
            {
              label: t(
                `CPU throttle executed on ${throttleAction.service ?? throttleAction.serviceName ?? "service"}`,
                `Đã áp dụng giới hạn CPU trên ${throttleAction.service ?? throttleAction.serviceName ?? "service"}`,
              ),
              passed: true,
              reason:
                typeof throttleAction.cpuPercent === "number"
                  ? t(`Quota ${throttleAction.cpuPercent}% CPU`, `Giới hạn ${throttleAction.cpuPercent}% CPU`)
                  : undefined,
            },
          ]
        : [];
  const videoCount = snapshots.filter((s) => Boolean(s.videoData || s.hasVideo)).length;
  const imageCount = snapshots.length - videoCount;
  const exerciseTypeLabel = detectSupportedExerciseLabel(latestEval, actions, t);

  return (
    <div className="space-y-4">
      {/* Lecturer-only Automated Grading Assistant (never shown to students) */}
      {canReview && evidence.success && (
        <section
          aria-label={t(
            "Automated grading assistant (Lecturer only)",
            "Hỗ trợ chấm tự động cho Giảng viên",
          )}
          className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/45 p-4 text-xs dark:border-indigo-900 dark:bg-indigo-950/25"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 dark:text-indigo-200">
                <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                {t(
                  "Automated grading assistant (hint only)",
                  "Hỗ trợ chấm tự động (tham khảo cho Giảng viên)",
                )}
              </span>
              <span className="rounded-full border border-indigo-300/80 bg-white px-2.5 py-0.5 text-[11px] font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                {exerciseTypeLabel}
              </span>
            </div>

            {latestEval && (
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
            )}
          </div>

          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-medium text-muted-foreground">
                {t("Executed actions:", "Thao tác đã chạy:")}
              </span>
              {actions.length > 6 && (
                <span className="rounded-md border border-dashed px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  +{actions.length - 6} {t("earlier", "trước đó")}
                </span>
              )}
              {actions.slice(-6).map((act, idx) => {
                const svc = act.service ?? act.serviceName ?? "";
                const reps = act.replicas ?? act.targetReplicas;
                return (
                  <span
                    key={`${act.action}-${svc}-${idx}`}
                    className="rounded-md border bg-background px-2 py-0.5 font-mono font-medium text-foreground"
                  >
                    {act.action} {svc}
                    {typeof reps === "number" ? ` → ×${reps}` : ""}
                    {typeof act.cpuPercent === "number" ? ` (${act.cpuPercent}% CPU)` : ""}
                    {typeof act.targetRps === "number" ? ` (${act.targetRps} RPS)` : ""}
                  </span>
                );
              })}
            </div>
          )}

          {latestEval?.impact && (
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
              {predictionRationale && (
                <p className="rounded border bg-muted/25 px-2.5 py-1.5 text-xs text-foreground">
                  <span className="font-semibold text-muted-foreground">
                    {t("Student hypothesis:", "Giả thuyết sinh viên:")}{" "}
                  </span>
                  {predictionRationale}
                </p>
              )}
            </div>
          )}

          {displayRules.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border bg-background p-3">
              {displayRules.map((rule, index) => (
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

          {!latestEval && (
            <p className="text-xs text-muted-foreground">
              {t(
                "This lab has no automated check rules — review the snapshots/videos and student notes below to grade manually.",
                "Bài thực hành này không bật tiêu chí kiểm tra tự động — giảng viên chấm thủ công dựa trên ảnh/video và giải thích bên dưới.",
              )}
            </p>
          )}
        </section>
      )}

      <DetailPanel
        title={t("Studio evidence (Snapshots & Videos)", "Minh chứng Studio (Ảnh & Video)")}
      >
        {exported.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("Loading snapshots and videos…", "Đang tải ảnh chụp & video thực hành…")}
          </p>
        )}
        {exported.isError && <ErrorState error={exported.error} />}
        {evidence.success && snapshots.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {videoCount > 0 ? (
                  <Film className="size-3.5" aria-hidden="true" />
                ) : (
                  <Camera className="size-3.5" aria-hidden="true" />
                )}
                {videoCount > 0
                  ? t(
                      `${imageCount} snapshot${imageCount === 1 ? "" : "s"} · ${videoCount} video${videoCount === 1 ? "" : "s"} from the Studio session`,
                      `${imageCount} ảnh chụp · ${videoCount} video từ phiên thực hành Studio`,
                    )
                  : t(
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
              const isVideo = Boolean(snapshot.videoData);
              const title = isVideo
                ? t(`Studio Video #${index + 1}`, `Video Studio #${index + 1}`)
                : t(`Snapshot #${index + 1}`, `Ảnh chụp #${index + 1}`);

              return (
                <figure
                  key={snapshot.id}
                  className="overflow-hidden rounded-xl border bg-card shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${
                          isVideo
                            ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                            : "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                        }`}
                      >
                        {isVideo ? (
                          <Film className="size-3" aria-hidden="true" />
                        ) : (
                          <Camera className="size-3" aria-hidden="true" />
                        )}
                        {title}
                      </span>
                      <span className="text-muted-foreground">
                        {formatSnapshotTime(snapshot.capturedAt, locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isVideo && snapshot.videoData && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            downloadDataUrl(
                              `studio-video-${index + 1}.${snapshot.videoData!.includes("mp4") ? "mp4" : "webm"}`,
                              snapshot.videoData!,
                            )
                          }
                        >
                          <Download className="mr-1 size-3" aria-hidden="true" />
                          {t("Download video", "Tải video")}
                        </Button>
                      )}
                      {!isVideo && snapshot.imageData && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() =>
                              setLightbox({
                                src: snapshot.imageData!,
                                title,
                                note: note || undefined,
                              })
                            }
                          >
                            <Maximize2 className="mr-1 size-3" aria-hidden="true" />
                            {t("Zoom", "Phóng to")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() =>
                              downloadDataUrl(
                                `studio-snapshot-${index + 1}.${snapshot.imageData!.startsWith("data:image/webp") ? "webp" : "png"}`,
                                snapshot.imageData!,
                              )
                            }
                          >
                            <Download className="mr-1 size-3" aria-hidden="true" />
                            {t("Download", "Tải ảnh")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isVideo && snapshot.videoData ? (
                    <div className="bg-muted/20 p-2.5">
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        poster={snapshot.imageData}
                        src={snapshot.videoData}
                        aria-label={title}
                        className="max-h-[540px] w-full rounded-lg border bg-black"
                      />
                    </div>
                  ) : snapshot.imageData ? (
                    <div className="bg-muted/15 p-2">
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            src: snapshot.imageData!,
                            title,
                            note: note || undefined,
                          })
                        }
                        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={t(`Zoom ${title}`, `Phóng to ${title}`)}
                      >
                        <img
                          src={snapshot.imageData}
                          alt={title}
                          width={1440}
                          height={860}
                          className="h-auto w-full object-contain transition-transform duration-150 group-hover:scale-[1.005]"
                        />
                      </button>
                    </div>
                  ) : null}

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

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <span className="text-sm font-semibold">{lightbox.title}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadDataUrl(
                      `${lightbox.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${lightbox.src.startsWith("data:image/webp") ? "webp" : "png"}`,
                      lightbox.src,
                    )
                  }
                >
                  <Download className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("Download image", "Tải ảnh")}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("Close preview", "Đóng xem ảnh")}
                  onClick={() => setLightbox(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="overflow-auto bg-muted/20 p-3">
              <img
                src={lightbox.src}
                alt={lightbox.title}
                className="mx-auto max-h-[76vh] w-auto rounded-lg border object-contain"
              />
            </div>
            {lightbox.note && (
              <p className="border-t bg-muted/20 px-4 py-2.5 text-xs text-foreground">
                {lightbox.note}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
