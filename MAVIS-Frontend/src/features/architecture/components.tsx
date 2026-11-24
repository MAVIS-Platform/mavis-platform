"use client";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailPanel } from "@/components/shared/data";
import { EmptyState } from "@/components/shared/request-state";
import { FilterControls, SearchInput, SelectField } from "@/components/shared/forms";
import type { ArchitecturalModel, Evidence, ModelSummary } from "@/types/domain";
import { useLocale } from "@/lib/i18n/locale-context";
import { projectGraphModel } from "./graph-projection";
import { DependencyNetwork } from "./dependency-network";

const LAYER_LABELS: Record<string, { en: string; vi: string }> = {
  edge: { en: "Edge", vi: "Cổng biên" },
  domain: { en: "Domain", vi: "Nghiệp vụ" },
  data: { en: "Data", vi: "Dữ liệu" },
  platform: { en: "Platform", vi: "Hạ tầng" },
};

export function formatArchitectureLayerLabel(
  layer: string | null | undefined,
  t: (en: string, vi?: string) => string,
): string | null {
  const trimmed = layer?.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (key === "unclassified") return null;
  const mapped = LAYER_LABELS[key];
  return mapped ? t(mapped.en, mapped.vi) : trimmed;
}

export function ModelVersionSelector({
  models,
  value,
  onChange,
}: {
  models: readonly ModelSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  const newest = Math.max(0, ...models.map((model) => model.revision));
  const dateFormat = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <SelectField
      label="Architecture revision"
      value={value}
      onChange={onChange}
      options={models.map((model) => {
        const date = model.createdAt ? new Date(model.createdAt) : null;
        const created = date && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : "";
        const customLabel = model.label && !/^Revision \d+$/i.test(model.label) ? model.label : "";
        return {
          value: model.id,
          label: [
            `Revision ${model.revision}`,
            model.origin === "RUNTIME_ENRICHED" ? "Runtime-Enriched" : "",
            model.revision === newest ? "Latest" : "",
            customLabel,
            created,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      })}
    />
  );
}

export function GraphLegend() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-muted-foreground">Elements:</span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] bg-card text-foreground"
          title="Rectangle"
        >
          <span className="inline-block h-2.5 w-3 border border-current rounded-xs" />
          [SVC] Service
        </span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] bg-card text-foreground"
          title="Component shape"
        >
          <span className="inline-block h-2.5 w-3 border border-dashed border-current rounded-xs" />
          [COMP] Component
        </span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] bg-card text-foreground"
          title="Cylinder"
        >
          <span className="inline-block h-2.5 w-2.5 border border-current rounded-full" />
          [DB] Database
        </span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] bg-card text-foreground"
          title="Process queue"
        >
          <span className="inline-block h-2.5 w-3 border-x-2 border-y border-current" />
          [QUEUE] Channel / Broker
        </span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] bg-muted text-muted-foreground"
          title="External boundary"
        >
          [EXT] External System
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-muted-foreground">Relationships &amp; Origins:</span>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
          <span className="font-bold">───</span> Solid (Source-inferred call)
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
          <span className="font-bold">- - -</span> Dashed (Deployment / Declared)
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
          <span className="font-bold">···</span> Dotted (Uncertain mapping)
        </span>
        <Badge variant="source">[SOURCE] Inferred</Badge>
        <Badge variant="secondary">[CONFIG] Declared</Badge>
        <Badge variant="outline">[DEPLOY] Deployment</Badge>
        <Badge variant="runtime">[RUNTIME] Observed</Badge>
        <Badge variant="warning">[UNCERTAIN] Unresolved</Badge>
      </div>
    </div>
  );
}
export function GraphToolbar({
  query,
  onQuery,
  layer,
  onLayer,
  onZoom,
  onReset,
}: {
  query: string;
  onQuery: (value: string) => void;
  layer: string;
  onLayer: (value: string) => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3 border-b p-4">
      <FilterControls>
        <SearchInput value={query} onChange={onQuery} label="Search graph" />
        <SelectField
          label="Layer"
          value={layer}
          onChange={onLayer}
          options={["all", "edge", "domain", "platform", "data", "unclassified"].map((value) => ({
            value,
            label: value,
          }))}
        />
        <Button size="sm" variant="outline" aria-label="Zoom in" onClick={() => onZoom(1.2)}>
          +
        </Button>
        <Button size="sm" variant="outline" aria-label="Zoom out" onClick={() => onZoom(0.8)}>
          −
        </Button>
        <Button size="sm" variant="outline" onClick={onReset}>
          Fit graph
        </Button>
      </FilterControls>
      <GraphLegend />
    </div>
  );
}
export function EvidenceViewer({
  evidence,
  subject = "relationship",
}: {
  evidence: readonly Evidence[];
  subject?: "element" | "relationship";
}) {
  if (!evidence.length)
    return (
      <EmptyState
        title="No evidence attached"
        description={
          subject === "element"
            ? "No source or runtime evidence is attached to this element. This does not mean it has no connections; see the relationships above."
            : "This relationship is present in the model, but no source or runtime evidence is attached to it. Its mapping is not verified."
        }
      />
    );
  return (
    <div className="space-y-3">
      {evidence.map((entry) => (
        <article key={entry.id} className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 p-3">
            <Badge variant={entry.kind}>
              {entry.kind === "source" ? "Source-inferred" : "Runtime-observed"}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.location}>
              {shortEvidenceLocation(entry.location)}
            </span>
            {entry.complete === false && <Badge variant="warning">Incomplete evidence</Badge>}
          </div>
          <pre className="overflow-auto p-3 text-xs">
            <code>{entry.snippet}</code>
          </pre>
        </article>
      ))}
    </div>
  );
}

function shortEvidenceLocation(location: string): string {
  if (!location) return "Unknown location";
  const normalized = location.replace(/\\/g, "/");
  return normalized.match(/([^/]+(?::\d+(?::\d+)?)?)$/)?.[1] ?? normalized;
}

function ElementEvidenceContext({
  model,
  elementId,
  onSelect,
}: {
  model: ArchitecturalModel;
  elementId: string;
  onSelect?: (id: string) => void;
}) {
  const { t } = useLocale();
  const context = useApiQuery("elementEvidenceContext", { modelId: model.id, elementId });
  const related = context.data?.relationshipEvidence ?? [];
  const grouped = new Map<string, { edges: ArchitecturalModel["edges"]; evidence: Evidence[] }>();
  for (const item of related) {
    const edge = model.edges.find((candidate) => candidate.id === item.relationshipId);
    const key = edge ? `${edge.from}:${edge.to}` : item.relationshipId;
    const group = grouped.get(key) ?? { edges: [], evidence: [] };
    if (edge && !group.edges.some((candidate) => candidate.id === edge.id)) group.edges.push(edge);
    group.evidence.push(item.evidence);
    grouped.set(key, group);
  }
  const name = (id: string) => model.elements.find((e) => e.id === id)?.name ?? id;
  return (
    <RequestState query={context}>
      <div className="space-y-4">
        {(context.data?.directEvidence.length ?? 0) > 0 ? (
          <EvidenceViewer evidence={context.data!.directEvidence} subject="element" />
        ) : (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            {t(
              "No evidence is attached directly to this element.",
              "Không có bằng chứng mã nguồn nào được gắn trực tiếp vào thành phần này.",
            )}
            {related.length > 0
              ? t(
                  " Evidence for its incoming/outgoing relationships is listed below.",
                  " Bằng chứng cho các mối quan hệ đến/đi liên quan được liệt kê ngay bên dưới.",
                )
              : t(
                  " No persisted evidence was found for its incoming/outgoing relationships either. Source previews in 3E are separate from saved evidence.",
                  " Cũng chưa có bằng chứng đã lưu cho các mối quan hệ liên quan. Phần xem trước mã nguồn tách biệt với bằng chứng đã lưu.",
                )}
          </p>
        )}
        {related.length > 0 && (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">
              {t(
                `Evidence for related relationships (${related.length})`,
                `Bằng chứng từ các quan hệ liên quan (${related.length})`,
              )}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t(
                "These snippets support the listed relationships; they do not by themselves establish this element's internal behavior.",
                "Các trích đoạn mã nguồn này chứng minh kết nối giữa các thành phần, không thay thế cho cài đặt nội bộ của thành phần.",
              )}
            </p>
            {[...grouped].map(([groupKey, group]) => {
              const edge = group.edges[0];
              const protocols = [...new Set(group.edges.map((candidate) => candidate.protocol))];
              const label = edge
                ? `${name(edge.from)} → ${name(edge.to)}`
                : t(`Relationship ${groupKey}`, `Quan hệ ${groupKey}`);
              return (
                <div className="space-y-2" key={groupKey}>
                  {onSelect && edge ? (
                    <button
                      type="button"
                      className="break-words text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => onSelect(edge.id)}
                    >
                      {label}
                    </button>
                  ) : (
                    <p className="break-words text-sm font-medium">{label}</p>
                  )}
                  {protocols.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {protocols.map((protocol) => (
                        <Badge key={protocol} variant="outline" className="font-mono text-[10px]">
                          {protocol}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <EvidenceViewer evidence={group.evidence} subject="relationship" />
                </div>
              );
            })}
          </section>
        )}
      </div>
    </RequestState>
  );
}
export type InspectorTab = "overview" | "relationships" | "evidence" | "ai";

function cleanArchitectureDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/(?:\/?data\/uploads\/[^\s·,;)]+|[^\s·,;)]*_source_extracted[^\s·,;)]*)/gi, "")
    .replace(
      /\b(?:PACKAGE|CLASS_INTERFACE|SERVICE_CONTAINER|COMPONENT|CONTROLLER|ENTITY|REPOSITORY)\s*·\s*(?=$|·)/gi,
      "",
    )
    .replace(/\s*·\s*$/g, "")
    .replace(/^\s*·\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function summarizeSwdRole(
  element: ArchitecturalModel["elements"][number] | undefined,
  edge: ArchitecturalModel["edges"][number] | undefined,
  t: (en: string, vi?: string) => string,
): string {
  if (edge && !element) {
    return t(
      "Static dependency contract between caller and callee. Inspect protocol, direction, and source evidence.",
      "Hợp đồng phụ thuộc tĩnh nối giữa thành phần gọi và thành phần được gọi. Kiểm tra giao thức, chiều gọi và bằng chứng mã nguồn.",
    );
  }
  const type = (element?.elementType ?? "").toUpperCase();
  const layer = (element?.layer ?? "").toLowerCase();
  if (type.includes("GATEWAY") || layer === "edge") {
    return t(
      "Entry gateway / edge router that handles incoming requests and dispatches them to downstream domain services.",
      "Cổng API / tầng biên tiếp nhận yêu cầu từ client và điều tuyến sang các dịch vụ nghiệp vụ bên trong.",
    );
  }
  if (type.includes("DATABASE")) {
    return t(
      "Dedicated persistent datastore (Database-per-Service pattern in SWD) storing domain entities.",
      "Cơ sở dữ liệu lưu trữ bền vững cho dịch vụ (theo nguyên tắc Database-per-Service trong SWD).",
    );
  }
  if (type.includes("BROKER") || type.includes("CHANNEL") || type.includes("QUEUE")) {
    return t(
      "Asynchronous messaging channel / broker decoupling event producers from downstream consumers.",
      "Kênh truyền thông điệp / hàng đợi bất đồng bộ giúp tách rời bên phát sự kiện và bên tiêu thụ.",
    );
  }
  if (type.includes("EXTERNAL") || type.includes("PERSON")) {
    return t(
      "External actor or third-party system outside your deployed architecture boundary.",
      "Tác nhân bên ngoài hoặc hệ thống đối tác nằm ngoài ranh giới triển khai của hệ thống.",
    );
  }
  if (type.includes("SERVICE")) {
    return t(
      "Autonomous microservice / application container encapsulating bounded domain logic and APIs.",
      "Microservice / container nghiệp vụ độc lập, đóng gói logic miền và cung cấp API / sự kiện.",
    );
  }
  return t(
    "Structural code module (Controller, Service, Repository, or Client) participating in dependency flow.",
    "Thành phần mã nguồn cấu trúc (Controller, Service, Repository hoặc Client) tham gia luồng phụ thuộc.",
  );
}

export function ElementDetailsPanel({
  model,
  selectedId,
  onSelect,
  aiPanel,
  activeTab: controlledTab,
  onTabChange,
  onExplainWithAi,
  onInspectServiceC3,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  aiPanel?: ReactNode;
  activeTab?: InspectorTab | undefined;
  onTabChange?: ((tab: InspectorTab) => void) | undefined;
  onExplainWithAi?: (() => void) | undefined;
  onInspectServiceC3?: ((serviceId: string) => void) | undefined;
}) {
  const localeCtx = useLocale();
  const t = localeCtx.t;
  const [internalTab, setInternalTab] = useState<InspectorTab>("overview");
  const currentTab = controlledTab ?? internalTab;
  const selectTab = (next: InspectorTab) => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  useEffect(() => {
    if (!onTabChange) setInternalTab("overview");
  }, [selectedId, onTabChange]);
  const normalizedSelectedId = selectedId?.replace(/^projection:/, "") ?? selectedId;
  const element =
    model.elements.find((e) => e.id === selectedId) ??
    model.elements.find((e) => e.id === normalizedSelectedId);
  const edge =
    model.edges.find((e) => e.id === selectedId) ??
    model.edges.find((e) => e.id === normalizedSelectedId) ??
    model.edges.find((e) => (selectedId ? e.underlyingEdgeIds?.includes(selectedId) : false));
  const incoming = element ? model.edges.filter((relation) => relation.to === element.id) : [];
  const outgoing = element ? model.edges.filter((relation) => relation.from === element.id) : [];
  const parent = element?.parentId
    ? model.elements.find((node) => node.id === element.parentId)
    : undefined;
  const children = element ? model.elements.filter((node) => node.parentId === element.id) : [];
  const nameOf = (id: string) => model.elements.find((node) => node.id === id)?.name ?? id;
  const cleanedDescription = cleanArchitectureDescription(element?.description);
  function connectionList(title: string, titleVi: string, relations: ArchitecturalModel["edges"]) {
    const grouped = new Map<string, ArchitecturalModel["edges"]>();
    for (const relation of relations) {
      const key = `${relation.from}:${relation.to}`;
      grouped.set(key, [...(grouped.get(key) ?? []), relation]);
    }
    const relationshipGroups = [...grouped.values()];
    return (
      <section aria-label={`${title} relationships`} className="space-y-2">
        <h4 className="text-sm font-semibold">
          {t(title, titleVi)} ({relations.length}{" "}
          {t(relations.length === 1 ? "relationship" : "relationships", "quan hệ")} ·{" "}
          {relationshipGroups.length}{" "}
          {t(relationshipGroups.length === 1 ? "peer" : "peers", "thành phần")})
        </h4>
        {relationshipGroups.length ? (
          <ul className="space-y-2">
            {relationshipGroups.map((group) => {
              const relation = group[0]!;
              const protocols = [...new Set(group.map((item) => item.protocol))];
              const uncertain = group.some((item) => item.uncertain);
              return (
                <li
                  key={`${relation.from}:${relation.to}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    {onSelect ? (
                      <button
                        type="button"
                        className="w-full break-words text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                        onClick={() => onSelect(relation.id)}
                      >
                        {nameOf(relation.from)} → {nameOf(relation.to)}
                      </button>
                    ) : (
                      <p className="break-words font-medium">
                        {nameOf(relation.from)} → {nameOf(relation.to)}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {protocols.map((protocol) => (
                        <Badge key={protocol} variant="outline" className="font-mono text-[10px]">
                          {protocol}
                        </Badge>
                      ))}
                      {uncertain && (
                        <Badge variant="warning">{t("Needs verification", "Cần đối chiếu")}</Badge>
                      )}
                    </div>
                  </div>
                  {onSelect && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        onSelect(relation.from === element?.id ? relation.to : relation.from)
                      }
                    >
                      {t("Inspect peer →", "Xem thành phần →")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {title === "Incoming"
              ? t("No incoming callers in this model.", "Không có thành phần gọi đến.")
              : t("No outgoing dependencies in this model.", "Không có phụ thuộc gọi ra.")}
          </p>
        )}
      </section>
    );
  }
  const api = useApi();
  const evidence = useApiQuery(
    element ? "elementEvidence" : "relationshipEvidence",
    element
      ? { modelId: model.id, elementId: element.id }
      : { modelId: model.id, relationshipId: edge?.id ?? "" },
    { enabled: api.mode === "backend" && !!edge && !element },
  );
  const resolved =
    api.mode === "backend" && element ? (
      <ElementEvidenceContext
        key={`${model.id}:${element.id}`}
        model={model}
        elementId={element.id}
        {...(onSelect ? { onSelect } : {})}
      />
    ) : api.mode === "backend" ? (
      <RequestState query={evidence}>
        <EvidenceViewer
          evidence={evidence.data ?? []}
          subject={element ? "element" : "relationship"}
        />
      </RequestState>
    ) : (
      <EvidenceViewer
        evidence={element?.evidence ?? edge?.evidence ?? []}
        subject={element ? "element" : "relationship"}
      />
    );
  const detailTabs: Array<{ id: InspectorTab; label: string }> = element
    ? [
        { id: "overview", label: t("Overview", "Tổng quan") },
        {
          id: "relationships",
          label: `${t("Relationships", "Quan hệ")} (${incoming.length + outgoing.length})`,
        },
        { id: "evidence", label: t("Evidence", "Bằng chứng") },
        ...(aiPanel ? [{ id: "ai" as const, label: t("Ask AI", "Hỏi AI") }] : []),
      ]
    : edge
      ? [
          { id: "overview", label: t("Overview", "Tổng quan") },
          { id: "evidence", label: t("Evidence", "Bằng chứng") },
          ...(aiPanel ? [{ id: "ai" as const, label: t("Ask AI", "Hỏi AI") }] : []),
        ]
      : aiPanel
        ? [
            { id: "overview", label: t("Overview", "Tổng quan") },
            { id: "ai", label: t("Ask AI", "Hỏi AI") },
          ]
        : [];
  const visibleTab = detailTabs.some((tab) => tab.id === currentTab)
    ? currentTab
    : (detailTabs[0]?.id ?? "overview");
  const aiButton =
    aiPanel || onExplainWithAi ? (
      <div className="pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => {
            selectTab("ai");
            onExplainWithAi?.();
          }}
        >
          {t("Explain with AI", "Giải thích bằng AI")}
        </Button>
      </div>
    ) : null;

  return (
    <DetailPanel
      title={
        edge && !element
          ? t("Relationship details", "Chi tiết quan hệ kết nối")
          : element
            ? t("Element details", "Chi tiết thành phần kiến trúc")
            : t("Architecture Inspector", "Kiểm tra Kiến trúc SWD")
      }
    >
      {detailTabs.length > 0 && (
        <div
          role="tablist"
          aria-label={t(
            element ? "Element detail sections" : "Architecture inspector tabs",
            "Các mục kiểm tra kiến trúc",
          )}
          className="grid gap-1 rounded-lg border bg-muted/40 p-1"
          style={{ gridTemplateColumns: `repeat(${detailTabs.length}, minmax(0, 1fr))` }}
        >
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={visibleTab === tab.id}
              onClick={() => selectTab(tab.id)}
              className={`rounded-md px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors ${
                visibleTab === tab.id
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {element ? (
        <>
          <div
            role="tabpanel"
            hidden={visibleTab !== "overview"}
            className="space-y-2.5 rounded-lg border bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {element.elementType && (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {element.elementType}
                </Badge>
              )}
              {(() => {
                const layerLabel = formatArchitectureLayerLabel(element.layer, t);
                return layerLabel ? (
                  <Badge variant="secondary" className="text-[11px]">
                    {t("Layer", "Tầng")}: {layerLabel}
                  </Badge>
                ) : null;
              })()}
              {element.technology && (
                <Badge variant="outline" className="text-[11px]">
                  {element.technology}
                </Badge>
              )}
            </div>
            <h3 className="font-mono text-base font-semibold">{element.name}</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {summarizeSwdRole(element, undefined, t)}
            </p>
            {cleanedDescription && cleanedDescription !== element.name && (
              <p className="text-xs text-muted-foreground">{cleanedDescription}</p>
            )}
            {parent && (
              <p className="text-xs text-muted-foreground">
                {t("Parent container:", "Thuộc Container:")}{" "}
                {onSelect ? (
                  <button
                    type="button"
                    className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => onSelect(parent.id)}
                  >
                    {parent.name}
                  </button>
                ) : (
                  <span className="font-mono font-medium text-foreground">{parent.name}</span>
                )}
              </p>
            )}
            {children.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t(
                    `Contained components / classifiers (${children.length}):`,
                    `Thành phần con bên trong (${children.length}):`,
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {children.slice(0, 12).map((child) =>
                    onSelect ? (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onSelect(child.id)}
                        className="rounded border bg-card px-2 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {child.name}
                      </button>
                    ) : (
                      <span
                        key={child.id}
                        className="rounded border bg-card px-2 py-0.5 font-mono text-[11px]"
                      >
                        {child.name}
                      </span>
                    ),
                  )}
                  {children.length > 12 && (
                    <span className="self-center text-[11px] text-muted-foreground">
                      +{children.length - 12} {t("more", "nữa")}
                    </span>
                  )}
                </div>
              </div>
            )}
            {element.elementType === "SERVICE_CONTAINER" && children.length > 0 && onInspectServiceC3 && (
              <Button
                type="button"
                size="sm"
                variant="default"
                className="w-full"
                onClick={() => onInspectServiceC3(element.id)}
              >
                {t("View C3 diagram for this service →", "Xem sơ đồ C3 của service này →")}
              </Button>
            )}
            {aiButton}
          </div>
          <div role="tabpanel" hidden={visibleTab !== "relationships"} className="space-y-4">
            {connectionList("Incoming", "Thành phần gọi đến", incoming)}
            {connectionList("Outgoing", "Phụ thuộc gọi ra", outgoing)}
          </div>
          <div role="tabpanel" hidden={visibleTab !== "evidence"} className="space-y-3">
            <h4 className="text-sm font-semibold">
              {t("Saved evidence context", "Bằng chứng mã nguồn đã lưu")}
            </h4>
            {resolved}
          </div>
          {aiPanel && (
            <div role="tabpanel" hidden={visibleTab !== "ai"} className="space-y-3">
              {aiPanel}
            </div>
          )}
        </>
      ) : edge ? (
        <>
          <div role="tabpanel" hidden={visibleTab !== "overview"} className="space-y-3">
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {edge.protocol}
                </Badge>
                <Badge variant={edge.uncertain ? "warning" : "secondary"} className="text-[11px]">
                  {edge.resolutionStatus ?? (edge.uncertain ? "UNRESOLVED" : "RESOLVED")}
                </Badge>
                {edge.originLayer && (
                  <Badge variant="outline" className="text-[11px]">
                    {t("Origin", "Nguồn gốc")}: {edge.originLayer}
                  </Badge>
                )}
              </div>
              <h3 className="font-mono text-sm font-semibold">
                {nameOf(edge.from)} → {nameOf(edge.to)} · {edge.protocol}
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {summarizeSwdRole(undefined, edge, t)}
              </p>
              {onSelect && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onSelect(edge.from)}
                  >
                    {t("Source", "Bên gọi")}: {nameOf(edge.from)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onSelect(edge.to)}
                  >
                    {t("Target", "Bên nhận")}: {nameOf(edge.to)}
                  </Button>
                </div>
              )}
              {aiButton}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Linked evidence:", "Bằng chứng liên kết:")}{" "}
              <span className="font-medium text-foreground">
                {edge.evidenceCount === null || edge.evidenceCount === undefined
                  ? t("— (not verified yet)", "— (chưa đối chiếu)")
                  : edge.evidenceCount === 0
                    ? t("0 (verified: no evidence attached)", "0 (đã kiểm tra: chưa gắn mã nguồn)")
                    : `${edge.evidenceCount} ${t("verified evidence item(s)", "bằng chứng đã xác minh")}${
                        edge.underlyingEdgeIds && edge.underlyingEdgeIds.length > 1
                          ? ` (${t("grouped across", "gộp từ")} ${edge.underlyingEdgeIds.length} ${t("relationships", "quan hệ")})`
                          : ""
                      }`}
              </span>
            </p>
          </div>
          <div role="tabpanel" hidden={visibleTab !== "evidence"} className="space-y-3">
            <h4 className="text-sm font-semibold">
              {t("Saved evidence context", "Bằng chứng mã nguồn đã lưu")}
            </h4>
            {resolved}
          </div>
          {aiPanel && (
            <div role="tabpanel" hidden={visibleTab !== "ai"} className="space-y-3">
              {aiPanel}
            </div>
          )}
        </>
      ) : (
        <>
          <div role="tabpanel" hidden={visibleTab !== "overview"} className="space-y-2">
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Select a service, container, or connection in the diagram to inspect its SWD role, inbound/outbound dependencies, and source code evidence.",
                "Chọn một service, container hoặc kết nối trên sơ đồ để xem vai trò SWD, quan hệ gọi đến/đi và bằng chứng mã nguồn.",
              )}
            </p>
            {aiButton}
          </div>
          {aiPanel && (
            <div role="tabpanel" hidden={visibleTab !== "ai"} className="space-y-3">
              {aiPanel}
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(`Model revision r${model.revision}`, `Mô hình phiên bản r${model.revision}`)}
      </p>
    </DetailPanel>
  );
}
export function ArchitectureGraph({
  model,
  selectedId,
  onSelect,
  highlightIds = [],
  onClearHighlight,
  guidedStatic = false,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Contextual analyses (for example Reverse BFS) can highlight related nodes without
   * changing the student's current selection. */
  highlightIds?: string[];
  onClearHighlight?: (() => void) | undefined;
  guidedStatic?: boolean;
}) {
  const localeCtx = useLocale();
  const t = localeCtx.t;
  const [layer, setLayer] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<"all" | "source" | "deployment" | "runtime">("all");
  const projection = useMemo(() => {
    const projected = projectGraphModel(model, expanded, origin);
    const elements = projected.model.elements.filter(
      (node) => layer === "all" || node.layer === layer,
    );
    const ids = new Set(elements.map((node) => node.id));
    return {
      ...projected,
      model: {
        ...projected.model,
        elements,
        edges: projected.model.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
      },
    };
  }, [model, expanded, origin, layer]);
  const group = projection.model.edges.find(
    (edge) => edge.id === selectedId || edge.underlyingEdgeIds?.includes(selectedId ?? ""),
  );
  const layerOptions = [
    { value: "all", label: t("All layers", "Tất cả tầng kiến trúc") },
    { value: "edge", label: t("Edge & Gateway", "Tầng Biên & Cổng (Edge)") },
    { value: "domain", label: t("Domain Services", "Tầng Nghiệp vụ (Domain)") },
    { value: "platform", label: t("Platform & Infra", "Tầng Nền tảng (Platform)") },
    { value: "data", label: t("Data & Storage", "Tầng Dữ liệu (Data)") },
    { value: "unclassified", label: t("Unclassified", "Chưa phân tầng") },
  ];
  return (
    <div className="space-y-3">
      {!guidedStatic && (
        <SelectField
          label={t("Architecture layer", "Tầng kiến trúc")}
          value={layer}
          onChange={setLayer}
          options={layerOptions}
        />
      )}
      <DependencyNetwork
        model={model}
        selectedId={selectedId}
        onSelect={onSelect}
        highlightIds={highlightIds}
        {...(onClearHighlight ? { onClearHighlight } : {})}
        projection={projection}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
        origin={origin}
        onOriginChange={setOrigin}
        guidedStatic={guidedStatic}
        showPresentationOptions={!guidedStatic}
      />
      {(group?.underlyingEdgeIds?.length ?? 0) > 1 && (
        <SelectField
          label="Connections in selected group"
          value={selectedId ?? ""}
          onChange={onSelect}
          options={model.edges
            .filter((edge) => group?.underlyingEdgeIds?.includes(edge.id))
            .map((edge) => ({
              value: edge.id,
              label: `${model.elements.find((node) => node.id === edge.from)?.name} → ${model.elements.find((node) => node.id === edge.to)?.name} · ${edge.protocol}`,
            }))}
        />
      )}
    </div>
  );
}
export function DiagramViewer(props: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return <ArchitectureGraph {...props} />;
}
export function DependencyPathViewer({ paths }: { paths: readonly string[][] }) {
  return paths.length ? (
    <ol className="space-y-2">
      {paths.map((path, i) => (
        <li
          key={`${i}-${path.join("/")}`}
          className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-xs"
        >
          {path.join(" → ")}
        </li>
      ))}
    </ol>
  ) : (
    <EmptyState title="No dependency paths" />
  );
}
