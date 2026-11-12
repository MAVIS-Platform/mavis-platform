"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";

type Quiz = {
  version: number;
  lesson: string;
  passPercent: number;
  passed: boolean;
  questions: { prompt: string; options: string[] }[];
};
type Result = { correctCount: number; totalQuestions: number; status: "PASSED" | "NEEDS_RETRY" };

export function CourseQuiz({ workspaceId, labId, canSubmit }: { workspaceId: string; labId: string; canSubmit: boolean }) {
  const { t } = useLocale();
  const path = `workspaces/${workspaceId}/course-labs/${labId}/quiz`;
  const quiz = useQuery({
    queryKey: ["api", "course-quiz", workspaceId, labId],
    queryFn: ({ signal }) => api<Quiz>(path, { signal }),
    retry: false,
  });
  return (
    <DetailPanel title={t("Theory and Quiz", "Lý thuyết và Quiz")}>
      {quiz.isPending && <p role="status">{t("Loading Quiz…", "Đang tải Quiz…")}</p>}
      {quiz.isError && (
        <div role="alert" className="space-y-2">
          <p>{quiz.error instanceof ApiError && quiz.error.status === 404
            ? t("The Quiz has not been published for this Lab.", "Lab này chưa công bố Quiz.")
            : t("The Quiz could not be loaded.", "Không thể tải Quiz.")}</p>
          <Button variant="outline" onClick={() => void quiz.refetch()}>{t("Retry", "Thử lại")}</Button>
        </div>
      )}
      {quiz.data && <AttemptForm key={`${path}:${quiz.data.version}`} quiz={quiz.data} path={path} reload={() => void quiz.refetch()} canSubmit={canSubmit} />}
    </DetailPanel>
  );
}

function AttemptForm({ quiz, path, reload, canSubmit }: { quiz: Quiz; path: string; reload: () => void; canSubmit: boolean }) {
  const { t } = useLocale();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [attemptId, setAttemptId] = useState<string>();
  const submit = useMutation({
    mutationFn: (id: string) => api<Result>(`${path}/attempts`, {
      method: "POST",
      body: JSON.stringify({ attemptId: id, version: quiz.version, answers: quiz.questions.map((_, i) => answers[i]) }),
    }),
  });

  return (
    <div className="space-y-4">
      <div className="whitespace-pre-wrap text-sm">
        {quiz.lesson.split("\n").map((line, index) => (
          <span key={index}>
            {/^https:\/\/[^\s]+$/.test(line)
              ? <a href={line} className="break-all text-primary underline" target="_blank" rel="noreferrer">{line}</a>
              : line}
            {"\n"}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t("Passing score", "Ngưỡng đạt")} {quiz.passPercent}%</p>
      {!canSubmit ? <p>{t("Preview for instructors", "Bản xem trước cho giảng viên")}</p> : quiz.passed || submit.data?.status === "PASSED" ? (
        <p role="status">{t("Quiz passed", "Đã đạt Quiz")}</p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const id = attemptId ?? crypto.randomUUID();
          setAttemptId(id);
          submit.mutate(id);
        }}>
          {quiz.questions.map((question, i) => (
            <fieldset key={i} className="space-y-2 rounded-lg border p-3" disabled={submit.isPending || !!submit.data}>
              <legend className="px-1 font-medium">{i + 1}. {question.prompt}</legend>
              {question.options.map((option, j) => (
                <label key={j} className="flex items-start gap-2">
                  <input type="radio" name={`question-${i}`} required checked={answers[i] === j} onChange={() => {
                    setAnswers({ ...answers, [i]: j });
                    setAttemptId(undefined);
                    submit.reset();
                  }} />
                  {option}
                </label>
              ))}
            </fieldset>
          ))}
          {submit.data ? (
            <div className="space-y-2">
              <p role="status">{t("Try again", "Cần làm lại")} · {submit.data.correctCount}/{submit.data.totalQuestions}</p>
              <Button type="button" variant="outline" onClick={() => {
                setAnswers({});
                setAttemptId(undefined);
                submit.reset();
              }}>{t("Start a new attempt", "Bắt đầu lượt mới")}</Button>
            </div>
          ) : (
            <Button disabled={submit.isPending || Object.keys(answers).length !== quiz.questions.length}>
              {t("Submit Quiz", "Nộp Quiz")}
            </Button>
          )}
          {submit.isError && (
            <div role="alert">
              {submit.error instanceof ApiError && submit.error.status === 409
                ? <Button type="button" variant="outline" onClick={reload}>{t("Reload Quiz", "Tải lại Quiz")}</Button>
                : <p>{t("Could not submit. Try again.", "Chưa nộp được. Vui lòng thử lại.")}</p>}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
