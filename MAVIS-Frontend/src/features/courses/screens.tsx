"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useLocale } from "@/lib/i18n/locale-context";
import {
  buildDeterministicThreeESimplified,
  buildThreeEAiContext,
  buildThreeESubjectContext,
  checkThreeEScopeGuardrail,
  collectConcreteThreeEEvidences,
  getRuleName,
} from "@/features/architecture/three-e-content";
import { Input } from "@/components/ui/input";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { ArchitectureDiagrams } from "@/features/architecture/architecture-diagrams";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { buildStudioLiveHref } from "@/features/runtime/standalone-studio-live";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
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

type LabPhaseIssueKind =
  | "static-guidance"
  | "static-data"
  | "runtime-guidance"
  | "runtime-configuration"
  | "runtime-failed"
  | "evidence-missing"
  | "submission-explanation"
  | "submission-runtime"
  | "submission-failed";

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
    title: "Evidence Review",
    shortTitle: "Evidence Review",
    description:
      "Review the Studio evidence and receipt before submitting the completed Lab for grading.",
    titleVi: "Kiểm tra Evidence",
    shortTitleVi: "Kiểm tra Evidence",
    descriptionVi:
      "Kiểm tra evidence và receipt của Studio trước khi nộp Lab hoàn tất để chấm.",
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
  const moduleQuizItem = moduleItems.find((item) => item.type === "QUIZ") ?? null;
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
    isLecturer ||
    (!quiz.isError && quiz.data?.runtimeUnlocked === true) ||
    studentContext.data?.quiz?.runtimeUnlocked === true;
  const requiresRuntime =
    lab?.requireRuntimeTrace === true ||
    lab?.labMode === "THEORY_QUIZ_STUDIO" ||
    studentContext.data?.studioExercise != null;
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
      return t("Runtime Studio is not available yet.", "Runtime Studio hiện chưa sẵn sàng.");
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
  const tocItems: LabTocItem[] = moduleItems
    .filter((item) => item.type !== "QUIZ")
    .map((item) => {
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
            label: t("Course prerequisite", "Điều kiện khóa học"),
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
        <div className="space-y-4">
          <header className="mavis-hero-surface p-4 text-white sm:p-5">
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
                <div className="space-y-2">
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                    {lab.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-sky-100">
                    {readiness.map((gate) => (
                      <span
                        key={gate.label}
                        className="rounded-md border border-white/15 bg-slate-950/15 px-2 py-1"
                      >
                        <span className="text-sky-200">{gate.label}</span>: {gate.state}
                      </span>
                    ))}
                  </div>
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

          <div className="min-w-0 space-y-5">
            <StepContent
              requiresRuntime={requiresRuntime}
              hasReferenceArch={hasReferenceArch}
              isTheoryOnlyLab={isTheoryOnlyLab}
              runtimeReady={runtimeReady}
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
              moduleQuizHref={
                moduleQuizItem
                  ? `/roadmap?workspace=${encodeURIComponent(workspaceId)}&item=${encodeURIComponent(moduleQuizItem.id)}`
                  : `/roadmap?workspace=${encodeURIComponent(workspaceId)}`
              }
              projectId={projectId}
              referenceProjectId={referenceProjectId}
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
              studentContextLoading={studentContext.isPending}
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
              <details key={row.ruleId} className="group text-xs">
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-3 marker:content-none">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{row.ruleId}</span>
                      <span className="font-medium text-foreground">{row.label}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t("Rule Status", "Trạng thái")}</span>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t("Severity", "Mức độ")}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{row.severity}</Badge>
                    </div>
                  </div>
                </summary>
                <div className="space-y-2 border-t px-3 py-2.5">
                  {(row.unverifiedMetadata || row.status === "NEEDS_REVIEW") && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {t("Missing Call-Site / Evidence Grounding (Needs Review)", "Thiếu bằng chứng Call-Site / cần rà soát")}
                    </p>
                  )}
                  {row.message ? (
                    <p className="leading-5 text-muted-foreground">{row.message}</p>
                  ) : (
                    <p className="leading-5 text-muted-foreground">{t("No additional persisted finding detail is available for this rule.", "Chưa có chi tiết finding được lưu thêm cho quy tắc này.")}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </DetailPanel>
  );
}

function RuntimeEvidenceStatus({
  complete,
  label,
  detail,
}: {
  complete: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center gap-2 font-medium">
        <span
          className={
            complete
              ? "flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white"
              : "flex size-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          }
          aria-hidden="true"
        >
          {complete ? <Check className="size-3" /> : "!"}
        </span>
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
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
  referenceProjectId,
  modelQuery,
  referenceModelQuery,
  snapshotId,
  modelId,
  modelRevision,
  isStudent,
  preview,
  runtimeReady,
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
  studentContextLoading,
}: {
  step: 1 | 2 | 3;
  workspaceId: string;
  labId: string;
  labOrder?: number | null | undefined;
  labTitle?: string | undefined;
  moduleQuizHref: string;
  projectId: string;
  referenceProjectId?: string | undefined;
  modelQuery: string | null;
  referenceModelQuery?: string | null | undefined;
  snapshotId?: string | undefined;
  modelId?: string | undefined;
  modelRevision?: number | undefined;
  isStudent?: boolean | undefined;
  preview?: boolean | undefined;
  hasActiveAnalysisJob?: boolean | undefined;
  runtimeReady: boolean;
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
  studentContextLoading?: boolean | undefined;
}) {
  const { t, locale } = useLocale();
  const client = useApi();
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorHistory, setTutorHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [tutorReply, setTutorReply] = useState<{
    question: string;
    answer: string;
    blocked?: boolean;
    provider?: string;
    citations?: string[];
  } | null>(null);
  const runtimeConfigurationMissing = step === 2 && !requiresRuntime;
  const runtimePrerequisiteMissing = step === 2 && requiresRuntime && !runtimeReady && !preview;
  const runtimeUnavailable = runtimeConfigurationMissing || runtimePrerequisiteMissing;
  const moduleQuiz = studentContext?.quiz ?? null;
  const moduleQuizStatus = moduleQuiz?.latestStatus ?? "NOT_ATTEMPTED";
  const [runtimeConfigurationDialogOpen, setRuntimeConfigurationDialogOpen] = useState(false);
  const [phaseIssue, setPhaseIssue] = useState<LabPhaseIssueKind | null>(null);
  const [phaseIssueDialogOpen, setPhaseIssueDialogOpen] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const shownAutomaticIssueKeys = useRef(new Set<string>());

  useEffect(() => {
    setRuntimeConfigurationDialogOpen(runtimeUnavailable);
  }, [runtimeUnavailable]);

  const activeStudioSessionId = studioSessionId ?? studioSessions[0]?.id ?? "";
  const studioStateQuery = useApiQuery(
    "studioState",
    { sessionId: activeStudioSessionId },
    {
      enabled:
        client.mode === "backend" &&
        (step === 2 || step === 3) &&
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
  const previewParam = preview ? "&preview=1" : "";
  const runtimeEvidence = studioStateQuery.data;
  const confirmedRuntimeActions =
    runtimeEvidence?.actions.filter((action) => action.status === "CONFIRMED") ?? [];
  const hasBeforeAfterEvidence = confirmedRuntimeActions.some(
    (action) => Boolean(action.result?.metricsBefore) && Boolean(action.result?.metricsAfter),
  );
  const runtimeEvidenceHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=2${previewParam}`;

  const resolvedModelProjectId =
    referenceArchitecture?.projectId ??
    studentContext?.assignment?.referenceSource?.projectId ??
    (referenceProjectId || projectId);
  const fallbackModelQuery = useApiQuery(
    "model",
    {
      modelId: modelId ?? "",
      ...(resolvedModelProjectId ? { projectId: resolvedModelProjectId } : {}),
    },
    { enabled: !inlineReferenceModel && Boolean(modelId) && Boolean(studentContext) && step === 1 },
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

  const submitHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=3${previewParam}#lab-submit`;
  const jumpToSubmissionBox = () => {
    const submissionBox = document.getElementById("lab-submit");
    if (!submissionBox) return;
    submissionBox.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", submitHref);
  };
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
  const nextStep = step === 1 && !requiresRuntime ? 3 : next;
  const nextAvailable =
    nextStep !== undefined && !(step === 2 && requiresRuntime && !liveStudioVerified && !preview);
  const needsSandboxBootstrap = Boolean(
    !preview &&
    activeStudioSessionId &&
    studioStateQuery.isSuccess &&
    (studioStateQuery.data.executionStatus === "FAILED" ||
      (studioStateQuery.data.services.length === 0 &&
        !studioStateQuery.data.telemetry &&
        !(studioStateQuery.data as Record<string, unknown>)["simulatedSandbox"])),
  );
  const selectedElement = activeModel?.elements.find((item) => item.id === selectedGraphId);
  const selectedConnection = activeModel?.edges.find((item) => item.id === selectedGraphId);
  const selectedArchitectureLabel = selectedElement?.name ??
    (selectedConnection
      ? `${activeModel?.elements.find((item) => item.id === selectedConnection.from)?.name ?? selectedConnection.from} → ${activeModel?.elements.find((item) => item.id === selectedConnection.to)?.name ?? selectedConnection.to}`
      : null);
  const selectedTutorElement =
    activeModel?.elements.find((el) => el.id === selectedGraphId) ?? activeModel?.elements[0];
  const openSelectedContextInTutor = () => {
    const subjectName =
      selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this architecture";
    const promptText = t(
      `Explain the static dependencies, contracts, and source evidence of ${subjectName}.`,
      `Giải thích phụ thuộc tĩnh, hợp đồng kết nối và bằng chứng mã nguồn của ${subjectName}.`,
    );
    setTutorInput(promptText);
    void askAiTutor(promptText);
    document.getElementById("lab-ai-tutor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const askAiTutor = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || tutorLoading) return;
    const targetId =
      selectedGraphId ?? activeModel?.elements[0]?.id ?? activeModel?.edges[0]?.id ?? "";
    if (!activeModel || !targetId) {
      setTutorReply({
        question: q,
        answer: t(
          "Static architecture model is still loading. Try again once C1–C3 elements appear.",
          "Mô hình kiến trúc tĩnh đang tải. Hãy thử lại sau khi các phần tử C1–C3 hiển thị.",
        ),
        blocked: false,
        provider: "model-pending",
      });
      return;
    }
    const ctx = buildThreeESubjectContext({ model: activeModel, selectedId: targetId });
    const refEvidences: Evidence[] = (referenceArchitecture?.evidences ?? []).map((ev) => ({
      id: ev.id,
      origin: "persisted" as const,
      kind: "source" as const,
      sourceType: ev.sourceType ?? undefined,
      location: ev.locator ?? "Source",
      snippet: ev.excerpt ?? "",
      complete: true,
    }));
    const concreteEvidences = collectConcreteThreeEEvidences(activeModel, ctx, refEvidences);
    const deterministic3E = buildDeterministicThreeESimplified(
      activeModel,
      ctx,
      concreteEvidences,
      [],
      locale,
    );
    const threeEAiCtx = buildThreeEAiContext(activeModel, ctx, concreteEvidences, []);
    const citations = threeEAiCtx.codeSnippets.map((snippet) => snippet.locator).filter(Boolean).slice(0, 3);
    const guard = checkThreeEScopeGuardrail(q, threeEAiCtx, locale);
    if (!guard.allowed && guard.refusalMessage) {
      setTutorReply({
        question: q,
        answer: guard.refusalMessage,
        blocked: true,
        provider: "scope-guardrail",
      });
      return;
    }
    setTutorLoading(true);
    try {
      const res = await fetch("/api/ai-diagram-semantics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelVersionId: activeModel.id,
          projectId: activeModel.projectId,
          scopeKey: `lab:${labId}`,
          threeEChat: {
            threeEContext: threeEAiCtx,
            currentExplanation: {
              explainSimple: deterministic3E.explainSimple,
              exploreSimple: deterministic3E.exploreSimple,
              evaluateSimple: deterministic3E.evaluateSimple,
            },
            history: tutorHistory.slice(-4),
            question: q,
            locale,
          },
        }),
      });
      const data = (res.ok ? await res.json() : null) as {
        answer?: string;
        blocked?: boolean;
        provider?: string;
      } | null;
      const fallbackSummary = [deterministic3E.explainSimple, deterministic3E.exploreSimple]
        .filter(Boolean)
        .join(" ");
      const answer = data?.answer?.trim() || fallbackSummary;
      const blocked = Boolean(data?.blocked);
      setTutorReply({
        question: q,
        answer,
        blocked,
        provider: data?.provider ?? "ast-skeleton",
        citations,
      });
      if (!blocked) {
        setTutorHistory((prev) => [
          ...prev.slice(-4),
          { role: "user", content: q },
          { role: "assistant", content: answer },
        ]);
      }
    } catch {
      const fallbackSummary = [deterministic3E.explainSimple, deterministic3E.evaluateSimple]
        .filter(Boolean)
        .join(" ");
      setTutorReply({
        question: q,
        answer: fallbackSummary,
        blocked: false,
        provider: "ast-skeleton",
        citations,
      });
    } finally {
      setTutorLoading(false);
    }
  };

  const openPhaseIssue = (issue: LabPhaseIssueKind) => {
    setReportCopied(false);
    setPhaseIssue(issue);
    setPhaseIssueDialogOpen(true);
  };
  const phaseIssueContent = (() => {
    switch (phaseIssue) {
      case "static-data":
        return {
          title: t("Static Studio data could not load", "Không tải được dữ liệu Static Studio"),
          description: t("The curated architecture data is unavailable, so C1–C3 evidence cannot be reviewed safely.", "Dữ liệu kiến trúc đã chọn lọc hiện không tải được nên chưa thể kiểm tra evidence C1–C3 an toàn."),
          recovery: t("Refresh the Lab first. If this persists, copy the report for your lecturer to check the reference snapshot.", "Hãy tải lại Lab trước. Nếu lỗi vẫn còn, sao chép báo cáo để giảng viên kiểm tra snapshot tham chiếu."),
          actionLabel: t("Review Static Studio", "Xem lại Static Studio"),
          action: () => document.getElementById("lab-static-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        };
      case "runtime-configuration":
        return {
          title: t("Runtime Studio configuration is missing", "Runtime Studio chưa được cấu hình"),
          description: t("This Lab has no ready Runtime Studio topology, so the practical exercise cannot start.", "Lab này chưa có topology Runtime Studio sẵn sàng nên chưa thể bắt đầu phần thực hành."),
          recovery: t("This needs lecturer configuration. Copy the report and send it to your lecturer, then return after the Studio exercise is prepared.", "Trường hợp này cần giảng viên cấu hình. Hãy sao chép báo cáo gửi giảng viên rồi quay lại sau khi Studio exercise sẵn sàng."),
          actionLabel: t("Back to Lab", "Quay lại Lab"),
          action: () => undefined,
        };
      case "runtime-guidance":
      case "runtime-failed":
        return {
          title: phaseIssue === "runtime-failed" ? t("Runtime Studio session needs attention", "Phiên Runtime Studio cần được kiểm tra") : t("Need help with Runtime Studio?", "Cần hỗ trợ với Runtime Studio?"),
          description: phaseIssue === "runtime-failed" ? t("The current Runtime Studio session did not start or finish correctly, so its evidence is not valid yet.", "Phiên Runtime Studio hiện tại chưa khởi chạy hoặc hoàn tất đúng nên evidence chưa hợp lệ.") : t("Runtime Studio is where you run the assigned scenario and capture observed evidence using only allowed actions.", "Runtime Studio là nơi bạn chạy kịch bản được giao và lưu evidence quan sát với các thao tác được phép."),
          recovery: t("Open Studio Live, inspect the session, use only Stop, Start, or Scale, capture a snapshot, then choose Finish Studio. If it fails again, copy the report for your lecturer.", "Mở Studio Live, kiểm tra phiên, chỉ dùng Stop, Start hoặc Scale, lưu snapshot rồi chọn Finish Studio. Nếu vẫn lỗi, sao chép báo cáo gửi giảng viên."),
          actionLabel: t("Open Runtime Studio", "Mở Runtime Studio"),
          action: () => window.location.assign(standaloneStudioHref),
        };
      case "evidence-missing":
      case "submission-runtime":
        return {
          title: t("Runtime evidence is incomplete", "Evidence Runtime chưa đầy đủ"),
          description: t("This Lab needs a verified Runtime Studio receipt before it can be submitted to WF-04.", "Lab này cần receipt Runtime Studio đã xác minh trước khi có thể nộp sang WF-04."),
          recovery: t("Return to Runtime Studio, complete the scenario, capture the required evidence, and select Finish Studio to seal the receipt.", "Hãy quay lại Runtime Studio, hoàn tất kịch bản, lưu evidence bắt buộc và chọn Finish Studio để niêm phong receipt."),
          actionLabel: t("Return to Runtime Studio", "Quay lại Runtime Studio"),
          action: () => window.location.assign(runtimeEvidenceHref),
        };
      case "submission-failed":
        return {
          title: t("Lab submission could not be saved", "Không thể lưu bài nộp Lab"),
          description: t("Your draft remains in this browser so you can retry safely.", "Bản nháp vẫn được giữ trong trình duyệt này để bạn có thể thử lại an toàn."),
          recovery: t("Check the explanation and required Runtime receipt, then try again. If it still fails, copy the report for your lecturer.", "Hãy kiểm tra phần giải trình và receipt Runtime bắt buộc, rồi thử lại. Nếu vẫn lỗi, sao chép báo cáo gửi giảng viên."),
          actionLabel: t("Retry submission", "Thử nộp lại"),
          action: jumpToSubmissionBox,
        };
      case "submission-explanation":
        return {
          title: t("Your Lab explanation is required", "Cần có phần giải trình Lab"),
          description: t("The Lab cannot be submitted without your written explanation of the evidence and what you learned.", "Không thể nộp Lab nếu chưa có phần giải trình về evidence và kiến thức bạn rút ra."),
          recovery: t("Write your explanation in the submission box, connect it to the evidence, then submit again.", "Hãy viết phần giải trình trong khung nộp bài, liên hệ với evidence rồi nộp lại."),
          actionLabel: t("Go to submission", "Đi tới phần nộp bài"),
          action: jumpToSubmissionBox,
        };
      default:
        return {
          title: t("Need help with Static Studio?", "Cần hỗ trợ với Static Studio?"),
          description: t("Static Studio is for reviewing C1–C3 architecture, source evidence, and your Reverse BFS impact hypothesis.", "Static Studio dùng để xem kiến trúc C1–C3, evidence mã nguồn và giả thuyết tác động Reverse BFS."),
          recovery: t("Inspect the selected node or connection, read its evidence, then compare Reverse BFS with the dependency graph before moving on.", "Hãy kiểm tra node hoặc kết nối đã chọn, đọc evidence, rồi đối chiếu Reverse BFS với đồ thị phụ thuộc trước khi chuyển bước."),
          actionLabel: t("Open impact hypothesis", "Mở giả thuyết tác động"),
          action: () => document.getElementById("lab-static-impact")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        };
    }
  })();
  const copyPhaseIssueReport = async () => {
    const report = [`MAVIS Lab issue report`, `Lab: ${labTitle ?? labId}`, `Phase: ${step}/3 — ${current.title}`, `Issue: ${phaseIssueContent.title}`, `Workspace: ${workspaceId}`, `Assignment: ${labId}`, `Model: ${modelId ?? "not available"}${modelRevision !== undefined ? ` (r${modelRevision})` : ""}`, `Runtime session: ${activeStudioSessionId || "not started"}`].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setReportCopied(true);
    } catch {
      setReportCopied(false);
    }
  };
  useEffect(() => {
    const automaticIssue = step === 1 && fallbackModelQuery.isError ? "static-data" : step === 2 && needsSandboxBootstrap ? "runtime-failed" : step === 3 && requiresRuntime && !liveStudioVerified && !preview ? "evidence-missing" : null;
    if (!automaticIssue || shownAutomaticIssueKeys.current.has(`${step}:${automaticIssue}`)) return;
    shownAutomaticIssueKeys.current.add(`${step}:${automaticIssue}`);
    openPhaseIssue(automaticIssue);
  }, [fallbackModelQuery.isError, liveStudioVerified, needsSandboxBootstrap, preview, requiresRuntime, step]);

  return (
    <>
      <Dialog open={runtimeConfigurationDialogOpen} onOpenChange={setRuntimeConfigurationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {runtimeConfigurationMissing
                ? t("Runtime Studio is not configured", "Runtime Studio chưa được cấu hình")
                : t("Runtime Studio is locked", "Runtime Studio chưa được mở khóa")}
            </DialogTitle>
            <DialogDescription>
              {runtimeConfigurationMissing
                ? t(
                    "This Lab has no prepared Runtime Studio topology yet. A lecturer must configure the runtime source, topology, and Studio exercise before students can start a session.",
                    "Lab này chưa có topology Runtime Studio sẵn sàng. Giảng viên cần cấu hình nguồn runtime, topology và Studio exercise trước khi sinh viên có thể bắt đầu phiên thực hành.",
                  )
                : t(
                    "Complete the required module work, then return here to begin the Runtime Studio exercise.",
                    "Hoàn tất các nội dung bắt buộc của Module, sau đó quay lại đây để bắt đầu thực hành Runtime Studio.",
                  )}
            </DialogDescription>
            {runtimePrerequisiteMissing && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">
                  {t("Required before Runtime Studio", "Yêu cầu trước khi vào Runtime Studio")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t("Complete the Module Quiz", "Hoàn thành Quiz của Module")}: {moduleQuiz?.lesson ?? t("current module", "Module hiện tại")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Passing score", "Điểm đạt")}: {moduleQuiz?.passPercent ?? 70}% · {t("Current status", "Trạng thái hiện tại")}: {moduleQuizStatus === "NEEDS_RETRY"
                    ? t("Not passed — retry the quiz", "Chưa đạt — hãy làm lại Quiz")
                    : moduleQuizStatus === "NOT_ATTEMPTED"
                      ? t("Not started", "Chưa làm")
                      : t("In progress", "Đang thực hiện")}
                </p>
              </div>
            )}
          </DialogHeader>
          <DialogFooter>
            {runtimeConfigurationMissing && isStudent && (
              <Button type="button" variant="outline" onClick={() => {
                setRuntimeConfigurationDialogOpen(false);
                openPhaseIssue("runtime-configuration");
              }}>
                {t("Report configuration issue", "Báo lỗi cấu hình")}
              </Button>
            )}
            {runtimeConfigurationMissing && !isStudent && (
              <Button asChild>
                <Link
                  href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&tab=studio`}
                >
                  {t("Configure Runtime Studio", "Cấu hình Runtime Studio")}
                </Link>
              </Button>
            )}
            {runtimePrerequisiteMissing && (
              <Button asChild>
                <Link href={moduleQuizHref}>
                  {t("Go to Module Quiz", "Đi tới Quiz của Module")}
                </Link>
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setRuntimeConfigurationDialogOpen(false)}>
              {t("Back to Lab", "Quay lại Lab")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={phaseIssueDialogOpen} onOpenChange={setPhaseIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{phaseIssueContent.title}</DialogTitle>
            <DialogDescription>{phaseIssueContent.description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium text-foreground">{t("What you can do", "Bạn có thể làm gì")}</p>
            <p className="mt-1 leading-6 text-muted-foreground">{phaseIssueContent.recovery}</p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("If the recovery steps do not resolve it, copy this report and send it to your lecturer with a screenshot.", "Nếu các bước tự xử lý không khắc phục được, hãy sao chép báo cáo này và gửi cho giảng viên kèm ảnh màn hình.")}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyPhaseIssueReport()}>
              {reportCopied ? t("Report copied", "Đã sao chép báo cáo") : t("Copy report for lecturer", "Sao chép báo cáo cho giảng viên")}
            </Button>
            <Button type="button" onClick={() => {
              setPhaseIssueDialogOpen(false);
              phaseIssueContent.action();
            }}>
              {phaseIssueContent.actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section className="rounded-xl border bg-card px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t(`Phase ${step} / 3`, `Giai đoạn ${step} / 3`)}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">{t(current.title, current.titleVi)}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(current.description, current.descriptionVi)}
            </p>
            <Button type="button" size="sm" variant="ghost" className="mt-2 h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary" onClick={() => openPhaseIssue(step === 1 ? "static-guidance" : step === 2 ? "runtime-guidance" : "submission-explanation")}>
              {t("Need help or want to report an issue?", "Cần hỗ trợ hoặc muốn báo lỗi?")}
            </Button>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t pt-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Learning objective", "Mục tiêu học tập")}
            </dt>
            <dd className="mt-1 leading-5 text-foreground">
              {step === 1
                ? t("Understand the curated architecture through evidence.", "Hiểu kiến trúc tham chiếu thông qua evidence.")
                : step === 2
                  ? t("Observe and validate impact in the runtime scenario.", "Quan sát và kiểm chứng tác động trong kịch bản runtime.")
                  : t("Review evidence and submit the completed Lab.", "Kiểm tra evidence và nộp Lab hoàn tất.")}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Reference snapshot", "Snapshot tham chiếu")}
            </dt>
            <dd className="mt-1 leading-5 text-foreground">
              {hasReferenceArch
                ? t("Curated C1–C3 model and source evidence ready.", "Mô hình C1–C3 và evidence mã nguồn đã sẵn sàng.")
                : t("No reference snapshot is required for this Lab.", "Lab này không yêu cầu snapshot tham chiếu.")}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Next requirement", "Yêu cầu tiếp theo")}
            </dt>
            <dd className="mt-1 leading-5 text-foreground">
              {step === 1
                ? requiresRuntime
                  ? t("Pass the Module Quiz before Runtime Studio.", "Đạt Quiz Module trước khi vào Runtime Studio.")
                  : t("Review static evidence before submitting.", "Rà soát evidence tĩnh trước khi nộp.")
                : step === 2
                  ? t("Seal verified runtime evidence before submission.", "Niêm phong evidence runtime đã xác minh trước khi nộp.")
                  : t("Complete the required submission fields.", "Hoàn tất các trường bắt buộc của bài nộp.")}
            </dd>
          </div>
        </dl>
      </section>

      {step === 1 && (
        <div className="space-y-5">
          {hasReferenceArch ? (
            <>
              <section id="lab-static-workspace" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label={t("Architecture workspace", "Không gian kiến trúc")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {t("Architecture workspace", "Không gian kiến trúc")}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t(
                        "Explore the curated C1–C3 views and Dependency Graph. Select a node or connection to inspect its evidence.",
                        "Khám phá các góc nhìn C1–C3 và Đồ thị phụ thuộc đã được chọn lọc. Chọn node hoặc kết nối để xem evidence.",
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
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="min-w-0">
                        <ArchitectureDiagrams
                          model={activeModel}
                          guidedStatic
                          controlledKind={inlineC4View}
                          hideKindSelector
                          systemName={labTitle}
                          selectedId={selectedGraphId}
                          onSelect={setSelectedGraphId}
                        />
                      </div>
                      <aside className="min-w-0 rounded-lg border bg-muted/15 p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold">{t("Inspector", "Bảng kiểm tra")}</h4>
                          {selectedArchitectureLabel && (
                            <Button type="button" size="sm" variant="outline" onClick={openSelectedContextInTutor}>
                              {t("Explain with AI", "Giải thích bằng AI")}
                            </Button>
                          )}
                        </div>
                        {selectedGraphId ? (
                          <ElementDetailsPanel model={activeModel} selectedId={selectedGraphId} />
                        ) : (
                          <p className="text-sm leading-6 text-muted-foreground">
                            {t("Select an element or connection in the diagram to inspect its role, relationships, and source evidence.", "Chọn một phần tử hoặc kết nối trên sơ đồ để xem vai trò, quan hệ và evidence mã nguồn.")}
                          </p>
                        )}
                      </aside>
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
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 overflow-x-auto">
                      <ArchitectureGraph
                        model={activeModel}
                        selectedId={selectedGraphId}
                        onSelect={setSelectedGraphId}
                      />
                    </div>
                    <aside className="min-w-0 rounded-lg border bg-muted/15 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold">{t("Inspector", "Bảng kiểm tra")}</h4>
                        {selectedArchitectureLabel && (
                          <Button type="button" size="sm" variant="outline" onClick={openSelectedContextInTutor}>
                            {t("Explain with AI", "Giải thích bằng AI")}
                          </Button>
                        )}
                      </div>
                      {selectedGraphId ? (
                        <ElementDetailsPanel model={activeModel} selectedId={selectedGraphId} />
                      ) : (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {t("Select a node or connection to inspect its relationship and source evidence.", "Chọn node hoặc kết nối để xem quan hệ và evidence mã nguồn.")}
                        </p>
                      )}
                    </aside>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("Loading architectural model…", "Đang tải mô hình kiến trúc…")}
                  </p>
                )}
              </section>

              <details id="lab-static-impact" className="group rounded-xl border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:content-none">
                  <span>{t("Static impact hypothesis (Reverse BFS)", "Giả thuyết tác động tĩnh (Reverse BFS)")}</span>
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                    {t("Open impact explorer", "Mở trình khám phá tác động")}
                  </span>
                </summary>
                <div className="border-t px-4 py-4">
                  <Step2StaticImpact
                    projectId={resolvedModelProjectId}
                    modelId={modelId}
                    modelQuery={modelQuery}
                    sourceLink={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=1${previewParam}`}
                    inlineModel={activeModel}
                    waitForContext={studentContextLoading}
                    onOpenC1C3View={onOpenC1C3View}
                  />
                </div>
              </details>

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
                        <details key={finding.id} className="group text-xs">
                          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-3 marker:content-none">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="font-mono font-semibold">{finding.ruleId}</span>
                              <span className="font-medium">{getRuleName(finding.ruleId, "en")}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusBadge status={finding.status} />
                              <Badge variant="outline" className="font-mono text-[10px]">{finding.severity}</Badge>
                            </div>
                          </summary>
                          {finding.message && (
                            <p className="border-t px-3 py-2.5 leading-5 text-muted-foreground">{finding.message}</p>
                          )}
                        </details>
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

              <div id="lab-ai-tutor">
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
                  <form
                    className="mt-3 flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void askAiTutor(tutorInput);
                    }}
                  >
                    <Input
                      value={tutorInput}
                      onChange={(event) => setTutorInput(event.target.value)}
                      disabled={tutorLoading}
                      className="min-w-60 flex-1 text-xs"
                      aria-label={t(
                        "Ask the AI Architecture Tutor",
                        "Đặt câu hỏi cho Trợ lý AI Kiến trúc",
                      )}
                      placeholder={t(
                        `Ask about ${selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this service"} coupling, boundaries or source evidence…`,
                        `Hỏi về phụ thuộc, ranh giới hoặc bằng chứng mã nguồn của ${selectedArchitectureLabel ?? selectedTutorElement?.name ?? "dịch vụ này"}…`,
                      )}
                    />
                    <Button type="submit" size="sm" disabled={tutorLoading || !tutorInput.trim()}>
                      {tutorLoading ? t("Analyzing…", "Đang phân tích…") : t("Ask AI", "Hỏi AI")}
                    </Button>
                  </form>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={tutorLoading}
                      onClick={() => {
                        const subjectName = selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this architecture";
                        const promptText = t(
                          `Explain the static dependencies, contracts, and source evidence of ${subjectName}.`,
                          `Giải thích phụ thuộc tĩnh, hợp đồng kết nối và bằng chứng mã nguồn của ${subjectName}.`,
                        );
                        setTutorInput(promptText);
                        void askAiTutor(promptText);
                      }}
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
                      variant="outline"
                      disabled={tutorLoading}
                      onClick={() => {
                        const oosPrompt = t(
                          "What will Bitcoin price be in 2030?",
                          "Giá Bitcoin năm 2030 là bao nhiêu?",
                        );
                        setTutorInput(oosPrompt);
                        void askAiTutor(oosPrompt);
                      }}
                    >
                      🧪{" "}
                      {t(
                        "Test Out-of-Scope Prompt (Demo DS-02b)",
                        "Thử câu hỏi ngoài phạm vi (DS-02b)",
                      )}
                    </Button>
                  </div>
                  {tutorReply &&
                    (tutorReply.blocked ? (
                      <div
                        role="alert"
                        className="mt-3 space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive"
                      >
                        <p className="font-semibold">
                          {t(
                            "Refused (BR-05 / DS-02b) · Out of Scope",
                            "Từ chối trả lời (BR-05 / DS-02b) · Ngoài phạm vi",
                          )}
                        </p>
                        <p className="leading-5">{tutorReply.answer}</p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 text-xs dark:border-teal-800 dark:bg-teal-950/20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-teal-950 dark:text-teal-200">
                            ✅{" "}
                            {t(
                              "Evidence-Grounded Answer (Citing Static C1–C3 Model)",
                              "Trả lời có đối chiếu Bằng chứng Tĩnh C1–C3",
                            )}
                          </p>
                          {tutorReply.provider && (
                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                              {tutorReply.provider}
                            </Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-5 text-foreground/90">
                          {tutorReply.answer}
                        </p>
                        {tutorReply.citations && tutorReply.citations.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("Cited source evidence:", "Bằng chứng mã nguồn tham chiếu:")}{" "}
                            <span className="font-mono">{tutorReply.citations.join(" · ")}</span>
                          </p>
                        )}
                      </div>
                    ))}
                </DetailPanel>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              {t(
                "Theory-focused Lab — no reference repository or static C1–C3 diagrams are attached to this Lab.",
                "Lab tập trung vào lý thuyết — không yêu cầu mã nguồn tham chiếu hay sơ đồ C1–C3.",
              )}
            </div>
          )}

        </div>
      )}

      {step === 3 && (
        <div className="space-y-4" aria-label={t("Evidence review and submission", "Kiểm tra evidence và nộp bài")}>
          {requiresRuntime && !liveStudioVerified && !preview ? (
            <DetailPanel title={t("Runtime evidence required", "Cần evidence Runtime Studio")}>
              <p className="text-sm leading-6 text-muted-foreground">
                {t(
                  "Finish the MAVIS Runtime Studio exercise to seal a verified receipt before submission.",
                  "Hãy hoàn tất bài thực hành MAVIS Runtime Studio để tạo receipt đã xác minh trước khi nộp bài.",
                )}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href={runtimeEvidenceHref}>
                  {t("Return to Runtime Studio", "Quay lại Runtime Studio")}
                </Link>
              </Button>
            </DetailPanel>
          ) : !preview && labMode !== "LEGACY" ? (
            <>
              {requiresRuntime && (
                <DetailPanel title={t("Runtime Evidence Review", "Kiểm tra Evidence Runtime")}>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(
                      "Review the sealed Runtime Studio evidence before sending this Lab to WF-04. The final submission keeps this receipt linked to your explanation.",
                      "Kiểm tra evidence Runtime Studio đã được niêm phong trước khi chuyển Lab sang WF-04. Bài nộp cuối sẽ liên kết receipt này với phần giải trình của bạn.",
                    )}
                  </p>
                  {studioStateQuery.isPending ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {t(
                        "Loading verified runtime evidence…",
                        "Đang tải evidence runtime đã xác minh…",
                      )}
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                      <RuntimeEvidenceStatus
                        complete={Boolean(runtimeEvidence?.receiptDigest)}
                        label={t("Signed runtime receipt", "Receipt Runtime đã ký")}
                        detail={
                          runtimeEvidence?.receiptDigest
                            ? t(
                                "Receipt sealed and ready for WF-04.",
                                "Receipt đã được niêm phong và sẵn sàng cho WF-04.",
                              )
                            : t(
                                "Finish the Runtime Studio session to seal its receipt.",
                                "Hoàn tất Runtime Studio để niêm phong receipt.",
                              )
                        }
                      />
                      <RuntimeEvidenceStatus
                        complete={(runtimeEvidence?.snapshots?.length ?? 0) > 0}
                        label={t("Snapshot evidence", "Snapshot evidence")}
                        detail={t(
                          `${runtimeEvidence?.snapshots?.length ?? 0} captured runtime snapshot(s).`,
                          `Đã chụp ${runtimeEvidence?.snapshots?.length ?? 0} snapshot runtime.`,
                        )}
                      />
                      <RuntimeEvidenceStatus
                        complete={Boolean(runtimeEvidence?.telemetry?.observedAt)}
                        label={t("Observed telemetry & sequence", "Telemetry và sequence quan sát")}
                        detail={t(
                          `${runtimeEvidence?.telemetry?.spans.length ?? 0} spans · ${runtimeEvidence?.telemetry?.interactions.length ?? 0} interactions recorded.`,
                          `Đã ghi ${runtimeEvidence?.telemetry?.spans.length ?? 0} span · ${runtimeEvidence?.telemetry?.interactions.length ?? 0} tương tác.`,
                        )}
                      />
                      <RuntimeEvidenceStatus
                        complete={hasBeforeAfterEvidence}
                        label={t(
                          "Before / After action evidence",
                          "Evidence hành động Before / After",
                        )}
                        detail={t(
                          `${confirmedRuntimeActions.length} confirmed Stop / Start / Scale action(s).`,
                          `${confirmedRuntimeActions.length} hành động Stop / Start / Scale đã xác nhận.`,
                        )}
                      />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={runtimeEvidenceHref}>
                        {t("Review or capture another snapshot", "Xem lại hoặc chụp thêm snapshot")}
                      </Link>
                    </Button>
                    {runtimeEvidence?.receiptDigest && (
                      <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {t("Receipt", "Receipt")}: {runtimeEvidence.receiptDigest}
                      </code>
                    )}
                  </div>
                </DetailPanel>
              )}
              <LabSubmissionV2
                workspaceId={workspaceId}
                assignmentId={labId}
                labOrder={labOrder}
                labTitle={labTitle}
                labMode={labMode}
                runtimeSessionId={verifiedSessionForSubmit}
                initialSubmission={studentContext?.latestSubmission}
                initialReview={studentContext?.latestReview}
                hasReferenceArch={hasReferenceArch}
                onRequestHelp={(reason) => openPhaseIssue(reason)}
              />
            </>
          ) : (
            <DetailPanel title={t("Evidence Review", "Kiểm tra Evidence")}>
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
              title={t("Runtime Studio is not available", "Runtime Studio chưa sẵn sàng")}
            >
              <p className="text-sm text-muted-foreground">
                {t(
                  "Complete the required course work, then return here to start MAVIS Runtime Studio.",
                  "Hoàn tất các yêu cầu của khóa học, sau đó quay lại đây để bắt đầu MAVIS Runtime Studio.",
                )}
              </p>
            </DetailPanel>
          ) : (
            <>
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
                              "Continue to Evidence Review after Finish Studio",
                              "Sang Kiểm tra Evidence sau khi Finish Studio",
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

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur sm:p-4">
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
          <Button size="sm" variant="outline" onClick={jumpToSubmissionBox}>
            {t("Jump to Submission Box", "Đi tới Khung Nộp bài")} <ArrowRight />
          </Button>
        ) : (
          <Button asChild={nextAvailable} disabled={!nextAvailable}>
            {nextAvailable ? (
              <Link
                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${nextStep}${previewParam}`}
              >
                {step === 1 && requiresRuntime
                  ? t("Continue to Runtime Studio", "Tiếp tục đến Runtime Studio")
                  : t("Continue to Evidence Review", "Tiếp tục đến Kiểm tra Evidence")} <ArrowRight />
              </Link>
            ) : (
              <span>{t("Finish Studio to continue", "Hoàn tất Studio để tiếp tục")}</span>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
