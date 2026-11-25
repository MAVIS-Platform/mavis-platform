"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  buildStudioLiveHref,
  parseStudioTopology,
  type StudioExerciseView,
} from "@/features/runtime/standalone-studio-live";
import {
  computeMiniTopologyLayout,
  computeStaticBlastRadius,
  resolveModelServiceEdges,
} from "@/features/runtime/studio-authoring-helpers";
import { type Assignment } from "./requirements";

export function LabStudioSection({
  workspaceId,
  assignment,
}: {
  workspaceId: string;
  assignment: Assignment;
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
  const setup = useCourseSetup(workspaceId);
  const courseReference = setup.data?.reference;
  const projectId =
    courseReference?.projectId ??
    assignment.referenceSource?.projectId ??
    exercise.data?.runtimeProjectId ??
    null;
  const snapshotId =
    courseReference?.snapshotId ??
    assignment.referenceSource?.snapshotId ??
    exercise.data?.runtimeSnapshotId ??
    undefined;
  const svgPrefix = useId().replace(/:/g, "");
  const readiness = useRuntimeSetupReadiness(projectId);
  const buildImages = useApiMutation("buildRuntimeSandboxImages");
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
  const runtimeConfig = useApiQuery(
    "runtimeConfiguration",
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const modelId =
    runtimeConfig.data?.modelId ??
    courseReference?.modelId ??
    assignment.referenceSource?.modelId ??
    exercise.data?.runtimeModelId ??
    null;
  const referenceModel = useApiQuery(
    "model",
    { modelId: modelId ?? "", projectId: projectId ?? "" },
    { enabled: Boolean(modelId && projectId) },
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

  const [prepareStage, setPrepareStage] = useState<"idle" | "building" | "configuring">("idle");
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const previewTopology = useMemo(
    () =>
      parseStudioTopology(runtimeConfig.data?.profile?.["studioTopology"]) ??
      parseStudioTopology(readiness.data?.topology),
    [runtimeConfig.data?.profile, readiness.data?.topology],
  );
  const serviceMappings = useMemo(() => {
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
  const verifiedSession =
    sessionList.find(
      (session) => session.assignmentId === assignment.id && session.studioVerified,
    ) ?? (labSessions.data ?? []).find((session) => session.studioVerified);
  const isPreparing = prepareStage !== "idle" || buildImages.isPending || autoStudio.isPending;

  const autoLinkedRef = useRef<string | null>(null);
  // Auto-link newly created Labs to the already-ready Course Docker runtime so lecturers never need Sync Docker per Lab.
  useEffect(() => {
    if (
      !projectId ||
      !isRuntimeReady ||
      exercise.isPending ||
      autoStudio.isPending ||
      buildImages.isPending ||
      autoLinkedRef.current === assignment.id
    ) {
      return;
    }
    if (assignment.referenceSource?.projectId && exercise.data) return;
    autoLinkedRef.current = assignment.id;
    autoStudio.mutate(undefined, {
      onSuccess: () => {
        void exercise.refetch();
        void runtimeConfig.refetch();
        void readiness.refetch();
        void setup.refetch();
      },
    });
  }, [
    projectId,
    isRuntimeReady,
    exercise.isPending,
    exercise.data,
    assignment.id,
    assignment.referenceSource?.projectId,
    autoStudio,
    buildImages.isPending,
    exercise,
    runtimeConfig,
    readiness,
    setup,
  ]);

  const returnTo = `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}&tab=studio`;
  const studioLiveHref = buildStudioLiveHref({
    workspaceId,
    assignmentId: assignment.id,
    mode: "author",
    returnTo,
  });

  const stoppedSet = useMemo(
    () => new Set(exercise.data?.initialState?.stoppedServices ?? []),
    [exercise.data?.initialState?.stoppedServices],
  );
  const minReplicaMap = useMemo(
    () =>
      new Map(
        (exercise.data?.successCriteria?.minReplicas ?? []).map((item) => [item.service, item.count]),
      ),
    [exercise.data?.successCriteria?.minReplicas],
  );
  const impactTarget = exercise.data?.successCriteria?.targetChangeAction?.service ?? null;
  const displayServices = useMemo(
    () =>
      previewTopology?.blocks.length
        ? previewTopology.blocks.map((block) => block.service)
        : availableApplications,
    [previewTopology?.blocks, availableApplications],
  );

  const runPrepareRuntime = async (openAfter: boolean) => {
    if (!projectId || isPreparing) return;
    setPrepareError(null);
    try {
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
                  "Docker runtime still has unresolved Runner requirements. Review the check above and retry.",
                  "Docker runtime vẫn còn yêu cầu Runner chưa được giải quyết. Kiểm tra lại và thử đồng bộ.",
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

  const goalSummary = (() => {
    const kind = exercise.data?.successCriteria?.exerciseType;
    if (kind === "CHANGE_IMPACT") return t("Change Impact", "Phân tích ảnh hưởng");
    if (kind === "SCALE_UNDER_LOAD") return t("Scale-Out", "Chịu tải & Scale");
    if (kind === "CIRCUIT_BREAKER") return t("Outage Recovery", "Khôi phục sự cố");
    if (kind === "CONFIG_REGRESSION") return t("CPU Degradation", "Tắc nghẽn CPU");
    if (kind === "CASCADING_FAILURE") return t("Cascading Failure", "Lỗi lan truyền");
    if (kind === "CUSTOM") return t("Custom Scenario", "Kịch bản tùy chỉnh");
    return null;
  })();

  const targetAction = exercise.data?.successCriteria?.targetChangeAction ?? null;
  const baselineRequest = exercise.data?.baselineRequests?.[0] ?? null;

  const topologyEdges = useMemo(() => {
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
    for (const m of resolveModelServiceEdges(referenceModel.data, serviceMappings, displayServices)) {
      add(m.from, m.to);
    }
    return edges;
  }, [previewTopology?.connections, referenceModel.data, serviceMappings, displayServices]);

  const blastRadius = useMemo(
    () =>
      impactTarget && exercise.data?.successCriteria?.exerciseType === "CHANGE_IMPACT"
        ? computeStaticBlastRadius(impactTarget, topologyEdges)
        : null,
    [impactTarget, exercise.data?.successCriteria?.exerciseType, topologyEdges],
  );
  const impactedUpstreamSet = useMemo(
    () => new Set(blastRadius?.upstreamImpacted ?? []),
    [blastRadius],
  );

  const miniLayout = useMemo(() => {
    const priority = [
      ...Array.from(stoppedSet),
      ...(impactTarget ? [impactTarget] : []),
      ...Array.from(minReplicaMap.keys()),
    ];
    return computeMiniTopologyLayout(displayServices, topologyEdges, {
      priorityServices: priority,
      maxNodes: 12,
    });
  }, [displayServices, topologyEdges, stoppedSet, impactTarget, minReplicaMap]);

  const criteriaItems = useMemo(() => {
    const items: string[] = [];
    if (targetAction?.service) {
      if (targetAction.action === "THROTTLE_CPU") {
        items.push(`CPU ${targetAction.cpuPercent ?? 25}% ${targetAction.service}`);
      } else {
        items.push(`${targetAction.action} ${targetAction.service}`);
      }
    }
    if (stoppedSet.size > 0) {
      items.push(`${t("Starts down", "Tắt sẵn")}: ${Array.from(stoppedSet).join(", ")}`);
    }
    for (const [svc, count] of minReplicaMap.entries()) {
      if (count > 1) items.push(`Scale >= ${count}x ${svc}`);
    }
    if (exercise.data?.successCriteria?.predictionRequired) {
      items.push(t("Prediction required", "Yêu cầu dự đoán trước"));
    }
    if (
      items.length === 0 &&
      exercise.data?.successCriteria?.maxErrorRatePercent != null
    ) {
      items.push(
        `${t("Max error", "Lỗi tối đa")} <= ${exercise.data.successCriteria.maxErrorRatePercent}%`,
      );
    }
    return items;
  }, [targetAction, stoppedSet, minReplicaMap, exercise.data?.successCriteria, t]);

  const hasConfiguredExercise = Boolean(
    goalSummary ||
      stoppedSet.size > 0 ||
      impactTarget ||
      minReplicaMap.size > 0 ||
      exercise.data?.successCriteria?.requiredTraceEdge ||
      exercise.data?.successCriteria?.maxP95Ms != null ||
      (exercise.data?.revision ?? 0) > 1,
  );

  const checklist = [
    {
      id: "runtime",
      done: isRuntimeReady,
      label: t("Docker runtime ready", "Docker runtime sẵn sàng"),
    },
    {
      id: "scenario",
      done: hasConfiguredExercise,
      label: t("Exercise scenario configured", "Đã thiết lập kịch bản 3D"),
    },
    {
      id: "verified",
      done: Boolean(verifiedSession),
      label: verifiedSession
        ? `${t("Playtest verified", "Đã chạy thử xác minh")} (${verifiedSession.id.slice(0, 8)})`
        : t("Live playtest verified", "Đã chạy thử xác minh"),
    },
  ];

  const hasLegendDown = miniLayout.nodes.some((n) => stoppedSet.has(n.service));
  const hasLegendTarget = miniLayout.nodes.some(
    (n) => impactTarget === n.service && !stoppedSet.has(n.service),
  );
  const hasLegendImpacted = miniLayout.nodes.some((n) => impactedUpstreamSet.has(n.service));
  const hasLegendScale = miniLayout.nodes.some((n) => (minReplicaMap.get(n.service) ?? 0) > 1);

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{t("Visual Studio Builder", "Studio 3D soạn bài")}</h2>
            {isRuntimeReady && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {t("Runtime ready", "Runtime sẵn sàng")}
              </span>
            )}
            {goalSummary && <Badge variant="outline">{goalSummary}</Badge>}
            {setupLab?.topologyFrozen && (
              <Badge variant="success">{t("Frozen", "Đã khóa")}</Badge>
            )}
          </div>

          {projectId && (
            <div className="flex flex-wrap items-center gap-2">
              {isRuntimeReady && (
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(
                      "Rebuild Docker images on the Runner and re-sync the 3D service graph from your latest repository snapshot. Only needed after repository or Dockerfile changes.",
                      "Build lại Docker image trên Runner và đồng bộ lại sơ đồ service 3D theo snapshot mới nhất của repo. Chỉ cần bấm khi vừa cập nhật repo hoặc Dockerfile.",
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
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

        {setup.isPending && !projectId ? (
          <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            {t("Loading Course Repository…", "Đang tải Repository của Course…")}
          </div>
        ) : !projectId ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t(
              "Import a repository with Docker Compose in Step 1 (Repository) first.",
              "Hãy nhập repository có Docker Compose ở Bước 1 (Repository) trước.",
            )}
          </div>
        ) : !isRuntimeReady ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 py-10 text-center">
            <h3 className="text-base font-semibold text-foreground">
              {t("Open Visual Studio Builder", "Mở Studio 3D soạn bài")}
            </h3>
            <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
              {t(
                "Prepare the Docker runtime once, then design the exercise directly on the 3D service graph by clicking or dragging chips onto blocks.",
                "Chuẩn bị Docker runtime một lần rồi thiết kế đề bài trực tiếp trên sơ đồ 3D bằng cách chọn hoặc kéo thả lên từng service.",
              )}
            </p>

            {availableApplications.length > 0 && (
              <div className="mt-4 flex max-w-xl flex-wrap items-center justify-center gap-1.5">
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
              <Button
                type="button"
                size="lg"
                disabled={isPreparing}
                onClick={() => void runPrepareRuntime(true)}
              >
                {prepareStage === "building"
                  ? t("Building & pinning Docker images…", "Đang build & ghim Docker image…")
                  : isPreparing
                    ? t("Preparing Docker runtime…", "Đang chuẩn bị Docker runtime…")
                    : t("Open Visual Studio Builder", "Mở Studio 3D soạn bài")}
                {!isPreparing && <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        ) : (
          <div
            data-testid="lab-studio-launchpad"
            className="grid gap-5 rounded-xl border border-border/80 bg-muted/25 p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
          >
            {/* Left column: Exercise spec summary + 3-step readiness checklist + primary CTA */}
            <div className="flex min-w-0 flex-col justify-between gap-4">
              <div className="space-y-3.5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("Exercise Goal", "Dạng bài")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {goalSummary ?? (
                        <span className="font-normal text-muted-foreground">
                          {t("Not configured yet", "Chưa thiết lập kịch bản")}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("Baseline Endpoint", "Endpoint kiểm thử")}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs font-medium text-foreground">
                      {baselineRequest?.path ? (
                        `${baselineRequest.method} ${baselineRequest.path}`
                      ) : (
                        <span className="font-sans font-normal text-muted-foreground">
                          {t("Auto-detected in Studio", "Tự nhận diện trong Studio")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/80 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("Target & Success Criteria", "Mục tiêu & Tiêu chí chấm")}
                  </p>
                  {criteriaItems.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {criteriaItems.map((item) => (
                        <span
                          key={item}
                          className="rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
                        >
                          {item}
                        </span>
                      ))}
                      {blastRadius && blastRadius.upstreamImpacted.length > 0 && (
                        <span className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          {t(
                            `Blast radius: ${blastRadius.upstreamImpacted.length} upstream`,
                            `Lan truyền: ${blastRadius.upstreamImpacted.length} nhánh upstream`,
                          )}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "No fault or target assigned yet. Open 3D Studio to drop a goal onto any service block.",
                        "Chưa gắn sự cố hoặc mục tiêu. Mở Studio 3D để chọn dạng bài và gắn lên khối service.",
                      )}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    {exercise.data?.instructions?.trim()
                      ? exercise.data.instructions
                      : t(
                          "Open the 3D Studio to pick a goal, drop faults or targets directly onto service blocks, and run a live test.",
                          "Mở Studio 3D để chọn dạng bài, gắn sự cố hoặc mục tiêu trực tiếp lên từng khối service và chạy thử Docker.",
                        )}
                  </p>
                </div>

                <ol
                  aria-label={t("Studio readiness checklist", "Tiến độ chuẩn bị Studio")}
                  className="grid gap-1.5 sm:grid-cols-3"
                >
                  {checklist.map((step, index) => (
                    <li
                      key={step.id}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                        step.done
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                          : "border-border/70 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      {step.done ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Circle className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                      )}
                      <span className="truncate font-medium">
                        {index + 1}. {step.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  asChild
                  size="lg"
                  className="shrink-0 bg-emerald-600 px-5 text-white hover:bg-emerald-500"
                >
                  <Link href={studioLiveHref}>
                    {t("Open Visual Studio Builder", "Mở Studio 3D soạn bài")}
                    <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  {!hasConfiguredExercise
                    ? t(
                        "Pick a goal & configure on the 3D stage",
                        "Chọn dạng bài và cấu hình trực tiếp trên sân khấu 3D",
                      )
                    : !verifiedSession
                      ? t(
                          "Run 1 live Docker playtest to verify",
                          "Chạy thử 1 phiên Docker để xác minh trước khi mở lớp",
                        )
                      : t(
                          "Ready for students — reopen anytime to adjust",
                          "Đã sẵn sàng cho sinh viên — có thể mở lại để tinh chỉnh",
                        )}
                </span>
              </div>
            </div>

            {/* Right column: Mini Topology SVG Preview */}
            <div
              data-testid="lab-studio-mini-topology"
              className="flex min-w-0 flex-col justify-between rounded-xl border border-border/75 bg-card/90 p-3.5 shadow-2xs"
            >
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {t("Architecture Preview", "Sơ đồ kiến trúc")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {displayServices.length} {displayServices.length === 1 ? "service" : "services"}
                  </span>
                  {miniLayout.edges.length > 0 && (
                    <span className="rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {miniLayout.edges.length} {t("links", "kết nối")}
                    </span>
                  )}
                </div>
                {(hasLegendDown || hasLegendTarget || hasLegendImpacted || hasLegendScale) && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    {hasLegendDown && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                        Down
                      </span>
                    )}
                    {hasLegendTarget && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        Target
                      </span>
                    )}
                    {hasLegendImpacted && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-400/70" aria-hidden="true" />
                        {t("Impacted", "Ảnh hưởng")}
                      </span>
                    )}
                    {hasLegendScale && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-sky-500" aria-hidden="true" />
                        Scale
                      </span>
                    )}
                  </div>
                )}
              </div>

              {miniLayout.nodes.length > 0 ? (
                <div
                  className="flex flex-1 items-center justify-center overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-2"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, color-mix(in oklab, var(--border) 70%, transparent) 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                  }}
                >
                  <svg
                    viewBox={`0 0 ${miniLayout.width} ${miniLayout.height}`}
                    role="img"
                    aria-label={t(
                      `Mini architecture graph of ${displayServices.length} services`,
                      `Sơ đồ kiến trúc thu gọn của ${displayServices.length} service`,
                    )}
                    className="h-auto max-h-[210px] w-full min-w-[280px]"
                  >
                    <defs>
                      <marker
                        id={`${svgPrefix}-arrow`}
                        viewBox="0 0 8 8"
                        refX="7"
                        refY="4"
                        markerWidth="5.5"
                        markerHeight="5.5"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M 0 1 L 7 4 L 0 7 z"
                          className="fill-muted-foreground/60"
                        />
                      </marker>
                      <marker
                        id={`${svgPrefix}-arrow-impact`}
                        viewBox="0 0 8 8"
                        refX="7"
                        refY="4"
                        markerWidth="5.5"
                        markerHeight="5.5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 7 4 L 0 7 z" className="fill-amber-500" />
                      </marker>
                    </defs>

                    {miniLayout.edges.map((edge) => {
                      const isImpacted = Boolean(blastRadius?.impactedEdgeKeys.has(edge.key));
                      return (
                        <path
                          key={edge.key}
                          d={edge.path}
                          fill="none"
                          strokeWidth={isImpacted ? 1.8 : 1.35}
                          markerEnd={`url(#${svgPrefix}-${isImpacted ? "arrow-impact" : "arrow"})`}
                          className={
                            isImpacted
                              ? "stroke-amber-500/90"
                              : "stroke-muted-foreground/45"
                          }
                        />
                      );
                    })}

                    {miniLayout.nodes.map((node) => {
                      const startsDown = stoppedSet.has(node.service);
                      const isTarget = impactTarget === node.service;
                      const isImpacted = impactedUpstreamSet.has(node.service);
                      const minRep = minReplicaMap.get(node.service);
                      const tagText = startsDown
                        ? "0x"
                        : isTarget
                          ? "Target"
                          : minRep && minRep > 1
                            ? `>=${minRep}x`
                            : null;
                      const maxChars = tagText ? 11 : 16;
                      const label =
                        node.service.length > maxChars
                          ? `${node.service.slice(0, maxChars - 1)}…`
                          : node.service;

                      const boxClass = startsDown
                        ? "fill-rose-500/10 stroke-rose-500/65"
                        : isTarget
                          ? "fill-amber-500/12 stroke-amber-500/75"
                          : isImpacted
                            ? "fill-amber-500/6 stroke-amber-500/45"
                            : "fill-background stroke-border";
                      const dotClass = startsDown
                        ? "fill-rose-500"
                        : isTarget
                          ? "fill-amber-500"
                          : isImpacted
                            ? "fill-amber-400"
                            : "fill-emerald-500";
                      const tagClass = startsDown
                        ? "fill-rose-600 dark:fill-rose-400"
                        : isTarget
                          ? "fill-amber-700 dark:fill-amber-300"
                          : "fill-sky-600 dark:fill-sky-400";

                      return (
                        <g key={node.service}>
                          <title>{node.service}</title>
                          <rect
                            x={node.x}
                            y={node.y}
                            width={node.w}
                            height={node.h}
                            rx={8}
                            strokeWidth={startsDown || isTarget ? 1.5 : 1.15}
                            className={boxClass}
                          />
                          <circle
                            cx={node.x + 12}
                            cy={node.y + node.h / 2}
                            r={3.2}
                            className={dotClass}
                          />
                          <text
                            x={node.x + 21}
                            y={node.y + node.h / 2 + 3.8}
                            fontSize={10.5}
                            className="fill-foreground font-mono font-medium"
                          >
                            {label}
                          </text>
                          {tagText && (
                            <text
                              x={node.x + node.w - 8}
                              y={node.y + node.h / 2 + 3.5}
                              textAnchor="end"
                              fontSize={9.5}
                              className={`font-mono font-semibold ${tagClass}`}
                            >
                              {tagText}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-xs text-muted-foreground">
                  {t("No services detected yet.", "Chưa phát hiện service nào.")}
                </div>
              )}

              {miniLayout.hiddenCount > 0 && (
                <p className="mt-2 text-right text-[11px] text-muted-foreground">
                  {t(
                    `+${miniLayout.hiddenCount} more services visible in 3D Studio`,
                    `+${miniLayout.hiddenCount} service khác hiển thị đầy đủ trong Studio 3D`,
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
