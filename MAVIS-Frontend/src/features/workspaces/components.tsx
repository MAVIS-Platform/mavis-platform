"use client";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { useApiQuery, useSelection } from "@/hooks/use-api";
export function WorkspaceSelector() {
  const query = useApiQuery("workspaces", {});
  const selection = useSelection();
  if (selection.workspaceId) return null;
  return (
    <RequestState
      query={query}
      empty={!query.data?.length}
      emptyMessage="No workspaces are available for this account yet. Open My Workspaces for class access information."
    >
      <div className="max-w-sm">
        <SelectField
          label="Selected workspace"
          value={selection.workspaceId}
          onChange={selection.setWorkspaceId}
          options={[
            { value: "", label: "Choose a workspace…" },
            ...(query.data ?? []).map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
      </div>
    </RequestState>
  );
}
