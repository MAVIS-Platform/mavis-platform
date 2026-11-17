"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { SearchInput, SelectField } from "@/components/shared/forms";
import { DataTable, DetailPanel, StatusBadge } from "@/components/shared/data";
import { CreateWorkspace, WorkspaceControls } from "./manage";
import {
  CoursePasskey,
  CourseRoadmap,
  useCourseAuthoring,
  useCourseRoadmap,
} from "./course-access";
import { ReferenceManagement } from "./reference-manage";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { Courses } from "@/features/courses/screens";
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
  const canCreate = ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  const selected = query.data?.find((w) => w.id === workspaceId);
  if (workspaceId && selected) return <WorkspaceOverview />;
  if (session.data?.user && !canCreate) return <Courses />;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {canCreate
            ? t(
                "Open a class to organize modules, Labs, students and grading.",
                "Mở một lớp để tổ chức chương, Lab, sinh viên và chấm điểm.",
              )
            : t("Classes you are enrolled in.", "Các lớp bạn đã ghi danh.")}
        </p>
        {canCreate && (
          <Button
            type="button"
            variant={showCreate ? "outline" : "default"}
            onClick={() => setShowCreate((open) => !open)}
          >
            {showCreate ? t("Close", "Đóng") : t("Create class", "Tạo lớp")}
          </Button>
        )}
      </header>

      {canCreate && showCreate && <CreateWorkspace onClose={() => setShowCreate(false)} />}

      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={t(
          "You have no classes yet. Create the first class above.",
          "Bạn chưa có lớp nào. Hãy tạo lớp đầu tiên ở trên.",
        )}
      >
        <ul className="divide-y divide-border/70 border-y border-border/70">
            {query.data?.map((workspace) => {
              const members = workspace.members ?? [];
              const students = members.filter(
                (member) => member.role.toUpperCase() === "STUDENT",
              ).length;
              const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
              return (
                <li
                  key={workspace.id}
                  className="grid gap-x-6 gap-y-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:py-6"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="font-mono font-medium tracking-wide text-primary">
                        {workspace.code || t("CLASS", "LỚP")}
                      </span>
                      <span aria-hidden="true" className="text-border">
                        /
                      </span>
                      <span>{workspace.myRole || t("Member", "Thành viên")}</span>
                      <StatusBadge
                        status={workspace.status ?? "ACTIVE"}
                        variant={workspace.status === "ARCHIVED" ? "secondary" : "default"}
                      />
                    </div>
                    <Link
                      className="block w-fit max-w-full break-words text-lg font-semibold tracking-tight text-foreground decoration-primary decoration-2 underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xl"
                      href={workspaceUrl}
                    >
                      {workspace.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {members.length} {t("members", "thành viên")}{" "}
                      <span aria-hidden="true">·</span> {students} {t("students", "sinh viên")}
                    </p>
                    {workspace.description && (
                      <p className="max-w-3xl text-sm leading-6 text-foreground/75">
                        {workspace.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button asChild size="sm">
                      <Link href={workspaceUrl}>{t("Open class", "Mở lớp")}</Link>
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
