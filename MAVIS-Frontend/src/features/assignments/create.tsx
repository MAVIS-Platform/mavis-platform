"use client";
import { useCallback, useState } from "react";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { DetailPanel } from "@/components/shared/data";
import { Textarea } from "@/components/ui/textarea";
import { AssignmentSourcePicker } from "./source-picker";
import type { Assignment } from "./requirements";
import { normalizeDiagramRequirements } from "@/lib/architecture/coursework-diagram-types";
import { DIAGRAM_REQUIREMENTS } from "./requirements";
export function CreateAssignment({
  workspaceId,
  assignment,
  onSuccess,
}: {
  workspaceId: string;
  assignment?: Assignment;
  onSuccess?: () => void;
}) {
  const create = useApiMutation(assignment ? "updateAssignment" : "createAssignment"),
    session = useSession(),
    workspaces = useApiQuery("workspaces", {});
  const [title, setTitle] = useState(assignment?.title ?? ""),
    [description, setDescription] = useState(assignment?.instructions ?? ""),
    [due, setDue] = useState(
      assignment?.dueAt && assignment.dueAt !== "No deadline"
        ? new Date(
            new Date(assignment.dueAt).getTime() -
              new Date(assignment.dueAt).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [trace, setTrace] = useState(assignment?.requireRuntimeTrace ?? false);
  const [sourceModelId, setSourceModelId] = useState(assignment?.referenceSource?.modelId ?? "");
  const [sourcePending, setSourcePending] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);
  const sourceChanged = useCallback((id: string, pending: boolean) => {
    setSourceModelId(id);
    setSourcePending(pending);
  }, []);
  const [required, setRequired] = useState<string[]>(
    normalizeDiagramRequirements(assignment?.requiredDiagramTypes ?? []),
  );
  if (
    session.data?.user?.role !== "admin" &&
    workspaces.data?.find((w) => w.id === workspaceId)?.myRole !== "LECTURER"
  )
    return null;
  return (
    <DetailPanel title={assignment ? "Edit assignment" : "Create assignment"}>
      <form
        className="space-y-3 mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (sourcePending) return;
          create.mutate(
            {
              workspaceId,
              ...(assignment ? { assignmentId: assignment.id } : {}),
              title,
              description,
              dueAt: due ? new Date(due).toISOString() : null,
              requireRuntimeTrace: trace,
              requiredDiagramTypes: required,
              referenceModelId: sourceModelId || undefined,
              clearReferenceSource: !sourceModelId,
            },
            {
              onSuccess: () => {
                onSuccess?.();
                if (assignment) return;
                setSourceModelId("");
                setSourceKey((key) => key + 1);
                setRequired([]);
                setTrace(false);
                setTitle("");
                setDescription("");
                setDue("");
              },
            },
          );
        }}
      >
        <Input
          aria-label="Assignment title"
          placeholder="Assignment title"
          required
          maxLength={255}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          aria-label="Assignment instructions"
          placeholder="Instructions"
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label>
          Deadline (optional)
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} />
          Require runtime trace
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Required diagram types</legend>
          <p className="text-xs text-muted-foreground">
            Choose from the 9 diagram views and Graph available in the workspace.
          </p>
          {assignment?.requiredDiagramTypes?.some(
            (type) => type === "C4" || type === "VIEW_4_PLUS_1",
          ) && (
            <p className="text-xs text-muted-foreground">
              Legacy groups have been mapped to the current diagram catalog. Review the individual
              C4 levels before saving.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {DIAGRAM_REQUIREMENTS.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={required.includes(type.id)}
                  onChange={(e) =>
                    setRequired((current) =>
                      e.target.checked
                        ? [...current, type.id]
                        : current.filter((t) => t !== type.id),
                    )
                  }
                />
                {type.label}
              </label>
            ))}
          </div>
        </fieldset>
        <AssignmentSourcePicker
          key={sourceKey}
          workspaceId={workspaceId}
          title={title}
          initial={assignment?.referenceSource}
          onChange={sourceChanged}
        />
        {sourcePending && (
          <p className="text-sm text-muted-foreground">
            Finish selecting or analyzing the reference version before saving, or choose no
            reference source.
          </p>
        )}
        <Button disabled={create.isPending || sourcePending}>
          {assignment ? "Save assignment" : "Create assignment"}
        </Button>
        {create.error && <ErrorState error={create.error} />}
      </form>
    </DetailPanel>
  );
}
