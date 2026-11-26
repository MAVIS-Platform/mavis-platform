"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Code2,
  FileText,
  GitFork,
  HelpCircle,
  Play,
  type LucideIcon,
} from "lucide-react";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Badge } from "@/components/ui/badge";
import type { Assignment } from "@/features/assignments/requirements";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseQuiz } from "./course-quiz";
import type { QuizQuestionData } from "./java-coursera-curriculum-data";

type PreviewItem = {
  id: string;
  type: string;
  title: string;
  position: number;
  description?: string | null | undefined;
  assignmentId?: string | null | undefined;
  content?: Record<string, unknown> | undefined;
  quizQuestions?: QuizQuestionData[] | undefined;
};

type PreviewModule = {
  id: string;
  title: string;
  description?: string | null | undefined;
  position: number;
  items: PreviewItem[];
};

const TYPE_META: Record<string, { en: string; vi: string; icon: LucideIcon }> = {
  THEORY: { en: "Theory", vi: "Bài đọc Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Quiz", vi: "Bài trắc nghiệm (Quiz)", icon: HelpCircle },
  ESSAY: { en: "Essay", vi: "Tự luận", icon: FileText },
  STATIC_LAB: { en: "Theory Lab", vi: "Lab chỉ Lý thuyết", icon: Code2 },
  IMPACT_LAB: { en: "Theory + Quiz Lab", vi: "Lab Lý thuyết + Quiz", icon: GitFork },
  RUNTIME_LAB: {
    en: "Theory + Quiz + Studio Lab",
    vi: "Lab Lý thuyết + Quiz + Studio",
    icon: Play,
  },
};

export function LecturerActiveCoursePreview({
  modules,
  workspaceId,
  assignments,
  resolveItemType,
  resolveItemTitle,
  resolveQuizQuestions,
}: {
  modules: PreviewModule[];
  workspaceId: string;
  assignments: Assignment[];
  resolveItemType: (item: PreviewItem) => string;
  resolveItemTitle: (item: PreviewItem, module: PreviewModule, effectiveType: string) => string;
  resolveQuizQuestions: (item: PreviewItem, module: PreviewModule) => QuizQuestionData[];
}) {
  const { t } = useLocale();
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  const toggleModule = (moduleId: string) => {
    setOpenModuleId((current) => (current === moduleId ? null : moduleId));
    setOpenItemId(null);
  };

  return (
    <ol className="space-y-3">
      {modules.map((module) => {
        const moduleOpen = openModuleId === module.id;
        return (
          <li
            key={module.id}
            className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-xs transition-colors hover:border-primary/40"
          >
            <button
              type="button"
              aria-expanded={moduleOpen}
              aria-controls={`lecturer-preview-module-${module.id}`}
              className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => toggleModule(module.id)}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {module.position}
              </span>
              <span className="min-w-0 flex-1 text-base font-bold leading-snug text-foreground sm:text-[17px]">
                {module.title}
              </span>
              {!moduleOpen && (
                <Badge variant="outline" className="font-semibold text-foreground">
                  {module.items.length}
                </Badge>
              )}
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${moduleOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {moduleOpen && (
              <div id={`lecturer-preview-module-${module.id}`}>
                {module.description && (
                  <p className="border-t border-border/80 bg-[#F8FAFC] px-5 py-3 text-[15px] leading-6 text-muted-foreground dark:bg-muted/20">
                    {module.description}
                  </p>
                )}
                <ul className="divide-y border-t">
                  {module.items.map((item) => {
                    const itemOpen = openItemId === item.id;
                    const effectiveType = resolveItemType(item);
                    const meta = TYPE_META[effectiveType] ?? {
                      en: item.type,
                      vi: item.type,
                      icon: FileText,
                    };
                    const Icon = meta.icon;
                    const assignment = item.assignmentId
                      ? assignmentById.get(item.assignmentId)
                      : undefined;
                    const isLab = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(
                      effectiveType,
                    );

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-expanded={itemOpen}
                          aria-controls={`lecturer-preview-item-${item.id}`}
                          className="flex w-full cursor-pointer items-start gap-3.5 px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          onClick={() =>
                            setOpenItemId((current) => (current === item.id ? null : item.id))
                          }
                        >
                          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t(meta.en, meta.vi)}
                              </span>
                              <Badge variant="outline">{t("View only", "Chỉ xem")}</Badge>
                            </span>
                            <span className="mt-1 block text-base font-semibold leading-snug text-foreground">
                              {resolveItemTitle(item, module, effectiveType)}
                            </span>
                          </span>
                          <ChevronDown
                            className={`mt-2 size-4 shrink-0 text-muted-foreground transition-transform ${itemOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                        </button>

                        {itemOpen && (
                          <div
                            id={`lecturer-preview-item-${item.id}`}
                            className="border-t bg-muted/15 px-5 py-4 sm:pl-[4.75rem]"
                          >
                            {item.type === "THEORY" &&
                            typeof item.content?.["body"] === "string" ? (
                              <MarkdownPreview markdown={String(item.content["body"])} />
                            ) : item.type === "QUIZ" ? (
                              <LecturerReadOnlyQuizPreview
                                workspaceId={workspaceId}
                                assignmentId={item.assignmentId}
                                questions={resolveQuizQuestions(item, module)}
                              />
                            ) : isLab ? (
                              <div className="max-w-4xl space-y-3">
                                <h4 className="text-sm font-semibold text-foreground">
                                  {t("Assignment requirements", "Yêu cầu bài tập")}
                                </h4>
                                {assignment?.instructions?.trim() ? (
                                  <MarkdownPreview markdown={assignment.instructions} />
                                ) : item.description?.trim() ? (
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    {item.description}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {t(
                                      "No assignment requirements have been provided.",
                                      "Chưa có yêu cầu bài tập.",
                                    )}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm leading-6 text-muted-foreground">
                                {item.description ||
                                  t("No preview content.", "Chưa có nội dung xem trước.")}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {module.items.length === 0 && (
                    <li className="px-5 py-4 text-sm text-muted-foreground">
                      {t(
                        "No learning items in this module yet.",
                        "Chương này chưa có nội dung học.",
                      )}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function LecturerReadOnlyQuizPreview({
  workspaceId,
  assignmentId,
  questions,
}: {
  workspaceId: string;
  assignmentId?: string | null | undefined;
  questions: QuizQuestionData[];
}) {
  const { t } = useLocale();
  const backendQuiz = useCourseQuiz(workspaceId, assignmentId ?? "", Boolean(assignmentId));
  const previewQuestions = backendQuiz.data?.questions ?? questions;

  if (backendQuiz.isPending && assignmentId) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Loading Quiz questions…", "Đang tải câu hỏi Quiz…")}
      </p>
    );
  }
  if (backendQuiz.isError && assignmentId && questions.length === 0) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {t("Quiz questions could not be loaded.", "Không thể tải câu hỏi Quiz.")}
      </p>
    );
  }
  if (previewQuestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("No Quiz questions have been provided.", "Chưa có câu hỏi Quiz.")}
      </p>
    );
  }

  return (
    <ol className="max-w-4xl space-y-4">
      {previewQuestions.map((question, questionIndex) => {
        const record = question as unknown as {
          correctOption?: number;
          correctOptions?: number[];
        };
        const correctOptions = Array.isArray(record.correctOptions)
          ? record.correctOptions
          : typeof record.correctOption === "number" && record.correctOption >= 0
            ? [record.correctOption]
            : [];
        return (
          <li
            key={question.id ?? `preview-question-${questionIndex}`}
            className="rounded-xl border bg-background p-4"
          >
            <p className="font-semibold text-foreground">
              {questionIndex + 1}. {question.prompt}
            </p>
            <ul className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => {
                const isCorrect = correctOptions.includes(optionIndex);
                return (
                  <li
                    key={`${question.id ?? questionIndex}-option-${optionIndex}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      isCorrect
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        : "bg-card text-foreground"
                    }`}
                  >
                    <span className="font-medium">{String.fromCharCode(65 + optionIndex)}.</span>{" "}
                    {option}
                    {isCorrect && (
                      <span className="ml-2 text-xs font-semibold">
                        {t("Correct answer", "Đáp án đúng")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
