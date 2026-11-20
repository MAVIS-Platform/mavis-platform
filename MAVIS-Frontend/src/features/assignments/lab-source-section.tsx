"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Box,
  CheckCircle2,
  Container,
  Database,
  Download,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe,
  Layers,
  Network,
  Plus,
  Radio,
  Save,
  Server,
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

function formatStack(raw?: string): string {
  if (!raw || raw === "—") return "";
  const upper = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    JAVA_SPRING: "Spring Boot",
    JAVA: "Java",
    CSHARP_DOTNET: ".NET",
    DOTNET: ".NET",
    NODE_TS: "Node.js",
    NODE_JS: "Node.js",
    TYPESCRIPT: "TypeScript",
    JAVASCRIPT: "JavaScript",
    PYTHON: "Python",
    GO: "Go",
    GOLANG: "Go",
    SQL: "SQL",
    POSTGRES: "PostgreSQL",
    POSTGRESQL: "PostgreSQL",
    MYSQL: "MySQL",
    MONGODB: "MongoDB",
    REDIS: "Redis",
    KAFKA: "Kafka",
    KAFKA_TOPIC: "Kafka Topic",
    RABBITMQ: "RabbitMQ",
  };
  if (map[upper]) return map[upper];
  if (/kafka\s*topic/i.test(raw)) return "Kafka Topic";
  if (/^[A-Z0-9_]+$/.test(raw.trim())) {
    return raw
      .trim()
      .toLowerCase()
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return raw.trim();
}

function formatProtocol(raw: string): { label: string; rank: number; pillClass: string } {
  const upper = raw.trim().toUpperCase();
  switch (upper) {
    case "SERVICE_HTTP_CALL":
    case "USES_API":
      return {
        label: "HTTP",
        rank: 0,
        pillClass:
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "GATEWAY_ROUTE":
      return {
        label: "Gateway",
        rank: 0,
        pillClass:
          "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      };
    case "DATABASE_ACCESS":
    case "DATABASE_QUERY":
      return {
        label: "SQL",
        rank: 1,
        pillClass:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "MESSAGE_PUBLISH":
      return {
        label: "Publish",
        rank: 1,
        pillClass:
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "MESSAGE_SUBSCRIBE":
      return {
        label: "Subscribe",
        rank: 1,
        pillClass:
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "CONFIGURED_ENDPOINT":
    case "CONFIGURATION_DEPENDENCY":
    case "SERVICE_DISCOVERY":
      return {
        label: "Config",
        rank: 2,
        pillClass:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "DECLARED_COMPOSE":
    case "DECLARED_LINK":
      return {
        label: "Compose",
        rank: 3,
        pillClass:
          "border-border bg-muted/60 text-muted-foreground",
      };
    default:
      return {
        label: raw
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/^\w/, (c) => c.toUpperCase()),
        rank: 4,
        pillClass: "border-border bg-muted/60 text-muted-foreground",
      };
  }
}

function getNodeVisual(name: string, kind: string, technology: string) {
  const combined = `${name} ${technology}`;
  if (kind === "Database") {
    return {
      Icon: Database,
      iconClass: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
      accentClass: "border-l-emerald-500/70",
      dotClass: "bg-emerald-400",
      roleLabel: "Database",
    };
  }
  if (kind === "Broker" || /kafka|topic|queue|broker|rabbit|nats|pubsub/i.test(combined)) {
    return {
      Icon: Radio,
      iconClass: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
      accentClass: "border-l-violet-500/70",
      dotClass: "bg-violet-400",
      roleLabel: "Messaging",
    };
  }
  if (kind === "External") {
    return {
      Icon: Globe,
      iconClass: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
      accentClass: "border-l-amber-500/70",
      dotClass: "bg-amber-400",
      roleLabel: "External",
    };
  }
  if (kind === "Service" && /gateway|proxy|ingress|nginx|edge/i.test(name)) {
    return {
      Icon: Network,
      iconClass: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20 dark:text-cyan-400",
      accentClass: "border-l-cyan-500/70",
      dotClass: "bg-cyan-400",
      roleLabel: "Gateway",
    };
  }
  if (kind === "Service") {
    return {
      Icon: Server,
      iconClass: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
      accentClass: "border-l-sky-500/70",
      dotClass: "bg-sky-400",
      roleLabel: "Service",
    };
  }
  return {
    Icon: Box,
    iconClass: "bg-teal-500/10 text-teal-600 ring-teal-500/20 dark:text-teal-400",
    accentClass: "border-l-teal-500/70",
    dotClass: "bg-teal-400",
    roleLabel: kind,
  };
}

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
          outbound: Array<{ target: string; protocols: string[] }>;
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
        serviceCount: 0,
        dataMessagingCount: 0,
        primaryStacks: [] as string[],
        hasConnectionFiles: false,
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

    const outboundMap = new Map<string, Map<string, Set<string>>>();
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
      if (!outboundMap.has(fromTop.id)) outboundMap.set(fromTop.id, new Map());
      const targets = outboundMap.get(fromTop.id)!;
      if (!targets.has(toTop.name)) targets.set(toTop.name, new Set());
      targets.get(toTop.name)!.add(proto);

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

    const seenServiceKey = new Set<string>();
    const services = topElements
      .map((el) => {
        const files = Array.from(
          new Set(
            (el.evidence ?? [])
              .map((ev) => ev.location?.split(":")[0]?.trim())
              .filter((p): p is string => Boolean(p)),
          ),
        );
        const outboundTargets = Array.from(
          (outboundMap.get(el.id) ?? new Map<string, Set<string>>()).entries(),
        )
          .map(([target, protoSet]) => ({
            target,
            protocols: Array.from(protoSet).sort(
              (a, b) => formatProtocol(a).rank - formatProtocol(b).rank,
            ),
          }))
          .sort((a, b) => a.target.localeCompare(b.target));
        return {
          id: el.id,
          name: el.name,
          kind: kindLabel(el),
          technology: el.technology || el.layer || "",
          componentCount: childCount.get(el.id) ?? 0,
          outbound: outboundTargets,
          files: files.slice(0, 2),
        };
      })
      .filter((svc) => {
        const key = `${svc.name.trim().toLowerCase()}::${svc.kind}`;
        if (seenServiceKey.has(key)) return false;
        seenServiceKey.add(key);
        return true;
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
        protocols: Array.from(v.protocols).sort(
          (a, b) => formatProtocol(a).rank - formatProtocol(b).rank,
        ),
        count: v.count,
        file: v.file,
      }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

    const serviceCount = services.filter((s) => s.kind === "Service").length;
    const dataMessagingCount = services.length - serviceCount;
    const primaryStacks = Array.from(
      new Set(
        services
          .filter((s) => s.kind === "Service")
          .map((s) => formatStack(s.technology))
          .filter(Boolean),
      ),
    );

    return {
      services,
      connections,
      configFiles: Array.from(configFilesSet).sort(),
      serviceCount,
      dataMessagingCount,
      primaryStacks,
      hasConnectionFiles: connections.some((c) => Boolean(c.file)),
    };
  }, [modelQuery.data]);

  const composeServiceNames = configuredApps.length > 0 ? configuredApps : detectedServices;
  const staticNameSet = useMemo(
    () => new Set(repoDissection.services.map((s) => s.name.toLowerCase())),
    [repoDissection.services],
  );
  const serviceVisualByName = useMemo(
    () =>
      new Map(
        repoDissection.services.map((s) => [
          s.name,
          getNodeVisual(s.name, s.kind, s.technology),
        ]),
      ),
    [repoDissection.services],
  );
  const composeAppServices = useMemo(
    () => composeServiceNames.filter((name) => staticNameSet.has(name.toLowerCase())),
    [composeServiceNames, staticNameSet],
  );
  const composeInfraServices = useMemo(
    () => composeServiceNames.filter((name) => !staticNameSet.has(name.toLowerCase())),
    [composeServiceNames, staticNameSet],
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
          {/* Reference Architecture Overview Card */}
          <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            {/* Header Bar */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-400">
                  <GitBranch className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                      {t("Reference Architecture", "Kiến trúc tham chiếu")}
                    </h2>
                    {save.isPending ? (
                      <Badge variant="outline">
                        {t("Saving…", "Đang lưu…")}
                      </Badge>
                    ) : hasUnsavedSelection ? (
                      <Badge variant="warning">
                        {t("Unsaved", "Chưa lưu")}
                      </Badge>
                    ) : reference?.modelId ? (
                      <span
                        role={save.isSuccess ? "status" : undefined}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {t("Pinned", "Đã ghim")}
                      </span>
                    ) : null}
                  </div>
                  {reference && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="break-all font-mono text-[11.5px] text-foreground/80">
                        {reference.repositoryUrl || reference.sourceType}
                      </span>
                      <span className="text-border">·</span>
                      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">
                        {reference.branch ?? t("ZIP archive", "Tệp ZIP")}
                      </span>
                      {reference.commitSha && (
                        <>
                          <span className="text-border">·</span>
                          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {reference.commitSha.slice(0, 8)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {reference?.modelId && (
                  <Button asChild type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs">
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
                    className="h-8 px-2.5 text-xs"
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
                    variant="ghost"
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                    className="h-8 bg-teal-600 px-3 text-xs text-white hover:bg-teal-700"
                    disabled={!canSave}
                    onClick={() => saveSource(false)}
                  >
                    <Save className="mr-1.5 size-3.5" aria-hidden="true" />
                    {save.isPending
                      ? t("Saving…", "Đang lưu…")
                      : t("Save source to Lab", "Lưu nguồn vào Lab")}
                  </Button>
                )}
              </div>
            </div>

            {/* Integrated 4-Cell Architecture Summary Strip */}
            <div className="grid grid-cols-2 divide-y divide-border/60 border-b border-border/70 bg-muted/20 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <button
                type="button"
                onClick={() => setRepoDetailTab("services")}
                className="flex flex-col gap-0.5 px-5 py-3 text-left transition hover:bg-muted/35"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Server className="size-3.5 text-sky-500" aria-hidden="true" />
                  {t("Services", "Services")}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {repoDissection.serviceCount}
                  </span>
                  {repoDissection.primaryStacks.length > 0 && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {repoDissection.primaryStacks.slice(0, 2).join(" · ")}
                    </span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRepoDetailTab("services")}
                className="flex flex-col gap-0.5 px-5 py-3 text-left transition hover:bg-muted/35"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Database className="size-3.5 text-emerald-500" aria-hidden="true" />
                  {t("Data & Messaging", "Dữ liệu & Kênh tin")}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {repoDissection.dataMessagingCount}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {t("stores & topics", "CSDL & topic")}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRepoDetailTab("connections")}
                className="flex flex-col gap-0.5 px-5 py-3 text-left transition hover:bg-muted/35"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <ArrowLeftRight className="size-3.5 text-violet-500" aria-hidden="true" />
                  {t("Connections", "Kết nối")}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {repoDissection.connections.length}
                  </span>
                  {modelQuery.data && (
                    <span className="truncate text-[11px] tabular-nums text-muted-foreground">
                      {modelQuery.data.edges.length} {t("edges", "liên kết")}
                    </span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRepoDetailTab("deploy")}
                className="flex flex-col gap-0.5 px-5 py-3 text-left transition hover:bg-muted/35"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Container className="size-3.5 text-teal-500" aria-hidden="true" />
                  {t("Docker Deploy", "Docker Deploy")}
                </span>
                <div className="flex items-center gap-2">
                  {readiness.isPending ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : studioConfiguredReady || studioComposeReady ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      {t("Pass", "Đạt")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {t("Check", "Kiểm tra")}
                    </span>
                  )}
                  {composeServiceNames.length > 0 && (
                    <span className="truncate text-[11px] tabular-nums text-muted-foreground">
                      {composeServiceNames.length} {t("containers", "container")}
                    </span>
                  )}
                </div>
              </button>
            </div>

            {isPublished && (
              <p className="border-b border-primary/20 bg-primary/5 px-5 py-2 text-xs text-muted-foreground">
                {t(
                  "This Lab is already published; its pinned reference source is locked for student consistency.",
                  "Lab này đã được công bố nên nguồn tham chiếu được khóa để giữ nhất quán cho sinh viên.",
                )}
              </p>
            )}
            {save.error && (
              <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-2 text-xs text-destructive">
                {save.error.message}
              </p>
            )}

            {/* Flush Underline Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5">
              <div
                className="flex items-center gap-5"
                role="tablist"
                aria-label={t("Repository details", "Chi tiết kho mã nguồn")}
              >
                {(
                  [
                    {
                      id: "services" as const,
                      label: t("Services & Nodes", "Services & Thành phần"),
                      count: repoDissection.services.length,
                    },
                    {
                      id: "connections" as const,
                      label: t("Connections", "Kết nối"),
                      count: repoDissection.connections.length,
                    },
                    {
                      id: "deploy" as const,
                      label: t("Docker & Deploy", "Docker & Triển khai"),
                      count: composeServiceNames.length,
                    },
                  ] as const
                ).map((item) => {
                  const active = repoDetailTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRepoDetailTab(item.id)}
                      className={`relative flex items-center gap-1.5 border-b-2 py-2.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10.5px] tabular-nums ${
                          active
                            ? "bg-primary/15 text-primary"
                            : "bg-muted/70 text-muted-foreground"
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {modelQuery.data && (
                <span className="py-2 text-[11px] tabular-nums text-muted-foreground">
                  {modelQuery.data.elements.length} {t("elements", "thành phần")} ·{" "}
                  {modelQuery.data.edges.length} {t("edges", "liên kết")}
                </span>
              )}
            </div>

            {/* Tab Panel Content */}
            <div className="p-5">
              {repoDetailTab === "services" && (
                modelQuery.isPending ? (
                  <p className="py-4 text-xs text-muted-foreground">
                    {t("Inspecting repository services and components…", "Đang phân tích các service và thành phần trong repo…")}
                  </p>
                ) : repoDissection.services.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                    {t("No top-level services or nodes detected in this snapshot.", "Chưa phát hiện service hay thành phần cấp cao trong bản snapshot này.")}
                  </p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {repoDissection.services.map((svc) => {
                      const visual = getNodeVisual(svc.name, svc.kind, svc.technology);
                      const stackLabel = formatStack(svc.technology);
                      const Icon = visual.Icon;
                      return (
                        <div
                          key={svc.id}
                          className={`flex flex-col justify-between gap-3 rounded-xl border border-border/75 border-l-2 ${visual.accentClass} bg-background/50 p-3.5 transition hover:border-border`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ${visual.iconClass}`}
                              >
                                <Icon className="size-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs font-semibold text-foreground">
                                  {svc.name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span>{visual.roleLabel}</span>
                                  {stackLabel && stackLabel.toLowerCase() !== visual.roleLabel.toLowerCase() && (
                                    <>
                                      <span className="text-border">·</span>
                                      <span className="font-medium text-foreground/80">
                                        {stackLabel}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {svc.componentCount > 0 && (
                              <span className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {svc.componentCount} {t("components", "thành phần")}
                              </span>
                            )}
                          </div>

                          {svc.outbound.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
                              {svc.outbound.slice(0, 5).map((dep) => {
                                const primaryProto = formatProtocol(dep.protocols[0] ?? "CALL");
                                const extraCount = dep.protocols.length - 1;
                                return (
                                  <span
                                    key={dep.target}
                                    title={`${dep.target}: ${dep.protocols.join(", ")}`}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/80 px-2 py-1 text-[11px]"
                                  >
                                    <ArrowRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                                    <span className="font-mono font-medium text-foreground/90">
                                      {dep.target}
                                    </span>
                                    <span
                                      className={`rounded border px-1.5 py-0 text-[10px] font-medium ${primaryProto.pillClass}`}
                                    >
                                      {primaryProto.label}
                                      {extraCount > 0 ? ` +${extraCount}` : ""}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {svc.files.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                              <FileCode2 className="size-3 shrink-0" aria-hidden="true" />
                              {svc.files.map((file) => (
                                <code key={file} className="truncate font-mono text-[10.5px]">
                                  {file}
                                </code>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {repoDetailTab === "connections" && (
                repoDissection.connections.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                    {t("No inter-service connections detected.", "Chưa phát hiện kết nối giữa các service.")}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/75">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border/70 bg-muted/35 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">{t("Flow", "Luồng kết nối")}</th>
                          <th className="px-4 py-2.5 font-medium">{t("Channels", "Giao thức")}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t("Refs", "Lượt")}</th>
                          {repoDissection.hasConnectionFiles && (
                            <th className="px-4 py-2.5 font-medium">{t("Source", "Tệp nguồn")}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {repoDissection.connections.map((conn) => {
                          const fromDot = serviceVisualByName.get(conn.from)?.dotClass ?? "bg-sky-400";
                          const toDot = serviceVisualByName.get(conn.to)?.dotClass ?? "bg-emerald-400";
                          return (
                            <tr key={conn.key} className="align-middle transition hover:bg-muted/20">
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                    <span className={`size-1.5 rounded-full ${fromDot}`} />
                                    {conn.from}
                                  </span>
                                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                                  <span className="inline-flex items-center gap-1.5 text-foreground/90">
                                    <span className={`size-1.5 rounded-full ${toDot}`} />
                                    {conn.to}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {conn.protocols.map((p) => {
                                    const fmt = formatProtocol(p);
                                    return (
                                      <span
                                        key={p}
                                        title={p}
                                        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${fmt.pillClass}`}
                                      >
                                        {fmt.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
                                  {conn.count}
                                </span>
                              </td>
                              {repoDissection.hasConnectionFiles && (
                                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                                  {conn.file || "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {repoDetailTab === "deploy" && (
                <div className="space-y-4 text-xs">
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
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/75 bg-muted/20 px-4 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          {studioConfiguredReady || studioComposeReady ? (
                            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                          )}
                          {studioConfiguredReady || studioComposeReady
                            ? t("Docker check passed", "Kiểm tra Docker thành công")
                            : t("Docker check incomplete", "Kiểm tra Docker chưa đạt")}
                        </span>
                        <Badge variant={studioConfiguredReady || studioComposeReady ? "success" : "secondary"}>
                          {studioConfiguredReady || studioComposeReady ? t("Pass", "Đạt") : t("Check", "Cần kiểm tra")}
                        </Badge>
                      </div>

                      {!studioReady && studioMissing.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-700 dark:text-amber-300">
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

                      {composeAppServices.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            {t("Application Containers", "Container Ứng dụng")} ({composeAppServices.length})
                          </p>
                          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                            {composeAppServices.map((svc) => {
                              const mappingEntry = runtimeMappings.find((m) =>
                                m.toLowerCase().includes(svc.toLowerCase()),
                              );
                              return (
                                <div
                                  key={svc}
                                  className="flex flex-col gap-1.5 rounded-xl border border-border/75 bg-background/50 px-3.5 py-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2 font-mono font-medium text-foreground">
                                      <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                                      <span className="truncate">{svc}</span>
                                    </span>
                                    <span className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                      {t("Matched", "Khớp")}
                                    </span>
                                  </div>
                                  {mappingEntry && (
                                    <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                                      {mappingEntry}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {composeInfraServices.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            {t("Infrastructure & Sandbox", "Hạ tầng & Sandbox")} ({composeInfraServices.length})
                          </p>
                          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                            {composeInfraServices.map((svc) => {
                              const isDb = /postgres|mysql|mongo|redis|db/i.test(svc);
                              const isBroker = /kafka|rabbit|nats|broker|zookeeper/i.test(svc);
                              const InfraIcon = isDb ? Database : isBroker ? Radio : Container;
                              const mappingEntry = runtimeMappings.find((m) =>
                                m.toLowerCase().includes(svc.toLowerCase()),
                              );
                              return (
                                <div
                                  key={svc}
                                  className="flex flex-col gap-1.5 rounded-xl border border-border/75 bg-muted/15 px-3.5 py-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2 font-mono font-medium text-foreground/90">
                                      <InfraIcon
                                        className={`size-3.5 shrink-0 ${
                                          isDb
                                            ? "text-emerald-500"
                                            : isBroker
                                              ? "text-violet-500"
                                              : "text-muted-foreground"
                                        }`}
                                        aria-hidden="true"
                                      />
                                      <span className="truncate">{svc}</span>
                                    </span>
                                    <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      {t("Infra", "Hạ tầng")}
                                    </span>
                                  </div>
                                  {mappingEntry && (
                                    <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                                      {mappingEntry}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {repoDissection.configFiles.length > 0 && (
                        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3.5">
                          <p className="flex items-center gap-1.5 font-medium text-foreground">
                            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            {t("Build & Deployment Files Detected", "Tệp build & triển khai phát hiện được")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {repoDissection.configFiles.slice(0, 12).map((file) => (
                              <code
                                key={file}
                                className="rounded-md border border-border/70 bg-background px-2 py-0.5 font-mono text-[11px] text-foreground/85"
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

          {/* Unified Architecture Blueprint Frame */}
          <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                  <Layers className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {t("Architecture Model", "Mô hình Kiến trúc")}
                  </h3>
                </div>
              </div>

              <div
                className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border/75 bg-muted/40 p-0.5"
                role="tablist"
                aria-label={t("Architecture diagram level", "Cấp độ sơ đồ kiến trúc")}
              >
                {(
                  [
                    { id: "CONTEXT", label: "C1 Context" },
                    { id: "CONTAINER", label: "C2 Container" },
                    { id: "COMPONENT", label: "C3 Component" },
                    { id: "GRAPH", label: t("Dependency Graph", "Đồ thị phụ thuộc") },
                  ] as const
                ).map((tabItem) => {
                  const active = previewKind === tabItem.id;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setPreviewKind(tabItem.id);
                        setSelectedGraphId(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      }`}
                    >
                      {tabItem.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={previewKind === "GRAPH" ? "min-h-72 p-4" : "min-h-72"}>
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
                <p className="p-6 text-sm text-muted-foreground">
                  {t("Loading dependency graph…", "Đang tải đồ thị phụ thuộc…")}
                </p>
              ) : activeMermaid ? (
                <div className="p-4">
                  <DiagramPreview
                    title={`C4 ${previewKind}`}
                    content={activeMermaid}
                    format="MERMAID"
                    style="clean"
                  />
                </div>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
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
