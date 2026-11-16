"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lock } from "lucide-react";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";

type Quiz = {
  version: number;
  lesson: string;
  passPercent: number;
  passed: boolean;
  latestStatus: "PASSED" | "NEEDS_RETRY" | "NOT_ATTEMPTED" | null;
  runtimeUnlocked: boolean;
  questions: { prompt: string; options: string[] }[];
};
type Result = { correctCount: number; totalQuestions: number; status: "PASSED" | "NEEDS_RETRY" };

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
          <p>{quiz.error instanceof ApiError && quiz.error.status === 404
            ? t("The Quiz has not been published for this Lab.", "Lab này chưa công bố Quiz.")
            : t("The Quiz could not be loaded.", "Không thể tải Quiz.")}</p>
          <Button variant="outline" onClick={() => void quiz.refetch()}>{t("Retry", "Thử lại")}</Button>
        </div>
      )}
      {!quiz.isError && quiz.data && <AttemptForm key={`${path}:${quiz.data.version}`} quiz={quiz.data} path={path}
        reload={() => void quiz.refetch()} canSubmit={canSubmit}
        runtimeStepHref={resolvedRuntimeHref} submissionHref={submissionHref}
        refreshReadiness={() => void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, labId] })} />}
    </DetailPanel>
  );
}

function AttemptForm({ quiz, path, reload, canSubmit, runtimeStepHref, submissionHref, refreshReadiness }: {
  quiz: Quiz; path: string; reload: () => void; canSubmit: boolean; runtimeStepHref: string; refreshReadiness: () => void;
  submissionHref?: string | undefined;
}) {
  const { t } = useLocale();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [attemptId, setAttemptId] = useState<string>();
  const submit = useMutation({
    mutationFn: (id: string) => api<Result>(`${path}/attempts`, {
      method: "POST",
      body: JSON.stringify({ attemptId: id, version: quiz.version, answers: quiz.questions.map((_, i) => answers[i]) }),
    }),
    onSuccess: (result) => { if (result.status === "PASSED") refreshReadiness(); },
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("Passing score", "Ngưỡng đạt")} {quiz.passPercent}%</span>
        <Badge variant={quiz.runtimeUnlocked ? "default" : (submit.data?.status ?? quiz.latestStatus) === "NEEDS_RETRY" ? "destructive" : "outline"}>
          {!canSubmit
            ? `v${quiz.version} · ${t("Preview", "Xem trước")}`
            : quiz.runtimeUnlocked
              ? `PASSED (v${quiz.version})`
              : (submit.data?.status ?? quiz.latestStatus) === "NEEDS_RETRY"
                ? `NEEDS_RETRY (v${quiz.version})`
                : `NOT_PASSED (v${quiz.version})`}
        </Badge>
      </div>
      {!canSubmit ? <p>{t("Preview for instructors", "Bản xem trước cho giảng viên")}</p> : quiz.runtimeUnlocked ? (
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
          <Button variant="outline" onClick={reload}>{t("Refresh result", "Tải lại kết quả")}</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const id = attemptId ?? crypto.randomUUID();
          setAttemptId(id);
          submit.mutate(id);
        }}>
          <div role="note" className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
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
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p role="status" className="text-sm font-medium">
                NEEDS_RETRY · {t("Try again", "Cần làm lại")} · {submit.data.correctCount}/{submit.data.totalQuestions}
              </p>
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
                ? <div className="space-y-2">
                    <p>{t("The Quiz changed. Reload to get the current version.", "Quiz đã thay đổi. Hãy tải lại phiên bản hiện tại.")}</p>
                    <Button type="button" variant="outline" onClick={reload}>{t("Reload Quiz", "Tải lại Quiz")}</Button>
                  </div>
                : <p>{t("Could not submit. Try again.", "Chưa nộp được. Vui lòng thử lại.")}</p>}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
