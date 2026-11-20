"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Container,
  Lock,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/shared/request-state";
import { RequireSession } from "@/features/auth/access";
import { useApi, useApiQuery, useSession } from "@/hooks/use-api";
import type { Response } from "@/lib/api/contracts";
import { ApiError } from "@/lib/errors/api-error";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  PublishCourseLab,
  useAutoConfigureStudio,
  useBootstrapLabStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStartLabStudioSession,
  useStudentLabContext,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { StudioExerciseEditor } from "@/features/assignments/studio-exercise-editor";
import { PreparedTopologyEditor } from "./prepared-topology-editor";
import { LiveStudioWorkbench, type LiveStudioAuthoringProps } from "./live-studio-workbench";

type ConfigTab = "exercise" | "topology";
export type StudioTopology = NonNullable<Response<"studioState">["topology"]>;

export type StudioExerciseView = {
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

export function parseStudioTopology(raw: unknown): StudioTopology | undefined {
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

export function buildStudioLiveHref({
  workspaceId,
  assignmentId,
  mode,
  returnTo,
  sessionId,
}: {
  workspaceId: string;
  assignmentId: string;
  mode: "author" | "student";
  returnTo?: string | undefined;
  sessionId?: string | undefined;
}) {
  const query = new URLSearchParams({
    workspace: workspaceId,
    assignment: assignmentId,
    mode,
  });
  if (returnTo) query.set("returnTo", returnTo);
  if (sessionId) query.set("session", sessionId);
  return `/studio-live?${query.toString()}`;
}

function safeRelativeHref(raw: string | null, fallback: string) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

function StandaloneStudioContent() {
  const { t } = useLocale();
  const params = useSearchParams();
  const client = useApi();
  const cache = useQueryClient();
  const session = useSession();

  const workspaceId = params?.get("workspace") ?? "";
  const assignmentId = params?.get("assignment") ?? "";
  const requestedMode = params?.get("mode");
  const initialSessionParam = params?.get("session") ?? "";

  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const isAuthorMode = Boolean(canManage && requestedMode !== "student");

  const defaultReturnTo = isAuthorMode
    ? workspaceId && assignmentId
      ? `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&tab=studio`
      : "/workspaces"
    : workspaceId && assignmentId
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=4`
      : "/courses";
  const returnHref = safeRelativeHref(params?.get("returnTo") ?? null, defaultReturnTo);
  const publishHref =
    workspaceId && assignmentId
      ? `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&tab=publish`
      : returnHref;
  const submitHref =
    workspaceId && assignmentId
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=4#lab-submit`
      : returnHref;

  // Lecturer / Author data
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId && isAuthorMode) },
  );
  const assignment = assignments.data?.find((item) => item.id === assignmentId);
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
    queryFn: ({ signal }) =>
      api<StudioExerciseView | null>(
        `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
        { signal },
      ),
    enabled: Boolean(workspaceId && assignmentId && isAuthorMode),
    retry: false,
  });
const TRANSIENT_RUNTIME_PROFILE_KEYS = new Set([
  "detectedServices",
  "composeServices",
  "servicePorts",
  "serviceStacks",
  "detectedEndpoints",
  "databaseChecks",
  "requiredEnvVars",
  "runnerIssues",
  "infrastructureServices",
  "serviceHealthPaths",
  "serviceHealthConfidence",
  "serviceHealthReasons",
  "sandboxComposeYaml",
  "sandboxComposeChanges",
  "unresolvableRunnerIssues",
  "recommendedServiceMappings",
  "modelServiceNames",
  "localImageBuildAvailable",
  "configuredSecretKeys",
]);

function stripTransientRuntimeProfile(profile: Record<string, unknown> | undefined) {
  if (!profile) return {};
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => !TRANSIENT_RUNTIME_PROFILE_KEYS.has(key)),
  );
}

  const setup = useCourseSetup(isAuthorMode ? workspaceId : "");
  const autoStudio = useAutoConfigureStudio(workspaceId, assignmentId);

  // Student data
  const studentContext = useStudentLabContext(
    workspaceId,
    assignmentId,
    Boolean(workspaceId && assignmentId && !isAuthorMode),
  );

  // Shared Lab Studio sessions & mutations
  const startStudio = useStartLabStudioSession(workspaceId, assignmentId);
  const bootstrapStudio = useBootstrapLabStudio(workspaceId, assignmentId);
  const labSessions = useStudentLabStudioSessions(
    workspaceId,
    assignmentId,
    Boolean(workspaceId && assignmentId),
  );

  const projectId = isAuthorMode
    ? (assignment?.referenceSource?.projectId ?? exercise.data?.runtimeProjectId ?? null)
    : (studentContext.data?.assignment?.referenceSource?.projectId ??
        studentContext.data?.referenceArchitecture?.projectId ??
        null);

  const readiness = useRuntimeSetupReadiness(isAuthorMode ? projectId : null);
  const runtimeConfig = useApiQuery(
    "runtimeConfiguration",
    { projectId: projectId ?? "" },
    { enabled: Boolean(isAuthorMode && projectId) },
  );
  const projectSessions = useApiQuery(
    "runtimeReadSessions",
    { projectId: projectId ?? "" },
    { enabled: Boolean(isAuthorMode && projectId) },
  );

  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionParam);
  const [canvasOpened, setCanvasOpened] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("exercise");
  const [visualSaved, setVisualSaved] = useState(false);
  const [visualError, setVisualError] = useState("");
  const [showStudentMission, setShowStudentMission] = useState(true);
  const autoStartedRef = useRef(false);

  const previewTopology = useMemo(
    () =>
      isAuthorMode
        ? (parseStudioTopology(runtimeConfig.data?.profile?.["studioTopology"]) ??
          parseStudioTopology(readiness.data?.topology))
        : undefined,
    [isAuthorMode, runtimeConfig.data?.profile, readiness.data?.topology],
  );
  const previewModelId =
    runtimeConfig.data?.modelId ??
    assignment?.referenceSource?.modelId ??
    exercise.data?.runtimeModelId ??
    studentContext.data?.assignment?.referenceSource?.modelId ??
    undefined;
  const previewServiceMappings = useMemo(() => {
    const raw = runtimeConfig.data?.profile?.["serviceMappings"];
    if (!raw || typeof raw !== "object") return undefined;
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }, [runtimeConfig.data?.profile]);

  const availableApplications = readiness.data?.applications?.length
    ? readiness.data.applications
    : (readiness.data?.detectedServices ?? []);
  // PreparedStudioTopology only accepts services registered under profile.applications
  // (infra containers like sandbox-postgres / sandbox-kafka run automatically and are rejected with HTTP 400).
  const composePoolServices = useMemo(() => {
    const profileApps =
      runtimeConfig.data?.profile?.["applications"] &&
      typeof runtimeConfig.data.profile["applications"] === "object"
        ? Object.keys(runtimeConfig.data.profile["applications"] as Record<string, unknown>)
        : [];
    const allowed = profileApps.length > 0 ? profileApps : (readiness.data?.applications ?? []);
    return Array.from(new Set(allowed.filter(Boolean)));
  }, [readiness.data?.applications, runtimeConfig.data?.profile]);
  const readinessBlockers = [
    ...(readiness.data?.runnerIssues ?? []),
    ...(readiness.data?.prerequisites ?? []),
    ...(readiness.data?.warnings ?? []),
  ].filter(Boolean);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignmentId);
  const isRuntimeReady = Boolean(
    readiness.data?.configured &&
      readiness.data?.preflightCompatible &&
      readiness.data?.runnerReady,
  );
  const published = setupLab?.published === true;

  const sessionList = useMemo(() => {
    const primary = isAuthorMode
      ? (labSessions.data ?? [])
      : (labSessions.data ?? studentContext.data?.studioSessions ?? []);
    if (!isAuthorMode) return primary;
    return [
      ...primary,
      ...(projectSessions.data ?? []).filter(
        (item) => !primary.some((labItem) => labItem.id === item.id),
      ),
    ];
  }, [isAuthorMode, labSessions.data, studentContext.data?.studioSessions, projectSessions.data]);

  const verifiedSession = sessionList.find(
    (item) => item.assignmentId === assignmentId && item.studioVerified,
  );
  const activeSessionId = useMemo(() => {
    if (selectedSessionId && sessionList.some((item) => item.id === selectedSessionId)) {
      return selectedSessionId;
    }
    const activeStatuses = new Set([
      "RUNNING",
      "PENDING",
      "STARTING",
      "QUEUED",
      "PROVISIONING",
      "READY_FOR_DISPATCH",
      "READY_FOR_EXECUTION",
      "ALLOCATED",
      "DISPATCHED",
    ]);
    const liveOrBooting = sessionList.find(
      (item) => item.executionStatus && activeStatuses.has(item.executionStatus.toUpperCase()),
    );
    if (liveOrBooting) return liveOrBooting.id;
    // In Author mode, fall back to clean Design Preview instead of locking onto a dead cancelled session
    if (isAuthorMode) return "";
    const forAssignment = sessionList.find((item) => item.assignmentId === assignmentId);
    return forAssignment?.id ?? sessionList[0]?.id ?? "";
  }, [selectedSessionId, sessionList, assignmentId, isAuthorMode]);

  const studentQuizLocked = Boolean(
    !isAuthorMode &&
      studentContext.data?.quiz &&
      !studentContext.data.quiz.runtimeUnlocked &&
      studentContext.data.assignment?.labMode !== "THEORY_ONLY",
  );

  const studioStateQuery = useApiQuery(
    "studioState",
    { sessionId: activeSessionId },
    {
      enabled:
        client.mode === "backend" &&
        !isAuthorMode &&
        !studentQuizLocked &&
        Boolean(activeSessionId),
      poll: !isAuthorMode && Boolean(activeSessionId),
    },
  );

  const liveStudioVerified =
    Boolean(verifiedSession) ||
    Boolean(
      studioStateQuery.data?.receiptDigest || studioStateQuery.data?.executionStatus === "COMPLETED",
    );

  const needsSandboxBootstrap = Boolean(
    !isAuthorMode &&
      activeSessionId &&
      studioStateQuery.isSuccess &&
      (studioStateQuery.data.executionStatus === "FAILED" ||
        (studioStateQuery.data.services.length === 0 &&
          !studioStateQuery.data.telemetry &&
          !(studioStateQuery.data as Record<string, unknown>)["simulatedSandbox"])),
  );

  // Auto-start a student Studio session once when entering standalone /studio-live with no sessions yet.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (
      client.mode !== "backend" ||
      isAuthorMode ||
      studentQuizLocked ||
      !workspaceId ||
      !assignmentId ||
      labSessions.isPending ||
      studentContext.isPending ||
      liveStudioVerified ||
      sessionList.length > 0 ||
      activeSessionId
    ) {
      return;
    }
    autoStartedRef.current = true;
    startStudio.mutate(undefined, {
      onSuccess: (created) => {
        if (created?.id) setSelectedSessionId(created.id);
      },
    });
  }, [
    client.mode,
    isAuthorMode,
    studentQuizLocked,
    workspaceId,
    assignmentId,
    labSessions.isPending,
    studentContext.isPending,
    liveStudioVerified,
    sessionList.length,
    activeSessionId,
    startStudio,
  ]);

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
      const ref = assignment?.referenceSource;
      const runtimeProjectId = ref?.projectId ?? exercise.data?.runtimeProjectId ?? projectId;
      const runtimeModelId = ref?.modelId ?? exercise.data?.runtimeModelId;
      const runtimeSnapshotId = ref?.snapshotId ?? exercise.data?.runtimeSnapshotId;

      if (input.nextTopology && projectId) {
        // Guard against stale React Query cache right after Prepare Runtime (modelId null / rev 0)
        const cfg =
          runtimeConfig.data?.configured &&
          runtimeConfig.data.modelId &&
          runtimeConfig.data.snapshotId
            ? runtimeConfig.data
            : ((await runtimeConfig.refetch()).data ?? runtimeConfig.data);
        const saveTopologyOnce = async (latestCfg: typeof cfg) => {
          const targetSnapshotId = latestCfg?.snapshotId ?? runtimeSnapshotId ?? undefined;
          const targetModelId = latestCfg?.modelId ?? runtimeModelId ?? undefined;
          if (!latestCfg || !targetSnapshotId || !targetModelId) return;
          const savedCfg = await client.execute("saveRuntimeConfiguration", {
            projectId,
            profileId: latestCfg.profileId,
            snapshotId: targetSnapshotId,
            modelId: targetModelId,
            expectedRevision: latestCfg.revision,
            profile: {
              ...stripTransientRuntimeProfile(latestCfg.profile),
              studioTopology: input.nextTopology,
            },
          });
          cache.setQueryData(["api", "runtimeConfiguration", { projectId }], savedCfg);
        };
        try {
          await saveTopologyOnce(cfg);
        } catch (cause) {
          // Auto-recover 409 revision conflict once by fetching latest runtimeConfiguration
          const isConflict =
            (cause instanceof ApiError && cause.status === 409) ||
            (cause instanceof Error && /version has changed|conflict|409/i.test(cause.message));
          if (isConflict) {
            const fresh = (await runtimeConfig.refetch()).data;
            await saveTopologyOnce(fresh);
          } else {
            throw cause;
          }
        }
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
          `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
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
        queryKey: ["api", "studio-exercise", workspaceId, assignmentId],
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

  const isStatefulService = (name: string) =>
    /postgres|mysql|mariadb|mongo|redis|kafka|rabbit|zookeeper|elastic|minio|db\b/.test(
      name.toLowerCase(),
    );

  const authoringProps: LiveStudioAuthoringProps | undefined =
    isAuthorMode && projectId
      ? {
          initialStoppedServices,
          initialStoppedControllers,
          scalableServices,
          availableServices: composePoolServices,
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
          busy: saveVisualExercise.isPending,
          saving: saveVisualExercise.isPending,
          saved: visualSaved,
          error: visualError || undefined,
          onClearError: () => setVisualError(""),
          hasVerifiedSession: Boolean(verifiedSession),
          publishHref,
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
          onAddBlock: (service) => {
            const baseBlocks = previewTopology?.blocks ?? [];
            if (baseBlocks.some((b) => b.service === service)) return;
            const nextTopology: StudioTopology = {
              version: 1,
              blocks: [
                ...baseBlocks,
                {
                  service,
                  label: service,
                  canScale: !isStatefulService(service),
                  initiallyStopped: false,
                },
              ],
              connections: previewTopology?.connections ?? [],
            };
            saveVisualExercise.mutate({ nextTopology });
          },
          onRemoveBlock: (service) => {
            if (!previewTopology || previewTopology.blocks.length <= 1) return;
            const nextBlocks = previewTopology.blocks.filter((b) => b.service !== service);
            const nextConnections = previewTopology.connections.filter(
              (c) => c.from !== service && c.to !== service,
            );
            const nextStopped = initialStoppedServices.filter((s) => s !== service);
            const nextTopology: StudioTopology = {
              version: 1,
              blocks: nextBlocks,
              connections: nextConnections,
            };
            saveVisualExercise.mutate({
              stoppedServices: nextStopped,
              nextTopology,
            });
          },
          onSetReplicaTarget: (service, count) => {
            const clamped = Math.max(1, Math.min(8, Math.round(count)));
            const nextTopology = previewTopology
              ? {
                  ...previewTopology,
                  blocks: previewTopology.blocks.map((b) =>
                    b.service === service ? { ...b, canScale: true } : b,
                  ),
                }
              : undefined;
            saveVisualExercise.mutate({
              minReplicas: [{ service, count: clamped }],
              ...(nextTopology ? { nextTopology } : {}),
            });
          },
          onApplyPreset: (preset) => {
            const currentBlocks = previewTopology?.blocks ?? [];
            if (currentBlocks.length === 0) return;
            const stateless = currentBlocks.filter(
              (b) => !isStatefulService(b.service) && !/gateway|edge|proxy/i.test(b.service),
            );
            const primaryScale =
              stateless[0]?.service ??
              currentBlocks.find((b) => !isStatefulService(b.service))?.service ??
              currentBlocks[0]!.service;
            const faultTarget =
              stateless[1]?.service ??
              stateless[0]?.service ??
              currentBlocks[currentBlocks.length - 1]!.service;

            if (preset === "healthy") {
              const nextTopology: StudioTopology = {
                version: 1,
                blocks: currentBlocks.map((b) => ({ ...b, initiallyStopped: false })),
                connections: (previewTopology?.connections ?? []).map((c) => ({
                  ...c,
                  initiallyStopped: false,
                })),
              };
              saveVisualExercise.mutate({
                stoppedServices: [],
                stoppedControllers: [],
                minReplicas: [],
                instructions: `Verify all ${currentBlocks.length} services run cleanly and capture baseline telemetry evidence.`,
                maxErrorRatePercent: "0",
                nextTopology,
              });
              return;
            }

            if (preset === "outage") {
              const nextTopology: StudioTopology = {
                version: 1,
                blocks: currentBlocks.map((b) => ({
                  ...b,
                  initiallyStopped: b.service === faultTarget,
                })),
                connections: previewTopology?.connections ?? [],
              };
              saveVisualExercise.mutate({
                stoppedServices: [faultTarget],
                minReplicas: [],
                maxErrorRatePercent: "0",
                instructions: `Diagnose the stopped ${faultTarget} container, recover it via Start, and capture Before/After evidence proving 0% error rate.`,
                nextTopology,
              });
              return;
            }

            if (preset === "scale") {
              const nextTopology: StudioTopology = {
                version: 1,
                blocks: currentBlocks.map((b) => ({
                  ...b,
                  initiallyStopped: false,
                  canScale: b.service === primaryScale ? true : b.canScale,
                })),
                connections: previewTopology?.connections ?? [],
              };
              saveVisualExercise.mutate({
                stoppedServices: [],
                minReplicas: [{ service: primaryScale, count: 2 }],
                maxErrorRatePercent: "0",
                instructions: `Capture baseline metrics, scale ${primaryScale} to 2 replicas, and compare p95 latency and throughput Before vs After.`,
                nextTopology,
              });
              return;
            }

            // chaos-scale
            const nextTopology: StudioTopology = {
              version: 1,
              blocks: currentBlocks.map((b) => ({
                ...b,
                initiallyStopped: b.service === faultTarget,
                canScale: b.service === primaryScale ? true : b.canScale,
              })),
              connections: previewTopology?.connections ?? [],
            };
            saveVisualExercise.mutate({
              stoppedServices: [faultTarget],
              minReplicas: [{ service: primaryScale, count: 2 }],
              maxErrorRatePercent: "0",
              instructions: `Recover ${faultTarget}, scale ${primaryScale} to 2 replicas, and capture Before/After snapshots with 0% errors.`,
              nextTopology,
            });
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

  const labTitle =
    (isAuthorMode ? assignment?.title : studentContext.data?.assignment?.title) ?? "";
  const studentExercise = !isAuthorMode ? studentContext.data?.studioExercise : null;
  const showAuthorCanvas =
    isRuntimeReady || Boolean(previewTopology) || canvasOpened || sessionList.length > 0;
  const isInitialLoading =
    workspaces.isPending ||
    (isAuthorMode ? assignments.isPending : studentContext.isPending);

  const isWorkbenchActive =
    Boolean(workspaceId && assignmentId) &&
    !isInitialLoading &&
    !studentQuizLocked &&
    !(isAuthorMode && !projectId) &&
    !(isAuthorMode && !showAuthorCanvas);

  const headerLeft = (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={returnHref}
        aria-label={isAuthorMode ? t("Back to Lab Setup", "Về thiết lập Lab") : t("Back to Lab", "Về bài Lab")}
        title={isAuthorMode ? t("Back to Lab Setup", "Về thiết lập Lab") : t("Back to Lab", "Về bài Lab")}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{t("Back", "Quay lại")}</span>
      </Link>

      <div className="flex min-w-0 items-center gap-1.5" title={labTitle || undefined}>
        <Activity className="size-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        <span className="shrink-0 text-xs font-semibold tracking-tight text-white">
          Studio Live
        </span>
      </div>

      {isAuthorMode && setupLab?.topologyFrozen && (
        <Badge variant="success" className="hidden md:inline-flex">
          {t("Frozen", "Đã khóa")}
        </Badge>
      )}
      {!isAuthorMode && liveStudioVerified && (
        <span className="hidden items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 md:inline-flex">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          {t("Sealed", "Đã đóng gói")}
        </span>
      )}
    </div>
  );

  const headerRight = (
    <div className="flex shrink-0 items-center gap-1.5">
      {isAuthorMode && projectId && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t("Advanced Config", "Cấu hình nâng cao")}
            title={t("Advanced Config & Sync Docker", "Cấu hình nâng cao & Đồng bộ Docker")}
            onClick={() => setConfigModalOpen(true)}
            className="h-7 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          </Button>
          {published && assignmentId && (
            <PublishCourseLab
              workspaceId={workspaceId}
              assignmentId={assignmentId}
              position={setupLab?.position}
              sessionId={verifiedSession?.id}
            />
          )}
          <Button
            asChild
            size="sm"
            className="h-7 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-500"
          >
            <Link href={publishHref}>
              {t("Done · Step 6", "Xong · Bước 6")}
              <ArrowRight className="ml-1 size-3" aria-hidden="true" />
            </Link>
          </Button>
        </>
      )}

      {!isAuthorMode && !studentQuizLocked && (
        <>
          {studentExercise && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowStudentMission((v) => !v)}
              className={`h-7 px-2 text-[11px] ${
                showStudentMission
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Target className="mr-1 size-3" aria-hidden="true" />
              {t("Mission", "Đề bài")}
            </Button>
          )}
          {needsSandboxBootstrap && activeSessionId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bootstrapStudio.isPending}
              onClick={() => bootstrapStudio.mutate(activeSessionId)}
              className="h-7 border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-200 hover:bg-amber-500/20"
            >
              {bootstrapStudio.isPending
                ? t("Activating Sandbox…", "Đang kích hoạt Sandbox…")
                : t("Activate Simulated Sandbox Telemetry", "Kích hoạt Sandbox Telemetry")}
            </Button>
          )}
          {liveStudioVerified && (
            <Button
              asChild
              size="sm"
              className="h-7 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-500"
            >
              <Link href={submitHref}>
                {t("Submit Lab", "Nộp bài Lab")}
                <ArrowRight className="ml-1 size-3" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-svh w-screen flex-col overflow-hidden bg-[#070b12] text-slate-100">
      {/* Fallback App Bar only on loading/prepare/locked screens; when canvas is active, merged into 1 single top bar */}
      {!isWorkbenchActive && (
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#070b12] px-3">
          {headerLeft}
          {headerRight}
        </header>
      )}

      {/* Collapsible Student Mission Bar */}
      {!isAuthorMode && !studentQuizLocked && studentExercise && showStudentMission && (
        <div className="shrink-0 border-b border-slate-800 bg-[#0d1422] px-4 py-2.5 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-emerald-300">
                  {t("Studio Exercise", "Nhiệm vụ Studio")}
                </span>
                {studentExercise.instructions && (
                  <span className="text-slate-200">{studentExercise.instructions}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {!!studentExercise.initialState?.stoppedServices?.length && (
                  <span>
                    {t("Initially stopped", "Dừng sẵn")}:{" "}
                    <code className="font-mono text-rose-300">
                      {studentExercise.initialState.stoppedServices.join(", ")}
                    </code>
                  </span>
                )}
                {!!studentExercise.initialState?.stoppedControllers?.length && (
                  <span>
                    {t("Disconnected wires", "Ngắt kết nối")}:{" "}
                    <code className="font-mono text-amber-300">
                      {studentExercise.initialState.stoppedControllers.join(", ")}
                    </code>
                  </span>
                )}
                {studentExercise.successCriteria?.maxErrorRatePercent != null && (
                  <span>
                    {t("Max error", "Lỗi tối đa")}:{" "}
                    <strong className="text-slate-200">
                      {studentExercise.successCriteria.maxErrorRatePercent}%
                    </strong>
                  </span>
                )}
                {studentExercise.successCriteria?.maxP95Ms != null && (
                  <span>
                    {t("Max p95", "p95 tối đa")}:{" "}
                    <strong className="text-slate-200">
                      {studentExercise.successCriteria.maxP95Ms} ms
                    </strong>
                  </span>
                )}
                {!!studentExercise.successCriteria?.minReplicas?.length && (
                  <span>
                    {t("Target replicas", "Replica tối thiểu")}:{" "}
                    <code className="font-mono text-sky-300">
                      {studentExercise.successCriteria.minReplicas
                        .map((target) => `${target.service ?? ""} ×${target.count ?? 0}`)
                        .join(", ")}
                    </code>
                  </span>
                )}
                {studentExercise.successCriteria?.requiredTraceEdge && (
                  <span>
                    {t("Required trace", "Trace bắt buộc")}:{" "}
                    <code className="font-mono text-emerald-300">
                      {studentExercise.successCriteria.requiredTraceEdge.from} →{" "}
                      {studentExercise.successCriteria.requiredTraceEdge.to}
                    </code>
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowStudentMission(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label={t("Hide mission", "Ẩn đề bài")}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Error strips if any mutation fails */}
      {(autoStudio.error || startStudio.error || bootstrapStudio.error) && (
        <div className="shrink-0 space-y-1 border-b border-rose-500/30 bg-rose-950/30 px-4 py-2">
          {autoStudio.error && <ErrorState error={autoStudio.error} />}
          {startStudio.error && <ErrorState error={startStudio.error} />}
          {bootstrapStudio.error && <ErrorState error={bootstrapStudio.error} />}
        </div>
      )}

      {/* Main Full-Viewport Studio Live Surface */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!workspaceId || !assignmentId ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-slate-800 bg-[#0b101b] p-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              {t(
                "Open Studio Live from a Lab workspace.",
                "Hãy mở Studio Live từ một bài Lab trong lớp học.",
              )}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={returnHref}>{t("Return to MAVIS", "Quay lại MAVIS")}</Link>
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className="m-auto p-6">
            <LoadingState label={t("Loading Studio Live…", "Đang tải Studio Live…")} />
          </div>
        ) : studentQuizLocked ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-slate-800 bg-[#0b101b] p-6 text-center">
            <Lock className="mx-auto size-7 text-amber-400" aria-hidden="true" />
            <h1 className="text-base font-semibold text-white">
              {t("Quiz Gate Required", "Cần vượt qua Quiz Gate")}
            </h1>
            <p className="text-xs leading-5 text-slate-400">
              {t(
                "Pass the Step 3 Quiz Gate (>= 70%) before starting your Studio Live runtime session.",
                "Hoàn thành Quiz Gate ở Bước 3 (>= 70%) để mở khóa phiên thực nghiệm Studio Live.",
              )}
            </p>
            <Button asChild size="sm">
              <Link
                href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=3`}
              >
                {t("Go to Step 3: Quiz Gate", "Về Bước 3: Làm Quiz Gate")}
              </Link>
            </Button>
          </div>
        ) : isAuthorMode && !projectId ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-slate-800 bg-[#0b101b] p-6 text-center">
            <Lock className="mx-auto size-7 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-200">
              {t(
                "Import a repository with Docker Compose in Step 2 first.",
                "Hãy nhập kho mã nguồn có Docker Compose ở Bước 2 trước.",
              )}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&tab=source`}
              >
                {t("Go to Step 2", "Về Bước 2")}
              </Link>
            </Button>
          </div>
        ) : isAuthorMode && !showAuthorCanvas ? (
          <div className="m-auto flex max-w-lg flex-col items-center rounded-2xl border border-slate-800 bg-[#0b101b] px-8 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-emerald-400">
              <Container className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-base font-semibold text-white">
              {t("Prepare Docker Runtime", "Chuẩn bị Docker Runtime")}
            </h1>
            {availableApplications.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {availableApplications.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-xs text-slate-200"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            )}
            {readinessBlockers.length > 0 && (
              <div className="mt-4 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-300">
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
          <LiveStudioWorkbench
            standalone
            standaloneHeader={{ left: headerLeft, right: headerRight }}
            sessions={sessionList}
            sessionId={activeSessionId}
            projectId={projectId ?? undefined}
            projectName={!isAuthorMode ? labTitle || undefined : undefined}
            onSelectSession={setSelectedSessionId}
            onStartSession={() => {
              setVisualError("");
              startStudio.mutate(undefined, {
                onSuccess: (created) => {
                  if (created?.id) setSelectedSessionId(created.id);
                  void labSessions.refetch();
                },
                onError: (cause) => {
                  setVisualError(cause instanceof Error ? cause.message : String(cause));
                },
              });
            }}
            starting={startStudio.isPending}
            hideSwitchToSandbox
            previewTopology={previewTopology}
            previewModelId={previewModelId}
            previewServiceMappings={previewServiceMappings}
            authoring={authoringProps}
          />
        )}
      </main>

      {/* Optional Advanced Config Modal (Lecturer Escape Hatch inside Standalone Studio) */}
      {isAuthorMode && configModalOpen && projectId && assignment && (
        <div
          role="dialog"
          aria-modal="true"
          data-theme="dark"
          aria-label={t(
            "Studio Settings",
            "Cài đặt Studio",
          )}
          className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setConfigModalOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setConfigModalOpen(false);
          }}
        >
          <div
            style={{ colorScheme: "dark" }}
            className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0b101b] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0d1322] px-5 py-3">
              <div
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-[#070b12] p-0.5"
                role="tablist"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={configTab === "exercise"}
                  onClick={() => setConfigTab("exercise")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    configTab === "exercise"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
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
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t("Services & Wires", "Service & Kết nối")}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={autoStudio.isPending}
                  onClick={runPrepareRuntime}
                  className="h-7 border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  <RefreshCw
                    className={`mr-1.5 size-3 ${autoStudio.isPending ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {autoStudio.isPending
                    ? t("Syncing…", "Đang đồng bộ…")
                    : t("Sync Docker", "Đồng bộ Docker")}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                  aria-label={t("Close", "Đóng")}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 #0b101b" }}
              className="overflow-y-auto px-5 py-4"
            >
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
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center text-xs text-slate-400">
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

export function StandaloneStudioLive() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh w-screen items-center justify-center bg-[#070b12] text-slate-300">
          <LoadingState label="Loading Studio Live…" />
        </div>
      }
    >
      <RequireSession>
        <StandaloneStudioContent />
      </RequireSession>
    </Suspense>
  );
}
