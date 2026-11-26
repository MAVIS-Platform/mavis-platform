"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
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
  isUuidSegment,
  PublishCourseLab,
  useAutoConfigureStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStartLabStudioSession,
  useStudentLabContext,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { LiveStudioWorkbench, type LiveStudioAuthoringProps } from "./live-studio-workbench";
import {
  buildStudentExerciseInstructions,
  extractRepoEndpointOptions,
  resolveModelServiceEdges,
  smartPickBaselineEndpoint,
  type AuthorBlockChipId,
  type DerivedExerciseFromDemo,
  type ExerciseTypeKey,
  type StudioGoalId,
  type TargetChangeAction,
} from "./studio-authoring-helpers";

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
    exerciseType?:
      | "CHANGE_IMPACT"
      | "CASCADING_FAILURE"
      | "CIRCUIT_BREAKER"
      | "SCALE_UNDER_LOAD"
      | "CONFIG_REGRESSION"
      | "CUSTOM"
      | null;
    predictionRequired?: boolean | null;
    minImpactF1?: number | null;
    targetChangeAction?: {
      action: "STOP" | "START" | "SCALE" | "PAUSE" | "RESUME" | "THROTTLE_CPU" | "SET_LOAD";
      service: string;
      replicas?: number | null;
      cpuPercent?: number | null;
      targetRps?: number | null;
    } | null;
    rules?: Array<{
      metric:
        | "ERROR_RATE"
        | "EDGE_ERROR_RATE"
        | "P95_MS"
        | "P95_DELTA_PCT"
        | "REPLICAS"
        | "TRACE_EDGE"
        | "IMPACT_F1";
      target: string;
      operator: "LT" | "LTE" | "GT" | "GTE" | "EQ";
      threshold: number;
      label?: string | null;
    }> | null;
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
  const { locale, t } = useLocale();
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
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=3#lab-submit`
      : "/courses";
  const returnHref = safeRelativeHref(params?.get("returnTo") ?? null, defaultReturnTo);
  const publishHref =
    workspaceId && assignmentId
      ? `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring&flowStep=arrange`
      : returnHref;
  const submitHref =
    workspaceId && assignmentId
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignmentId)}&step=3#lab-submit`
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
  const labSessions = useStudentLabStudioSessions(
    workspaceId,
    assignmentId,
    Boolean(workspaceId && assignmentId),
  );

  const courseReference = setup.data?.reference;
  const projectId = isAuthorMode
    ? (assignment?.referenceSource?.projectId ??
      exercise.data?.runtimeProjectId ??
      courseReference?.projectId ??
      null)
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
  const [visualSaved, setVisualSaved] = useState(false);
  const [visualError, setVisualError] = useState("");

  const previewTopology = useMemo(() => {
    if (!isAuthorMode) return undefined;
    const base =
      parseStudioTopology(runtimeConfig.data?.profile?.["studioTopology"]) ??
      parseStudioTopology(readiness.data?.topology);
    if (!base || !exercise.data?.initialState) return base;
    const stoppedSvcs = new Set(exercise.data.initialState.stoppedServices ?? []);
    const stoppedCtrls = new Set(exercise.data.initialState.stoppedControllers ?? []);
    return {
      ...base,
      blocks: base.blocks.map((b) => ({
        ...b,
        initiallyStopped: stoppedSvcs.has(b.service),
      })),
      connections: base.connections.map((c) => ({
        ...c,
        initiallyStopped: stoppedCtrls.has(c.controllerService),
      })),
    };
  }, [isAuthorMode, runtimeConfig.data?.profile, readiness.data?.topology, exercise.data?.initialState]);
  const previewModelId =
    runtimeConfig.data?.modelId ??
    assignment?.referenceSource?.modelId ??
    exercise.data?.runtimeModelId ??
    courseReference?.modelId ??
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
  const authorReferenceModel = useApiQuery(
    "model",
    { modelId: previewModelId ?? "", projectId: projectId ?? "" },
    { enabled: Boolean(isAuthorMode && previewModelId && projectId) },
  );

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
    if (
      selectedSessionId &&
      (startStudio.data?.id === selectedSessionId ||
        sessionList.some((item) => item.id === selectedSessionId))
    ) {
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
    // Never auto-select dead CANCELLED/FAILED/TIMED_OUT sessions on entry; only resume verified/completed evidence.
    const verifiedOrCompleted = sessionList.find(
      (item) =>
        item.assignmentId === assignmentId &&
        (item.studioVerified || item.executionStatus?.toUpperCase() === "COMPLETED"),
    );
    return verifiedOrCompleted?.id ?? "";
  }, [selectedSessionId, startStudio.data?.id, sessionList, assignmentId, isAuthorMode]);

  const studentQuizLocked = Boolean(
    !isAuthorMode &&
    !canManage &&
    studentContext.data?.quiz &&
    !studentContext.data.quiz.runtimeUnlocked &&
    studentContext.data.assignment?.labMode !== "THEORY_ONLY",
  );

  const autoLinkedLabRef = useRef<string | null>(null);
  // Auto-link newly created Labs to the already-ready Course Docker runtime so lecturers never need manual Sync Docker per Lab.
  useEffect(() => {
    if (
      !isAuthorMode ||
      !workspaceId ||
      !assignmentId ||
      !projectId ||
      !isRuntimeReady ||
      assignments.isPending ||
      exercise.isPending ||
      autoStudio.isPending ||
      autoLinkedLabRef.current === assignmentId
    ) {
      return;
    }
    const missingLink = !assignment?.referenceSource?.projectId || !exercise.data;
    if (!missingLink) return;
    autoLinkedLabRef.current = assignmentId;
    autoStudio.mutate(undefined, {
      onSuccess: () => {
        setCanvasOpened(true);
        void exercise.refetch();
        void runtimeConfig.refetch();
        void readiness.refetch();
        void setup.refetch();
      },
    });
  }, [
    isAuthorMode,
    workspaceId,
    assignmentId,
    projectId,
    isRuntimeReady,
    assignments.isPending,
    exercise.isPending,
    exercise.data,
    assignment?.referenceSource?.projectId,
    autoStudio,
    exercise,
    runtimeConfig,
    readiness,
    setup,
  ]);

  const studioStateQuery = useApiQuery(
    "studioState",
    { sessionId: activeSessionId },
    {
      enabled:
        client.mode === "backend" &&
        !isAuthorMode &&
        !studentQuizLocked &&
        Boolean(activeSessionId),
      poll: false,
    },
  );

  const liveStudioVerified =
    Boolean(verifiedSession) ||
    Boolean(
      studioStateQuery.data?.executionStatus === "COMPLETED" &&
        studioStateQuery.data?.receiptDigest,
    );

  const endpointOptions = useMemo(
    () =>
      extractRepoEndpointOptions(
        runtimeConfig.data?.profile as Record<string, unknown> | undefined,
        exercise.data?.baselineRequests?.[0]?.path,
      ),
    [runtimeConfig.data?.profile, exercise.data?.baselineRequests],
  );
  const authorStaticEdges = useMemo(() => {
    const seen = new Set<string>();
    const edges: Array<{ from: string; to: string }> = [];
    const add = (from: string, to: string) => {
      if (!from || !to || from === to) return;
      const key = `${from}->${to}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to });
    };
    for (const c of previewTopology?.connections ?? []) add(c.from, c.to);
    const servicePool = previewTopology?.blocks.length
      ? previewTopology.blocks.map((b) => b.service)
      : composePoolServices;
    for (const m of resolveModelServiceEdges(
      authorReferenceModel.data,
      previewServiceMappings,
      servicePool,
    )) {
      add(m.from, m.to);
    }
    return edges;
  }, [
    previewTopology,
    authorReferenceModel.data,
    previewServiceMappings,
    composePoolServices,
  ]);
  const pickSmartPath = (targetService?: string | null) =>
    smartPickBaselineEndpoint({
      endpointOptions,
      currentPath: exercise.data?.baselineRequests?.[0]?.path,
      targetService,
      edges: authorStaticEdges,
    }).path;
  const defaultBaselinePath = useMemo(() => {
    const saved = exercise.data?.baselineRequests?.[0]?.path?.trim();
    if (saved && saved !== "/") return saved;
    return endpointOptions[0]?.path ?? "/health";
  }, [exercise.data?.baselineRequests, endpointOptions]);

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

  const visualMutationSeqRef = useRef(0);
  const visualSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedTopologyJsonRef = useRef("");
  useEffect(() => {
    const serverTopo = parseStudioTopology(
      (runtimeConfig.data?.profile as Record<string, unknown> | undefined)?.["studioTopology"],
    );
    if (serverTopo && visualMutationSeqRef.current === 0) {
      lastSavedTopologyJsonRef.current = JSON.stringify(serverTopo);
    }
  }, [runtimeConfig.data]);

  type VisualExerciseInput = {
    stoppedServices?: string[];
    stoppedControllers?: string[];
    instructions?: string;
    baselinePath?: string;
    maxErrorRatePercent?: string;
    maxP95Ms?: string;
    minImpactF1?: string;
    minReplicas?: Array<{ service: string; count: number }>;
    exerciseType?: ExerciseTypeKey | null;
    predictionRequired?: boolean;
    targetChangeAction?: TargetChangeAction | null;
    requiredTraceEdge?: { from: string; to: string } | null;
    allowedActions?: string[];
    nextTopology?: StudioTopology;
  };

  const buildNextExercisePayload = (
    cur: StudioExerciseView | undefined,
    input: VisualExerciseInput,
    ids: {
      runtimeProjectId: string | null;
      runtimeModelId: string | null;
      runtimeSnapshotId: string | null;
    },
  ): StudioExerciseView => {
    const chosenPath = input.baselinePath?.trim();
    const nextBaseline = chosenPath
      ? [{ method: "GET" as const, path: chosenPath, expectedStatus: 200 }]
      : cur?.baselineRequests?.length && cur.baselineRequests[0]?.path !== "/"
        ? cur.baselineRequests
        : [{ method: "GET" as const, path: defaultBaselinePath, expectedStatus: 200 }];
    const nextExerciseType =
      "exerciseType" in input
        ? input.exerciseType
        : (cur?.successCriteria?.exerciseType ?? null);
    const nextMaxErr =
      input.maxErrorRatePercent !== undefined
        ? input.maxErrorRatePercent.trim()
          ? Number(input.maxErrorRatePercent)
          : null
        : cur?.successCriteria && "maxErrorRatePercent" in cur.successCriteria
          ? (cur.successCriteria.maxErrorRatePercent ?? null)
          : nextExerciseType === "CIRCUIT_BREAKER"
            ? 0
            : null;
    const nextMaxP95 =
      input.maxP95Ms !== undefined
        ? input.maxP95Ms.trim()
          ? Number(input.maxP95Ms)
          : null
        : (cur?.successCriteria?.maxP95Ms ?? null);
    const nextMinImpactF1 =
      input.minImpactF1 !== undefined
        ? input.minImpactF1.trim()
          ? Number(input.minImpactF1)
          : null
        : (cur?.successCriteria?.minImpactF1 ?? null);
    const nextPredictionRequired =
      "predictionRequired" in input
        ? input.predictionRequired
        : (cur?.successCriteria?.predictionRequired ?? false);
    const nextTargetAction =
      "targetChangeAction" in input
        ? input.targetChangeAction
        : (cur?.successCriteria?.targetChangeAction ?? null);
    const nextRequiredTraceEdge =
      "requiredTraceEdge" in input
        ? input.requiredTraceEdge
        : (cur?.successCriteria?.requiredTraceEdge ?? null);
    const nextAllowedActions =
      input.allowedActions && input.allowedActions.length > 0
        ? input.allowedActions
        : cur?.allowedActions?.length
          ? cur.allowedActions
          : [
              "START",
              "STOP",
              "SCALE",
              "PAUSE",
              "RESUME",
              "THROTTLE_CPU",
              "SET_LOAD",
              "CONNECT",
              "DISCONNECT",
            ];
    return {
      ...cur,
      runtimeProjectId: ids.runtimeProjectId,
      runtimeModelId: ids.runtimeModelId,
      runtimeSnapshotId: ids.runtimeSnapshotId,
      baselineRequests: nextBaseline,
      initialState: {
        ...cur?.initialState,
        stoppedServices: input.stoppedServices ?? cur?.initialState?.stoppedServices ?? [],
        stoppedControllers:
          input.stoppedControllers ?? cur?.initialState?.stoppedControllers ?? [],
      },
      allowedActions: nextAllowedActions,
      successCriteria: {
        ...cur?.successCriteria,
        maxErrorRatePercent: nextMaxErr,
        maxP95Ms: nextMaxP95,
        requiredTraceEdge: nextRequiredTraceEdge,
        minReplicas: input.minReplicas ?? cur?.successCriteria?.minReplicas ?? [],
        exerciseType: nextExerciseType,
        predictionRequired: nextPredictionRequired,
        minImpactF1: nextMinImpactF1,
        targetChangeAction: nextTargetAction,
      },
      instructions: (input.instructions ?? cur?.instructions ?? "").trim(),
      revision: cur?.revision ?? 0,
    };
  };

  const saveVisualExercise = useMutation({
    onMutate: (input: VisualExerciseInput) => {
      const seq = ++visualMutationSeqRef.current;
      setVisualError("");
      setVisualSaved(false);
      const exKey = ["api", "studio-exercise", workspaceId, assignmentId] as const;
      const cfgKey = projectId
        ? (["api", "runtimeConfiguration", { projectId }] as const)
        : null;
      const prevExercise = cache.getQueryData<StudioExerciseView>(exKey);
      const prevConfig = cfgKey
        ? cache.getQueryData<Response<"runtimeConfiguration">>(cfgKey)
        : undefined;

      const ref = assignment?.referenceSource;
      const runtimeProjectId =
        ref?.projectId ?? prevExercise?.runtimeProjectId ?? projectId ?? null;
      const runtimeModelId =
        ref?.modelId ??
        prevExercise?.runtimeModelId ??
        prevConfig?.modelId ??
        courseReference?.modelId ??
        null;
      const runtimeSnapshotId =
        ref?.snapshotId ??
        prevExercise?.runtimeSnapshotId ??
        prevConfig?.snapshotId ??
        courseReference?.snapshotId ??
        null;

      // Apply optimistic cache update synchronously so goal/rule clicks feel instant (<16ms) with zero UI lock.
      const optimisticExercise = buildNextExercisePayload(prevExercise, input, {
        runtimeProjectId,
        runtimeModelId,
        runtimeSnapshotId,
      });
      cache.setQueryData(exKey, optimisticExercise);

      if (input.nextTopology && cfgKey && prevConfig) {
        cache.setQueryData(cfgKey, {
          ...prevConfig,
          profile: {
            ...prevConfig.profile,
            studioTopology: input.nextTopology,
          },
        });
      }
      return { seq, prevExercise, prevConfig };
    },
    mutationFn: (input: VisualExerciseInput) => {
      // Serialize backend saves so rapid toggles never collide on runtimeConfiguration expectedRevision (HTTP 409).
      const execute = async () => {
        const ref = assignment?.referenceSource;
        const curEx = cache.getQueryData<StudioExerciseView>([
          "api",
          "studio-exercise",
          workspaceId,
          assignmentId,
        ]);
        const latestCachedCfg = projectId
          ? cache.getQueryData<Response<"runtimeConfiguration">>([
              "api",
              "runtimeConfiguration",
              { projectId },
            ]) ?? runtimeConfig.data
          : runtimeConfig.data;
        const runtimeProjectId = ref?.projectId ?? curEx?.runtimeProjectId ?? projectId;
        const runtimeModelId =
          ref?.modelId ??
          curEx?.runtimeModelId ??
          latestCachedCfg?.modelId ??
          courseReference?.modelId;
        const runtimeSnapshotId =
          ref?.snapshotId ??
          curEx?.runtimeSnapshotId ??
          latestCachedCfg?.snapshotId ??
          courseReference?.snapshotId;

        if (input.nextTopology && projectId) {
          const nextTopoJson = JSON.stringify(input.nextTopology);
          // Skip redundant runtime-configuration PUT when topology blocks/connections did not change.
          if (nextTopoJson !== lastSavedTopologyJsonRef.current) {
            const cfg =
              latestCachedCfg?.configured &&
              latestCachedCfg.modelId &&
              latestCachedCfg.snapshotId
                ? latestCachedCfg
                : ((await runtimeConfig.refetch()).data ?? latestCachedCfg);
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
              lastSavedTopologyJsonRef.current = nextTopoJson;
              cache.setQueryData(["api", "runtimeConfiguration", { projectId }], savedCfg);
            };
            try {
              await saveTopologyOnce(cfg);
            } catch (cause) {
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
        }

        if (runtimeProjectId && runtimeModelId && runtimeSnapshotId) {
          const putExerciseOnce = (baseExercise: StudioExerciseView | undefined) => {
            const payload = buildNextExercisePayload(baseExercise, input, {
              runtimeProjectId,
              runtimeModelId,
              runtimeSnapshotId,
            });
            return api<StudioExerciseView>(
              `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
              {
                method: "PUT",
                body: JSON.stringify(payload),
              },
            );
          };
          try {
            const savedExercise = await putExerciseOnce(curEx);
            return { savedExercise };
          } catch (cause) {
            const isConflict =
              (cause instanceof ApiError && cause.status === 409) ||
              (cause instanceof Error && /version has changed|conflict|409/i.test(cause.message));
            if (isConflict) {
              const latestExercise = await api<StudioExerciseView>(
                `workspaces/${workspaceId}/course-labs/${assignmentId}/studio-exercise`,
              ).catch(() => undefined);
              const savedExercise = await putExerciseOnce(latestExercise ?? curEx);
              return { savedExercise };
            }
            throw cause;
          }
        }
        return { savedExercise: undefined as StudioExerciseView | undefined };
      };
      const run = visualSaveChainRef.current.then(execute, execute);
      visualSaveChainRef.current = run.catch(() => undefined);
      return run;
    },
    onSuccess: (result, _vars, ctx) => {
      if (ctx && ctx.seq !== visualMutationSeqRef.current) return;
      setVisualSaved(true);
      if (result?.savedExercise) {
        cache.setQueryData(
          ["api", "studio-exercise", workspaceId, assignmentId],
          result.savedExercise,
        );
      }
    },
    onError: (cause, _vars, ctx) => {
      if (ctx && ctx.seq === visualMutationSeqRef.current) {
        if (ctx.prevExercise !== undefined) {
          cache.setQueryData(
            ["api", "studio-exercise", workspaceId, assignmentId],
            ctx.prevExercise,
          );
        }
        if (projectId && ctx.prevConfig !== undefined) {
          cache.setQueryData(["api", "runtimeConfiguration", { projectId }], ctx.prevConfig);
        }
      }
      setVisualError(cause instanceof Error ? cause.message : String(cause));
    },
  });

  const initialStoppedServices = useMemo(() => {
    if (exercise.data?.initialState?.stoppedServices) {
      return exercise.data.initialState.stoppedServices;
    }
    return (previewTopology?.blocks ?? []).filter((b) => b.initiallyStopped).map((b) => b.service);
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

  const currentTargetAction: TargetChangeAction | null =
    exercise.data?.successCriteria?.targetChangeAction ?? null;
  const currentRequiredTraceEdge = exercise.data?.successCriteria?.requiredTraceEdge ?? null;
  const currentAllowedActions = exercise.data?.allowedActions?.length
    ? exercise.data.allowedActions
    : [
        "START",
        "STOP",
        "SCALE",
        "PAUSE",
        "RESUME",
        "THROTTLE_CPU",
        "SET_LOAD",
        "CONNECT",
        "DISCONNECT",
      ];

  const authoringProps: LiveStudioAuthoringProps | undefined =
    isAuthorMode && projectId
      ? {
          initialStoppedServices,
          initialStoppedControllers,
          scalableServices,
          availableServices: composePoolServices,
          impactTargetService: currentTargetAction?.service ?? null,
          exerciseType: exercise.data?.successCriteria?.exerciseType ?? null,
          predictionRequired: exercise.data?.successCriteria?.predictionRequired === true,
          minImpactF1:
            exercise.data?.successCriteria?.minImpactF1 != null
              ? String(exercise.data.successCriteria.minImpactF1)
              : "0.7",
          maxP95Ms:
            exercise.data?.successCriteria?.maxP95Ms != null
              ? String(exercise.data.successCriteria.maxP95Ms)
              : "",
          targetChangeAction: currentTargetAction,
          requiredTraceEdge: currentRequiredTraceEdge,
          allowedActions: currentAllowedActions,
          endpointOptions,
          syncingDocker: autoStudio.isPending,
          onSyncDocker: runPrepareRuntime,
          instructions: exercise.data?.instructions ?? "",
          baselinePath: defaultBaselinePath,
          maxErrorRatePercent:
            exercise.data?.successCriteria?.maxErrorRatePercent == null
              ? ""
              : String(exercise.data.successCriteria.maxErrorRatePercent),
          replicaService: exercise.data?.successCriteria?.minReplicas?.[0]?.service ?? "",
          replicaCount:
            exercise.data?.successCriteria?.minReplicas?.[0]?.count == null
              ? ""
              : String(exercise.data.successCriteria.minReplicas[0].count),
          busy: autoStudio.isPending,
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
            const isRecoveryMode =
              exercise.data?.successCriteria?.exerciseType === "CIRCUIT_BREAKER" ||
              (!isController && nextStoppedServices.length > 0 && currentTargetAction?.action === "START");
            const nextRecoveryTarget = nextStoppedServices[0];
            saveVisualExercise.mutate({
              stoppedServices: nextStoppedServices,
              stoppedControllers: nextStoppedControllers,
              ...(isRecoveryMode && nextRecoveryTarget
                ? {
                    exerciseType: "CIRCUIT_BREAKER" as const,
                    targetChangeAction: { action: "START" as const, service: nextRecoveryTarget },
                    baselinePath: pickSmartPath(nextRecoveryTarget),
                    instructions: buildStudentExerciseInstructions({
                      exerciseType: "CIRCUIT_BREAKER",
                      targetAction: { action: "START", service: nextRecoveryTarget },
                      stoppedServices: nextStoppedServices,
                      maxErrorRatePercent: exercise.data?.successCriteria?.maxErrorRatePercent ?? 0,
                      locale,
                    }),
                  }
                : {}),
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
            const clamped = Math.max(1, Math.min(3, Math.round(count)));
            const nextTopology = previewTopology
              ? {
                  ...previewTopology,
                  blocks: previewTopology.blocks.map((b) =>
                    b.service === service ? { ...b, canScale: true } : b,
                  ),
                }
              : undefined;
            saveVisualExercise.mutate({
              minReplicas: clamped >= 2 ? [{ service, count: clamped }] : [],
              ...(clamped >= 2
                ? {
                    exerciseType: "SCALE_UNDER_LOAD" as const,
                    targetChangeAction: { action: "SCALE" as const, service, replicas: clamped },
                  }
                : {}),
              ...(nextTopology ? { nextTopology } : {}),
            });
          },
          onSelectGoal: (goalId: StudioGoalId, preferredService?: string) => {
            const currentBlocks = previewTopology?.blocks ?? [];
            const serviceNames =
              currentBlocks.length > 0
                ? currentBlocks.map((b) => b.service)
                : availableApplications;
            if (serviceNames.length === 0) return;
            const stateless = serviceNames.filter(
              (svc) => !isStatefulService(svc) && !/gateway|edge|proxy/i.test(svc),
            );
            const nonGateway = serviceNames.filter((svc) => !/gateway|edge|proxy/i.test(svc));
            const primaryScale =
              (preferredService && !isStatefulService(preferredService) ? preferredService : null) ??
              stateless.find((s) => /order|catalog|product|api/i.test(s)) ??
              stateless[0] ??
              serviceNames[0]!;
            const faultTarget =
              (preferredService && !/gateway|edge|proxy/i.test(preferredService)
                ? preferredService
                : null) ??
              stateless.find((s) => /payment|billing/i.test(s)) ??
              stateless.find((s) => /inventory|order|cart/i.test(s)) ??
              stateless[1] ??
              stateless[0] ??
              nonGateway[0] ??
              serviceNames[serviceNames.length - 1]!;

            const baseTopology = (patchBlock: (svc: string, cur: StudioTopology["blocks"][number]) => StudioTopology["blocks"][number]) =>
              previewTopology
                ? {
                    ...previewTopology,
                    blocks: previewTopology.blocks.map((b) => patchBlock(b.service, b)),
                    connections: (previewTopology.connections ?? []).map((c) => ({
                      ...c,
                      initiallyStopped: false,
                    })),
                  }
                : undefined;

            if (goalId === "change-impact") {
              const nextTopology = baseTopology((_svc, b) => ({ ...b, initiallyStopped: false }));
              saveVisualExercise.mutate({
                exerciseType: "CHANGE_IMPACT",
                predictionRequired: true,
                minImpactF1: "0.7",
                targetChangeAction: { action: "PAUSE", service: faultTarget },
                stoppedServices: [],
                stoppedControllers: [],
                minReplicas: [],
                maxErrorRatePercent: "",
                maxP95Ms: "",
                baselinePath: pickSmartPath(faultTarget),
                allowedActions: ["PAUSE", "RESUME", "STOP", "START", "SET_LOAD"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "CHANGE_IMPACT",
                  targetAction: { action: "PAUSE", service: faultTarget },
                  predictionRequired: true,
                  minImpactF1: 0.7,
                  locale,
                }),
                ...(nextTopology ? { nextTopology } : {}),
              });
              return;
            }

            if (goalId === "scale") {
              const nextTopology = baseTopology((svc, b) => ({
                ...b,
                initiallyStopped: false,
                canScale: svc === primaryScale ? true : b.canScale,
              }));
              saveVisualExercise.mutate({
                exerciseType: "SCALE_UNDER_LOAD",
                predictionRequired: false,
                minImpactF1: "",
                targetChangeAction: { action: "SCALE", service: primaryScale, replicas: 2 },
                stoppedServices: [],
                stoppedControllers: [],
                minReplicas: [{ service: primaryScale, count: 2 }],
                maxErrorRatePercent: "5",
                baselinePath: pickSmartPath(primaryScale),
                allowedActions: ["SCALE", "SET_LOAD", "START", "STOP"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "SCALE_UNDER_LOAD",
                  targetAction: { action: "SCALE", service: primaryScale, replicas: 2 },
                  minReplicas: [{ service: primaryScale, count: 2 }],
                  maxErrorRatePercent: 5,
                  locale,
                }),
                ...(nextTopology ? { nextTopology } : {}),
              });
              return;
            }

            if (goalId === "recovery") {
              const nextTopology = baseTopology((svc, b) => ({
                ...b,
                initiallyStopped: svc === faultTarget,
              }));
              saveVisualExercise.mutate({
                exerciseType: "CIRCUIT_BREAKER",
                predictionRequired: false,
                minImpactF1: "",
                targetChangeAction: { action: "START", service: faultTarget },
                stoppedServices: [faultTarget],
                stoppedControllers: [],
                minReplicas: [],
                maxErrorRatePercent: "0",
                baselinePath: pickSmartPath(faultTarget),
                allowedActions: ["START", "STOP", "PAUSE", "RESUME", "CONNECT", "DISCONNECT"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "CIRCUIT_BREAKER",
                  targetAction: { action: "START", service: faultTarget },
                  stoppedServices: [faultTarget],
                  maxErrorRatePercent: 0,
                  locale,
                }),
                ...(nextTopology ? { nextTopology } : {}),
              });
              return;
            }

            // cpu degradation
            const nextTopology = baseTopology((svc, b) => ({
              ...b,
              initiallyStopped: false,
              canScale: svc === faultTarget ? true : b.canScale,
            }));
            saveVisualExercise.mutate({
              exerciseType: "CONFIG_REGRESSION",
              predictionRequired: false,
              minImpactF1: "",
              targetChangeAction: { action: "THROTTLE_CPU", service: faultTarget, cpuPercent: 25 },
              stoppedServices: [],
              stoppedControllers: [],
              minReplicas: [],
              maxErrorRatePercent: "",
              baselinePath: pickSmartPath(faultTarget),
              allowedActions: ["THROTTLE_CPU", "SET_LOAD", "SCALE", "START", "STOP"],
              instructions: buildStudentExerciseInstructions({
                exerciseType: "CONFIG_REGRESSION",
                targetAction: { action: "THROTTLE_CPU", service: faultTarget, cpuPercent: 25 },
                locale,
              }),
              ...(nextTopology ? { nextTopology } : {}),
            });
          },
          onApplyBlockChip: (chipId: AuthorBlockChipId, service: string) => {
            if (!service) return;
            if (chipId === "author-starts-down") {
              const isDown = initialStoppedServices.includes(service);
              const nextStopped = isDown
                ? initialStoppedServices.filter((s) => s !== service)
                : [...initialStoppedServices, service];
              const primaryDown = !isDown ? service : nextStopped[0];
              const nextTopology = previewTopology
                ? {
                    ...previewTopology,
                    blocks: previewTopology.blocks.map((b) => ({
                      ...b,
                      initiallyStopped: nextStopped.includes(b.service),
                    })),
                  }
                : undefined;
              saveVisualExercise.mutate({
                stoppedServices: nextStopped,
                ...(primaryDown
                  ? {
                      exerciseType: "CIRCUIT_BREAKER" as const,
                      predictionRequired: false,
                      minImpactF1: "",
                      minReplicas: [],
                      targetChangeAction: { action: "START" as const, service: primaryDown },
                      maxErrorRatePercent: "0",
                      baselinePath: pickSmartPath(primaryDown),
                      instructions: buildStudentExerciseInstructions({
                        exerciseType: "CIRCUIT_BREAKER",
                        targetAction: { action: "START", service: primaryDown },
                        stoppedServices: nextStopped,
                        maxErrorRatePercent: 0,
                        locale,
                      }),
                    }
                  : {}),
                ...(nextTopology ? { nextTopology } : {}),
              });
              return;
            }

            if (chipId === "author-impact-target") {
              const isSameTarget =
                currentTargetAction?.service === service &&
                (currentTargetAction.action === "PAUSE" || currentTargetAction.action === "STOP");
              if (isSameTarget) {
                saveVisualExercise.mutate({
                  targetChangeAction: null,
                  predictionRequired: false,
                  minImpactF1: "",
                });
                return;
              }
              const act = currentTargetAction?.action === "STOP" ? "STOP" : "PAUSE";
              saveVisualExercise.mutate({
                exerciseType: "CHANGE_IMPACT",
                predictionRequired: true,
                minImpactF1: "0.7",
                targetChangeAction: { action: act, service },
                stoppedServices: [],
                minReplicas: [],
                maxErrorRatePercent: "",
                maxP95Ms: "",
                baselinePath: pickSmartPath(service),
                allowedActions: ["PAUSE", "RESUME", "STOP", "START", "SET_LOAD"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "CHANGE_IMPACT",
                  targetAction: { action: act, service },
                  predictionRequired: true,
                  minImpactF1: 0.7,
                  locale,
                }),
              });
              return;
            }

            if (chipId === "author-scale-2x") {
              const nextTopology = previewTopology
                ? {
                    ...previewTopology,
                    blocks: previewTopology.blocks.map((b) =>
                      b.service === service ? { ...b, canScale: true } : b,
                    ),
                  }
                : undefined;
              saveVisualExercise.mutate({
                exerciseType: "SCALE_UNDER_LOAD",
                predictionRequired: false,
                minImpactF1: "",
                targetChangeAction: { action: "SCALE", service, replicas: 2 },
                stoppedServices: [],
                minReplicas: [{ service, count: 2 }],
                maxErrorRatePercent: "5",
                baselinePath: pickSmartPath(service),
                allowedActions: ["SCALE", "SET_LOAD", "START", "STOP"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "SCALE_UNDER_LOAD",
                  targetAction: { action: "SCALE", service, replicas: 2 },
                  minReplicas: [{ service, count: 2 }],
                  maxErrorRatePercent: 5,
                  locale,
                }),
                ...(nextTopology ? { nextTopology } : {}),
              });
              return;
            }

            if (chipId === "author-cpu-target") {
              const isSameCpu =
                currentTargetAction?.service === service &&
                currentTargetAction.action === "THROTTLE_CPU";
              if (isSameCpu) {
                saveVisualExercise.mutate({ targetChangeAction: null });
                return;
              }
              const pct = currentTargetAction?.cpuPercent ?? 25;
              saveVisualExercise.mutate({
                exerciseType: "CONFIG_REGRESSION",
                predictionRequired: false,
                minImpactF1: "",
                targetChangeAction: { action: "THROTTLE_CPU", service, cpuPercent: pct },
                stoppedServices: [],
                minReplicas: [],
                maxErrorRatePercent: "",
                baselinePath: pickSmartPath(service),
                allowedActions: ["THROTTLE_CPU", "SET_LOAD", "SCALE", "START", "STOP"],
                instructions: buildStudentExerciseInstructions({
                  exerciseType: "CONFIG_REGRESSION",
                  targetAction: { action: "THROTTLE_CPU", service, cpuPercent: pct },
                  locale,
                }),
              });
            }
          },
          onUpdateGoalRule: (patch) => {
            saveVisualExercise.mutate(patch);
          },
          onToggleWire: (from: string, to: string) => {
            const isSame =
              currentRequiredTraceEdge?.from === from && currentRequiredTraceEdge?.to === to;
            saveVisualExercise.mutate({
              requiredTraceEdge: isSame ? null : { from, to },
            });
          },
          onApplyLiveDemoAsExercise: (derived: DerivedExerciseFromDemo) => {
            const nextTopology = previewTopology
              ? {
                  ...previewTopology,
                  blocks: previewTopology.blocks.map((b) => ({
                    ...b,
                    initiallyStopped: derived.stoppedServices.includes(b.service),
                    canScale: derived.scalableServices.includes(b.service) ? true : b.canScale,
                  })),
                }
              : undefined;
            saveVisualExercise.mutate({
              exerciseType: derived.exerciseType,
              predictionRequired: derived.predictionRequired,
              minImpactF1: derived.minImpactF1 != null ? String(derived.minImpactF1) : "",
              targetChangeAction: derived.targetChangeAction,
              stoppedServices: derived.stoppedServices,
              minReplicas: derived.minReplicas,
              allowedActions: derived.allowedActions,
              maxErrorRatePercent: derived.maxErrorRatePercent,
              baselinePath: pickSmartPath(
                derived.targetChangeAction?.service ?? derived.stoppedServices[0] ?? null,
              ),
              instructions: derived.instructions,
              ...(nextTopology ? { nextTopology } : {}),
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
              ...(patch.maxP95Ms !== undefined ? { maxP95Ms: patch.maxP95Ms } : {}),
              ...(patch.minImpactF1 !== undefined ? { minImpactF1: patch.minImpactF1 } : {}),
              ...(patch.predictionRequired !== undefined
                ? { predictionRequired: patch.predictionRequired }
                : {}),
              ...(patch.allowedActions !== undefined
                ? { allowedActions: patch.allowedActions }
                : {}),
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

  const labTitle =
    (isAuthorMode ? assignment?.title : studentContext.data?.assignment?.title) ?? "";
  const studentExercise = !isAuthorMode ? studentContext.data?.studioExercise : null;
  const showAuthorCanvas =
    isRuntimeReady || Boolean(previewTopology) || canvasOpened || sessionList.length > 0;
  const isInitialLoading =
    workspaces.isPending ||
    (isAuthorMode ? assignments.isPending || (!projectId && setup.isPending) : studentContext.isPending);
  const initialLoadError =
    workspaces.error ??
    (isAuthorMode ? assignments.error : studentContext.error) ??
    null;

  const isWorkbenchActive =
    Boolean(workspaceId && assignmentId) &&
    !isInitialLoading &&
    !initialLoadError &&
    !studentQuizLocked &&
    !(isAuthorMode && !projectId) &&
    !(isAuthorMode && !showAuthorCanvas);

  const headerLeft = (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={returnHref}
        aria-label={
          isAuthorMode ? t("Back to Lab Setup", "Về thiết lập Lab") : t("Back to Lab", "Về bài Lab")
        }
        title={
          isAuthorMode ? t("Back to Lab Setup", "Về thiết lập Lab") : t("Back to Lab", "Về bài Lab")
        }
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span className="hidden xl:inline">{t("Back", "Quay lại")}</span>
      </Link>

      <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tracking-tight text-foreground">
        MAVIS Live
      </span>
      {labTitle && (
        <div
          className={`hidden min-w-0 items-center gap-1.5 overflow-hidden ${isAuthorMode ? "2xl:flex" : "xl:flex"}`}
          title={labTitle}
        >
          <span className="shrink-0 text-muted-foreground/60" aria-hidden="true">
            /
          </span>
          <span className="min-w-0 max-w-[155px] truncate text-[13px] font-medium text-muted-foreground 2xl:max-w-[215px]">
            {labTitle}
          </span>
        </div>
      )}

      {isAuthorMode && setupLab?.topologyFrozen && !published && (
        <Badge variant="success" className="hidden shrink-0 whitespace-nowrap xl:inline-flex">
          {t("Frozen", "Đã khóa")}
        </Badge>
      )}
    </div>
  );

  const headerRight = (
    <div className="flex shrink-0 items-center gap-1">
      {isAuthorMode && projectId && (
        <>
          {published && assignmentId && (
            <PublishCourseLab
              workspaceId={workspaceId}
              assignmentId={assignmentId}
              position={setupLab?.position}
              topologyFrozen={Boolean(setupLab?.topologyFrozen)}
              sessionId={verifiedSession?.id}
              compact
            />
          )}
          <Button
            asChild
            size="sm"
            variant="outline"
            title={t("Test as Student", "Thử vai Sinh viên")}
            className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
          >
            <Link
              href={buildStudioLiveHref({
                workspaceId,
                assignmentId,
                mode: "student",
                sessionId: activeSessionId || undefined,
                returnTo: returnHref,
              })}
            >
              {t("Student view", "Thử vai SV")}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 shrink-0 whitespace-nowrap bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-500"
          >
            <Link href={publishHref}>
              <span className="hidden xl:inline">{t("Done · Course Builder", "Xong · Khung khóa học")}</span>
              <span className="xl:hidden">{t("Done", "Xong")}</span>
              <ArrowRight className="ml-1 size-3" aria-hidden="true" />
            </Link>
          </Button>
        </>
      )}

      {!isAuthorMode && !studentQuizLocked && (
        <>
          {canManage && (
            <Button
              asChild
              size="sm"
              variant="outline"
              title={t("Switch to Author Mode", "Chuyển sang Chế độ Giảng viên")}
              className="h-8 px-2.5 text-[13px]"
            >
              <Link
                href={buildStudioLiveHref({
                  workspaceId,
                  assignmentId,
                  mode: "author",
                  sessionId: activeSessionId || undefined,
                  returnTo: returnHref,
                })}
              >
                {t("Author", "Giảng viên")}
              </Link>
            </Button>
          )}
        </>
      )}
    </div>
  );

  const missionCardProps = useMemo(() => {
    if (isAuthorMode || studentQuizLocked) return undefined;
    if (!studentExercise && !liveStudioVerified) return undefined;
    return {
      instructions: studentExercise?.instructions ?? null,
      maxErrorRatePercent: studentExercise?.successCriteria?.maxErrorRatePercent ?? null,
      maxP95Ms: studentExercise?.successCriteria?.maxP95Ms ?? null,
      minReplicas: studentExercise?.successCriteria?.minReplicas ?? null,
      stoppedServices: studentExercise?.initialState?.stoppedServices ?? null,
      requiredTraceEdge: studentExercise?.successCriteria?.requiredTraceEdge ?? null,
      allowedActions: studentExercise?.allowedActions ?? null,
      submitHref,
      verified: liveStudioVerified,
    };
  }, [isAuthorMode, studentQuizLocked, studentExercise, liveStudioVerified, submitHref]);

  return (
    <div className="flex h-svh w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Fallback App Bar only on loading/prepare/locked screens; when canvas is active, merged into 1 single top bar */}
      {!isWorkbenchActive && (
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3.5">
          {headerLeft}
          {headerRight}
        </header>
      )}

      {/* Error strips if any mutation fails (suppress duplicate strip when full-screen initialLoadError is already shown) */}
      {(autoStudio.error || (startStudio.error && !activeSessionId && !initialLoadError)) && (
        <div className="shrink-0 space-y-1 border-b border-destructive/30 bg-destructive/10 px-4 py-2">
          {autoStudio.error && <ErrorState error={autoStudio.error} />}
          {startStudio.error && !activeSessionId && !initialLoadError && <ErrorState error={startStudio.error} />}
        </div>
      )}

      {/* Main Full-Viewport Studio Live Surface */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!workspaceId ||
        !assignmentId ||
        (client.mode === "backend" && (!isUuidSegment(workspaceId) || !isUuidSegment(assignmentId))) ? (
          <div
            role="alert"
            className="m-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
          >
            <p className="text-sm font-medium text-foreground">
              {!workspaceId || !assignmentId
                ? t(
                    "Open Studio Live from a Lab workspace.",
                    "Hãy mở Studio Live từ một bài Lab trong lớp học.",
                  )
                : t(
                    "The workspace or Lab identifier in this URL is invalid.",
                    "Mã lớp học hoặc mã bài Lab trong đường dẫn không hợp lệ.",
                  )}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={isUuidSegment(workspaceId) ? returnHref : "/courses"}>
                {t("Return to MAVIS", "Quay lại MAVIS")}
              </Link>
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className="m-auto p-6">
            <LoadingState label={t("Loading Studio Live…", "Đang tải Studio Live…")} />
          </div>
        ) : initialLoadError ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            {initialLoadError instanceof ApiError && initialLoadError.status === 403 ? (
              <>
                <Lock className="mx-auto size-7 text-amber-500" aria-hidden="true" />
                <h1 className="text-base font-semibold text-foreground">
                  {t("This Lab is currently locked", "Bài Lab này hiện chưa được mở khóa")}
                </h1>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    "Complete the prerequisite Lab(s) on your Course Roadmap before accessing MAVIS Studio here.",
                    "Hãy hoàn thành các bài Lab tiên quyết trên Lộ trình khóa học trước khi mở MAVIS Studio tại đây.",
                  )}
                </p>
                <Button asChild size="sm">
                  <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                    {t("Back to Course Roadmap", "Quay lại Lộ trình khóa học")}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <ErrorState
                  error={initialLoadError}
                  onRetry={() => {
                    void workspaces.refetch();
                    if (isAuthorMode) void assignments.refetch();
                    else void studentContext.refetch();
                  }}
                />
                <Button asChild size="sm" variant="outline">
                  <Link href={workspaceId ? `/roadmap?workspace=${encodeURIComponent(workspaceId)}` : returnHref}>
                    {t("Return to MAVIS", "Quay lại MAVIS")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        ) : studentQuizLocked ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <Lock className="mx-auto size-7 text-amber-500" aria-hidden="true" />
            <h1 className="text-base font-semibold text-foreground">
              {t("Runtime access required", "Cần điều kiện truy cập Runtime")}
            </h1>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Complete the required course work before starting your MAVIS Runtime Studio session.",
                "Hoàn tất các yêu cầu của khóa học trước khi bắt đầu phiên MAVIS Runtime Studio.",
              )}
            </p>
            <Button asChild size="sm">
              <Link href={returnHref}>{t("Return to Lab", "Quay lại Lab")}</Link>
            </Button>
          </div>
        ) : isAuthorMode && !projectId ? (
          <div className="m-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <Lock className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground">
              {t(
                "Import a repository with Docker Compose in Step 1 (Repository) first.",
                "Hãy nhập kho mã nguồn có Docker Compose ở Bước 1 (Repository) trước.",
              )}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/references?workspace=${encodeURIComponent(workspaceId)}&from=first-setup`}
              >
                {t("Go to Step 1 (Repository)", "Về Bước 1 (Repository)")}
              </Link>
            </Button>
          </div>
        ) : isAuthorMode && !showAuthorCanvas ? (
          <div className="m-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
            <h1 className="text-base font-semibold text-foreground">
              {t("Prepare Visual Studio 3D", "Chuẩn bị Studio 3D")}
            </h1>
            {availableApplications.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {availableApplications.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            )}
            {readinessBlockers.length > 0 && (
              <div className="mt-4 w-full rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-left text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="mb-1 font-medium">
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
                {autoStudio.isPending
                  ? t("Preparing Visual Studio…", "Đang chuẩn bị Studio 3D…")
                  : t("Open Visual Studio Builder", "Mở Studio 3D soạn bài")}
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
                  const isConflict =
                    (cause instanceof ApiError && cause.status === 409) ||
                    (cause instanceof Error &&
                      /version has changed|conflict|already active|409/i.test(cause.message));
                  if (isConflict) {
                    startStudio.reset();
                    void labSessions.refetch();
                    return;
                  }
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
            missionCard={missionCardProps}
          />
        )}
      </main>
    </div>
  );
}

export function StandaloneStudioLive() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh w-screen items-center justify-center bg-[#FBFBF8] text-foreground">
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
