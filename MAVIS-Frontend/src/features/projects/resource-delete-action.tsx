"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/forms";
import { useApi, useApiMutation, useSelection } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";

export function ResourceDeleteAction({
  projectId,
  name,
  snapshotId,
  disabled = false,
}: {
  projectId: string;
  name: string;
  snapshotId?: string;
  disabled?: boolean;
}) {
  const api = useApi(),
    selection = useSelection(),
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const { t } = useLocale();
  const remove = useApiMutation(snapshotId ? "deleteSnapshot" : "deleteProject");
  const [open, setOpen] = useState(false),
    [typed, setTyped] = useState("");
  const label = snapshotId
    ? t("Delete snapshot", "Xóa bản chụp")
    : t("Delete project", "Xóa dự án");
  async function confirm() {
    if (typed !== "DELETE") return;
    try {
      await remove.mutateAsync(snapshotId ? { projectId, snapshotId } : { projectId });
      setOpen(false);
      const next = new URLSearchParams(params.toString());
      if (!snapshotId && selection.projectId === projectId) {
        selection.setProjectId("");
        next.delete("project");
      }
      if (snapshotId || selection.projectId === projectId) {
        next.delete("model");
        next.delete("snapshot");
        next.delete("job");
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    } catch {
      /* Keep the confirmation and server conflict visible for recovery. */
    }
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled || api.mode !== "backend"}
        title={
          api.mode !== "backend"
            ? t("Deletion requires a connected backend", "Cần kết nối backend để xóa dữ liệu")
            : label
        }
        aria-label={`${label}: ${name}`}
        onClick={() => {
          remove.reset();
          setTyped("");
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("Delete", "Xóa")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        pending={remove.isPending}
        confirmDisabled={typed !== "DELETE"}
        description={
          snapshotId
            ? t(
                "Permanently deletes this snapshot, its analysis history and generated revisions when no protected records depend on them. Published, submitted and runtime-linked snapshots are protected. Shared stored files are not immediately purged.",
                "Xóa vĩnh viễn bản chụp, lịch sử phân tích và revision sinh ra nếu không có dữ liệu cần bảo vệ tham chiếu. Không xóa bản chụp đã công bố, nộp bài hoặc liên kết runtime. File lưu trữ dùng chung không bị xóa ngay.",
              )
            : t(
                "Removes this project from your project lists. Its snapshots and history are retained. This does not delete the GitHub repository or erase stored files.",
                "Gỡ dự án khỏi danh sách dự án. Bản chụp và lịch sử được giữ lại. Không xóa repository GitHub hay file lưu trữ.",
              )
        }
        onConfirm={() => void confirm()}
        error={
          remove.error ? (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          ) : undefined
        }
      >
        <p className="break-words font-medium" translate="no">
          {name}
        </p>
        <label className="block space-y-2 text-sm">
          <span>{t("Type DELETE to confirm", "Nhập DELETE để xác nhận")}</span>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
