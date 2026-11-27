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
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatLocalizedDateTime } from "@/lib/format/date-time";
import { useLocale } from "@/lib/i18n/locale-context";
import { api, ApiError } from "@/lib/mainflow-api";
import { useCurriculum } from "@/features/courses/curriculum";
import {
  DEFAULT_PASS_PERCENT,
  emptyQuestion,
  parseNotebookLmQuiz,
  parseQuizCsv,
  parseQuizJson,
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

function localizeQuizGenerationError(
  message: string,
  t: (en: string, vi: string) => string,
): string {
  if (/add theory content or attach a reference architecture model/i.test(message)) {
    return t(
      "Add theory content or attach a reference architecture model before generating Quiz questions.",
      "Vui lòng thêm nội dung lý thuyết hoặc gắn sơ đồ kiến trúc tham chiếu trước khi dùng AI tạo câu hỏi Quiz.",
    );
  }
  if (/select at least one source/i.test(message)) {
    return t(
      "Select at least one source (theory chapters or static diagrams).",
      "Vui lòng chọn ít nhất một nguồn học liệu (Lý thuyết các Chương hoặc Sơ đồ tĩnh).",
    );
  }
  if (/not configured|api key|provider/i.test(message)) {
    return t(
      "AI Quiz generation is not configured yet. Configure an AI provider in Administration or import from NotebookLM.",
      "Chưa cấu hình nhà cung cấp AI. Hãy cấu hình AI trong Quản trị hoặc dùng tính năng Nhập từ NotebookLM.",
    );
  }
  return message;
}

export function QuizBuilder({
  workspaceId,
  assignmentId,
  defaultTitle,
  footerAction,
  asset,
  onSaveAsset,
  onCancel,
}: {
  workspaceId: string;
  assignmentId?: string | undefined;
  defaultTitle?: string | undefined;
  footerAction?: React.ReactNode | undefined;
  asset?: { id?: string; title: string; passPercent: number; questions: QuizQuestion[] } | undefined;
  onSaveAsset?: ((draft: QuizDraft) => Promise<unknown>) | undefined;
  onCancel?: (() => void) | undefined;
}) {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const assetMode = Boolean(onSaveAsset);
  const draftPath = `workspaces/${workspaceId}/course-labs/${assignmentId ?? "asset"}/quiz/draft`;
  const publishPath = `workspaces/${workspaceId}/course-labs/${assignmentId ?? "asset"}/quiz/publish`;
  const bankPath = `workspaces/${workspaceId}/quiz-bank/questions`;
  const draft = useQuery({
    queryKey: ["api", "quiz-draft", workspaceId, assignmentId],
    queryFn: ({ signal }) => api<QuizDraft>(draftPath, { signal }),
    enabled: !assetMode && Boolean(assignmentId),
    retry: false,
  });
  const versions = useQuery({
    queryKey: ["api", "quiz-versions", workspaceId, assignmentId],
    queryFn: ({ signal }) => api<Version[]>(`workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/versions`, { signal }),
    enabled: !assetMode && Boolean(assignmentId),
    retry: false,
  });
  const bank = useQuery({
    queryKey: ["api", "quiz-bank", workspaceId],
    queryFn: ({ signal }) => api<BankQuestion[]>(bankPath, { signal }),
    retry: false,
  });
  const curriculum = useCurriculum();

  const [lesson, setLesson] = useState(defaultTitle ?? "");
  const [passPercent, setPassPercent] = useState(DEFAULT_PASS_PERCENT);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("questions");
  const [message, setMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [includeTheory, setIncludeTheory] = useState(true);
  const [includeStaticDiagrams, setIncludeStaticDiagrams] = useState(true);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
  }, [assignmentId, asset?.id]);

  useEffect(() => {
    if (hydrated.current) return;
    if (assetMode && asset) {
      setLesson(asset.title);
      setPassPercent(asset.passPercent ?? DEFAULT_PASS_PERCENT);
      setQuestions(asset.questions?.length ? asset.questions : [emptyQuestion()]);
      hydrated.current = true;
    } else if (draft.data) {
      setLesson(draft.data.lesson || defaultTitle || "");
      setPassPercent(draft.data.passPercent ?? DEFAULT_PASS_PERCENT);
      setQuestions(draft.data.questions ?? []);
      hydrated.current = true;
    } else if (draft.isError && draft.error instanceof ApiError && draft.error.status === 404) {
      setLesson((current) => current || defaultTitle || "");
      setQuestions([emptyQuestion()]);
      hydrated.current = true;
    }
  }, [asset, assetMode, defaultTitle, draft.data, draft.error, draft.isError]);

  const saveDraft = useMutation({
    mutationFn: () => {
      const payload = { lesson: lesson.trim() || defaultTitle?.trim() || "Quiz", passPercent, questions };
      return onSaveAsset
        ? onSaveAsset(payload)
        : api<QuizDraft>(draftPath, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      setShowValidation(false);
      setMessage(t("Quiz draft saved.", "Đã lưu bản nháp Quiz."));
      if (assetMode) onCancel?.();
      else void cache.invalidateQueries({ queryKey: ["api", "quiz-draft", workspaceId, assignmentId] });
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
      setTab("questions");
      setShowValidation(false);
      void cache.invalidateQueries({ queryKey: ["api", "quiz-draft", workspaceId, assignmentId] });
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
  const generateFromTheory = useMutation({
    mutationFn: () =>
      api<{
        providerMode: string;
        sourceTheoryItems: number;
        sourceDiagramElements?: number;
        sourcesUsed?: string[];
        questions: QuizQuestion[];
      }>(
        assetMode
          ? `workspaces/${workspaceId}/quiz-assets/generate`
          : `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            count: aiCount,
            locale,
            includeTheory,
            includeStaticDiagrams,
          }),
        },
      ),
    onSuccess: (result) => {
      const incoming = result.questions ?? [];
      const kept = questions.filter((question) => question.prompt.trim());
      setQuestions([...kept, ...incoming]);
      setSelected(kept.length);
      setTab("questions");
      setShowValidation(false);
      const diagramCount = result.sourceDiagramElements ?? 0;
      setMessage(
        t(
          `Generated ${incoming.length} source-grounded question(s) (${result.sourceTheoryItems} theory item(s), ${diagramCount} C1–C3 architecture element(s)). Review before saving or publishing.`,
          `Đã tạo ${incoming.length} câu hỏi bám sát học liệu (${result.sourceTheoryItems} mục lý thuyết, ${diagramCount} thành phần sơ đồ C1–C3). Hãy rà soát trước khi lưu hoặc công bố.`,
        ),
      );
    },
  });
  const deleteBank = useMutation({
    mutationFn: (id: string) => api<null>(`${bankPath}/${id}`, { method: "DELETE" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["api", "quiz-bank", workspaceId] }),
  });

  const effectiveLesson = lesson.trim() || defaultTitle?.trim() || "Quiz";
  const errors = quizErrors({ lesson: effectiveLesson, passPercent, questions });
  const active = questions[selected];

  const saveDraftNow = () => {
    setShowValidation(true);
    if (errors.length) {
      setMessage("");
      return;
    }
    if (!lesson.trim()) setLesson(effectiveLesson);
    saveDraft.mutate();
  };
  const publishNow = async () => {
    setShowValidation(true);
    if (errors.length) {
      setMessage("");
      return;
    }
    if (!lesson.trim()) setLesson(effectiveLesson);
    try {
      await saveDraft.mutateAsync();
      await publish.mutateAsync();
    } catch {
      // Mutation errors render below.
    }
  };

  const update = (index: number, patch: Partial<QuizQuestion>) => {
    setMessage("");
    setQuestions((current) => current.map((question, position) => (position === index ? { ...question, ...patch } : question)));
  };
  const add = (type: QuizQuestionType) => {
    setMessage("");
    setQuestions((current) => [...current, emptyQuestion(type)]);
    setSelected(questions.length);
  };
  const remove = (index: number) => {
    setMessage("");
    setQuestions((current) => current.filter((_, position) => position !== index));
    setSelected((current) => Math.max(0, Math.min(current, questions.length - 2)));
  };
  const duplicate = (index: number) => {
    setMessage("");
    const copy = { ...questions[index]!, options: [...questions[index]!.options] };
    setQuestions((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setSelected(index + 1);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setMessage("");
    setQuestions((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
    setSelected(target);
  };
  const changeType = (type: QuizQuestionType) => {
    if (!active) return;
    if (type === "TRUE_FALSE") {
      const base = emptyQuestion(type);
      update(selected, {
        ...base,
        prompt: active.prompt,
        explanation: active.explanation ?? "",
        points: active.points ?? 1,
      });
      return;
    }
    const existingOptions = active.options.length >= 2 ? [...active.options] : ["", ""];
    if (type === "MULTI_CHOICE") {
      const firstCorrect =
        active.correctOption != null && active.correctOption < existingOptions.length
          ? active.correctOption
          : 0;
      update(selected, {
        type,
        options: existingOptions,
        correctOptions: active.correctOptions?.length ? active.correctOptions : [firstCorrect],
        correctOption: null,
      });
    } else {
      const firstCorrect =
        active.correctOptions?.[0] ??
        (active.correctOption != null && active.correctOption < existingOptions.length
          ? active.correctOption
          : 0);
      update(selected, {
        type,
        options: existingOptions,
        correctOption: firstCorrect,
        correctOptions: null,
      });
    }
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
  const parseImport = (format: "json" | "csv" | "notebooklm") => {
    setImportErrors([]);
    try {
      const parsed =
        format === "json"
          ? parseQuizJson(importText)
          : format === "csv"
            ? parseQuizCsv(importText)
            : parseNotebookLmQuiz(importText);
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
  if (!assetMode && draft.isPending) {
    return <p className="text-sm text-muted-foreground">{t("Loading Quiz…", "Đang tải Quiz…")}</p>;
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Library className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">{t("Quiz", "Quiz")}</h2>
          <Badge variant={!assetMode && versions.data?.length ? "success" : "secondary"}>
            {!assetMode && versions.data?.length
              ? `v${versions.data[0]!.version}`
              : t("Draft", "Bản nháp")}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-2.5 py-1 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeTheory}
                onChange={(event) => setIncludeTheory(event.target.checked)}
              />
              <span>{t("Theory chapters", "Lý thuyết các Chương")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeStaticDiagrams}
                onChange={(event) => setIncludeStaticDiagrams(event.target.checked)}
              />
              <span>{t("Static C1–C3 & Sample Repo", "Sơ đồ tĩnh C1–C3 & Repo mẫu")}</span>
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("Questions", "Số câu")}</span>
            <Input
              aria-label={t("AI question count", "Số câu AI tạo")}
              className="h-8 w-14 text-center text-xs"
              type="number"
              min={1}
              max={20}
              value={aiCount}
              onChange={(event) => setAiCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={generateFromTheory.isPending || (!includeTheory && !includeStaticDiagrams)}
            onClick={() => generateFromTheory.mutate()}
          >
            <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
            {generateFromTheory.isPending
              ? t("Generating…", "Đang tạo…")
              : t("Generate from materials", "AI tạo từ học liệu")}
          </Button>
        </div>
      </div>

      {generateFromTheory.error && (
        <p role="alert" className="text-xs text-destructive">
          {localizeQuizGenerationError(generateFromTheory.error.message, t)}
        </p>
      )}
      {!assetMode && draft.isError && !(draft.error instanceof ApiError && draft.error.status === 404) && (
        <p role="alert" className="text-xs text-destructive">
          {draft.error.message}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Quiz title", "Tiêu đề Quiz")}</span>
          <Input
            value={lesson}
            onChange={(event) => {
              setLesson(event.target.value);
              setMessage("");
            }}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>{t("Pass (%)", "Đạt (%)")}</span>
          <Input
            className="w-24"
            type="number"
            min={1}
            max={100}
            value={passPercent}
            onChange={(event) =>
              setPassPercent(Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1))))
            }
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {([
          ["questions", t("Questions", "Câu hỏi")],
          ["preview", t("Preview", "Xem trước")],
          ["import", t("Import / Export", "Nhập / Xuất")],
          ["bank", t("Question bank", "Ngân hàng câu hỏi")],
          ...(!assetMode ? [["versions", t("Versions", "Phiên bản")]] : []),
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
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-center"
              onClick={() => add("SINGLE_CHOICE")}
            >
              <Plus className="mr-1 size-3.5" aria-hidden="true" />
              {t("Add question", "Thêm câu hỏi")}
            </Button>
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
                      {t(TYPE_LABELS[question.type].en, TYPE_LABELS[question.type].vi)} · {question.points ?? 1} {t("pt", "điểm")}
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
                  aria-label={t("Question type", "Loại câu hỏi")}
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
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={selected === 0}
                    aria-label={t("Move question up", "Chuyển câu lên")}
                    title={t("Move up", "Chuyển lên")}
                    onClick={() => move(selected, -1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={selected >= questions.length - 1}
                    aria-label={t("Move question down", "Chuyển câu xuống")}
                    title={t("Move down", "Chuyển xuống")}
                    onClick={() => move(selected, 1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("Duplicate question", "Nhân bản câu hỏi")}
                    title={t("Duplicate", "Nhân bản")}
                    onClick={() => duplicate(selected)}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={questions.length <= 1}
                    aria-label={t("Delete question", "Xóa câu hỏi")}
                    title={t("Delete", "Xóa")}
                    onClick={() => remove(selected)}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <label className="space-y-1 text-xs font-medium">
                <span>{t("Question prompt", "Nội dung câu hỏi")}</span>
                <Textarea
                  rows={2}
                  placeholder={t("Enter question prompt…", "Nhập nội dung câu hỏi…")}
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
                        placeholder={`${t("Option", "Đáp án")} ${optionIndex + 1}`}
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
                          aria-label={`${t("Remove option", "Xóa đáp án")} ${optionIndex + 1}`}
                          title={t("Remove option", "Xóa đáp án")}
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

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                <label className="space-y-1 text-xs font-medium">
                  <span>{t("Explanation (optional)", "Giải thích (tùy chọn)")}</span>
                  <Input
                    placeholder={t("Why this answer is correct…", "Giải thích ngắn cho đáp án…")}
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
                    onChange={(event) =>
                      update(selected, {
                        points: Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1))),
                      })
                    }
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={saveToBank.isPending} onClick={() => saveToBank.mutate(active)}>
                  <Library className="mr-1 size-3.5" aria-hidden="true" />
                  {t("Save to bank", "Lưu vào ngân hàng")}
                </Button>
                {saveToBank.error && (
                  <span role="alert" className="text-xs text-destructive">
                    {saveToBank.error.message}
                  </span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">{t("Student preview", "Xem trước như sinh viên")}</h3>
              <Badge variant="outline">{passPercent}%</Badge>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showAnswerKey}
                onChange={(event) => setShowAnswerKey(event.target.checked)}
              />
              {t("Show answer key", "Hiện đáp án đúng")}
            </label>
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
                    const reveal = showAnswerKey && correct;
                    return (
                      <li key={optionIndex} className={reveal ? "font-medium text-emerald-700 dark:text-emerald-300" : ""}>
                        {reveal ? "✓ " : "○ "}
                        {option}
                      </li>
                    );
                  })}
                </ul>
                {showAnswerKey && question.explanation && (
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
                "Paste JSON ({lesson, passPercent, questions[]}), CSV, or quiz Markdown/JSON exported from NotebookLM.",
                "Dán JSON ({lesson, passPercent, questions[]}), CSV, hoặc bộ câu hỏi Markdown/JSON xuất từ NotebookLM.",
              )}
            </p>
            <Textarea
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'type,prompt,options,correct,explanation,points\nSINGLE_CHOICE,"What is a boundary?","API|Database",0,"A boundary owns one reason to change.",1'}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => parseImport("notebooklm")}>
                {t("Import from NotebookLM (Markdown / JSON)", "Nhập từ NotebookLM (Markdown / JSON)")}
              </Button>
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
                  accept=".json,.csv,.md,.txt,application/json,text/csv,text/markdown,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void file.text().then(setImportText);
                  }}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={questions.length === 0}
                onClick={() => {
                  void navigator.clipboard?.writeText(quizToJson({ lesson, passPercent, questions }));
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
              >
                <Download className="mr-1 size-4" aria-hidden="true" />
                {copiedJson ? t("Copied!", "Đã chép!") : t("Copy JSON", "Sao chép JSON")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={questions.length === 0}
                onClick={() => download("quiz-export.csv", quizToCsv(questions), "text/csv")}
              >
                <Download className="mr-1 size-4" aria-hidden="true" />
                {t("Export CSV", "Xuất CSV")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={questions.length === 0}
                onClick={() => download("quiz-export.json", quizToJson({ lesson, passPercent, questions }), "application/json")}
              >
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
          {!assetMode && <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <h3 className="text-sm font-semibold">{t("Load a curriculum chapter", "Nạp bài giáo trình")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Load the chapter questions into this draft, then review and edit them before publishing.",
                "Nạp câu hỏi của bài giáo trình vào bản nháp, sau đó kiểm tra và sửa trước khi công bố.",
              )}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                aria-label={t("Curriculum chapter", "Bài giáo trình")}
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
          </div>}
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
          {deleteBank.error && <p role="alert" className="text-sm text-destructive">{deleteBank.error.message}</p>}
          {!bank.isPending && !bank.isError && !bank.data?.length && (
            <p className="text-sm text-muted-foreground">{t("The bank is empty. Save a question from the editor.", "Ngân hàng trống. Lưu câu hỏi từ trình soạn.")}</p>
          )}
          <ul className="space-y-2">
            {bank.data?.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{entry.question.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.question.type} · {entry.question.options?.length ?? 0} {t("options", "đáp án")}
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("Delete from bank", "Xóa khỏi ngân hàng")}
                  title={t("Delete from bank", "Xóa khỏi ngân hàng")}
                  onClick={() => deleteBank.mutate(entry.id)}
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!assetMode && tab === "versions" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Published versions", "Phiên bản đã công bố")}</h3>
          </div>
          {versions.isPending && <p className="text-sm text-muted-foreground">{t("Loading versions…", "Đang tải phiên bản…")}</p>}
          {versions.isError && <p role="alert" className="text-sm text-destructive">{versions.error.message}</p>}
          {!versions.isPending && !versions.isError && !versions.data?.length && (
            <p className="text-sm text-muted-foreground">{t("No published Quiz yet.", "Chưa công bố Quiz.")}</p>
          )}
          <ul className="divide-y rounded-lg border">
            {versions.data?.map((version) => (
              <li key={version.version} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Badge variant="outline">v{version.version}</Badge>
                <span className="min-w-0 flex-1 truncate">{version.lesson}</span>
                <span className="text-xs text-muted-foreground">{version.passPercent}% · {formatLocalizedDateTime(version.publishedAt, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showValidation && errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
          {errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {saveDraft.error && <p role="alert" className="text-sm text-destructive">{saveDraft.error.message}</p>}
      {!assetMode && publish.error && <p role="alert" className="text-sm text-destructive">{publish.error.message}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {assetMode && onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t("Cancel", "Hủy")}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={saveDraft.isPending} onClick={saveDraftNow}>
          <Save className="mr-1 size-4" aria-hidden="true" />
          {saveDraft.isPending
            ? t("Saving…", "Đang lưu…")
            : assetMode
              ? t("Save quiz", "Lưu Quiz")
              : t("Save draft", "Lưu nháp")}
        </Button>
        {!assetMode && (
          <Button type="button" size="sm" disabled={publish.isPending || saveDraft.isPending} onClick={() => void publishNow()}>
            {publish.isPending ? t("Publishing…", "Đang công bố…") : t("Publish version", "Công bố phiên bản")}
          </Button>
        )}
        {footerAction}
      </div>
    </section>
  );
}
