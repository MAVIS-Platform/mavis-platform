"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  FileCheck2,
  FileText,
  HelpCircle,
  Lock,
  Maximize2,
  Play,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/data";
import { InteractiveConceptStage } from "@/components/shared/interactive-concept-stage";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { RequestState } from "@/components/shared/request-state";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeCourseProgressSummary } from "@/lib/coursera-ui-helpers";
import {
  useCourseRoadmap,
  usePublishedCourse,
} from "@/features/workspaces/course-access";
import {
  ChapterQuizRunner,
  computeRecommendedQuizSeconds,
} from "./chapter-quiz-runner";
import { CourseEssayItemPanel, type RubricRow } from "./course-essay-panel";
import { getScenarioForLessonOrLab } from "./designed-to-scale-scenarios";
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
        label: t("Theory Lesson", "Bài giảng lý thuyết"),
        emoji: "📖",
        pillClass:
          "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      };
    case "QUIZ":
      return {
        label: t("Timed Quiz", "Trắc nghiệm có đếm giờ"),
        emoji: "⏱️",
        pillClass:
          "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      };
    case "ESSAY":
      return {
        label: t("Case Study Essay", "Bài tập Tự luận"),
        emoji: "📝",
        pillClass:
          "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    default:
      return {
        label: t("2D Studio Lab", "Thực hành 2D Studio"),
        emoji: "🔬",
        pillClass:
          "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
  }
}

function shortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function focusViewForItemType(type: string): "lesson" | "quiz" | "essay" | null {
  if (type === "THEORY") return "lesson";
  if (type === "QUIZ") return "quiz";
  if (type === "ESSAY") return "essay";
  return null;
}

export function StudentCourseSyllabus({
  workspace,
}: {
  workspace: Response<"workspaces">[number];
}) {
  const { t } = useLocale();
  const client = useApi();
  const searchParams = useSearchParams();
  const workspaceId = workspace.id;
  const roadmap = useCourseRoadmap(workspaceId);
  const publishedCourse = usePublishedCourse(workspaceId);
  const assignmentsQuery = useApiQuery("assignments", { workspaceId });
  const submissionsQuery = useApiQuery("submissions", { workspaceId });
  const [activeTab, setActiveTab] = useState<"player" | "submissions" | "library">("player");

  const rawView = searchParams.get("view");
  const focusView: "lesson" | "quiz" | "essay" | null =
    rawView === "lesson" || rawView === "quiz" || rawView === "essay" ? rawView : null;
  const urlItemId = searchParams.get("item") ?? "";

  const labs = roadmap.data?.labs ?? [];
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

  const syllabusModules: OutlineModuleData[] = useMemo(() => {
    const rawModules = publishedCourse.data?.snapshot?.modules;
    if (Array.isArray(rawModules) && rawModules.length > 0) {
      return rawModules.map((mod) => ({
        id: mod.id,
        title: mod.title,
        description: mod.description ?? null,
        position: mod.position,
        prerequisiteModuleId: mod.prerequisiteModuleId ?? null,
        labTitle:
          mod.items.find((it) => ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(it.type))
            ?.title ?? mod.title,
        items: (mod.items ?? []).map((item) => ({
          id: item.id,
          type: item.type as OutlineItemData["type"],
          title: item.title,
          description: item.description ?? null,
          position: item.position,
          assignmentId: item.assignmentId ?? null,
          required: item.required,
          content: item.content,
          ...(typeof item.content?.["curriculumCode"] === "string"
            ? { curriculumCode: String(item.content["curriculumCode"]) }
            : {}),
          quizQuestions:
            item.type === "QUIZ" ? matchQuizQuestionsForItem(mod.position, item.title) : undefined,
        })),
      }));
    }
    return buildCourseraModulesWithLabLinks(assignmentsQuery.data ?? [], labs);
  }, [publishedCourse.data?.snapshot?.modules, assignmentsQuery.data, labs]);

  const flattenedItems = useMemo(
    () => syllabusModules.flatMap((mod) => mod.items.map((item) => ({ module: mod, item }))),
    [syllabusModules],
  );
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const effectiveItemId = urlItemId || selectedItemId;
  const activeEntry =
    flattenedItems.find((entry) => entry.item.id === effectiveItemId) ??
    flattenedItems[0] ??
    null;
  const activeIndex = activeEntry
    ? flattenedItems.findIndex((entry) => entry.item.id === activeEntry.item.id)
    : -1;
  const prevEntry = activeIndex > 0 ? flattenedItems[activeIndex - 1] : null;
  const nextEntry =
    activeIndex >= 0 && activeIndex < flattenedItems.length - 1
      ? flattenedItems[activeIndex + 1]
      : null;

  const activeModule = activeEntry?.module ?? null;
  const activeItem = activeEntry?.item ?? null;
  const chapterQuizItem = activeModule?.items.find((i) => i.type === "QUIZ") ?? null;
  const chapterEssayItem = activeModule?.items.find((i) => i.type === "ESSAY") ?? null;
  const chapterLabItem =
    activeModule?.items.find((i) =>
      ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(i.type),
    ) ?? null;
  const chapterAssignmentId =
    activeItem?.assignmentId ??
    chapterLabItem?.assignmentId ??
    chapterQuizItem?.assignmentId ??
    selectedLab?.assignmentId ??
    null;
  const activeLabRecord =
    (chapterAssignmentId ? labs.find((l) => l.assignmentId === chapterAssignmentId) : undefined) ??
    selectedLab;
  const activeAssignmentRecord =
    (chapterAssignmentId
      ? (assignmentsQuery.data ?? []).find((a) => a.id === chapterAssignmentId)
      : undefined) ?? selectedAssignment;

  const selectCurriculumItem = (item: OutlineItemData) => {
    setSelectedItemId(item.id);
    if (item.assignmentId) {
      setSelectedLabId(item.assignmentId);
    }
  };

  const syllabusHref = `/roadmap?workspace=${encodeURIComponent(workspaceId)}`;
  const buildFocusHref = (view: "lesson" | "quiz" | "essay", itemId: string) =>
    `/roadmap?workspace=${encodeURIComponent(workspaceId)}&view=${view}&item=${encodeURIComponent(itemId)}`;

  const chapterQuizQuestions = useMemo(() => {
    if (!chapterQuizItem || !activeModule) return [];
    return chapterQuizItem.quizQuestions?.length
      ? chapterQuizItem.quizQuestions
      : matchQuizQuestionsForItem(activeModule.position, chapterQuizItem.title);
  }, [chapterQuizItem, activeModule]);

  const activeQuizQuestions = useMemo(() => {
    if (!activeItem || !activeModule) return [];
    if (activeItem.type === "QUIZ") {
      return activeItem.quizQuestions?.length
        ? activeItem.quizQuestions
        : matchQuizQuestionsForItem(activeModule.position, activeItem.title);
    }
    return chapterQuizQuestions;
  }, [activeItem, activeModule, chapterQuizQuestions]);

  const upcomingDeadlines = useMemo(() => {
    const assignmentsById = new Map((assignmentsQuery.data ?? []).map((item) => [item.id, item]));
    return labs
      .map((lab) => ({ lab, dueAt: assignmentsById.get(lab.assignmentId)?.dueAt }))
      .filter(
        (row): row is { lab: (typeof labs)[number]; dueAt: string } =>
          typeof row.dueAt === "string" && row.dueAt !== "No deadline",
      )
      .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())
      .slice(0, 3);
  }, [labs, assignmentsQuery.data]);

  const latestResult = useMemo(() => {
    const classIds = new Set((assignmentsQuery.data ?? []).map((item) => item.id));
    return [...(submissionsQuery.data ?? [])]
      .filter(
        (sub) =>
          sub.workspaceId === workspaceId ||
          (!sub.workspaceId && classIds.has(sub.assignmentId)),
      )
      .filter((sub) => sub.reviewScore != null || sub.labOutcome || sub.reviewStatus)
      .sort(
        (left, right) =>
          new Date(right.gradedAt ?? right.submittedAt).getTime() -
          new Date(left.gradedAt ?? left.submittedAt).getTime(),
      )[0];
  }, [submissionsQuery.data, assignmentsQuery.data, workspaceId]);

  const lecturerNames = (workspace.members ?? [])
    .filter((member) => member.role.toUpperCase() === "LECTURER")
    .map((member) => member.name);

  const stepDescriptions: Array<{ step: 1 | 2 | 3 | 4; label: string; hint: string }> = [
    {
      step: 1,
      label: t("Step 1 · Architecture & Theory", "Bước 1 · Lý Thuyết & Sơ Đồ C1–C3"),
      hint: t("Read docs & 3E evidence", "Đọc lý thuyết & bằng chứng 3E"),
    },
    {
      step: 2,
      label: t("Step 2 · Impact Explorer", "Bước 2 · Lan Truyền Lỗi (BFS)"),
      hint: t("Reverse BFS blast radius", "Truy vết ảnh hưởng Reverse BFS"),
    },
    {
      step: 3,
      label: t("Step 3 · Quiz Gate", "Bước 3 · Quiz Mở Khóa (>= 80%)"),
      hint: t("Pass comprehension check", "Đạt trắc nghiệm để mở khóa"),
    },
    {
      step: 4,
      label: t("Step 4 · 2D Studio & Submit", "Bước 4 · Thực Hành 2D Studio & Nộp"),
      hint: t("Verify session & explain", "Xác minh phiên & nộp bài giải"),
    },
  ];

  const resumeLabHref = summary.nextActiveLab
    ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(summary.nextActiveLab.assignmentId)}&step=1`
    : labs[0]
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labs[0].assignmentId)}&step=1`
      : null;

  // =========================================================================
  // DEDICATED FULL-WIDTH FOCUS PAGE (Lesson Reader / Timed Quiz Room / Essay)
  // Zero right-hand sidebars crushing the text!
  // =========================================================================
  if (focusView && activeModule && activeItem) {
    const prevFocus = prevEntry ? focusViewForItemType(prevEntry.item.type) : null;
    const nextFocus = nextEntry ? focusViewForItemType(nextEntry.item.type) : null;
    const targetQuizItem = activeItem.type === "QUIZ" ? activeItem : chapterQuizItem;
    const targetEssayItem = activeItem.type === "ESSAY" ? activeItem : chapterEssayItem;
    const quizMinutes = Math.round(
      computeRecommendedQuizSeconds(
        (targetQuizItem === activeItem ? activeQuizQuestions : chapterQuizQuestions).length,
      ) / 60,
    );

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Clean Full-Width Focus Top Header */}
        <header className="mavis-hero-surface p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href={syllabusHref}>
                <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
                {t("Back to Course Syllabus", "Quay lại Lộ trình môn học")}
              </Link>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              {prevEntry && prevFocus && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <Link href={buildFocusHref(prevFocus, prevEntry.item.id)}>
                    <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
                    {t("Previous", "Bài trước")}
                  </Link>
                </Button>
              )}
              {nextEntry && nextFocus && (
                <Button
                  asChild
                  size="sm"
                  className="bg-white text-slate-950 hover:bg-sky-50"
                >
                  <Link href={buildFocusHref(nextFocus, nextEntry.item.id)}>
                    {t("Next activity", "Bài tiếp theo")}
                    <ChevronRight className="ml-1 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-white/30 bg-white/15 font-mono text-xs text-white"
              >
                {workspace.code || t("CLASS", "LỚP")} ·{" "}
                {t(`Chapter ${activeModule.position}`, `Chương ${activeModule.position}`)}
              </Badge>
              <Badge
                variant="outline"
                className="border-white/30 bg-white/15 text-xs text-sky-100"
              >
                {focusView === "lesson"
                  ? t("📖 Dedicated Lesson Reader", "📖 Trang đọc Lý thuyết chuyên biệt")
                  : focusView === "quiz"
                    ? t("⏱️ Timed Quiz Exam Room", "⏱️ Phòng thi Trắc nghiệm có đếm giờ")
                    : t("✍️ Case Study Essay & Rubric", "✍️ Trang làm Bài Tự luận")}
              </Badge>
              {activeItem.estimatedMinutes && focusView === "lesson" && (
                <span className="inline-flex items-center gap-1 text-xs text-sky-100/90">
                  <Clock className="size-3.5" aria-hidden="true" />~{activeItem.estimatedMinutes}{" "}
                  {t("min read", "phút đọc")}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {focusView === "quiz" && targetQuizItem
                ? targetQuizItem.title
                : focusView === "essay" && targetEssayItem
                  ? targetEssayItem.title
                  : activeItem.title}
            </h1>
            {activeItem.description && focusView === "lesson" && (
              <p className="max-w-3xl text-sm leading-6 text-sky-100/90">
                {activeItem.description}
              </p>
            )}
          </div>
        </header>

        {/* Full-Width Lesson Reader Body */}
        {focusView === "lesson" && (
          <div className="space-y-6">
            <InteractiveConceptStage
              scenario={getScenarioForLessonOrLab(
                activeModule.position,
                activeItem.curriculumCode ??
                  (typeof activeItem.content?.["curriculumCode"] === "string"
                    ? String(activeItem.content["curriculumCode"])
                    : activeItem.title),
              )}
            />
            <article className="rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
              {typeof activeItem.content?.["body"] === "string" ? (
                <MarkdownPreview
                  markdown={String(activeItem.content["body"])}
                  className="mx-auto max-w-4xl space-y-4 [&_h1]:text-2xl [&_h2]:mt-6 [&_h2]:text-xl [&_h3]:mt-5 [&_h3]:text-lg [&_p]:text-[15px] [&_p]:leading-8 [&_li]:text-[15px] [&_li]:leading-8 [&_pre]:p-4 [&_pre]:text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {activeItem.description ||
                    t("No lesson content available yet.", "Chưa có nội dung chi tiết cho bài học này.")}
                </p>
              )}
            </article>

            {/* Clean Post-Lesson Action Strip */}
            <section className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-5 shadow-xs dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                    {t(
                      `Ready to test Chapter ${activeModule.position}?`,
                      `Hoàn thành đọc lý thuyết? Thực hành ngay Chương ${activeModule.position}`,
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-300/80">
                    {t(
                      "Switch to the dedicated timed Quiz room, write your Case Study Essay, or launch the 2D Studio Lab.",
                      "Chuyển sang trang thi Quiz có bộ đếm giờ riêng, viết bài Tự luận hoặc vào phòng Lab 2D Studio.",
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {chapterQuizItem && (
                    <Button asChild className="bg-sky-600 text-white hover:bg-sky-700">
                      <Link href={buildFocusHref("quiz", chapterQuizItem.id)}>
                        <Timer className="mr-1.5 size-4" aria-hidden="true" />
                        {t(
                          `Start Quiz (${chapterQuizQuestions.length} Qs · ${quizMinutes} min)`,
                          `Làm Quiz Chương ${activeModule.position} (${chapterQuizQuestions.length} câu · ${quizMinutes} phút)`,
                        )}
                      </Link>
                    </Button>
                  )}
                  {chapterEssayItem && (
                    <Button asChild variant="outline" className="bg-background">
                      <Link href={buildFocusHref("essay", chapterEssayItem.id)}>
                        <FileText className="mr-1.5 size-4" aria-hidden="true" />
                        {t("Open Essay Page", "Mở trang Tự luận")}
                      </Link>
                    </Button>
                  )}
                  {chapterLabItem &&
                    chapterLabItem.assignmentId &&
                    activeLabRecord?.state !== "LOCKED" && (
                      <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700">
                        <Link
                          href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(chapterLabItem.assignmentId)}&step=1`}
                        >
                          <Play className="mr-1.5 size-3.5 fill-current" aria-hidden="true" />
                          {t("Open 2D Studio Lab", "Mở Phòng Lab Thực Hành")}
                        </Link>
                      </Button>
                    )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Full-Width Timed Quiz Exam Room */}
        {focusView === "quiz" && targetQuizItem && (
          <ChapterQuizRunner
            title={targetQuizItem.title}
            questions={activeQuizQuestions}
            canManage={false}
            workspaceId={workspaceId}
            assignmentId={targetQuizItem.assignmentId}
            fullPage
          />
        )}

        {/* Full-Width Case Study Essay Page */}
        {focusView === "essay" &&
          targetEssayItem &&
          typeof targetEssayItem.content?.["prompt"] === "string" && (
            <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
              <CourseEssayItemPanel
                workspaceId={workspaceId}
                itemId={targetEssayItem.id}
                promptMarkdown={String(targetEssayItem.content["prompt"])}
                rubric={
                  Array.isArray(targetEssayItem.content["rubric"])
                    ? (targetEssayItem.content["rubric"] as RubricRow[])
                    : undefined
                }
                canManage={false}
                active={workspace.status !== "ARCHIVED"}
              />
            </section>
          )}
      </div>
    );
  }

  // =========================================================================
  // MAIN COURSE SYLLABUS OVERVIEW (Spacious 2-Column Layout + Top KPI Strip)
  // =========================================================================
  const activeQuizMinutes = Math.round(
    computeRecommendedQuizSeconds(activeQuizQuestions.length) / 60,
  );
  const chapterQuizMinutes = Math.round(
    computeRecommendedQuizSeconds(chapterQuizQuestions.length) / 60,
  );

  return (
    <div className="space-y-6">
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
              <span className="mavis-tabular text-xs font-medium text-sky-100">
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
                "Browse chapters below, open any Theory Lesson or Timed Quiz in its own full-width focus page, and complete 4-step guided Labs.",
                "Chọn bài học ở mục lục, mở trang đọc Lý thuyết hoặc phòng thi Quiz riêng có đếm giờ cho rộng rãi, và hoàn thành các bài Lab thực hành 4 bước.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {resumeLabHref && (
              <Button asChild className="bg-white text-slate-950 shadow-sm hover:bg-sky-50">
                <Link href={resumeLabHref}>
                  <Play className="mr-1.5 h-4 w-4 fill-current text-blue-700" aria-hidden="true" />
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
              <span className="mavis-tabular font-semibold text-white">
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

      {/* Compact Horizontal Class Summary Strip (replaces cramped 4th column!) */}
      <section
        aria-label={t("Class summary", "Tóm tắt lớp")}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Progress", "Tiến độ")}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="mavis-tabular text-xl font-bold">
              {summary.completedLabs}
              <span className="text-sm font-normal text-muted-foreground">/{summary.totalLabs}</span>
            </span>
            <span className="mavis-tabular text-xs text-muted-foreground">
              {summary.completionPercent}%
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {summary.nextActiveLab
              ? `${t("Next", "Tiếp theo")}: ${summary.nextActiveLab.title}`
              : summary.totalLabs
                ? t("All Labs passed.", "Đã đạt tất cả Lab.")
                : t("No Labs published yet.", "Chưa có Lab nào được công bố.")}
          </p>
        </div>

        <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Upcoming deadlines", "Hạn nộp gần")}
          </p>
          {upcomingDeadlines.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("No published deadline.", "Chưa có hạn nộp.")}
            </p>
          ) : (
            <p className="mt-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{upcomingDeadlines[0]!.lab.title}</span>
              <span className="mavis-tabular shrink-0 text-xs text-muted-foreground">
                {shortDate(upcomingDeadlines[0]!.dueAt)}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Latest result", "Kết quả mới nhất")}
          </p>
          {latestResult ? (
            <p className="mt-1.5 truncate text-xs text-foreground">
              <strong>{latestResult.assignmentTitle || t("Lab submission", "Bài nộp Lab")}</strong>
              {latestResult.reviewScore != null ? ` · ${latestResult.reviewScore}/100` : ""}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("No graded submission yet.", "Chưa có bài được chấm.")}
            </p>
          )}
          <Link
            className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
            href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}
          >
            {t("Open submissions & grades", "Mở bài nộp & điểm")} →
          </Link>
        </div>

        <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Teaching team", "Giảng viên")}
          </p>
          <p className="mt-1.5 truncate text-sm font-medium text-foreground">
            {lecturerNames.length ? lecturerNames.join(", ") : t("Not listed", "Chưa có thông tin")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {syllabusModules.length} {t("chapters", "chương")} · {flattenedItems.length}{" "}
            {t("activities", "hoạt động")}
          </p>
        </div>
      </section>

      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm"
        role="tablist"
        aria-label={t("Student course workspace sections", "Mục học tập trong lớp")}
      >
        <Button
          type="button"
          size="sm"
          role="tab"
          aria-selected={activeTab === "player"}
          variant={activeTab === "player" ? "default" : "ghost"}
          onClick={() => setActiveTab("player")}
          className={activeTab === "player" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
        >
          <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("1. Syllabus & Lab Player", "1. Cây Mục Lục & Phòng Học Lab")}
        </Button>
        <Button
          type="button"
          size="sm"
          role="tab"
          aria-selected={activeTab === "submissions"}
          variant={activeTab === "submissions" ? "default" : "ghost"}
          onClick={() => setActiveTab("submissions")}
          className={activeTab === "submissions" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
        >
          <FileCheck2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("2. My Submissions & Grades", "2. Bài Nộp & Điểm Số")}
          {classSubmissions.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[11px]">
              {classSubmissions.length}
            </Badge>
          )}
        </Button>
        {client.mode === "backend" && (
          <Button
            type="button"
            size="sm"
            role="tab"
            aria-selected={activeTab === "library"}
            variant={activeTab === "library" ? "default" : "ghost"}
            onClick={() => setActiveTab("library")}
            className={activeTab === "library" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
          >
            <Code2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("3. Java & C# Reference Library", "3. Giáo Trình Java & C#")}
          </Button>
        )}
      </div>

      {/* Main Spacious 2-Column Content (No 4th Column Crushing Content!) */}
      {activeTab === "player" && activeEntry && activeModule && activeItem && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* Wide Main Activity Card */}
          <section className="min-w-0 space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {t(`Chapter ${activeModule.position}`, `Chương ${activeModule.position}`)}
                  </Badge>
                  <Badge variant="outline" className={itemBadgeMeta(activeItem.type, t).pillClass}>
                    {itemBadgeMeta(activeItem.type, t).emoji}{" "}
                    {itemBadgeMeta(activeItem.type, t).label}
                  </Badge>
                  {activeItem.estimatedMinutes && (
                    <span className="text-xs text-muted-foreground">
                      · ~{activeItem.estimatedMinutes} {t("min", "phút")}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {activeItem.title}
                </h2>
                {activeItem.description && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {activeItem.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  disabled={!nextEntry}
                  onClick={() => nextEntry && selectCurriculumItem(nextEntry.item)}
                >
                  {t("Next", "Bài tiếp theo")}
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* THEORY ITEM: Prominent Full-Page Reader Button + Clean Action Hub + Spacious Preview */}
            {activeItem.type === "THEORY" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {t(
                        "Read comfortably in full-screen Lesson Mode",
                        "Đọc bài lý thuyết thoải mái ở trang riêng toàn màn hình",
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Hides course menus for wide code snippets, diagrams and distraction-free reading.",
                        "Ẩn toàn bộ cột phụ để hiển thị đầy đủ ví dụ mã nguồn, sơ đồ và văn bản rộng rãi, dễ đọc.",
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild className="bg-primary text-primary-foreground shadow-xs">
                      <Link href={buildFocusHref("lesson", activeItem.id)}>
                        <Maximize2 className="mr-1.5 size-4" aria-hidden="true" />
                        {t("Open Full Lesson Page", "Mở trang đọc Lý thuyết riêng")}
                      </Link>
                    </Button>
                    {chapterQuizItem && (
                      <Button asChild variant="outline" className="border-sky-300 bg-background text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200">
                        <Link href={buildFocusHref("quiz", chapterQuizItem.id)}>
                          <Timer className="mr-1.5 size-4" aria-hidden="true" />
                          {t(
                            `Take Quiz (${chapterQuizMinutes} min)`,
                            `Làm Quiz Chương ${activeModule.position} (${chapterQuizMinutes} phút)`,
                          )}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {typeof activeItem.content?.["body"] === "string" && (
                  <div className="space-y-5">
                    <InteractiveConceptStage
                      scenario={getScenarioForLessonOrLab(
                        activeModule.position,
                        activeItem.curriculumCode ??
                          (typeof activeItem.content?.["curriculumCode"] === "string"
                            ? String(activeItem.content["curriculumCode"])
                            : activeItem.title),
                      )}
                    />
                    <div className="rounded-xl border bg-background p-5 sm:p-6">
                      <MarkdownPreview markdown={String(activeItem.content["body"])} />
                    </div>
                  </div>
                )}

                {/* Bottom Practice Launcher Cards (each opens its own clean full page!) */}
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-5">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                      📝{" "}
                      {t(
                        `Chapter ${activeModule.position} Practice & Assessment`,
                        `Thực Hành & Kiểm Tra Chương ${activeModule.position}`,
                      )}
                    </h3>
                    <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-300/80">
                      {t(
                        "Open the dedicated Timed Quiz room, Case Study Essay page, or 2D Studio Lab.",
                        "Chọn nút bên dưới để chuyển sang trang làm Quiz có đếm giờ, trang Tự luận hoặc phòng Lab 2D Studio.",
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {chapterQuizItem && (
                      <Button asChild size="sm" className="bg-sky-600 text-white hover:bg-sky-700">
                        <Link href={buildFocusHref("quiz", chapterQuizItem.id)}>
                          <HelpCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t(
                            `Open Timed Quiz (${chapterQuizQuestions.length} Qs · ${chapterQuizMinutes}m)`,
                            `Mở Trang Làm Quiz Chương ${activeModule.position} (${chapterQuizQuestions.length} câu · ${chapterQuizMinutes} phút)`,
                          )}
                        </Link>
                      </Button>
                    )}
                    {chapterEssayItem && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-amber-300 bg-background text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200"
                      >
                        <Link href={buildFocusHref("essay", chapterEssayItem.id)}>
                          <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t("Open Case Study Essay", "Mở Trang Tự Luận + Rubric")}
                        </Link>
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
                            <Play className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            {t("Open 2D Studio Lab", "Mở Phòng Lab Thực Hành")}
                          </Link>
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* QUIZ ITEM: Clean Exam Briefing Card -> Launches Dedicated Timed Exam Room */}
            {activeItem.type === "QUIZ" && (
              <div className="space-y-5 rounded-2xl border border-sky-200/80 bg-sky-50/40 p-6 dark:border-sky-900 dark:bg-sky-950/20">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Questions", "Số lượng câu hỏi")}
                    </p>
                    <p className="mavis-tabular mt-1 text-2xl font-bold text-foreground">
                      {activeQuizQuestions.length}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("questions", "câu")}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Time Limit", "Thời gian làm bài")}
                    </p>
                    <p className="mavis-tabular mt-1 text-2xl font-bold text-sky-700 dark:text-sky-300">
                      {activeQuizMinutes}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("minutes", "phút")}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Pass Threshold", "Ngưỡng đạt")}
                    </p>
                    <p className="mavis-tabular mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                      ≥ 70%
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  {t(
                    "Click below to open the dedicated full-width Quiz room with a live countdown timer, question navigator map, and instant answer explanations.",
                    "Bấm nút bên dưới để chuyển sang phòng thi Trắc nghiệm riêng rộng rãi, có đồng hồ đếm ngược tự động theo số câu hỏi, bảng chuyển nhanh từng câu và giải thích đáp án ngay khi nộp.",
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="bg-sky-600 text-white hover:bg-sky-700">
                    <Link href={buildFocusHref("quiz", activeItem.id)}>
                      <Timer className="mr-2 size-4" aria-hidden="true" />
                      {t("Start Timed Quiz (Full Page)", "Bắt Đầu Làm Quiz (Mở Trang Riêng)")}
                    </Link>
                  </Button>
                  {activeItem.assignmentId && (
                    <Button asChild size="lg" variant="outline" className="bg-background">
                      <Link
                        href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(activeItem.assignmentId)}&step=3`}
                      >
                        {t("Open in Lab Quiz Gate", "Mở tại Lab Quiz Gate")}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ESSAY ITEM: Clean Briefing + Full-Page Essay Button */}
            {activeItem.type === "ESSAY" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-sm text-amber-950 dark:text-amber-200">
                    {t(
                      "Open the Case Study Essay in full width to view the full Rubric and draft your answer comfortably.",
                      "Mở trang Tự luận toàn màn hình để xem đầy đủ bảng tiêu chí Rubric và trình bày bài làm thoải mái.",
                    )}
                  </p>
                  <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
                    <Link href={buildFocusHref("essay", activeItem.id)}>
                      <Maximize2 className="mr-1.5 size-4" aria-hidden="true" />
                      {t("Open Full Essay Page", "Mở trang Tự luận riêng")}
                    </Link>
                  </Button>
                </div>
                {typeof activeItem.content?.["prompt"] === "string" && (
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
              </div>
            )}

            {/* LAB ITEM */}
            {["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(activeItem.type) && (
              <div className="space-y-6">
                <InteractiveConceptStage
                  scenario={getScenarioForLessonOrLab(activeModule.position, activeItem.title)}
                />
                {activeAssignmentRecord?.instructions && (
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <MarkdownPreview markdown={activeAssignmentRecord.instructions} />
                  </div>
                )}

                <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-5">
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                      {t("4-Step Guided Learning Checklist", "Lộ Trình 4 Bước Cho Bài Lab Này")}
                    </h3>
                    <p className="text-xs text-emerald-900/80 dark:text-emerald-300/80">
                      {t(
                        "Follow Steps 1 to 4 inside the interactive Lab workspace.",
                        "Thực hiện tuần tự Bước 1 đến Bước 4 ngay trong Không Gian Làm Bài Lab.",
                      )}
                    </p>
                  </div>

                  {activeLabRecord ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {stepDescriptions.map((s) => {
                          const stepHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(activeLabRecord.assignmentId)}&step=${s.step}`;
                          return activeLabRecord.state === "LOCKED" ? (
                            <div
                              key={s.step}
                              className="rounded-xl border border-border/70 bg-background/70 p-3 opacity-70"
                            >
                              <p className="text-xs font-semibold text-muted-foreground">
                                {s.label}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                            </div>
                          ) : (
                            <Link
                              key={s.step}
                              href={stepHref}
                              className="group rounded-xl border border-emerald-200/80 bg-background p-3 transition-all hover:border-emerald-500 hover:shadow-sm dark:border-emerald-800/50"
                            >
                              <p className="text-xs font-semibold text-emerald-800 group-hover:text-emerald-600 dark:text-emerald-300">
                                {s.label}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                            </Link>
                          );
                        })}
                      </div>

                      {activeLabRecord.state === "LOCKED" ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {t(
                              "This Lab unlocks automatically once the previous Lab is completed and reviewed as Passed by your lecturer.",
                              "Bài học này sẽ tự động mở khóa ngay sau khi bạn hoàn thành bài trước và đạt đánh giá Đạt.",
                            )}
                            {activeLabRecord.reason ? ` (${activeLabRecord.reason})` : ""}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <Button
                            asChild
                            size="lg"
                            className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                          >
                            <Link
                              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(activeLabRecord.assignmentId)}&step=1`}
                            >
                              <Play className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
                              {t(
                                "Start / Continue This Lab",
                                "Bắt Đầu / Tiếp Tục Làm Bài Lab Này",
                              )}
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="lg">
                            <Link
                              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(activeLabRecord.assignmentId)}&step=4`}
                            >
                              {t("Jump to 2D Studio", "Mở Thẳng Studio Thực Hành")}
                            </Link>
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-emerald-900/80 dark:text-emerald-300/80">
                      {t(
                        "Read all 3 lessons in this chapter first; the interactive 2D Studio Lab is linked once published by your lecturer.",
                        "Hãy đọc trọn vẹn 3 bài giảng và hoàn thành Quiz/Tự luận chương này; phòng Lab 2D Studio sẽ mở ngay khi giảng viên công bố Assignment.",
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Right Course Syllabus Tree Menu */}
          <aside className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-sm font-semibold">
                  📑 {t("Course Syllabus Menu", "Nội Dung Môn Học")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {syllabusModules.length} {t("chapters", "chương")} · {flattenedItems.length}{" "}
                  {t("activities", "hoạt động")}
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
                        const isLabItem = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(
                          item.type,
                        );
                        const isLocked = isLabItem && linkedLab?.state === "LOCKED";
                        const isPassed = isLabItem && linkedLab?.state === "PASSED";
                        const itemFocus = focusViewForItemType(item.type);
                        return (
                          <li key={item.id} className="flex items-stretch">
                            <button
                              type="button"
                              onClick={() => selectCurriculumItem(item)}
                              className={`flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
                                selected
                                  ? "bg-teal-50 font-semibold text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
                                  : "text-foreground hover:bg-muted/50"
                              }`}
                            >
                              <span className="mt-0.5 shrink-0 text-xs">{badgeMeta.emoji}</span>
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
                            {itemFocus && (
                              <Link
                                href={buildFocusHref(itemFocus, item.id)}
                                title={t("Open full-screen page", "Mở trang riêng toàn màn hình")}
                                aria-label={`${t("Open full page", "Mở trang riêng")}: ${item.title}`}
                                className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                              >
                                <Maximize2 className="size-3.5" aria-hidden="true" />
                              </Link>
                            )}
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
                  "Track review status, scores, and detailed feedback from your lecturer.",
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
              "You have not submitted any Labs in this class yet. Open Step 4 in a Lab to submit.",
              "Bạn chưa nộp bài Lab nào trong lớp này. Hãy vào Bước 4 trong Lab để nộp bài.",
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
                      {sub.labOrder ? `Lab ${String(sub.labOrder).padStart(2, "0")} · ` : ""}
                      {sub.assignmentTitle || sub.assignmentId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sub.submittedAt).toLocaleString()}
                      {sub.reviewScore != null ? ` · ${sub.reviewScore}/100` : ""}
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
  );
}
