"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Container,
  Lock,
  Play,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  PublishCourseLab,
  useAutoConfigureStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStartLabStudioSession,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { PreparedTopologyEditor } from "@/features/runtime/prepared-topology-editor";
import { LiveStudioWorkbench } from "@/features/runtime/live-studio-workbench";
import { StudioExerciseEditor } from "./studio-exercise-editor";
import { type Assignment } from "./requirements";

type ConfigTab = "exercise" | "topology";

export function LabStudioSection({
  workspaceId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignment: Assignment;
  onNavigate: (tab: "source" | "publish") => void;
}) {
  const { t } = useLocale();
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<{ runtimeProjectId: string | null } | null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/studio-exercise`,
        { signal },
      ),
    retry: false,
  });
  const projectId = assignment.referenceSource?.projectId ?? exercise.data?.runtimeProjectId ?? null;
  const readiness = useRuntimeSetupReadiness(projectId);
  const setup = useCourseSetup(workspaceId);
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
  const startStudio = useStartLabStudioSession(workspaceId, assignment.id);
  const runtimeConfig = useApiQuery(
    "runtimeConfiguration",
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const sessions = useApiQuery(
    "runtimeReadSessions",
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const labSessions = useStudentLabStudioSessions(
    workspaceId,
    assignment.id,
    Boolean(projectId),
  );

  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [canvasOpened, setCanvasOpened] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("exercise");

  const availableApplications = readiness.data?.applications?.length
    ? readiness.data.applications
    : (readiness.data?.detectedServices ?? []);
  const readinessBlockers = [
    ...(readiness.data?.runnerIssues ?? []),
    ...(readiness.data?.prerequisites ?? []),
    ...(readiness.data?.warnings ?? []),
  ].filter(Boolean);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const isRuntimeReady = Boolean(
    readiness.data?.configured &&
      readiness.data?.preflightCompatible &&
      readiness.data?.runnerReady,
  );
  const published = setupLab?.published === true;
  const sessionList = [
    ...(labSessions.data ?? []),
    ...(sessions.data ?? []).filter(
      (item) => !(labSessions.data ?? []).some((labItem) => labItem.id === item.id),
    ),
  ];
  const verifiedSession = sessionList.find(
    (session) => session.assignmentId === assignment.id && session.studioVerified,
  );
  const activeSessionId =
    selectedSessionId ||
    sessionList.find((session) => session.assignmentId === assignment.id)?.id ||
    sessionList[0]?.id ||
    "";
  const showStudioCanvas = isRuntimeReady || canvasOpened || sessionList.length > 0;

  const runPrepareRuntime = () => {
    autoStudio.mutate(undefined, {
      onSuccess: () => {
        setCanvasOpened(true);
        void runtimeConfig.refetch();
        void readiness.refetch();
        void setup.refetch();
      },
    });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">{t("Studio Live", "Studio Live")}</h2>
            {isRuntimeReady && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {t("Runtime ready", "Runtime sẵn sàng")}
              </span>
            )}
            {setupLab?.topologyFrozen && (
              <Badge variant="success">{t("Frozen", "Đã khóa")}</Badge>
            )}
          </div>

          {projectId && (
            <div className="flex flex-wrap items-center gap-2">
              {showStudioCanvas && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={autoStudio.isPending}
                  onClick={runPrepareRuntime}
                >
                  <RefreshCw
                    className={`mr-1.5 size-3.5 ${autoStudio.isPending ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {autoStudio.isPending
                    ? t("Syncing…", "Đang đồng bộ…")
                    : t("Sync Docker", "Đồng bộ Docker")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfigModalOpen(true)}
              >
                <SlidersHorizontal className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Exercise & Config", "Bài tập & Cấu hình")}
              </Button>
              {published && (
                <PublishCourseLab
                  workspaceId={workspaceId}
                  assignmentId={assignment.id}
                  position={setupLab?.position}
                  sessionId={verifiedSession?.id}
                />
              )}
            </div>
          )}
        </div>

        {autoStudio.error && <ErrorState error={autoStudio.error} />}
        {startStudio.error && <ErrorState error={startStudio.error} />}

        {!projectId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  "Import a repository with Docker Compose in Step 2 first.",
                  "Hãy nhập kho mã nguồn có Docker Compose ở Bước 2 trước.",
                )}
              </span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("source")}>
              {t("Go to Step 2", "Về Bước 2")}
            </Button>
          </div>
        ) : !showStudioCanvas ? (
          /* Minimal Docker Runtime Preparation Stage */
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl border bg-background text-primary shadow-xs">
              <Container className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {t("Prepare Docker Runtime", "Chuẩn bị Docker Runtime")}
            </h3>

            {availableApplications.length > 0 && (
              <div className="mt-3 flex max-w-xl flex-wrap items-center justify-center gap-1.5">
                {availableApplications.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs text-foreground/85"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            )}

            {readinessBlockers.length > 0 && (
              <div className="mt-4 max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-700 dark:text-amber-300">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("Docker preflight check", "Kiểm tra Docker")}
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {readinessBlockers.slice(0, 4).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Button
                type="button"
                disabled={autoStudio.isPending}
                onClick={runPrepareRuntime}
              >
                <Play className="mr-1.5 size-4" aria-hidden="true" />
                {autoStudio.isPending
                  ? t("Preparing Docker runtime…", "Đang chuẩn bị Docker runtime…")
                  : t("Prepare Runtime & Open Studio", "Chuẩn bị Runtime & Mở Studio")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCanvasOpened(true)}
              >
                {t("Open Studio Canvas", "Mở Studio ngay")}
              </Button>
            </div>
          </div>
        ) : (
          /* Visual Studio Live Workbench — Core Interactive Workspace */
          <div className="space-y-3">
            {verifiedSession && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                <span>
                  {t("Verified Studio session", "Phiên Studio đã xác minh")}:{" "}
                  <code className="font-mono">{verifiedSession.id.slice(0, 12)}</code>
                </span>
                <span>{t("Linked to Lab", "Đã liên kết Lab")}</span>
              </div>
            )}
            <div className="h-[800px] overflow-hidden rounded-xl border border-slate-800">
              <LiveStudioWorkbench
                sessions={sessionList}
                sessionId={activeSessionId}
                projectId={projectId}
                onSelectSession={setSelectedSessionId}
                onStartSession={() =>
                  startStudio.mutate(undefined, {
                    onSuccess: (created) => {
                      if (created?.id) setSelectedSessionId(created.id);
                      void labSessions.refetch();
                    },
                  })
                }
                starting={startStudio.isPending}
                hideSwitchToSandbox
              />
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => onNavigate("publish")}>
          {t("Next", "Tiếp theo")}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Optional Advanced Config Modal (Exercise Prompt & Topology Blocks) */}
      {configModalOpen && projectId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Studio Exercise & Topology Configuration", "Cấu hình Bài tập & Topology Studio")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setConfigModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
              <div className="inline-flex items-center gap-1 rounded-lg bg-muted/40 p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={configTab === "exercise"}
                  onClick={() => setConfigTab("exercise")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    configTab === "exercise"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Exercise Rules", "Kịch bản bài tập")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={configTab === "topology"}
                  onClick={() => setConfigTab("topology")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    configTab === "topology"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Docker Blocks & Wires", "Khối dịch vụ & Kết nối")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Close", "Đóng")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {configTab === "exercise" ? (
                <StudioExerciseEditor
                  workspaceId={workspaceId}
                  assignmentId={assignment.id}
                  labTitle={assignment.title}
                  applications={availableApplications}
                  defaultModelId={assignment.referenceSource?.modelId}
                  referenceSource={assignment.referenceSource}
                  onSaved={() => {
                    void exercise.refetch();
                    void readiness.refetch();
                    void runtimeConfig.refetch();
                    void setup.refetch();
                  }}
                />
              ) : runtimeConfig.data ? (
                <PreparedTopologyEditor
                  projectId={projectId}
                  configuration={runtimeConfig.data}
                  onSaved={() => {
                    void runtimeConfig.refetch();
                    void readiness.refetch();
                    void setup.refetch();
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                  <p>
                    {t(
                      "Docker runtime topology is not initialized yet.",
                      "Topology Docker runtime chưa được khởi tạo.",
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={autoStudio.isPending}
                    onClick={runPrepareRuntime}
                  >
                    {autoStudio.isPending
                      ? t("Preparing…", "Đang chuẩn bị…")
                      : t("Prepare Runtime", "Chuẩn bị Runtime")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
