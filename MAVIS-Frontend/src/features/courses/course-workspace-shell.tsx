"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  LayoutGrid,
  Map,
  Settings,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";
import { lecturerCourseAccess } from "@/features/lecturer/application/course-access-policy";

export type CourseWorkspaceTab =
  | "content"
  | "authoring"
  | "assignments"
  | "theory-library"
  | "lab-authoring"
  | "submissions"
  | "members"
  | "settings"
  | "results";

type UnifiedStaffTab = Exclude<CourseWorkspaceTab, "results">;
type UnifiedStudentTab = "syllabus" | "lab" | "submissions";

const STAFF_TABS: Array<{
  id: UnifiedStaffTab;
  en: string;
  vi: string;
  icon: LucideIcon;
  href: (ws: string) => string;
}> = [
  {
    id: "content",
    en: "Overview",
    vi: "Tổng quan",
    icon: LayoutGrid,
    href: (ws) => `/workspace-overview?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "authoring",
    en: "Modules",
    vi: "Học phần",
    icon: GraduationCap,
    href: (ws) => `/workspace-overview?workspace=${encodeURIComponent(ws)}&view=course-authoring`,
  },
  {
    id: "lab-authoring",
    en: "Labs",
    vi: "Bài Lab",
    icon: FilePlus2,
    href: (ws) => `/lab-authoring?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "submissions",
    en: "Grades",
    vi: "Chấm điểm",
    icon: ClipboardCheck,
    href: (ws) => `/submissions?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "members",
    en: "Students",
    vi: "Sinh viên",
    icon: Users,
    href: (ws) => `/members?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "settings",
    en: "Settings",
    vi: "Cài đặt",
    icon: Settings,
    href: (ws) => `/members?workspace=${encodeURIComponent(ws)}&tab=settings`,
  },
];

const STUDENT_TABS: Array<{
  id: UnifiedStudentTab;
  en: string;
  vi: string;
  icon: LucideIcon;
  href: (ws: string) => string;
}> = [
  {
    id: "syllabus",
    en: "Course Syllabus",
    vi: "Lộ trình bài học",
    icon: Map,
    href: (ws) => `/roadmap?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "lab",
    en: "Lab Practice",
    vi: "Phòng học Lab",
    icon: Zap,
    href: (ws) => `/lab?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "submissions",
    en: "Grades & Submissions",
    vi: "Điểm số & Bài nộp",
    icon: ClipboardCheck,
    href: (ws) => `/submissions?workspace=${encodeURIComponent(ws)}`,
  },
];

function resolveStaffTab(pathname: string | null, active: CourseWorkspaceTab): UnifiedStaffTab {
  if (
    pathname === "/theory-library" ||
    pathname === "/lab-authoring" ||
    pathname === "/assignments"
  ) {
    return "lab-authoring";
  }
  if (pathname === "/submissions" || active === "submissions" || active === "results") {
    return "submissions";
  }
  if (active === "settings") {
    return "settings";
  }
  if (pathname === "/members" || active === "members") {
    return "members";
  }
  return active;
}

function resolveStudentTab(pathname: string | null, active: CourseWorkspaceTab): UnifiedStudentTab {
  if (pathname === "/submissions" || active === "submissions" || active === "results") {
    return "submissions";
  }
  if (pathname === "/lab") {
    return "lab";
  }
  return "syllabus";
}

export function CourseWorkspaceShell({
  workspace,
  active,
  actions,
  showTabs = true,
  children,
}: {
  workspace: Response<"workspaces">[number];
  active: CourseWorkspaceTab;
  actions?: ReactNode;
  showTabs?: boolean;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const members = workspace.members ?? [];
  const students = members.filter((member) => member.role.toUpperCase() === "STUDENT").length;
  const creatorMember =
    (workspace.createdById
      ? members.find((member) => member.id === workspace.createdById)
      : undefined) ?? members.find((member) => member.role.toUpperCase() === "LECTURER");
  const creatorName = workspace.createdByName?.trim() || creatorMember?.name?.trim() || "";
  const isStudent = workspace.myRole?.toUpperCase() === "STUDENT";
  const activeStaffTab = resolveStaffTab(pathname, active);
  const activeStudentTab = resolveStudentTab(pathname, active);
  const courseAccess = lecturerCourseAccess(workspace.status);

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-600 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
            {!isStudent && (
              <div>
                <Link
                  href="/workspaces"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 transition-colors hover:text-white"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  {t("Back to classes", "Quay lại danh sách lớp")}
                </Link>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{workspace.name}</h1>
              {workspace.code && (
                <Badge className="border-white/25 bg-white/15 font-mono text-white hover:bg-white/20">
                  {workspace.code}
                </Badge>
              )}
              <Badge
                className={
                  workspace.status === "ARCHIVED"
                    ? "border-slate-300/30 bg-slate-800/50 text-slate-200"
                    : "border-emerald-300/30 bg-emerald-500/25 text-emerald-100"
                }
              >
                {workspace.status === "ARCHIVED"
                  ? t("Archived", "Đã lưu trữ")
                  : t("Active", "Đang hoạt động")}
              </Badge>
              {!isStudent && (
                <Badge className="border-white/25 bg-white/15 text-white hover:bg-white/20">
                  {courseAccess.isEditable
                    ? t("Editing enabled", "Có thể chỉnh sửa")
                    : t("Read only", "Chỉ xem")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
              {creatorName && (
                <span className="inline-flex items-center gap-1.5 font-medium text-white">
                  <UserAvatar
                    name={creatorName}
                    avatarUrl={creatorMember?.avatarUrl}
                    size="xs"
                    className="size-5 ring-1 ring-white/30"
                  />
                  <span>
                    {t("Instructor", "Giảng viên")}: {creatorName}
                  </span>
                </span>
              )}
              {creatorName && (
                <span className="text-white/40" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                <span>
                  {students}{" "}
                  {students === 1 ? t("student", "sinh viên") : t("students", "sinh viên")}
                </span>
              </span>
            </div>
          </div>
          {actions && courseAccess.isEditable && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
        {showTabs && (
          <nav
            aria-label={t("Class sections", "Các mục của lớp")}
            className="mt-4 overflow-x-auto rounded-xl bg-black/20 p-1 backdrop-blur-sm"
          >
            <div className="flex w-max min-w-full flex-nowrap items-center gap-1">
              {(isStudent ? STUDENT_TABS : STAFF_TABS).map((tab) => {
                const Icon = tab.icon;
                const isCurrent = isStudent
                  ? activeStudentTab === tab.id
                  : activeStaffTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href(workspace.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                      isCurrent
                        ? "bg-white text-emerald-950 shadow-sm"
                        : "text-white/85 hover:bg-white/15 hover:text-white",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {t(tab.en, tab.vi)}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>
      {!isStudent && !courseAccess.isEditable && (
        <div
          role="status"
          className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100"
        >
          <span className="font-semibold">
            {t("Active course — read only.", "Khóa học đang hoạt động — chỉ xem.")}
          </span>{" "}
          {t(
            "Deactivate the course before changing content, students, grades, or settings.",
            "Hãy chuyển khóa học sang không hoạt động trước khi sửa nội dung, sinh viên, điểm hoặc cài đặt.",
          )}
        </div>
      )}
      {children}
    </div>
  );
}
