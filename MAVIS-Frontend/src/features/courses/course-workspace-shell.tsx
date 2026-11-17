"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";

export type CourseWorkspaceTab =
  | "content"
  | "authoring"
  | "assignments"
  | "submissions"
  | "members"
  | "results";

const TAB_LABELS: Record<Exclude<CourseWorkspaceTab, "results">, { en: string; vi: string }> = {
  content: { en: "Overview & Setup", vi: "Tổng quan & Khởi tạo" },
  authoring: { en: "Curriculum & Materials", vi: "Đề cương & Học liệu" },
  assignments: { en: "Labs & Quiz Studio", vi: "Thiết kế Lab & Quiz" },
  submissions: { en: "Grading & Gradebook", vi: "Chấm bài & Bảng điểm" },
  members: { en: "Students & Access", vi: "Sinh viên & Phân quyền" },
};

const STUDENT_TAB_LABELS: Partial<Record<CourseWorkspaceTab, { en: string; vi: string }>> = {
  content: { en: "Class content", vi: "Nội dung lớp" },
  submissions: { en: "Submissions", vi: "Bài nộp" },
};

function tabHref(workspaceId: string, tab: Exclude<CourseWorkspaceTab, "results">) {
  const workspace = encodeURIComponent(workspaceId);
  if (tab === "content") return `/workspace-overview?workspace=${workspace}`;
  if (tab === "authoring") return `/workspace-overview?workspace=${workspace}&view=course-authoring`;
  if (tab === "assignments") return `/assignments?workspace=${workspace}`;
  if (tab === "members") return `/members?workspace=${workspace}`;
  return `/submissions?workspace=${workspace}`;
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
  const members = workspace.members ?? [];
  const students = members.filter((member) => member.role.toUpperCase() === "STUDENT").length;
  const lecturers = members.filter((member) => member.role.toUpperCase() === "LECTURER").length;
  const isStudent = workspace.myRole?.toUpperCase() === "STUDENT";
  const normalizedActive = active === "results" ? "submissions" : active;
  const visibleTabs = (Object.keys(TAB_LABELS) as Array<Exclude<CourseWorkspaceTab, "results">>).filter(
    (tab) => !isStudent || tab === "content" || tab === "submissions",
  );

  return (
    <div className="space-y-6">
      <header
        className={cn(
          "overflow-hidden rounded-2xl p-5 shadow-lg sm:p-6",
          isStudent
            ? "bg-gradient-to-r from-blue-900 via-blue-700 to-teal-700 text-white"
            : "bg-gradient-to-r from-indigo-950 via-indigo-700 to-purple-700 text-white",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-white/75">
              <Link className="hover:text-white hover:underline" href="/workspaces">
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
            className="mt-5 flex flex-wrap gap-1.5 rounded-xl bg-black/20 p-1.5 backdrop-blur-sm"
          >
            {visibleTabs.map((tab) => {
              const label = (isStudent ? STUDENT_TAB_LABELS[tab] : undefined) ?? TAB_LABELS[tab];
              const isCurrent = normalizedActive === tab;
              return (
                <Link
                  key={tab}
                  href={tabHref(workspace.id, tab)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isCurrent
                      ? "bg-white text-indigo-950 shadow-sm"
                      : "text-white/80 hover:bg-white/15 hover:text-white",
                  )}
                >
                  {t(label.en, label.vi)}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
