"use client";
import { useState } from "react";
import { useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { DetailPanel } from "@/components/shared/data";
import { SubmissionComposer } from "@/features/submissions/composer";
import { CreateAssignment } from "./create";
export function Assignments() {
  const { workspaceId } = useSelection();
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const [assignmentId, setAssignmentId] = useState("");
  const assignment = query.data?.find((a) => a.id === assignmentId) ?? query.data?.[0];
  const canSubmit = usePermission("submission:create");
  return workspaceId ? (
    <>
      <CreateAssignment workspaceId={workspaceId} />
      <RequestState query={query} empty={!query.data?.length}>
        {assignment && (
          <div className="space-y-5">
            <SelectField
              label="Assignment"
              value={assignment.id}
              onChange={setAssignmentId}
              options={(query.data ?? []).map((a) => ({ value: a.id, label: a.title }))}
            />
            <DetailPanel title={assignment.title}>
              <p className="text-sm text-muted-foreground">{assignment.instructions}</p>
              <p className="text-xs text-muted-foreground">Due {assignment.dueAt}</p>
            </DetailPanel>
            {canSubmit && <SubmissionComposer key={assignment.id} assignmentId={assignment.id} />}
          </div>
        )}
      </RequestState>
    </>
  ) : null;
}
