"use client";

import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  FileText,
  GitFork,
  HelpCircle,
  Lock,
  Play,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle } from "@/lib/format/course-display";
import { ApiError } from "@/lib/errors/api-error";
import { useApiQuery } from "@/hooks/use-api";
import { useCourseAuthoring, useCourseRoadmap, usePublishedCourse } from "@/features/workspaces/course-access";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { InteractiveConceptStage } from "@/components/shared/interactive-concept-stage";
import { CourseEssayItemPanel, type RubricRow } from "./course-essay-panel";
import { ChapterQuizRunner } from "./chapter-quiz-runner";
import { getScenarioForLessonOrLab } from "./designed-to-scale-scenarios";
import {
  JAVA_COURSERA_COURSE_TITLE,
  buildCourseraModulesWithLabLinks,
  matchQuizQuestionsForItem,
  type QuizQuestionData,
} from "./java-coursera-curriculum-data";
import { resolveLabTier } from "@/features/assignments/requirements";

export function isMissingCourseError(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

type ItemType = "THEORY" | "QUIZ" | "ESSAY" | "STATIC_LAB" | "IMPACT_LAB" | "RUNTIME_LAB";

type OutlineItem = {
  id: string;
  type: ItemType | string;
  title: string;
  description?: string | null;
  position: number;
  assignmentId?: string | null;
  content?: Record<string, unknown>;
  required?: boolean;
  estimatedMinutes?: number;
  quizQuestions?: QuizQuestionData[];
};

type OutlineModule = {
  id: string;
  title: string;
  description?: string | null;
  position: number;
  prerequisiteModuleId?: string | null;
  items: OutlineItem[];
};

const TYPE_META: Record<string, { en: string; vi: string; icon: LucideIcon }> = {
  THEORY: { en: "Theory Lab", vi: "Lab chỉ Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Theory + Quiz Lab", vi: "Lab Lý thuyết + Quiz", icon: HelpCircle },
  ESSAY: { en: "Essay", vi: "Tự luận", icon: FileText },
  STATIC_LAB: { en: "Theory Lab", vi: "Lab chỉ Lý thuyết", icon: Code2 },
  IMPACT_LAB: { en: "Theory + Quiz Lab", vi: "Lab Lý thuyết + Quiz", icon: GitFork },
  RUNTIME_LAB: { en: "Theory + Quiz + Studio Lab", vi: "Lab Lý thuyết + Quiz + Studio", icon: Play },
};

function stepForType(type: string) {
  if (type === "QUIZ" || type === "THEORY" || type === "ESSAY" || type === "IMPACT_LAB") return 2;
  if (type === "RUNTIME_LAB") return 3;
  return 1;
}

function statusForLab(state: string | undefined, canManage: boolean) {
  if (state === "PASSED") return { label: { en: "Passed", vi: "Đã đạt" }, variant: "success" as const, icon: CheckCircle2 };
  if (state === "UNLOCKED") return { label: { en: "Available", vi: "Đã mở" }, variant: "default" as const, icon: Circle };
  if (state === "LOCKED") return { label: { en: "Locked", vi: "Đang khóa" }, variant: "outline" as const, icon: Lock };
  return canManage
    ? { label: { en: "Draft", vi: "Bản nháp" }, variant: "secondary" as const, icon: Circle }
    : { label: { en: "Not published", vi: "Chưa công bố" }, variant: "secondary" as const, icon: Circle };
}

export function CourseOutline({
  workspaceId,
  canManage,
  active,
}: {
  workspaceId: string;
  canManage: boolean;
  active: boolean;
}) {
  const { t } = useLocale();
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((w) => w.id === workspaceId);
  const isJavaCourseraWorkspace = workspace?.code?.toUpperCase() === "JAVA-MS-2026";
  const authoring = useCourseAuthoring(workspaceId, canManage);
  const publishedQuery = usePublishedCourse(workspaceId);
  const published = publishedQuery.data;
  const draft = authoring.data;
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);

  const publishedModules = (published?.snapshot.modules as OutlineModule[] | undefined) ?? [];
  const draftModules = (draft?.modules as OutlineModule[] | undefined) ?? [];
  const rawModules = publishedModules.length > 0 ? publishedModules : draftModules;
  const legacyLabs = roadmap.data?.labs ?? [];
  const useLegacyOnly = !canManage && rawModules.length === 0 && legacyLabs.length > 0 && !isJavaCourseraWorkspace;
  const isCatalogFallback = isJavaCourseraWorkspace && !useLegacyOnly && rawModules.length === 0;
  const baseModules: OutlineModule[] = isCatalogFallback
    ? (buildCourseraModulesWithLabLinks(assignments.data ?? [], legacyLabs) as OutlineModule[])
    : rawModules;
  const modules: OutlineModule[] = baseModules.map((mod) => ({
    ...mod,
    items: mod.items.filter((item) => item.type !== "ESSAY"),
  }));
  const courseTitle =
    published?.snapshot.title ??
    (draftModules.length > 0 ? draft?.title : undefined) ??
    (isJavaCourseraWorkspace ? JAVA_COURSERA_COURSE_TITLE : workspace?.name);
  const courseStatus = published
    ? `v${published.version}`
    : isCatalogFallback
      ? t("Coursera Standard V2", "Giáo trình chuẩn V2")
      : draft?.status ?? "";
  const labs = new Map((roadmap.data?.labs ?? []).map((lab) => [lab.assignmentId, lab]));
  const assignmentById = new Map((assignments.data ?? []).map((assignment) => [assignment.id, assignment]));

  const loadError =
    (canManage && authoring.isError && !isMissingCourseError(authoring.error)) ||
    (!canManage && publishedQuery.isError && !isMissingCourseError(publishedQuery.error));
  if (loadError) {
    return (
      <section className="rounded-xl border bg-card p-4" role="alert">
        <p className="text-sm font-medium">{t("Could not load class content.", "Không tải được nội dung lớp.")}</p>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() => void (canManage ? authoring.refetch() : publishedQuery.refetch())}
        >
          {t("Retry", "Thử lại")}
        </Button>
      </section>
    );
  }

  if (published === undefined && draft === undefined && (canManage ? authoring.isPending : publishedQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">{t("Loading class content…", "Đang tải nội dung lớp…")}</p>;
  }

  if (useLegacyOnly && legacyLabs.length > 0) {
    return (
      <section aria-labelledby="legacy-course-content" className="space-y-3">
        <div>
          <h2 id="legacy-course-content" className="font-semibold">{t("Class content", "Nội dung lớp")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("This class uses its published Lab roadmap.", "Lớp này sử dụng lộ trình Lab đã công bố.")}
          </p>
        </div>
        <ol className="divide-y rounded-lg border bg-card">
          {legacyLabs.map((lab) => (
            <li key={lab.assignmentId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{formatCourseLabTitle(lab.title, lab.position, lab.assignmentId)}</p>
                <p className="text-sm text-muted-foreground">
                  {lab.state === "PASSED" ? t("Lab passed", "Đã đạt Lab")
                    : lab.state === "UNLOCKED" ? t("Ready to continue", "Có thể tiếp tục học")
                      : lab.reason === "COURSE_ARCHIVED" ? t("Class archived", "Lớp đã lưu trữ")
                        : t("Complete the preceding Lab to unlock this one.", "Hoàn thành Lab trước để mở khóa bài này.")}
                </p>
              </div>
              {lab.state !== "LOCKED" && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.assignmentId)}&step=1`}>
                    {lab.state === "PASSED" ? t("Review Lab", "Xem lại Lab") : t("Continue learning", "Tiếp tục học")}
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (modules.length === 0) {
    if (!canManage) return null;
    return (
      <Link
        href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}
        aria-label={t("Setup Curriculum", "Thiết lập Curriculum")}
        className="group flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center transition hover:border-primary/60 hover:bg-card/70"
      >
        <span className="flex size-20 items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/35 bg-muted/40 text-muted-foreground transition group-hover:scale-[1.04] group-hover:border-primary group-hover:bg-primary/10 group-hover:text-primary">
          <Plus className="size-9 stroke-[1.75] transition-transform group-hover:rotate-90" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-base font-semibold tracking-tight text-foreground">
          {t("No curriculum chapters yet.", "Chưa có chương học tập nào.")}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {t(
            "Click to create your first module in Curriculum & Materials.",
            "Bấm để tạo chương đầu tiên trong Đề cương & Học liệu.",
          )}
        </p>
      </Link>
    );
  }

  return (
    <section aria-labelledby="course-outline-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xs">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {t("Course Syllabus", "Đề cương học phần")}
            </Badge>
            {courseStatus && <Badge variant="secondary">{courseStatus}</Badge>}
          </div>
          <h2 id="course-outline-title" className="text-base font-semibold tracking-tight sm:text-lg">
            {courseTitle || t("Class content", "Nội dung lớp")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {modules.length} {t("chapters", "chương")} ·{" "}
            {modules.reduce((total, module) => total + module.items.length, 0)}{" "}
            {t("Labs in curriculum", "bài Lab trong lộ trình")}
          </p>
        </div>
        {canManage && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}>
              {t("Setup Labs in Curriculum", "Cấu hình Lab trong Curriculum")}
            </Link>
          </Button>
        )}
      </div>

      <ol className="space-y-3">
        {modules.map((module) => {
          const resolveItemType = (item: OutlineItem) => {
            const linked = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
            if (linked && ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type)) {
              const tier = resolveLabTier(linked);
              return tier === "THEORY_QUIZ_STUDIO"
                ? "RUNTIME_LAB"
                : tier === "THEORY_ONLY"
                  ? "STATIC_LAB"
                  : "IMPACT_LAB";
            }
            return item.type;
          };
          const theoryOnlyCount = module.items.filter((i) => {
            const rt = resolveItemType(i);
            return rt === "THEORY" || rt === "STATIC_LAB";
          }).length;
          const quizLabCount = module.items.filter((i) => {
            const rt = resolveItemType(i);
            return rt === "QUIZ" || rt === "IMPACT_LAB";
          }).length;
          const studioLabCount = module.items.filter(
            (i) => resolveItemType(i) === "RUNTIME_LAB",
          ).length;
          const breakdown = [
            theoryOnlyCount > 0
              ? `${theoryOnlyCount} ${t("Theory Only", "Lab chỉ Lý thuyết")}`
              : null,
            quizLabCount > 0
              ? `${quizLabCount} ${t("Theory + Quiz", "Lab Lý thuyết + Quiz")}`
              : null,
            studioLabCount > 0
              ? `${studioLabCount} ${t("Full Studio", "Lab có cả Studio")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
          <li key={module.id}>
            <details
              open={canManage ? module.position === 1 : true}
              className="group overflow-hidden rounded-2xl border bg-card shadow-xs transition-colors hover:border-teal-300/80"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-600/10 text-sm font-bold text-teal-700 dark:text-teal-300">
                  {module.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{module.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {module.items.length} {t("Labs", "bài Lab")}
                    {breakdown ? ` · ${breakdown}` : ""}
                    {module.prerequisiteModuleId
                      ? ` · ${t("Prerequisite", "Tiên quyết")}: ${
                          modules.find((candidate) => candidate.id === module.prerequisiteModuleId)?.title
                          ?? t("previous module", "chương trước")
                        }`
                      : ""}
                  </span>
                </span>
                <Badge variant="outline" className="group-open:hidden">
                  {module.items.length}
                </Badge>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              {module.description && (
                <p className="border-t bg-muted/20 px-5 py-2.5 text-sm text-muted-foreground">{module.description}</p>
              )}
              <ul className="divide-y border-t">
                {module.items.map((item, idx) => {
                  const effectiveType = resolveItemType(item);
                  const meta = TYPE_META[effectiveType] ?? { en: item.type, vi: item.type, icon: FileText };
                  const Icon = meta.icon;
                  const lab = item.assignmentId ? labs.get(item.assignmentId) : undefined;
                  const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
                  const isLab = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(effectiveType);
                  const status = isLab
                    ? statusForLab(lab?.state, canManage)
                    : item.type === "QUIZ"
                      ? statusForLab(lab?.state, canManage)
                      : null;
                  const StatusIcon = status?.icon;
                  const lockedForStudent = lab?.state === "LOCKED";
                  const href = item.assignmentId && active && (!lockedForStudent || canManage)
                    ? canManage
                      ? `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(item.assignmentId)}`
                      : `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(item.assignmentId)}&step=${stepForType(item.type)}`
                    : canManage
                      ? `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`
                      : null;
                  const quizQuestions =
                    item.type === "QUIZ"
                      ? (item.quizQuestions && item.quizQuestions.length > 0
                          ? item.quizQuestions
                          : matchQuizQuestionsForItem(module.position, item.title))
                      : [];
                  return (
                    <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted/60 text-muted-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-teal-700 dark:text-teal-300">
                            Lab {idx + 1}
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(meta.en, meta.vi)}
                          </span>
                          {item.estimatedMinutes && (
                            <span className="text-[11px] text-muted-foreground">
                              · ~{item.estimatedMinutes} {t("min", "phút")}
                            </span>
                          )}
                          {item.required === false && (
                            <Badge variant="outline">{t("Optional", "Không bắt buộc")}</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {(item.description || (assignment?.title && assignment.title !== item.title)) && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.description || assignment?.title}
                          </p>
                        )}
                        {item.type === "THEORY" && typeof item.content?.["body"] === "string" && (
                          <details className="mt-2 text-sm">
                            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-teal-950/50 dark:text-teal-300">
                              📖 {t("Read lesson", "Đọc bài học")}
                            </summary>
                            <div className="mt-3 max-w-4xl space-y-4 rounded-xl border bg-background p-4 shadow-xs sm:p-5">
                              <InteractiveConceptStage
                                scenario={getScenarioForLessonOrLab(
                                  module.position,
                                  typeof item.content?.["curriculumCode"] === "string"
                                    ? String(item.content["curriculumCode"])
                                    : item.title,
                                )}
                              />
                              <MarkdownPreview markdown={String(item.content["body"])} />
                            </div>
                          </details>
                        )}
                        {item.type === "QUIZ" && quizQuestions.length > 0 && (
                          <details className="mt-2 text-sm">
                            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-sky-950/50 dark:text-sky-300">
                              ❓ {canManage
                                ? t(`View Question Bank (${quizQuestions.length} Qs)`, `Xem Bộ Câu Hỏi (${quizQuestions.length} câu)`)
                                : t(`Take Quiz (${quizQuestions.length} Qs)`, `Làm Trắc Nghiệm (${quizQuestions.length} câu)`)}
                            </summary>
                            <ChapterQuizRunner
                              title={item.title}
                              questions={quizQuestions}
                              canManage={canManage}
                              workspaceId={workspaceId}
                              assignmentId={item.assignmentId}
                            />
                          </details>
                        )}
                        {item.type === "ESSAY" && typeof item.content?.["prompt"] === "string" && (
                          <details className="mt-2 text-sm">
                            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-950/50 dark:text-amber-300">
                              ✍️{" "}
                              {canManage
                                ? t("Review & Grade Chapter Essay", "Xem đề Tự luận & Chấm bài chương")
                                : t("Open Case Study Essay & Rubric", "Mở Đề Tự Luận, Rubric & Nộp bài")}
                            </summary>
                            <CourseEssayItemPanel
                              workspaceId={workspaceId}
                              itemId={item.id}
                              promptMarkdown={String(item.content["prompt"])}
                              rubric={
                                Array.isArray(item.content["rubric"])
                                  ? (item.content["rubric"] as RubricRow[])
                                  : undefined
                              }
                              canManage={canManage}
                              active={active}
                            />
                          </details>
                        )}
                        {lockedForStudent && (
                          <p className="mt-1 text-xs text-warning">
                            {lab?.reason === "COURSE_ARCHIVED"
                              ? t("This class is archived; learning access is unavailable.", "Lớp đã lưu trữ nên không thể tiếp tục học.")
                              : t("Pass the preceding Labs to unlock this activity.", "Đạt các Lab trước để mở hoạt động này.")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {status && StatusIcon && (
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="size-3" aria-hidden="true" />
                            {t(status.label.en, status.label.vi)}
                          </Badge>
                        )}
                        {href && (
                          <Button asChild size="sm" variant={isLab ? "outline" : "ghost"}>
                            <Link href={href}>
                              {canManage
                                ? t("Manage", "Quản lý")
                                : lockedForStudent
                                  ? t("Locked", "Đang khóa")
                                  : isLab
                                    ? t("Open Lab", "Mở Lab")
                                    : t("Open", "Mở")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {module.items.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">
                    {t("No learning items in this module yet.", "Chương này chưa có nội dung học.")}
                  </li>
                )}
              </ul>
            </details>
          </li>
          );
        })}
      </ol>
    </section>
  );
}
