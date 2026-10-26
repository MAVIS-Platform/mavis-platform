"use client";
import Link from "next/link";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState } from "@/components/shared/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModel } from "@/features/architecture/use-model";
import {
  AnalysisStatusIndicator,
  formatAnalysisJobMessage,
} from "@/features/source-analysis/components";
import { ProjectStatusBadge } from "./components";

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
                <Button asChild size="sm">
                  <Link href={`/diagrams?project=${projectId}`}>Architecture Diagrams</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/architecture?project=${projectId}`}>Graph Explorer</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/model?project=${projectId}`}>Model Editor</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/import?project=${projectId}`}>Import Source</Link>
                </Button>
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
                        <div className="flex items-center gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/diagrams?project=${projectId}&model=${rev.id}`}>
                              Diagrams
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/architecture?project=${projectId}&model=${rev.id}`}>
                              Graph
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No architecture revisions yet.
                </p>
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
                            <Link href={`/diagrams?project=${projectId}&model=${job.modelId}`}>
                              Open →
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/import?project=${projectId}&snapshot=${job.snapshotId}`}>
                              Retry
                            </Link>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No analysis runs recorded yet.
                </p>
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
  const query = useApiQuery("snapshots", { projectId }, { enabled: Boolean(projectId) });
  const jobs = useApiQuery("analysisJobs", { projectId }, { enabled: Boolean(projectId) });
  const { models } = useModel();

  if (!projectId) return null;

  const snapshotList = query.data ?? [];
  const jobList = jobs.data ?? [];

  return (
    <RequestState query={query} empty={!snapshotList.length}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/import?project=${projectId}`}>Import new snapshot</Link>
          </Button>
        </div>

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
                return (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Snapshot #{number}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {s.id.slice(0, 8)}
                      </span>
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
                const snapJobs = jobList.filter((j) => j.snapshotId === s.id);
                const latestJob =
                  snapJobs.find((j) => j.status === "completed") ?? snapJobs[0] ?? null;
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
                        href={`/diagrams?project=${projectId}&model=${m.id}`}
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
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {latestModel && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/diagrams?project=${projectId}&model=${latestModel.id}`}>
                          Open Diagrams
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/import?project=${projectId}&snapshot=${s.id}`}>
                        Analyze snapshot
                      </Link>
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
                    <Link href={`/import?project=${projectId}&snapshot=${job.snapshotId}`}>
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

