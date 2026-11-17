"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { useApi, useApiMutation, useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import { ErrorState, LoadingState, RequestState } from "@/components/shared/request-state";
import {
  CourseEnrollment,
  CourseRoadmap as CourseLabRoadmap,
  SeedCuratedCourseLabs,
  useCourseRoadmap,
  useCourseAuthoring,
  usePublishedCourse,
} from "@/features/workspaces/course-access";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useLocale } from "@/lib/i18n/locale-context";
import { getRuleName } from "@/features/architecture/three-e-content";
import { CourseBuilder } from "./course-builder";
import { CourseQuiz, useCourseQuiz } from "./course-quiz";
import { CourseSetupPanel } from "./course-setup";
import { CurriculumLibrary } from "./curriculum";
import { Step2StaticImpact } from "./step2-static-impact";
import { LabToc, type LabTocItem, type LabTocStep } from "./lab-toc";
import { LabSubmissionV2 } from "./lab-submission-v2";

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

function stepForItemType(type: string): 1 | 2 | 3 | 4 {
  if (type === "THEORY" || type === "QUIZ" || type === "ESSAY" || type === "IMPACT_LAB") return 2;
  if (type === "RUNTIME_LAB") return 3;
  return 1;
}

export function Courses() {
  const { t } = useLocale();
  const client = useApi();
  const session = useSession();
  const selection = useSelection();
  const query = useApiQuery("workspaces", {});
  const isStudent = session.data?.user?.role === "student";

  useEffect(() => {
    if (isStudent && window.location.hash === "#course-passkey") {
      document.getElementById("course-passkey")?.focus();
    }
  }, [isStudent]);

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
          <Button asChild size="sm">
            <Link href="/studio">
              <Play className="mr-1.5 size-3.5" />
              {t("Open MAVIS Studio Workbench", "Mở MAVIS Studio độc lập")}
            </Link>
          </Button>
        </div>
      </div>

      {isStudent && (
        <div id="course-passkey" tabIndex={-1} className="scroll-mt-6">
          <CourseEnrollment destination="roadmap" />
        </div>
      )}
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
  const client = useApi();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params.get("workspace") || selection.workspaceId;
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const publishedCourse = usePublishedCourse(workspaceId);

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
                <Link href="/courses">{t("Back to courses", "Quay lại khóa học")}</Link>
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
                  {client.mode === "backend" && <SeedCuratedCourseLabs workspaceId={workspaceId} />}
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

          {canManage && client.mode === "backend" && (
            <CourseBuilder workspaceId={workspaceId} />
          )}

          {canManage && client.mode === "backend" && (
            <CourseSetupPanel workspaceId={workspaceId} />
          )}

          {publishedCourse.data && (
            <section className="rounded-2xl border bg-card p-5" aria-labelledby="published-course-roadmap">
              <h2 id="published-course-roadmap" className="font-semibold">{t("Published Course roadmap", "Lộ trình Course đã publish")}</h2>
              <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm"><h3 className="font-medium">{publishedCourse.data.snapshot.title}</h3>{publishedCourse.data.snapshot.description && <p className="mt-1 text-muted-foreground">{publishedCourse.data.snapshot.description}</p>}<p className="mt-1 text-xs text-muted-foreground">v{publishedCourse.data.version} · {publishedCourse.data.snapshotDigest}</p></div>
              <ol className="mt-4 space-y-4">
                {publishedCourse.data.snapshot.modules.map((module) => <li key={module.id} className="rounded-xl border p-4">
                  <h3 className="font-medium">{module.position}. {module.title}</h3>
                  {module.description && <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>}
                  {module.items.length > 0 && <ol className="mt-3 space-y-1">{module.items.map((item) => <li key={item.id} className="rounded-lg border bg-background p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.type.replaceAll("_", " ")}</Badge><span className="font-medium">{item.title}</span>{item.assignmentId && <Button asChild size="sm" variant="link" className="h-auto p-0"><Link href={`/lab?${new URLSearchParams({ workspace: workspaceId, assignment: item.assignmentId, step: item.type === "QUIZ" || item.type === "IMPACT_LAB" ? "2" : item.type === "RUNTIME_LAB" ? "3" : "1" })}`}>{t("Open activity", "Mở hoạt động")}</Link></Button>}</div>{item.type === "THEORY" && typeof item.content["body"] === "string" && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content["body"]}</p>}{item.type === "ESSAY" && typeof item.content["prompt"] === "string" && <div className="mt-2 space-y-2"><p className="whitespace-pre-wrap">{item.content["prompt"]}</p><p className="text-xs text-muted-foreground">{t("Rubric-based lecturer review", "Giảng viên chấm theo rubric")}</p></div>}</li>)}</ol>}
                </li>)}
              </ol>
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
  const preview = Boolean(isLecturer && params.get("preview") !== "0");
  const course = useCourseAuthoring(workspaceId, Boolean(isLecturer));
  const publishedCourse = usePublishedCourse(workspaceId);
  const courseModules = publishedCourse.data?.snapshot.modules ?? [];
  const currentModule = courseModules.find((module) =>
    module.items.some((item) => item.assignmentId === assignmentId),
  );
  const moduleItems = currentModule?.items ?? [];
  const theoryItems = moduleItems.filter(
    (item) => item.type === "THEORY" && typeof item.content?.["body"] === "string",
  );
  const lab = assignments.data?.find((item) => item.id === assignmentId);
  const quiz = useCourseQuiz(workspaceId, assignmentId,
    Boolean(lab && roadmap.data?.guided && (session.data?.user?.role === "student" || isLecturer)));
  const runtimeReady = !quiz.isError && quiz.data?.runtimeUnlocked === true;
  const requiresRuntime = lab?.requireRuntimeTrace === true;
  const displayedStep = !requiresRuntime && activeStep > 2 ? 2 : activeStep;
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
    enabled: client.mode === "backend" && requiresRuntime && runtimeReady && Boolean(projectId && model),
    poll: displayedStep >= 3,
  });
  const labSessions = runtimeSessions.data?.filter((item) =>
    item.projectId === projectId && item.modelId === model?.id,
  ) ?? [];
  const observedRuntime = labSessions.find((item) =>
    ["COMPLETE", "PARTIAL"].includes(item.traceStatus ?? "") && (item.capturedSpanCount ?? 0) > 0,
  );
  const studioSession = labSessions.find((item) => item.studioVerified);
  const studioReady = runtimeReady && Boolean(observedRuntime);
  const runtimeLink = (sessionId?: string) => `/sessions?${new URLSearchParams({
    project: projectId, ...(sessionId ? { session: sessionId } : {}),
  })}`;
  const modelQuery = project && model ? new URLSearchParams({ project: project.id, model: model.id }).toString() : null;
  const referenceModelQuery =
    lab?.referenceSource?.projectId && lab?.referenceSource?.modelId
      ? new URLSearchParams({
          project: lab.referenceSource.projectId,
          model: lab.referenceSource.modelId,
        }).toString()
      : null;

  const applicableSteps = learningSteps.filter((step) => requiresRuntime || step.id <= 2);
  const stepComplete: Record<1 | 2 | 3 | 4, boolean> = {
    1: isLecturer ? Boolean(referenceModelQuery || model) : Boolean(model),
    2: runtimeReady,
    3: Boolean(observedRuntime),
    4: Boolean(studioSession),
  };
  const completedSteps = applicableSteps.filter((step) => stepComplete[step.id]).length;
  const progress = applicableSteps.length
    ? Math.round((completedSteps / applicableSteps.length) * 100)
    : 0;
  const stepAvailable = (id: 1 | 2 | 3 | 4) =>
    preview || id <= 2 || (id === 3 && runtimeReady) || (id === 4 && studioReady);
  const stepReason = (id: 1 | 2 | 3 | 4) =>
    id === 3
      ? t("Pass the current Quiz to open Runtime.", "Đạt Quiz hiện tại để mở Runtime.")
      : id === 4
        ? t("Runtime evidence is required before Studio.", "Cần bằng chứng Runtime trước khi mở Studio.")
        : undefined;
  const labHref = (step: 1 | 2 | 3 | 4) =>
    `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=${step}${preview ? "&preview=1" : ""}`;
  const tocSteps: LabTocStep[] = applicableSteps.map((step) => {
    const available = stepAvailable(step.id);
    const state = stepComplete[step.id]
      ? "complete"
      : step.id === displayedStep
        ? "current"
        : available
          ? "available"
          : "locked";
    return {
      id: step.id,
      label: t(step.shortTitle, step.shortTitleVi),
      state,
      ...(state === "locked" ? { reason: stepReason(step.id) } : {}),
      ...(available ? { href: labHref(step.id) } : {}),
    };
  });
  const tocItems: LabTocItem[] = moduleItems.map((item) => {
    const step = stepForItemType(item.type);
    return {
      id: item.id,
      title: item.title,
      type: item.type,
      current: item.assignmentId === assignmentId,
      ...(stepAvailable(step) ? { href: labHref(step) } : {}),
    };
  });

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
      ...(requiresRuntime ? [
        { label: t("Runtime observation", "Quan sát runtime"), state: runtimeReady ? "READY" : "LOCKED" },
        { label: t("Studio receipt", "Biên nhận Studio"), state: studioSession ? "VERIFIED" : studioReady ? "READY" : "LOCKED" },
      ] : []),
    ],
    [model, referenceSnapshotId, requiresRuntime, runtimeReady, studioReady, studioSession, t],
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
    if (!preview && roadmap.data.guided && !roadmap.data.labs.some(
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
          <header className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                  <Link className="hover:text-foreground" href="/workspaces">
                    {t("Classes", "Lớp học")}
                  </Link>
                  <span aria-hidden="true">/</span>
                  <Link
                    className="hover:text-foreground"
                    href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`}
                  >
                    {workspace.name}
                  </Link>
                  <span aria-hidden="true">/</span>
                  <span>
                    {t("Module", "Chương")} {currentModule?.position ?? "—"}:{" "}
                    {currentModule?.title ?? t("Unassigned module", "Chưa gán chương")}
                  </span>
                  <span aria-hidden="true">/</span>
                  <span className="text-foreground">{lab.title}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{lab.title}</h1>
                  <Badge variant="outline">
                    {t("Class", "Lớp")} {workspace.code || "—"}
                  </Badge>
                  {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {t("Revision", "Phiên bản")} {lab.referenceSource?.revision ?? "—"}
                  </Badge>
                  <Badge variant="secondary">{t("Curated repository", "Repo đã biên soạn")}</Badge>
                  <Badge variant="outline" className="font-mono">
                    {lab.referenceSource?.commitSha?.slice(0, 12) || t("Commit pending", "Chưa có commit")}
                  </Badge>
                </div>
              </div>
              <div
                aria-label={t("Lab actions", "Thao tác Lab")}
                className="flex flex-wrap gap-2"
              >
                <Button asChild variant="outline" size="sm">
                  <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                    {t("Course roadmap", "Lộ trình khóa học")}
                  </Link>
                </Button>
                {!isLecturer && (
                  <Button asChild size="sm">
                    <Link
                      href={`/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                    >
                      {runtimeReady
                        ? t("Open assignment & submit", "Mở bài tập và nộp bài")
                        : t("Open Lab assignment", "Mở bài tập Lab")}
                    </Link>
                  </Button>
                )}
                {isLecturer && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=${displayedStep}${preview ? "&preview=0" : "&preview=1"}`}
                    >
                      {preview
                        ? t("Exit preview", "Thoát xem trước")
                        : t("Preview as student", "Xem trước như sinh viên")}
                    </Link>
                  </Button>
                )}
                {isLecturer && (
                  <Button asChild size="sm">
                    <Link
                      href={`/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                    >
                      {t("Manage Lab assignment", "Quản lý bài tập Lab")}
                    </Link>
                  </Button>
                )}
                {isLecturer && lab.referenceSource?.projectId && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/runtime-config?project=${encodeURIComponent(lab.referenceSource.projectId)}`}
                    >
                      {t("Configure Studio", "Cấu hình Studio")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            {preview && (
              <p role="status" className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                {t(
                  "Preview mode is read-only. Quiz attempts, runtime sessions and submissions are not created.",
                  "Chế độ xem trước chỉ đọc. Không tạo lượt Quiz, phiên runtime hay bài nộp.",
                )}
              </p>
            )}
          </header>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <LabToc
              steps={tocSteps}
              activeStep={displayedStep}
              moduleTitle={currentModule?.title}
              items={tocItems}
              progress={progress}
              preview={preview}
            />
            <div className="min-w-0 space-y-5">
              <main className="min-w-0 space-y-5">
                <StepContent
                  requiresRuntime={requiresRuntime}
                  runtimeReady={runtimeReady}
                  runtimeSessionHref={labSessions[0] ? runtimeLink(labSessions[0].id) : null}
                  studioHref={studioReady ? runtimeLink(studioSession?.id ?? observedRuntime?.id) + "&studio=1" : null}
                  studioVerified={Boolean(studioSession)}
                  studioSessionId={studioSession?.id}
                  labMode={lab.labMode ?? "LEGACY"}
                  showQuiz={roadmap.data?.guided === true}
                  canAttemptQuiz={session.data?.user?.role === "student" && roadmap.data?.guided === true}
                  isStudent={!isLecturer}
                  preview={preview}
                  labTitle={lab.title}
                  moduleTitle={currentModule?.title}
                  theoryItems={theoryItems}
                  hasActiveAnalysisJob={Boolean(
                    jobs.data?.some((job) =>
                      ["queued", "processing", "running"].includes(String(job.status)),
                    ),
                  )}
                  step={displayedStep}
                  workspaceId={workspaceId}
                  labId={lab.id}
                  projectId={projectId}
                  modelQuery={modelQuery}
                  referenceModelQuery={referenceModelQuery}
                  snapshotId={lab.referenceSource?.snapshotId}
                  modelId={model?.id ?? lab.referenceSource?.modelId}
                  modelRevision={model?.revision ?? lab.referenceSource?.revision}
                />
              </main>
              <div className="grid gap-4 md:grid-cols-2">
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
                        <Badge variant={item.state === "READY" || item.state === "VERIFIED" ? "success" : "outline"}>
                          {item.state === "READY" ? t("Ready", "Sẵn sàng")
                            : item.state === "VERIFIED" ? t("Verified", "Đã xác minh")
                            : item.state === "PASSED" ? t("Passed", "Đã đạt")
                            : item.state === "LOCKED" ? t("Locked", "Đang khóa")
                            : item.state === "MISSING" ? t("Missing", "Còn thiếu")
                            : t("In progress", "Chưa hoàn thành")}
                        </Badge>
                      </div>
                    ))}
                    <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
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
              </div>
            </div>
          </div>
        </div>
      )}
    </RequestState>
  );
}

const STATIC_RULE_IDS = ["RULE-01", "RULE-02", "RULE-03", "RULE-04", "RULE-05"] as const;

function StaticEvaluationSummary({
  modelId,
  allowRunEvaluation = false,
}: {
  modelId: string | undefined;
  allowRunEvaluation?: boolean | undefined;
}) {
  const { locale, t } = useLocale();
  const client = useApi();
  const enabled = client.mode === "backend" && Boolean(modelId);
  const runs = useApiQuery("evaluations", { modelId: modelId ?? "" }, { enabled });
  const evaluate = useApiMutation("evaluateModel");
  const latestRun = useMemo(
    () =>
      [...(runs.data ?? [])].sort((a, b) =>
        String(b.result?.["createdAt"] ?? "").localeCompare(String(a.result?.["createdAt"] ?? "")),
      )[0],
    [runs.data],
  );
  const evaluationId = latestRun?.id ?? "";
  const findings = useApiQuery(
    "evaluationFindings",
    { evaluationId, modelId: modelId ?? "" },
    { enabled: enabled && Boolean(evaluationId) },
  );

  const ruleRows = useMemo(() => {
    const items = findings.data ?? [];
    return STATIC_RULE_IDS.map((ruleId) => {
      const ruleFindings = items.filter((item) => String(item["ruleId"] ?? "") === ruleId);
      const topFinding =
        ruleFindings.find((item) => item["status"] === "VIOLATION") ??
        ruleFindings.find((item) => item["status"] === "NEEDS_REVIEW") ??
        ruleFindings[0];
      const details =
        topFinding && typeof topFinding["details"] === "object" && topFinding["details"]
          ? (topFinding["details"] as Record<string, unknown>)
          : undefined;
      const unverifiedMetadata = details?.["evidenceSufficiency"] === "UNVERIFIED_METADATA_ONLY";
      const status = topFinding
        ? String(topFinding["status"] ?? "NEEDS_REVIEW")
        : evaluationId
          ? "PASS"
          : "PENDING";
      const severity = topFinding
        ? String(topFinding["severity"] ?? "INFO")
        : "INFO";
      return {
        ruleId,
        label: getRuleName(ruleId, locale),
        status,
        severity,
        unverifiedMetadata,
        message: topFinding && typeof topFinding["message"] === "string" ? topFinding["message"] : "",
      };
    });
  }, [evaluationId, findings.data, locale]);

  return (
    <DetailPanel title={t("3E Static Evaluation Summary (5 Rules)", "Tổng hợp đánh giá tĩnh 3E (5 quy tắc)")}>
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          "Rule status (PASS / VIOLATION / NEEDS_REVIEW) is reported separately from severity (INFO / WARNING / ERROR).",
          "Trạng thái quy tắc (PASS / VIOLATION / NEEDS_REVIEW) được tách biệt rõ với mức độ nghiêm trọng (INFO / WARNING / ERROR).",
        )}
      </p>
      {!modelId ? (
        <p className="text-sm text-muted-foreground">
          {t("Pinned static model is required before rule evaluation results can load.", "Cần có model tĩnh đã ghim để tải kết quả đánh giá 5 quy tắc.")}
        </p>
      ) : runs.isPending || (evaluationId && findings.isPending) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Loading static evaluation findings…", "Đang tải kết quả đánh giá kiến trúc tĩnh…")}
        </p>
      ) : runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : (
        <div className="space-y-2.5">
          {!evaluationId && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t(
                  "No persisted evaluation run yet; rule readiness stays pending until static evaluation completes.",
                  "Chưa có lượt đánh giá tĩnh nào được lưu; trạng thái các quy tắc sẽ hiển thị sau khi hoàn tất đánh giá.",
                )}
              </p>
              {allowRunEvaluation && modelId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={evaluate.isPending}
                  onClick={() => evaluate.mutate({ modelId }, { onSuccess: () => void runs.refetch() })}
                >
                  {evaluate.isPending
                    ? t("Evaluating 5 Rules…", "Đang đánh giá 5 quy tắc…")
                    : t("Run 5-Rule Static Evaluation", "Chạy đánh giá 5 quy tắc")}
                </Button>
              )}
            </div>
          )}
          <div className="divide-y rounded-xl border bg-background">
            {ruleRows.map((row) => (
              <div key={row.ruleId} className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{row.ruleId}</span>
                    <span className="font-medium text-foreground">{row.label}</span>
                  </div>
                  {(row.unverifiedMetadata || row.status === "NEEDS_REVIEW") && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {t("Missing Call-Site / Evidence Grounding (Needs Review)", "Thiếu bằng chứng Call-Site / cần rà soát")}
                    </p>
                  )}
                  {row.message && (
                    <p className="text-muted-foreground leading-5">{row.message}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("Rule Status", "Trạng thái")}
                    </span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("Severity", "Mức độ")}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.severity}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DetailPanel>
  );
}

function StepContent({
  step,
  workspaceId,
  labId,
  labTitle,
  projectId,
  modelQuery,
  referenceModelQuery,
  snapshotId,
  modelId,
  modelRevision,
  canAttemptQuiz,
  showQuiz,
  isStudent,
  preview,
  hasActiveAnalysisJob,
  runtimeReady,
  runtimeSessionHref,
  studioHref,
  studioVerified,
  studioSessionId,
  labMode,
  requiresRuntime,
  moduleTitle,
  theoryItems,
}: {
  step: 1 | 2 | 3 | 4;
  workspaceId: string;
  labId: string;
  labTitle?: string | undefined;
  moduleTitle?: string | undefined;
  theoryItems?: Array<{ id: string; title: string; content: Record<string, unknown> }> | undefined;
  projectId: string;
  modelQuery: string | null;
  referenceModelQuery?: string | null | undefined;
  snapshotId?: string | undefined;
  modelId?: string | undefined;
  modelRevision?: number | undefined;
  canAttemptQuiz: boolean;
  showQuiz: boolean;
  isStudent?: boolean | undefined;
  preview?: boolean | undefined;
  hasActiveAnalysisJob?: boolean | undefined;
  runtimeReady: boolean;
  runtimeSessionHref: string | null;
  studioHref: string | null;
  studioVerified: boolean;
  studioSessionId?: string | undefined;
  labMode: string;
  requiresRuntime: boolean;
}) {
  const { t } = useLocale();
  const client = useApi();
  const selection = useSelection();
  const queryClient = useQueryClient();
  const [initializingWorkspace, setInitializingWorkspace] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const sourceLink = projectId
    ? `/snapshots?${new URLSearchParams({ project: projectId })}`
    : `/assignments?${new URLSearchParams({ workspace: workspaceId, assignment: labId })}`;
  const submitHref = labMode !== "LEGACY"
    ? "#lab-submit"
    : `/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}#submission-composer`;
  const viewModelQuery = modelQuery ?? referenceModelQuery ?? null;
  const showingReferenceModel = !modelQuery && Boolean(referenceModelQuery);
  const current = learningSteps.find((item) => item.id === step)!;
  const Icon = current.icon;
  const next = step < 4 ? ((step + 1) as 2 | 3 | 4) : undefined;
  const nextAvailable = Boolean(preview) || next === 2 || (next === 3 && runtimeReady) || (next === 4 && Boolean(studioHref));
  const canSubmitFromStep4 = step === 4 && runtimeReady && studioVerified;
  const staticSubmission = step === 2 && !requiresRuntime;
  const canSubmitLab = !preview && ((staticSubmission && runtimeReady && isStudent) || canSubmitFromStep4);
  const previewParam = preview ? "&preview=1" : "";

  async function handleInitializeWorkspace() {
    if (!snapshotId || initializingWorkspace) return;
    setInitializingWorkspace(true);
    setInitError(null);
    try {
      let targetProjectId = projectId;
      if (!targetProjectId) {
        const created = await client.execute("createProject", {
          name: `${labTitle || "Lab"} - Workspace`.slice(0, 255),
          workspaceId,
          assignmentId: labId,
          referenceSnapshotId: snapshotId,
        });
        targetProjectId = created.id;
        selection.setProjectId(targetProjectId);
      }
      const snaps = await client.execute("snapshots", { projectId: targetProjectId });
      const targetSnapshot = snaps[0];
      if (!targetSnapshot) {
        throw new Error(t("No snapshot found in the initialized Lab project.", "Không tìm thấy snapshot trong không gian Lab vừa khởi tạo."));
      }
      await client.execute("startAnalysis", {
        projectId: targetProjectId,
        snapshotId: targetSnapshot.id,
        idempotencyKey: `lab-init-${targetProjectId}-${targetSnapshot.id}`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "analysisJobs"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "modelVersions"] }),
      ]);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitializingWorkspace(false);
    }
  }
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
        <div className="space-y-5">
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge variant="secondary">
                  {t(
                    "Read-Only Structural Views (C1–C3 + Dependency Graph) · Static source evidence only (not runtime trace)",
                    "Góc nhìn cấu trúc chỉ đọc (C1–C3 + Đồ thị phụ thuộc) · Chỉ từ bằng chứng mã nguồn tĩnh (không phải dấu vết runtime)",
                  )}
                </Badge>
                <p className="mt-2 text-sm text-muted-foreground leading-6">
                  {t(
                    "Inspect the read-only structural diagrams and dependency graph produced from the Lab's pinned static analysis snapshot.",
                    "Khám phá các sơ đồ cấu trúc chỉ đọc và đồ thị phụ thuộc được sinh từ bản chụp mã nguồn tĩnh đã ghim của Lab.",
                  )}
                </p>
              </div>
              <Badge variant="outline" className="font-mono">
                {modelRevision !== undefined ? `Model Revision r${modelRevision}` : "Revision pending"}
              </Badge>
            </div>
            <dl className="grid gap-3 rounded-xl border bg-muted/20 p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">sourceSnapshotId</dt>
                <dd className="mt-1 break-all font-mono text-foreground">{snapshotId || "Pending"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">modelVersionId</dt>
                <dd className="mt-1 break-all font-mono text-foreground">{modelId || "Pending"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Model Revision</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {modelRevision !== undefined ? `r${modelRevision}` : "Pending"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {viewModelQuery ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/diagrams?${viewModelQuery}&kind=CONTEXT`}>C1 System Context</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/diagrams?${viewModelQuery}&kind=CONTAINER`}>C2 Container</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/diagrams?${viewModelQuery}&kind=COMPONENT`}>C3 Component</Link>
                  </Button>
                  <Button asChild variant={showingReferenceModel ? "outline" : "default"}>
                    <Link href={`/architecture?${viewModelQuery}`}>
                      {t("Service Dependency Graph (Read-Only)", "Đồ thị phụ thuộc Service (Chỉ đọc)")}
                      <ArrowRight />
                    </Link>
                  </Button>
                </>
              ) : (
                <Button asChild variant="outline">
                  <Link href={sourceLink}>
                    {projectId ? t("Analyze Lab source", "Phân tích nguồn Lab") : t("Open Lab assignment", "Mở bài tập Lab")}
                    <ArrowRight />
                  </Link>
                </Button>
              )}
              {!modelQuery && isStudent && snapshotId && (
                <Button
                  type="button"
                  disabled={initializingWorkspace || hasActiveAnalysisJob}
                  onClick={() => void handleInitializeWorkspace()}
                >
                  {initializingWorkspace || hasActiveAnalysisJob
                    ? t("Initializing & Analyzing Lab Workspace…", "Đang khởi tạo & phân tích Không gian Lab…")
                    : t("Initialize & Analyze My Lab Workspace", "Khởi tạo & Phân tích Không gian Lab của tôi")}
                  <ArrowRight />
                </Button>
              )}
            </div>
            {showingReferenceModel && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Currently previewing the Lecturer's curated reference architecture. Initialize & analyze your own Lab workspace to build, modify, and submit your work.",
                  "Đang xem trước kiến trúc mẫu tham chiếu của Giảng viên. Hãy khởi tạo & phân tích không gian Lab riêng để thực hành và nộp bài.",
                )}
              </p>
            )}
            {initError && (
              <p role="alert" className="text-xs text-destructive">
                {initError}
              </p>
            )}
          </div>

          <StaticEvaluationSummary modelId={modelId} allowRunEvaluation={!showingReferenceModel} />

          <DetailPanel title={t("Evidence and AI review", "Bằng chứng và đánh giá AI")}>
            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                "Select a node or relationship to review source evidence and 3E findings.",
                "Chọn nút hoặc mối quan hệ để xem bằng chứng mã nguồn và kết quả đánh giá 3E.",
              )}
            </p>
            {viewModelQuery && (
              <Button asChild variant="outline">
                <Link href={`/explain?${viewModelQuery}`}>{t("Open evidence review", "Mở đánh giá bằng chứng")}</Link>
              </Button>
            )}
          </DetailPanel>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <div className="space-y-5">
            {theoryItems && theoryItems.length > 0 ? (
              theoryItems.map((item) => (
                <DetailPanel key={item.id} title={item.title}>
                  <MarkdownPreview markdown={String(item.content?.["body"] ?? "")} />
                </DetailPanel>
              ))
            ) : (
              <DetailPanel title={t("Chapter lesson", "Bài học lý thuyết")}>
                <div className="space-y-4 text-sm leading-6 text-muted-foreground">
                  <p>
                    {t(
                      moduleTitle
                        ? `Study the published lesson in ${moduleTitle} before taking the Quiz.`
                        : "Study the published lesson before taking the Quiz.",
                      moduleTitle
                        ? `Đọc bài học đã công bố trong chương ${moduleTitle} trước khi làm Quiz.`
                        : "Đọc bài học đã công bố trước khi làm Quiz.",
                    )}
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
            )}
            <Step2StaticImpact
              projectId={projectId}
              modelId={modelId}
              modelQuery={modelQuery}
              sourceLink={sourceLink}
            />
          </div>
          {canSubmitLab && labMode !== "LEGACY" && (
            <LabSubmissionV2
              workspaceId={workspaceId}
              assignmentId={labId}
              labMode={labMode}
              runtimeSessionId={studioSessionId}
            />
          )}
          {showQuiz ? (
            <CourseQuiz workspaceId={workspaceId} labId={labId} canSubmit={canAttemptQuiz}
              runtimeStepHref={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=3`}
              submissionHref={staticSubmission ? submitHref : undefined}
            />
          ) : (
            <DetailPanel title={t("Quiz gate", "Điều kiện Quiz")}>
              <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("Quiz attempts are available to enrolled students in published guided Labs.", "Sinh viên đã ghi danh có thể làm Quiz trong Lab tuần tự đã công bố.")}
                </p>
              </div>
            </DetailPanel>
          )}
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
            {preview ? (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  {step === 3
                    ? t(
                        "Preview shows the Runtime gate. Starting a real session is disabled so no student evidence is created.",
                        "Xem trước hiển thị điều kiện Runtime. Khởi chạy phiên thật bị tắt để không tạo bằng chứng sinh viên.",
                      )
                    : t(
                        "Preview shows the Studio gate. Capturing evidence and submitting are disabled.",
                        "Xem trước hiển thị điều kiện Studio. Chụp bằng chứng và nộp bài bị tắt.",
                      )}
                </p>
                <Button asChild variant="outline">
                  <Link href={projectId ? `/runtime-config?${new URLSearchParams({ project: projectId, assignment: labId })}` : sourceLink}>
                    {projectId ? t("Configure Runtime", "Cấu hình Runtime") : t("Open Lab assignment", "Mở bài tập Lab")}
                  </Link>
                </Button>
              </div>
            ) : step === 3 && runtimeReady ? (
              <div className="flex flex-wrap items-center gap-2">
                {runtimeSessionHref && <Button asChild><Link href={runtimeSessionHref}>
                  {t("Open Runtime session", "Mở phiên Runtime")}
                </Link></Button>}
                <Button asChild variant={runtimeSessionHref ? "outline" : "default"}>
                  <Link href={projectId ? `/runtime-config?${new URLSearchParams({ project: projectId, assignment: labId })}` : sourceLink}>
                    {projectId ? t("Configure Runtime", "Cấu hình Runtime") : t("Open Lab assignment", "Mở bài tập Lab")}
                  </Link>
                </Button>
              </div>
            ) : step === 4 && studioHref ? (
              <div className="space-y-3">
                {studioVerified && labMode !== "LEGACY" && (
                  <LabSubmissionV2
                    workspaceId={workspaceId}
                    assignmentId={labId}
                    labMode={labMode}
                    runtimeSessionId={studioSessionId}
                  />
                )}
                <p>{studioVerified
                  ? t("This Lab has verified Studio evidence.", "Lab đã có minh chứng Studio được xác minh.")
                  : t("Choose a service action in Runtime Sessions and run the experiment.", "Chọn thao tác dịch vụ ở trang Phiên Runtime và chạy thực nghiệm.")}</p>
                <div className="flex flex-wrap gap-2">
                  {studioVerified && (
                    <Button asChild>
                      <Link href={submitHref}>
                        {t("Proceed to Submit Lab", "Chuyển sang Nộp bài Lab")} <ArrowRight />
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant={studioVerified ? "outline" : "default"}>
                    <Link href={studioHref}>{t("Open MAVIS Studio", "Mở MAVIS Studio")}</Link>
                  </Button>
                </div>
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
              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${step - 1}${previewParam}`}
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
        {step === 4 || staticSubmission ? (
          <Button asChild={Boolean(canSubmitLab)} disabled={!canSubmitLab}>
            {canSubmitLab ? (
              <Link href={submitHref}>
                {t("Proceed to Submit Lab", "Chuyển sang Nộp bài Lab")} <ArrowRight />
              </Link>
            ) : (
              <span>{t("Complete prerequisite", "Hoàn thành điều kiện trước")}</span>
            )}
          </Button>
        ) : (
          <Button asChild={nextAvailable} disabled={!nextAvailable}>
            {nextAvailable ? (
              <Link
                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${next}${previewParam}`}
              >
                {t("Next step", "Bước tiếp theo")} <ArrowRight />
              </Link>
            ) : (
              <span>{t("Complete prerequisite", "Hoàn thành điều kiện trước")}</span>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
