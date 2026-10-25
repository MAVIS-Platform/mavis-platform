"use client";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailPanel } from "@/components/shared/data";
import { EmptyState } from "@/components/shared/request-state";
import { FilterControls, SearchInput, SelectField } from "@/components/shared/forms";
import type { ArchitecturalModel, Evidence, ModelSummary } from "@/types/domain";
import { projectGraphModel } from "./graph-projection";
import { DependencyNetwork } from "./dependency-network";

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
  const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <div className="space-y-2">
      <SelectField
        label="Bản kiến trúc"
        value={value}
        onChange={onChange}
        options={models.map((model) => {
          const date = model.createdAt ? new Date(model.createdAt) : null;
          const created = date && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : "";
          const customLabel =
            model.label && !/^Revision \d+$/i.test(model.label) ? model.label : "";
          return {
            value: model.id,
            label: [
              `Bản ${model.revision}`,
              model.revision === newest ? "Mới nhất" : "",
              customLabel,
              created,
            ]
              .filter(Boolean)
              .join(" · "),
          };
        })}
      />
      <p className="text-xs text-muted-foreground">
        Mỗi bản lưu một kết quả phân tích hoặc chỉnh sửa kiến trúc. Chọn bản cũ để xem lại kết quả
        trước đó.
      </p>
    </div>
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
            <span className="break-all font-mono text-xs">{entry.location}</span>
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
export function ElementDetailsPanel({
  model,
  selectedId,
  onSelect,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const element = model.elements.find((e) => e.id === selectedId);
  const edge = model.edges.find((e) => e.id === selectedId);
  const incoming = element ? model.edges.filter((relation) => relation.to === element.id) : [];
  const outgoing = element ? model.edges.filter((relation) => relation.from === element.id) : [];
  const nameOf = (id: string) => model.elements.find((node) => node.id === id)?.name ?? id;
  function connectionList(title: string, relations: ArchitecturalModel["edges"]) {
    return (
      <section aria-label={`${title} relationships`} className="space-y-2">
        <h4 className="text-sm font-semibold">
          {title} ({relations.length})
        </h4>
        {relations.length ? (
          <ul className="space-y-2">
            {relations.map((relation) => (
              <li key={relation.id} className="rounded-md border p-2 text-xs">
                {onSelect ? (
                  <button
                    type="button"
                    className="w-full break-words text-left text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                    onClick={() => onSelect(relation.id)}
                  >
                    {nameOf(relation.from)} → {nameOf(relation.to)}
                  </button>
                ) : (
                  <p className="break-words">
                    {nameOf(relation.from)} → {nameOf(relation.to)}
                  </p>
                )}
                <p className="mt-1 text-muted-foreground">
                  {relation.protocol}
                  {relation.uncertain ? " · Uncertain mapping" : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No {title.toLowerCase()} relationships in this model.
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
    { enabled: api.mode === "backend" && !!(element || edge) },
  );
  const resolved =
    api.mode === "backend" ? (
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
  return (
    <DetailPanel title="Element details">
      {element ? (
        <>
          <h3 className="font-mono text-sm font-semibold">{element.name}</h3>
          <p className="text-sm text-muted-foreground">{element.description}</p>
          {connectionList("Incoming", incoming)}
          {connectionList("Outgoing", outgoing)}
          <h4 className="text-sm font-semibold">Evidence for this element</h4>
          {resolved}
        </>
      ) : edge ? (
        <>
          <h3 className="text-sm">
            {nameOf(edge.from)} → {nameOf(edge.to)} · {edge.protocol}
          </h3>
          <p className="text-xs text-muted-foreground">
            Origin: {edge.originLayer ?? "unknown"} · Resolution:{" "}
            {edge.resolutionStatus ?? "unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            Bằng chứng liên kết:{" "}
            <span className="font-medium text-foreground">
              {edge.evidenceCount === null || edge.evidenceCount === undefined
                ? "— (chưa xác minh / chưa tải)"
                : edge.evidenceCount === 0
                  ? "0 (đã xác minh không có bằng chứng)"
                  : `${edge.evidenceCount} căn cứ xác thực${
                      edge.underlyingEdgeIds && edge.underlyingEdgeIds.length > 1
                        ? ` (tổng hợp phân biệt từ ${edge.underlyingEdgeIds.length} quan hệ con)`
                        : ""
                    }`}
            </span>
          </p>
          {edge.underlyingEdgeIds && edge.underlyingEdgeIds.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Quan hệ gộp (${edge.underlyingEdgeIds.length} quan hệ thành phần)
            </p>
          )}
          {edge.uncertain && <Badge variant="warning">Uncertain mapping</Badge>}
          {resolved}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Select a service or relationship.</p>
      )}
      <p className="break-all text-xs text-muted-foreground">
        Model {model.id} · revision {model.revision} · source {model.snapshotId}
      </p>
    </DetailPanel>
  );
}
export function ArchitectureGraph({
  model,
  selectedId,
  onSelect,
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [layer, setLayer] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<"all" | "source" | "deployment" | "runtime">("source");
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
  return (
    <div className="space-y-3">
      <SelectField
        label="Layer"
        value={layer}
        onChange={setLayer}
        options={["all", "edge", "domain", "platform", "data", "unclassified"].map((value) => ({
          value,
          label: value,
        }))}
      />
      <DependencyNetwork
        model={model}
        selectedId={selectedId}
        onSelect={onSelect}
        projection={projection}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
        origin={origin}
        onOriginChange={setOrigin}
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
