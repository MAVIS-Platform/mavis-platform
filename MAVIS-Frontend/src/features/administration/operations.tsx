"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Database,
  HardDrive,
  Server,
  RefreshCw,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { DetailPanel, StatusBadge, SummaryCard, DataTable } from "@/components/shared/data";
import { RequestState } from "@/components/shared/request-state";
import { Pagination } from "@/components/shared/forms";

export function AdminToolbar({
  children,
  fetching,
  refresh,
  updatedAt,
}: {
  children?: ReactNode;
  fetching: boolean;
  refresh: () => void;
  updatedAt?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {updatedAt ? <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span> : null}
        <Button size="sm" variant="outline" disabled={fetching} onClick={refresh}>
          <RefreshCw className={fetching ? "size-4 animate-spin" : "size-4"} />
          {fetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}
export function PageResults({
  count,
  page,
  onPage,
}: {
  count: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / 10)),
    active = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {count
          ? `${(active - 1) * 10 + 1}–${Math.min(active * 10, count)} of ${count}`
          : "0 matching records"}
      </p>
      <Pagination page={active} pageCount={pages} onPageChange={onPage} />
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
const bytes = (n: number) => `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
export function SystemHealth() {
  const health = useApiQuery("adminHealth", {}, { refreshMs: 30000 });
  const counts = useApiQuery("platformSummary", {});
  const data = health.data,
    issues = data?.checks.filter((c) => c.status !== "UP") ?? [];
  const icons: Record<string, typeof Server> = {
    backend: Server,
    database: Database,
    worker: Activity,
    storage: HardDrive,
  };
  return (
    <div className="space-y-6">
      <AdminToolbar
        fetching={health.isFetching}
        updatedAt={health.dataUpdatedAt}
        refresh={() => {
          void health.refetch();
          void counts.refetch();
        }}
      >
        <span className="text-sm text-muted-foreground">
          Live checks · refresh every 30 seconds
        </span>
      </AdminToolbar>
      <RequestState query={health}>
        {data && (
          <div className="space-y-5">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
              <div className="flex items-start gap-3">
                {data.status === "UP" ? (
                  <CheckCircle2 className="mt-1 size-6 text-emerald-500" />
                ) : (
                  <AlertTriangle className="mt-1 size-6 text-amber-500" />
                )}
                <div>
                  <h2 className="text-lg font-semibold">
                    {data.status === "UP"
                      ? "Core services are responding"
                      : data.status === "DEGRADED"
                        ? "Attention required"
                        : "Some checks are unavailable"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.checks.filter((c) => c.status === "UP").length} of {data.checks.length}{" "}
                    checks healthy · measured {new Date(data.checkedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={
                  data.status === "UP"
                    ? "Healthy"
                    : data.status === "DEGRADED"
                      ? "Degraded"
                      : "Needs verification"
                }
                variant={data.status === "UP" ? "success" : "warning"}
              />
            </section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.checks.map((c) => {
                const Icon = icons[c.id] ?? Server;
                return (
                  <section key={c.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <Icon className="size-5 text-muted-foreground" />
                      <StatusBadge
                        status={c.status === "UP" ? "Healthy" : c.status.toLowerCase()}
                        variant={
                          c.status === "UP"
                            ? "success"
                            : c.status === "DOWN"
                              ? "destructive"
                              : "warning"
                        }
                      />
                    </div>
                    <h3 className="font-semibold">{c.name}</h3>
                    <p className="flex-1 text-sm text-muted-foreground">{c.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.latencyMs === null
                        ? c.id === "backend"
                          ? "Authenticated request served"
                          : "Filesystem / configuration check"
                        : `${c.latencyMs} ms response`}
                    </p>
                  </section>
                );
              })}
            </div>
            {issues.length > 0 && (
              <DetailPanel title="Recommended actions">
                <ul className="space-y-3">
                  {issues.map((c) => (
                    <li key={c.id} className="border-l-2 border-amber-500 pl-3 text-sm">
                      <strong>{c.name}</strong>
                      <p className="mt-1 text-muted-foreground">{c.action ?? c.message}</p>
                    </li>
                  ))}
                </ul>
              </DetailPanel>
            )}
            {data.jvm.maxBytes > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                  label="Backend JVM memory"
                  value={`${Math.round(data.jvm.usedBytes / 1024 / 1024)} MB`}
                  description={`Maximum ${Math.round(data.jvm.maxBytes / 1024 / 1024)} MB · application process only`}
                />
                <SummaryCard
                  label="Backend uptime"
                  value={`${Math.floor(data.jvm.uptimeSeconds / 3600)}h ${Math.floor((data.jvm.uptimeSeconds % 3600) / 60)}m`}
                  description="Since the application process started"
                />
                <SummaryCard
                  label="Storage free"
                  value={
                    data.storage.freeBytes !== undefined
                      ? bytes(data.storage.freeBytes)
                      : "Not measured"
                  }
                  description={
                    data.storage.totalBytes !== undefined
                      ? `${bytes(data.storage.totalBytes)} volume capacity`
                      : "Upload volume"
                  }
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {data.scope} An available Worker does not confirm workload Runner readiness.
            </p>
          </div>
        )}
      </RequestState>
      <DetailPanel
        title="Platform inventory"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/administration/jobs">
              Review analysis jobs <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        }
      >
        <RequestState query={counts}>
          {counts.data && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Projects" value={counts.data.projects} />
              <SummaryCard label="Accounts" value={counts.data.users} />
              <SummaryCard label="Analysis jobs" value={counts.data.analysisJobs} />
              <SummaryCard label="Running sessions" value={counts.data.runningSessions} />
            </div>
          )}
        </RequestState>
      </DetailPanel>
    </div>
  );
}
export function AdminRuntimeSummary() {
  const q = useApiQuery("runtimeReadSessions", { projectId: "*" }, { refreshMs: 30000 });
  const [page, setPage] = useState(1);
  const rows = q.data ?? [],
    active = rows.filter((r) => ["RUNNING", "ALLOCATED", "CANCELLING"].includes(r.executionStatus));
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/administration/admin-sessions">
            Inspect sessions <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </AdminToolbar>
      <RequestState query={q}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Recent sessions"
              value={rows.length}
              description="Latest 50 sessions returned by the server"
            />
            <SummaryCard label="Active / stopping" value={active.length} />
            <SummaryCard
              label="Failed / timed out"
              value={rows.filter((r) => ["FAILED", "TIMED_OUT"].includes(r.executionStatus)).length}
            />
            <SummaryCard
              label="Cleanup needs review"
              value={
                rows.filter((r) => ["FAILED", "PENDING", "INCOMPLETE"].includes(r.cleanupStatus))
                  .length
              }
            />
          </div>
          <DetailPanel title="Recent execution history">
            <DataTable
              emptyDescription="Try clearing the filters or refresh to check for new records."
              caption="Recent runtime sessions"
              rows={rows.slice(
                (Math.min(page, Math.max(1, Math.ceil(rows.length / 10))) - 1) * 10,
                Math.min(page, Math.max(1, Math.ceil(rows.length / 10))) * 10,
              )}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: "session",
                  label: "Session",
                  render: (r) => (
                    <div className="max-w-60 break-all">
                      <p className="font-medium">{r.scenarioName ?? "Runtime session"}</p>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Execution",
                  render: (r) => <StatusBadge status={r.executionStatus} />,
                },
                { key: "evidence", label: "Evidence", render: (r) => r.evidenceStatus },
                { key: "cleanup", label: "Cleanup", render: (r) => r.cleanupStatus },
              ]}
            />
            <PageResults count={rows.length} page={page} onPage={setPage} />
          </DetailPanel>
          <Notice>
            Summary covers recent session records, not a live probe of the workload Runner. Open a
            session to inspect stop acknowledgements, evidence and cleanup.
          </Notice>
        </div>
      </RequestState>
    </div>
  );
}
