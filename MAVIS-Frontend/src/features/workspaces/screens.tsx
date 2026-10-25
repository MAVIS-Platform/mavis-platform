"use client";
import Link from "next/link";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel } from "@/components/shared/data";
import { CreateWorkspace, WorkspaceControls } from "./manage";
export function Workspaces() {
  const query = useApiQuery("workspaces", {});
  const selection = useSelection();
  return (
    <>
      <CreateWorkspace />
      <RequestState query={query} empty={!query.data?.length}>
        {query.data?.map((workspace) => (
          <DetailPanel key={workspace.id} title={workspace.name}>
            <p className="text-sm text-muted-foreground">{workspace.members.length} members</p>
            <WorkspaceControls workspace={workspace} />
            <Link
              className="text-sm text-primary underline"
              href="/workspace-overview"
              onClick={() => selection.setWorkspaceId(workspace.id)}
            >
              Open teaching workspace
            </Link>
            <Link
              className="ml-4 text-sm text-primary underline"
              href="/assignments"
              onClick={() => selection.setWorkspaceId(workspace.id)}
            >
              View assignments
            </Link>
          </DetailPanel>
        ))}
      </RequestState>
    </>
  );
}
export function WorkspaceMembers() {
  const { workspaceId } = useSelection();
  const query = useApiQuery("workspaces", {});
  const workspace = query.data?.find((w) => w.id === workspaceId);
  return (
    <RequestState query={query} empty={!workspace}>
      <DataTable
        rows={workspace?.members ?? []}
        rowKey={(m) => m.id}
        caption="Workspace members"
        columns={[
          { key: "name", label: "Name", render: (m) => m.name },
          { key: "role", label: "Role", render: (m) => m.role },
        ]}
      />
    </RequestState>
  );
}
export function ReferenceVersions() {
  const { workspaceId } = useSelection();
  const query = useApiQuery(
    "referenceVersions",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  return workspaceId ? (
    <RequestState query={query} empty={!query.data?.length}>
      {query.data?.map((reference) => (
        <DetailPanel key={reference.id} title={reference.snapshot.name}>
          <p className="break-all text-sm text-muted-foreground">
            Reference source {reference.snapshot.id} · model {reference.model.id} · revision{" "}
            {reference.model.revision}
          </p>
          <DataTable
            rows={reference.model.elements}
            rowKey={(e) => e.id}
            caption="Reference architecture elements"
            columns={[
              { key: "name", label: "Element", render: (e) => e.name },
              { key: "description", label: "Description", render: (e) => e.description },
            ]}
          />
        </DetailPanel>
      ))}
    </RequestState>
  ) : null;
}
