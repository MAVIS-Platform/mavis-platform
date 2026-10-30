"use client";
import { useState } from "react";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import { FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel } from "@/components/shared/data";
import { Textarea } from "@/components/ui/textarea";
export function CreateWorkspace() {
  const session = useSession(),
    create = useApiMutation("createWorkspace");
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  if (!["lecturer", "admin"].includes(session.data?.user?.role ?? "")) return null;
  return (
    <DetailPanel title="Create a teaching workspace">
      <p className="text-sm text-muted-foreground">
        Create a class, add registered students, then publish assignments and review their submitted
        model versions.
      </p>
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
        <FormField label="Workspace code">
          {(props) => (
            <Input
              {...props}
              aria-label="Workspace code"
              placeholder="Class code"
              required
              maxLength={50}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Workspace name">
          {(props) => (
            <Input
              {...props}
              aria-label="Workspace name"
              placeholder="Class name"
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <Button disabled={create.isPending}>Create workspace</Button>
        {create.error && <ErrorState error={create.error} />}
      </form>
    </DetailPanel>
  );
}
export function WorkspaceControls({
  workspace,
  mode = "all",
}: {
  workspace: import("@/lib/api/contracts").Response<"workspaces">[number];
  mode?: "overview" | "members" | "all";
}) {
  const session = useSession(),
    add = useApiMutation("addWorkspaceMember"),
    remove = useApiMutation("removeWorkspaceMember"),
    archive = useApiMutation("archiveWorkspace"),
    update = useApiMutation("updateWorkspace");
  const batch = useApiMutation("batchWorkspaceMembers");
  const [emails, setEmails] = useState("");
  const [description, setDescription] = useState(workspace.description ?? "");
  const [email, setEmail] = useState(""),
    [name, setName] = useState(workspace.name),
    [memberRole, setMemberRole] = useState<"STUDENT" | "LECTURER">("STUDENT");
  if (workspace.myRole !== "LECTURER" && session.data?.user?.role !== "admin") return null;
  const showOverview = mode === "overview" || mode === "all";
  const showMembers = mode === "members" || mode === "all";
  return (
    <div className="space-y-3 mt-4">
      {showOverview && (
        <>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ workspaceId: workspace.id, name, description });
            }}
          >
            <FormField label="Workspace name">
              {(props) => (
                <Input
                  {...props}
                  aria-label="Workspace name"
                  required
                  maxLength={255}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Class description">
              {(props) => (
                <Textarea
                  {...props}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                />
              )}
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" disabled={update.isPending} title="Rename and save class settings">
                {update.isPending ? "Saving..." : "Save class settings"}
              </Button>
            </div>
          </form>
        </>
      )}
      {showMembers && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(
                { workspaceId: workspace.id, email, memberRole },
                { onSuccess: () => setEmail("") },
              );
            }}
            className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
          >
            <FormField label="Registered member email">
              {(props) => (
                <Input
                  {...props}
                  aria-label="Registered member email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </FormField>
            <SelectField
              label="Class role"
              value={memberRole}
              onChange={(value) => setMemberRole(value as "STUDENT" | "LECTURER")}
              options={[
                { value: "STUDENT", label: "Student" },
                { value: "LECTURER", label: "Lecturer" },
              ]}
            />
            <Button disabled={add.isPending || workspace.status === "ARCHIVED"}>Add member</Button>
          </form>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add students in bulk</summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                batch.mutate({
                  workspaceId: workspace.id,
                  emails: [...new Set(emails.split(/[\s,;]+/).filter(Boolean))],
                });
              }}
            >
              <Textarea
                aria-label="Student email list"
                placeholder="One registered email per line"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                required
              />
              <Button disabled={batch.isPending || workspace.status === "ARCHIVED"}>
                Add students
              </Button>
              {batch.data && (
                <div role="status" className="text-sm">
                  Added: {batch.data.addedCount}
                  <br />
                  Already members: {batch.data.alreadyMemberEmails.join(", ") || "none"}
                  <br />
                  Accounts not found: {batch.data.notFoundEmails.join(", ") || "none"}
                </div>
              )}
              {batch.error && <ErrorState error={batch.error} />}
            </form>
          </details>
        </>
      )}
      {showOverview && workspace.status !== "ARCHIVED" && (
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
      {showOverview && workspace.status === "ARCHIVED" && (
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ workspaceId: workspace.id, name: workspace.name, status: "ACTIVE" })
          }
        >
          Reopen workspace
        </Button>
      )}
      {[add.error, remove.error, archive.error, update.error].filter(Boolean).map((e, i) => (
        <ErrorState key={i} error={e} />
      ))}
    </div>
  );
}
