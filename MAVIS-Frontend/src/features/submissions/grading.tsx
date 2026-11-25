"use client";
import { useEffect, useState } from "react";
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

function formatGradeRowTitle(rawTitle: string, locale: string): string {
  const trimmed = rawTitle.trim();
  if (locale !== "vi") return trimmed;
  if (/^theory explanation$/i.test(trimmed)) return "Giải thích của sinh viên";
  const studioMatch = trimmed.match(/^studio snapshot\s+(\d+)$/i);
  if (studioMatch) return `Ảnh chụp Studio #${studioMatch[1]}`;
  return trimmed;
}

export function GradingPanel({
  submissionId,
  studentSnapshots,
  guidedLab,
}: {
  submissionId: string;
  studentSnapshots?: StudentSnapshotItem[] | undefined;
  guidedLab: boolean;
}) {
  const { locale, t } = useLocale();
  const canReview = usePermission("submission:review");
  const query = useApiQuery(
    "submissionReview",
    { submissionId },
    { refreshMs: canReview ? 60000 : 15000 },
  );
  return (
    <DetailPanel title={t("Lecturer review & grade")}>
      <RequestState query={query}>
        {query.data && (
          <div className="space-y-3">
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
              (new Set(query.data.snapshotGrades.map((g) => g.score)).size > 1 ||
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
                          {formatGradeRowTitle(g.title || g.snapshotId, locale)}
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
            {query.data.status === "PENDING" && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Awaiting lecturer review. Enter a score (0–10) and feedback below.",
                  "Bài đang chờ chấm. Nhập điểm (0–10) và nhận xét bên dưới.",
                )}
              </p>
            )}
            {query.data.summary && stripLegacySubmissionNoise(query.data.summary) && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {stripLegacySubmissionNoise(query.data.summary)}
              </p>
            )}
            {query.data.status === "RETURNED" && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Apply the requested changes in your working project, save the new model/diagram revisions and submit again from the assignment. This submission remains unchanged.",
                )}
              </p>
            )}
            {query.data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                {query.data.lecturerName} · {new Date(query.data.updatedAt).toLocaleString()}
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
}: {
  review: Response<"submissionReview">;
  studentSnapshots?: StudentSnapshotItem[] | undefined;
  guidedLab: boolean;
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

  const manualTenValue = score.trim() === "" ? null : Number(score);
  const manualScale100 =
    manualTenValue !== null && Number.isFinite(manualTenValue)
      ? Number((manualTenValue * 10).toFixed(2))
      : null;

  const value = usePerSnapshot ? computedScale100 : manualScale100;
  const valid = usePerSnapshot
    ? parsedSnapshots.complete
    : manualTenValue === null ||
      (Number.isFinite(manualTenValue) &&
        manualTenValue >= 0 &&
        manualTenValue <= 10 &&
        /^\d+(\.\d{1,2})?$/.test(score));

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
          ? t("Publish this score and summary to the student?")
          : t("Return this submission with change requests?"),
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t(
            "Score above 5.0 / 10 with feedback to pass and unlock the next Lab; 5.0 or lower marks NEEDS REVISION.",
            "Chấm điểm > 5.0 / 10 kèm nhận xét để ĐẠT và mở khóa Lab kế tiếp; ≤ 5.0 sẽ đánh dấu CẦN SỬA LẠI.",
          )}
        </p>
        {!guidedLab && (
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={usePerSnapshot}
              onChange={(e) => {
                setDirty(true);
                setUsePerSnapshot(e.target.checked);
              }}
            />
            <span>{t("Per-snapshot grading (0–10)")}</span>
          </label>
        )}
      </div>
      {guidedLab && !hasFrozenRows && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "This submission has no frozen Snapshot list. Return it with instructions to resubmit.",
            "Bài này thiếu danh sách Snapshot đã đóng băng. Hãy trả bài kèm hướng dẫn nộp lại.",
          )}
        </p>
      )}
      {usePerSnapshot ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="mavis-simple-score" className="text-xs font-semibold text-foreground">
                {t("Score (0–10, > 5.0 pass)", "Điểm chấm (thang 0–10, > 5.0 đạt)")}
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
                aria-label={t("Overall score for all snapshots", "Điểm chấm bài nộp")}
                placeholder="0.0 – 10.0"
                value={bulkScore}
                onChange={(e) => applyScoreToAllSnapshots(e.target.value)}
                className="w-32 bg-background font-mono text-sm font-semibold"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {["9.5", "8.5", "7.0", "5.0"].map((preset) => {
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
                  const displayTitle = formatGradeRowTitle(row.title, locale);
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
        <div className="space-y-2">
          <FormField label={t("Lecturer score (0–10, > 5.0 pass)", "Điểm Giảng viên (0–10, > 5.0 đạt)")}>
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
                className="max-w-48"
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {["10", "9", "8", "7", "5"].map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
                onClick={() => {
                  setDirty(true);
                  setScore(preset);
                }}
              >
                {preset}/10
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {[
            {
              en: "Accurate analysis and clear Studio evidence.",
              vi: "Phân tích đúng nguyên nhân và minh chứng Studio rõ ràng.",
            },
            {
              en: "Lab actions and observations meet the requirements.",
              vi: "Thao tác thực hành và quan sát đạt yêu cầu bài Lab.",
            },
            {
              en: "Evidence is incomplete — please capture clearer proof and resubmit.",
              vi: "Minh chứng chưa đầy đủ — vui lòng chụp/quay rõ hơn và nộp lại.",
            },
          ].map((item) => {
            const text = t(item.en, item.vi);
            return (
              <button
                key={item.en}
                type="button"
                className="rounded border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setDirty(true);
                  setSummary((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
                }}
              >
                + {text}
              </button>
            );
          })}
        </div>
      </div>
      <FormField label={t("Feedback for student", "Nhận xét & phản hồi cho sinh viên")}>
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            placeholder={t(
              "Write brief feedback on the student's snapshots, video, and explanation...",
              "Nhập nhận xét ngắn gọn về ảnh chụp, video và phần giải thích của sinh viên...",
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
          {usePerSnapshot
            ? t("Enter a score between 0.0 and 10.0 for every snapshot (above 5.0 to pass).")
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={save.isPending || (usePerSnapshot ? parsedSnapshots.invalid : !valid)}
          onClick={() => submit("DRAFT")}
        >
          {t("Save grading draft", "Lưu nháp")}
        </Button>
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
          {t("Complete & publish grade", "Hoàn tất & Công bố điểm")}
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
    </div>
  );
}
