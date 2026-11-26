"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileQuestion, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi, useSession } from "@/hooks/use-api";
import { api, ApiError } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatQuizQuestionPrompt, sanitizeQuizPlainText } from "@/lib/format/course-display";
import type { QuizQuestionData } from "./java-coursera-curriculum-data";
import { useCourseQuiz } from "./course-quiz";
import { calculateQuizDurationMinutes, QuizCountdownBanner } from "./quiz-timer";
import { isUuidSegment } from "@/features/workspaces/course-access";

const PASS_PERCENT = 70;
type QuestionType = "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE";
type RunnerQuestionData = QuizQuestionData & { type?: QuestionType | undefined };
type BackendQuestionResult = {
  id: string;
  correct: boolean;
  explanation?: string | null | undefined;
};
type QuizAttemptStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
type StoredQuizAttempt = {
  attemptId: string;
  status: QuizAttemptStatus;
  answers: Record<string, number | number[]>;
  startedAt?: string | undefined;
  durationSeconds?: number | undefined;
  correctCount?: number;
  submittedAt?: string | undefined;
  scorePercent?: number;
  passed?: boolean;
  everPassed?: boolean;
  questionResults?: BackendQuestionResult[] | undefined;
};

type BackendQuizResult = {
  correctCount: number;
  totalQuestions: number;
  status: "PASSED" | "NEEDS_RETRY";
  questionResults?: BackendQuestionResult[] | undefined;
};

function toSelectedIndexes(value: number | number[] | undefined): number[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "number" && Number.isInteger(item));
  }
  return typeof value === "number" && Number.isInteger(value) ? [value] : [];
}

function makeAttemptId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseInlineQuizPassPercent(
  content: Record<string, unknown> | null | undefined,
): number {
  const raw = content?.["passPercent"];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.min(100, Math.round(raw)));
  }
  return PASS_PERCENT;
}

export function parseInlineQuizQuestions(
  content: Record<string, unknown> | null | undefined,
): RunnerQuestionData[] {
  const raw = content?.["questions"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, idx): RunnerQuestionData | null => {
      if (!entry || typeof entry !== "object") return null;
      const rec = entry as Record<string, unknown>;
      const prompt = typeof rec["prompt"] === "string" ? rec["prompt"].trim() : "";
      const options = Array.isArray(rec["options"])
        ? rec["options"].map((opt) => String(opt ?? "").trim())
        : [];
      if (!prompt || options.length < 2 || options.some((opt) => !opt)) {
        return null;
      }
      const rawMulti = Array.isArray(rec["correctOptions"])
        ? rec["correctOptions"].filter(
            (v): v is number => typeof v === "number" && Number.isInteger(v),
          )
        : [];
      const hasMulti = rawMulti.length > 0;
      const validMulti = hasMulti && rawMulti.every((v) => v >= 0 && v < options.length);
      const hasCorrectOption =
        rec["correctOption"] !== undefined && rec["correctOption"] !== null;
      const correctOption = hasCorrectOption
        ? typeof rec["correctOption"] === "number"
          ? rec["correctOption"]
          : -2
        : -1;
      if (hasMulti && !validMulti) return null;
      if (!hasMulti && hasCorrectOption && (correctOption < 0 || correctOption >= options.length)) {
        return null;
      }
      const rawType = typeof rec["type"] === "string" ? rec["type"].toUpperCase() : "";
      const type: QuestionType =
        rawType === "MULTI_CHOICE" || validMulti
          ? "MULTI_CHOICE"
          : rawType === "TRUE_FALSE"
            ? "TRUE_FALSE"
            : "SINGLE_CHOICE";
      return {
        id:
          typeof rec["id"] === "string" && rec["id"].trim()
            ? rec["id"].trim()
            : `inline-q-${idx + 1}`,
        prompt,
        type,
        options,
        correctOption: validMulti ? (rawMulti[0] ?? -1) : correctOption,
        ...(validMulti ? { correctOptions: rawMulti } : {}),
        explanation: typeof rec["explanation"] === "string" ? rec["explanation"] : "",
      };
    })
    .filter((q): q is RunnerQuestionData => q !== null);
}

/** The curriculum fixture has no quiz-attempt API. This explicit device-local store
 * preserves attempts scoped per user so shared lab machines never leak another student's pass state. */
export function attemptStorageKey(
  userId: string | null | undefined,
  workspaceId: string,
  assignmentId: string | null | undefined,
  title: string,
) {
  return `mavis:curriculum-quiz-attempt:${userId || "anon"}:${workspaceId}:${assignmentId ?? "curriculum"}:${title}`;
}

export function ChapterQuizRunner({
  title,
  questions,
  canManage,
  workspaceId,
  assignmentId,
  courseItemId,
  inlinePassPercent,
  nextLessonTitle,
  onNextLesson,
  hideTitle,
}: {
  title: string;
  questions: RunnerQuestionData[];
  canManage: boolean;
  workspaceId: string;
  assignmentId?: string | null | undefined;
  courseItemId?: string | null | undefined;
  inlinePassPercent?: number | undefined;
  nextLessonTitle?: string | undefined;
  onNextLesson?: (() => void) | undefined;
  hideTitle?: boolean | undefined;
}) {
  const { t } = useLocale();
  const client = useApi();
  const session = useSession();
  const userId = session.data?.user?.id;
  const cache = useQueryClient();
  const hasAssignmentBackend = client.mode === "backend" && Boolean(assignmentId);
  const backendQuizEnabled = hasAssignmentBackend && !canManage;
  const inlineBackendQuizEnabled =
    client.mode === "backend" &&
    !assignmentId &&
    !canManage &&
    isUuidSegment(workspaceId) &&
    isUuidSegment(courseItemId);
  const backendQuiz = useCourseQuiz(workspaceId, assignmentId ?? "", hasAssignmentBackend);
  const passPercent = backendQuizEnabled
    ? (backendQuiz.data?.passPercent ?? PASS_PERCENT)
    : (inlinePassPercent ?? PASS_PERCENT);
  const storageKey = useMemo(
    () => attemptStorageKey(userId, workspaceId, assignmentId, title),
    [assignmentId, title, userId, workspaceId],
  );
  const [attempt, setAttempt] = useState<StoredQuizAttempt | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const autoSubmittedAttemptRef = useRef<string>("");

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

  const submitBackendAttempt = useMutation({
    mutationFn: (nextAttempt: StoredQuizAttempt) =>
      api<BackendQuizResult>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/attempts`,
        {
          method: "POST",
          body: JSON.stringify({
            attemptId: nextAttempt.attemptId,
            version: backendQuiz.data?.version,
            selections: (backendQuiz.data?.questions ?? []).map((question, index) =>
              toSelectedIndexes(nextAttempt.answers[question.id ?? `question-${index}`]),
            ),
          }),
        },
      ),
    onSuccess: (result, nextAttempt) => {
      const submittedAtIso = new Date().toISOString();
      const total = Math.max(result.totalQuestions, 1);
      updateAttempt({
        attemptId: nextAttempt.attemptId,
        status: "SUBMITTED",
        answers: nextAttempt.answers,
        ...(nextAttempt.startedAt ? { startedAt: nextAttempt.startedAt } : {}),
        ...(nextAttempt.durationSeconds ? { durationSeconds: nextAttempt.durationSeconds } : {}),
        submittedAt: submittedAtIso,
        correctCount: result.correctCount,
        scorePercent: Math.round((result.correctCount / total) * 100),
        passed: result.status === "PASSED",
        questionResults: result.questionResults ?? [],
      });
      cache.setQueryData(
        ["api", "course-quiz", workspaceId, assignmentId],
        (prev: Record<string, unknown> | undefined) =>
          prev
            ? {
                ...prev,
                latestStatus: result.status,
                latestCorrectCount: result.correctCount,
                latestSubmittedAt: submittedAtIso,
                passed: Boolean(prev["passed"]) || result.status === "PASSED",
                runtimeUnlocked: Boolean(prev["runtimeUnlocked"]) || result.status === "PASSED",
              }
            : prev,
      );
      if (result.questionResults?.length) {
        setShowFeedback(true);
      }
      void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, assignmentId] });
      void cache.invalidateQueries({
        queryKey: ["api", "student-lab-context", workspaceId, assignmentId],
      });
      void cache.invalidateQueries({ queryKey: ["api", "course-roadmap", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "workspace-gradebook", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
    },
  });

  const submitInlineBackendAttempt = useMutation({
    mutationFn: (nextAttempt: StoredQuizAttempt) =>
      api<BackendQuizResult>(
        `workspaces/${encodeURIComponent(workspaceId)}/course/items/${encodeURIComponent(courseItemId ?? "")}/quiz-check`,
        {
          method: "POST",
          body: JSON.stringify({
            selections: questions.map((question, index) =>
              toSelectedIndexes(nextAttempt.answers[question.id ?? `inline-q-${index + 1}`]),
            ),
          }),
        },
      ),
    onSuccess: (result, nextAttempt) => {
      const submittedAtIso = new Date().toISOString();
      const total = Math.max(result.totalQuestions, 1);
      const passedNow = result.status === "PASSED";
      updateAttempt({
        attemptId: nextAttempt.attemptId,
        status: "SUBMITTED",
        answers: nextAttempt.answers,
        ...(nextAttempt.startedAt ? { startedAt: nextAttempt.startedAt } : {}),
        ...(nextAttempt.durationSeconds ? { durationSeconds: nextAttempt.durationSeconds } : {}),
        submittedAt: submittedAtIso,
        correctCount: result.correctCount,
        scorePercent: Math.round((result.correctCount / total) * 100),
        passed: passedNow,
        everPassed: passedNow || Boolean(nextAttempt.everPassed || attempt?.passed || attempt?.everPassed),
        questionResults: result.questionResults ?? [],
      });
      if (result.questionResults?.length) {
        setShowFeedback(true);
      }
    },
  });

  useEffect(() => {
    if (
      !backendQuizEnabled ||
      !backendQuiz.data ||
      submitBackendAttempt.isPending ||
      attempt?.status === "IN_PROGRESS"
    ) {
      return;
    }
    const submitted =
      backendQuiz.data.latestStatus === "PASSED" || backendQuiz.data.latestStatus === "NEEDS_RETRY";
    if (!submitted) {
      if (attempt?.status === "SUBMITTED") {
        setAttempt(null);
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore storage access errors.
        }
      }
      return;
    }
    if (
      attempt?.status === "SUBMITTED" &&
      attempt.submittedAt &&
      backendQuiz.data.latestSubmittedAt &&
      Date.parse(backendQuiz.data.latestSubmittedAt) < Date.parse(attempt.submittedAt) - 2000
    ) {
      return;
    }
    const total = backendQuiz.data.questions.length;
    const correct = backendQuiz.data.latestCorrectCount;
    const recordedScore =
      correct === null || correct === undefined || total === 0
        ? attempt?.scorePercent
        : Math.round((correct / total) * 100);
    const recordedPassed = backendQuiz.data.latestStatus === "PASSED";
    if (
      attempt?.status === "SUBMITTED" &&
      attempt.scorePercent === recordedScore &&
      attempt.correctCount === (correct ?? attempt.correctCount) &&
      attempt.passed === recordedPassed &&
      attempt.submittedAt === (backendQuiz.data.latestSubmittedAt ?? attempt.submittedAt)
    ) {
      return;
    }
    const recordedAttempt: StoredQuizAttempt = {
      attemptId: attempt?.attemptId || `recorded-${backendQuiz.data.version}`,
      status: "SUBMITTED",
      answers: attempt?.answers ?? {},
      passed: recordedPassed,
      ...(attempt?.questionResults ? { questionResults: attempt.questionResults } : {}),
    };
    const submittedAt = backendQuiz.data.latestSubmittedAt ?? attempt?.submittedAt;
    if (submittedAt) recordedAttempt.submittedAt = submittedAt;
    if (recordedScore !== undefined) recordedAttempt.scorePercent = recordedScore;
    if (correct !== null && correct !== undefined) recordedAttempt.correctCount = correct;
    updateAttempt(recordedAttempt);
  }, [attempt, backendQuiz.data, backendQuizEnabled, storageKey, submitBackendAttempt.isPending]);

  const displayedQuestions = useMemo<RunnerQuestionData[]>(() => {
    if (hasAssignmentBackend && backendQuiz.data?.questions) {
      return backendQuiz.data.questions.map((question, index) => ({
        id: question.id ?? `question-${index}`,
        prompt: question.prompt,
        type: question.type ?? "SINGLE_CHOICE",
        options: question.options,
        correctOption: -1,
        explanation: "",
      }));
    }
    if (backendQuizEnabled) return [];
    return questions;
  }, [backendQuiz.data?.questions, backendQuizEnabled, hasAssignmentBackend, questions]);

  if (hasAssignmentBackend && backendQuiz.isPending) {
    return (
      <p className="mx-auto mt-8 max-w-[850px] text-sm text-muted-foreground">
        {t("Loading quiz…", "Đang tải Quiz…")}
      </p>
    );
  }
  if (backendQuizEnabled && backendQuiz.isError) {
    const isForbidden = backendQuiz.error instanceof ApiError && backendQuiz.error.status === 403;
    return (
      <div
        role="alert"
        className={`mx-auto mt-6 max-w-[850px] space-y-3 rounded-xl border p-4 text-sm ${
          isForbidden ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-destructive/30"
        }`}
      >
        <p>
          {backendQuiz.error instanceof ApiError && backendQuiz.error.status === 404
            ? t(
                "This module Quiz has not been published yet.",
                "Quiz của Module này chưa được công bố.",
              )
            : isForbidden
              ? t(
                  "This module Quiz is locked until you pass the previous Lab.",
                  "Quiz của Module này đang bị khóa — hãy hoàn thành bài Lab trước để mở khóa.",
                )
              : t("The module Quiz could not be loaded.", "Không thể tải Quiz của Module.")}
        </p>
        {!isForbidden && (
          <Button type="button" variant="outline" onClick={() => void backendQuiz.refetch()}>
            {t("Retry", "Thử lại")}
          </Button>
        )}
      </div>
    );
  }

  if (canManage)
    return (
      <QuizPreview
        title={title}
        questions={displayedQuestions}
        workspaceId={workspaceId}
        assignmentId={assignmentId}
      />
    );

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

  if (!isHydrated)
    return (
      <p className="mx-auto mt-8 max-w-[850px] text-sm text-muted-foreground">
        {t("Loading quiz…", "Đang tải Quiz…")}
      </p>
    );

  const durationMinutes = calculateQuizDurationMinutes(displayedQuestions.length);
  const durationSeconds = durationMinutes * 60;
  const activeAttempt = attempt ?? { attemptId: "", status: "NOT_STARTED" as const, answers: {} };
  const resolvedStartedAt =
    activeAttempt.startedAt ??
    (activeAttempt.status === "IN_PROGRESS" ? new Date().toISOString() : undefined);
  const resolvedDurationSeconds = activeAttempt.durationSeconds ?? durationSeconds;

  const isLocalQuestionCorrect = (question: RunnerQuestionData, selected: number[]) => {
    const multiCorrect = (question as RunnerQuestionData & { correctOptions?: number[] }).correctOptions;
    if (Array.isArray(multiCorrect) && multiCorrect.length > 0) {
      return (
        selected.length === multiCorrect.length &&
        multiCorrect.every((idx) => selected.includes(idx))
      );
    }
    return (
      typeof question.correctOption === "number" &&
      question.correctOption >= 0 &&
      selected.length === 1 &&
      selected[0] === question.correctOption
    );
  };

  const isSubmitting = submitBackendAttempt.isPending || submitInlineBackendAttempt.isPending;

  const submitAttempt = () => {
    if ((backendQuizEnabled || inlineBackendQuizEnabled) && isSubmitting) return;
    const pickedCorrect = displayedQuestions.filter((question) =>
      isLocalQuestionCorrect(question, toSelectedIndexes(activeAttempt.answers[question.id])),
    ).length;
    const computedScore = Math.round((pickedCorrect / Math.max(1, displayedQuestions.length)) * 100);
    const passedNow = computedScore >= passPercent;
    const nextAttempt: StoredQuizAttempt = {
      attemptId: activeAttempt.attemptId || makeAttemptId(),
      status: "SUBMITTED",
      answers: activeAttempt.answers,
      ...(activeAttempt.startedAt ? { startedAt: activeAttempt.startedAt } : {}),
      ...(activeAttempt.durationSeconds ? { durationSeconds: activeAttempt.durationSeconds } : {}),
      submittedAt: new Date().toISOString(),
      correctCount: pickedCorrect,
      scorePercent: computedScore,
      passed: passedNow,
      everPassed: passedNow || Boolean(activeAttempt.passed || activeAttempt.everPassed),
    };
    if (backendQuizEnabled) submitBackendAttempt.mutate(nextAttempt);
    else if (inlineBackendQuizEnabled) submitInlineBackendAttempt.mutate(nextAttempt);
    else updateAttempt(nextAttempt);
  };

  const currentAttempt = activeAttempt;
  if (currentAttempt.status === "NOT_STARTED") {
    return (
      <QuizLanding
        title={title}
        hideTitle={hideTitle}
        questionCount={displayedQuestions.length}
        passPercent={passPercent}
        durationMinutes={durationMinutes}
        onStart={() =>
          updateAttempt({
            attemptId: makeAttemptId(),
            status: "IN_PROGRESS",
            answers: {},
            startedAt: new Date().toISOString(),
            durationSeconds,
          })
        }
      />
    );
  }

  const selectedCorrectCount = displayedQuestions.filter((question) =>
    isLocalQuestionCorrect(question, toSelectedIndexes(currentAttempt.answers[question.id])),
  ).length;
  const correctCount = currentAttempt.correctCount ?? selectedCorrectCount;
  const scorePercent =
    currentAttempt.scorePercent ?? Math.round((correctCount / displayedQuestions.length) * 100);
  const canViewFeedback =
    (!backendQuizEnabled && !inlineBackendQuizEnabled) || Boolean(currentAttempt.questionResults?.length);
  if (currentAttempt.status === "SUBMITTED") {
    return (
      <QuizResult
        title={title}
        hideTitle={hideTitle}
        scorePercent={scorePercent}
        passPercent={passPercent}
        passedOverride={currentAttempt.passed}
        correctCount={correctCount}
        questionCount={displayedQuestions.length}
        submittedAt={currentAttempt.submittedAt}
        showFeedback={showFeedback}
        canViewFeedback={canViewFeedback}
        questions={displayedQuestions}
        answers={currentAttempt.answers}
        questionResults={currentAttempt.questionResults}
        nextLessonTitle={undefined}
        onToggleFeedback={() => setShowFeedback((current) => !current)}
        onRetry={() => {
          setShowFeedback(false);
          autoSubmittedAttemptRef.current = "";
          updateAttempt({
            attemptId: makeAttemptId(),
            status: "IN_PROGRESS",
            answers: {},
            startedAt: new Date().toISOString(),
            durationSeconds,
            ...(currentAttempt.passed || currentAttempt.everPassed ? { everPassed: true } : {}),
          });
        }}
      />
    );
  }

  return (
    <QuizTaking
      title={title}
      hideTitle={hideTitle}
      questions={displayedQuestions}
      answers={currentAttempt.answers}
      passPercent={passPercent}
      startedAt={resolvedStartedAt}
      durationSeconds={resolvedDurationSeconds}
      onExpire={() => {
        if (
          isSubmitting ||
          autoSubmittedAttemptRef.current === currentAttempt.attemptId
        ) {
          return;
        }
        autoSubmittedAttemptRef.current = currentAttempt.attemptId;
        submitAttempt();
      }}
      onAnswer={(questionId, optionIndex, multi) => {
        const currentSelected = toSelectedIndexes(currentAttempt.answers[questionId]);
        const nextValue: number | number[] = multi
          ? currentSelected.includes(optionIndex)
            ? currentSelected.filter((idx) => idx !== optionIndex)
            : [...currentSelected, optionIndex].sort((a, b) => a - b)
          : optionIndex;
        updateAttempt({
          ...currentAttempt,
          startedAt: resolvedStartedAt ?? new Date().toISOString(),
          durationSeconds: resolvedDurationSeconds,
          answers: { ...currentAttempt.answers, [questionId]: nextValue },
        });
      }}
      submitting={isSubmitting}
      submitError={submitBackendAttempt.error ?? submitInlineBackendAttempt.error}
      onSubmit={submitAttempt}
    />
  );
}

function QuizLanding({
  title,
  hideTitle,
  questionCount,
  passPercent,
  durationMinutes,
  onStart,
}: {
  title: string;
  hideTitle?: boolean | undefined;
  questionCount: number;
  passPercent: number;
  durationMinutes: number;
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
        {!hideTitle && <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>}
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
            <dt className="text-muted-foreground">{t("Passing score", "Điểm đạt")}</dt>
            <dd className="font-semibold">{passPercent}%</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("Time limit", "Thời lượng")}</dt>
            <dd className="font-semibold">
              {durationMinutes} {t("minutes", "phút")}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function QuizTaking({
  title,
  hideTitle,
  questions,
  answers,
  passPercent,
  startedAt,
  durationSeconds,
  onExpire,
  onAnswer,
  onSubmit,
  submitting = false,
  submitError,
}: {
  title: string;
  hideTitle?: boolean | undefined;
  questions: RunnerQuestionData[];
  answers: Record<string, number | number[]>;
  passPercent: number;
  startedAt?: string | undefined;
  durationSeconds?: number | undefined;
  onExpire?: (() => void) | undefined;
  onAnswer: (questionId: string, optionIndex: number, multi: boolean) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitError?: Error | null;
}) {
  const { t } = useLocale();
  const [confirmPartialOpen, setConfirmPartialOpen] = useState(false);
  useEffect(() => {
    if (submitting) setConfirmPartialOpen(false);
  }, [submitting]);
  const answeredCount = questions.filter(
    (question) => toSelectedIndexes(answers[question.id]).length > 0,
  ).length;
  const remainingCount = Math.max(questions.length - answeredCount, 0);
  const allAnswered = answeredCount === questions.length;
  return (
    <section className="mx-auto mt-6 max-w-[850px] pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          <Badge variant="outline">{t("Graded quiz", "Bài kiểm tra tính điểm")}</Badge>
          {!hideTitle && <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {t(
                `${answeredCount}/${questions.length} answered`,
                `Đã trả lời ${answeredCount}/${questions.length} câu`,
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t(`Passing score ${passPercent}%`, `Điểm đạt ${passPercent}%`)}</span>
          </div>
        </div>
        {durationSeconds && durationSeconds > 0 && (
          <QuizCountdownBanner
            startedAt={startedAt}
            durationSeconds={durationSeconds}
            stopped={submitting}
            onExpire={onExpire}
          />
        )}
      </header>
      <ol className="mt-8 space-y-10">
        {questions.map((question, questionIndex) => {
          const multi = question.type === "MULTI_CHOICE";
          const selectedIndexes = toSelectedIndexes(answers[question.id]);
          return (
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
                  {multi && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({t("Select all that apply", "Chọn tất cả đáp án đúng")})
                    </span>
                  )}
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
                          type={multi ? "checkbox" : "radio"}
                          value={optionIndex}
                          checked={selectedIndexes.includes(optionIndex)}
                          onChange={() => onAnswer(question.id, optionIndex, multi)}
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
          );
        })}
      </ol>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          {allAnswered
            ? t("All questions are answered.", "Bạn đã trả lời tất cả câu hỏi.")
            : t(
                `You have ${remainingCount} unanswered question(s). Blank answers will be scored 0.`,
                `Bạn còn ${remainingCount} câu chưa trả lời (câu bỏ trống tính 0 điểm).`,
              )}
        </p>
        <Button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (remainingCount > 0) {
              setConfirmPartialOpen(true);
              return;
            }
            onSubmit();
          }}
        >
          {submitting ? t("Submitting…", "Đang nộp…") : t("Submit Quiz", "Nộp Quiz")}
        </Button>
      </div>
      <Dialog open={confirmPartialOpen} onOpenChange={setConfirmPartialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Confirm quiz submission", "Xác nhận nộp bài Quiz")}</DialogTitle>
            <DialogDescription>
              {t(
                `You have ${remainingCount} unanswered question(s). Blank answers will be scored 0. Are you sure you want to submit?`,
                `Bạn còn ${remainingCount} câu chưa trả lời. Các câu bỏ trống sẽ tính 0 điểm. Bạn có chắc muốn nộp bài?`,
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmPartialOpen(false)}
            >
              {t("Keep working", "Quay lại làm tiếp")}
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                setConfirmPartialOpen(false);
                onSubmit();
              }}
            >
              {t("Submit quiz", "Xác nhận nộp bài")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  hideTitle,
  scorePercent,
  passPercent,
  passedOverride,
  correctCount,
  questionCount,
  submittedAt,
  showFeedback,
  canViewFeedback,
  questions,
  answers,
  questionResults,
  nextLessonTitle,
  onToggleFeedback,
  onRetry,
}: {
  title: string;
  hideTitle?: boolean | undefined;
  scorePercent: number;
  passPercent: number;
  passedOverride?: boolean | undefined;
  correctCount: number;
  questionCount: number;
  submittedAt?: string | undefined;
  showFeedback: boolean;
  canViewFeedback: boolean;
  questions: RunnerQuestionData[];
  answers: Record<string, number | number[]>;
  questionResults?: BackendQuestionResult[] | undefined;
  nextLessonTitle?: string | undefined;
  onToggleFeedback: () => void;
  onRetry: () => void;
  onNextLesson?: (() => void) | undefined;
}) {
  const { locale, t } = useLocale();
  const passed = typeof passedOverride === "boolean" ? passedOverride : scorePercent >= passPercent;
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(submittedAt))
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
        {!hideTitle && <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>}
        <p className="mt-3 text-sm text-muted-foreground">
          {t("Your result is ready.", "Kết quả của bạn đã sẵn sàng.")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            {t("Retake Quiz", "Làm lại bài")}
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
            {t(`Passing score: ${passPercent}%.`, `Điểm đạt: ${passPercent}%.`)}
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
        <ol className="space-y-4 border-t p-6 sm:p-8">
          {questions.map((question, index) => {
            if (questionResults && questionResults.length > 0) {
              const result =
                questionResults.find((item) => item.id === question.id) ?? questionResults[index];
              if (!result) return null;
              const selectedIndexes = toSelectedIndexes(answers[question.id]);
              const selectedText = selectedIndexes
                .map((optIdx) => question.options[optIdx])
                .filter((opt): opt is string => typeof opt === "string")
                .map((opt) => sanitizeQuizPlainText(opt))
                .join(", ");
              return (
                <li key={question.id} className="rounded-lg border p-3.5 text-sm">
                  <p className="flex items-start gap-2 font-medium">
                    {result.correct ? (
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-4 shrink-0 text-rose-600"
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      {index + 1}. {formatQuizQuestionPrompt(question.prompt)}
                    </span>
                  </p>
                  <p
                    className={`mt-2 text-xs font-medium ${result.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                  >
                    {result.correct ? t("Correct", "Chính xác") : t("Review needed", "Cần xem lại")}
                    {selectedText ? ` · ${t("Your answer", "Bạn chọn")}: ${selectedText}` : ""}
                  </p>
                  {result.explanation && (
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                      {sanitizeQuizPlainText(result.explanation)}
                    </p>
                  )}
                </li>
              );
            }
            const selectedIndexes = toSelectedIndexes(answers[question.id]);
            const isCorrect =
              selectedIndexes.length === 1 && selectedIndexes[0] === question.correctOption;
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
