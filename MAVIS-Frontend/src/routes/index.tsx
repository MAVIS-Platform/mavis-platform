"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, SummaryCard } from "@/components/shared/data";
import { FilterControls, Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { ProjectStatusBadge } from "@/features/projects/components";
import type { Project } from "@/types/domain";
export default function Index() {
  return (
    <AppShell>
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
          <SummaryCard label="Services indexed" value={servicesSummary(projects.data)} />
          <SummaryCard label="Ready projects" value={readySummary(projects.data)} />
          <SummaryCard label="Runtime capable" value={runtimeSummary(projects.data)} />
        </div>
        <div className="mt-6">
          <section className="space-y-4">
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
                options={["all", "ready", "processing", "failed", "partial"].map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1), 
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
        </div>
      </RequestState>
    </PageContainer>
  );
}
