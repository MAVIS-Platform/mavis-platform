"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ClipboardCheck,
  Copy,
  FilePlus2,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Map,
  RefreshCw,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCoursePasskeys,
  useCreateCoursePasskey,
  useDeleteCoursePasskey,
} from "@/features/workspaces/course-access";
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
    en: "Overview & Setup",
    vi: "Tổng quan & Khởi tạo",
    icon: LayoutGrid,
    href: (ws) => `/workspace-overview?workspace=${encodeURIComponent(ws)}`,
  },
  {
    id: "authoring",
    en: "Curriculum & Materials",
    vi: "Đề cương & Học liệu",
    icon: GraduationCap,
    href: (ws) => `/workspace-overview?workspace=${encodeURIComponent(ws)}&view=course-authoring`,
  },
  {
    id: "lab-authoring",
    en: "Lab Creation",
    vi: "Tạo Lab",
    icon: FilePlus2,
    href: (ws) => `/lab-authoring?workspace=${encodeURIComponent(ws)}`,
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
    en: "Students & Access",
    vi: "Sinh viên & Phân quyền",
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

function ClassHeaderPasskey({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const passkeysQuery = useCoursePasskeys(workspaceId);
  const createKey = useCreateCoursePasskey(workspaceId);
  const deleteKey = useDeleteCoursePasskey(workspaceId);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoCreatedForWorkspaceRef = useRef<string | null>(null);

  const activePasskeys = (passkeysQuery.data ?? []).filter((pk) => pk.active && pk.code);
  const currentKey = activePasskeys[0] ?? null;
  const busy = createKey.isPending || deleteKey.isPending;

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#class-passkey") {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (
      passkeysQuery.isSuccess &&
      activePasskeys.length === 0 &&
      !createKey.isPending &&
      autoCreatedForWorkspaceRef.current !== workspaceId
    ) {
      autoCreatedForWorkspaceRef.current = workspaceId;
      createKey.mutate({ validHours: 720 });
    }
  }, [passkeysQuery.isSuccess, activePasskeys.length, createKey, workspaceId]);

  const handleRegenerate = async () => {
    const oldKeys = [...activePasskeys];
    await createKey.mutateAsync({ validHours: 720 });
    for (const old of oldKeys) {
      await deleteKey.mutateAsync(old.id).catch(() => undefined);
    }
    setCopied(false);
  };

  return (
    <>
      <button
        id="class-passkey"
        type="button"
        onClick={() => {
          setOpen(true);
          if (activePasskeys.length === 0 && !createKey.isPending) {
            createKey.mutate({ validHours: 720 });
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/20 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-100 transition hover:bg-amber-400/30"
        title={t("Click to view or regenerate Class Passkey", "Bấm để xem hoặc tạo lại mã Passkey lớp học")}
      >
        <KeyRound className="size-3.5 text-amber-200" aria-hidden="true" />
        <span>
          {currentKey?.code
            ? `${t("Key", "Key")}: ${currentKey.code}`
            : t("Class Passkey", "Mã lớp (Passkey)")}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Class Passkey", "Mã ghi danh lớp học")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  {t("Class Passkey", "Mã Ghi Danh Lớp Học")}
                </p>
                <h2 className="mt-1 text-base font-bold">
                  {t("Auto-generated Enrollment Key", "Mã Passkey Tự Động Cho Sinh Viên")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(
                    "Share this key with students so they can join the class immediately.",
                    "Gửi mã này cho sinh viên để nhập và vào lớp ngay lập tức.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Close", "Đóng")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300/80 bg-emerald-50/60 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <span className="select-all font-mono text-xl font-bold tracking-wider text-emerald-950 dark:text-emerald-100">
                {currentKey?.code ??
                  (busy
                    ? t("Generating…", "Đang tạo mã…")
                    : t("No active key", "Chưa có mã"))}
              </span>
              {currentKey?.code && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(currentKey.code ?? "").then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 size-3.5 text-emerald-600" aria-hidden="true" />
                      {t("Copied", "Đã chép")}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("Copy", "Sao chép")}
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleRegenerate()}
              >
                <RefreshCw
                  className={cn("mr-1.5 size-3.5", busy && "animate-spin")}
                  aria-hidden="true"
                />
                {busy
                  ? t("Regenerating…", "Đang tạo lại…")
                  : t("Regenerate Key", "Regenerate (Tạo mã mới)")}
              </Button>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                {t("Done", "Xong")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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
  const isStudent = workspace.myRole?.toUpperCase() === "STUDENT";
  const activeStaffTab = resolveStaffTab(pathname, active);
  const activeStudentTab = resolveStudentTab(pathname, active);

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-600 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
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
              {!isStudent && <ClassHeaderPasskey workspaceId={workspace.id} />}
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs text-white/80">
              <Users className="size-3.5" aria-hidden="true" />
              <span>
                {students} {t("students", "sinh viên")}
              </span>
            </p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {showTabs && (
          <nav
            aria-label={t("Class sections", "Các mục của lớp")}
            className="mt-5 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto rounded-xl bg-black/20 p-1.5 backdrop-blur-sm"
          >
            <div className="flex flex-nowrap gap-1">
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
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
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
      {children}
    </div>
  );
}
