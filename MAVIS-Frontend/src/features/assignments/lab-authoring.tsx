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

type Tab = "info" | "theory" | "source" | "quiz" | "studio" | "publish";

const TAB_LABELS: Record<Tab, { en: string; vi: string; icon: LucideIcon }> = {
  info: { en: "Lab information", vi: "Thông tin Lab", icon: Info },
  theory: { en: "Theory", vi: "Lý thuyết", icon: BookOpen },
  source: { en: "Reference source", vi: "Nguồn tham chiếu", icon: GitBranch },
  quiz: { en: "Quiz", vi: "Quiz", icon: CircleHelp },
  studio: { en: "Studio Live", vi: "Studio Live", icon: Activity },
  publish: { en: "Check & add to class", vi: "Kiểm tra & thêm vào lớp", icon: Rocket },
};

function isTab(value: string | null): value is Tab {
  return value === "info" || value === "theory" || value === "source" || value === "quiz" || value === "studio" || value === "publish";
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
  const assignment = assignments.data?.find((item) => item.id === activeAssignmentId);
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
    setTab("source");
    const query = new URLSearchParams(params?.toString() ?? "");
    query.set("assignment", saved.id);
    query.set("tab", "source");
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
    <header className="space-y-4 border-b pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link className="hover:text-foreground" href="/workspaces">
              {t("Classes", "Lớp học")}
            </Link>
            <span>/</span>
            <Link className="hover:text-foreground" href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
              {t("Lab Library", "Kho Lab")}
            </Link>
            <span>/</span>
            <span className="text-foreground">{assignment ? t("Lab Creation", "Tạo Lab") : t("Create a Lab", "Tạo Lab")}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {assignment?.title ?? t("Create a new Lab", "Tạo Lab mới")}
            </h1>
            {assignment && (
              <Badge variant={setupLab?.published ? "success" : "secondary"}>
                {setupLab?.published ? t("Published", "Đã công bố") : t("Draft", "Bản nháp")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {workspace?.name ?? t("Class", "Lớp")}
            {assignment?.referenceSource?.revision
              ? ` · ${t("Reference revision", "Revision tham chiếu")} ${assignment.referenceSource.revision}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
              <ArrowLeft className="mr-1 size-4" aria-hidden="true" />
              {t("Back to Lab Library", "Về Kho Lab")}
            </Link>
          </Button>
          {assignment && setupLab?.published && (
            <Button asChild size="sm">
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
    return <p className="text-sm text-muted-foreground">{t("Select a class first.", "Hãy chọn lớp trước.")}</p>;
  }

  if (!canManage) {
    return (
      <section className="rounded-xl border bg-card p-5" role="alert">
        <p className="font-medium">{t("Lab Creation is available to lecturers.", "Chỉ giảng viên được tạo Lab.")}</p>
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
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label={t("Lab creation steps", "Các bước tạo Lab")} className="space-y-1 rounded-xl border bg-card p-3">
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
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
              <LabSourceSection workspaceId={workspaceId} assignment={assignment} />
            )}
            {tab === "quiz" && assignment && (
              <LabQuizSection workspaceId={workspaceId} assignmentId={assignment.id} />
            )}
            {tab === "studio" && assignment && (
              <LabStudioSection workspaceId={workspaceId} assignment={assignment} onNavigate={navigate} />
            )}
            {tab === "publish" && assignment && (
              <LabPublishSection workspaceId={workspaceId} assignment={assignment} onNavigate={navigate} />
            )}
            {!assignment && tab !== "info" && (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                {t("Save the Lab information first.", "Hãy lưu thông tin Lab trước.")}
              </p>
            )}
          </main>
        </div>
      </div>
    </RequestState>
  );
}
