"use client";
import { useState } from "react";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import { FormField, SelectField } from "@/components/shared/forms";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/locale-context";
export function CreateWorkspace({ onClose }: { onClose?: () => void } = {}) {
  const session = useSession(),
    create = useApiMutation("createWorkspace");
  const { t } = useLocale();
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  if (!["lecturer", "admin"].includes(session.data?.user?.role ?? "")) return null;
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="create-class-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="create-class-title" className="font-semibold">
            {t("Create a class", "Tạo lớp")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(
              "Use a short class code and the name students will recognize.",
              "Dùng mã lớp ngắn và tên lớp sinh viên sẽ nhận ra.",
            )}
          </p>
        </div>
        {onClose && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("Cancel", "Hủy")}
          </Button>
        )}
      </div>
      <form
        className="mt-4 grid gap-3 md:grid-cols-[minmax(9rem,0.6fr)_minmax(0,1.4fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { code, name },
            {
              onSuccess: () => {
                setCode("");
                setName("");
                onClose?.();
              },
            },
          );
        }}
      >
        <FormField label={t("Class code", "Mã lớp")}>
          {(props) => (
            <Input
              {...props}
              aria-label="Workspace code"
              placeholder="SE181070"
              required
              maxLength={50}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t("Class name", "Tên lớp")}>
          {(props) => (
            <Input
              {...props}
              aria-label="Workspace name"
              placeholder={t("Software Architecture · Fall 2026", "Kiến trúc phần mềm · Kỳ 2026")}
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex items-end">
          <Button type="submit" className="w-full md:w-auto" disabled={create.isPending}>
            {create.isPending ? t("Creating class…", "Đang tạo lớp…") : t("Create class", "Tạo lớp")}
          </Button>
        </div>
      </form>
      {create.error && <ErrorState error={create.error} />}
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
