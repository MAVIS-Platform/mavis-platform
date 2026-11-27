"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApiMutation, useApiQuery, usePermission } from "@/hooks/use-api";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { FormField } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatTenScaleScore } from "@/lib/format/course-display";
import { stripLegacySubmissionNoise } from "./submission-text";
import type { Response } from "@/lib/api/contracts";
import type { SnapshotGradeItem, StudentSnapshotItem } from "@/types/domain";

const PASSING_SCORE = 50;
const SNAPSHOT_PASS_EXCLUSIVE = 5.0;

export interface SubmissionOutcomeInput {
  score: number | null;
  labOutcome?: "PENDING" | "PASSED" | "NEEDS_REVISION" | null | undefined;
  snapshotGrades?: ReadonlyArray<{ score: number }> | null | undefined;
  status?: string | null | undefined;
}

export function resolveSubmissionOutcome(
  review: SubmissionOutcomeInput,
): "PASS" | "NEEDS REVISION" | null {
  if (review.status === "DRAFT" || review.status === "PENDING") return null;
  if (review.labOutcome === "PASSED") return "PASS";
  if (review.labOutcome === "NEEDS_REVISION") return "NEEDS REVISION";
  // Older C04 responses may not include labOutcome. The released review state
  // still wins over score-derived fallbacks: a returned submission is never a pass.
  if (review.status === "RETURNED") return "NEEDS REVISION";
  if (review.snapshotGrades && review.snapshotGrades.length > 0) {
    return review.snapshotGrades.every((g) => g.score > SNAPSHOT_PASS_EXCLUSIVE)
      ? "PASS"
      : "NEEDS REVISION";
  }
  if (review.score === null) return null;
  return review.score > PASSING_SCORE ? "PASS" : "NEEDS REVISION";
}

function isVideoSnapshotItem(
  snapshotId: string | undefined,
  studentSnapshots?: StudentSnapshotItem[],
): boolean {
  if (!snapshotId || !studentSnapshots?.length) return false;
  const item = studentSnapshots.find((s) => s.snapshotId === snapshotId);
  if (!item) return false;
  return /\bvideo\s+\d+(\.\d+)?s\b|\bvideo\b/i.test(`${item.title ?? ""} ${item.writtenExplanation ?? ""}`);
}

function formatGradeRowTitle(rawTitle: string, locale: string, isVideo = false): string {
  const trimmed = rawTitle.trim();
  const studioMatch = trimmed.match(/^studio snapshot\s+(\d+)$/i);
  if (studioMatch) {
    if (locale !== "vi") {
      return isVideo ? `Studio video #${studioMatch[1]}` : `Studio snapshot #${studioMatch[1]}`;
    }
    return isVideo ? `Video Studio #${studioMatch[1]}` : `Ảnh chụp Studio #${studioMatch[1]}`;
  }
  if (locale !== "vi") return /^theory explanation$/i.test(trimmed) ? "Written assignment" : trimmed;
  if (/^theory explanation$/i.test(trimmed) || /^written assignment$/i.test(trimmed)) {
    return "Bài làm tự luận";
  }
  return trimmed;
}

export function GradingPanel({
  submissionId,
  studentSnapshots,
  guidedLab,
  reviseHref,
  studioAssistant,
}: {
  submissionId: string;
  studentSnapshots?: StudentSnapshotItem[] | undefined;
  guidedLab: boolean;
  reviseHref?: string | undefined;
  studioAssistant?: React.ReactNode | undefined;
}) {
  const { locale, t } = useLocale();
  const canReview = usePermission("submission:review");
  const query = useApiQuery(
    "submissionReview",
    { submissionId },
    { refreshMs: canReview ? 60000 : 15000 },
  );
  return (
    <DetailPanel
      title={
        canReview
          ? t("Grading & Feedback", "Chấm điểm & Nhận xét")
          : t("Grading & Feedback", "Kết quả chấm điểm")
      }
    >
      <RequestState query={query}>
        {query.data && (
          <div className="space-y-3">
            {canReview && studioAssistant}
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                status={query.data.status}
                variant={
                  query.data.status === "GRADED"
                    ? "success"
                    : query.data.status === "RETURNED"
                      ? "warning"
                      : "outline"
                }
              />
              {query.data.score !== null && (
                <span className="mavis-tabular text-xl font-semibold">
                  {formatTenScaleScore(query.data.score)}
                </span>
              )}
              {resolveSubmissionOutcome(query.data) && (
                <Badge
                  variant={resolveSubmissionOutcome(query.data) === "PASS" ? "success" : "warning"}
                >
                  {resolveSubmissionOutcome(query.data) === "PASS"
                    ? t("PASS", "ĐẠT")
                    : t("NEEDS REVISION", "CẦN SỬA LẠI")}
                </Badge>
              )}
            </div>
            {query.data.snapshotGrades &&
              query.data.snapshotGrades.length > 0 &&
              (resolveSubmissionOutcome(query.data) === "NEEDS REVISION" ||
                new Set(query.data.snapshotGrades.map((g) => g.score)).size > 1 ||
                query.data.snapshotGrades.some((g) => Boolean(g.comment?.trim()))) && (
                <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3 text-xs">
                  <p className="font-medium">
                    {t("Per-item grading breakdown (> 5.0 / 10 required)", "Chi tiết điểm từng mục (> 5.0 / 10 đạt)")}
                  </p>
                  {query.data.snapshotGrades.map((g, idx) => (
                    <div
                      key={`${g.snapshotId}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatGradeRowTitle(
                            g.title || g.snapshotId,
                            locale,
                            isVideoSnapshotItem(g.snapshotId, studentSnapshots),
                          )}
                        </p>
                        {g.comment && <p className="text-muted-foreground">{g.comment}</p>}
                      </div>
                      <Badge variant={g.score > SNAPSHOT_PASS_EXCLUSIVE ? "success" : "warning"}>
                        {g.score.toFixed(2)} / 10
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            {query.data.status === "PENDING" && !canReview && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Your submission is awaiting Lecturer review.",
                  "Bài làm của bạn đang chờ Giảng viên chấm điểm.",
                )}
              </p>
            )}
            {query.data.summary && stripLegacySubmissionNoise(query.data.summary) && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {stripLegacySubmissionNoise(query.data.summary)}
              </p>
            )}
            {!canReview &&
              (query.data.status === "GRADED" || query.data.status === "RETURNED") &&
              studioAssistant}
            {(query.data.status === "RETURNED" || query.data.labOutcome === "NEEDS_REVISION") && !canReview && (
              <div className="space-y-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  {t(
                    "Open the Written Assignment & Submission step to revise your work and resubmit.",
                    "Hãy mở lại mục Bài tập tự luận & Nộp bài để chỉnh sửa bài làm và nộp lại.",
                  )}
                </p>
                {reviseHref && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={reviseHref}>
                      {t("Revise and resubmit", "Sửa & nộp lại")}
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {query.data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                {query.data.lecturerName} · {new Date(query.data.updatedAt).toLocaleString()}
              </p>
            )}
            {canReview &&
              guidedLab &&
              query.data.status === "GRADED" &&
              query.data.labOutcome === "PASSED" && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {t(
                    "Passing grade locked — the next Lab has been unlocked for this student.",
                    "Điểm Đạt đã được chốt và mở khóa bài Lab tiếp theo cho sinh viên.",
                  )}
                </p>
              )}
            {canReview &&
              !(
                guidedLab &&
                query.data.status === "GRADED" &&
                query.data.labOutcome === "PASSED"
              ) && (
                <GradeForm
                  key={submissionId}
                  review={query.data}
                  studentSnapshots={studentSnapshots}
                  guidedLab={guidedLab}
                  onReloadLatest={() => {
                    void query.refetch();
                  }}
                />
              )}
          </div>
        )}
      </RequestState>
    </DetailPanel>
  );
}

interface EditableSnapshotGrade {
  snapshotId: string;
  title: string;
  score: string;
  comment: string;
}

export function buildInitialSnapshotGrades(
  review: Response<"submissionReview">,
  studentSnapshots?: StudentSnapshotItem[],
): EditableSnapshotGrade[] {
  if (studentSnapshots?.length) {
    const grades = new Map(review.snapshotGrades?.map((grade) => [grade.snapshotId, grade]));
    return studentSnapshots.map((snapshot) => {
      const grade = grades.get(snapshot.snapshotId);
      return {
        snapshotId: snapshot.snapshotId,
        title: snapshot.title || snapshot.snapshotId,
        score: grade ? String(grade.score) : "",
        comment: grade?.comment ?? "",
      };
    });
  }
  if (review.snapshotGrades?.length) {
    return review.snapshotGrades.map((grade) => ({
      snapshotId: grade.snapshotId,
      title: grade.title || grade.snapshotId,
      score: String(grade.score),
      comment: grade.comment ?? "",
    }));
  }
  return [
    {
      snapshotId: "STEP_1_STATIC",
      title: "Snapshot 1 · Static C1–C3 Architecture & 3E Reasoning",
      score: "",
      comment: "",
    },
    {
      snapshotId: "STEP_4_RUNTIME",
      title: "Snapshot 2 · MAVIS Studio Runtime Stop/Scale Before-After Analysis",
      score: "",
      comment: "",
    },
  ];
}

export function parseSnapshotGradeRows(rows: readonly EditableSnapshotGrade[]) {
  const items: SnapshotGradeItem[] = [];
  let invalid = false;
  for (const row of rows) {
    const input = row.score.trim();
    if (!input) continue;
    const score = Number(input);
    if (!/^\d+(\.\d{1,2})?$/.test(input) || score > 10) {
      invalid = true;
      continue;
    }
    items.push({
      snapshotId: row.snapshotId,
      title: row.title,
      score,
      comment: row.comment.trim() || null,
    });
  }
  return { items, invalid, complete: rows.length > 0 && items.length === rows.length };
}

export function GradeForm({
  review,
  studentSnapshots,
  guidedLab,
  onReloadLatest,
}: {
  review: Response<"submissionReview">;
  studentSnapshots?: StudentSnapshotItem[] | undefined;
  guidedLab: boolean;
  onReloadLatest?: (() => void) | undefined;
}) {
  const { locale, t } = useLocale();
  const save = useApiMutation("gradeSubmission");
  const initialUseSnapshots = Boolean(
    (review.snapshotGrades && review.snapshotGrades.length > 0) ||
    (studentSnapshots && studentSnapshots.length > 0),
  );
  const [preferPerSnapshot, setUsePerSnapshot] = useState(initialUseSnapshots);
  const hasFrozenRows = Boolean(studentSnapshots?.length);
  const usePerSnapshot = guidedLab ? hasFrozenRows : preferPerSnapshot;
  const canPublish = !guidedLab || hasFrozenRows;
  const [syncedRevision, setSyncedRevision] = useState(review.revision);
  const [dirty, setDirty] = useState(false);
  const [snapshotRows, setSnapshotRows] = useState<EditableSnapshotGrade[]>(() =>
    buildInitialSnapshotGrades(review, studentSnapshots),
  );
  const [bulkScore, setBulkScore] = useState(() => {
    const initialRows = buildInitialSnapshotGrades(review, studentSnapshots);
    const nonEmpty = initialRows.map((r) => r.score.trim()).filter(Boolean);
    if (nonEmpty.length === initialRows.length && new Set(nonEmpty).size === 1) {
      return nonEmpty[0] ?? "";
    }
    return review.score === null ? "" : String(Number((review.score / 10).toFixed(2)));
  });
  const [score, setScore] = useState(() =>
    review.score === null ? "" : String(Number((review.score / 10).toFixed(2))),
  );
  const [summary, setSummary] = useState(review.summary);

  const applyScoreToAllSnapshots = (valueStr: string) => {
    const trimmed = valueStr.trim();
    setDirty(true);
    setBulkScore(valueStr);
    if (!trimmed) {
      setSnapshotRows((prev) => prev.map((item) => ({ ...item, score: "" })));
      return;
    }
    const num = Number(trimmed);
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || !Number.isFinite(num) || num < 0 || num > 10) {
      setSnapshotRows((prev) => prev.map((item) => ({ ...item, score: trimmed })));
      return;
    }
    setSnapshotRows((prev) => prev.map((item) => ({ ...item, score: trimmed })));
  };

  useEffect(() => {
    if (review.revision !== syncedRevision) {
      setSyncedRevision(review.revision);
      if (!dirty) {
        setSnapshotRows(buildInitialSnapshotGrades(review, studentSnapshots));
        setScore(review.score === null ? "" : String(Number((review.score / 10).toFixed(2))));
        setSummary(review.summary);
      }
    }
  }, [review, studentSnapshots, syncedRevision, dirty]);

  const parsedSnapshots = parseSnapshotGradeRows(snapshotRows);
  const allSnapshotsPassed = parsedSnapshots.items.every(
    (item) => item.score > SNAPSHOT_PASS_EXCLUSIVE,
  );

  const computedTenScale =
    usePerSnapshot && parsedSnapshots.complete
      ? Number(
          (
            parsedSnapshots.items.reduce((acc, g) => acc + g.score, 0) /
            parsedSnapshots.items.length
          ).toFixed(2),
        )
      : null;

  const computedScale100 =
    computedTenScale !== null ? Number((computedTenScale * 10).toFixed(2)) : null;

  const trimmedScore = score.trim();
  const manualTenValue = trimmedScore === "" ? null : Number(trimmedScore);
  const manualScale100 =
    manualTenValue !== null && Number.isFinite(manualTenValue)
      ? Number((manualTenValue * 10).toFixed(2))
      : null;

  const value = usePerSnapshot ? computedScale100 : manualScale100;
  const tooManyDecimals =
    !usePerSnapshot &&
    manualTenValue !== null &&
    Number.isFinite(manualTenValue) &&
    manualTenValue >= 0 &&
    manualTenValue <= 10 &&
    !/^\d+(\.\d{1,2})?$/.test(trimmedScore);
  const valid = usePerSnapshot
    ? parsedSnapshots.complete
    : manualTenValue === null ||
      (Number.isFinite(manualTenValue) &&
        manualTenValue >= 0 &&
        manualTenValue <= 10 &&
        /^\d+(\.\d{1,2})?$/.test(trimmedScore));

  const outcome = usePerSnapshot
    ? parsedSnapshots.complete
      ? allSnapshotsPassed
        ? "PASS"
        : "NEEDS REVISION"
      : null
    : resolveSubmissionOutcome({ score: value });

  function submit(status: "DRAFT" | "RETURNED" | "GRADED") {
    if (
      save.isPending ||
      (usePerSnapshot && parsedSnapshots.invalid) ||
      (status === "GRADED" && (!valid || !canPublish))
    )
      return;
    if (status !== "DRAFT" && !summary.trim()) return;
    if (!usePerSnapshot) {
      if (status === "GRADED" && (value === null || value <= PASSING_SCORE)) return;
      if (
        !guidedLab &&
        status === "RETURNED" &&
        (!valid || (value !== null && value > PASSING_SCORE))
      )
        return;
    }
    if (
      status !== "DRAFT" &&
      !window.confirm(
        status === "GRADED"
          ? t("Publish this score and summary to the student?", "Công bố điểm số và nhận xét này cho sinh viên?")
          : t("Return this submission with change requests?", "Trả lại bài nộp này kèm yêu cầu chỉnh sửa?"),
      )
    )
      return;
    save.mutate(
      {
        submissionId: review.submissionId,
        expectedRevision: review.revision,
        status,
        score: usePerSnapshot || (guidedLab && !hasFrozenRows) ? null : value,
        summary,
        ...(usePerSnapshot && parsedSnapshots.items.length > 0
          ? { snapshotGrades: parsedSnapshots.items }
          : {}),
      },
      {
        onSuccess: () => {
          setDirty(false);
        },
      },
    );
  }

  return (
    <div className="space-y-3 border-t pt-4">
      {!guidedLab && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={usePerSnapshot}
              onChange={(e) => {
                setDirty(true);
                setUsePerSnapshot(e.target.checked);
              }}
            />
            <span>{t("Per-snapshot grading (0–10)", "Chấm riêng từng mục (0–10)")}</span>
          </label>
        </div>
      )}
      {guidedLab && !hasFrozenRows && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "This submission has no written answer attached. Return it with instructions to resubmit.",
            "Bài nộp chưa có nội dung tự luận đính kèm. Hãy trả bài kèm hướng dẫn nộp lại.",
          )}
        </p>
      )}
      {usePerSnapshot ? (
        <div className="space-y-2.5">
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="mavis-simple-score" className="text-xs font-semibold text-foreground">
                {t("Score (0–10)", "Điểm (0–10)")}
              </label>
              {computedTenScale !== null && (
                <span className="mavis-tabular text-xs font-semibold text-foreground">
                  {computedTenScale.toFixed(2)} / 10
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="mavis-simple-score"
                type="number"
                min={0}
                max={10}
                step="0.01"
                aria-label={t("Score (0–10)", "Điểm (0–10)")}
                placeholder="0 – 10"
                value={bulkScore}
                onChange={(e) => applyScoreToAllSnapshots(e.target.value)}
                className="w-28 bg-background font-mono text-sm font-semibold"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {["10", "9", "8", "7", "5"].map((preset) => {
                  const active = bulkScore.trim() === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "bg-background text-foreground hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      }`}
                      onClick={() => applyScoreToAllSnapshots(preset)}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "> 5.0: Pass and unlock next Module · ≤ 5.0: Needs revision",
                "> 5.0: Đạt và mở khóa Module tiếp theo · ≤ 5.0: Cần sửa lại",
              )}
            </p>
          </div>

          {snapshotRows.length > 1 && (
            <details className="rounded-lg border bg-muted/10 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                {t(
                  `Optional: grade each item separately (${snapshotRows.length})`,
                  `Tùy chọn: chấm riêng từng mục (${snapshotRows.length})`,
                )}
              </summary>
              <div className="mt-2.5 space-y-2">
                {snapshotRows.map((row, idx) => {
                  const num = row.score.trim() === "" ? null : Number(row.score);
                  const isValidCell =
                    num !== null &&
                    Number.isFinite(num) &&
                    num >= 0 &&
                    num <= 10 &&
                    /^\d+(\.\d{1,2})?$/.test(row.score.trim());
                  const displayTitle = formatGradeRowTitle(
                    row.title,
                    locale,
                    isVideoSnapshotItem(row.snapshotId, studentSnapshots),
                  );
                  return (
                    <div
                      key={`${row.snapshotId}-${idx}`}
                      className="space-y-1.5 rounded-md border bg-background p-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium">{displayTitle}</span>
                        {isValidCell && (
                          <Badge variant={num! > SNAPSHOT_PASS_EXCLUSIVE ? "success" : "warning"}>
                            {num! > SNAPSHOT_PASS_EXCLUSIVE ? t("PASS", "ĐẠT") : t("REVISE", "SỬA")}
                          </Badge>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step="0.01"
                          aria-label={`${t("Score", "Điểm")} — ${row.title}`}
                          placeholder="0.0 – 10.0"
                          value={row.score}
                          onChange={(e) => {
                            setDirty(true);
                            setSnapshotRows((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, score: e.target.value } : item,
                              ),
                            );
                          }}
                        />
                        <Input
                          aria-label={`${t("Snapshot comment (optional)")} — ${row.title}`}
                          placeholder={t("Optional comment", "Nhận xét riêng (tùy chọn)")}
                          maxLength={2000}
                          value={row.comment}
                          onChange={(e) => {
                            setDirty(true);
                            setSnapshotRows((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, comment: e.target.value } : item,
                              ),
                            );
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ) : guidedLab ? null : (
        <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5">
          <FormField label={t("Score (0–10)", "Điểm (0–10)")}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={10}
                step="0.01"
                value={score}
                onChange={(e) => {
                  setDirty(true);
                  setScore(e.target.value);
                }}
                className="max-w-28 bg-background font-mono text-sm font-semibold"
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {["10", "9", "8", "7", "5"].map((preset) => {
              const active = score.trim() === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "bg-background text-foreground hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                  }`}
                  onClick={() => {
                    setDirty(true);
                    setScore(preset);
                  }}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "> 5.0: Pass and unlock next Module · ≤ 5.0: Needs revision",
              "> 5.0: Đạt và mở khóa Module tiếp theo · ≤ 5.0: Cần sửa lại",
            )}
          </p>
        </div>
      )}
      <FormField label={t("Feedback for student", "Nhận xét cho sinh viên")}>
        {(props) => (
          <Textarea
            {...props}
            rows={5}
            placeholder={t(
              "Write concise feedback for the student…",
              "Nhập nhận xét ngắn gọn cho sinh viên…",
            )}
            value={summary}
            maxLength={10000}
            onChange={(e) => {
              setDirty(true);
              setSummary(e.target.value);
            }}
          />
        )}
      </FormField>
      {!valid && (!usePerSnapshot || parsedSnapshots.invalid) && (
        <p role="alert" className="text-sm text-destructive">
          {tooManyDecimals
            ? t(
                "Use at most 2 decimal places (e.g., 4.55 or 8.5).",
                "Chỉ được nhập tối đa 2 chữ số thập phân (vd: 4.55 hoặc 8.5).",
              )
            : usePerSnapshot
              ? t(
                  "Enter a score between 0.0 and 10.0 for every snapshot (max 2 decimal places; above 5.0 to pass).",
                  "Nhập điểm từ 0.0 đến 10.0 cho từng mục (tối đa 2 chữ số thập phân; trên 5.0 để đạt).",
                )
              : t(
                  "Enter a score between 0 and 10 with at most two decimal places.",
                  "Nhập điểm từ 0 đến 10 với tối đa hai chữ số thập phân.",
                )}
        </p>
      )}
      {usePerSnapshot && !parsedSnapshots.complete && !parsedSnapshots.invalid && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "You can save a partial draft. Enter all Snapshot scores before publishing.",
            "Bạn có thể lưu nháp. Hãy nhập điểm cho mọi Snapshot trước khi công bố.",
          )}
        </p>
      )}
      {valid && outcome && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            outcome === "PASS"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          }`}
        >
          <div className="space-y-0.5">
            <span className="font-semibold">
              {t("Calculated outcome", "Kết quả dự kiến")}:{" "}
              {outcome === "PASS"
                ? t("PASS — unlocks the next Lab", "ĐẠT — tự động mở khóa Lab kế tiếp")
                : t(
                    "NEEDS REVISION — next Lab remains locked",
                    "CẦN SỬA LẠI — Lab kế tiếp vẫn khóa",
                  )}
            </span>
            {computedTenScale !== null && (
              <p className="mavis-tabular opacity-85">
                {t("Overall rubric score", "Tổng điểm Rubric")}: {computedTenScale.toFixed(2)} / 10
              </p>
            )}
          </div>
          <Badge variant={outcome === "PASS" ? "success" : "warning"}>
            {outcome === "PASS" ? t("PASS", "ĐẠT") : t("NEEDS REVISION", "CẦN SỬA LẠI")}
          </Badge>
        </div>
      )}
      {usePerSnapshot && parsedSnapshots.complete && !allSnapshotsPassed && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          {t(
            "At least one snapshot scored <= 5.0 / 10 — publishing or returning this review will set Lab Outcome to NEEDS REVISION.",
          )}
        </p>
      )}
      {!summary.trim() && value !== null && (
        <p
          role="status"
          className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-medium text-foreground"
        >
          {t("Add an overall review before publishing or returning this snapshot.")}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button
          variant="outline"
          disabled={
            save.isPending ||
            (usePerSnapshot ? parsedSnapshots.invalid : !valid) ||
            (review.status === "GRADED" && !summary.trim())
          }
          onClick={() => submit("DRAFT")}
        >
          {t("Save draft", "Lưu nháp")}
        </Button>
        {!canPublish && (
          <Button
            variant="outline"
            disabled={save.isPending || !summary.trim()}
            onClick={() => submit("RETURNED")}
          >
            {t("Return for revision", "Trả bài yêu cầu nộp lại")}
          </Button>
        )}
        <Button
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={
            save.isPending ||
            !canPublish ||
            !valid ||
            value === null ||
            !summary.trim()
          }
          onClick={() =>
            submit(
              !usePerSnapshot && value !== null && value <= PASSING_SCORE
                ? "RETURNED"
                : "GRADED",
            )
          }
        >
          {t("Grade & Publish", "Chấm điểm & Công bố")}
        </Button>
      </div>
      {save.error && (
        <ErrorState
          error={save.error}
          onRetry={() => {
            save.reset();
            setDirty(false);
            onReloadLatest?.();
          }}
        />
      )}
    </div>
  );
}
