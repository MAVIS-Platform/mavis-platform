"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useApi, useApiQuery, useSelection } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState } from "@/components/shared/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModel } from "@/features/architecture/use-model";
import {
  AnalysisStatusIndicator,
  formatAnalysisJobMessage,
} from "@/features/source-analysis/components";
import { ProjectStatusBadge, ImportSnapshotAction } from "./components";
import {
  analysisInProgress,
  snapshotAnalysisLabel,
  startSnapshotAnalysis,
  type SnapshotAnalysisRequest,
} from "./snapshot-analysis";

function formatShortTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProjectOverview() {
  const { projectId } = useSelection();
  const query = useApiQuery("project", { projectId }, { enabled: Boolean(projectId) });
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: Boolean(projectId) });
  const jobs = useApiQuery("analysisJobs", { projectId }, { enabled: Boolean(projectId) });
  const { models, model } = useModel();

  if (!projectId) return null;

  const derivedServices =
    model?.elements.filter((el) => el.elementType === "SERVICE_CONTAINER").length ??
    query.data?.services ??
    null;
  const totalEdges = model?.edges.length ?? null;
  const snapshotList = snapshots.data ?? [];
  const jobList = jobs.data ?? [];

  const snapshotById = new Map(snapshotList.map((s) => [s.id, s]));

  return (
    <RequestState query={query}>
      {query.data && (
        <div className="space-y-6">
          <DetailPanel
            title={query.data.name}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {models.length === 0 && (
                  <Button asChild size="sm" variant="default">
                    <Link href={`/snapshots?project=${projectId}`}>Analyze Source</Link>
                  </Button>
                )}
                <ImportSnapshotAction />
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
              <ProjectStatusBadge status={query.data.status} />
              {query.data.repository && (
                <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono">
                  {query.data.repository}
                </span>
              )}
              {query.data.defaultBranch && (
                <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono">
                  branch: {query.data.defaultBranch}
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Services" value={derivedServices ?? "0"} />
              <SummaryCard label="Connections" value={totalEdges ?? "0"} />
              <SummaryCard label="Architecture revisions" value={models.length} />
              <SummaryCard label="Source snapshots" value={snapshotList.length} />
            </div>
          </DetailPanel>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <DetailPanel
              title="Architecture revisions"
              actions={
                models.length > 1 ? (
                  <Link
                    href={`/compare?project=${projectId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Compare revisions →
                  </Link>
                ) : undefined
              }
            >
              {models.length > 0 ? (
                <div className="divide-y rounded-lg border bg-background/40">
                  {models.slice(0, 6).map((rev, idx) => {
                    const snap = snapshotById.get(rev.snapshotId);
                    return (
                      <div
                        key={rev.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">Revision {rev.revision}</span>
                            {idx === 0 && <Badge variant="secondary">Latest</Badge>}
                          </div>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {snap ? snap.name : `Snapshot ${rev.snapshotId.slice(0, 8)}`}
                            {"createdAt" in rev && rev.createdAt
                              ? ` · ${formatShortTimestamp(rev.createdAt)}`
                              : ""}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/architecture?project=${projectId}&model=${rev.id}`}>
                            View
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No architecture revisions yet.</p>
              )}
            </DetailPanel>

            <DetailPanel
              title="Source snapshots & analysis runs"
              actions={
                <div className="flex items-center gap-3">
                  <Link
                    href={`/snapshots?project=${projectId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Snapshots ({snapshotList.length})
                  </Link>
                  <Link
                    href={`/analysis-history?project=${projectId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    History ({jobList.length})
                  </Link>
                </div>
              }
            >
              {jobList.length > 0 ? (
                <div className="divide-y rounded-lg border bg-background/40">
                  {jobList.slice(0, 5).map((job) => {
                    const snap = snapshotById.get(job.snapshotId);
                    const producedRev = models.find((m) => m.id === job.modelId);
                    return (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <AnalysisStatusIndicator job={job} compact />
                            {producedRev && (
                              <Badge variant="outline">→ Revision {producedRev.revision}</Badge>
                            )}
                          </div>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {snap ? snap.name : `Snapshot ${job.snapshotId.slice(0, 8)}`}
                          </p>
                        </div>
                        {job.modelId ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/architecture?project=${projectId}&model=${job.modelId}`}>
                              Open →
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/snapshots?project=${projectId}&snapshot=${job.snapshotId}`}
                            >
                              Retry
                            </Link>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {snapshotList.length > 0
                      ? `Found ${snapshotList.length} snapshot(s) ready for analysis.`
                      : "No source snapshots imported yet."}
                  </p>
                  <Button asChild size="sm">
                    <Link href={`/snapshots?project=${projectId}`}>
                      {snapshotList.length > 0 ? "Analyze Snapshot" : "Import Source"}
                    </Link>
                  </Button>
                </div>
              )}
            </DetailPanel>
          </div>
        </div>
      )}
    </RequestState>
  );
}

export function SourceSnapshots() {
  const { projectId } = useSelection();
  const adapter = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const highlightedSnapshotId = searchParams.get("snapshot") ?? "";
  const requestedJobId = searchParams.get("job") ?? "";

  const [analyzingSnapshotId, setAnalyzingSnapshotId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const navigatingRef = useRef(false);
  const startingRef = useRef(false);
  const analysisRequestRef = useRef<SnapshotAnalysisRequest | null>(null);

  const query = useApiQuery("snapshots", { projectId }, { enabled: Boolean(projectId) });
  const jobs = useApiQuery(
    "analysisJobs",
    { projectId },
    { enabled: Boolean(projectId), poll: true },
  );
  const activeJobQuery = useApiQuery(
    "analysisJob",
    { jobId: activeJobId },
    { enabled: Boolean(activeJobId), poll: Boolean(activeJobId) },
  );
  const { models } = useModel();

  useEffect(() => {
    if (!projectId || !requestedJobId || !highlightedSnapshotId) return;
    navigatingRef.current = false;
    setAnalyzingSnapshotId(highlightedSnapshotId);
    setActiveJobId(requestedJobId);
    setProgressPct(null);
    setAnalysisError(null);
  }, [projectId, requestedJobId, highlightedSnapshotId]);

  // Sync with backend reported progress & auto-navigate to Architecture Graph Explorer on completion
  useEffect(() => {
    const job = activeJobQuery.data;
    if (!job || !analyzingSnapshotId || !projectId) return;
    if (job.projectId !== projectId || job.snapshotId !== analyzingSnapshotId) {
      setAnalysisError("Analysis job does not match this project snapshot.");
      setAnalyzingSnapshotId(null);
      setActiveJobId("");
      setProgressPct(null);
      return;
    }

    if (typeof job.progress === "number" && job.progress >= 0) {
      setProgressPct(Math.min(99, job.progress));
    }

    const isCompleted = job.status === "completed" || job.status === "partial";
    const isFailed =
      job.status === "failed" || job.status === "cancelled" || job.status === "timed-out";

    if (isCompleted && !navigatingRef.current) {
      navigatingRef.current = true;
      setProgressPct(100);
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: ["api", "models"] });
        await queryClient.invalidateQueries({ queryKey: ["api", "modelVersions"] });
        await queryClient.invalidateQueries({ queryKey: ["api", "analysisJobs"] });
        await queryClient.invalidateQueries({ queryKey: ["api", "projectOverviews"] });

        let resolvedModelId = job.modelId ?? "";
        if (!resolvedModelId) {
          try {
            const refreshedModels =
              adapter.mode === "backend"
                ? await adapter.execute("modelVersions", { projectId })
                : await adapter.execute("models", { projectId });
            const sorted = [...refreshedModels].sort((a, b) => b.revision - a.revision);
            const matched = sorted.find((m) => m.snapshotId === analyzingSnapshotId);
            if (matched) resolvedModelId = matched.id;
          } catch {
            // fallback to project-level graph navigation
          }
        }
        if (!resolvedModelId) {
          setAnalysisError(
            "Analysis finished, but no model revision for this snapshot is available yet. Refresh to retry loading the result.",
          );
          setAnalyzingSnapshotId(null);
          setActiveJobId("");
          setProgressPct(null);
          return;
        }
        const targetHref = resolvedModelId
          ? `/architecture?project=${encodeURIComponent(projectId)}&model=${encodeURIComponent(resolvedModelId)}`
          : `/architecture?project=${encodeURIComponent(projectId)}`;
        (requestedJobId === job.id ? router.replace : router.push)(targetHref);
      })();
    } else if (isFailed) {
      setAnalysisError(formatAnalysisJobMessage(job));
      setAnalyzingSnapshotId(null);
      setActiveJobId("");
      setProgressPct(null);
    }
  }, [
    activeJobQuery.data,
    analyzingSnapshotId,
    projectId,
    adapter,
    queryClient,
    router,
    requestedJobId,
  ]);

  async function handleStartAnalysis(snapshotId: string) {
    if (
      !projectId ||
      analyzingSnapshotId ||
      startingRef.current ||
      jobs.data?.some(analysisInProgress)
    )
      return;
    startingRef.current = true;
    if (requestedJobId) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("job");
      next.set("snapshot", snapshotId);
      router.replace(`/snapshots?${next}`, { scroll: false });
    }
    navigatingRef.current = false;
    setAnalysisError(null);
    setAnalyzingSnapshotId(snapshotId);
    setProgressPct(null);
    try {
      if (
        analysisRequestRef.current?.projectId !== projectId ||
        analysisRequestRef.current?.snapshotId !== snapshotId
      ) {
        analysisRequestRef.current = { projectId, snapshotId, idempotencyKey: crypto.randomUUID() };
      }
      const startedJob = await startSnapshotAnalysis(adapter, analysisRequestRef.current);
      analysisRequestRef.current = null;
      setActiveJobId(startedJob.id);
      setProgressPct(startedJob.progress);
      void queryClient.invalidateQueries({ queryKey: ["api", "analysisJobs"] });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to start snapshot analysis.");
      setAnalyzingSnapshotId(null);
      setActiveJobId("");
      setProgressPct(null);
      void queryClient.invalidateQueries({ queryKey: ["api", "analysisJobs"] });
    } finally {
      startingRef.current = false;
    }
  }

  if (!projectId) return null;

  const snapshotList = query.data ?? [];
  const jobList = jobs.data ?? [];

  return (
    <RequestState query={query} empty={!snapshotList.length}>
      <div className="space-y-4">
        {analysisError && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {analysisError}
          </p>
        )}

        <DataTable
          rows={snapshotList}
          rowKey={(s) => s.id}
          caption="Source snapshots"
          columns={[
            {
              key: "snapshot",
              label: "Snapshot",
              render: (s) => {
                const idx = snapshotList.findIndex((item) => item.id === s.id);
                const number = snapshotList.length - idx;
                const isNew = highlightedSnapshotId === s.id;
                return (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Snapshot #{number}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {s.id.slice(0, 8)}
                      </span>
                      {isNew && <Badge variant="secondary">Just imported</Badge>}
                    </div>
                    {s.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {formatShortTimestamp(s.createdAt)}
                      </p>
                    )}
                  </div>
                );
              },
            },
            {
              key: "name",
              label: "Source / Commit",
              render: (s) => <span className="font-mono text-xs">{s.name}</span>,
            },
            {
              key: "status",
              label: "Analysis status",
              render: (s) => {
                if (analyzingSnapshotId === s.id) {
                  return (
                    <div className="min-w-36 space-y-1.5" role="status" aria-live="polite">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          Analyzing…
                        </span>
                        {progressPct !== null && (
                          <span className="font-mono font-semibold">{progressPct}%</span>
                        )}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full bg-primary transition-all duration-300 ${progressPct === null ? "motion-safe:animate-pulse" : ""}`}
                          style={{ width: `${progressPct ?? 33}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  );
                }
                const snapJobs = jobList.filter((j) => j.snapshotId === s.id);
                const latestJob = snapJobs[0] ?? null;
                if (!latestJob) {
                  return <StatusBadge status="not analyzed" variant="outline" />;
                }
                return (
                  <StatusBadge
                    status={latestJob.status}
                    variant={
                      latestJob.status === "completed"
                        ? "success"
                        : latestJob.status === "failed"
                          ? "destructive"
                          : "info"
                    }
                  />
                );
              },
            },
            {
              key: "revisions",
              label: "Generated revisions",
              render: (s) => {
                const matchingModels = models.filter((m) => m.snapshotId === s.id);
                if (matchingModels.length === 0) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {matchingModels.map((m) => (
                      <Link
                        key={m.id}
                        href={`/architecture?project=${projectId}&model=${m.id}`}
                        className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-medium text-primary hover:underline"
                      >
                        Revision {m.revision}
                        {m.id === models[0]?.id ? " (Latest)" : ""}
                      </Link>
                    ))}
                  </div>
                );
              },
            },
            {
              key: "actions",
              label: "Actions",
              render: (s) => {
                const latestModel = models.find((m) => m.snapshotId === s.id);
                const latestJob = jobList.find((job) => job.snapshotId === s.id);
                const isAnalyzingThis = analyzingSnapshotId === s.id;
                const isAnalyzingAny =
                  Boolean(analyzingSnapshotId) ||
                  jobs.isPending ||
                  jobList.some(analysisInProgress);
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {latestModel && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/architecture?project=${projectId}&model=${latestModel.id}`}>
                          View
                        </Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={latestModel && !isAnalyzingThis ? "ghost" : "default"}
                      disabled={isAnalyzingAny}
                      title="Analyze the same stored source and commit. A successful run creates a new revision; previous revisions are kept."
                      onClick={() => {
                        void handleStartAnalysis(s.id);
                      }}
                    >
                      {isAnalyzingThis ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          {progressPct === null
                            ? "Analyzing…"
                            : progressPct >= 100
                              ? "Opening Graph…"
                              : `Analyzing… ${progressPct}%`}
                        </span>
                      ) : (
                        snapshotAnalysisLabel(latestJob, Boolean(latestModel))
                      )}
                    </Button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>
    </RequestState>
  );
}

export function AnalysisHistory() {
  const { projectId } = useSelection();
  const query = useApiQuery(
    "analysisJobs",
    { projectId },
    { enabled: Boolean(projectId), poll: true },
  );
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: Boolean(projectId) });
  const { models } = useModel();

  if (!projectId) return null;

  const jobs = query.data ?? [];
  const snapshotById = new Map((snapshots.data ?? []).map((s) => [s.id, s]));
  const modelById = new Map(models.map((m) => [m.id, m]));
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <RequestState query={query} empty={!jobs.length}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total analysis runs" value={jobs.length} />
          <SummaryCard label="Completed runs" value={completedCount} />
          <SummaryCard label="Failed runs" value={failedCount} />
          <SummaryCard label="Published revisions" value={models.length} />
        </div>

        <DataTable
          rows={jobs}
          rowKey={(job) => job.id}
          caption="Analysis history"
          columns={[
            {
              key: "status",
              label: "Status",
              render: (job) => (
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={job.status}
                    variant={
                      job.status === "completed"
                        ? "success"
                        : job.status === "failed"
                          ? "destructive"
                          : "info"
                    }
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    #{job.id.slice(0, 8)}
                  </span>
                </div>
              ),
            },
            {
              key: "snapshot",
              label: "Source snapshot",
              render: (job) => {
                const snap = snapshotById.get(job.snapshotId);
                return (
                  <div className="space-y-0.5">
                    <p className="font-mono text-xs font-medium">
                      {snap ? snap.name : `Snapshot ${job.snapshotId.slice(0, 8)}`}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      ID: {job.snapshotId.slice(0, 8)}
                      {snap?.createdAt ? ` · ${formatShortTimestamp(snap.createdAt)}` : ""}
                    </p>
                  </div>
                );
              },
            },
            {
              key: "summary",
              label: "Diagnostic summary",
              render: (job) => (
                <span className="text-xs text-muted-foreground">
                  {formatAnalysisJobMessage(job)}
                </span>
              ),
            },
            {
              key: "revision",
              label: "Output revision",
              render: (job) => {
                const rev = job.modelId ? modelById.get(job.modelId) : null;
                if (!job.modelId) {
                  return <span className="text-xs text-muted-foreground">No model published</span>;
                }
                return (
                  <Badge variant="secondary">
                    {rev ? `Revision ${rev.revision}` : `Model ${job.modelId.slice(0, 8)}`}
                    {rev?.id === models[0]?.id ? " · Latest" : ""}
                  </Badge>
                );
              },
            },
            {
              key: "actions",
              label: "Actions",
              render: (job) =>
                job.modelId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/diagrams?project=${projectId}&model=${job.modelId}`}>
                        Open Diagrams
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/architecture?project=${projectId}&model=${job.modelId}`}>
                        Open Graph
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/snapshots?project=${projectId}&snapshot=${job.snapshotId}`}>
                      Re-run analysis
                    </Link>
                  </Button>
                ),
            },
          ]}
        />
      </div>
    </RequestState>
  );
}
