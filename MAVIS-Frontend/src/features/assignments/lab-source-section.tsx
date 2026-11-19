"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileCode2,
  FolderGit2,
  GitBranch,
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
type RepoDetailTab = "services" | "connections" | "deploy";

const CONFIG_FILE_PATTERN =
  /(docker-compose[^/\\]*\.ya?ml|compose[^/\\]*\.ya?ml|dockerfile[^/\\]*|nginx[^/\\]*\.conf|k8s[^/\\]*\.ya?ml|pom\.xml|build\.gradle[^/\\]*|package\.json|[^/\\]+\.csproj|application[^/\\]*\.(ya?ml|properties))/i;

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
  const [repoDetailTab, setRepoDetailTab] = useState<RepoDetailTab>("services");
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

  const repoDissection = useMemo(() => {
    const model = modelQuery.data;
    if (!model) {
      return {
        services: [] as Array<{
          id: string;
          name: string;
          kind: string;
          technology: string;
          componentCount: number;
          outbound: string[];
          files: string[];
        }>,
        connections: [] as Array<{
          key: string;
          from: string;
          to: string;
          protocols: string[];
          count: number;
          file: string;
        }>,
        configFiles: [] as string[],
      };
    }

    const byId = new Map(model.elements.map((el) => [el.id, el]));
    const resolveTopNode = (id: string) => {
      let cur = byId.get(id);
      const seen = new Set<string>();
      while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parentId);
      }
      return cur;
    };

    const topTypes = new Set([
      "SERVICE_CONTAINER",
      "DATABASE",
      "DATA_STORE",
      "MESSAGE_BROKER",
      "QUEUE",
      "EXTERNAL_SYSTEM",
    ]);
    const topElements = model.elements.filter(
      (el) => topTypes.has(el.elementType ?? "") || !el.parentId,
    );
    const kindLabel = (el: (typeof model.elements)[number]) => {
      switch (el.elementType) {
        case "SERVICE_CONTAINER":
          return "Service";
        case "DATABASE":
        case "DATA_STORE":
          return "Database";
        case "MESSAGE_BROKER":
        case "QUEUE":
          return "Broker";
        case "EXTERNAL_SYSTEM":
          return "External";
        default:
          return el.layer === "data" ? "Database" : "Component";
      }
    };

    const childCount = new Map<string, number>();
    for (const el of model.elements) {
      if (el.parentId) {
        childCount.set(el.parentId, (childCount.get(el.parentId) ?? 0) + 1);
      }
    }

    const outboundMap = new Map<string, Set<string>>();
    const connMap = new Map<
      string,
      { from: string; to: string; protocols: Set<string>; count: number; file: string }
    >();
    const configFilesSet = new Set<string>();
    const collectConfigFile = (loc?: string) => {
      if (!loc) return;
      const clean = loc.split(":")[0]?.trim();
      if (clean && CONFIG_FILE_PATTERN.test(clean)) configFilesSet.add(clean);
    };

    for (const el of model.elements) {
      for (const ev of el.evidence ?? []) collectConfigFile(ev.location);
    }

    for (const edge of model.edges) {
      for (const ev of edge.evidence ?? []) collectConfigFile(ev.location);
      const fromTop = resolveTopNode(edge.from);
      const toTop = resolveTopNode(edge.to);
      if (!fromTop || !toTop || fromTop.id === toTop.id) continue;
      const proto = edge.protocol || "CALL";
      if (!outboundMap.has(fromTop.id)) outboundMap.set(fromTop.id, new Set());
      outboundMap.get(fromTop.id)!.add(`${toTop.name} (${proto})`);

      const key = `${fromTop.id}::${toTop.id}`;
      const existing = connMap.get(key);
      const sampleFile = edge.evidence?.[0]?.location?.split(":")[0]?.trim() ?? "";
      if (existing) {
        existing.protocols.add(proto);
        existing.count += 1;
        if (!existing.file && sampleFile) existing.file = sampleFile;
      } else {
        connMap.set(key, {
          from: fromTop.name,
          to: toTop.name,
          protocols: new Set([proto]),
          count: 1,
          file: sampleFile,
        });
      }
    }

    const services = topElements
      .map((el) => {
        const files = Array.from(
          new Set(
            (el.evidence ?? [])
              .map((ev) => ev.location?.split(":")[0]?.trim())
              .filter((p): p is string => Boolean(p)),
          ),
        );
        return {
          id: el.id,
          name: el.name,
          kind: kindLabel(el),
          technology: el.technology || el.layer || "—",
          componentCount: childCount.get(el.id) ?? 0,
          outbound: Array.from(outboundMap.get(el.id) ?? []).slice(0, 4),
          files: files.slice(0, 2),
        };
      })
      .sort((a, b) => {
        const rank = (k: string) =>
          k === "Service" ? 0 : k === "Database" ? 1 : k === "Broker" ? 2 : 3;
        return rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name);
      });

    const connections = Array.from(connMap.entries())
      .map(([key, v]) => ({
        key,
        from: v.from,
        to: v.to,
        protocols: Array.from(v.protocols),
        count: v.count,
        file: v.file,
      }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

    return {
      services,
      connections,
      configFiles: Array.from(configFilesSet).sort(),
    };
  }, [modelQuery.data]);

  const composeServiceNames = configuredApps.length > 0 ? configuredApps : detectedServices;
  const staticNameSet = useMemo(
    () => new Set(repoDissection.services.map((s) => s.name.toLowerCase())),
    [repoDissection.services],
  );

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
                  <GitBranch className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="font-semibold">
                    {t("Lab Studio Setup", "Cấu hình Lab Studio")}
                  </h2>
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

            {/* Repository Dissection Tabs */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 p-1"
                  role="tablist"
                  aria-label={t("Repository details", "Chi tiết kho mã nguồn")}
                >
                  {(
                    [
                      {
                        id: "services" as const,
                        label: `${t("Services & Nodes", "Services & Thành phần")} (${repoDissection.services.length})`,
                      },
                      {
                        id: "connections" as const,
                        label: `${t("Connections", "Kết nối")} (${repoDissection.connections.length})`,
                      },
                      {
                        id: "deploy" as const,
                        label: `${t("Docker & Deploy", "Docker & Triển khai")} (${composeServiceNames.length})`,
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={repoDetailTab === item.id}
                      onClick={() => setRepoDetailTab(item.id)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        repoDetailTab === item.id
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {modelQuery.data && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {modelQuery.data.elements.length} {t("elements", "thành phần")} ·{" "}
                    {modelQuery.data.edges.length} {t("edges", "liên kết")}
                  </span>
                )}
              </div>

              {repoDetailTab === "services" && (
                modelQuery.isPending ? (
                  <p className="py-4 text-xs text-muted-foreground">
                    {t("Inspecting repository services and components…", "Đang phân tích các service và thành phần trong repo…")}
                  </p>
                ) : repoDissection.services.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                    {t("No top-level services or nodes detected in this snapshot.", "Chưa phát hiện service hay thành phần cấp cao trong bản snapshot này.")}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3.5 py-2 font-medium">{t("Service / Node", "Service / Node")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Type & Stack", "Loại & Công nghệ")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Components", "Thành phần con")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Outbound Dependencies", "Phụ thuộc gọi ra")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Source Evidence", "Tệp nguồn")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {repoDissection.services.map((svc) => (
                          <tr key={svc.id} className="align-top hover:bg-muted/20">
                            <td className="px-3.5 py-2.5 font-mono font-semibold text-foreground">
                              {svc.name}
                            </td>
                            <td className="px-3.5 py-2.5 text-muted-foreground">
                              <span className="font-medium text-foreground/85">{svc.kind}</span>
                              {svc.technology && svc.technology !== "—" ? ` · ${svc.technology}` : ""}
                            </td>
                            <td className="px-3.5 py-2.5 tabular-nums text-muted-foreground">
                              {svc.componentCount > 0 ? svc.componentCount : "—"}
                            </td>
                            <td className="px-3.5 py-2.5 text-muted-foreground">
                              {svc.outbound.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {svc.outbound.map((dep) => (
                                    <span
                                      key={dep}
                                      className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85"
                                    >
                                      {dep}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">
                              {svc.files.length > 0 ? svc.files.join(", ") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {repoDetailTab === "connections" && (
                repoDissection.connections.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                    {t("No inter-service connections detected.", "Chưa phát hiện kết nối giữa các service.")}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3.5 py-2 font-medium">{t("Caller", "Nguồn gọi")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Target", "Đích")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Protocol", "Giao thức")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Refs", "Số lượt")}</th>
                          <th className="px-3.5 py-2 font-medium">{t("Evidence File", "Tệp bằng chứng")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {repoDissection.connections.map((conn) => (
                          <tr key={conn.key} className="align-middle hover:bg-muted/20">
                            <td className="px-3.5 py-2 font-mono font-medium text-foreground">{conn.from}</td>
                            <td className="px-3.5 py-2 font-mono text-foreground">{conn.to}</td>
                            <td className="px-3.5 py-2">
                              <div className="flex flex-wrap gap-1">
                                {conn.protocols.map((p) => (
                                  <span
                                    key={p}
                                    className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3.5 py-2 tabular-nums text-muted-foreground">{conn.count}</td>
                            <td className="px-3.5 py-2 font-mono text-[11px] text-muted-foreground">
                              {conn.file || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {repoDetailTab === "deploy" && (
                <div className="space-y-3 text-xs">
                  {readiness.isPending ? (
                    <p className="py-3 text-muted-foreground">
                      {t("Inspecting Docker Compose, Dockerfiles & runtime probes…", "Đang kiểm tra Docker Compose, Dockerfile & health probe…")}
                    </p>
                  ) : readiness.isError ? (
                    <p className="text-destructive">
                      {readiness.error instanceof Error
                        ? readiness.error.message
                        : t("Could not inspect deployment readiness.", "Không kiểm tra được cấu hình triển khai.")}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/15 px-3.5 py-2.5">
                        <span className="font-medium text-foreground">
                          {studioConfiguredReady
                            ? t("Docker Compose & Studio runner configured and verified.", "Docker Compose & Studio runner đã cấu hình và xác thực.")
                            : studioComposeReady
                              ? t("Docker Compose preflight passed — ready to boot in Step 5 (Studio Live).", "Docker Compose đạt kiểm tra preflight — sẵn sàng chạy ở Bước 5 (Studio Live).")
                              : t("Docker Compose / Studio Live setup incomplete.", "Cấu hình Docker Compose / Studio Live chưa đầy đủ.")}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {readiness.data?.preflightCompatible ? "preflight: pass" : "preflight: check"}
                          {" · "}
                          {readiness.data?.runnerReady ? "runner: ready" : "runner: pending"}
                        </span>
                      </div>

                      {!studioReady && studioMissing.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
                          <p className="mb-1 flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            {t("Preflight findings", "Chi tiết cần bổ sung")}
                          </p>
                          <ul className="list-disc space-y-0.5 pl-4">
                            {studioMissing.slice(0, 5).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {composeServiceNames.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="px-3.5 py-2 font-medium">{t("Compose Service", "Service trong Compose")}</th>
                                <th className="px-3.5 py-2 font-medium">{t("Architecture Match", "Khớp mô hình tĩnh")}</th>
                                <th className="px-3.5 py-2 font-medium">{t("Runtime Mapping", "Ánh xạ Runtime")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {composeServiceNames.map((svc) => {
                                const mapped = staticNameSet.has(svc.toLowerCase());
                                const mappingEntry = runtimeMappings.find((m) =>
                                  m.toLowerCase().includes(svc.toLowerCase()),
                                );
                                return (
                                  <tr key={svc} className="hover:bg-muted/20">
                                    <td className="px-3.5 py-2 font-mono font-medium text-foreground">{svc}</td>
                                    <td className="px-3.5 py-2 text-muted-foreground">
                                      {mapped
                                        ? t("Matched static service", "Khớp service tĩnh")
                                        : t("Infrastructure / sandbox container", "Hạ tầng / container hỗ trợ")}
                                    </td>
                                    <td className="px-3.5 py-2 font-mono text-[11px] text-muted-foreground">
                                      {mappingEntry || "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {repoDissection.configFiles.length > 0 && (
                        <div className="space-y-1.5 rounded-xl border bg-muted/15 p-3">
                          <p className="flex items-center gap-1.5 font-medium text-foreground">
                            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            {t("Build & Deployment Files Detected", "Tệp build & triển khai phát hiện được")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {repoDissection.configFiles.slice(0, 12).map((file) => (
                              <code
                                key={file}
                                className="rounded border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground/85"
                              >
                                {file}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
            variant="default"
            onClick={() => onNavigate("theory")}
          >
            {t("Next", "Tiếp theo")}
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
