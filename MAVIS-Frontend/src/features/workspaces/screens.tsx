"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { SearchInput, SelectField } from "@/components/shared/forms";
import { DataTable, DetailPanel, StatusBadge } from "@/components/shared/data";
import { CreateWorkspace, WorkspaceControls } from "./manage";
import {
  CourseEnrollment,
  CoursePasskey,
  CourseRoadmap,
  useCourseAuthoring,
  useCourseRoadmap,
  useWorkspaceGradebook,
} from "./course-access";
import { ReferenceManagement } from "./reference-manage";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { CourseRoadmap as CourseRoadmapScreen } from "@/features/courses/screens";
import { CourseOutline } from "@/features/courses/course-outline";
import { CourseBuilder } from "@/features/courses/course-builder";
import { CourseSetupPanel } from "@/features/courses/course-setup";
import { useLocale } from "@/lib/i18n/locale-context";

export function Workspaces() {
  const { t } = useLocale();
  const query = useApiQuery("workspaces", {});
  const session = useSession();
  const { workspaceId } = useSelection();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
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
  const activeCount = (query.data ?? []).filter(
    (workspace) => (workspace.status ?? "ACTIVE") !== "ARCHIVED",
  ).length;
  const totalStudents = (query.data ?? []).reduce(
    (sum, workspace) =>
      sum +
      (workspace.members ?? []).filter((member) => member.role.toUpperCase() === "STUDENT")
        .length,
    0,
  );
  if (workspaceId && selected) return <WorkspaceOverview />;
  return (
    <div className="space-y-6">
      {canCreate ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                "Open a class to organize modules, Labs, students and grading.",
                "Mở một lớp để tổ chức chương, Lab, sinh viên và chấm điểm.",
              )}
            </p>
            <Button
              type="button"
              variant={showCreate ? "outline" : "default"}
              onClick={() => setShowCreate((open) => !open)}
            >
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {showCreate ? t("Close", "Đóng") : t("Create class", "Tạo lớp")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{activeCount}</p>
                <p className="text-xs text-muted-foreground">{t("Active classes", "Lớp đang hoạt động")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{totalStudents}</p>
                <p className="text-xs text-muted-foreground">{t("Total students", "Tổng sinh viên")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ClipboardCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {submissions.isSuccess ? pendingReviews : "—"}
                </p>
                <p className="text-xs text-muted-foreground">{t("Pending submissions", "Bài nộp chờ chấm")}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="h-9 w-full pl-8"
                value={search}
                placeholder={t("Search by class name or code", "Tìm theo tên hoặc mã lớp")}
                aria-label={t("Search classes", "Tìm lớp")}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div
              role="group"
              aria-label={t("Filter classes", "Lọc lớp")}
              className="inline-flex rounded-lg border bg-card p-0.5"
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
                  onClick={() => setStatusFilter(id)}
                  className={
                    statusFilter === id
                      ? "rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
                      : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
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
      {session.data?.user?.role === "student" && <CourseEnrollment destination="roadmap" />}

      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={
          canCreate
            ? t(
                "You have no classes yet. Create the first class above.",
                "Bạn chưa có lớp nào. Hãy tạo lớp đầu tiên ở trên.",
              )
            : t(
                "You are not enrolled in a class yet. Enter your Passkey above to join.",
                "Bạn chưa ghi danh lớp nào. Nhập Passkey ở trên để tham gia.",
              )
        }
      >
        {!canCreate ? (
          <div className="grid gap-4 md:grid-cols-2">
            {query.data?.map((workspace) => {
              const members = workspace.members ?? [];
              const students = members.filter(
                (member) => member.role.toUpperCase() === "STUDENT",
              ).length;
              const lecturers = members
                .filter((member) => member.role.toUpperCase() === "LECTURER")
                .map((member) => member.name);
              const roadmapUrl = `/roadmap?workspace=${encodeURIComponent(workspace.id)}`;
              return (
                <article
                  key={workspace.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">
                        {workspace.code || t("CLASS", "LỚP")}
                      </span>
                      <StatusBadge
                        status={workspace.status ?? "ACTIVE"}
                        variant={workspace.status === "ARCHIVED" ? "secondary" : "default"}
                      />
                    </div>
                    <Link
                      className="block w-fit max-w-full break-words text-lg font-semibold tracking-tight text-foreground hover:text-primary hover:underline"
                      href={roadmapUrl}
                    >
                      {workspace.name}
                    </Link>
                    {workspace.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {workspace.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {lecturers.length
                        ? `${t("Lecturer", "Giảng viên")}: ${lecturers.join(", ")} · `
                        : ""}
                      {students} {t("students", "sinh viên")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button asChild size="sm">
                      <Link href={roadmapUrl}>
                        {t("Enter class & Lab roadmap", "Vào lớp & Lộ trình Lab")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
                        {t("Submissions & Grades", "Bài nộp & Điểm")}
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleWorkspaces.map((workspace) => {
              const members = workspace.members ?? [];
              const students = members.filter(
                (member) => member.role.toUpperCase() === "STUDENT",
              ).length;
              const archived = (workspace.status ?? "ACTIVE") === "ARCHIVED";
              const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
              return (
                <article
                  key={workspace.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-primary">
                      {workspace.code || t("CLASS", "LỚP")}
                    </span>
                    {archived ? (
                      <span className="text-xs text-muted-foreground">{t("Archived", "Lưu trữ")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                        {t("Active", "Đang hoạt động")}
                      </span>
                    )}
                  </div>
                  <Link
                    className="truncate text-2xl font-semibold tracking-tight text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <ClipboardCheck className="size-3.5" aria-hidden="true" />
                        {pendingByWorkspace.get(workspace.id) ?? 0}{" "}
                        {t("pending submissions", "bài chờ chấm")}
                      </span>
                    )}
                  </div>
                  <Button asChild className="mt-auto w-full">
                    <Link href={workspaceUrl}>{t("Open class", "Mở lớp")}</Link>
                  </Button>
                </article>
              );
            })}
            {visibleWorkspaces.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground md:col-span-2">
                {t("No class matches this search or filter.", "Không có lớp nào khớp tìm kiếm hoặc bộ lọc.")}
              </p>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="size-5" aria-hidden="true" />
                {t("Create class", "Tạo lớp")}
              </button>
            )}
          </div>
        )}
      </RequestState>
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
  const assignmentsQuery = useApiQuery(
    "assignments",
    { workspaceId: workspace?.id ?? "" },
    { enabled: Boolean(workspace?.id && canManage) },
  );
  const authoring = useCourseAuthoring(workspace?.id ?? "", Boolean(workspace?.id && canManage));
  const roadmap = useCourseRoadmap(workspace?.id ?? "");
  const studentCount = (workspace?.members ?? []).filter(
    (member) => member.role.toUpperCase() === "STUDENT",
  ).length;
  const moduleCount = authoring.data?.modules?.length ?? 0;
  const itemCount =
    authoring.data?.modules?.reduce((sum, mod) => sum + mod.items.length, 0) ?? 0;
  const totalLabs = assignmentsQuery.data?.length ?? 0;
  const publishedLabs = roadmap.data?.labs?.length ?? 0;

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
                <Button asChild size="sm" variant="outline">
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
            {canManage && activeTab !== "authoring" && (
              <section
                aria-label={t("Class KPIs", "Chỉ số lớp học")}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("Enrolled Students", "Sinh viên tham gia")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{studentCount}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("Curriculum Modules & Items", "Chương & Học liệu")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {moduleCount}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({itemCount} {t("items", "mục")})
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("Labs Published", "Lab đã công bố")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {publishedLabs}/{totalLabs}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("Course Status", "Trạng thái khóa học")}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {authoring.data?.publishedVersion
                      ? `v${authoring.data.publishedVersion} · ${t("Published", "Đã xuất bản")}`
                      : t("Draft / Setup", "Nháp / Thiết lập")}
                  </p>
                </div>
              </section>
            )}
            {activeTab === "outline" && !canManage && (
              <CourseRoadmap
                key={`student-roadmap-${workspace.id}`}
                workspaceId={workspace.id}
                canManage={false}
                active={workspace.status !== "ARCHIVED"}
              />
            )}
            {activeTab === "outline" && canManage && (
              <div className="space-y-5">
                <div id="class-passkey">
                  <CoursePasskey workspaceId={workspace.id} />
                </div>
                <CourseOutline
                  workspaceId={workspace.id}
                  canManage
                  active={workspace.status !== "ARCHIVED"}
                />
              </div>
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
