"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCheck2,
  Lock,
  Play,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeCourseProgressSummary } from "@/lib/coursera-ui-helpers";
import {
  useCourseRoadmap,
  usePublishedCourse,
} from "@/features/workspaces/course-access";
import { CourseOutline } from "./course-outline";
import { CurriculumLibrary } from "./curriculum";
import type { Response } from "@/lib/api/contracts";

function shortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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

  const labModuleTitleByAssignment = useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of publishedCourse.data?.snapshot?.modules ?? []) {
      for (const item of mod.items ?? []) {
        if (item.assignmentId) {
          map.set(item.assignmentId, `${mod.position}. ${mod.title}`);
        }
      }
    }
    return map;
  }, [publishedCourse.data?.snapshot?.modules]);

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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {activeTab === "player" && (
            <div className="space-y-6">
              {publishedCourse.data && (
                <details
                  open
                  className="rounded-2xl border border-teal-200/80 bg-card p-5 shadow-sm dark:border-teal-900"
                >
                  <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold text-teal-800 dark:text-teal-200">
                    <span>
                      {t(
                        "📚 Full Coursera Course Syllabus (6 Modules · Lessons, Quizzes, Essays & Labs)",
                        "📚 Đề Cương Toàn Bộ Chương, Bài Giảng, Quiz, Tự Luận & Lab (Chuẩn Coursera)",
                      )}
                    </span>
                    <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300">
                      {t("Expand / Collapse", "Thu gọn / Mở rộng")}
                    </Badge>
                  </summary>
                  <div className="mt-4 border-t pt-4">
                    <CourseOutline
                      workspaceId={workspaceId}
                      canManage={false}
                      active={workspace.status !== "ARCHIVED"}
                    />
                  </div>
                </details>
              )}

              <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
                <aside className="rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-6">
                  <div className="mb-3 flex items-center justify-between gap-2 border-b pb-3">
                    <div>
                      <h2 className="text-sm font-semibold">
                        {t("Course Syllabus Tree", "Cây Mục Lục Chương & Bài Lab")}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {summary.completedLabs}/{summary.totalLabs}{" "}
                        {t("completed", "đã hoàn thành")}
                      </p>
                    </div>
                  </div>

                  <RequestState query={roadmap} empty={!labs.length}>
                    <ol className="space-y-2">
                      {labs.map((lab) => {
                        const isSelected = lab.assignmentId === selectedLab?.assignmentId;
                        const isPassed = lab.state === "PASSED";
                        const isLocked = lab.state === "LOCKED";
                        const moduleLabel = labModuleTitleByAssignment.get(lab.assignmentId);
                        return (
                          <li key={lab.assignmentId}>
                            <button
                              type="button"
                              onClick={() => setSelectedLabId(lab.assignmentId)}
                              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                                isSelected
                                  ? "border-teal-600 bg-teal-50/70 shadow-sm dark:border-teal-500 dark:bg-teal-950/30"
                                  : isLocked
                                    ? "border-border/60 bg-muted/30 opacity-80 hover:opacity-100"
                                    : "border-border bg-background hover:border-teal-400"
                              }`}
                            >
                              <span className="mt-0.5 shrink-0">
                                {isPassed ? (
                                  <CheckCircle2
                                    className="h-4 w-4 text-emerald-600"
                                    aria-hidden="true"
                                  />
                                ) : isLocked ? (
                                  <Lock
                                    className="h-4 w-4 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Play
                                    className="h-4 w-4 fill-current text-teal-600"
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                                  <span className="font-mono text-muted-foreground">
                                    {t(`Lesson ${lab.position}`, `Bài ${lab.position}`)}
                                  </span>
                                  <Badge
                                    variant={
                                      isPassed ? "success" : isLocked ? "secondary" : "default"
                                    }
                                    className="px-1.5 py-0 text-[10px]"
                                  >
                                    {isPassed
                                      ? t("Done", "Đã hoàn thành")
                                      : isLocked
                                        ? t("Locked", "Đang khóa")
                                        : t("Active", "Đang mở")}
                                  </Badge>
                                </span>
                                {moduleLabel && (
                                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                    {moduleLabel}
                                  </span>
                                )}
                                <span className="mt-0.5 block text-sm font-medium leading-snug text-foreground">
                                  {lab.title}
                                </span>
                              </span>
                              <ChevronRight
                                className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                  isSelected ? "translate-x-0.5 text-teal-600" : ""
                                }`}
                                aria-hidden="true"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </RequestState>
                </aside>

                <section className="rounded-2xl border bg-card p-6 shadow-sm">
                  {!selectedLab ? (
                    <EmptyState
                      title={t("No Lab selected yet", "Chưa có bài Lab nào")}
                      description={t(
                        "Your lecturer is preparing Labs for this class, or check the module outline below.",
                        "Giảng viên đang chuẩn bị bài Lab cho lớp này, hoặc bạn có thể xem nội dung chương bên dưới.",
                      )}
                    />
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono">
                              Lab {String(selectedLab.position).padStart(2, "0")}
                            </Badge>
                            <Badge
                              variant={
                                selectedLab.state === "PASSED"
                                  ? "success"
                                  : selectedLab.state === "LOCKED"
                                    ? "secondary"
                                    : "default"
                              }
                            >
                              {selectedLab.state === "PASSED"
                                ? t("Completed", "Đã hoàn thành")
                                : selectedLab.state === "LOCKED"
                                  ? t("Locked until previous Lab passes", "Cần hoàn thành bài trước")
                                  : t("Ready to study", "Đang mở — Sẵn sàng học")}
                            </Badge>
                          </div>
                          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                            {selectedLab.title}
                          </h2>
                        </div>
                      </div>

                      {selectedAssignment?.instructions ? (
                        <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                          <MarkdownPreview markdown={selectedAssignment.instructions} />
                        </div>
                      ) : null}

                      <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                        <div>
                          <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                            {t(
                              "4-Step Guided Learning Checklist",
                              "Lộ Trình 4 Bước Cho Bài Học Này",
                            )}
                          </h3>
                          <p className="text-xs text-emerald-900/80 dark:text-emerald-300/80">
                            {t(
                              "Follow Steps 1 to 4 inside the interactive Lab workspace.",
                              "Thực hiện tuần tự Bước 1 đến Bước 4 ngay trong Không Gian Làm Bài Lab.",
                            )}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {stepDescriptions.map((s) => {
                            const stepHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=${s.step}`;
                            return selectedLab.state === "LOCKED" ? (
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

                        {selectedLab.state === "LOCKED" ? (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              {t(
                                "This Lab unlocks automatically once the previous Lab is completed and reviewed as Passed by your lecturer.",
                                "Bài học này sẽ tự động mở khóa ngay sau khi bạn hoàn thành bài trước và đạt đánh giá Đạt.",
                              )}
                              {selectedLab.reason ? ` (${selectedLab.reason})` : ""}
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
                                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=1`}
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
                                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=4`}
                              >
                                {t("Jump to 2D Studio", "Mở Thẳng Studio Thực Hành")}
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
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

        <aside
          className="space-y-3 xl:sticky xl:top-6"
          aria-label={t("Class summary", "Tóm tắt lớp")}
        >
          <section className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Progress", "Tiến độ")}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {summary.completedLabs}
                <span className="text-sm font-normal text-muted-foreground">
                  /{summary.totalLabs}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {summary.completionPercent}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-emerald-500"
                style={{ width: `${summary.completionPercent}%` }}
              />
            </div>
            <p className="mt-3 text-sm">
              {summary.nextActiveLab ? (
                <>
                  {t("Next", "Tiếp theo")}:{" "}
                  <span className="font-medium">{summary.nextActiveLab.title}</span>
                </>
              ) : summary.totalLabs ? (
                t("All Labs passed.", "Đã đạt tất cả Lab.")
              ) : (
                t("No Labs published yet.", "Chưa có Lab nào được công bố.")
              )}
            </p>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Upcoming deadlines", "Hạn nộp gần")}
            </p>
            {upcomingDeadlines.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("No published deadline.", "Chưa có hạn nộp.")}
              </p>
            ) : (
              <ul className="mt-1 divide-y text-sm">
                {upcomingDeadlines.map(({ lab, dueAt }) => (
                  <li key={lab.assignmentId} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{lab.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {shortDate(dueAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Latest result", "Kết quả mới nhất")}
            </p>
            {latestResult ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="truncate font-medium">
                  {latestResult.assignmentTitle || t("Lab submission", "Bài nộp Lab")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {latestResult.reviewScore != null ? `${latestResult.reviewScore}/100 · ` : ""}
                  {latestResult.labOutcome || latestResult.reviewStatus || t("Submitted", "Đã nộp")}
                  {latestResult.gradedAt ? ` · ${shortDate(latestResult.gradedAt)}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("No graded submission yet.", "Chưa có bài được chấm.")}
              </p>
            )}
            <Link
              className="mt-2 inline-block text-xs text-primary hover:underline"
              href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}
            >
              {t("Open submissions & grades", "Mở bài nộp & điểm")}
            </Link>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Teaching team", "Giảng viên")}
            </p>
            <p className="mt-2 text-sm">
              {lecturerNames.length ? lecturerNames.join(", ") : t("Not listed", "Chưa có thông tin")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
