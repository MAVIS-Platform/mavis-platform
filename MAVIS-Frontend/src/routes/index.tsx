"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel, SummaryCard } from "@/components/shared/data";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import { Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { ProjectStatusBadge } from "@/features/projects/components";
import type { Project } from "@/types/domain";
export default function Index() {
  return (
    <AppShell contentVariant="workspace">
      <Projects />
    </AppShell>
  );
}
function servicesSummary(projects: Project[] | undefined): string | number {
  if (!projects) return "Unknown";
  if (projects.length === 0) return 0;
  const known = projects.filter((p) => p.services !== null);
  const total = known.reduce((sum, p) => sum + (p.services ?? 0), 0);
  if (known.length === projects.length) return total;
  return known.length > 0 ? `${total}+` : "Unknown";
}
function readySummary(projects: Project[] | undefined): string | number {
  if (!projects) return "Unknown";
  if (projects.length === 0) return 0;
  const ready = projects.filter((p) => p.status === "ready").length;
  const unknown = projects.filter((p) => p.status === "unknown").length;
  if (unknown === 0) return ready;
  return `${ready} of ${projects.length}`;
}
function runtimeSummary(projects: Project[] | undefined): string | number {
  if (!projects) return "Not checked";
  if (projects.length === 0) return 0;
  const unchecked = projects.filter((p) => p.runtimeSupported === null).length;
  if (unchecked === projects.length) return "Not checked";
  return `${projects.filter((p) => p.runtimeSupported).length} of ${projects.length}`;
}
function Projects() {
  const projects = useApiQuery("projectOverviews", {});
  const selection = useSelection();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const filtered = (projects.data ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === "all" || p.status === status),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageContainer>
        <SectionHeader
          title="Overview"
          actions={
            <Button asChild>
              <Link href="/import">Import project source</Link>
            </Button>
          }
        />
        <RequestState query={projects}>
          <div className="grid grid-cols-2 gap-3 [&>article>div]:text-xl sm:gap-4 sm:[&>article>div]:text-2xl xl:grid-cols-4">
            <SummaryCard label="Projects" value={projects.data?.length ?? 0} />
            <SummaryCard label="Services indexed" value={servicesSummary(projects.data)} />
            <SummaryCard label="Ready projects" value={readySummary(projects.data)} />
            <SummaryCard label="Runtime capable" value={runtimeSummary(projects.data)} />
          </div>
          <div className="mt-6 grid min-w-0 items-start gap-5 @min-[1100px]/mavis-content:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="min-w-0">
              <DetailPanel title="Recent projects">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <SearchInput
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                  />
                  <SelectField
                    label="Status"
                    value={status}
                    onChange={(value) => {
                      setStatus(value);
                      setPage(1);
                    }}
                    options={["all", "ready", "processing", "failed", "partial"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </div>
                {filtered.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {(projects.data?.length ?? 0) === 0
                      ? "No projects yet. Click “Import project source” to create and import your first project."
                      : "No projects match the current filter."}
                  </div>
                ) : (
                  <DataTable
                    caption="Your architecture projects"
                    rows={filtered.slice((currentPage - 1) * 10, currentPage * 10)}
                    rowKey={(p) => p.id}
                    columns={[
                      {
                        key: "project",
                        label: "Project",
                        render: (p) => (
                          <Link
                            href={`/project-overview?project=${p.id}`}
                            onClick={() => selection.setProjectId(p.id)}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.name}
                            {p.repository && (
                              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                                {p.repository}
                              </span>
                            )}
                          </Link>
                        ),
                      },
                      {
                        key: "services",
                        label: "Services",
                        render: (p) => p.services ?? "Unknown",
                      },
                      {
                        key: "status",
                        label: "Status",
                        render: (p) => <ProjectStatusBadge status={p.status} />,
                      },
                      {
                        key: "runtime",
                        label: "Runtime",
                        render: (p) =>
                          p.runtimeSupported === null
                            ? "Not checked"
                            : p.runtimeSupported
                              ? "Supported"
                              : "Unavailable",
                      },
                      {
                        key: "actions",
                        label: "Workspace",
                        render: (p) => (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              onClick={() => selection.setProjectId(p.id)}
                            >
                              <Link href={`/diagrams?project=${p.id}`}>Diagrams</Link>
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              onClick={() => selection.setProjectId(p.id)}
                            >
                              <Link href={`/architecture?project=${p.id}`}>Graph</Link>
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
                {Math.ceil(filtered.length / 10) > 1 && (
                  <Pagination
                    page={currentPage}
                    pageCount={Math.ceil(filtered.length / 10)}
                    onPageChange={setPage}
                  />
                )}
              </DetailPanel>
            </section>
            <OverviewAnalysis projects={projects.data ?? []} />
          </div>
        </RequestState>
      </PageContainer>
    </div>
  );
}
function OverviewAnalysis({ projects }: { projects: Project[] }) {
  const selection = useSelection();
  const activeProject = projects.find((p) => p.id === selection.projectId) ?? projects[0];
  const projectId = activeProject?.id ?? "";
  const query = useApiQuery(
    "analysisJobs",
    { projectId },
    { enabled: Boolean(projectId), poll: true },
  );
  const recentJobs = (query.data ?? []).slice(0, 3);
  return (
    <DetailPanel
      title="Recent analysis"
      actions={
        projectId ? (
          <Link
            href={`/analysis-history?project=${projectId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all ({query.data?.length ?? 0})
          </Link>
        ) : undefined
      }
    >
      {projects.length > 0 && (
        <SelectField
          label="Analysis project"
          value={projectId}
          onChange={selection.setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      )}
      {projectId ? (
        <RequestState
          query={query}
          empty={!query.data?.length}
          emptyMessage="No analysis jobs for the selected project."
        >
          <div className="divide-y rounded-lg border bg-background/40">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0 space-y-1">
                  <AnalysisStatusIndicator job={job} compact />
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    Snapshot {job.snapshotId.slice(0, 8)}
                  </p>
                </div>
                {job.modelId && (
                  <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs">
                    <Link href={`/diagrams?project=${projectId}&model=${job.modelId}`}>
                      Inspect →
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </RequestState>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a project to inspect its recent analysis runs.
        </p>
      )}
    </DetailPanel>
  );
}
