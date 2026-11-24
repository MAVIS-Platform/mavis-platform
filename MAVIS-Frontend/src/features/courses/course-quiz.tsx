"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Lock, RotateCcw, XCircle } from "lucide-react";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useSession } from "@/hooks/use-api";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatQuizQuestionPrompt, sanitizeQuizPlainText } from "@/lib/format/course-display";
import { calculateQuizDurationMinutes, QuizCountdownBanner } from "./quiz-timer";

type QuestionType = "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE";
type Question = {
  id?: string;
  prompt: string;
  type?: QuestionType;
  options: string[];
  points?: number;
};
type Quiz = {
  version: number;
  lesson: string;
  passPercent: number;
  passed: boolean;
  latestStatus: "PASSED" | "NEEDS_RETRY" | "NOT_ATTEMPTED" | null;
  latestCorrectCount?: number | null;
  latestSubmittedAt?: string | null;
  runtimeUnlocked: boolean;
  questions: Question[];
};
type QuestionResult = { id: string; correct: boolean; explanation: string };
type Result = {
  correctCount: number;
  totalQuestions: number;
  status: "PASSED" | "NEEDS_RETRY";
  questionResults?: QuestionResult[];
};

export function useCourseQuiz(workspaceId: string, labId: string, enabled: boolean) {
  const path = `workspaces/${workspaceId}/course-labs/${labId}/quiz`;
  return useQuery({
    queryKey: ["api", "course-quiz", workspaceId, labId],
    queryFn: ({ signal }) => api<Quiz>(path, { signal }),
    retry: false,
    enabled,
  });
}

export function CourseQuiz({
  workspaceId,
  labId,
  canSubmit,
  runtimeStepHref,
  submissionHref,
  showNextCta = false,
}: {
  workspaceId: string;
  labId: string;
  canSubmit: boolean;
  runtimeStepHref?: string;
  submissionHref?: string | undefined;
  showNextCta?: boolean;
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const path = `workspaces/${workspaceId}/course-labs/${labId}/quiz`;
  const quiz = useCourseQuiz(workspaceId, labId, true);
  const resolvedRuntimeHref =
    runtimeStepHref ??
    `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=3`;
  return (
    <DetailPanel title={t("Theory and Quiz", "Lý thuyết và Quiz")}>
      {quiz.isPending && <p role="status">{t("Loading Quiz…", "Đang tải Quiz…")}</p>}
      {quiz.isError && (
        <div role="alert" className="space-y-2">
          <p>
            {quiz.error instanceof ApiError && quiz.error.status === 404
              ? t("The Quiz has not been published for this Lab.", "Lab này chưa công bố Quiz.")
              : t("The Quiz could not be loaded.", "Không thể tải Quiz.")}
          </p>
          <Button variant="outline" onClick={() => void quiz.refetch()}>
            {t("Retry", "Thử lại")}
          </Button>
        </div>
      )}
      {!quiz.isError && quiz.data && (
        <AttemptForm
          key={`${path}:${quiz.data.version}`}
          quiz={quiz.data}
          path={path}
          reload={() => void quiz.refetch()}
          canSubmit={canSubmit}
          runtimeStepHref={resolvedRuntimeHref}
          submissionHref={submissionHref}
          showNextCta={showNextCta}
          refreshReadiness={() => {
            void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, labId] });
            void cache.invalidateQueries({
              queryKey: ["api", "student-lab-context", workspaceId, labId],
            });
            void cache.invalidateQueries({ queryKey: ["api", "course-roadmap", workspaceId] });
            void cache.invalidateQueries({ queryKey: ["api", "workspace-gradebook", workspaceId] });
            void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
          }}
        />
      )}
    </DetailPanel>
  );
}

function questionType(question: Question): QuestionType {
  return question.type ?? "SINGLE_CHOICE";
}

function AttemptForm({
  quiz,
  path,
  reload,
  canSubmit,
  runtimeStepHref,
  submissionHref,
  showNextCta = false,
  refreshReadiness,
}: {
  quiz: Quiz;
  path: string;
  reload: () => void;
  canSubmit: boolean;
  runtimeStepHref: string;
  refreshReadiness: () => void;
  submissionHref?: string | undefined;
  showNextCta?: boolean;
}) {
  const { t } = useLocale();
  const session = useSession();
  const userId = session.data?.user?.id ?? "anon";
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [attemptId, setAttemptId] = useState<string>();
  const [retakeMode, setRetakeMode] = useState(false);
  const timerKey = `mavis:course-quiz-timer:${userId}:${path}:v${quiz.version}`;
  const durationMinutes = calculateQuizDurationMinutes(quiz.questions.length);
  const durationSeconds = durationMinutes * 60;
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!canSubmit || (quiz.runtimeUnlocked && !retakeMode) || typeof window === "undefined") {
      setStartedAt(undefined);
      return;
    }
    try {
      const stored = window.localStorage.getItem(timerKey);
      if (stored && Number.isFinite(Date.parse(stored))) {
        setStartedAt(stored);
      } else {
        const now = new Date().toISOString();
        window.localStorage.setItem(timerKey, now);
        setStartedAt(now);
      }
    } catch {
      setStartedAt(new Date().toISOString());
    }
  }, [canSubmit, quiz.runtimeUnlocked, retakeMode, timerKey]);

  const submit = useMutation({
    mutationFn: (id: string) =>
      api<Result>(`${path}/attempts`, {
        method: "POST",
        body: JSON.stringify({
          attemptId: id,
          version: quiz.version,
          selections: quiz.questions.map((_, index) => answers[index] ?? []),
        }),
      }),
    onSuccess: (result) => {
      if (result.status === "PASSED") {
        setRetakeMode(false);
        try {
          window.localStorage.removeItem(timerKey);
        } catch {
          // Ignore storage removal errors
        }
        refreshReadiness();
      }
    },
  });
  const handleRetake = () => {
    const now = new Date().toISOString();
    try {
      window.localStorage.setItem(timerKey, now);
    } catch {}
    setAnswers({});
    setAttemptId(undefined);
    setStartedAt(now);
    setRetakeMode(true);
    submit.reset();
  };
  const answered = quiz.questions.every((_, index) => (answers[index]?.length ?? 0) > 0);
  const triggerSubmit = () => {
    if (!answered || submit.isPending) return;
    const id = attemptId ?? crypto.randomUUID();
    setAttemptId(id);
    submit.mutate(id);
  };

  const toggle = (questionIndex: number, optionIndex: number, multi: boolean) => {
    setAnswers((current) => {
      const selected = current[questionIndex] ?? [];
      const next = multi
        ? selected.includes(optionIndex)
          ? selected.filter((value) => value !== optionIndex)
          : [...selected, optionIndex].sort((left, right) => left - right)
        : [optionIndex];
      return { ...current, [questionIndex]: next };
    });
    setAttemptId(undefined);
    submit.reset();
  };

  const answeredCount = quiz.questions.filter(
    (_, index) => (answers[index] ?? []).length > 0,
  ).length;

  return (
    <div className="space-y-5">
      {quiz.lesson && (
        <details open className="rounded-xl border bg-muted/20 p-3.5">
          <summary className="cursor-pointer select-none text-xs font-semibold text-teal-800 dark:text-teal-300">
            {t(
              "Reference Theory & Lesson Summary",
              "Nội dung Lý thuyết tham chiếu trước khi làm Quiz",
            )}
          </summary>
          <div className="mt-3 border-t pt-3">
            <MarkdownPreview markdown={quiz.lesson} />
          </div>
        </details>
      )}
      {canSubmit && (!quiz.runtimeUnlocked || retakeMode) && !submit.data && startedAt && (
        <QuizCountdownBanner
          startedAt={startedAt}
          durationSeconds={durationSeconds}
          stopped={submit.isPending}
          onExpire={() => {
            if (answered && !submit.isPending) {
              triggerSubmit();
            }
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-card px-4 py-3 dark:border-teal-800/70 dark:from-teal-950/40 dark:via-emerald-950/25 dark:to-card">
        <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/85">
          <span className="font-semibold text-teal-900 dark:text-teal-200">
            {t("Module Quiz", "Bài kiểm tra kiến thức")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("Passing score", "Điểm đạt")} {quiz.passPercent}% ·{" "}
            {t(
              `${answeredCount}/${quiz.questions.length} answered`,
              `Đã trả lời ${answeredCount}/${quiz.questions.length} câu`,
            )}
          </span>
        </div>
        <Badge
          variant={
            quiz.runtimeUnlocked
              ? "default"
              : (submit.data?.status ?? quiz.latestStatus) === "NEEDS_RETRY"
                ? "destructive"
                : "outline"
          }
        >
          {!canSubmit
            ? `v${quiz.version} · ${t("Preview", "Xem trước")}`
            : quiz.runtimeUnlocked
              ? `PASSED (v${quiz.version})`
              : (submit.data?.status ?? quiz.latestStatus) === "NEEDS_RETRY"
                ? `NEEDS_RETRY (v${quiz.version})`
                : `NOT_PASSED (v${quiz.version})`}
        </Badge>
      </div>

      {!canSubmit ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "Preview for instructors — correct answers are hidden here.",
              "Bản xem trước cho giảng viên — đáp án đúng không hiển thị ở đây.",
            )}
          </p>
          <ol className="space-y-3">
            {quiz.questions.map((question, index) => (
              <li key={question.id ?? index} className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {index + 1}. {formatQuizQuestionPrompt(question.prompt)}
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {question.options.map((option, optionIndex) => (
                    <li key={optionIndex}>{sanitizeQuizPlainText(option)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : quiz.runtimeUnlocked && !retakeMode ? (
        <div className="space-y-4 rounded-2xl border border-emerald-400 bg-emerald-50/90 p-5 text-emerald-950 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-base font-bold">
                {t(
                  "Congratulations! You passed the quiz",
                  "Chúc mừng! Bạn đã hoàn thành bài kiểm tra",
                )}
              </p>
              <p role="status" className="text-sm font-medium opacity-90">
                PASSED (v{quiz.version}) ·{" "}
                {t("Quiz passed · Next step unlocked!", "Đã đạt Quiz · Đã mở khóa bước tiếp theo!")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleRetake}>
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                {t("Retake Quiz", "Làm lại bài")}
              </Button>
              {showNextCta && (
                <Button
                  asChild
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                >
                  <Link href={submissionHref ?? runtimeStepHref}>
                    {submissionHref
                      ? t("Proceed to Lab Submission", "Chuyển sang Nộp bài Lab")
                      : t(
                          "Proceed to Runtime Studio & Submit",
                          "Tiếp tục Runtime Studio & Nộp bài",
                        )}
                    <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {submit.data?.questionResults && submit.data.questionResults.length > 0 && (
            <details className="rounded-xl border border-emerald-200 bg-white/90 p-3 text-foreground dark:bg-background/90">
              <summary className="cursor-pointer text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                {t("Review Answer Explanations", "Xem giải thích chi tiết từng câu hỏi")}
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {submit.data.questionResults.map((result, index) => (
                  <li key={`${result.id}-${index}`} className="rounded-lg border p-3">
                    <p className="flex items-center gap-2 font-medium">
                      {result.correct ? (
                        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <XCircle className="size-4 text-destructive" aria-hidden="true" />
                      )}
                      {t("Question", "Câu")} {index + 1}:{" "}
                      {formatQuizQuestionPrompt(quiz.questions[index]?.prompt)}
                    </p>
                    {result.explanation && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        💡 {sanitizeQuizPlainText(result.explanation)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : submit.data?.status === "PASSED" ? (
        <div className="space-y-2">
          <p role="status">{t("Verifying your result…", "Đang xác nhận kết quả…")}</p>
          <Button variant="outline" onClick={reload}>
            {t("Refresh result", "Tải lại kết quả")}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!answered) return;
            const id = attemptId ?? crypto.randomUUID();
            setAttemptId(id);
            submit.mutate(id);
          }}
        >
          <div
            role="note"
            className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"
          >
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {t(
                submissionHref
                  ? `Reach ${quiz.passPercent}% on the current Quiz (v${quiz.version}) before submitting this Lab.`
                  : `Runtime Studio & Submission is locked until you score at least ${quiz.passPercent}% on the current Quiz version (v${quiz.version}). Review the theory and retry if needed.`,
                submissionHref
                  ? `Hãy đạt ${quiz.passPercent}% ở Quiz hiện tại (v${quiz.version}) trước khi nộp Lab.`
                  : `Runtime Studio & Nộp bài đang bị khóa cho đến khi bạn đạt tối thiểu ${quiz.passPercent}% ở phiên bản Quiz hiện tại (v${quiz.version}). Hãy ôn lại lý thuyết và làm lại nếu cần.`,
              )}
            </span>
          </div>
          {quiz.questions.map((question, index) => {
            const type = questionType(question);
            const multi = type === "MULTI_CHOICE";
            const selectedOptions = answers[index] ?? [];
            return (
              <fieldset
                key={question.id ?? index}
                className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs"
                disabled={submit.isPending || !!submit.data}
              >
                <legend className="flex flex-wrap items-center gap-2 px-1 text-sm font-semibold text-foreground">
                  <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200">
                    {t("Question", "Câu")} {index + 1}
                  </span>
                  <span>{formatQuizQuestionPrompt(question.prompt)}</span>
                  {multi && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({t("Select all that apply", "Chọn tất cả đáp án đúng")})
                    </span>
                  )}
                </legend>
                <div className="grid gap-2 pt-1">
                  {question.options.map((option, optionIndex) => {
                    const isChecked = selectedOptions.includes(optionIndex);
                    return (
                      <label
                        key={optionIndex}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                          isChecked
                            ? "border-teal-500 bg-teal-50/70 font-medium text-teal-950 dark:border-teal-500/70 dark:bg-teal-950/40 dark:text-teal-100"
                            : "border-border/80 bg-background hover:border-teal-400/70 hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={`question-${index}`}
                          className="mt-1 accent-teal-600"
                          required={!multi}
                          checked={isChecked}
                          onChange={() => toggle(index, optionIndex, multi)}
                        />
                        <span className="leading-6">{sanitizeQuizPlainText(option)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          {submit.data ? (
            <div className="space-y-4 rounded-2xl border border-rose-300 bg-rose-50/90 p-5 text-rose-950 shadow-sm dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
              <div className="space-y-1">
                <p className="text-base font-bold">
                  {t("Quiz needs another attempt", "Chưa đạt điểm yêu cầu — hãy thử lại")}
                </p>
                <p role="status" className="text-sm font-medium opacity-90">
                  {submit.data.status} · {submit.data.correctCount}/{submit.data.totalQuestions} (
                  {Math.round(
                    (submit.data.correctCount / Math.max(submit.data.totalQuestions, 1)) * 100,
                  )}
                  %)
                </p>
              </div>
              {submit.data.questionResults && submit.data.questionResults.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {submit.data.questionResults.map((result, index) => (
                    <li
                      key={`${result.id}-${index}`}
                      className="rounded-lg border bg-background/95 p-3 text-foreground"
                    >
                      <p className="flex items-center gap-2 font-medium">
                        {result.correct ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        {t("Question", "Câu")} {index + 1}:{" "}
                        {result.correct ? t("Correct", "Đúng") : t("Incorrect", "Sai")}
                        {quiz.questions[index]?.prompt
                          ? ` — ${formatQuizQuestionPrompt(quiz.questions[index].prompt)}`
                          : ""}
                      </p>
                      {result.explanation && (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          💡 {sanitizeQuizPlainText(result.explanation)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                className="bg-background text-foreground"
                onClick={handleRetake}
              >
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                {t("Retake Quiz", "Làm lại bài")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button disabled={submit.isPending || !answered}>
                {t("Submit Quiz", "Nộp Quiz")}
              </Button>
            </div>
          )}
          {submit.isError && (
            <div role="alert">
              {submit.error instanceof ApiError && submit.error.status === 409 ? (
                <div className="space-y-2">
                  <p>
                    {t(
                      "The Quiz changed. Reload to get the current version.",
                      "Quiz đã thay đổi. Hãy tải lại phiên bản hiện tại.",
                    )}
                  </p>
                  <Button type="button" variant="outline" onClick={reload}>
                    {t("Reload Quiz", "Tải lại Quiz")}
                  </Button>
                </div>
              ) : (
                <p>{t("Could not submit. Try again.", "Chưa nộp được. Vui lòng thử lại.")}</p>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
