"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { ConfirmDialog, SearchInput } from "@/components/shared/forms";
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
          { key: "name", label: "Account", render: (a) => a.name },
          { key: "role", label: "Role", render: (a) => a.role },
          {
            key: "status",
            label: "Status",
            render: (a) => (
              <StatusBadge
                status={a.locked ? "Locked" : "Active"}
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
            Revision {item.revision}. Credentials are configured server-side.
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
  const query = useApiQuery("profiles", {});
  const mutation = useApiMutation("configureProfile");
  const [selected, setSelected] = useState<Response<"profiles">[number] | null>(null);
  return (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((item) => (
        <DetailPanel key={item.id} title={item.name}>
          <StatusBadge status={item.enabled ? "Enabled" : "Disabled"} />
          <Button
            variant="outline"
            onClick={() => {
              mutation.reset();
              setSelected(item);
            }}
          >
            {item.enabled ? "Disable" : "Enable"} profile
          </Button>
        </DetailPanel>
      ))}
      <ConfirmDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Change runtime execution profile?"
        description={`${selected?.name}; revision ${selected?.revision}. New runtime runs must meet profile prerequisites.`}
        pending={mutation.isPending}
        error={mutation.isError ? <ErrorState error={mutation.error} /> : undefined}
        onConfirm={() => {
          if (selected)
            mutation.mutate(
              {
                profileId: selected.id,
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
