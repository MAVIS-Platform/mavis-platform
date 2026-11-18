"use client";

import Link from "next/link";
import { Award, BookOpen, GraduationCap, KeyRound, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";

export function StudentCoursesHero({
  studentName,
  firstWorkspaceId,
  passkeyOpen,
  onTogglePasskey,
}: {
  studentName?: string | null;
  firstWorkspaceId?: string | null;
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
