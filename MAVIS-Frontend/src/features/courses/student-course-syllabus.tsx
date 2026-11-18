"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileCheck2,
  FileText,
  HelpCircle,
  Lock,
  Play,
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
import { ChapterQuizRunner } from "./chapter-quiz-runner";
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
        pillClass: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      };
    case "QUIZ":
      return {
        label: t("Chapter Quiz", "Trắc nghiệm (10 câu)"),
        emoji: "❓",
        pillClass: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      };
    case "ESSAY":
      return {
        label: t("Case Study Essay", "Bài tập Tự luận"),
        emoji: "📝",
        pillClass: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    default:
      return {
        label: t("2D Studio Lab", "Thực hành 2D Studio"),
        emoji: "🔬",
        pillClass: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
  }
}

export function StudentCourseSyllabus({
  workspace,
}: {
  workspace: Response<"workspaces">[number];
}) {
  const { t } = useLocale();
  const client = useApi();
  const workspaceId = workspace.id;
  const roadmap = useCourseRoadmap(workspaceId);
  const publishedCourse = usePublishedCourse(workspaceId);
  const assignmentsQuery = useApiQuery("assignments", { workspaceId });
  const submissionsQuery = useApiQuery("submissions", { workspaceId });
  const [activeTab, setActiveTab] = useState<"player" | "submissions" | "library">("player");

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
          mod.items.find((it) => ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(it.type))?.title ??
          mod.title,
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
  const [practicePanel, setPracticePanel] = useState<"none" | "quiz" | "essay">("none");

  const activeEntry =
    flattenedItems.find((entry) => entry.item.id === selectedItemId) ??
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
    (chapterAssignmentId ? (assignmentsQuery.data ?? []).find((a) => a.id === chapterAssignmentId) : undefined) ??
    selectedAssignment;
  const selectCurriculumItem = (item: OutlineItemData) => {
    setSelectedItemId(item.id);
    setPracticePanel("none");
    if (item.assignmentId) {
      setSelectedLabId(item.assignmentId);
    }
  };

  const lecturerNames = Array.from(
    new Set(
      (workspace.members ?? [])
        .filter((member) => member.role.toUpperCase() === "LECTURER")
        .map((member) => member.name?.trim())
        .filter(
          (name): name is string =>
            Boolean(name) && !/^(lecture|lecturer|giảng viên)$/i.test(name),
        ),
    ),
  );

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
                "Pick any unlocked Lab from the left syllabus tree to read the lesson, test impact analysis, pass the Quiz Gate, and practice on MAVIS Studio Live.",
                "Chọn bài học ở cây mục lục bên trái để học tuần tự 4 bước: Lý thuyết C1–C3, Lan truyền lỗi BFS, Quiz mở khóa và Thực hành MAVIS Studio Live.",
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-sky-100">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5">
                👨‍🏫 {t("Instructor", "Giảng viên")}:{" "}
                <strong className="font-semibold text-white">
                  {lecturerNames.length ? lecturerNames.join(" · ") : "Thầy Hoàng (gv.java@mavis.edu.vn)"}
                </strong>
              </span>
              {summary.nextActiveLab && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-400/20 px-2.5 py-0.5 text-emerald-50">
                  ▶ {t("Up next", "Bài tiếp theo")}:{" "}
                  <strong className="font-semibold">{summary.nextActiveLab.title}</strong>
                </span>
              )}
            </div>
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

      <div className="min-w-0 space-y-6">
          {activeTab === "player" && activeEntry && activeModule && activeItem && (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
              {/* Right Wide Content Column (ordered second on desktop, first visually in reading flow via order-2) */}
              <section className="min-w-0 space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6 lg:order-2">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {t(`Chapter ${activeModule.position}`, `Chương ${activeModule.position}`)}
                      </Badge>
                      <Badge variant="outline" className={itemBadgeMeta(activeItem.type, t).pillClass}>
                        {itemBadgeMeta(activeItem.type, t).emoji} {itemBadgeMeta(activeItem.type, t).label}
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
                      disabled={!nextEntry}
                      onClick={() => nextEntry && selectCurriculumItem(nextEntry.item)}
                    >
                      {t("Next", "Bài tiếp theo")}
                      <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {/* Main Content Body per Activity Type */}
                {activeItem.type === "THEORY" && typeof activeItem.content?.["body"] === "string" && (
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
                    <div className="prose-sm max-w-none rounded-xl border bg-background p-4 sm:p-6">
                      <MarkdownPreview markdown={String(activeItem.content["body"])} />
                    </div>

                    {/* OLP-inspired Chapter Practice Box directly under Lesson */}
                    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-5">
                      <div>
                        <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                          📝 {t(
                            `Chapter ${activeModule.position} Practice & Assessment`,
                            `Bài Tập Thực Hành & Kiểm Tra Chương ${activeModule.position}`,
                          )}
                        </h3>
                        <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-300/80">
                          {t(
                            "Test your understanding immediately with the 10-question Quiz, Case Study Essay, or 2D Studio Lab.",
                            "Kiểm tra kiến thức ngay sau khi đọc lý thuyết với Quiz trắc nghiệm 10 câu, bài Tự luận Rubric hoặc phòng thực hành 2D Studio.",
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
                            {t("Take Quiz (10 Qs)", `Làm Trắc Nghiệm Chương ${activeModule.position}`)}
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
                        {chapterLabItem && chapterLabItem.assignmentId && activeLabRecord?.state !== "LOCKED" && (
                          <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                            <Link
                              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(chapterLabItem.assignmentId)}&step=1`}
                            >
                              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                              {t("Open 2D Studio Lab", "Mở Phòng Lab Thực Hành")}
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
                              : matchQuizQuestionsForItem(activeModule.position, chapterQuizItem.title)
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

                {activeItem.type === "QUIZ" && (
                  <ChapterQuizRunner
                    title={activeItem.title}
                    questions={
                      activeItem.quizQuestions?.length
                        ? activeItem.quizQuestions
                        : matchQuizQuestionsForItem(activeModule.position, activeItem.title)
                    }
                    canManage={false}
                    workspaceId={workspaceId}
                    assignmentId={activeItem.assignmentId}
                  />
                )}

                {activeItem.type === "ESSAY" && typeof activeItem.content?.["prompt"] === "string" && (
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
                          {t(
                            "4-Step Guided Learning Checklist",
                            "Lộ Trình 4 Bước Cho Bài Lab Này",
                          )}
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
                                  <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
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
                            <div
                              role="alert"
                              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                            >
                              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>
                                <strong>BR-03 (DS-01b):</strong>{" "}
                                {t(
                                  "This Lab is currently locked. Pass and receive approval (> 5.0/10) on the previous Lab first to unlock it sequentially.",
                                  "Bài Lab này đang khóa — Bạn cần hoàn thành và đạt phê duyệt (> 5.0 điểm) ở bài Lab trước để mở khóa tuần tự.",
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
                                  {t("Start / Continue This Lab", "Bắt Đầu / Tiếp Tục Làm Bài Lab Này")}
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

              {/* Left Sidebar Menu Column: OLP 6-Chapter Accordion */}
              <aside className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-6 lg:order-1">
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
                          <span className="line-clamp-2 min-w-0 flex-1">
                            {mod.title}
                          </span>
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
                            const isLabItem = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type);
                            const isLocked = isLabItem && linkedLab?.state === "LOCKED";
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
                                  <span className="mt-0.5 shrink-0 text-xs">{badgeMeta.emoji}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block leading-snug">{item.title}</span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                                      <span>{badgeMeta.label}</span>
                                      {item.estimatedMinutes ? <span>· ~{item.estimatedMinutes}p</span> : null}
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
    </div>
  );
}
