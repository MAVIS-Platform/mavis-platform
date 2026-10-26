"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { DetailPanel } from "@/components/shared/data";
import { Textarea } from "@/components/ui/textarea";
import type { Assignment } from "./requirements";
import { DIAGRAM_REQUIREMENTS } from "./requirements";
export function CreateAssignment({
  workspaceId,
  assignment,
}: {
  workspaceId: string;
  assignment?: Assignment;
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
  const [required, setRequired] = useState<string[]>(assignment?.requiredDiagramTypes ?? []);
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
          create.mutate(
            {
              workspaceId,
              ...(assignment ? { assignmentId: assignment.id } : {}),
              title,
              description,
              dueAt: due ? new Date(due).toISOString() : null,
              requireRuntimeTrace: trace,
              requiredDiagramTypes: required,
            },
            {
              onSuccess: () => {
                if (assignment) return;
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
          <div className="grid gap-2 sm:grid-cols-3">
            {DIAGRAM_REQUIREMENTS.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={required.includes(type)}
                  onChange={(e) =>
                    setRequired((current) =>
                      e.target.checked ? [...current, type] : current.filter((t) => t !== type),
                    )
                  }
                />
                {type}
              </label>
            ))}
          </div>
        </fieldset>
        <Button disabled={create.isPending}>
          {assignment ? "Save assignment" : "Create assignment"}
        </Button>
        {create.error && <ErrorState error={create.error} />}
      </form>
    </DetailPanel>
  );
}
