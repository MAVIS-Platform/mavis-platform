"use client";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailPanel } from "@/components/shared/data";
import { EmptyState } from "@/components/shared/request-state";
import { FilterControls, Pagination, SearchInput, SelectField } from "@/components/shared/forms";
import type { ArchitecturalModel, ArchitectureElement, Evidence } from "@/types/domain";
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT } from "./graph-layout";

export function ModelVersionSelector({
  models,
  value,
  onChange,
}: {
  models: readonly ArchitecturalModel[];
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
          options={["all", "edge", "domain", "platform", "data"].map((value) => ({
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
export function EvidenceViewer({ evidence }: { evidence: readonly Evidence[] }) {
  if (!evidence.length)
    return (
      <EmptyState
        title="Evidence unavailable"
        description="This relationship has no attached evidence. Treat its mapping as uncertain."
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
            {!entry.complete && <Badge variant="warning">Incomplete evidence</Badge>}
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
}: {
  model: ArchitecturalModel;
  selectedId: string | null;
}) {
  const element = model.elements.find((e) => e.id === selectedId);
  const edge = model.edges.find((e) => e.id === selectedId);
  return (
    <DetailPanel title="Element details">
      {element ? (
        <>
          <h3 className="font-mono text-sm font-semibold">{element.name}</h3>
          <p className="text-sm text-muted-foreground">{element.description}</p>
          <EvidenceViewer evidence={element.evidence} />
        </>
      ) : edge ? (
        <>
          <h3 className="text-sm">
            {edge.from} → {edge.to} · {edge.protocol}
          </h3>
          {edge.uncertain && <Badge variant="warning">Uncertain mapping</Badge>}
          <EvidenceViewer evidence={edge.evidence} />
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
  const [layer, setLayer] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const marker = useId().replace(/:/g, "");
  const nodes = useMemo(() => layoutGraph(model), [model]);
  const filtered = nodes.filter(
    (n) =>
      (layer === "all" || n.layer === layer) && n.name.toLowerCase().includes(query.toLowerCase()),
  );
  const visible = new Set(filtered.map((n) => n.id));
  const connections = model.edges.filter((e) => visible.has(e.from) && visible.has(e.to));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const large = filtered.length > 300 || connections.length > 1000;
  const height = nodes.reduce((max, node) => Math.max(max, node.y + 100), 500);
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
        onZoom={(factor) => setZoom((z) => Math.max(0.4, Math.min(2.4, z * factor)))}
        onReset={() => setZoom(1)}
      />
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
                width={1040 * zoom}
                height={height * zoom}
                viewBox={`0 0 1040 ${height}`}
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
                      d={`M ${from.x + NODE_WIDTH} ${from.y + 31} C ${from.x + NODE_WIDTH + 50} ${from.y + 31}, ${to.x - 50} ${to.y + 31}, ${to.x} ${to.y + 31}`}
                      fill="none"
                      stroke={selectedId === edge.id ? "var(--primary)" : "var(--graph-edge)"}
                      strokeWidth={selectedId === edge.id ? 3 : 1.5}
                      strokeDasharray={edge.uncertain ? "5 4" : undefined}
                      markerEnd={`url(#${marker})`}
                    />
                  );
                })}
                {filtered.map((node) => (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={() => onSelect(node.id)}
                    className="cursor-pointer"
                  >
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
                      {node.layer}
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
            <SelectField
              label="Inspect relationship"
              value={connections.some((e) => e.id === selectedId) ? (selectedId ?? "") : ""}
              onChange={onSelect}
              options={connections
                .slice(0, 1000)
                .map((e) => ({ value: e.id, label: `${e.from} → ${e.to} · ${e.protocol}` }))}
            />
          </div>
        </>
      )}
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
