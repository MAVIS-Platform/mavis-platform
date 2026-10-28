"use client";
import Link from "next/link";
import { AdminToolbar, PageResults, Notice } from "./operations";
import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { ConfirmDialog, SearchInput, SelectField } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import type { Response } from "@/lib/api/contracts";
export function Accounts() {
  const query = useApiQuery("accounts", {});
  const lock = useApiMutation("setAccountLock");
  const [selected, setSelected] = useState<Response<"accounts">[number] | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all"),
    [state, setState] = useState("all"),
    [page, setPage] = useState(1);
  const rows = (query.data ?? []).filter(
    (a) =>
      (a.name + " " + (a.email ?? "")).toLowerCase().includes(search.toLowerCase()) &&
      (role === "all" || a.role === role) &&
      (state === "all" || (a.status ?? (a.locked ? "LOCKED" : "ACTIVE")) === state),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
      >
        <p className="text-sm text-muted-foreground">
          Manage access and teaching roles. Changes require confirmation.
        </p>
      </AdminToolbar>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Accounts" value={query.data?.length ?? "—"} />
        <SummaryCard label="Locked" value={query.data?.filter((a) => a.locked).length ?? "—"} />
        <SummaryCard
          label="Pending verification"
          value={query.data?.filter((a) => a.status === "PENDING_VERIFICATION").length ?? "—"}
        />
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search name or email"
        />
        <SelectField
          label="Role"
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All roles" },
            ...["admin", "lecturer", "student"].map((value) => ({ value, label: value })),
          ]}
        />
        <SelectField
          label="Account status"
          value={state}
          onChange={(v) => {
            setState(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All statuses" },
            ...["ACTIVE", "LOCKED", "INACTIVE", "PENDING_VERIFICATION"].map((value) => ({
              value,
              label: value.replaceAll("_", " ").toLowerCase(),
            })),
          ]}
        />
      </div>
      <RequestState query={query}>
        <div className="space-y-4">
          <DataTable
            emptyDescription="Try clearing the filters or refresh to check for new records."
            rows={rows.slice((activePage - 1) * 10, activePage * 10)}
            rowKey={(a) => a.id}
            caption="User accounts"
            columns={[
              {
                key: "name",
                label: "Account",
                render: (a) => (
                  <div>
                    {a.name}
                    {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                  </div>
                ),
              },
              { key: "role", label: "Role", render: (a) => <TeachingRoleControl account={a} /> },
              {
                key: "status",
                label: "Status",
                render: (a) => (
                  <StatusBadge
                    status={a.status ?? (a.locked ? "Locked" : "Active")}
                    variant={
                      a.locked
                        ? "warning"
                        : a.status && a.status !== "ACTIVE"
                          ? "outline"
                          : "success"
                    }
                  />
                ),
              },
              {
                key: "action",
                label: "Action",
                render: (a) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      lock.reset();
                      setSelected(a);
                    }}
                  >
                    {a.locked ? "Unlock" : "Lock"}
                  </Button>
                ),
              },
            ]}
          />
          <ConfirmDialog
            open={Boolean(selected)}
            onOpenChange={(open) => {
              if (!open) setSelected(null);
            }}
            title={`${selected?.locked ? "Unlock" : "Lock"} this account?`}
            description={`This changes sign-in access for ${selected?.name} (${selected?.email ?? "no email"}). Review the account before confirming.`}
            pending={lock.isPending}
            error={lock.isError ? <ErrorState error={lock.error} /> : undefined}
            onConfirm={() => {
              if (selected)
                lock.mutate(
                  { accountId: selected.id, locked: !selected.locked },
                  { onSuccess: () => setSelected(null) },
                );
            }}
          />
          <PageResults count={rows.length} page={activePage} onPage={setPage} />
        </div>
      </RequestState>
    </div>
  );
}
function TeachingRoleControl({ account }: { account: Response<"accounts">[number] }) {
  const update = useApiMutation("setAccountRole");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"student" | "lecturer" | "admin">(account.role);
  if (account.role === "admin") return <StatusBadge status="Administrator" />;
  return (
    <div className="space-y-2">
      <SelectField
        label={`Role for ${account.name}`}
        value={role}
        onChange={(value) => {
          if (value === "student" || value === "lecturer" || value === "admin") setRole(value);
        }}
        options={[
          { value: "student", label: "Student" },
          { value: "lecturer", label: "Lecturer" },
          { value: "admin", label: "System administrator" },
        ]}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={update.isPending || role === account.role}
        onClick={() => {
          update.reset();
          setOpen(true);
        }}
      >
        Save role
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Change role to ${role}?`}
        description={`${account.name} will receive ${role} permissions. ${role === "admin" ? "This grants full system administration access. " : ""}They should sign in again after this change.`}
        pending={update.isPending}
        error={update.isError ? <ErrorState error={update.error} /> : undefined}
        onConfirm={() =>
          update.mutate({ accountId: account.id, role }, { onSuccess: () => setOpen(false) })
        }
      />
    </div>
  );
}
export function Integrations() {
  const query = useApiQuery("integrations", {});
  const mutation = useApiMutation("configureIntegration");
  const [selected, setSelected] = useState<Response<"integrations">[number] | null>(null);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/administration/usage">View AI usage</Link>
        </Button>
      </AdminToolbar>
      <Notice>
        Enabled does not mean connected. Connection verification is shown separately; changes to
        these switches currently reset when the server restarts.
      </Notice>
      <RequestState query={query} empty={!query.data?.length}>
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data?.map((item) => (
            <DetailPanel key={item.id} title={item.name}>
              <StatusBadge status={item.enabled ? "Enabled" : "Disabled"} />
              <p className="text-xs text-muted-foreground">
                Revision {item.revision} ·{" "}
                {item.status === "CONFIGURED"
                  ? "Credentials configured"
                  : item.status === "PUBLIC_ONLY"
                    ? "Public repositories only"
                    : "Configuration unavailable"}
                .{item.connectionVerified ? " Connection verified." : " Connection not verified."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  mutation.reset();
                  setSelected(item);
                }}
              >
                {item.enabled ? "Disable" : "Enable"} integration
              </Button>
            </DetailPanel>
          ))}
        </div>
        <ConfirmDialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title="Change integration configuration?"
          description={`${selected?.name} will be ${selected?.enabled ? "disabled" : "enabled"}. Based on revision ${selected?.revision}.`}
          pending={mutation.isPending}
          error={mutation.isError ? <ErrorState error={mutation.error} /> : undefined}
          onConfirm={() => {
            if (selected)
              mutation.mutate(
                {
                  integrationId: selected.id,
                  enabled: !selected.enabled,
                  expectedRevision: selected.revision,
                },
                { onSuccess: () => setSelected(null) },
              );
          }}
        />
      </RequestState>
    </div>
  );
}
export function RuntimeProfiles() {
  const q = useApiQuery("profiles", {});
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      />
      <Notice>
        Profile changes affect new runtime sessions. Settings currently reset on restart; review
        limits before enabling a profile.
      </Notice>
      <RequestState query={q} empty={!q.data?.length}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {q.data?.map((p) => (
            <ProfileForm key={p.id + ":" + p.revision} item={p} />
          ))}
        </div>
      </RequestState>
    </div>
  );
}
function ProfileForm({ item }: { item: Response<"profiles">[number] }) {
  const save = useApiMutation("configureProfile");
  const [enabled, setEnabled] = useState(item.enabled),
    [memory, setMemory] = useState(item.memoryMiB ?? 256),
    [cpus, setCpus] = useState(item.cpus ?? 1),
    [timeout, setTimeout] = useState(item.timeoutSeconds ?? 120);
  return (
    <DetailPanel title={item.name}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            profileId: item.id,
            expectedRevision: item.revision,
            enabled,
            memoryMiB: memory,
            cpus,
            timeoutSeconds: timeout,
          });
        }}
      >
        <p className="text-xs text-muted-foreground">
          Revision {item.revision} · {item.enabled ? "Enabled" : "Disabled"}. Review resource limits
          before saving.
        </p>
        <label className="flex gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <label className="block space-y-2 text-sm">
          Memory (MiB)
          <Input
            type="number"
            min={64}
            max={2048}
            required
            value={memory}
            onChange={(e) => setMemory(Number(e.target.value))}
          />
        </label>
        <label className="block space-y-2 text-sm">
          CPU cores
          <Input
            type="number"
            min={0.01}
            max={4}
            step={0.01}
            required
            value={cpus}
            onChange={(e) => setCpus(Number(e.target.value))}
          />
        </label>
        <label className="block space-y-2 text-sm">
          Timeout (seconds)
          <Input
            type="number"
            min={1}
            max={300}
            required
            value={timeout}
            onChange={(e) => setTimeout(Number(e.target.value))}
          />
        </label>
        <Button
          disabled={
            save.isPending ||
            (enabled === item.enabled &&
              memory === (item.memoryMiB ?? 256) &&
              cpus === (item.cpus ?? 1) &&
              timeout === (item.timeoutSeconds ?? 120))
          }
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        {save.isSuccess && (
          <p role="status" className="text-sm text-emerald-500">
            Profile saved.
          </p>
        )}
        {save.error && <ErrorState error={save.error} />}
      </form>
    </DetailPanel>
  );
}
export function PlatformUsage() {
  const q = useApiQuery("adminAiUsage", {}, { refreshMs: 60000 });
  const rows = q.data?.providers ?? [],
    measured = rows.filter((r) => r.usage);
  const providers = rows.filter((r, i) => rows.findIndex((x) => x.provider === r.provider) === i);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <span className="text-sm text-muted-foreground">
          Recorded MAVIS requests · all time since tracking began
        </span>
      </AdminToolbar>
      <RequestState query={q}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Input tokens"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.inputTokens, 0).toLocaleString()
                  : "Not recorded"
              }
            />
            <SummaryCard
              label="Output tokens"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.outputTokens, 0).toLocaleString()
                  : "Not recorded"
              }
            />
            <SummaryCard
              label="Recorded requests"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.requestCount, 0).toLocaleString()
                  : "Not recorded"
              }
            />
          </div>
          <Notice>
            Only requests with provider-reported token counts saved by MAVIS are included. Earlier
            usage and requests made outside MAVIS are not included. Missing data is not zero.
          </Notice>
          <DetailPanel title="Usage by model">
            <DataTable
              emptyDescription="Try clearing the filters or refresh to check for new records."
              caption="Recorded model usage"
              rows={rows}
              rowKey={(r) => r.provider + ":" + (r.model ?? "unknown")}
              columns={[
                {
                  key: "model",
                  label: "Provider / model",
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.provider === "openai" ? "OpenAI" : "Gemini"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.model ?? "No recorded model"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "in",
                  label: "Input tokens",
                  render: (r) => r.usage?.inputTokens.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "out",
                  label: "Output tokens",
                  render: (r) => r.usage?.outputTokens.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "req",
                  label: "Requests",
                  render: (r) => r.usage?.requestCount.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "coverage",
                  label: "Observed sources",
                  render: (r) => (
                    <span className="text-xs">
                      {[
                        r.coverage?.java === "OBSERVED" ? "Java" : null,
                        r.coverage?.next === "OBSERVED" ? "Next.js" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not observed"}
                    </span>
                  ),
                },
              ]}
            />
          </DetailPanel>
          <DetailPanel
            title="Provider account data"
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link href="/administration/integrations">Manage integrations</Link>
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              Optional project-wide usage and limits are separate from MAVIS token tracking.
            </p>
            <div className="space-y-3">
              {providers.map((r) => (
                <details key={r.provider} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {r.provider === "openai" ? "OpenAI" : "Gemini"} ·{" "}
                    {r.providerUsage || r.cost || r.limits || r.geminiQuota
                      ? "Project data connected"
                      : "Project data not connected"}
                  </summary>
                  <div className="mt-4 space-y-4 text-sm">
                    {r.providerDataUpdatedAt && (
                      <p className="text-xs text-muted-foreground">
                        Checked {new Date(r.providerDataUpdatedAt).toLocaleString()}
                      </p>
                    )}
                    {!r.providerUsage && !r.cost && !r.limits && !r.geminiQuota && (
                      <p className="text-muted-foreground">
                        Account-level access has not been connected. Recorded token usage above
                        remains available independently.
                      </p>
                    )}
                    {r.providerUsage && (
                      <p>
                        Current UTC month: {r.providerUsage.inputTokens.toLocaleString()} input
                        tokens · {r.providerUsage.outputTokens.toLocaleString()} output tokens ·{" "}
                        {r.providerUsage.requestCount.toLocaleString()} requests across this
                        provider project.
                      </p>
                    )}
                    {r.cost && (
                      <p>
                        Project spend:{" "}
                        {r.cost.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {r.cost.currency.toUpperCase()} ·{" "}
                        {new Date(r.cost.startTime).toLocaleDateString()} –{" "}
                        {new Date(r.cost.endTime).toLocaleDateString()}
                      </p>
                    )}
                    {r.limits && (
                      <DataTable
                        emptyDescription="Try clearing the filters or refresh to check for new records."
                        caption="Project model rate limits"
                        rows={r.limits.models}
                        rowKey={(x) => x.model}
                        columns={[
                          { key: "m", label: "Model", render: (x) => x.model },
                          {
                            key: "r",
                            label: "Requests / minute",
                            render: (x) => x.requestsPerMinute ?? "Unknown",
                          },
                          {
                            key: "t",
                            label: "Tokens / minute",
                            render: (x) => x.tokensPerMinute ?? "Unknown",
                          },
                        ]}
                      />
                    )}
                    {r.geminiQuota && (
                      <>
                        <p className="text-muted-foreground">
                          Cloud Monitoring samples may be delayed. Usage samples are interval
                          deltas, not a remaining balance.{" "}
                          {r.geminiQuota.partial ? "Some measurements are unavailable." : ""}
                        </p>
                        <DataTable
                          emptyDescription="Try clearing the filters or refresh to check for new records."
                          caption="Google quota measurements"
                          rows={r.geminiQuota.samples}
                          rowKey={(x) => x.model + x.metric + x.limitName + x.measuredAt}
                          columns={[
                            { key: "m", label: "Model", render: (x) => x.model },
                            {
                              key: "n",
                              label: "Limit",
                              render: (x) => <span className="break-all">{x.limitName}</span>,
                            },
                            { key: "k", label: "Measurement", render: (x) => x.kind },
                            { key: "v", label: "Value", render: (x) => x.value.toLocaleString() },
                            {
                              key: "d",
                              label: "Observed",
                              render: (x) => new Date(x.measuredAt).toLocaleString(),
                            },
                          ]}
                        />
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      No verified remaining credit balance is available.
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </DetailPanel>
        </div>
      </RequestState>
    </div>
  );
}
export function AdminAnalysisJobs() {
  const q = useApiQuery("adminJobs", {}, { refreshMs: 30000 });
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState("");
  const rows = (q.data ?? []).filter(
    (j) =>
      (j.id + " " + j.projectId + " " + j.message).toLowerCase().includes(search.toLowerCase()) &&
      (status === "all" || j.status === status),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10))),
    job = q.data?.find((j) => j.id === selected);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <span className="text-sm text-muted-foreground">
          Latest 50 analysis jobs · refresh every 30 seconds
        </span>
      </AdminToolbar>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="In progress"
          value={
            q.data?.filter((j) => ["queued", "processing", "cancelling"].includes(j.status))
              .length ?? "—"
          }
        />
        <SummaryCard
          label="Failed / timed out"
          value={q.data?.filter((j) => ["failed", "timed-out"].includes(j.status)).length ?? "—"}
        />
        <SummaryCard
          label="Completed"
          value={q.data?.filter((j) => j.status === "completed").length ?? "—"}
        />
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
        <SearchInput
          label="Search job, project or message"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <SelectField
          label="Job status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All statuses" },
            ...[
              "queued",
              "processing",
              "completed",
              "failed",
              "partial",
              "cancelling",
              "cancelled",
              "timed-out",
            ].map((value) => ({ value, label: value })),
          ]}
        />
      </div>
      <RequestState query={q}>
        <div className="space-y-5">
          <DataTable
            emptyDescription="Try clearing the filters or refresh to check for new records."
            caption="Recent analysis jobs"
            rows={rows.slice((activePage - 1) * 10, activePage * 10)}
            rowKey={(j) => j.id}
            columns={[
              {
                key: "id",
                label: "Job / project",
                render: (j) => (
                  <div className="max-w-64 break-all">
                    <p className="font-mono text-xs">{j.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Project {j.projectId}</p>
                  </div>
                ),
              },
              {
                key: "state",
                label: "Status",
                render: (j) => (
                  <StatusBadge
                    status={j.status}
                    variant={
                      ["failed", "timed-out"].includes(j.status)
                        ? "destructive"
                        : j.status === "completed"
                          ? "success"
                          : "outline"
                    }
                  />
                ),
              },
              {
                key: "progress",
                label: "Progress",
                render: (j) => (j.progress === null ? "Not reported" : `${j.progress}%`),
              },
              {
                key: "action",
                label: "Inspect",
                render: (j) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(selected === j.id ? "" : j.id)}
                  >
                    {selected === j.id ? "Hide details" : "View details"}
                  </Button>
                ),
              },
            ]}
          />
          <PageResults count={rows.length} page={activePage} onPage={setPage} />
        </div>
      </RequestState>
      {job && (
        <DetailPanel title="Selected job">
          <p className="break-all font-mono text-xs">{job.id}</p>
          <AnalysisStatusIndicator job={job} />
          {job.modelId && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/architecture?project=${encodeURIComponent(job.projectId)}&model=${encodeURIComponent(job.modelId)}`}
              >
                Open architecture
              </Link>
            </Button>
          )}
        </DetailPanel>
      )}
    </div>
  );
}
export function AuditRecords() {
  const q = useApiQuery("audit", {});
  const [search, setSearch] = useState(""),
    [action, setAction] = useState("all"),
    [page, setPage] = useState(1);
  const rows = (q.data ?? []).filter(
    (a) =>
      (a.action + " " + a.actorId + " " + a.resourceId)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (action === "all" || a.action === action),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <span className="text-sm text-muted-foreground">Read-only · latest 100 audit records</span>
      </AdminToolbar>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
        <SearchInput
          label="Search action, actor or resource"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <SelectField
          label="Action"
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All actions" },
            ...Array.from(new Set((q.data ?? []).map((a) => a.action)))
              .sort()
              .map((value) => ({ value, label: value.replaceAll("_", " ").toLowerCase() })),
          ]}
        />
      </div>
      <RequestState query={q}>
        <div className="space-y-5">
          <DataTable
            emptyDescription="Try clearing the filters or refresh to check for new records."
            caption="Administrative audit trail"
            rows={rows.slice((activePage - 1) * 10, activePage * 10)}
            rowKey={(a) => a.id}
            columns={[
              {
                key: "at",
                label: "Time",
                render: (a) => (
                  <span className="whitespace-nowrap text-xs" title={a.at}>
                    {new Date(a.at).toLocaleString()}
                  </span>
                ),
              },
              {
                key: "action",
                label: "Action",
                render: (a) => <span className="text-xs">{a.action.replaceAll("_", " ")}</span>,
              },
              {
                key: "actor",
                label: "Actor",
                render: (a) => (
                  <span className="block max-w-52 break-all font-mono text-xs">
                    {a.actorId || "System"}
                  </span>
                ),
              },
              {
                key: "resource",
                label: "Resource",
                render: (a) => (
                  <span className="block max-w-52 break-all font-mono text-xs">
                    {a.resourceId || "Not recorded"}
                  </span>
                ),
              },
            ]}
          />
          <PageResults count={rows.length} page={activePage} onPage={setPage} />
        </div>
      </RequestState>
    </div>
  );
}
