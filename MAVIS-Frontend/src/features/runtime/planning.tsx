"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { DetailPanel, StatusLabel } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Response } from "@/lib/api/contracts";
export function RuntimePlanEditor() {
  const { projectId } = useSelection();
  const q = useApiQuery("runtimeConfiguration", { projectId }, { enabled: !!projectId });
  const scenarios = useApiQuery("scenarios", { projectId }, { enabled: !!projectId });
  if (!projectId) return <p>Select a project to configure runtime execution.</p>;
  return (
    <div className="space-y-5">
      <RequestState query={q}>
        {q.data && <Configuration key={projectId + ":" + q.data.revision} c={q.data} />}
      </RequestState>
      <DetailPanel title="Saved scenarios">
        <p className="text-sm text-muted-foreground">
          Each line is one HTTP step JSON object: id, service, method, path and expectedStatus.
          Secret values belong only in Runner environment variables referenced by secretHeaders.
        </p>
        <Scenario projectId={projectId} />
        <RequestState query={scenarios}>
          {scenarios.data?.map((s) => (
            <Scenario key={s.id + ":" + s.revision} projectId={projectId} scenario={s} />
          ))}
        </RequestState>
      </DetailPanel>
      {q.data && <QueueRun c={q.data} scenarios={scenarios.data ?? []} />}
    </div>
  );
}
function Configuration({ c }: { c: Response<"runtimeConfiguration"> }) {
  const snapshots = useApiQuery("snapshots", { projectId: c.projectId }),
    models = useApiQuery("models", { projectId: c.projectId });
  const save = useApiMutation("saveRuntimeConfiguration");
  const [snapshotId, setSnapshot] = useState(c.snapshotId ?? ""),
    [modelId, setModel] = useState(c.modelId ?? ""),
    [profileId, setProfileId] = useState(c.profileId),
    [profile, setProfile] = useState(JSON.stringify(c.profile ?? {}, null, 2)),
    [error, setError] = useState("");
  return (
    <DetailPanel title={`Runtime configuration · revision ${c.revision}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          let value;
          try {
            value = JSON.parse(profile);
            if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
          } catch {
            setError("Execution profile must be a JSON object.");
            return;
          }
          setError("");
          save.mutate({
            projectId: c.projectId,
            snapshotId,
            modelId,
            profileId,
            profile: value,
            expectedRevision: c.revision,
          });
        }}
      >
        <ul className="list-disc pl-5 text-sm">
          {c.prerequisites.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
        <RequestState query={snapshots}>
          <SelectField
            label="Pinned source snapshot"
            value={snapshotId}
            onChange={(v) => {
              setSnapshot(v);
              setModel("");
            }}
            options={(snapshots.data ?? []).map((s) => ({
              value: s.id,
              label: s.name + " · " + s.id,
            }))}
          />
        </RequestState>
        <RequestState query={models}>
          <SelectField
            label="Pinned model"
            value={modelId}
            onChange={setModel}
            options={(models.data ?? [])
              .filter((m) => m.snapshotId === snapshotId)
              .map((m) => ({ value: m.id, label: `Revision ${m.revision} · ${m.id}` }))}
          />
        </RequestState>
        <label>
          Allowed profile ID
          <Input required value={profileId} onChange={(e) => setProfileId(e.target.value)} />
        </label>
        <label>
          Operator-provisioned execution profile JSON
          <Textarea
            className="font-mono min-h-48"
            required
            maxLength={50000}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Use real digest-pinned collectorImage and scenarioRunnerImage, an installed
          instrumentationVolume, approvedForLocalPoc and applications with runtime/containerPort.
          Saving does not start Docker or verify installed images.
        </p>
        <Button disabled={!snapshotId || !modelId || save.isPending}>
          Save pinned configuration
        </Button>
        {error && <p role="alert">{error}</p>}
        {save.error && <ErrorState error={save.error} />}
      </form>
    </DetailPanel>
  );
}
function Scenario({
  projectId,
  scenario,
}: {
  projectId: string;
  scenario?: Response<"scenarios">[number];
}) {
  const create = useApiMutation("createScenario"),
    update = useApiMutation("saveScenario");
  const [name, setName] = useState(scenario?.name ?? ""),
    [steps, setSteps] = useState(scenario?.steps.join("\n") ?? "");
  const pending = create.isPending || update.isPending;
  return (
    <form
      className="space-y-3 border rounded p-3 my-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fields = {
          projectId,
          name,
          steps: steps
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        };
        if (scenario)
          update.mutate({
            ...fields,
            scenarioId: scenario.id,
            expectedRevision: scenario.revision,
          });
        else
          create.mutate(fields, {
            onSuccess: () => {
              setName("");
              setSteps("");
            },
          });
      }}
    >
      <Input
        aria-label="Scenario name"
        placeholder="Scenario name"
        required
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Textarea
        aria-label="HTTP step JSON, one object per line"
        placeholder={
          '{"id":"health","service":"your-service","method":"GET","path":"/health","expectedStatus":200}'
        }
        required
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
      />
      <Button disabled={pending}>
        {scenario ? `Save scenario revision ${scenario.revision + 1}` : "Create scenario"}
      </Button>
      {(create.error || update.error) && <ErrorState error={create.error ?? update.error} />}
    </form>
  );
}
function QueueRun({
  c,
  scenarios,
}: {
  c: Response<"runtimeConfiguration">;
  scenarios: Response<"scenarios">;
}) {
  const start = useApiMutation("startRuntime");
  const [selected, setSelected] = useState(""),
    [approved, setApproved] = useState(false);
  const scenario = scenarios.find((s) => s.id === selected);
  return (
    <DetailPanel title="Review and queue a runtime session">
      <p className="text-sm">
        Source {c.snapshotId ?? "unsaved"} · model {c.modelId ?? "unsaved"} · configuration revision{" "}
        {c.revision}.
      </p>
      <SelectField
        label="Saved scenario"
        value={selected}
        onChange={(v) => {
          setSelected(v);
          setApproved(false);
        }}
        options={scenarios.map((s) => ({
          value: s.id,
          label: `${s.name} · revision ${s.revision}`,
        }))}
      />
      <label className="flex gap-2 my-3">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        I approve these pinned inputs for the dedicated Runner.
      </label>
      <Button
        disabled={!c.ready || !c.snapshotId || !scenario || !approved || start.isPending}
        onClick={() => {
          if (scenario && c.snapshotId)
            start.mutate(
              {
                projectId: c.projectId,
                snapshotId: c.snapshotId,
                scenarioId: scenario.id,
                configurationRevision: c.revision,
                scenarioRevision: scenario.revision,
                approved: true,
              },
              { onSuccess: () => setApproved(false) },
            );
        }}
      >
        Approve and queue
      </Button>
      {start.data && (
        <p role="status">
          Session {start.data.id}: <StatusLabel status={start.data.executionStatus ?? ""} />. The
          operator must launch the dedicated Runner; execution and cleanup are acknowledged
          separately.
        </p>
      )}
      {start.error && <ErrorState error={start.error} />}
    </DetailPanel>
  );
}
