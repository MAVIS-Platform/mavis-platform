"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { Response } from "@/lib/api/contracts";
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
import {
  LiveStudioWorkbench,
  type LiveStudioAuthoringProps,
} from "@/features/runtime/live-studio-workbench";
import { StudioExerciseEditor } from "./studio-exercise-editor";
import { type Assignment } from "./requirements";

type ConfigTab = "exercise" | "topology";
type StudioTopology = NonNullable<Response<"studioState">["topology"]>;

type StudioExerciseView = {
  runtimeProjectId: string | null;
  runtimeModelId: string | null;
  runtimeSnapshotId: string | null;
  baselineRequests: Array<{ method: "GET" | "HEAD"; path: string; expectedStatus: number | null }>;
  initialState: { stoppedServices: string[]; stoppedControllers: string[] };
  allowedActions: string[];
  successCriteria: {
    maxErrorRatePercent: number | null;
    maxP95Ms: number | null;
    requiredTraceEdge: { from: string; to: string } | null;
    minReplicas: Array<{ service: string; count: number }>;
  };
  instructions: string;
  revision: number;
};

function parseTopology(raw: unknown): StudioTopology | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const rawBlocks = Array.isArray(record["blocks"]) ? record["blocks"] : [];
  const rawConnections = Array.isArray(record["connections"]) ? record["connections"] : [];
  const blocks = rawBlocks
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      service: String(item["service"] ?? "").trim(),
      label: String(item["label"] ?? item["service"] ?? "").trim(),
      canScale: item["canScale"] === true,
      initiallyStopped: item["initiallyStopped"] === true,
    }))
    .filter((block) => block.service.length > 0);
  if (blocks.length === 0) return undefined;
  const connections = rawConnections
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      from: String(item["from"] ?? "").trim(),
      to: String(item["to"] ?? "").trim(),
      controllerService: String(item["controllerService"] ?? "").trim(),
      protocol: String(item["protocol"] ?? "HTTP").trim() || "HTTP",
      initiallyStopped: item["initiallyStopped"] === true,
    }))
    .filter((link) => link.from && link.to && link.controllerService);
  return { version: 1, blocks, connections };
}

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
  const cache = useQueryClient();
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
  const readiness = useRuntimeSetupReadiness(projectId);
  const setup = useCourseSetup(workspaceId);
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
  const startStudio = useStartLabStudioSession(workspaceId, assignment.id);
  const saveConfig = useApiMutation("saveRuntimeConfiguration");
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
  const [visualSaved, setVisualSaved] = useState(false);
  const [visualError, setVisualError] = useState("");

  const previewTopology = useMemo(
    () =>
      parseTopology(runtimeConfig.data?.profile?.["studioTopology"]) ??
      parseTopology(readiness.data?.topology),
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
  const showStudioCanvas =
    isRuntimeReady || Boolean(previewTopology) || canvasOpened || sessionList.length > 0;

  const saveVisualExercise = useMutation({
    mutationFn: async (input: {
      stoppedServices?: string[];
      stoppedControllers?: string[];
      instructions?: string;
      baselinePath?: string;
      maxErrorRatePercent?: string;
      minReplicas?: Array<{ service: string; count: number }>;
      nextTopology?: StudioTopology;
    }) => {
      const ref = assignment.referenceSource;
      const runtimeProjectId = ref?.projectId ?? exercise.data?.runtimeProjectId ?? projectId;
      const runtimeModelId = ref?.modelId ?? exercise.data?.runtimeModelId;
      const runtimeSnapshotId = ref?.snapshotId ?? exercise.data?.runtimeSnapshotId;

      if (input.nextTopology && runtimeConfig.data && projectId) {
        await saveConfig.mutateAsync({
          projectId,
          profileId: runtimeConfig.data.profileId,
          snapshotId: runtimeConfig.data.snapshotId ?? undefined,
          modelId: runtimeConfig.data.modelId ?? undefined,
          expectedRevision: runtimeConfig.data.revision,
          profile: {
            ...runtimeConfig.data.profile,
            studioTopology: input.nextTopology,
          },
        });
      }

      if (runtimeProjectId && runtimeModelId && runtimeSnapshotId) {
        const cur = exercise.data;
        const nextBaseline = input.baselinePath?.trim()
          ? [{ method: "GET" as const, path: input.baselinePath.trim(), expectedStatus: 200 }]
          : cur?.baselineRequests?.length
            ? cur.baselineRequests
            : [{ method: "GET" as const, path: "/health", expectedStatus: 200 }];
        const nextMaxErr =
          input.maxErrorRatePercent !== undefined
            ? input.maxErrorRatePercent.trim()
              ? Number(input.maxErrorRatePercent)
              : null
            : (cur?.successCriteria?.maxErrorRatePercent ?? 0);
        await api<StudioExerciseView>(
          `workspaces/${workspaceId}/course-labs/${assignment.id}/studio-exercise`,
          {
            method: "PUT",
            body: JSON.stringify({
              runtimeProjectId,
              runtimeModelId,
              runtimeSnapshotId,
              baselineRequests: nextBaseline,
              initialState: {
                stoppedServices:
                  input.stoppedServices ?? cur?.initialState?.stoppedServices ?? [],
                stoppedControllers:
                  input.stoppedControllers ?? cur?.initialState?.stoppedControllers ?? [],
              },
              allowedActions: cur?.allowedActions?.length
                ? cur.allowedActions
                : ["START", "STOP", "SCALE", "CONNECT", "DISCONNECT"],
              successCriteria: {
                maxErrorRatePercent: nextMaxErr,
                maxP95Ms: cur?.successCriteria?.maxP95Ms ?? null,
                requiredTraceEdge: cur?.successCriteria?.requiredTraceEdge ?? null,
                minReplicas: input.minReplicas ?? cur?.successCriteria?.minReplicas ?? [],
              },
              instructions: (input.instructions ?? cur?.instructions ?? "").trim(),
            }),
          },
        );
      }
    },
    onMutate: () => {
      setVisualError("");
      setVisualSaved(false);
    },
    onSuccess: () => {
      setVisualSaved(true);
      void cache.invalidateQueries({
        queryKey: ["api", "studio-exercise", workspaceId, assignment.id],
      });
      void exercise.refetch();
      void runtimeConfig.refetch();
      void readiness.refetch();
      void setup.refetch();
    },
    onError: (cause) => {
      setVisualError(cause instanceof Error ? cause.message : String(cause));
    },
  });

  const initialStoppedServices = useMemo(() => {
    if (exercise.data?.initialState?.stoppedServices) {
      return exercise.data.initialState.stoppedServices;
    }
    return (previewTopology?.blocks ?? [])
      .filter((b) => b.initiallyStopped)
      .map((b) => b.service);
  }, [exercise.data?.initialState?.stoppedServices, previewTopology]);

  const initialStoppedControllers = useMemo(() => {
    if (exercise.data?.initialState?.stoppedControllers) {
      return exercise.data.initialState.stoppedControllers;
    }
    return (previewTopology?.connections ?? [])
      .filter((c) => c.initiallyStopped)
      .map((c) => c.controllerService);
  }, [exercise.data?.initialState?.stoppedControllers, previewTopology]);

  const scalableServices = useMemo(
    () => (previewTopology?.blocks ?? []).filter((b) => b.canScale).map((b) => b.service),
    [previewTopology],
  );

  const authoringProps: LiveStudioAuthoringProps | undefined = projectId
    ? {
        initialStoppedServices,
        initialStoppedControllers,
        scalableServices,
        instructions: exercise.data?.instructions ?? "",
        baselinePath: exercise.data?.baselineRequests?.[0]?.path ?? "/health",
        maxErrorRatePercent:
          exercise.data?.successCriteria?.maxErrorRatePercent == null
            ? "0"
            : String(exercise.data.successCriteria.maxErrorRatePercent),
        replicaService: exercise.data?.successCriteria?.minReplicas?.[0]?.service ?? "",
        replicaCount:
          exercise.data?.successCriteria?.minReplicas?.[0]?.count == null
            ? ""
            : String(exercise.data.successCriteria.minReplicas[0].count),
        busy: saveVisualExercise.isPending || saveConfig.isPending,
        saving: saveVisualExercise.isPending || saveConfig.isPending,
        saved: visualSaved,
        error: visualError || undefined,
        onToggleInitialStopped: (service, isController) => {
          const nextStoppedServices = isController
            ? initialStoppedServices
            : initialStoppedServices.includes(service)
              ? initialStoppedServices.filter((s) => s !== service)
              : [...initialStoppedServices, service];
          const nextStoppedControllers = isController
            ? initialStoppedControllers.includes(service)
              ? initialStoppedControllers.filter((c) => c !== service)
              : [...initialStoppedControllers, service]
            : initialStoppedControllers;
          const nextTopology = previewTopology
            ? {
                ...previewTopology,
                blocks: previewTopology.blocks.map((b) => ({
                  ...b,
                  initiallyStopped: nextStoppedServices.includes(b.service),
                })),
                connections: previewTopology.connections.map((c) => ({
                  ...c,
                  initiallyStopped: nextStoppedControllers.includes(c.controllerService),
                })),
              }
            : undefined;
          saveVisualExercise.mutate({
            stoppedServices: nextStoppedServices,
            stoppedControllers: nextStoppedControllers,
            ...(nextTopology ? { nextTopology } : {}),
          });
        },
        onToggleScalable: (service) => {
          if (!previewTopology) return;
          const nextTopology: StudioTopology = {
            ...previewTopology,
            blocks: previewTopology.blocks.map((b) =>
              b.service === service ? { ...b, canScale: !b.canScale } : b,
            ),
          };
          saveVisualExercise.mutate({ nextTopology });
        },
        onSaveMission: (patch) => {
          const minReplicas =
            patch.replicaService && Number(patch.replicaCount) >= 1
              ? [{ service: patch.replicaService, count: Number(patch.replicaCount) }]
              : [];
          saveVisualExercise.mutate({
            instructions: patch.instructions,
            baselinePath: patch.baselinePath,
            maxErrorRatePercent: patch.maxErrorRatePercent,
            minReplicas,
          });
        },
        onCaptureCanvasState: (captured) => {
          const nextTopology = previewTopology
            ? {
                ...previewTopology,
                blocks: previewTopology.blocks.map((b) => ({
                  ...b,
                  initiallyStopped: captured.stoppedServices.includes(b.service),
                })),
                connections: previewTopology.connections.map((c) => ({
                  ...c,
                  initiallyStopped: captured.stoppedControllers.includes(c.controllerService),
                })),
              }
            : undefined;
          saveVisualExercise.mutate({
            stoppedServices: captured.stoppedServices,
            stoppedControllers: captured.stoppedControllers,
            minReplicas: captured.minReplicas,
            ...(nextTopology ? { nextTopology } : {}),
          });
        },
      }
    : undefined;

  const runPrepareRuntime = () => {
    autoStudio.mutate(undefined, {
      onSuccess: () => {
        setCanvasOpened(true);
        void exercise.refetch();
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
                {t("Advanced Config", "Cấu hình nâng cao")}
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
          /* Minimal 1-Click Docker Runtime Preparation Stage */
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

            <div className="mt-6">
              <Button type="button" disabled={autoStudio.isPending} onClick={runPrepareRuntime}>
                <Play className="mr-1.5 size-4" aria-hidden="true" />
                {autoStudio.isPending
                  ? t("Preparing Docker runtime…", "Đang chuẩn bị Docker runtime…")
                  : t("Prepare Runtime & Open Studio", "Chuẩn bị Runtime & Mở Studio")}
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
            <div className="h-[820px] overflow-hidden rounded-xl border border-slate-800">
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
                previewTopology={previewTopology}
                authoring={authoringProps}
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

      {/* Optional Advanced Config Modal (Escape hatch for full form / JSON editing) */}
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
