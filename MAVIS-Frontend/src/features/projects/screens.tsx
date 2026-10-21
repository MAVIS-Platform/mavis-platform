"use client";
import Link from "next/link";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { DataTable, DetailPanel, SummaryCard } from "@/components/shared/data";
import { RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "./components";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
export function ProjectOverview() {
  const { projectId } = useSelection();
  const query = useApiQuery("project", { projectId }, { enabled: Boolean(projectId) });
  return projectId ? (
    <RequestState query={query}>
      {query.data && (
        <DetailPanel title={query.data.name}>
          <ProjectStatusBadge status={query.data.status} />
          <p className="font-mono text-xs text-muted-foreground">{query.data.repository}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard label="Services" value={query.data.services} />
            <SummaryCard
              label="Runtime"
              value={query.data.runtimeSupported ? "Supported" : "Unavailable"}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/import">Import source</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/architecture">Inspect model versions</Link>
            </Button>
          </div>
        </DetailPanel>
      )}
    </RequestState>
  ) : null;
}
export function SourceSnapshots() {
  const { projectId } = useSelection();
  const query = useApiQuery("snapshots", { projectId }, { enabled: Boolean(projectId) });
  return projectId ? (
    <RequestState query={query} empty={!query.data?.length}>
      <DataTable
        rows={query.data ?? []}
        rowKey={(s) => s.id}
        caption="Source snapshots"
        columns={[
          { key: "name", label: "Source", render: (s) => s.name },
          { key: "id", label: "Version", render: (s) => s.id },
          { key: "validation", label: "Validation", render: (s) => s.validation },
          {
            key: "coverage",
            label: "Evidence",
            render: (s) => (s.evidenceComplete ? "Complete" : "Incomplete"),
          },
        ]}
      />
    </RequestState>
  ) : null;
}
export function AnalysisHistory() {
  const { projectId } = useSelection();
  const query = useApiQuery(
    "analysisJobs",
    { projectId },
    { enabled: Boolean(projectId), poll: true },
  );
  return projectId ? (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((job) => (
        <DetailPanel key={job.id} title={`Source ${job.snapshotId}`}>
          <AnalysisStatusIndicator job={job} />
          {job.modelId && (
            <Link className="text-sm text-primary underline" href="/architecture">
              Inspect result versions
            </Link>
          )}
        </DetailPanel>
      ))}
    </RequestState>
  ) : null;
}
