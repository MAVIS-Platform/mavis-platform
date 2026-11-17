"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Assignment } from "./requirements";

type LabPrerequisite = { assignmentId: string; prerequisiteAssignmentIds: string[] };

export function LabPrerequisitesDialog({
  workspaceId,
  lab,
  labs,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  lab: Assignment | null;
  labs: Assignment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const prerequisites = useQuery({
    queryKey: ["api", "lab-prerequisites", workspaceId],
    queryFn: ({ signal }) =>
      api<LabPrerequisite[]>(`workspaces/${workspaceId}/lab-prerequisites`, { signal }),
    enabled: open && Boolean(workspaceId),
    retry: false,
  });

  useEffect(() => {
    if (!open || !lab) return;
    const current = prerequisites.data?.find((item) => item.assignmentId === lab.id);
    setSelected(new Set(current?.prerequisiteAssignmentIds ?? []));
    setError("");
  }, [open, lab, prerequisites.data]);

  const save = useMutation({
    mutationFn: () =>
      api<LabPrerequisite>(
        `workspaces/${workspaceId}/course-labs/${lab!.id}/prerequisites`,
        {
          method: "PUT",
          body: JSON.stringify({ prerequisiteAssignmentIds: [...selected] }),
        },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["api", "course-roadmap", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
      onOpenChange(false);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });

  if (!lab) return null;
  const candidates = labs
    .filter((item) => item.id !== lab.id)
    .sort((left, right) => (left.labOrder ?? 999) - (right.labOrder ?? 999));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Unlock prerequisites", "Điều kiện mở khoá")}</DialogTitle>
          <DialogDescription>
            {t(
              `Choose which Labs must be passed before "${lab.title}" unlocks. Leave every box unchecked to keep the sequential rule (the preceding Lab).`,
              `Chọn các Lab phải đạt trước khi mở "${lab.title}". Để trống để giữ quy tắc tuần tự (Lab ngay trước).`,
            )}
          </DialogDescription>
        </DialogHeader>

        {prerequisites.isPending ? (
          <p className="text-sm text-muted-foreground">{t("Loading…", "Đang tải…")}</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("There is no other published Lab to depend on.", "Chưa có Lab nào khác đã công bố để làm điều kiện.")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.has(candidate.id)}
                    onChange={(event) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.id);
                        else next.delete(candidate.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.labOrder ? `${candidate.labOrder}. ` : ""}
                    {candidate.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {save.error && !error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel", "Huỷ")}
          </Button>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("Saving…", "Đang lưu…") : t("Save prerequisites", "Lưu điều kiện")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
