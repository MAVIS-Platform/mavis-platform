"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,

  CircleAlert,
  Clock3,
  Code2,

  Network,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useApi, useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import { ErrorState, LoadingState, RequestState } from "@/components/shared/request-state";
import {
  CourseEnrollment,
  CourseRoadmap as CourseLabRoadmap,
  useCourseRoadmap,
} from "@/features/workspaces/course-access";
import { DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseQuiz, useCourseQuiz } from "./course-quiz";
import { CurriculumLibrary } from "./curriculum";

type LearningStep = {
  id: 1 | 2 | 3 | 4;
  title: string;
  shortTitle: string;
  description: string;
  titleVi: string;
  shortTitleVi: string;
  descriptionVi: string;
  icon: typeof Code2;
};

const learningSteps: LearningStep[] = [
  {
    id: 1,
    title: "Static architecture and AI review",
    shortTitle: "Static",
    description: "Inspect C1-C3 views, dependencies, 3E findings and source evidence.",
    titleVi: "Kiến trúc tĩnh và đánh giá AI",
    shortTitleVi: "Kiến trúc tĩnh",
    descriptionVi: "Khám phá góc nhìn C1-C3, dependency, phát hiện 3E và bằng chứng mã nguồn.",
    icon: Network,
  },
  {
    id: 2,
    title: "Theory, impact and quiz",
    shortTitle: "Theory & Quiz",
    description: "Study the chapter, inspect static impact and pass the versioned quiz.",
    titleVi: "Lý thuyết, tác động và quiz",
    shortTitleVi: "Lý thuyết & Quiz",
    descriptionVi: "Học nội dung, xem tác động tĩnh và vượt qua quiz theo phiên bản.",
    icon: BookOpen,
  },
  {
    id: 3,
    title: "Live runtime observation",
    shortTitle: "Runtime",
    description: "Launch the approved stack and inspect OpenTelemetry traces and health.",
    titleVi: "Quan sát runtime trực tiếp",
    shortTitleVi: "Runtime",
    descriptionVi: "Khởi chạy stack đã duyệt và xem trace OpenTelemetry cùng trạng thái hệ thống.",
    icon: Activity,
  },
  {
    id: 4,
    title: "MAVIS Studio experiment",
    shortTitle: "Studio",
    description: "Stop, start or scale a service and capture a verified runtime receipt.",
    titleVi: "Thử nghiệm MAVIS Studio",
    shortTitleVi: "Studio",
    descriptionVi: "Dừng, chạy hoặc scale service và ghi nhận biên nhận runtime đã xác minh.",
    icon: Play,
  },
];

function workspaceHref(workspaceId: string, extra = "") {
  return `?workspace=${encodeURIComponent(workspaceId)}${extra}`;
}

export function Courses() {
  const { t } = useLocale();
  const client = useApi();
  const session = useSession();
  const selection = useSelection();
  const query = useApiQuery("workspaces", {});
  const isStudent = session.data?.user?.role === "student";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl space-y-2">
            <Badge variant="outline">{t("Course learning portal", "Cổng học tập khóa học")}</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("My Courses", "Khóa học của tôi")}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                "Continue a curated microservices lab, review your progress, or join a class with an enrollment key. Course labs use lecturer-published source revisions; external source import is not available in this learning flow.",
                "Tiếp tục Lab microservices đã được biên soạn, xem tiến độ hoặc tham gia lớp bằng mã. Lab sử dụng phiên bản mã nguồn do giảng viên công bố; luồng học tập không cho nhập mã nguồn ngoài.",
              )}
            </p>
          </div>
        </div>
      </div>

      {isStudent && <CourseEnrollment destination="roadmap" />}
      {client.mode === "backend" && <CurriculumLibrary />}

      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={t(
          "No course classes are available for this account yet.",
          "Tài khoản này chưa có lớp học nào.",
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {query.data?.map((workspace) => {
            const memberCount = workspace.members.length;
            const isLecturer =
              workspace.myRole === "LECTURER" || session.data?.user?.role === "admin";
            return (
              <article key={workspace.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{workspace.code || t("Course class", "Lớp học")}</Badge>
                      <StatusBadge status={workspace.status || "ACTIVE"} />
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{workspace.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {workspace.description || t("Microservices architecture learning", "Học kiến trúc microservices")}
                    </p>
                  </div>
                  <BookOpen className="size-6 text-primary" aria-hidden="true" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("Role", "Vai trò")}</p>
                    <p className="mt-1 font-medium">
                      {workspace.myRole || session.data?.user?.role || t("Member", "Thành viên")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("Members", "Thành viên")}</p>
                    <p className="mt-1 font-medium">{memberCount}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild onClick={() => selection.setWorkspaceId(workspace.id)}>
                    <Link href={`/roadmap${workspaceHref(workspace.id)}`}>
                      {isLecturer
                        ? t("Manage course", "Quản lý khóa học")
                        : t("Open roadmap", "Mở lộ trình")}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    onClick={() => selection.setWorkspaceId(workspace.id)}
                  >
                    <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
                      {isLecturer
                        ? t("Review submissions", "Chấm bài nộp")
                        : t("My submissions", "Bài nộp của tôi")}
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </RequestState>
    </div>
  );
}

export function CourseRoadmap() {
  const { t } = useLocale();
  const params = useSearchParams();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params.get("workspace") || selection.workspaceId;
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";

  useEffect(() => {
    if (workspaceId && workspaceId !== selection.workspaceId) selection.setWorkspaceId(workspaceId);
  }, [selection, workspaceId]);

  return (
    <RequestState
      query={workspaces}
      empty={!workspace}
      emptyMessage={t("Select a course to view its roadmap.", "Chọn một khóa học để xem lộ trình.")}
    >
      {workspace && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {workspace.code || t("Course", "Khóa học")} /{" "}
                  {t("Learning roadmap", "Lộ trình học tập")}
                </p>
                <h1 className="mt-2 text-2xl font-semibold">{workspace.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "Labs unlock in sequence. Complete the required evidence package and receive a passing lecturer review before the next Lab becomes available.",
                    "Các Lab mở theo thứ tự. Hoàn thành bộ bằng chứng bắt buộc và đạt đánh giá của giảng viên để mở Lab tiếp theo.",
                  )}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/">{t("Back to courses", "Quay lại khóa học")}</Link>
              </Button>
            </div>
          </div>

          {canManage && (
            <section className="rounded-2xl border bg-card p-5" aria-labelledby="course-controls">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="course-controls" className="font-semibold">
                    {t("Lecturer course controls", "Điều khiển khóa học dành cho giảng viên")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      "Manage the class roster, publish Lab assignments and review frozen submissions.",
                      "Quản lý danh sách lớp, công bố Lab và chấm các bản nộp đã đóng băng.",
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/members?workspace=${encodeURIComponent(workspaceId)}`}>
                      {t("Manage members", "Quản lý thành viên")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
                      {t("Manage Labs", "Quản lý Lab")}
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}>
                      {t("Review submissions", "Chấm bài nộp")}
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          )}

          <CourseLabRoadmap
            workspaceId={workspaceId}
            canManage={canManage}
            active={workspace.status !== "ARCHIVED"}
          />
          {!canManage && (
            <Button asChild variant="outline">
              <Link href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("View class assignments", "Xem bài tập của lớp")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </RequestState>
  );
}

export function LabWorkspace() {
  const { t } = useLocale();
  const params = useSearchParams();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params.get("workspace") || selection.workspaceId;
  const assignmentId = params.get("assignment") || "";
  const stepValue = Number(params.get("step") || "1");
  const activeStep = ([1, 2, 3, 4].includes(stepValue) ? stepValue : 1) as 1 | 2 | 3 | 4;
  const workspaces = useApiQuery("workspaces", {});
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const client = useApi();
  const roadmap = useCourseRoadmap(workspaceId);
  const isLecturer = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const lab = assignments.data?.find((item) => item.id === assignmentId);
  const quiz = useCourseQuiz(workspaceId, assignmentId,
    Boolean(lab && roadmap.data?.guided && session.data?.user?.role === "student"));
  const runtimeReady = !quiz.isError && quiz.data?.passed === true;
  const referenceSnapshotId = lab?.referenceSource?.snapshotId;
  const projects = useApiQuery("projects", {}, { enabled: Boolean(referenceSnapshotId) });
  const project = referenceSnapshotId ? projects.data?.find((item) =>
    item.workspaceId === workspaceId && item.assignmentId === assignmentId &&
    item.projectType === "STUDENT_WORKING" && item.referenceSnapshotId === referenceSnapshotId,
  ) : undefined;
  const projectId = project?.id ?? "";
  const models = useApiQuery("modelVersions", { projectId }, {
    enabled: client.mode === "backend" && Boolean(projectId),
  });
  const jobs = useApiQuery("analysisJobs", { projectId }, {
    enabled: client.mode === "backend" && Boolean(projectId), poll: true,
  });
  const completeModelIds = new Set(jobs.data?.filter((job) =>
    job.status === "completed" && job.analysisState !== "PARTIAL",
  ).map((job) => job.modelId));
  const model = models.data?.filter((item) => item.origin === "GENERATED" &&
    (item.latest || completeModelIds.has(item.id)),
  ).sort((left, right) => right.revision - left.revision)[0];
  const runtimeSessions = useApiQuery("runtimeReadSessions", { projectId }, {
    enabled: client.mode === "backend" && runtimeReady && Boolean(projectId && model),
    poll: activeStep === 3,
  });
  const runtimeSession = model && runtimeSessions.data?.filter((item) =>
    item.projectId === projectId && item.modelId === model.id,
  ).sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))[0];
  const runtimeSessionLink = runtimeSession
    ? `/sessions?${new URLSearchParams({ project: projectId, session: runtimeSession.id })}`
    : null;
  const modelQuery = project && model ? new URLSearchParams({ project: project.id, model: model.id }).toString() : null;

  useEffect(() => {
    if (workspaceId && workspaceId !== selection.workspaceId) selection.setWorkspaceId(workspaceId);
  }, [selection, workspaceId]);

  const readiness = useMemo(
    () => [
      {
        label: t("Static architecture", "Kiến trúc tĩnh"),
        state: model ? "READY" : referenceSnapshotId ? "IN PROGRESS" : "MISSING",
      },
      { label: t("Theory and quiz", "Lý thuyết và quiz"), state: runtimeReady ? "PASSED" : "IN PROGRESS" },
      { label: t("Runtime observation", "Quan sát runtime"), state: runtimeReady ? "READY" : "LOCKED" },
      { label: t("Studio receipt", "Biên nhận Studio"), state: "LOCKED" },
    ],
    [model, referenceSnapshotId, runtimeReady, t],
  );

  if (!workspaceId)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Select a course first.", "Hãy chọn khóa học trước.")}
      </p>
    );

  if (client.mode === "backend") {
    if (roadmap.isError) return <ErrorState error={roadmap.error} onRetry={() => void roadmap.refetch()} />;
    if (!roadmap.data) return <LoadingState />;
    if (roadmap.data.guided && !roadmap.data.labs.some(
      (item) => item.assignmentId === assignmentId && item.state !== "LOCKED",
    )) {
      return (
        <div className="space-y-3">
          <p role="status">{t("This Lab is unavailable. Check your roadmap.", "Lab này chưa khả dụng. Hãy xem lộ trình.")}</p>
          <Button asChild variant="outline">
            <Link href={`/roadmap${workspaceHref(workspaceId)}`}>
              {t("Course roadmap", "Lộ trình khóa học")}
            </Link>
          </Button>
        </div>
      );
    }
  }

  return (
    <RequestState
      query={assignments}
      empty={!lab}
      emptyMessage={t(
        "Select a published Lab from the roadmap.",
        "Chọn một Lab đã công bố từ lộ trình.",
      )}
    >
      {workspace && lab && (
        <div className="space-y-5">
          <header className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  <Link className="hover:text-foreground" href="/">
                    {t("Courses", "Khóa học")}
                  </Link>
                  {" / "}
                  <Link
                    className="hover:text-foreground"
                    href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}
                  >
                    {workspace.name}
                  </Link>
                  {" / Lab"}
                </p>
                <h1 className="mt-2 text-xl font-semibold">{lab.title}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Lab revision {lab.referenceSource?.revision ?? "pending"}
                  </Badge>
                  <Badge variant="secondary">Curated repository</Badge>
                  <Badge variant="outline">
                    {lab.referenceSource?.commitSha?.slice(0, 12) || "Commit pending"}
                  </Badge>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                  {t("Course roadmap", "Lộ trình khóa học")}
                </Link>
              </Button>
            </div>
          </header>

          <nav
            aria-label="Lab stages"
            className="grid gap-2 rounded-2xl border bg-card p-3 md:grid-cols-4"
          >
            {learningSteps.map((step) => {
              const Icon = step.icon;
              const current = step.id === activeStep;
              const available = step.id <= 2 || (step.id === 3 && runtimeReady);
              return (
                <Link
                  key={step.id}
                  aria-current={current ? "step" : undefined}
                  aria-disabled={!available}
                  tabIndex={available ? 0 : -1}
                  href={
                    available
                      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}&step=${step.id}`
                      : "#"
                  }
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                    current ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    !available && "pointer-events-none opacity-50",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/20">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      Step {step.id}
                    </span>
                    <span className="block truncate font-medium">
                      {t(step.shortTitle, step.shortTitleVi)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <main className="min-w-0 space-y-5">
              <StepContent
                runtimeReady={runtimeReady}
                runtimeSessionLink={runtimeSessionLink}
                showQuiz={roadmap.data?.guided === true}
                canAttemptQuiz={session.data?.user?.role === "student" && roadmap.data?.guided === true}
                step={activeStep}
                workspaceId={workspaceId}
                labId={lab.id}
                projectId={projectId}
                modelQuery={modelQuery}
              />
            </main>
            <aside className="space-y-5">
              <DetailPanel
                title={
                  isLecturer
                    ? t("Lecturer actions", "Thao tác giảng viên")
                    : t("Lab actions", "Thao tác Lab")
                }
              >
                <div className="space-y-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    {isLecturer
                      ? t(
                          "Update the published Lab or review immutable student snapshots.",
                          "Cập nhật Lab đã công bố hoặc chấm các snapshot bất biến của sinh viên.",
                        )
                      : t(
                          "Continue in the assignment workspace to select your own analyzed model, diagrams and runtime evidence.",
                          "Tiếp tục trong không gian bài tập để chọn model đã phân tích, sơ đồ và bằng chứng runtime của bạn.",
                        )}
                  </p>
                  <div className="grid gap-2">
                    <Button asChild>
                      <Link
                        href={`/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                      >
                        {isLecturer
                          ? t("Manage Lab assignment", "Quản lý bài tập Lab")
                          : runtimeReady
                            ? t("Open assignment & submit", "Mở bài tập và nộp bài")
                            : t("Open Lab assignment", "Mở bài tập Lab")}
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link
                        href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                      >
                        {isLecturer
                          ? t("Review Lab submissions", "Chấm bài nộp của Lab")
                          : t("View submission history", "Xem lịch sử nộp bài")}
                      </Link>
                    </Button>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("Runtime evidence", "Bằng chứng runtime")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {lab.requireRuntimeTrace
                          ? t("Required", "Bắt buộc")
                          : t("Optional", "Tùy chọn")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("Deadline", "Hạn nộp")}</dt>
                      <dd className="mt-1 font-medium">
                        {lab.dueAt || t("No deadline", "Không có hạn")}
                      </dd>
                    </div>
                  </dl>
                </div>
              </DetailPanel>
              <DetailPanel title={t("Lab readiness", "Mức sẵn sàng của Lab")}>
                <div className="space-y-3">
                  {readiness.map((item, index) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full border text-xs">
                          {item.state === "READY" ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        {item.label}
                      </span>
                      <Badge variant={item.state === "READY" ? "success" : "outline"}>
                        {item.state === "READY" ? t("Ready", "Sẵn sàng")
                          : item.state === "PASSED" ? t("Passed", "Đã đạt")
                          : item.state === "LOCKED" ? t("Locked", "Đang khóa")
                          : item.state === "MISSING" ? t("Missing", "Còn thiếu")
                          : t("In progress", "Chưa hoàn thành")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </DetailPanel>
              <DetailPanel title={t("Pinned learning context", "Ngữ cảnh học tập đã ghim")}>
                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Reference project</dt>
                    <dd className="mt-1 font-medium">
                      {lab.referenceSource?.projectName || "Pending"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Source snapshot</dt>
                    <dd className="mt-1 break-all font-mono">
                      {lab.referenceSource?.snapshotId || "Pending"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Model version</dt>
                    <dd className="mt-1 break-all font-mono">
                      {lab.referenceSource?.modelId || "Pending"}
                    </dd>
                  </div>
                </dl>
              </DetailPanel>
            </aside>
          </div>
        </div>
      )}
    </RequestState>
  );
}

function StepContent({
  step,
  workspaceId,
  labId,
  projectId,
  modelQuery,
  canAttemptQuiz,
  showQuiz,
  runtimeReady,
  runtimeSessionLink,
}: {
  step: 1 | 2 | 3 | 4;
  workspaceId: string;
  labId: string;
  projectId: string;
  modelQuery: string | null;
  canAttemptQuiz: boolean;
  showQuiz: boolean;
  runtimeReady: boolean;
  runtimeSessionLink: string | null;
}) {
  const { t } = useLocale();
  const sourceLink = projectId
    ? `/snapshots?${new URLSearchParams({ project: projectId })}`
    : `/assignments?${new URLSearchParams({ workspace: workspaceId, assignment: labId })}`;
  const current = learningSteps.find((item) => item.id === step)!;
  const Icon = current.icon;
  const next = step < 4 ? ((step + 1) as 2 | 3 | 4) : undefined;
  const nextAvailable = next === 2 || (next === 3 && runtimeReady);
  return (
    <>
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Step {step}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{t(current.title, current.titleVi)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(current.description, current.descriptionVi)}
            </p>
          </div>
        </div>
      </div>

      {step === 1 && (
        <div className="grid gap-5 md:grid-cols-2">
          <DetailPanel title={t("Reference architecture", "Kiến trúc tham chiếu")}>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("Inspect the C1–C3 diagrams and dependency graph from the pinned Lab source.",
                "Xem sơ đồ C1–C3 và đồ thị phụ thuộc từ mã nguồn đã ghim của Lab.")}
            </p>
            <Button asChild>
              <Link href={modelQuery ? `/architecture?${modelQuery}` : sourceLink}>
                {modelQuery ? t("Open dependency graph", "Mở đồ thị phụ thuộc") :
                  projectId ? t("Analyze Lab source", "Phân tích nguồn Lab") : t("Open Lab assignment", "Mở bài tập Lab")} <ArrowRight />
              </Link>
            </Button>
          </DetailPanel>
          {modelQuery && <DetailPanel title={t("C1–C3 diagrams", "Sơ đồ C1–C3")}>
            <Button asChild variant="outline">
              <Link href={`/diagrams?${modelQuery}&kind=CONTEXT`}>
                {t("Open read-only diagrams", "Mở sơ đồ chỉ đọc")}
              </Link>
            </Button>
          </DetailPanel>}
          <DetailPanel title={t("Evidence and AI review", "Bằng chứng và đánh giá AI")}>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("Select a node or relationship to review source evidence and 3E findings.",
                "Chọn nút hoặc mối quan hệ để xem bằng chứng mã nguồn và kết quả đánh giá 3E.")}
            </p>
            {modelQuery && <Button asChild variant="outline">
              <Link href={`/explain?${modelQuery}`}>{t("Open evidence review", "Mở đánh giá bằng chứng")}</Link>
            </Button>}
          </DetailPanel>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <DetailPanel title={t("Chapter lesson", "Bài học lý thuyết")}>
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p>
                {t("Study the published lesson before taking the Quiz.", "Đọc bài học đã công bố trước khi làm Quiz.")}
              </p>
              <p>
                {t("Use the pinned analysis to see which services depend on the element you change.",
                  "Dùng kết quả phân tích đã ghim để xem những service phụ thuộc vào phần tử bạn thay đổi.")}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={modelQuery ? `/impact?${modelQuery}` : sourceLink}>
                {modelQuery ? t("Inspect static impact", "Xem tác động tĩnh") : t("Open Lab source", "Mở nguồn của Lab")}
              </Link>
            </Button>
          </DetailPanel>
          {showQuiz ? <CourseQuiz workspaceId={workspaceId} labId={labId} canSubmit={canAttemptQuiz} /> : <DetailPanel title={t("Quiz gate", "Điều kiện Quiz")}>
            <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
              <p className="text-sm leading-6 text-muted-foreground">
                {t("Quiz attempts are available to enrolled students in published guided Labs.", "Sinh viên đã ghi danh có thể làm Quiz trong Lab tuần tự đã công bố.")}
              </p>
            </div>
          </DetailPanel>}
        </div>
      )}

      {(step === 3 || step === 4) && (
        <DetailPanel
          title={
            step === 3
              ? t("Runtime gate", "Điều kiện Runtime")
              : t("Studio gate", "Điều kiện Studio")
          }
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            {step === 3 && runtimeReady ? (
              <div className="flex flex-wrap items-center gap-2">
                {runtimeSessionLink && (
                  <Button asChild><Link href={runtimeSessionLink}>
                    {t("Open Runtime session", "Mở phiên Runtime")}
                  </Link></Button>
                )}
                <Button asChild variant={runtimeSessionLink ? "outline" : "default"}>
                  <Link href={projectId ? `/runtime-config?${new URLSearchParams({ project: projectId })}` : sourceLink}>
                    {projectId ? t("Configure Runtime", "Cấu hình Runtime") : t("Open Lab assignment", "Mở bài tập Lab")}
                  </Link>
                </Button>
              </div>
            ) : <p className="text-sm leading-6 text-muted-foreground">
              {step === 3 ? t("Pass the current Lab Quiz to open Runtime.", "Hãy đạt Quiz hiện tại của Lab để mở Runtime.")
                : t("Studio requires Runtime evidence.", "Studio cần bằng chứng Runtime.")}
            </p>}
          </div>
        </DetailPanel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <Button asChild variant="outline" disabled={step === 1}>
          {step === 1 ? (
            <span>{t("Previous step", "Bước trước")}</span>
          ) : (
            <Link
              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${step - 1}`}
            >
              {t("Previous step", "Bước trước")}
            </Link>
          )}
        </Button>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />{" "}
          {t(
            "Progress is saved by the corresponding service.",
            "Tiến độ được lưu bởi dịch vụ tương ứng.",
          )}
        </span>
        <Button asChild={nextAvailable} disabled={!nextAvailable}>
          {nextAvailable ? (
            <Link
              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${next}`}
            >
              {t("Next step", "Bước tiếp theo")} <ArrowRight />
            </Link>
          ) : (
            <span>
              {step === 4
                ? t("Review submission", "Xem lại bài nộp")
                : t("Complete prerequisite", "Hoàn thành điều kiện trước")}
            </span>
          )}
        </Button>
      </div>
    </>
  );
}
