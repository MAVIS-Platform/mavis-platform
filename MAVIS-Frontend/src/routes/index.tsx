import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  FolderGit2,
  GitBranch,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Clock,
  Import,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Index() {
  return (
    <AppShell>
      <PageHeader />
      <StatGrid />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RecentProjects />
        <AnalysisStatus />
      </div>
    </AppShell>
  );
}

type Project = {
  name: string;
  repo: string;
  services: number;
  health: number;
  status: "healthy" | "warning" | "critical";
  updated: string;
};

const projects: Project[] = [
  {
    name: "Payments Platform",
    repo: "acme/payments-core",
    services: 24,
    health: 94,
    status: "healthy",
    updated: "12 min ago",
  },
  {
    name: "Identity Service",
    repo: "acme/identity",
    services: 9,
    health: 87,
    status: "warning",
    updated: "1 hr ago",
  },
  {
    name: "Order Management",
    repo: "acme/orders",
    services: 16,
    health: 71,
    status: "critical",
    updated: "3 hrs ago",
  },
  {
    name: "Notification Hub",
    repo: "acme/notifications",
    services: 6,
    health: 96,
    status: "healthy",
    updated: "Yesterday",
  },
  {
    name: "Search Infrastructure",
    repo: "acme/search-infra",
    services: 11,
    health: 91,
    status: "healthy",
    updated: "Yesterday",
  },
];

type Analysis = {
  project: string;
  type: string;
  state: "running" | "queued" | "done";
  progress?: number;
  meta: string;
};

const analyses: Analysis[] = [
  {
    project: "Payments Platform",
    type: "Full architecture scan",
    state: "running",
    progress: 68,
    meta: "18 of 24 services analyzed",
  },
  {
    project: "Order Management",
    type: "Dependency graph rebuild",
    state: "running",
    progress: 31,
    meta: "Resolving 1,204 edges",
  },
  {
    project: "Identity Service",
    type: "Coupling analysis",
    state: "queued",
    meta: "Starts when a slot frees up",
  },
  {
    project: "Notification Hub",
    type: "Full architecture scan",
    state: "done",
    meta: "Completed 2 hrs ago · 3 findings",
  },
];

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Architecture health across 12 projects and 66 services.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent">
          <Clock className="size-4" />
          Last 7 days
        </button>
        <Link
          href="/import"
          className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Import className="size-4" />
          Import project
        </Link>
      </div>
    </div>
  );
}

const stats = [
  { label: "Active projects", value: "12", delta: "+2 this month", up: true },
  { label: "Services indexed", value: "1,284", delta: "+38 this week", up: true },
  { label: "Open findings", value: "37", delta: "−9 since Monday", up: false },
  { label: "Avg. health score", value: "88.4", delta: "+1.2 this week", up: true },
];

function StatGrid() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
              {stat.value}
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                stat.up ? "text-success" : "text-success",
              )}
            >
              {stat.up ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {stat.delta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const statusStyles: Record<Project["status"], string> = {
  healthy: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  critical: "bg-destructive/10 text-destructive",
};

const healthBar: Record<Project["status"], string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

function RecentProjects() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm xl:col-span-2">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Recent projects</h2>
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View all
          <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Project</th>
              <th className="px-5 py-2.5 font-medium">Services</th>
              <th className="px-5 py-2.5 font-medium">Health</th>
              <th className="hidden px-5 py-2.5 font-medium sm:table-cell">Status</th>
              <th className="hidden px-5 py-2.5 text-right font-medium md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                key={project.repo}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <FolderGit2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{project.name}</p>
                      <p className="flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                        <GitBranch className="size-3" />
                        {project.repo}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono text-muted-foreground">{project.services}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", healthBar[project.status])}
                        style={{ width: `${project.health}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.health}
                    </span>
                  </div>
                </td>
                <td className="hidden px-5 py-3.5 sm:table-cell">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      statusStyles[project.status],
                    )}
                  >
                    {project.status}
                  </span>
                </td>
                <td className="hidden px-5 py-3.5 text-right text-xs text-muted-foreground md:table-cell">
                  {project.updated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnalysisStatus() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Analysis status</h2>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
          2 running
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {analyses.map((analysis) => (
          <li key={analysis.project + analysis.type} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{analysis.project}</p>
                <p className="truncate text-xs text-muted-foreground">{analysis.type}</p>
              </div>
              <StateIcon state={analysis.state} />
            </div>
            {analysis.state === "running" && (
              <>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${analysis.progress}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                  {analysis.progress}% · {analysis.meta}
                </p>
              </>
            )}
            {analysis.state !== "running" && (
              <p className="mt-1 text-xs text-muted-foreground">{analysis.meta}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-5 py-3">
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View analysis history
          <ChevronRight className="size-3" />
        </button>
      </div>
    </section>
  );
}

function StateIcon({ state }: { state: Analysis["state"] }) {
  if (state === "running") return <LoaderCircle className="size-4 animate-spin text-primary" />;
  if (state === "queued") return <CircleDashed className="size-4 text-muted-foreground" />;
  return <CircleCheck className="size-4 text-success" />;
}
