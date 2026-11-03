"use client";
import { isDeadlinePassed } from "@/features/submissions/submission-readiness";
import { Badge } from "@/components/ui/badge";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
import { AssignmentSourceDetails } from "./source-picker";
import { useState } from "react";
import { useApiQuery, useApiMutation, usePermission, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { DetailPanel } from "@/components/shared/data";
import { SubmissionComposer } from "@/features/submissions/composer";
import { CreateAssignment } from "./create";
import { AssignmentInstructions } from "./assignment-instructions";
import Link from "next/link";

function formatDeadline(value: string | undefined): string {
  if (!value || value === "No deadline") return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function Assignments() {
  const { workspaceId } = useSelection();
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canSubmit = usePermission("submission:create");
  const canManage = usePermission("workspace:manage");
  const remove = useApiMutation("deleteAssignment");
  return workspaceId ? (
    <div className="space-y-5">
      {canManage && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant={showCreate ? "outline" : "default"}
            onClick={() => setShowCreate((open) => !open)}
          >
            {showCreate ? "Close create form" : "Create assignment"}
          </Button>
        </div>
      )}
      {canManage && showCreate && (
        <CreateAssignment
          key={workspaceId}
          workspaceId={workspaceId}
          onSuccess={() => setShowCreate(false)}
        />
      )}
      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={
          canSubmit
            ? "Your lecturer has not published an assignment in this class yet."
            : "No assignments in this class yet. Click Create assignment above to publish one."
        }
      >
        <div className="space-y-4">
          {query.data?.map((assignment) => {
            const overdue = isDeadlinePassed(assignment.dueAt);
            return (
              <div key={assignment.id} id={`assignment-${assignment.id}`} className="scroll-mt-20">
                <DetailPanel
                  title={assignment.title}
                  actions={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={overdue ? "destructive" : "outline"}>
                        Due {formatDeadline(assignment.dueAt)}
                      </Badge>
                      {assignment.requireRuntimeTrace ? (
                        <Badge variant="warning">Runtime Trace Required</Badge>
                      ) : (
                        <Badge variant="outline">Runtime Trace Optional</Badge>
                      )}
                    </div>
                  }
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Required diagrams:
                    </span>
                    {assignment.requiredDiagramTypes &&
                    assignment.requiredDiagramTypes.length > 0 ? (
                      assignment.requiredDiagramTypes.map((t) => (
                        <Badge key={t} variant="secondary">
                          {diagramTypeLabel(t)}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">Any saved diagram</Badge>
                    )}
                  </div>
                  <AssignmentInstructions>{assignment.instructions}</AssignmentInstructions>
                  <AssignmentSourceDetails
                    source={assignment.referenceSource}
                    assignmentId={assignment.id}
                  />
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        className="text-sm text-primary underline"
                        href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}
                      >
                        Review submissions for this assignment
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingId((current) =>
                            current === assignment.id ? null : assignment.id,
                          )
                        }
                      >
                        {editingId === assignment.id
                          ? "Close edit"
                          : "Edit assignment & reference source"}
                      </Button>
                      <Button
                        size="sm"
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
                    </div>
                  )}
                  {canManage && editingId === assignment.id && (
                    <CreateAssignment
                      key={assignment.id}
                      workspaceId={workspaceId}
                      assignment={assignment}
                      onSuccess={() => setEditingId(null)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Required diagrams:{" "}
                    {assignment.requiredDiagramTypes?.map(diagramTypeLabel).join(", ") ||
                      "Any saved diagram"}{" "}
                    · Runtime trace: {assignment.requireRuntimeTrace ? "Required" : "Optional"}
                  </p>
                  {canSubmit && (
                    <SubmissionComposer
                      key={assignment.id}
                      assignmentId={assignment.id}
                      requirements={assignment}
                      workspaceId={workspaceId}
                    />
                  )}
                </DetailPanel>
              </div>
            );
          })}
        </div>
      </RequestState>
    </div>
  ) : null;
}
