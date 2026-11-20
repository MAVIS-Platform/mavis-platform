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
  sampleDossier: string;
  flawedSample: string;
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
      sampleDossier:
        "Hồ sơ kiến trúc Lab 01: Phân tách Bounded Context rõ ràng giữa Order và Inventory, áp dụng Database-per-Service (chống Shared Monolith DB), và dùng Immutable DTO/Record tại biên Controller -> Application Port -> Adapter.",
      flawedSample: "Gộp chung 1 bảng Shared DB.",
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
      sampleDossier:
        "Hồ sơ kiến trúc Lab 02: Định tuyến qua API Gateway, cấu hình timeout + Circuit Breaker fallback cho OpenFeign/HTTP Client, và dùng Transactional Outbox + X-Idempotency-Key đảm bảo nhất quán Saga.",
      flawedSample: "Gọi sync không timeout, không idempotency.",
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
      sampleDossier:
        "Hồ sơ kiến trúc Lab 03: Truy vết Reverse BFS với Visited Set để xác định đúng trực tiếp (Hop 1) và gián tiếp (Hop 2+), chặn lặp vô hạn khi có chu trình phụ thuộc và cô lập điểm nghẽn bằng Messaging/Bulkhead.",
      flawedSample: "Duyệt không có Visited Set.",
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
      sampleDossier:
        "Hồ sơ kiến trúc Lab 05: Bảo toàn W3C traceparent xuyên suốt Gateway -> Service -> Message Broker, tách Liveness/Readiness probes tránh high-cardinality metrics, và khóa trùng thanh toán bằng Idempotency Key.",
      flawedSample: "Thiếu readiness probe và trace ID.",
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
    sampleDossier:
      "Hồ sơ kiến trúc Studio Live: Kích hoạt Resilience4j Circuit Breaker (CLOSED/OPEN/HALF_OPEN) kèm Fallback, tách Database-per-Service ngăn lock contention, và mở rộng replica giữ p95 dưới ngưỡng SLA sau sự cố.",
    flawedSample: "Shared DB và không giới hạn retry.",
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
  initialSubmission,
  initialReview,
  hasReferenceArch = true,
}: {
  workspaceId: string;
  assignmentId: string;
  labOrder?: number | null | undefined;
  labTitle?: string | undefined;
  labMode: string;
  runtimeSessionId?: string | undefined;
  initialSubmission?: { id: string; submittedAt?: string | null } | null | undefined;
  initialReview?: StudentLabLatestReview | null | undefined;
  hasReferenceArch?: boolean | undefined;
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
  const [mitigations, setMitigations] = useState<{
    circuitBreaker: boolean;
    databasePerService: boolean;
    idempotencyKey: boolean;
  }>({
    circuitBreaker: true,
    databasePerService: true,
    idempotencyKey: true,
  });

  const checklistScore =
    (mitigations.circuitBreaker ? 1 : 0) +
    (mitigations.databasePerService ? 1 : 0) +
    (mitigations.idempotencyKey ? 1 : 0);
  const estimatedRubricScore = useMemo(() => {
    const baseQuiz = 2.7; // 30% Quiz weight
    const topologyScore = answer.trim().length >= 80 ? 3.5 : answer.trim().length > 0 ? 1.8 : 0.8;
    const mitigationScore = Math.round((checklistScore / 3) * 2.6 * 10) / 10;
    return Math.min(10, Math.round((baseQuiz + topologyScore + mitigationScore) * 10) / 10);
  }, [answer, checklistScore]);
  const passesRubricPreview = estimatedRubricScore > 5.0;

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
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" className="bg-teal-600 text-white hover:bg-teal-700">
                <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                  {t(
                    "Back to Course Syllabus for Next Lesson →",
                    "Quay về Lộ trình môn học để sang bài tiếp theo →",
                  )}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}>
                  {t("View submission and grade", "Xem bài nộp và điểm")} <ArrowRight />
                </Link>
              </Button>
              {activeReview?.labOutcome !== "PASSED" && (
                <Button
                  size="sm"
                  variant="ghost"
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
                </Button>
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
          {submit.error && (
            <p role="alert" className="text-sm text-destructive">
              {submit.error.message}
            </p>
          )}
          {showArchRubric && (
            <div className="space-y-3 rounded-xl border border-teal-200/80 bg-teal-50/40 p-3.5 text-xs dark:border-teal-900 dark:bg-teal-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-teal-950 dark:text-teal-200">
                  📊 {t("WF-04 Rubric 0–10 Estimate & C1–C3 Snapshot Bundler", "Dự báo Điểm Rubric 0–10 (WF-04) & Đóng gói Snapshot C1–C3")}
                </span>
                <Badge variant={passesRubricPreview ? "success" : "destructive"}>
                  {estimatedRubricScore.toFixed(1)} / 10.0 ·{" "}
                  {passesRubricPreview
                    ? t("APPROVED Eligible (> 5.0)", "ĐẠT (> 5.0 → Mở Lab tiếp theo)")
                    : t("DS-04b Revision Needed (≤ 5.0)", "Cần sửa (≤ 5.0 · DS-04b)")}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                {t(
                  "30% Quiz Gate + 40% C1–C3 Snapshot Architecture + 30% Reverse BFS Mitigation Checklist",
                  "Cấu trúc điểm: 30% Quiz Gate + 40% Kiến trúc C1–C3 Snapshot + 30% Giải pháp Reverse BFS Mitigation",
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={mitigations.circuitBreaker}
                    onChange={(e) =>
                      setMitigations((m) => ({ ...m, circuitBreaker: e.target.checked }))
                    }
                  />
                  {rubricProfile.items[0]}
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={mitigations.databasePerService}
                    onChange={(e) =>
                      setMitigations((m) => ({ ...m, databasePerService: e.target.checked }))
                    }
                  />
                  {rubricProfile.items[1]}
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={mitigations.idempotencyKey}
                    onChange={(e) =>
                      setMitigations((m) => ({ ...m, idempotencyKey: e.target.checked }))
                    }
                  />
                  {rubricProfile.items[2]}
                </label>
              </div>
              <details className="pt-1">
                <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  ⚙ {t("QA / Demo Dossier Presets", "Mẫu kiểm thử nhanh (Demo)")}
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-emerald-300 bg-background px-2.5 text-xs text-emerald-800 hover:bg-emerald-50"
                    onClick={() => {
                      const sample = rubricProfile.sampleDossier;
                      setMitigations({ circuitBreaker: true, databasePerService: true, idempotencyKey: true });
                      setAnswer(sample);
                      try {
                        window.localStorage.setItem(draftKey, sample);
                      } catch {}
                    }}
                  >
                    🚀 {t("Fill Passing Architectural Dossier (> 5.0)", "Điền Hồ Sơ Chuẩn Đạt Rubric (8.8/10)")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-rose-300 bg-background px-2.5 text-xs text-rose-800 hover:bg-rose-50"
                    onClick={() => {
                      const flawed = rubricProfile.flawedSample;
                      setMitigations({ circuitBreaker: false, databasePerService: false, idempotencyKey: false });
                      setAnswer(flawed);
                      try {
                        window.localStorage.setItem(draftKey, flawed);
                      } catch {}
                    }}
                  >
                    🧪 {t("Fill Flawed Draft to Test DS-04b (≤ 5.0)", "Điền Thiết Kế Lỗi Test DS-04b (≤ 5.0)")}
                  </Button>
                </div>
              </details>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {answer.trim().length} {t("characters", "ký tự")}
            </span>
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
              disabled={!canSubmit || submit.isPending}
              onClick={() => {
                const nowIso = new Date().toISOString();
                const trimmed = answer.trim();
                const snapshots = showArchRubric
                  ? [
                      {
                        snapshotId: `c1-context-${assignmentId}`,
                        step: "STEP_4",
                        title: "C1 System Context Boundary",
                        targetViewOrService: "api-gateway",
                        writtenExplanation: trimmed,
                        capturedAt: nowIso,
                      },
                      {
                        snapshotId: `c2-container-${assignmentId}`,
                        step: "STEP_4",
                        title: `C2 Containers (${mitigations.databasePerService ? rubricProfile.items[1] : "Needs Isolation"})`,
                        targetViewOrService: rubricProfile.c2Target,
                        writtenExplanation: `${rubricProfile.items[0]}=${mitigations.circuitBreaker}, ${rubricProfile.items[1]}=${mitigations.databasePerService}`,
                        capturedAt: nowIso,
                      },
                      {
                        snapshotId: `c3-component-${assignmentId}`,
                        step: "STEP_4",
                        title: `C3 Component Contracts (${mitigations.idempotencyKey ? rubricProfile.items[2] : "Needs Guard"})`,
                        targetViewOrService: rubricProfile.c3Target,
                        writtenExplanation: `${rubricProfile.items[2]}=${mitigations.idempotencyKey}`,
                        capturedAt: nowIso,
                      },
                    ]
                  : [];
                submit.mutate(
                  {
                    assignmentId,
                    runtimeSessionId: studio ? runtimeSessionId! : null,
                    submissionNotes: showArchRubric
                      ? `${trimmed}\n[RubricPreview=${estimatedRubricScore}/10; CB=${mitigations.circuitBreaker}; DBPerService=${mitigations.databasePerService}; Idempotency=${mitigations.idempotencyKey}]`
                      : trimmed,
                    theoryAnswers: showArchRubric
                      ? [
                          { sectionId: "THEORY", title: "Theory explanation", answer: trimmed },
                          {
                            sectionId: "MITIGATION",
                            title: "Reverse BFS & Resilience Mitigations",
                            answer: `ScorePreview=${estimatedRubricScore}/10 (${passesRubricPreview ? "APPROVED_ELIGIBLE" : "DS04B_REVISION"})`,
                          },
                        ]
                      : [{ sectionId: "THEORY", title: "Theory explanation", answer: trimmed }],
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
