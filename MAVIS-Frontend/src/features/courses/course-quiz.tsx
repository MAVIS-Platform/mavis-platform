"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Lock, XCircle } from "lucide-react";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";

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
}: {
  workspaceId: string;
  labId: string;
  canSubmit: boolean;
  runtimeStepHref?: string;
  submissionHref?: string | undefined;
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
          refreshReadiness={() => {
            void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, labId] });
            void cache.invalidateQueries({
              queryKey: ["api", "student-lab-context", workspaceId, labId],
            });
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
  refreshReadiness,
}: {
  quiz: Quiz;
  path: string;
  reload: () => void;
  canSubmit: boolean;
  runtimeStepHref: string;
  refreshReadiness: () => void;
  submissionHref?: string | undefined;
}) {
  const { t } = useLocale();
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [attemptId, setAttemptId] = useState<string>();
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
      if (result.status === "PASSED") refreshReadiness();
    },
  });
  const answered = quiz.questions.every((_, index) => (answers[index]?.length ?? 0) > 0);

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

  return (
    <div className="space-y-4">
      {quiz.lesson && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <MarkdownPreview markdown={quiz.lesson} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {t("Passing score", "Ngưỡng đạt")} {quiz.passPercent}%
        </span>
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
                  {index + 1}. {question.prompt}
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {question.options.map((option, optionIndex) => (
                    <li key={optionIndex}>{option}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : quiz.runtimeUnlocked ? (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <p role="status" className="text-sm font-medium">
            PASSED (v{quiz.version}) · {t("Quiz passed", "Đã đạt Quiz")}
          </p>
          <Button asChild className="w-full sm:w-auto">
            <Link href={submissionHref ?? runtimeStepHref}>
              {submissionHref
                ? t("Proceed to Submit Lab", "Chuyển sang Nộp bài Lab")
                : t("Proceed to Step 3: Live Runtime", "Tiếp tục Bước 3: Live Runtime")}
              <ArrowRight />
            </Link>
          </Button>
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
                  : `Step 3 Live Docker Runtime is locked until you score at least ${quiz.passPercent}% on the current Quiz version (v${quiz.version}). Review the theory and retry if needed.`,
                submissionHref
                  ? `Hãy đạt ${quiz.passPercent}% ở Quiz hiện tại (v${quiz.version}) trước khi nộp Lab.`
                  : `Bước 3 Live Docker Runtime đang bị khóa cho đến khi bạn đạt tối thiểu ${quiz.passPercent}% ở phiên bản Quiz hiện tại (v${quiz.version}). Hãy ôn lại lý thuyết và làm lại nếu cần.`,
              )}
            </span>
          </div>
          {quiz.questions.map((question, index) => {
            const type = questionType(question);
            const multi = type === "MULTI_CHOICE";
            return (
              <fieldset
                key={question.id ?? index}
                className="space-y-2 rounded-lg border p-3"
                disabled={submit.isPending || !!submit.data}
              >
                <legend className="px-1 font-medium">
                  {index + 1}. {question.prompt}
                  {multi && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t("Select all that apply", "Chọn tất cả đáp án đúng")}
                    </span>
                  )}
                </legend>
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="flex items-start gap-2">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`question-${index}`}
                      required={!multi}
                      checked={(answers[index] ?? []).includes(optionIndex)}
                      onChange={() => toggle(index, optionIndex, multi)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {submit.data ? (
            <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p role="status" className="text-sm font-medium">
                {submit.data.status} · {submit.data.correctCount}/{submit.data.totalQuestions}
              </p>
              {submit.data.questionResults && submit.data.questionResults.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {submit.data.questionResults.map((result, index) => (
                    <li
                      key={`${result.id}-${index}`}
                      className="rounded-md border bg-background p-2"
                    >
                      <p className="flex items-center gap-2 font-medium">
                        {result.correct ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        {t("Question", "Câu")} {index + 1}:{" "}
                        {result.correct ? t("Correct", "Đúng") : t("Incorrect", "Sai")}
                      </p>
                      {result.explanation && (
                        <p className="mt-1 text-xs text-muted-foreground">{result.explanation}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {submit.data.status === "NEEDS_RETRY" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAnswers({});
                    setAttemptId(undefined);
                    submit.reset();
                  }}
                >
                  {t("Start a new attempt", "Bắt đầu lượt mới")}
                </Button>
              )}
            </div>
          ) : (
            <Button disabled={submit.isPending || !answered}>{t("Submit Quiz", "Nộp Quiz")}</Button>
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
