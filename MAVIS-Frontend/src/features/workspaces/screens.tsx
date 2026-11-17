"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
} from "./course-access";
import { ReferenceManagement } from "./reference-manage";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
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
  const canCreate = ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  const selected = query.data?.find((w) => w.id === workspaceId);
  const visibleWorkspaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = query.data ?? [];
    if (!term) return rows;
    return rows.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(term) ||
        (workspace.code ?? "").toLowerCase().includes(term),
    );
  }, [query.data, search]);
  const activeCount = (query.data ?? []).filter(
    (workspace) => (workspace.status ?? "ACTIVE") !== "ARCHIVED",
  ).length;
  const totalMembers = (query.data ?? []).reduce(
    (sum, workspace) => sum + (workspace.members?.length ?? 0),
    0,
  );
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
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {canCreate
              ? t(
                  "Open a class to organize modules, Labs, students and grading.",
                  "Mở một lớp để tổ chức chương, Lab, sinh viên và chấm điểm.",
                )
              : t("Classes you are enrolled in.", "Các lớp bạn đã ghi danh.")}
          </p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {query.data?.length ?? 0} {t("classes", "lớp")} · {activeCount} {t("active", "đang hoạt động")} ·{" "}
            {totalMembers} {t("members", "thành viên")} · {totalStudents} {t("students", "sinh viên")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(query.data?.length ?? 0) > 0 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="h-9 w-full pl-8 sm:w-64"
                value={search}
                placeholder={t("Search by class name or code", "Tìm theo tên hoặc mã lớp")}
                aria-label={t("Search classes", "Tìm lớp")}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          )}
          {canCreate && (
            <Button
              type="button"
              variant={showCreate ? "outline" : "default"}
              onClick={() => setShowCreate((open) => !open)}
            >
              {showCreate ? t("Close", "Đóng") : t("Create class", "Tạo lớp")}
            </Button>
          )}
        </div>
      </header>

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
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="hidden items-center gap-4 border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_15rem]">
              <span>{t("Class", "Lớp")}</span>
              <span>{t("Role", "Vai trò")}</span>
              <span>{t("Members", "Thành viên")}</span>
              <span>{t("Status", "Trạng thái")}</span>
              <span className="text-right">{t("Actions", "Thao tác")}</span>
            </div>
            {visibleWorkspaces.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("No class matches this search.", "Không có lớp nào khớp tìm kiếm.")}
              </p>
            ) : (
              <ul className="divide-y">
                {visibleWorkspaces.map((workspace) => {
                  const members = workspace.members ?? [];
                  const students = members.filter(
                    (member) => member.role.toUpperCase() === "STUDENT",
                  ).length;
                  const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
                  return (
                    <li
                      key={workspace.id}
                      className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_15rem] md:items-center"
                    >
                      <div className="min-w-0">
                        <Link
                          className="font-mono text-xs font-semibold tracking-wide text-primary hover:underline"
                          href={workspaceUrl}
                        >
                          {workspace.code || t("CLASS", "LỚP")}
                        </Link>
                        <Link
                          className="block truncate text-[15px] font-semibold tracking-tight text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          href={workspaceUrl}
                        >
                          {workspace.name}
                        </Link>
                        {workspace.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {workspace.description}
                          </p>
                        )}
                      </div>
                      <span className="hidden text-xs text-muted-foreground md:block">
                        {workspace.myRole || t("Member", "Thành viên")}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {members.length} {t("members", "thành viên")} · {students}{" "}
                        {t("students", "sinh viên")}
                      </span>
                      <StatusBadge
                        status={workspace.status ?? "ACTIVE"}
                        variant={workspace.status === "ARCHIVED" ? "secondary" : "default"}
                      />
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button asChild size="sm">
                          <Link href={workspaceUrl}>{t("Open", "Mở")}</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
                            {t("Submissions", "Bài nộp")}
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
      {workspace && (
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
                <CourseSetupPanel workspaceId={workspace.id} />
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
