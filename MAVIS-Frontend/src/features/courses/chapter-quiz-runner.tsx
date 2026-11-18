"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type { QuizQuestionData } from "./java-coursera-curriculum-data";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

/**
 * Interactive 10-question Chapter Quiz player (for Students) and answer-key viewer
 * (for Lecturers), modeled after ONLINE-LEARNING-PLATFORM's DoQuiz UX.
 */
export function ChapterQuizRunner({
  title,
  questions,
  canManage,
  workspaceId,
  assignmentId,
}: {
  title: string;
  questions: QuizQuestionData[];
  canManage: boolean;
  workspaceId: string;
  assignmentId?: string | null | undefined;
}) {
  const { t } = useLocale();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions.length) {
    return (
      <div className="mt-3 rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        {t(
          "No multiple-choice questions available for this quiz yet.",
          "Chưa có câu hỏi trắc nghiệm cho bài kiểm tra này.",
        )}
      </div>
    );
  }

  const answeredCount = questions.filter((q) => typeof answers[q.id] === "number").length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correctOption).length;
  const scoreOutOfTen = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) / 10 : 0;
  const passed = questions.length > 0 && correctCount * 100 >= questions.length * 70;
  const showAnswers = canManage || submitted;

  return (
    <div className="mt-3 space-y-4 rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">
            {canManage
              ? t(
                  `Lecturer Preview · ${questions.length} questions with answer key & explanations`,
                  `Xem trước Bộ Đề Giảng Viên · ${questions.length} câu hỏi kèm đáp án & giải thích chi tiết`,
                )
              : t(
                  `${questions.length} multiple-choice questions · Pass threshold ≥ 70%`,
                  `${questions.length} câu hỏi trắc nghiệm · Ngưỡng đạt ≥ 70%`,
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assignmentId && !canManage && (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=2`}
              >
                {t("Open in Lab Gate", "Mở tại Lab Quiz Gate")}
              </Link>
            </Button>
          )}
          {assignmentId && canManage && (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`}
              >
                {t("Edit Quiz Bank", "Sửa ngân hàng Quiz")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {submitted && !canManage && (
        <div
          className={`rounded-2xl border-2 p-5 text-center ${
            passed
              ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30"
              : "border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30"
          }`}
        >
          <p className="text-3xl font-bold tabular-nums">
            {scoreOutOfTen.toFixed(1)} / 10{" "}
            <span className="text-base font-medium text-muted-foreground">
              ({correctCount}/{questions.length} {t("correct", "câu đúng")})
            </span>
          </p>
          <p
            className={`mt-1 text-sm font-bold ${
              passed ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {passed
              ? t("✅ PASSED (≥ 70%)", "✅ ĐÃ ĐẠT YÊU CẦU (≥ 70%)")
              : t("❌ NEEDS RETRY (< 70%)", "❌ CHƯA ĐẠT — HÃY ÔN LẠI VÀ THỬ LẠI")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
            {t("Retake Quiz", "🔄 Làm Lại Bài Thi")}
          </Button>
        </div>
      )}

      <ol className="space-y-4">
        {questions.map((question, qIndex) => {
          const picked = answers[question.id];
          return (
            <li key={question.id} className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold leading-snug">
                <span className="mr-1.5 font-mono text-teal-700 dark:text-teal-300">
                  {t(`Q${qIndex + 1}.`, `Câu ${qIndex + 1}.`)}
                </span>
                {question.prompt}
              </p>
              <div className="mt-3 grid gap-2">
                {question.options.map((option, optIdx) => {
                  const isPicked = picked === optIdx;
                  const isRight = optIdx === question.correctOption;
                  let styleClass =
                    "border-border bg-background hover:border-teal-400 dark:hover:border-teal-700";
                  if (showAnswers) {
                    if (isRight) {
                      styleClass =
                        "border-emerald-500 bg-emerald-50/80 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100";
                    } else if (isPicked && !isRight) {
                      styleClass =
                        "border-rose-400 bg-rose-50/80 text-rose-950 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100";
                    }
                  } else if (isPicked) {
                    styleClass =
                      "border-teal-600 bg-teal-50/80 text-teal-950 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-100";
                  }

                  return (
                    <button
                      key={`${question.id}-opt-${optIdx}`}
                      type="button"
                      disabled={canManage || submitted}
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [question.id]: optIdx,
                        }))
                      }
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-xs sm:text-sm transition-colors ${styleClass}`}
                    >
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold">
                        {OPTION_LABELS[optIdx] ?? optIdx + 1}
                      </span>
                      <span className="flex-1 leading-relaxed">{option}</span>
                      {showAnswers && isRight && (
                        <CheckCircle2
                          className="mt-0.5 size-4 shrink-0 text-emerald-600"
                          aria-label="Correct answer"
                        />
                      )}
                      {showAnswers && isPicked && !isRight && (
                        <XCircle
                          className="mt-0.5 size-4 shrink-0 text-rose-600"
                          aria-label="Wrong selection"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {showAnswers && question.explanation && (
                <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="mr-2 text-[10px]">
                    {t("Explanation", "Giải thích")}
                  </Badge>
                  <span>{question.explanation}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!canManage && !submitted && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {t("Answered", "Đã chọn")}: <strong>{answeredCount}</strong> / {questions.length}
          </span>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={answeredCount === 0}
            onClick={() => setSubmitted(true)}
          >
            {t("Submit & Check Score", "Nộp Bài & Xem Điểm Ngay")}
          </Button>
        </div>
      )}
    </div>
  );
}
