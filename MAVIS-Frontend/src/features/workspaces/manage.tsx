"use client";
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    [name, setName] = useState(""),
    [description, setDescription] = useState("");
  if (!["lecturer", "admin"].includes(session.data?.user?.role ?? "")) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle id="create-class-title">
            {t("Create a class", "Tạo lớp học mới")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Use a short class code and the name students will recognize.",
              "Nhập mã lớp ngắn gọn và tên lớp học để sinh viên dễ nhận diện.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                code: code.trim(),
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
              },
              {
                onSuccess: () => {
                  setCode("");
                  setName("");
                  setDescription("");
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
                autoFocus
                aria-label="Workspace code"
                placeholder="SE181070"
                required
                maxLength={50}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("Class name", "Tên lớp học")}>
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
          <FormField label={t("Description (optional)", "Mô tả ngắn (tùy chọn)")}>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={2000}
                placeholder={t(
                  "Schedule, cohort, or learning objectives for this class…",
                  "Lịch học, khóa sinh viên hoặc mục tiêu môn học…",
                )}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
          {create.error && <ErrorState error={create.error} />}
          <DialogFooter className="gap-2 pt-2">
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose}>
                {t("Cancel", "Hủy")}
              </Button>
            )}
            <Button type="submit" disabled={create.isPending || !code.trim() || !name.trim()}>
              {create.isPending
                ? t("Creating class…", "Đang tạo lớp…")
                : t("Create class", "Tạo lớp")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function WorkspaceControls({
  workspace,
  mode = "all",
  onSaved,
}: {
  workspace: import("@/lib/api/contracts").Response<"workspaces">[number];
  mode?: "overview" | "members" | "all";
  onSaved?: () => void;
}) {
  const { t } = useLocale();
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
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore" | null>(null);
  const archived = workspace.status === "ARCHIVED";
  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description ?? "");
  }, [workspace.description, workspace.name]);
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
              update.mutate(
                { workspaceId: workspace.id, name, description },
                { onSuccess: () => onSaved?.() },
              );
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
                  disabled={archived}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Class description">
              {(props) => (
                <Textarea
                  {...props}
                  value={description}
                  disabled={archived}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                />
              )}
            </FormField>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={update.isPending || archived}
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
      {showOverview && !archived && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">
                <Archive className="size-4 text-amber-600" aria-hidden="true" />
                {t("Archive class", "Lưu trữ lớp học")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "Move a completed class out of the active workspace list. Its content and history are preserved, and you can restore it later.",
                  "Đưa lớp đã kết thúc khỏi danh sách đang sử dụng. Nội dung và lịch sử vẫn được giữ nguyên, và bạn có thể khôi phục sau.",
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
              disabled={archive.isPending}
              onClick={() => setLifecycleAction("archive")}
            >
              <Archive className="mr-2 size-4" aria-hidden="true" />
              {t("Archive class", "Lưu trữ lớp")}
            </Button>
          </div>
        </section>
      )}
      {showOverview && archived && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Archive className="size-4 text-sky-600" aria-hidden="true" />
                {t("This class is archived", "Lớp học đang được lưu trữ")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "Restore it as Inactive to review and update the content before making it available to students again.",
                  "Khôi phục lớp về trạng thái Chưa hoạt động để kiểm tra và cập nhật nội dung trước khi mở lại cho sinh viên.",
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={update.isPending}
              onClick={() => setLifecycleAction("restore")}
            >
              <ArchiveRestore className="mr-2 size-4" aria-hidden="true" />
              {t("Restore class", "Khôi phục lớp")}
            </Button>
          </div>
        </section>
      )}
      {[add.error, remove.error, archive.error, update.error].filter(Boolean).map((e, i) => (
        <ErrorState key={i} error={e} />
      ))}
      <Dialog
        open={lifecycleAction !== null}
        onOpenChange={(open) => !open && setLifecycleAction(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {lifecycleAction === "archive"
                ? t("Archive this class?", "Lưu trữ lớp học này?")
                : t("Restore this class?", "Khôi phục lớp học này?")}
            </DialogTitle>
            <DialogDescription>
              {lifecycleAction === "archive"
                ? t(
                    "Students will no longer be able to access this class. Course content, members, grades, and submission history will not be deleted.",
                    "Sinh viên sẽ không thể truy cập lớp học này. Nội dung, thành viên, điểm số và lịch sử bài nộp sẽ không bị xóa.",
                  )
                : t(
                    "The class will return as Inactive. Students will remain unable to access it until you review the content and activate it.",
                    "Lớp sẽ trở về trạng thái Chưa hoạt động. Sinh viên vẫn chưa thể truy cập cho đến khi bạn kiểm tra nội dung và kích hoạt lớp.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setLifecycleAction(null)}>
              {t("Cancel", "Hủy")}
            </Button>
            <Button
              type="button"
              variant={lifecycleAction === "archive" ? "destructive" : "default"}
              disabled={archive.isPending || update.isPending}
              onClick={() => {
                if (lifecycleAction === "archive") {
                  archive.mutate(
                    { workspaceId: workspace.id },
                    {
                      onSuccess: () => {
                        setLifecycleAction(null);
                        onSaved?.();
                      },
                    },
                  );
                  return;
                }
                update.mutate(
                  { workspaceId: workspace.id, name: workspace.name, status: "INACTIVE" },
                  {
                    onSuccess: () => {
                      setLifecycleAction(null);
                      onSaved?.();
                    },
                  },
                );
              }}
            >
              {archive.isPending || update.isPending
                ? t("Updating…", "Đang cập nhật…")
                : lifecycleAction === "archive"
                  ? t("Archive class", "Lưu trữ lớp")
                  : t("Restore as Inactive", "Khôi phục về Chưa hoạt động")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
