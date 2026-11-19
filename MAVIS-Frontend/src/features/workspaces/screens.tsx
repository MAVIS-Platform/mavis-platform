"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, ClipboardCheck, Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CourseCover } from "@/components/course-cover";
import { useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { DataTable, DetailPanel } from "@/components/shared/data";
import { CreateWorkspace, WorkspaceControls } from "./manage";
import {
  CoursePasskey,
  CourseRoadmap,
  useWorkspaceGradebook,
} from "./course-access";
import { ReferenceManagement } from "./reference-manage";
import { ClassPasskeyDialog, CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { LecturerCurriculumManager } from "@/features/courses/lecturer-curriculum-manager";
import { Courses, CourseRoadmap as CourseRoadmapScreen } from "@/features/courses/screens";
import { CourseOutline } from "@/features/courses/course-outline";
import { CourseBuilder } from "@/features/courses/course-builder";
import { CourseSetupPanel } from "@/features/courses/course-setup";
import { useLocale } from "@/lib/i18n/locale-context";

const WORKSPACES_PER_PAGE = 6;

export function Workspaces() {
  const { t } = useLocale();
  const query = useApiQuery("workspaces", {});
  const session = useSession();
  const { workspaceId } = useSelection();
  const [showCreate, setShowCreate] = useState(false);
  const [passkeyWorkspaceId, setPasskeyWorkspaceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [page, setPage] = useState(1);
  const canCreate = ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  const submissions = useApiQuery("submissions", {}, { enabled: canCreate });
  const selected = query.data?.find((w) => w.id === workspaceId);
  const visibleWorkspaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((workspace) => {
      const archived = (workspace.status ?? "ACTIVE") === "ARCHIVED";
      if (statusFilter === "active" && archived) return false;
      if (statusFilter === "archived" && !archived) return false;
      return (
        !term ||
        workspace.name.toLowerCase().includes(term) ||
        (workspace.code ?? "").toLowerCase().includes(term)
      );
    });
  }, [query.data, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleWorkspaces.length / WORKSPACES_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pagedWorkspaces = visibleWorkspaces.slice(
    (currentPage - 1) * WORKSPACES_PER_PAGE,
    currentPage * WORKSPACES_PER_PAGE,
  );
  const pendingReviews = (submissions.data ?? []).filter(
    (submission) => !submission.reviewStatus || submission.reviewStatus === "PENDING",
  ).length;
  const pendingByWorkspace = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissions.data ?? []) {
      if (!submission.workspaceId) continue;
      if (submission.reviewStatus && submission.reviewStatus !== "PENDING") continue;
      counts.set(submission.workspaceId, (counts.get(submission.workspaceId) ?? 0) + 1);
    }
    return counts;
  }, [submissions.data]);
  if (workspaceId && selected) return <WorkspaceOverview />;
  if (session.data?.user && !canCreate) return <Courses />;
  return (
    <div
      className={
        canCreate
          ? "flex min-h-[calc(100svh-var(--header-height)-4rem)] flex-col gap-8 rounded-lg bg-background p-6 md:p-8"
          : "space-y-6"
      }
    >
      {canCreate ? (
        <div className="space-y-7">
          <header className="mavis-hero-surface px-6 py-7 text-white md:px-8">
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-2xl">
                <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                  <span className="h-1 w-6 rounded-full bg-teal-300" />
                  {t("Your teaching space", "Không gian giảng dạy")}
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {t("A great class starts here.", "Khởi đầu cho một lớp học tuyệt vời.")}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-sky-100/90">
                  {t(
                    "Open a class to organize modules, Labs, students and grading.",
                    "Mở một lớp để tổ chức chương, Lab, sinh viên và chấm điểm.",
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-white px-5 font-semibold text-slate-950 shadow-sm hover:bg-sky-50"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  {t("Create class", "Tạo lớp")}
                </Button>
              </div>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
              <ClipboardCheck className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("Needs your attention", "Cần bạn xem xét")}
              </p>
              <p className="mt-1 text-lg font-semibold">
                {submissions.isSuccess ? pendingReviews : "—"}{" "}
                {t("submissions to review", "bài nộp chờ chấm")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {(query.data ?? [])
                  .filter((w) => pendingByWorkspace.has(w.id))
                  .map(
                    (w) =>
                      w.name +
                      " · " +
                      pendingByWorkspace.get(w.id) +
                      " " +
                      t("submission(s)", "bài nộp"),
                  )
                  .join(" · ") || t("Your classes are up to date.", "Các lớp đã được cập nhật.")}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-lg border-blue-200 text-[#0056d2] hover:bg-blue-50"
            >
              <Link href="/submissions">
                {t("Review submissions", "Chấm bài nộp")}
                <span className="ml-2" aria-hidden="true">
                  →
                </span>
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold">{t("Your classes", "Các lớp của bạn")}</h2>
            <div className="relative order-last w-full sm:order-none sm:ml-auto sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="h-9 w-full pl-8"
                value={search}
                placeholder={t("Search by class name or code", "Tìm theo tên hoặc mã lớp")}
                aria-label={t("Search classes", "Tìm lớp")}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div
              role="group"
              aria-label={t("Filter classes", "Lọc lớp")}
              className="inline-flex gap-3"
            >
              {(
                [
                  ["all", t("All", "Tất cả")],
                  ["active", t("Active", "Đang hoạt động")],
                  ["archived", t("Archived", "Lưu trữ")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={statusFilter === id}
                  onClick={() => {
                    setStatusFilter(id);
                    setPage(1);
                  }}
                  className={
                    statusFilter === id
                      ? "rounded-full bg-[#0056d2] px-4 py-2 text-sm text-white"
                      : "rounded-full border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("Classes you are enrolled in.", "Các lớp bạn đã ghi danh.")}
          </p>
        </header>
      )}

      {canCreate && showCreate && <CreateWorkspace onClose={() => setShowCreate(false)} />}
      {passkeyWorkspaceId && (
        <ClassPasskeyDialog
          workspaceId={passkeyWorkspaceId}
          onClose={() => setPasskeyWorkspaceId(null)}
        />
      )}

      <RequestState query={query} empty={false}>
        {Boolean(query.data?.length) && (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {pagedWorkspaces.map((workspace) => {
            const pending = pendingByWorkspace.get(workspace.id) ?? 0;
            const members = workspace.members ?? [];
            const students = members.filter(
              (member) => member.role.toUpperCase() === "STUDENT",
            ).length;
            const archived = (workspace.status ?? "ACTIVE") === "ARCHIVED";
            const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
            return (
              <article
                key={workspace.id}
                className="flex min-h-[350px] flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                <CourseCover
                  courseId={workspace.id}
                  className="flex items-start justify-between gap-2 p-3"
                >
                  <span className="relative rounded bg-white px-2 py-1 text-xs font-semibold text-slate-900">
                    {workspace.code || t("CLASS", "LỚP")}
                  </span>
                  {archived ? (
                    <span className="text-xs text-muted-foreground">
                      {t("Archived", "Lưu trữ")}
                    </span>
                  ) : (
                    <span className="relative inline-flex items-center gap-1 rounded bg-white/95 px-2 py-1 text-xs text-emerald-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      {t("Active", "Đang hoạt động")}
                    </span>
                  )}
                </CourseCover>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("Lecturer", "Giảng viên")}
                  </p>
                  <Link
                    className="truncate text-xl font-semibold tracking-tight text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={workspaceUrl}
                  >
                    {workspace.name}
                  </Link>
                  {workspace.description && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {workspace.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {students} {t("students", "sinh viên")}
                    </span>
                    {submissions.isSuccess && (
                      <span
                        className={
                          (pendingByWorkspace.get(workspace.id) ?? 0) > 0
                            ? "inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                            : "inline-flex items-center gap-1"
                        }
                      >
                        {pending > 0 ? (
                          <Clock3 className="size-3.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        )}
                        {pending > 0
                          ? pending + " " + t("to grade", "bài chờ chấm")
                          : t("Up to date", "Đã cập nhật")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPasskeyWorkspaceId(workspace.id)}
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      {t("Passkey", "Passkey lớp")}
                    </button>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-3 border-t pt-4">
                    <Button asChild className="bg-[#0056d2] text-white hover:bg-[#0046ad]">
                      <Link href={workspaceUrl}>{t("Open class", "Mở lớp")}</Link>
                    </Button>
                    <Button asChild variant="outline" className="border-[#0056d2] text-[#0056d2]">
                      <Link href={"/submissions?workspace=" + encodeURIComponent(workspace.id)}>
                        {t("Submissions", "Bài nộp")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
              {visibleWorkspaces.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  {t(
                    "No class matches this search or filter.",
                    "Không có lớp nào khớp tìm kiếm hoặc bộ lọc.",
                  )}
                </p>
              )}
            </div>
            {pageCount > 1 && (
              <div className="mt-6">
                <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </RequestState>
      {canCreate && (
        <footer className="mt-auto border-t pt-8 text-center text-sm text-muted-foreground">
          © MAVIS — Architecture Learning &amp; Analysis
        </footer>
      )}
    </div>
  );
}

export function WorkspaceOverview() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const session = useSession();
  const query = useApiQuery("workspaces", {});
  const workspace = query.data?.find((w) => w.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const requestedView = params.get("view");
  const activeTab =
    canManage && requestedView === "course-authoring"
      ? "authoring"
      : canManage && requestedView === "course-setup"
        ? "setup"
        : "outline";

  return (
    <RequestState query={query} empty={!workspace}>
      {workspace && !canManage && <CourseRoadmapScreen />}
      {workspace && canManage && (
        <CourseWorkspaceShell
          workspace={workspace}
          active={activeTab === "authoring" ? "authoring" : "content"}
          actions={
            canManage ? (
              <>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white"
                >
                  <Link href={`/assignments?workspace=${encodeURIComponent(workspace.id)}`}>
                    {t("Manage Labs", "Quản lý Lab")}
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
                    {t("Review submissions", "Chấm bài nộp")}
                  </Link>
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="space-y-5">
            {activeTab === "outline" && !canManage && (
              <CourseRoadmap
                key={`student-roadmap-${workspace.id}`}
                workspaceId={workspace.id}
                canManage={false}
                active={workspace.status !== "ARCHIVED"}
              />
            )}
            {activeTab === "outline" && canManage && (
              <LecturerCurriculumManager
                workspaceId={workspace.id}
                active={workspace.status !== "ARCHIVED"}
              />
            )}
            {activeTab === "outline" && !canManage && (
              <CourseOutline
                workspaceId={workspace.id}
                canManage={false}
                active={workspace.status !== "ARCHIVED"}
              />
            )}
            {activeTab === "authoring" && canManage && <CourseBuilder workspaceId={workspace.id} />}
            {activeTab === "setup" && canManage && (
              <div className="space-y-5">
                <CourseSetupPanel workspaceId={workspace.id} />
                <div id="class-passkey">
                  <CoursePasskey workspaceId={workspace.id} />
                </div>
                <CourseRoadmap
                  key={workspace.id}
                  workspaceId={workspace.id}
                  canManage
                  active={workspace.status !== "ARCHIVED"}
                />
              </div>
            )}
          </div>
        </CourseWorkspaceShell>
      )}
    </RequestState>
  );
}

export function WorkspaceMembers() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const session = useSession();
  const query = useApiQuery("workspaces", {});
  const remove = useApiMutation("removeWorkspaceMember");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const workspace = query.data?.find((w) => w.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const gradebook = useWorkspaceGradebook(workspaceId ?? "", Boolean(workspaceId && canManage));
  const studentStatsById = new Map(
    (gradebook.data?.students ?? []).map((entry) => [entry.studentId, entry]),
  );
  const totalLabs = gradebook.data?.labs.length ?? 0;
  const filteredMembers = (workspace?.members ?? []).filter((m) => {
    const matchesSearch =
      !search.trim() ||
      m.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      m.role.toLowerCase().includes(search.trim().toLowerCase());
    const matchesRole = roleFilter === "ALL" || m.role.toUpperCase() === roleFilter;
    return matchesSearch && matchesRole;
  });
  return (
    <RequestState query={query} empty={!workspace}>
      {workspace && (
        <CourseWorkspaceShell workspace={workspace} active="members">
          <div className="space-y-4">
            {canManage && (
              <div className="rounded-xl border bg-card p-4">
                <WorkspaceControls key={workspace.id} workspace={workspace} mode="members" />
              </div>
            )}
            {canManage && (
              <div id="class-passkey">
                <CoursePasskey workspaceId={workspace.id} />
              </div>
            )}
            {canManage && (
              <details className="rounded-xl border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("Class settings", "Thiết lập lớp")}
                </summary>
                <WorkspaceControls
                  key={`${workspace.id}-settings`}
                  workspace={workspace}
                  mode="overview"
                />
              </details>
            )}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <SearchInput
                label={t("Filter members", "Lọc thành viên")}
                value={search}
                onChange={setSearch}
              />
              <SelectField
                label={t("Role", "Vai trò")}
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "ALL", label: t("All roles", "Tất cả vai trò") },
                  { value: "STUDENT", label: t("Student", "Sinh viên") },
                  { value: "LECTURER", label: t("Lecturer", "Giảng viên") },
                ]}
              />
            </div>
            {remove.error && <ErrorState error={remove.error} />}
            <DataTable
              rows={filteredMembers}
              rowKey={(m) => m.id}
              caption={t("Class members", "Thành viên lớp")}
              columns={[
                { key: "name", label: t("Name", "Họ tên"), render: (m) => m.name },
                { key: "role", label: t("Role", "Vai trò"), render: (m) => m.role },
                {
                  key: "progress",
                  label: t("Learning Progress", "Tiến Độ Học Tập"),
                  render: (m) => {
                    if (m.role.toUpperCase() !== "STUDENT") {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const stats = studentStatsById.get(m.id);
                    const passed = stats?.passedLabs ?? 0;
                    const pct = totalLabs > 0 ? Math.round((passed / totalLabs) * 100) : 0;
                    return (
                      <div className="min-w-36 space-y-1">
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {passed}/{totalLabs} Labs
                          </span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={t("Student Lab progress", "Tiến độ Lab sinh viên")}
                          aria-valuemin={0}
                          aria-valuemax={totalLabs || 1}
                          aria-valuenow={passed}
                          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "avgScore",
                  label: t("Average Score", "Điểm Trung Bình"),
                  render: (m) => {
                    if (m.role.toUpperCase() !== "STUDENT") {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const stats = studentStatsById.get(m.id);
                    if (stats?.averageScore == null) {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    return (
                      <span
                        className={
                          stats.averageScore > 50
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "font-semibold text-amber-700 dark:text-amber-400"
                        }
                      >
                        {stats.averageScore}/100
                      </span>
                    );
                  },
                },
                ...(canManage
                  ? [
                      {
                        key: "actions",
                        label: t("Actions", "Thao tác"),
                        render: (m: { id: string; name: string; role: string }) =>
                          workspace &&
                          m.id !== workspace.createdById &&
                          m.id !== session.data?.user?.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove ${m.name} from this class?`))
                                  remove.mutate({ workspaceId: workspace.id, userId: m.id });
                              }}
                            >
                              {t("Remove", "Xóa")}
                            </Button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </CourseWorkspaceShell>
      )}
    </RequestState>
  );
}

export function ReferenceVersions() {
  const { workspaceId } = useSelection();
  const query = useApiQuery(
    "referenceVersions",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  return workspaceId ? (
    <div className="space-y-5">
      <ReferenceManagement key={workspaceId} workspaceId={workspaceId} />
      <RequestState query={query} empty={!query.data?.length}>
        {query.data?.map((reference) => (
          <DetailPanel key={reference.id} title={reference.snapshot.name}>
            <p className="break-all text-sm text-muted-foreground">
              Reference source {reference.snapshot.id} · model {reference.model.id} · revision{" "}
              {reference.model.revision}
            </p>
            <DataTable
              rows={reference.model.elements}
              rowKey={(e) => e.id}
              caption="Reference architecture elements"
              columns={[
                { key: "name", label: "Element", render: (e) => e.name },
                { key: "description", label: "Description", render: (e) => e.description },
              ]}
            />
          </DetailPanel>
        ))}
      </RequestState>
    </div>
  ) : null;
}
