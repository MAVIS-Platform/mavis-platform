"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Network } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel, SummaryCard } from "@/components/shared/data";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import { Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ImportFlow } from "@/components/mainflow/import-flow";
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
            <Dialog>
              <DialogTrigger asChild>
                <Button>Import project source</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Import Project Source</DialogTitle>
                  <DialogDescription>
                    Import Java or C# source code from a ZIP archive or GitHub repository.
                  </DialogDescription>
                </DialogHeader>
                <ImportFlow embedded />
              </DialogContent>
            </Dialog>
          }
        />
        <RequestState query={projects}>
          <div className="grid grid-cols-2 gap-3 [&>article>div]:text-xl sm:gap-4 sm:[&>article>div]:text-2xl xl:grid-cols-4">
            <SummaryCard label="Projects" value={projects.data?.length ?? 0} />
            <SummaryCard label="Services indexed" value={servicesSummary(projects.data)} />
            <SummaryCard label="Ready projects" value={readySummary(projects.data)} />
            <SummaryCard label="Runtime capable" value={runtimeSummary(projects.data)} />
          </div>
          <div className="mt-6 min-w-0 space-y-5">
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
                          <div className="min-w-40 max-w-72 space-y-2">
                            <Link
                              href={`/project-overview?project=${encodeURIComponent(p.id)}`}
                              onClick={() => selection.setProjectId(p.id)}
                              className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 font-semibold text-primary shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              title="Open project overview"
                            >
                              <span className="min-w-0 break-words">{p.name}</span>
                              <ArrowUpRight
                                className="size-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                                aria-hidden="true"
                              />
                            </Link>
                            {p.repository && (
                              <p
                                className="truncate font-mono text-xs text-muted-foreground"
                                title={p.repository}
                              >
                                {p.repository}
                              </p>
                            )}
                          </div>
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
                        key: "time",
                        label: "Updated",
                        render: (p) => {
                          const value = p.updatedAt ?? p.createdAt;
                          const date = value ? new Date(value) : null;
                          if (!date || Number.isNaN(date.getTime()))
                            return (
                              <span className="text-xs text-muted-foreground">Not available</span>
                            );
                          return (
                            <div className="whitespace-nowrap text-xs">
                              <time dateTime={value!} title={date.toLocaleString()}>
                                {date.toLocaleDateString()}
                                <span className="mt-1 block text-muted-foreground">
                                  {date.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </time>
                              {!p.updatedAt && (
                                <span className="mt-1 block text-muted-foreground">Created</span>
                              )}
                            </div>
                          );
                        },
                      },
                      {
                        key: "actions",
                        label: "Workspace",
                        render: (p) => (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/architecture?project=${encodeURIComponent(p.id)}`}
                              onClick={() => selection.setProjectId(p.id)}
                              aria-label={`View graph of ${p.name}`}
                            >
                              <Network className="size-4" aria-hidden="true" />
                              View
                            </Link>
                          </Button>
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
            <ProjectActivity projectCount={projects.data?.length ?? 0} />
          </div>
        </RequestState>
      </PageContainer>
    </div>
  );
}
function ProjectActivity({ projectCount }: { projectCount: number }) {
  const [page, setPage] = useState(0);
  const q = useApiQuery(
    "projectAnalysisActivity",
    { page, size: 10 },
    { enabled: projectCount > 0, refreshMs: 30000 },
  );
  return (
    <DetailPanel
      title="Recent activity"
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={!projectCount || q.isFetching}
          onClick={() => void q.refetch()}
        >
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        Analysis history across your projects · newest activity first
      </p>
      {!projectCount ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Your project activity will appear here after importing and analyzing source.
        </p>
      ) : (
        <RequestState query={q}>
          <div className="space-y-4">
            <DataTable
              caption="Analysis activity across all your projects"
              emptyDescription="No analysis runs yet. Open a project to analyze its source."
              rows={q.data?.items ?? []}
              rowKey={(job) => job.id}
              columns={[
                {
                  key: "time",
                  label: "Time",
                  render: (job) => {
                    const value = job.completedAt ?? job.startedAt;
                    const date = value ? new Date(value) : null;
                    return date && !Number.isNaN(date.getTime()) ? (
                      <time
                        dateTime={value!}
                        title={date.toLocaleString()}
                        className="whitespace-nowrap text-xs"
                      >
                        {date.toLocaleDateString()}
                        <span className="mt-1 block text-muted-foreground">
                          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </time>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not available</span>
                    );
                  },
                },
                {
                  key: "project",
                  label: "Project",
                  render: (job) => (
                    <Link
                      href={`/project-overview?project=${encodeURIComponent(job.projectId)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {job.projectName}
                    </Link>
                  ),
                },
                {
                  key: "activity",
                  label: "Analysis activity",
                  render: (job) => (
                    <div className="space-y-1">
                      <AnalysisStatusIndicator job={job} compact />
                      <p className="text-xs text-muted-foreground">
                        Run {job.id.slice(0, 8)} · Snapshot {job.snapshotId.slice(0, 8)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "open",
                  label: "Details",
                  render: (job) => (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={
                          job.modelId
                            ? `/architecture?project=${encodeURIComponent(job.projectId)}&model=${encodeURIComponent(job.modelId)}`
                            : `/analysis-history?project=${encodeURIComponent(job.projectId)}`
                        }
                      >
                        {job.modelId ? "Inspect" : "View history"}
                      </Link>
                    </Button>
                  ),
                },
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{q.data?.total ?? 0} analysis runs</p>
              {(q.data?.total ?? 0) > 10 && (
                <Pagination
                  page={page + 1}
                  pageCount={Math.ceil((q.data?.total ?? 0) / 10)}
                  onPageChange={(n) => setPage(n - 1)}
                />
              )}
            </div>
          </div>
        </RequestState>
      )}
    </DetailPanel>
  );
}
