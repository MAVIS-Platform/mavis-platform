"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileQuestion, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatQuizQuestionPrompt, sanitizeQuizPlainText } from "@/lib/format/course-display";
import type { QuizQuestionData } from "./java-coursera-curriculum-data";
import { useCourseQuiz } from "./course-quiz";

const PASS_PERCENT = 70;
type QuizAttemptStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
type StoredQuizAttempt = {
  attemptId: string;
  status: QuizAttemptStatus;
  answers: Record<string, number>;
  correctCount?: number;
  submittedAt?: string | undefined;
  scorePercent?: number;
};

type BackendQuizResult = {
  correctCount: number;
  totalQuestions: number;
  status: "PASSED" | "NEEDS_RETRY";
};

function makeAttemptId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The curriculum fixture has no quiz-attempt API. This explicit device-local store
 * preserves attempts without presenting locally stored results as backend data. */
function attemptStorageKey(
  workspaceId: string,
  assignmentId: string | null | undefined,
  title: string,
) {
  return `mavis:curriculum-quiz-attempt:${workspaceId}:${assignmentId ?? "curriculum"}:${title}`;
}

export function ChapterQuizRunner({
  title,
  questions,
  canManage,
  workspaceId,
  assignmentId,
  nextLessonTitle,
  onNextLesson,
}: {
  title: string;
  questions: QuizQuestionData[];
  canManage: boolean;
  workspaceId: string;
  assignmentId?: string | null | undefined;
  nextLessonTitle?: string | undefined;
  onNextLesson?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const client = useApi();
  const cache = useQueryClient();
  const backendQuizEnabled = client.mode === "backend" && Boolean(assignmentId) && !canManage;
  const backendQuiz = useCourseQuiz(workspaceId, assignmentId ?? "", backendQuizEnabled);
  const storageKey = useMemo(
    () => attemptStorageKey(workspaceId, assignmentId, title),
    [assignmentId, title, workspaceId],
  );
  const [attempt, setAttempt] = useState<StoredQuizAttempt | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    setShowFeedback(false);
    try {
      const rawAttempt = window.localStorage.getItem(storageKey);
      const parsedAttempt = rawAttempt ? (JSON.parse(rawAttempt) as StoredQuizAttempt) : null;
      setAttempt(
        parsedAttempt && ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED"].includes(parsedAttempt.status)
          ? parsedAttempt
          : null,
      );
    } catch {
      setAttempt(null);
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  const updateAttempt = (nextAttempt: StoredQuizAttempt) => {
    setAttempt(nextAttempt);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextAttempt));
    } catch {
      // Interaction continues if browser storage is disabled.
    }
  };

  useEffect(() => {
    if (!backendQuizEnabled || !backendQuiz.data || attempt?.status === "IN_PROGRESS") return;
    const submitted =
      backendQuiz.data.latestStatus === "PASSED" || backendQuiz.data.latestStatus === "NEEDS_RETRY";
    if (!submitted) return;
    const total = backendQuiz.data.questions.length;
    const correct = backendQuiz.data.latestCorrectCount;
    const recordedScore =
      correct === null || correct === undefined || total === 0
        ? attempt?.scorePercent
        : Math.round((correct / total) * 100);
    if (
      attempt?.status === "SUBMITTED" &&
      attempt.scorePercent === recordedScore &&
      attempt.submittedAt === (backendQuiz.data.latestSubmittedAt ?? attempt.submittedAt)
    ) {
      return;
    }
    const recordedAttempt: StoredQuizAttempt = {
      attemptId: attempt?.attemptId || `recorded-${backendQuiz.data.version}`,
      status: "SUBMITTED",
      answers: attempt?.answers ?? {},
    };
    const submittedAt = backendQuiz.data.latestSubmittedAt ?? attempt?.submittedAt;
    if (submittedAt) recordedAttempt.submittedAt = submittedAt;
    if (recordedScore !== undefined) recordedAttempt.scorePercent = recordedScore;
    if (correct !== null && correct !== undefined) recordedAttempt.correctCount = correct;
    updateAttempt(recordedAttempt);
  }, [attempt, backendQuiz.data, backendQuizEnabled]);

  const submitBackendAttempt = useMutation({
    mutationFn: (nextAttempt: StoredQuizAttempt) =>
      api<BackendQuizResult>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/attempts`,
        {
          method: "POST",
          body: JSON.stringify({
            attemptId: nextAttempt.attemptId,
            version: backendQuiz.data?.version,
            selections: (backendQuiz.data?.questions ?? []).map((question, index) => {
              const answer = nextAttempt.answers[question.id ?? `question-${index}`];
              return typeof answer === "number" ? [answer] : [];
            }),
          }),
        },
      ),
    onSuccess: (result, nextAttempt) => {
      updateAttempt({
        ...nextAttempt,
        status: "SUBMITTED",
        submittedAt: new Date().toISOString(),
        correctCount: result.correctCount,
        scorePercent: Math.round((result.correctCount / result.totalQuestions) * 100),
      });
      void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, assignmentId] });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
    },
  });

  const displayedQuestions = useMemo<QuizQuestionData[]>(() => {
    if (!backendQuizEnabled) return questions;
    return (backendQuiz.data?.questions ?? []).map((question, index) => ({
      id: question.id ?? `question-${index}`,
      prompt: question.prompt,
      options: question.options,
      correctOption: -1,
      explanation: "",
    }));
  }, [backendQuiz.data?.questions, backendQuizEnabled, questions]);

  if (backendQuizEnabled && backendQuiz.isPending) {
    return (
      <p className="mx-auto mt-8 max-w-[850px] text-sm text-muted-foreground">
        {t("Loading quiz…", "Đang tải Quiz…")}
      </p>
    );
  }
  if (backendQuizEnabled && backendQuiz.isError) {
    return (
      <div
        role="alert"
        className="mx-auto mt-6 max-w-[850px] space-y-3 rounded-xl border border-destructive/30 p-4 text-sm"
      >
        <p>
          {backendQuiz.error instanceof ApiError && backendQuiz.error.status === 404
            ? t(
                "This module Quiz has not been published yet.",
                "Quiz của Module này chưa được công bố.",
              )
            : t("The module Quiz could not be loaded.", "Không thể tải Quiz của Module.")}
        </p>
        <Button type="button" variant="outline" onClick={() => void backendQuiz.refetch()}>
          {t("Retry", "Thử lại")}
        </Button>
      </div>
    );
  }

  if (!displayedQuestions.length) {
    return (
      <div className="mx-auto mt-6 max-w-[850px] rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        {t(
          "No multiple-choice questions available for this quiz yet.",
          "Chưa có câu hỏi trắc nghiệm cho bài kiểm tra này.",
        )}
      </div>
    );
  }

  if (canManage)
    return (
      <QuizPreview
        title={title}
        questions={questions}
        workspaceId={workspaceId}
        assignmentId={assignmentId}
      />
    );
  if (!isHydrated)
    return (
      <p className="mx-auto mt-8 max-w-[850px] text-sm text-muted-foreground">
        {t("Loading quiz…", "Đang tải Quiz…")}
      </p>
    );

  const currentAttempt = attempt ?? { attemptId: "", status: "NOT_STARTED" as const, answers: {} };
  if (currentAttempt.status === "NOT_STARTED") {
    return (
      <QuizLanding
        title={title}
        questionCount={displayedQuestions.length}
        onStart={() =>
          updateAttempt({ attemptId: makeAttemptId(), status: "IN_PROGRESS", answers: {} })
        }
      />
    );
  }

  const selectedCorrectCount = displayedQuestions.filter(
    (question) => currentAttempt.answers[question.id] === question.correctOption,
  ).length;
  const correctCount = currentAttempt.correctCount ?? selectedCorrectCount;
  const scorePercent =
    currentAttempt.scorePercent ?? Math.round((correctCount / displayedQuestions.length) * 100);
  if (currentAttempt.status === "SUBMITTED") {
    return (
      <QuizResult
        title={title}
        scorePercent={scorePercent}
        correctCount={correctCount}
        questionCount={displayedQuestions.length}
        submittedAt={currentAttempt.submittedAt}
        showFeedback={showFeedback}
        canViewFeedback={!backendQuizEnabled}
        questions={displayedQuestions}
        answers={currentAttempt.answers}
        nextLessonTitle={nextLessonTitle}
        onToggleFeedback={() => setShowFeedback((current) => !current)}
        onRetry={() =>
          updateAttempt({ attemptId: makeAttemptId(), status: "IN_PROGRESS", answers: {} })
        }
        onNextLesson={onNextLesson}
      />
    );
  }

  return (
    <QuizTaking
      title={title}
      questions={displayedQuestions}
      answers={currentAttempt.answers}
      onAnswer={(questionId, optionIndex) =>
        updateAttempt({
          ...currentAttempt,
          answers: { ...currentAttempt.answers, [questionId]: optionIndex },
        })
      }
      submitting={submitBackendAttempt.isPending}
      submitError={submitBackendAttempt.error}
      onSubmit={() => {
        const nextAttempt = {
          ...currentAttempt,
          status: "SUBMITTED",
          submittedAt: new Date().toISOString(),
          scorePercent,
        } as StoredQuizAttempt;
        if (backendQuizEnabled) submitBackendAttempt.mutate(nextAttempt);
        else updateAttempt(nextAttempt);
      }}
    />
  );
}

function QuizLanding({
  title,
  questionCount,
  onStart,
}: {
  title: string;
  questionCount: number;
  onStart: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className="mx-auto mt-6 max-w-[850px] overflow-hidden rounded-2xl border bg-background shadow-xs">
      <div className="bg-sky-50 px-6 py-8 dark:bg-sky-950/30 sm:px-8">
        <Badge
          variant="outline"
          className="border-sky-200 bg-background/80 text-sky-800 dark:border-sky-800 dark:text-sky-200"
        >
          {t("Graded assignment", "Bài kiểm tra tính điểm")}
        </Badge>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t(
            "Complete this assessment to check your understanding and unlock the next learning step.",
            "Hoàn thành bài kiểm tra để đánh giá mức độ hiểu bài và mở khóa bước học tiếp theo.",
          )}
        </p>
        <Button type="button" className="mt-6 bg-primary px-5" onClick={onStart}>
          {t("Start assignment", "Bắt đầu làm bài")}
        </Button>
      </div>
      <div className="grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-8">
        <div>
          <h3 className="font-semibold">{t("Before you begin", "Trước khi bắt đầu")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t(
              "Your answers are saved on this device while you work. Submit only when you are ready to receive your result.",
              "Lựa chọn của bạn được lưu trên thiết bị này trong lúc làm bài. Chỉ nộp khi bạn sẵn sàng nhận kết quả.",
            )}
          </p>
        </div>
        <dl className="space-y-3 rounded-xl border bg-muted/20 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("Questions", "Số câu hỏi")}</dt>
            <dd className="font-semibold">{questionCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("Passing score", "Ngưỡng đạt")}</dt>
            <dd className="font-semibold">{PASS_PERCENT}%</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("Time limit", "Thời lượng")}</dt>
            <dd>{t("Not configured", "Chưa cấu hình")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function QuizTaking({
  title,
  questions,
  answers,
  onAnswer,
  onSubmit,
  submitting = false,
  submitError,
}: {
  title: string;
  questions: QuizQuestionData[];
  answers: Record<string, number>;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitError?: Error | null;
}) {
  const { t } = useLocale();
  const answeredCount = questions.filter(
    (question) => typeof answers[question.id] === "number",
  ).length;
  const allAnswered = answeredCount === questions.length;
  return (
    <section className="mx-auto mt-6 max-w-[850px] pb-10">
      <header className="border-b pb-5">
        <Badge variant="outline">{t("Graded assignment", "Bài kiểm tra tính điểm")}</Badge>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            {t(
              `${answeredCount}/${questions.length} answered`,
              `Đã trả lời ${answeredCount}/${questions.length} câu`,
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(`Passing score ${PASS_PERCENT}%`, `Ngưỡng đạt ${PASS_PERCENT}%`)}</span>
        </div>
      </header>
      <ol className="mt-8 space-y-10">
        {questions.map((question, questionIndex) => (
          <li
            key={question.id}
            className="grid gap-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:gap-5"
          >
            <span className="font-semibold tabular-nums text-muted-foreground">
              {questionIndex + 1}.
            </span>
            <fieldset>
              <legend className="text-base font-medium leading-7">
                {formatQuizQuestionPrompt(question.prompt)}
              </legend>
              <div className="mt-4 space-y-3">
                {question.options.map((option, optionIndex) => {
                  const inputId = `${question.id}-option-${optionIndex}`;
                  return (
                    <label
                      key={inputId}
                      htmlFor={inputId}
                      className="flex cursor-pointer items-start gap-3 text-sm leading-6"
                    >
                      <input
                        id={inputId}
                        name={question.id}
                        type="radio"
                        value={optionIndex}
                        checked={answers[question.id] === optionIndex}
                        onChange={() => onAnswer(question.id, optionIndex)}
                        disabled={submitting}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <span>{sanitizeQuizPlainText(option)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Badge variant="secondary" className="h-fit w-fit whitespace-nowrap text-xs">
              {t("1 point", "1 điểm")}
            </Badge>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          {allAnswered
            ? t("All questions are answered.", "Bạn đã trả lời tất cả câu hỏi.")
            : t(
                "You can submit now, or finish the remaining questions first.",
                "Bạn có thể nộp ngay hoặc hoàn thành các câu còn lại.",
              )}
        </p>
        <Button type="button" disabled={answeredCount === 0 || submitting} onClick={onSubmit}>
          {submitting ? t("Submitting…", "Đang nộp…") : t("Submit Quiz", "Nộp Quiz")}
        </Button>
      </div>
      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            "Your submission could not be saved. Please retry.",
            "Không thể lưu bài nộp. Vui lòng thử lại.",
          )}
        </p>
      )}
    </section>
  );
}

function QuizResult({
  title,
  scorePercent,
  correctCount,
  questionCount,
  submittedAt,
  showFeedback,
  canViewFeedback,
  questions,
  answers,
  nextLessonTitle,
  onToggleFeedback,
  onRetry,
  onNextLesson,
}: {
  title: string;
  scorePercent: number;
  correctCount: number;
  questionCount: number;
  submittedAt?: string | undefined;
  showFeedback: boolean;
  canViewFeedback: boolean;
  questions: QuizQuestionData[];
  answers: Record<string, number>;
  nextLessonTitle?: string | undefined;
  onToggleFeedback: () => void;
  onRetry: () => void;
  onNextLesson?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const passed = scorePercent >= PASS_PERCENT;
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(submittedAt),
      )
    : t("Just now", "Vừa xong");
  return (
    <section className="mx-auto mt-6 max-w-[850px] overflow-hidden rounded-2xl border bg-background shadow-xs">
      <div className="bg-sky-50 px-6 py-8 dark:bg-sky-950/30 sm:px-8">
        <Badge
          variant="outline"
          className="border-sky-200 bg-background/80 text-sky-800 dark:border-sky-800 dark:text-sky-200"
        >
          {t("Graded assignment", "Bài kiểm tra tính điểm")}
        </Badge>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("Your result is ready.", "Kết quả của bạn đã sẵn sàng.")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {onNextLesson && (
            <Button type="button" onClick={onNextLesson}>
              {t("Go to next lesson", "Sang bài tiếp theo")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            {t("Try again", "Làm lại")}
          </Button>
        </div>
      </div>
      <div className="grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-8">
        <div
          className={`rounded-xl border p-5 ${passed ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30"}`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {passed ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <XCircle className="size-5 text-rose-600" />
            )}
            {passed ? t("You passed!", "Bạn đã đạt!") : t("Not passed yet", "Bạn chưa đạt")}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`Passing score: ${PASS_PERCENT}%.`, `Ngưỡng đạt: ${PASS_PERCENT}%.`)}
          </p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{scorePercent}%</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              `${correctCount}/${questionCount} correct`,
              `Đúng ${correctCount}/${questionCount} câu`,
            )}
          </p>
          {canViewFeedback && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={onToggleFeedback}
            >
              {showFeedback
                ? t("Hide feedback", "Ẩn phản hồi")
                : t("View feedback", "Xem phản hồi")}
            </Button>
          )}
        </div>
        <aside className="rounded-xl border p-4 text-sm">
          <h3 className="font-semibold">{t("Submission", "Lần nộp bài")}</h3>
          <p className="mt-3 flex items-start gap-2 text-muted-foreground">
            <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t(`Submitted ${submittedLabel}`, `Đã nộp ${submittedLabel}`)}</span>
          </p>
          {nextLessonTitle && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t("Next", "Tiếp theo")}: {nextLessonTitle}
            </p>
          )}
        </aside>
      </div>
      {canViewFeedback && showFeedback && (
        <ol className="space-y-6 border-t p-6 sm:p-8">
          {questions.map((question, index) => {
            const selectedOption = answers[question.id];
            const isCorrect = selectedOption === question.correctOption;
            return (
              <li key={question.id} className="text-sm">
                <p className="font-medium">
                  {index + 1}. {formatQuizQuestionPrompt(question.prompt)}
                </p>
                <p
                  className={`mt-2 ${isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                >
                  {isCorrect ? t("Correct", "Chính xác") : t("Review needed", "Cần xem lại")}:{" "}
                  {sanitizeQuizPlainText(question.options[question.correctOption])}
                </p>
                {question.explanation && (
                  <p className="mt-1 leading-6 text-muted-foreground">
                    {sanitizeQuizPlainText(question.explanation)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function QuizPreview({
  title,
  questions,
  workspaceId,
  assignmentId,
}: {
  title: string;
  questions: QuizQuestionData[];
  workspaceId: string;
  assignmentId?: string | null | undefined;
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto mt-6 max-w-[850px] rounded-xl border bg-muted/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length} {t("questions", "câu hỏi")}
          </p>
        </div>
        {assignmentId && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}`}
            >
              <FileQuestion className="mr-2 size-4" aria-hidden="true" />
              {t("Edit Quiz Bank", "Sửa ngân hàng Quiz")}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
