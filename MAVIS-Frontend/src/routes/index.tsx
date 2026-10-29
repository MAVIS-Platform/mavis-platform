"use client";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleHelp, Network } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/layout/page";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel, SummaryCard, StatusBadge } from "@/components/shared/data";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import { Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/locale-context";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { ProjectStatusBadge, CreateProjectAction } from "@/features/projects/components";
import { ResourceDeleteAction } from "@/features/projects/resource-delete-action";
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
function OverviewHelp() {
  const { t } = useLocale();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t("Overview help", "Hướng dẫn tổng quan")}
          title={t("Overview help", "Hướng dẫn tổng quan")}
        >
          <CircleHelp className="size-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Quick Start Guides", "Hướng dẫn bắt đầu")}</DialogTitle>
          <DialogDescription>
            {t(
              "Choose a workflow to get started with MAVIS.",
              "Chọn quy trình phù hợp để bắt đầu sử dụng MAVIS.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                1
              </span>
              Personal Architecture Exploration
            </p>
            <p className="leading-6 text-muted-foreground">
              Click <strong>Import project source</strong> (top right) → Enter GitHub URL or upload
              ZIP → Explore Architecture Graph, C4/UML Diagrams, 3E Inspector &amp; Change Impact.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                2
              </span>
              Class Coursework &amp; Assignments
            </p>
            <p className="leading-6 text-muted-foreground">
              Open <strong>My Workspaces</strong> in sidebar → Select your class → Open{" "}
              <strong>Assignments &amp; Submit</strong> → Create coursework project and submit your
              model.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
            <OverviewHelp />
          </div>
          <CreateProjectAction />
        </div>
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
                            <div className="flex flex-wrap items-center gap-2">
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
                              {(p.workspaceId || p.projectType === "STUDENT_WORKING") && (
                                <Badge variant="secondary">Coursework</Badge>
                              )}
                            </div>
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
                        label: "Actions",
                        render: (p) => (
                          <div className="flex flex-wrap items-center gap-2">
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
                            <ResourceDeleteAction projectId={p.id} name={p.name} />
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
            <ProjectActivity />
          </div>
        </RequestState>
      </PageContainer>
    </div>
  );
}
function ProjectActivity() {
  const [page, setPage] = useState(0);
  const q = useApiQuery("projectActivity", { page, size: 10 }, { refreshMs: 30000 });
  return (
    <DetailPanel
      title="Recent activity"
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        Analysis and deletion history across your projects · newest activity first
      </p>
      <RequestState query={q}>
        <div className="space-y-4">
          <DataTable
            caption="Project activity"
            emptyDescription="No recorded activity yet."
            rows={q.data?.items ?? []}
            rowKey={(row) => `${row.kind}:${row.id}`}
            columns={[
              {
                key: "time",
                label: "Time",
                render: (row) => {
                  const date = row.occurredAt ? new Date(row.occurredAt) : null;
                  return date && !Number.isNaN(date.getTime()) ? (
                    <time
                      dateTime={row.occurredAt!}
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
                render: (row) =>
                  row.projectDeleted ? (
                    <span className="font-medium text-muted-foreground" translate="no">
                      {row.projectName}
                    </span>
                  ) : (
                    <Link
                      href={`/project-overview?project=${encodeURIComponent(row.projectId)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.projectName}
                    </Link>
                  ),
              },
              {
                key: "activity",
                label: "Activity",
                render: (row) => (
                  <div className="space-y-1">
                    {row.job ? (
                      <>
                        <AnalysisStatusIndicator job={row.job} compact />
                        <p className="text-xs text-muted-foreground">
                          Run {row.job.id.slice(0, 8)} · Snapshot {row.job.snapshotId.slice(0, 8)}
                        </p>
                      </>
                    ) : (
                      <>
                        <StatusBadge
                          status={
                            row.kind === "PROJECT_DELETED" ? "Project removed" : "Snapshot deleted"
                          }
                          variant="outline"
                        />
                        <p className="break-words text-xs" translate="no">
                          {row.targetName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.actorName ? (
                            <>
                              By <span translate="no">{row.actorName}</span>
                            </>
                          ) : row.actorId ? (
                            <>
                              User <code>{row.actorId.slice(0, 8)}</code>
                            </>
                          ) : (
                            "Actor not recorded"
                          )}
                        </p>
                      </>
                    )}
                  </div>
                ),
              },
              {
                key: "open",
                label: "Details",
                render: (row) =>
                  row.job && !row.projectDeleted ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={
                          row.job.modelId
                            ? `/architecture?project=${encodeURIComponent(row.projectId)}&model=${encodeURIComponent(row.job.modelId)}`
                            : `/analysis-history?project=${encodeURIComponent(row.projectId)}`
                        }
                      >
                        Inspect
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {row.kind === "PROJECT_DELETED"
                        ? "Soft delete · history retained"
                        : row.kind === "SNAPSHOT_DELETED"
                          ? "Snapshot and generated revisions removed"
                          : "Project removed"}
                      <span className="mt-1 block font-mono" title={row.targetId ?? row.id}>
                        {(row.targetId ?? row.id).slice(0, 8)}
                      </span>
                    </span>
                  ),
              },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{q.data?.total ?? 0} activity events</p>
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
    </DetailPanel>
  );
}
