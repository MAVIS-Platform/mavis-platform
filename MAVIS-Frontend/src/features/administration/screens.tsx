"use client";
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
          {
            key: "role",
            label: "Role",
            render: (a) => <AccountRoleControl key={`${a.id}:${a.role}`} account={a} />,
          },
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
function AccountRoleControl({ account }: { account: Response<"accounts">[number] }) {
  const update = useApiMutation("setAccountRole");
  const [role, setRole] = useState<"student" | "lecturer" | "admin">(account.role);
  if (account.role === "admin") return <span>Administrator</span>;
  return (
    <div className="space-y-2">
      <SelectField
        label={`Role for ${account.name}`}
        value={role}
        onChange={(value) => {
          if (value === "student" || value === "lecturer" || value === "admin") setRole(value);
        }}
        disabled={update.isPending}
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
          if (
            window.confirm(
              `Change ${account.name} to ${role}? ${role === "admin" ? "This grants full system administration access." : "This changes their account permissions."} They should sign in again to refresh their session.`,
            )
          )
            update.mutate({ accountId: account.id, role });
        }}
      >
        {update.isPending ? "Updating…" : "Save role"}
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
