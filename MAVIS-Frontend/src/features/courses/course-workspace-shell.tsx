"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";

export type CourseWorkspaceTab = "content" | "members" | "submissions" | "results";

const TAB_LABELS: Record<CourseWorkspaceTab, { en: string; vi: string }> = {
  content: { en: "Class content", vi: "Nội dung lớp" },
  members: { en: "Members", vi: "Thành viên" },
  submissions: { en: "Submissions", vi: "Bài nộp" },
  results: { en: "Results", vi: "Kết quả" },
};

function tabHref(workspaceId: string, tab: CourseWorkspaceTab) {
  const workspace = encodeURIComponent(workspaceId);
  if (tab === "content") return `/workspace-overview?workspace=${workspace}`;
  if (tab === "members") return `/members?workspace=${workspace}`;
  if (tab === "results") return `/submissions?workspace=${workspace}&view=results`;
  return `/submissions?workspace=${workspace}`;
}

export function CourseWorkspaceShell({
  workspace,
  active,
  actions,
  children,
}: {
  workspace: Response<"workspaces">[number];
  active: CourseWorkspaceTab;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const members = workspace.members ?? [];
  const students = members.filter((member) => member.role.toUpperCase() === "STUDENT").length;
  const lecturers = members.filter((member) => member.role.toUpperCase() === "LECTURER").length;
  const isStudent = workspace.myRole?.toUpperCase() === "STUDENT";
  const visibleTabs = (Object.keys(TAB_LABELS) as CourseWorkspaceTab[]).filter(
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
              {members.length} {t("members", "thành viên")} · {students} {t("students", "sinh viên")} ·{" "}
              {lecturers} {t("lecturers", "giảng viên")} · {workspace.myRole || t("Member", "Thành viên")}
            </p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <nav aria-label={t("Class sections", "Các mục của lớp")} className="mt-4 flex flex-wrap gap-1">
          {visibleTabs.map((tab) => {
            const label = TAB_LABELS[tab];
            return (
              <Link
                key={tab}
                href={tabHref(workspace.id, tab)}
                aria-current={active === tab ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active === tab
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(label.en, label.vi)}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
