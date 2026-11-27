"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, FileText, Lock, PlayCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatTenScaleScore } from "@/lib/format/course-display";
import { DetailPanel } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Badge } from "@/components/ui/badge";
import type { Response } from "@/lib/api/contracts";
import type { StudentLabLatestReview } from "@/features/workspaces/course-access";
import { StudioSnapshotPreviewCard } from "@/features/runtime/studio-evidence";
import { buildSmartSnapshotPlan } from "@/features/runtime/studio-smart-snapshot";

export function labSubmissionDraftKey(
  userId: string | null | undefined,
  workspaceId: string,
  assignmentId: string,
) {
  return `mavis:lab-v2-draft:${userId || "anon"}:${workspaceId}:${assignmentId}`;
}

type StudioStateData = Response<"studioState">;

type SnapshotPreviewItem = {
  id: string;
  sessionId?: string | undefined;
  capturedAt?: string | undefined;
  explanation?: string | undefined;
  digest?: string | undefined;
  hasVideo?: boolean | undefined;
};

export function LabSubmissionV2({
  workspaceId,
  assignmentId,
  labOrder: _labOrder,
  labTitle,
  labMode,
  runtimeSessionId,
  capturedSnapshotCount,
  studioStateLoading,
  runtimeEvidenceHref,
  initialSubmission,
  initialReview,
  hasReferenceArch = true,
  essayPrompt,
  studioInstructions,
  studioSessionData,
  capturedSnapshots = [],
  quizSummary: _quizSummary,
  nextModuleHref: _nextModuleHref,
  nextModuleTitle: _nextModuleTitle,
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
  essayPrompt?: string | undefined;
  studioInstructions?: string | undefined;
  studioSessionData?: StudioStateData | undefined;
  capturedSnapshots?: SnapshotPreviewItem[] | undefined;
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
  const { locale, t } = useLocale();
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

  const submittedAnswer =
    latest?.studentSnapshots?.[0]?.writtenExplanation?.trim() ||
    latest?.submissionNotes?.trim() ||
    "";

  // Exercise info summary (strictly objective facts — no auto-grading score shown to students).
  const smartPlan = useMemo(
    () =>
      studioSessionData
        ? buildSmartSnapshotPlan(studioSessionData, {
            locale: locale === "en" ? "en" : "vi",
            includeAutoCheck: false,
          })
        : null,
    [studioSessionData, locale],
  );
  const confirmedActions = useMemo(
    () => (studioSessionData?.actions ?? []).filter((a) => a.status === "CONFIRMED"),
    [studioSessionData?.actions],
  );
  const lockedPrediction = studioSessionData?.prediction?.predictedServices ?? [];
  const effectiveDescription = studioInstructions?.trim() || essayPrompt?.trim() || "";

  const studioPracticeSummary = studio && (effectiveDescription || smartPlan || confirmedActions.length > 0) && (
    <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Target className="size-4 text-primary" aria-hidden="true" />
            {labTitle || t("Lab Practice Info", "Thông tin bài thực hành Lab")}
          </span>
          {smartPlan && (
            <span
              className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-slate-950"
              style={{ backgroundColor: smartPlan.accentColor }}
            >
              {smartPlan.badge}
            </span>
          )}
        </div>
        {runtimeEvidenceHref && (!latest || revising) && (
          <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-[11px]">
            <Link href={runtimeEvidenceHref}>
              <Camera className="mr-1 size-3" aria-hidden="true" />
              {t("Open Studio to add media", "Mở lại Studio để bổ sung ảnh/video")}
            </Link>
          </Button>
        )}
      </div>

      {effectiveDescription && (
        <div className="space-y-1 rounded-lg border bg-background/90 p-3">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {t("Assignment prompt", "Đề bài tự luận")}
          </p>
          <MarkdownPreview markdown={effectiveDescription} />
        </div>
      )}

      {(confirmedActions.length > 0 || lockedPrediction.length > 0) && (
        <div className="flex flex-wrap gap-3 pt-0.5">
          {confirmedActions.length > 0 && (
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <PlayCircle className="size-3.5" aria-hidden="true" />
                {t("Actions executed", "Thao tác đã thực hiện")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {confirmedActions.map((act) => (
                  <span
                    key={act.actionId}
                    className="rounded-md border bg-background px-2 py-0.5 font-mono text-[11px] font-medium text-foreground"
                  >
                    {act.action} {act.service}
                    {act.replicas ? ` ×${act.replicas}` : ""}
                    {act.cpuPercent ? ` (${act.cpuPercent}%)` : ""}
                    {act.targetRps ? ` (${act.targetRps} RPS)` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          {lockedPrediction.length > 0 && (
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Lock className="size-3" aria-hidden="true" />
                {t("Locked prediction", "Dự đoán đã khóa")}
              </span>
              <div className="flex flex-wrap gap-1">
                {lockedPrediction.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-md border border-indigo-300/60 bg-indigo-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-800 dark:text-indigo-200"
                  >
                    {svc}
                  </span>
                ))}
              </div>
              {studioSessionData?.prediction?.rationale?.trim() && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{t("Hypothesis:", "Giả thuyết:")} </span>
                  {studioSessionData.prediction.rationale.trim()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const visualMediaGallery = capturedSnapshots.length > 0 && (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Camera className="size-4 text-primary" aria-hidden="true" />
          {t(
            `Captured Snapshots & Videos (${capturedSnapshots.length})`,
            `Ảnh Snapshot & Video thực hành (${capturedSnapshots.length})`,
          )}
        </p>
        <span className="text-xs text-muted-foreground">
          {t(
            "Click any snapshot to zoom full screen",
            "Nhấn vào ảnh để phóng to kiểm tra trước khi nộp",
          )}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {capturedSnapshots.map((snap, index) => (
          <StudioSnapshotPreviewCard
            key={snap.id}
            sessionId={snap.sessionId || runtimeSessionId || ""}
            snapshot={{
              id: snap.id,
              capturedAt: snap.capturedAt || new Date().toISOString(),
              explanation: snap.explanation || "",
              ...(snap.digest ? { digest: snap.digest } : {}),
              ...(snap.hasVideo ? { hasVideo: true } : {}),
            }}
            index={index}
            isLight
            exerciseBadge={smartPlan?.badge}
            accentColor={smartPlan?.accentColor}
          />
        ))}
      </div>
    </div>
  );

  if (latest && !revising) {
    return (
      <div id="lab-submit">
        <DetailPanel
          title={t("Written Assignment & Submission", "Bài tập tự luận & Nộp bài")}
        >
          <div className="space-y-4 rounded-xl border border-emerald-300/70 bg-emerald-500/5 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("Submitted", "Đã nộp bài")}
                {latest.submittedAt ? ` · ${new Date(latest.submittedAt).toLocaleString()}` : ""}
              </p>
              {(!activeReview ||
                activeReview.status === "PENDING" ||
                activeReview.status === "DRAFT") && (
                <Badge variant="secondary">
                  {t("Waiting for Lecturer grading", "Đang chờ Giảng viên chấm điểm")}
                </Badge>
              )}
            </div>

            {studioPracticeSummary}
            {visualMediaGallery}

            {!studio && essayPrompt?.trim() && (
              <div className="space-y-1.5 rounded-md border bg-background p-3 text-xs">
                <p className="font-semibold text-muted-foreground">
                  {t("Assignment prompt", "Đề bài tự luận")}
                </p>
                <MarkdownPreview markdown={essayPrompt} />
              </div>
            )}

            {submittedAnswer && (
              <div className="space-y-1.5 rounded-md border bg-background/95 p-3 text-xs">
                <p className="font-semibold text-muted-foreground">
                  {t("Your submitted written assignment", "Bài làm tự luận đã nộp")}
                </p>
                <p className="whitespace-pre-wrap leading-5 text-foreground">{submittedAnswer}</p>
              </div>
            )}

            {activeReview &&
              activeReview.status !== "PENDING" &&
              activeReview.status !== "DRAFT" && (() => {
                const needsRevision =
                  activeReview.status === "RETURNED" || activeReview.labOutcome === "NEEDS_REVISION";
                const snapGrades =
                  "snapshotGrades" in activeReview && Array.isArray(activeReview.snapshotGrades)
                    ? activeReview.snapshotGrades
                    : [];
                return (
                <div className="space-y-2 rounded-md border bg-background p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={needsRevision ? "warning" : "success"}>
                      {needsRevision
                        ? t("Needs revision — resubmit", "Cần chỉnh sửa & nộp lại")
                        : t("Graded by Lecturer", "Giảng viên đã chấm điểm")}
                    </Badge>
                    {activeReview.score !== null && (
                      <span
                        className={`rounded-md px-2 py-0.5 font-bold ${
                          needsRevision
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
                        }`}
                      >
                        {formatTenScaleScore(
                          activeReview.score,
                          "scoreTenScale" in activeReview ? activeReview.scoreTenScale : undefined,
                        )}
                      </span>
                    )}
                  </div>
                  {needsRevision &&
                    typeof activeReview.score === "number" &&
                    activeReview.score > 50 && (
                      <p className="rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                        {t(
                          "Every required rubric item must score strictly above 5.0 / 10 to pass, even if the overall average is above 5.0.",
                          "Mọi mục chấm bắt buộc đều phải đạt > 5.0 / 10 để qua bài Lab, kể cả khi điểm trung bình trên 5.0.",
                        )}
                      </p>
                    )}
                  {snapGrades.length > 0 && (
                    <div className="space-y-1">
                      {snapGrades.map((g, idx) => (
                        <div
                          key={`${g.snapshotId}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1"
                        >
                          <span className="font-medium">
                            {(() => {
                              const rawTitle = (g.title || g.snapshotId).trim();
                              if (/^theory explanation$/i.test(rawTitle) || /^written assignment$/i.test(rawTitle)) {
                                return t("Written assignment", "Bài làm tự luận");
                              }
                              const snapMatch = /^studio snapshot\s*#?(\d+)$/i.exec(rawTitle);
                              if (snapMatch) {
                                return t(`Studio snapshot ${snapMatch[1]}`, `Ảnh chụp Studio #${snapMatch[1]}`);
                              }
                              const vidMatch = /^studio video\s*#?(\d+)$/i.exec(rawTitle);
                              if (vidMatch) {
                                return t(`Studio video ${vidMatch[1]}`, `Video Studio #${vidMatch[1]}`);
                              }
                              return rawTitle;
                            })()}
                          </span>
                          <Badge variant={g.score > 5 ? "success" : "warning"}>
                            {g.score.toFixed(2)} / 10
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeReview.summary && (
                    <p className="whitespace-pre-wrap">{activeReview.summary}</p>
                  )}
                </div>
                );
              })()}

            {(activeReview?.status === "RETURNED" || activeReview?.labOutcome === "NEEDS_REVISION") && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
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
                        } catch {
                          // Ignore storage quota / private-mode restrictions
                        }
                      }
                    }
                    setRevising(true);
                  }}
                >
                  {t("Revise and resubmit", "Sửa & nộp lại")}
                </Button>
              </div>
            )}
          </div>
        </DetailPanel>
      </div>
    );
  }

  return (
    <div id="lab-submit">
      <DetailPanel
        title={t("Written Assignment & Submission", "Bài tập tự luận & Nộp bài")}
      >
        <div className="space-y-4">
          {revising && activeReview && (activeReview.status === "RETURNED" || activeReview.labOutcome === "NEEDS_REVISION") && (
            <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-amber-900 dark:text-amber-200">
                  {t("Lecturer feedback to address", "Nhận xét của Giảng viên cần chỉnh sửa")}
                </span>
                {activeReview.score !== null && (
                  <span className="rounded bg-amber-200/80 px-2 py-0.5 font-bold text-amber-950 dark:bg-amber-500/25 dark:text-amber-100">
                    {formatTenScaleScore(
                      activeReview.score,
                      "scoreTenScale" in activeReview ? activeReview.scoreTenScale : undefined,
                    )}
                  </span>
                )}
              </div>
              {activeReview.summary && (
                <p className="whitespace-pre-wrap text-amber-950 dark:text-amber-100">
                  {activeReview.summary}
                </p>
              )}
            </div>
          )}
          {studioPracticeSummary}

          {!studio &&
            (essayPrompt?.trim() ? (
              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3.5 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("Assignment prompt", "Đề bài tự luận")}
                </p>
                <MarkdownPreview markdown={essayPrompt} />
              </div>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {hasReferenceArch
                  ? t(
                      "Summarize the architecture boundaries and key design trade-offs from the sample repository.",
                      "Tổng hợp cấu trúc kiến trúc và các đánh đổi thiết kế chính từ kho mã nguồn tham chiếu.",
                    )
                  : t(
                      "Summarize the core concepts from this Module in your own words.",
                      "Tổng hợp các ý chính của Module bằng ngôn ngữ của bạn.",
                    )}
              </p>
            ))}

          {visualMediaGallery}

          <label className="block space-y-1.5 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                {studio
                  ? t(
                      "Your written assignment & Studio observations",
                      "Bài làm tự luận & kết quả thực hành Studio của bạn",
                    )
                  : t("Your written assignment", "Bài làm tự luận của bạn")}
              </span>
              {studio && capturedSnapshots && capturedSnapshots.length > 0 && (() => {
                const filledNotes = capturedSnapshots
                  .map((snap, idx) => {
                    const text = snap.explanation?.trim();
                    return text ? `${idx + 1}. ${text}` : "";
                  })
                  .filter(Boolean)
                  .join("\n");
                const notesLoading = studioStateLoading && !filledNotes;
                if (!filledNotes && !notesLoading) return null;
                return (
                  <button
                    type="button"
                    disabled={notesLoading}
                    onClick={() => {
                      if (!filledNotes) return;
                      setAnswer(filledNotes);
                      try {
                        window.localStorage.setItem(draftKey, filledNotes);
                      } catch {
                        // Ignore storage quota / private-mode restrictions
                      }
                    }}
                    className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    {notesLoading
                      ? t("Loading snapshot notes…", "Đang tải ghi chú Snapshot…")
                      : t("Fill from Snapshot notes", "Điền từ ghi chú Snapshot")}
                  </button>
                );
              })()}
            </span>
            <textarea
              className="min-h-36 w-full rounded-lg border bg-background p-3 text-sm"
              placeholder={
                studio
                  ? t(
                      "Summarize what you observed in MAVIS Studio and write your module assignment response…",
                      "Trình bày kết quả quan sát trong MAVIS Studio và nội dung bài làm tự luận của bạn…",
                    )
                  : t("Write your answer here…", "Nhập nội dung bài làm tự luận của bạn tại đây…")
              }
              value={answer}
              maxLength={20000}
              onChange={(event) => {
                const next = event.target.value;
                setAnswer(next);
                try {
                  if (next) window.localStorage.setItem(draftKey, next);
                  else window.localStorage.removeItem(draftKey);
                } catch {
                  // Ignore storage quota / private-mode restrictions
                }
              }}
              aria-label={t("Written assignment response", "Nội dung bài làm tự luận")}
            />
          </label>

          {studio && runtimeSessionId && !missingStudioSnapshot && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {t(
                "Studio Live evidence is ready — your snapshots/video and session log will be submitted for Lecturer grading.",
                "Minh chứng Studio Live đã sẵn sàng — ảnh chụp/video và thông tin phiên sẽ được gửi thẳng cho Giảng viên chấm điểm.",
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
                  "Missing requirement: Capture at least one Snapshot or record a Video in Studio.",
                  "Cần hoàn thành: Chụp ít nhất 1 ảnh Snapshot hoặc quay Video trong Studio.",
                )}
              </span>
              {runtimeEvidenceHref && (
                <Button asChild size="sm" variant="outline">
                  <Link href={runtimeEvidenceHref}>
                    {t("Capture Snapshot in Studio", "Mở Studio để chụp ảnh / quay video")}
                  </Link>
                </Button>
              )}
            </div>
          )}
          {submit.error && (
            <p role="alert" className="text-sm text-destructive">
              {t(submit.error.message)}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              <span>
                {answer.trim().length} {t("characters", "ký tự")}
              </span>
              {!canSubmit && answer.trim().length === 0 && (
                <span className="ml-2 text-amber-700 dark:text-amber-300">
                  ·{" "}
                  {t(
                    "Write your assignment response before submitting",
                    "Vui lòng nhập bài làm tự luận trước khi nộp",
                  )}
                </span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {revising && latest && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submit.isPending}
                  onClick={() => setRevising(false)}
                >
                  {t("Cancel", "Hủy chỉnh sửa")}
                </Button>
              )}
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
                        targetViewOrService: smartPlan?.primaryService || "studio-lab",
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
                      { sectionId: "THEORY", title: "Written assignment", answer: trimmed },
                    ],
                    ...(snapshots.length > 0 ? { studentSnapshots: snapshots } : {}),
                  },
                  {
                    onSuccess: () => {
                      try {
                        window.localStorage.removeItem(draftKey);
                      } catch {
                        // Ignore storage cleanup errors
                      }
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
              {submit.isPending
                ? t("Submitting…", "Đang nộp bài…")
                : t("Submit", "Nộp bài")}
            </Button>
            </div>
          </div>
        </div>
      </DetailPanel>
    </div>
  );
}
