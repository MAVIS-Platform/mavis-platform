"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Container,
  Download,
  FileCode2,
  FolderGit2,
  GitBranch,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { ArchitecturePresentation } from "@/features/architecture/architecture-presentation";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { useRuntimeSetupReadiness, useStudentLabContext } from "@/features/workspaces/course-access";
import { AssignmentSourcePicker } from "./source-picker";
import type { Assignment } from "./requirements";

type PreviewKind = "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH";

const DEPLOY_FILE_PATTERN =
  /(docker-compose[^/\\]*\.ya?ml|compose[^/\\]*\.ya?ml|dockerfile[^/\\]*|nginx[^/\\]*\.conf|k8s[^/\\]*\.ya?ml)/i;

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<PreviewKind>("CONTAINER");
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const lastAutoSavedModelRef = useRef<string>(assignment.referenceSource?.modelId ?? "");

  const isPublished = assignment.labOrder != null;
  const dueAt =
    assignment.dueAt && assignment.dueAt !== "No deadline" ? assignment.dueAt : null;
  const reference = assignment.referenceSource;
  const referenceProject =
    (modelId && pickedVersion?.modelId === modelId ? pickedVersion.projectId : undefined) ||
    reference?.projectId;
  const referenceModel = modelId || reference?.modelId;
  const hasSource = Boolean(referenceProject && referenceModel);
  const hasUnsavedSelection =
    !isPublished && Boolean(modelId) && modelId !== (reference?.modelId ?? "");
  const canSave = !isPublished && Boolean(modelId) && !sourcePending && !save.isPending;

  useEffect(() => {
    const savedId = reference?.modelId ?? "";
    if (savedId) {
      lastAutoSavedModelRef.current = savedId;
    }
  }, [reference?.modelId]);

  useEffect(() => {
    if (
      isPublished ||
      sourcePending ||
      save.isPending ||
      !modelId ||
      modelId === (reference?.modelId ?? "") ||
      modelId === lastAutoSavedModelRef.current
    ) {
      return;
    }
    lastAutoSavedModelRef.current = modelId;
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
          setImportModalOpen(false);
          void cache.invalidateQueries({
            queryKey: ["api", "student-lab-context", workspaceId, assignment.id],
          });
          void cache.invalidateQueries({
            queryKey: ["api", "course-setup", workspaceId],
          });
        },
        onError: () => {
          lastAutoSavedModelRef.current = "";
        },
      },
    );
  }, [
    isPublished,
    sourcePending,
    save,
    modelId,
    reference?.modelId,
    workspaceId,
    assignment.id,
    assignment.title,
    assignment.instructions,
    dueAt,
    assignment.requireRuntimeTrace,
    assignment.requiredDiagramTypes,
    cache,
  ]);

  const studentCtx = useStudentLabContext(
    workspaceId,
    assignment.id,
    hasSource,
  );
  const modelQuery = useApiQuery(
    "model",
    {
      projectId: referenceProject ?? "",
      modelId: referenceModel ?? "",
    },
    { enabled: hasSource },
  );
  const readiness = useRuntimeSetupReadiness(referenceProject ?? null);
  const staticReady = (modelQuery.data?.elements.length ?? 0) > 0;
  const studioConfiguredReady = Boolean(
    readiness.data?.preflightCompatible && readiness.data?.runnerReady,
  );
  const studioComposeReady = Boolean(
    readiness.data?.preflightCompatible && !readiness.data?.configured,
  );
  const studioReady = studioConfiguredReady || studioComposeReady;
  const detectedServices = readiness.data?.detectedServices ?? [];
  const configuredApps = readiness.data?.applications ?? [];
  const runtimeMappings = readiness.data?.mappings ?? [];
  const studioMissing = [
    ...(readiness.data?.runnerIssues ?? []),
    ...(readiness.data?.prerequisites ?? []),
    ...(readiness.data?.warnings ?? []),
  ].filter(Boolean);

  const deploymentFiles = useMemo(() => {
    const model = modelQuery.data;
    if (!model) return [];
    const found = new Set<string>();
    const collect = (loc?: string) => {
      if (!loc) return;
      const clean = loc.split(":")[0]?.trim();
      if (clean && DEPLOY_FILE_PATTERN.test(clean)) {
        found.add(clean);
      }
    };
    for (const el of model.elements) {
      for (const ev of el.evidence ?? []) collect(ev.location);
    }
    for (const edge of model.edges) {
      for (const ev of edge.evidence ?? []) collect(ev.location);
    }
    return Array.from(found).sort();
  }, [modelQuery.data]);

  const serviceBreakdown = useMemo(() => {
    const elements = modelQuery.data?.elements ?? [];
    const services = elements.filter((e) => e.elementType === "SERVICE_CONTAINER").length;
    const datastores = elements.filter(
      (e) => e.elementType === "DATABASE" || e.elementType === "DATA_STORE" || e.layer === "data",
    ).length;
    const brokers = elements.filter(
      (e) => e.elementType === "MESSAGE_BROKER" || e.elementType === "QUEUE",
    ).length;
    return { services, datastores, brokers };
  }, [modelQuery.data]);

  const diagrams = studentCtx.data?.referenceArchitecture?.diagrams ?? [];
  const activeMermaid =
    diagrams.find((item) => item.level?.toUpperCase() === previewKind)?.mermaidDsl ?? null;

  const saveSource = (closeAfter = false) => {
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
          if (closeAfter) setImportModalOpen(false);
          void cache.invalidateQueries({
            queryKey: ["api", "student-lab-context", workspaceId, assignment.id],
          });
          void cache.invalidateQueries({
            queryKey: ["api", "course-setup", workspaceId],
          });
        },
      },
    );
  };

  const clearSource = () => {
    if (isPublished || !reference?.modelId || save.isPending) return;
    save.mutate(
      {
        workspaceId,
        assignmentId: assignment.id,
        title: assignment.title,
        description: assignment.instructions,
        dueAt,
        requireRuntimeTrace: false,
        requiredDiagramTypes: assignment.requiredDiagramTypes ?? [],
        clearReferenceSource: true,
      },
      {
        onSuccess: () => {
          lastAutoSavedModelRef.current = "";
          setModelId("");
          setPickedVersion(null);
          void cache.invalidateQueries({
            queryKey: ["api", "student-lab-context", workspaceId, assignment.id],
          });
          void cache.invalidateQueries({
            queryKey: ["api", "course-setup", workspaceId],
          });
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      {!hasSource ? (
        <section className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-12 text-center">
          {!isPublished ? (
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="group flex flex-col items-center"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/35 bg-muted/40 text-muted-foreground transition group-hover:scale-[1.04] group-hover:border-primary group-hover:bg-primary/10 group-hover:text-primary">
                <Plus className="size-8 stroke-[1.75] transition-transform group-hover:rotate-90" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-foreground">
                {t("Import reference repository", "Nhập kho mã nguồn tham chiếu")}
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t(
                  "Connect a GitHub repo or ZIP archive to analyze C1–C3 architecture models and Docker deployment setup.",
                  "Kết nối repo GitHub hoặc tệp ZIP để phân tích mô hình kiến trúc C1–C3 và cấu hình triển khai Docker.",
                )}
              </p>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("This published Lab has no reference repository attached.", "Bài Lab đã công bố này không gắn kho mã nguồn tham chiếu.")}
            </p>
          )}
        </section>
      ) : (
        <>
          {/* Repository & Deployment Overview Card */}
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch className="size-4 text-teal-600" aria-hidden="true" />
                  <h2 className="font-semibold">
                    {reference?.projectName ||
                      t("Analyzed repository", "Kho mã nguồn đã phân tích")}
                  </h2>
                  <Badge variant={staticReady && studioReady ? "success" : staticReady ? "outline" : "warning"}>
                    {modelQuery.isPending
                      ? t("Checking…", "Đang kiểm tra…")
                      : staticReady && studioReady
                        ? t("C1–C3 + Studio Live Ready", "Sẵn sàng C1–C3 + Studio Live")
                        : staticReady
                          ? t("C1–C3 & Theory Ready", "Sẵn sàng C1–C3 & Lý thuyết")
                          : t("No services detected", "Chưa phát hiện thành phần")}
                  </Badge>
                  {save.isPending ? (
                    <Badge variant="outline">
                      {t("Saving to draft…", "Đang lưu vào bản nháp…")}
                    </Badge>
                  ) : hasUnsavedSelection ? (
                    <Badge variant="warning">
                      {t("Unsaved — click Save source", "Chưa lưu — bấm Lưu nguồn")}
                    </Badge>
                  ) : null}
                </div>
                {reference && (
                  <p className="break-all text-xs text-muted-foreground">
                    {reference.repositoryUrl || reference.sourceType}
                    {" · "}
                    {reference.branch ?? t("ZIP archive", "Tệp ZIP")}
                    {reference.commitSha ? ` · ${reference.commitSha.slice(0, 8)}` : ""}
                    {` · Rev ${reference.revision}`}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {reference?.modelId && (
                  <Button asChild type="button" size="sm" variant="outline">
                    <a
                      href={`/api/backend/assignments/${encodeURIComponent(assignment.id)}/reference-source`}
                      download
                    >
                      <Download className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("ZIP", "Tải ZIP")}
                    </a>
                  </Button>
                )}
                {!isPublished && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setImportModalOpen(true)}
                  >
                    <FolderGit2 className="mr-1.5 size-3.5" aria-hidden="true" />
                    {t("Change / Import repo", "Đổi / Nhập repo")}
                  </Button>
                )}
                {!isPublished && reference?.modelId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={clearSource}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                    {t("Clear", "Gỡ")}
                  </Button>
                )}
                {hasUnsavedSelection && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-teal-600 text-white hover:bg-teal-700"
                    disabled={!canSave}
                    onClick={() => saveSource(false)}
                  >
                    <Save className="mr-1.5 size-4" aria-hidden="true" />
                    {save.isPending
                      ? t("Saving…", "Đang lưu…")
                      : t("Save source to Lab", "Lưu nguồn vào Lab")}
                  </Button>
                )}
              </div>
            </div>

            {isPublished && (
              <p className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-muted-foreground">
                {t(
                  "This Lab is already published; its pinned reference source is locked for student consistency.",
                  "Lab này đã được công bố nên nguồn tham chiếu được khóa để giữ nhất quán cho sinh viên.",
                )}
              </p>
            )}
            {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
            {save.isSuccess && (
              <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {assignment.referenceSource
                  ? t("Reference source pinned to this Lab.", "Đã ghim nguồn tham chiếu vào Lab.")
                  : t("Reference source cleared.", "Đã gỡ nguồn tham chiếu.")}
              </p>
            )}

            {/* Static Architecture + Docker / Deployment Info Grid */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border bg-muted/15 p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {staticReady ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                    )}
                    {t("Static Architecture Analysis", "Phân tích Kiến trúc Tĩnh")}
                  </span>
                  <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-muted-foreground">
                  {modelQuery.isPending
                    ? t("Reading architecture model…", "Đang đọc mô hình kiến trúc…")
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
                {staticReady && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {serviceBreakdown.services} {t("services", "service")}
                    </Badge>
                    {serviceBreakdown.datastores > 0 && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {serviceBreakdown.datastores} {t("datastores", "CSDL")}
                      </Badge>
                    )}
                    {serviceBreakdown.brokers > 0 && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {serviceBreakdown.brokers} {t("brokers", "message broker")}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/15 p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {studioReady ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                    )}
                    {t("Docker & Deployment Setup", "Cấu hình Docker & Triển khai")}
                  </span>
                  <Container className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>

                {readiness.isPending ? (
                  <p className="text-muted-foreground">
                    {t("Inspecting Dockerfile, Docker Compose & runtime probes…", "Đang kiểm tra Dockerfile, Docker Compose & health probe…")}
                  </p>
                ) : readiness.isError ? (
                  <p className="text-destructive">
                    {readiness.error instanceof Error
                      ? readiness.error.message
                      : t("Could not check runtime readiness.", "Không kiểm tra được trạng thái runtime.")}
                  </p>
                ) : studioConfiguredReady ? (
                  <p className="text-muted-foreground">
                    {t(
                      `Docker Compose & runtime runner verified (${configuredApps.length} configured services).`,
                      `Đã xác thực Docker Compose & runner (${configuredApps.length} service đã cấu hình).`,
                    )}
                  </p>
                ) : studioComposeReady ? (
                  <p className="text-muted-foreground">
                    {t(
                      `Docker Compose preflight passed (${detectedServices.length} services detected) — ready to auto-configure in Step 5.`,
                      `Docker Compose đạt chuẩn (${detectedServices.length} service được phát hiện) — sẵn sàng cấu hình tự động ở Bước 5.`,
                    )}
                  </p>
                ) : (
                  <div className="space-y-1 text-amber-700 dark:text-amber-300">
                    {studioMissing.length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-4">
                        {studioMissing.slice(0, 4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {t(
                          "Missing Docker Compose / Dockerfile or health probe configuration for Studio Live.",
                          "Thiếu cấu hình Docker Compose / Dockerfile hoặc health probe cho Studio Live.",
                        )}
                      </p>
                    )}
                  </div>
                )}

                {(detectedServices.length > 0 || configuredApps.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {(configuredApps.length > 0 ? configuredApps : detectedServices).map((svc) => (
                      <Badge key={svc} variant="outline" className="font-mono text-[11px]">
                        {svc}
                      </Badge>
                    ))}
                  </div>
                )}

                {deploymentFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                    <FileCode2 className="size-3.5 shrink-0" aria-hidden="true" />
                    {deploymentFiles.slice(0, 6).map((file) => (
                      <code key={file} className="rounded bg-background px-1.5 py-0.5 font-mono">
                        {file}
                      </code>
                    ))}
                  </div>
                )}

                {runtimeMappings.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("Mappings:", "Ánh xạ:")} {runtimeMappings.slice(0, 4).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Clean Read-only Architecture Model (Pure Native SVG — NO Draw.io Editor) */}
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">
                {t("Architecture Model", "Mô hình Kiến trúc")}
              </h3>
              <div className="flex flex-wrap gap-1.5" role="tablist">
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
                    role="tab"
                    aria-selected={previewKind === tabItem.id}
                    variant={previewKind === tabItem.id ? "default" : "outline"}
                    onClick={() => {
                      setPreviewKind(tabItem.id);
                      setSelectedGraphId(null);
                    }}
                  >
                    {tabItem.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="min-h-72 overflow-hidden rounded-xl border bg-background p-3">
              {modelQuery.data && (previewKind === "GRAPH" || modelQuery.data.elements.length > 0) ? (
                <ArchitecturePresentation
                  key={`${modelQuery.data.id}:${previewKind}`}
                  model={modelQuery.data}
                  mode={previewKind === "GRAPH" ? "graph" : "diagram"}
                  guidedStatic
                  controlledKind={previewKind === "GRAPH" ? undefined : previewKind}
                  hideKindSelector
                  systemName={assignment.title}
                  selectedId={selectedGraphId}
                  onSelect={setSelectedGraphId}
                />
              ) : previewKind === "GRAPH" ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("Loading dependency graph…", "Đang tải đồ thị phụ thuộc…")}
                </p>
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
                    ? t("Loading architecture model…", "Đang tải mô hình kiến trúc…")
                    : t(
                        "Architecture diagram is not available for this level — switch to Dependency Graph to inspect elements.",
                        "Chưa có dữ liệu sơ đồ cho cấp độ này — chuyển sang Đồ thị phụ thuộc để kiểm tra.",
                      )}
                </p>
              )}
            </div>
          </section>
        </>
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

      {/* Import Repository Popup Modal */}
      {importModalOpen && !isPublished && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Import reference repository", "Nhập kho mã nguồn tham chiếu")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <FolderGit2 className="size-4 text-teal-600" aria-hidden="true" />
                <h2 className="text-base font-semibold">
                  {t("Import & analyze repository", "Nhập & phân tích kho mã nguồn")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Close", "Đóng")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">
                {hasUnsavedSelection
                  ? t("Analysis ready — click Save source to Lab to pin it.", "Đã phân tích xong — bấm Lưu nguồn vào Lab để ghim.")
                  : t("Import a GitHub repo, ZIP archive, or select an analyzed project.", "Nhập repo GitHub, tệp ZIP hoặc chọn dự án đã phân tích.")}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setImportModalOpen(false)}
                >
                  {t("Close", "Đóng")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-teal-600 text-white hover:bg-teal-700"
                  disabled={!canSave}
                  onClick={() => saveSource(true)}
                >
                  <Save className="mr-1.5 size-4" aria-hidden="true" />
                  {save.isPending
                    ? t("Saving…", "Đang lưu…")
                    : t("Save source to Lab", "Lưu nguồn vào Lab")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
