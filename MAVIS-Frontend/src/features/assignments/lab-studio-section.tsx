"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
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
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  PublishCourseLab,
  useAutoConfigureStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { PreparedTopologyEditor } from "@/features/runtime/prepared-topology-editor";
import {
  buildStudioLiveHref,
  parseStudioTopology,
  type StudioExerciseView,
} from "@/features/runtime/standalone-studio-live";
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
  const router = useRouter();
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<StudioExerciseView | null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/studio-exercise`,
        { signal },
      ),
    retry: false,
  });
  const projectId = assignment.referenceSource?.projectId ?? exercise.data?.runtimeProjectId ?? null;
  const snapshotId =
    assignment.referenceSource?.snapshotId ?? exercise.data?.runtimeSnapshotId ?? undefined;
  const readiness = useRuntimeSetupReadiness(projectId);
  const setup = useCourseSetup(workspaceId);
  const buildImages = useApiMutation("buildRuntimeSandboxImages");
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
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

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("exercise");
  const [prepareStage, setPrepareStage] = useState<"idle" | "building" | "configuring">("idle");
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const previewTopology = useMemo(
    () =>
      parseStudioTopology(runtimeConfig.data?.profile?.["studioTopology"]) ??
      parseStudioTopology(readiness.data?.topology),
    [runtimeConfig.data?.profile, readiness.data?.topology],
  );

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
      readiness.data?.runnerReady &&
      (readiness.data?.runnerIssues?.length ?? 0) === 0,
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
  const studioReadyToLaunch = isRuntimeReady;
  const isPreparing = prepareStage !== "idle" || buildImages.isPending || autoStudio.isPending;

  const returnTo = `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}&tab=studio`;
  const studioLiveHref = buildStudioLiveHref({
    workspaceId,
    assignmentId: assignment.id,
    mode: "author",
    returnTo,
  });

  const stoppedSet = new Set(exercise.data?.initialState?.stoppedServices ?? []);
  const minReplicaMap = new Map(
    (exercise.data?.successCriteria?.minReplicas ?? []).map((item) => [item.service, item.count]),
  );
  const displayServices = previewTopology?.blocks.length
    ? previewTopology.blocks.map((block) => block.service)
    : availableApplications;

  const runPrepareRuntime = async (openAfter: boolean) => {
    if (!projectId || isPreparing) return;
    setPrepareError(null);
    try {
      // Build & pin local Docker images + generate Runner-safe sandboxCompose whenever preflight has unresolved issues or Sync Docker is triggered.
      if (!isRuntimeReady || readinessBlockers.length > 0 || !openAfter) {
        setPrepareStage("building");
        const built = await buildImages.mutateAsync({
          projectId,
          ...(snapshotId ? { snapshotId } : {}),
        });
        if (
          built.errors?.length &&
          Object.keys(built.builtImages ?? {}).length === 0
        ) {
          setPrepareError(built.errors.join("; "));
          return;
        }
      }
      setPrepareStage("configuring");
      await autoStudio.mutateAsync();
      const [, , freshReadiness] = await Promise.all([
        exercise.refetch(),
        runtimeConfig.refetch(),
        readiness.refetch(),
        setup.refetch(),
      ]);
      const readyNow = Boolean(
        freshReadiness.data?.configured &&
          freshReadiness.data?.preflightCompatible &&
          freshReadiness.data?.runnerReady &&
          (freshReadiness.data?.runnerIssues?.length ?? 0) === 0,
      );
      if (openAfter) {
        if (readyNow) {
          router.push(studioLiveHref);
        } else {
          const remaining = freshReadiness.data?.runnerIssues ?? [];
          setPrepareError(
            remaining.length > 0
              ? remaining[0]!
              : t(
                  "Docker runtime still has unresolved Runner requirements. Review the Docker preflight check above and retry Sync Docker.",
                  "Docker runtime vẫn còn yêu cầu Runner chưa được giải quyết. Kiểm tra mục Kiểm tra Docker phía trên rồi bấm Đồng bộ Docker lại.",
                ),
          );
        }
      }
    } catch (err) {
      setPrepareError(
        err instanceof Error
          ? err.message
          : t("Failed to prepare Docker runtime.", "Không thể chuẩn bị Docker runtime."),
      );
    } finally {
      setPrepareStage("idle");
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
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
              {studioReadyToLaunch && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPreparing}
                  onClick={() => void runPrepareRuntime(false)}
                >
                  <RefreshCw
                    className={`mr-1.5 size-3.5 ${isPreparing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {prepareStage === "building"
                    ? t("Building Docker…", "Đang build Docker…")
                    : isPreparing
                      ? t("Syncing…", "Đang đồng bộ…")
                      : t("Sync Docker", "Đồng bộ Docker")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfigTab("exercise");
                  setConfigModalOpen(true);
                }}
              >
                <SlidersHorizontal className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Configure Exercise & Templates", "Cấu hình bài tập & Mẫu sẵn")}
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

        {prepareError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
          >
            {prepareError}
          </div>
        )}
        {!prepareError && buildImages.error && <ErrorState error={buildImages.error} />}
        {!prepareError && !buildImages.error && autoStudio.error && (
          <ErrorState error={autoStudio.error} />
        )}

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
        ) : !studioReadyToLaunch ? (
          /* Minimal 1-Click Docker Runtime Preparation Stage */
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 py-10 text-center">
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
                disabled={isPreparing}
                onClick={() => void runPrepareRuntime(true)}
              >
                <Play className="mr-1.5 size-4" aria-hidden="true" />
                {prepareStage === "building"
                  ? t(
                      "Building & pinning Docker images…",
                      "Đang build & ghim Docker image…",
                    )
                  : isPreparing
                    ? t("Preparing Docker runtime…", "Đang chuẩn bị Docker runtime…")
                    : t("Prepare Runtime & Open Studio", "Chuẩn bị Runtime & Mở Studio")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfigTab("exercise");
                  setConfigModalOpen(true);
                }}
              >
                <SlidersHorizontal className="mr-1.5 size-4" aria-hidden="true" />
                {t("1-Click Exercise Templates", "Chọn mẫu bài tập sẵn")}
              </Button>
            </div>
            <p className="mt-3 max-w-md text-xs text-muted-foreground">
              {exercise.data?.instructions
                ? exercise.data.instructions
                : t(
                    "Pick a 1-Click Exercise Template (Change Impact, Scale-Out, or CPU Throttle) or customize auto-grading rules before running a live test.",
                    "Chọn nhanh mẫu bài tập (Change Impact, Scale-Out, hoặc CPU Throttle) hoặc tùy chỉnh tiêu chí chấm trước khi chạy thử.",
                  )}
            </p>
          </div>
        ) : (
          /* Clean Launchpad to Dedicated Full-Screen Standalone Studio Live */
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-slate-800/80 bg-[#070b12] px-6 py-8 text-slate-100 sm:flex-row">
              <div className="min-w-0 space-y-3 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    {t("Docker stack ready", "Docker stack sẵn sàng")} · {displayServices.length}{" "}
                    {displayServices.length === 1 ? "service" : "services"}
                  </span>
                  {verifiedSession && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 font-mono text-[11px] text-teal-300">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      {t("Verified", "Đã xác minh")} {verifiedSession.id.slice(0, 8)}
                    </span>
                  )}
                </div>

                {displayServices.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                    {displayServices.map((svc) => {
                      const startsDown = stoppedSet.has(svc);
                      const minRep = minReplicaMap.get(svc);
                      return (
                        <span
                          key={svc}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs ${
                            startsDown
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              : "border-slate-700 bg-slate-900 text-slate-200"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${startsDown ? "bg-amber-400" : "bg-emerald-400"}`}
                            aria-hidden="true"
                          />
                          {svc}
                          {startsDown && (
                            <span className="text-[10px] text-amber-300">Down</span>
                          )}
                          {minRep && minRep > 1 && (
                            <span className="rounded bg-sky-500/20 px-1 text-[10px] text-sky-300">
                              ≥{minRep}×
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {exercise.data?.instructions ? (
                  <p className="max-w-2xl truncate text-xs text-slate-300">
                    {exercise.data.instructions}
                  </p>
                ) : (
                  <p className="max-w-2xl text-xs text-amber-300/90">
                    {t(
                      "No exercise instructions configured yet — pick a 1-Click Template (Change Impact, Scale-Out, CPU Throttle) so students have clear goals.",
                      "Chưa thiết lập đề bài thực hành — hãy chọn mẫu bài tập sẵn để sinh viên biết rõ nhiệm vụ cần làm.",
                    )}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
                  onClick={() => {
                    setConfigTab("exercise");
                    setConfigModalOpen(true);
                  }}
                >
                  <SlidersHorizontal className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("Exercise Setup", "Đề bài & Mẫu sẵn")}
                </Button>
                <Button
                  asChild
                  size="lg"
                  className="shrink-0 bg-emerald-600 px-5 text-white hover:bg-emerald-500"
                >
                  <Link href={studioLiveHref}>
                    {t("Open Studio Live", "Mở Studio Live")}
                    <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
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

      {/* Optional Advanced Config Modal (Escape hatch for full form / JSON editing) */}
      {configModalOpen && projectId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(
            "Studio Exercise & Topology Configuration",
            "Cấu hình Bài tập & Topology Studio",
          )}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setConfigModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
              <div
                className="inline-flex items-center gap-1 rounded-lg bg-muted/40 p-1"
                role="tablist"
              >
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
                    disabled={isPreparing}
                    onClick={() => void runPrepareRuntime(false)}
                  >
                    {isPreparing
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
