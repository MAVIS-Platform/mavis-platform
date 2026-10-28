"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { DetailPanel } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { SelectField, ConfirmDialog, SearchInput } from "@/components/shared/forms";
import { AdminToolbar } from "@/features/administration/operations";
import { Button } from "@/components/ui/button";
const active = new Set([
  "NOT_STARTED",
  "PENDING",
  "READY_FOR_DISPATCH",
  "APPROVED",
  "ALLOCATED",
  "RUNNING",
  "CANCELLING",
]);
export function BackendRuntime({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  return <RuntimeProject key={projectId} administrative={administrative} />;
}
function RuntimeProject({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  const [snapshot, setSnapshot] = useState("");
  const preflight = useApiMutation("runtimePreflight");
  const list = useApiQuery(
    "runtimeReadSessions",
    { projectId: administrative ? "*" : projectId },
    { enabled: administrative || !!projectId, poll: true },
  );
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const visible = administrative
    ? (list.data ?? []).filter(
        (s) =>
          (s.id + " " + (s.scenarioName ?? "")).toLowerCase().includes(search.toLowerCase()) &&
          (status === "all" || s.executionStatus === status),
      )
    : (list.data ?? []);
  const selectedId = visible.find((s) => s.id === selected)?.id || visible[0]?.id || "";
  const session = useApiQuery(
    "runtimeReadSession",
    { sessionId: selectedId },
    { enabled: !!selectedId, poll: true },
  );
  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selectedId },
    {
      enabled:
        !!selectedId &&
        ["CAPTURED", "AVAILABLE", "COMPLETE", "COMPLETED"].includes(
          session.data?.evidenceStatus ?? "",
        ),
    },
  );
  const stop = useApiMutation("runtimeStop");
  const approve = useApiMutation("runtimeApprove");
  const [action, setAction] = useState<"stop" | "approve" | null>(null);
  if (!projectId && !administrative)
    return (
      <DetailPanel title="Runtime">
        <p>Select a project to check source eligibility and inspect its runtime sessions.</p>
        {administrative && (
          <p>Global runtime sessions are not provided by this backend; select a project.</p>
        )}
      </DetailPanel>
    );
  return (
    <div className="space-y-5">
      {!administrative && (
        <DetailPanel title="Runtime prerequisites">
          <p className="text-sm text-muted-foreground">
            Execution profiles and scenario versions are provisioned by the operator. Approval
            queues an existing session; it does not prove that a workload is running. Automatic
            launch is not connected in this interface.
          </p>
          <RequestState query={snapshots} empty={!snapshots.data?.length}>
            <SelectField
              disabled={preflight.isPending}
              label="Runtime source snapshot"
              value={snapshot}
              onChange={(value) => {
                setSnapshot(value);
                preflight.reset();
              }}
              options={(snapshots.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.id.slice(0, 8)}`,
              }))}
            />
            <Button
              className="mt-3"
              disabled={!snapshot || preflight.isPending}
              onClick={() => preflight.mutate({ projectId, snapshotId: snapshot })}
            >
              Check runtime eligibility
            </Button>
            {preflight.isError && <ErrorState error={preflight.error} />}
            <PreflightResult result={preflight.data} />
          </RequestState>
        </DetailPanel>
      )}
      {administrative && (
        <>
          <AdminToolbar
            fetching={list.isFetching}
            updatedAt={list.dataUpdatedAt}
            refresh={() => void list.refetch()}
          >
            <span className="text-sm text-muted-foreground">
              Latest 50 sessions · inspect before stopping a run
            </span>
          </AdminToolbar>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <SearchInput label="Search session or scenario" value={search} onChange={setSearch} />
            <SelectField
              label="Execution status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...Array.from(new Set((list.data ?? []).map((s) => s.executionStatus)))
                  .sort()
                  .map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </>
      )}
      <DetailPanel title="Runtime sessions">
        <RequestState
          query={list}
          empty={!visible.length}
          emptyMessage={
            administrative
              ? "No sessions match this view. Try clearing the filters or refresh to check for new runs."
              : "No runtime session exists for this project. Save a configuration and scenario above, then approve and queue a session."
          }
        >
          <SelectField
            label="Runtime session"
            value={selectedId}
            onChange={setSelected}
            options={visible.map((s) => ({
              value: s.id,
              label: `${s.scenarioName ?? s.id.slice(0, 8)} · ${s.executionStatus}`,
            }))}
          />
          {selectedId && (
            <RequestState query={session}>
              {session.data && (
                <>
                  <dl className="my-4 grid gap-2 sm:grid-cols-2">
                    {[
                      "executionStatus",
                      "scenarioStatus",
                      "evidenceStatus",
                      "cleanupStatus",
                      "traceQuality",
                      "mappingStatus",
                    ].map((key) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">{key}</dt>
                        <dd className="text-sm">
                          {String(session.data![key as keyof NonNullable<typeof session.data>])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="my-3 space-y-2">
                    <Button
                      variant="outline"
                      disabled={sequence.isFetching}
                      onClick={() => void sequence.refetch()}
                    >
                      Load observed sequence
                    </Button>
                    {sequence.isError && <ErrorState error={sequence.error} />}{" "}
                    {sequence.data?.steps.length ? (
                      sequence.data.steps.map((step, i) => (
                        <article
                          key={`${step.traceId ?? "trace"}:${i}`}
                          className="rounded border p-2 text-sm"
                        >
                          <p>
                            {step.callerService ?? "Unknown"} → {step.calleeService ?? "Unknown"}
                          </p>
                          <p>
                            {step.httpMethod ?? ""} {step.operation ?? ""} ·{" "}
                            {step.httpStatusCode ?? "Status not reported"} ·{" "}
                            {step.durationMs == null
                              ? "Duration not reported"
                              : `${step.durationMs} ms`}
                          </p>
                        </article>
                      ))
                    ) : sequence.data ? (
                      <p className="text-sm">No observed interactions recorded for this session.</p>
                    ) : null}
                  </div>
                  <p className="break-all text-xs">
                    Source: {session.data.snapshotId} · Model:{" "}
                    {session.data.modelId ?? "Not reported"}
                  </p>
                  <p className="text-sm">Profile: {session.data.profileName ?? "Not reported"}</p>
                  <div className="mt-3 flex gap-3">
                    {["NOT_STARTED", "PENDING"].includes(session.data.executionStatus) && (
                      <Button disabled={approve.isPending} onClick={() => setAction("approve")}>
                        Approve operator session
                      </Button>
                    )}
                    {active.has(session.data.executionStatus) &&
                      session.data.executionStatus !== "CANCELLING" && (
                        <Button
                          variant="outline"
                          disabled={stop.isPending}
                          onClick={() => setAction("stop")}
                        >
                          Stop session
                        </Button>
                      )}
                  </div>
                </>
              )}
            </RequestState>
          )}
        </RequestState>
      </DetailPanel>
      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action === "approve" ? "Approve this pinned session?" : "Stop this runtime session?"}
        description={
          action === "approve"
            ? "The operator must launch the approved workload. Status changes only after actual Runner lifecycle acknowledgements."
            : "The request is scoped to this session. Cleanup is confirmed separately after the Runner finishes."
        }
        pending={stop.isPending || approve.isPending}
        error={
          stop.isError ? (
            <ErrorState error={stop.error} />
          ) : approve.isError ? (
            <ErrorState error={approve.error} />
          ) : undefined
        }
        onConfirm={() => {
          const mutation = action === "approve" ? approve : stop;
          mutation.mutate({ sessionId: selectedId }, { onSuccess: () => setAction(null) });
        }}
      />
    </div>
  );
}
function PreflightResult({
  result,
}: {
  result:
    | {
        compatible: boolean;
        detectedServices: string[];
        securityWarnings: string[];
        recommendedProfile: string | null;
      }
    | undefined;
}) {
  return result ? (
    <section className="mt-3 space-y-2 text-sm">
      <p>
        {result.compatible
          ? "Source is eligible for runtime preflight"
          : "This source is not eligible for the configured runtime flow"}
      </p>
      {result.recommendedProfile && <p>Recommended profile: {result.recommendedProfile}</p>}
      <p>Detected services: {result.detectedServices.join(", ") || "None reported"}</p>
      {result.securityWarnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
    </section>
  ) : null;
}
