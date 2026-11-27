"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  GitFork,
  HelpCircle,
  Lock,
  Pencil,
  Play,
  Plus,
  Save,
  Send,
  Search,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { api } from "@/lib/mainflow-api";
import { useCourseAuthoring } from "@/features/workspaces/course-access";
import { labTierMeta, resolveLabTier } from "@/features/assignments/requirements";

const itemTypes = ["THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const;
type ItemType = (typeof itemTypes)[number];

const TYPE_META: Record<
  ItemType,
  { en: string; vi: string; shortEn: string; shortVi: string; icon: LucideIcon; tone: string }
> = {
  THEORY: {
    en: "Theory",
    vi: "Bài đọc Lý thuyết",
    shortEn: "Theory",
    shortVi: "Lý thuyết",
    icon: BookOpen,
    tone: "text-teal-700 bg-teal-500/10 border-teal-500/25 dark:text-teal-300",
  },
  QUIZ: {
    en: "Quiz",
    vi: "Bài trắc nghiệm (Quiz)",
    shortEn: "Quiz",
    shortVi: "Trắc nghiệm",
    icon: HelpCircle,
    tone: "text-indigo-700 bg-indigo-500/10 border-indigo-500/25 dark:text-indigo-300",
  },
  ESSAY: {
    en: "Essay",
    vi: "Tự luận",
    shortEn: "Essay",
    shortVi: "Tự luận",
    icon: FileText,
    tone: "text-amber-700 bg-amber-500/10 border-amber-500/25 dark:text-amber-300",
  },
  STATIC_LAB: {
    en: "Theory Only Lab",
    vi: "Lab chỉ Lý thuyết",
    shortEn: "Theory Only",
    shortVi: "Chỉ Lý thuyết",
    icon: Code2,
    tone: "text-teal-700 bg-teal-500/10 border-teal-500/25 dark:text-teal-300",
  },
  IMPACT_LAB: {
    en: "Theory + Quiz Lab",
    vi: "Lab Lý thuyết + Quiz",
    shortEn: "Theory + Quiz",
    shortVi: "Lý thuyết + Quiz",
    icon: GitFork,
    tone: "text-indigo-700 bg-indigo-500/10 border-indigo-500/25 dark:text-indigo-300",
  },
  RUNTIME_LAB: {
    en: "Theory + Quiz + Studio Lab",
    vi: "Lab Lý thuyết + Quiz + Studio",
    shortEn: "Full Studio",
    shortVi: "Có cả Studio",
    icon: Play,
    tone: "text-emerald-700 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-300",
  },
};

type Item = {
  id: string;
  type: ItemType;
  title: string;
  description: string | null;
  position: number;
  assignmentId: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  prerequisiteModuleId: string | null;
  items: Item[];
};

type AssignmentRow = {
  id: string;
  title: string;
  instructions?: string;
  labMode?: string | null;
  requireRuntimeTrace?: boolean;
  aiPolicy?: unknown;
};

type TheoryAssetRow = {
  id: string;
  title: string;
  body: string;
  source: string;
  version: number;
};

type QuizAssetRow = {
  id: string;
  title: string;
  description: string | null;
  passPercent: number;
  questions: InlineQuizQuestion[];
};

type ReferenceVersionRow = {
  id: string;
  snapshot: {
    id: string;
    name: string;
    branchName?: string | null;
    commitSha?: string | null;
  };
  model: {
    id: string;
    label: string;
    revision: number;
    elements: Array<{ id: string; name: string; description: string }>;
    edges: Array<{ id: string; from: string; to: string; protocol: string }>;
  };
};

type InlineQuizQuestion = {
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
  points: number;
};

type ItemDraft = {
  type: ItemType;
  title: string;
  description: string;
  body: string;
  prompt: string;
  rubric: string;
  quizQuestions: InlineQuizQuestion[];
  passPercent: number;
  assignmentId: string;
  estimatedMinutes: string;
  required: boolean;
  lessonKind: "THEORY" | "ARCHITECTURE";
  theoryAssetId: string;
  referenceVersionId: string;
  referenceModelId: string;
  quizAssetId: string;
  dueAt: string;
};

const emptyDraft = (): ItemDraft => ({
  type: "THEORY",
  title: "",
  description: "",
  body: "",
  prompt: "",
  rubric: "",
  quizQuestions: [],
  passPercent: 70,
  assignmentId: "",
  estimatedMinutes: "",
  required: true,
  lessonKind: "THEORY",
  theoryAssetId: "",
  referenceVersionId: "",
  referenceModelId: "",
  quizAssetId: "",
  dueAt: "",
});

function parseRubric(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [criterion, score] = line.split("|").map((part) => part.trim());
      const parsed = score === undefined || score === "" ? 10 : Number(score);
      return {
        criterion: criterion || "Criterion",
        maxScore: Number.isFinite(parsed) ? parsed : 10,
      };
    });
}

function rubricText(rubric: unknown) {
  if (!Array.isArray(rubric)) return "";
  return rubric
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      return `${String(record["criterion"] ?? "")}|${String(record["maxScore"] ?? 10)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function contentFromDraft(draft: ItemDraft): Record<string, unknown> {
  const mins = Number.parseInt(draft.estimatedMinutes, 10);
  const meta = Number.isFinite(mins) && mins > 0 && mins <= 600 ? { estimatedMinutes: mins } : {};
  if (draft.type === "THEORY")
    return {
      ...meta,
      body: draft.body.trim(),
      theoryAssetId: draft.theoryAssetId,
      lessonKind: draft.lessonKind,
      ...(draft.lessonKind === "ARCHITECTURE"
        ? {
            referenceVersionId: draft.referenceVersionId,
            referenceModelId: draft.referenceModelId,
          }
        : {}),
    };
  if (draft.type === "ESSAY")
    return { ...meta, prompt: draft.prompt.trim(), rubric: parseRubric(draft.rubric) };
  if (draft.type === "QUIZ")
    return {
      ...meta,
      quizAssetId: draft.quizAssetId,
      passPercent: draft.passPercent,
      questions: draft.quizQuestions,
    };
  const parsedDue = draft.dueAt ? new Date(draft.dueAt) : null;
  return {
    ...meta,
    dueAt:
      parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue.toISOString() : null,
  };
}

function toDateTimeLocalValue(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function draftFromItem(item: Item): ItemDraft {
  const content = item.content ?? {};
  return {
    type: item.type,
    title: item.title,
    description: item.description ?? "",
    body: typeof content["body"] === "string" ? content["body"] : "",
    prompt: typeof content["prompt"] === "string" ? content["prompt"] : "",
    rubric: rubricText(content["rubric"]),
    quizQuestions: Array.isArray(content["questions"])
      ? (content["questions"] as InlineQuizQuestion[])
      : [],
    passPercent:
      typeof content["passPercent"] === "number" ? Number(content["passPercent"]) : 70,
    assignmentId: item.assignmentId ?? "",
    estimatedMinutes:
      typeof content["estimatedMinutes"] === "number" && content["estimatedMinutes"] > 0
        ? String(content["estimatedMinutes"])
        : "",
    required: item.required,
    lessonKind: content["lessonKind"] === "ARCHITECTURE" ? "ARCHITECTURE" : "THEORY",
    theoryAssetId: typeof content["theoryAssetId"] === "string" ? content["theoryAssetId"] : "",
    referenceVersionId:
      typeof content["referenceVersionId"] === "string" ? content["referenceVersionId"] : "",
    referenceModelId:
      typeof content["referenceModelId"] === "string" ? content["referenceModelId"] : "",
    quizAssetId: typeof content["quizAssetId"] === "string" ? content["quizAssetId"] : "",
    dueAt: toDateTimeLocalValue(content["dueAt"]),
  };
}

function draftValid(draft: ItemDraft) {
  if (!draft.title.trim()) return false;
  if (
    draft.type === "THEORY" &&
    (!draft.body.trim() ||
      (draft.lessonKind === "THEORY" ? !draft.theoryAssetId : !draft.referenceModelId))
  ) {
    return false;
  }
  if (draft.type === "ESSAY" && !draft.prompt.trim()) return false;
  if (
    draft.type === "QUIZ" &&
    (!draft.quizAssetId ||
      draft.quizQuestions.length < 1 ||
      draft.quizQuestions.some((question) => {
        const multi = (question as { correctOptions?: unknown }).correctOptions;
        const validMulti =
          Array.isArray(multi) &&
          multi.length > 0 &&
          multi.every(
            (idx) => typeof idx === "number" && idx >= 0 && idx < question.options.length,
          );
        const validSingle =
          question.correctOption >= 0 && question.correctOption < question.options.length;
        return (
          !question.prompt.trim() ||
          question.options.filter((option) => option.trim()).length < 2 ||
          (!validSingle && !validMulti)
        );
      }))
  ) {
    return false;
  }
  if (
    ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(draft.type) &&
    !draft.assignmentId
  ) {
    return false;
  }
  return true;
}

function itemTypeForAssignment(assignment: {
  labMode?: string | null | undefined;
  requireRuntimeTrace?: boolean | null | undefined;
  aiPolicy?: unknown;
}): ItemType {
  const tier = resolveLabTier(assignment);
  if (tier === "THEORY_QUIZ_STUDIO") return "RUNTIME_LAB";
  if (tier === "THEORY_ONLY") return "STATIC_LAB";
  return "IMPACT_LAB";
}

function itemEstimatedMinutes(item: Item): number | null {
  const raw = item.content?.["estimatedMinutes"];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function collectPublishIssues(
  modules: Module[],
  assignments: AssignmentRow[],
  t: (en: string, vi: string) => string,
): string[] {
  if (modules.length === 0) {
    return [t("Add at least one Module before publishing.", "Hãy thêm ít nhất một học phần trước khi công bố.")];
  }
  const issues: string[] = [];
  for (const module of modules) {
    const moduleLabel = `${t("Module", "Học phần")} ${module.position} · ${module.title}`;
    if (module.items.length === 0) {
      issues.push(
        t(
          `${moduleLabel} has no learning content. Add a Lesson, Quiz, or Practice, or remove this Module.`,
          `${moduleLabel} chưa có nội dung học. Hãy thêm Lesson, Quiz hoặc Practice, hoặc xóa học phần này.`,
        ),
      );
      continue;
    }
    for (const item of module.items) {
      const itemLabel = `${moduleLabel} › ${item.title}`;
      if (
        item.type === "THEORY" &&
        (typeof item.content?.["body"] !== "string" || !item.content["body"].trim())
      ) {
        issues.push(t(`${itemLabel} is missing Theory content.`, `${itemLabel} chưa có nội dung Theory.`));
      }
      if (item.type === "QUIZ" && !item.assignmentId) {
        const questions = item.content?.["questions"];
        if (!Array.isArray(questions) || questions.length === 0) {
          issues.push(t(`${itemLabel} has no Quiz questions.`, `${itemLabel} chưa có câu hỏi Quiz.`));
        }
      }
      if (["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type)) {
        const linked = item.assignmentId
          ? assignments.find((assignment) => assignment.id === item.assignmentId)
          : undefined;
        if (!linked) {
          issues.push(
            t(
              `${itemLabel} is not linked to an available Lab in this class.`,
              `${itemLabel} chưa liên kết với Lab khả dụng trong lớp này.`,
            ),
          );
        } else if (item.type === "RUNTIME_LAB" && !linked.requireRuntimeTrace) {
          issues.push(
            t(
              `${itemLabel} requires a Lab with Runtime/Studio configured.`,
              `${itemLabel} cần một Lab đã cấu hình Runtime/Studio.`,
            ),
          );
        }
      }
    }
  }
  return issues;
}

function ItemFields({
  draft,
  onChange,
  assignments,
  t,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  assignments: AssignmentRow[];
  t: (en: string, vi: string) => string;
}) {
  const isStandaloneContent = ["THEORY", "QUIZ", "ESSAY"].includes(draft.type);
  const labs =
    draft.type === "RUNTIME_LAB"
      ? assignments.filter((assignment) => assignment.requireRuntimeTrace)
      : assignments;
  const needsAssignment = !isStandaloneContent;
  return (
    <div className="space-y-3.5">
      {needsAssignment && (
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Select created Lab", "Chọn bài Lab đã tạo (từ tab Tạo Lab)")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.assignmentId}
            onChange={(event) => {
              const nextId = event.target.value;
              const picked = assignments.find((a) => a.id === nextId);
              if (picked) {
                onChange({
                  assignmentId: nextId,
                  type: itemTypeForAssignment(picked),
                  title: draft.title.trim() ? draft.title : picked.title,
                  description: draft.description.trim()
                    ? draft.description
                    : (picked.instructions
                        ?.split("\n")[0]
                        ?.replace(/^#+\s*/, "")
                        .slice(0, 160) ?? ""),
                });
              } else {
                onChange({ assignmentId: "" });
              }
            }}
          >
            <option value="">
              {t("Choose a Lab in this class…", "Chọn bài Lab trong lớp này…")}
            </option>
            {(labs.length > 0 ? labs : assignments).map((assignment) => {
              const tier = resolveLabTier(assignment);
              const meta = labTierMeta(tier);
              return (
                <option key={assignment.id} value={assignment.id}>
                  [{t(meta.shortEn, meta.shortVi)}] {assignment.title}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Learning item type", "Loại nội dung học")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.type}
            onChange={(event) => {
              const nextType = event.target.value as ItemType;
              onChange({
                type: nextType,
                ...(isStandaloneContent || ["THEORY", "QUIZ", "ESSAY"].includes(nextType)
                  ? { assignmentId: "" }
                  : {}),
              });
            }}
          >
            {(["THEORY", "QUIZ", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const).map((type) => (
              <option key={type} value={type}>
                {t(TYPE_META[type].en, TYPE_META[type].vi)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Display title in chapter", "Tên hiển thị trong chương")}</span>
          <Input
            required
            maxLength={255}
            value={draft.title}
            placeholder={t("Auto-filled when you pick a Lab", "Tự động điền khi chọn bài Lab")}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Short description", "Mô tả ngắn")}</span>
          <Input
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Estimated duration (min)", "Thời gian dự kiến (phút)")}</span>
          <Input
            type="number"
            min={5}
            max={600}
            step={5}
            placeholder="45"
            value={draft.estimatedMinutes}
            onChange={(event) => onChange({ estimatedMinutes: event.target.value })}
          />
        </label>
      </div>
      {needsAssignment && (
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Due date (optional)", "Hạn nộp (tùy chọn)")}</span>
          <Input
            type="datetime-local"
            value={draft.dueAt}
            onChange={(event) => onChange({ dueAt: event.target.value })}
          />
        </label>
      )}
      {draft.type === "THEORY" && (
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Theory content", "Nội dung lý thuyết")}</span>
          <Textarea
            rows={9}
            value={draft.body}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        </label>
      )}
      {draft.type === "QUIZ" && (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Quiz questions", "Câu hỏi Quiz")}
            </p>
            <label className="flex items-center gap-2 text-xs font-medium">
              {t("Pass", "Điểm đạt")}
              <Input
                className="h-8 w-20"
                type="number"
                min={1}
                max={100}
                value={draft.passPercent}
                onChange={(event) => onChange({ passPercent: Number(event.target.value) })}
              />
              %
            </label>
          </div>
          {draft.quizQuestions.map((question, questionIndex) => (
            <div key={questionIndex} className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t(`Question ${questionIndex + 1}`, `Câu ${questionIndex + 1}`)}
                  placeholder={t("Question prompt", "Nội dung câu hỏi")}
                  value={question.prompt}
                  onChange={(event) =>
                    onChange({
                      quizQuestions: draft.quizQuestions.map((entry, index) =>
                        index === questionIndex ? { ...entry, prompt: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("Remove question", "Xóa câu hỏi")}
                  onClick={() =>
                    onChange({
                      quizQuestions: draft.quizQuestions.filter((_, index) => index !== questionIndex),
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                rows={3}
                aria-label={t("Answer options", "Các phương án")}
                placeholder={t("One answer option per line", "Mỗi dòng là một phương án")}
                value={question.options.join("\n")}
                onChange={(event) =>
                  onChange({
                    quizQuestions: draft.quizQuestions.map((entry, index) =>
                      index === questionIndex
                        ? { ...entry, options: event.target.value.split("\n") }
                        : entry,
                    ),
                  })
                }
              />
              <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <label className="space-y-1 text-xs font-medium">
                  <span>{t("Correct option", "Đáp án đúng")}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={question.correctOption}
                    onChange={(event) =>
                      onChange({
                        quizQuestions: draft.quizQuestions.map((entry, index) =>
                          index === questionIndex
                            ? { ...entry, correctOption: Number(event.target.value) }
                            : entry,
                        ),
                      })
                    }
                  >
                    {question.options.map((option, optionIndex) => (
                      <option key={optionIndex} value={optionIndex}>
                        {optionIndex + 1}. {option || t("Option", "Phương án")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t("Explanation", "Giải thích")}</span>
                  <Input
                    value={question.explanation}
                    onChange={(event) =>
                      onChange({
                        quizQuestions: draft.quizQuestions.map((entry, index) =>
                          index === questionIndex
                            ? { ...entry, explanation: event.target.value }
                            : entry,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                quizQuestions: [
                  ...draft.quizQuestions,
                  { prompt: "", options: ["", ""], correctOption: 0, explanation: "", points: 1 },
                ],
              })
            }
          >
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            {t("Add question", "Thêm câu hỏi")}
          </Button>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        {t("Required learning item", "Nội dung học bắt buộc")}
      </label>
    </div>
  );
}

function AddContentDialog({
  open,
  onOpenChange,
  module,
  draft,
  onChange,
  theoryAssets,
  quizAssets,
  referenceVersions,
  assignments,
  loading,
  loadError,
  submitError,
  saving,
  onSubmit,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: Module | null;
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  theoryAssets: TheoryAssetRow[];
  quizAssets: QuizAssetRow[];
  referenceVersions: ReferenceVersionRow[];
  assignments: AssignmentRow[];
  loading: boolean;
  loadError: string | null;
  submitError: string | null;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  t: (en: string, vi: string) => string;
}) {
  const contentKind = draft.type === "THEORY" ? "LESSON" : draft.type === "QUIZ" ? "QUIZ" : "PRACTICE";
  const studioLabs = assignments.filter((assignment) => assignment.requireRuntimeTrace);
  const selectedTheory = theoryAssets.find((asset) => asset.id === draft.theoryAssetId);
  const selectedReference = referenceVersions.find(
    (version) => version.id === draft.referenceVersionId,
  );
  const selectedQuiz = quizAssets.find((asset) => asset.id === draft.quizAssetId);
  const selectedLab = studioLabs.find((assignment) => assignment.id === draft.assignmentId);
  const submitLabel =
    contentKind === "LESSON"
      ? t("Add Lesson to milestone", "Thêm Lesson vào mốc")
      : contentKind === "QUIZ"
        ? t("Add Quiz to milestone", "Thêm Quiz vào mốc")
        : t("Add Practice to milestone", "Thêm Practice vào mốc");

  const selectKind = (kind: "LESSON" | "QUIZ" | "PRACTICE") => {
    if (kind === "LESSON") {
      onChange({ ...emptyDraft(), type: "THEORY" });
    } else if (kind === "QUIZ") {
      onChange({ ...emptyDraft(), type: "QUIZ" });
    } else {
      onChange({ ...emptyDraft(), type: "RUNTIME_LAB" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit}>
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>{t("Add content to this milestone", "Thêm nội dung vào mốc")}</DialogTitle>
            <DialogDescription>
              {module
                ? `${t("Module", "Chương")} ${module.position} · ${module.title}`
                : t("Select content for this Module.", "Chọn nội dung cho Chương này.")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70svh] space-y-5 overflow-y-auto px-6 py-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{t("Content type", "Loại nội dung")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["LESSON", BookOpen, t("Lesson", "Lesson")],
                  ["QUIZ", HelpCircle, t("Quiz", "Quiz")],
                  ["PRACTICE", Play, t("Practice · Studio Lab", "Practice · Studio Lab")],
                ] as const).map(([kind, Icon, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => selectKind(kind)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      contentKind === kind
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {loading && (
              <div role="status" className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                {t("Loading available content…", "Đang tải nội dung có sẵn…")}
              </div>
            )}
            {loadError && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {loadError}
              </div>
            )}

            {contentKind === "LESSON" && (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["THEORY", t("Theory", "Theory")],
                    ["ARCHITECTURE", t("C1–C3 Architecture Theory", "Lý thuyết sơ đồ C1–C3")],
                  ] as const).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() =>
                        onChange({
                          lessonKind: kind,
                          theoryAssetId: "",
                          referenceVersionId: "",
                          referenceModelId: "",
                          title: "",
                          body: "",
                          description: "",
                        })
                      }
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        draft.lessonKind === kind ? "border-primary bg-primary/10 text-primary" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>
                    {draft.lessonKind === "ARCHITECTURE"
                      ? t("Select analyzed Repository version", "Chọn phiên bản Repository đã phân tích")
                      : t("Select Lesson", "Chọn Lesson")}
                  </span>
                  {draft.lessonKind === "ARCHITECTURE" ? (
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2.5"
                      value={draft.referenceVersionId}
                      onChange={(event) => {
                        const version = referenceVersions.find((entry) => entry.id === event.target.value);
                        const model = version?.model;
                        const body = model
                          ? [
                              `# ${model.label}`,
                              "",
                              `## C1–C3 Architecture Model`,
                              `${model.elements.length} elements · ${model.edges.length} dependencies · Revision ${model.revision}`,
                              "",
                              "## Components",
                              ...model.elements.slice(0, 50).map((element) => `- **${element.name}** — ${element.description || "Architecture element"}`),
                              "",
                              "## Dependency Graph",
                              ...model.edges.slice(0, 80).map((edge) => `- ${edge.from} → ${edge.to}${edge.protocol ? ` (${edge.protocol})` : ""}`),
                            ].join("\n")
                          : "";
                        onChange({
                          referenceVersionId: event.target.value,
                          referenceModelId: model?.id ?? "",
                          theoryAssetId: "",
                          title: model?.label ?? "",
                          body,
                          description: model
                            ? t(
                                `C1–C3 architecture and dependency graph · revision ${model.revision}`,
                                `Kiến trúc C1–C3 và dependency graph · phiên bản ${model.revision}`,
                              )
                            : "",
                        });
                      }}
                    >
                      <option value="">{t("Choose an analyzed version…", "Chọn phiên bản đã phân tích…")}</option>
                      {referenceVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.model.label} · r{version.model.revision} · {version.snapshot.branchName || version.snapshot.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2.5"
                      value={draft.theoryAssetId}
                      onChange={(event) => {
                        const asset = theoryAssets.find((entry) => entry.id === event.target.value);
                        onChange({
                          theoryAssetId: event.target.value,
                          referenceVersionId: "",
                          referenceModelId: "",
                          title: asset?.title ?? "",
                          body: asset?.body ?? "",
                          description: asset ? asset.body.replace(/[#*_`>\n]/g, " ").trim().slice(0, 160) : "",
                        });
                      }}
                    >
                      <option value="">{t("Choose a Lesson…", "Chọn một Lesson…")}</option>
                      {theoryAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.title} · v{asset.version}</option>
                      ))}
                    </select>
                  )}
                </label>
                {draft.lessonKind === "ARCHITECTURE" && !loading && referenceVersions.length === 0 && (
                  <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    {t(
                      "No generated C1–C3 theory is available. Analyze a Repository first.",
                      "Chưa có lý thuyết C1–C3 được sinh. Hãy phân tích Repository trước.",
                    )}
                  </p>
                )}
                {(selectedTheory || selectedReference) && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border bg-muted/20 p-4">
                    <MarkdownPreview markdown={draft.body} />
                  </div>
                )}
              </div>
            )}

            {contentKind === "QUIZ" && (
              <div className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>{t("Select Quiz", "Chọn Quiz")}</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2.5"
                    value={draft.quizAssetId}
                    onChange={(event) => {
                      const asset = quizAssets.find((entry) => entry.id === event.target.value);
                      onChange({
                        quizAssetId: event.target.value,
                        title: asset?.title ?? "",
                        description: asset?.description ?? "",
                        passPercent: asset?.passPercent ?? 70,
                        quizQuestions: asset?.questions ?? [],
                      });
                    }}
                  >
                    <option value="">{t("Choose a Quiz…", "Chọn một Quiz…")}</option>
                    {quizAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.title}</option>
                    ))}
                  </select>
                </label>
                {selectedQuiz && (
                  <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                    <p className="text-sm"><strong>{t("Questions", "Số câu hỏi")}:</strong> {selectedQuiz.questions.length}</p>
                    <p className="text-sm"><strong>{t("Pass percentage", "Điểm đạt")}:</strong> {selectedQuiz.passPercent}%</p>
                  </div>
                )}
              </div>
            )}

            {contentKind === "PRACTICE" && (
              <div className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>{t("Select Studio Lab", "Chọn Studio Lab")}</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2.5"
                    value={draft.assignmentId}
                    onChange={(event) => {
                      const lab = studioLabs.find((entry) => entry.id === event.target.value);
                      onChange({
                        assignmentId: event.target.value,
                        title: lab?.title ?? "",
                        description: lab?.instructions?.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 160) ?? "",
                      });
                    }}
                  >
                    <option value="">{t("Choose a Runtime/Studio Lab…", "Chọn Lab có Runtime/Studio…")}</option>
                    {studioLabs.map((lab) => <option key={lab.id} value={lab.id}>{lab.title}</option>)}
                  </select>
                </label>
                {!loading && studioLabs.length === 0 && (
                  <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    {t("No Runtime/Studio Lab is ready. Configure Studio Live first.", "Chưa có Lab Runtime/Studio. Hãy cấu hình Studio Live trước.")}
                  </p>
                )}
                {selectedLab && (
                  <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {t(
                      "The student mission and completion criteria are managed in MAVIS Studio.",
                      "Nhiệm vụ sinh viên và tiêu chí hoàn thành được quản lý trong MAVIS Studio.",
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block space-y-1 text-sm font-medium">
                <span>{t("Display title", "Tên hiển thị")}</span>
                <Input required maxLength={255} value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span>{t("Estimated duration (min)", "Thời gian dự kiến (phút)")}</span>
                <Input type="number" min={5} max={600} step={5} placeholder="45" value={draft.estimatedMinutes} onChange={(event) => onChange({ estimatedMinutes: event.target.value })} />
              </label>
            </div>
            {contentKind === "PRACTICE" && (
              <label className="block space-y-1 text-sm font-medium">
                <span>{t("Due date (optional)", "Hạn nộp (tùy chọn)")}</span>
                <Input
                  type="datetime-local"
                  value={draft.dueAt}
                  onChange={(event) => onChange({ dueAt: event.target.value })}
                />
              </label>
            )}
            <label className="block space-y-1 text-sm font-medium">
              <span>{t("Short description", "Mô tả ngắn")}</span>
              <Input value={draft.description} onChange={(event) => onChange({ description: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-primary" checked={draft.required} onChange={(event) => onChange({ required: event.target.checked })} />
              {t("Required learning item", "Nội dung học bắt buộc")}
            </label>

            {submitError && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>{t("Cancel", "Hủy")}</Button>
            <Button disabled={saving || loading}>{saving ? t("Adding…", "Đang thêm…") : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CourseBuilder({
  workspaceId,
  workspaceName,
  canCreateModules = true,
}: {
  workspaceId: string;
  workspaceName?: string;
  canCreateModules?: boolean;
}) {
  const { t } = useLocale();
  const params = useSearchParams();
  const intent = params?.get("intent") ?? null;
  const isPublishStep = params?.get("flowStep") === "publish";
  const course = useCourseAuthoring(workspaceId);
  const activateCourse = useApiMutation("updateWorkspace");
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showCourseInfo, setShowCourseInfo] = useState(false);

  const [outlineQuery, setOutlineQuery] = useState("");
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});

  const [showAddModule, setShowAddModule] = useState(false);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [modulePrerequisite, setModulePrerequisite] = useState("");

  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editModuleDescription, setEditModuleDescription] = useState("");
  const [editModulePrerequisite, setEditModulePrerequisite] = useState("");

  const [addingItemModuleId, setAddingItemModuleId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [addContentError, setAddContentError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [publishErrorOpen, setPublishErrorOpen] = useState(false);
  const referenceVersions = useApiQuery(
    "referenceVersions",
    { workspaceId },
    { enabled: Boolean(workspaceId && addingItemModuleId) },
  );

  const theoryAssets = useQuery({
    queryKey: ["api", "theory-assets", workspaceId],
    queryFn: ({ signal }) =>
      api<TheoryAssetRow[]>(`workspaces/${workspaceId}/theory-assets`, { signal }),
    enabled: Boolean(workspaceId && addingItemModuleId),
    retry: false,
  });
  const quizAssets = useQuery({
    queryKey: ["api", "quiz-assets", workspaceId],
    queryFn: ({ signal }) =>
      api<QuizAssetRow[]>(`workspaces/${workspaceId}/quiz-assets`, { signal }),
    enabled: Boolean(workspaceId && addingItemModuleId),
    retry: false,
  });

  const [editingItem, setEditingItem] = useState<{
    moduleId: string;
    itemId: string;
    draft: ItemDraft;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ moduleId: string; itemId: string } | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);
  const intentHandledRef = useRef(false);

  useEffect(() => {
    setTitle(course.data?.title ?? "");
    setDescription(course.data?.description ?? "");
  }, [course.data?.id, course.data?.title, course.data?.description]);

  useEffect(() => {
    setPublishIssues([]);
    setPublishErrorOpen(false);
  }, [course.data?.draftRevision]);

  const isDraft = course.data?.status === "DRAFT";

  useEffect(() => {
    if (!isDraft) {
      setShowAddModule(false);
      setEditingModule(null);
      setAddingItemModuleId(null);
      setEditingItem(null);
    }
  }, [isDraft]);

  const anyDrawerStateOpen = Boolean(
    drawerOpen || showAddModule || editingModule || addingItemModuleId || editingItem,
  );
  useEffect(() => {
    if (!anyDrawerStateOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowAddModule(false);
        setEditingModule(null);
        setAddingItemModuleId(null);
        setEditingItem(null);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyDrawerStateOpen]);

  const editingItemId = editingItem?.itemId ?? null;

  useEffect(() => {
    if (!editingItemId || !inspectorRef.current) return;
    inspectorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const firstInput = inspectorRef.current.querySelector<HTMLInputElement>(
      "input[type='text'], input:not([type])",
    );
    firstInput?.focus({ preventScroll: true });
  }, [editingItemId]);

  useEffect(() => {
    inspectorBodyRef.current?.scrollTo({ top: 0 });
  }, [
    selectedItem?.itemId,
    editingItem?.itemId,
    addingItemModuleId,
    editingModule?.id,
    showAddModule,
  ]);

  const data = course.data;
  const modules = useMemo(() => (data?.modules as Module[] | undefined) ?? [], [data?.modules]);
  const assignmentRows = useMemo(
    () => (assignments.data ?? []) as AssignmentRow[],
    [assignments.data],
  );

  useEffect(() => {
    if (intentHandledRef.current || !isDraft || modules.length === 0) return;
    if (intent === "quiz") {
      const moduleId = modules[0]!.id;
      setDrafts((current) => ({
        ...current,
        [moduleId]: { ...emptyDraft(), type: "QUIZ", title: t("New Quiz", "Quiz mới") },
      }));
      setAddingItemModuleId(moduleId);
      setCollapsedModules((current) => ({ ...current, [moduleId]: false }));
      setDrawerOpen(true);
      intentHandledRef.current = true;
    }
  }, [intent, isDraft, modules, t]);

  const resolveBuilderItemType = (item: Item): ItemType => {
    if (item.type === "THEORY" || item.type === "QUIZ" || item.type === "ESSAY") {
      return item.type;
    }
    const linked = item.assignmentId
      ? assignmentRows.find((a) => a.id === item.assignmentId)
      : undefined;
    if (linked) {
      return itemTypeForAssignment(linked);
    }
    return item.type;
  };

  const flatItems = useMemo(() => {
    const entries: Array<{ module: Module; item: Item }> = [];
    for (const mod of modules) {
      for (const item of mod.items) {
        if (item.type !== "ESSAY") entries.push({ module: mod, item });
      }
    }
    return entries;
  }, [modules]);

  const normalizedQuery = outlineQuery.trim().toLowerCase();
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) {
      return modules.map((mod) => ({
        module: mod,
        visibleItems: mod.items.filter((item) => item.type !== "ESSAY"),
      }));
    }
    return modules
      .map((mod) => {
        const allVisible = mod.items.filter((item) => item.type !== "ESSAY");
        const moduleMatches =
          mod.title.toLowerCase().includes(normalizedQuery) ||
          (mod.description?.toLowerCase().includes(normalizedQuery) ?? false);
        if (moduleMatches) return { module: mod, visibleItems: allVisible };
        const matchedItems = allVisible.filter((item) => {
          const linked = item.assignmentId
            ? assignmentRows.find((a) => a.id === item.assignmentId)
            : undefined;
          return (
            item.title.toLowerCase().includes(normalizedQuery) ||
            (linked?.title.toLowerCase().includes(normalizedQuery) ?? false)
          );
        });
        return { module: mod, visibleItems: matchedItems };
      })
      .filter(({ module, visibleItems }) => {
        const moduleMatches =
          module.title.toLowerCase().includes(normalizedQuery) ||
          (module.description?.toLowerCase().includes(normalizedQuery) ?? false);
        return moduleMatches || visibleItems.length > 0;
      });
  }, [modules, normalizedQuery, assignmentRows]);

  if (course.isPending) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {t("Loading course builder…", "Đang tải trình tạo khóa học…")}
      </div>
    );
  }

  const busy =
    course.save.isPending ||
    course.addModule.isPending ||
    course.updateModule.isPending ||
    course.moveModule.isPending ||
    course.deleteModule.isPending ||
    course.addItem.isPending ||
    course.updateItem.isPending ||
    course.moveItem.isPending ||
    course.deleteItem.isPending;

  const inspectedItem = (() => {
    const targetId = editingItem?.itemId ?? selectedItem?.itemId;
    if (targetId) {
      const exact = flatItems.find((entry) => entry.item.id === targetId);
      if (exact) return exact;
    }
    return flatItems[0] ?? null;
  })();

  const activeFlatIndex = inspectedItem
    ? flatItems.findIndex((entry) => entry.item.id === inspectedItem.item.id)
    : -1;

  const allCollapsed = modules.length > 0 && modules.every((m) => collapsedModules[m.id]);

  const toggleAllModules = () => {
    if (allCollapsed) {
      setCollapsedModules({});
    } else {
      const next: Record<string, boolean> = {};
      for (const m of modules) next[m.id] = true;
      setCollapsedModules(next);
    }
  };

  const draftFor = (moduleId: string) => drafts[moduleId] ?? emptyDraft();
  const updateDraft = (moduleId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => ({
      ...current,
      [moduleId]: { ...(current[moduleId] ?? emptyDraft()), ...patch },
    }));

  const clearRightEditors = () => {
    setShowAddModule(false);
    setEditingModule(null);
    setAddingItemModuleId(null);
    setEditingItem(null);
  };

  const closeDrawer = () => {
    clearRightEditors();
    setDrawerOpen(false);
  };

  const selectItem = (moduleId: string, itemId: string) => {
    clearRightEditors();
    setSelectedItem({ moduleId, itemId });
    setDrawerOpen(true);
  };

  const openAddModule = () => {
    if (!canCreateModules) return;
    clearRightEditors();
    setShowAddModule(true);
    setDrawerOpen(true);
  };

  const openEditModule = (mod: Module) => {
    clearRightEditors();
    setEditingModule(mod);
    setEditModuleTitle(mod.title);
    setEditModuleDescription(mod.description ?? "");
    setEditModulePrerequisite(mod.prerequisiteModuleId ?? "");
    setDrawerOpen(true);
  };

  const openAddItem = (moduleId: string) => {
    clearRightEditors();
    setDrafts((current) => ({ ...current, [moduleId]: emptyDraft() }));
    setAddContentError(null);
    course.addItem.reset();
    setAddingItemModuleId(moduleId);
    setCollapsedModules((prev) => ({ ...prev, [moduleId]: false }));
    setDrawerOpen(false);
  };

  const openEditItem = (moduleId: string, item: Item) => {
    clearRightEditors();
    setSelectedItem({ moduleId, itemId: item.id });
    setEditingItem({ moduleId, itemId: item.id, draft: draftFromItem(item) });
    setDrawerOpen(true);
  };

  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    course.save.mutate(
      { title, description },
      {
        onSuccess: () => {
          if (data) setShowCourseInfo(false);
        },
      },
    );
  };

  const publishChanges = () => {
    if (!workspaceName) return;
    const issues = collectPublishIssues(modules, assignmentRows, t);
    setPublishIssues(issues);
    if (issues.length > 0) {
      setPublishErrorOpen(true);
      const emptyModuleIds = modules
        .filter((module) => module.items.length === 0)
        .map((module) => module.id);
      if (emptyModuleIds.length > 0) {
        setCollapsedModules((current) => {
          const next = { ...current };
          for (const moduleId of emptyModuleIds) next[moduleId] = false;
          return next;
        });
      }
      return;
    }
    activateCourse.mutate(
      { workspaceId, name: workspaceName, status: "ACTIVE" },
      {
        onSuccess: () => {
          setPublishIssues([]);
          setPublishErrorOpen(false);
          window.location.assign(
            `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`,
          );
        },
        onError: (cause) => {
          const message =
            cause instanceof Error
              ? t(cause.message)
              : t(
                  "The Course could not be published. Review the highlighted issues and try again.",
                  "Không thể công bố khóa học. Hãy kiểm tra các lỗi được hiển thị và thử lại.",
                );
          setPublishIssues([message]);
          setPublishErrorOpen(true);
        },
      },
    );
  };

  const addModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreateModules) return;
    if (!moduleTitle.trim()) return;
    const body: { title: string; description?: string; prerequisiteModuleId?: string } = {
      title: moduleTitle.trim(),
    };
    if (moduleDescription.trim()) body.description = moduleDescription.trim();
    if (modulePrerequisite) body.prerequisiteModuleId = modulePrerequisite;
    course.addModule.mutate(body, {
      onSuccess: () => {
        setModuleTitle("");
        setModuleDescription("");
        setModulePrerequisite("");
        closeDrawer();
      },
    });
  };

  const saveModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingModule || !editModuleTitle.trim()) return;
    const body: {
      moduleId: string;
      title: string;
      description?: string;
      prerequisiteModuleId?: string;
    } = { moduleId: editingModule.id, title: editModuleTitle.trim() };
    if (editModuleDescription.trim()) body.description = editModuleDescription.trim();
    if (editModulePrerequisite) body.prerequisiteModuleId = editModulePrerequisite;
    course.updateModule.mutate(body, { onSuccess: () => closeDrawer() });
  };

  const addItem = (moduleId: string, event: React.FormEvent) => {
    event.preventDefault();
    const draft = draftFor(moduleId);
    setAddContentError(null);
    if (!draft.title.trim()) {
      setAddContentError(t("Enter a display title.", "Hãy nhập tên hiển thị."));
      return;
    }
    if (
      draft.type === "THEORY" &&
      (draft.lessonKind === "THEORY" ? !draft.theoryAssetId : !draft.referenceModelId)
    ) {
      setAddContentError(
        draft.lessonKind === "ARCHITECTURE"
          ? t(
              "Select an analyzed Repository version.",
              "Hãy chọn phiên bản Repository đã phân tích.",
            )
          : t("Select a Lesson from the library.", "Hãy chọn Lesson từ thư viện."),
      );
      return;
    }
    if (draft.type === "QUIZ" && !draft.quizAssetId) {
      setAddContentError(t("Select a Quiz from the library.", "Hãy chọn Quiz từ thư viện."));
      return;
    }
    if (draft.type === "RUNTIME_LAB" && !draft.assignmentId) {
      setAddContentError(t("Select a Runtime/Studio Lab.", "Hãy chọn Lab có Runtime/Studio."));
      return;
    }
    if (!draftValid(draft)) {
      setAddContentError(t("Complete all required content fields.", "Hãy hoàn thành các trường nội dung bắt buộc."));
      return;
    }
    const body: {
      moduleId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.addItem.mutate(body, {
      onSuccess: () => {
        setDrafts((current) => ({ ...current, [moduleId]: emptyDraft() }));
        setAddingItemModuleId(null);
        setAddContentError(null);
        const label = draft.type === "THEORY" ? "Lesson" : draft.type === "QUIZ" ? "Quiz" : "Practice";
        toast.success(t(`${label} added to the milestone.`, `Đã thêm ${label} vào mốc.`));
      },
      onError: (cause) => {
        const message =
          cause instanceof Error
            ? cause.message
            : t("Could not add this content. Try again.", "Không thể thêm nội dung. Hãy thử lại.");
        setAddContentError(message);
        toast.error(message);
      },
    });
  };

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || !draftValid(editingItem.draft)) return;
    const draft = editingItem.draft;
    const body: {
      moduleId: string;
      itemId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId: editingItem.moduleId,
      itemId: editingItem.itemId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.updateItem.mutate(body, { onSuccess: () => setEditingItem(null) });
  };

  const addingItemModule = addingItemModuleId
    ? (modules.find((mod) => mod.id === addingItemModuleId) ?? null)
    : null;
  const contentLibraryError =
    theoryAssets.isError || quizAssets.isError || assignments.isError || referenceVersions.isError
      ? t(
          "Some content libraries could not be loaded. Close the popup and try again.",
          "Không tải được một số thư viện nội dung. Hãy đóng popup và thử lại.",
        )
      : null;

  const isDrawerVisible = Boolean(
    (isDraft && canCreateModules && showAddModule) ||
      (isDraft && editingModule) ||
      (isDraft && editingItem) ||
      (drawerOpen && inspectedItem),
  );

  const inspectedResolvedType = inspectedItem ? resolveBuilderItemType(inspectedItem.item) : null;
  const inspectedMeta = inspectedResolvedType
    ? (TYPE_META[inspectedResolvedType] ?? TYPE_META.THEORY)
    : null;
  const inspectedLinkedAssignment = inspectedItem?.item.assignmentId
    ? assignmentRows.find((a) => a.id === inspectedItem.item.assignmentId)
    : undefined;
  const inspectedBodyMarkdown =
    inspectedItem && typeof inspectedItem.item.content?.["body"] === "string"
      ? inspectedItem.item.content["body"].trim()
      : "";
  const inspectedDuration = inspectedItem ? itemEstimatedMinutes(inspectedItem.item) : null;

  const activeError =
    (course.save.isError &&
      t("Could not save the course draft.", "Không lưu được bản nháp khóa học.")) ||
    (course.startDraft.isError &&
      t("Could not create a new draft.", "Không tạo được bản nháp mới.")) ||
    (course.addModule.isError && t("Could not add the module.", "Không thêm được chương.")) ||
    (course.updateModule.isError &&
      t("Could not update the module.", "Không cập nhật được chương.")) ||
    (course.deleteModule.isError && t("Could not delete the module.", "Không xóa được chương.")) ||
    (course.addItem.isError &&
      t(
        "Could not add the learning item. Verify the linked Lab belongs to this class and required content is filled.",
        "Không thêm được nội dung. Kiểm tra Lab liên kết thuộc lớp này và nội dung bắt buộc đã nhập.",
      )) ||
    (course.updateItem.isError &&
      t("Could not update the learning item.", "Không cập nhật được nội dung.")) ||
    (course.deleteItem.isError &&
      t("Could not delete the learning item.", "Không xóa được nội dung.")) ||
    null;

  return (
    <section
      id="course-builder"
      aria-labelledby="course-builder-title"
      className="overflow-hidden rounded-2xl border border-slate-300 bg-card shadow-sm dark:border-border"
    >
      {/* Compact Unified Workspace Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-card px-5 py-3.5 dark:border-border">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 id="course-builder-title" className="text-base font-bold text-foreground">
            {t("Modules", "Học phần")}
          </h2>
          {data?.status === "DRAFT" && (
            <Badge variant="secondary" className="px-2.5 py-0.5 text-xs font-semibold">
              {t("Draft", "Bản nháp")}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraft && (
            <Button
              type="button"
              size="sm"
              variant={showCourseInfo ? "secondary" : "outline"}
              className="border-slate-300 font-semibold text-foreground dark:border-border"
              onClick={() => setShowCourseInfo((open) => !open)}
            >
              <Settings2 className="mr-1.5 size-3.5" aria-hidden="true" />
              {t("Course info", "Thông tin khóa")}
            </Button>
          )}
          {data?.status === "PUBLISHED" && (
            <Badge variant="outline" className="font-medium">
              <Lock className="mr-1.5 size-3.5" aria-hidden="true" />
              {t("Active · published", "Đang hoạt động · đã xuất bản")}
            </Badge>
          )}
          {isDraft &&
            isPublishStep &&
            workspaceName &&
            data?.modules.some((module) => module.items.length > 0) && (
            <Button
              type="button"
              size="sm"
              disabled={busy || activateCourse.isPending}
              onClick={publishChanges}
            >
              <Send className="mr-1.5 size-3.5" aria-hidden="true" />
              {activateCourse.isPending
                ? t("Publishing…", "Đang công bố…")
                : t("Publish Changes", "Công bố khóa học")}
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Course Metadata Strip (always visible when creating a new course) */}
      {(!data || showCourseInfo) && (
        <div className="border-b bg-muted/20 px-4 py-3">
          <form
            onSubmit={saveCourse}
            className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"
          >
            <Input
              aria-label={t("Course title", "Tên khóa học")}
              required
              maxLength={255}
              disabled={data?.status === "PUBLISHED"}
              placeholder={t("Course title", "Tên khóa học")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              aria-label={t("Course description", "Mô tả khóa học")}
              disabled={data?.status === "PUBLISHED"}
              placeholder={t("Description", "Mô tả")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <Button size="sm" disabled={busy || data?.status === "PUBLISHED"}>
                <Save className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Save draft", "Lưu bản nháp")}
              </Button>
              {data && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCourseInfo(false)}
                  aria-label={t("Close", "Đóng")}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </form>
          {data?.status === "PUBLISHED" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Published versions are immutable. Start a separate draft to continue editing.",
                "Phiên bản đã publish là bất biến. Tạo bản nháp riêng để tiếp tục chỉnh sửa.",
              )}
            </p>
          )}
          {!data && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Save the course details to start its roadmap.",
                "Lưu thông tin khóa học để bắt đầu tạo lộ trình.",
              )}
            </p>
          )}
        </div>
      )}

      {/* Alerts (0px when idle) */}
      {activeError && (
        <div
          role="alert"
          className="border-b bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
        >
          {activeError}
        </div>
      )}
      <Dialog open={publishErrorOpen} onOpenChange={setPublishErrorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-left">
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle>{t("Course is not ready to publish", "Khóa học chưa thể công bố")}</DialogTitle>
            <DialogDescription>
              {t(
                "Fix the items below, then publish the course again.",
                "Hãy hoàn tất các mục bên dưới rồi công bố lại khóa học.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              {t("Complete these items before publishing:", "Hoàn tất các mục sau trước khi công bố:")}
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-foreground/85">
              {publishIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPublishErrorOpen(false)}>
              {t("Review course", "Quay lại chỉnh sửa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Single-Column 1-Scroll Curriculum Accordion + Slide-Over Inspector Drawer */}
      {data && (
        <div className="min-w-0 bg-muted/10">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b bg-card/80 px-4 py-2.5">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label={t("Filter modules or labs", "Tìm chương hoặc bài Lab")}
                  placeholder={t("Filter modules or labs…", "Tìm chương hoặc bài Lab…")}
                  value={outlineQuery}
                  onChange={(event) => setOutlineQuery(event.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-card pr-7 pl-8 text-[13px] text-foreground placeholder:text-foreground/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-border"
                />
                {outlineQuery && (
                  <button
                    type="button"
                    onClick={() => setOutlineQuery("")}
                    aria-label={t("Clear filter", "Xóa bộ lọc")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {modules.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                  onClick={toggleAllModules}
                  title={
                    allCollapsed
                      ? t("Expand all modules", "Mở tất cả chương")
                      : t("Collapse all modules", "Thu gọn tất cả chương")
                  }
                >
                  {allCollapsed ? (
                    <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {allCollapsed
                      ? t("Expand all modules", "Mở tất cả chương")
                      : t("Collapse all modules", "Thu gọn tất cả chương")}
                  </span>
                </Button>
              )}
            </div>

            <div className="p-4">
              {modules.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {t("No modules yet", "Chưa có chương nào")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isDraft
                      ? t(
                          "Create your first module to organize Labs and readings.",
                          "Tạo chương đầu tiên để sắp xếp các bài Lab và tài liệu học.",
                        )
                      : t(
                          "Start a new draft to add modules to this curriculum.",
                          "Tạo bản nháp mới để thêm chương vào giáo trình này.",
                        )}
                  </p>
                </div>
              ) : filteredModules.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                  <p>
                    {t(
                      "No matching modules or Labs.",
                      "Không tìm thấy chương hoặc bài Lab phù hợp.",
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setOutlineQuery("")}
                  >
                    {t("Clear filter", "Xóa bộ lọc")}
                  </Button>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {filteredModules.map(({ module, visibleItems }) => {
                    const isCollapsed = Boolean(collapsedModules[module.id]) && !normalizedQuery;
                    const prereqTitle = module.prerequisiteModuleId
                      ? modules.find((candidate) => candidate.id === module.prerequisiteModuleId)
                          ?.title
                      : null;
                    const isModuleEditing =
                      editingModule?.id === module.id || addingItemModuleId === module.id;

                    return (
                      <li
                        key={module.id}
                        className={`overflow-hidden rounded-xl border bg-card shadow-2xs transition-colors ${
                          isModuleEditing
                            ? "border-primary ring-1 ring-primary/25"
                            : "border-slate-300/90 dark:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedModules((prev) => ({
                                ...prev,
                                [module.id]: !prev[module.id],
                              }))
                            }
                            aria-expanded={!isCollapsed}
                            title={
                              prereqTitle
                                ? `${t("Prerequisite", "Tiên quyết")}: ${prereqTitle}`
                                : undefined
                            }
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                              {module.position}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-base font-bold leading-snug text-foreground">
                                {module.title}
                              </span>
                            </span>
                            <ChevronDown
                              className={`size-4 shrink-0 text-foreground/70 transition-transform ${
                                isCollapsed ? "-rotate-90" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          {isDraft && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                disabled={busy || module.position <= 1}
                                onClick={() =>
                                  course.moveModule.mutate({ moduleId: module.id, direction: "UP" })
                                }
                                title={t("Move module up", "Chuyển chương lên")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronUp className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Move up", "Lên")}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy || module.position >= modules.length}
                                onClick={() =>
                                  course.moveModule.mutate({
                                    moduleId: module.id,
                                    direction: "DOWN",
                                  })
                                }
                                title={t("Move module down", "Chuyển chương xuống")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronDown className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Move down", "Xuống")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModule(module)}
                                title={t("Edit module", "Sửa chương")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Edit module", "Sửa chương")}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      t(
                                        `Delete module "${module.title}" and all its items?`,
                                        `Xóa chương "${module.title}" và toàn bộ nội dung bên trong?`,
                                      ),
                                    )
                                  ) {
                                    course.deleteModule.mutate({ moduleId: module.id });
                                  }
                                }}
                                title={t("Delete module", "Xóa chương")}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                              >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Delete module", "Xóa chương")}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {!isCollapsed && (
                          <>
                            {visibleItems.length > 0 ? (
                              <ol className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-border dark:border-border">
                                {visibleItems.map((item) => {
                                  const mins = itemEstimatedMinutes(item);
                                  const isInspected =
                                    drawerOpen &&
                                    !showAddModule &&
                                    !editingModule &&
                                    !addingItemModuleId &&
                                    inspectedItem?.item.id === item.id;

                                  return (
                                    <li key={item.id}>
                                      <div
                                        className={`group flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                                          isInspected
                                            ? "border-l-[3px] border-l-primary bg-[#EEF4FF] pl-[13px] dark:bg-primary/12"
                                            : "hover:bg-slate-50 dark:hover:bg-muted/35"
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          aria-current={isInspected ? "true" : undefined}
                                          onClick={() => selectItem(module.id, item.id)}
                                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                        >
                                          <span
                                            className={`min-w-0 flex-1 text-sm font-semibold leading-snug ${
                                              isInspected
                                                ? "text-primary"
                                                : "text-foreground group-hover:text-primary"
                                            }`}
                                          >
                                            {item.title}
                                          </span>
                                          {mins && (
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                              {mins} {t("min", "phút")}
                                            </span>
                                          )}
                                        </button>

                                        {isDraft && (
                                          <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-80 transition-opacity group-hover:opacity-100">
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() =>
                                                course.moveItem.mutate({
                                                  moduleId: module.id,
                                                  itemId: item.id,
                                                  direction: "UP",
                                                })
                                              }
                                              title={t("Move up", "Lên")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                            >
                                              <ChevronUp className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Move up", "Lên")}</span>
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() =>
                                                course.moveItem.mutate({
                                                  moduleId: module.id,
                                                  itemId: item.id,
                                                  direction: "DOWN",
                                                })
                                              }
                                              title={t("Move down", "Xuống")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                            >
                                              <ChevronDown
                                                className="size-3.5"
                                                aria-hidden="true"
                                              />
                                              <span className="sr-only">
                                                {t("Move down", "Xuống")}
                                              </span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openEditItem(module.id, item)}
                                              title={t("Edit", "Sửa")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                              <Pencil className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Edit", "Sửa")}</span>
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() => {
                                                if (
                                                  window.confirm(
                                                    t(
                                                      "Remove this Lab from the module?",
                                                      "Xóa bài Lab này khỏi chương?",
                                                    ),
                                                  )
                                                ) {
                                                  course.deleteItem.mutate({
                                                    moduleId: module.id,
                                                    itemId: item.id,
                                                  });
                                                }
                                              }}
                                              title={t("Delete", "Xóa")}
                                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                                            >
                                              <Trash2 className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Delete", "Xóa")}</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
                                <span>
                                  {t(
                                    "No Labs assigned to this milestone yet.",
                                    "Chương (Mốc) này chưa được gắn bài Lab nào.",
                                  )}
                                </span>
                                {isDraft && assignmentRows.length > 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={busy}
                                    onClick={() => {
                                      void (async () => {
                                        for (const a of assignmentRows) {
                                          await course.addItem.mutateAsync({
                                            moduleId: module.id,
                                            type: itemTypeForAssignment(a),
                                            title: a.title,
                                            description:
                                              a.instructions
                                                ?.split("\n")[0]
                                                ?.replace(/^#+\s*/, "")
                                                .slice(0, 160) ?? "",
                                            required: true,
                                            content: {},
                                            assignmentId: a.id,
                                          });
                                        }
                                      })();
                                    }}
                                  >
                                    <Zap className="mr-1 size-3" aria-hidden="true" />
                                    {t(
                                      `Assign all ${assignmentRows.length}`,
                                      `Gắn nhanh ${assignmentRows.length} Lab`,
                                    )}
                                  </Button>
                                )}
                              </div>
                            )}

                            {isDraft && canCreateModules && (
                              <div className="border-t p-2.5">
                                <button
                                  type="button"
                                  onClick={() => openAddItem(module.id)}
                                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/5 dark:border-border"
                                >
                                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed border-current">
                                    <Plus className="size-4" aria-hidden="true" />
                                  </span>
                                  {t(
                                    "Add content to this milestone",
                                    "Thêm nội dung vào Chương / Mốc này",
                                  )}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {isDraft && canCreateModules && !normalizedQuery && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={openAddModule}
                  className="mt-3 flex w-full items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-card/70 px-4 py-3 text-left text-sm font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-current">
                    <Plus className="size-4" aria-hidden="true" />
                  </span>
                  {t("Add Module", "Thêm chương")}
                </button>
              )}
            </div>
          </div>

          {/* SLIDE-OVER INSPECTOR & EDITOR DRAWER */}
          {isDrawerVisible && (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeDrawer();
              }}
            >
              <aside
                ref={inspectorRef}
                role="dialog"
                aria-modal="true"
                aria-label={t("Curriculum Inspector", "Trình xem & sửa học liệu")}
                className="flex h-full w-full max-w-2xl min-w-0 flex-col border-l border-border bg-background shadow-2xl"
              >
                {isDraft && canCreateModules && showAddModule ? (
                  <form onSubmit={addModule} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          {t("New Module", "Chương mới")}
                        </p>
                        <h3 className="text-sm font-semibold">
                          {t(
                            "Add a chapter to the roadmap",
                            "Thêm một chương vào lộ trình khóa học",
                          )}
                        </h3>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={closeDrawer}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only">{t("Close", "Đóng")}</span>
                      </Button>
                    </div>
                    <div
                      ref={inspectorBodyRef}
                      className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5"
                    >
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Module title", "Tên chương")}</span>
                        <Input
                          required
                          maxLength={255}
                          placeholder={t(
                            "e.g., Module 1: Architecture Foundations",
                            "VD: Chương 1: Nền tảng kiến trúc",
                          )}
                          value={moduleTitle}
                          onChange={(event) => setModuleTitle(event.target.value)}
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Module description", "Mô tả chương")}</span>
                        <Textarea
                          rows={3}
                          placeholder={t(
                            "Optional learning outcomes for this chapter…",
                            "Mục tiêu học tập của chương (không bắt buộc)…",
                          )}
                          value={moduleDescription}
                          onChange={(event) => setModuleDescription(event.target.value)}
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Prerequisite module", "Chương tiên quyết")}</span>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={modulePrerequisite}
                          onChange={(event) => setModulePrerequisite(event.target.value)}
                        >
                          <option value="">
                            {t("No module prerequisite", "Không có chương tiên quyết")}
                          </option>
                          {modules.map((mod) => (
                            <option key={mod.id} value={mod.id}>
                              {mod.position}. {mod.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={closeDrawer}
                      >
                        {t("Cancel", "Hủy")}
                      </Button>
                      <Button size="sm" disabled={busy || !moduleTitle.trim()}>
                        <Plus className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Add module", "Thêm chương")}
                      </Button>
                    </div>
                  </form>
                ) : isDraft && editingModule ? (
                  <form onSubmit={saveModule} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          {t(
                            `Editing Module ${editingModule.position}`,
                            `Chỉnh sửa Chương ${editingModule.position}`,
                          )}
                        </p>
                        <h3 className="text-sm font-semibold">{editingModule.title}</h3>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={closeDrawer}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only">{t("Close", "Đóng")}</span>
                      </Button>
                    </div>
                    <div
                      ref={inspectorBodyRef}
                      className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5"
                    >
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Module title", "Tên chương")}</span>
                        <Input
                          required
                          maxLength={255}
                          value={editModuleTitle}
                          onChange={(event) => setEditModuleTitle(event.target.value)}
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Module description", "Mô tả chương")}</span>
                        <Textarea
                          rows={3}
                          value={editModuleDescription}
                          onChange={(event) => setEditModuleDescription(event.target.value)}
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">
                        <span>{t("Prerequisite module", "Chương tiên quyết")}</span>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={editModulePrerequisite}
                          onChange={(event) => setEditModulePrerequisite(event.target.value)}
                        >
                          <option value="">
                            {t("No module prerequisite", "Không có chương tiên quyết")}
                          </option>
                          {modules
                            .filter((candidate) => candidate.position < editingModule.position)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.position}. {candidate.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={closeDrawer}
                      >
                        {t("Cancel", "Hủy")}
                      </Button>
                      <Button size="sm" disabled={busy || !editModuleTitle.trim()}>
                        {t("Save module", "Lưu chương")}
                      </Button>
                    </div>
                  </form>
                ) : isDraft && editingItem ? (
                  <form onSubmit={saveItem} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          {t("Editing Learning Item", "Đang chỉnh sửa nội dung")}
                        </p>
                        <h3 className="truncate text-sm font-semibold">
                          {editingItem.draft.title || "—"}
                        </h3>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setEditingItem(null)}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only">{t("Close", "Đóng")}</span>
                      </Button>
                    </div>
                    <div ref={inspectorBodyRef} className="min-h-0 flex-1 overflow-y-auto p-5">
                      <ItemFields
                        draft={editingItem.draft}
                        onChange={(patch) =>
                          setEditingItem((current) =>
                            current
                              ? { ...current, draft: { ...current.draft, ...patch } }
                              : current,
                          )
                        }
                        assignments={assignmentRows}
                        t={t}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setEditingItem(null)}
                      >
                        {t("Cancel", "Hủy")}
                      </Button>
                      <Button size="sm" disabled={busy || !draftValid(editingItem.draft)}>
                        {t("Save item", "Lưu nội dung")}
                      </Button>
                    </div>
                  </form>
                ) : inspectedItem ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    {/* Pinned Inspector Header with Immediate Actions & Prev/Next Stepper */}
                    <div className="border-b border-slate-200 bg-card px-6 py-4 dark:border-border">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold text-primary">
                          {/^(?:Module|Chương)\s*\d+/i.test(inspectedItem.module.title.trim())
                            ? inspectedItem.module.title
                            : `${t(
                                `Module ${inspectedItem.module.position}`,
                                `Chương ${inspectedItem.module.position}`,
                              )} · ${inspectedItem.module.title}`}
                        </p>
                        {flatItems.length > 1 && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="px-1 font-mono text-xs font-semibold text-foreground/75">
                              {activeFlatIndex + 1}/{flatItems.length}
                            </span>
                            <button
                              type="button"
                              disabled={activeFlatIndex <= 0}
                              onClick={() => {
                                const prev = flatItems[activeFlatIndex - 1];
                                if (prev) selectItem(prev.module.id, prev.item.id);
                              }}
                              title={t("Previous item", "Bài trước")}
                              className="rounded-md border border-slate-300 bg-card p-1.5 text-foreground hover:border-primary hover:text-primary disabled:opacity-35 dark:border-border"
                            >
                              <ChevronLeft className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">{t("Previous item", "Bài trước")}</span>
                            </button>
                            <button
                              type="button"
                              disabled={
                                activeFlatIndex < 0 || activeFlatIndex >= flatItems.length - 1
                              }
                              onClick={() => {
                                const next = flatItems[activeFlatIndex + 1];
                                if (next) selectItem(next.module.id, next.item.id);
                              }}
                              title={t("Next item", "Bài tiếp theo")}
                              className="rounded-md border border-slate-300 bg-card p-1.5 text-foreground hover:border-primary hover:text-primary disabled:opacity-35 dark:border-border"
                            >
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">{t("Next item", "Bài tiếp theo")}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold leading-snug text-foreground sm:text-xl">
                            {inspectedItem.item.title}
                          </h3>
                          {inspectedDuration && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {inspectedDuration} {t("min", "phút")}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={closeDrawer}
                            aria-label={t("Close", "Đóng")}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </Button>
                          {inspectedItem.item.assignmentId && (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="border-primary/40 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                            >
                              <Link
                                href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(inspectedItem.item.assignmentId)}`}
                              >
                                <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
                                {t("Open in Lab Authoring Studio", "Mở trong trình soạn Lab")}
                              </Link>
                            </Button>
                          )}
                          {isDraft && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                openEditItem(inspectedItem.module.id, inspectedItem.item)
                              }
                            >
                              <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                              {t("Edit", "Sửa")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Independently Scrollable Preview Body */}
                    <div
                      ref={inspectorBodyRef}
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
                    >
                      {(inspectedLinkedAssignment || inspectedItem.item.description) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-[#F4F8FF] px-4 py-2.5 text-[13px] dark:bg-primary/5">
                          {inspectedLinkedAssignment && (
                            <div className="min-w-0">
                              <span className="font-semibold uppercase tracking-wide text-primary">
                                {t("Linked Lab", "Lab liên kết")}:
                              </span>{" "}
                              <span className="font-semibold text-foreground">
                                {inspectedLinkedAssignment.title}
                              </span>
                            </div>
                          )}
                          {inspectedItem.item.description && (
                            <span className="leading-5 text-foreground/85">
                              {inspectedItem.item.description}
                            </span>
                          )}
                        </div>
                      )}

                      {inspectedItem.item.type === "THEORY" && (
                        <div className="overflow-x-auto rounded-lg border bg-background p-4 border-slate-300/90 shadow-2xs dark:border-border [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                          {inspectedBodyMarkdown ? (
                            <MarkdownPreview markdown={inspectedBodyMarkdown} />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t(
                                "No theory Markdown body written yet.",
                                "Chưa có nội dung Markdown lý thuyết.",
                              )}
                            </p>
                          )}
                        </div>
                      )}

                      {inspectedItem.item.type !== "THEORY" &&
                        inspectedItem.item.type !== "ESSAY" &&
                        inspectedLinkedAssignment?.instructions?.trim() && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("Lab Overview & Instructions", "Tổng quan & Hướng dẫn bài Lab")}
                            </p>
                            <div className="overflow-x-auto rounded-lg border bg-background p-4 [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                              <MarkdownPreview markdown={inspectedLinkedAssignment.instructions} />
                            </div>
                          </div>
                        )}

                      {inspectedItem.item.type === "ESSAY" && (
                        <div className="space-y-2 rounded-lg border bg-background p-4 text-sm">
                          <p className="font-medium">
                            {String(inspectedItem.item.content?.["prompt"] ?? "")}
                          </p>
                          {Array.isArray(inspectedItem.item.content?.["rubric"]) && (
                            <ul className="list-disc pl-5 text-xs text-muted-foreground">
                              {(
                                inspectedItem.item.content["rubric"] as Array<{
                                  criterion?: string;
                                  maxScore?: number;
                                }>
                              ).map((entry, idx) => (
                                <li key={idx}>
                                  {entry.criterion} · {entry.maxScore} pts
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center p-8 text-center">
                    <BookOpen className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {t("Select a lesson to inspect", "Chọn một bài học để xem trước")}
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                      {t(
                        "Add a module on the left or click an item to preview and edit its content here.",
                        "Thêm chương bên trái hoặc bấm vào một nội dung để xem trước và chỉnh sửa tại đây.",
                      )}
                    </p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      )}

      <AddContentDialog
        open={Boolean(isDraft && addingItemModule)}
        onOpenChange={(open) => {
          if (!open) {
            setAddingItemModuleId(null);
            setAddContentError(null);
            course.addItem.reset();
          }
        }}
        module={addingItemModule}
        draft={addingItemModule ? draftFor(addingItemModule.id) : emptyDraft()}
        onChange={(patch) => {
          if (addingItemModule) {
            updateDraft(addingItemModule.id, patch);
            setAddContentError(null);
          }
        }}
        theoryAssets={theoryAssets.data ?? []}
        quizAssets={quizAssets.data ?? []}
        referenceVersions={(referenceVersions.data ?? []) as ReferenceVersionRow[]}
        assignments={assignmentRows}
        loading={
          theoryAssets.isPending ||
          quizAssets.isPending ||
          assignments.isPending ||
          referenceVersions.isPending
        }
        loadError={contentLibraryError}
        submitError={addContentError}
        saving={course.addItem.isPending}
        onSubmit={(event) => {
          if (addingItemModule) addItem(addingItemModule.id, event);
          else event.preventDefault();
        }}
        t={t}
      />

      {/* Compact Immutable Version History Footer */}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-card px-5 py-2.5 text-xs dark:border-border">
          <div
            className="truncate font-medium text-foreground/75"
            title={
              course.versions.data?.length
                ? course.versions.data
                    .map((version) => `v${version.version} (${version.snapshotDigest})`)
                    .join(" · ")
                : undefined
            }
          >
            {course.versions.data?.length
              ? t(
                  `Current version: v${data.publishedVersion} · ${course.versions.data.length} published versions`,
                  `Phiên bản hiện tại: v${data.publishedVersion} · ${course.versions.data.length} lần xuất bản`,
                )
              : t("No published version yet.", "Chưa có phiên bản được công bố.")}
          </div>
          {data.status === "PUBLISHED" && (
            <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-300">
              {t("Published · Read-only", "Đã xuất bản · Chỉ đọc")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
