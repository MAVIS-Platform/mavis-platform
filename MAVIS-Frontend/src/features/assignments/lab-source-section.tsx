"use client";

import { useState } from "react";
import { GitBranch, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { AssignmentSourceDetails, AssignmentSourcePicker } from "./source-picker";
import type { Assignment } from "./requirements";

export function LabSourceSection({
  workspaceId,
  assignment,
}: {
  workspaceId: string;
  assignment: Assignment;
}) {
  const { t } = useLocale();
  const save = useApiMutation("updateAssignment");
  const [modelId, setModelId] = useState(assignment.referenceSource?.modelId ?? "");
  const [sourcePending, setSourcePending] = useState(false);

  const dueAt =
    assignment.dueAt && assignment.dueAt !== "No deadline" ? assignment.dueAt : null;
  const canSave = Boolean(modelId) && !sourcePending && !save.isPending;

  const saveSource = () => {
    if (!canSave) return;
    save.mutate({
      workspaceId,
      assignmentId: assignment.id,
      title: assignment.title,
      description: assignment.instructions,
      dueAt,
      requireRuntimeTrace: assignment.requireRuntimeTrace === true,
      requiredDiagramTypes: assignment.requiredDiagramTypes ?? [],
      referenceModelId: modelId,
      clearReferenceSource: false,
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            {t("Reference repository and pinned analysis", "Repo tham chiếu và phân tích đã ghim")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Import a GitHub repository at a full commit SHA or a ZIP snapshot, run static analysis, then pin the model version to this Lab.",
              "Nhập repo GitHub với commit SHA đầy đủ hoặc snapshot ZIP, chạy phân tích tĩnh rồi ghim phiên bản model vào Lab.",
            )}
          </p>
        </div>
        <AssignmentSourcePicker
          key={assignment.id}
          workspaceId={workspaceId}
          title={assignment.title}
          initial={assignment.referenceSource}
          onChange={(id, pending) => {
            setModelId(id);
            setSourcePending(pending);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {modelId
              ? t("A pinned model is selected. Save it to the Lab.", "Đã chọn model ghim. Lưu vào Lab.")
              : t(
                  "Choose an analyzed model version to pin it to this Lab.",
                  "Chọn phiên bản model đã phân tích để ghim vào Lab.",
                )}
          </p>
          <Button type="button" disabled={!canSave} onClick={saveSource}>
            <Save className="mr-1 size-4" aria-hidden="true" />
            {save.isPending
              ? t("Saving source…", "Đang lưu nguồn…")
              : t("Save source to Lab", "Lưu nguồn vào Lab")}
          </Button>
        </div>
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        {save.isSuccess && (
          <p role="status" className="text-sm text-success">
            {t("Reference source pinned to this Lab.", "Đã ghim nguồn tham chiếu vào Lab.")}
          </p>
        )}
      </section>

      {assignment.referenceSource && (
        <AssignmentSourceDetails
          source={assignment.referenceSource}
          assignmentId={assignment.id}
        />
      )}
    </div>
  );
}
