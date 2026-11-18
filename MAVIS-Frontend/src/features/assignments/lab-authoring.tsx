"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  CircleHelp,
  Eye,
  GitBranch,
  Info,
  Plus,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, RequestState } from "@/components/shared/request-state";
import { useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring, useCourseSetup } from "@/features/workspaces/course-access";
import type { Assignment } from "./requirements";
import { LabInfoForm } from "./lab-info-form";
import { LabTheorySection } from "./lab-theory-section";
import { LabSourceSection } from "./lab-source-section";
import { LabQuizSection } from "./lab-quiz-section";
import { LabStudioSection } from "./lab-studio-section";
import { LabPublishSection } from "./lab-publish-section";
import { cn } from "@/lib/utils";

type Tab = "info" | "theory" | "source" | "quiz" | "studio" | "publish";
type HorizontalStep = 1 | 2 | 3 | 4;

const TAB_LABELS: Record<Tab, { en: string; vi: string; icon: LucideIcon }> = {
  info: { en: "Lab information", vi: "Thông tin Lab", icon: Info },
  theory: { en: "Theory", vi: "Lý thuyết Lab", icon: BookOpen },
  source: { en: "Reference source", vi: "Nguồn tham chiếu", icon: GitBranch },
  quiz: { en: "Quiz", vi: "Quiz", icon: CircleHelp },
  studio: { en: "Studio Live", vi: "Studio Live", icon: Activity },
  publish: { en: "Check & add to class", vi: "Kiểm tra & thêm vào lớp", icon: Rocket },
};

function isTab(value: string | null): value is Tab {
  return (
    value === "info" ||
    value === "theory" ||
    value === "source" ||
    value === "quiz" ||
    value === "studio" ||
    value === "publish"
  );
}

function stepForTab(tab: Tab): HorizontalStep {
  if (tab === "info" || tab === "theory") return 1;
  if (tab === "source") return 2;
  if (tab === "quiz") return 3;
  return 4;
}

export function LabAuthoring() {
  const { t } = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params?.get("workspace") || selection.workspaceId;
  const requestedAssignmentId = params?.get("assignment") || "";
  const [createdAssignmentId, setCreatedAssignmentId] = useState("");
  const requestedTab = params?.get("tab") ?? params?.get("step") ?? null;
  const [tab, setTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : "info");
  const activeAssignmentId = requestedAssignmentId || createdAssignmentId;

  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const allLabs = assignments.data ?? [];
  const assignment = allLabs.find((item) => item.id === activeAssignmentId);
  const setup = useCourseSetup(workspaceId);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === activeAssignmentId);
  const course = useCourseAuthoring(workspaceId, Boolean(workspace));
  const modules = course.data?.modules ?? [];
  const theoryReady = modules.some(
    (module) =>
      module.items.some((item) => item.type === "THEORY" && item.assignmentId === activeAssignmentId) ||
      (module.items.some((item) => item.assignmentId === activeAssignmentId) &&
        module.items.some((item) => item.type === "THEORY")),
  );
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";

  const navigate = (next: Tab) => {
    setTab(next);
    const query = new URLSearchParams(params?.toString() ?? "");
    if (activeAssignmentId) query.set("assignment", activeAssignmentId);
    query.set("tab", next);
    router.replace(`/lab-authoring?${query.toString()}`);
  };

  const onSaved = (saved: Assignment) => {
    setCreatedAssignmentId(saved.id);
    setTab("theory");
    const query = new URLSearchParams(params?.toString() ?? "");
    query.set("assignment", saved.id);
    query.set("tab", "theory");
    router.replace(`/lab-authoring?${query.toString()}`);
  };

  const activeStep = stepForTab(tab);

  const horizontalSteps: Array<{
    step: HorizontalStep;
    targetTab: Tab;
    title: string;
    subtitle: string;
    icon: LucideIcon;
    done: boolean;
    enabled: boolean;
  }> = [
    {
      step: 1,
      targetTab: assignment ? "theory" : "info",
      title: t(
        `${TAB_LABELS.info.en} & ${TAB_LABELS.theory.en}`,
        "Bước 1: Tên Bài & Lý Thuyết",
      ),
      subtitle: t("Title, goals & Markdown lesson", "Tiêu đề, mục tiêu & bài giảng"),
      icon: BookOpen,
      done: Boolean(assignment && theoryReady),
      enabled: true,
    },
    {
      step: 2,
      targetTab: "source",
      title: t(TAB_LABELS.source.en, "Bước 2: Mã Nguồn & Sơ Đồ C1–C3"),
      subtitle: t("Pinned repository & C1–C3 diagrams", "Repo mẫu & sơ đồ kiến trúc"),
      icon: GitBranch,
      done: Boolean(assignment?.referenceSource?.modelId),
      enabled: Boolean(assignment),
    },
    {
      step: 3,
      targetTab: "quiz",
      title: t(TAB_LABELS.quiz.en, "Bước 3: Câu Hỏi Quiz"),
      subtitle: t("80% Gatekeeper comprehension check", "Câu hỏi trắc nghiệm mở khóa Lab"),
      icon: CircleHelp,
      done: Boolean(setupLab?.quizPublished),
      enabled: Boolean(assignment),
    },
    {
      step: 4,
      targetTab: "studio",
      title: t(
        `${TAB_LABELS.studio.en} & ${TAB_LABELS.publish.en}`,
        "Bước 4: Bài Tập 2D Studio & Xuất Bản",
      ),
      subtitle: t("Topology, playtest & publish to class", "Thực nghiệm 2D & công bố vào lớp"),
      icon: Rocket,
      done: Boolean(setupLab?.published),
      enabled: Boolean(assignment),
    },
  ];

  const header = (
    <header className="space-y-4 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-700 p-5 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-teal-100">
            <Link
              href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`}
              className="inline-flex items-center gap-1 font-medium text-white hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("Back to Class Curriculum", "Quay lại Giáo trình lớp học")}
            </Link>
            <span>·</span>
            <Link
              href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}
              className="hover:text-white hover:underline"
            >
              {t("Back to Lab Library", "Về Kho Lab")}
            </Link>
            <span>·</span>
            <span>{workspace?.name ?? t("Class", "Lớp")}</span>
            {assignment?.referenceSource?.revision ? (
              <>
                <span>·</span>
                <span>
                  {t("Ref rev", "Rev tham chiếu")} {assignment.referenceSource.revision}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {assignment?.title ?? t("Create a new Lesson / Lab", "Tạo Bài Học / Lab Mới")}
            </h1>
            {assignment && (
              <Badge className="border-white/30 bg-white/15 text-white">
                {setupLab?.published ? t("Published", "Đã công bố") : t("Draft", "Bản nháp")}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allLabs.length > 0 && (
            <select
              aria-label={t("Switch Lab", "Chuyển nhanh bài Lab")}
              value={activeAssignmentId}
              onChange={(event) => {
                const nextId = event.target.value;
                if (!nextId) return;
                router.push(
                  `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(nextId)}&tab=info`,
                );
              }}
              className="h-9 max-w-[220px] rounded-lg border border-white/30 bg-white/15 px-2.5 text-xs font-medium text-white backdrop-blur-xs focus:outline-none"
            >
              <option value="" className="text-slate-900">
                {t("Switch Lab…", "Chuyển bài học…")}
              </option>
              {allLabs.map((item) => (
                <option key={item.id} value={item.id} className="text-slate-900">
                  {item.title}
                </option>
              ))}
            </select>
          )}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href={`/assignments/new?workspace=${encodeURIComponent(workspaceId)}`}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {t("New Lab", "+ Tạo Bài Học Mới")}
            </Link>
          </Button>
          {assignment && (
            <Button
              asChild
              size="sm"
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Link
                href={`/lab?${new URLSearchParams({
                  workspace: workspaceId,
                  assignment: assignment.id,
                  step: "1",
                  preview: "1",
                })}`}
              >
                <Eye className="mr-1 size-4" aria-hidden="true" />
                {t("Preview as student", "Xem trước như sinh viên")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );

  if (!workspaceId) {
    return (
      <p className="text-sm text-muted-foreground">{t("Select a class first.", "Hãy chọn lớp trước.")}</p>
    );
  }

  if (!canManage) {
    return (
      <section className="rounded-xl border bg-card p-5" role="alert">
        <p className="font-medium">
          {t("Lab Creation is available to lecturers.", "Chỉ giảng viên được tạo Lab.")}
        </p>
        <Button asChild className="mt-3" size="sm" variant="outline">
          <Link href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
            {t("Open Lab Library", "Mở Kho Lab")}
          </Link>
        </Button>
      </section>
    );
  }

  if (workspaces.isPending || assignments.isPending) return <LoadingState />;
  if (assignments.isError) {
    return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;
  }

  return (
    <RequestState query={workspaces} empty={!workspace}>
      <div className="space-y-5">
        {header}

        {/* Clean 4-Step Horizontal Stepper */}
        <nav
          aria-label={t("Lab creation steps", "Các bước tạo Lab")}
          className="grid gap-3 md:grid-cols-4"
        >
          {horizontalSteps.map((item) => {
            const Icon = item.icon;
            const active = activeStep === item.step;
            return (
              <button
                key={item.step}
                type="button"
                disabled={!item.enabled}
                onClick={() => navigate(item.targetTab)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-teal-500 bg-teal-50/70 shadow-xs ring-1 ring-teal-500/30 dark:bg-teal-950/30"
                    : "bg-card hover:border-teal-300",
                )}
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center">
                  {item.done ? (
                    <CheckCircle2
                      className="size-5 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className={cn("size-5", active ? "text-teal-600" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Icon
                      className={cn("size-3.5 shrink-0", active ? "text-teal-700" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                    <span className="line-clamp-1">{item.title}</span>
                  </div>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{item.subtitle}</p>
                </div>
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 space-y-6">
          {activeStep === 1 && (
            <div className="space-y-6">
              {assignment ? (
                <details
                  open={tab === "info"}
                  className="rounded-2xl border bg-card p-4"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    {t(
                      "Lesson Details & Objectives (Title, Description, Deadline)",
                      "Thông tin Bài học & Mục tiêu (Tiêu đề, Mô tả, Hạn nộp)",
                    )}
                  </summary>
                  <div className="mt-4">
                    <LabInfoForm
                      key={assignment.id}
                      workspaceId={workspaceId}
                      assignment={assignment}
                      onSaved={onSaved}
                    />
                  </div>
                </details>
              ) : (
                <LabInfoForm
                  key="new-lab"
                  workspaceId={workspaceId}
                  assignment={undefined}
                  onSaved={onSaved}
                />
              )}

              {assignment && (
                <LabTheorySection
                  workspaceId={workspaceId}
                  workspaceName={workspace?.name ?? "Course"}
                  assignment={assignment}
                  onNavigate={navigate}
                />
              )}
            </div>
          )}

          {activeStep === 2 && assignment && (
            <LabSourceSection workspaceId={workspaceId} assignment={assignment} />
          )}

          {activeStep === 3 && assignment && (
            <LabQuizSection workspaceId={workspaceId} assignmentId={assignment.id} />
          )}

          {activeStep === 4 && assignment && (
            <div className="space-y-6">
              <LabStudioSection
                workspaceId={workspaceId}
                assignment={assignment}
                onNavigate={navigate}
              />
              <LabPublishSection
                workspaceId={workspaceId}
                assignment={assignment}
                onNavigate={navigate}
              />
            </div>
          )}

          {!assignment && activeStep !== 1 && (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              {t("Save the Lab information first.", "Hãy lưu thông tin Lab trước.")}
            </p>
          )}
        </main>
      </div>
    </RequestState>
  );
}
