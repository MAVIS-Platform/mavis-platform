"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { SelectField } from "@/components/shared/forms";
import { DrawioEditor } from "./drawio-editor";
import { ArchitectureSvgViewer } from "./architecture-svg-viewer";
import { ScenarioDiagram } from "./scenario-diagram";
import { UmlDiagramWorkspace } from "./uml-diagram-workspace";
import { SearchableThreeESelect } from "./three-e-searchable-select";
import type { UmlDiagramKind } from "./uml-diagrams";
import { diagramKinds, guidedDiagramOptions, resolveDiagramKind, resolveGuidedDiagramKind, selectDiagram, type DiagramKind } from "./diagram-catalog";
import {
  applyC4AiEnrichmentToDocument,
  buildC4CompactContext,
  type C4AiDiagramEnrichment,
} from "./diagram-projections";
import { generateDrawio } from "@/lib/drawio/generate";
import type { DrawioTheme } from "@/lib/drawio/rules";
import { useLocale } from "@/lib/i18n/locale-context";
import { layoutLocally } from "./drawio-local-layout";
import type { SequenceSelectionContext } from "./three-e-content";

const POPULAR_KINDS = new Set<DiagramKind>(["CONTAINER", "UML_SEQUENCE", "UML_CLASS"]);
const diagramOptions = [...diagramKinds.C4, ...diagramKinds.UML];
const clientC4EnrichmentCache = new Map<string, C4AiDiagramEnrichment>();

function formatC4NodeBadge(kind?: string): string {
  switch (kind) {
    case "SERVICE_CONTAINER":
    case "PROCESS_UNIT":
      return "[Container]";
    case "DATABASE":
      return "[Database]";
    case "MESSAGE_CHANNEL":
    case "QUEUE_BROKER":
      return "[Channel]";
    case "COMPONENT":
    case "LOGICAL_COMPONENT":
      return "[Component]";
    case "CLASS_INTERFACE":
      return "[Class/Interface]";
    case "EXTERNAL_SYSTEM":
      return "[External]";
    default:
      return "[Element]";
  }
}

export function ArchitectureDiagrams({
  model: sourceModel,
  selectedId,
  onSelect,
  onSelectSequence,
  systemName,
  guidedStatic = false,
  controlledKind,
  hideKindSelector = false,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectSequence?:
    ((id: string | null, seqCtx: SequenceSelectionContext | null) => void) | undefined;
  systemName?: string | undefined;
  guidedStatic?: boolean;
  controlledKind?: DiagramKind | undefined;
  hideKindSelector?: boolean;
}) {
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const requestedKindParam = searchParams.get("kind");
  const resolveKind = guidedStatic ? resolveGuidedDiagramKind : resolveDiagramKind;
  const initialKind = controlledKind ?? resolveKind(requestedKindParam);
  const [kind, setKind] = useState<DiagramKind>(initialKind),
    [service, setService] = useState(guidedStatic ? "ALL" : ""),
    [theme, setTheme] = useState<DrawioTheme>("clean"),
    [c4AiEnrichment, setC4AiEnrichment] = useState<C4AiDiagramEnrichment | null>(null),
    [generatedState, setGeneratedState] = useState<{ targetKey: string; xml: string }>({
      targetKey: "",
      xml: "",
    }),
    [error, setError] = useState("");
  const api = useApi(),
    cache = useQueryClient();
  const model = sourceModel;
  const canonicalOrder = [
    "api-gateway",
    "identity-service",
    "catalog-service",
    "order-service",
    "notification-service",
    "service-discovery",
  ];
  const allContainers = model.elements
    .filter((node) => node.elementType === "SERVICE_CONTAINER")
    .map((node) => ({
      ...node,
      count: model.elements.filter((child) => child.parentId === node.id).length,
    }))
    .sort((a, b) => {
      if (guidedStatic) {
        const ia = canonicalOrder.indexOf(a.name);
        const ib = canonicalOrder.indexOf(b.name);
        if (ia !== -1 || ib !== -1) {
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }
      }
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  const populatedContainers = allContainers.filter((node) => node.count > 0);
  const containers = populatedContainers.length > 0 ? populatedContainers : allContainers;
  const container =
    guidedStatic && service === "ALL"
      ? undefined
      : (containers.find((node) => node.id === service) ?? containers[0]);
  const selectedC3TargetId =
    guidedStatic && kind === "COMPONENT" && (service === "ALL" || !service)
      ? "ALL"
      : (container?.id ?? containers[0]?.id);
  const isUmlWorkspaceKind = [
    "UML_CLASS",
    "UML_PACKAGE",
    "UML_DEPLOYMENT",
    "UML_ACTIVITY",
    "UML_STATE",
  ].includes(kind);
  useEffect(() => {
    setKind(controlledKind ?? resolveKind(requestedKindParam));
  }, [controlledKind, requestedKindParam, resolveKind]);

  const isC4EnrichableKind =
    kind === "CONTAINER" || kind === "COMPONENT";

  useEffect(() => {
    if (!isC4EnrichableKind) {
      setC4AiEnrichment(null);
      return;
    }
    const c4Ctx = buildC4CompactContext(
      model,
      kind as "CONTAINER" | "COMPONENT",
      container?.id,
      systemName,
    );
    const cacheKey = `${c4Ctx.contextHash}:${locale}`;
    const cached = clientC4EnrichmentCache.get(cacheKey);
    if (cached) {
      setC4AiEnrichment(cached);
      return;
    }
    setC4AiEnrichment(null);
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/ai-diagram-semantics", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ c4Context: c4Ctx, locale }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { c4Enrichment?: C4AiDiagramEnrichment } | null) => {
        if (cancelled || !data?.c4Enrichment) return;
        clientC4EnrichmentCache.set(cacheKey, data.c4Enrichment);
        setC4AiEnrichment(data.c4Enrichment);
      })
      .catch(() => {
        // Keep base C4 projection on offline/error
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isC4EnrichableKind, kind, model, container?.id, systemName, locale]);

  const selection = useMemo(
    () => selectDiagram(model, kind, selectedC3TargetId, { systemName }),
    [model, kind, selectedC3TargetId, systemName],
  );
  const document = useMemo(
    () =>
      selection.document && (kind === "CONTAINER" || kind === "COMPONENT")
        ? applyC4AiEnrichmentToDocument(selection.document, c4AiEnrichment)
        : selection.document,
    [selection.document, kind, c4AiEnrichment],
  );
  const c4DocNodes = useMemo(() => {
    if (!document) return [];
    const validElementIds = new Set(model.elements.map((e) => e.id));
    return document.layoutJson.nodes.filter(
      (n) => n.kind !== "BOUNDARY" && !n.id.startsWith("boundary:") && validElementIds.has(n.id),
    );
  }, [document, kind, model.elements]);

  const c4DocEdges = useMemo(() => {
    if (!document) return [];
    const nodeNameById = new Map<string, string>();
    for (const el of model.elements) nodeNameById.set(el.id, el.name);
    for (const n of document.layoutJson.nodes) nodeNameById.set(n.id, n.name);
    const validEdgeIds = new Set(model.edges.map((e) => e.id));

    return document.layoutJson.edges.map((edge) => {
      const underlying = Array.isArray(edge["underlyingEdgeIds"])
        ? (edge["underlyingEdgeIds"] as string[]).filter((id) => validEdgeIds.has(id))
        : [];
      const strippedId = edge.id.replace(/^projection:/, "");
      const canonicalEdgeId =
        underlying[0] ??
        (validEdgeIds.has(edge.id) ? edge.id : validEdgeIds.has(strippedId) ? strippedId : null);
      const fromName = nodeNameById.get(edge.from ?? "") ?? edge.from ?? "Source";
      const toName = nodeNameById.get(edge.to ?? "") ?? edge.to ?? "Target";
      const protocol = edge.type ?? edge.relationType ?? "INTERACTION";
      return {
        key: edge.id,
        canonicalId: canonicalEdgeId ?? edge.from ?? edge.to ?? edge.id,
        fromName,
        toName,
        protocol,
        underlyingCount: underlying.length,
        description:
          typeof edge["description"] === "string" ? (edge["description"] as string) : null,
      };
    });
  }, [document, kind, model.elements, model.edges]);

  const key = selection.key,
    targetKey = `${model.id}:${key}`;
  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId: key },
    {
      enabled:
        api.mode === "backend" &&
        !guidedStatic &&
        !!document &&
        !isUmlWorkspaceKind &&
        kind !== "SCENARIOS" &&
        kind !== "UML_SEQUENCE",
    },
  );
  useEffect(() => {
    let live = true;
    setError("");
    if (!document || isUmlWorkspaceKind || kind === "SCENARIOS" || kind === "UML_SEQUENCE") return;
    void generateDrawio(document, "clean", layoutLocally)
      .catch(() =>
        selection.document
          ? generateDrawio(selection.document, "clean", layoutLocally)
          : Promise.reject(new Error("Diagram layout failed")),
      )
      .then((xml) => {
        if (live) setGeneratedState({ targetKey, xml });
      })
      .catch((error) => {
        if (live) setError(error instanceof Error ? error.message : "Diagram layout failed");
      });
    return () => {
      live = false;
    };
  }, [document, selection.document, isUmlWorkspaceKind, kind, targetKey]);
  const generated = generatedState.targetKey === targetKey ? generatedState.xml : "";
  const hasValidSavedXml = Boolean(
    saved.data?.xml && saved.data.xml.includes('mavisSmartRouting="3"') &&
    (!document?.["policyVersion"] || saved.data.xml.includes(String(document["policyVersion"]))) &&
    (!document || saved.data.xml.includes(`name="${document.notation} · ${document.level}"`)),
  );
  const xml = (hasValidSavedXml ? saved.data?.xml : null) ?? generated;
  const currentOption = diagramOptions.find((item) => item.value === kind);
  const title =
    kind === "COMPONENT"
      ? `Component · ${container?.name ?? "Service"}`
      : (currentOption?.label ?? kind);
  function change(nextKind: DiagramKind) {
    setKind(nextKind);
    if (nextKind !== "SCENARIOS" && nextKind !== "UML_SEQUENCE" && onSelectSequence) {
      onSelectSequence(null, null);
    }
  }
  const showServiceSelect = ["COMPONENT", "LOGICAL"].includes(kind);
  const showServiceScopeSelect = ["UML_CLASS", "UML_PACKAGE"].includes(kind);
  const resolveCanvasSelect = (rawId: string) => {
    const stripped = rawId.replace(/^projection:/, "");
    if (
      model.elements.some((el) => el.id === rawId) ||
      model.edges.some((edge) => edge.id === rawId)
    ) {
      onSelect(rawId);
      return;
    }
    if (
      model.elements.some((el) => el.id === stripped) ||
      model.edges.some((edge) => edge.id === stripped)
    ) {
      onSelect(stripped);
      return;
    }
    const matchedDocEdge = c4DocEdges.find((edge) => edge.key === rawId);
    onSelect(matchedDocEdge?.canonicalId ?? rawId);
  };
  return (
    <section
      aria-label="Architecture diagrams"
      className={guidedStatic ? "min-w-0" : "min-w-0 space-y-2.5"}
    >
      {(!hideKindSelector || showServiceSelect || showServiceScopeSelect) && (
        <div
          data-tour="diagram-type-bar"
          className={
            guidedStatic
              ? "flex flex-wrap items-end gap-3 border-b border-border/60 bg-muted/15 px-4 py-2.5"
              : "flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3"
          }
        >
          {!hideKindSelector && (
            <div className="w-full sm:w-64">
              <SelectField
                label={t("Diagram type", "Loại sơ đồ")}
                value={kind}
                onChange={(value) => change(value as DiagramKind)}
                options={guidedStatic ? guidedDiagramOptions : diagramOptions}
              />
            </div>
          )}
          {showServiceSelect &&
            (guidedStatic ? (
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("Service filter (C3 Component)", "Chọn Service để xem C3 Component")}
              >
                <Button
                  type="button"
                  size="sm"
                  variant={service === "ALL" || !service ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setService("ALL")}
                >
                  {t(`All Services (${containers.length})`, `Tổng quan (${containers.length} Services)`)}
                </Button>
                {containers.map((node) => {
                  const active = service === node.id;
                  return (
                    <Button
                      key={node.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setService(node.id)}
                    >
                      {node.name}
                      <span className="ml-1 text-[10px] opacity-75">({node.count})</span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="w-full sm:w-80">
                <SelectField
                  label={t("Service to inspect (C3 Component)", "Chọn Service để xem C3 Component")}
                  value={container?.id ?? ""}
                  onChange={setService}
                  options={containers.map((node) => ({
                    value: node.id,
                    label: `${node.name}${node.count === 0 ? ` · ${t("no components extracted", "chưa tách thành phần con")}` : ""}`,
                  }))}
                />
              </div>
            ))}
          {showServiceScopeSelect && (
            <div className="w-full sm:w-80">
              <SelectField
                label={t("Service", "Dịch vụ (Service)")}
                value={kind === "UML_CLASS" ? service || container?.id || "ALL" : service || "ALL"}
                onChange={setService}
                options={[
                  { value: "ALL", label: t("All services", "Tất cả Service") },
                  ...containers.map((node) => ({
                    value: node.id,
                    label: node.name,
                  })),
                ]}
              />
            </div>
          )}
        </div>
      )}
      {!guidedStatic && selection.notice && !isUmlWorkspaceKind && (
        <p
          role="status"
          className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"
        >
          {selection.notice}
        </p>
      )}
      <div data-tour="diagram-canvas">
      {kind === "SCENARIOS" || kind === "UML_SEQUENCE" ? (
        <ScenarioDiagram
          model={model}
          selectedId={selectedId}
          onSelect={onSelect}
          onSelectSequence={onSelectSequence}
          theme={theme}
          onThemeChange={setTheme}
        />
      ) : isUmlWorkspaceKind ? (
        <UmlDiagramWorkspace
          model={model}
          kind={kind as UmlDiagramKind}
          serviceId={
            (kind === "UML_CLASS"
              ? service === "ALL"
                ? ""
                : service || container?.id || ""
              : service === "ALL"
                ? ""
                : service) || undefined
          }
          selectedId={selectedId}
          onSelect={onSelect}
          theme={theme}
          onThemeChange={setTheme}
          requestedMode={searchParams.get("mode")}
          requestedSessionId={searchParams.get("session")}
        />
      ) : !document ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          {selection.reason}
        </p>
      ) : error ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          {error}
        </p>
      ) : !xml ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          {t("Preparing diagram…", "Đang dựng sơ đồ kiến trúc…")}
        </p>
      ) : (
        <div className={guidedStatic ? "" : "space-y-2.5"}>
          {/* C4 Top 3E Element & Relationship Inspector Bar (omitted in student guidedStatic mode) */}
          {!guidedStatic && c4DocNodes.length > 0 && (
            <div
              className="rounded-xl border bg-card p-3"
              data-testid={`c4-${kind.toLowerCase()}-top-inspector-card`}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <SearchableThreeESelect
                  label={t("Element to explore", "Chọn thành phần để kiểm tra")}
                  placeholder={t("Select or search elements…", "Chọn hoặc tìm thành phần…")}
                  selectedValue={selectedId}
                  onSelect={onSelect}
                  options={c4DocNodes.map((node, idx) => ({
                    value: node.id,
                    badge: formatC4NodeBadge(node.kind),
                    label: `${idx + 1}. ${node.name}`,
                    sublabel:
                      typeof node.description === "string" && node.description.trim()
                        ? node.description
                        : undefined,
                    testId: `c4-item-${node.name}`,
                  }))}
                />
                <SearchableThreeESelect
                  label={t("Connection to explore", "Chọn kết nối để kiểm tra")}
                  placeholder={t("Select or search connections…", "Chọn hoặc tìm kết nối…")}
                  selectedValue={selectedId}
                  onSelect={onSelect}
                  options={c4DocEdges.map((edge, idx) => ({
                    value: edge.canonicalId,
                    badge: edge.protocol,
                    label: `#${idx + 1} ${edge.fromName} → ${edge.toName}`,
                    sublabel:
                      [
                        edge.description,
                        edge.underlyingCount > 1
                          ? `${edge.underlyingCount} ${t("calls", "lượt gọi")}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined,
                  }))}
                />
              </div>
            </div>
          )}

          {guidedStatic ? (
            <ArchitectureSvgViewer
              xml={xml}
              selectedId={selectedId}
              onSelect={resolveCanvasSelect}
            />
          ) : <DrawioEditor
            key={`${model.id}:${key}`}
            modelId={model.id}
            diagramId={key}
            title={title}
            notation={document.notation}
            level={document.level}
            scope={key}
            theme={theme}
            onThemeChange={setTheme}
            xml={xml}
            generatedXml={generated || xml}
            preferProvidedXml={hasValidSavedXml}
            selectedId={selectedId}
            onSelect={onSelect}
            autoSaveWhenReady={Boolean(
              saved.data && !hasValidSavedXml && !saved.error && generated,
            )}
            onSave={async (content) => {
              if (!saved.data || saved.error)
                throw Error("The saved version could not load. Retry before saving.");
              const result = await api.execute("saveArchitectureDocument", {
                modelId: model.id,
                viewId: key,
                expectedRevision: saved.data.revision,
                xml: content,
              });
              cache.setQueryData(
                ["api", "architectureDocument", { modelId: model.id, viewId: key }],
                result,
              );
            }}
          />}
        </div>
      )}
      </div>
    </section>
  );
}
