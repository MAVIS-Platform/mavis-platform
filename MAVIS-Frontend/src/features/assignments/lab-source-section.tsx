"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, GitBranch, Network, Save } from "lucide-react";
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
  const reference = assignment.referenceSource;
  const referenceProject = reference?.projectId;
  const referenceModel = reference?.modelId;
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

      {referenceProject && referenceModel && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div>
            <h3 className="font-semibold">{t("Generated architecture views", "Sơ đồ kiến trúc được tạo tự động")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "C1–C3 are generated from the pinned analysis of this repository, so students read the theory next to the same architecture the Lab is based on.",
                "C1–C3 được tạo từ phân tích đã ghim của repo này, để sinh viên đọc lý thuyết cùng kiến trúc mà Lab đang dựa trên.",
              )}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { kind: "CONTEXT", label: "C1 System Context", hint: t("System, actors and external systems", "Hệ thống, tác nhân và hệ thống ngoài") },
              { kind: "CONTAINER", label: "C2 Container", hint: t("Services, databases and their connections", "Service, database và kết nối") },
              { kind: "COMPONENT", label: "C3 Component", hint: t("Components inside a container", "Thành phần bên trong container") },
            ].map((view) => (
              <Button key={view.kind} asChild variant="outline" className="h-auto justify-between py-2.5">
                <Link
                  href={`/diagrams?${new URLSearchParams({
                    project: referenceProject,
                    model: referenceModel,
                    kind: view.kind,
                  })}`}
                >
                  <span className="text-left">
                    <span className="block text-sm font-medium">{view.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{view.hint}</span>
                  </span>
                  <ArrowUpRight className="ml-2 size-4 shrink-0" aria-hidden="true" />
                </Link>
              </Button>
            ))}
            <Button asChild variant="outline" className="h-auto justify-between py-2.5">
              <Link
                href={`/architecture?${new URLSearchParams({
                  project: referenceProject,
                  model: referenceModel,
                })}`}
              >
                <span className="text-left">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Network className="size-3.5" aria-hidden="true" />
                    {t("Dependency graph", "Đồ thị phụ thuộc")}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t("Module and class dependencies from the analysis", "Phụ thuộc module và lớp từ phân tích")}
                  </span>
                </span>
                <ArrowUpRight className="ml-2 size-4 shrink-0" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
