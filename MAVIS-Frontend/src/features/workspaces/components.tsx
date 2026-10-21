"use client";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { useApiQuery, useSelection } from "@/hooks/use-api";
export function WorkspaceSelector() {
  const query = useApiQuery("workspaces", {});
  const selection = useSelection();
  return (
    <RequestState query={query} empty={!query.data?.length}>
      <div className="max-w-sm">
        <SelectField
          label="Selected workspace"
          value={selection.workspaceId}
          onChange={selection.setWorkspaceId}
          options={(query.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>
    </RequestState>
  );
}
