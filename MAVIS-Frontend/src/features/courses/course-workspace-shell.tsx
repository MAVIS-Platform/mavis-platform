"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  LayoutGrid,
  Users,
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
  | "submissions"
  | "members"
  | "results";

const TAB_LABELS: Record<
  Exclude<CourseWorkspaceTab, "results">,
  { en: string; vi: string; icon: LucideIcon }
> = {
  content: { en: "Overview & Setup", vi: "Tổng quan & Khởi tạo", icon: LayoutGrid },
  authoring: { en: "Curriculum & Materials", vi: "Đề cương & Học liệu", icon: GraduationCap },
  assignments: { en: "Labs & Quiz Studio", vi: "Thiết kế Lab & Quiz", icon: BookOpen },
  submissions: { en: "Grading & Gradebook", vi: "Chấm bài & Bảng điểm", icon: ClipboardCheck },
  members: { en: "Students & Access", vi: "Sinh viên & Phân quyền", icon: Users },
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
    <div className="space-y-5">
      <header className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground">
              <Link className="hover:text-foreground" href="/workspaces">
                {t("Classes", "Lớp học")}
              </Link>
              <span aria-hidden="true"> / </span>
              <span>{workspace.code || t("Class", "Lớp")}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{workspace.name}</h1>
              {workspace.code && (
                <Badge variant="outline" className="font-mono">
                  {workspace.code}
                </Badge>
              )}
              <Badge variant={workspace.status === "ARCHIVED" ? "secondary" : "success"}>
                {workspace.status ?? "ACTIVE"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
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
            className="mt-4 flex flex-wrap gap-1"
          >
            {visibleTabs.map((tab) => {
              const label = (isStudent ? STUDENT_TAB_LABELS[tab] : undefined) ?? TAB_LABELS[tab];
              const Icon = TAB_LABELS[tab].icon;
              const isCurrent = normalizedActive === tab;
              return (
                <Link
                  key={tab}
                  href={tabHref(workspace.id, tab)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isCurrent
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
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
