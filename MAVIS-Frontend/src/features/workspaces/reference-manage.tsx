"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiMutation, useApiQuery, usePermission } from "@/hooks/use-api";
import { FormField, SelectField } from "@/components/shared/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/shared/data";
import { ErrorState } from "@/components/shared/request-state";
export function ReferenceManagement({ workspaceId }: { workspaceId: string }) {
  const allowed = usePermission("workspace:manage");
  const projects = useApiQuery(
    "workspaceProjects",
    { workspaceId },
    { enabled: allowed && !!workspaceId },
  );
  const create = useApiMutation("createReferenceProject"),
    publish = useApiMutation("publishReference");
  const [name, setName] = useState(""),
    [projectId, setProjectId] = useState(""),
    [snapshotId, setSnapshotId] = useState("");
  const project = projects.data?.find((p) => p.id === projectId);
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: allowed && !!project });
  if (!allowed) return null;
  return (
    <DetailPanel title="Manage teaching references">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { workspaceId, name },
            {
              onSuccess: (p) => {
                setName("");
                setProjectId(p.id);
              },
            },
          );
        }}
      >
        <FormField label="Reference project name">
          {(props) => (
            <Input {...props} required value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </FormField>
        <Button disabled={create.isPending}>Create reference project</Button>
      </form>
      {create.data && (
        <Link
          className="text-sm text-primary underline"
          href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}
        >
          Set up assignment source (GitHub, ZIP & versions)
        </Link>
      )}
      <SelectField
        label="Reference project"
        value={projectId}
        onChange={setProjectId}
        options={[
          { value: "", label: "Select a project" },
          ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      {project && (
        <>
          <SelectField
            label="Source snapshot to publish"
            value={snapshotId}
            onChange={setSnapshotId}
            options={[
              { value: "", label: "Select an analyzed source snapshot" },
              ...(snapshots.data ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.id}` })),
            ]}
          />
          <Button
            disabled={publish.isPending || !snapshots.data?.some((s) => s.id === snapshotId)}
            onClick={() => {
              if (window.confirm("Publish this source snapshot to all class members?"))
                publish.mutate({ workspaceId, projectId, snapshotId });
            }}
          >
            Publish reference snapshot
          </Button>
        </>
      )}
      {publish.data && (
        <p role="status" className="text-sm">
          Reference published to the workspace.
        </p>
      )}
      {[create.error, publish.error, projects.error, snapshots.error]
        .filter(Boolean)
        .map((error, i) => (
          <ErrorState key={i} error={error} />
        ))}
    </DetailPanel>
  );
}
