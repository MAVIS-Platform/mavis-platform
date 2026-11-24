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
  initialSubmission?: { id: string; submittedAt?: string | null } | null | undefined;
  initialReview?: StudentLabLatestReview | null | undefined;
  hasReferenceArch?: boolean | undefined;
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
          studentSnapshots: undefined as Array<{ writtenExplanation?: string | null }> | undefined,
          submissionNotes: undefined as string | undefined,
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

  if (latest && !revising) {
    return (
      <div id="lab-submit">
        <DetailPanel title={t("Submission & Lecturer Review", "Bài nộp & Kết quả chấm")}>
          <div className="space-y-3 rounded-xl border border-emerald-300/70 bg-emerald-500/5 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("Submitted", "Đã nộp")}
                {latest.submittedAt ? ` · ${new Date(latest.submittedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {latest.evidencePackageDigest && (
                  <Badge variant="outline" className="text-[11px]">
                    {t("Evidence Sealed", "Đã niêm phong bằng chứng")}
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
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild size="sm" className="bg-teal-600 text-white hover:bg-teal-700">
                <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                  {t("Continue Syllabus", "Tiếp tục lộ trình")} <ArrowRight />
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
      <DetailPanel title={t("Submit your explanation", "Nộp phần giải trình")}>
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {studio
              ? t(
                  "Explain what you observed in Studio and connect it to the theory. The verified Studio session is attached automatically.",
                  "Giải thích điều bạn quan sát trong Studio và liên hệ với lý thuyết. Phiên Studio đã xác minh được đính kèm tự động.",
                )
              : hasReferenceArch
                ? t(
                    "Explain the architecture and how the sample repository supports your answer. No diagram or model selection is required.",
                    "Giải thích kiến trúc và cách repo mẫu chứng minh câu trả lời. Không cần chọn diagram hay model.",
                  )
                : t(
                    "Explain the key concepts from the Lab theory in your own words.",
                    "Trình bày và giải thích các khái niệm trọng tâm từ bài lý thuyết bằng lời của bạn.",
                  )}
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("Explanation", "Giải trình")}</span>
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
              aria-label={t("Submission explanation", "Giải trình bài nộp")}
            />
          </label>
          {studio && runtimeSessionId && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {t(
                "Studio Live session verified — your runtime receipt will be sealed with this submission.",
                "Phiên Studio Live đã được xác minh — biên nhận thực nghiệm sẽ được niêm phong kèm bài nộp này.",
              )}
            </p>
          )}
          {studio && !runtimeSessionId && (
            <p
              role="status"
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200"
            >
              {t(
                "Finish a verified Studio session for this Lab before submitting.",
                "Hoàn thành một phiên Studio đã xác minh cho Lab này trước khi nộp.",
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
                  "Capture at least one Studio Snapshot with your observation note before submitting this Lab.",
                  "Hãy chụp ít nhất một Snapshot Studio kèm ghi chú quan sát trước khi nộp bài Lab này.",
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
            <span className="text-xs text-muted-foreground">
              {answer.trim().length} {t("characters", "ký tự")}
            </span>
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
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
              {submit.isPending ? t("Submitting…", "Đang nộp…") : t("Submit Lab", "Nộp Lab")}
            </Button>
          </div>
        </div>
      </DetailPanel>
    </div>
  );
}
