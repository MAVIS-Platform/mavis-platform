"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  ClipboardCheck,
  Map,
  Plus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";

export type CourseWorkspaceTab =
  | "content"
  | "authoring"
  | "assignments"
  | "theory-library"
  | "lab-authoring"
  | "submissions"
  | "members"
  | "results";

type UnifiedStaffTab = "curriculum" | "submissions" | "members";
type UnifiedStudentTab = "syllabus" | "lab" | "submissions";

const STAFF_TABS: Array<{
  id: UnifiedStaffTab;
  en: string;
  vi: string;
  icon: LucideIcon;
  href: (ws: string) => string;
}> = [
  {
    id: "curriculum",
    en: "Curriculum & Labs",
    vi: "Giáo trình & Bài học Lab",
    icon: BookOpen,
    href: (ws) => `/workspace-overview?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "submissions",
    en: "Grading & Gradebook",
    vi: "Chấm bài & Bảng điểm",
    icon: ClipboardCheck,
    href: (ws) => `/submissions?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "members",
    en: "Students & Passkey",
    vi: "Học viên & Mã lớp",
    icon: Users,
    href: (ws) => `/members?workspace=${encodeURIComponent(ws)}`,
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
  if (pathname === "/submissions" || active === "submissions" || active === "results") {
    return "submissions";
  }
  if (pathname === "/members" || active === "members") {
    return "members";
  }
  return "curriculum";
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
  const lecturers = members.filter((member) => member.role.toUpperCase() === "LECTURER").length;
  const isStudent = workspace.myRole?.toUpperCase() === "STUDENT";
  const activeStaffTab = resolveStaffTab(pathname, active);
  const activeStudentTab = resolveStudentTab(pathname, active);

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-600 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-white/75">
              <Link className="hover:text-white hover:underline" href={isStudent ? "/courses" : "/workspaces"}>
                {t("Classes", "Lớp học")}
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="font-mono font-semibold text-white">
                {workspace.code || t("Class", "Lớp")}
              </span>
            </p>
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
                {workspace.status ?? "ACTIVE"}
              </Badge>
            </div>
            <p className="text-xs text-white/80">
              {members.length} {t("members", "thành viên")} · {students}{" "}
              {t("students", "sinh viên")} · {lecturers} {t("lecturers", "giảng viên")} ·{" "}
              {workspace.myRole || t("Member", "Thành viên")}
            </p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {showTabs && (
          <nav
            aria-label={t("Class sections", "Các mục của lớp")}
            className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/20 p-1.5 backdrop-blur-sm"
          >
            <div className="flex flex-wrap gap-1.5">
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
                      "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                      isCurrent
                        ? "bg-white text-emerald-950 shadow-sm"
                        : "text-white/85 hover:bg-white/15 hover:text-white",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {t(tab.en, tab.vi)}
                  </Link>
                );
              })}
            </div>
            {!isStudent && (
              <Link
                href={`/lab-authoring?workspace=${encodeURIComponent(workspace.id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-400"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {t("Create Lesson / Lab", "Soạn Bài Học / Lab Mới")}
              </Link>
            )}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
