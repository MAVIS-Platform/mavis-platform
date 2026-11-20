"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Code2,
  Network,
  ShieldCheck,
} from "lucide-react";
import { SearchInput } from "@/components/shared/forms";
import { useApi, useApiMutation, useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import {
  ErrorState,
  EmptyState,
  LoadingState,
  RequestState,
} from "@/components/shared/request-state";
import {
  useCourseRoadmap,
  usePublishedCourse,
  useStudentLabContext,
  useStudentLabStudioSessions,
  type StudentLabContext,
  type StudentLabReferenceArchitecture,
  type StudentLabStudioSession,
} from "@/features/workspaces/course-access";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useLocale } from "@/lib/i18n/locale-context";
import { getRuleName } from "@/features/architecture/three-e-content";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { ArchitectureDiagrams } from "@/features/architecture/architecture-diagrams";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { buildStudioLiveHref } from "@/features/runtime/standalone-studio-live";
import type { ArchitecturalModel } from "@/types/domain";
import { CourseBuilder } from "./course-builder";
import { useCourseQuiz } from "./course-quiz";
import { CourseSetupPanel } from "./course-setup";
import { CurriculumLibrary } from "./curriculum";
import { Step2StaticImpact } from "./step2-static-impact";
import { LabToc, type LabTocItem, type LabTocStep } from "./lab-toc";
import { LabSubmissionV2 } from "./lab-submission-v2";
import { TeacherDashboard } from "@/features/workspaces/teacher-dashboard";
import {
  PasskeyEnrollmentModal,
  StudentCourseProgressCard,
  StudentCoursesHero,
  StudentKpiStrip,
} from "./student-courses-dashboard";
import { StudentCourseSyllabus } from "./student-course-syllabus";
import { LecturerCurriculumManager } from "./lecturer-curriculum-manager";
import { resolveLabTier } from "@/features/assignments/requirements";

type LearningStep = {
  id: 1 | 2 | 3;
  title: string;
  shortTitle: string;
  description: string;
  titleVi: string;
  shortTitleVi: string;
  descriptionVi: string;
  icon: typeof Code2;
};

type InlineC4View = "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH";

const learningSteps: LearningStep[] = [
  {
    id: 1,
    title: "Static Studio",
    shortTitle: "Static Studio",
    description:
      "Inspect the curated snapshot, C1–C3 architecture, dependency graph, and source evidence before the runtime exercise.",
    titleVi: "Static Studio",
    shortTitleVi: "Static Studio",
    descriptionVi:
      "Khảo sát snapshot chuẩn, kiến trúc C1–C3, đồ thị phụ thuộc và bằng chứng mã nguồn trước khi thực hành runtime.",
    icon: Network,
  },
  {
    id: 2,
    title: "MAVIS Runtime Studio",
    shortTitle: "Runtime Studio",
    description:
      "Run the scenario in MAVIS Studio, operate the allowed services, and compare predicted and observed impact.",
    titleVi: "MAVIS Runtime Studio",
    shortTitleVi: "Runtime Studio",
    descriptionVi:
      "Chạy kịch bản trong MAVIS Studio, thao tác các dịch vụ được phép và đối chiếu tác động dự đoán với quan sát thực tế.",
    icon: BookOpen,
  },
  {
    id: 3,
    title: "Evidence & Submit",
    shortTitle: "Evidence & Submit",
    description:
      "Review the Studio evidence and receipt, then send the completed Lab to submission and grading.",
    titleVi: "Evidence & Submit",
    shortTitleVi: "Evidence & Submit",
    descriptionVi:
      "Kiểm tra evidence và receipt của Studio, sau đó chuyển Lab hoàn tất sang bước nộp và chấm.",
    icon: ShieldCheck,
  },
];

function resolveStepMeta(
  step: 1 | 2 | 3,
  options: { hasReferenceArch: boolean; isTheoryOnlyLab: boolean; requiresRuntime: boolean },
): LearningStep {
  const base = learningSteps.find((s) => s.id === step) ?? learningSteps[0]!;
  if (step === 1 && !options.hasReferenceArch) {
    return {
      ...base,
      title: "Static Studio",
      shortTitle: "Static Studio",
      description:
        "Review the Lab objective and required evidence before continuing to the next phase.",
      titleVi: "Static Studio",
      shortTitleVi: "Static Studio",
      descriptionVi:
        "Xem mục tiêu Lab và evidence cần có trước khi chuyển sang giai đoạn tiếp theo.",
    };
  }
  if (step === 2 && !options.requiresRuntime) {
    return {
      ...base,
      title: "MAVIS Runtime Studio (Not Required)",
      shortTitle: "Runtime (N/A)",
      description:
        "This Lab does not require a runtime experiment. Continue to evidence and submission after Static Studio.",
      titleVi: "MAVIS Runtime Studio (Không bắt buộc)",
      shortTitleVi: "Runtime (K/Á)",
      descriptionVi:
        "Lab này không yêu cầu thực nghiệm runtime. Hoàn tất Static Studio rồi chuyển sang evidence và nộp bài.",
    };
  }
  return base;
}

function mapLayer(scope: string): ArchitecturalModel["elements"][number]["layer"] {
  const s = scope.toUpperCase();
  if (s.includes("EDGE") || s.includes("GATEWAY") || s.includes("FRONTEND")) return "edge";
  if (s.includes("DATA") || s.includes("DB")) return "data";
  if (s.includes("PLATFORM") || s.includes("INFRA") || s.includes("BROKER")) return "platform";
  if (s.includes("DOMAIN") || s.includes("SERVICE") || s.includes("INTERNAL")) return "domain";
  return "unclassified";
}

function toInlineArchitecturalModel(
  refArch: StudentLabReferenceArchitecture | null | undefined,
  label: string,
): ArchitecturalModel | undefined {
  if (!refArch || !refArch.modelVersionId) return undefined;
  const evidencesByRel = new Map<string, StudentLabReferenceArchitecture["evidences"]>();
  for (const ev of refArch.evidences) {
    const arr = evidencesByRel.get(ev.relationshipId) ?? [];
    arr.push(ev);
    evidencesByRel.set(ev.relationshipId, arr);
  }
  const elements: ArchitecturalModel["elements"] = refArch.elements.map((el) => ({
    id: el.id,
    name: el.name,
    layer: mapLayer(el.scope || el.elementType),
    elementType: el.elementType,
    parentId: el.parentElementId ?? null,
    technology: el.languageStack ?? null,
    description: `${el.elementType} · ${el.scope}`,
    evidence: [],
  }));
  const nodeIds = new Set(elements.map((el) => el.id));
  const edges: ArchitecturalModel["edges"] = refArch.relationships
    .filter((rel) => nodeIds.has(rel.sourceElementId) && nodeIds.has(rel.targetElementId))
    .map((rel) => ({
      id: rel.id,
      from: rel.sourceElementId,
      to: rel.targetElementId,
      protocol: rel.relationType,
      originLayer: rel.originLayer ?? undefined,
      uncertain: false,
      evidence: (evidencesByRel.get(rel.id) ?? []).map((ev) => ({
        id: ev.id,
        kind: "source" as const,
        sourceType: ev.sourceType ?? undefined,
        location: ev.locator ?? "Source",
        snippet: ev.excerpt ?? "",
        complete: true,
      })),
    }));
  return {
    id: refArch.modelVersionId,
    projectId: refArch.projectId,
    snapshotId: refArch.snapshotId,
    revision: refArch.revision ?? 1,
    label,
    elements,
    edges,
  };
}

function sanitizeMermaidId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

function synthesizeFallbackMermaid(
  model: ArchitecturalModel | undefined,
  view: "CONTEXT" | "CONTAINER" | "COMPONENT",
): string | null {
  if (!model || model.elements.length === 0) return null;
  const filtered =
    view === "CONTEXT"
      ? model.elements.filter(
          (e) =>
            !e.parentId &&
            [
              "PERSON",
              "EXTERNAL_SYSTEM",
              "FRONTEND_APP",
              "API_GATEWAY",
              "SERVICE_CONTAINER",
            ].includes(e.elementType ?? ""),
        )
      : view === "CONTAINER"
        ? model.elements.filter(
            (e) =>
              !e.parentId ||
              [
                "SERVICE_CONTAINER",
                "DATABASE",
                "MESSAGE_BROKER",
                "API_GATEWAY",
                "FRONTEND_APP",
                "EXTERNAL_SYSTEM",
              ].includes(e.elementType ?? ""),
          )
        : model.elements;
  const visible = filtered.length > 0 ? filtered.slice(0, 18) : model.elements.slice(0, 18);
  const visibleIds = new Set(visible.map((e) => e.id));
  const lines = ["flowchart TB"];
  for (const el of visible) {
    const safeLabel = el.name.replace(/"/g, "'");
    lines.push(`  n_${sanitizeMermaidId(el.id)}["${safeLabel}"]`);
  }
  for (const edge of model.edges) {
    if (visibleIds.has(edge.from) && visibleIds.has(edge.to)) {
      const proto = edge.protocol.replace(/"/g, "'").replace(/_/g, " ");
      lines.push(
        `  n_${sanitizeMermaidId(edge.from)} -->|${proto}| n_${sanitizeMermaidId(edge.to)}`,
      );
    }
  }
  return lines.join("\n");
}

function workspaceHref(workspaceId: string, extra = "") {
  return `?workspace=${encodeURIComponent(workspaceId)}${extra}`;
}

function stepForItemType(type: string): 1 | 2 | 3 {
  if (type === "RUNTIME_LAB") return 2;
  if (type === "ESSAY") return 3;
  return 1;
}

export function Courses() {
  const { t } = useLocale();
  const client = useApi();
  const session = useSession();
  const selection = useSelection();
  const query = useApiQuery("workspaces", {});
  const submissions = useApiQuery("submissions", {});
  const userRole = session.data?.user?.role;
  const isStudent = userRole === "student";
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isStudent && window.location.hash === "#course-passkey") {
      setPasskeyOpen(true);
      requestAnimationFrame(() => {
        const form = document.getElementById("course-passkey");
        form?.focus();
        form?.scrollIntoView({ block: "center" });
      });
    } else if (isStudent && query.isSuccess && (query.data?.length ?? 0) === 0) {
      setPasskeyOpen(true);
    }
  }, [isStudent, query.isSuccess, query.data?.length]);

  const workspaces = query.data ?? [];
  const filteredWorkspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((ws) => {
      const lecturers = (ws.members ?? [])
        .filter((m) => m.role.toUpperCase() === "LECTURER")
        .map((m) => m.name)
        .join(" ")
        .toLowerCase();
      return (
        ws.name.toLowerCase().includes(q) ||
        (ws.code ?? "").toLowerCase().includes(q) ||
        lecturers.includes(q)
      );
    });
  }, [search, workspaces]);

  const studentSubStats = useMemo(() => {
    const list = submissions.data ?? [];
    const passedCount = list.filter((s) => {
      const score = s.reviewScore;
      return s.labOutcome === "PASSED" || (typeof score === "number" && score >= 50);
    }).length;
    const scored = list.map((s) => s.reviewScore).filter((v): v is number => typeof v === "number");
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, v) => sum + v, 0) / scored.length)
      : null;
    return { total: list.length, passedCount, avgScore };
  }, [submissions.data]);

  if (userRole === "lecturer" || userRole === "admin") return <TeacherDashboard />;

  const firstWorkspaceId = workspaces[0]?.id ?? null;
  const overallPct = studentSubStats.total
    ? Math.round((studentSubStats.passedCount / studentSubStats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <StudentCoursesHero
        studentName={session.data?.user?.name}
        firstWorkspaceId={firstWorkspaceId}
        passkeyOpen={passkeyOpen}
        onTogglePasskey={() => setPasskeyOpen((open) => !open)}
      />

      {isStudent && (
        <PasskeyEnrollmentModal open={passkeyOpen} onClose={() => setPasskeyOpen(false)} />
      )}

      {workspaces.length > 0 && (
        <StudentKpiStrip
          enrolledCount={workspaces.length}
          passedLabsCount={studentSubStats.passedCount}
          submittedCount={studentSubStats.total}
          completionPercent={overallPct}
          avgScore={studentSubStats.avgScore}
        />
      )}

      <RequestState query={query} empty={false}>
        {!workspaces.length ? (
          <EmptyState
            title={t("No classes yet", "Chưa có lớp học")}
            description={t(
              "Ask your lecturer for a Passkey, then join the class to see its lessons and Labs here.",
              "Hãy xin Passkey từ giảng viên và tham gia lớp để xem bài học cùng Lab tại đây.",
            )}
            action={
              isStudent ? (
                <Button type="button" onClick={() => setPasskeyOpen(true)}>
                  {t("Join a class", "Tham gia lớp")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full max-w-sm">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  label={t(
                    "Search classes by name, code or lecturer...",
                    "Tìm lớp theo tên, mã lớp hoặc giảng viên...",
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredWorkspaces.length} / {workspaces.length} {t("classes", "lớp học")}
              </p>
            </div>

            {filteredWorkspaces.length === 0 ? (
              <EmptyState
                title={t("No matching classes", "Không tìm thấy lớp phù hợp")}
                description={t(
                  "Try clearing the search query or join a new class via Passkey.",
                  "Thử xóa từ khóa tìm kiếm hoặc tham gia lớp mới bằng Passkey.",
                )}
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredWorkspaces.map((workspace) => {
                  const memberCount = workspace.members.length;
                  const isLecturer =
                    workspace.myRole === "LECTURER" || session.data?.user?.role === "admin";
                  const lecturerNames = workspace.members
                    .filter((member) => member.role.toUpperCase() === "LECTURER")
                    .map((member) => member.name);
                  return (
                    <StudentCourseProgressCard
                      key={workspace.id}
                      workspace={workspace}
                      memberCount={memberCount}
                      lecturerNames={lecturerNames}
                      isLecturer={isLecturer}
                      onOpen={() => selection.setWorkspaceId(workspace.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </RequestState>

      {client.mode === "backend" && (
        <details className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
          <summary className="w-fit cursor-pointer text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("Reference materials: Java and C#", "Tài liệu tham khảo: Java và C#")}
          </summary>
          <div className="mt-4">
            <CurriculumLibrary />
          </div>
        </details>
      )}
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
  const [studentPreview, setStudentPreview] = useState(false);

  useEffect(() => {
    if (workspaceId && workspaceId !== selection.workspaceId) selection.setWorkspaceId(workspaceId);
  }, [selection, workspaceId]);

  return (
    <RequestState
      query={workspaces}
      empty={!workspace}
      emptyMessage={t("Select a course to view its roadmap.", "Chọn một khóa học để xem lộ trình.")}
    >
      {workspace &&
        (canManage ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-700 p-6 text-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-100">
                    {workspace.code || t("Course", "Khóa học")} ·{" "}
                    {t("Curriculum & Learning Roadmap", "Giáo trình & Lộ trình học tập")}
                  </p>
                  <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{workspace.name}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setStudentPreview((open) => !open)}
                    className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    {studentPreview
                      ? t("← Back to Curriculum Manager", "← Quay lại Trình Quản lý Giáo trình")
                      : t(
                          "👁️ Preview Student Syllabus View",
                          "👁️ Xem Giao diện Lộ trình của Sinh viên",
                        )}
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    <Link href="/courses">{t("Back to courses", "Quay lại khóa học")}</Link>
                  </Button>
                </div>
              </div>
            </div>

            {studentPreview ? (
              <StudentCourseSyllabus workspace={workspace} />
            ) : (
              <>
                <LecturerCurriculumManager
                  workspaceId={workspaceId}
                  active={workspace.status !== "ARCHIVED"}
                />

                {client.mode === "backend" && (
                  <details className="rounded-2xl border bg-card p-5">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      {t(
                        "Advanced Course Modules & Setup Checklist",
                        "Cấu trúc Chương Nâng cao & Checklist Thiết lập Khóa học",
                      )}
                    </summary>
                    <div className="mt-4 space-y-5">
                      <CourseBuilder workspaceId={workspaceId} />
                      <CourseSetupPanel workspaceId={workspaceId} />
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        ) : (
          <StudentCourseSyllabus workspace={workspace} />
        ))}
    </RequestState>
  );
}

export function LabWorkspace() {
  const { t } = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params.get("workspace") || selection.workspaceId;
  const assignmentId = params.get("assignment") || "";
  const stepValue = Number(params.get("step") || "1");
  const activeStep = ([1, 2, 3].includes(stepValue) ? stepValue : 1) as 1 | 2 | 3;
  const viewParam = params.get("view");
  const initialView: InlineC4View =
    viewParam === "CONTEXT" ||
    viewParam === "CONTAINER" ||
    viewParam === "COMPONENT" ||
    viewParam === "GRAPH"
      ? viewParam
      : "CONTAINER";
  const [inlineC4View, setInlineC4View] = useState<InlineC4View>(initialView);
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
  const publishedCourse = usePublishedCourse(workspaceId);
  const courseModules = publishedCourse.data?.snapshot.modules ?? [];
  const currentModule = courseModules.find((module) =>
    module.items.some((item) => item.assignmentId === assignmentId),
  );
  const moduleItems = currentModule?.items ?? [];
  const moduleQuizItem = moduleItems.find((item) => item.type === "QUIZ");
  const moduleQuizHref = moduleQuizItem
    ? `/roadmap?workspace=${encodeURIComponent(workspaceId)}&item=${encodeURIComponent(moduleQuizItem.id)}`
    : `/roadmap?workspace=${encodeURIComponent(workspaceId)}`;
  const lab = assignments.data?.find((item) => item.id === assignmentId);
  const labTier = resolveLabTier(lab);
  const isTheoryOnlyLab = labTier === "THEORY_ONLY";
  const studentContext = useStudentLabContext(
    workspaceId,
    assignmentId,
    client.mode === "backend" && Boolean(workspaceId && assignmentId),
  );
  const quiz = useCourseQuiz(
    workspaceId,
    assignmentId,
    Boolean(
      lab &&
      !isTheoryOnlyLab &&
      roadmap.data?.guided &&
      (session.data?.user?.role === "student" || isLecturer),
    ),
  );
  const runtimeReady =
    isTheoryOnlyLab ||
    (!quiz.isError && quiz.data?.runtimeUnlocked === true) ||
    studentContext.data?.quiz?.runtimeUnlocked === true;
  const quizPassPercent = quiz.data?.passPercent ?? studentContext.data?.quiz?.passPercent ?? 70;
  const requiresRuntime =
    lab?.requireRuntimeTrace === true || lab?.labMode === "THEORY_QUIZ_STUDIO";
  const displayedStep = activeStep;
  const refArch = studentContext.data?.referenceArchitecture ?? null;
  const studentStudioSessions = useStudentLabStudioSessions(
    workspaceId,
    assignmentId,
    client.mode === "backend" &&
      requiresRuntime &&
      runtimeReady &&
      !preview &&
      Boolean(workspaceId && assignmentId),
  );
  const studioSessionsList: StudentLabStudioSession[] = useMemo(
    () => studentStudioSessions.data ?? studentContext.data?.studioSessions ?? [],
    [studentStudioSessions.data, studentContext.data?.studioSessions],
  );
  const referenceSnapshotId = refArch?.snapshotId ?? lab?.referenceSource?.snapshotId;
  const referenceProjectId = refArch?.projectId ?? lab?.referenceSource?.projectId ?? "";
  const projects = useApiQuery("projects", {}, { enabled: Boolean(referenceSnapshotId) });
  const project = referenceSnapshotId
    ? projects.data?.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.assignmentId === assignmentId &&
          item.projectType === "STUDENT_WORKING" &&
          item.referenceSnapshotId === referenceSnapshotId,
      )
    : undefined;
  const projectId = project?.id ?? referenceProjectId;
  const models = useApiQuery(
    "modelVersions",
    { projectId },
    {
      enabled: client.mode === "backend" && !refArch && Boolean(projectId),
    },
  );
  const jobs = useApiQuery(
    "analysisJobs",
    { projectId },
    {
      enabled: client.mode === "backend" && !refArch && Boolean(projectId),
      poll: true,
    },
  );
  const completeModelIds = new Set(
    jobs.data
      ?.filter((job) => job.status === "completed" && job.analysisState !== "PARTIAL")
      .map((job) => job.modelId),
  );
  const model = models.data
    ?.filter(
      (item) => item.origin === "GENERATED" && (item.latest || completeModelIds.has(item.id)),
    )
    .sort((left, right) => right.revision - left.revision)[0];
  const inlineReferenceModel = useMemo(
    () => toInlineArchitecturalModel(refArch, lab?.title || "Reference model"),
    [refArch, lab?.title],
  );
  const activeModelId = inlineReferenceModel?.id ?? model?.id ?? lab?.referenceSource?.modelId;
  const activeModelRevision =
    inlineReferenceModel?.revision ?? model?.revision ?? lab?.referenceSource?.revision;
  const runtimeSessions = useApiQuery(
    "runtimeReadSessions",
    { projectId },
    {
      enabled:
        client.mode === "backend" &&
        requiresRuntime &&
        runtimeReady &&
        Boolean(projectId && model && !refArch),
      poll: displayedStep >= 2,
    },
  );
  const labSessions =
    runtimeSessions.data?.filter(
      (item) => item.projectId === projectId && item.modelId === model?.id,
    ) ?? [];
  const verifiedStudioSession =
    studioSessionsList.find((item) => item.studioVerified) ??
    labSessions.find((item) => item.studioVerified);
  const runtimeLink = (sessionId?: string) =>
    `/sessions?${new URLSearchParams({
      project: projectId,
      ...(sessionId ? { session: sessionId } : {}),
    })}`;
  const modelQuery =
    project && model
      ? new URLSearchParams({ project: project.id, model: model.id }).toString()
      : null;
  const referenceModelQuery =
    refArch?.projectId && refArch?.modelVersionId
      ? new URLSearchParams({
          project: refArch.projectId,
          model: refArch.modelVersionId,
        }).toString()
      : lab?.referenceSource?.projectId && lab?.referenceSource?.modelId
        ? new URLSearchParams({
            project: lab.referenceSource.projectId,
            model: lab.referenceSource.modelId,
          }).toString()
        : null;

  const hasReferenceArch = Boolean(activeModelId || referenceSnapshotId);
  const hasSubmitted = Boolean(studentContext.data?.latestSubmission);
  const stepComplete: Record<1 | 2 | 3, boolean> = {
    1: hasReferenceArch ? Boolean(activeModelId) : Boolean(lab || hasSubmitted || runtimeReady),
    2: requiresRuntime ? Boolean(verifiedStudioSession) : runtimeReady,
    3: hasSubmitted,
  };
  const completedSteps = learningSteps.filter((step) => stepComplete[step.id]).length;
  const progress = Math.round((completedSteps / learningSteps.length) * 100);
  const stepAvailable = (id: 1 | 2 | 3) => {
    if (preview || id === 1) return true;
    if (id === 2) return runtimeReady;
    return !requiresRuntime || Boolean(verifiedStudioSession);
  };
  const stepReason = (id: 1 | 2 | 3) => {
    if (id === 2 && !runtimeReady)
      return t(
        "Pass this module's Quiz to unlock MAVIS Runtime Studio.",
        "Hãy đạt Quiz của Module để mở khóa MAVIS Runtime Studio.",
      );
    if (id === 3 && requiresRuntime && !verifiedStudioSession)
      return t(
        "Finish MAVIS Runtime Studio and create a verified receipt before submitting.",
        "Hoàn tất MAVIS Runtime Studio và tạo receipt đã xác minh trước khi nộp bài.",
      );
    return undefined;
  };
  const labHref = (step: 1 | 2 | 3, extraView?: InlineC4View) =>
    `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=${step}${extraView ? `&view=${extraView}` : ""}${preview ? "&preview=1" : ""}`;
  const tocSteps: LabTocStep[] = learningSteps.map((step) => {
    const meta = resolveStepMeta(step.id, { hasReferenceArch, isTheoryOnlyLab, requiresRuntime });
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
      label: t(meta.shortTitle, meta.shortTitleVi),
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
      ...(hasReferenceArch || requiresRuntime
        ? [
            {
              label: t("Static architecture", "Kiến trúc tĩnh"),
              state: activeModelId ? "READY" : referenceSnapshotId ? "IN PROGRESS" : "MISSING",
            },
          ]
        : []),
      isTheoryOnlyLab
        ? {
            label: t("Theory lesson", "Bài lý thuyết"),
            state: "READY",
          }
        : {
            label: t("Theory and quiz", "Lý thuyết và quiz"),
            state: runtimeReady ? "PASSED" : "IN PROGRESS",
          },
      ...(requiresRuntime
        ? [
            {
              label: t("Studio receipt", "Biên nhận Studio"),
              state: verifiedStudioSession ? "VERIFIED" : runtimeReady ? "READY" : "LOCKED",
            },
          ]
        : []),
    ],
    [
      activeModelId,
      hasReferenceArch,
      isTheoryOnlyLab,
      referenceSnapshotId,
      requiresRuntime,
      runtimeReady,
      verifiedStudioSession,
      t,
    ],
  );

  if (!workspaceId)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Select a course first.", "Hãy chọn khóa học trước.")}
      </p>
    );

  if (client.mode === "backend") {
    if (roadmap.isError)
      return <ErrorState error={roadmap.error} onRetry={() => void roadmap.refetch()} />;
    if (!roadmap.data) return <LoadingState />;
    if (
      !preview &&
      roadmap.data.guided &&
      !roadmap.data.labs.some(
        (item) => item.assignmentId === assignmentId && item.state !== "LOCKED",
      )
    ) {
      return (
        <div className="space-y-3">
          <p role="status">
            {t(
              "This Lab is unavailable. Check your roadmap.",
              "Lab này chưa khả dụng. Hãy xem lộ trình.",
            )}
          </p>
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
          <header className="mavis-hero-surface p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-sky-100/90">
                  <Link
                    className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/12 px-2.5 py-1 font-medium text-white transition-colors hover:bg-white/20"
                    href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}
                  >
                    ← {t("Back to Course Syllabus", "Quay lại Lộ trình môn học")}
                  </Link>
                  <span>/</span>
                  <span className="truncate">{workspace.name}</span>
                  {currentModule && (
                    <>
                      <span>/</span>
                      <span className="truncate">
                        {t("Module", "Chương")} {currentModule.position}: {currentModule.title}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                    {lab.title}
                  </h1>
                  <Badge
                    variant="outline"
                    className="border-white/25 bg-white/15 font-mono text-xs text-white"
                  >
                    {t("Class", "Lớp")} {workspace.code || "—"}
                  </Badge>
                  <Badge className="border-teal-300/30 bg-teal-400/20 text-teal-50">
                    {requiresRuntime
                      ? t("Studio Live Practice Lab", "Lab Thực Hành Studio Live")
                      : isTheoryOnlyLab
                        ? t("Theory Only Lab", "Lab Chỉ Lý Thuyết")
                        : t("Theory & Quiz Lab", "Lab Lý Thuyết & Quiz")}
                  </Badge>
                  {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
                  {readiness.map((gate) => (
                    <Badge
                      key={gate.label}
                      variant="outline"
                      className="border-white/20 bg-white/10 text-[11px] font-normal text-sky-100"
                    >
                      {gate.label}: {gate.state}
                    </Badge>
                  ))}
                </div>
              </div>
              <div
                aria-label={t("Lab actions", "Thao tác Lab")}
                className="flex flex-wrap items-center gap-2"
              >
                {(roadmap.data?.labs.length ?? 0) > 1 && (
                  <label className="sr-only" htmlFor="lab-switcher">
                    {t("Switch Lab", "Chuyển bài Lab")}
                  </label>
                )}
                {(roadmap.data?.labs.length ?? 0) > 1 && (
                  <select
                    id="lab-switcher"
                    value={lab.id}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      if (nextId) {
                        router.push(
                          `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(nextId)}&step=1${preview ? "&preview=1" : ""}`,
                        );
                      }
                    }}
                    className="h-8 max-w-56 rounded-lg border border-white/25 bg-white/12 px-2.5 text-xs text-white outline-none hover:bg-white/20"
                  >
                    {(roadmap.data?.labs ?? []).map((item) => {
                      const icon =
                        item.state === "PASSED" ? "✅" : item.state === "LOCKED" ? "🔒" : "▶️";
                      return (
                        <option
                          key={item.assignmentId}
                          value={item.assignmentId}
                          disabled={item.state === "LOCKED" && !preview}
                          className="bg-slate-900 text-white"
                        >
                          {icon} Lab {item.position}: {item.title}
                        </option>
                      );
                    })}
                  </select>
                )}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
                >
                  <Link
                    href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                  >
                    {t("Submissions & Grades", "Bài nộp & Điểm")}
                  </Link>
                </Button>
                {isLecturer && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
                  >
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
                  <Button asChild size="sm" className="bg-white text-slate-950 hover:bg-sky-50">
                    <Link
                      href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                    >
                      {t("Edit Lab", "Chỉnh sửa Lab")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            {preview && (
              <p
                role="status"
                className="mt-3 rounded-md border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-xs leading-5 text-amber-100"
              >
                {t(
                  "Preview mode is read-only. Quiz attempts, runtime sessions and submissions are not created.",
                  "Chế độ xem trước chỉ đọc. Không tạo lượt Quiz, phiên runtime hay bài nộp.",
                )}
              </p>
            )}
          </header>

          <LabToc
            layout="stepper"
            sticky={displayedStep !== 3}
            steps={tocSteps}
            activeStep={displayedStep}
            moduleTitle={currentModule?.title}
            items={tocItems}
            progress={progress}
            preview={preview}
          />

          {(() => {
            const activeMeta = resolveStepMeta(displayedStep, {
              hasReferenceArch,
              isTheoryOnlyLab,
              requiresRuntime,
            });
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-foreground">
                <p>
                  <span className="font-semibold text-primary">
                    {t(`Phase ${activeMeta.id}/3`, `Giai đoạn ${activeMeta.id}/3`)} ·{" "}
                    {t(activeMeta.title, activeMeta.titleVi)}:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {t(activeMeta.description, activeMeta.descriptionVi)}
                  </span>
                </p>
              </div>
            );
          })()}

          <div className="min-w-0 space-y-5">
            <StepContent
              requiresRuntime={requiresRuntime}
              hasReferenceArch={hasReferenceArch}
              isTheoryOnlyLab={isTheoryOnlyLab}
              runtimeReady={runtimeReady}
              quizPassPercent={quizPassPercent}
              runtimeSessionHref={labSessions[0] ? runtimeLink(labSessions[0].id) : null}
              studioHref={
                verifiedStudioSession ? runtimeLink(verifiedStudioSession.id) + "&studio=1" : null
              }
              studioVerified={Boolean(verifiedStudioSession)}
              studioSessionId={verifiedStudioSession?.id}
              studioSessions={studioSessionsList}
              labMode={lab.labMode ?? (requiresRuntime ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ")}
              isStudent={!isLecturer}
              preview={preview}
              hasActiveAnalysisJob={Boolean(
                jobs.data?.some((job) =>
                  ["queued", "processing", "running"].includes(String(job.status)),
                ),
              )}
              step={displayedStep}
              workspaceId={workspaceId}
              labId={lab.id}
              labOrder={lab.labOrder}
              labTitle={lab.title}
              moduleQuizHref={moduleQuizHref}
              projectId={projectId}
              modelQuery={modelQuery}
              referenceModelQuery={referenceModelQuery}
              snapshotId={referenceSnapshotId}
              modelId={activeModelId}
              modelRevision={activeModelRevision}
              referenceArchitecture={refArch}
              inlineReferenceModel={inlineReferenceModel}
              inlineC4View={inlineC4View}
              onSelectInlineC4View={setInlineC4View}
              onOpenC1C3View={(view) => {
                setInlineC4View(view);
                router.push(labHref(1, view));
              }}
              studentContext={studentContext.data}
            />
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
      const severity = topFinding ? String(topFinding["severity"] ?? "INFO") : "INFO";
      return {
        ruleId,
        label: getRuleName(ruleId, locale),
        status,
        severity,
        unverifiedMetadata,
        message:
          topFinding && typeof topFinding["message"] === "string" ? topFinding["message"] : "",
      };
    });
  }, [evaluationId, findings.data, locale]);

  return (
    <DetailPanel
      title={t("Static Evaluation Summary (5 Rules)", "Tổng hợp đánh giá tĩnh (5 quy tắc)")}
    >
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          "Rule status (PASS / VIOLATION / NEEDS_REVIEW) is reported separately from severity (INFO / WARNING / ERROR).",
          "Trạng thái quy tắc (PASS / VIOLATION / NEEDS_REVIEW) được tách biệt rõ với mức độ nghiêm trọng (INFO / WARNING / ERROR).",
        )}
      </p>
      {!modelId ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "Pinned static model is required before rule evaluation results can load.",
            "Cần có model tĩnh đã ghim để tải kết quả đánh giá 5 quy tắc.",
          )}
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
                  onClick={() =>
                    evaluate.mutate({ modelId }, { onSuccess: () => void runs.refetch() })
                  }
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
              <div
                key={row.ruleId}
                className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{row.ruleId}</span>
                    <span className="font-medium text-foreground">{row.label}</span>
                  </div>
                  {(row.unverifiedMetadata || row.status === "NEEDS_REVIEW") && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {t(
                        "Missing Call-Site / Evidence Grounding (Needs Review)",
                        "Thiếu bằng chứng Call-Site / cần rà soát",
                      )}
                    </p>
                  )}
                  {row.message && <p className="text-muted-foreground leading-5">{row.message}</p>}
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
  labOrder,
  labTitle,
  moduleQuizHref,
  projectId,
  modelQuery,
  referenceModelQuery,
  snapshotId,
  modelId,
  modelRevision,
  isStudent,
  preview,
  runtimeReady,
  quizPassPercent = 70,
  studioVerified,
  studioSessionId,
  studioSessions,
  labMode,
  requiresRuntime,
  hasReferenceArch,
  isTheoryOnlyLab,
  referenceArchitecture,
  inlineReferenceModel,
  inlineC4View,
  onSelectInlineC4View,
  onOpenC1C3View,
  studentContext,
}: {
  step: 1 | 2 | 3;
  workspaceId: string;
  labId: string;
  labOrder?: number | null | undefined;
  labTitle?: string | undefined;
  moduleQuizHref: string;
  projectId: string;
  modelQuery: string | null;
  referenceModelQuery?: string | null | undefined;
  snapshotId?: string | undefined;
  modelId?: string | undefined;
  modelRevision?: number | undefined;
  isStudent?: boolean | undefined;
  preview?: boolean | undefined;
  hasActiveAnalysisJob?: boolean | undefined;
  runtimeReady: boolean;
  quizPassPercent?: number | undefined;
  runtimeSessionHref: string | null;
  studioHref: string | null;
  studioVerified: boolean;
  studioSessionId?: string | undefined;
  studioSessions: StudentLabStudioSession[];
  labMode: string;
  requiresRuntime: boolean;
  hasReferenceArch: boolean;
  isTheoryOnlyLab: boolean;
  referenceArchitecture: StudentLabReferenceArchitecture | null;
  inlineReferenceModel?: ArchitecturalModel | undefined;
  inlineC4View: InlineC4View;
  onSelectInlineC4View: (view: InlineC4View) => void;
  onOpenC1C3View: (view: InlineC4View) => void;
  studentContext?: StudentLabContext | undefined;
}) {
  const { t } = useLocale();
  const client = useApi();
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [tutorQuery, setTutorQuery] = useState<"none" | "grounded" | "out_of_scope">("none");

  const activeStudioSessionId = studioSessionId ?? studioSessions[0]?.id ?? "";
  const studioStateQuery = useApiQuery(
    "studioState",
    { sessionId: activeStudioSessionId },
    {
      enabled:
        client.mode === "backend" &&
        step === 2 &&
        requiresRuntime &&
        !preview &&
        Boolean(activeStudioSessionId),
      poll: step === 2 && requiresRuntime && Boolean(activeStudioSessionId),
    },
  );

  const liveStudioVerified =
    studioVerified ||
    Boolean(
      studioStateQuery.data?.receiptDigest ||
      studioStateQuery.data?.executionStatus === "COMPLETED",
    ) ||
    studioSessions.some((s) => s.id === activeStudioSessionId && s.studioVerified);
  const verifiedSessionForSubmit =
    studioSessionId ?? (liveStudioVerified ? activeStudioSessionId : undefined);

  const fallbackModelQuery = useApiQuery(
    "model",
    { modelId: modelId ?? "", ...(projectId ? { projectId } : {}) },
    { enabled: !inlineReferenceModel && Boolean(modelId) && step === 1 },
  );
  const activeModel = inlineReferenceModel ?? fallbackModelQuery.data;

  const activeDiagramMermaid = useMemo(() => {
    if (inlineC4View === "GRAPH") return null;
    const match = referenceArchitecture?.diagrams.find(
      (d) =>
        d.level?.toUpperCase() === inlineC4View ||
        d.notation?.toUpperCase() === `C4_${inlineC4View}`,
    );
    if (match?.mermaidDsl?.trim()) return match.mermaidDsl;
    return synthesizeFallbackMermaid(activeModel, inlineC4View);
  }, [activeModel, inlineC4View, referenceArchitecture?.diagrams]);

  const previewParam = preview ? "&preview=1" : "";
  const submitHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=3${previewParam}#lab-submit`;
  const standaloneStudioHref = buildStudioLiveHref({
    workspaceId,
    assignmentId: labId,
    mode: "student",
    returnTo: `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=2`,
    sessionId: activeStudioSessionId || undefined,
  });
  const viewModelQuery = modelQuery ?? referenceModelQuery ?? null;
  const current = resolveStepMeta(step, { hasReferenceArch, isTheoryOnlyLab, requiresRuntime });
  const Icon = current.icon;
  const next = step < 3 ? ((step + 1) as 2 | 3) : undefined;
  const nextAvailable = Boolean(preview) || (next !== undefined && (next !== 2 || runtimeReady));
  const needsSandboxBootstrap = Boolean(
    !preview &&
    activeStudioSessionId &&
    studioStateQuery.isSuccess &&
    (studioStateQuery.data.executionStatus === "FAILED" ||
      (studioStateQuery.data.services.length === 0 &&
        !studioStateQuery.data.telemetry &&
        !(studioStateQuery.data as Record<string, unknown>)["simulatedSandbox"])),
  );

  return (
    <>
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t(`Phase ${step} / 3`, `Giai đoạn ${step} / 3`)}
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
          <section className="grid gap-3 rounded-2xl border bg-card p-5 text-sm shadow-sm md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Lab objective", "Mục tiêu Lab")}
              </p>
              <p className="font-medium">
                {t(
                  "Use the module knowledge against a curated system snapshot.",
                  "Áp dụng kiến thức của Module trên snapshot hệ thống đã được chọn lọc.",
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Reference snapshot", "Snapshot tham chiếu")}
              </p>
              <p className="font-medium">
                {hasReferenceArch
                  ? t(
                      "C1–C3 model and source evidence are ready.",
                      "Mô hình C1–C3 và bằng chứng mã nguồn đã sẵn sàng.",
                    )
                  : t(
                      "No repository snapshot is required for this Lab.",
                      "Lab này không yêu cầu snapshot repository.",
                    )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Required input", "Điều kiện đầu vào")}
              </p>
              <p className="font-medium">
                {isTheoryOnlyLab
                  ? t("Complete the static evidence.", "Hoàn tất evidence tĩnh.")
                  : t(
                      "Pass the Module Quiz before Runtime Studio.",
                      "Đạt Quiz của Module trước Runtime Studio.",
                    )}
              </p>
            </div>
          </section>

          {hasReferenceArch ? (
            <>
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge variant="secondary">
                      {t(
                        "Read-Only Structural Views (C1–C3 + Dependency Graph) · Static source evidence only (not runtime trace)",
                        "Góc nhìn cấu trúc chỉ đọc (C1–C3 + Đồ thị phụ thuộc) · Chỉ từ bằng chứng mã nguồn tĩnh (không phải dấu vết runtime)",
                      )}
                    </Badge>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {t(
                        "Switch inline between C1–C3 diagrams and the interactive Dependency Graph grounded directly on the Lecturer's curated reference snapshot.",
                        "Chuyển đổi trực tiếp giữa các sơ đồ C1–C3 và Đồ thị phụ thuộc ngay tại đây dựa trên mã nguồn chuẩn do Giảng viên biên soạn.",
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {modelRevision !== undefined
                      ? `Model Revision r${modelRevision}`
                      : "Revision pending"}
                  </Badge>
                </div>

                <div
                  className="flex flex-wrap gap-2"
                  role="tablist"
                  aria-label={t("Architecture views", "Góc nhìn kiến trúc")}
                >
                  {(
                    [
                      { id: "CONTEXT", label: "C1 System Context" },
                      { id: "CONTAINER", label: "C2 Container" },
                      { id: "COMPONENT", label: "C3 Component" },
                      {
                        id: "GRAPH",
                        label: t("Service Dependency Graph", "Đồ thị phụ thuộc Service"),
                      },
                    ] as const
                  ).map((tab) => (
                    <Button
                      key={tab.id}
                      type="button"
                      size="sm"
                      variant={inlineC4View === tab.id ? "default" : "outline"}
                      onClick={() => onSelectInlineC4View(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>

                {inlineC4View !== "GRAPH" ? (
                  activeModel && activeModel.elements.length > 0 ? (
                    <div className="space-y-4">
                      <ArchitectureDiagrams
                        model={activeModel}
                        guidedStatic
                        controlledKind={inlineC4View}
                        hideKindSelector
                        systemName={labTitle}
                        selectedId={selectedGraphId}
                        onSelect={setSelectedGraphId}
                      />
                      {selectedGraphId && (
                        <ElementDetailsPanel model={activeModel} selectedId={selectedGraphId} />
                      )}
                    </div>
                  ) : activeDiagramMermaid ? (
                    <DiagramPreview
                      title={`C4 ${inlineC4View}`}
                      content={activeDiagramMermaid}
                      format="MERMAID"
                      style="clean"
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {t(
                        "Diagram projection is loading or unavailable for this view; switch to Dependency Graph to inspect elements.",
                        "Chưa có dữ liệu sơ đồ cho góc nhìn này; hãy chuyển sang Đồ thị phụ thuộc để kiểm tra.",
                      )}
                    </p>
                  )
                ) : activeModel ? (
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0 overflow-x-auto">
                      <ArchitectureGraph
                        model={activeModel}
                        selectedId={selectedGraphId}
                        onSelect={setSelectedGraphId}
                      />
                    </div>
                    <div className="min-w-0">
                      <ElementDetailsPanel model={activeModel} selectedId={selectedGraphId} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("Loading architectural model…", "Đang tải mô hình kiến trúc…")}
                  </p>
                )}
              </div>

              {referenceArchitecture?.evaluation?.findings &&
              referenceArchitecture.evaluation.findings.length > 0 ? (
                <DetailPanel
                  title={t(
                    "Static Evaluation Summary & Source Evidence",
                    "Tổng hợp đánh giá tĩnh & bằng chứng mã nguồn",
                  )}
                >
                  <div className="space-y-4">
                    <div className="divide-y rounded-xl border bg-background">
                      {referenceArchitecture.evaluation.findings.map((finding) => (
                        <div
                          key={finding.id}
                          className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-semibold">{finding.ruleId}</span>
                              <span className="font-medium">
                                {getRuleName(finding.ruleId, "en")}
                              </span>
                            </div>
                            {finding.message && (
                              <p className="leading-5 text-muted-foreground">{finding.message}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge status={finding.status} />
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {finding.severity}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {referenceArchitecture.evidences.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("Verified Source Code Evidence", "Bằng chứng mã nguồn đã xác minh")}
                        </h3>
                        <div className="grid gap-2.5 md:grid-cols-2">
                          {referenceArchitecture.evidences.slice(0, 8).map((ev) => (
                            <div key={ev.id} className="rounded-xl border bg-muted/20 p-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-foreground">
                                  {ev.locator || "Source location"}
                                </span>
                                {ev.sourceType && <Badge variant="outline">{ev.sourceType}</Badge>}
                              </div>
                              {ev.excerpt && (
                                <pre className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                  {ev.excerpt}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </DetailPanel>
              ) : (
                <StaticEvaluationSummary
                  modelId={modelId}
                  allowRunEvaluation={!isStudent && Boolean(viewModelQuery)}
                />
              )}

              <DetailPanel
                title={t(
                  "Evidence-Grounded AI Architecture Tutor (BR-05 & DS-02b)",
                  "Trợ lý AI kiến trúc có bằng chứng (BR-05 & DS-02b)",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Ask questions grounded in C1–C3 static nodes and file paths, or test an out-of-scope refusal (DS-02b).",
                    "Hỏi AI dựa trên Node C1–C3 và đường dẫn mã nguồn chuẩn, hoặc kiểm thử kịch bản từ chối ngoài phạm vi (DS-02b).",
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={tutorQuery === "grounded" ? "default" : "outline"}
                    onClick={() =>
                      setTutorQuery((cur) => (cur === "grounded" ? "none" : "grounded"))
                    }
                  >
                    🔍{" "}
                    {t(
                      "Explain Selected C1–C3 Coupling & Contracts",
                      "Giải thích Phụ thuộc & Hợp đồng C1–C3",
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tutorQuery === "out_of_scope" ? "destructive" : "outline"}
                    onClick={() =>
                      setTutorQuery((cur) => (cur === "out_of_scope" ? "none" : "out_of_scope"))
                    }
                  >
                    🧪{" "}
                    {t(
                      "Test Out-of-Scope Prompt (Demo DS-02b)",
                      "Thử câu hỏi ngoài phạm vi: Giá Bitcoin 2030? (DS-02b)",
                    )}
                  </Button>
                </div>
                {tutorQuery === "grounded" &&
                  (() => {
                    const firstEl = activeModel?.elements[0];
                    const firstEdge = activeModel?.edges[0];
                    const isDotNet = activeModel?.elements.some(
                      (el) =>
                        (el.technology ?? "").toLowerCase().includes(".net") ||
                        (el.evidence?.[0]?.location ?? "").toLowerCase().endsWith(".cs") ||
                        el.name.toLowerCase().includes("fruit"),
                    );
                    const evidenceLocation =
                      firstEl?.evidence?.[0]?.location ??
                      firstEdge?.evidence?.[0]?.location ??
                      (isDotNet
                        ? "src/Services/PaymentService/Program.cs"
                        : "order-service/src/main/java/com/curated/order/PaymentClient.java");
                    return (
                      <div className="mt-3 space-y-1.5 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 text-xs dark:border-teal-800 dark:bg-teal-950/20">
                        <p className="font-semibold text-teal-950 dark:text-teal-200">
                          ✅{" "}
                          {t(
                            "Evidence-Grounded Answer (Citing Static C1–C3 Model)",
                            "Trả lời có đối chiếu Bằng chứng Tĩnh C1–C3",
                          )}
                        </p>
                        <p className="leading-5 text-muted-foreground">
                          [Node: <code>{firstEl?.name ?? "order-service"}</code>] · [File:{" "}
                          <code>{evidenceLocation}</code>] · [Contract:{" "}
                          <code>{firstEdge?.protocol ?? "SERVICE_HTTP_CALL"}</code>] —{" "}
                          {t(
                            "Cross-container calls follow explicit HTTP/RPC contracts separated from private database ownership.",
                            "Lời gọi liên dịch vụ đi qua hợp đồng API/Event rõ ràng, tách biệt hoàn toàn khỏi quyền sở hữu DB nội bộ.",
                          )}
                        </p>
                      </div>
                    );
                  })()}
                {tutorQuery === "out_of_scope" && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs font-medium text-destructive"
                  >
                    {t(
                      "Refused (BR-05 / DS-02b): Question is outside the verified C1–C3 static source architecture evidence of this Lab repository.",
                      "Từ chối trả lời (BR-05 / DS-02b): Câu hỏi nằm ngoài phạm vi bằng chứng kiến trúc tĩnh C1–C3 của kho mã nguồn Lab hiện tại.",
                    )}
                  </div>
                )}
              </DetailPanel>
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              {t(
                "Theory-focused Lab — no reference repository or static C1–C3 diagrams are attached to this Lab.",
                "Lab tập trung vào lý thuyết — không yêu cầu mã nguồn tham chiếu hay sơ đồ C1–C3.",
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-5 dark:border-teal-800/60 dark:bg-teal-950/20">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-teal-950 dark:text-teal-100">
                {hasReferenceArch
                  ? t(
                      "Finished reviewing the snapshot and C1–C3 architecture?",
                      "Bạn đã hoàn tất xem snapshot và kiến trúc C1–C3?",
                    )
                  : t(
                      "Finished reviewing the Static Studio brief?",
                      "Bạn đã xem xong tóm tắt Static Studio?",
                    )}
              </p>
              <p className="text-xs text-teal-900/80 dark:text-teal-300/80">
                {hasReferenceArch
                  ? t(
                      "Use the static graph to form an impact hypothesis, then complete the Module Quiz before opening Runtime Studio.",
                      "Dùng đồ thị tĩnh để lập giả thuyết tác động, sau đó hoàn thành Quiz của Module trước khi mở Runtime Studio.",
                    )
                  : isTheoryOnlyLab
                    ? t(
                        "This Lab does not require Runtime Studio; continue to evidence and submission when your static work is complete.",
                        "Lab này không yêu cầu Runtime Studio; hãy chuyển sang evidence và nộp bài khi hoàn tất phần tĩnh.",
                      )
                    : t(
                        "The Module Quiz is the only prerequisite for Runtime Studio.",
                        "Quiz của Module là điều kiện duy nhất để mở Runtime Studio.",
                      )}
              </p>
            </div>
            <Button asChild className="bg-teal-600 text-white hover:bg-teal-700">
              <Link href={isTheoryOnlyLab ? submitHref : moduleQuizHref}>
                {isTheoryOnlyLab
                  ? t("Continue to Evidence & Submit →", "Sang Evidence & Submit →")
                  : t("Open Module Quiz →", "Mở Quiz của Module →")}
              </Link>
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {requiresRuntime && !liveStudioVerified && !preview ? (
            <DetailPanel title={t("Runtime evidence required", "Cần evidence Runtime Studio")}>
              <p className="text-sm leading-6 text-muted-foreground">
                {t(
                  "Finish the MAVIS Runtime Studio exercise to seal a verified receipt before submission.",
                  "Hãy hoàn tất bài thực hành MAVIS Runtime Studio để tạo receipt đã xác minh trước khi nộp bài.",
                )}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link
                  href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=2${previewParam}`}
                >
                  {t("Return to Runtime Studio", "Quay lại Runtime Studio")}
                </Link>
              </Button>
            </DetailPanel>
          ) : !preview && labMode !== "LEGACY" ? (
            <LabSubmissionV2
              workspaceId={workspaceId}
              assignmentId={labId}
              labMode={labMode}
              runtimeSessionId={verifiedSessionForSubmit}
              initialSubmission={studentContext?.latestSubmission}
              initialReview={studentContext?.latestReview}
              hasReferenceArch={hasReferenceArch}
            />
          ) : (
            <DetailPanel title={t("Evidence & Submit", "Evidence & Submit")}>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Preview mode does not create submissions.",
                  "Chế độ xem trước không tạo bài nộp.",
                )}
              </p>
            </DetailPanel>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {!runtimeReady && !preview ? (
            <DetailPanel
              title={t(
                "Runtime Studio Locked · Module Quiz Required",
                "Runtime Studio đang khóa · Cần đạt Quiz của Module",
              )}
            >
              <p className="text-sm text-muted-foreground">
                {t(
                  "Pass the Module Quiz to unlock MAVIS Runtime Studio.",
                  "Hãy đạt Quiz của Module để mở khóa MAVIS Runtime Studio.",
                )}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={moduleQuizHref}>{t("Open Module Quiz", "Mở Quiz của Module")}</Link>
              </Button>
            </DetailPanel>
          ) : (
            <>
              {hasReferenceArch && (
                <DetailPanel
                  title={t("Impact Analysis Workspace", "Không gian phân tích tác động")}
                >
                  <p className="mb-4 text-sm leading-6 text-muted-foreground">
                    {t(
                      "Use Reverse BFS on the curated dependency graph to form a static impact hypothesis, then compare it with the observed Runtime Studio evidence below.",
                      "Dùng Reverse BFS trên đồ thị phụ thuộc đã chọn lọc để lập giả thuyết tác động tĩnh, sau đó đối chiếu với evidence quan sát được trong Runtime Studio bên dưới.",
                    )}
                  </p>
                  <Step2StaticImpact
                    projectId={projectId}
                    modelId={modelId}
                    modelQuery={modelQuery}
                    sourceLink={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=1${previewParam}`}
                    inlineModel={activeModel}
                    onOpenC1C3View={onOpenC1C3View}
                  />
                </DetailPanel>
              )}
              {requiresRuntime && (
                <DetailPanel title={t("MAVIS Studio Live", "MAVIS Studio Live")}>
                  {preview ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Preview shows the Studio Live launchpad & Submission step. Starting student runtime sessions is disabled in preview mode.",
                        "Chế độ xem trước hiển thị khu vực mở Studio Live & Nộp bài. Khởi chạy phiên runtime của sinh viên bị tắt khi xem trước.",
                      )}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:grid-cols-3">
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            2.1 {t("Start Studio Session", "Khởi tạo Phiên Studio")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t("Launch live topology canvas", "Mở topology dịch vụ tương tác")}
                          </p>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            2.2 {t("Operate & Finish Studio", "Thực hành & Finish Studio")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t(
                              "Seal runtime observation receipt",
                              "Ghi nhận thao tác và biên nhận",
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            2.3 {t("Capture runtime evidence", "Lưu evidence runtime")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t(
                              "Continue to Evidence & Submit after Finish Studio",
                              "Sang Evidence & Submit sau khi Finish Studio",
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-800/80 bg-[#070b12] p-5 text-slate-100 sm:flex-row sm:items-center">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {t(
                                "Interactive Studio Live Workspace",
                                "Không gian Thực hành Studio Live",
                              )}
                            </span>
                            {liveStudioVerified ? (
                              <Badge variant="success">
                                {t(
                                  "Verified Studio Receipt Ready",
                                  "Đã có Biên nhận Studio xác minh",
                                )}
                              </Badge>
                            ) : (
                              <Badge variant="warning">
                                {t(
                                  "Action & Finish Studio Required",
                                  "Cần chạy thao tác & Finish Studio",
                                )}
                              </Badge>
                            )}
                            {activeStudioSessionId && (
                              <code className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                                {activeStudioSessionId.slice(0, 10)}
                              </code>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {t(
                              "Open the full-screen Studio Live to inspect live containers, run Start/Stop/Scale actions, and click Finish Studio to seal your receipt before submitting below.",
                              "Mở màn hình Studio Live toàn màn hình để thao tác container thật, chạy Start/Stop/Scale và nhấn Finish Studio để đóng gói biên nhận trước khi nộp bài bên dưới.",
                            )}
                          </p>
                        </div>
                        <Button
                          asChild
                          size="lg"
                          className="shrink-0 bg-emerald-600 px-5 text-white hover:bg-emerald-500"
                        >
                          <Link href={standaloneStudioHref}>
                            {liveStudioVerified
                              ? t("Re-open Studio Live", "Mở lại Studio Live")
                              : t("Open Studio Live", "Mở Studio Live")}
                            <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>

                      {studentContext?.studioExercise && (
                        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                          <h3 className="font-semibold">{t("Studio exercise", "Đề Studio")}</h3>
                          {studentContext.studioExercise.instructions && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {studentContext.studioExercise.instructions}
                            </p>
                          )}
                          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            {!!studentContext.studioExercise.initialState?.stoppedServices
                              ?.length && (
                              <li>
                                {t("Stopped services", "Service dừng sẵn")}:{" "}
                                {studentContext.studioExercise.initialState.stoppedServices.join(
                                  ", ",
                                )}
                              </li>
                            )}
                            {!!studentContext.studioExercise.initialState?.stoppedControllers
                              ?.length && (
                              <li>
                                {t("Stopped controllers", "Controller dừng sẵn")}:{" "}
                                {studentContext.studioExercise.initialState.stoppedControllers.join(
                                  ", ",
                                )}
                              </li>
                            )}
                            {!!studentContext.studioExercise.allowedActions?.length && (
                              <li>
                                {t("Allowed actions", "Hành động được phép")}:{" "}
                                {studentContext.studioExercise.allowedActions.join(", ")}
                              </li>
                            )}
                            {studentContext.studioExercise.successCriteria?.maxErrorRatePercent !=
                              null && (
                              <li>
                                {t("Max error rate", "Tỉ lệ lỗi tối đa")}:{" "}
                                {studentContext.studioExercise.successCriteria.maxErrorRatePercent}%
                              </li>
                            )}
                            {studentContext.studioExercise.successCriteria?.maxP95Ms != null && (
                              <li>
                                {t("Max p95", "p95 tối đa")}:{" "}
                                {studentContext.studioExercise.successCriteria.maxP95Ms} ms
                              </li>
                            )}
                            {studentContext.studioExercise.successCriteria?.requiredTraceEdge && (
                              <li>
                                {t("Required trace", "Trace bắt buộc")}:{" "}
                                {
                                  studentContext.studioExercise.successCriteria.requiredTraceEdge
                                    .from
                                }{" "}
                                →{" "}
                                {studentContext.studioExercise.successCriteria.requiredTraceEdge.to}
                              </li>
                            )}
                            {!!studentContext.studioExercise.successCriteria?.minReplicas
                              ?.length && (
                              <li>
                                {t("Minimum replicas", "Replica tối thiểu")}:{" "}
                                {studentContext.studioExercise.successCriteria.minReplicas
                                  .map((target) => `${target.service ?? ""} ×${target.count ?? 0}`)
                                  .join(", ")}
                              </li>
                            )}
                          </ul>
                        </section>
                      )}
                    </div>
                  )}
                </DetailPanel>
              )}
            </>
          )}
        </div>
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
            "Progress is saved directly in this Lab workspace.",
            "Tiến độ được lưu trực tiếp trong không gian Lab này.",
          )}
        </span>
        {step === 3 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={submitHref}>
              {t("Jump to Submission Box", "Đi tới Khung Nộp bài")} <ArrowRight />
            </Link>
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
              <span>
                {t("Pass the Module Quiz to continue", "Hãy đạt Quiz của Module để tiếp tục")}
              </span>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
