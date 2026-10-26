"use client";
import { useState } from "react";
import { useApiQuery, useApiMutation, usePermission, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { RequestState } from "@/components/shared/request-state";
import { SelectField } from "@/components/shared/forms";
import { DetailPanel } from "@/components/shared/data";
import { SubmissionComposer } from "@/features/submissions/composer";
import { CreateAssignment } from "./create";
import Link from "next/link";
export function Assignments() {
  const { workspaceId } = useSelection();
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const [assignmentId, setAssignmentId] = useState("");
  const assignment = query.data?.find((a) => a.id === assignmentId) ?? query.data?.[0];
  const canSubmit = usePermission("submission:create");
  const canManage = usePermission("workspace:manage");
  const remove = useApiMutation("deleteAssignment");
  return workspaceId ? (
    <>
      {canManage && (
        <details className="rounded-xl border bg-card p-4" open={!query.data?.length}>
          <summary className="cursor-pointer text-sm font-semibold">Create assignment</summary>
          <CreateAssignment key={workspaceId} workspaceId={workspaceId} />
        </details>
      )}
      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={
          canSubmit
            ? "Your lecturer has not published an assignment in this class yet."
            : "No assignments in this class yet. Create one above to receive student submissions."
        }
      >
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
              {canManage && (
                <Link
                  className="text-sm text-primary underline"
                  href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}
                >
                  Review submissions for this assignment
                </Link>
              )}
              {canManage && (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Edit assignment requirements
                    </summary>
                    <CreateAssignment
                      key={assignment.id}
                      workspaceId={workspaceId}
                      assignment={assignment}
                    />
                  </details>
                  <Button
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this assignment? Assignments with submissions cannot be deleted.",
                        )
                      )
                        remove.mutate({ workspaceId, assignmentId: assignment.id });
                    }}
                  >
                    Delete assignment
                  </Button>
                  {remove.error && <ErrorState error={remove.error} />}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Required diagrams:{" "}
                {assignment.requiredDiagramTypes?.join(", ") || "Any saved diagram"} · Runtime
                trace: {assignment.requireRuntimeTrace ? "Required" : "Optional"}
              </p>
            </DetailPanel>
            {canSubmit && (
              <SubmissionComposer
                key={assignment.id}
                assignmentId={assignment.id}
                requirements={assignment}
                workspaceId={workspaceId}
              />
            )}
          </div>
        )}
      </RequestState>
    </>
  ) : null;
}
