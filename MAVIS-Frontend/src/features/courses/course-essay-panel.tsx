"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  useCourseEssays,
  useGradeCourseEssay,
  useSubmitCourseEssay,
  type CourseEssaySubmission,
} from "@/features/workspaces/course-access";

export type RubricRow = {
  criterion?: string | undefined;
  points?: number | undefined;
  weightPoints?: number | undefined;
  description?: string | undefined;
  excellentDescription?: string | undefined;
};

/**
 * Interactive Coursera-style Essay assignment panel for course syllabus items
 * (renders prompt Markdown, 100-pt rubric table, student Markdown composer, and lecturer inline grading).
 */
export function CourseEssayItemPanel({
  workspaceId,
  itemId,
  promptMarkdown,
  rubric,
  canManage,
  active,
}: {
  workspaceId: string;
  itemId: string;
  promptMarkdown: string;
  rubric?: RubricRow[] | undefined;
  canManage: boolean;
  active: boolean;
}) {
  const { t } = useLocale();
  const essaysQuery = useCourseEssays(workspaceId);
  const submitEssay = useSubmitCourseEssay(workspaceId);
  const submissions = (essaysQuery.data ?? []).filter((s) => s.courseItemId === itemId);
  const mySubmission = !canManage ? submissions[0] : undefined;

  const [answer, setAnswer] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (mySubmission?.answerMarkdown && !answer.trim()) {
      setAnswer(mySubmission.answerMarkdown);
    }
  }, [mySubmission?.answerMarkdown]);

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-teal-200/80 bg-teal-50/30 p-4 dark:border-teal-900 dark:bg-teal-950/20">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
            <FileText className="size-3.5" aria-hidden="true" />
            {t("Architectural Case Study Essay", "Bài Tập Tự Luận Kiến Trúc (Case Study)")}
          </span>
          {mySubmission && (
            <Badge variant={mySubmission.status === "GRADED" ? "success" : "secondary"}>
              {mySubmission.status === "GRADED"
                ? t(
                    `Graded: ${mySubmission.score ?? 0}/100`,
                    `✅ Đã chấm: ${mySubmission.score ?? 0}/100 điểm`,
                  )
                : t("Submitted · Pending Review", "⏳ Đã nộp — Đang chờ Giảng viên chấm")}
            </Badge>
          )}
        </div>
        <div className="rounded-lg border bg-background p-3 text-sm">
          <MarkdownPreview markdown={promptMarkdown} />
        </div>
      </div>

      {Array.isArray(rubric) && rubric.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Rubric Criterion", "Tiêu chí chấm điểm")}</th>
                <th className="px-3 py-2 font-semibold">{t("Weight", "Điểm tối đa")}</th>
                <th className="px-3 py-2 font-semibold">{t("Standard", "Mô tả đạt xuất sắc")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rubric.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 font-medium">{row.criterion}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-teal-700">
                    {row.points ?? row.weightPoints ?? 0} đ
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.description ?? row.excellentDescription ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mySubmission?.status === "GRADED" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
            {t("Lecturer Feedback", "Nhận xét của Giảng viên")} · {mySubmission.score ?? 0}/100
          </p>
          {mySubmission.feedback && (
            <p className="mt-1 whitespace-pre-wrap leading-5">{mySubmission.feedback}</p>
          )}
        </div>
      )}

      {!canManage && active && (
        <div className="space-y-2 border-t border-teal-200/70 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-foreground" htmlFor={`essay-${itemId}`}>
              {t("Your Essay Answer (Markdown)", "Bài làm Tự luận của bạn (hỗ trợ Markdown & code Java/YAML)")}
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{wordCount} {t("words", "từ")}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setPreviewMode((p) => !p)}
              >
                {previewMode ? t("Edit", "Soạn thảo") : t("Preview", "Xem trước")}
              </Button>
            </div>
          </div>
          {previewMode ? (
            <div className="min-h-36 rounded-lg border bg-background p-3 text-sm">
              <MarkdownPreview markdown={answer || t("*Nothing written yet*", "*Chưa có nội dung*")} />
            </div>
          ) : (
            <textarea
              id={`essay-${itemId}`}
              className="min-h-36 w-full rounded-lg border bg-background p-3 text-sm"
              value={answer}
              maxLength={50000}
              placeholder={t(
                "Write your architectural analysis, code snippets, or Saga/Gateway configuration here…",
                "Nhập bài phân tích kiến trúc, đoạn mã Java/YAML hoặc bảng trạng thái tại đây…",
              )}
              onChange={(event) => setAnswer(event.target.value)}
            />
          )}
          {submitEssay.error && (
            <p role="alert" className="text-xs text-destructive">
              {submitEssay.error.message}
            </p>
          )}
          {submitEssay.isSuccess && (
            <p role="status" className="text-xs font-medium text-emerald-700">
              {t("Essay submitted! Pending lecturer review.", "Đã nộp bài tự luận thành công!")}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700"
              disabled={!answer.trim() || submitEssay.isPending}
              onClick={() => submitEssay.mutate({ itemId, answerMarkdown: answer.trim() })}
            >
              <Send className="mr-1.5 size-3.5" aria-hidden="true" />
              {submitEssay.isPending
                ? t("Submitting…", "Đang nộp…")
                : mySubmission
                  ? t("Update Essay Submission", "Cập nhật Bài Tự luận")
                  : t("📤 Submit Chapter Essay", "📤 Nộp Bài Tự Luận Chương Này")}
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="space-y-2 border-t border-teal-200/70 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-950 dark:text-teal-100">
            <Clock3 className="size-3.5 text-teal-600" aria-hidden="true" />
            {t("Student Essay Submissions for This Chapter", "Bài Tự Luận Sinh Viên Đã Nộp Ở Chương Này")} ({submissions.length})
          </p>
          {submissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("No student submissions for this essay yet.", "Chưa có sinh viên nào nộp bài tự luận này.")}
            </p>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <LecturerEssayRow key={sub.id} workspaceId={workspaceId} submission={sub} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LecturerEssayRow({
  workspaceId,
  submission,
}: {
  workspaceId: string;
  submission: CourseEssaySubmission;
}) {
  const { t } = useLocale();
  const grade = useGradeCourseEssay(workspaceId);
  const [score, setScore] = useState<string>(submission.score != null ? String(submission.score) : "85");
  const [feedback, setFeedback] = useState<string>(submission.feedback ?? "");

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-foreground">{submission.studentName}</span>{" "}
          <span className="text-muted-foreground">({submission.studentEmail})</span>
          <p className="text-[11px] text-muted-foreground">
            {submission.itemTitle} · {new Date(submission.submittedAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={submission.status === "GRADED" ? "success" : "secondary"}>
          {submission.status === "GRADED"
            ? `${submission.score ?? 0}/100`
            : t("Submitted", "Chờ chấm")}
        </Badge>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm">
        <MarkdownPreview markdown={submission.answerMarkdown} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          aria-label={t("Essay score out of 100", "Điểm tự luận (/100)")}
          className="h-9 rounded-md border bg-background px-2.5 text-xs font-semibold"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <input
          type="text"
          aria-label={t("Lecturer feedback", "Nhận xét cho sinh viên")}
          placeholder={t("Enter rubric feedback…", "Nhập nhận xét theo Rubric…")}
          className="h-9 rounded-md border bg-background px-2.5 text-xs"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={grade.isPending}
          onClick={() =>
            grade.mutate({
              submissionId: submission.id,
              score: Math.min(100, Math.max(0, Number(score) || 0)),
              feedback: feedback.trim(),
            })
          }
        >
          {grade.isPending ? t("Saving…", "Đang lưu…") : t("Save Grade", "Lưu Điểm")}
        </Button>
      </div>
      {grade.isSuccess && (
        <p role="status" className="text-[11px] font-medium text-emerald-700">
          {t("Grade saved.", "Đã lưu điểm & nhận xét.")}
        </p>
      )}
    </div>
  );
}
