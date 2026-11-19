"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, GitBranch, Network, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { ArchitectureDiagrams } from "@/features/architecture/architecture-diagrams";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { useRuntimeSetupReadiness, useStudentLabContext } from "@/features/workspaces/course-access";
import { AssignmentSourceDetails, AssignmentSourcePicker } from "./source-picker";
import type { Assignment } from "./requirements";

type PreviewKind = "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH";

export function LabSourceSection({
  workspaceId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignment: Assignment;
  onNavigate?: ((tab: "theory" | "quiz" | "publish") => void) | undefined;
}) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const save = useApiMutation("updateAssignment");
  const [modelId, setModelId] = useState(assignment.referenceSource?.modelId ?? "");
  const [pickedVersion, setPickedVersion] = useState<{
    modelId: string;
    projectId: string;
    snapshotId: string;
  } | null>(null);
  const [sourcePending, setSourcePending] = useState(false);
  const [previewKind, setPreviewKind] = useState<PreviewKind>("CONTAINER");
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);

  const dueAt =
    assignment.dueAt && assignment.dueAt !== "No deadline" ? assignment.dueAt : null;
  const reference = assignment.referenceSource;
  const referenceProject =
    (modelId && pickedVersion?.modelId === modelId ? pickedVersion.projectId : undefined) ||
    reference?.projectId;
  const referenceModel = modelId || reference?.modelId;
  const canSave = Boolean(modelId) && !sourcePending && !save.isPending;

  const studentCtx = useStudentLabContext(
    workspaceId,
    assignment.id,
    Boolean(referenceProject && referenceModel),
  );
  const modelQuery = useApiQuery(
    "model",
    {
      projectId: referenceProject ?? "",
      modelId: referenceModel ?? "",
    },
    { enabled: Boolean(referenceProject && referenceModel) },
  );
  const readiness = useRuntimeSetupReadiness(referenceProject ?? null);
  const staticReady = (modelQuery.data?.elements.length ?? 0) > 0;
  const studioReady = Boolean(
    readiness.data?.preflightCompatible && readiness.data?.runnerReady,
  );
  const studioMissing = [
    ...(readiness.data?.prerequisites ?? []),
    ...(readiness.data?.warnings ?? []),
  ].filter(Boolean);
  const diagrams = studentCtx.data?.referenceArchitecture?.diagrams ?? [];
  const activeMermaid =
    diagrams.find((item) => item.level?.toUpperCase() === previewKind)?.mermaidDsl ?? null;

  const saveSource = () => {
    if (!canSave) return;
    save.mutate(
      {
        workspaceId,
        assignmentId: assignment.id,
        title: assignment.title,
        description: assignment.instructions,
        dueAt,
        requireRuntimeTrace: assignment.requireRuntimeTrace === true,
        requiredDiagramTypes: assignment.requiredDiagramTypes ?? [],
        referenceModelId: modelId,
        clearReferenceSource: false,
      },
      {
        onSuccess: () => {
          void cache.invalidateQueries({
            queryKey: ["api", "student-lab-context", workspaceId, assignment.id],
          });
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-2 font-semibold">
          <GitBranch className="size-4 text-teal-600" aria-hidden="true" />
          {t("Reference repository and pinned analysis", "Repo tham chiếu và phân tích đã ghim")}
        </h2>
        <AssignmentSourcePicker
          key={assignment.id}
          workspaceId={workspaceId}
          title={assignment.title}
          initial={assignment.referenceSource}
          onChange={(id, pending) => {
            setModelId(id);
            setSourcePending(pending);
          }}
          onVersionChange={(version) => {
            if (version.modelId) setPickedVersion(version);
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
          <Button
            type="button"
            className="bg-teal-600 text-white hover:bg-teal-700"
            disabled={!canSave}
            onClick={saveSource}
          >
            <Save className="mr-1 size-4" aria-hidden="true" />
            {save.isPending
              ? t("Saving source…", "Đang lưu nguồn…")
              : t("Save source to Lab", "Lưu nguồn vào Lab")}
          </Button>
        </div>
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        {save.isSuccess && (
          <p role="status" className="text-sm text-emerald-700">
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
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t("Repository readiness report", "Báo cáo mức độ sẵn sàng của Repo")}
            </h3>
            <Badge variant={staticReady && studioReady ? "success" : staticReady ? "outline" : "warning"}>
              {staticReady && studioReady
                ? t("Ready for C1–C3 + Studio Live", "Đạt chuẩn C1–C3 + Studio Live")
                : staticReady
                  ? t("Ready for C1–C3 & Theory", "Đạt chuẩn C1–C3 & Lý thuyết")
                  : t("Checking…", "Đang kiểm tra…")}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-muted/15 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                {staticReady ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                )}
                <span>{t("Static C1–C3 & AI Theory", "Kiến trúc tĩnh C1–C3 & Lý thuyết AI")}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {modelQuery.isPending
                  ? t("Analyzing model…", "Đang đọc mô hình…")
                  : staticReady
                    ? t(
                        `${modelQuery.data!.elements.length} elements · ${modelQuery.data!.edges.length} relationships extracted.`,
                        `Đã trích xuất ${modelQuery.data!.elements.length} thành phần · ${modelQuery.data!.edges.length} liên kết.`,
                      )
                    : t(
                        "No architecture elements detected in this snapshot.",
                        "Chưa phát hiện thành phần kiến trúc trong bản snapshot này.",
                      )}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/15 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                {studioReady ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                )}
                <span>{t("Studio Live (Docker Runtime)", "Studio Live (Chạy Docker thật)")}</span>
              </div>
              {readiness.isPending ? (
                <p className="mt-1 text-muted-foreground">
                  {t("Checking Docker & runtime prerequisites…", "Đang kiểm tra cấu hình Docker & runtime…")}
                </p>
              ) : studioReady ? (
                <p className="mt-1 text-muted-foreground">
                  {t(
                    `Ready (${readiness.data?.applications.length ?? 0} services: ${(readiness.data?.applications ?? []).join(", ")})`,
                    `Sẵn sàng (${readiness.data?.applications.length ?? 0} service: ${(readiness.data?.applications ?? []).join(", ")})`,
                  )}
                </p>
              ) : (
                <div className="mt-1 space-y-1 text-amber-700 dark:text-amber-300">
                  {studioMissing.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {studioMissing.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {t(
                        "Missing Docker Compose / health probe configuration for Studio Live.",
                        "Thiếu cấu hình Docker Compose hoặc health probe cho Studio Live.",
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {referenceProject && referenceModel && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">
              {t("Generated architecture views (C1–C3 & Dependency Graph)", "Xem trước Sơ đồ Kiến trúc (C1–C3 & Đồ thị phụ thuộc)")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "CONTEXT", label: "C1 Context" },
                  { id: "CONTAINER", label: "C2 Container" },
                  { id: "COMPONENT", label: "C3 Component" },
                  { id: "GRAPH", label: t("Dependency Graph", "Đồ thị phụ thuộc") },
                ] as const
              ).map((tabItem) => (
                <Button
                  key={tabItem.id}
                  type="button"
                  size="sm"
                  variant={previewKind === tabItem.id ? "default" : "outline"}
                  onClick={() => setPreviewKind(tabItem.id)}
                >
                  {tabItem.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-72 overflow-hidden rounded-xl border bg-background p-3">
            {previewKind === "GRAPH" ? (
              modelQuery.data ? (
                <div className="space-y-3">
                  <ArchitectureGraph
                    model={modelQuery.data}
                    selectedId={selectedGraphId}
                    onSelect={setSelectedGraphId}
                  />
                  {selectedGraphId && (
                    <ElementDetailsPanel model={modelQuery.data} selectedId={selectedGraphId} />
                  )}
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("Loading dependency graph…", "Đang tải đồ thị phụ thuộc…")}
                </p>
              )
            ) : modelQuery.data && modelQuery.data.elements.length > 0 ? (
              <div className="space-y-3">
                <ArchitectureDiagrams
                  model={modelQuery.data}
                  guidedStatic
                  controlledKind={previewKind}
                  hideKindSelector
                  systemName={assignment.title}
                  selectedId={selectedGraphId}
                  onSelect={setSelectedGraphId}
                />
                {selectedGraphId && (
                  <ElementDetailsPanel model={modelQuery.data} selectedId={selectedGraphId} />
                )}
              </div>
            ) : activeMermaid ? (
              <DiagramPreview
                title={`C4 ${previewKind}`}
                content={activeMermaid}
                format="MERMAID"
                style="clean"
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {modelQuery.isPending || studentCtx.isPending
                  ? t("Loading C1–C3 preview…", "Đang tải bản xem trước C1–C3…")
                  : t(
                      "Diagram preview not available yet — use the full view links below.",
                      "Chưa có dữ liệu sơ đồ xem trước — dùng liên kết mở toàn màn hình bên dưới.",
                    )}
              </p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { kind: "CONTEXT", label: "C1 System Context" },
              { kind: "CONTAINER", label: "C2 Container" },
              { kind: "COMPONENT", label: "C3 Component" },
            ].map((view) => (
              <Button key={view.kind} asChild variant="outline" size="sm" className="justify-between">
                <Link
                  href={`/diagrams?${new URLSearchParams({
                    project: referenceProject,
                    model: referenceModel,
                    kind: view.kind,
                  })}`}
                >
                  <span>{view.label}</span>
                  <ArrowUpRight className="ml-2 size-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </Button>
            ))}
            <Button asChild variant="outline" size="sm" className="justify-between">
              <Link
                href={`/architecture?${new URLSearchParams({
                  project: referenceProject,
                  model: referenceModel,
                })}`}
              >
                <span className="flex items-center gap-1.5">
                  <Network className="size-3.5" aria-hidden="true" />
                  {t("Full Dependency Graph", "Mở đồ thị đầy đủ")}
                </span>
                <ArrowUpRight className="ml-2 size-3.5 shrink-0" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {onNavigate && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant={assignment.referenceSource?.modelId ? "default" : "outline"}
            onClick={() => onNavigate("theory")}
          >
            {assignment.referenceSource?.modelId
              ? t("Next Step 3: Lab Theory", "Sang Bước 3: Lý thuyết Lab")
              : t("Skip (Theory-only) → Step 3: Lab Theory", "Bỏ qua (Chỉ lý thuyết) → Bước 3: Lý thuyết Lab")}
            <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
