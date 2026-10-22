"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel, SummaryCard } from "@/components/shared/data";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import { FilterControls, Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { ProjectStatusBadge } from "@/features/projects/components";
export default function Index() {
  return (
    <AppShell>
      <Projects />
    </AppShell>
  );
}
function Projects() {
  const projects = useApiQuery("projects", {});
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
    <PageContainer>
      <SectionHeader
        title="Overview"
        description="Architecture analysis across your projects."
        actions={
          <Button asChild>
            <Link href="/import">Import project source</Link>
          </Button>
        }
      />
      <RequestState
        query={projects}
        empty={projects.data?.length === 0}
        emptyMessage="No projects are available. Contact your workspace administrator to create a project."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Projects" value={projects.data?.length ?? 0} />
          <SummaryCard
            label="Services indexed"
            value={
              projects.data?.some((p) => p.services === null)
                ? "Unknown"
                : (projects.data?.reduce((sum, p) => sum + (p.services ?? 0), 0) ?? "Unknown")
            }
          />
          <SummaryCard
            label="Ready projects"
            value={
              projects.data?.some((p) => p.status === "unknown")
                ? "Unknown"
                : (projects.data?.filter((p) => p.status === "ready").length ?? "Unknown")
            }
          />
          <SummaryCard
            label="Runtime capable"
            value={
              projects.data?.some((p) => p.runtimeSupported === null)
                ? "Not checked"
                : (projects.data?.filter((p) => p.runtimeSupported).length ?? "Not checked")
            }
          />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="space-y-4 xl:col-span-2">
            <h2 className="text-sm font-semibold">Recent projects</h2>
            <FilterControls>
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
                options={["all", "ready", "processing", "failed"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </FilterControls>
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
                      className="font-medium text-primary hover:underline"
                    >
                      {p.name}
                      <span className="mt-1 block font-mono text-xs text-muted-foreground">
                        {p.repository}
                      </span>
                    </Link>
                  ),
                },
                { key: "services", label: "Services", render: (p) => p.services ?? "Unknown" },
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
              ]}
            />
            <Pagination
              page={currentPage}
              pageCount={Math.ceil(filtered.length / 10)}
              onPageChange={setPage}
            />
          </section>
          <OverviewAnalysis />
        </div>
      </RequestState>
    </PageContainer>
  );
}
function OverviewAnalysis() {
  const { projectId } = useSelection();
  const query = useApiQuery(
    "analysisJobs",
    { projectId },
    { enabled: Boolean(projectId), poll: true },
  );
  return (
    <DetailPanel title="Analysis status">
      {projectId ? (
        <RequestState
          query={query}
          empty={!query.data?.length}
          emptyMessage="No analysis jobs for the selected project."
        >
          {query.data?.map((job) => (
            <AnalysisStatusIndicator key={job.id} job={job} />
          ))}
          <Link href="/analysis-history" className="text-xs text-primary underline">
            View analysis history
          </Link>
        </RequestState>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a project to inspect its analysis status.
        </p>
      )}
    </DetailPanel>
  );
}
