"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Lock,
  Play,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { RequestState } from "@/components/shared/request-state";
import { useApi, useApiQuery, useSession } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle, formatCoursePlainText, formatTenScaleScore } from "@/lib/format/course-display";
import {
  computeCourseProgressSummary,
  readCompletedTheoryIds,
  theoryCompletionStorageKey,
  toggleCompletedTheoryId,
} from "@/lib/coursera-ui-helpers";
import { useCourseRoadmap, usePublishedCourse } from "@/features/workspaces/course-access";
import { ChapterQuizRunner, parseInlineQuizQuestions } from "./chapter-quiz-runner";
import { CourseEssayItemPanel, type RubricRow } from "./course-essay-panel";
import {
  buildCourseraModulesWithLabLinks,
  matchQuizQuestionsForItem,
  type OutlineItemData,
  type OutlineModuleData,
} from "./java-coursera-curriculum-data";
import { CurriculumLibrary } from "./curriculum";
import type { Response } from "@/lib/api/contracts";

function itemBadgeMeta(type: string, t: (en: string, vi: string) => string) {
  switch (type) {
    case "THEORY":
      return {
        label: t("Theory", "Lý thuyết"),
        emoji: "📖",
        pillClass:
          "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      };
    case "QUIZ":
      return {
        label: t("Quiz", "Kiểm tra kiến thức"),
        emoji: "❓",
        pillClass:
          "bg-sky-50 text-sky-800 border-sky-200 dark:bg-teal-950/40 dark:text-sky-300 dark:border-sky-800",
      };
    default:
      return {
        label: t("MAVIS Studio Lab", "Lab MAVIS Studio"),
        emoji: "🔬",
        pillClass:
          "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
  }
}

export function StudentCourseSyllabus({
  workspace,
}: {
  workspace: Response<"workspaces">[number];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useApi();
  const session = useSession();
  const workspaceId = workspace.id;
  const theoryStorageKey = theoryCompletionStorageKey(session.data?.user?.id, workspaceId);
  const [completedTheoryIds, setCompletedTheoryIds] = useState<string[]>([]);
  useEffect(() => {
    setCompletedTheoryIds(readCompletedTheoryIds(theoryStorageKey));
  }, [theoryStorageKey]);
  const isTheoryCompleted = (itemId: string) => completedTheoryIds.includes(itemId);
  const toggleTheoryCompleted = (itemId: string) =>
    setCompletedTheoryIds((prev) => toggleCompletedTheoryId(theoryStorageKey, prev, itemId));
  const roadmap = useCourseRoadmap(workspaceId);
  const publishedCourse = usePublishedCourse(workspaceId);
  const assignmentsQuery = useApiQuery("assignments", { workspaceId });
  const submissionsQuery = useApiQuery("submissions", { workspaceId });
  const [activeTab, setActiveTab] = useState<"player" | "submissions" | "library">("player");

  const rawLabs = roadmap.data?.labs ?? [];
  const passedSubmissionAssignmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sub of submissionsQuery.data ?? []) {
      const passedByScore =
        sub.reviewStatus === "GRADED" &&
        typeof sub.reviewScore === "number" &&
        sub.reviewScore > 50;
      if (sub.labOutcome === "PASSED" || passedByScore) {
        ids.add(sub.assignmentId);
      }
    }
    return ids;
  }, [submissionsQuery.data]);
  const labs = useMemo(
    () =>
      rawLabs.map((item) =>
        item.state !== "PASSED" && passedSubmissionAssignmentIds.has(item.assignmentId)
          ? { ...item, state: "PASSED" as const, reason: null }
          : item,
      ),
    [rawLabs, passedSubmissionAssignmentIds],
  );
  const summary = computeCourseProgressSummary(labs);
  const defaultLabId = summary.nextActiveLab?.assignmentId ?? labs[0]?.assignmentId ?? "";
  const [selectedLabId, setSelectedLabId] = useState<string>("");
  const currentLabId =
    selectedLabId && labs.some((l) => l.assignmentId === selectedLabId)
      ? selectedLabId
      : defaultLabId;
  const selectedLab = labs.find((l) => l.assignmentId === currentLabId) ?? labs[0] ?? null;
  const selectedAssignment = (assignmentsQuery.data ?? []).find(
    (a) => a.id === selectedLab?.assignmentId,
  );
  const classAssignmentIds = new Set((assignmentsQuery.data ?? []).map((a) => a.id));
  const classSubmissions = (submissionsQuery.data ?? []).filter(
    (sub) =>
      sub.workspaceId === workspaceId ||
      (!sub.workspaceId && classAssignmentIds.has(sub.assignmentId)),
  );

  const isJavaCourseraWorkspace = workspace.code?.toUpperCase() === "JAVA-MS-2026";
  const syllabusModules: OutlineModuleData[] = useMemo(() => {
    const rawModules = publishedCourse.data?.snapshot?.modules;
    if (Array.isArray(rawModules) && rawModules.length > 0) {
      return rawModules.map((mod) => {
        const mappedItems: OutlineItemData[] = (mod.items ?? [])
          .filter((item) => item.type !== "ESSAY")
          .map((item) => ({
            id: item.id,
            type: item.type as OutlineItemData["type"],
            title: formatCoursePlainText(item.title),
            description: item.description ? formatCoursePlainText(item.description) : null,
            position: item.position,
            assignmentId: item.assignmentId ?? null,
            required: item.required,
            content: item.content,
            ...(typeof item.content?.["estimatedMinutes"] === "number" &&
            item.content["estimatedMinutes"] > 0
              ? { estimatedMinutes: item.content["estimatedMinutes"] }
              : {}),
            ...(typeof item.content?.["curriculumCode"] === "string"
              ? { curriculumCode: String(item.content["curriculumCode"]) }
              : {}),
            quizQuestions: (() => {
              if (item.type !== "QUIZ") return undefined;
              const inline = parseInlineQuizQuestions(item.content);
              if (inline.length > 0) return inline;
              return isJavaCourseraWorkspace && !item.assignmentId
                ? matchQuizQuestionsForItem(mod.position, item.title)
                : undefined;
            })(),
          }));
        const hasQuizItem = mappedItems.some((item) => item.type === "QUIZ");
        const labItem = mappedItems.find(
          (item) =>
            item.assignmentId &&
            ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type),
        );
        const linkedAssignment = labItem?.assignmentId
          ? assignmentsQuery.data?.find((a) => a.id === labItem.assignmentId)
          : undefined;
        const aiPolicy =
          linkedAssignment?.aiPolicy && typeof linkedAssignment.aiPolicy === "object"
            ? (linkedAssignment.aiPolicy as Record<string, unknown>)
            : null;
        const skipsQuiz =
          linkedAssignment?.labMode === "THEORY_ONLY" ||
          aiPolicy?.["skipQuiz"] === true ||
          aiPolicy?.["labTier"] === "THEORY_ONLY";
        if (!hasQuizItem && labItem?.assignmentId && !skipsQuiz) {
          const insertAt = mappedItems.indexOf(labItem);
          mappedItems.splice(Math.max(0, insertAt), 0, {
            id: `lab-quiz:${labItem.assignmentId}`,
            type: "QUIZ",
            title: `Quiz · ${linkedAssignment?.title ?? labItem.title}`,
            description: null,
            position: labItem.position,
            assignmentId: labItem.assignmentId,
            required: true,
            quizQuestions: [],
          });
        }
        return {
          id: mod.id,
          title: formatCoursePlainText(mod.title),
          description: mod.description ? formatCoursePlainText(mod.description) : null,
          position: mod.position,
          prerequisiteModuleId: mod.prerequisiteModuleId ?? null,
          labTitle: formatCoursePlainText(labItem?.title ?? mod.title),
          items: mappedItems,
        };
      });
    }
    if (publishedCourse.isPending) {
      return [];
    }
    if (!isJavaCourseraWorkspace) {
      return [];
    }
    return buildCourseraModulesWithLabLinks(assignmentsQuery.data ?? [], labs).map((mod) => ({
      ...mod,
      items: mod.items.filter((item) => item.type !== "ESSAY"),
    }));
  }, [publishedCourse.data?.snapshot?.modules, publishedCourse.isPending, isJavaCourseraWorkspace, assignmentsQuery.data, labs]);

  const flattenedItems = useMemo(
    () => syllabusModules.flatMap((mod) => mod.items.map((item) => ({ module: mod, item }))),
    [syllabusModules],
  );
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [practicePanel, setPracticePanel] = useState<"none" | "quiz" | "essay">("none");
  const isLearningWorkspace = selectedItemId !== "";
  const learningContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requestedItemId = searchParams.get("item");
    if (!requestedItemId) return;
    const entry = flattenedItems.find((candidate) => candidate.item.id === requestedItemId);
    if (!entry) return;
    setSelectedItemId(entry.item.id);
    setSelectedModuleId(entry.module.id);
    setPracticePanel("none");
    if (entry.item.assignmentId) setSelectedLabId(entry.item.assignmentId);
  }, [flattenedItems, searchParams]);

  useEffect(() => {
    if (isLearningWorkspace) {
      learningContentRef.current?.scrollTo({ top: 0 });
    }
  }, [isLearningWorkspace, selectedItemId]);

  const activeEntry =
    flattenedItems.find((entry) => entry.item.id === selectedItemId) ?? flattenedItems[0] ?? null;
  const activeModule = activeEntry?.module ?? null;
  const activeItem = activeEntry?.item ?? null;
  const activeModuleItemIndex =
    activeModule?.items.findIndex((item) => item.id === activeItem?.id) ?? -1;
  const prevItem =
    activeModule && activeModuleItemIndex > 0
      ? activeModule.items[activeModuleItemIndex - 1]
      : undefined;
  const prevEntry = activeModule && prevItem ? { module: activeModule, item: prevItem } : null;
  const nextItem =
    activeModule &&
    activeModuleItemIndex >= 0 &&
    activeModuleItemIndex < activeModule.items.length - 1
      ? activeModule.items[activeModuleItemIndex + 1]
      : undefined;
  const nextEntry = activeModule && nextItem ? { module: activeModule, item: nextItem } : null;
  const courseContentModule =
    syllabusModules.find((module) => module.id === selectedModuleId) ?? activeModule;
  const chapterQuizItem = activeModule?.items.find((i) => i.type === "QUIZ") ?? null;
  const chapterEssayItem = activeModule?.items.find((i) => i.type === "ESSAY") ?? null;
  const chapterLabItem =
    activeModule?.items.find((i) => ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(i.type)) ??
    null;
  const chapterAssignmentId =
    activeItem?.assignmentId ??
    chapterLabItem?.assignmentId ??
    chapterQuizItem?.assignmentId ??
    selectedLab?.assignmentId ??
    null;
  const activeLabRecord =
    (chapterAssignmentId ? labs.find((l) => l.assignmentId === chapterAssignmentId) : undefined) ??
    selectedLab;
  const isItemLockedLab = (item: OutlineItemData) =>
    Boolean(
      item.assignmentId &&
        ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type) &&
        labs.find((l) => l.assignmentId === item.assignmentId)?.state === "LOCKED",
    );
  const isItemLocked = (item: OutlineItemData) => {
    if (item.type === "THEORY") return false;
    if (isItemLockedLab(item)) return true;
    if (item.assignmentId && labs.find((l) => l.assignmentId === item.assignmentId)?.state === "LOCKED") {
      return true;
    }
    const owner = syllabusModules.find((mod) => mod.items.some((candidate) => candidate.id === item.id));
    if (owner) {
      const ownerLabItem = owner.items.find(
        (candidate) =>
          candidate.assignmentId &&
          ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(candidate.type),
      );
      if (
        ownerLabItem?.assignmentId &&
        labs.find((l) => l.assignmentId === ownerLabItem.assignmentId)?.state === "LOCKED"
      ) {
        return true;
      }
    }
    return false;
  };
  const selectCurriculumItem = (item: OutlineItemData) => {
    if (isItemLocked(item)) {
      return;
    }
    if (item.assignmentId && ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type)) {
      router.push(
        `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(item.assignmentId)}&step=1`,
      );
      return;
    }
    setSelectedItemId(item.id);
    const owningModule = syllabusModules.find((module) =>
      module.items.some((candidate) => candidate.id === item.id),
    );
    if (owningModule) {
      setSelectedModuleId(owningModule.id);
    }
    setPracticePanel("none");
    if (item.assignmentId) {
      setSelectedLabId(item.assignmentId);
    }
  };

  const lecturerNames = Array.from(
    new Set(
      [
        workspace.createdByName?.trim(),
        ...(workspace.members ?? [])
          .filter((member) => member.role.toUpperCase() === "LECTURER")
          .map((member) => member.name?.trim()),
      ].filter(
        (name): name is string =>
          typeof name === "string" &&
          name.length > 0 &&
          !/^(lecture|lecturer|giảng viên)$/i.test(name),
      ),
    ),
  );

  const resumeLabHref = summary.nextActiveLab
    ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(summary.nextActiveLab.assignmentId)}&step=1`
    : labs[0]
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labs[0].assignmentId)}&step=1`
      : null;

  return (
    <div
      className={`grid gap-6 ${
        isLearningWorkspace
          ? "lg:h-[calc(100dvh_-_var(--header-height)_-_1.5rem)] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-stretch lg:overflow-hidden"
          : "lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start"
      }`}
    >
      <aside
        className={`rounded-2xl border bg-card p-4 shadow-sm ${
          isLearningWorkspace
            ? "flex min-h-0 flex-col gap-5 overflow-hidden"
            : "space-y-5 lg:sticky lg:top-6"
        }`}
      >
        {isLearningWorkspace ? (
          <>
            <div className="border-b pb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t("Learning workspace", "Không gian học tập")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `Module ${activeModule?.position ?? ""}`,
                  `Module ${activeModule?.position ?? ""}`,
                )}
              </p>
              <h2 className="mt-1 line-clamp-2 text-base font-semibold">{activeModule?.title}</h2>
            </div>

            <nav
              aria-label={t("Learning content", "Nội dung học tập")}
              className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1"
            >
              {activeModule?.items.map((item) => {
                const selected = item.id === activeItem?.id;
                const locked = isItemLocked(item);
                const theoryDone = item.type === "THEORY" && isTheoryCompleted(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={locked}
                    aria-disabled={locked || undefined}
                    onClick={() => selectCurriculumItem(item)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      locked
                        ? "cursor-not-allowed text-muted-foreground/60 opacity-75"
                        : selected
                          ? "bg-emerald-100 font-semibold text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-1.5">
                      <span className="line-clamp-2 min-w-0 flex-1">{item.title}</span>
                      {theoryDone && (
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-label={t("Completed", "Đã hoàn thành")}
                        />
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] font-normal opacity-80">
                      <span>{itemBadgeMeta(item.type, t).label}</span>
                      {locked && (
                        <>
                          <Lock className="h-2.5 w-2.5 text-amber-600" aria-hidden="true" />
                          <span>{t("Locked", "Đang khóa")}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>

            <Button
              type="button"
              variant="outline"
              className="w-full shrink-0"
              onClick={() => {
                setSelectedItemId("");
                setPracticePanel("none");
              }}
            >
              {t("Back to Course Content", "Quay lại nội dung khóa học")}
            </Button>
          </>
        ) : (
          <>
            <div className="border-b pb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t("Course navigation", "Điều hướng khóa học")}
              </p>
              <h2 className="mt-1 text-base font-semibold">{workspace.name}</h2>
            </div>

            <nav aria-label={t("Course material", "Nội dung khóa học")}>
              <p className="mb-2 text-sm font-semibold">
                {t("Course Material", "Nội dung khóa học")}
              </p>
              {syllabusModules.length > 0 ? (
                <div className="space-y-1">
                  {syllabusModules.map((mod) => {
                    const isActive = mod.id === courseContentModule?.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        disabled={mod.items.length === 0}
                        onClick={() => {
                          setSelectedModuleId(mod.id);
                          setSelectedItemId("");
                          setPracticePanel("none");
                          setActiveTab("player");
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="block">
                          {t(`Module ${mod.position}`, `Module ${mod.position}`)}
                        </span>
                        <span className="mt-0.5 block line-clamp-1 text-xs font-normal text-muted-foreground">
                          {mod.title.replace(/^(?:Module|Chương)\s+\d+\s*[:–—-]\s*/i, "").trim() || mod.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  {publishedCourse.isPending
                    ? t("Loading curriculum…", "Đang tải nội dung khóa học…")
                    : t(
                        "No modules have been published for this class yet.",
                        "Giảng viên chưa công bố chương học tập nào cho lớp này.",
                      )}
                </p>
              )}
            </nav>

            <nav className="border-t pt-4" aria-label={t("Other navigation", "Điều hướng khác")}>
              <p className="mb-2 text-sm font-semibold">
                {t("Other Navigation", "Điều hướng khác")}
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("submissions")}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t("Grades", "Điểm số")}
                </button>
                {client.mode === "backend" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("library")}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t("Resources", "Tài nguyên")}
                  </button>
                )}
              </div>
            </nav>
          </>
        )}
      </aside>

      <div
        className={
          isLearningWorkspace
            ? "flex min-h-0 min-w-0 flex-col overflow-hidden"
            : "min-w-0 space-y-6"
        }
      >
        {!isLearningWorkspace && (
          <section className="mavis-hero-surface p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-white/25 bg-white/15 font-mono text-xs text-white"
                  >
                    {workspace.code || t("CLASS", "LỚP")}
                  </Badge>
                  <span className="tabular-nums text-xs font-medium text-sky-100">
                    {summary.totalLabs > 0
                      ? `${summary.completedLabs}/${summary.totalLabs} ${t("completed", "bài đã xong")} (${summary.completionPercent}%)`
                      : t("Course Workspace", "Lớp học MAVIS")}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {workspace.name}
                </h1>
                <p className="text-sm leading-6 text-sky-100/90">
                  {t(
                    "Each Module combines repository knowledge, theory, and a Quiz before you enter MAVIS Studio for analysis, runtime experiments, and evidence submission.",
                    "Mỗi Module kết hợp kiến thức repository, lý thuyết và Quiz trước khi bạn vào MAVIS Studio để phân tích, thực nghiệm runtime và nộp minh chứng.",
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-sky-100">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1">
                    <span className="shrink-0 whitespace-nowrap text-sky-100/85">
                      {t("Instructor", "Giảng viên")}:
                    </span>
                    <strong className="min-w-0 truncate font-semibold text-white">
                      {lecturerNames.length
                        ? lecturerNames.join(" · ")
                        : t("Assigned Lecturer", "Giảng viên phụ trách lớp")}
                    </strong>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {resumeLabHref && (
                  <Button asChild className="bg-white text-slate-950 shadow-sm hover:bg-sky-50">
                    <Link href={resumeLabHref}>
                      <Play
                        className="mr-1.5 h-4 w-4 fill-current text-blue-700"
                        aria-hidden="true"
                      />
                      {t("Resume Current Lesson", "Học Tiếp Bài Hiện Tại")}
                    </Link>
                  </Button>
                )}
                <Button
                  asChild
                  variant="outline"
                  className="border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
                >
                  <Link href="/courses">← {t("Back to courses", "Quay lại khóa học")}</Link>
                </Button>
              </div>
            </div>

            {summary.totalLabs > 0 && (
              <div className="mt-5 max-w-lg space-y-1.5">
                <div className="flex justify-between text-xs text-sky-100">
                  <span>{t("Course Syllabus Progress", "Tiến Độ Hoàn Thành Khóa Học")}</span>
                  <span className="tabular-nums font-semibold text-white">
                    {summary.completedLabs}/{summary.totalLabs} · {summary.completionPercent}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("Labs passed", "Lab đã đạt")}
                  aria-valuemin={0}
                  aria-valuemax={summary.totalLabs}
                  aria-valuenow={summary.completedLabs}
                  className="h-2 overflow-hidden rounded-full bg-white/20"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-[width]"
                    style={{ width: `${summary.completionPercent}%` }}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        <div
          ref={isLearningWorkspace ? learningContentRef : undefined}
          className={
            isLearningWorkspace
              ? "min-h-0 min-w-0 flex-1 overflow-y-scroll overscroll-contain pr-1 [scrollbar-gutter:stable]"
              : "min-w-0 space-y-6"
          }
        >
          {activeTab === "player" &&
            !isLearningWorkspace &&
            publishedCourse.isPending &&
            syllabusModules.length === 0 && (
              <section className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
                {t("Loading course curriculum…", "Đang tải nội dung khóa học…")}
              </section>
            )}
          {activeTab === "player" &&
            !isLearningWorkspace &&
            !publishedCourse.isPending &&
            syllabusModules.length === 0 &&
            !courseContentModule && (
              <section className="rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground shadow-sm">
                <p className="font-medium text-foreground">
                  {t("No published modules yet", "Chưa có chương học tập nào được công bố")}
                </p>
                <p className="mt-1">
                  {t(
                    "Your lecturer has not published course modules yet. Check Grades or Class Overview for updates.",
                    "Giảng viên chưa công bố lộ trình học tập cho lớp này. Bạn có thể kiểm tra Điểm số hoặc Tổng quan lớp học.",
                  )}
                </p>
              </section>
            )}
          {activeTab === "player" && !isLearningWorkspace && courseContentModule && (
            <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <div className="border-b pb-4">
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {`Module ${courseContentModule.position}: ${
                    courseContentModule.title
                      .replace(/^(?:Module|Chương)\s+\d+\s*[:–—-]\s*/i, "")
                      .trim() || courseContentModule.title
                  }`}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {courseContentModule.description ||
                    t(
                      "Select a lesson below to start reading, take the Quiz, or open MAVIS Studio.",
                      "Chọn một bài học bên dưới để đọc lý thuyết, làm Quiz hoặc mở MAVIS Studio.",
                    )}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("Module lessons", "Danh sách bài học")}
                  </h3>
                  <span className="text-xs font-semibold text-primary">
                    {summary.completedLabs}/{summary.totalLabs || 0}{" "}
                    {t("Labs completed", "Lab đã hoàn thành")}
                  </span>
                </div>
                <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border bg-background">
                  {courseContentModule.items.map((item) => {
                    const badgeMeta = itemBadgeMeta(item.type, t);
                    const isLabItem = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(
                      item.type,
                    );
                    const hasAssignmentGate = isLabItem || item.type === "QUIZ";
                    const linkedLab =
                      hasAssignmentGate && item.assignmentId
                        ? labs.find((l) => l.assignmentId === item.assignmentId)
                        : undefined;
                    const isPassed = linkedLab?.state === "PASSED";
                    const isTheoryDone = item.type === "THEORY" && isTheoryCompleted(item.id);
                    const isLocked = isItemLocked(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isLocked}
                        aria-disabled={isLocked || undefined}
                        onClick={() => {
                          if (!isLocked) selectCurriculumItem(item);
                        }}
                        className={`group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors ${
                          isLocked
                            ? "cursor-not-allowed opacity-70"
                            : "hover:bg-accent/70"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span
                            className={`block text-sm font-semibold ${
                              isLocked
                                ? "text-muted-foreground"
                                : "text-foreground group-hover:text-primary"
                            }`}
                          >
                            {item.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {badgeMeta.label}
                            {item.estimatedMinutes
                              ? ` · ~${item.estimatedMinutes} ${t("min", "phút")}`
                              : ""}
                          </span>
                          {isLocked && (
                            <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                              {t("Pass previous Lab to unlock", "Hoàn thành Lab trước để mở khóa")}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0">
                          {isPassed ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {t("Passed", "Đã đạt")}
                            </span>
                          ) : isTheoryDone ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {t("Completed", "Đã hoàn thành")}
                            </span>
                          ) : isLocked ? (
                            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              {t("Locked", "Đang khóa")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
                              {t("Get started", "Bắt đầu")}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {activeTab === "player" &&
            isLearningWorkspace &&
            activeEntry &&
            activeModule &&
            activeItem && (
              <div className="min-w-0 pb-6">
                {/* Focused learning workspace: Course Content navigation + wide lesson canvas. */}
                <section className="min-w-0 space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {t(`Module ${activeModule.position}`, `Module ${activeModule.position}`)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={itemBadgeMeta(activeItem.type, t).pillClass}
                        >
                          {itemBadgeMeta(activeItem.type, t).label}
                        </Badge>
                        {activeItem.estimatedMinutes && (
                          <span className="text-xs text-muted-foreground">
                            · ~{activeItem.estimatedMinutes} {t("min", "phút")}
                          </span>
                        )}
                        {activeItem.type === "THEORY" && isTheoryCompleted(activeItem.id) && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            {t("Completed", "Đã hoàn thành")}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                        {activeItem.title}
                      </h2>
                      {activeItem.description && (
                        <p className="text-sm text-muted-foreground">{activeItem.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!prevEntry}
                        onClick={() => prevEntry && selectCurriculumItem(prevEntry.item)}
                      >
                        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t("Prev", "Bài trước")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!nextEntry || isItemLocked(nextEntry.item)}
                        onClick={() => nextEntry && selectCurriculumItem(nextEntry.item)}
                      >
                        {t("Next", "Bài tiếp theo")}
                        <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {/* Main Content Body per Activity Type */}
                  {activeItem.type === "THEORY" &&
                    typeof activeItem.content?.["body"] === "string" && (
                      <div className="space-y-6">
                        <div className="prose-sm max-w-none rounded-xl border bg-background p-4 sm:p-6">
                          <MarkdownPreview markdown={String(activeItem.content["body"])} />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {isTheoryCompleted(activeItem.id)
                                ? t("Lesson completed", "Đã hoàn thành bài lý thuyết")
                                : t("Finished reading this lesson?", "Bạn đã đọc xong bài lý thuyết này?")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isTheoryCompleted(activeItem.id)
                                ? t(
                                    "Marked as done in your course syllabus. You can continue to the next item.",
                                    "Đã đánh dấu hoàn thành trong lộ trình học của bạn. Bạn có thể chuyển sang bài tiếp theo.",
                                  )
                                : t(
                                    "Mark as completed to track your reading progress.",
                                    "Bấm đánh dấu đã hoàn thành để lưu tiến độ đọc của bạn.",
                                  )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={isTheoryCompleted(activeItem.id) ? "outline" : "default"}
                            aria-pressed={isTheoryCompleted(activeItem.id)}
                            className={
                              isTheoryCompleted(activeItem.id)
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }
                            onClick={() => toggleTheoryCompleted(activeItem.id)}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {isTheoryCompleted(activeItem.id)
                              ? t("Completed", "Đã hoàn thành")
                              : t("Mark as completed", "Đánh dấu đã hoàn thành")}
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!prevEntry}
                            onClick={() => prevEntry && selectCurriculumItem(prevEntry.item)}
                          >
                            <ChevronLeft className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="max-w-[240px] truncate">
                              {prevEntry
                                ? t(`Prev: ${prevEntry.item.title}`, `Trước: ${prevEntry.item.title}`)
                                : t("Prev", "Bài trước")}
                            </span>
                          </Button>
                          {nextEntry ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isItemLocked(nextEntry.item)}
                              onClick={() => selectCurriculumItem(nextEntry.item)}
                            >
                              <span className="max-w-[260px] truncate">
                                {isItemLocked(nextEntry.item)
                                  ? t(
                                      "Locked · Pass previous Lab to unlock Quiz",
                                      "Đang khóa · Hoàn thành Lab trước để mở Quiz",
                                    )
                                  : nextEntry.item.type === "QUIZ"
                                    ? t(
                                        `Continue to Quiz · ${nextEntry.item.title}`,
                                        `Làm Quiz · ${nextEntry.item.title}`,
                                      )
                                    : t(
                                        `Next: ${nextEntry.item.title}`,
                                        `Tiếp theo: ${nextEntry.item.title}`,
                                      )}
                              </span>
                              {!isItemLocked(nextEntry.item) && (
                                <ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              {t("End of Module theory", "Đã hết bài lý thuyết trong Module")}
                            </span>
                          )}
                        </div>

                        {/* OLP-inspired Chapter Practice Box directly under Lesson */}
                        <div className="hidden space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-5">
                          <div>
                            <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                              📝{" "}
                              {t(
                                `Chapter ${activeModule.position} Practice & Assessment`,
                                `Bài Tập Thực Hành & Kiểm Tra Chương ${activeModule.position}`,
                              )}
                            </h3>
                            <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-300/80">
                              {t(
                                "Test your understanding immediately with the 10-question Quiz, Case Study Essay, or Studio Live Lab.",
                                "Kiểm tra kiến thức ngay sau khi đọc lý thuyết với Quiz trắc nghiệm 10 câu, bài Tự luận Rubric hoặc phòng thực hành Studio Live.",
                              )}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2.5">
                            {chapterQuizItem && (
                              <Button
                                type="button"
                                size="sm"
                                variant={practicePanel === "quiz" ? "default" : "outline"}
                                className={
                                  practicePanel === "quiz"
                                    ? "bg-sky-600 text-white hover:bg-sky-700"
                                    : "border-sky-300 bg-background text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200"
                                }
                                onClick={() =>
                                  setPracticePanel((cur) => (cur === "quiz" ? "none" : "quiz"))
                                }
                              >
                                <HelpCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t(
                                  "Take Quiz (10 Qs)",
                                  `Làm Trắc Nghiệm Chương ${activeModule.position}`,
                                )}
                              </Button>
                            )}
                            {chapterEssayItem && (
                              <Button
                                type="button"
                                size="sm"
                                variant={practicePanel === "essay" ? "default" : "outline"}
                                className={
                                  practicePanel === "essay"
                                    ? "bg-amber-600 text-white hover:bg-amber-700"
                                    : "border-amber-300 bg-background text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200"
                                }
                                onClick={() =>
                                  setPracticePanel((cur) => (cur === "essay" ? "none" : "essay"))
                                }
                              >
                                <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t("Open Case Study Essay", "Làm Bài Tự Luận + Rubric")}
                              </Button>
                            )}
                            {chapterLabItem &&
                              chapterLabItem.assignmentId &&
                              activeLabRecord?.state !== "LOCKED" && (
                                <Button
                                  asChild
                                  size="sm"
                                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                  <Link
                                    href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(chapterLabItem.assignmentId)}&step=1`}
                                  >
                                    <Play
                                      className="mr-1.5 h-3.5 w-3.5 fill-current"
                                      aria-hidden="true"
                                    />
                                    {t("Open Studio Live Lab", "Mở Phòng Lab Thực Hành")}
                                  </Link>
                                </Button>
                              )}
                          </div>

                          {practicePanel === "quiz" && chapterQuizItem && (
                            <ChapterQuizRunner
                              title={chapterQuizItem.title}
                              questions={
                                chapterQuizItem.quizQuestions?.length
                                  ? chapterQuizItem.quizQuestions
                                  : isJavaCourseraWorkspace && !chapterQuizItem.assignmentId
                                    ? matchQuizQuestionsForItem(
                                        activeModule.position,
                                        chapterQuizItem.title,
                                      )
                                    : []
                              }
                              canManage={false}
                              workspaceId={workspaceId}
                              assignmentId={chapterQuizItem.assignmentId}
                            />
                          )}

                          {practicePanel === "essay" &&
                            chapterEssayItem &&
                            typeof chapterEssayItem.content?.["prompt"] === "string" && (
                              <CourseEssayItemPanel
                                workspaceId={workspaceId}
                                itemId={chapterEssayItem.id}
                                promptMarkdown={String(chapterEssayItem.content["prompt"])}
                                rubric={
                                  Array.isArray(chapterEssayItem.content["rubric"])
                                    ? (chapterEssayItem.content["rubric"] as RubricRow[])
                                    : undefined
                                }
                                canManage={false}
                                active={workspace.status !== "ARCHIVED"}
                              />
                            )}
                        </div>
                      </div>
                    )}

                  {activeItem.type === "THEORY" &&
                    typeof activeItem.content?.["body"] !== "string" && (
                      <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
                        {t(
                          "No theory content has been published for this lesson yet.",
                          "Bài học này chưa có nội dung lý thuyết được công bố.",
                        )}
                      </div>
                    )}

                  {activeItem.type === "QUIZ" && (
                    <ChapterQuizRunner
                      title={activeItem.title}
                      questions={
                        activeItem.quizQuestions?.length
                          ? activeItem.quizQuestions
                          : isJavaCourseraWorkspace && !activeItem.assignmentId
                            ? matchQuizQuestionsForItem(activeModule.position, activeItem.title)
                            : []
                      }
                      canManage={false}
                      workspaceId={workspaceId}
                      assignmentId={activeItem.assignmentId}
                      nextLessonTitle={nextEntry?.item.title}
                      onNextLesson={
                        nextEntry ? () => selectCurriculumItem(nextEntry.item) : undefined
                      }
                    />
                  )}

                  {activeItem.type === "ESSAY" &&
                    typeof activeItem.content?.["prompt"] === "string" && (
                      <CourseEssayItemPanel
                        workspaceId={workspaceId}
                        itemId={activeItem.id}
                        promptMarkdown={String(activeItem.content["prompt"])}
                        rubric={
                          Array.isArray(activeItem.content["rubric"])
                            ? (activeItem.content["rubric"] as RubricRow[])
                            : undefined
                        }
                        canManage={false}
                        active={workspace.status !== "ARCHIVED"}
                      />
                    )}
                </section>

                {/* Left Sidebar Menu Column: OLP 6-Chapter Accordion */}
                <aside className="hidden space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b pb-3">
                    <div>
                      <h2 className="text-sm font-semibold">
                        📑 {t("Course Content", "Nội dung khóa học")}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {syllabusModules.length} {t("modules", "module")} · {flattenedItems.length}{" "}
                        {t("items", "nội dung")}
                      </p>
                    </div>
                    {summary.totalLabs > 0 && (
                      <Badge variant="outline" className="text-[11px]">
                        {summary.completedLabs}/{summary.totalLabs} Lab
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {syllabusModules.map((mod) => {
                      const isActiveModule = mod.id === activeModule.id;
                      return (
                        <details
                          key={mod.id}
                          open={isActiveModule}
                          className="group overflow-hidden rounded-xl border bg-background"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold hover:bg-muted/40">
                            <span className="line-clamp-2 min-w-0 flex-1">{mod.title}</span>
                            <ChevronDown
                              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                              aria-hidden="true"
                            />
                          </summary>
                          <ul className="divide-y border-t">
                            {mod.items.map((item) => {
                              const selected = item.id === activeItem.id;
                              const badgeMeta = itemBadgeMeta(item.type, t);
                              const linkedLab = item.assignmentId
                                ? labs.find((l) => l.assignmentId === item.assignmentId)
                                : undefined;
                              const isLabItem = [
                                "STATIC_LAB",
                                "IMPACT_LAB",
                                "RUNTIME_LAB",
                              ].includes(item.type);
                              const isLocked = isItemLocked(item);
                              const isPassed = isLabItem && linkedLab?.state === "PASSED";
                              return (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    onClick={() => selectCurriculumItem(item)}
                                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
                                      selected
                                        ? "bg-teal-50 font-semibold text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
                                        : "hover:bg-muted/50 text-foreground"
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block leading-snug">{item.title}</span>
                                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                                        <span>{badgeMeta.label}</span>
                                        {item.estimatedMinutes ? (
                                          <span>· ~{item.estimatedMinutes}p</span>
                                        ) : null}
                                        {isPassed ? (
                                          <span className="inline-flex items-center gap-0.5 text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                            {t("Done", "Đạt")}
                                          </span>
                                        ) : isLocked ? (
                                          <span className="inline-flex items-center gap-0.5 text-amber-600">
                                            <Lock className="h-3 w-3" aria-hidden="true" />
                                            {t("Locked", "Khóa")}
                                          </span>
                                        ) : null}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                </aside>
              </div>
            )}

          {activeTab === "submissions" && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="text-base font-semibold">
                    {t("Your Submissions in This Class", "Bài Đã Nộp Trong Lớp Này")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Track grading status, scores, and detailed lecturer comments.",
                      "Theo dõi trạng thái chấm bài, điểm số và nhận xét chi tiết từ Giảng viên.",
                    )}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}>
                    {t("Open Full Submissions Page", "Mở Trang Bài Nộp Đầy Đủ")}
                  </Link>
                </Button>
              </div>

              <RequestState
                query={submissionsQuery}
                empty={!classSubmissions.length}
                emptyMessage={t(
                  "You have not submitted any Labs in this class yet. Open Evidence & Submit in a Lab to submit.",
                  "Bạn chưa nộp bài Lab nào trong lớp này. Hãy vào Evidence & Submit trong Lab để nộp bài.",
                )}
              >
                <div className="divide-y">
                  {classSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                    >
                      <div className="space-y-1">
                        <Link
                          href={`/submissions/${encodeURIComponent(sub.id)}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {formatCourseLabTitle(
                            sub.assignmentTitle,
                            sub.labOrder,
                            sub.assignmentId,
                          )}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sub.submittedAt).toLocaleString()}
                          {sub.reviewScore != null
                            ? ` · ${formatTenScaleScore(sub.reviewScore, sub.reviewScoreTenScale)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          status={
                            sub.labOutcome === "PASSED"
                              ? "PASSED"
                              : sub.labOutcome === "NEEDS_REVISION"
                                ? "NEEDS_REVISION"
                                : sub.reviewStatus || "PENDING"
                          }
                          variant={
                            sub.labOutcome === "PASSED"
                              ? "success"
                              : sub.labOutcome === "NEEDS_REVISION"
                                ? "warning"
                                : "secondary"
                          }
                        />
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/submissions/${encodeURIComponent(sub.id)}`}>
                            {t("View Details", "Xem Chi Tiết")}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </RequestState>
            </section>
          )}

          {activeTab === "library" && client.mode === "backend" && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <CurriculumLibrary />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
