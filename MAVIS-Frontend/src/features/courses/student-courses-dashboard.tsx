"use client";

import Link from "next/link";
import { Award, BookOpen, Check, GraduationCap, KeyRound, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/data";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseEnrollment, useCourseRoadmap } from "@/features/workspaces/course-access";
import { computeCourseProgressSummary } from "@/lib/coursera-ui-helpers";
import type { Response } from "@/lib/api/contracts";

export function StudentCoursesHero({
  studentName,
  firstWorkspaceId,
  passkeyOpen,
  onTogglePasskey,
}: {
  studentName?: string | null | undefined;
  firstWorkspaceId?: string | null | undefined;
  passkeyOpen: boolean;
  onTogglePasskey: () => void;
}) {
  const { t } = useLocale();
  const resumeHref = firstWorkspaceId
    ? `/roadmap?workspace=${encodeURIComponent(firstWorkspaceId)}`
    : "/courses#course-passkey";

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-6 text-white shadow-lg sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-teal-100 backdrop-blur-sm">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            {t("MAVIS Coursera Hub", "Không Gian Học Tập MAVIS")}
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {studentName
              ? `${t("Welcome back,", "Xin chào,")} ${studentName}`
              : t("My Courses", "Khóa học của tôi")}
          </h1>
          <p className="text-sm text-teal-100/90">
            {t(
              "Track sequential Labs, pass Quiz Gates (>= 80%), practice on 2D Studio, and view your graded feedback.",
              "Theo dõi lộ trình bài Lab tuần tự, vượt qua Quiz Gate (>= 80%), thực hành 2D Studio và xem nhận xét từ Giảng viên.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {firstWorkspaceId && (
            <Button asChild className="bg-teal-500 text-white shadow-sm hover:bg-teal-600">
              <Link href={resumeHref}>
                <Play className="mr-1.5 h-4 w-4 fill-current" aria-hidden="true" />
                {t("Resume Latest Course", "Tiếp tục bài học gần nhất")}
              </Link>
            </Button>
          )}
          <Button
            type="button"
            aria-expanded={passkeyOpen}
            aria-controls="course-passkey-form"
            onClick={onTogglePasskey}
            className="bg-white text-slate-900 shadow-sm hover:bg-teal-50"
          >
            <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {passkeyOpen
              ? t("Close Passkey", "Đóng ô Passkey")
              : t("Enter Class Passkey", "Nhập Mã Lớp (Passkey)")}
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href="/studio">
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("Free Studio Sandbox", "Sandbox Studio Tự Do")}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function StudentKpiStrip({
  enrolledCount,
  passedLabsCount,
  submittedCount,
  completionPercent,
  avgScore,
}: {
  enrolledCount: number;
  passedLabsCount: number;
  submittedCount: number;
  completionPercent: number;
  avgScore: number | null;
}) {
  const { t } = useLocale();
  const clampedPct = Math.min(100, Math.max(0, completionPercent));

  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("Enrolled Classes", "Lớp học của tôi")}</span>
          <BookOpen className="h-4 w-4 text-teal-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight">{enrolledCount}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("Active enrolled courses", "Khóa học đã ghi danh")}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("Completed Labs", "Bài Lab đã hoàn thành")}</span>
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
          {passedLabsCount}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            / {submittedCount} {t("submitted", "đã nộp")}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {avgScore != null
            ? `${t("Avg grade", "Điểm TB")}: ${avgScore}/100`
            : t("Passed checkpoints", "Bài Lab đã đạt yêu cầu")}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("Overall Progress", "Tiến độ hoàn thành khóa học")}</span>
          <Award className="h-4 w-4 text-teal-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
          {clampedPct}%
        </p>
        <div
          role="progressbar"
          aria-label={t("Overall progress", "Tiến độ tổng")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedPct}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
            style={{ width: `${clampedPct}%` }}
          />
        </div>
      </div>
    </section>
  );
}

export function PasskeyEnrollmentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <section
      id="course-passkey-form"
      className={
        open
          ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          : "hidden"
      }
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-labelledby="passkey-modal-title"
    >
      <div
        id="course-passkey"
        tabIndex={-1}
        className="w-full max-w-lg scroll-mt-6 rounded-2xl border border-teal-200 bg-card p-5 shadow-2xl dark:border-teal-800"
      >
        <div className="mb-4 flex items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-600" aria-hidden="true" />
            <h2 id="passkey-modal-title" className="text-base font-semibold">
              {t("Join Class via Passkey", "Tham Gia Lớp Học Bằng Mã Passkey")}
            </h2>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t("Close", "Đóng")}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <CourseEnrollment destination="roadmap" />
      </div>
    </section>
  );
}

export function StudentCourseProgressCard({
  workspace,
  memberCount,
  lecturerNames,
  isLecturer,
  onOpen,
}: {
  workspace: Response<"workspaces">[number];
  memberCount: number;
  lecturerNames: string[];
  isLecturer: boolean;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const roadmap = useCourseRoadmap(workspace.id);
  const labs = roadmap.data?.labs ?? [];
  const summary = computeCourseProgressSummary(labs);
  const roadmapHref = `/roadmap?workspace=${encodeURIComponent(workspace.id)}`;

  return (
    <article className="flex flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:border-teal-500/50 hover:shadow-md">
      <div className="h-2 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" />
      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="border-teal-200 bg-teal-50 font-mono text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
            >
              {workspace.code || t("CLASS", "LỚP")}
            </Badge>
            <StatusBadge status={workspace.status || "ACTIVE"} />
          </div>

          <div>
            <h2 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight">
              {workspace.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Lecturer", "Giảng viên")}:{" "}
              <span className="font-medium text-foreground">
                {lecturerNames.length ? lecturerNames.join(", ") : t("Not listed", "Chưa có thông tin")}
              </span>
              {" · "}
              {memberCount} {t("members", "thành viên")}
            </p>
          </div>

          {roadmap.data?.guided && (
            <div className="space-y-1.5 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t("Course Progress", "Tiến Độ Khóa Học")}
                </span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {summary.completedLabs}/{summary.totalLabs} {t("Labs", "bài")} ({summary.completionPercent}%)
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("Labs passed", "Lab đã đạt")}
                aria-valuemin={0}
                aria-valuemax={summary.totalLabs || 1}
                aria-valuenow={summary.completedLabs}
                className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
                  style={{ width: `${summary.completionPercent}%` }}
                />
              </div>
            </div>
          )}

          {summary.nextActiveLab ? (
            <p className="flex items-start gap-2 rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 text-xs text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-200">
              <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current text-teal-600" aria-hidden="true" />
              <span>
                <span className="font-semibold">{t("Up next", "Bài tiếp theo")}:</span>{" "}
                {summary.nextActiveLab.title}
              </span>
            </p>
          ) : summary.totalLabs > 0 && summary.completedLabs === summary.totalLabs ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("All guided Labs completed!", "Bạn đã hoàn thành toàn bộ Lab!")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            asChild
            onClick={onOpen}
            className="flex-1 bg-teal-600 text-white hover:bg-teal-700"
          >
            <Link href={roadmapHref}>
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
              {isLecturer
                ? t("Manage course", "Quản lý khóa học")
                : t("Continue learning", "Tiếp tục học")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" onClick={onOpen}>
            <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
              {t("Grades", "Điểm & Bài nộp")}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
