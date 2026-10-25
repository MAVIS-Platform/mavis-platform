"use client";
import { useState } from "react";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
export function CreateWorkspace() {
  const session = useSession(),
    create = useApiMutation("createWorkspace");
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  if (!["lecturer", "admin"].includes(session.data?.user?.role ?? "")) return null;
  return (
    <form
      className="space-y-3 mb-5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { code, name },
          {
            onSuccess: () => {
              setCode("");
              setName("");
            },
          },
        );
      }}
    >
      <Input
        aria-label="Workspace code"
        placeholder="Class code"
        required
        maxLength={50}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Input
        aria-label="Workspace name"
        placeholder="Class name"
        required
        maxLength={255}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button disabled={create.isPending}>Create workspace</Button>
      {create.error && <ErrorState error={create.error} />}
    </form>
  );
}
export function WorkspaceControls({
  workspace,
}: {
  workspace: import("@/lib/api/contracts").Response<"workspaces">[number];
}) {
  const session = useSession(),
    add = useApiMutation("addWorkspaceMember"),
    remove = useApiMutation("removeWorkspaceMember"),
    archive = useApiMutation("archiveWorkspace"),
    update = useApiMutation("updateWorkspace");
  const [email, setEmail] = useState(""),
    [name, setName] = useState(workspace.name);
  if (workspace.myRole !== "LECTURER" && session.data?.user?.role !== "admin") return null;
  return (
    <div className="space-y-3 mt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ workspaceId: workspace.id, name });
        }}
        className="flex gap-2"
      >
        <Input
          aria-label="Workspace name"
          required
          maxLength={255}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button disabled={update.isPending}>Rename</Button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(
            { workspaceId: workspace.id, email, memberRole: "STUDENT" },
            { onSuccess: () => setEmail("") },
          );
        }}
        className="flex gap-2"
      >
        <Input
          aria-label="Student email"
          type="email"
          required
          placeholder="Student email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button disabled={add.isPending}>Add student</Button>
      </form>
      {workspace.members
        .filter((m) => m.role === "student")
        .map((m) => (
          <p key={m.id}>
            {m.name}{" "}
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${m.name} from this class?`))
                  remove.mutate({ workspaceId: workspace.id, userId: m.id });
              }}
            >
              Remove
            </Button>
          </p>
        ))}
      {workspace.status !== "ARCHIVED" && (
        <Button
          variant="outline"
          disabled={archive.isPending}
          onClick={() => {
            if (window.confirm("Archive this workspace?"))
              archive.mutate({ workspaceId: workspace.id });
          }}
        >
          Archive workspace
        </Button>
      )}
      {[add.error, remove.error, archive.error, update.error].filter(Boolean).map((e, i) => (
        <ErrorState key={i} error={e} />
      ))}
    </div>
  );
}
