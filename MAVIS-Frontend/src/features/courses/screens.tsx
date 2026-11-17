"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  FileCheck2,
  GraduationCap,
  KeyRound,
  Lock,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
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
  CourseEnrollment,
  CourseRoadmap as CourseLabRoadmap,
  SeedCuratedCourseLabs,
  useBootstrapLabStudio,
  useCourseAuthoring,
  useCourseRoadmap,
  usePublishedCourse,
  useStartLabStudioSession,
  useStudentLabContext,
  useStudentLabStudioSessions,
  type StudentLabContext,
  type StudentLabReferenceArchitecture,
  type StudentLabStudioSession,
} from "@/features/workspaces/course-access";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useLocale } from "@/lib/i18n/locale-context";
import { getRuleName } from "@/features/architecture/three-e-content";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { LiveStudioWorkbench } from "@/features/runtime/live-studio-workbench";
import type { ArchitecturalModel } from "@/types/domain";
import { CourseBuilder } from "./course-builder";
import { CourseOutline } from "./course-outline";
import { CourseQuiz, useCourseQuiz } from "./course-quiz";
import { CourseSetupPanel } from "./course-setup";
import { CurriculumLibrary } from "./curriculum";
import { Step2StaticImpact } from "./step2-static-impact";
import { LabToc, type LabTocItem, type LabTocStep } from "./lab-toc";
import { LabSubmissionV2 } from "./lab-submission-v2";
import { TeacherDashboard } from "@/features/workspaces/teacher-dashboard";

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

type InlineC4View = "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH";

const learningSteps: LearningStep[] = [
  {
    id: 1,
    title: "Theory & Static Architecture (C1–C3 & 3E)",
    shortTitle: "Static C1–C3 & 3E",
    description:
      "Read the lesson, inspect interactive C1–C3 diagrams, Dependency Graph, and 3E 5-rule code evidence.",
    titleVi: "Lý thuyết & Kiến trúc Tĩnh (C1–C3 & 3E)",
    shortTitleVi: "Kiến trúc tĩnh",
    descriptionVi:
      "Đọc lý thuyết, khám phá trực tiếp sơ đồ C1–C3, Đồ thị phụ thuộc và bằng chứng mã nguồn 3E.",
    icon: Network,
  },
  {
    id: 2,
    title: "Reverse BFS Impact Explorer",
    shortTitle: "Reverse BFS Impact",
    description:
      "Trace upstream blast radius, direct/indirect callers, and cycle safety right on the Lab's static graph.",
    titleVi: "Lan truyền Ngược (Reverse BFS Impact)",
    shortTitleVi: "Lan truyền ngược",
    descriptionVi:
      "Khám phá vùng ảnh hưởng ngược dòng, caller trực tiếp/gián tiếp và xử lý chu trình ngay trên đồ thị Lab.",
    icon: BookOpen,
  },
  {
    id: 3,
    title: "Quiz Gate Unlock",
    shortTitle: "Quiz Gate",
    description: "Pass the versioned Lab comprehension quiz to unlock Step 4.",
    titleVi: "Trắc nghiệm Mở khóa Quiz Gate",
    shortTitleVi: "Quiz Gate",
    descriptionVi: "Vượt qua bài kiểm tra trắc nghiệm theo phiên bản để mở khóa Bước 4.",
    icon: ShieldCheck,
  },
  {
    id: 4,
    title: "Studio Live & Submit Dossier",
    shortTitle: "Studio & Submit",
    description:
      "Run an interactive Studio Live or simulated sandbox experiment (when required) and submit your sealed V2 dossier.",
    titleVi: "Thực nghiệm Studio Live & Nộp bài",
    shortTitleVi: "Studio & Nộp bài",
    descriptionVi:
      "Chạy thực nghiệm Studio Live (nếu Lab yêu cầu) và hoàn thiện giải trình để nộp bài trực tiếp.",
    icon: Play,
  },
];

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
    view === "CONTAINER"
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
  const visible = filtered.length > 0 ? filtered.slice(0, 24) : model.elements.slice(0, 24);
  const visibleIds = new Set(visible.map((e) => e.id));
  const lines = ["flowchart LR"];
  for (const el of visible) {
    const safeLabel = el.name.replace(/"/g, "'");
    lines.push(`  n_${sanitizeMermaidId(el.id)}["${safeLabel}"]`);
  }
  for (const edge of model.edges) {
    if (visibleIds.has(edge.from) && visibleIds.has(edge.to)) {
      const proto = edge.protocol.replace(/"/g, "'");
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

function stepForItemType(type: string): 1 | 2 | 3 | 4 {
  if (type === "THEORY" || type === "IMPACT_LAB") return 2;
  if (type === "QUIZ" || type === "ESSAY") return 3;
  if (type === "RUNTIME_LAB") return 4;
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
    const scored = list
      .map((s) => s.reviewScore)
      .filter((v): v is number => typeof v === "number");
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, v) => sum + v, 0) / scored.length)
      : null;
    return { total: list.length, passedCount, avgScore };
  }, [submissions.data]);

  if (userRole === "lecturer" || userRole === "admin") return <TeacherDashboard />;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-700 to-teal-700 p-6 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-teal-100 backdrop-blur-sm">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              {t("MAVIS Learning Hub", "Không Gian Học Tập MAVIS")}
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("My Courses", "Khóa học của tôi")}
            </h1>
            <p className="text-sm text-blue-100/90">
              {t(
                "Resume your architecture & runtime Labs, track Quiz gates, and review Lecturer feedback.",
                "Tiếp tục học các bài Lab kiến trúc & runtime, hoàn thành Quiz Gate và theo dõi điểm chấm từ Giảng viên.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {isStudent && (
              <Button
                type="button"
                aria-expanded={passkeyOpen}
                aria-controls="course-passkey-form"
                onClick={() => setPasskeyOpen((open) => !open)}
                className="bg-white text-slate-900 shadow-sm hover:bg-teal-50"
              >
                <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {passkeyOpen
                  ? t("Close Passkey Box", "Đóng ô Passkey")
                  : t("Join a Class with Passkey", "Tham Gia Lớp Bằng Passkey")}
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href="/studio">
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("Free Studio Sandbox", "Sandbox Studio Tự Do")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {isStudent && (
        <section id="course-passkey-form" className={passkeyOpen ? "scroll-mt-6" : "hidden"}>
          <div
            id="course-passkey"
            tabIndex={-1}
            className="scroll-mt-6 rounded-2xl border border-teal-200 bg-teal-50/40 p-1 dark:border-teal-800/60 dark:bg-teal-950/20"
          >
            <CourseEnrollment destination="roadmap" />
          </div>
        </section>
      )}

      {workspaces.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Enrolled Classes", "Lớp Đã Tham Gia")}</span>
              <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{workspaces.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Active learning courses", "Khóa học đang mở")}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Passed Submissions", "Bài Đã Đạt")}</span>
              <ShieldCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
              {studentSubStats.passedCount}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                / {studentSubStats.total} {t("submitted", "đã nộp")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Lab & review checkpoints", "Bài Lab đã chấm đạt")}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Average Grade", "Điểm Trung Bình")}</span>
              <Award className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {studentSubStats.avgScore != null ? `${studentSubStats.avgScore}/100` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Across graded Labs", "Tính trên các Lab đã chấm")}
            </p>
          </div>
        </section>
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
                {filteredWorkspaces.length} / {workspaces.length}{" "}
                {t("classes", "lớp học")}
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
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredWorkspaces.map((workspace) => {
                  const memberCount = workspace.members.length;
                  const isLecturer =
                    workspace.myRole === "LECTURER" || session.data?.user?.role === "admin";
                  const lecturerNames = workspace.members
                    .filter((member) => member.role.toUpperCase() === "LECTURER")
                    .map((member) => member.name);
                  return (
                    <StudentCourseCard
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

function StudentCourseCard({
  workspace,
  memberCount,
  lecturerNames,
  isLecturer,
  onOpen,
}: {
  workspace: import("@/lib/api/contracts").Response<"workspaces">[number];
  memberCount: number;
  lecturerNames: string[];
  isLecturer: boolean;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const roadmap = useCourseRoadmap(workspace.id);
  const labs = roadmap.data?.labs ?? [];
  const passed = labs.filter((lab) => lab.state === "PASSED").length;
  const nextLab = labs.find((lab) => lab.state === "UNLOCKED");
  const percent = labs.length ? Math.round((passed / labs.length) * 100) : 0;
  const roadmapHref = `/roadmap?workspace=${encodeURIComponent(workspace.id)}`;

  return (
    <article className="flex flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:border-teal-500/50 hover:shadow-md">
      <div className="h-2 bg-gradient-to-r from-blue-700 via-teal-600 to-emerald-500" />
      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="border-teal-200 bg-teal-50 font-mono text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
            >
              {workspace.code || t("CLASS", "LỚP")}
            </Badge>
            <StatusBadge status={workspace.status || "ACTIVE"} />
          </div>

          <div>
            <h2 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight">
              {workspace.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Lecturer", "Giảng viên")}:{" "}
              <span className="font-medium text-foreground">
                {lecturerNames.length
                  ? lecturerNames.join(", ")
                  : t("Not listed", "Chưa có thông tin")}
              </span>
              {" · "}
              {memberCount} {t("members", "thành viên")}
            </p>
          </div>

          {roadmap.data?.guided && (
            <div className="space-y-1.5 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t("Course Progress", "Tiến Độ Khóa Học")}
                </span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {passed}/{labs.length} Labs ({percent}%)
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("Labs passed", "Lab đã đạt")}
                aria-valuemin={0}
                aria-valuemax={labs.length || 1}
                aria-valuenow={passed}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {nextLab ? (
            <p className="flex items-start gap-2 rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-200">
              <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current text-blue-600" aria-hidden="true" />
              <span>
                <span className="font-semibold">{t("Up next", "Bài tiếp theo")}:</span>{" "}
                {nextLab.title}
              </span>
            </p>
          ) : labs.length > 0 && passed === labs.length ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("All guided Labs completed!", "Bạn đã hoàn thành toàn bộ Lab!")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            asChild
            onClick={onOpen}
            className="flex-1 bg-teal-600 text-white hover:bg-teal-700"
          >
            <Link href={roadmapHref}>
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
              {isLecturer
                ? t("Manage course", "Quản lý khóa học")
                : nextLab
                  ? t("Continue learning", "Tiếp tục học")
                  : t("Continue learning", "Vào lớp học")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" onClick={onOpen}>
            <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
              {t("Grades", "Điểm & Bài nộp")}
            </Link>
          </Button>
        </div>
      </div>
    </article>
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
      {workspace &&
        (canManage ? (
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

            {client.mode === "backend" && <CourseBuilder workspaceId={workspaceId} />}

            {client.mode === "backend" && <CourseSetupPanel workspaceId={workspaceId} />}

            {publishedCourse.data && (
              <section
                className="rounded-2xl border bg-card p-5"
                aria-labelledby="published-course-roadmap"
              >
                <h2 id="published-course-roadmap" className="font-semibold">
                  {t("Published Course roadmap", "Lộ trình Course đã publish")}
                </h2>
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  <h3 className="font-medium">{publishedCourse.data.snapshot.title}</h3>
                  {publishedCourse.data.snapshot.description && (
                    <p className="mt-1 text-muted-foreground">
                      {publishedCourse.data.snapshot.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{publishedCourse.data.version}
                  </p>
                </div>
                <ol className="mt-4 space-y-4">
                  {publishedCourse.data.snapshot.modules.map((module) => (
                    <li key={module.id} className="rounded-xl border p-4">
                      <h3 className="font-medium">
                        {module.position}. {module.title}
                      </h3>
                      {module.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                      )}
                      {module.items.length > 0 && (
                        <ol className="mt-3 space-y-1">
                          {module.items.map((item) => (
                            <li
                              key={item.id}
                              className="rounded-lg border bg-background p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{item.type.replaceAll("_", " ")}</Badge>
                                <span className="font-medium">{item.title}</span>
                                {item.assignmentId && (
                                  <Button asChild size="sm" variant="link" className="h-auto p-0">
                                    <Link
                                      href={`/lab?${new URLSearchParams({ workspace: workspaceId, assignment: item.assignmentId, step: item.type === "QUIZ" || item.type === "IMPACT_LAB" ? "2" : item.type === "RUNTIME_LAB" ? "3" : "1" })}`}
                                    >
                                      {t("Open activity", "Mở hoạt động")}
                                    </Link>
                                  </Button>
                                )}
                              </div>
                              {item.type === "THEORY" &&
                                typeof item.content["body"] === "string" && (
                                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                                    {item.content["body"]}
                                  </p>
                                )}
                              {item.type === "ESSAY" &&
                                typeof item.content["prompt"] === "string" && (
                                  <div className="mt-2 space-y-2">
                                    <p className="whitespace-pre-wrap">
                                      {item.content["prompt"]}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t(
                                        "Rubric-based lecturer review",
                                        "Giảng viên chấm theo rubric",
                                      )}
                                    </p>
                                  </div>
                                )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <CourseLabRoadmap
              workspaceId={workspaceId}
              canManage={canManage}
              active={workspace.status !== "ARCHIVED"}
            />
          </div>
        ) : (
          <StudentCourseDetail workspace={workspace} />
        ))}
    </RequestState>
  );
}

function StudentCourseDetail({
  workspace,
}: {
  workspace: import("@/lib/api/contracts").Response<"workspaces">[number];
}) {
  const { t } = useLocale();
  const client = useApi();
  const workspaceId = workspace.id;
  const roadmap = useCourseRoadmap(workspaceId);
  const publishedCourse = usePublishedCourse(workspaceId);
  const assignmentsQuery = useApiQuery("assignments", { workspaceId });
  const submissionsQuery = useApiQuery("submissions", { workspaceId });
  const [activeTab, setActiveTab] = useState<"player" | "submissions" | "library">("player");

  const labs = roadmap.data?.labs ?? [];
  const passedCount = labs.filter((l) => l.state === "PASSED").length;
  const progressPercent = labs.length ? Math.round((passedCount / labs.length) * 100) : 0;

  const defaultLabId =
    labs.find((l) => l.state === "UNLOCKED")?.assignmentId ?? labs[0]?.assignmentId ?? "";
  const [selectedLabId, setSelectedLabId] = useState<string>("");
  const currentLabId =
    selectedLabId && labs.some((l) => l.assignmentId === selectedLabId)
      ? selectedLabId
      : defaultLabId;
  const selectedLab = labs.find((l) => l.assignmentId === currentLabId) ?? labs[0] ?? null;
  const selectedAssignment = (assignmentsQuery.data ?? []).find(
    (a) => a.id === selectedLab?.assignmentId,
  );
  const classAssignmentIds = new Set((assignmentsQuery.data ?? []).map((a) => a.id));
  const classSubmissions = (submissionsQuery.data ?? []).filter(
    (sub) =>
      sub.workspaceId === workspaceId ||
      (!sub.workspaceId && classAssignmentIds.has(sub.assignmentId)),
  );
  const stepDescriptions: Array<{ step: 1 | 2 | 3 | 4; label: string; hint: string }> = [
    {
      step: 1,
      label: t("Step 1 · Architecture & Theory", "Bước 1 · Lý Thuyết & C1–C3"),
      hint: t("Read docs & 3E evidence", "Đọc lý thuyết & bằng chứng 3E"),
    },
    {
      step: 2,
      label: t("Step 2 · Impact Explorer", "Bước 2 · Lan Truyền Ngược"),
      hint: t("Reverse BFS blast radius", "Truy vết ảnh hưởng Reverse BFS"),
    },
    {
      step: 3,
      label: t("Step 3 · Quiz Gate", "Bước 3 · Vượt Qua Quiz Gate"),
      hint: t("Pass comprehension check", "Đạt kiểm tra kiến thức nền"),
    },
    {
      step: 4,
      label: t("Step 4 · 2D Studio & Submit", "Bước 4 · Thực Hành Studio & Nộp"),
      hint: t("Verify session & explain", "Xác minh phiên & nộp bài giải"),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-blue-900 via-blue-700 to-teal-700 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/25 bg-white/15 font-mono text-white hover:bg-white/20">
                {workspace.code || t("CLASS", "LỚP")}
              </Badge>
              <span className="text-xs font-medium text-teal-100">
                {labs.length > 0
                  ? `${passedCount}/${labs.length} Labs (${progressPercent}%)`
                  : t("Course Workspace", "Lớp học MAVIS")}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{workspace.name}</h1>
            <p className="text-sm text-blue-100/90">
              {t(
                "Select a Lab on the left to review instructions, inspect architecture diagrams, pass the Quiz Gate, and launch 2D Studio practice.",
                "Chọn một bài Lab bên trái để xem lý thuyết, kiểm tra kiến trúc, vượt Quiz Gate và thực hành trên 2D Studio.",
              )}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href="/courses">← {t("Back to courses", "Quay lại khóa học")}</Link>
          </Button>
        </div>

        {labs.length > 0 && (
          <div className="mt-5 max-w-md space-y-1.5">
            <div className="flex justify-between text-xs text-teal-100">
              <span>{t("Overall Course Progress", "Tiến Độ Toàn Khóa")}</span>
              <span className="font-semibold text-white">{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm"
        role="tablist"
        aria-label={t("Student course workspace sections", "Mục học tập trong lớp")}
      >
        <Button
          type="button"
          size="sm"
          role="tab"
          aria-selected={activeTab === "player"}
          variant={activeTab === "player" ? "default" : "ghost"}
          onClick={() => setActiveTab("player")}
          className={activeTab === "player" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
        >
          <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("1. Course & Lab Player", "1. Lộ Trình & Phòng Học Lab")}
        </Button>
        <Button
          type="button"
          size="sm"
          role="tab"
          aria-selected={activeTab === "submissions"}
          variant={activeTab === "submissions" ? "default" : "ghost"}
          onClick={() => setActiveTab("submissions")}
          className={activeTab === "submissions" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
        >
          <FileCheck2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("2. My Submissions & Grades", "2. Bài Nộp & Điểm Số")}
          {classSubmissions.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[11px]">
              {classSubmissions.length}
            </Badge>
          )}
        </Button>
        {client.mode === "backend" && (
          <Button
            type="button"
            size="sm"
            role="tab"
            aria-selected={activeTab === "library"}
            variant={activeTab === "library" ? "default" : "ghost"}
            onClick={() => setActiveTab("library")}
            className={activeTab === "library" ? "bg-teal-600 text-white hover:bg-teal-700" : ""}
          >
            <Code2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("3. Java & C# Reference Library", "3. Giáo Trình Java & C#")}
          </Button>
        )}
      </div>

      {activeTab === "player" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
            <aside className="rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-6">
              <div className="mb-3 flex items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {t("Guided Labs & Sequence", "Danh Sách Bài Lab Theo Thứ Tự")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {passedCount}/{labs.length} {t("completed", "đã đạt")}
                  </p>
                </div>
              </div>

              <RequestState query={roadmap} empty={!labs.length}>
                <ol className="space-y-2">
                  {labs.map((lab) => {
                    const isSelected = lab.assignmentId === selectedLab?.assignmentId;
                    const isPassed = lab.state === "PASSED";
                    const isLocked = lab.state === "LOCKED";
                    return (
                      <li key={lab.assignmentId}>
                        <button
                          type="button"
                          onClick={() => setSelectedLabId(lab.assignmentId)}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? "border-teal-600 bg-teal-50/70 shadow-sm dark:border-teal-500 dark:bg-teal-950/30"
                              : isLocked
                                ? "border-border/60 bg-muted/30 opacity-80 hover:opacity-100"
                                : "border-border bg-background hover:border-teal-400"
                          }`}
                        >
                          <span className="mt-0.5 shrink-0">
                            {isPassed ? (
                              <CheckCircle2
                                className="h-4 w-4 text-emerald-600"
                                aria-hidden="true"
                              />
                            ) : isLocked ? (
                              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <Play
                                className="h-4 w-4 fill-current text-blue-600"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                              <span className="font-mono text-muted-foreground">
                                Lab {String(lab.position).padStart(2, "0")}
                              </span>
                              <Badge
                                variant={
                                  isPassed ? "success" : isLocked ? "secondary" : "default"
                                }
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {isPassed
                                  ? t("PASSED", "ĐÃ ĐẠT")
                                  : isLocked
                                    ? t("LOCKED", "ĐANG KHÓA")
                                    : t("UNLOCKED", "ĐANG MỞ")}
                              </Badge>
                            </span>
                            <span className="mt-1 block text-sm font-medium leading-snug text-foreground">
                              {lab.title}
                            </span>
                          </span>
                          <ChevronRight
                            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              isSelected ? "translate-x-0.5 text-teal-600" : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </RequestState>
            </aside>

            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              {!selectedLab ? (
                <EmptyState
                  title={t("No Lab selected yet", "Chưa có bài Lab nào")}
                  description={t(
                    "Your lecturer is preparing Labs for this class, or check the module outline below.",
                    "Giảng viên đang chuẩn bị bài Lab cho lớp này, hoặc bạn có thể xem nội dung chương bên dưới.",
                  )}
                />
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          Lab {String(selectedLab.position).padStart(2, "0")}
                        </Badge>
                        <Badge
                          variant={
                            selectedLab.state === "PASSED"
                              ? "success"
                              : selectedLab.state === "LOCKED"
                                ? "secondary"
                                : "default"
                          }
                        >
                          {selectedLab.state === "PASSED"
                            ? t("Passed", "Đã vượt qua")
                            : selectedLab.state === "LOCKED"
                              ? t("Locked until previous Lab passes", "Chưa mở khóa")
                              : t("Ready to study", "Sẵn sàng học")}
                        </Badge>
                      </div>
                      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                        {selectedLab.title}
                      </h2>
                    </div>
                  </div>

                  {selectedAssignment?.instructions ? (
                    <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                      <MarkdownPreview markdown={selectedAssignment.instructions} />
                    </div>
                  ) : null}

                  <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                          {t(
                            "4-Step Guided Learning Flow",
                            "Quy Trình Học & Thực Hành 4 Bước Cho Lab Này",
                          )}
                        </h3>
                        <p className="text-xs text-emerald-900/80 dark:text-emerald-300/80">
                          {t(
                            "Follow Steps 1 to 4 directly inside the unified Lab workspace.",
                            "Thực hiện lần lượt Bước 1 đến Bước 4 ngay trong Không Gian Làm Bài Lab.",
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {stepDescriptions.map((s) => {
                        const stepHref = `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=${s.step}`;
                        return selectedLab.state === "LOCKED" ? (
                          <div
                            key={s.step}
                            className="rounded-xl border border-border/70 bg-background/70 p-3 opacity-70"
                          >
                            <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                          </div>
                        ) : (
                          <Link
                            key={s.step}
                            href={stepHref}
                            className="group rounded-xl border border-emerald-200/80 bg-background p-3 transition-all hover:border-emerald-500 hover:shadow-sm dark:border-emerald-800/50"
                          >
                            <p className="text-xs font-semibold text-emerald-800 group-hover:text-emerald-600 dark:text-emerald-300">
                              {s.label}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                          </Link>
                        );
                      })}
                    </div>

                    {selectedLab.state === "LOCKED" ? (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {t(
                            "This Lab unlocks automatically once the previous Lab is completed and reviewed as Passed by your lecturer.",
                            "Lab này sẽ tự động mở khóa sau khi bạn hoàn thành Lab trước và được Giảng viên chấm Đạt.",
                          )}
                          {selectedLab.reason ? ` (${selectedLab.reason})` : ""}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button
                          asChild
                          size="lg"
                          className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                        >
                          <Link
                            href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=1`}
                          >
                            <Play className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
                            {t(
                              "Launch Lab Workspace Now",
                              "Vào Không Gian Làm Bài Lab Ngay",
                            )}
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                          <Link
                            href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(selectedLab.assignmentId)}&step=4`}
                          >
                            {t("Jump to 2D Studio", "Mở Thẳng Studio Thực Hành")}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          {publishedCourse.data && (
            <details className="rounded-2xl border bg-card p-5 shadow-sm">
              <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">
                {t("Full Course Modules & Reading Outline", "Đề Cương Toàn Bộ Chương & Bài Đọc")}
              </summary>
              <div className="mt-4">
                <CourseOutline
                  workspaceId={workspaceId}
                  canManage={false}
                  active={workspace.status !== "ARCHIVED"}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {activeTab === "submissions" && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="text-base font-semibold">
                {t("Your Submissions in This Class", "Bài Đã Nộp Trong Lớp Này")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Track grading status, scores, and detailed lecturer comments.",
                  "Theo dõi trạng thái chấm bài, điểm số và nhận xét chi tiết từ Giảng viên.",
                )}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("Open Full Submissions Page", "Mở Trang Bài Nộp Đầy Đủ")}
              </Link>
            </Button>
          </div>

          <RequestState
            query={submissionsQuery}
            empty={!classSubmissions.length}
            emptyMessage={t(
              "You have not submitted any Labs in this class yet. Open Step 4 in a Lab to submit.",
              "Bạn chưa nộp bài Lab nào trong lớp này. Hãy vào Bước 4 trong Lab để nộp bài.",
            )}
          >
            <div className="divide-y">
              {classSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="space-y-1">
                    <Link
                      href={`/submissions/${encodeURIComponent(sub.id)}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {sub.labOrder ? `Lab ${String(sub.labOrder).padStart(2, "0")} · ` : ""}
                      {sub.assignmentTitle || sub.assignmentId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sub.submittedAt).toLocaleString()}
                      {sub.reviewScore != null ? ` · ${sub.reviewScore}/100` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={
                        sub.labOutcome === "PASSED"
                          ? "PASSED"
                          : sub.labOutcome === "NEEDS_REVISION"
                            ? "NEEDS_REVISION"
                            : sub.reviewStatus || "PENDING"
                      }
                      variant={
                        sub.labOutcome === "PASSED"
                          ? "success"
                          : sub.labOutcome === "NEEDS_REVISION"
                            ? "warning"
                            : "secondary"
                      }
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/submissions/${encodeURIComponent(sub.id)}`}>
                        {t("View Details", "Xem Chi Tiết")}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </RequestState>
        </section>
      )}

      {activeTab === "library" && client.mode === "backend" && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <CurriculumLibrary />
        </section>
      )}
    </div>
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
  const activeStep = ([1, 2, 3, 4].includes(stepValue) ? stepValue : 1) as 1 | 2 | 3 | 4;
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
  const studentContext = useStudentLabContext(
    workspaceId,
    assignmentId,
    client.mode === "backend" && Boolean(workspaceId && assignmentId),
  );
  const quiz = useCourseQuiz(
    workspaceId,
    assignmentId,
    Boolean(lab && roadmap.data?.guided && (session.data?.user?.role === "student" || isLecturer)),
  );
  const runtimeReady =
    (!quiz.isError && quiz.data?.runtimeUnlocked === true) ||
    studentContext.data?.quiz?.runtimeUnlocked === true;
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
      poll: displayedStep >= 4,
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

  const hasSubmitted = Boolean(studentContext.data?.latestSubmission);
  const stepComplete: Record<1 | 2 | 3 | 4, boolean> = {
    1: Boolean(activeModelId),
    2: Boolean(activeModelId) && runtimeReady,
    3: runtimeReady,
    4: requiresRuntime ? Boolean(verifiedStudioSession && hasSubmitted) : hasSubmitted,
  };
  const completedSteps = learningSteps.filter((step) => stepComplete[step.id]).length;
  const progress = Math.round((completedSteps / learningSteps.length) * 100);
  const stepAvailable = (id: 1 | 2 | 3 | 4) => preview || id <= 3 || (id === 4 && runtimeReady);
  const stepReason = (id: 1 | 2 | 3 | 4) =>
    id === 4
      ? t(
          "Pass the Step 3 Quiz Gate (>= 80%) to unlock Step 4.",
          "Đạt Quiz Gate ở Bước 3 (>= 80%) để mở khóa Bước 4.",
        )
      : undefined;
  const labHref = (step: 1 | 2 | 3 | 4, extraView?: InlineC4View) =>
    `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=${step}${extraView ? `&view=${extraView}` : ""}${preview ? "&preview=1" : ""}`;
  const tocSteps: LabTocStep[] = learningSteps.map((step) => {
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
        state: activeModelId ? "READY" : referenceSnapshotId ? "IN PROGRESS" : "MISSING",
      },
      {
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
    [activeModelId, referenceSnapshotId, requiresRuntime, runtimeReady, verifiedStudioSession, t],
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
          <header className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                  <Link className="hover:text-foreground" href="/courses">
                    {t("Classes", "Lớp học")}
                  </Link>
                  <span aria-hidden="true">/</span>
                  <Link
                    className="hover:text-foreground"
                    href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}
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
                  <Badge variant="secondary">
                    {requiresRuntime
                      ? t("2D Studio Practice Lab", "Lab Thực Hành 2D Studio")
                      : t("Theory & Quiz Lab", "Lab Lý Thuyết & Quiz")}
                  </Badge>
                  {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {t("Guided 4-Step Learning", "Học & Thực Hành 4 Bước")}
                  </Badge>
                  <Badge variant="outline">
                    {t("Reference Repository Included", "Kèm Mã Nguồn Tham Chiếu")}
                  </Badge>
                </div>
              </div>
              <div aria-label={t("Lab actions", "Thao tác Lab")} className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                    {t("Course roadmap", "Lộ trình khóa học")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                  >
                    {t("Submissions & Grades", "Bài nộp & Điểm")}
                  </Link>
                </Button>
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
              </div>
            </div>
            {preview && (
              <p
                role="status"
                className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200"
              >
                {t(
                  "Preview mode is read-only. Quiz attempts, runtime sessions and submissions are not created.",
                  "Chế độ xem trước chỉ đọc. Không tạo lượt Quiz, phiên runtime hay bài nộp.",
                )}
              </p>
            )}
          </header>

          <nav
            aria-label={t("Lab 4-step workflow", "Quy trình 4 bước trong Lab")}
            className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-4"
          >
            {learningSteps.map((s) => {
              const available = stepAvailable(s.id);
              const isCurrent = displayedStep === s.id;
              const complete = stepComplete[s.id];
              return available ? (
                <Link
                  key={s.id}
                  href={labHref(s.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : complete
                        ? "border-emerald-500/30 bg-emerald-500/5 text-foreground hover:border-primary/40"
                        : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]">
                    {complete ? <Check className="size-3.5" aria-hidden="true" /> : s.id}
                  </span>
                  <span className="min-w-0 truncate">{t(s.shortTitle, s.shortTitleVi)}</span>
                </Link>
              ) : (
                <div
                  key={s.id}
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg border border-transparent bg-muted/20 px-3 py-2 text-xs text-muted-foreground/70"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]">
                    {s.id}
                  </span>
                  <span className="min-w-0 truncate">{t(s.shortTitle, s.shortTitleVi)}</span>
                </div>
              );
            })}
          </nav>

          {(() => {
            const activeMeta = learningSteps.find((s) => s.id === displayedStep) ?? learningSteps[0];
            if (!activeMeta) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-950 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-100">
                <p>
                  <span className="font-semibold">
                    {t(`Step ${activeMeta.id}/4`, `Bước ${activeMeta.id}/4`)} ·{" "}
                    {t(activeMeta.title, activeMeta.titleVi)}:
                  </span>{" "}
                  {t(activeMeta.description, activeMeta.descriptionVi)}
                </p>
              </div>
            );
          })()}

          <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <LabToc
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
                runtimeReady={runtimeReady}
                runtimeSessionHref={labSessions[0] ? runtimeLink(labSessions[0].id) : null}
                studioHref={
                  verifiedStudioSession ? runtimeLink(verifiedStudioSession.id) + "&studio=1" : null
                }
                studioVerified={Boolean(verifiedStudioSession)}
                studioSessionId={verifiedStudioSession?.id}
                studioSessions={studioSessionsList}
                labMode={lab.labMode ?? (requiresRuntime ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ")}
                showQuiz={roadmap.data?.guided === true}
                canAttemptQuiz={
                  session.data?.user?.role === "student" && roadmap.data?.guided === true
                }
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
                labTitle={lab.title}
                labInstructions={lab.instructions}
                moduleTitle={currentModule?.title}
                theoryItems={theoryItems}
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
      title={t("3E Static Evaluation Summary (5 Rules)", "Tổng hợp đánh giá tĩnh 3E (5 quy tắc)")}
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
  labTitle,
  labInstructions,
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
  runtimeReady,
  studioVerified,
  studioSessionId,
  studioSessions,
  labMode,
  requiresRuntime,
  moduleTitle,
  theoryItems,
  referenceArchitecture,
  inlineReferenceModel,
  inlineC4View,
  onSelectInlineC4View,
  onOpenC1C3View,
  studentContext,
}: {
  step: 1 | 2 | 3 | 4;
  workspaceId: string;
  labId: string;
  labTitle?: string | undefined;
  labInstructions?: string | undefined;
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
  studioSessions: StudentLabStudioSession[];
  labMode: string;
  requiresRuntime: boolean;
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
  const [selectedStudioSessionId, setSelectedStudioSessionId] = useState<string>(
    () => studioSessionId ?? studioSessions[0]?.id ?? "",
  );
  const startStudio = useStartLabStudioSession(workspaceId, labId);
  const bootstrapStudio = useBootstrapLabStudio(workspaceId, labId);

  const activeStudioSessionId =
    selectedStudioSessionId && studioSessions.some((s) => s.id === selectedStudioSessionId)
      ? selectedStudioSessionId
      : (studioSessionId ?? studioSessions[0]?.id ?? "");

  const studioStateQuery = useApiQuery(
    "studioState",
    { sessionId: activeStudioSessionId },
    {
      enabled:
        client.mode === "backend" &&
        step === 4 &&
        requiresRuntime &&
        !preview &&
        Boolean(activeStudioSessionId),
      poll: step === 4 && requiresRuntime && Boolean(activeStudioSessionId),
    },
  );

  const liveStudioVerified =
    studioVerified ||
    Boolean(studioStateQuery.data?.finishRequested || studioStateQuery.data?.receiptDigest) ||
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

  const submitHref = "#lab-submit";
  const viewModelQuery = modelQuery ?? referenceModelQuery ?? null;
  const current = learningSteps.find((item) => item.id === step)!;
  const Icon = current.icon;
  const next = step < 4 ? ((step + 1) as 2 | 3 | 4) : undefined;
  const nextAvailable = Boolean(preview) || (next !== undefined && (next <= 3 || runtimeReady));
  const previewParam = preview ? "&preview=1" : "";
  const needsSandboxBootstrap = Boolean(
    activeStudioSessionId &&
    studioStateQuery.isSuccess &&
    studioStateQuery.data.services.length === 0 &&
    !studioStateQuery.data.telemetry,
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
              Step {step} / 4
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
          {theoryItems && theoryItems.length > 0
            ? theoryItems.map((item) => (
                <DetailPanel key={item.id} title={item.title}>
                  <MarkdownPreview markdown={String(item.content?.["body"] ?? "")} />
                </DetailPanel>
              ))
            : labInstructions && (
                <DetailPanel title={t("Lab Lesson & Instructions", "Bài học & Hướng dẫn Lab")}>
                  <MarkdownPreview markdown={labInstructions} />
                </DetailPanel>
              )}

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
              activeDiagramMermaid ? (
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
                "3E Static Evaluation Summary & Code Evidence",
                "Tổng hợp Đánh giá Tĩnh 3E & Bằng chứng Mã nguồn",
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
                          <span className="font-medium">{getRuleName(finding.ruleId, "en")}</span>
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
        </div>
      )}

      {step === 2 && (
        <Step2StaticImpact
          projectId={projectId}
          modelId={modelId}
          modelQuery={modelQuery}
          sourceLink={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=1${previewParam}`}
          inlineModel={activeModel}
          onOpenC1C3View={onOpenC1C3View}
        />
      )}

      {step === 3 && (
        <div className="space-y-4">
          {showQuiz ? (
            <CourseQuiz
              workspaceId={workspaceId}
              labId={labId}
              canSubmit={canAttemptQuiz}
              runtimeStepHref={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=4${previewParam}`}
              submissionHref={!requiresRuntime ? submitHref : undefined}
            />
          ) : (
            <DetailPanel title={t("Quiz gate", "Điều kiện Quiz")}>
              <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                <p className="text-sm leading-6 text-muted-foreground">
                  {t(
                    "Quiz attempts are available to enrolled students in published guided Labs.",
                    "Sinh viên đã ghi danh có thể làm Quiz trong Lab tuần tự đã công bố.",
                  )}
                </p>
              </div>
            </DetailPanel>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          {!runtimeReady && !preview ? (
            <DetailPanel
              title={t(
                "Step 4 Locked · Quiz Gate Required",
                "Bước 4 đang khóa · Cần vượt qua Quiz Gate",
              )}
            >
              <p className="text-sm text-muted-foreground">
                {t(
                  "Pass the Step 3 Quiz Gate (>= 80%) to unlock Studio Live & Submission.",
                  "Hãy hoàn thành Quiz Gate ở Bước 3 (>= 80%) để mở khóa Thực nghiệm Studio Live & Nộp bài.",
                )}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(labId)}&step=3`}
                >
                  {t("Go to Step 3: Quiz Gate", "Sang Bước 3: Làm Quiz Gate")}
                </Link>
              </Button>
            </DetailPanel>
          ) : (
            <>
              {requiresRuntime && (
                <DetailPanel
                  title={t(
                    "MAVIS Studio Live Experiment (Inline Sandbox)",
                    "Thực nghiệm MAVIS Studio Live (Trực tiếp trong Lab)",
                  )}
                >
                  {preview ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Preview shows the inline Studio Live & Submission step. Starting student runtime sessions is disabled in preview mode.",
                        "Chế độ xem trước hiển thị khu vực Studio Live & Nộp bài. Khởi chạy phiên runtime của sinh viên bị tắt khi xem trước.",
                      )}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:grid-cols-3">
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            4.1 {t("Start Studio Session", "Khởi tạo Phiên Studio")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t("Launch live topology canvas", "Mở topology dịch vụ tương tác")}
                          </p>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            4.2 {t("Operate & Finish Studio", "Thực hành & Finish Studio")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t("Seal runtime observation receipt", "Ghi nhận thao tác và biên nhận")}
                          </p>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <span className="font-semibold">
                            4.3 {t("Explain & Submit", "Giải trình & Nộp bài")}
                          </span>
                          <p className="mt-0.5 text-muted-foreground">
                            {t("Summarize findings below", "Nộp giải trình ở khung bên dưới")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3.5">
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {t(
                                "Interactive Microservices Runtime",
                                "Thực nghiệm Microservices Tương tác",
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
                          </div>
                          <p className="text-muted-foreground">
                            {t(
                              "Start a session with 1 click, scale/stop/start services or send live requests, then click Finish Studio to seal your receipt.",
                              "Bấm 1 nút để khởi tạo phiên, thao tác START/STOP/SCALE dịch vụ, rồi nhấn Finish Studio để đóng gói biên nhận.",
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={startStudio.isPending}
                            onClick={() => {
                              startStudio.mutate(undefined, {
                                onSuccess: (created) => {
                                  if (created?.id) setSelectedStudioSessionId(created.id);
                                },
                              });
                            }}
                          >
                            {startStudio.isPending
                              ? t("Starting Studio Live…", "Đang khởi tạo Studio Live…")
                              : t("Start Studio Live Session", "Khởi tạo Phiên Studio Live")}
                          </Button>
                          {needsSandboxBootstrap && activeStudioSessionId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={bootstrapStudio.isPending}
                              onClick={() => bootstrapStudio.mutate(activeStudioSessionId)}
                            >
                              {bootstrapStudio.isPending
                                ? t("Activating Sandbox…", "Đang kích hoạt Sandbox…")
                                : t(
                                    "Activate Simulated Sandbox Telemetry",
                                    "Kích hoạt Sandbox Telemetry mô phỏng",
                                  )}
                            </Button>
                          )}
                        </div>
                      </div>
                      {startStudio.isError && <ErrorState error={startStudio.error} />}
                      {bootstrapStudio.isError && <ErrorState error={bootstrapStudio.error} />}
                      <div className="min-h-[640px] overflow-hidden rounded-xl border border-slate-800">
                        <LiveStudioWorkbench
                          sessions={studioSessions}
                          sessionId={activeStudioSessionId}
                          projectId={projectId}
                          projectName={labTitle}
                          onSelectSession={setSelectedStudioSessionId}
                          onStartSession={() =>
                            startStudio.mutate(undefined, {
                              onSuccess: (created) => {
                                if (created?.id) setSelectedStudioSessionId(created.id);
                              },
                            })
                          }
                          starting={startStudio.isPending}
                          hideSwitchToSandbox
                        />
                      </div>
                    </div>
                  )}
                </DetailPanel>
              )}

              {!preview && labMode !== "LEGACY" && (
                <LabSubmissionV2
                  workspaceId={workspaceId}
                  assignmentId={labId}
                  labMode={labMode}
                  runtimeSessionId={verifiedSessionForSubmit}
                  initialReview={studentContext?.latestReview}
                />
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
        {step === 4 ? (
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
              <span>{t("Pass Quiz Gate to continue", "Vượt qua Quiz Gate để tiếp tục")}</span>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
