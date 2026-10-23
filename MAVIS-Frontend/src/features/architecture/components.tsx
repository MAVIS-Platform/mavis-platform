"use client";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { RequestState } from "@/components/shared/request-state";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailPanel } from "@/components/shared/data";
import { EmptyState } from "@/components/shared/request-state";
import { FilterControls, Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import type {
  ArchitecturalModel,
  ArchitectureElement,
  Evidence,
  ModelSummary,
} from "@/types/domain";
import { projectGraphModel } from "./graph-projection";
import { graphEdgePath, layoutGraph, NODE_WIDTH, NODE_HEIGHT } from "./graph-layout";

export function ModelVersionSelector({
  models,
  value,
  onChange,
}: {
  models: readonly ModelSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <SelectField
      label="Model version"
      value={value}
      onChange={onChange}
      options={models.map((m) => ({ value: m.id, label: `${m.label} · ${m.snapshotId}` }))}
    />
  );
}
export function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="source">Source-inferred</Badge>
      <Badge variant="runtime">Runtime-observed</Badge>
      <Badge variant="secondary">Declared configuration</Badge>
      <Badge variant="warning">Uncertain mapping</Badge>
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
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showComponents, setShowComponents] = useState(false);
  const [origin, setOrigin] = useState<"all" | "source" | "deployment" | "runtime">("source");
  const projection = useMemo(
    () => projectGraphModel(model, showComponents, origin),
    [model, showComponents, origin],
  );
  const displayed = projection.model;
  const [layer, setLayer] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const marker = useId().replace(/:/g, "");
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const filtered = useMemo(() => {
    const elements = displayed.elements.filter(
      (node) =>
        (layer === "all" || node.layer === layer) &&
        node.name.toLowerCase().includes(query.toLowerCase()),
    );
    const ids = new Set(elements.map((node) => node.id));
    return layoutGraph({
      ...displayed,
      elements,
      edges: displayed.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    });
  }, [displayed, layer, query]);
  const visible = new Set(filtered.map((node) => node.id));
  const connections = displayed.edges.filter(
    (edge) => visible.has(edge.from) && visible.has(edge.to),
  );
  const byId = new Map(filtered.map((node) => [node.id, node]));
  const large = filtered.length > 300 || connections.length > 1000;
  const width = filtered.reduce((max, node) => Math.max(max, node.x + NODE_WIDTH + 55), 300);
  const height = filtered.reduce((max, node) => Math.max(max, node.y + NODE_HEIGHT + 55), 200);
  const fitScale = Math.min(viewportWidth / width, 620 / height, 1);
  const scale = fitScale * zoom;
  const adjacent = new Set<string>();
  if (selectedId) {
    adjacent.add(selectedId);
    connections.forEach((edge) => {
      if (
        edge.id === selectedId ||
        !!edge.underlyingEdgeIds?.includes(selectedId ?? "") ||
        edge.from === selectedId ||
        edge.to === selectedId
      ) {
        adjacent.add(edge.from);
        adjacent.add(edge.to);
      }
    });
  }
  function selectNode(node: ArchitectureElement) {
    onSelect(node.id);
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <GraphToolbar
        query={query}
        onQuery={(v) => {
          setQuery(v);
          setPage(1);
        }}
        layer={layer}
        onLayer={(v) => {
          setLayer(v);
          setPage(1);
        }}
        onZoom={(factor) => setZoom((z) => Math.max(0.4, Math.min(8, z * factor)))}
        onReset={() => setZoom(1)}
      />
      <div className="flex flex-wrap items-end gap-3 border-y p-4">
        <SelectField
          label="Relationship origin"
          value={origin}
          onChange={(value) => setOrigin(value as typeof origin)}
          options={[
            { value: "source", label: "Source and configured interactions" },
            { value: "all", label: "All relationships" },
            { value: "deployment", label: "Deployment dependencies" },
            { value: "runtime", label: "Runtime observations" },
          ]}
        />
        <Button variant="outline" onClick={() => setShowComponents((value) => !value)}>
          {showComponents ? "Collapse service internals" : "Expand service internals"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {projection.filteredRelationships} relationships outside this filter ·{" "}
          {projection.internalRelationships} internal relationships available when expanded
        </p>
      </div>
      <div ref={viewport}>
        {!filtered.length ? (
          <EmptyState
            title="No graph elements"
            description="Change the filters or analyze a source snapshot."
          />
        ) : (
          <>
            {!large && (
              <div className="h-[620px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:22px_22px]">
                <svg
                  className="mx-auto block"
                  width={width * scale}
                  height={height * scale}
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label="Architecture diagram; use the service and relationship controls below to inspect evidence"
                >
                  <defs>
                    <marker
                      id={marker}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--graph-edge)" />
                    </marker>
                  </defs>
                  {connections.map((edge) => {
                    const from = byId.get(edge.from);
                    const to = byId.get(edge.to);
                    if (!from || !to) return null;
                    return (
                      <path
                        key={edge.id}
                        d={graphEdgePath(from, to, edge.from === edge.to)}
                        opacity={
                          !selectedId ||
                          selectedId === edge.id ||
                          !!edge.underlyingEdgeIds?.includes(selectedId ?? "") ||
                          selectedId === edge.from ||
                          selectedId === edge.to
                            ? 0.8
                            : 0.15
                        }
                        fill="none"
                        stroke={
                          selectedId === edge.id ||
                          !!edge.underlyingEdgeIds?.includes(selectedId ?? "")
                            ? "var(--primary)"
                            : "var(--graph-edge)"
                        }
                        strokeWidth={
                          selectedId === edge.id ||
                          !!edge.underlyingEdgeIds?.includes(selectedId ?? "")
                            ? 3
                            : 1.5
                        }
                        strokeDasharray={
                          edge.originLayer === "DEPLOYMENT" || edge.protocol === "DECLARED_COMPOSE"
                            ? "8 5"
                            : edge.uncertain
                              ? "2 4"
                              : undefined
                        }
                        onClick={() => onSelect(edge.id)}
                        className="cursor-pointer"
                        markerEnd={`url(#${marker})`}
                      />
                    );
                  })}
                  {filtered.map((node) => (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      opacity={!selectedId || adjacent.has(node.id) ? 1 : 0.35}
                      onClick={() => onSelect(node.id)}
                      className="cursor-pointer"
                    >
                      <title>{node.name}</title>
                      <rect
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        rx={8}
                        fill="var(--card)"
                        stroke={selectedId === node.id ? "var(--primary)" : "var(--border)"}
                        strokeWidth={selectedId === node.id ? 2 : 1}
                      />
                      <text x={12} y={25} fill="var(--foreground)" fontSize={12}>
                        {node.name.slice(0, 23)}
                      </text>
                      <text x={12} y={45} fill="var(--muted-foreground)" fontSize={11}>
                        {Number(node.properties?.["componentCount"] ?? 0) > 0
                          ? `${node.properties?.["componentCount"]} internal components`
                          : (node.elementType?.replaceAll("_", " ").toLowerCase() ?? node.layer)}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
            {large && (
              <p className="p-4 text-sm text-muted-foreground">
                Large model: use the paginated service list and filters to inspect elements.
              </p>
            )}
            <div className="space-y-3 border-t p-4">
              <p className="text-xs text-muted-foreground">Select a service ({filtered.length})</p>
              <div className="flex flex-wrap gap-2">
                {filtered.slice((page - 1) * 30, page * 30).map((node) => (
                  <Button
                    key={node.id}
                    variant={selectedId === node.id ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={selectedId === node.id}
                    onClick={() => selectNode(node)}
                  >
                    {node.name}
                  </Button>
                ))}
              </div>
              {filtered.length > 30 && (
                <Pagination
                  page={page}
                  pageCount={Math.ceil(filtered.length / 30)}
                  onPageChange={setPage}
                />
              )}
              {connections.some(
                (edge) =>
                  edge.underlyingEdgeIds?.includes(selectedId ?? "") &&
                  (edge.underlyingEdgeIds?.length ?? 0) > 1,
              ) && (
                <SelectField
                  label="Connections in selected group"
                  value={selectedId ?? ""}
                  onChange={onSelect}
                  options={model.edges
                    .filter((edge) =>
                      connections
                        .find((group) => group.underlyingEdgeIds?.includes(selectedId ?? ""))
                        ?.underlyingEdgeIds?.includes(edge.id),
                    )
                    .map((edge) => ({
                      value: edge.id,
                      label: `${model.elements.find((node) => node.id === edge.from)?.name} → ${model.elements.find((node) => node.id === edge.to)?.name} · ${edge.protocol}`,
                    }))}
                />
              )}
              <SelectField
                label="Inspect relationship"
                value={connections.some((e) => e.id === selectedId) ? (selectedId ?? "") : ""}
                onChange={onSelect}
                options={connections.slice(0, 1000).map((e) => ({
                  value: e.id,
                  label: `${byId.get(e.from)?.name ?? e.from} → ${byId.get(e.to)?.name ?? e.to} · ${e.protocol}`,
                }))}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
export function DiagramViewer(props: {
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
