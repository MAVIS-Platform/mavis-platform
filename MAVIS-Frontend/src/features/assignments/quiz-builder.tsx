"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  History,
  Library,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/locale-context";
import { api, ApiError } from "@/lib/mainflow-api";
import { useCurriculum } from "@/features/courses/curriculum";
import {
  DEFAULT_PASS_PERCENT,
  emptyQuestion,
  parseQuizCsv,
  parseQuizJson,
  questionErrors,
  quizErrors,
  quizToCsv,
  quizToJson,
  type QuizDraft,
  type QuizQuestion,
  type QuizQuestionType,
} from "./quiz-types";

type Version = { version: number; lesson: string; passPercent: number; publishedAt: string };
type BankQuestion = { id: string; moduleId: string | null; question: QuizQuestion; createdAt: string };
type Tab = "questions" | "preview" | "import" | "bank" | "versions";

const TYPE_LABELS: Record<QuizQuestionType, { en: string; vi: string }> = {
  SINGLE_CHOICE: { en: "Single choice", vi: "Một đáp án" },
  MULTI_CHOICE: { en: "Multiple choice", vi: "Nhiều đáp án" },
  TRUE_FALSE: { en: "True / False", vi: "Đúng / Sai" },
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function QuizBuilder({ workspaceId, assignmentId }: { workspaceId: string; assignmentId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const draftPath = `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/draft`;
  const publishPath = `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/publish`;
  const bankPath = `workspaces/${workspaceId}/quiz-bank/questions`;
  const draft = useQuery({
    queryKey: ["api", "quiz-draft", workspaceId, assignmentId],
    queryFn: ({ signal }) => api<QuizDraft>(draftPath, { signal }),
    retry: false,
  });
  const versions = useQuery({
    queryKey: ["api", "quiz-versions", workspaceId, assignmentId],
    queryFn: ({ signal }) => api<Version[]>(`workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/versions`, { signal }),
    retry: false,
  });
  const bank = useQuery({
    queryKey: ["api", "quiz-bank", workspaceId],
    queryFn: ({ signal }) => api<BankQuestion[]>(bankPath, { signal }),
    retry: false,
  });
  const curriculum = useCurriculum();

  const [lesson, setLesson] = useState("");
  const [passPercent, setPassPercent] = useState(DEFAULT_PASS_PERCENT);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("questions");
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [chapterId, setChapterId] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (draft.data) {
      setLesson(draft.data.lesson ?? "");
      setPassPercent(draft.data.passPercent ?? DEFAULT_PASS_PERCENT);
      setQuestions(draft.data.questions ?? []);
      hydrated.current = true;
    } else if (draft.isError && draft.error instanceof ApiError && draft.error.status === 404) {
      setQuestions([emptyQuestion()]);
      hydrated.current = true;
    }
  }, [draft.data, draft.error, draft.isError]);

  const saveDraft = useMutation({
    mutationFn: () =>
      api<QuizDraft>(draftPath, {
        method: "PUT",
        body: JSON.stringify({ lesson, passPercent, questions }),
      }),
    onSuccess: () => {
      setMessage(t("Quiz draft saved.", "Đã lưu bản nháp Quiz."));
      void cache.invalidateQueries({ queryKey: ["api", "quiz-draft", workspaceId, assignmentId] });
    },
  });
  const publish = useMutation({
    mutationFn: () => api<{ version: number }>(publishPath, { method: "POST" }),
    onSuccess: (result) => {
      setMessage(t(`Quiz version ${result.version} published.`, `Đã công bố Quiz phiên bản ${result.version}.`));
      void cache.invalidateQueries({ queryKey: ["api", "quiz-draft", workspaceId, assignmentId] });
      void cache.invalidateQueries({ queryKey: ["api", "quiz-versions", workspaceId, assignmentId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, assignmentId] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  const importCurriculum = useMutation({
    mutationFn: () =>
      api<QuizDraft>(`${draftPath}/curriculum`, {
        method: "POST",
        body: JSON.stringify({ chapterId }),
      }),
    onSuccess: (result) => {
      setLesson(result.lesson ?? "");
      setPassPercent(result.passPercent ?? DEFAULT_PASS_PERCENT);
      setQuestions(result.questions ?? []);
      setSelected(0);
      setMessage(t("Curriculum chapter loaded into the draft.", "Đã nạp bài giáo trình vào bản nháp."));
    },
  });
  const saveToBank = useMutation({
    mutationFn: (question: QuizQuestion) =>
      api<BankQuestion>(bankPath, {
        method: "POST",
        body: JSON.stringify({ ...question, moduleId: null }),
      }),
    onSuccess: () => {
      setMessage(t("Question saved to the bank.", "Đã lưu câu hỏi vào ngân hàng."));
      void cache.invalidateQueries({ queryKey: ["api", "quiz-bank", workspaceId] });
    },
  });
  const deleteBank = useMutation({
    mutationFn: (id: string) => api<null>(`${bankPath}/${id}`, { method: "DELETE" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["api", "quiz-bank", workspaceId] }),
  });

  const errors = quizErrors({ lesson, passPercent, questions });
  const active = questions[selected];
  const activeErrors = active ? questionErrors(active, selected) : [];

  const update = (index: number, patch: Partial<QuizQuestion>) =>
    setQuestions((current) => current.map((question, position) => (position === index ? { ...question, ...patch } : question)));
  const add = (type: QuizQuestionType) => {
    setQuestions((current) => [...current, emptyQuestion(type)]);
    setSelected(questions.length);
  };
  const remove = (index: number) => {
    setQuestions((current) => current.filter((_, position) => position !== index));
    setSelected((current) => Math.max(0, Math.min(current, questions.length - 2)));
  };
  const duplicate = (index: number) => {
    const copy = { ...questions[index]!, options: [...questions[index]!.options] };
    setQuestions((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setSelected(index + 1);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
    setSelected(target);
  };
  const changeType = (type: QuizQuestionType) => {
    if (!active) return;
    const base = emptyQuestion(type);
    update(selected, {
      ...base,
      prompt: active.prompt,
      explanation: active.explanation ?? "",
      points: active.points ?? 1,
    });
  };
  const setCorrect = (optionIndex: number, checked: boolean) => {
    if (!active) return;
    if (active.type === "MULTI_CHOICE") {
      const current = active.correctOptions ?? [];
      update(selected, {
        correctOptions: checked
          ? [...new Set([...current, optionIndex])].sort((left, right) => left - right)
          : current.filter((value) => value !== optionIndex),
      });
    } else {
      update(selected, { correctOption: optionIndex });
    }
  };
  const parseImport = (format: "json" | "csv") => {
    setImportErrors([]);
    try {
      const parsed = format === "json" ? parseQuizJson(importText) : parseQuizCsv(importText);
      if (parsed.errors.length) {
        setImportErrors(parsed.errors);
        return;
      }
      setLesson(parsed.draft.lesson || lesson);
      setPassPercent(parsed.draft.passPercent || passPercent);
      setQuestions(parsed.draft.questions);
      setSelected(0);
      setTab("questions");
      setMessage(t(`Imported ${parsed.draft.questions.length} questions.`, `Đã nhập ${parsed.draft.questions.length} câu hỏi.`));
    } catch (error) {
      setImportErrors([error instanceof Error ? error.message : String(error)]);
    }
  };
  const publishNow = async () => {
    if (errors.length) return;
    try {
      await saveDraft.mutateAsync();
      await publish.mutateAsync();
    } catch {
      // Mutation errors render below.
    }
  };

  if (draft.isPending) {
    return <p className="text-sm text-muted-foreground">{t("Loading Quiz…", "Đang tải Quiz…")}</p>;
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Library className="size-4 text-primary" aria-hidden="true" />
            {t("Quiz builder", "Trình soạn Quiz")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Write questions by hand or import JSON/CSV, preview the gate, save a draft and publish an immutable version.",
              "Soạn câu hỏi bằng tay hoặc nhập JSON/CSV, xem trước gate, lưu nháp và công bố phiên bản bất biến.",
            )}
          </p>
        </div>
        <Badge variant={versions.data?.length ? "success" : "secondary"}>
          {versions.data?.length
            ? t(`Latest v${versions.data[0]!.version}`, `Mới nhất v${versions.data[0]!.version}`)
            : t("No published version", "Chưa công bố")}
        </Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Lesson text", "Nội dung bài học")}</span>
          <Textarea
            rows={3}
            value={lesson}
            placeholder={t(
              "Short lesson or instructions shown above the Quiz.",
              "Bài học ngắn hoặc hướng dẫn hiển thị phía trên Quiz.",
            )}
            onChange={(event) => setLesson(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Pass percent", "Ngưỡng đạt (%)")}</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={passPercent}
            onChange={(event) => setPassPercent(Number(event.target.value))}
          />
          <span className="block text-[11px] font-normal text-muted-foreground">
            {t("Default 80%. Students must reach this score.", "Mặc định 80%. Sinh viên phải đạt ngưỡng này.")}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {([
          ["questions", t("Questions", "Câu hỏi")],
          ["preview", t("Preview", "Xem trước")],
          ["import", t("Import / Export", "Nhập / Xuất")],
          ["bank", t("Question bank", "Ngân hàng câu hỏi")],
          ["versions", t("Versions", "Phiên bản")],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {(["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"] as const).map((type) => (
                <Button key={type} type="button" size="sm" variant="outline" onClick={() => add(type)}>
                  <Plus className="mr-1 size-3.5" aria-hidden="true" />
                  {t(TYPE_LABELS[type].en, TYPE_LABELS[type].vi)}
                </Button>
              ))}
            </div>
            <ol className="space-y-1">
              {questions.map((question, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    className={`w-full rounded-md border px-2 py-2 text-left text-xs ${
                      selected === index ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="block font-semibold">
                      {index + 1}. {question.prompt || t("Untitled question", "Câu hỏi chưa có tiêu đề")}
                    </span>
                    <span className="block text-muted-foreground">
                      {t(TYPE_LABELS[question.type].en, TYPE_LABELS[question.type].vi)} · {question.points ?? 1} pt
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {active ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">#{selected + 1}</Badge>
                <select
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                  value={active.type}
                  onChange={(event) => changeType(event.target.value as QuizQuestionType)}
                >
                  {(["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(TYPE_LABELS[type].en, TYPE_LABELS[type].vi)}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={selected === 0} onClick={() => move(selected, -1)}>
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={selected >= questions.length - 1} onClick={() => move(selected, 1)}>
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => duplicate(selected)}>
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(selected)}>
                    <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <label className="space-y-1 text-xs font-medium">
                <span>{t("Question prompt", "Nội dung câu hỏi")}</span>
                <Textarea
                  rows={3}
                  value={active.prompt}
                  onChange={(event) => update(selected, { prompt: event.target.value })}
                />
              </label>

              <div className="space-y-2">
                <p className="text-xs font-medium">
                  {t("Options and correct answer", "Đáp án và đáp án đúng")}
                </p>
                {active.options.map((option, optionIndex) => {
                  const correct =
                    active.type === "MULTI_CHOICE"
                      ? (active.correctOptions ?? []).includes(optionIndex)
                      : active.correctOption === optionIndex;
                  return (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <input
                        type={active.type === "MULTI_CHOICE" ? "checkbox" : "radio"}
                        name={`correct-${selected}`}
                        aria-label={t("Correct option", "Đáp án đúng")}
                        checked={correct}
                        onChange={(event) => setCorrect(optionIndex, event.target.checked)}
                      />
                      <Input
                        value={option}
                        aria-label={`${t("Option", "Đáp án")} ${optionIndex + 1}`}
                        onChange={(event) => {
                          const options = [...active.options];
                          options[optionIndex] = event.target.value;
                          update(selected, { options });
                        }}
                      />
                      {active.type !== "TRUE_FALSE" && active.options.length > 2 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            update(selected, {
                              options: active.options.filter((_, position) => position !== optionIndex),
                              ...(active.type === "MULTI_CHOICE"
                                ? {
                                    correctOptions: (active.correctOptions ?? [])
                                      .filter((value) => value !== optionIndex)
                                      .map((value) => (value > optionIndex ? value - 1 : value)),
                                  }
                                : {
                                    correctOption:
                                      active.correctOption === optionIndex
                                        ? 0
                                        : (active.correctOption ?? 0) > optionIndex
                                          ? (active.correctOption ?? 0) - 1
                                          : (active.correctOption ?? 0),
                                  }),
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {active.type !== "TRUE_FALSE" && active.options.length < 8 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => update(selected, { options: [...active.options, ""] })}
                  >
                    <Plus className="mr-1 size-3.5" aria-hidden="true" />
                    {t("Add option", "Thêm đáp án")}
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <label className="space-y-1 text-xs font-medium">
                  <span>{t("Explanation", "Giải thích")}</span>
                  <Textarea
                    rows={2}
                    value={active.explanation ?? ""}
                    onChange={(event) => update(selected, { explanation: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t("Points", "Điểm")}</span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={active.points ?? 1}
                    onChange={(event) => update(selected, { points: Number(event.target.value) })}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={saveToBank.isPending} onClick={() => saveToBank.mutate(active)}>
                  <Library className="mr-1 size-3.5" aria-hidden="true" />
                  {t("Save to bank", "Lưu vào ngân hàng")}
                </Button>
                {activeErrors.length > 0 && (
                  <ul className="text-xs text-destructive" role="alert">
                    {activeErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Add a question to start.", "Thêm câu hỏi để bắt đầu.")}</p>
          )}
        </div>
      )}

      {tab === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Student preview", "Xem trước như sinh viên")}</h3>
            <Badge variant="outline">{passPercent}%</Badge>
          </div>
          {lesson && <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm">{lesson}</p>}
          <ol className="space-y-3">
            {questions.map((question, index) => (
              <li key={index} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{index + 1}. {question.prompt}</p>
                <ul className="space-y-1 text-sm">
                  {question.options.map((option, optionIndex) => {
                    const correct =
                      question.type === "MULTI_CHOICE"
                        ? (question.correctOptions ?? []).includes(optionIndex)
                        : question.correctOption === optionIndex;
                    return (
                      <li key={optionIndex} className={correct ? "font-medium text-emerald-700 dark:text-emerald-300" : ""}>
                        {correct ? "✓ " : "○ "}
                        {option}
                      </li>
                    );
                  })}
                </ul>
                {question.explanation && (
                  <p className="text-xs text-muted-foreground">{t("Explanation", "Giải thích")}: {question.explanation}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">{t("Import questions", "Nhập câu hỏi")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "JSON accepts {lesson, passPercent, questions[]}. CSV columns: type, prompt, options (| separated), correct (| separated indexes), explanation, points.",
                "JSON nhận {lesson, passPercent, questions[]}. CSV gồm: type, prompt, options (phân cách bằng |), correct (chỉ số phân cách bằng |), explanation, points.",
              )}
            </p>
            <Textarea
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'type,prompt,options,correct,explanation,points\nSINGLE_CHOICE,"What is a boundary?","API|Database",0,"A boundary owns one reason to change.",1'}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => parseImport("json")}>
                {t("Parse JSON", "Nhập JSON")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => parseImport("csv")}>
                {t("Parse CSV", "Nhập CSV")}
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm">
                <Upload className="mr-1 size-4" aria-hidden="true" />
                {t("Choose file", "Chọn tệp")}
                <input
                  className="sr-only"
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void file.text().then(setImportText);
                  }}
                />
              </label>
              <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(quizToJson({ lesson, passPercent, questions }))}>
                <Download className="mr-1 size-4" aria-hidden="true" />
                {t("Copy JSON", "Sao chép JSON")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => download("quiz-export.csv", quizToCsv(questions), "text/csv")}>
                <Download className="mr-1 size-4" aria-hidden="true" />
                {t("Export CSV", "Xuất CSV")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => download("quiz-export.json", quizToJson({ lesson, passPercent, questions }), "application/json")}>
                <Download className="mr-1 size-4" aria-hidden="true" />
                {t("Export JSON", "Xuất JSON")}
              </Button>
            </div>
            {importErrors.length > 0 && (
              <ul role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {importErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            )}
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <h3 className="text-sm font-semibold">{t("Load a curriculum chapter", "Nạp bài giáo trình")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Load the chapter questions into this draft, then review and edit them before publishing.",
                "Nạp câu hỏi của bài giáo trình vào bản nháp, sau đó kiểm tra và sửa trước khi công bố.",
              )}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                className="min-w-64 rounded-md border bg-background px-3 py-2 text-sm"
                value={chapterId}
                onChange={(event) => setChapterId(event.target.value)}
                disabled={!curriculum.data}
              >
                <option value="">{t("Select a chapter", "Chọn bài")}</option>
                {curriculum.data?.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>{chapter.track} · {chapter.title}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!chapterId || importCurriculum.isPending}
                onClick={() => importCurriculum.mutate()}
              >
                {importCurriculum.isPending ? t("Loading…", "Đang nạp…") : t("Load into draft", "Nạp vào bản nháp")}
              </Button>
            </div>
            {importCurriculum.error && <p role="alert" className="text-xs text-destructive">{importCurriculum.error.message}</p>}
          </div>
        </div>
      )}

      {tab === "bank" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Library className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Question bank", "Ngân hàng câu hỏi")}</h3>
          </div>
          {bank.isPending && <p className="text-sm text-muted-foreground">{t("Loading bank…", "Đang tải ngân hàng…")}</p>}
          {bank.isError && <p role="alert" className="text-sm text-destructive">{bank.error.message}</p>}
          {!bank.isPending && !bank.isError && !bank.data?.length && (
            <p className="text-sm text-muted-foreground">{t("The bank is empty. Save a question from the editor.", "Ngân hàng trống. Lưu câu hỏi từ trình soạn.")}</p>
          )}
          <ul className="space-y-2">
            {bank.data?.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{entry.question.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.question.type} · {entry.question.options?.length ?? 0} options
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuestions((current) => [...current, entry.question]);
                    setSelected(questions.length);
                    setTab("questions");
                  }}
                >
                  {t("Add to quiz", "Thêm vào Quiz")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => deleteBank.mutate(entry.id)}>
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "versions" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Published versions", "Phiên bản đã công bố")}</h3>
          </div>
          {versions.isPending && <p className="text-sm text-muted-foreground">{t("Loading versions…", "Đang tải phiên bản…")}</p>}
          {!versions.isPending && !versions.data?.length && (
            <p className="text-sm text-muted-foreground">{t("No published Quiz yet.", "Chưa công bố Quiz.")}</p>
          )}
          <ul className="divide-y rounded-lg border">
            {versions.data?.map((version) => (
              <li key={version.version} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Badge variant="outline">v{version.version}</Badge>
                <span className="min-w-0 flex-1 truncate">{version.lesson}</span>
                <span className="text-xs text-muted-foreground">{version.passPercent}% · {new Date(version.publishedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && tab === "questions" && (
        <ul role="alert" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
          {errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {saveDraft.error && <p role="alert" className="text-sm text-destructive">{saveDraft.error.message}</p>}
      {publish.error && <p role="alert" className="text-sm text-destructive">{publish.error.message}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {t(
            "Saving writes a draft. Publishing creates the immutable Quiz version used by the gate.",
            "Lưu sẽ ghi bản nháp. Công bố tạo phiên bản Quiz bất biến dùng cho gate.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saveDraft.isPending || errors.length > 0} onClick={() => saveDraft.mutate()}>
            <Save className="mr-1 size-4" aria-hidden="true" />
            {saveDraft.isPending ? t("Saving…", "Đang lưu…") : t("Save draft", "Lưu nháp")}
          </Button>
          <Button type="button" disabled={publish.isPending || saveDraft.isPending || errors.length > 0} onClick={() => void publishNow()}>
            {publish.isPending ? t("Publishing…", "Đang công bố…") : t("Publish version", "Công bố phiên bản")}
          </Button>
        </div>
      </div>
    </section>
  );
}
