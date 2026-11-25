"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatTenScaleScore } from "@/lib/format/course-display";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import type { StudentLabLatestReview } from "@/features/workspaces/course-access";

export function labSubmissionDraftKey(
  userId: string | null | undefined,
  workspaceId: string,
  assignmentId: string,
) {
  return `mavis:lab-v2-draft:${userId || "anon"}:${workspaceId}:${assignmentId}`;
}

type LabRubricProfile = {
  items: [string, string, string];
  c2Target: string;
  c3Target: string;
};

function resolveLabRubricProfile(
  labOrder?: number | null,
  labTitle?: string,
): LabRubricProfile {
  const lower = (labTitle ?? "").toLowerCase();
  if (labOrder === 1 || lower.includes("ddd") || lower.includes("static view")) {
    return {
      items: [
        "Bounded Context Isolation",
        "Database-per-Service Boundary",
        "Immutable DTO / Port Contract",
      ],
      c2Target: "order-service",
      c3Target: "InventoryClientPort",
    };
  }
  if (labOrder === 2 || lower.includes("gateway") || lower.includes("outbox") || lower.includes("saga")) {
    return {
      items: [
        "API Gateway Route & Auth Boundary",
        "Resilient Sync Fallback / Timeout",
        "Transactional Outbox + X-Idempotency-Key",
      ],
      c2Target: "api-gateway",
      c3Target: "OutboxEventPublisher",
    };
  }
  if (labOrder === 3 || lower.includes("bfs") || lower.includes("blast radius") || lower.includes("cqrs")) {
    return {
      items: [
        "Cycle-Safe Reverse BFS Trace",
        "Visited-Set Loop Prevention",
        "Async Event / Bulkhead Decoupling",
      ],
      c2Target: "payment-service",
      c3Target: "DomainEventBroker",
    };
  }
  if (labOrder === 5 || lower.includes("telemetry") || lower.includes("production") || lower.includes("fruit") || lower.includes("c#")) {
    return {
      items: [
        "OpenTelemetry Traceparent Continuity",
        "Health Probes (/health/ready & /live)",
        "Bounded Context & Idempotent Settlement",
      ],
      c2Target: "fruit-payment-service",
      c3Target: "TraceContextPropagator",
    };
  }
  return {
    items: [
      "Circuit Breaker + Fallback",
      "Database-per-Service Isolation",
      "Scale & p95 Latency Recovery",
    ],
    c2Target: "order-service",
    c3Target: "ResiliencePolicyPort",
  };
}

export function LabSubmissionV2({
  workspaceId,
  assignmentId,
  labOrder,
  labTitle,
  labMode,
  runtimeSessionId,
  capturedSnapshotCount,
  studioStateLoading,
  runtimeEvidenceHref,
  initialSubmission,
  initialReview,
  hasReferenceArch = true,
  quizSummary,
  nextModuleHref,
  nextModuleTitle,
  onRequestHelp,
}: {
  workspaceId: string;
  assignmentId: string;
  labOrder?: number | null | undefined;
  labTitle?: string | undefined;
  labMode: string;
  runtimeSessionId?: string | undefined;
  capturedSnapshotCount?: number | undefined;
  studioStateLoading?: boolean | undefined;
  runtimeEvidenceHref?: string | undefined;
  initialSubmission?:
    | {
        id: string;
        submittedAt?: string | null;
        submissionNotes?: string | null;
        studentSnapshots?: Array<{ writtenExplanation?: string | null }> | null;
      }
    | null
    | undefined;
  initialReview?: StudentLabLatestReview | null | undefined;
  hasReferenceArch?: boolean | undefined;
  quizSummary?:
    | {
        passed: boolean;
        passPercent: number;
        latestStatus: string | null;
        correctCount?: number | null | undefined;
        totalQuestions?: number | null | undefined;
      }
    | undefined;
  nextModuleHref?: string | undefined;
  nextModuleTitle?: string | undefined;
  onRequestHelp?:
    | ((reason: "submission-explanation" | "submission-runtime" | "submission-failed") => void)
    | undefined;
}) {
  const { t } = useLocale();
  const rubricProfile = useMemo(
    () => resolveLabRubricProfile(labOrder, labTitle),
    [labOrder, labTitle],
  );
  const cache = useQueryClient();
  const session = useSession();
  const userId = session.data?.user?.id;
  const draftKey = labSubmissionDraftKey(userId, workspaceId, assignmentId);
  const submissions = useApiQuery("submissions", { workspaceId });
  const submit = useApiMutation("submit");
  const [answer, setAnswer] = useState("");
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      setAnswer(saved ?? "");
    } catch {
      setAnswer("");
    }
  }, [draftKey]);
  const studio = labMode === "THEORY_QUIZ_STUDIO";
  const showArchRubric = studio || hasReferenceArch;
  const mine = useMemo(
    () => (submissions.data ?? []).filter((item) => item.assignmentId === assignmentId),
    [submissions.data, assignmentId],
  );
  const latest =
    mine[0] ??
    (initialSubmission
      ? {
          id: initialSubmission.id,
          submittedAt: initialSubmission.submittedAt ?? "",
          evidencePackageDigest: undefined as string | undefined,
          studentSnapshots: (initialSubmission.studentSnapshots ?? undefined) as
            | Array<{ writtenExplanation?: string | null }>
            | undefined,
          submissionNotes: (initialSubmission.submissionNotes ?? undefined) as string | undefined,
        }
      : undefined);
  const review = useApiQuery(
    "submissionReview",
    { submissionId: latest?.id ?? "" },
    { enabled: Boolean(latest) },
  );
  const activeReview = review.data ?? initialReview;
  const canSubmit = answer.trim().length > 0 && (!studio || Boolean(runtimeSessionId));
  const missingStudioSnapshot =
    studio &&
    Boolean(runtimeSessionId) &&
    !studioStateLoading &&
    typeof capturedSnapshotCount === "number" &&
    capturedSnapshotCount === 0;

  const submittedAnswerPreview =
    latest?.studentSnapshots?.[0]?.writtenExplanation?.trim() ||
    latest?.submissionNotes?.trim() ||
    "";

  if (latest && !revising) {
    return (
      <div id="lab-submit">
        <DetailPanel title={t("3. Essay Assignment & Submission", "3. Bài tập tự luận & Nộp bài")}>
          <div className="space-y-3 rounded-xl border border-emerald-300/70 bg-emerald-500/5 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("Submitted", "Đã nộp")}
                {latest.submittedAt ? ` · ${new Date(latest.submittedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {quizSummary && (
                  <Badge variant={quizSummary.passed ? "success" : "outline"} className="text-[11px]">
                    {quizSummary.correctCount != null && quizSummary.totalQuestions
                      ? `Quiz: ${quizSummary.correctCount}/${quizSummary.totalQuestions}`
                      : quizSummary.passed
                        ? t("Quiz passed", "Quiz: Đạt")
                        : t("Quiz pending", "Quiz: Chưa đạt")}
                  </Badge>
                )}
                {latest.evidencePackageDigest && (
                  <Badge variant="outline" className="text-[11px]">
                    {t("Studio data attached", "Đã đính kèm dữ liệu Studio")}
                  </Badge>
                )}
                {(!activeReview ||
                  activeReview.status === "PENDING" ||
                  activeReview.status === "DRAFT") && (
                  <Badge variant="secondary">
                    {t("Pending Lecturer Review", "Đang chờ Giảng viên chấm")}
                  </Badge>
                )}
              </div>
            </div>
            {activeReview &&
              activeReview.status !== "PENDING" &&
              activeReview.status !== "DRAFT" && (
                <div className="space-y-2 rounded-md border bg-background p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={activeReview.status === "RETURNED" ? "warning" : "success"}>
                      {activeReview.status === "RETURNED"
                        ? t("Returned for revision", "Trả lại để sửa")
                        : t("Published result", "Kết quả đã công bố")}
                    </Badge>
                    {activeReview.score !== null && (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-900">
                        {formatTenScaleScore(
                          activeReview.score,
                          "scoreTenScale" in activeReview ? activeReview.scoreTenScale : undefined,
                        )}
                      </span>
                    )}
                  </div>
                  {activeReview.summary && (
                    <p className="whitespace-pre-wrap">{activeReview.summary}</p>
                  )}
                </div>
              )}
            {submittedAnswerPreview && (
              <div className="space-y-1 rounded-md border bg-background/90 p-3 text-xs">
                <p className="font-medium text-muted-foreground">
                  {t("Submitted response", "Nội dung bài đã nộp")}
                </p>
                <p className="line-clamp-4 whitespace-pre-wrap text-foreground">
                  {submittedAnswerPreview}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild size="sm" className="bg-teal-600 text-white hover:bg-teal-700">
                <Link
                  href={nextModuleHref ?? `/roadmap?workspace=${encodeURIComponent(workspaceId)}`}
                >
                  {nextModuleTitle
                    ? t(`Next Module: ${nextModuleTitle}`, `Sang Module tiếp theo: ${nextModuleTitle}`)
                    : t("Next Module", "Sang Module tiếp theo")}{" "}
                  <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/submissions/${encodeURIComponent(latest.id)}`}>
                  {t("View submission", "Xem bài nộp")}
                </Link>
              </Button>
              {activeReview?.labOutcome !== "PASSED" && (
                <button
                  type="button"
                  className="ml-auto text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => {
                    if (!answer.trim()) {
                      const prior =
                        latest.studentSnapshots?.[0]?.writtenExplanation ||
                        latest.submissionNotes ||
                        "";
                      if (prior) {
                        setAnswer(prior);
                        try {
                          window.localStorage.setItem(draftKey, prior);
                        } catch {}
                      }
                    }
                    setRevising(true);
                  }}
                >
                  {t("Revise and resubmit", "Sửa và nộp lại")}
                </button>
              )}
            </div>
          </div>
        </DetailPanel>
      </div>
    );
  }

  return (
    <div id="lab-submit">
      <DetailPanel title={t("3. Essay Assignment & Submission", "3. Bài tập tự luận & Nộp bài")}>
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {studio
              ? t(
                  "Summarize what you observed in MAVIS Studio and connect it to the architecture concepts.",
                  "Tổng hợp những gì bạn quan sát được trong MAVIS Studio và liên hệ với kiến thức kiến trúc phần mềm.",
                )
              : hasReferenceArch
                ? t(
                    "Summarize the architecture boundaries and key design trade-offs from the sample repository.",
                    "Tổng hợp cấu trúc kiến trúc và các đánh đổi thiết kế chính từ kho mã nguồn tham chiếu.",
                  )
                : t(
                    "Summarize the core concepts from this Module in your own words.",
                    "Tổng hợp các ý chính của Module bằng ngôn ngữ của bạn.",
                  )}
          </p>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {rubricProfile.items.map((promptItem) => (
              <li
                key={promptItem}
                className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-muted-foreground"
              >
                {promptItem}
              </li>
            ))}
          </ul>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              {t("Your Module Reflection", "Bài viết tổng hợp của bạn")}
            </span>
            <textarea
              className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
              value={answer}
              maxLength={20000}
              onChange={(event) => {
                const next = event.target.value;
                setAnswer(next);
                try {
                  if (next) window.localStorage.setItem(draftKey, next);
                  else window.localStorage.removeItem(draftKey);
                } catch {}
              }}
              aria-label={t("Module summary reflection", "Nội dung bài viết tổng hợp")}
            />
          </label>
          {studio && runtimeSessionId && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {t(
                "Studio Live session verified — your runtime results will be attached automatically.",
                "Phiên Studio Live đã hoàn thành — kết quả thực hành sẽ được đính kèm tự động khi nộp.",
              )}
            </p>
          )}
          {studio && !runtimeSessionId && (
            <p
              role="status"
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200"
            >
              {t(
                "Missing requirement: Finish a MAVIS Studio session before submitting.",
                "Cần hoàn thành: Chạy xong một phiên MAVIS Studio trước khi nhấn Nộp bài.",
              )}
            </p>
          )}
          {missingStudioSnapshot && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
            >
              <span>
                {t(
                  "Missing requirement: Capture at least one Snapshot with your note in Studio.",
                  "Cần hoàn thành: Chụp ít nhất 1 ảnh Snapshot kèm ghi chú trong Studio.",
                )}
              </span>
              {runtimeEvidenceHref && (
                <Button asChild size="sm" variant="outline">
                  <Link href={runtimeEvidenceHref}>
                    {t("Capture Snapshot in Studio", "Mở Studio để chụp Snapshot")}
                  </Link>
                </Button>
              )}
            </div>
          )}
          {submit.error && (
            <p role="alert" className="text-sm text-destructive">
              {submit.error.message}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              <span>
                {answer.trim().length} {t("characters", "ký tự")}
              </span>
              {!canSubmit && answer.trim().length === 0 && (
                <span className="ml-2 text-amber-700 dark:text-amber-300">
                  · {t("Enter your summary to enable submission", "Nhập nội dung tổng hợp để nộp bài")}
                </span>
              )}
            </div>
            <Button
              type="button"
              size="lg"
              className="bg-teal-600 px-6 font-semibold text-white hover:bg-teal-700"
              disabled={submit.isPending || missingStudioSnapshot}
              onClick={() => {
                if (!canSubmit) {
                  onRequestHelp?.(
                    studio && !runtimeSessionId ? "submission-runtime" : "submission-explanation",
                  );
                  return;
                }
                if (missingStudioSnapshot) {
                  onRequestHelp?.("submission-runtime");
                  return;
                }
                const nowIso = new Date().toISOString();
                const trimmed = answer.trim();
                const snapshots = showArchRubric
                  ? [
                      {
                        snapshotId: `lab-analysis-${assignmentId}`,
                        step: "STEP_4",
                        title: labTitle || "Architecture & Studio Analysis",
                        targetViewOrService: rubricProfile.c2Target,
                        writtenExplanation: trimmed,
                        capturedAt: nowIso,
                      },
                    ]
                  : [];
                submit.mutate(
                  {
                    assignmentId,
                    runtimeSessionId: studio ? runtimeSessionId! : null,
                    submissionNotes: trimmed,
                    theoryAnswers: [
                      { sectionId: "THEORY", title: "Theory explanation", answer: trimmed },
                    ],
                    ...(snapshots.length > 0 ? { studentSnapshots: snapshots } : {}),
                  },
                  {
                    onSuccess: () => {
                      try {
                        window.localStorage.removeItem(draftKey);
                      } catch {}
                      setAnswer("");
                      setRevising(false);
                      void cache.invalidateQueries({ queryKey: ["api", "submissions"] });
                      void cache.invalidateQueries({ queryKey: ["api", "submission"] });
                      void cache.invalidateQueries({ queryKey: ["api", "workspaceSubmissions"] });
                      void cache.invalidateQueries({
                        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
                      });
                      void cache.invalidateQueries({ queryKey: ["api", "course-roadmap", workspaceId] });
                      void cache.invalidateQueries({
                        queryKey: ["api", "workspace-gradebook", workspaceId],
                      });
                      void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
                    },
                    onError: () => onRequestHelp?.("submission-failed"),
                  },
                );
              }}
            >
              {submit.isPending ? t("Submitting…", "Đang nộp…") : t("Submit Module", "Nộp bài")}
            </Button>
          </div>
        </div>
      </DetailPanel>
    </div>
  );
}
