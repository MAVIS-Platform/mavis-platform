"use client";
import { useState } from "react";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import { FormField, SelectField } from "@/components/shared/forms";
import { Textarea } from "@/components/ui/textarea";
import { BookOpenCheck, Landmark, UsersRound } from "lucide-react";
export function CreateWorkspace() {
  const session = useSession(),
    create = useApiMutation("createWorkspace");
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  if (!["lecturer", "admin"].includes(session.data?.user?.role ?? "")) return null;
  return (
    <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-6 py-7 sm:px-9 sm:py-9 lg:border-b-0 lg:border-r">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border border-primary/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-5 -top-12 size-52 rounded-full border border-primary/10"
          />
          <div className="relative max-w-xl">
            <div className="mb-7 flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-background/80 text-primary shadow-sm">
              <Landmark aria-hidden="true" className="size-6" />
            </div>
            <p className="mb-2 text-sm font-medium text-primary">Create a teaching workspace</p>
            <h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Create a place for learning to take shape.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              Set up a class space for your students, course materials, and architecture labs. You
              can invite registered students and publish assignments after creation.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-border/70 pt-5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <UsersRound aria-hidden="true" className="size-4 text-primary" />
                Manage your class roster
              </span>
              <span className="inline-flex items-center gap-2">
                <BookOpenCheck aria-hidden="true" className="size-4 text-primary" />
                Organize coursework
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 lg:p-9">
          <div className="mb-7">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Class details</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Choose a recognizable code and a name students will see.
            </p>
          </div>
          <form
            className="space-y-5"
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
            <FormField
              label="Workspace code"
              hint="A short identifier for your class, up to 50 characters."
            >
              {(props) => (
                <Input
                  {...props}
                  aria-label="Workspace code"
                  placeholder="e.g. SE181070"
                  required
                  maxLength={50}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="Workspace name"
              hint="Use the course or cohort name students will recognize."
            >
              {(props) => (
                <Input
                  {...props}
                  aria-label="Workspace name"
                  placeholder="e.g. Software Architecture · Fall 2026"
                  required
                  maxLength={255}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </FormField>
            {create.error && <ErrorState error={create.error} />}
            <div className="border-t border-border pt-5">
              <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
                {create.isPending ? "Creating class…" : "Create class"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
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
              <Button
                type="submit"
                disabled={update.isPending}
                title="Rename and save class settings"
              >
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
