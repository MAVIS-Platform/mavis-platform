"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { api } from "@/lib/mainflow-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, RequestState } from "@/components/shared/request-state";
import { useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { useCourseAuthoring, useCourseSetup } from "@/features/workspaces/course-access";
import { TheoryLibrary } from "@/features/workspaces/theory-library";
import { Assignments } from "./screens";
import { resolveLabTier, type Assignment } from "./requirements";
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
  const prevRequestedAssignmentIdRef = useRef(requestedAssignmentId);
  useEffect(() => {
    if (prevRequestedAssignmentIdRef.current && !requestedAssignmentId) {
      setCreatedAssignmentId("");
    }
    prevRequestedAssignmentIdRef.current = requestedAssignmentId;
  }, [requestedAssignmentId]);
  const requestedTab = params?.get("tab") ?? params?.get("step") ?? null;
  const activeAssignmentId = requestedAssignmentId || createdAssignmentId;
  const [tab, setTab] = useState<Tab>(
    activeAssignmentId && isTab(requestedTab) ? requestedTab : "info",
  );

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
  const attachedTheory = useQuery({
    queryKey: ["api", "lab-theory-assets", workspaceId, activeAssignmentId],
    queryFn: ({ signal }) =>
      api<Array<{ assetId: string; courseItemId?: string | null }>>(
        `workspaces/${workspaceId}/course-labs/${activeAssignmentId}/theory-assets`,
        { signal },
      ),
    enabled: Boolean(workspaceId && activeAssignmentId && workspace),
    retry: false,
  });
  const theoryReady =
    (attachedTheory.data?.length ?? 0) > 0 ||
    modules.some((module) =>
      module.items.some((item) => item.type === "THEORY" && item.assignmentId === activeAssignmentId),
    );
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const isPublished = Boolean(setupLab?.published || assignment?.labOrder != null);

  useEffect(() => {
    if (!activeAssignmentId) {
      if (tab !== "info") setTab("info");
      return;
    }
    if (isTab(requestedTab) && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [activeAssignmentId, requestedTab, tab]);

  const navigate = (next: Tab) => {
    setTab(next);
    const query = new URLSearchParams(params?.toString() ?? "");
    if (activeAssignmentId) query.set("assignment", activeAssignmentId);
    query.delete("step");
    query.set("tab", next);
    router.replace(`/lab-authoring?${query.toString()}`);
  };

  const onSaved = (saved: Assignment) => {
    const nextTab: Tab = resolveLabTier(saved) === "THEORY_ONLY" ? "theory" : "source";
    setCreatedAssignmentId(saved.id);
    setTab(nextTab);
    const query = new URLSearchParams(params?.toString() ?? "");
    query.set("assignment", saved.id);
    query.delete("step");
    query.set("tab", nextTab);
    router.replace(`/lab-authoring?${query.toString()}`);
  };

  const navItems: Array<{ id: Tab; done: boolean; enabled: boolean; skipped?: boolean }> = [
    { id: "info", done: Boolean(assignment), enabled: true },
    {
      id: "source",
      done: Boolean(assignment?.referenceSource?.modelId),
      enabled: Boolean(assignment),
    },
    { id: "theory", done: theoryReady, enabled: Boolean(assignment) },
    {
      id: "quiz",
      done: Boolean(setupLab?.quizPublished && (setupLab?.quizVersion ?? 0) > 0),
      enabled: Boolean(assignment),
    },
    {
      id: "studio",
      done: Boolean(assignment && (setupLab?.topologyFrozen || setupLab?.studioReady)),
      enabled: Boolean(assignment),
    },
    { id: "publish", done: isPublished, enabled: Boolean(assignment) },
  ];

  if (!workspaceId) {
    return (
      <p className="text-sm text-muted-foreground">{t("Select a class first.", "Hãy chọn lớp trước.")}</p>
    );
  }

  if (workspaces.isPending || assignments.isPending || session.isPending) return <LoadingState />;
  if (assignments.isError) {
    return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;
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
    <div className="min-w-0">
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
          key={assignment.id}
          workspaceId={workspaceId}
          workspaceName={workspace?.name ?? "Course"}
          assignment={assignment}
          onNavigate={navigate}
        />
      )}
      {tab === "source" && assignment && (
        <LabSourceSection
          key={assignment.id}
          workspaceId={workspaceId}
          assignment={assignment}
          onNavigate={navigate}
        />
      )}
      {tab === "quiz" && assignment && (
        <LabQuizSection
          key={assignment.id}
          workspaceId={workspaceId}
          assignmentId={assignment.id}
          assignment={assignment}
          onNavigate={navigate}
        />
      )}
      {tab === "studio" && assignment && (
        <LabStudioSection
          key={assignment.id}
          workspaceId={workspaceId}
          assignment={assignment}
          onNavigate={navigate}
        />
      )}
      {tab === "publish" && assignment && (
        <LabPublishSection
          key={assignment.id}
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
    </div>
  );

  const hubContent = (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-300 bg-card p-3 shadow-sm dark:border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                  className={
                    active
                      ? "px-2.5 text-xs font-semibold whitespace-nowrap"
                      : "px-2.5 text-xs font-semibold whitespace-nowrap text-foreground/80 hover:bg-primary/10 hover:text-primary"
                  }
                  aria-pressed={active}
                  onClick={() => changeSection(item.id)}
                >
                  <Icon className="mr-1.5 size-4" aria-hidden="true" />
                  {t(item.en, item.vi)}
                </Button>
              );
            })}
          </nav>

          {section === "create" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {assignment && (
                <Badge variant={isPublished ? "success" : "secondary"} className="shrink-0 font-semibold whitespace-nowrap">
                  {isPublished ? t("Published", "Đã công bố") : t("Draft", "Bản nháp")}
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
                  className="h-9 w-44 2xl:w-52 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-slate-300 bg-card px-2.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-border"
                >
                  <option value="">
                    {t("Switch Lab…", "Chuyển nhanh bài Lab…")}
                  </option>
                  {allLabs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              )}
              {assignment && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 px-2.5 text-xs whitespace-nowrap"
                  onClick={() => {
                    setCreatedAssignmentId("");
                    setTab("info");
                    router.push(`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&tab=info`);
                  }}
                >
                  <Plus className="mr-1 size-3.5" aria-hidden="true" />
                  {t("New Lab", "Tạo Lab mới")}
                </Button>
              )}
              {assignment && (
                <Button asChild size="sm" variant="outline" className="shrink-0 px-2.5 text-xs whitespace-nowrap">
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
            </div>
          )}
        </div>

        {section === "create" && (
          <nav
            aria-label={t("Lab creation steps", "Các bước tạo Lab")}
            className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5 dark:border-border"
          >
            {navItems.map((item, index) => {
              const meta = TAB_LABELS[item.id];
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.enabled}
                  title={
                    !item.enabled
                      ? t("Save Lab information first", "Hãy lưu thông tin Lab trước")
                      : undefined
                  }
                  onClick={() => navigate(item.id)}
                  aria-current={active ? "step" : undefined}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : !item.enabled
                        ? "border-slate-200 bg-slate-50 text-foreground/65 dark:border-border dark:bg-muted/30"
                        : item.skipped
                          ? "border-slate-200 bg-card text-foreground/75 hover:border-primary/40 hover:text-primary dark:border-border"
                          : "border-slate-300 bg-card text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary dark:border-border"
                  } disabled:cursor-not-allowed`}
                >
                  {item.done ? (
                    <CheckCircle2
                      className={`size-4 shrink-0 ${
                        active ? "text-primary-foreground" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        active
                          ? "bg-white/20 text-primary-foreground"
                          : "bg-slate-200/80 text-foreground dark:bg-muted"
                      }`}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate">
                    {t(meta.en, meta.vi)}
                    {item.skipped && !item.done ? ` (${t("Optional", "Tùy chọn")})` : ""}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
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
