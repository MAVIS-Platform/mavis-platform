"use client";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
export function CreateAssignment({ workspaceId }: { workspaceId: string }) {
  const create = useApiMutation("createAssignment"),
    session = useSession(),
    workspaces = useApiQuery("workspaces", {});
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [due, setDue] = useState(""),
    [trace, setTrace] = useState(false);
  if (
    session.data?.user?.role !== "admin" &&
    workspaces.data?.find((w) => w.id === workspaceId)?.myRole !== "LECTURER"
  )
    return null;
  return (
    <form
      className="space-y-3 mb-5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            workspaceId,
            title,
            description,
            dueAt: due ? new Date(due).toISOString() : null,
            requireRuntimeTrace: trace,
            requiredDiagramTypes: [],
          },
          {
            onSuccess: () => {
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
      <Input
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
      <Button disabled={create.isPending}>Create assignment</Button>
      {create.error && <ErrorState error={create.error} />}
    </form>
  );
}
