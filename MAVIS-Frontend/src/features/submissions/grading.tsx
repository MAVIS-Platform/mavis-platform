"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, usePermission } from "@/hooks/use-api";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { FormField } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
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
  if (review.status === "DRAFT") return null;
  if (review.labOutcome === "PASSED") return "PASS";
  if (review.labOutcome === "NEEDS_REVISION") return "NEEDS REVISION";
  if (review.snapshotGrades && review.snapshotGrades.length > 0) {
    return review.snapshotGrades.every((g) => g.score > SNAPSHOT_PASS_EXCLUSIVE)
      ? "PASS"
      : "NEEDS REVISION";
  }
  if (review.score === null) return null;
  return review.score > PASSING_SCORE ? "PASS" : "NEEDS REVISION";
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
  const { t } = useLocale();
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
                <span className="text-xl font-semibold">{query.data.score} / 100</span>
              )}
              {resolveSubmissionOutcome(query.data) && (
                <Badge
                  variant={
                    resolveSubmissionOutcome(query.data) === "PASS"
                      ? "success"
                      : "warning"
                  }
                >
                  {resolveSubmissionOutcome(query.data)}
                </Badge>
              )}
            </div>
            {query.data.snapshotGrades && query.data.snapshotGrades.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3 text-xs">
                <p className="font-medium">{t("Per-snapshot grading results (> 5.0 / 10 required)")}</p>
                {query.data.snapshotGrades.map((g, idx) => (
                  <div
                    key={`${g.snapshotId}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{g.title || g.snapshotId}</p>
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
                {t("Awaiting lecturer review. Inline feedback may be available below.")}
              </p>
            )}
            {query.data.summary && (
              <p className="whitespace-pre-wrap break-words text-sm">{query.data.summary}</p>
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
            {canReview && !(guidedLab && query.data.status === "GRADED" && query.data.labOutcome === "PASSED") && (
              <GradeForm
                key={query.data.revision}
                review={query.data}
                studentSnapshots={studentSnapshots}
                guidedLab={guidedLab}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t("Refresh review")}
            </Button>
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

function GradeForm({
  review,
  studentSnapshots,
  guidedLab,
}: {
  review: Response<"submissionReview">;
  studentSnapshots?: StudentSnapshotItem[] | undefined;
  guidedLab: boolean;
}) {
  const { t } = useLocale();
  const save = useApiMutation("gradeSubmission");
  const initialUseSnapshots = Boolean(
    (review.snapshotGrades && review.snapshotGrades.length > 0) ||
      (studentSnapshots && studentSnapshots.length > 0),
  );
  const [preferPerSnapshot, setUsePerSnapshot] = useState(initialUseSnapshots);
  const hasFrozenRows = Boolean(studentSnapshots?.length);
  const usePerSnapshot = guidedLab ? hasFrozenRows : preferPerSnapshot;
  const canPublish = !guidedLab || hasFrozenRows;
  const [snapshotRows, setSnapshotRows] = useState<EditableSnapshotGrade[]>(() =>
    buildInitialSnapshotGrades(review, studentSnapshots),
  );
  const [score, setScore] = useState(review.score === null ? "" : String(review.score));
  const [summary, setSummary] = useState(review.summary);

  const parsedSnapshots = parseSnapshotGradeRows(snapshotRows);
  const allSnapshotsPassed = parsedSnapshots.items.every((item) => item.score > SNAPSHOT_PASS_EXCLUSIVE);

  const computedScale100 =
    usePerSnapshot && parsedSnapshots.complete
      ? Number(
          (
            (parsedSnapshots.items.reduce((acc, g) => acc + g.score, 0) /
              parsedSnapshots.items.length) *
            10
          ).toFixed(2),
        )
      : null;

  const value = usePerSnapshot
    ? computedScale100
    : score.trim() === ""
      ? null
      : Number(score);
  const valid = usePerSnapshot
    ? parsedSnapshots.complete
    : value === null ||
      (Number.isFinite(value) && value >= 0 && value <= 100 && /^\d+(\.\d{1,2})?$/.test(score));

  const outcome = usePerSnapshot
    ? parsedSnapshots.complete
      ? allSnapshotsPassed
        ? "PASS"
        : "NEEDS REVISION"
      : null
    : resolveSubmissionOutcome({ score: value });

  function submit(status: "DRAFT" | "RETURNED" | "GRADED") {
    if (save.isPending || (usePerSnapshot && parsedSnapshots.invalid)
        || (status === "GRADED" && (!valid || !canPublish))) return;
    if (status !== "DRAFT" && !summary.trim()) return;
    if (!usePerSnapshot) {
      if (status === "GRADED" && (value === null || value <= PASSING_SCORE)) return;
      if (!guidedLab && status === "RETURNED" && (!valid || (value !== null && value > PASSING_SCORE))) return;
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
    save.mutate({
      submissionId: review.submissionId,
      expectedRevision: review.revision,
      status,
      score: usePerSnapshot || (guidedLab && !hasFrozenRows) ? null : value,
      summary,
      ...(usePerSnapshot && parsedSnapshots.items.length > 0
        ? { snapshotGrades: parsedSnapshots.items }
        : {}),
    });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t(
            "Every required snapshot must score > 5.0 / 10 (5.01 or higher) with a mandatory overall summary to pass and unlock the next Lab; any snapshot <= 5.0 results in NEEDS REVISION.",
          )}
        </p>
        {!guidedLab && (
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={usePerSnapshot}
            onChange={(e) => setUsePerSnapshot(e.target.checked)}
          />
          <span>{t("Per-snapshot grading (0–10)")}</span>
        </label>
        )}
      </div>
      {guidedLab && !hasFrozenRows && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("This submission has no frozen Snapshot list. Return it with instructions to resubmit.",
            "Bài này thiếu danh sách Snapshot đã đóng băng. Hãy trả bài kèm hướng dẫn nộp lại.")}
        </p>
      )}
      {usePerSnapshot ? (
        <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
          {snapshotRows.map((row, idx) => {
            const num = row.score.trim() === "" ? null : Number(row.score);
            const isValidCell =
              num !== null &&
              Number.isFinite(num) &&
              num >= 0 &&
              num <= 10 &&
              /^\d+(\.\d{1,2})?$/.test(row.score.trim());
            return (
              <div
                key={`${row.snapshotId}-${idx}`}
                className="space-y-2 rounded-md border bg-background p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{row.title}</span>
                  {isValidCell && (
                    <Badge variant={num! > SNAPSHOT_PASS_EXCLUSIVE ? "success" : "warning"}>
                      {num! > SNAPSHOT_PASS_EXCLUSIVE ? t("PASS (> 5.0)") : t("NEEDS REVISION (<= 5.0)")}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step="0.01"
                    aria-label={`${t("Score", "Điểm")} — ${row.title}`}
                    placeholder="0.0 – 10.0"
                    value={row.score}
                    onChange={(e) =>
                      setSnapshotRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, score: e.target.value } : item)),
                      )
                    }
                  />
                  <Input
                    aria-label={`${t("Snapshot comment (optional)")} — ${row.title}`}
                    placeholder={t("Snapshot comment (optional)")}
                    maxLength={2000}
                    value={row.comment}
                    onChange={(e) =>
                      setSnapshotRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, comment: e.target.value } : item)),
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
          {computedScale100 !== null && (
            <p className="text-xs text-muted-foreground">
              {t("Computed overall equivalent")}: <strong>{computedScale100} / 100</strong>
            </p>
          )}
        </div>
      ) : guidedLab ? null : (
        <FormField label={t("Lecturer score (out of 100)")}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="max-w-48"
            />
          )}
        </FormField>
      )}
      <FormField label={t("Overall review / changes requested")}>
        {(props) => (
          <Textarea
            {...props}
            value={summary}
            maxLength={10000}
            onChange={(e) => setSummary(e.target.value)}
          />
        )}
      </FormField>
      {!valid && (!usePerSnapshot || parsedSnapshots.invalid) && (
        <p role="alert" className="text-sm text-destructive">
          {usePerSnapshot
            ? t("Enter a score between 0.0 and 10.0 for every snapshot (e.g. 5.01 to pass).")
            : t("Enter a score between 0 and 100 with at most two decimal places.")}
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
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("Calculated outcome")}</span>
          <Badge variant={outcome === "PASS" ? "success" : "warning"}>{outcome}</Badge>
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
        <p role="status" className="text-sm text-muted-foreground">
          {t("Add an overall review before publishing or returning this snapshot.")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={save.isPending || (usePerSnapshot ? parsedSnapshots.invalid : !valid)}
          onClick={() => submit("DRAFT")}
        >
          {t("Save grading draft")}
        </Button>
        <Button
          variant="outline"
          disabled={
            save.isPending ||
            (usePerSnapshot && parsedSnapshots.invalid) ||
            !summary.trim() ||
            (!guidedLab && (!valid || (!usePerSnapshot && value !== null && value > PASSING_SCORE)))
          }
          onClick={() => submit("RETURNED")}
        >
          {t("Return for changes")}
        </Button>
        <Button
          disabled={
            save.isPending ||
            !canPublish ||
            !valid ||
            value === null ||
            (!usePerSnapshot && value <= PASSING_SCORE) ||
            !summary.trim()
          }
          onClick={() => submit("GRADED")}
        >
          {t("Publish grade")}
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
    </div>
  );
}
