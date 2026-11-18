"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  RotateCcw,
  Timer,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type { QuizQuestionData } from "./java-coursera-curriculum-data";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

/**
 * Computes an appropriate countdown duration (in seconds) based on question count:
 * ~1.5 minutes per multiple-choice question, minimum 3 minutes, rounded to whole minutes.
 * Examples: 1-2 Qs -> 3m, 5 Qs -> 8m, 10 Qs -> 15m, 15 Qs -> 23m, 20 Qs -> 30m.
 */
export function computeRecommendedQuizSeconds(questionCount: number): number {
  const safeCount = Math.max(1, Math.floor(questionCount));
  const minutes = Math.max(3, Math.ceil(safeCount * 1.5));
  return minutes * 60;
}

export function formatQuizClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Interactive Chapter Quiz Exam Room (for Students) with dynamic countdown timer,
 * Question Navigator, Focus (1-question) vs Full-list view, and Lecturer answer-key preview.
 */
export function ChapterQuizRunner({
  title,
  questions,
  canManage,
  workspaceId,
  assignmentId,
  durationSeconds,
  fullPage = false,
}: {
  title: string;
  questions: QuizQuestionData[];
  canManage: boolean;
  workspaceId: string;
  assignmentId?: string | null | undefined;
  durationSeconds?: number | undefined;
  fullPage?: boolean | undefined;
}) {
  const { t } = useLocale();
  const totalSeconds =
    durationSeconds && durationSeconds > 0
      ? durationSeconds
      : computeRecommendedQuizSeconds(questions.length);

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [viewMode, setViewMode] = useState<"single" | "all">(fullPage ? "single" : "all");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setAnswers({});
    setSubmitted(false);
    setTimedOut(false);
    setRemainingSeconds(totalSeconds);
    setActiveIndex(0);
  }, [title, totalSeconds]);

  useEffect(() => {
    if (canManage || submitted || questions.length === 0) return;
    if (remainingSeconds <= 0) {
      setTimedOut(true);
      setSubmitted(true);
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setTimedOut(true);
          setSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [canManage, submitted, questions.length, remainingSeconds]);

  if (!questions.length) {
    return (
      <div className="mt-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {t(
          "No multiple-choice questions available for this quiz yet.",
          "Chưa có câu hỏi trắc nghiệm cho bài kiểm tra này.",
        )}
      </div>
    );
  }

  const answeredCount = questions.filter((q) => typeof answers[q.id] === "number").length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correctOption).length;
  const scoreOutOfTen =
    questions.length > 0 ? Math.round((correctCount / questions.length) * 100) / 10 : 0;
  const passed = questions.length > 0 && correctCount * 100 >= questions.length * 70;
  const showAnswers = canManage || submitted;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const timerPercent = totalSeconds > 0 ? Math.round((remainingSeconds / totalSeconds) * 100) : 0;
  const timerTone =
    remainingSeconds <= 30
      ? "border-rose-400 bg-rose-50 text-rose-700 animate-pulse dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
      : remainingSeconds <= 120
        ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100";

  const clampedIndex = Math.min(activeIndex, questions.length - 1);
  const visibleQuestions =
    viewMode === "single" && !canManage && !submitted
      ? [{ question: questions[clampedIndex]!, qIndex: clampedIndex }]
      : questions.map((question, qIndex) => ({ question, qIndex }));

  const handleRetake = () => {
    setAnswers({});
    setSubmitted(false);
    setTimedOut(false);
    setRemainingSeconds(totalSeconds);
    setActiveIndex(0);
  };

  return (
    <div className="space-y-5">
      {/* Sticky Exam Status & Countdown Header */}
      <div className="sticky top-16 z-20 rounded-2xl border bg-card/95 p-4 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-base font-bold text-foreground sm:text-lg">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {canManage
                ? t(
                    `Lecturer Preview · ${questions.length} questions with answer key & explanations`,
                    `Xem trước Bộ Đề Giảng Viên · ${questions.length} câu hỏi kèm đáp án & giải thích chi tiết`,
                  )
                : t(
                    `${questions.length} questions · Pass ≥ 70% · Time limit ${Math.round(totalSeconds / 60)} min`,
                    `${questions.length} câu hỏi trắc nghiệm · Ngưỡng đạt ≥ 70% · Thời lượng ${Math.round(totalSeconds / 60)} phút`,
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!canManage && (
              <div
                role="timer"
                aria-live="polite"
                aria-label={t("Quiz countdown timer", "Bộ đếm thời gian làm Quiz")}
                className={`mavis-tabular inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold shadow-xs ${
                  submitted
                    ? "border-border bg-muted/60 text-muted-foreground"
                    : timerTone
                }`}
              >
                {remainingSeconds <= 120 && !submitted ? (
                  <AlarmClock className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Timer className="size-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {submitted
                    ? `${t("Time used", "Đã làm")}: ${formatQuizClock(elapsedSeconds)}`
                    : formatQuizClock(remainingSeconds)}
                </span>
              </div>
            )}

            {!canManage && !submitted && (
              <div className="inline-flex rounded-xl border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("single")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "single"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                  {t("1 by 1", "Từng câu")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "all"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="size-3.5" aria-hidden="true" />
                  {t("All", "Tất cả")}
                </button>
              </div>
            )}

            {assignmentId && !canManage && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=3`}
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

        {/* Time & Completion Progress Bar */}
        {!canManage && !submitted && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t("Progress", "Tiến độ trả lời")}</span>
                <span className="mavis-tabular font-medium text-foreground">
                  {answeredCount}/{questions.length} {t("answered", "câu đã chọn")}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round((answeredCount / questions.length) * 100)}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t("Time remaining", "Thời gian còn lại")}</span>
                <span className="mavis-tabular font-medium text-foreground">
                  {formatQuizClock(remainingSeconds)} / {formatQuizClock(totalSeconds)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    remainingSeconds <= 30
                      ? "bg-rose-500"
                      : remainingSeconds <= 120
                        ? "bg-amber-500"
                        : "bg-teal-500"
                  }`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result Banner */}
      {submitted && !canManage && (
        <div
          className={`rounded-2xl border-2 p-6 text-center shadow-sm ${
            passed
              ? "border-emerald-400 bg-emerald-50/75 dark:border-emerald-700 dark:bg-emerald-950/30"
              : "border-rose-300 bg-rose-50/75 dark:border-rose-800 dark:bg-rose-950/30"
          }`}
        >
          {timedOut && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              <AlarmClock className="size-3.5" aria-hidden="true" />
              {t(
                "Time expired — your answers were submitted automatically.",
                "Hết giờ làm bài — hệ thống đã tự động nộp bài làm của bạn.",
              )}
            </p>
          )}
          <p className="mavis-tabular text-4xl font-bold text-foreground">
            {scoreOutOfTen.toFixed(1)} / 10{" "}
            <span className="text-base font-medium text-muted-foreground">
              ({correctCount}/{questions.length} {t("correct", "câu đúng")})
            </span>
          </p>
          <p
            className={`mt-1.5 text-sm font-bold ${
              passed ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {passed
              ? t("✅ PASSED (≥ 70%)", "✅ ĐÃ ĐẠT YÊU CẦU (≥ 70%)")
              : t("❌ NEEDS RETRY (< 70%)", "❌ CHƯA ĐẠT — HÃY ÔN LẠI VÀ THỬ LẠI")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Completion time", "Thời gian hoàn thành")}:{" "}
            <strong className="mavis-tabular text-foreground">
              {formatQuizClock(elapsedSeconds)}
            </strong>{" "}
            / {formatQuizClock(totalSeconds)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4 bg-background"
            onClick={handleRetake}
          >
            <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
            {t("Retake Quiz", "Làm Lại Bài Thi")}
          </Button>
        </div>
      )}

      {/* Wide 2-Column Exam Room Body: Main Questions + Compact Question Navigator */}
      <div className={fullPage ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_240px]" : "space-y-4"}>
        <div className="min-w-0 space-y-4">
          <ol className="space-y-4">
            {visibleQuestions.map(({ question, qIndex }) => {
              const picked = answers[question.id];
              return (
                <li
                  key={question.id}
                  id={`quiz-q-${qIndex + 1}`}
                  className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold leading-relaxed text-foreground">
                      <span className="mr-2 inline-flex rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                        {t(`Q${qIndex + 1}`, `Câu ${qIndex + 1}`)} / {questions.length}
                      </span>
                      {question.prompt}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-1">
                    {question.options.map((option, optIdx) => {
                      const isPicked = picked === optIdx;
                      const isRight = optIdx === question.correctOption;
                      let styleClass =
                        "border-border bg-background hover:border-primary/60 hover:bg-muted/30";
                      if (showAnswers) {
                        if (isRight) {
                          styleClass =
                            "border-emerald-500 bg-emerald-50/85 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100";
                        } else if (isPicked && !isRight) {
                          styleClass =
                            "border-rose-400 bg-rose-50/85 text-rose-950 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100";
                        }
                      } else if (isPicked) {
                        styleClass =
                          "border-primary bg-primary/8 text-foreground ring-1 ring-primary/30";
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
                          className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${styleClass}`}
                        >
                          <span
                            className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold ${
                              isPicked && !showAnswers
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted/40"
                            }`}
                          >
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
                    <div className="mt-4 rounded-xl border bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
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

          {/* Single-Question Focus Mode Navigation Bar */}
          {viewMode === "single" && !canManage && !submitted && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={clampedIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
                {t("Previous", "Câu trước")}
              </Button>
              <span className="mavis-tabular text-xs font-medium text-muted-foreground">
                {t("Question", "Câu")} {clampedIndex + 1} / {questions.length}
              </span>
              {clampedIndex < questions.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActiveIndex((i) => Math.min(questions.length - 1, i + 1))}
                >
                  {t("Next", "Câu tiếp theo")}
                  <ChevronRight className="ml-1 size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={answeredCount === 0}
                  onClick={() => setSubmitted(true)}
                >
                  {t("Submit & Check Score", "Nộp Bài & Xem Điểm Ngay")}
                </Button>
              )}
            </div>
          )}

          {/* Submit Footer */}
          {!canManage && !submitted && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("Answered", "Đã chọn")}:{" "}
                  <strong className="mavis-tabular text-foreground">{answeredCount}</strong> /{" "}
                  {questions.length}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    questions.forEach((q) => {
                      next[q.id] = q.correctOption;
                    });
                    setAnswers(next);
                  }}
                >
                  ✨ {t("Fill Sample Pass (≥ 70%)", "Điền nhanh đáp án mẫu (Đạt ≥ 70%)")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    questions.forEach((q) => {
                      next[q.id] = (q.correctOption + 1) % Math.max(q.options.length, 2);
                    });
                    setAnswers(next);
                  }}
                >
                  🧪 {t("Test Fail Case (DS-02b)", "Thử kịch bản < 60% (Demo DS-02b)")}
                </Button>
              </div>
              <Button
                type="button"
                className="bg-emerald-600 px-6 text-white hover:bg-emerald-700"
                disabled={answeredCount === 0}
                onClick={() => setSubmitted(true)}
              >
                {t("Submit & Check Score", "Nộp Bài & Xem Điểm Ngay")}
              </Button>
            </div>
          )}
        </div>

        {/* Right Compact Question Navigator Panel (in full-page mode or inline above) */}
        <aside
          aria-label={t("Question navigator", "Bảng điều hướng câu hỏi")}
          className={
            fullPage
              ? "rounded-2xl border bg-card p-4 shadow-xs lg:sticky lg:top-44"
              : "rounded-2xl border bg-card p-4 shadow-xs"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Question Map", "Danh sách câu hỏi")}
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {questions.map((q, idx) => {
              const picked = typeof answers[q.id] === "number";
              const isCorrect = showAnswers && answers[q.id] === q.correctOption;
              const isWrong = showAnswers && picked && answers[q.id] !== q.correctOption;
              const isCurrent = viewMode === "single" && !submitted && idx === clampedIndex;
              let tileCls = "border-border bg-background text-muted-foreground hover:border-primary/60";
              if (isCorrect) {
                tileCls = "border-emerald-500 bg-emerald-500 text-white";
              } else if (isWrong) {
                tileCls = "border-rose-500 bg-rose-500 text-white";
              } else if (isCurrent) {
                tileCls = "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30";
              } else if (picked) {
                tileCls = "border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200";
              }
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setActiveIndex(idx);
                    if (viewMode === "all" || submitted) {
                      document.getElementById(`quiz-q-${idx + 1}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }
                  }}
                  className={`mavis-tabular inline-flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${tileCls}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-teal-500" />
              {t("Answered", "Đã chọn")} ({answeredCount})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full border bg-background" />
              {t("Left", "Còn lại")} ({questions.length - answeredCount})
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
