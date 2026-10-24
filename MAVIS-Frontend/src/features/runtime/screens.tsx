"use client";
import { useApi } from "@/hooks/use-api";
import { BackendRuntime } from "./backend";
import { useState } from "react";
import { useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RuntimeSessionTimeline, RuntimeStatusBadge, TraceViewer } from "./components";
import type { Response } from "@/lib/api/contracts";

import { RuntimePlanEditor } from "./planning";
export function RuntimeConfiguration() {
  const api = useApi();
  return api.mode === "backend" ? <RuntimePlanEditor /> : <MockRuntimeConfiguration />;
}
function MockRuntimeConfiguration() {
  const { projectId } = useSelection();
  const query = useApiQuery("runtimeConfiguration", { projectId }, { enabled: Boolean(projectId) });
  return projectId ? (
    <RequestState query={query}>
      {query.data && (
        <ConfigurationForm key={`${projectId}-${query.data.revision}`} config={query.data} />
      )}
    </RequestState>
  ) : null;
}
function ConfigurationForm({ config }: { config: Response<"runtimeConfiguration"> }) {
  const [profileId, setProfileId] = useState(config.profileId);
  const save = useApiMutation("saveRuntimeConfiguration");
  const [confirm, setConfirm] = useState(false);
  return (
    <DetailPanel title="Runtime prerequisites">
      <StatusBadge
        status={config.supported ? "Supported project" : "Execution unavailable"}
        variant={config.supported ? "info" : "warning"}
      />
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {config.prerequisites.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {config.supported && (
        <>
          <FormField
            label="Execution profile ID"
            hint="Use a profile provisioned by the administrator; no credentials belong in this form."
          >
            {(props) => (
              <Input
                {...props}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                disabled={save.isPending}
              />
            )}
          </FormField>
          <Button
            disabled={!profileId.trim() || profileId === config.profileId || save.isPending}
            onClick={() => setConfirm(true)}
          >
            Review configuration
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Save runtime configuration?"
            description={`Profile ${profileId}; based on configuration revision ${config.revision}. Runs still require separate approval.`}
            pending={save.isPending}
            error={save.isError ? <ErrorState error={save.error} /> : undefined}
            onConfirm={() =>
              save.mutate(
                { projectId: config.projectId, profileId, expectedRevision: config.revision },
                { onSuccess: () => setConfirm(false) },
              )
            }
          />
        </>
      )}
    </DetailPanel>
  );
}
export function RuntimeScenarios() {
  const api = useApi();
  return api.mode === "backend" ? <RuntimePlanEditor /> : <MockRuntimeScenarios />;
}
function MockRuntimeScenarios() {
  const { projectId } = useSelection();
  const query = useApiQuery("scenarios", { projectId }, { enabled: Boolean(projectId) });
  return projectId ? (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((scenario) => (
        <ScenarioForm key={`${scenario.id}-${scenario.revision}`} scenario={scenario} />
      ))}
    </RequestState>
  ) : null;
}
function ScenarioForm({ scenario }: { scenario: Response<"scenarios">[number] }) {
  const [name, setName] = useState(scenario.name);
  const [steps, setSteps] = useState(scenario.steps.join("\n"));
  const save = useApiMutation("saveScenario");
  const dirty = name !== scenario.name || steps !== scenario.steps.join("\n");
  return (
    <DetailPanel title={`Scenario · revision ${scenario.revision}`}>
      <FormField label="Scenario name">
        {(props) => (
          <Input
            {...props}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            disabled={save.isPending}
          />
        )}
      </FormField>
      <FormField label="Scenario steps" hint="One step per line, up to 30 steps of 500 characters.">
        {(props) => (
          <Textarea
            {...props}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            disabled={save.isPending}
          />
        )}
      </FormField>
      {dirty && <StatusBadge status="Unsaved scenario" variant="warning" />}
      <Button
        disabled={!dirty || !name.trim() || !steps.trim() || save.isPending}
        onClick={() =>
          save.mutate({
            scenarioId: scenario.id,
            expectedRevision: scenario.revision,
            name,
            steps: steps
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      >
        {save.isPending ? "Saving…" : "Save scenario revision"}
      </Button>
      {save.isError && <ErrorState error={save.error} />}
    </DetailPanel>
  );
}
export function RuntimeSessions({ administrative = false }: { administrative?: boolean }) {
  const api = useApi();
  return api.mode === "backend" ? (
    <>
      {!administrative && <RuntimePlanEditor />}
      <BackendRuntime administrative={administrative} />
    </>
  ) : (
    <MockRuntimeSessions administrative={administrative} />
  );
}
function MockRuntimeSessions({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  const query = useApiQuery(
    "runtimeSessions",
    { projectId: administrative ? "*" : projectId },
    { enabled: administrative || Boolean(projectId), poll: true },
  );
  const [sessionId, setSessionId] = useState("");
  const session = query.data?.find((s) => s.id === sessionId) ?? query.data?.at(-1);
  if (!administrative && !projectId)
    return (
      <EmptyState
        title="Select a project"
        description="Choose a project to review runtime prerequisites and sessions."
      />
    );
  return (
    <div className="space-y-6">
      {!administrative && projectId && (
        <RunApproval key={projectId} projectId={projectId} onStarted={setSessionId} />
      )}
      <RequestState query={query} empty={!query.data?.length}>
        {session && (
          <>
            <SelectField
              label="Runtime session"
              value={session.id}
              onChange={setSessionId}
              options={(query.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.id} · ${s.status}`,
              }))}
            />
            <SessionDetails key={session.id} session={session} administrative={administrative} />
          </>
        )}
      </RequestState>
    </div>
  );
}
function RunApproval({
  projectId,
  onStarted,
}: {
  projectId: string;
  onStarted: (id: string) => void;
}) {
  const config = useApiQuery("runtimeConfiguration", { projectId });
  const snapshots = useApiQuery("snapshots", { projectId });
  const scenarios = useApiQuery("scenarios", { projectId });
  const [snapshotId, setSnapshotId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [approval, setApproval] = useState<{
    snapshotId: string;
    scenarioId: string;
    configurationRevision: number;
    scenarioRevision: number;
  } | null>(null);
  const start = useApiMutation("startRuntime");
  const scenario = scenarios.data?.find((s) => s.id === scenarioId);
  const canRun =
    config.data?.supported && config.data.ready && Boolean(snapshotId) && Boolean(scenario);
  return (
    <RequestState query={config}>
      <RequestState query={snapshots}>
        <RequestState query={scenarios}>
          <DetailPanel title="Review and approve a run">
            {config.data?.supported ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {config.data.prerequisites.join(" · ")}
                </p>
                <SelectField
                  label="Source snapshot"
                  value={snapshotId}
                  onChange={setSnapshotId}
                  options={(snapshots.data ?? [])
                    .filter((s) => s.validation === "valid")
                    .map((s) => ({ value: s.id, label: `${s.name} · ${s.id}` }))}
                />
                <SelectField
                  label="Scenario"
                  value={scenarioId}
                  onChange={setScenarioId}
                  options={(scenarios.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.name} · revision ${s.revision}`,
                  }))}
                />
                {scenario && (
                  <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                    {scenario.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                <p className="text-xs text-muted-foreground">
                  Profile {config.data.profileId} · configuration revision {config.data.revision}
                </p>
                <Button
                  disabled={!canRun || start.isPending}
                  onClick={() => {
                    if (config.data && scenario)
                      setApproval({
                        snapshotId,
                        scenarioId,
                        configurationRevision: config.data.revision,
                        scenarioRevision: scenario.revision,
                      });
                  }}
                >
                  Review run approval
                </Button>
                <ConfirmDialog
                  open={Boolean(approval)}
                  onOpenChange={(open) => {
                    if (!open) setApproval(null);
                  }}
                  title="Approve this runtime execution?"
                  description={`Source ${approval?.snapshotId}; scenario ${approval?.scenarioId} revision ${approval?.scenarioRevision}; configuration revision ${approval?.configurationRevision}.`}
                  pending={start.isPending}
                  error={start.isError ? <ErrorState error={start.error} /> : undefined}
                  onConfirm={() => {
                    if (approval)
                      start.mutate(
                        { projectId, ...approval, approved: true },
                        {
                          onSuccess: (session) => {
                            onStarted(session.id);
                            setApproval(null);
                          },
                        },
                      );
                  }}
                />
                {!config.data.ready && (
                  <p role="alert" className="text-sm text-warning">
                    Run prerequisites are not satisfied.
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                title="Runtime execution unavailable"
                description="This project has no compatible execution configuration."
              />
            )}
          </DetailPanel>
        </RequestState>
      </RequestState>
    </RequestState>
  );
}
function SessionDetails({
  session,
  administrative,
}: {
  session: Response<"runtimeSession">;
  administrative: boolean;
}) {
  const stop = useApiMutation("stopRuntime");
  const admin = usePermission("admin:manage");
  const [action, setAction] = useState<"cancel" | "terminate" | null>(null);
  return (
    <div className="mt-5 space-y-5">
      <DetailPanel title="Session status">
        <RuntimeStatusBadge status={session.status} />
        <p className="break-all text-xs text-muted-foreground">
          Approved {session.approvedAt} · source {session.snapshotId} · scenario{" "}
          {session.scenarioId} revision {session.scenarioRevision} · config revision{" "}
          {session.configurationRevision}
        </p>
        <RuntimeSessionTimeline session={session} />
        {session.status === "running" && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAction("cancel")}>
              Cancel session
            </Button>
            {administrative && admin && (
              <Button variant="destructive" onClick={() => setAction("terminate")}>
                Terminate session
              </Button>
            )}
          </div>
        )}
        <ConfirmDialog
          open={Boolean(action)}
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          title={`${action === "terminate" ? "Terminate" : "Cancel"} this session?`}
          description={`This action applies only to session ${session.id}.`}
          pending={stop.isPending}
          error={stop.isError ? <ErrorState error={stop.error} /> : undefined}
          onConfirm={() => {
            if (action)
              stop.mutate({ sessionId: session.id, action }, { onSuccess: () => setAction(null) });
          }}
        />
      </DetailPanel>
      <TraceViewer session={session} />
    </div>
  );
}
