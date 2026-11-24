"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  Minus,
  Network,
  SendHorizontal,
  ShieldCheck,
} from "lucide-react";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { MavisLogo } from "@/components/mavis-logo";
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
import { DetailPanel } from "@/components/shared/data";
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
import { LabSubmissionV2 } from "./lab-submission-v2";
import { expandModuleFlowItems, resolveLabStepForItem } from "./module-steps";
import type { OutlineItemData } from "./java-coursera-curriculum-data";
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
    descriptionVi: "Kiểm tra evidence và receipt của Studio trước khi nộp Lab hoàn tất để chấm.",
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
  if (step === 1 && !options.requiresRuntime) {
    return {
      ...base,
      description:
        "Inspect the curated snapshot, C1–C3 architecture, dependency graph, and source evidence before submitting.",
      descriptionVi:
        "Khảo sát snapshot chuẩn, kiến trúc C1–C3, đồ thị phụ thuộc và bằng chứng mã nguồn trước khi nộp bài.",
    };
  }
  if (step === 3 && !options.requiresRuntime) {
    return {
      ...base,
      description:
        "Review your architecture notes and required evidence before submitting this Lab for grading.",
      descriptionVi:
        "Kiểm tra ghi chú kiến trúc và bằng chứng cần thiết trước khi nộp Lab để chấm điểm.",
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
  const evidencesByEl = new Map<string, StudentLabReferenceArchitecture["evidences"]>();
  for (const ev of refArch.evidences) {
    if (ev.relationshipId) {
      const arr = evidencesByRel.get(ev.relationshipId) ?? [];
      arr.push(ev);
      evidencesByRel.set(ev.relationshipId, arr);
    }
    if (ev.elementId) {
      const arr = evidencesByEl.get(ev.elementId) ?? [];
      arr.push(ev);
      evidencesByEl.set(ev.elementId, arr);
    }
  }
  const toEvidenceItems = (items: StudentLabReferenceArchitecture["evidences"]) =>
    items.map((ev) => ({
      id: ev.id,
      kind: "source" as const,
      sourceType: ev.sourceType ?? undefined,
      location: ev.locator ?? "Source",
      snippet: ev.excerpt ?? "",
      complete: true,
    }));
  const elements: ArchitecturalModel["elements"] = refArch.elements.map((el) => ({
    id: el.id,
    name: el.name,
    layer: mapLayer(el.scope || el.elementType),
    elementType: el.elementType,
    parentId: el.parentElementId ?? null,
    technology: el.languageStack ?? null,
    ...(el.properties ? { properties: el.properties } : {}),
    description: el.scope && el.scope !== "null" ? el.scope.trim() : "",
    evidence: toEvidenceItems(evidencesByEl.get(el.id) ?? []),
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
      ...(rel.properties ? { properties: rel.properties } : {}),
      evidence: toEvidenceItems(evidencesByRel.get(rel.id) ?? []),
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

function cleanDisplaySourceLocator(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/^\/?data\/uploads\/[^/\s]+(?:\/|_source_extracted\/)?/i, "")
    .replace(/^[^/]*_source_extracted\//i, "")
    .replace(/^[a-z0-9._-]+-[a-f0-9]{40}\//i, "")
    .trim();
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
                  const lecturerNames = Array.from(
                    new Set(
                      [
                        workspace.createdByName?.trim(),
                        ...workspace.members
                          .filter((member) => member.role.toUpperCase() === "LECTURER")
                          .map((member) => member.name?.trim()),
                      ].filter((name): name is string => Boolean(name)),
                    ),
                  );
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
                      <CourseBuilder workspaceId={workspaceId} workspaceName={workspace.name} />
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
  const { t, locale } = useLocale();
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
  const quizNotPublished =
    quiz.isError &&
    typeof quiz.error === "object" &&
    quiz.error !== null &&
    "status" in quiz.error &&
    (quiz.error as { status?: number }).status === 404;
  const hasNoPublishedLabQuiz =
    quizNotPublished || (studentContext.isSuccess && studentContext.data?.quiz == null);
  const runtimeReady =
    isTheoryOnlyLab ||
    isLecturer ||
    hasNoPublishedLabQuiz ||
    (!quiz.isError && quiz.data?.runtimeUnlocked === true) ||
    studentContext.data?.quiz?.runtimeUnlocked === true;
  const requiresRuntime =
    lab?.requireRuntimeTrace === true ||
    lab?.labMode === "THEORY_QUIZ_STUDIO" ||
    studentContext.data?.studioExercise != null;
  const displayedStep: 1 | 2 | 3 = !requiresRuntime && activeStep === 2 ? 3 : activeStep;
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
  // A frozen submission belongs to this Lab and already passed the runtime-receipt
  // validation on the server. Session history may be pruned afterwards, so do not
  // re-lock a learner who can already view their submitted dossier.
  const runtimeEvidenceSatisfied = Boolean(verifiedStudioSession) || hasSubmitted;
  const visibleSteps = requiresRuntime
    ? learningSteps
    : learningSteps.filter((step) => step.id !== 2);
  const stepAvailable = (id: 1 | 2 | 3) => {
    if (preview || id === 1) return true;
    if (id === 2) return runtimeReady && requiresRuntime;
    return !requiresRuntime || runtimeEvidenceSatisfied;
  };
  const stepReason = (id: 1 | 2 | 3) => {
    if (id === 2 && !runtimeReady)
      return t("Runtime Studio is not available yet.", "Runtime Studio hiện chưa sẵn sàng.");
    if (id === 3 && requiresRuntime && !runtimeEvidenceSatisfied)
      return t(
        "Finish MAVIS Runtime Studio and create a verified receipt before submitting.",
        "Hoàn tất MAVIS Runtime Studio và tạo receipt đã xác minh trước khi nộp bài.",
      );
    return undefined;
  };
  const labHref = (step: 1 | 2 | 3, extraView?: InlineC4View) =>
    `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=${step}${extraView ? `&view=${extraView}` : ""}${preview ? "&preview=1" : ""}`;
  const rawSidebarItems: OutlineItemData[] =
    moduleItems.length > 0
      ? moduleItems.map((item) => ({
          id: item.id,
          type: item.type as OutlineItemData["type"],
          title: item.title,
          description: item.description,
          position: item.position,
          assignmentId: item.assignmentId,
          required: item.required,
          content: item.content,
        }))
      : lab
        ? [
            {
              id: `fallback-${lab.id}`,
              type: requiresRuntime ? "RUNTIME_LAB" : "STATIC_LAB",
              title: lab.title,
              position: 1,
              assignmentId: lab.id,
              required: true,
            },
          ]
        : [];
  const expandedModuleItems = expandModuleFlowItems(
    rawSidebarItems,
    assignments.data ?? [],
    locale,
  );
  const flowItemHref = (item: OutlineItemData): string => {
    if (item.assignmentId && ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type)) {
      return labHref(resolveLabStepForItem(item, requiresRuntime));
    }
    return `/roadmap?workspace=${encodeURIComponent(workspaceId)}&item=${encodeURIComponent(item.id)}`;
  };
  const activeFlowIndex = expandedModuleItems.findIndex(
    (item) =>
      ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type) &&
      resolveLabStepForItem(item, requiresRuntime) === displayedStep,
  );
  const prevFlowItem = activeFlowIndex > 0 ? expandedModuleItems[activeFlowIndex - 1] : undefined;
  const nextFlowItem =
    activeFlowIndex >= 0 && activeFlowIndex < expandedModuleItems.length - 1
      ? expandedModuleItems[activeFlowIndex + 1]
      : undefined;
  const modulePrevNav = prevFlowItem
    ? { label: prevFlowItem.title, href: flowItemHref(prevFlowItem) }
    : {
        label: t("Course Syllabus", "Lộ trình khóa học"),
        href: `/roadmap?workspace=${encodeURIComponent(workspaceId)}`,
      };
  const moduleNextNav = nextFlowItem
    ? { label: nextFlowItem.title, href: flowItemHref(nextFlowItem) }
    : null;
  const activeStepMeta = resolveStepMeta(displayedStep, {
    hasReferenceArch,
    isTheoryOnlyLab,
    requiresRuntime,
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
  const readinessStateLabel = (state: string) => {
    switch (state) {
      case "READY":
        return t("Ready", "Sẵn sàng");
      case "IN PROGRESS":
        return t("In progress", "Đang xử lý");
      case "MISSING":
        return t("Missing", "Chưa có");
      case "PASSED":
        return t("Passed", "Đã đạt");
      case "VERIFIED":
        return t("Verified", "Đã xác minh");
      case "LOCKED":
        return t("Locked", "Đang khóa");
      default:
        return state;
    }
  };

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
        <div className="space-y-3">
          <header className="mavis-hero-surface px-4 py-3.5 text-white sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-sky-100">
                  <Link
                    className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/15 px-2.5 py-0.5 font-medium text-white transition-colors hover:bg-white/25"
                    href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}
                  >
                    ← {t("Back to Course Syllabus", "Quay lại Lộ trình môn học")}
                  </Link>
                  <span className="text-white/50">/</span>
                  <span className="truncate font-medium text-white/90">{workspace.name}</span>
                  {currentModule && (
                    <>
                      <span className="text-white/50">/</span>
                      <span className="truncate text-sky-100">
                        {/^(?:Module|Chương)\s+\d+/i.test(currentModule.title.trim())
                          ? currentModule.title
                          : `${t("Module", "Chương")} ${currentModule.position}: ${currentModule.title}`}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                  {lab.title}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge
                    variant="outline"
                    className="border-white/30 bg-white/15 font-mono text-[11px] text-white"
                  >
                    {t("Class", "Lớp")} {workspace.code || "—"}
                  </Badge>
                  <Badge className="border-teal-300/35 bg-teal-400/20 text-[11px] font-medium text-teal-50">
                    {requiresRuntime
                      ? t("Studio Live Practice Lab", "Lab Thực Hành Studio Live")
                      : isTheoryOnlyLab
                        ? t("Theory Only Lab", "Lab Chỉ Lý Thuyết")
                        : t("Theory & Quiz Lab", "Lab Lý Thuyết & Quiz")}
                  </Badge>
                  {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
                  {readiness.map((gate) => (
                    <span
                      key={gate.label}
                      className="rounded-md border border-white/20 bg-slate-950/20 px-2 py-0.5 text-[11px] text-white/95"
                    >
                      <span className="text-sky-200">{gate.label}:</span>{" "}
                      {readinessStateLabel(gate.state)}
                    </span>
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
                    className="h-8 min-w-[240px] max-w-[380px] truncate rounded-lg border border-white/30 bg-white/15 px-2.5 text-xs leading-tight text-white outline-none hover:bg-white/25"
                  >
                    {(roadmap.data?.labs ?? []).map((item) => {
                      const icon =
                        item.state === "PASSED" ? "✅" : item.state === "LOCKED" ? "🔒" : "▶️";
                      const optionTitle = /^Lab\s+\d+/i.test(item.title.trim())
                        ? item.title
                        : `Lab ${item.position}: ${item.title}`;
                      return (
                        <option
                          key={item.assignmentId}
                          value={item.assignmentId}
                          disabled={item.state === "LOCKED" && !preview}
                          className="bg-slate-900 text-white"
                        >
                          {icon} {optionTitle}
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

          <div className="grid gap-6 lg:grid-cols-[276px_minmax(0,1fr)] lg:items-start">
            <aside className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-6">
              <div className="border-b pb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {t("Learning workspace", "Không gian học tập")}
                </p>
                {currentModule && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`Module ${currentModule.position}`, `Module ${currentModule.position}`)}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                      {currentModule.title}
                    </h2>
                  </>
                )}
              </div>
              <nav
                aria-label={t("Module steps", "Nội dung Module")}
                className="space-y-1"
              >
                {expandedModuleItems.map((item) => {
                  const isLabFlowItem = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(
                    item.type,
                  );
                  const itemStep = isLabFlowItem
                    ? resolveLabStepForItem(item, requiresRuntime)
                    : null;
                  const isCurrent = itemStep !== null && itemStep === displayedStep;
                  const lockHint = itemStep !== null && !stepAvailable(itemStep) ? stepReason(itemStep) : undefined;
                  const itemComplete =
                    (itemStep === 1 && hasReferenceArch && Boolean(activeModelId)) ||
                    (itemStep === 2 && runtimeEvidenceSatisfied) ||
                    (itemStep === 3 && hasSubmitted);
                  return (
                    <Link
                      key={item.id}
                      href={flowItemHref(item)}
                      title={lockHint}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`block rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        isCurrent
                          ? "bg-emerald-100 font-semibold text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-1.5">
                        <span className="line-clamp-2 min-w-0 flex-1">{item.title}</span>
                        {itemComplete && (
                          <CheckCircle2
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </Link>
                  );
                })}
              </nav>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                  {t("Back to Course Content", "Quay lại nội dung khóa học")}
                </Link>
              </Button>
            </aside>

            <div className="min-w-0 space-y-5">
              <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
                <h2 className="text-base font-semibold text-foreground">
                  {t(activeStepMeta.title, activeStepMeta.titleVi)}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(activeStepMeta.description, activeStepMeta.descriptionVi)}
                </p>
              </div>
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
                labInstructions={
                  lab.instructions || studentContext.data?.assignment?.description || ""
                }
                moduleTheoryItems={moduleItems
                  .filter((item) => item.type === "THEORY")
                  .map((item) => ({
                    id: item.id,
                    title: item.title,
                    body: typeof item.content?.["body"] === "string" ? item.content["body"] : "",
                  }))
                  .filter((item) => item.body.trim().length > 0)}
                moduleQuizHref={
                  moduleQuizItem
                    ? `/roadmap?workspace=${encodeURIComponent(workspaceId)}&item=${encodeURIComponent(moduleQuizItem.id)}`
                    : `/roadmap?workspace=${encodeURIComponent(workspaceId)}&item=${encodeURIComponent(`lab-quiz:${lab.id}`)}`
                }
                modulePrevNav={modulePrevNav}
                moduleNextNav={moduleNextNav}
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
                studentContextLoading={studentContext.isLoading || studentStudioSessions.isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </RequestState>
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
  labInstructions,
  moduleTheoryItems,
  moduleQuizHref,
  modulePrevNav,
  moduleNextNav,
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
  labInstructions?: string | undefined;
  moduleTheoryItems?: Array<{ id: string; title: string; body: string }> | undefined;
  moduleQuizHref: string;
  modulePrevNav: { label: string; href: string };
  moduleNextNav: { label: string; href: string } | null;
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
  const [inlineC3Service, setInlineC3Service] = useState<string | undefined>(undefined);
  const [impactAnalysisOpen, setImpactAnalysisOpen] = useState(false);
  const [impactHighlightIds, setImpactHighlightIds] = useState<string[]>([]);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorMinimized, setTutorMinimized] = useState(false);
  const [tutorHistory, setTutorHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [tutorReply, setTutorReply] = useState<{
    question: string;
    answer: string;
    blocked?: boolean;
    provider?: string;
    citations?: string[];
  } | null>(null);
  const runtimeConfigurationMissing = step === 2 && !requiresRuntime;
  const runtimePrerequisiteMissing =
    step === 2 && requiresRuntime && !runtimeReady && !preview && !studentContextLoading;
  const runtimeUnavailable = runtimeConfigurationMissing || runtimePrerequisiteMissing;
  const [runtimeConfigurationDialogOpen, setRuntimeConfigurationDialogOpen] = useState(false);
  const [phaseIssue, setPhaseIssue] = useState<LabPhaseIssueKind | null>(null);
  const [phaseIssueDialogOpen, setPhaseIssueDialogOpen] = useState(false);
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
    // Keep Evidence Review available for an existing frozen WF-04 submission
    // even when the original runtime session is no longer present in the list.
    Boolean(studentContext?.latestSubmission) ||
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
  const hasSubmittedLab = Boolean(studentContext?.latestSubmission?.id);
  const jumpToSubmissionBox = () => {
    const submissionBox = document.getElementById("lab-submit");
    if (!submissionBox) return;
    submissionBox.scrollIntoView({ behavior: "smooth", block: "start" });
    submissionBox.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    window.history.replaceState(null, "", submitHref);
  };
  const standaloneStudioHref = buildStudioLiveHref({
    workspaceId,
    assignmentId: labId,
    mode: "student",
    returnTo: `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=2`,
    sessionId: activeStudioSessionId || undefined,
  });
  const next = step < 3 ? ((step + 1) as 2 | 3) : undefined;
  const nextStep = step === 1 && !requiresRuntime ? 3 : next;
  const prevStep: 1 | 2 = step === 3 && !requiresRuntime ? 1 : ((step - 1) as 1 | 2);
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
  const normalizedSelectedId = selectedGraphId?.replace(/^projection:/, "") ?? selectedGraphId;
  const selectedElement =
    activeModel?.elements.find((item) => item.id === selectedGraphId) ??
    activeModel?.elements.find((item) => item.id === normalizedSelectedId);
  const selectedConnection =
    activeModel?.edges.find((item) => item.id === selectedGraphId) ??
    activeModel?.edges.find((item) => item.id === normalizedSelectedId) ??
    activeModel?.edges.find((item) =>
      selectedGraphId ? item.underlyingEdgeIds?.includes(selectedGraphId) : false,
    );
  const selectedArchitectureLabel =
    selectedElement?.name ??
    (selectedConnection
      ? `${activeModel?.elements.find((item) => item.id === selectedConnection.from)?.name ?? selectedConnection.from} → ${activeModel?.elements.find((item) => item.id === selectedConnection.to)?.name ?? selectedConnection.to}`
      : null);
  const selectedTutorElement = selectedElement ?? activeModel?.elements[0];
  const closeImpactAnalysis = () => {
    setImpactAnalysisOpen(false);
    setImpactHighlightIds([]);
  };
  useEffect(() => {
    if (inlineC4View !== "GRAPH" && impactAnalysisOpen) {
      setImpactAnalysisOpen(false);
      setImpactHighlightIds([]);
    }
  }, [impactAnalysisOpen, inlineC4View]);
  const askAiTutor = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || tutorLoading) return;
    const targetId =
      selectedElement?.id ??
      selectedConnection?.id ??
      normalizedSelectedId ??
      activeModel?.elements[0]?.id ??
      activeModel?.edges[0]?.id ??
      "";
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
    const citations = threeEAiCtx.codeSnippets
      .map((snippet) => cleanDisplaySourceLocator(snippet.locator))
      .filter(Boolean)
      .slice(0, 3);
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

  const tutorAssistantPanel = tutorMinimized ? (
    <Button
      type="button"
      variant="outline"
      className="fixed right-4 bottom-4 z-50 size-14 rounded-full bg-card p-1 shadow-2xl sm:right-6 sm:bottom-6"
      aria-label={t("Open MAVIS AI Assistant", "Mở Trợ lý MAVIS AI")}
      aria-expanded="false"
      onClick={() => setTutorMinimized(false)}
    >
      <MavisLogo compact className="size-full" />
    </Button>
  ) : (
    <section
      id="lab-ai-tutor"
      aria-label={t("MAVIS AI Assistant", "Trợ lý MAVIS AI")}
      className="fixed inset-x-4 bottom-4 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:p-5"
    >
      <header className="flex items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <MavisLogo compact className="size-9" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {t("MAVIS AI Assistant", "Trợ lý MAVIS AI")}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {t("Architecture Tutor", "Trợ lý kiến trúc")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 rounded-full"
          aria-label={t("Minimize MAVIS AI Assistant", "Thu nhỏ Trợ lý MAVIS AI")}
          aria-expanded="true"
          onClick={() => setTutorMinimized(true)}
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="mt-4 rounded-xl bg-primary/5 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          {t("Current context", "Ngữ cảnh hiện tại")}
        </p>
        <p className="mt-1 text-sm font-medium">
          {selectedArchitectureLabel ??
            selectedTutorElement?.name ??
            t("Architecture overview", "Tổng quan kiến trúc")}
        </p>
      </div>
      <div className="mt-4 space-y-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void askAiTutor(tutorInput);
          }}
        >
          <Input
            value={tutorInput}
            onChange={(event) => setTutorInput(event.target.value)}
            disabled={tutorLoading}
            className="h-10 rounded-full text-xs"
            aria-label={t("Ask the AI Architecture Tutor", "Đặt câu hỏi cho Trợ lý AI Kiến trúc")}
            placeholder={t(
              `Ask about ${selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this service"} coupling or source…`,
              `Hỏi về phụ thuộc, vai trò hoặc mã nguồn của ${selectedArchitectureLabel ?? selectedTutorElement?.name ?? "dịch vụ này"}…`,
            )}
          />
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            disabled={tutorLoading || !tutorInput.trim()}
            aria-label={t("Send question", "Gửi câu hỏi")}
          >
            <SendHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-auto px-2.5 py-1 text-left text-[11px] leading-4"
            disabled={tutorLoading}
            onClick={() => {
              const subjectName =
                selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this architecture";
              const promptText = t(
                `Explain the SWD role, dependencies, and source evidence of ${subjectName}.`,
                `Giải thích vai trò SWD, các phụ thuộc và bằng chứng mã nguồn của ${subjectName}.`,
              );
              setTutorInput(promptText);
              void askAiTutor(promptText);
            }}
          >
            {t("Role & dependencies", "Vai trò & phụ thuộc")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-auto px-2.5 py-1 text-left text-[11px] leading-4"
            disabled={tutorLoading}
            onClick={() => {
              const subjectName =
                selectedArchitectureLabel ?? selectedTutorElement?.name ?? "this component";
              const promptText = t(
                `What breaks or gets impacted if ${subjectName} becomes unavailable?`,
                `Nếu ${subjectName} ngừng hoạt động thì các thành phần nào bị ảnh hưởng?`,
              );
              setTutorInput(promptText);
              void askAiTutor(promptText);
            }}
          >
            {t("Failure impact", "Ảnh hưởng nếu gián đoạn")}
          </Button>
        </div>
        {tutorReply &&
          (tutorReply.blocked ? (
            <div
              role="alert"
              className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <p className="font-semibold">
                {t("Outside Diagram Scope", "Ngoài phạm vi sơ đồ kiến trúc")}
              </p>
              <p className="leading-5">{tutorReply.answer}</p>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-xs dark:border-teal-800 dark:bg-teal-950/20">
              <p className="flex items-center gap-1.5 font-semibold text-teal-950 dark:text-teal-200">
                <Bot className="size-4" aria-hidden="true" /> MAVIS AI
              </p>
              <p className="whitespace-pre-wrap leading-5 text-foreground/90">
                {tutorReply.answer}
              </p>
              {tutorReply.citations && tutorReply.citations.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {t("Cited source evidence:", "Bằng chứng mã nguồn tham chiếu:")}{" "}
                  <span className="break-all font-mono">{tutorReply.citations.join(" · ")}</span>
                </p>
              )}
            </div>
          ))}
      </div>
    </section>
  );

  const openPhaseIssue = (issue: LabPhaseIssueKind) => {
    setPhaseIssue(issue);
    setPhaseIssueDialogOpen(true);
  };
  const phaseIssueContent = (() => {
    switch (phaseIssue) {
      case "static-data":
        return {
          title: t("Static Studio data could not load", "Không tải được dữ liệu Static Studio"),
          description: t(
            "The curated architecture data is unavailable, so C1–C3 evidence cannot be reviewed safely.",
            "Dữ liệu kiến trúc đã chọn lọc hiện không tải được nên chưa thể kiểm tra evidence C1–C3 an toàn.",
          ),
          recovery: t(
            "Refresh the Lab first. If this persists, copy the report for your lecturer to check the reference snapshot.",
            "Hãy tải lại Lab trước. Nếu lỗi vẫn còn, sao chép báo cáo để giảng viên kiểm tra snapshot tham chiếu.",
          ),
          actionLabel: t("Review Static Studio", "Xem lại Static Studio"),
          action: () =>
            document
              .getElementById("lab-static-workspace")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        };
      case "runtime-configuration":
        return {
          title: t("Runtime Studio configuration is missing", "Runtime Studio chưa được cấu hình"),
          description: t(
            "This Lab has no ready Runtime Studio topology, so the practical exercise cannot start.",
            "Lab này chưa có topology Runtime Studio sẵn sàng nên chưa thể bắt đầu phần thực hành.",
          ),
          recovery: t(
            "This needs lecturer configuration. Copy the report and send it to your lecturer, then return after the Studio exercise is prepared.",
            "Trường hợp này cần giảng viên cấu hình. Hãy sao chép báo cáo gửi giảng viên rồi quay lại sau khi Studio exercise sẵn sàng.",
          ),
          actionLabel: t("Back to Lab", "Quay lại Lab"),
          action: () => undefined,
        };
      case "runtime-guidance":
      case "runtime-failed":
        return {
          title:
            phaseIssue === "runtime-failed"
              ? t(
                  "Runtime Studio session needs attention",
                  "Phiên Runtime Studio cần được kiểm tra",
                )
              : t("Need help with Runtime Studio?", "Cần hỗ trợ với Runtime Studio?"),
          description:
            phaseIssue === "runtime-failed"
              ? t(
                  "The current Runtime Studio session did not start or finish correctly, so its evidence is not valid yet.",
                  "Phiên Runtime Studio hiện tại chưa khởi chạy hoặc hoàn tất đúng nên evidence chưa hợp lệ.",
                )
              : t(
                  "Runtime Studio is where you run the assigned scenario and capture observed evidence using only allowed actions.",
                  "Runtime Studio là nơi bạn chạy kịch bản được giao và lưu evidence quan sát với các thao tác được phép.",
                ),
          recovery: t(
            "Open Studio Live, inspect the session, use only Stop, Start, or Scale, capture a snapshot, then choose Finish Studio. If it fails again, copy the report for your lecturer.",
            "Mở Studio Live, kiểm tra phiên, chỉ dùng Stop, Start hoặc Scale, lưu snapshot rồi chọn Hoàn tất Studio. Nếu vẫn lỗi, sao chép báo cáo gửi giảng viên.",
          ),
          actionLabel: t("Open Runtime Studio", "Mở Runtime Studio"),
          action: () => window.location.assign(standaloneStudioHref),
        };
      case "evidence-missing":
      case "submission-runtime":
        return {
          title: t("Runtime evidence is incomplete", "Evidence Runtime chưa đầy đủ"),
          description: t(
            "This Lab needs a verified Runtime Studio receipt before it can be submitted for grading.",
            "Lab này cần biên nhận Runtime Studio đã xác minh trước khi nộp bài để giảng viên chấm điểm.",
          ),
          recovery: t(
            "Return to Runtime Studio, complete the scenario, capture the required evidence, and select Finish Studio to seal the receipt.",
            "Hãy quay lại Runtime Studio, hoàn tất kịch bản, lưu bằng chứng bắt buộc và chọn Hoàn tất Studio để niêm phong biên nhận.",
          ),
          actionLabel: t("Return to Runtime Studio", "Quay lại Runtime Studio"),
          action: () => window.location.assign(runtimeEvidenceHref),
        };
      case "submission-failed":
        return {
          title: t("Lab submission could not be saved", "Không thể lưu bài nộp Lab"),
          description: t(
            "Your draft remains in this browser so you can retry safely.",
            "Bản nháp vẫn được giữ trong trình duyệt này để bạn có thể thử lại an toàn.",
          ),
          recovery: t(
            "Check the explanation and required Runtime receipt, then try again. If it still fails, copy the report for your lecturer.",
            "Hãy kiểm tra phần giải trình và receipt Runtime bắt buộc, rồi thử lại. Nếu vẫn lỗi, sao chép báo cáo gửi giảng viên.",
          ),
          actionLabel: t("Retry submission", "Thử nộp lại"),
          action: jumpToSubmissionBox,
        };
      case "submission-explanation":
        return {
          title: t("Your Lab explanation is required", "Cần có phần giải trình Lab"),
          description: t(
            "The Lab cannot be submitted without your written explanation of the evidence and what you learned.",
            "Không thể nộp Lab nếu chưa có phần giải trình về evidence và kiến thức bạn rút ra.",
          ),
          recovery: t(
            "Write your explanation in the submission box, connect it to the evidence, then submit again.",
            "Hãy viết phần giải trình trong khung nộp bài, liên hệ với evidence rồi nộp lại.",
          ),
          actionLabel: t("Go to submission", "Đi tới phần nộp bài"),
          action: jumpToSubmissionBox,
        };
      default:
        return {
          title: t("Need help with Static Studio?", "Cần hỗ trợ với Static Studio?"),
          description: t(
            "Static Studio is for reviewing C1–C3 architecture, source evidence, and your Reverse BFS impact hypothesis.",
            "Static Studio dùng để xem kiến trúc C1–C3, evidence mã nguồn và giả thuyết tác động Reverse BFS.",
          ),
          recovery: t(
            "Inspect the selected node or connection, read its evidence, then compare Reverse BFS with the dependency graph before moving on.",
            "Hãy kiểm tra node hoặc kết nối đã chọn, đọc evidence, rồi đối chiếu Reverse BFS với đồ thị phụ thuộc trước khi chuyển bước.",
          ),
          actionLabel: t("Open impact hypothesis", "Mở giả thuyết tác động"),
          action: () =>
            document
              .getElementById("lab-static-impact")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        };
    }
  })();
  useEffect(() => {
    const automaticIssue =
      step === 1 && fallbackModelQuery.isError
        ? "static-data"
        : step === 2 && needsSandboxBootstrap
          ? "runtime-failed"
          : step === 3 &&
              requiresRuntime &&
              !liveStudioVerified &&
              !preview &&
              !studentContextLoading &&
              !studioStateQuery.isLoading
            ? "evidence-missing"
            : null;
    if (!automaticIssue || shownAutomaticIssueKeys.current.has(`${step}:${automaticIssue}`)) return;
    shownAutomaticIssueKeys.current.add(`${step}:${automaticIssue}`);
    openPhaseIssue(automaticIssue);
  }, [
    fallbackModelQuery.isError,
    liveStudioVerified,
    needsSandboxBootstrap,
    preview,
    requiresRuntime,
    step,
    studentContextLoading,
    studioStateQuery.isLoading,
  ]);

  return (
    <>
      <Dialog
        open={runtimeConfigurationDialogOpen}
        onOpenChange={setRuntimeConfigurationDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {runtimeConfigurationMissing
                ? t("Runtime Studio is not configured", "Runtime Studio chưa được cấu hình")
                : t("Complete the Module Quiz first", "Hãy hoàn thành Quiz Module trước")}
            </DialogTitle>
            <DialogDescription>
              {runtimeConfigurationMissing
                ? t(
                    "Runtime Studio is not ready for this Lab yet. Please contact your lecturer.",
                    "Runtime Studio chưa sẵn sàng cho Lab này. Hãy liên hệ giảng viên.",
                  )
                : t(
                    "Pass the Module Quiz to unlock Runtime Studio.",
                    "Đạt Quiz của Module để mở khóa Runtime Studio.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {runtimeConfigurationMissing && isStudent && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRuntimeConfigurationDialogOpen(false)}
              >
                {t("Close", "Đóng")}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setRuntimeConfigurationDialogOpen(false)}
            >
              {t("Close", "Đóng")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={phaseIssueDialogOpen} onOpenChange={setPhaseIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{phaseIssueContent.title}</DialogTitle>
            <DialogDescription>{phaseIssueContent.recovery}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setPhaseIssueDialogOpen(false);
                phaseIssueContent.action();
              }}
            >
              {phaseIssueContent.actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {step === 1 && (
        <div className="space-y-5">
          {hasReferenceArch ? (
            <>
              <section
                id="lab-static-workspace"
                className="scroll-mt-36 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
                aria-label={t("Architecture workspace", "Không gian kiến trúc")}
              >
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
                      role="tab"
                      aria-selected={inlineC4View === tab.id}
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
                    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                      <div className="min-w-0">
                        <ArchitectureDiagrams
                          model={activeModel}
                          guidedStatic
                          controlledKind={inlineC4View}
                          controlledService={inlineC3Service}
                          onServiceChange={setInlineC3Service}
                          onKindChange={(nextKind, svcId) => {
                            if (svcId) setInlineC3Service(svcId);
                            if (
                              nextKind === "CONTEXT" ||
                              nextKind === "CONTAINER" ||
                              nextKind === "COMPONENT"
                            ) {
                              onSelectInlineC4View(nextKind);
                            }
                          }}
                          hideKindSelector
                          systemName={referenceArchitecture?.projectName || "Mộc Hương Shop Platform"}
                          selectedId={selectedGraphId}
                          onSelect={setSelectedGraphId}
                        />
                      </div>
                      <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                        <div className="space-y-3">
                          <ElementDetailsPanel
                            model={activeModel}
                            selectedId={selectedGraphId}
                            onSelect={setSelectedGraphId}
                            onInspectServiceC3={
                              inlineC4View === "CONTAINER"
                                ? (svcId) => {
                                    setInlineC3Service(svcId);
                                    onSelectInlineC4View("COMPONENT");
                                  }
                                : undefined
                            }
                          />
                          <p className="text-xs leading-5 text-muted-foreground">
                            {t(
                              "Select an element to inspect its details and source evidence.",
                              "Chọn một thành phần để xem chi tiết và evidence mã nguồn.",
                            )}
                          </p>
                        </div>
                      </aside>
                    </div>
                  ) : activeDiagramMermaid ? (
                    <div className="space-y-4">
                      <DiagramPreview
                        title={`C4 ${inlineC4View}`}
                        content={activeDiagramMermaid}
                        format="MERMAID"
                        style="clean"
                      />
                    </div>
                  ) : studentContextLoading || fallbackModelQuery.isPending ? (
                    <div className="space-y-4">
                      <p
                        role="status"
                        className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
                      >
                        {t("Loading architecture diagram…", "Đang tải sơ đồ kiến trúc…")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {t(
                          "Diagram projection is loading or unavailable for this view; switch to Dependency Graph to inspect elements.",
                          "Chưa có dữ liệu sơ đồ cho góc nhìn này; hãy chuyển sang Đồ thị phụ thuộc để kiểm tra.",
                        )}
                      </p>
                    </div>
                  )
                ) : activeModel ? (
                  <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="min-w-0 overflow-x-auto">
                      <ArchitectureGraph
                        model={activeModel}
                        guidedStatic
                        selectedId={selectedGraphId}
                        onSelect={setSelectedGraphId}
                        highlightIds={impactHighlightIds}
                        onClearHighlight={() => setImpactHighlightIds([])}
                      />
                    </div>
                    <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                      <div className="space-y-3">
                        <ElementDetailsPanel
                          model={activeModel}
                          selectedId={selectedGraphId}
                          onSelect={setSelectedGraphId}
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t(
                            "Select an element to inspect its details and source evidence.",
                            "Chọn một thành phần để xem chi tiết và evidence mã nguồn.",
                          )}
                        </p>
                      </div>
                    </aside>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("Loading architectural model…", "Đang tải mô hình kiến trúc…")}
                  </p>
                )}
                {tutorAssistantPanel}
              </section>

              {impactAnalysisOpen && selectedElement && (
                <section
                  id="lab-static-impact"
                  className="rounded-xl border bg-card p-4 sm:p-5"
                  aria-label={t("Static impact analysis", "Phân tích tác động tĩnh")}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">
                        {t("Impact analysis", "Phân tích tác động")}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(
                          `Potential dependency impact for ${selectedElement.name}. Results are static, not verified runtime behavior.`,
                          `Tác động phụ thuộc tiềm năng của ${selectedElement.name}. Đây là kết quả tĩnh, chưa phải hành vi runtime đã xác minh.`,
                        )}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={closeImpactAnalysis}>
                      {t("Close analysis", "Đóng phân tích")}
                    </Button>
                  </div>
                  <Step2StaticImpact
                    key={selectedElement.id}
                    projectId={resolvedModelProjectId}
                    modelId={modelId}
                    modelQuery={modelQuery}
                    sourceLink={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=1${previewParam}`}
                    inlineModel={activeModel}
                    waitForContext={studentContextLoading}
                    onOpenC1C3View={onOpenC1C3View}
                    initialTargetId={selectedElement.id}
                    onImpactChange={setImpactHighlightIds}
                    onFocusElement={(elementId) => setSelectedGraphId(elementId)}
                  />
                </section>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {labInstructions?.trim() || (moduleTheoryItems && moduleTheoryItems.length > 0) ? (
                <DetailPanel
                  title={t("Lesson & Reading Material", "Nội dung Lý thuyết & Tài liệu đọc")}
                >
                  <div className="space-y-5">
                    {labInstructions?.trim() && (
                      <div className="rounded-xl border bg-background p-4 sm:p-5">
                        <MarkdownPreview markdown={labInstructions} />
                      </div>
                    )}
                    {moduleTheoryItems?.map((item) => (
                      <article
                        key={item.id}
                        className="space-y-2 rounded-xl border bg-background p-4 sm:p-5"
                      >
                        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                        <MarkdownPreview markdown={item.body} />
                      </article>
                    ))}
                  </div>
                </DetailPanel>
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
        </div>
      )}

      {step === 3 && (
        <div
          className="space-y-4"
          aria-label={t("Summary and submission", "Tổng hợp và nộp bài")}
        >
          {!preview && labMode !== "LEGACY" && (
            <DetailPanel
              title={t("4-Step Module Summary", "Tổng hợp kết quả 4 Bước trước khi nộp bài")}
            >
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <RuntimeEvidenceStatus
                  complete={(moduleTheoryItems?.length ?? 0) > 0}
                  label={t("Step 1 · Module Theory", "Bước 1 · Lý thuyết Module")}
                  detail={
                    (moduleTheoryItems?.length ?? 0) > 0
                      ? t(
                          `${moduleTheoryItems?.length ?? 0} theory lesson(s) attached to this Module.`,
                          `Gồm ${moduleTheoryItems?.length ?? 0} bài lý thuyết trong Module.`,
                        )
                      : t("Included in Module syllabus.", "Xem lại bài đọc trong Lộ trình khóa học.")
                  }
                />
                <RuntimeEvidenceStatus
                  complete={!hasReferenceArch || Boolean(modelId || activeModel)}
                  label={t(
                    "Step 2 · Static Diagrams (C1–C3 & Dependency Graph)",
                    "Bước 2 · Khám phá Sơ đồ Tĩnh (C1–C3 & Dependency Graph)",
                  )}
                  detail={
                    hasReferenceArch
                      ? t(
                          "Reference architecture diagrams inspected and ready.",
                          "Sơ đồ kiến trúc tham chiếu đã sẵn sàng để đối chiếu khi viết giải trình.",
                        )
                      : t(
                          "Theory-focused Module — no static diagram required.",
                          "Module tập trung lý thuyết — không yêu cầu sơ đồ tĩnh.",
                        )
                  }
                />
                {!isTheoryOnlyLab && (
                  <RuntimeEvidenceStatus
                    complete={
                      studentContext?.quiz == null ||
                      studentContext.quiz.passed === true ||
                      studentContext.quiz.latestStatus === "PASSED"
                    }
                    label={t("Step 3 · Knowledge Check", "Bước 3 · Quiz Module")}
                    detail={
                      studentContext?.quiz
                        ? studentContext.quiz.passed || studentContext.quiz.latestStatus === "PASSED"
                          ? t(
                              `Passed (passing score ${studentContext.quiz.passPercent ?? 70}%).`,
                              `Đã đạt bài kiểm tra (điểm đạt: ${studentContext.quiz.passPercent ?? 70}%).`,
                            )
                          : t(
                              `Pass score: ${studentContext.quiz.passPercent ?? 70}%. Open Quiz in your syllabus to complete.`,
                              `Điểm đạt: ${studentContext.quiz.passPercent ?? 70}%. Hãy làm bài Quiz trong lộ trình để mở khóa Bước 4.`,
                            )
                        : t("No Quiz required for this Module.", "Module này không yêu cầu Quiz.")
                    }
                  />
                )}
                {requiresRuntime && (
                  <RuntimeEvidenceStatus
                    complete={liveStudioVerified && (runtimeEvidence?.snapshots?.length ?? 0) > 0}
                    label={t(
                      "Step 4 · MAVIS Studio Live & Snapshots",
                      "Bước 4 · Thực hành MAVIS Studio & Snapshot",
                    )}
                    detail={
                      liveStudioVerified
                        ? t(
                            `Verified session · ${runtimeEvidence?.snapshots?.length ?? 0} snapshot(s) captured.`,
                            `Phiên đã xác minh · đã chụp ${runtimeEvidence?.snapshots?.length ?? 0} snapshot.`,
                          )
                        : t(
                            "Complete the MAVIS Studio run and capture at least one Snapshot.",
                            "Hoàn thành chạy MAVIS Studio và chụp ít nhất 1 Snapshot.",
                          )
                    }
                  />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasReferenceArch && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=1${previewParam}`}
                    >
                      {t("Review Static Diagrams", "Xem lại Sơ đồ tĩnh")}
                    </Link>
                  </Button>
                )}
                {!isTheoryOnlyLab && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={moduleQuizHref}>
                      {t("Open Quiz", "Mở bài Quiz")}
                    </Link>
                  </Button>
                )}
                {requiresRuntime && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={runtimeEvidenceHref}>
                      {t("Open MAVIS Studio", "Mở MAVIS Studio")}
                    </Link>
                  </Button>
                )}
              </div>
            </DetailPanel>
          )}
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
                      "Review the sealed Runtime Studio evidence before submitting this Lab for grading. The final submission keeps this receipt linked to your explanation.",
                      "Kiểm tra bằng chứng Runtime Studio đã được niêm phong trước khi nộp bài Lab để giảng viên chấm điểm. Bài nộp cuối sẽ liên kết biên nhận này với phần giải trình của bạn.",
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
                                "Receipt sealed and ready for final submission.",
                                "Biên nhận đã được niêm phong và sẵn sàng nộp bài.",
                              )
                            : t(
                                "Finish the Runtime Studio session to seal its receipt.",
                                "Hoàn tất Runtime Studio để niêm phong biên nhận.",
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
                capturedSnapshotCount={
                  requiresRuntime ? (runtimeEvidence?.snapshots?.length ?? 0) : undefined
                }
                studioStateLoading={requiresRuntime && studioStateQuery.isPending}
                runtimeEvidenceHref={requiresRuntime ? runtimeEvidenceHref : undefined}
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
                            2.2 {t("Operate & Finish Studio", "Thực hành & Hoàn tất Studio")}
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
                              "Continue to Evidence Review after finishing Studio",
                              "Sang Kiểm tra Evidence sau khi hoàn tất Studio",
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
                                  "Cần thao tác & Hoàn tất Studio",
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
                              "Mở màn hình Studio Live toàn màn hình để thao tác container thật, chạy Start/Stop/Scale và nhấn Kết thúc Studio để đóng gói biên nhận trước khi nộp bài bên dưới.",
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs sm:p-4">
        <Button asChild size="sm" variant="outline">
          <Link href={modulePrevNav.href}>
            <ChevronLeft className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="max-w-[240px] truncate">
              {t(`Prev: ${modulePrevNav.label}`, `Trước: ${modulePrevNav.label}`)}
            </span>
          </Link>
        </Button>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />{" "}
          {t(
            "Progress is saved directly in this Lab workspace.",
            "Tiến độ được lưu trực tiếp trong không gian Lab này.",
          )}
        </span>
        {step === 3 ? (
          !hasSubmittedLab && !preview ? (
            <Button size="sm" variant="outline" onClick={jumpToSubmissionBox}>
              {t("Jump to Submission Box", "Đi tới Khung Nộp bài")} <ArrowRight />
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("Next: Course Syllabus", "Tiếp theo: Lộ trình khóa học")}{" "}
                <ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </Button>
          )
        ) : (
          <Button asChild={nextAvailable} size="sm" disabled={!nextAvailable}>
            {nextAvailable ? (
              <Link
                href={
                  moduleNextNav?.href ??
                  `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=${nextStep}${previewParam}`
                }
              >
                <span className="max-w-[260px] truncate">
                  {t(
                    `Next: ${moduleNextNav?.label ?? (step === 1 && requiresRuntime ? "MAVIS Studio" : "Summary & Submit")}`,
                    `Tiếp theo: ${moduleNextNav?.label ?? (step === 1 && requiresRuntime ? "MAVIS Studio" : "Tổng hợp & Nộp bài")}`,
                  )}
                </span>
                <ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
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
