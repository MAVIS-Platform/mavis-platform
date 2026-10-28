"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { ConfirmDialog, SearchInput } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
import type { Response } from "@/lib/api/contracts";
export function Accounts() {
  const query = useApiQuery("accounts", {});
  const lock = useApiMutation("setAccountLock");
  const [selected, setSelected] = useState<Response<"accounts">[number] | null>(null);
  const [search, setSearch] = useState("");
  return (
    <RequestState query={query} empty={!query.data?.length}>
      <SearchInput value={search} onChange={setSearch} label="Search accounts" />
      <DataTable
        rows={(query.data ?? []).filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))}
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
                variant={a.locked ? "warning" : "success"}
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
        description={`This changes account access for ${selected?.name}. Backend permission checks remain mandatory.`}
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
    </RequestState>
  );
}
function TeachingRoleControl({ account }: { account: Response<"accounts">[number] }) {
  const update = useApiMutation("setAccountRole");
  if (account.role === "admin") return <span>Administrator</span>;
  return (
    <div className="space-y-2">
      <span className="block text-xs capitalize">{account.role}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={update.isPending}
        onClick={() => {
          const role = account.role === "lecturer" ? "student" : "lecturer";
          if (
            window.confirm(
              `Change ${account.name} to ${role}? This changes their teaching permissions. They should sign in again to refresh their session.`,
            )
          )
            update.mutate({ accountId: account.id, role });
        }}
      >
        {update.isPending
          ? "Updating…"
          : account.role === "lecturer"
            ? "Set as student"
            : "Set as lecturer"}
      </Button>
      {update.error && <ErrorState error={update.error} />}
    </div>
  );
}
export function Integrations() {
  const query = useApiQuery("integrations", {});
  const mutation = useApiMutation("configureIntegration");
  const [selected, setSelected] = useState<Response<"integrations">[number] | null>(null);
  return (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((item) => (
        <DetailPanel key={item.id} title={item.name}>
          <StatusBadge status={item.enabled ? "Enabled" : "Disabled"} />
          <p className="text-xs text-muted-foreground">
            Revision {item.revision} · {item.status ?? "Unverified"}. Process-local settings reset
            on restart. Connection has not been probed. Credentials remain server-side.
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
  );
}
export function RuntimeProfiles() {
  const q = useApiQuery("profiles", {});
  return (
    <RequestState query={q} empty={!q.data?.length}>
      {q.data?.map((p) => (
        <ProfileForm key={p.id + ":" + p.revision} item={p} />
      ))}
    </RequestState>
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
          Revision {item.revision}. Process-local settings reset on restart. Limits apply to new
          sessions; existing pinned sessions cannot exceed current limits.
        </p>
        <label className="flex gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <label>
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
        <label>
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
        <label>
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
        <Button disabled={save.isPending}>Save execution profile</Button>
        {save.error && <ErrorState error={save.error} />}
      </form>
    </DetailPanel>
  );
}
export function PlatformSummary() {
  const query = useApiQuery("platformSummary", {});
  return (
    <RequestState query={query}>
      {query.data && (
        <>
          <DetailPanel title="Service status">
            <StatusBadge status={query.data.health} variant="info" />
            <p className="text-sm text-muted-foreground">{query.data.message}</p>
          </DetailPanel>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Projects" value={query.data.projects} />
            <SummaryCard label="Accounts" value={query.data.users} />
            <SummaryCard label="Analysis jobs" value={query.data.analysisJobs} />
            <SummaryCard label="Running sessions" value={query.data.runningSessions} />
          </div>
        </>
      )}
    </RequestState>
  );
}
export function PlatformUsage() {
  const query = useApiQuery("adminAiUsage", {}, { refreshMs: 60000 });
  return (
    <div className="space-y-5">
      <PlatformSummary />
      <DetailPanel
        title="AI model usage and quota"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Token counts come from provider responses recorded by MAVIS. They do not include requests
          made outside this application. Provider limits, spend and balance are shown only when
          verified.
        </p>
        <RequestState query={query}>
          {query.data && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(query.data.updatedAt).toLocaleString()} ·{" "}
                {query.data.status === "AVAILABLE" ? "Available" : "Unavailable"}
              </p>
              {query.data.message && <p className="text-sm">{query.data.message}</p>}
              {query.data.providers.length === 0 && (
                <p className="text-sm text-muted-foreground">No provider data available.</p>
              )}
              {query.data.providers.map((provider, index) => (
                <div
                  key={`${provider.provider}:${provider.model ?? "unknown"}:${index}`}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">
                      {provider.provider === "openai" ? "OpenAI" : "Gemini"} ·{" "}
                      {provider.model ?? "Model unavailable"}
                    </h3>
                    <StatusBadge
                      status={provider.status === "AVAILABLE" ? "Usage available" : "Unavailable"}
                      variant={provider.status === "AVAILABLE" ? "success" : "outline"}
                    />
                  </div>
                  {provider.message && (
                    <p className="text-sm text-muted-foreground">{provider.message}</p>
                  )}
                  {query.data?.providers.findIndex((item) => item.provider === provider.provider) === index && provider.providerDataMessage && <p className="text-sm text-muted-foreground">{provider.providerDataMessage}</p>}
                  {query.data?.providers.findIndex((item) => item.provider === provider.provider) === index && provider.providerDataUpdatedAt && (
                    <p className="text-xs text-muted-foreground">Provider data checked: {new Date(provider.providerDataUpdatedAt).toLocaleString()}</p>
                  )}
                  {provider.coverage && (
                    <p className="text-xs text-muted-foreground">Usage recorded in Java: {provider.coverage.java === "OBSERVED" ? "observed" : "unknown"} · Next.js: {provider.coverage.next === "OBSERVED" ? "observed" : "unknown"}</p>
                  )}
                  {query.data?.providers.findIndex((item) => item.provider === provider.provider) === index && provider.geminiQuota && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Google project quota measurements</h4>
                      <p className="text-xs text-muted-foreground">Provider metrics are shown as reported; usage samples are measurements over their stated interval, not a remaining balance. {provider.geminiQuota.partial ? "Some metrics are unavailable." : ""}</p>
                      {provider.geminiQuota.samples.length ? <DataTable
                        caption="Google project quota measurements"
                        rows={provider.geminiQuota.samples}
                        rowKey={(row) => `${row.model}:${row.metric}:${row.limitName}:${row.kind}:${row.measuredAt}`}
                        columns={[
                          { key: "model", label: "Model", render: (row) => row.model },
                          { key: "metric", label: "Metric", render: (row) => row.metric },
                          { key: "limit", label: "Limit name", render: (row) => row.limitName },
                          { key: "kind", label: "Kind", render: (row) => row.kind },
                          { key: "value", label: "Value", render: (row) => row.value.toLocaleString() },
                          { key: "time", label: "Interval / observed", render: (row) => `${row.startTime ? new Date(row.startTime).toLocaleString() + " – " : ""}${new Date(row.measuredAt).toLocaleString()}` },
                        ]}
                      /> : <p className="text-sm text-muted-foreground">No quota measurements available.</p>}
                    </div>
                  )}
                  {query.data?.providers.findIndex((item) => item.provider === provider.provider) === index && provider.providerUsage && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Provider project usage · current UTC month</h4>
                      <p className="text-xs text-muted-foreground">Includes the project scope reported by the provider, which may include requests outside MAVIS. {new Date(provider.providerUsage.startTime).toLocaleString()} – {new Date(provider.providerUsage.endTime).toLocaleString()}</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SummaryCard label="Provider input tokens" value={provider.providerUsage.inputTokens.toLocaleString()} />
                        <SummaryCard label="Provider output tokens" value={provider.providerUsage.outputTokens.toLocaleString()} />
                        <SummaryCard label="Provider requests" value={provider.providerUsage.requestCount.toLocaleString()} />
                      </div>
                    </div>
                  )}
                  {provider.usage ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <SummaryCard
                        label="Input tokens"
                        value={provider.usage.inputTokens.toLocaleString()}
                      />
                      <SummaryCard
                        label="Output tokens"
                        value={provider.usage.outputTokens.toLocaleString()}
                      />
                      <SummaryCard
                        label="Recorded requests"
                        value={provider.usage.requestCount.toLocaleString()}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Token usage unavailable.</p>
                  )}
                  {query.data?.providers.findIndex((item) => item.provider === provider.provider) === index && <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryCard
                      label="Provider spend · current UTC month"
                      value={provider.cost ? `${provider.cost.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${provider.cost.currency.toUpperCase()}` : "Unavailable"}
                      description={provider.cost ? `Provider project, ${new Date(provider.cost.startTime).toLocaleString()} – ${new Date(provider.cost.endTime).toLocaleString()}` : "No verified billing data."}
                    />
                    <SummaryCard
                      label="Provider balance"
                      value="Unavailable"
                      description="No verified balance data."
                    />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Project model rate limits</h4>
                    {provider.limits?.models.length ? (
                      <DataTable
                        caption="Provider project model rate limits"
                        rows={provider.limits.models}
                        rowKey={(row) => row.model}
                        columns={[
                          { key: "model", label: "Model", render: (row) => row.model },
                          { key: "rpm", label: "Requests/min", render: (row) => row.requestsPerMinute?.toLocaleString() ?? "Unavailable" },
                          { key: "tpm", label: "Tokens/min", render: (row) => row.tokensPerMinute?.toLocaleString() ?? "Unavailable" },
                        ]}
                      />
                    ) : <p className="text-sm text-muted-foreground">Provider limits are unavailable.</p>}
                  </div>
                  </>}
                </div>
              ))}
            </div>
          )}
        </RequestState>
      </DetailPanel>
    </div>
  );
}
export function AdminAnalysisJobs() {
  const query = useApiQuery("adminJobs", {}, { poll: true });
  return (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((job) => (
        <DetailPanel key={job.id} title={`${job.projectId} · ${job.id}`}>
          <AnalysisStatusIndicator job={job} />
        </DetailPanel>
      ))}
    </RequestState>
  );
}
export function AuditRecords() {
  const query = useApiQuery("audit", {});
  return (
    <RequestState query={query} empty={!query.data?.length}>
      <DataTable
        rows={query.data ?? []}
        rowKey={(a) => a.id}
        caption="Administrative audit records"
        columns={[
          { key: "at", label: "Time", render: (a) => a.at },
          { key: "action", label: "Action", render: (a) => a.action },
          { key: "actor", label: "Actor", render: (a) => a.actorId },
          { key: "resource", label: "Resource", render: (a) => a.resourceId },
        ]}
      />
    </RequestState>
  );
}
