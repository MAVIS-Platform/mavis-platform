"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  Target,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle, formatCoursePlainText } from "@/lib/format/course-display";
import {
  readCompletedTheoryIds,
  theoryCompletionStorageKey,
  toggleCompletedTheoryId,
} from "@/lib/coursera-ui-helpers";
import { ApiError } from "@/lib/errors/api-error";
import { useApiQuery, useSession } from "@/hooks/use-api";
import { useCourseAuthoring, useCourseRoadmap, usePublishedCourse } from "@/features/workspaces/course-access";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { CourseEssayItemPanel, type RubricRow } from "./course-essay-panel";
import {
  ChapterQuizRunner,
  parseInlineQuizPassPercent,
  parseInlineQuizQuestions,
} from "./chapter-quiz-runner";
import {
  JAVA_COURSERA_COURSE_TITLE,
  buildCourseraModulesWithLabLinks,
  matchQuizQuestionsForItem,
  type QuizQuestionData,
} from "./java-coursera-curriculum-data";
import { resolveLabTier } from "@/features/assignments/requirements";
import { courseSetupStepHref } from "./course-setup-flow-navigation";
import { resolveStaticAuditStepTitle } from "./module-steps";

export function isMissingCourseError(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

export function stripModulePrefix(title: string): string {
  const cleaned = title.replace(/^(?:module|chương|chapter|phần)\s*\d+\s*[:.\-–—]\s*/i, "").trim();
  return cleaned || title.trim();
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
  THEORY: { en: "Theory", vi: "Bài đọc Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Quiz", vi: "Bài trắc nghiệm (Quiz)", icon: HelpCircle },
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
  return canManage ? (
    <LecturerCourseOutline workspaceId={workspaceId} active={active} />
  ) : (
    <StudentCourseOutline workspaceId={workspaceId} active={active} />
  );
}

function LecturerCourseOutline({
  workspaceId,
  active,
}: {
  workspaceId: string;
  active: boolean;
}) {
  const authoring = useCourseAuthoring(workspaceId, true);
  return (
    <CourseOutlineBody
      workspaceId={workspaceId}
      canManage
      active={active}
      published={authoring.published.data}
      draft={authoring.data}
      isLoadError={authoring.isError && !isMissingCourseError(authoring.error)}
      isLoadingInitial={authoring.isPending}
      onRetry={() => void authoring.refetch()}
    />
  );
}

function StudentCourseOutline({
  workspaceId,
  active,
}: {
  workspaceId: string;
  active: boolean;
}) {
  const publishedQuery = usePublishedCourse(workspaceId);
  return (
    <CourseOutlineBody
      workspaceId={workspaceId}
      canManage={false}
      active={active}
      published={publishedQuery.data}
      draft={undefined}
      isLoadError={publishedQuery.isError && !isMissingCourseError(publishedQuery.error)}
      isLoadingInitial={publishedQuery.isPending}
      onRetry={() => void publishedQuery.refetch()}
    />
  );
}

function CourseOutlineBody({
  workspaceId,
  canManage,
  active,
  published,
  draft,
  isLoadError,
  isLoadingInitial,
  onRetry,
}: {
  workspaceId: string;
  canManage: boolean;
  active: boolean;
  published: ReturnType<typeof usePublishedCourse>["data"];
  draft: ReturnType<typeof useCourseAuthoring>["data"];
  isLoadError: boolean;
  isLoadingInitial: boolean;
  onRetry: () => void;
}) {
  const { t, locale } = useLocale();
  const session = useSession();
  const theoryStorageKey = theoryCompletionStorageKey(session.data?.user?.id, workspaceId);
  const [completedTheoryIds, setCompletedTheoryIds] = useState<string[]>([]);
  useEffect(() => {
    setCompletedTheoryIds(readCompletedTheoryIds(theoryStorageKey));
  }, [theoryStorageKey]);
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((w) => w.id === workspaceId);
  const isJavaCourseraWorkspace = workspace?.code?.toUpperCase() === "JAVA-MS-2026";
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
    title: formatCoursePlainText(mod.title),
    description: mod.description ? formatCoursePlainText(mod.description) : null,
    items: mod.items
      .filter((item) => item.type !== "ESSAY")
      .map((item) => ({
        ...item,
        title: formatCoursePlainText(item.title),
        description: item.description ? formatCoursePlainText(item.description) : null,
      })),
  }));
  const courseTitle = formatCoursePlainText(
    published?.snapshot.title ??
      (draftModules.length > 0 ? draft?.title : undefined) ??
      (isJavaCourseraWorkspace ? JAVA_COURSERA_COURSE_TITLE : workspace?.name),
  );
  const courseDescription = formatCoursePlainText(
    published?.snapshot.description ??
      (draftModules.length > 0 ? draft?.description : undefined) ??
      workspace?.description ??
      "",
  );
  const courseStatus = published
    ? `v${published.version}`
    : isCatalogFallback
      ? t("Coursera Standard V2", "Giáo trình chuẩn V2")
      : draft?.status ?? "";
  const labs = new Map((roadmap.data?.labs ?? []).map((lab) => [lab.assignmentId, lab]));
  const assignmentById = new Map((assignments.data ?? []).map((assignment) => [assignment.id, assignment]));
  const isCsharpCourse =
    workspace?.code?.toUpperCase() === "CSHARP-MS-2026" ||
    /(?:csharp|c#|\.net|dotnet|trái cây)/i.test(courseTitle ?? "");

  if (isLoadError) {
    return (
      <section className="rounded-xl border bg-card p-4" role="alert">
        <p className="text-sm font-medium">{t("Could not load class content.", "Không tải được nội dung lớp.")}</p>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={onRetry}
        >
          {t("Retry", "Thử lại")}
        </Button>
      </section>
    );
  }

  if (published === undefined && draft === undefined && isLoadingInitial) {
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
        href={courseSetupStepHref(workspaceId, "repository", undefined, "setup")}
        aria-label={t("Start course setup", "Bắt đầu thiết lập khóa học")}
        className="group flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center transition hover:border-primary/60 hover:bg-card/70"
      >
        <span className="flex size-20 items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/35 bg-muted/40 text-muted-foreground transition group-hover:scale-[1.04] group-hover:border-primary group-hover:bg-primary/10 group-hover:text-primary">
          <Plus className="size-9 stroke-[1.75] transition-transform group-hover:rotate-90" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-base font-semibold tracking-tight text-foreground">
          {t("Start course setup", "Bắt đầu thiết lập khóa học")}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {t(
            "Click to start setting up your course.",
            "Bấm để bắt đầu thiết lập khóa học.",
          )}
        </p>
      </Link>
    );
  }

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
  const totalLabs = modules.reduce((total, module) => total + module.items.length, 0);
  const totalTheoryOnly = modules.reduce(
    (total, module) =>
      total +
      module.items.filter((i) => {
        const rt = resolveItemType(i);
        return rt === "THEORY" || rt === "STATIC_LAB";
      }).length,
    0,
  );
  const totalQuizLabs = modules.reduce(
    (total, module) =>
      total +
      module.items.filter((i) => {
        const rt = resolveItemType(i);
        return rt === "QUIZ" || rt === "IMPACT_LAB";
      }).length,
    0,
  );
  const totalStudioLabs = modules.reduce(
    (total, module) =>
      total + module.items.filter((i) => resolveItemType(i) === "RUNTIME_LAB").length,
    0,
  );
  const firstStageTitle = stripModulePrefix(modules[0]?.title ?? "");
  const lastStageTitle = stripModulePrefix(modules[modules.length - 1]?.title ?? "");
  const syllabusSummary =
    courseDescription ||
    (modules.length === 1
      ? t(
          `Focused curriculum covering ${firstStageTitle} with structured lessons and hands-on Labs.`,
          `Lộ trình tập trung vào ${firstStageTitle} kết hợp bài học có cấu trúc và thực hành Lab.`,
        )
      : t(
          `Structured ${modules.length}-stage progression from ${firstStageTitle} to ${lastStageTitle}, combining theory, quizzes, and hands-on architecture Labs.`,
          `Lộ trình ${modules.length} chặng từ ${firstStageTitle} đến ${lastStageTitle}, kết hợp lý thuyết, kiểm tra kiến thức và thực hành kiến trúc.`,
        ));

  const breakdownParts = [
    totalTheoryOnly > 0
      ? `${totalTheoryOnly} ${t("theory & static analysis", "lý thuyết & phân tích tĩnh")}`
      : null,
    totalQuizLabs > 0
      ? `${totalQuizLabs} ${t("quiz & dependency analysis", "trắc nghiệm & phân tích phụ thuộc")}`
      : null,
    totalStudioLabs > 0
      ? `${totalStudioLabs} ${t("live Docker Studio labs", "bài thực hành Studio Live")}`
      : null,
  ].filter(Boolean);
  const curriculumOverviewLine =
    modules.length > 1 && firstStageTitle && lastStageTitle
      ? t(
          `Covers ${modules.length} modules and ${totalLabs} learning activities${breakdownParts.length ? ` (${breakdownParts.join(", ")})` : ""}, progressing from ${firstStageTitle} to ${lastStageTitle}.`,
          `Gồm ${modules.length} chương với ${totalLabs} hoạt động học tập${breakdownParts.length ? ` (${breakdownParts.join(", ")})` : ""}, đi từ ${firstStageTitle} đến ${lastStageTitle}.`,
        )
      : t(
          `Covers ${modules.length} module and ${totalLabs} learning activities${breakdownParts.length ? ` (${breakdownParts.join(", ")})` : ""}.`,
          `Gồm ${modules.length} chương với ${totalLabs} hoạt động học tập${breakdownParts.length ? ` (${breakdownParts.join(", ")})` : ""}.`,
        );

  return (
    <section aria-labelledby="course-outline-title" className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-xs">
        <div className="space-y-3 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t("Course Syllabus", "Đề cương học phần")}
                {courseStatus ? ` · ${courseStatus}` : ""}
              </p>
              <h2
                id="course-outline-title"
                className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                {courseTitle || t("Class content", "Nội dung lớp")}
              </h2>
              <p className="max-w-4xl text-[15px] leading-6 text-foreground/90">
                {syllabusSummary}
              </p>
              <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {t("Curriculum overview:", "Tóm tắt nội dung học:")}
                </span>{" "}
                {curriculumOverviewLine}
              </p>
            </div>
            {canManage && (
              <Button asChild size="sm" variant="default" className="shrink-0 font-semibold">
                <Link
                  href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=content-actions`}
                >
                  <Plus className="mr-1.5 size-4" aria-hidden="true" />
                  {t("Add content", "Thêm nội dung")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-border/80 bg-[#F4F8FF] px-5 py-4 dark:bg-primary/5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-foreground">
              <Target className="size-4 text-primary" aria-hidden="true" />
              {t("Learning Outcomes & Progression", "Mục tiêu & Lộ trình kết quả đạt được")}
            </h3>
            <span className="text-sm text-muted-foreground">
              {t("What you'll master step by step", "Kiến thức & kỹ năng đạt được theo từng chặng")}
            </span>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {modules.map((module, index) => {
              const stageTitle = stripModulePrefix(module.title);
              const previewItems = module.items
                .slice(0, 2)
                .map((item) => item.title)
                .filter(Boolean);
              const extraCount = Math.max(0, module.items.length - previewItems.length);
              const outcomeDetail =
                module.description ||
                (previewItems.length > 0
                  ? previewItems.join(" · ") +
                    (extraCount > 0 ? ` (+${extraCount} ${t("more", "nữa")})` : "")
                  : "");
              return (
                <li
                  key={module.id}
                  className="flex items-start gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-2xs"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[15px] font-semibold leading-snug text-foreground">{stageTitle}</p>
                    {outcomeDetail && (
                      <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {outcomeDetail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <ol className="space-y-3">
        {modules.map((module) => (
          <li key={module.id}>
            <details
              open={canManage ? module.position === 1 : true}
              className="group overflow-hidden rounded-2xl border border-border/90 bg-card shadow-xs transition-colors hover:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 px-5 py-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  {module.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-snug text-foreground sm:text-[17px]">
                    {module.title}
                  </span>
                </span>
                <Badge variant="outline" className="font-semibold text-foreground group-open:hidden">
                  {module.items.length}
                </Badge>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              {module.description && (
                <p className="border-t border-border/80 bg-[#F8FAFC] px-5 py-3 text-[15px] leading-6 text-muted-foreground dark:bg-muted/20">
                  {module.description}
                </p>
              )}
              <ul className="divide-y border-t">
                {(() => {
                  let labOrder = 0;
                  return module.items.map((item) => {
                  const effectiveType = resolveItemType(item);
                  const meta = TYPE_META[effectiveType] ?? { en: item.type, vi: item.type, icon: FileText };
                  const Icon = meta.icon;
                  const lab = item.assignmentId ? labs.get(item.assignmentId) : undefined;
                  const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
                  const isLab = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(effectiveType);
                  if (isLab) labOrder += 1;
                  const labNumber = lab?.position ?? labOrder;
                  const status = isLab
                    ? statusForLab(lab?.state, canManage)
                    : item.type === "QUIZ" && item.assignmentId
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
                  const inlineQuizQuestions =
                    item.type === "QUIZ" ? parseInlineQuizQuestions(item.content) : [];
                  const quizQuestions =
                    item.type === "QUIZ"
                      ? (item.quizQuestions && item.quizQuestions.length > 0
                          ? item.quizQuestions
                          : inlineQuizQuestions.length > 0
                            ? inlineQuizQuestions
                          : !item.assignmentId && isJavaCourseraWorkspace && !isCsharpCourse
                            ? matchQuizQuestionsForItem(module.position, item.title)
                            : [])
                      : [];
                  const isTheoryDone = !canManage && item.type === "THEORY" && completedTheoryIds.includes(item.id);
                  const quizSummaryLabel = item.assignmentId
                    ? canManage
                      ? t("View Question Bank", "Xem Bộ Câu Hỏi")
                      : t("Take Quiz", "Làm Trắc Nghiệm")
                    : canManage
                      ? t(
                          `View Question Bank (${quizQuestions.length} ${quizQuestions.length === 1 ? "Q" : "Qs"})`,
                          `Xem Bộ Câu Hỏi (${quizQuestions.length} câu)`,
                        )
                      : t(
                          `Take Quiz (${quizQuestions.length} ${quizQuestions.length === 1 ? "Q" : "Qs"})`,
                          `Làm Trắc Nghiệm (${quizQuestions.length} câu)`,
                        );
                  return (
                    <li key={item.id} className="flex flex-wrap items-start gap-3.5 px-5 py-4">
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isLab && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                              Lab {labNumber}
                            </span>
                          )}
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(meta.en, meta.vi)}
                          </span>
                          {item.estimatedMinutes && (
                            <span className="text-sm text-muted-foreground">
                              · ~{item.estimatedMinutes} {t("min", "phút")}
                            </span>
                          )}
                          {item.required === false && (
                            <Badge variant="outline">{t("Optional", "Không bắt buộc")}</Badge>
                          )}
                          {isTheoryDone && (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="size-3" aria-hidden="true" />
                              {t("Completed", "Đã hoàn thành")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-base font-semibold leading-snug text-foreground">
                          {effectiveType === "STATIC_LAB" || /khám phá sơ đồ tĩnh|explore static diagrams/i.test(item.title)
                            ? resolveStaticAuditStepTitle(item.title, {
                                courseCode: workspace?.code ?? courseTitle,
                                modulePosition: module.position,
                                curriculumCode:
                                  typeof item.content?.["curriculumCode"] === "string"
                                    ? item.content["curriculumCode"]
                                    : undefined,
                                locale,
                                isStaticStep: effectiveType === "STATIC_LAB",
                              })
                            : item.title}
                        </p>
                        {(item.description || (assignment?.title && assignment.title !== item.title)) &&
                          !(
                            item.type === "THEORY" &&
                            typeof item.content?.["body"] === "string" &&
                            item.description &&
                            (item.description === "Theory from the workspace library" ||
                              String(item.content["body"])
                                .replace(/[^\p{L}\p{N}]+/gu, "")
                                .toLowerCase()
                                .includes(
                                  item.description
                                    .replace(/[^\p{L}\p{N}]+/gu, "")
                                    .toLowerCase()
                                    .slice(0, 40),
                                ))
                          ) && (
                          <p className="mt-1 text-sm leading-5 text-muted-foreground">
                            {formatCoursePlainText(item.description || assignment?.title)}
                          </p>
                        )}
                        {item.type === "THEORY" && typeof item.content?.["body"] === "string" && (
                          <details className="mt-2.5 text-sm">
                            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              📖 {t("Read lesson", "Đọc bài học")}
                            </summary>
                            <div className="mt-3 max-w-4xl space-y-4 rounded-xl border bg-background p-4 shadow-xs sm:p-5">
                              <MarkdownPreview markdown={String(item.content["body"])} />
                              {!canManage && (
                                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                                  <span className="text-xs text-muted-foreground">
                                    {isTheoryDone
                                      ? t("You have completed this reading.", "Bạn đã hoàn thành bài đọc lý thuyết này.")
                                      : t("Finished reading? Mark this lesson as completed.", "Đã đọc xong? Đánh dấu hoàn thành bài lý thuyết này.")}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={isTheoryDone ? "outline" : "default"}
                                    aria-pressed={isTheoryDone}
                                    className={
                                      isTheoryDone
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }
                                    onClick={() =>
                                      setCompletedTheoryIds((prev) =>
                                        toggleCompletedTheoryId(theoryStorageKey, prev, item.id),
                                      )
                                    }
                                  >
                                    <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden="true" />
                                    {isTheoryDone
                                      ? t("Completed", "Đã hoàn thành")
                                      : t("Mark as completed", "Đánh dấu đã hoàn thành")}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                        {item.type === "QUIZ" &&
                          (!lockedForStudent || canManage) &&
                          (Boolean(item.assignmentId) || quizQuestions.length > 0) && (
                          <LazyOutlineQuizDetails
                            summaryLabel={quizSummaryLabel}
                            title={item.title}
                            questions={quizQuestions}
                            canManage={canManage}
                            workspaceId={workspaceId}
                            assignmentId={item.assignmentId}
                            courseItemId={item.id}
                            inlinePassPercent={parseInlineQuizPassPercent(item.content)}
                          />
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
                          <Button
                            asChild
                            size="sm"
                            variant={!canManage && isLab ? "default" : "outline"}
                            className={
                              !canManage && isLab
                                ? "font-semibold"
                                : "border-primary/40 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                            }
                          >
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
                  });
                })()}
                {module.items.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">
                    {t("No learning items in this module yet.", "Chương này chưa có nội dung học.")}
                  </li>
                )}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LazyOutlineQuizDetails({
  summaryLabel,
  title,
  questions,
  canManage,
  workspaceId,
  assignmentId,
  courseItemId,
  inlinePassPercent,
}: {
  summaryLabel: string;
  title: string;
  questions: QuizQuestionData[];
  canManage: boolean;
  workspaceId: string;
  assignmentId?: string | null | undefined;
  courseItemId?: string | null | undefined;
  inlinePassPercent?: number | undefined;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="mt-2 text-sm"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-sky-950/50 dark:text-sky-300">
        ❓ {summaryLabel}
      </summary>
      {opened && (
        <ChapterQuizRunner
          title={title}
          questions={questions}
          canManage={canManage}
          workspaceId={workspaceId}
          assignmentId={assignmentId}
          courseItemId={courseItemId}
          inlinePassPercent={inlinePassPercent}
        />
      )}
    </details>
  );
}
