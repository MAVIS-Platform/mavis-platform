"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, ClipboardCheck, Plus, Search, Settings2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CourseCover } from "@/components/course-cover";
import { useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { Pagination, SearchInput } from "@/components/shared/forms";
import { DataTable, DetailPanel } from "@/components/shared/data";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CreateWorkspace, WorkspaceControls } from "./manage";
import {
  CoursePasskey,
  CourseRoadmap,
  type AuthoringCourse,
  useCourseAuthoring,
  useWorkspaceGradebook,
} from "./course-access";
import { ReferenceManagement } from "./reference-manage";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { LecturerCurriculumManager } from "@/features/courses/lecturer-curriculum-manager";
import { Courses, CourseRoadmap as CourseRoadmapScreen } from "@/features/courses/screens";
import { CourseOutline } from "@/features/courses/course-outline";
import { CourseBuilder } from "@/features/courses/course-builder";
import { CourseContentHub } from "@/features/courses/course-content-hub";
import {
  CourseSetupFlowFrame,
  courseSetupStepHref,
  type CourseContentStep,
} from "@/features/courses/course-setup-flow-navigation";
import { QuizLibrary } from "@/features/courses/quiz-library";
import { CourseSetupPanel } from "@/features/courses/course-setup";
import { useLocale } from "@/lib/i18n/locale-context";
import { api } from "@/lib/mainflow-api";
import {
  decodePlainTextEntities,
  formatTenScaleScore,
  toTenScaleScore,
} from "@/lib/format/course-display";
import {
  canEditLecturerCourse,
  lecturerCourseAccess,
} from "@/features/lecturer/application/course-access-policy";

const WORKSPACES_PER_PAGE = 6;

export function Workspaces() {
  const { t } = useLocale();
  const query = useApiQuery("workspaces", {});
  const session = useSession();
  const { workspaceId } = useSelection();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [activationIssueById, setActivationIssueById] = useState<Record<string, string>>({});
  const updateWorkspace = useApiMutation("updateWorkspace");
  const canCreate = ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  const submissions = useApiQuery("submissions", {}, { enabled: canCreate });
  const selected = query.data?.find((w) => w.id === workspaceId);
  const visibleWorkspaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((workspace) => {
      const inactive = (workspace.status ?? "ACTIVE") !== "ACTIVE";
      if (statusFilter === "active" && inactive) return false;
      if (statusFilter === "inactive" && !inactive) return false;
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
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {t("Course Management", "Quản lý khóa học")}
                </h1>
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
                {submissions.isLoading ? "…" : submissions.isSuccess ? pendingReviews : 0}{" "}
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
              className="rounded-lg border-primary/40 text-primary hover:bg-primary/10"
            >
              <Link
                href={(() => {
                  const firstPendingWs = (query.data ?? []).find(
                    (w) => (pendingByWorkspace.get(w.id) ?? 0) > 0,
                  )?.id;
                  return firstPendingWs
                    ? `/submissions?workspace=${encodeURIComponent(firstPendingWs)}&status=PENDING`
                    : pendingReviews > 0
                      ? "/submissions?status=PENDING"
                      : "/submissions";
                })()}
              >
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
                  ["inactive", t("Inactive", "Không hoạt động")],
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
                const creatorName =
                  workspace.createdByName?.trim() ||
                  (workspace.createdById
                    ? members.find((member) => member.id === workspace.createdById)?.name?.trim()
                    : undefined) ||
                  members
                    .find((member) => member.role.toUpperCase() === "LECTURER")
                    ?.name?.trim() ||
                  "";
                const inactive = (workspace.status ?? "ACTIVE") !== "ACTIVE";
                const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
                return (
                  <article
                    key={workspace.id}
                    role="link"
                    tabIndex={0}
                    aria-label={t(`Open ${workspace.name}`, `Mở ${workspace.name}`)}
                    onClick={() => window.location.assign(workspaceUrl)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        window.location.assign(workspaceUrl);
                      }
                    }}
                    className="group flex min-h-[350px] cursor-pointer flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200 ease-out hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:-translate-y-1 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:translate-y-0 active:scale-[0.99]"
                  >
                    <CourseCover
                      courseId={workspace.id}
                      className="flex items-start justify-between gap-2 p-3"
                    >
                      <span className="relative rounded bg-white px-2 py-1 text-xs font-semibold text-slate-900">
                        {workspace.code || t("CLASS", "LỚP")}
                      </span>
                      <div
                        className="relative flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow-sm"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Switch
                          checked={!inactive}
                          disabled={changingStatusId === workspace.id}
                          aria-label={t(
                            `Set ${workspace.name} ${inactive ? "active" : "inactive"}`,
                            `Chuyển ${workspace.name} sang ${inactive ? "hoạt động" : "không hoạt động"}`,
                          )}
                          onCheckedChange={async (active) => {
                            const confirmed = window.confirm(
                              active
                                ? t(
                                    "Activate this course? All valid Labs and the latest course draft will be published for students.",
                                    "Kích hoạt khóa học? Tất cả Lab hợp lệ và bản nháp mới nhất sẽ được xuất bản cho sinh viên.",
                                  )
                                : t(
                                    "Set this course to Inactive? Students will temporarily lose access while you edit its content.",
                                    "Chuyển khóa học sang Inactive? Sinh viên sẽ tạm mất quyền truy cập trong lúc bạn chỉnh sửa nội dung.",
                                  ),
                            );
                            if (!confirmed) return;
                            setChangingStatusId(workspace.id);
                            setActivationIssueById((current) => {
                              const next = { ...current };
                              delete next[workspace.id];
                              return next;
                            });
                            try {
                              if (active) {
                                const course = await api<AuthoringCourse>(
                                  `workspaces/${workspace.id}/course`,
                                ).catch(() => null);
                                const incomplete =
                                  !course ||
                                  course.modules.length === 0 ||
                                  course.modules.some((module) => module.items.length === 0);
                                if (incomplete) {
                                  setActivationIssueById((current) => ({
                                    ...current,
                                    [workspace.id]: t(
                                      "Complete the Course content and place at least one item in every Module before activation.",
                                      "Hãy hoàn tất nội dung và xếp ít nhất một nội dung vào mỗi Module trước khi kích hoạt.",
                                    ),
                                  }));
                                  return;
                                }
                              }
                              await updateWorkspace.mutateAsync({
                                workspaceId: workspace.id,
                                name: workspace.name,
                                status: active ? "ACTIVE" : "INACTIVE",
                              });
                            } catch {
                              setActivationIssueById((current) => ({
                                ...current,
                                [workspace.id]: t(
                                  "The Course could not be activated. Review its draft content and try again.",
                                  "Không thể kích hoạt khóa học. Hãy kiểm tra nội dung bản nháp rồi thử lại.",
                                ),
                              }));
                            } finally {
                              setChangingStatusId(null);
                            }
                          }}
                        />
                        <span
                          className={
                            inactive
                              ? "text-xs font-medium text-slate-600"
                              : "text-xs font-medium text-emerald-700"
                          }
                        >
                          {changingStatusId === workspace.id
                            ? t("Updating…", "Đang cập nhật…")
                            : inactive
                              ? t("Inactive", "Không hoạt động")
                              : t("Active", "Đang hoạt động")}
                        </span>
                      </div>
                    </CourseCover>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      {activationIssueById[workspace.id] && (
                        <div
                          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"
                          role="alert"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <p>{activationIssueById[workspace.id]}</p>
                          <Button asChild size="sm" variant="outline" className="mt-2 h-8">
                            <Link href={workspaceUrl}>
                              {t("Complete Course setup", "Hoàn tất thiết lập khóa học")}
                            </Link>
                          </Button>
                        </div>
                      )}
                      <p className="truncate text-xs tracking-wide text-muted-foreground">
                        <span className="uppercase">{t("Lecturer", "Giảng viên")}</span>
                        {creatorName ? ` · ${creatorName}` : ""}
                      </p>
                      <h3 className="truncate text-xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                        {workspace.name}
                      </h3>
                      {workspace.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {decodePlainTextEntities(workspace.description)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" aria-hidden="true" />
                          {students}{" "}
                          {students === 1 ? t("student", "sinh viên") : t("students", "sinh viên")}
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
                      </div>
                      <div className="mt-auto grid gap-3 border-t pt-4">
                        <Button
                          asChild
                          variant="outline"
                          className="border-primary/45 text-primary hover:bg-primary/10"
                        >
                          <Link
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            href={
                              "/submissions?workspace=" +
                              encodeURIComponent(workspace.id) +
                              (pending > 0 ? "&status=PENDING" : "")
                            }
                          >
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
            {updateWorkspace.error && <ErrorState error={updateWorkspace.error} />}
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
  const canEdit = canEditLecturerCourse(workspace?.status, canManage);
  const courseAccess = lecturerCourseAccess(workspace?.status);
  const requestedView = params.get("view");
  const requestedFlowStep = params.get("flowStep") === "publish" ? "publish" : "arrange";
  const requestedContentStep = params.get("contentStep");
  const contentStep: CourseContentStep =
    requestedContentStep === "repository" ||
    requestedContentStep === "lesson" ||
    requestedContentStep === "quiz" ||
    requestedContentStep === "lab"
      ? requestedContentStep
      : "lesson";
  const activeTab =
    canManage && requestedView === "course-authoring"
      ? "authoring"
      : canManage && requestedView === "quiz-library"
        ? "quiz-library"
      : canManage && (requestedView === "content-actions" || requestedView === "course-flow")
        ? "content-actions"
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
        >
          <div className="space-y-5">
            {activeTab === "outline" && !canManage && (
              <CourseRoadmap
                key={`student-roadmap-${workspace.id}`}
                workspaceId={workspace.id}
                canManage={false}
                active={workspace.status === "ACTIVE"}
              />
            )}
            {activeTab === "outline" && canManage && (
              <LecturerCurriculumManager
                workspaceId={workspace.id}
                active={workspace.status === "ACTIVE"}
                editable={canEdit}
              />
            )}
            {activeTab === "outline" && !canManage && (
              <CourseOutline
                workspaceId={workspace.id}
                canManage={false}
                active={workspace.status === "ACTIVE"}
              />
            )}
            {activeTab === "authoring" && canManage && canEdit && (
              <CourseSetupFlowFrame
                workspaceId={workspace.id}
                currentStep={requestedFlowStep}
                contentStep={contentStep}
                flowMode={params.get("flow") === "setup" ? "setup" : "content"}
              >
                <CourseBuilder
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  canCreateModules={courseAccess.canCreateModules}
                />
              </CourseSetupFlowFrame>
            )}
            {activeTab === "content-actions" && canManage && canEdit && (
              <CourseContentHub workspaceId={workspace.id} />
            )}
            {activeTab === "quiz-library" && canManage && canEdit && (
              <QuizLibrary workspaceId={workspace.id} />
            )}
            {(activeTab === "quiz-library" ||
              activeTab === "content-actions" ||
              activeTab === "authoring") &&
              canManage &&
              !canEdit && (
                <div className="space-y-4">
                  <div
                    role="status"
                    className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
                  >
                    {t(
                      "This class course is already published (Active), so syllabus editing, Quiz editing, and Lab creation are locked to protect student progress. Open an Inactive draft class or create a new class to build and publish changes.",
                      "Khóa học của lớp đã được công bố (Active), nên phần chỉnh sửa đề cương, Quiz và tạo Lab được khóa để bảo vệ tiến độ sinh viên. Hãy mở một lớp ở trạng thái nháp (Inactive) hoặc tạo lớp mới để biên soạn nội dung.",
                    )}
                  </div>
                  <CourseOutline workspaceId={workspace.id} canManage={false} active />
                </div>
              )}
            {activeTab === "setup" && canManage && canEdit && (
              <div className="space-y-5">
                <CourseSetupPanel workspaceId={workspace.id} />
                <div id="class-passkey">
                  <CoursePasskey workspaceId={workspace.id} />
                </div>
                <CourseRoadmap
                  key={workspace.id}
                  workspaceId={workspace.id}
                  canManage
                  active={workspace.status === "ACTIVE"}
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
  const params = useSearchParams();
  const selection = useSelection();
  const workspaceId = params?.get("workspace") || selection.workspaceId;
  const session = useSession();
  const query = useApiQuery("workspaces", {});
  const remove = useApiMutation("removeWorkspaceMember");
  const [search, setSearch] = useState("");
  const [classSettingsOpen, setClassSettingsOpen] = useState(false);
  const workspace = query.data?.find((w) => w.id === workspaceId);
  const canManage =
    workspace?.myRole?.toUpperCase() === "LECTURER" || session.data?.user?.role === "admin";
  const courseAccess = lecturerCourseAccess(workspace?.status);
  const activeTab = canManage && params?.get("tab") === "settings" ? "settings" : "members";
  const gradebook = useWorkspaceGradebook(workspaceId ?? "", Boolean(workspaceId && canManage));
  const studentStatsById = new Map(
    (gradebook.data?.students ?? []).map((entry) => [entry.studentId.toLowerCase(), entry]),
  );
  const studentStatsByEmail = new Map(
    (gradebook.data?.students ?? [])
      .filter((entry) => entry.email)
      .map((entry) => [entry.email.toLowerCase(), entry]),
  );
  const lookupStats = (m: { id: string; email?: string | undefined }) =>
    studentStatsById.get(m.id.toLowerCase()) ??
    (m.email ? studentStatsByEmail.get(m.email.toLowerCase()) : undefined);
  const gradebookLoading = canManage && gradebook.isPending && !gradebook.data;
  const gradebookFailed = canManage && gradebook.isError && !gradebook.data;
  const totalLabs = gradebook.data?.labs.length ?? 0;
  const studentMembers = (workspace?.members ?? []).filter(
    (m) => m.role.toUpperCase() === "STUDENT",
  );
  const studentCount = studentMembers.length;
  const filteredStudents = studentMembers.filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
  });
  return (
    <RequestState query={query} empty={!workspace}>
      {workspace && (
        <CourseWorkspaceShell workspace={workspace} active={activeTab}>
          {activeTab === "settings" && canManage ? (
            <div className="space-y-5">
              <div className="flex justify-end">
                <Button type="button" onClick={() => setClassSettingsOpen(true)}>
                  <Settings2 className="mr-2 size-4" aria-hidden="true" />
                  {t("Class settings", "Cài đặt lớp học")}
                </Button>
              </div>
              <div id="class-passkey">
                <CoursePasskey workspaceId={workspace.id} />
              </div>
              <Dialog open={classSettingsOpen} onOpenChange={setClassSettingsOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Settings2 className="size-5 text-primary" aria-hidden="true" />
                      {t("Class settings", "Cài đặt lớp học")}
                    </DialogTitle>
                    <DialogDescription>
                      {t(
                        "Update the class name and description, or archive this class when the term ends.",
                        "Cập nhật tên và mô tả, hoặc lưu trữ lớp học khi kết thúc học kỳ.",
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <WorkspaceControls
                    key={`${workspace.id}-settings`}
                    workspace={workspace}
                    mode="overview"
                    onSaved={() => setClassSettingsOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-4">
              {canManage && studentCount === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card/50 px-4 py-3 text-xs text-muted-foreground">
                  <span>
                    {t(
                      "No students have joined yet. Share the Class Passkey from Settings so students can enroll.",
                      "Chưa có sinh viên nào tham gia. Hãy chia sẻ mã Passkey trong phần Cài đặt để sinh viên ghi danh.",
                    )}
                  </span>
                  <Link
                    href={`/members?workspace=${encodeURIComponent(workspace.id)}&tab=settings`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t("Manage passkeys →", "Quản lý Passkey →")}
                  </Link>
                </div>
              )}
              <div className="max-w-md">
                <SearchInput
                  label={t("Filter students", "Tìm kiếm sinh viên")}
                  value={search}
                  onChange={setSearch}
                />
              </div>
              {remove.error && <ErrorState error={remove.error} />}
              <DataTable
                rows={filteredStudents}
                rowKey={(m) => m.id}
                caption={t("Class roster & progress", "Danh sách sinh viên & tiến độ học")}
                columns={[
                  {
                    key: "name",
                    label: t("Name", "Họ tên"),
                    render: (m) => (
                      <div className="flex items-center gap-2.5 whitespace-nowrap">
                        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                        <span className="font-medium text-foreground">{m.name}</span>
                      </div>
                    ),
                  },
                  {
                    key: "email",
                    label: t("Email", "Email"),
                    render: (m) => (
                      <span className="font-mono text-xs text-muted-foreground">
                        {m.email || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    label: t("Status", "Trạng thái"),
                    render: (m) => {
                      if (gradebookLoading) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            {t("Loading…", "Đang tải…")}
                          </span>
                        );
                      }
                      const stats = lookupStats(m);
                      const passed = stats?.passedLabs ?? 0;
                      const completed = totalLabs > 0 && passed >= totalLabs;
                      const inProgress = passed > 0 || stats?.averageScore != null;
                      return completed ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          <span
                            className="size-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          {t("Completed", "Hoàn thành")}
                        </span>
                      ) : inProgress ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                          <span className="size-1.5 rounded-full bg-sky-500" aria-hidden="true" />
                          {t("In Progress", "Đang học")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <span
                            className="size-1.5 rounded-full bg-muted-foreground"
                            aria-hidden="true"
                          />
                          {t("Enrolled", "Đã tham gia")}
                        </span>
                      );
                    },
                  },
                  {
                    key: "progress",
                    label: t("Learning Progress", "Tiến độ học tập"),
                    render: (m) => {
                      if (gradebookLoading) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            {t("Loading…", "Đang tải…")}
                          </span>
                        );
                      }
                      if (gradebookFailed) {
                        return (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => void gradebook.refetch()}
                          >
                            {t("Retry", "Tải lại")}
                          </button>
                        );
                      }
                      const stats = lookupStats(m);
                      const passed = stats?.passedLabs ?? 0;
                      const pct = totalLabs > 0 ? Math.round((passed / totalLabs) * 100) : 0;
                      return (
                        <div className="min-w-36 space-y-1">
                          <div className="flex justify-between text-[11px] font-medium">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {passed}/{totalLabs}{" "}
                              {totalLabs === 1 ? t("Lab", "Lab") : t("Labs", "Labs")}
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
                    label: t("Average Score", "Điểm trung bình"),
                    render: (m) => {
                      if (gradebookLoading) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            {t("Loading…", "Đang tải…")}
                          </span>
                        );
                      }
                      const stats = lookupStats(m);
                      const tenScale = toTenScaleScore(
                        stats?.averageScore,
                        stats?.averageScoreTenScale,
                      );
                      if (tenScale === null) {
                        return <span className="text-xs text-muted-foreground">—</span>;
                      }
                      return (
                        <span
                          className={
                            tenScale > 5
                              ? "font-semibold text-emerald-700 dark:text-emerald-400"
                              : "font-semibold text-amber-700 dark:text-amber-400"
                          }
                        >
                          {formatTenScaleScore(stats?.averageScore, stats?.averageScoreTenScale)}
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
                                disabled={remove.isPending || !courseAccess.canManageStudents}
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
          )}
        </CourseWorkspaceShell>
      )}
    </RequestState>
  );
}

export function ReferenceVersions() {
  const { workspaceId } = useSelection();
  return workspaceId ? <ReferenceManagement key={workspaceId} workspaceId={workspaceId} /> : null;
}
