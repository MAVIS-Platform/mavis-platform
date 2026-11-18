"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Eye,
  GitBranch,
  KeyRound,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequestState } from "@/components/shared/request-state";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  CoursePasskey,
  PublishCourseLab,
  SeedCuratedCourseLabs,
  useCourseRoadmap,
  useCourseSetup,
} from "@/features/workspaces/course-access";
import { CourseOutline } from "./course-outline";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "published" | "draft";

function ReadinessPill({
  ready,
  label,
  icon: Icon,
}: {
  ready: boolean;
  label: string;
  icon: typeof BookOpen;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
      )}
    >
      {ready ? (
        <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
      ) : (
        <CircleDashed className="size-3 text-slate-400" aria-hidden="true" />
      )}
      <Icon className="size-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/**
 * Unified Coursera-style Curriculum & Lab Manager rendered on Tab 1 of Lecturer
 * class management (`WorkspaceOverview` & `/roadmap` when `canManage` is true).
 */
export function LecturerCurriculumManager({
  workspaceId,
  active = true,
}: {
  workspaceId: string;
  active?: boolean | undefined;
}) {
  const { t } = useLocale();
  const assignmentsQuery = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const roadmap = useCourseRoadmap(workspaceId);
  const setup = useCourseSetup(workspaceId);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [showPasskeyDrawer, setShowPasskeyDrawer] = useState(false);

  const labs = assignmentsQuery.data ?? [];

  const rows = useMemo(() => {
    return labs.map((lab) => {
      const inClass = roadmap.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const setupLab = setup.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const hasTheory = Boolean(lab.instructions?.trim() || setupLab?.published || inClass);
      const hasSource = Boolean(lab.referenceSource?.modelId);
      const hasQuiz = Boolean(setupLab?.quizPublished);
      const hasStudio = Boolean(setupLab?.studioReady || lab.labMode !== "THEORY_QUIZ_STUDIO");
      const position = inClass?.position ?? setupLab?.position;
      return {
        lab,
        inClass,
        setupLab,
        position,
        hasTheory,
        hasSource,
        hasQuiz,
        hasStudio,
      };
    });
  }, [labs, roadmap.data?.labs, setup.data?.labs]);

  const publishedCount = rows.filter((row) => Boolean(row.inClass || row.setupLab?.published)).length;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        const isLive = Boolean(row.inClass || row.setupLab?.published);
        if (filter === "published" && !isLive) return false;
        if (filter === "draft" && isLive) return false;
        return !term || row.lab.title.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });
  }, [rows, filter, search]);

  return (
    <div className="space-y-6">
      {/* Quick-Control Strip */}
      <section className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 via-emerald-50/40 to-white p-4 shadow-xs dark:border-teal-900 dark:from-teal-950/30 dark:via-background dark:to-background">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-950 dark:text-teal-100">
              <Layers className="size-4 text-teal-600" aria-hidden="true" />
              <span>
                {t(
                  "Curriculum & Guided Lab Studio",
                  "Quản lý Giáo trình & Bài học Lab",
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Create Lessons/Labs, inspect 4 readiness gates, publish into the class sequence, or edit structured syllabus modules.",
                "Tạo Bài học / Lab mới, kiểm tra 4 điều kiện sẵn sàng, công bố vào lộ trình lớp hoặc sắp xếp các chương học.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPasskeyDrawer((open) => !open)}
            >
              <KeyRound className="mr-1.5 size-3.5 text-emerald-600" aria-hidden="true" />
              {t("Class Passkey", "Passkey lớp")}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/theory-assets?workspace=${encodeURIComponent(workspaceId)}`}>
                <BookOpen className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Theory Library", "Kho Lý Thuyết")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}
              >
                <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Module Builder", "Sắp xếp Chương")}
              </Link>
            </Button>
            <Button asChild size="sm" className="bg-teal-600 text-white hover:bg-teal-700">
              <Link href={`/assignments/new?workspace=${encodeURIComponent(workspaceId)}`}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                {t("Create Lesson / Lab", "Tạo Bài Học / Lab Mới")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-teal-200/60 pt-3">
          <SeedCuratedCourseLabs workspaceId={workspaceId} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {publishedCount}/{labs.length} {t("Labs active in class", "Lab đang mở trong lớp")}
            </span>
          </div>
        </div>
      </section>

      <div id="class-passkey" className={showPasskeyDrawer ? "block" : "sr-only focus-within:not-sr-only"}>
        <CoursePasskey workspaceId={workspaceId} />
      </div>

      {/* Course Outline (structured chapters + published course roadmap) */}
      <CourseOutline workspaceId={workspaceId} canManage active={active} />

      {/* Sequential Lab Cards with 4 Readiness Indicators */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("Sequential Course Labs", "Danh sách Bài học & Lab tuần tự")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "Each Lab card shows Theory, C1–C3 Source, Quiz Gate, and 2D Studio readiness.",
                "Mỗi thẻ hiển thị đủ 4 chỉ báo: Lý thuyết, Sơ đồ C1–C3, Quiz và 2D Studio.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t("Filter labs", "Lọc bài Lab")}
              className="inline-flex rounded-lg border bg-card p-0.5 text-xs"
            >
              {(
                [
                  { id: "all", label: t("All", "Tất cả"), count: rows.length },
                  { id: "published", label: t("In class", "Đã mở"), count: publishedCount },
                  {
                    id: "draft",
                    label: t("Drafts", "Bản nháp"),
                    count: Math.max(0, rows.length - publishedCount),
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium transition-colors",
                    filter === tab.id
                      ? "bg-teal-600 text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="h-8 pl-8 text-xs"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search labs…", "Tìm bài học…")}
                aria-label={t("Search labs", "Tìm bài học")}
              />
            </div>
          </div>
        </div>

        <RequestState
          query={assignmentsQuery}
          empty={!labs.length}
          emptyMessage={t(
            "No Labs in this class yet. Click '+ Create Lesson / Lab' above or seed the curated curriculum.",
            "Chưa có bài Lab nào. Hãy nhấn '+ Tạo Bài Học / Lab Mới' hoặc tạo nhanh giáo trình mẫu ở trên.",
          )}
        >
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
              {t("No Labs match your current filter.", "Không có bài Lab nào khớp bộ lọc.")}
            </p>
          ) : (
            <div className="space-y-3">
              {visible.map(({ lab, position, hasTheory, hasSource, hasQuiz, hasStudio }) => {
                const editHref = `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`;
                const previewHref = `/lab?${new URLSearchParams({
                  workspace: workspaceId,
                  assignment: lab.id,
                  step: "1",
                  preview: "1",
                })}`;
                return (
                  <article
                    key={lab.id}
                    className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs transition hover:border-teal-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-xl border text-sm font-bold tabular-nums",
                            position
                              ? "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
                              : "bg-muted/40 text-muted-foreground",
                          )}
                        >
                          {position ? `L${position}` : "—"}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={editHref}
                              className="text-base font-semibold tracking-tight text-foreground hover:text-teal-700 hover:underline"
                            >
                              {lab.title}
                            </Link>
                            {position ? (
                              <Badge variant="success">
                                {t(`Published · Lab ${position}`, `Đang mở · Lab ${position}`)}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{t("Draft", "Bản nháp")}</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <ReadinessPill
                              ready={hasTheory}
                              label={t("Theory", "Lý thuyết")}
                              icon={BookOpen}
                            />
                            <ReadinessPill
                              ready={hasSource}
                              label={t("C1–C3 Source", "Sơ đồ C1–C3")}
                              icon={GitBranch}
                            />
                            <ReadinessPill
                              ready={hasQuiz}
                              label={t("Quiz Gate", "Quiz Gate")}
                              icon={CircleHelp}
                            />
                            <ReadinessPill
                              ready={hasStudio}
                              label={t("2D Studio", "2D Studio")}
                              icon={Zap}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={previewHref}>
                            <Eye className="mr-1.5 size-3.5" aria-hidden="true" />
                            {t("Preview as Student", "Xem Thử Như Sinh Viên")}
                          </Link>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          className="bg-teal-600 text-white hover:bg-teal-700"
                        >
                          <Link href={editHref}>
                            <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                            {t("Edit & Configure", "Soạn Bài & Cấu Hình")}
                          </Link>
                        </Button>
                        <PublishCourseLab
                          workspaceId={workspaceId}
                          assignmentId={lab.id}
                          position={position}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </RequestState>
      </section>
    </div>
  );
}
