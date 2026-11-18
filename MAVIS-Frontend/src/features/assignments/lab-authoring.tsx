"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Eye,
  FilePlus2,
  GitBranch,
  Info,
  Library,
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
import { TheoryLibrary } from "@/features/workspaces/theory-library";
import { Assignments } from "./screens";
import type { Assignment } from "./requirements";
import { LabInfoForm } from "./lab-info-form";
import { LabTheorySection } from "./lab-theory-section";
import { LabSourceSection } from "./lab-source-section";
import { LabQuizSection } from "./lab-quiz-section";
import { LabStudioSection } from "./lab-studio-section";
import { LabPublishSection } from "./lab-publish-section";

type Tab = "info" | "theory" | "source" | "quiz" | "studio" | "publish";
type LabWorkspaceSection = "create" | "library" | "theory-library";

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
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const selection = useSelection();
  const session = useSession();
  const workspaceId = params?.get("workspace") || selection.workspaceId;
  const requestedSection = params?.get("section");
  const section: LabWorkspaceSection =
    requestedSection === "library"
      ? "library"
      : requestedSection === "theory-library"
        ? "theory-library"
        : pathname === "/assignments"
          ? "library"
          : pathname === "/theory-library"
            ? "theory-library"
            : "create";
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
  const theoryReady =
    Boolean(assignment?.instructions?.trim()) ||
    modules.some(
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
      done: Boolean(assignment && setupLab?.topologyFrozen),
      enabled: Boolean(assignment),
    },
    { id: "publish", done: Boolean(setupLab?.published), enabled: Boolean(assignment) },
  ];

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
            {t("Back to Lab Library", "Về Kho Lab")}
          </Link>
        </Button>
      </section>
    );
  }

  if (workspaces.isPending || assignments.isPending) return <LoadingState />;
  if (assignments.isError) {
    return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;
  }

  const sectionItems: Array<{
    id: LabWorkspaceSection;
    en: string;
    vi: string;
    icon: LucideIcon;
  }> = [
    { id: "create", en: "Lab Creation", vi: "Tạo Lab", icon: FilePlus2 },
    { id: "library", en: "Lab Library", vi: "Thư viện Lab", icon: BookOpen },
    { id: "theory-library", en: "Theory Library", vi: "Thư viện lý thuyết", icon: Library },
  ];
  const changeSection = (next: LabWorkspaceSection) => {
    const query = new URLSearchParams(params?.toString() ?? "");
    query.set("workspace", workspaceId);
    query.set("section", next);
    router.push("/lab-authoring?" + query.toString());
  };

  const content = (
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
          assignment={assignment}
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
  );

  const hubContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-2">
        {section === "create" ? (
          <nav
            aria-label={t("Lab creation steps", "Các bước tạo Lab")}
            className="flex flex-wrap items-center gap-1"
          >
            {navItems.map((item, index) => {
              const meta = TAB_LABELS[item.id];
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.enabled}
                  onClick={() => navigate(item.id)}
                  aria-current={active ? "step" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {item.done ? (
                    <CheckCircle2
                      className={`size-3.5 shrink-0 ${
                        active ? "text-primary-foreground" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                        active ? "border-primary-foreground/60" : "border-current/40"
                      }`}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate">
                    {t(meta.en, meta.vi)}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : (
          <nav
            aria-label={t("Lab workspace", "Không gian Lab")}
            className="flex flex-wrap items-center gap-1.5"
          >
            {sectionItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  aria-pressed={active}
                  onClick={() => changeSection(item.id)}
                >
                  <Icon className="mr-1.5 size-4" aria-hidden="true" />
                  {t(item.en, item.vi)}
                </Button>
              );
            })}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {section === "create" && (
            <>
              {assignment && (
                <Badge variant={setupLab?.published ? "success" : "secondary"}>
                  {setupLab?.published ? t("Published", "Đã công bố") : t("Draft", "Bản nháp")}
                </Badge>
              )}
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
                  className="h-8 max-w-[200px] rounded-md border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">
                    {t("Switch Lab…", "Chuyển bài học…")}
                  </option>
                  {allLabs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreatedAssignmentId("");
                  setTab("info");
                  router.push(`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&tab=info`);
                }}
              >
                <Plus className="mr-1 size-3.5" aria-hidden="true" />
                {t("New Lab", "Tạo Lab mới")}
              </Button>
              {assignment && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/lab?${new URLSearchParams({
                      workspace: workspaceId,
                      assignment: assignment.id,
                      step: "1",
                      preview: "1",
                    })}`}
                  >
                    <Eye className="mr-1 size-3.5" aria-hidden="true" />
                    {t("Preview as student", "Xem trước như sinh viên")}
                  </Link>
                </Button>
              )}
              {sectionItems
                .filter((item) => item.id !== "create")
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => changeSection(item.id)}
                    >
                      <Icon className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t(item.en, item.vi)}
                    </Button>
                  );
                })}
            </>
          )}
        </div>
      </div>
      {section === "create" ? content : section === "library" ? <Assignments embedded /> : <TheoryLibrary />}
    </div>
  );

  return (
    <RequestState query={workspaces} empty={!workspace}>
      {workspace ? (
        <CourseWorkspaceShell workspace={workspace} active="lab-authoring">
          {hubContent}
        </CourseWorkspaceShell>
      ) : (
        hubContent
      )}
    </RequestState>
  );
}
