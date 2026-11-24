"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
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
import {
  buildStudioLiveHref,
  parseStudioTopology,
  type StudioExerciseView,
} from "@/features/runtime/standalone-studio-live";
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
  const readiness = useRuntimeSetupReadiness(projectId);
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
  const impactTarget = exercise.data?.successCriteria?.targetChangeAction?.service ?? null;
  const displayServices = previewTopology?.blocks.length
    ? previewTopology.blocks.map((block) => block.service)
    : availableApplications;

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
    return null;
  })();

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
          <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-slate-800/80 bg-[#070b12] px-6 py-7 text-slate-100 sm:flex-row">
            <div className="min-w-0 space-y-3 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  {displayServices.length} {displayServices.length === 1 ? "service" : "services"}
                </span>
                {exercise.data?.baselineRequests?.[0]?.path && (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                    GET {exercise.data.baselineRequests[0].path}
                  </span>
                )}
                {verifiedSession && (
                  <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 font-mono text-[11px] text-teal-300">
                    {t("Verified", "Đã xác minh")} {verifiedSession.id.slice(0, 8)}
                  </span>
                )}
              </div>

              {displayServices.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  {displayServices.map((svc) => {
                    const startsDown = stoppedSet.has(svc);
                    const minRep = minReplicaMap.get(svc);
                    const isTarget = impactTarget === svc;
                    return (
                      <span
                        key={svc}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs ${
                          startsDown
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : isTarget
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              : "border-slate-700 bg-slate-900 text-slate-200"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            startsDown
                              ? "bg-rose-400"
                              : isTarget
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                          }`}
                          aria-hidden="true"
                        />
                        {svc}
                        {startsDown && (
                          <span className="text-[10px] text-rose-300">Down</span>
                        )}
                        {isTarget && !startsDown && (
                          <span className="text-[10px] text-amber-300">Target</span>
                        )}
                        {minRep && minRep > 1 && (
                          <span className="rounded bg-sky-500/20 px-1 text-[10px] text-sky-300">
                            &gt;={minRep}x
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              <p className="max-w-2xl text-xs text-slate-300">
                {exercise.data?.instructions
                  ? exercise.data.instructions
                  : t(
                      "Open the 3D Studio to pick a goal, drop faults or targets directly onto service blocks, and run a live test.",
                      "Mở Studio 3D để chọn dạng bài, gắn sự cố hoặc mục tiêu trực tiếp lên từng khối service và chạy thử Docker.",
                    )}
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-center">
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
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
