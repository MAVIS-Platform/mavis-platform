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
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { useCourseAuthoring, useCourseSetup } from "@/features/workspaces/course-access";
import type { Assignment } from "./requirements";
import { LabInfoForm } from "./lab-info-form";
import { LabTheorySection } from "./lab-theory-section";
import { LabSourceSection } from "./lab-source-section";
import { LabQuizSection } from "./lab-quiz-section";
import { LabStudioSection } from "./lab-studio-section";
import { LabPublishSection } from "./lab-publish-section";

type Tab = "info" | "theory" | "source" | "quiz" | "studio" | "publish";

const TAB_LABELS: Record<Tab, { en: string; vi: string; icon: LucideIcon }> = {
  info: { en: "Lab information", vi: "Thông tin Lab", icon: Info },
  theory: { en: "Lab theory", vi: "Lý thuyết Lab", icon: BookOpen },
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

  const navItems: Array<{ id: Tab; done: boolean; enabled: boolean }> = [
    { id: "info", done: Boolean(assignment), enabled: true },
    { id: "theory", done: theoryReady, enabled: Boolean(assignment) },
    { id: "source", done: Boolean(assignment?.referenceSource?.modelId), enabled: Boolean(assignment) },
    { id: "quiz", done: Boolean(setupLab?.quizPublished), enabled: Boolean(assignment) },
    {
      id: "studio",
      done: !assignment?.requireRuntimeTrace || Boolean(setupLab?.topologyFrozen),
      enabled: Boolean(assignment),
    },
    { id: "publish", done: Boolean(setupLab?.published), enabled: Boolean(assignment) },
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
            type="button"
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => {
              setCreatedAssignmentId("");
              setTab("info");
              router.push(`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&tab=info`);
            }}
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t("New Lab", "+ Tạo Bài Học Mới")}
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

  const content = (
    <div className="space-y-5">
      {header}
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          aria-label={t("Lab creation steps", "Các bước tạo Lab")}
          className="space-y-1 rounded-xl border bg-card p-3 h-fit"
        >
          {navItems.map((item, index) => {
            const meta = TAB_LABELS[item.id];
            const Icon = meta.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => navigate(item.id)}
                aria-current={active ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  {item.done ? (
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4" aria-hidden="true" />
                  )}
                </span>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  {index + 1}. {t(meta.en, meta.vi)}
                </span>
              </button>
            );
          })}
          <p className="mt-2 border-t px-2 pt-3 text-xs leading-5 text-muted-foreground">
            {t(
              "Saving a step does not publish it. Publishing and freezing remain explicit actions.",
              "Lưu một bước không tự công bố. Công bố và đóng băng vẫn là thao tác riêng.",
            )}
          </p>
        </nav>

        <main className="min-w-0">
          {tab === "info" && (
            <LabInfoForm
              key={assignment?.id ?? "new-lab"}
              workspaceId={workspaceId}
              assignment={assignment}
              onSaved={onSaved}
            />
          )}
          {tab === "theory" && assignment && (
            <LabTheorySection
              workspaceId={workspaceId}
              workspaceName={workspace?.name ?? "Course"}
              assignment={assignment}
              onNavigate={navigate}
            />
          )}
          {tab === "source" && assignment && (
            <LabSourceSection
              workspaceId={workspaceId}
              assignment={assignment}
              onNavigate={navigate}
            />
          )}
          {tab === "quiz" && assignment && (
            <LabQuizSection
              workspaceId={workspaceId}
              assignmentId={assignment.id}
              onNavigate={navigate}
            />
          )}
          {tab === "studio" && assignment && (
            <LabStudioSection
              workspaceId={workspaceId}
              assignment={assignment}
              onNavigate={navigate}
            />
          )}
          {tab === "publish" && assignment && (
            <LabPublishSection
              workspaceId={workspaceId}
              assignment={assignment}
              onNavigate={navigate}
            />
          )}
          {!assignment && tab !== "info" && (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              {t("Save the Lab information first.", "Hãy lưu thông tin Lab trước.")}
            </p>
          )}
        </main>
      </div>
    </div>
  );

  return (
    <RequestState query={workspaces} empty={!workspace}>
      {workspace ? (
        <CourseWorkspaceShell workspace={workspace} active="lab-authoring">
          {content}
        </CourseWorkspaceShell>
      ) : (
        content
      )}
    </RequestState>
  );
}
